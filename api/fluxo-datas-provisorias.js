import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Datas PROVISÓRIAS de ocorrências de agendamento no relatório "Fluxo de Caixa": "acho que este
// recebimento do dia 20 só entra dia 25, mas não tenho certeza". Só o relatório lê esta tabela —
// o agendamento real (e Painel, KPIs, Fluxo Futuro, Agendamentos) continua na data verdadeira até
// o usuário clicar "Aplicar data" (que grava em agendamentos.overrides e apaga o registro daqui).
//   GET                        → limpa os órfãos (ver limparOrfaos) e lista o restante
//   POST                       → upsert { schedule_id, data_original, data_provisoria }
//   DELETE ?id=x | ?ids=a,b,c  → remove por id
// Neon nunca é acessado direto do browser, sempre por este endpoint.

const DATA = /^\d{4}-\d{2}-\d{2}$/

// DDL viva da tabela (a cópia em supabase/schema.sql é documentação). Roda uma vez por cold start.
let schemaPronto = false
async function ensureSchema() {
  if (schemaPronto) return
  await query(`CREATE TABLE IF NOT EXISTS fluxo_datas_provisorias (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    schedule_id TEXT NOT NULL,
    data_original TEXT NOT NULL,
    data_provisoria TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (schedule_id, data_original)
  )`)
  schemaPronto = true
}

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

const COLS = 'id, schedule_id, data_original, data_provisoria, created_at'

// Órfãos: a ocorrência já foi registrada ou pulada (registered/skipped do agendamento contêm a
// data original), ou o agendamento não existe mais. Primeiro SELECT de conferência; o DELETE
// apaga exatamente os ids conferidos — nunca um DELETE com o critério direto.
export const SQL_ORFAOS = `SELECT p.id
       FROM fluxo_datas_provisorias p
       LEFT JOIN agendamentos a ON a.id = p.schedule_id
      WHERE a.id IS NULL
         OR COALESCE(a.registered, '[]'::jsonb) @> to_jsonb(p.data_original)
         OR COALESCE(a.skipped, '[]'::jsonb) @> to_jsonb(p.data_original)`

async function limparOrfaos() {
  const orfaos = await query(SQL_ORFAOS)
  const ids = orfaos.map(r => r.id)
  if (ids.length === 0) return 0
  await query('DELETE FROM fluxo_datas_provisorias WHERE id = ANY($1)', [ids])
  return ids.length
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureSchema()

    if (req.method === 'GET') {
      const removidos = await limparOrfaos()
      const rows = await query(`SELECT ${COLS} FROM fluxo_datas_provisorias ORDER BY data_provisoria, created_at`)
      return res.json({ datas: rows, orfaosRemovidos: removidos })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const scheduleId = String(body?.schedule_id || '').trim()
      const original = String(body?.data_original || '').slice(0, 10)
      const provisoria = String(body?.data_provisoria || '').slice(0, 10)
      if (!scheduleId) return res.status(400).json({ error: 'schedule_id é obrigatório' })
      if (!DATA.test(original) || !DATA.test(provisoria)) {
        return res.status(400).json({ error: 'data_original e data_provisoria devem ser YYYY-MM-DD' })
      }
      const [row] = await query(
        `INSERT INTO fluxo_datas_provisorias (schedule_id, data_original, data_provisoria)
              VALUES ($1, $2, $3)
         ON CONFLICT (schedule_id, data_original) DO UPDATE SET data_provisoria = EXCLUDED.data_provisoria
         RETURNING ${COLS}`,
        [scheduleId, original, provisoria],
      )
      return res.json({ ok: true, data: row })
    }

    if (req.method === 'DELETE') {
      const um = queryParam(req, 'id')
      const varios = queryParam(req, 'ids')
      const ids = um ? [um] : String(varios || '').split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length === 0) return res.status(400).json({ error: 'id ou ids é obrigatório' })
      await query('DELETE FROM fluxo_datas_provisorias WHERE id = ANY($1)', [ids])
      return res.json({ ok: true, ids })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/fluxo-datas-provisorias]', err.message)
    res.status(500).json({ error: err.message })
  }
}
