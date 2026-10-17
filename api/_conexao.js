import process from 'node:process'
import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
const { Pool } = pg

// CONEXÃO POR AMBIENTE (multi-cliente, um database por cliente no MESMO projeto Neon).
//
// A URL de um ambiente é a CENTRAL_DATABASE_URL com o nome do database trocado pelo
// ambientes.database_name — mesmo host, mesmo usuário. Nenhuma URL/senha mora em tabela.
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

export function urlDoDatabase(nome, env = process.env) {
  if (!NOME_DATABASE.test(String(nome || ''))) throw new Error(`database_name inválido: ${nome}`)
  const base = env.CENTRAL_DATABASE_URL
  if (!base) throw new Error('CENTRAL_DATABASE_URL não configurada')
  const u = new URL(base)
  u.pathname = `/${nome}`
  return u.toString()
}

// Nome do database central (o da própria CENTRAL_DATABASE_URL).
export function nomeDatabaseCentral(env = process.env) {
  if (!env.CENTRAL_DATABASE_URL) throw new Error('CENTRAL_DATABASE_URL não configurada')
  return decodeURIComponent(new URL(env.CENTRAL_DATABASE_URL).pathname.replace(/^\//, ''))
}

const criarPoolPg = (nome) => new Pool({
  connectionString: urlDoDatabase(nome),
  ssl: { rejectUnauthorized: false },
  max: 3,
})
let fabrica = criarPoolPg

// Testes: troca a fábrica (ex.: PGlite por database) e esvazia o cache.
export function _definirFabricaDePool(fn) {
  fabrica = fn || criarPoolPg
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
