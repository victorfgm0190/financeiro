// Coluna "Status" do Fluxo de Caixa: Confirmado / A confirmar das linhas de agendamento.
// Só exibição — reaproveita a flag `confirmado` do agendamento (a mesma do badge em Agendamentos,
// alternada por toggleScheduleConfirmado). Não há confirmação por ocorrência no sistema: todas
// as ocorrências de um agendamento mostram a flag dele.

export const STATUS_CONFIRMACAO = { CONFIRMADO: 'confirmado', A_CONFIRMAR: 'a_confirmar' }

// Automação pura não tem confirmação (mesma regra do canConfirm em Agendamentos).
const TIPOS_SEM_CONFIRMACAO = new Set(['gerencial_devolucao', 'resgate_reserva'])

// r: linha do fluxo (computeFluxoCaixa / linhasFuturas). ctx: { agPorId: Map(id → agendamento) }.
// → { status, scheduleId } para linha de agendamento; null ("—") para lançamento, envelope,
// resgate previsto, provisório e saldo inicial.
export function statusConfirmacaoLinha(r, { agPorId } = {}) {
  if (!r || !r._scheduleId) return null
  if (r.real || r._lancamento || r._envelope || r._provisorio) return null
  const key = typeof r._key === 'string' ? r._key : ''
  if (key.includes('_resg_') || key.startsWith('sch:')) return null
  const s = agPorId?.get(r._scheduleId)
  if (!s || TIPOS_SEM_CONFIRMACAO.has(s.tipo)) return null
  return {
    status: s.confirmado ? STATUS_CONFIRMACAO.CONFIRMADO : STATUS_CONFIRMACAO.A_CONFIRMAR,
    scheduleId: s.id,
  }
}
