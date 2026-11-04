// ORÇAMENTO DO ENVELOPE — fonte ÚNICA do "A gastar" (card, Saldo Projetado do Painel, Fluxo de Caixa
// e relatórios). Funções puras; datas sempre texto 'AAAA-MM-DD' (data LOCAL do usuário, sem fuso).
//
// Tipos (envelope.tipoOrcamento):
//   'mensal' (padrão, envelopes antigos): A gastar = max(0, limite − gasto) — exatamente a conta de antes.
//   'diario': valor por dia × dias que contam no ciclo (diasSemana: lista 0=dom … 6=sáb, sem nomes
//     fixos; descontarFeriados tira os feriados ativos do cadastro).
//
// Ciclo = a competência dos envelopes (mês financeiro): do dia de início (Configurações → Período
// financeiro; "mês corrido" = dia 1) até a véspera do mesmo dia no mês seguinte. Nada é fixo no 15.
//
// Diário, dentro do ciclo (hoje = data local; calculado na leitura, sem job noturno):
//   dias passados   = dias que contam antes de hoje;   dias restantes = de hoje até o fim (hoje incluso)
//   previsto até ontem = dias passados × valor/dia;    gasto até ontem = gasto real antes de hoje
//   gasto de hoje   = gasto real de hoje (e o já lançado para os próximos dias do ciclo)
//   excesso         = max(0, gasto até ontem − previsto até ontem)   — economia NÃO soma
//   A gastar        = max(0, dias restantes × valor/dia − excesso − gasto de hoje)
// Ciclo futuro: orçamento inteiro (menos o que já estiver lançado nele). Ciclo encerrado: A gastar 0.
//
// Alteração de configuração vale do ciclo atual em diante: a versão anterior fica em env.history
// ({ tipo: 'config', ate: <início do ciclo em que mudou> }) e os ciclos encerrados podem ter o
// orçamento gravado ({ tipo: 'ciclo', inicio, orcamento, dias }) — ver historicoAoAlterar.
import { isReservaShadowOrigin, isPatrimonioOrigin, isInvestAutoOrigin } from './origins.js'
import { parteDoEnvelope } from './rateio.js'
import { competenciaKeyOf } from './envelopes.js'

export const TIPOS_ORCAMENTO = { mensal: 'Mensal', diario: 'Diário' }
// Combinações oferecidas na tela (o cálculo aceita qualquer lista).
export const DIAS_PRESETS = [
  { id: 'seg_sex', rotulo: 'Segunda a sexta', dias: [1, 2, 3, 4, 5] },
  { id: 'seg_sab', rotulo: 'Segunda a sábado', dias: [1, 2, 3, 4, 5, 6] },
]
const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const pad = (n) => String(n).padStart(2, '0')
const doDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const somaDias = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return doDate(d) }
const diaDaSemana = (s) => new Date(`${s}T12:00:00Z`).getUTCDay()

export const hojeLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const ehDiario = (env) => env?.tipoOrcamento === 'diario'
export const rotuloDias = (dias) => {
  const p = DIAS_PRESETS.find(x => x.dias.length === (dias || []).length && x.dias.every(d => dias.includes(d)))
  return p ? p.rotulo : (dias || []).slice().sort().map(d => NOMES_DIA[d]).join(', ')
}

// Dia em que o ciclo dos envelopes começa: o do período financeiro; "mês corrido" = 1.
export const diaInicioCiclo = (settings) =>
  ((settings?.financialMonthMode || 'custom') === 'calendar' ? 1 : Number(settings?.financialMonthStartDay) || 1)

// Competência (ano*12 + mês0) → { inicio, fim, compKey }.
export function cicloDaCompetencia(compKey, diaInicio) {
  const y = Math.floor(compKey / 12)
  const m0 = compKey % 12
  return {
    compKey,
    inicio: doDate(new Date(Date.UTC(y, m0, diaInicio))),
    fim: doDate(new Date(Date.UTC(y, m0 + 1, diaInicio - 1))),
  }
}
export const cicloDaData = (dataStr, diaInicio) => cicloDaCompetencia(competenciaKeyOf(dataStr, diaInicio), diaInicio)

// Ciclos que se sobrepõem a [inicio, fim].
export function ciclosNaFaixa(inicio, fim, diaInicio) {
  const out = []
  if (!inicio || !fim || inicio > fim) return out
  let k = competenciaKeyOf(inicio, diaInicio)
  const ultimo = competenciaKeyOf(fim, diaInicio)
  for (; k <= ultimo; k++) out.push(cicloDaCompetencia(k, diaInicio))
  return out
}

// Datas do ciclo que contam: dia da semana na lista e (se pedido) fora dos feriados.
export function diasQueContam(inicio, fim, diasSemana, feriados = null) {
  const dias = new Set((diasSemana || []).map(Number))
  const out = []
  for (let d = inicio; d <= fim; d = somaDias(d, 1)) {
    if (dias.has(diaDaSemana(d)) && !(feriados && feriados.has(d))) out.push(d)
  }
  return out
}

// Configuração que vale para o ciclo que começa em `inicio`: a versão do histórico gravada quando
// ela mudou depois desse ciclo; sem nenhuma, a atual do envelope.
export function configDoCiclo(env, inicio) {
  const versoes = (env?.history || []).filter(h => h?.tipo === 'config' && h.ate).sort((a, b) => a.ate.localeCompare(b.ate))
  const v = versoes.find(h => inicio < h.ate)
  const base = v || env || {}
  return {
    tipoOrcamento: base.tipoOrcamento || 'mensal', limitAmount: Number(base.limitAmount) || 0,
    valorDia: Number(base.valorDia) || 0, diasSemana: base.diasSemana || [], descontarFeriados: !!base.descontarFeriados,
  }
}
const configAtual = (env) => configDoCiclo({ ...env, history: [] }, '')
const mesmaConfig = (a, b) => a.tipoOrcamento === b.tipoOrcamento && r2(a.limitAmount) === r2(b.limitAmount) && r2(a.valorDia) === r2(b.valorDia)
  && a.descontarFeriados === b.descontarFeriados && JSON.stringify([...a.diasSemana].sort()) === JSON.stringify([...b.diasSemana].sort())

// Despesa que conta para envelope (mesmo filtro de sempre: sem sombras de reserva, patrimônio e
// investimento automático).
export const despesaDeEnvelope = (tx) => tx?.type === 'expense' && !tx.reservaAuto
  && !isReservaShadowOrigin(tx) && !isPatrimonioOrigin(tx) && !isInvestAutoOrigin(tx)

// Gastos do envelope entre `inicio` e `fim` (inclusive), um por lançamento: [{ date, valor }].
export function gastosDoEnvelope(env, transactions, rateios, inicio, fim) {
  const out = []
  for (const tx of transactions || []) {
    if (!despesaDeEnvelope(tx) || !tx.date || tx.date < inicio || tx.date > fim) continue
    const parte = parteDoEnvelope(tx, rateios, env.categoryIds)
    if (parte) out.push({ date: tx.date, valor: parte })
  }
  return out
}

// Conta do envelope diário num ciclo. `feriados`: Set de datas ativas (lib/feriados feriadosAtivos).
export function orcamentoDiario(env, ciclo, { hoje = hojeLocal(), feriados = null, gastos = [] } = {}) {
  const cfg = configDoCiclo(env, ciclo.inicio)
  const lista = diasQueContam(ciclo.inicio, ciclo.fim, cfg.diasSemana, cfg.descontarFeriados ? feriados : null)
  const congelado = (env?.history || []).find(h => h?.tipo === 'ciclo' && h.inicio === ciclo.inicio)
  const v = r2(cfg.valorDia)
  const estado = hoje < ciclo.inicio ? 'futuro' : hoje > ciclo.fim ? 'encerrado' : 'atual'
  const dias = congelado ? Number(congelado.dias) : lista.length
  const orcamento = congelado ? r2(congelado.orcamento) : r2(dias * v)
  const diasPassados = estado === 'futuro' ? 0 : estado === 'encerrado' ? dias : lista.filter(d => d < hoje).length
  const diasRestantes = estado === 'futuro' ? dias : estado === 'encerrado' ? 0 : lista.filter(d => d >= hoje).length
  const soma = (f) => r2(gastos.filter(f).reduce((a, g) => a + (Number(g.valor) || 0), 0))
  const gastoAteOntem = soma(g => g.date < hoje)
  const gastoHoje = soma(g => g.date >= hoje)
  const gasto = r2(gastoAteOntem + gastoHoje)
  const previstoAteOntem = estado === 'encerrado' ? orcamento : r2(diasPassados * v)
  const excesso = r2(Math.max(0, gastoAteOntem - previstoAteOntem))
  const economia = r2(Math.max(0, previstoAteOntem - gastoAteOntem))
  const aGastar = estado === 'encerrado' ? 0 : r2(Math.max(0, diasRestantes * v - excesso - gastoHoje))
  return {
    tipo: 'diario', estado, valorDia: v, diasSemana: cfg.diasSemana, descontarFeriados: cfg.descontarFeriados, congelado: !!congelado,
    dias, orcamento, diasPassados, diasRestantes, previstoAteOntem, gastoAteOntem, gastoHoje, gasto, excesso, economia, aGastar,
  }
}

// "8 dias × R$ 40,00 - R$ 13,00 de excesso = R$ 307,00" (fmt = formatador de moeda da tela).
export function textoDaConta(o, fmt) {
  if (!o) return ''
  if (o.estado === 'encerrado') return `Ciclo encerrado: ${o.dias} dias × ${fmt(o.valorDia)} = ${fmt(o.orcamento)}; gasto ${fmt(o.gasto)}`
  const partes = [`${o.diasRestantes} ${o.diasRestantes === 1 ? 'dia' : 'dias'} × ${fmt(o.valorDia)}`]
  if (o.excesso > 0) partes.push(`${fmt(o.excesso)} de excesso`)
  if (o.gastoHoje > 0) partes.push(`${fmt(o.gastoHoje)} gastos hoje`)
  const bruto = r2(o.diasRestantes * o.valorDia - o.excesso - o.gastoHoje)
  return `${partes.join(' - ')} = ${fmt(o.aGastar)}${bruto < 0 ? ` (a conta dá ${fmt(bruto)}; não fica negativo)` : ''}`
}

// A GASTAR do envelope no ciclo — a função ÚNICA. Mensal: max(0, limite − gasto) (como sempre).
//   ciclo: { inicio, fim }; gasto: total no ciclo (mensal); gastos: [{ date, valor }] (diário).
export function aGastarEnvelope(env, { ciclo = null, gasto = null, gastos = null, hoje = hojeLocal(), feriados = null } = {}) {
  const diario = ciclo && configDoCiclo(env, ciclo.inicio).tipoOrcamento === 'diario'
  if (!diario) {
    const g = gasto != null ? gasto : (gastos || []).reduce((a, x) => a + (Number(x.valor) || 0), 0)
    const limite = ciclo ? configDoCiclo(env, ciclo.inicio).limitAmount : Number(env?.limitAmount) || 0
    return Math.max(0, r2(limite - g))
  }
  return orcamentoDiario(env, ciclo, { hoje, feriados, gastos: gastos || [] }).aGastar
}

// Saldo Projetado do Painel (wrapper de getSaldoPrincipalBreakdown — o cálculo protegido faz
// limite − gasto da competência): o envelope DIÁRIO vai com limite = gasto da competência (MESMA
// conta do cálculo protegido) + A gastar, e o resultado lá dentro é exatamente o A gastar. Mensal
// passa como está (mesmo objeto). `feriadosDe(inicio, fim)` → Set.
export function envelopesParaProjecao(envelopes, { transactions, rateios, startDay, diaInicio, referenceDate = new Date(), feriadosDe }) {
  const hoje = hojeLocal(referenceDate)
  const comp = referenceDate.getDate() >= startDay
    ? referenceDate.getFullYear() * 12 + referenceDate.getMonth()
    : (() => { const p = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1); return p.getFullYear() * 12 + p.getMonth() })()
  return (envelopes || []).map(env => {
    if (!ehDiario(env)) return env
    let spent = 0
    for (const tx of transactions || []) {
      if (!despesaDeEnvelope(tx)) continue
      const parte = parteDoEnvelope(tx, rateios, env.categoryIds)
      if (!parte) continue
      if (!tx.date || competenciaKeyOf(tx.date, startDay) !== comp) continue
      spent += parte
    }
    const ciclo = cicloDaCompetencia(comp, diaInicio)
    const aGastar = aGastarEnvelope(env, { ciclo, gastos: gastosDoEnvelope(env, transactions, rateios, ciclo.inicio, ciclo.fim), hoje, feriados: feriadosDe(ciclo.inicio, ciclo.fim) })
    return { ...env, limitAmount: r2(spent + aGastar) }
  })
}

// A configuração do orçamento mudou E envolve o diário (antes ou depois)? Envelope só Mensal nunca
// ganha versões: o limite de qualquer ciclo continua o atual, como sempre foi.
export function mudouOrcamento(antes, depois) {
  const a = configAtual(antes)
  const d = configAtual(depois)
  return (a.tipoOrcamento === 'diario' || d.tipoOrcamento === 'diario') && !mesmaConfig(a, d)
}

// Alteração do envelope: se a configuração do orçamento mudou (mudouOrcamento), a anterior fica
// valendo para os ciclos ANTES do atual ({ tipo: 'config', ate: início do ciclo atual }); os ciclos
// encerrados passados em `congelar` ([{ inicio, orcamento, dias }]) ganham o orçamento gravado.
export function historicoAoAlterar(antes, depois, { inicioCicloAtual, congelar = [] }) {
  const hist = [...(antes?.history || [])]
  const a = configAtual(antes)
  if (mudouOrcamento(antes, depois) && !hist.some(h => h?.tipo === 'config' && h.ate === inicioCicloAtual)) {
    hist.push({ tipo: 'config', ate: inicioCicloAtual, ...a })
  }
  for (const c of congelar) {
    if (!hist.some(h => h?.tipo === 'ciclo' && h.inicio === c.inicio)) hist.push({ tipo: 'ciclo', inicio: c.inicio, orcamento: r2(c.orcamento), dias: c.dias })
  }
  return hist
}

// Ciclos ENCERRADOS (os `n` anteriores ao atual) de um envelope diário ainda sem orçamento gravado:
// [{ inicio, orcamento, dias }] — gravados (historicoAoAlterar) ANTES de mudar a configuração ou os
// feriados, para que o ciclo encerrado mantenha o orçamento que teve.
export function ciclosParaCongelar(env, { compKeyAtual, diaInicio, feriadosDe, n = 6 }) {
  const out = []
  for (let k = compKeyAtual - n; k < compKeyAtual; k++) {
    const c = cicloDaCompetencia(k, diaInicio)
    const cfg = configDoCiclo(env, c.inicio)
    if (cfg.tipoOrcamento !== 'diario') continue
    if ((env?.history || []).some(h => h?.tipo === 'ciclo' && h.inicio === c.inicio)) continue
    const dias = diasQueContam(c.inicio, c.fim, cfg.diasSemana, cfg.descontarFeriados ? feriadosDe(c.inicio, c.fim) : null).length
    out.push({ inicio: c.inicio, dias, orcamento: r2(dias * cfg.valorDia) })
  }
  return out
}
