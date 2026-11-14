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
import { agendamentosPrevistosDaFatura } from './gerencialPrevistos.js'

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

// Chaves das faturas com lançamento do cartão + a aberta.
function chavesDasFaturas(transactions, card, aberta) {
  const chaves = new Set([aberta])
  for (const tx of transactions || []) {
    if (tx.accountId !== card.id || (tx.type !== 'expense' && tx.type !== 'income') || !tx.date) continue
    chaves.add(faturaDoLancamento(tx, card))
  }
  return [...chaves].filter(Boolean)
}

// Quanto foi pago da fatura — a MESMA regra da tela do cartão: pagamentos reais (credit_payment e
// transferência vinculada); sem eles, as ocorrências registradas do agendamento pagamento_fatura.
export function pagoDaFatura(transactions, schedules, card, billKey, fatura = null) {
  if (!card || !billKey) return 0
  const f = fatura || lancamentosDaFatura(transactions, card, billKey)
  const real = round2(f.pagamentos.reduce((s, t) => s + (Number(t.amount) || 0), 0))
  if (real > 0) return real
  return round2((schedules || [])
    .filter(s => s.tipo === 'pagamento_fatura' && s.cardId === card.id && s.faturaMesAno === billKey)
    .reduce((sum, s) => sum + (s.registered?.length || 0) * (Number(s.amount) || 0), 0))
}

// FATURA PADRÃO (tela do cartão, Extrato e Relatório pelo menu, troca de cartão): a FECHADA mais
// antiga que ainda NÃO FOI PAGA (situacaoDaFatura, a mesma regra dos cards, com os previstos) DEPOIS
// da última fatura paga; se não houver, a ABERTA (a que contém hoje). Fatura antiga anterior a uma
// paga conta como resolvida — nos dados reais são restos de 1–2 lançamentos de antes de as faturas
// serem acompanhadas, e a tela abriria meses atrás. `previstoDe(key)` = compras agendadas na fatura.
export function faturaPadraoDoCartao({ transactions, schedules, card, hoje, previstoDe = () => 0 }) {
  if (!card) return ''
  const aberta = faturaAtualDoCartao(card, hoje)
  const fechadas = chavesDasFaturas(transactions, card, aberta).filter(k => k < aberta).sort()
  const situacoes = fechadas.map(key => {
    const f = lancamentosDaFatura(transactions, card, key)
    return { key, s: situacaoDaFatura({ total: f.total, previsto: previstoDe(key), pago: pagoDaFatura(transactions, schedules, card, key, f) }) }
  })
  let ultimaPaga = -1
  situacoes.forEach((x, i) => { if (x.s.paga) ultimaPaga = i })
  const aPagar = situacoes.slice(ultimaPaga + 1).find(x => !x.s.semValor && !x.s.paga)
  return aPagar ? aPagar.key : aberta
}

// Faturas para o seletor, em ordem decrescente: "· aberta" (a que contém hoje), "· a pagar" (a fatura
// padrão quando é uma fechada não paga) e "· futura" (depois da aberta).
export function faturasDoCartao(transactions, card, hoje, aPagar = null) {
  if (!card) return []
  const aberta = faturaAtualDoCartao(card, hoje)
  return chavesDasFaturas(transactions, card, aberta).sort((a, b) => b.localeCompare(a)).map(key => {
    const sufixo = key === aberta ? ' · aberta' : key > aberta ? ' · futura' : key === aPagar ? ' · a pagar' : ''
    return { key, atual: key === aberta, aberta: key === aberta, aPagar: key === aPagar && key !== aberta, futura: key > aberta, rotulo: `${rotuloFaturaCurto(key)}${sufixo}` }
  })
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

// Total das compras agendadas (previstas) de cada fatura do cartão — o mesmo cálculo da tela.
export const previstoDaFaturaFn = ({ schedules, card, getOccurrences }) => (key) => (card && typeof getOccurrences === 'function'
  ? round2(agendamentosPrevistosDaFatura({ schedules, cardId: card.id, billKey: key, getOccurrences, billKeyOf: d => faturaDoCartao(d, card) })
    .reduce((s, p) => s + p.amount, 0))
  : 0)
