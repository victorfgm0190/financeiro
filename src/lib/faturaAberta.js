// Fatura de um lançamento NOVO no cartão: a calculada pela data e pelo dia de fechamento
// (computeFaturaRef) e, se ela estiver FECHADA (settings.faturasFechadas), a próxima aberta.
// Usado pelo formulário de lançamento (e pela prévia do Assistente, que é o mesmo formulário).
import { computeFaturaRef, FECHAMENTO_PADRAO } from './fatura.js'
import { faturaEstaFechada } from './faturasFechadas.js'

// 'YYYY-MM-DD' + dia de fechamento → fatura 'YYYY-MM'.
export function faturaPelaData(date, closingDay = FECHAMENTO_PADRAO) {
  if (!date) return null
  const [mm, yyyy] = computeFaturaRef(new Date(`${date}T00:00:00`), closingDay || FECHAMENTO_PADRAO).split('/')
  return `${yyyy}-${mm}`
}

export function proximaFatura(ym, n = 1) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const rotuloFatura = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '')

// → { calculada, efetiva, fechadas: [...] } ('YYYY-MM'); null sem cartão/data.
// efetiva = a calculada, ou a 1ª aberta depois dela (fechadas = as puladas, em ordem).
export function faturaAbertaDoCartao({ cardId, date, closingDay, faturasFechadas }) {
  const calculada = cardId ? faturaPelaData(date, closingDay) : null
  if (!calculada) return null
  const fechadas = []
  let efetiva = calculada
  while (faturaEstaFechada(faturasFechadas, cardId, efetiva) && fechadas.length < 24) {
    fechadas.push(efetiva)
    efetiva = proximaFatura(efetiva)
  }
  return { calculada, efetiva, fechadas }
}

// Aviso da prévia/formulário: "Fatura 10/2026 fechada → lançado na 11/2026".
export function avisoFaturaFechada(f) {
  if (!f?.fechadas?.length) return null
  const quais = f.fechadas.map(rotuloFatura).join(', ')
  return `Fatura ${quais} ${f.fechadas.length > 1 ? 'fechadas' : 'fechada'} → lançado na ${rotuloFatura(f.efetiva)}`
}

// Fatura inicial do seletor na EDIÇÃO de uma despesa de cartão antiga sem fatura gravada: a em
// que ela está hoje (pela data, sem pular fechadas — não muda de fatura ao salvar). null = não se
// aplica (novo, outro tipo, não cartão ou já tem fatura).
export function faturaInicialDaEdicao(initial, accounts) {
  if (!initial?.id || initial.type !== 'expense' || initial.faturaMonthYear) return null
  const card = (accounts || []).find(a => a.id === initial.accountId)
  return card?.type === 'credit' ? faturaPelaData(initial.date, card.closingDay) : null
}

// Gravação (addTransaction): despesa de cartão sem fatura → a efetiva (fechada → próxima aberta).
// Devolve a fatura a gravar, ou null quando não se aplica (já tem, não é despesa de cartão).
export function faturaParaCriacao(tx, accounts, faturasFechadas) {
  if (tx?.type !== 'expense' || tx.faturaMonthYear) return null
  const card = (accounts || []).find(a => a.id === tx.accountId)
  if (card?.type !== 'credit') return null
  return faturaAbertaDoCartao({ cardId: card.id, date: tx.date, closingDay: card.closingDay, faturasFechadas })?.efetiva || null
}

// Gravação (updateTransaction): a despesa de cartão editada ficaria sem fatura → a em que ela
// ESTAVA (data antiga, mesmo cartão); mudou de cartão/tipo → pela data nova. null = não se aplica.
export function faturaParaEdicao(old, changes, accounts) {
  const merged = { ...old, ...changes }
  if (merged.type !== 'expense' || merged.faturaMonthYear) return null
  const card = (accounts || []).find(a => a.id === merged.accountId)
  if (card?.type !== 'credit') return null
  const base = old.accountId === merged.accountId && old.type === 'expense' ? old.date : merged.date
  return faturaPelaData(base, card.closingDay)
}
