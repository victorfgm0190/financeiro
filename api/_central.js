import { poolCentral } from './_conexao.js'

// BANCO CENTRAL da plataforma (finup_central, CENTRAL_DATABASE_URL): lista de ambientes, códigos de
// passagem do login (login_handoff) e as tabelas plataforma_* (pedidos/Controle de Clientes).
// Acesso SEMPRE explícito por estas funções — o query() do _db.js é o banco do ambiente.
// Esquema: supabase/central/ (ver docs/ambientes.md).

export async function centralQuery(sql, params = []) {
  const { rows } = await poolCentral().query(sql, params)
  return rows
}

// Mesmo contrato do withTransaction do _db.js, no central.
export async function withCentralTransaction(fn) {
  const client = await poolCentral().connect()
  const q = async (sql, params = []) => (await client.query(sql, params)).rows
  try {
    await client.query('BEGIN')
    const result = await fn(q, client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    client.release()
  }
}

// ─── Ambientes ──────────────────────────────────────────────────────────────────────────────────
// Cache curto por instância: toda requisição autenticada resolve o ambiente, e a lista quase nunca
// muda. 30 s = tempo máximo para uma suspensão valer em todas as instâncias quentes.
const CACHE_MS = 30_000
const cache = new Map()
export const _limparCacheAmbientes = () => cache.clear()

const SQL_AMBIENTE = 'SELECT id, sigla, nome, database_name, status, cliente_id, schema_versao FROM ambientes'

export async function buscarAmbientePorSigla(sigla, { agora = Date.now() } = {}) {
  const s = String(sigla || '').trim().toLowerCase()
  if (!s) return null
  const c = cache.get(s)
  if (c && c.ate > agora) return c.amb
  const [amb] = await centralQuery(`${SQL_AMBIENTE} WHERE sigla = $1`, [s])
  cache.set(s, { amb: amb || null, ate: agora + CACHE_MS })
  return amb || null
}

export async function buscarAmbientePorId(id) {
  if (!id) return null
  const [amb] = await centralQuery(`${SQL_AMBIENTE} WHERE id = $1`, [String(id)])
  return amb || null
}

export const ambienteAtivo = (amb) => !!amb && amb.status === 'ativo'
