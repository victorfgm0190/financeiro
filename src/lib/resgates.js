// Detecção de "resgate/devolução já executado". Puras e compartilhadas — vivem aqui (e não no
// AppContext) para serem testáveis sem carregar o contexto inteiro.

import { fontePrevistoId } from './gerencialPrevistos'

// Pago = agendamento registrado/pulado/confirmado OU lançamento executado (transfer com
// source_schedule_id apontando p/ o slot, caso o agendamento tenha sido removido).
export const isResgatePago = (schedId, schedules, transactions) => {
  if (!schedId) return false
  const s = (schedules || []).find(x => x.id === schedId)
  const regPaid = !!(s && (
    (s.registered || []).length > 0 ||
    (s.skipped || []).length > 0 ||
    s.confirmado === true
  ))
  const txPaid = (transactions || []).some(
    t => t.type === 'transfer' && t.sourceScheduleId === schedId
  )
  return regPaid || txPaid
}

// "Este GASTO específico já teve seu resgate executado?" Complementa isResgatePago (que checa por
// id/slot): procura um resgate_reserva EXECUTADO cujo source_expense_ids contém a fonte do gasto.
export const isResgatePagoParaGasto = (txId, schedules, transactions) => {
  if (!txId) return false
  const cobertoPor = (fonte) => (schedules || []).some(s =>
    s.tipo === 'resgate_reserva' &&
    (s.sourceExpenseIds || []).includes(fonte) &&
    isResgatePago(s.id, schedules, transactions)
  )
  if (cobertoPor(txId)) return true
  // Transição previsto → lançamento. Enquanto era só uma ocorrência agendada, este gasto entrou no
  // resgate sob o id sintético 'sch:<scheduleId>@<data>'. Se aquele resgate JÁ foi executado e o
  // lançamento nasceu depois, procurar só pelo id do lançamento o daria como descoberto — e o motor
  // criaria um resgate delta para ele. A mesma despesa sairia DUAS VEZES da conta-reserva, e
  // resgate é transferência real, não número de tela.
  const tx = (transactions || []).find(t => t.id === txId)
  if (tx?.scheduleId && tx.date) return cobertoPor(fontePrevistoId(tx.scheduleId, tx.date))
  return false
}
