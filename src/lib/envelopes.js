// Gasto dos envelopes por competência (mês financeiro). Extraído de EnvelopesPanel sem mudança de
// regra — a tela Envelopes e o card do Início mobile usam a mesma função.
import { isReservaShadowOrigin, isPatrimonioOrigin, isInvestAutoOrigin } from './origins.js'
import { parteDoEnvelope } from './rateio.js'
import { ehDiario, cicloDaCompetencia, configDoCiclo, orcamentoDiario, despesaDeEnvelope } from './envelopeOrcamento.js'

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

// [{ env, txs, spent }] por envelope na competência compKey. `rateios` (Map lançamento → linhas,
// opcional): lançamento rateado entra só com a PARTE das categorias do envelope (lib/rateio) — o
// item da lista leva amount = a parte e _amountTotal = o valor do lançamento.
export function gastoEnvelopes(envelopes, transactions, compKey, startDay, rateios = null) {
  return (envelopes || []).map(env => {
    const txs = []
    for (const tx of transactions || []) {
      if (tx.type !== 'expense' || tx.reservaAuto || isReservaShadowOrigin(tx) || isPatrimonioOrigin(tx) || isInvestAutoOrigin(tx)) continue
      if (competenciaKeyOf(tx.date, startDay) !== compKey) continue
      // Mesma regra dos cálculos de saldo (lib/rateio parteDoEnvelope).
      const parte = parteDoEnvelope(tx, rateios, env.categoryIds)
      if (!parte) continue
      txs.push(rateios?.get(tx.id)?.length ? { ...tx, amount: parte, _amountTotal: tx.amount } : tx)
    }
    const spent = txs.reduce((s, t) => s + t.amount, 0)
    return { env, txs, spent }
  })
}

// Envelope DIÁRIO: anexa a conta do ciclo da competência (`orc`, lib/envelopeOrcamento) ao dado de
// gastoEnvelopes. O ciclo é o do período financeiro (diaInicio; "mês corrido" = 1); quando ele não
// coincide com o startDay da competência, os lançamentos são refeitos pelo intervalo do ciclo.
// Mensal passa intacto. ctx: { compKey, startDay, diaInicio, hoje, feriadosDe, transactions, rateios }
export function comOrcamentoDiario(dados, { compKey, startDay, diaInicio, hoje, feriadosDe, transactions = null, rateios = null }) {
  return (dados || []).map(d => {
    if (!ehDiario(d.env)) return d
    const ciclo = cicloDaCompetencia(compKey, diaInicio)
    if (configDoCiclo(d.env, ciclo.inicio).tipoOrcamento !== 'diario') return d
    let { txs, spent } = d
    if (diaInicio !== startDay && transactions) {
      txs = []
      for (const tx of transactions) {
        if (!despesaDeEnvelope(tx) || !tx.date || tx.date < ciclo.inicio || tx.date > ciclo.fim) continue
        const parte = parteDoEnvelope(tx, rateios, d.env.categoryIds)
        if (parte) txs.push(rateios?.get(tx.id)?.length ? { ...tx, amount: parte, _amountTotal: tx.amount } : tx)
      }
      spent = txs.reduce((s, t) => s + t.amount, 0)
    }
    const gastos = txs.map(t => ({ date: t.date, valor: t.amount }))
    return { ...d, txs, spent, ciclo, orc: orcamentoDiario(d.env, ciclo, { hoje, feriados: feriadosDe ? feriadosDe(ciclo.inicio, ciclo.fim) : null, gastos }) }
  })
}

// ── Exibição (card do Painel / Início / tela Envelopes) ──────────────────────
// Só reorganiza o resultado de gastoEnvelopes — nenhum valor novo de gasto.

// Parcela de compra parcelada: campos gravados na importação de fatura e no lançamento manual
// (installment_num / installment_total). A descrição ("4/6") NÃO entra no critério.
export const ehParcela = (tx) => Number(tx?.installmentNum) >= 1 && Number(tx?.installmentTotal) > 1

const r2 = (n) => Math.round(n * 100) / 100

// { env, txs, spent } → números da linha do envelope. parcelado + aVista === gasto.
// Diário (com `orc` de comOrcamentoDiario): limite = orçamento do ciclo; disponível = A gastar (nunca
// negativo — o excesso aparece à parte, em `orc.excesso`).
export function resumoEnvelope({ env, txs, spent, orc = null, ciclo = null }) {
  const gasto = r2(spent)
  const parcelado = r2((txs || []).filter(ehParcela).reduce((s, t) => s + t.amount, 0))
  if (orc) {
    const limite = orc.orcamento
    const encerrado = orc.estado === 'encerrado'
    const disponivel = encerrado ? r2(limite - gasto) : orc.aGastar
    return {
      env, txs, limite, gasto, parcelado, aVista: r2(gasto - parcelado), disponivel,
      pct: limite > 0 ? (gasto / limite) * 100 : 0,
      estourado: disponivel < 0, orc, ciclo,
    }
  }
  const limite = Number(env.limitAmount) || 0
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
