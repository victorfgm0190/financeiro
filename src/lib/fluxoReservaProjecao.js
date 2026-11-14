// Projeção do Fluxo Futuro das Reservas — janela de meses e Dep/Res/Prov por função a partir dos
// agendamentos. Movido de components/Reservas/ReservasPanel.jsx SEM mudar nada, para o Extrato da
// função poder ser aberto também pelo menu Relatórios com o MESMO cálculo da grade.
import { previsoesDasFuncoes } from './previsaoReserva.js'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Janela deslizante: do mês ANTERIOR ao atual (índice 0 = saldo de hoje) por `meses` meses. O Resumo
// usa 12 (até +10); o Fluxo Futuro vai até o "Até" do período escolhido (src/lib/fluxoPeriodo.js).
export function buildFluxoWindow(meses = 12) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const windowMonths = Array.from({ length: meses }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
    return { year: d.getFullYear(), month0: d.getMonth(), label: MONTH_LABELS[d.getMonth()], isYearStart: d.getMonth() === 0 && i > 0 }
  })
  const winStart = `${windowMonths[0].year}-${String(windowMonths[0].month0 + 1).padStart(2, '0')}-01`
  const lastWm = windowMonths[windowMonths.length - 1]
  const winEndDate = new Date(lastWm.year, lastWm.month0 + 1, 0)
  const winEnd = `${winEndDate.getFullYear()}-${String(winEndDate.getMonth() + 1).padStart(2, '0')}-${String(winEndDate.getDate()).padStart(2, '0')}`
  const winIndexOf = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return (d.getFullYear() - windowMonths[0].year) * 12 + (d.getMonth() - windowMonths[0].month0)
  }
  return { windowMonths, winStart, winEnd, winIndexOf }
}

// Dep/Res/Prov por função/mês (um valor por mês da janela) a partir dos AGENDAMENTOS reais + provisões.
// Resgates com detalhamento (schedule_reserva_funcoes) projetam UMA saída por função (valor da
// linha); os demais usam reservaFuncaoId único + schedule.amount. Ver comentários originais.
export function computeScheduledByFunction(linked, accounts, schedules, scheduleReservaFuncoes, getNextOccurrences, win) {
  const { winStart, winEnd, winIndexOf } = win
  const n = win.windowMonths.length
  const round2 = (x) => Math.round(x * 100) / 100
  // Janela longa: mais ocorrências por agendamento (semanal ≈ 4,4 por mês). Até 2 anos segue 140.
  const ocorrencias = Math.max(140, n * 5)
  const previsoes = previsoesDasFuncoes(linked, { accounts, schedules, scheduleReservaFuncoes, getNextOccurrences }, { ini: winStart, fim: winEnd, ocorrencias })
  const result = {}
  for (const f of linked) {
    const deps = new Array(n).fill(0)
    const ress = new Array(n).fill(0)
    const provs = new Array(n).fill(0)
    // Itens individuais (ocorrências) para o modal de detalhamento. Coletados só para os meses
    // FUTUROS (idx >= 1; idx 0 é o mês anterior/referência) — casam com o total dos arrays.
    const depItems = []  // { date, label, amount }
    const resItems = []  // { date, label, amount, resgateScheduleId? } (resgates reais + provisões)
    // Extrato da função: as mesmas ocorrências, na MESMA ordem em que entram nas colunas, com o
    // tipo e o índice do mês — o extrato refaz a conta da grade a partir delas (lib/extratoReserva).
    const movs = []      // { ...itemFluxo, tipo, idx }
    for (const p of previsoes[f.id] || []) {
      const idx = winIndexOf(p.date)
      if (idx < 0 || idx > n - 1) continue
      const coluna = p.tipo === 'deposito' ? deps : p.tipo === 'resgate' ? ress : provs
      coluna[idx] = round2(coluna[idx] + p.amount)
      if (idx >= 1) (p.tipo === 'deposito' ? depItems : resItems).push(p.itemFluxo)
      if (idx >= 1) movs.push({ ...p.itemFluxo, amount: p.amount, tipo: p.tipo, idx })
    }
    result[f.id] = { deps, ress, provs, depItems, resItems, movs }
  }
  return result
}

