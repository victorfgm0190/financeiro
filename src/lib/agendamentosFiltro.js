// Data exibida e filtros da lista de Agendamentos. Sem React: usada pelo SchedulePanel e testável.
import { occEfetiva, proximaEfetiva } from './fluxoCaixa.js'

// Data de vencimento EXIBIDA (e usada no particionamento da lista) para um agendamento
// RECORRENTE. Para 'once'/faturas e concluídos (nextDate null) devolve nextDate inalterado.
// É puramente visual: as ações (pagar/pular/estornar) continuam usando nextDate (a ocorrência
// pendente real).
export function scheduleDisplayDueDate(schedule, nextDate, getNextOccurrences, todayStr) {
  // Exceção da ocorrência ("Próximas ocorrências" do formulário) manda na data EXIBIDA.
  //
  // Ela é guardada em `overrides[dataOriginal].date` e NÃO altera a data original — que é a
  // chave de registered/skipped e continua sendo o que as ações usam (o `nextDate` deste
  // arquivo). Sem passar por occEfetiva aqui, mover uma ocorrência de 09/09 para 11/09 gravava
  // certo, sincronizava certo e não mudava nada na linha: o cabeçalho seguia em 09/09 enquanto
  // a sub-lista de próximas ocorrências (que já usa occEfetiva) mostrava 11/09.
  const efetiva = (d) => (d ? occEfetiva(schedule, d).date : d)

  const proxima = efetiva(nextDate)
  if (!proxima || (schedule.frequency || 'once') === 'once') return proxima
  // Ocorrência pendente EM ATRASO manda: ela é a próxima NÃO PAGA e tem de aparecer com a
  // própria data. Preferir a próxima futura (comportamento anterior) tirava a linha do bucket
  // "Em atraso" — particionado por displayDate — enquanto o pagamento seguia em aberto.
  //
  // O teste é sobre a data EFETIVA: uma ocorrência vencida que foi adiada para o futuro não
  // está mais em atraso, e cair no bucket "Em atraso" exibindo uma data futura seria pior que
  // o bug original.
  if (proxima < todayStr) return proxima
  // Sem atraso: "Data de Vencimento Atual" do formulário, desde que ela mesma não seja uma data
  // já consumida (nextOccurrence pode ficar para trás de registered/skipped).
  const ancora = efetiva(schedule.nextOccurrence)
  if (ancora && ancora >= todayStr) return ancora
  return efetiva(getNextOccurrences(schedule, 24).find(d => efetiva(d) >= todayStr)) || proxima
}

// Dia 'YYYY-MM-DD' de um valor de data. String ISO (com ou sem hora) → os 10 primeiros caracteres
// (o dia como foi gravado, sem converter fuso). Date → dia LOCAL. Nunca new Date('YYYY-MM-DD'),
// que é lido como UTC e no Brasil (UTC-3) cai no dia anterior.
export function diaLocal(v) {
  if (!v) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

// Data que a coluna "Data" mostra para o agendamento (mesma regra da linha): ocorrência pendente
// com override de data aplicado (scheduleDisplayDueDate); sem pendente, a data de início.
export function dataExibidaAgendamento(s, getNextOccurrences, todayStr) {
  const next = getNextOccurrences(s, 1)[0] || null
  return diaLocal(scheduleDisplayDueDate(s, next, getNextOccurrences, todayStr) || s.startDate)
}

// Filtros em tempo real da lista. Cada filtro é independente (nenhum zera outro). Data De/Até são
// inclusivos e comparados como dia 'YYYY-MM-DD' contra a data EXIBIDA.
export function filtrarAgendamentos(schedules, { desc = '', payee = '', categoryId = '', from = '', to = '', min = null, max = null }, getNextOccurrences, todayStr) {
  const d = desc.trim().toLowerCase()
  const p = payee.trim().toLowerCase()
  const de = diaLocal(from)
  const ate = diaLocal(to)
  if (!d && !p && !categoryId && !de && !ate && min === null && max === null) return schedules
  return schedules.filter(s => {
    if (d && !(s.description || '').toLowerCase().includes(d)) return false
    if (p && !(s.payee || '').toLowerCase().includes(p)) return false
    if (categoryId && s.categoryId !== categoryId) return false
    if (min !== null || max !== null) {
      // Passa se o valor BASE OU o valor EFETIVO da próxima ocorrência (override) cair no range.
      const baseAmt = Number(s.amount) || 0
      const nextDate = getNextOccurrences(s, 1)[0] || null
      const effAmt = nextDate ? Number(occEfetiva(s, nextDate).amount) : baseAmt
      const inRange = (a) => (min === null || a >= min) && (max === null || a <= max)
      if (!inRange(baseAmt) && !inRange(effAmt)) return false
    }
    if (de || ate) {
      const dia = dataExibidaAgendamento(s, getNextOccurrences, todayStr)
      if (de && dia < de) return false
      if (ate && dia > ate) return false
    }
    return true
  })
}

// ─── Barra de filtros (FilterBar): STATUS × PERÍODO ────────────────────────────────────────────
// Substitui os chips antigos sem perder combinação:
//   Todos os futuros = A pagar + Todos os futuros  ·  Próximos 30 dias = A pagar + Próximos 30 dias
//   Este mês = A pagar + Este mês  ·  Todos = A pagar + Tudo (inclui as séries concluídas)
//   Provisões = Provisões + Tudo  ·  Pagos = Pagos + Tudo  ·  Resgates Anuais = aba Contas Anuais,
//   status "Resgates anuais" + Tudo  ·  datas De/Até = Personalizado.
export const STATUS = {
  apagar: { id: 'apagar', label: 'A pagar' },
  provisoes: { id: 'provisoes', label: 'Provisões' },
  pagos: { id: 'pagos', label: 'Pagos' },
  resgates: { id: 'resgates', label: 'Resgates anuais' },
}
export const STATUS_POR_ABA = {
  conta: ['apagar', 'provisoes', 'pagos'],
  cartao: ['apagar', 'pagos'],
  gerencial: ['apagar', 'pagos'],
  anuais: ['apagar', 'pagos', 'resgates'],
}
export const PERIODOS = {
  mes: 'Este mês',
  next30: 'Próximos 30 dias',
  ult30: 'Últimos 30 dias',
  futuros: 'Todos os futuros',
  tudo: 'Tudo',
  custom: 'Personalizado…',
}
// Pagos olham para trás (data do pagamento): "futuros"/"próximos" não fazem sentido.
export const opcoesPeriodo = (status) => (status === 'pagos'
  ? ['mes', 'ult30', 'tudo', 'custom']
  : ['mes', 'next30', 'futuros', 'tudo', 'custom'])
export const periodoPadrao = (status) => (status === 'pagos' ? 'mes' : status === 'resgates' ? 'tudo' : 'futuros')

function limitesDoMes(hoje) {
  const [y, m] = hoje.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(ultimo).padStart(2, '0')}`]
}
function somarDias(hoje, n) {
  const [y, m, d] = hoje.split('-').map(Number)
  return diaLocal(new Date(y, m - 1, d + n))
}

// Agendamentos (A pagar / Provisões / Resgates) pelo período. Data = data EFETIVA da próxima
// ocorrência (mesma regra dos chips antigos). "Tudo"/"Personalizado" não recortam aqui — o
// Personalizado é aplicado pelas datas De/Até de filtrarAgendamentos.
export function filtrarPorStatusPeriodo(schedules, { status = 'apagar', periodo = 'futuros' }, getNextOccurrences, hoje) {
  let lista = schedules || []
  if (status === 'provisoes') lista = lista.filter(s => s.isProvisao)
  if (periodo === 'tudo' || periodo === 'custom') return lista
  if (periodo === 'futuros') return lista.filter(s => getNextOccurrences(s, 1).length > 0)
  const [ini, fim] = periodo === 'mes' ? limitesDoMes(hoje) : [null, somarDias(hoje, 30)]
  return lista.filter(s => {
    const d = proximaEfetiva(s, getNextOccurrences)?.date
    if (!d) return false
    return (!ini || d >= ini) && d <= fim
  })
}

// Pagos pelo período (data do pagamento).
export function filtrarPagosPorPeriodo(linhas, periodo, hoje) {
  if (periodo === 'mes') {
    const [ini, fim] = limitesDoMes(hoje)
    return (linhas || []).filter(l => l.dataPagamento >= ini && l.dataPagamento <= fim)
  }
  if (periodo === 'ult30') {
    const ini = somarDias(hoje, -30)
    return (linhas || []).filter(l => l.dataPagamento >= ini && l.dataPagamento <= hoje)
  }
  return linhas || []
}

// Contas a pagar de fatura (cards da aba Cartão) pelo período: data = vencimento.
export function filtrarFaturasPorPeriodo(payables, periodo, hoje) {
  if (periodo === 'mes') {
    const [ini, fim] = limitesDoMes(hoje)
    return (payables || []).filter(p => p.dueDate >= ini && p.dueDate <= fim)
  }
  if (periodo === 'next30') return (payables || []).filter(p => p.dueDate <= somarDias(hoje, 30))
  return payables || []
}

// Badge do botão "Filtros": quantos filtros AVANÇADOS estão ativos (descrição, favorecido,
// categoria, tipo de documento, valor). Datas não contam — elas são o Período "Personalizado".
export function contarFiltrosAvancados({ desc = '', payee = '', categoryId = '', tipos = null, min = '', max = '', valores = null } = {}) {
  return [
    !!desc.trim(), !!payee.trim(), !!categoryId, (tipos?.size || 0) > 0,
    min !== '' || max !== '' || (valores?.size || 0) > 0,
  ].filter(Boolean).length
}

// Filtros avançados de uma aba (independentes por aba). tipos/valores são arrays no estado
// guardado (Set não serializa); a tela converte para Set.
export const AVANCADOS_VAZIOS = { desc: '', payee: '', cat: '', min: '', max: '', tipos: [], valores: [] }
const str = (v) => (typeof v === 'string' ? v : '')
const arr = (v) => (Array.isArray(v) ? v : [])
export function avancadosValidos(v) {
  return {
    desc: str(v?.desc), payee: str(v?.payee), cat: str(v?.cat), min: str(v?.min), max: str(v?.max),
    tipos: arr(v?.tipos).filter(x => typeof x === 'string'),
    valores: arr(v?.valores).map(Number).filter(Number.isFinite),
  }
}

// Estado de uma aba guardado no localStorage (com try/catch: storage pode faltar).
// Formato: { [aba]: { status, periodos: { [status]: periodo }, avancados } }. "Personalizado" e as
// datas De/Até não voltam: restaura o período padrão do status.
export const FILTROS_AGENDA_KEY = 'finup.agendamentos.filtros.v1'
export function lerFiltrosAba(aba, raw) {
  const statusValidos = STATUS_POR_ABA[aba] || ['apagar']
  const salvo = (() => {
    try { return JSON.parse(raw ?? localStorage.getItem(FILTROS_AGENDA_KEY) ?? 'null')?.[aba] || null } catch { return null }
  })()
  const status = statusValidos.includes(salvo?.status) ? salvo.status : statusValidos[0]
  const periodos = {}
  for (const st of statusValidos) {
    const p = salvo?.periodos?.[st]
    periodos[st] = p && p !== 'custom' && opcoesPeriodo(st).includes(p) ? p : periodoPadrao(st)
  }
  return { status, periodos, avancados: avancadosValidos(salvo?.avancados), datas: { from: '', to: '' } }
}
export function salvarFiltrosAba(aba, { status, periodos, avancados }) {
  try {
    const todos = JSON.parse(localStorage.getItem(FILTROS_AGENDA_KEY) || '{}') || {}
    todos[aba] = { status, periodos, avancados }
    localStorage.setItem(FILTROS_AGENDA_KEY, JSON.stringify(todos))
  } catch { /* storage indisponível: só não lembra */ }
}

// Etiquetas removíveis dos filtros ativos (aparecem sob a barra mesmo com o painel recolhido).
// → [{ chave, texto }]; a tela remove pela chave ('desc' | 'payee' | 'cat' | 'tipos' | 'valor' | 'datas').
export function etiquetasFiltros({ avancados, datas, periodo }, { nomeCategoria = (id) => id, nomeTipo = (id) => id, fmtValor = String, fmtData = String } = {}) {
  const a = avancados || AVANCADOS_VAZIOS
  const out = []
  if (periodo === 'custom' && (datas?.from || datas?.to)) {
    out.push({ chave: 'datas', texto: `Período: ${datas.from ? fmtData(datas.from) : '…'} – ${datas.to ? fmtData(datas.to) : '…'}` })
  }
  if (a.desc.trim()) out.push({ chave: 'desc', texto: `Descrição: ${a.desc.trim()}` })
  if (a.payee.trim()) out.push({ chave: 'payee', texto: `Favorecido: ${a.payee.trim()}` })
  if (a.cat) out.push({ chave: 'cat', texto: `Categoria: ${nomeCategoria(a.cat)}` })
  if (a.tipos.length) out.push({ chave: 'tipos', texto: `Tipo: ${a.tipos.map(nomeTipo).join(', ')}` })
  const faixa = a.min !== '' || a.max !== ''
  if (faixa || a.valores.length) {
    const partes = []
    if (faixa) partes.push(a.min !== '' && a.max !== '' ? `${fmtValor(a.min)} a ${fmtValor(a.max)}` : a.min !== '' ? `≥ ${fmtValor(a.min)}` : `≤ ${fmtValor(a.max)}`)
    if (a.valores.length) partes.push(a.valores.length === 1 ? fmtValor(a.valores[0]) : `${a.valores.length} valores`)
    out.push({ chave: 'valor', texto: `Valor: ${partes.join(' · ')}` })
  }
  return out
}
