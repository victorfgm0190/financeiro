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

// ── Exibição (card do Painel / Início / tela Envelopes) ──────────────────────
// Só reorganiza o resultado de gastoEnvelopes — nenhum valor novo de gasto.

// Parcela de compra parcelada: campos gravados na importação de fatura e no lançamento manual
// (installment_num / installment_total). A descrição ("4/6") NÃO entra no critério.
export const ehParcela = (tx) => Number(tx?.installmentNum) >= 1 && Number(tx?.installmentTotal) > 1

const r2 = (n) => Math.round(n * 100) / 100

// { env, txs, spent } → números da linha do envelope. parcelado + aVista === gasto.
export function resumoEnvelope({ env, txs, spent }) {
  const limite = Number(env.limitAmount) || 0
  const gasto = r2(spent)
  const parcelado = r2((txs || []).filter(ehParcela).reduce((s, t) => s + t.amount, 0))
  const disponivel = r2(limite - gasto)
  return {
    env, txs, limite, gasto, parcelado, aVista: r2(gasto - parcelado), disponivel,
    pct: limite > 0 ? (gasto / limite) * 100 : 0,
    estourado: disponivel < 0,
  }
}

// Linhas ordenadas pelo % usado (maior primeiro; empate → nome).
export function resumosPorUso(dados) {
  return (dados || []).map(resumoEnvelope)
    .sort((a, b) => b.pct - a.pct || String(a.env.name).localeCompare(String(b.env.name), 'pt-BR'))
}

// Totais do topo: limite, já gasto, ainda posso gastar (negativo = estourou).
export function totaisEnvelopes(resumos) {
  const limite = r2((resumos || []).reduce((s, r) => s + r.limite, 0))
  const gasto = r2((resumos || []).reduce((s, r) => s + r.gasto, 0))
  const parcelado = r2((resumos || []).reduce((s, r) => s + r.parcelado, 0))
  return { limite, gasto, parcelado, aVista: r2(gasto - parcelado), disponivel: r2(limite - gasto) }
}

// Larguras (%) dos dois tons da barra. Até o limite, a barra é o limite; estourado, a barra
// inteira é o gasto (dividida entre parcelado e à vista).
export function barraEnvelope({ limite, parcelado, aVista, gasto }) {
  const escala = Math.max(limite, gasto)
  if (escala <= 0) return { parcelado: 0, aVista: 0 }
  return { parcelado: (parcelado / escala) * 100, aVista: (aVista / escala) * 100 }
}
