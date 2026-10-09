// Agrupamento das linhas da lista de Agendamentos (somente visual — não toca dados).
// Sem React: usado pelo SchedulePanel e testável.
import { format } from 'date-fns'
import { occEfetiva } from './fluxoCaixa.js'
import { scheduleDisplayDueDate } from './agendamentosFiltro.js'

// Quantas ocorrências futuras listar ao expandir um agendamento recorrente de valor fixo.
export const FUTURE_OCC_COUNT = 12

// Texto ao lado do "› N" numa linha de série de fatura.
export function rotuloFaturasSeguintes(n) {
  return `+ ${n} fatura${n !== 1 ? 's' : ''} seguinte${n !== 1 ? 's' : ''}`
}

// Tipos de agendamento de cartão/gerencial que o motor gera UM POR FATURA (frequency 'once',
// id fsch_<card>_<yyyymm>_<slot>). Várias faturas da mesma série devem virar UMA linha.
const SERIES_TIPOS = new Set(['pagamento_fatura', 'resgate_reserva', 'gerencial_devolucao'])

// Chave lógica da série (independente da fatura): agrupa as ocorrências por-fatura de um mesmo
// fluxo. Para o resgate, accountId (conta-origem) entra na chave → origens distintas ficam
// separadas. Devolve null para agendamentos que NÃO são série de fatura.
export function seriesKeyOf(s) {
  if (SERIES_TIPOS.has(s.tipo)) {
    // Série = faturas de UM cartão. Sem cartão não é série de fatura — ex.: o resgate avulso de
    // "Será pago com reserva" (tipo resgate_reserva, sem cardId). Antes a chave saía
    // `resgate_reserva||<origem>|<destino>` para TODOS eles, e resgates distintos da mesma rota
    // (ex.: CA → Itau) colapsavam numa linha só, exibindo só o valor do primeiro.
    const card = s.cardId || s.overrides?._gerencial?.cardId
      || (s.tipo === 'pagamento_fatura' ? s.toAccountId : null)
    if (!card) return null
    return `${s.tipo}|${card}|${s.accountId || ''}|${s.toAccountId || ''}`
  }
  // Legado "Pagamento Fatura" (sem tipo, _gerencialKey terminando em _payment).
  const k = s.overrides?._gerencialKey || ''
  if (!s.tipo && k.endsWith('_payment')) {
    const card = s.cardId || s.overrides?._gerencial?.cardId || s.toAccountId || ''
    return `pagamento_fatura|${card}|${s.accountId || ''}|${s.toAccountId || ''}`
  }
  return null
}

// Aglutina a lista de agendamentos em "grupos" de exibição (somente visual — não toca dados):
//   • Série de fatura: vira 1 linha; primary = fatura pendente mais próxima; futureItems = as
//     demais faturas pendentes (cada uma com seu amount já calculado pelo reconcileFaturaState).
//   • Recorrente de verdade (frequency != once): 1 linha; futureItems = próximas ocorrências
//     (getNextOccurrences) com o valor fixo do agendamento.
//   • Único 'once' avulso: 1 linha, sem futureItems (inalterado).
// `agruparSeries: false` (algum filtro ativo na lista): séries de fatura NÃO agrupam — cada
// fatura que passou no filtro vira a sua linha, para o filtro nunca esconder item no "› N".
// Grupos de série saem com `isSerie: true` (o cabeçalho mostra "+ N faturas seguintes").
export function buildScheduleGroups(schedules, getNextOccurrences, { agruparSeries = true } = {}) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const displayDateOf = (s, nextDate) => scheduleDisplayDueDate(s, nextDate, getNextOccurrences, todayStr)
  const seriesMap = new Map()
  const singles = []
  for (const s of schedules) {
    const key = agruparSeries ? seriesKeyOf(s) : null
    if (key) {
      if (!seriesMap.has(key)) seriesMap.set(key, [])
      seriesMap.get(key).push(s)
    } else {
      singles.push(s)
    }
  }

  const groups = []
  for (const members of seriesMap.values()) {
    const withNext = members.map(s => ({ s, next: getNextOccurrences(s, 1)[0] || null }))
    const pending = withNext.filter(m => m.next).sort((a, b) => a.next.localeCompare(b.next))
    if (pending.length === 0) {
      // Série inteiramente concluída: representa pela fatura mais recente (linha "Concluído").
      const rep = members.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0]
      groups.push({ schedule: rep, nextDate: null, displayDate: null, futureItems: [] })
      continue
    }
    const primary = pending[0]
    // Valor/data EFETIVOS por ocorrência (respeita overrides individuais).
    const futureItems = pending.slice(1).map(m => {
      const { date, amount } = occEfetiva(m.s, m.next)
      return { date, amount }
    })
    groups.push({ schedule: primary.s, nextDate: primary.next, displayDate: displayDateOf(primary.s, primary.next), futureItems, isSerie: true })
  }

  for (const s of singles) {
    const nextDate = getNextOccurrences(s, 1)[0] || null
    const recurring = (s.frequency || 'once') !== 'once'
    let futureItems = []
    if (recurring && nextDate) {
      futureItems = getNextOccurrences(s, FUTURE_OCC_COUNT + 1)
        .slice(1)
        .map(d => {
          const { date, amount } = occEfetiva(s, d)
          return { date, amount }
        })
    }
    groups.push({ schedule: s, nextDate, displayDate: displayDateOf(s, nextDate), futureItems })
  }
  return groups
}
