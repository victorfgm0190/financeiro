// Gasto dos envelopes por competência (mês financeiro). Extraído de EnvelopesPanel sem mudança de
// regra — a tela Envelopes e o card do Início mobile usam a mesma função.
import { isReservaShadowOrigin, isPatrimonioOrigin, isInvestAutoOrigin } from './origins.js'

// Chave comparável (ano*12 + mês0) da competência de uma data, aplicando o dia de
// início do mês financeiro: date.day >= startDay → mês da data; senão → mês anterior.
export function competenciaKeyOf(dateStr, startDay) {
  const [y, m, d] = dateStr.split('-').map(Number)
  let year = y, month0 = m - 1
  if (d < startDay) { const p = new Date(y, m - 2, 1); year = p.getFullYear(); month0 = p.getMonth() }
  return year * 12 + month0
}

// Competência atual: hoje.day >= startDay → mês atual; senão mês anterior.
export function currentCompetencia(startDay) {
  const t = new Date()
  if (t.getDate() >= startDay) return { year: t.getFullYear(), month0: t.getMonth() }
  const p = new Date(t.getFullYear(), t.getMonth() - 1, 1)
  return { year: p.getFullYear(), month0: p.getMonth() }
}

// [{ env, txs, spent }] por envelope na competência compKey.
export function gastoEnvelopes(envelopes, transactions, compKey, startDay) {
  return (envelopes || []).map(env => {
    const txs = (transactions || []).filter(tx =>
      tx.type === 'expense' &&
      !tx.reservaAuto && !isReservaShadowOrigin(tx) && !isPatrimonioOrigin(tx) && !isInvestAutoOrigin(tx) &&
      env.categoryIds.includes(tx.categoryId) &&
      competenciaKeyOf(tx.date, startDay) === compKey
    )
    const spent = txs.reduce((s, t) => s + t.amount, 0)
    return { env, txs, spent }
  })
}
