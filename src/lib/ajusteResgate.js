// Pagar a DESPESA por valor diferente do resgate ligado da MESMA ocorrência (src/lib/resgateVinculado.js).
// O Pagar (PayModal) pergunta antes de gravar — efetivar em lote e registro automático não perguntam:
//   a) resgate da ocorrência JÁ pago/vinculado → complementar (pagando mais: transferência da diferença
//      da conta/função do resgate para a conta da despesa) ou devolução (pagando menos: da conta da
//      despesa de volta para a conta/função do resgate). Data do pagamento.
//   b) resgate da ocorrência PENDENTE → ajustar o valor SÓ dessa ocorrência do resgate (continua pendente).
// Valor igual, ocorrência excluída do resgate ou sem resgate ligado: sem pergunta.
//
// O complementar/devolução fica LIGADO à ocorrência sem virar baixa: origin 'resgate_ajuste',
// sourceScheduleId = resgate, dataOcorrencia = ocorrência, SEM scheduleId (não reabre nem cria
// ocorrência no resgate; estorno dele é pelo próprio lançamento). O "valor pago" da ocorrência do
// resgate no histórico passa a ser o líquido (lib/ocorrenciasRegistradas).
import { computeOccurrences } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { ORIGIN } from './origins.js'
import { chaveDoResgate } from './resgateVinculado.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmtBRL = (v) => r2(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const ehAjusteDeResgate = (t) => t?.origin === ORIGIN.RESGATE_AJUSTE

// Complementares/devoluções da ocorrência `chave` do resgate.
export const ajustesDaOcorrencia = (resgateId, chave, transactions = []) =>
  (transactions || []).filter(t => ehAjusteDeResgate(t) && t.sourceScheduleId === resgateId && t.dataOcorrencia === chave)

// +1 complementar (sai da conta do resgate, como ele), −1 devolução (volta para ela).
export const sinalDoAjuste = (aj, resgate) => (aj.accountId === resgate.accountId ? 1 : -1)

// Soma líquida dos ajustes de uma ocorrência (para o "valor pago" do histórico).
export function liquidoDosAjustes(resgate, chave, transactions = []) {
  return r2(ajustesDaOcorrencia(resgate.id, chave, transactions).reduce((s, t) => s + sinalDoAjuste(t, resgate) * (Number(t.amount) || 0), 0))
}

// Lançamento que pagou/vinculou a ocorrência do resgate (meta ou scheduleId + dataOcorrencia).
function lancamentoDoResgate(resgate, chave, transactions) {
  const id = resgate.registeredMeta?.[chave]?.lancamento_id
  const porMeta = id ? transactions.find(t => t.id === id) : null
  return porMeta || transactions.find(t => t.scheduleId === resgate.id && t.dataOcorrencia === chave) || null
}

// Quanto já foi resgatado para a ocorrência (lançamento do resgate ± complementares/devoluções).
export function valorResgatado(resgate, chave, transactions = []) {
  const tx = lancamentoDoResgate(resgate, chave, transactions || [])
  if (!tx) return null
  return r2(Number(tx.amount) + liquidoDosAjustes(resgate, chave, transactions))
}

const rotuloConta = (conta, funcao) => {
  const nome = conta?.apelido || conta?.name || 'a reserva'
  return funcao ? `${nome} › ${funcao.name}` : nome
}

// Pergunta a fazer no Pagar da despesa, ou null. → { tipo: 'complementar'|'devolver'|'ajustar', resgate,
// chave, de, para, diferenca, texto }
export function perguntaAjusteResgate({ despesaId, chave: chaveDespesa, valorPago, schedules = [], transactions = [], accounts = [], reserveFunctions = [] }) {
  const resgate = (schedules || []).find(s => s.agendamentoVinculadoId === despesaId)
  const despesa = (schedules || []).find(s => s.id === despesaId)
  const pago = r2(valorPago)
  if (!resgate || !chaveDespesa || !(pago > 0)) return null
  // Mesma ocorrência (posição na série), não a mesma data: a série da despesa pode ter mudado.
  const chave = despesa ? chaveDoResgate(despesa, resgate, chaveDespesa) : chaveDespesa
  const excluidas = Array.isArray(resgate.overrides?._resgateExcluidas) ? resgate.overrides._resgateExcluidas : []
  if (excluidas.includes(chave)) return null
  const conta = (accounts || []).find(a => a.id === resgate.accountId)
  const funcao = resgate.reservaFuncaoId ? (reserveFunctions || []).find(f => f.id === resgate.reservaFuncaoId) : null
  const base = { resgate, chave, chaveDespesa, para: pago }

  if ((resgate.registered || []).includes(chave)) {
    const de = valorResgatado(resgate, chave, transactions)
    if (de == null || Math.abs(pago - de) < 0.005) return null
    const diferenca = r2(Math.abs(pago - de))
    if (pago > de) {
      return { ...base, tipo: 'complementar', de, diferenca,
        texto: `Você resgatou ${fmtBRL(de)} para esta despesa e está pagando ${fmtBRL(pago)}. Deseja criar um resgate complementar de ${fmtBRL(diferenca)}?` }
    }
    return { ...base, tipo: 'devolver', de, diferenca,
      texto: `Você resgatou ${fmtBRL(de)} para esta despesa e está pagando ${fmtBRL(pago)}. Deseja devolver ${fmtBRL(diferenca)} para ${rotuloConta(conta, funcao)}?` }
  }
  // Pendente: precisa ser uma ocorrência do resgate (não pulada nem fora dele).
  if (!computeOccurrences(resgate, 400).includes(chave)) return null
  const de = r2(occEfetiva(resgate, chave).amount)
  if (Math.abs(pago - de) < 0.005) return null
  return { ...base, tipo: 'ajustar', de, diferenca: r2(Math.abs(pago - de)),
    texto: `O resgate desta ocorrência está agendado em ${fmtBRL(de)}. Deseja ajustar para ${fmtBRL(pago)}?` }
}

// Lançamento do complementar/devolução (só para os tipos 'complementar' e 'devolver').
export function txAjusteResgate(p, { data, contaDespesaId, descricaoDespesa = '' }) {
  const r = p.resgate
  const complementar = p.tipo === 'complementar'
  const destino = contaDespesaId || r.toAccountId
  return {
    type: 'transfer',
    accountId: complementar ? r.accountId : destino,
    toAccountId: complementar ? destino : r.accountId,
    amount: p.diferenca,
    date: data,
    description: `${complementar ? 'Resgate complementar' : 'Devolução do resgate'} — ${descricaoDespesa || r.description || ''}`.trim(),
    reservaFuncaoId: r.reservaFuncaoId || null,
    sourceScheduleId: r.id,
    dataOcorrencia: p.chave,
    categoryId: '', payee: '', costCenter: '',
    origin: ORIGIN.RESGATE_AJUSTE,
  }
}

// Ajusta o valor SÓ da ocorrência pendente `chave` do resgate. `_valorDe` = o valor da despesa
// naquela ocorrência agora: enquanto ele não mudar, vale o ajuste; mudou o da despesa, vale o dela.
export function ajustarValorDoResgate(resgate, despesa, chave, valor, chaveDespesa = chave) {
  if (!resgate || !despesa || !chave || (resgate.registered || []).includes(chave)) return resgate
  const atual = resgate.overrides?.[chave]
  const ov = atual && typeof atual === 'object' ? atual : {}
  return {
    ...resgate,
    overrides: { ...(resgate.overrides || {}), [chave]: { ...ov, amount: r2(valor), _valorDe: r2(occEfetiva(despesa, chaveDespesa).amount) } },
  }
}
