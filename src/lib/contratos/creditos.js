// CRÉDITOS DO PROPRIETÁRIO NO ALUGUEL — funções puras.
// Regra (21/10): cada crédito aberto é abatido no PRÓXIMO ALUGUEL AINDA PENDENTE com vencimento
// (efetivo) igual ou posterior à data de origem do crédito (o pagamento do condomínio) — não
// necessariamente o do mês seguinte; aluguel do mês já pago → o seguinte. Desmarcar um crédito
// numa parcela ("não abater neste mês") o empurra para a próxima.
import { occEfetiva } from '../fluxoCaixa.js'
import { ehParcelaGerada, parcelaPaga, valorManual, r2 } from './parcelas.js'

const vencimento = (s) => occEfetiva(s, s.startDate).date

// Aluguéis pendentes do contrato, por vencimento efetivo. Valor editado fora do contrato fica de fora.
export function aluguelPendentes(contrato, schedules) {
  return (schedules || [])
    .filter(s => ehParcelaGerada(s, contrato.id) && s.contratoPapel === 'aluguel' && !parcelaPaga(s) && !(s.skipped || []).includes(s.startDate))
    .filter(s => !valorManual(s) || !!s.composicao?.manual)
    .sort((a, b) => vencimento(a).localeCompare(vencimento(b)))
}

// parcelaId → [créditos] a abater nela.
export function distribuirCreditos(contrato, schedules, creditos) {
  const alugueis = aluguelPendentes(contrato, schedules)
  const out = new Map(alugueis.map(s => [s.id, []]))
  const abertos = (creditos || []).filter(c => c.contrato_id === contrato.id && c.status === 'aberto')
    .sort((a, b) => String(a.data_origem).localeCompare(String(b.data_origem)))
  for (const c of abertos) {
    const alvo = alugueis.find(s => vencimento(s) >= String(c.data_origem || '') && !(s.composicao?.creditos_adiados || []).includes(c.id))
    if (alvo) out.get(alvo.id).push(c)
  }
  return out
}

const ddmm = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '')

// Um item por item de origem: "Fundo de Reserva cond. 05/12 −79,10".
export function itensDoCredito(c) {
  const itens = c.itens?.length ? c.itens : [{ desc: c.descricao || 'Crédito do proprietário', valor: c.valor }]
  return itens.map(i => ({ tipo: 'credito', desc: `${i.desc} cond. ${ddmm(c.data_origem)}`, valor: -r2(i.valor), credito_id: c.id }))
}

// Parcela de aluguel com estes créditos: mantém base/bonificação, troca os itens de crédito.
export function composicaoComCreditos(parcela, creditos) {
  const fixos = (parcela.composicao?.itens || []).filter(i => i.tipo !== 'credito')
  const itens = [...fixos, ...creditos.flatMap(itensDoCredito)]
  const total = r2(itens.reduce((a, i) => a + Number(i.valor), 0))
  return { amount: total, composicao: { ...(parcela.composicao || {}), itens, total } }
}

const idsCredito = (s) => (s.composicao?.itens || []).filter(i => i.tipo === 'credito').map(i => `${i.credito_id}:${i.valor}`).sort().join('|')

// Mudanças nas parcelas de aluguel pendentes para refletir os créditos abertos. → [{ id, antes, changes }]
export function planoCreditosAluguel(contrato, schedules, creditos) {
  const dist = distribuirCreditos(contrato, schedules, creditos)
  const out = []
  for (const s of aluguelPendentes(contrato, schedules)) {
    const novo = composicaoComCreditos(s, dist.get(s.id) || [])
    const mudou = idsCredito(s) !== idsCredito({ composicao: novo.composicao }) || r2(s.amount) !== novo.amount
    if (mudou) out.push({ id: s.id, antes: s, changes: novo })
  }
  return out
}

// "Não abater neste mês": o crédito vai para o próximo aluguel pendente.
export function adiarCredito(parcela, creditoId) {
  const adiados = [...new Set([...(parcela.composicao?.creditos_adiados || []), creditoId])]
  return { composicao: { ...(parcela.composicao || {}), creditos_adiados: adiados } }
}
