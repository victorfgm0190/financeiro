// Conflito de PERÍODO entre baixa e pulo de um agendamento — função PURA, só para avisos de UI.
// Origem: em junho/2026, 27 agendamentos ficaram com o mês contado duas vezes (baixa gravada em
// 17/06, fora da série, e depois o vencimento 18/06 pulado). Nada aqui grava ou corrige dados.
//
// Período de um vencimento V = as datas mais próximas de V do que de qualquer outro vencimento da
// série, até meio passo da frequência (mensal ±15,5 dias, semanal ±3,5 — "a mesma semana" em
// torno do vencimento). Uma data registrada R ≠ V cujo vencimento mais próximo é V é a baixa
// "deste mês" gravada com outra data.
import { computeOccurrences } from './occurrences.js'
import { JANELA_DIAS } from './ocorrenciasRegistradas.js'

const dia = (d) => String(d || '').slice(0, 10)
const ms = (d) => new Date(`${dia(d)}T12:00:00`).getTime()
const distDias = (a, b) => Math.abs(ms(a) - ms(b)) / 86400000
const ehRecorrente = (s) => !!s && (s.frequency || 'once') !== 'once' && !!s.startDate

// Vencimentos-BASE da série (sem baixas/pulos) até passar de `ate` por um período.
function serieAte(s, ate) {
  const janela = JANELA_DIAS[s.frequency] ?? 31
  const passos = Math.ceil(Math.max(0, (ms(ate) - ms(s.startDate)) / 86400000) / Math.max(1, janela * 0.9)) + 3
  return computeOccurrences({ ...s, nextOccurrence: null, registered: [], skipped: [] }, Math.min(passos, 5000))
}

// Vencimento da série cujo período contém `data` (o mais próximo, até meio passo), ou null.
export function vencimentoDoPeriodo(s, data) {
  if (!ehRecorrente(s) || !data) return null
  const meio = (JANELA_DIAS[s.frequency] ?? 31) / 2
  let melhor = null
  for (const v of serieAte(s, data)) {
    const d = distDias(v, data)
    if (d <= meio && (!melhor || d < distDias(melhor, data))) melhor = v
  }
  return melhor
}

// Pular o vencimento `venc`: o período dele já tem baixa gravada com OUTRA data? → essa data, ou null.
export function baixaNoPeriodo(s, venc) {
  if (!ehRecorrente(s) || !venc) return null
  const v = dia(venc)
  for (const r of [...new Set((s.registered || []).map(dia))].sort()) {
    if (r === v) continue
    if (vencimentoDoPeriodo(s, r) === v) return r
  }
  return null
}

// Dar baixa na ocorrência `ocorrencia` com pagamento em `dataPagamento`: o vencimento do período
// do PAGAMENTO está pulado (e é outro)? → esse vencimento (para "tirar o pulo"), ou null.
// É o caso "pulei 18/06 e paguei em 17/06": a próxima pendente seria 18/07 e a baixa de junho
// iria para julho.
export function puloNoPeriodo(s, dataPagamento, ocorrencia) {
  if (!ehRecorrente(s) || !dataPagamento) return null
  const v = vencimentoDoPeriodo(s, dataPagamento)
  if (!v || v === dia(ocorrencia)) return null
  const pulados = new Set((s.skipped || []).map(dia))
  const registrados = new Set((s.registered || []).map(dia))
  return pulados.has(v) && !registrados.has(v) ? v : null
}

// Pular em lote: separa os itens { schedule, nextDate } cujo período já tem baixa.
export function separarConflitosDePulo(itens) {
  const livres = []
  const conflitos = []
  for (const it of itens || []) {
    const baixa = baixaNoPeriodo(it.schedule, it.nextDate)
    if (baixa) conflitos.push({ ...it, baixa })
    else livres.push(it)
  }
  return { livres, conflitos }
}

// Texto do aviso (mesmo em todas as telas).
const ddmm = (d) => `${dia(d).slice(8, 10)}/${dia(d).slice(5, 7)}`
export const mensagemConflitoPulo = (baixa) =>
  `Este mês já tem um pagamento registrado em ${ddmm(baixa)}. Pular vai contar este mês duas vezes. Deseja pular mesmo assim?`
export const mensagemPuloNoPagamento = (pulado, ocorrencia) =>
  `O vencimento de ${ddmm(pulado)}, do mesmo período deste pagamento, está pulado. Registrar agora liga o pagamento a ${ddmm(ocorrencia)} e conta este mês duas vezes.`
