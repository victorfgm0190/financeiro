import { query } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { recortarLancamentos } from './_permissoesApi.js'

// Lançamentos de transferência já gravados no Neon para uma lista de agendamentos num intervalo
// de datas. Usado pelo modal "Transferências do início do mês": antes de mostrar e de novo antes
// de executar, o app confere aqui o que JÁ existe — o estado em memória pode ser o cache do
// localStorage e não saber de uma execução feita em outro aparelho.
//   GET ?ids=a,b,c&de=YYYY-MM-DD&ate=YYYY-MM-DD
//   → { lancamentos: [{ id, schedule_id, source_schedule_id, account_id, to_account_id, date, reserva_auto }] }
// O casamento fino (mesmas contas, mesma competência) é feito no app por ehExecucaoDe
// (src/lib/inicioMes.js), a mesma regra aplicada aos lançamentos em memória.
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()
  try {
    const ids = [...new Set(String(queryParam(req, 'ids') || '').split(',').map(s => s.trim()).filter(Boolean))].slice(0, 500)
    const de = String(queryParam(req, 'de') || '')
    const ate = String(queryParam(req, 'ate') || '')
    if (ids.length === 0 || !DATA_RE.test(de) || !DATA_RE.test(ate)) {
      return res.status(400).json({ error: 'ids, de e ate (YYYY-MM-DD) são obrigatórios.' })
    }
    const rows = await query(
      `SELECT id, schedule_id, source_schedule_id, account_id, to_account_id, reserva_funcao_id, date, type,
              COALESCE(reserva_auto, false) AS reserva_auto
         FROM lancamentos
        WHERE type = 'transfer'
          AND (schedule_id = ANY($1) OR source_schedule_id = ANY($1))
          AND date >= $2 AND date <= $3`,
      [ids, de, ate],
    )
    // Perfis permitidos: só transferências das contas deles.
    res.json({ lancamentos: await recortarLancamentos(query, req.user, rows) })
  } catch (err) {
    console.error('[api/transferencias-executadas]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
