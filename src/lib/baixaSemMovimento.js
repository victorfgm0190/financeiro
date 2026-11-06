// Espelha no estado do app o que /api/bem/baixas gravou. Sem isso, o sync regravava a ocorrência e o saldo
// antigos. Bem e dívida são asset/liability: o saldo é do backend e o app só copia, por último.
import { desfazerBaixa } from './scheduleBaixa.js'

function copiarSaldos(efeitos, atualizarSaldo) {
  for (const c of [efeitos.bem, efeitos.divida]) if (c?.id) atualizarSaldo(c.id, c.saldo)
}

export function espelharRegistro(efeitos, { addTransaction, atualizarSaldo, markScheduleRegistered, deleteSchedule }) {
  if (efeitos.lancamento) addTransaction(efeitos.lancamento)
  if (efeitos.agendamento) markScheduleRegistered(efeitos.agendamento.id, efeitos.agendamento.ocorrencia)
  for (const id of efeitos.agendamentos_removidos || []) deleteSchedule?.(id)
  copiarSaldos(efeitos, atualizarSaldo)
}

export function espelharEstorno(efeitos, { deleteTransaction, atualizarSaldo, updateSchedule, schedules }) {
  if (efeitos.lancamento_removido) deleteTransaction(efeitos.lancamento_removido)
  if (efeitos.agendamento) {
    const s = (schedules || []).find(x => x.id === efeitos.agendamento.id)
    if (s) {
      const { registered, registeredMeta, nextOccurrence, confirmado } = desfazerBaixa(s, efeitos.agendamento.ocorrencia)
      updateSchedule(s.id, { registered, registeredMeta, nextOccurrence, confirmado })
    }
  }
  copiarSaldos(efeitos, atualizarSaldo)
}
