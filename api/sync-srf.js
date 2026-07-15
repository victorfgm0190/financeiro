import { parseBody, replaceScheduleReservaFuncoes } from './_db.js'
import { requireAuth } from './_auth.js'

// Endpoint dedicado ao detalhamento por lançamento (schedule_reserva_funcoes) de UM agendamento
// (gerencial_devolucao / resgate_reserva). Fica FORA do /api/sync genérico porque uma fatura
// grande gera centenas de linhas de detalhamento — o que inflava a section do sync e estourava.
// Corpo: { scheduleId: string, rows: [row snake_case, ...] }. Substitui atomicamente TODO o
// detalhamento do schedule_id (DELETE + INSERT em lotes de 100). rows [] ⇒ só remove.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body = await parseBody(req)
    const { scheduleId, rows } = body
    if (!scheduleId) return res.status(400).json({ error: 'scheduleId is required' })

    const count = await replaceScheduleReservaFuncoes(scheduleId, rows)
    res.json({ success: true, count })
  } catch (err) {
    console.error('[api/sync-srf]', err.message)
    res.status(500).json({ error: err.message })
  }
}
