// Baixa automática de agendamento na importação de fatura de cartão: casa cada linha NOVA do
// arquivo com a ocorrência pendente de um agendamento do mesmo cartão. Sem isto a cobrança entrava
// como lançamento solto e o agendamento seguia pendente — a mesma despesa contada duas vezes na
// projeção da fatura.
import { computePendingUpTo } from './occurrences.js'
import { descSimilarity, stripParcelaSuffix } from './conciliacaoMatch.js'

export const BAIXA_TOLERANCIA_VALOR = 0.05
export const BAIXA_JANELA_DIAS = 10
// Abaixo disso a descrição não confirma o casamento: o candidato aparece, mas desmarcado.
export const BAIXA_SIM_MINIMA = 0.5

// Agendamentos gerados pelo motor gerencial/fatura não são cobranças do cartão.
const TIPOS_MOTOR = new Set(['gerencial_devolucao', 'resgate_reserva', 'pagamento_fatura'])

const diaUTC = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}
const somaDias = (s, n) => new Date((diaUTC(s) + n) * 86400000).toISOString().slice(0, 10)

export const baixaKey = (c) => `${c.scheduleId}|${c.occurrenceDate}`

// Candidatos de UMA linha, do melhor para o pior. `datas` = datas da linha a comparar com a
// ocorrência (date_cartao e a data de sistema — a parcela N > 1 tem data de sistema no mês anterior).
//   score = similaridade + 1 se ≥ 0,5 − dias de distância / 100
export function candidatosBaixa({ description, payee, amount, type, datas }, schedules, cardId) {
  if ((type || 'expense') !== 'expense' || !cardId) return []
  const ds = (datas || []).filter(Boolean)
  if (ds.length === 0) return []
  const min = ds.reduce((a, b) => (a < b ? a : b))
  const max = ds.reduce((a, b) => (a > b ? a : b))
  const limite = somaDias(max, BAIXA_JANELA_DIAS)
  const baseLinha = stripParcelaSuffix(description)
  const out = []
  for (const s of schedules || []) {
    if (s.transactionType !== 'expense' || TIPOS_MOTOR.has(s.tipo)) continue
    if (s.accountId !== cardId && s.cardId !== cardId) continue
    if (Math.abs((Number(s.amount) || 0) - (Number(amount) || 0)) > BAIXA_TOLERANCIA_VALOR) continue
    let occ = null, dias = Infinity
    for (const o of computePendingUpTo(s, limite)) {
      if (o < somaDias(min, -BAIXA_JANELA_DIAS)) continue
      const d = Math.min(...ds.map(x => Math.abs(diaUTC(o) - diaUTC(x))))
      if (d <= BAIXA_JANELA_DIAS && d < dias) { occ = o; dias = d }
    }
    if (!occ) continue
    const sim = Math.max(
      descSimilarity(baseLinha, stripParcelaSuffix(s.description)),
      s.payee ? descSimilarity(baseLinha, s.payee) : 0,
      (s.payee && payee) ? descSimilarity(payee, s.payee) : 0,
    )
    out.push({
      scheduleId: s.id, description: s.description || '', occurrenceDate: occ,
      dias, sim, score: sim + (sim >= BAIXA_SIM_MINIMA ? 1 : 0) - dias / 100,
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

// Distribui as baixas entre as linhas, 1:1: uma ocorrência só pode ser baixada por UMA linha
// (duas cobranças iguais no arquivo não quitam a mesma parcela do agendamento). As escolhas
// manuais (`escolha` = baixaKey) são servidas primeiro; as demais seguem a ordem do arquivo.
// Entrada: [{ id, candidatos, escolha?, desligada? }]. Saída: Map(id → { candidatos, escolhido,
// ativa }) — `candidatos` já sem as ocorrências tomadas por outra linha.
export function atribuirBaixas(linhas) {
  const tomadas = new Map()
  const ordem = [...linhas].sort((a, b) => (b.escolha ? 1 : 0) - (a.escolha ? 1 : 0))
  const escolhido = new Map()
  for (const l of ordem) {
    const livres = l.candidatos.filter(c => !tomadas.has(baixaKey(c)))
    const c = (l.escolha && livres.find(x => baixaKey(x) === l.escolha)) || livres[0] || null
    if (c) { tomadas.set(baixaKey(c), l.id); escolhido.set(l.id, c) }
  }
  const out = new Map()
  for (const l of linhas) {
    const c = escolhido.get(l.id) || null
    if (!c && l.candidatos.length === 0) continue
    const candidatos = l.candidatos.filter(x => tomadas.get(baixaKey(x)) === undefined || tomadas.get(baixaKey(x)) === l.id)
    if (!c && candidatos.length === 0) continue
    // Sem escolha manual, a descrição precisa confirmar o casamento para vir marcada.
    const marcadaPorPadrao = !!c && (!!l.escolha || c.sim >= BAIXA_SIM_MINIMA)
    const ativa = !!c && (l.desligada === undefined ? marcadaPorPadrao : !l.desligada)
    out.set(l.id, { candidatos, escolhido: c, ativa })
  }
  return out
}

// Desfaz a baixa de UMA ocorrência (estorno da importação): reabre a data e recua
// next_occurrence para ela quando a âncora já tinha avançado. Mesma regra do estorno de um
// lançamento vinculado a agendamento (deleteTransaction).
export function desfazerBaixa(s, occurrenceDate) {
  const registered = (s.registered || []).filter(r => r !== occurrenceDate)
  if (registered.length === (s.registered || []).length) return s
  if ((s.frequency || 'once') === 'once') return { ...s, registered, confirmado: false }
  const nextOccurrence = (s.nextOccurrence && s.nextOccurrence <= occurrenceDate) ? s.nextOccurrence : occurrenceDate
  return { ...s, registered, nextOccurrence, confirmado: false }
}
