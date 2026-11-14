// Fatura de cartão de crédito — FONTE ÚNICA dos lançamentos e do total de uma fatura.
// Usada pela tela Cartão de Crédito (card "Fatura Selecionada"), pelo Extrato da Fatura e pelo
// Relatório Gerencial da Fatura: os três mostram o mesmo total para a mesma fatura.
//
// Fatura de um lançamento = fatura_ref gravada (faturaMonthYear, competência da fatura); sem ela
// (lançamento antigo), o mês derivado da data pelo dia de fechamento do cartão. NUNCA intervalo de
// data: parcela de compra antiga e lançamento movido de fatura ficam na fatura certa.
//   • Despesas (expense) somam; estornos (income no cartão) abatem: total = despesas − estornos.
//   • Pagamentos da fatura (credit_payment, ou transferência vinculada para o cartão) ficam à parte:
//     são informativos e NÃO entram no total.
import { faturaDoCartao } from './fatura.js'
import { totaisGerenciais, sortKey } from './gerencialTotais.js'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export const faturaDoLancamento = (tx, card) => tx.faturaMonthYear || faturaDoCartao(tx.date, card)

// Fatura ATUAL do cartão: a que contém a data de hoje no período de fechamento (a mesma que a tela
// Cartão de Crédito abre).
export const faturaAtualDoCartao = (card, hoje) => (card ? faturaDoCartao(hoje, card) : '')

export const rotuloFatura = (key) => (key ? `${MESES[Number(key.slice(5, 7)) - 1]}/${key.slice(0, 4)}` : '')
export const rotuloFaturaCurto = (key) => (key ? `${MESES_CURTOS[Number(key.slice(5, 7)) - 1]}/${key.slice(0, 4)}` : '')
export const deslocarFatura = (key, meses) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + meses, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Lançamentos da fatura `billKey` do cartão.
export function lancamentosDaFatura(transactions, card, billKey) {
  const vazio = { despesas: [], estornos: [], lancamentos: [], pagamentos: [], totalDespesas: 0, totalEstornos: 0, total: 0 }
  if (!card || !billKey) return vazio
  const despesas = []
  const estornos = []
  const pagamentos = []
  for (const tx of transactions || []) {
    if (tx.accountId === card.id && (tx.type === 'expense' || tx.type === 'income')) {
      if (faturaDoLancamento(tx, card) !== billKey) continue
      ;(tx.type === 'expense' ? despesas : estornos).push(tx)
    } else if (
      (tx.type === 'credit_payment' && tx.accountId === card.id &&
        ((tx.faturaMonthYear && tx.faturaMonthYear === billKey) || (tx.date || '').slice(0, 7) === billKey))
      || (tx.type === 'transfer' && tx.toAccountId === card.id && tx.faturaMonthYear === billKey)
    ) {
      pagamentos.push(tx)
    }
  }
  const soma = (l) => l.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const totalDespesas = soma(despesas)
  const totalEstornos = soma(estornos)
  const porData = (a, b) => (a.date || '').localeCompare(b.date || '')
  return {
    despesas, estornos, pagamentos: pagamentos.sort(porData),
    lancamentos: [...despesas, ...estornos].sort(porData),
    totalDespesas: round2(totalDespesas), totalEstornos: round2(totalEstornos),
    // Mesma conta de sempre da tela do cartão (sem arredondar no meio).
    total: round2(totalDespesas - totalEstornos),
  }
}

// Faturas para o seletor: as que têm lançamento do cartão + a atual, em ordem decrescente, com a
// atual marcada e as posteriores a ela como "futura".
export function faturasDoCartao(transactions, card, hoje) {
  if (!card) return []
  const atual = faturaAtualDoCartao(card, hoje)
  const chaves = new Set([atual])
  for (const tx of transactions || []) {
    if (tx.accountId !== card.id || (tx.type !== 'expense' && tx.type !== 'income') || !tx.date) continue
    chaves.add(faturaDoLancamento(tx, card))
  }
  return [...chaves].filter(Boolean).sort((a, b) => b.localeCompare(a)).map(key => ({
    key, atual: key === atual, futura: key > atual,
    rotulo: `${rotuloFaturaCurto(key)}${key === atual ? ' · atual' : key > atual ? ' · futura' : ''}`,
  }))
}

// Resumo por grupo gerencial da fatura (cards do Relatório Gerencial). Mesma soma da linha de resumo
// da tela do cartão (totaisGerenciais), só com o realizado; "Sem grupo" e estornos à parte.
// Fechamento: Σ grupos + sem grupo − estornos = total da fatura.
export function resumoGerencialDaFatura({ despesas = [], estornos = [], total = 0 }, gerencialGroups = []) {
  const { items } = totaisGerenciais({ txs: [...despesas, ...estornos], gerencialGroups })
  const idsValidos = new Set(gerencialGroups.map(g => g.id))
  const semGrupo = round2(despesas.filter(t => !t.grupoGerencial || !idsValidos.has(t.grupoGerencial)).reduce((s, t) => s + (Number(t.amount) || 0), 0))
  const totalEstornos = round2(estornos.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0))
  const grupos = items.map(i => ({ grupo: i.g, total: i.total })).sort((a, b) => sortKey(a.grupo) - sortKey(b.grupo))
  const fechamento = round2(grupos.reduce((s, g) => s + g.total, 0) + semGrupo - totalEstornos)
  return { grupos, semGrupo, estornos: totalEstornos, fechamento, diferenca: round2(total - fechamento) }
}

// Grupo exibido de um lançamento: 'estorno', o id do grupo, ou 'sem' (sem grupo / grupo apagado).
export function chaveDoGrupo(tx, gerencialGroups = []) {
  if (tx.type === 'income') return 'estorno'
  return tx.grupoGerencial && gerencialGroups.some(g => g.id === tx.grupoGerencial) ? tx.grupoGerencial : 'sem'
}

// "Parcela 2 de 6" (vazio quando não é parcelado).
export const parcelaPorExtenso = (tx) => (tx.installmentNum > 0 ? `Parcela ${tx.installmentNum} de ${tx.installmentTotal || '?'}` : '')

// Regra dos previstos (agendamentos de compra que ainda não viraram lançamento) nos cards da tela:
// contam em tudo o que fala DESTA fatura — total, saldo a pagar, situação e diferença —, porque vão
// cair nela. A Dívida Total (uso do limite, todas as faturas) mostra só o já lançado.
export function situacaoDaFatura({ total, previsto = 0, pago = 0 }) {
  const aPagar = round2(total + previsto)
  const diferenca = round2(pago - aPagar)
  const semValor = aPagar <= 0.005 && pago <= 0.005
  const paga = !semValor && aPagar > 0 && pago >= aPagar - 0.005
  const parcial = pago > 0 && !paga
  return { aPagar, diferenca, semValor, paga, parcial, saldoRestante: Math.max(0, round2(aPagar - pago)) }
}
