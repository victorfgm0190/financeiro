// Fatura de um lançamento NOVO no cartão: a calculada pela data e pelo dia de fechamento
// (computeFaturaRef) e, se ela estiver FECHADA (settings.faturasFechadas), a próxima aberta.
// Usado pelo formulário de lançamento (e pela prévia do Assistente, que é o mesmo formulário).
import { computeFaturaRef } from './fatura.js'
import { faturaEstaFechada } from './faturasFechadas.js'

// 'YYYY-MM-DD' + dia de fechamento → fatura 'YYYY-MM'.
export function faturaPelaData(date, closingDay = 14) {
  if (!date) return null
  const [mm, yyyy] = computeFaturaRef(new Date(`${date}T00:00:00`), closingDay || 14).split('/')
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
