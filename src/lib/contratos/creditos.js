// CRÉDITOS A ABATER NA COBRANÇA PRINCIPAL ("créditos do proprietário" no aluguel) — funções puras.
// Destino de cada crédito aberto, nesta ordem:
//   1. destino_agendamento_id (escolhido na ficha: "Trocar parcela de destino"), se ainda pendente;
//   2. regra do contrato (credito_abatimento):
//      'mes_seguinte'     → primeira parcela pendente de COMPETÊNCIA posterior à do boleto de origem
//                           (padrão dos contratos novos);
//      'proximo_pendente' → próxima parcela pendente com vencimento (efetivo) >= data de origem
//                           (regra de 21/10; contratos que já existiam ficam nela).
// Desmarcar um crédito numa parcela ("não abater neste mês") o empurra para a seguinte.
// Parcela com valor editado à mão SEM composicao.manual não recebe o crédito: ele fica "bloqueado"
// e a ficha avisa (e oferece aplicar, marcando a parcela como manual).
import { occEfetiva } from '../fluxoCaixa.js'
import { ymDe } from './datas.js'
import { ehParcelaGerada, parcelaPaga, valorManual, r2 } from './parcelas.js'

const vencimento = (s) => occEfetiva(s, s.startDate).date

export const REGRAS_ABATIMENTO = {
  mes_seguinte: 'No mês seguinte ao do boleto',
  proximo_pendente: 'Na próxima parcela pendente',
}
// Contrato sem a coluna (antes da migração) = regra antiga.
export const regraAbatimento = (contrato) => contrato?.credito_abatimento || 'proximo_pendente'

// Valor digitado à mão fora do contrato (não marcado como manual): crédito não entra sozinho.
export const bloqueiaCredito = (s) => valorManual(s) && !s?.composicao?.manual

// Parcelas principais pendentes do contrato, por vencimento efetivo (inclusive as de valor manual).
export function aluguelPendentes(contrato, schedules) {
  return (schedules || [])
    .filter(s => ehParcelaGerada(s, contrato.id) && s.contratoPapel === 'aluguel' && !parcelaPaga(s) && !(s.skipped || []).includes(s.startDate))
    .sort((a, b) => vencimento(a).localeCompare(vencimento(b)))
}

// Competência do boleto que gerou o crédito: a da parcela de origem (id gerado ou "serie@data" de
// série vinculada); sem ela, o mês da data de origem.
export function competenciaOrigem(c, schedules) {
  const o = String(c?.origem_agendamento_id || '')
  if (o.includes('@')) return ymDe(o.split('@').pop())
  const s = o ? (schedules || []).find(x => x.id === o) : null
  return ymDe(s?.startDate || c?.data_origem || '')
}

// Crédito que ainda vai abater: 'aberto' ou 'previsto' (boleto informado antes de pagar o
// condomínio — já entra no aluguel de destino, marcado como previsto).
export const creditoAAbater = (c) => c?.status === 'aberto' || c?.status === 'previsto'

// Status de um crédito que volta a abater (estorno do aluguel, item tirado da composição): o do
// boleto ainda não pago (só a parcela de origem, sem lançamento) volta a 'previsto'.
export const statusAoReabrir = (c) => (c?.origem_agendamento_id && !c?.origem_lancamento_id ? 'previsto' : 'aberto')

// → Map(creditoId → { parcela, bloqueado, fixo }) para os créditos abertos/previstos do contrato.
export function destinosCreditos(contrato, schedules, creditos) {
  const pendentes = aluguelPendentes(contrato, schedules)
  const regra = regraAbatimento(contrato)
  const out = new Map()
  const abertos = (creditos || []).filter(c => c.contrato_id === contrato.id && creditoAAbater(c))
    .sort((a, b) => String(a.data_origem).localeCompare(String(b.data_origem)))
  for (const c of abertos) {
    const adiado = (s) => (s.composicao?.creditos_adiados || []).includes(c.id)
    let alvo = c.destino_agendamento_id ? pendentes.find(s => s.id === c.destino_agendamento_id) || null : null
    const fixo = !!alvo
    if (!alvo) {
      if (regra === 'mes_seguinte') {
        const ym = competenciaOrigem(c, schedules)
        alvo = pendentes.find(s => ymDe(s.startDate) > ym && !adiado(s)) || null
      } else {
        alvo = pendentes.find(s => vencimento(s) >= String(c.data_origem || '') && !adiado(s)) || null
      }
    }
    if (alvo) out.set(c.id, { parcela: alvo, bloqueado: bloqueiaCredito(alvo), fixo })
  }
  return out
}

// parcelaId → [créditos] a abater nela (só os que de fato entram: sem os bloqueados).
export function distribuirCreditos(contrato, schedules, creditos) {
  const out = new Map(aluguelPendentes(contrato, schedules).map(s => [s.id, []]))
  const porId = new Map((creditos || []).map(c => [c.id, c]))
  for (const [id, d] of destinosCreditos(contrato, schedules, creditos)) {
    if (!d.bloqueado) out.get(d.parcela.id).push(porId.get(id))
  }
  return out
}

const ddmm = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '')

// Um item por item de origem: "Fundo de Reserva cond. 05/12 −79,10". Crédito manual (sem
// lançamento nem parcela de origem) leva só a descrição. Previsto: "(previsto)" e previsto: true.
export function itensDoCredito(c) {
  const itens = c.itens?.length ? c.itens : [{ desc: c.descricao || 'Crédito', valor: c.valor }]
  const previsto = c.status === 'previsto'
  const sufixo = `${c.origem_lancamento_id || c.origem_agendamento_id ? ` cond. ${ddmm(c.data_origem)}` : ''}${previsto ? ' (previsto)' : ''}`
  return itens.map(i => ({ tipo: 'credito', desc: `${i.desc}${sufixo}`, valor: -r2(i.valor), credito_id: c.id, ...(previsto ? { previsto: true } : {}) }))
}

// Parcela com estes créditos: mantém base/desconto, troca os itens de crédito.
export function composicaoComCreditos(parcela, creditos) {
  const fixos = (parcela.composicao?.itens || []).filter(i => i.tipo !== 'credito')
  const itens = [...fixos, ...creditos.flatMap(itensDoCredito)]
  const total = r2(itens.reduce((a, i) => a + Number(i.valor), 0))
  return { amount: total, composicao: { ...(parcela.composicao || {}), itens, total } }
}

// Previsto → aberto muda o item (texto e marca): entra na comparação.
const idsCredito = (s) => (s.composicao?.itens || []).filter(i => i.tipo === 'credito').map(i => `${i.credito_id}:${i.valor}:${i.previsto ? 'p' : ''}`).sort().join('|')

// Mudanças nas parcelas pendentes para refletir os créditos abertos. Parcela bloqueada (valor à mão
// sem marcar manual) não é tocada. → [{ id, antes, changes }]
export function planoCreditosAluguel(contrato, schedules, creditos) {
  const dist = distribuirCreditos(contrato, schedules, creditos)
  const out = []
  for (const s of aluguelPendentes(contrato, schedules)) {
    if (bloqueiaCredito(s)) continue
    const novo = composicaoComCreditos(s, dist.get(s.id) || [])
    const mudou = idsCredito(s) !== idsCredito({ composicao: novo.composicao }) || r2(s.amount) !== novo.amount
    if (mudou) out.push({ id: s.id, antes: s, changes: novo })
  }
  return out
}

// "Não abater neste mês": o crédito vai para a próxima parcela pendente.
export function adiarCredito(parcela, creditoId) {
  const adiados = [...new Set([...(parcela.composicao?.creditos_adiados || []), creditoId])]
  return { composicao: { ...(parcela.composicao || {}), creditos_adiados: adiados } }
}

// Troca de destino: o adiamento deste crédito na parcela nova sai (senão ele nunca entraria nela).
export function liberarAdiamento(parcela, creditoId) {
  const adiados = (parcela.composicao?.creditos_adiados || []).filter(id => id !== creditoId)
  return { composicao: { ...(parcela.composicao || {}), creditos_adiados: adiados } }
}

// Destino com valor editado à mão: passa a valer como manual, com o valor digitado como base — aí
// o crédito entra por cima dele.
export function marcarValorManual(parcela) {
  const v = r2(parcela.amount)
  return {
    valorStatus: 'confirmado',
    composicao: {
      ...(parcela.composicao || {}),
      itens: [{ tipo: 'mantido', desc: 'Valor informado à mão', valor: v }],
      total: v, manual: true,
    },
  }
}
