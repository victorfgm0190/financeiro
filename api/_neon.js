import process from 'node:process'

// API DO NEON (só o necessário para provisionar o banco de um cliente). Variáveis: NEON_API_KEY
// (chave do projeto finup), NEON_PROJECT_ID e NEON_BRANCH_ID (branch production). Todo database
// novo fica no MESMO branch e com o mesmo dono (neondb_owner) — a URL dele é a CENTRAL_DATABASE_URL
// com o nome trocado (api/_conexao.js).
const URL_API = 'https://console.neon.tech/api/v2'
export const DONO_PADRAO = 'neondb_owner'

export class ErroNeon extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

function config(env) {
  const { NEON_API_KEY: chave, NEON_PROJECT_ID: projeto, NEON_BRANCH_ID: branch } = env
  if (!chave || !projeto || !branch) throw new ErroNeon('API do Neon não configurada (NEON_API_KEY / NEON_PROJECT_ID / NEON_BRANCH_ID)', 503)
  return { chave, projeto, branch }
}

async function chamar(env, metodo, caminho, corpo, { fetch: f = fetch } = {}) {
  const { chave } = config(env)
  let res
  try {
    res = await f(`${URL_API}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${chave}`, Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
  } catch (err) {
    throw new ErroNeon(`Sem conexão com a API do Neon: ${err.message}`)
  }
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

export async function databaseExiste(nome, { env = process.env, fetch: f } = {}) {
  const { projeto, branch } = config(env)
  const { status, json } = await chamar(env, 'GET', `/projects/${projeto}/branches/${branch}/databases/${encodeURIComponent(nome)}`, null, { fetch: f })
  if (status === 200) return true
  if (status === 404) return false
  throw new ErroNeon(`API do Neon (${status}) ao consultar o database: ${json.message || 'erro'}`)
}

// Espera as operações do Neon terminarem (o database só aceita conexão depois disso).
async function esperarOperacoes(env, operacoes, { fetch: f, esperaMs = 1000, limiteMs = 45_000, dormir } = {}) {
  const { projeto } = config(env)
  const pausa = dormir || ((ms) => new Promise(r => setTimeout(r, ms)))
  const inicio = Date.now()
  for (const op of operacoes || []) {
    let estado = op.status
    while (!['finished', 'skipped', 'cancelled'].includes(estado)) {
      if (['failed', 'error'].includes(estado)) throw new ErroNeon(`Operação do Neon falhou (${op.action || op.id})`)
      if (Date.now() - inicio > limiteMs) throw new ErroNeon('O Neon demorou demais para criar o database. Tente novamente.', 504)
      await pausa(esperaMs)
      const { status, json } = await chamar(env, 'GET', `/projects/${projeto}/operations/${op.id}`, null, { fetch: f })
      if (status !== 200) throw new ErroNeon(`API do Neon (${status}) ao acompanhar a operação`)
      estado = json.operation?.status
    }
  }
}

// Cria o database (dono neondb_owner) e espera ficar pronto. Já existente → segue (idempotente).
// Devolve { criado: boolean }.
export async function criarDatabase(nome, { env = process.env, fetch: f, dormir, esperaMs, limiteMs } = {}) {
  const { projeto, branch } = config(env)
  if (await databaseExiste(nome, { env, fetch: f })) return { criado: false }
  const { status, json } = await chamar(env, 'POST', `/projects/${projeto}/branches/${branch}/databases`,
    { database: { name: nome, owner_name: DONO_PADRAO } }, { fetch: f })
  if (status === 409 || /already exists/i.test(json.message || '')) return { criado: false }
  if (status !== 200 && status !== 201) throw new ErroNeon(`API do Neon (${status}) ao criar o database: ${json.message || 'erro'}`)
  await esperarOperacoes(env, json.operations, { fetch: f, dormir, esperaMs, limiteMs })
  return { criado: true }
}

// SÓ databases de cliente: trava independente de quem chama (nunca o neondb nem o central).
export const RE_DATABASE_CLIENTE = /^cliente_[a-z0-9]+$/
const PROTEGIDOS = ['neondb', 'finup_central', 'postgres']

// Exclui o database do cliente e espera a operação. Já não existe → { excluido: false }.
export async function excluirDatabase(nome, { env = process.env, fetch: f, dormir, esperaMs, limiteMs, protegidos = [] } = {}) {
  if (!RE_DATABASE_CLIENTE.test(String(nome)) || [...PROTEGIDOS, ...protegidos].includes(nome)) {
    throw new ErroNeon(`Database "${nome}" não pode ser excluído por aqui`, 400)
  }
  const { projeto, branch } = config(env)
  if (!(await databaseExiste(nome, { env, fetch: f }))) return { excluido: false }
  const { status, json } = await chamar(env, 'DELETE', `/projects/${projeto}/branches/${branch}/databases/${encodeURIComponent(nome)}`, null, { fetch: f })
  if (status === 404) return { excluido: false }
  if (status !== 200 && status !== 201 && status !== 202) throw new ErroNeon(`API do Neon (${status}) ao excluir o database: ${json.message || 'erro'}`)
  await esperarOperacoes(env, json.operations, { fetch: f, dormir, esperaMs, limiteMs })
  return { excluido: true }
}
