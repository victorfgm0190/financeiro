// Coluna "Status" do Fluxo de Caixa: Confirmado / A confirmar das linhas de agendamento.
// Só exibição — reaproveita a flag `confirmado` do agendamento (a mesma do badge em Agendamentos,
// alternada por toggleScheduleConfirmado). A flag vale só para o PRÓXIMO vencimento (volta a
// false quando a ocorrência é registrada), então só a linha dessa ocorrência mostra a flag; as
// ocorrências posteriores do mesmo agendamento são sempre "A confirmar" e não confirmáveis.
import { computeOccurrences } from './occurrences.js'

export const STATUS_CONFIRMACAO = { CONFIRMADO: 'confirmado', A_CONFIRMAR: 'a_confirmar' }

// Automação pura não tem confirmação (mesma regra do canConfirm em Agendamentos).
const TIPOS_SEM_CONFIRMACAO = new Set(['gerencial_devolucao', 'resgate_reserva'])

// Próximo vencimento do agendamento: a mesma data (original) que Agendamentos usa como nextDate —
// a ocorrência pendente mais antiga (em atraso primeiro), descontando registered/skipped. Overrides
// só movem a data efetiva; a chave continua sendo a data original (_origDate da linha).
export function proximoVencimento(s) {
  return s ? computeOccurrences(s, 1)[0] || null : null
}

// r: linha do fluxo (computeFluxoCaixa / linhasFuturas). ctx: { agPorId: Map(id → agendamento) }.
// → { status, scheduleId, confirmavel } para linha de agendamento; null ("—") para lançamento,
// envelope, resgate previsto, provisório e saldo inicial.
export function statusConfirmacaoLinha(r, { agPorId } = {}) {
  if (!r || !r._scheduleId) return null
  if (r.real || r._lancamento || r._envelope || r._provisorio) return null
  const key = typeof r._key === 'string' ? r._key : ''
  if (key.includes('_resg_') || key.startsWith('sch:')) return null
  const s = agPorId?.get(r._scheduleId)
  if (!s || TIPOS_SEM_CONFIRMACAO.has(s.tipo)) return null
  const confirmavel = !!r._origDate && r._origDate === proximoVencimento(s)
  return {
    status: confirmavel && s.confirmado ? STATUS_CONFIRMACAO.CONFIRMADO : STATUS_CONFIRMACAO.A_CONFIRMAR,
    scheduleId: s.id,
    confirmavel,
  }
}
