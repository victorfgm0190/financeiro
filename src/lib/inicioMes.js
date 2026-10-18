// Transferências do início do mês (MonthStartModal) — funções PURAS, testadas direto.
//
// Uma transferência é "pendente" pelo agendamento (próxima ocorrência efetiva no mês corrente)
// E por não existir ainda o lançamento correspondente. O 2º critério vem do banco: o agendamento
// em memória pode ser o cache do localStorage (celular aberto depois de dias) e não saber que a
// ocorrência já foi executada noutro aparelho.
import { proximaEfetiva } from './fluxoCaixa.js'

// Agendamentos candidatos ao modal: transferências gerenciais/de origem cuja próxima ocorrência
// (data EFETIVA, com override) cai no mês corrente, a partir do dia de início do mês financeiro.
// Devolve [{ schedule, date, amount, mes }].
export function candidatasInicioMes({ schedules, accounts, getNextOccurrences, hoje, financialStartDay = 1 }) {
  if (hoje.getDate() < financialStartDay) return []
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const out = []
  for (const s of schedules || []) {
    if (s.transactionType !== 'transfer') continue
    if (!s.overrides?._gerencialKey && !s.overrides?._originTxId) continue
    const toAcc = (accounts || []).find(a => a.id === s.toAccountId)
    if (toAcc?.type === 'credit') continue
    const prox = proximaEfetiva(s, getNextOccurrences)
    if (!prox?.date || !prox.date.startsWith(mesAtual)) continue
    out.push({ schedule: s, date: prox.date, amount: prox.amount, mes: mesAtual })
  }
  return out
}

// O lançamento `tx` é a execução da transferência `schedule` na competência `mes` (YYYY-MM)?
// Mesmo agendamento (schedule_id ou, nos gerenciais, source_schedule_id), mesmas contas, mês da
// data. Sombras de reserva (reservaAuto) não contam: acompanham a transferência, não a substituem.
// Aceita o lançamento do app (camelCase) e a linha do banco (snake_case).
export function ehExecucaoDe(tx, schedule, mes) {
  const scheduleId = tx.scheduleId ?? tx.schedule_id
  const sourceId = tx.sourceScheduleId ?? tx.source_schedule_id
  if (scheduleId !== schedule.id && sourceId !== schedule.id) return false
  if ((tx.type ?? 'transfer') !== 'transfer') return false
  if (tx.reservaAuto ?? tx.reserva_auto) return false
  if ((tx.accountId ?? tx.account_id) !== schedule.accountId) return false
  if ((tx.toAccountId ?? tx.to_account_id) !== schedule.toAccountId) return false
  return String(tx.date || '').startsWith(mes)
}

// Ids dos agendamentos de `candidatas` que já têm o lançamento em `lancamentos`.
export function idsJaExecutadas(candidatas, lancamentos) {
  const ids = new Set()
  for (const c of candidatas) {
    if ((lancamentos || []).some(tx => ehExecucaoDe(tx, c.schedule, c.mes))) ids.add(c.schedule.id)
  }
  return ids
}
