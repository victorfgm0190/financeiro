import { query, parseBody, replaceScheduleReservaFuncoes } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { exigirLinhasPermitidas } from './_permissoesApi.js'
import { conferirExclusaoEmMassa, logRecusa } from './_syncTrava.js'

// Endpoint dedicado ao detalhamento por lançamento (schedule_reserva_funcoes) de UM agendamento
// (gerencial_devolucao / resgate_reserva). Fica FORA do /api/sync genérico porque uma fatura
// grande gera centenas de linhas de detalhamento — o que inflava a section do sync e estourava.
// Corpo: { scheduleId: string, rows: [row snake_case, ...] }. Substitui atomicamente TODO o
// detalhamento do schedule_id (DELETE + INSERT em lotes de 100). rows [] ⇒ só remove.
async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body = await parseBody(req)
    const { scheduleId, rows } = body
    if (!scheduleId) return res.status(400).json({ error: 'scheduleId is required' })
    // Perfis permitidos: detalhamento de agendamento de conta fora deles → 403.
    await exigirLinhasPermitidas(query, req.user, 'agendamentos', [scheduleId])

    // Trava de exclusão em massa (a mesma do /api/sync): as linhas do agendamento que a troca vai
    // apagar não podem passar de 20% da tabela (e 5 linhas) sem confirmação explícita do usuário.
    const novos = new Set((rows || []).filter(Boolean).map(r => r.id))
    const apagar = (await query('SELECT id FROM schedule_reserva_funcoes WHERE schedule_id = $1', [scheduleId]))
      .map(r => r.id).filter(id => !novos.has(id))
    const bloqueio = await conferirExclusaoEmMassa(query, 'schedule_reserva_funcoes', apagar, { confirmado: body.confirmarExclusaoEmMassa === true })
    if (bloqueio) {
      logRecusa('exclusao_em_massa', bloqueio)
      return res.status(409).json({
        error: `Exclusão em massa recusada: ${bloqueio.apagar} de ${bloqueio.total} linhas de ${bloqueio.tabela}`,
        codigo: 'exclusao_em_massa',
        ...bloqueio,
      })
    }

    const count = await replaceScheduleReservaFuncoes(scheduleId, rows)
    res.json({ success: true, count })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error('[api/sync-srf]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
