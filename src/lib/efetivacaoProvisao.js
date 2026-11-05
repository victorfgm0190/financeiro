// Efetivação de Provisão de Despesa e o "Desfazer efetivação" — funções PURAS (sem React/I/O).
// AppContext.efetivarProvisao / desfazerEfetivacaoProvisao chamam estas funções e gravam o resultado.
//
// Vínculo gravado na PROVISÃO (agendamentos.efetivacoes, JSONB, da mais antiga à mais recente):
//   { id, em, ocorrencia, dataReal, valor, aplicarProximas, despesaId, resgateId, anterior }
//   • ocorrencia: data-BASE da ocorrência efetivada ('Uma vez': a startDate de antes);
//   • despesaId / resgateId: agendamentos criados pela efetivação (null quando não houve);
//   • anterior: cópia dos campos da provisão que a efetivação muda — inclui a âncora da série
//     (startDate/nextOccurrence) e o dia de vencimento fixo (overrides._diaVencimento).
// Efetivações antigas (feitas antes deste vínculo) não têm registro e NÃO são desfeitas pelo botão:
// nada aqui tenta descobrir o vínculo por descrição, data ou valor.
import { datasDaSerie, diaVencimentoDe, FREQ_MENSAIS, computeOccurrences } from './occurrences.js'

// Campos da provisão que a efetivação altera (e o desfazer devolve).
export const CAMPOS_ESTADO = ['amount', 'startDate', 'nextOccurrence', 'provisaoEfetivada', 'provisaoEfetivadaUntil', 'autoRegister']

export const MSG_JA_PAGA = 'Esta efetivação já foi paga. Estorne o pagamento antes de desfazer.'
export const MSG_SEM_VINCULO = 'Esta efetivação foi feita antes de o Finup guardar o vínculo e não pode ser desfeita pelo botão.'

const dia10 = (d) => (d ? String(d).slice(0, 10) : null)
const ehUmaVez = (s) => (s?.frequency || 'once') === 'once'
const fmtBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

export const novoIdEfetivacao = () => 'efet_' + Date.now() + '_' + Math.random().toString(36).slice(2)

// Para onde vai a série recorrente depois de efetivar `ocorrencia` com data real `dataReal`.
//   • aplicarProximas = false (padrão, ou data real = ocorrência): próxima = ocorrência + 1 intervalo
//     (13/11 efetivada em 16/11, semanal → 20/11). Dia de vencimento fixo, se houver, continua.
//   • aplicarProximas = true: próxima = data real + 1 intervalo (16/11 → 23/11). Frequência mensal
//     re-ancora no dia da data real (overrides._diaVencimento), a mesma regra do "Esta e as
//     próximas" da edição de ocorrência (src/lib/camposSerie.js).
// → { ancora, diaVencimento } (diaVencimento null = sem dia fixo).
export function ancoraAposEfetivar(prov, { ocorrencia, dataReal, aplicarProximas = false }) {
  const freq = prov.frequency || 'weekly'
  const base = dia10(ocorrencia)
  const real = dia10(dataReal) || base
  if (aplicarProximas && real && real !== base) {
    const dia = FREQ_MENSAIS.has(freq) ? Number(real.slice(8, 10)) : null
    return { ancora: datasDaSerie(real, freq, 2, dia)[1], diaVencimento: dia }
  }
  const dia = diaVencimentoDe(prov)
  return { ancora: datasDaSerie(base || real, freq, 2, dia)[1], diaVencimento: dia }
}

// overrides._diaVencimento = `dia` (null apaga). Só mexe em `overrides` se o dia muda — o desfazer
// devolve o objeto exatamente como era.
function comDiaVencimento(s, dia) {
  const atual = s.overrides?._diaVencimento ?? null
  if ((atual || null) === (dia || null)) return s
  const overrides = { ...(s.overrides || {}) }
  if (dia) overrides._diaVencimento = dia
  else delete overrides._diaVencimento
  return { ...s, overrides }
}

// Provisão como fica depois da efetivação (sem os agendamentos criados). `registro` null = banco sem
// a coluna efetivacoes: efetiva do mesmo jeito, mas sem vínculo (não poderá ser desfeita).
export function provisaoEfetivada(prov, { valor, dataReal, ocorrencia, aplicarProximas = false, registro = null }) {
  let novo
  if (ehUmaVez(prov)) {
    novo = { ...prov, amount: valor, startDate: dataReal, provisaoEfetivada: true, autoRegister: true }
  } else {
    // `nextOccurrence` avança junto: computeOccurrences ancora em `nextOccurrence || startDate`.
    // provisao_efetivada_until (modelo antigo) é limpo — a série agora avança a própria âncora.
    const { ancora, diaVencimento } = ancoraAposEfetivar(prov, { ocorrencia, dataReal, aplicarProximas })
    novo = { ...prov, startDate: ancora, nextOccurrence: ancora, provisaoEfetivadaUntil: null }
    novo = comDiaVencimento(novo, diaVencimento)
  }
  if (registro) novo.efetivacoes = [...(prov.efetivacoes || []), registro]
  return novo
}

// Cópia do estado anterior (o que o desfazer devolve). `registered` só serve para saber, no
// desfazer, se a provisão 'Uma vez' foi paga DEPOIS da efetivação — não é restaurado.
export function estadoAnterior(prov) {
  const out = {}
  for (const c of CAMPOS_ESTADO) out[c] = prov[c] === undefined ? null : prov[c]
  out.registered = [...(prov.registered || [])]
  out.diaVencimento = prov.overrides?._diaVencimento ?? null
  return out
}

// Aplica a efetivação à lista de agendamentos. `despesa`/`resgate` = agendamentos JÁ montados
// (herancaCampos.agendamentoDaEfetivacao / resgateDaEfetivacao) ou null.
// → { schedules, provisao, registro } (registro null quando comVinculo = false).
export function aplicarEfetivacao(schedules, provId, {
  valor, dataReal, ocorrencia, aplicarProximas = false, despesa = null, resgate = null,
  comVinculo = true, id = novoIdEfetivacao(), em = new Date().toISOString(),
}) {
  const prov = schedules.find(s => s.id === provId)
  if (!prov) return { schedules, provisao: null, registro: null }
  const umaVez = ehUmaVez(prov)
  const occ = dia10(umaVez ? prov.startDate : ocorrencia) || dia10(dataReal)
  const aplicar = !umaVez && !!aplicarProximas && dia10(dataReal) !== occ
  const registro = comVinculo ? {
    id, em, ocorrencia: occ, dataReal: dia10(dataReal), valor: Number(valor),
    aplicarProximas: aplicar,
    despesaId: despesa?.id || null, resgateId: resgate?.id || null,
    anterior: estadoAnterior(prov),
  } : null
  const provisao = provisaoEfetivada(prov, { valor: Number(valor), dataReal: dia10(dataReal), ocorrencia: occ, aplicarProximas: aplicar, registro })
  const out = schedules.map(s => (s.id === provId ? provisao : s))
  if (despesa) out.push(despesa)
  if (resgate) out.push(resgate)
  return { schedules: out, provisao, registro }
}

// Prévia das próximas `n` ocorrências da provisão recorrente depois de efetivar (datas-base, como
// o motor as gera — respeita parcelas, pulos e dia fixo).
export function previaProximas(prov, { ocorrencia, dataReal, aplicarProximas = false }, n = 3) {
  if (!prov || ehUmaVez(prov)) return []
  const registro = { ocorrencia: dia10(ocorrencia) }
  const depois = provisaoEfetivada(prov, { valor: prov.amount, dataReal, ocorrencia, aplicarProximas, registro })
  return computeOccurrences(depois, n)
}

// Qual provisão/efetivação um agendamento representa: a própria provisão (com efetivações
// gravadas) ou a despesa/resgate criados por uma efetivação. → { provisao, registro, papel } | null
export function vinculoDoAgendamento(schedules, scheduleId) {
  if (!scheduleId) return null
  for (const p of schedules || []) {
    const regs = p.efetivacoes || []
    if (!regs.length) continue
    if (p.id === scheduleId) return { provisao: p, registro: regs[regs.length - 1], papel: 'provisao' }
    const r = regs.find(e => e.despesaId === scheduleId || e.resgateId === scheduleId)
    if (r) return { provisao: p, registro: r, papel: r.despesaId === scheduleId ? 'despesa' : 'resgate' }
  }
  return null
}

const pago = (s) => (s?.registered || []).length > 0

// Pode desfazer? → { pode, motivo, mensagem, provisao, registro, despesa, resgate }
//   motivo: 'sem_vinculo' | 'nao_mais_recente' | 'pago'
export function situacaoDesfazer(schedules, scheduleId) {
  const v = vinculoDoAgendamento(schedules, scheduleId)
  if (!v) return { pode: false, motivo: 'sem_vinculo', mensagem: MSG_SEM_VINCULO }
  const { provisao, registro } = v
  const regs = provisao.efetivacoes || []
  const ultima = regs[regs.length - 1]
  const despesa = registro.despesaId ? schedules.find(s => s.id === registro.despesaId) || null : null
  const resgate = registro.resgateId ? schedules.find(s => s.id === registro.resgateId) || null : null
  const base = { provisao, registro, despesa, resgate }
  if (ultima.id !== registro.id) {
    return {
      ...base, pode: false, motivo: 'nao_mais_recente',
      mensagem: `Só a efetivação mais recente desta provisão pode ser desfeita — a da ocorrência de ${fmtBR(ultima.ocorrencia)}, efetivada para ${fmtBR(ultima.dataReal)}. Desfaça-a antes desta.`,
    }
  }
  // 'Uma vez': a provisão é a própria despesa — paga = ganhou registro depois da efetivação.
  const antes = new Set(registro.anterior?.registered || [])
  const provisaoPaga = ehUmaVez(provisao) && (provisao.registered || []).some(d => !antes.has(d))
  if (provisaoPaga || pago(despesa) || pago(resgate)) {
    return { ...base, pode: false, motivo: 'pago', mensagem: MSG_JA_PAGA }
  }
  return { ...base, pode: true, motivo: null, mensagem: null }
}

// Desfaz a efetivação mais recente: provisão volta ao estado anterior (âncora, valor, data, flags,
// dia fixo) e os agendamentos criados por ela saem. → { schedules, provisao, removidos, registro }
// ou null quando não pode (ver situacaoDesfazer).
export function desfazerEfetivacao(schedules, scheduleId) {
  const sit = situacaoDesfazer(schedules, scheduleId)
  if (!sit.pode) return null
  const { provisao: prov, registro } = sit
  const ant = registro.anterior || {}
  const restaurado = { ...prov }
  for (const c of CAMPOS_ESTADO) if (c in ant) restaurado[c] = ant[c]
  const final = ehUmaVez(prov) ? restaurado : comDiaVencimento(restaurado, ant.diaVencimento ?? null)
  final.efetivacoes = (prov.efetivacoes || []).slice(0, -1)
  const removidos = [registro.despesaId, registro.resgateId].filter(Boolean)
  const fora = new Set(removidos)
  const out = schedules.filter(s => !fora.has(s.id)).map(s => (s.id === prov.id ? final : s))
  return { schedules: out, provisao: final, removidos: removidos.filter(id => schedules.some(s => s.id === id)), registro }
}
