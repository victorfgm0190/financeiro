// Resgate ligado × mudança de série da despesa: casamento por OCORRÊNCIA (posição), não por data.
// Reproduz o teste do teste1 (13/11/2026): mensal 3x de 1.000 desde 13/11/2026; despesa 1 paga;
// resgates 1 e 2 pagos; depois "Data de vencimento atual" 13/12 → 20/12 ("esta e as próximas").
// Dados fictícios.
import { describe, it, expect } from 'vitest'
import { criarResgateSeFaltar, sincronizarResgatesVinculados, chaveDoResgate } from './resgateVinculado'
import { perguntaAjusteResgate, txAjusteResgate, valorResgatado, ajustarValorDoResgate } from './ajusteResgate'
import { aplicarBaixa, metaBaixaGerada } from './scheduleBaixa'
import { computeOccurrences } from './occurrences'
import { occEfetiva } from './fluxoCaixa'
import { planoAgendamento, ESCOPO } from './camposSerie'
import { historicoOcorrencias } from './ocorrenciasRegistradas'
import { scheduleDisplayDueDate } from './agendamentosFiltro'
import { rotuloParcela } from './numeroParcela'

const accounts = [
  { id: 'itau', name: 'Banco Exemplo', type: 'checking' },
  { id: 'ca', name: 'Contas Anuais', type: 'savings', isReserva: true },
]
const gerencialGroups = [{ id: 'gCA', number: 2, alias: 'CA', name: 'Contas Anuais', defaultAccountId: 'ca' }]
const reserveFunctions = [{ id: 'fRec', name: 'Receita', accountId: 'ca' }]
const despesa0 = {
  id: 'sch_esc', description: 'ESCOLA EXEMPLO', transactionType: 'expense', accountId: 'itau', accountType: 'checking',
  amount: 1000, frequency: 'monthly', startDate: '2026-11-13', occurrenceType: 'installment', installments: 3,
  grupoGerencial: 'gCA', reservaFuncaoId: 'fRec', registered: [], registeredMeta: {}, skipped: [], overrides: {},
}
const sinc = (d) => sincronizarResgatesVinculados(d)
const R = (d) => d.schedules.find(s => s.agendamentoVinculadoId)
const E = (d) => d.schedules.find(s => s.id === 'sch_esc')
const pend = (s) => computeOccurrences(s, 400)
const mudar = (d, id, f) => sinc({ ...d, schedules: d.schedules.map(s => (s.id === id ? f(s) : s)) })
const avancar = (s) => ({ ...s, nextOccurrence: computeOccurrences(s, 1)[0] ?? null })

function pagarDespesa(d, chave, amount = 1000) {
  const id = `tx_d_${chave}`
  return mudar({ ...d, transactions: [...d.transactions, { id, type: 'expense', accountId: 'itau', amount, date: chave, scheduleId: 'sch_esc', dataOcorrencia: chave }] },
    'sch_esc', s => avancar(aplicarBaixa(s, chave, metaBaixaGerada(id))))
}
function pagarResgate(d, chave, { amount = 1000, date = chave } = {}) {
  const r = R(d)
  const id = `tx_r_${chave}`
  return mudar({ ...d, transactions: [...d.transactions, { id, type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount, date, scheduleId: r.id, dataOcorrencia: chave }] },
    r.id, s => aplicarBaixa(s, chave, metaBaixaGerada(id)))
}
// "Data de vencimento atual" 13/12 → 20/12, "Sim, a esta e às próximas".
const mudarSerie = (d, de = '2026-12-13', para = '2026-12-20') => mudar(d, 'sch_esc', s => planoAgendamento(s, {
  occDate: de, escopo: ESCOPO.PROXIMAS, pendentes: pend(s), proximasDoNovo: x => pend(x),
  mudancas: [{ campo: 'date', de, para }],
}).schedule)
// "Não, só a esta": só a data dessa ocorrência.
const mudarSoEsta = (d, de, para) => mudar(d, 'sch_esc', s => planoAgendamento(s, {
  occDate: de, escopo: ESCOPO.PARCELA, pendentes: pend(s), mudancas: [{ campo: 'date', de, para }],
}).schedule)

// Estado do teste do teste1: despesa 1 paga (1.050); resgate 1 pago (1.050); resgate 2 pago antes.
function cenario() {
  let d = sinc(criarResgateSeFaltar({ accounts, gerencialGroups, reserveFunctions, schedules: [despesa0], transactions: [] }, 'sch_esc'))
  d = pagarDespesa(d, '2026-11-13', 1050)
  d = pagarResgate(d, '2026-11-13', { amount: 1050 })
  d = pagarResgate(d, '2026-12-13', { date: '2026-11-13' })
  return d
}
const transfers = (d) => d.transactions.filter(t => t.type === 'transfer')

describe('mudar a série da despesa com resgates já pagos', () => {
  it('"Sim, a esta e às próximas": os pagos ficam com a data/valor deles; UM pendente, na nova data da 3ª', () => {
    let d = cenario()
    // Antes da mudança: a próxima do resgate é a 3ª (13/01), não a âncora da despesa (13/12).
    expect(R(d).nextOccurrence).toBe('2027-01-13')
    expect(pend(R(d))).toEqual(['2027-01-13'])
    d = mudarSerie(d)
    expect(pend(E(d))).toEqual(['2026-12-20', '2027-01-20'])
    const r = R(d)
    expect(r.registered).toEqual(['2026-11-13', '2026-12-13'])
    expect(pend(r)).toEqual(['2027-01-20'])
    expect(r.nextOccurrence).toBe('2027-01-20')
    expect(transfers(d).map(t => t.amount)).toEqual([1050, 1000])
    // Histórico do resgate: a 2ª continua com vencimento 13/12 (a data dela), nada pulado a mais.
    const h = historicoOcorrencias(r, d.transactions)
    expect(h.linhas.map(l => [l.parcela, l.vencimento, l.status, l.valorPago])).toEqual([[1, '2026-11-13', 'paga', 1050], [2, '2026-12-13', 'paga', 1000]])
    expect(sinc(d)).toBe(d)
  })
  it('o estado gravado com o defeito (âncora/dia copiados da despesa) se corrige sozinho', () => {
    let d = mudarSerie(cenario())
    // Como ficou no teste1: o resgate com a âncora 20/12 e o dia 20 da despesa.
    d = { ...d, schedules: d.schedules.map(s => (s.agendamentoVinculadoId ? { ...s, nextOccurrence: '2026-12-20', overrides: { _resgateDesde: '2026-11-13', _diaVencimento: 20 } } : s)) }
    expect(pend(R(d))).toEqual(['2026-12-20']) // o defeito: pendente na posição da 2ª (já paga)
    d = sinc(d)
    expect(pend(R(d))).toEqual(['2027-01-20'])
    expect(R(d).registered).toEqual(['2026-11-13', '2026-12-13'])
  })
  it('"Não, só a esta": pago não muda; o pendente da mesma ocorrência acompanha a data nova', () => {
    let d = mudarSoEsta(cenario(), '2027-01-13', '2027-01-25')
    expect(R(d).registered).toEqual(['2026-11-13', '2026-12-13'])
    expect(pend(R(d))).toEqual(['2027-01-13'])
    expect(occEfetiva(R(d), '2027-01-13').date).toBe('2027-01-25')
    // Só a esta numa ocorrência cujo resgate já foi pago: o pago fica como está, nada pendente novo.
    d = mudarSoEsta(d, '2026-12-13', '2026-12-18')
    expect(occEfetiva(R(d), '2026-12-13').date).toBe('2026-12-13')
    expect(pend(R(d))).toEqual(['2027-01-13'])
  })
  it('pular a despesa cujo resgate já foi pago: nada muda no pago e não sobra pendente fantasma', () => {
    let d = mudar(cenario(), 'sch_esc', s => ({ ...s, skipped: ['2026-12-13'] }))
    expect(R(d).registered).toEqual(['2026-11-13', '2026-12-13'])
    expect(pend(R(d))).toEqual(['2027-01-13'])
    expect(pend(R(d))).toHaveLength(1)
    // E mudando a série depois do pulo: continua um pendente só, na 3ª.
    d = mudarSerie(d, '2027-01-13', '2027-01-20')
    expect(pend(R(d))).toEqual(['2027-01-20'])
  })
})

describe('complementar/devolução e valor ajustado sobrevivem à mudança de série', () => {
  it('nada se solta nem duplica', () => {
    let d = cenario()
    // Complementar de 30 na 2ª (resgatou 1.000, a despesa da 2ª paga por 1.030).
    const p = perguntaAjusteResgate({ despesaId: 'sch_esc', chave: '2026-12-13', valorPago: 1030, schedules: d.schedules, transactions: d.transactions, accounts, reserveFunctions })
    expect(p).toMatchObject({ tipo: 'complementar', chave: '2026-12-13', diferenca: 30 })
    d = { ...d, transactions: [...d.transactions, { id: 'tx_aj', ...txAjusteResgate(p, { data: '2026-12-13', contaDespesaId: 'itau' }) }] }
    // Valor ajustado na 3ª (pendente): 980.
    d = mudar(d, R(d).id, r => ajustarValorDoResgate(r, E(d), '2027-01-13', 980))
    expect(occEfetiva(R(d), '2027-01-13').amount).toBe(980)
    d = mudarSerie(d)
    const r = R(d)
    expect(valorResgatado(r, '2026-12-13', d.transactions)).toBe(1030)
    expect(pend(r)).toEqual(['2027-01-20'])
    expect(occEfetiva(r, '2027-01-20')).toMatchObject({ date: '2027-01-20', amount: 980 })
    expect(transfers(d)).toHaveLength(3)
    // A pergunta do Pagar casa pela ocorrência: a 2ª da despesa (agora 20/12) é a 2ª do resgate (13/12).
    expect(chaveDoResgate(E(d), r, '2026-12-20')).toBe('2026-12-13')
    expect(perguntaAjusteResgate({ despesaId: 'sch_esc', chave: '2026-12-20', valorPago: 1030, schedules: d.schedules, transactions: d.transactions, accounts, reserveFunctions })).toBeNull()
    expect(perguntaAjusteResgate({ despesaId: 'sch_esc', chave: '2027-01-20', valorPago: 1000, schedules: d.schedules, transactions: d.transactions, accounts, reserveFunctions }))
      .toMatchObject({ tipo: 'ajustar', chave: '2027-01-20', de: 980 })
  })
})

describe('linha da lista: a próxima pendente DO RESGATE', () => {
  it('com 1 e 2 pagas, a linha mostra a 3ª (data e "3/3"), não a âncora da despesa', () => {
    const d = cenario()
    const r = R(d)
    const proxima = computeOccurrences(r, 1)[0]
    expect(proxima).toBe('2027-01-13')
    expect(scheduleDisplayDueDate(r, proxima, computeOccurrences, '2026-11-13')).toBe('2027-01-13')
    expect(rotuloParcela(r, proxima)).toBe('3/3')
  })
})
