import process from 'node:process'
import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
import { decifrarSenha, aadDoAmbiente } from './_cifraDb.js'
const { Pool } = pg

// CONEXÃO POR AMBIENTE (multi-cliente, um database por cliente no MESMO projeto Neon).
//
// Cada database de ambiente tem usuário Postgres próprio (<database>_app, api/_usuarioBanco.js),
// com a senha cifrada no central (ambientes.db_usuario / db_senha_cifrada, chave FINUP_DB_KEY).
// Banco ainda sem usuário próprio → FALLBACK: ADMIN_DATABASE_URL (neondb_owner; na falta dela, a
// CENTRAL_DATABASE_URL, como era antes) com o nome do database trocado. FINUP_DB_ESTRITO=true
// desliga o fallback. O central usa a CENTRAL_DATABASE_URL. Provisionamento, exclusão e scripts
// usam poolAdminDoDatabase() (neondb_owner).
// Um Pool por database, em cache no módulo (a instância quente da Vercel reaproveita).
//
// O ambiente da requisição viaja num AsyncLocalStorage: comAmbiente() (api/_ambiente.js) resolve o
// ambiente do token e roda o handler dentro de rodarNoAmbiente(). query()/withTransaction()/
// upsertRows()/deleteRows() do _db.js pegam o pool daqui. SEM CONTEXTO → erro explícito: nunca cai
// num banco "padrão".

const contexto = new AsyncLocalStorage()
const pools = new Map()

export class ErroSemAmbiente extends Error {
  constructor() {
    super('Requisição sem contexto de ambiente: o acesso ao banco foi recusado')
    this.name = 'ErroSemAmbiente'
  }
}

// Nome de database aceito (evita que um valor estranho na tabela vire outra coisa na URL).
const NOME_DATABASE = /^[a-z0-9_]{1,63}$/

// URL do usuário administrador (neondb_owner): ADMIN_DATABASE_URL ou, enquanto ela não existe,
// a CENTRAL_DATABASE_URL (que até a migração do central também é do neondb_owner).
function urlAdmin(env) {
  const base = env.ADMIN_DATABASE_URL || env.CENTRAL_DATABASE_URL
  if (!base) throw new Error('ADMIN_DATABASE_URL / CENTRAL_DATABASE_URL não configurada')
  return base
}

// URL de um database com o usuário administrador.
export function urlDoDatabase(nome, env = process.env) {
  if (!NOME_DATABASE.test(String(nome || ''))) throw new Error(`database_name inválido: ${nome}`)
  const u = new URL(urlAdmin(env))
  u.pathname = `/${nome}`
  return u.toString()
}

// Credencial do database no central (null se o ambiente não tem usuário próprio, ou se as colunas
// ainda não existem no central — migração 2026-10-19 não aplicada).
async function credencialNoCentral(nome) {
  try {
    const { rows } = await poolCentral().query(
      'SELECT id, db_usuario, db_senha_cifrada FROM ambientes WHERE database_name = $1', [nome])
    return rows[0] || null
  } catch (err) {
    if (err.code === '42703') return null
    throw err
  }
}

// Configuração do Pool de um database: { origem: 'central' | 'papel' | 'fallback', ...opções do pg }.
export async function configDoPool(nome, { env = process.env, buscarCredencial = credencialNoCentral } = {}) {
  if (nome === nomeDatabaseCentral(env)) return { origem: 'central', connectionString: env.CENTRAL_DATABASE_URL }
  const cred = await buscarCredencial(nome)
  if (cred?.db_usuario && cred?.db_senha_cifrada) {
    const u = new URL(urlAdmin(env))
    return {
      origem: 'papel',
      host: u.hostname,
      port: Number(u.port) || 5432,
      database: nome,
      user: cred.db_usuario,
      password: decifrarSenha(cred.db_senha_cifrada, aadDoAmbiente(cred.id, nome), env),
    }
  }
  if (env.FINUP_DB_ESTRITO === 'true') throw new Error(`Database ${nome} sem usuário próprio (FINUP_DB_ESTRITO ligado)`)
  return { origem: 'fallback', connectionString: urlDoDatabase(nome, env) }
}

// Nome do database central (o da própria CENTRAL_DATABASE_URL).
export function nomeDatabaseCentral(env = process.env) {
  if (!env.CENTRAL_DATABASE_URL) throw new Error('CENTRAL_DATABASE_URL não configurada')
  return decodeURIComponent(new URL(env.CENTRAL_DATABASE_URL).pathname.replace(/^\//, ''))
}

// TLS com o certificado do servidor CONFERIDO (o do Neon é de autoridade pública). Nas conexões por
// host/usuário/senha (papel próprio do banco) é esta opção que vale; nas por connection string, o
// sslmode=require da URL já é tratado como verify-full pelo pg 8.
export const TLS_VERIFICADO = Object.freeze({ rejectUnauthorized: true })

function novoPool(opcoes, rotulo) {
  const pool = new Pool({ ...opcoes, ssl: TLS_VERIFICADO, max: 3 })
  // Conexão OCIOSA encerrada pelo servidor (o Neon suspende o compute e derruba as conexões:
  // "terminating connection due to administrator command"). Sem este ouvinte o 'error' do pool
  // derruba o processo; com ele, o pool descarta a conexão e abre outra na próxima consulta.
  pool.on('error', (err) => console.warn(`[conexao] conexão ociosa encerrada (${rotulo}):`, err.message))
  return pool
}

// Pool que resolve a credencial na primeira consulta (ela mora no central: busca assíncrona).
// Falha ao resolver ou senha recusada (28P01, ex.: senha trocada) → sai do cache e a próxima
// requisição resolve de novo.
function criarPoolPg(nome) {
  let pronto = null
  const obter = () => (pronto ??= configDoPool(nome).then(({ origem, ...opcoes }) => {
    console.log(`[conexao] ${nome}: ${origem === 'papel' ? `usuário próprio (${opcoes.user})` : origem}`)
    return novoPool(opcoes, nome)
  }).catch((err) => { pronto = null; throw err }))
  const esquecerSeSenhaRecusada = (err) => {
    if (err?.code === '28P01' && pools.get(nome) === wrapper) pools.delete(nome)
    throw err
  }
  const wrapper = {
    query: async (...args) => (await obter()).query(...args).catch(esquecerSeSenhaRecusada),
    connect: async () => (await obter()).connect().catch(esquecerSeSenhaRecusada),
    end: async () => { if (pronto) await (await pronto.catch(() => null))?.end() },
  }
  return wrapper
}
let fabrica = criarPoolPg

// Testes: troca a fábrica (ex.: PGlite por database) e esvazia o cache. A fábrica recebe
// (nome, { admin }) — admin = pool do neondb_owner (poolAdminDoDatabase).
export function _definirFabricaDePool(fn) {
  fabrica = fn || criarPoolPg
  fabricaAdmin = fn ? (nome) => fn(nome, { admin: true }) : criarPoolAdminPg
  fabricaVerificada = fn ? (nome) => fn(nome, { admin: true, tlsVerificado: true }).connect() : criarConexaoAdminVerificada
  pools.clear()
}

export function poolDoDatabase(nome) {
  let p = pools.get(nome)
  if (!p) {
    p = fabrica(nome)
    pools.set(nome, p)
  }
  return p
}

// Opções do pg para uma connection string com o certificado do servidor conferido (CREATE/ALTER ROLE,
// cuja senha vai em texto, e os scripts de manutenção). sslmode=verify-full na URL porque o pg dá
// prioridade ao sslmode da connection string sobre a opção ssl.
export function configTlsVerificado(url) {
  const u = new URL(url)
  u.searchParams.set('sslmode', 'verify-full')
  return { connectionString: u.toString(), ssl: TLS_VERIFICADO }
}
async function criarConexaoAdminVerificada(nome) {
  const c = new pg.Client(configTlsVerificado(urlDoDatabase(nome)))
  await c.connect()
  return { query: (...args) => c.query(...args), release: () => c.end().catch(() => {}) }
}
let fabricaVerificada = criarConexaoAdminVerificada
export const conexaoAdminVerificada = (nome) => fabricaVerificada(nome)

// Pool do neondb_owner num database (provisionamento, exclusão): nunca o das requisições.
const criarPoolAdminPg = (nome) => novoPool({ connectionString: urlDoDatabase(nome) }, `${nome} admin`)
let fabricaAdmin = criarPoolAdminPg
export function poolAdminDoDatabase(nome) {
  const chave = `admin:${nome}`
  let p = pools.get(chave)
  if (!p) {
    p = fabricaAdmin(nome)
    pools.set(chave, p)
  }
  return p
}

// Fecha e esquece os pools de um database (antes de excluí-lo no Neon: conexão aberta impede o DROP).
export async function fecharPoolDoDatabase(nome) {
  for (const chave of [nome, `admin:${nome}`]) {
    const p = pools.get(chave)
    pools.delete(chave)
    if (p?.end) await p.end().catch(() => {})
  }
}

export const poolCentral = () => poolDoDatabase(nomeDatabaseCentral())

// Roda `fn` com o ambiente `amb` ({ id, sigla, database_name, status }) como contexto.
export function rodarNoAmbiente(amb, fn) {
  if (!amb?.database_name) throw new Error('rodarNoAmbiente: ambiente sem database_name')
  return contexto.run({ ambiente: amb }, fn)
}

export const ambienteAtual = () => contexto.getStore()?.ambiente ?? null

// Pool do banco do contexto. Sem contexto → ErroSemAmbiente.
export function poolDoContexto() {
  const amb = ambienteAtual()
  if (!amb) throw new ErroSemAmbiente()
  return poolDoDatabase(amb.database_name)
}

// Database do contexto atual (chave dos registros "já rodei" por banco); sem contexto, um marcador
// que nunca colide com um database real.
export const bancoAtual = () => ambienteAtual()?.database_name ?? '(sem ambiente)'

// "Já rodei" POR BANCO para os ensure*Schema() de runtime: o DDL precisa rodar uma vez em CADA
// database, não uma vez por instância. `chave` opcional fixa o banco (ex.: o central).
export function registroPorBanco() {
  const feitos = new Set()
  return {
    jaRodou: (chave = bancoAtual()) => feitos.has(chave),
    marcar: (chave = bancoAtual()) => { feitos.add(chave) },
    limpar: () => { feitos.clear() },
  }
}
