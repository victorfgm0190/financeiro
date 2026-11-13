// Resgate ligado à despesa de conta com classificação gerencial que gera resgate. Dados fictícios.
import { describe, it, expect } from 'vitest'
import {
  excluirOcorrenciaDoResgate, mudarDataDoResgate, candidatosResgateFeito, resgatePrimeiro, ehDoResgateLigado,
  derivarResgate, novoResgateVinculado, sincronizarResgatesVinculados, criarResgateSeFaltar,
  despesaGeraResgate, opcoesResgatarDe, idResgateVinculado, idTxResgate, resumoResgates, provisoesNoMesmoMes,
} from './resgateVinculado'
import { computeOccurrences } from './occurrences'
import { aplicarBaixa, metaBaixaGerada, reabrirBaixasDoLancamento } from './scheduleBaixa'
import { planoAgendamento, ESCOPO } from './camposSerie'
import { planejarVinculo, planejarDesvinculo } from './vinculo'
import { occEfetiva } from './fluxoCaixa'
import { previsoesDasFuncoes } from './previsaoReserva'
import { indexarReserva, saldoDaFuncao } from './saldoReserva'

const accounts = [
  { id: 'itau', name: 'Banco Exemplo', type: 'checking', balance: 10000 },
  { id: 'ca', name: 'Contas Anuais', type: 'savings', isReserva: true, balance: 50000 },
  { id: 'imp', name: 'Imperium', type: 'savings', balance: 1000 },
  { id: 'cartao', name: 'Cartão X', type: 'credit', closingDay: 5, dueDay: 12 },
]
const gerencialGroups = [
  { id: 'gG', number: 1, alias: 'G', name: 'Gerencial' },
  { id: 'gCA', number: 2, alias: 'CA', name: 'Contas Anuais', defaultAccountId: 'ca' },
  { id: 'gImp', number: 4, alias: 'Impr', name: 'Imperium', defaultAccountId: 'imp' },
  { id: 'gD', number: 'D', alias: 'D', name: 'Despesa' },
]
const reserveFunctions = [
  { id: 'fEscola', name: 'Escola', accountId: 'ca', ordem: 2 },
  { id: 'fIpva', name: 'IPVA', accountId: 'ca', ordem: 1 },
]
const despesa = (extra = {}) => ({
  id: 'sch_escola', description: 'ESCOLA EXEMPLO 2027', transactionType: 'expense', accountId: 'itau', accountType: 'checking',
  amount: 1268, frequency: 'monthly', startDate: '2027-01-08', occurrenceType: 'installment', installments: 12,
  grupoGerencial: 'gCA', reservaFuncaoId: 'fEscola', registered: [], registeredMeta: {}, skipped: [], overrides: {}, ...extra,
})
const estado = (schedules, extra = {}) => ({ accounts, gerencialGroups, reserveFunctions, schedules, transactions: [], ...extra })
const efeitoTransferencia = (accs, tx, dir = 1) => accs.map(a => {
  if (a.id === tx.accountId) return { ...a, balance: a.balance - dir * tx.amount }
  if (a.id === tx.toAccountId) return { ...a, balance: a.balance + dir * tx.amount }
  return a
})
const sombras = (tx) => [{ id: 'x', type: 'income', accountId: null, amount: tx.amount, reservaAuto: true, description: 'Resgate Reserva: CA', date: tx.date }]
const sinc = (d) => sincronizarResgatesVinculados(d, { efeitoTransferencia, sombras, agora: () => '2027-01-01T00:00:00Z' })
const criado = (desp = despesa()) => sinc(criarResgateSeFaltar(estado([desp]), desp.id))
const resgateDe = (d) => d.schedules.find(s => s.agendamentoVinculadoId)
const despesaDe = (d) => d.schedules.find(s => s.id === 'sch_escola')
const pendentes = (s, n = 400) => computeOccurrences(s, n)
// "Pagar" a ocorrência da despesa: lançamento + baixa e a âncora avança para a próxima pendente
// (o que registerScheduleOccurrence faz).
function pagar(d, chave, { date = chave, amount = 1268, id = `tx_pg_${chave}` } = {}) {
  const tx = { id, type: 'expense', accountId: 'itau', amount, date, scheduleId: 'sch_escola', dataOcorrencia: chave }
  const baixar = (s) => { const b = aplicarBaixa(s, chave, metaBaixaGerada(id)); return { ...b, nextOccurrence: computeOccurrences(b, 1)[0] ?? null } }
  return sinc({
    ...d,
    accounts: d.accounts.map(a => (a.id === 'itau' ? { ...a, balance: a.balance - amount } : a)),
    transactions: [...d.transactions, tx],
    schedules: d.schedules.map(s => (s.id === 'sch_escola' ? baixar(s) : s)),
  })
}
// Estornar / excluir o lançamento da despesa (reabre a ocorrência, como deleteTransaction/reverseTransaction).
function estornar(d, txId) {
  const tx = d.transactions.find(t => t.id === txId)
  return sinc({
    ...d,
    accounts: d.accounts.map(a => (a.id === 'itau' ? { ...a, balance: a.balance + tx.amount } : a)),
    transactions: d.transactions.filter(t => t.id !== txId),
    schedules: reabrirBaixasDoLancamento(d.schedules, tx),
  })
}
// "Pagar" a ocorrência do RESGATE (linha dele): transferência da reserva + baixa no resgate.
function pagarResgate(d, chave, { date = chave, amount = 1268, id = `tx_rs_${chave}` } = {}) {
  const r = resgateDe(d)
  const tx = { id, type: 'transfer', accountId: r.accountId, toAccountId: r.toAccountId, amount, date, scheduleId: r.id, dataOcorrencia: chave, reservaFuncaoId: r.reservaFuncaoId }
  return sinc({
    ...d,
    accounts: efeitoTransferencia(d.accounts, tx, 1),
    transactions: [...d.transactions, tx],
    schedules: d.schedules.map(s => (s.id === r.id ? aplicarBaixa(s, chave, metaBaixaGerada(id)) : s)),
  })
}
// Estornar / excluir o lançamento do resgate (reabre a ocorrência do resgate).
function estornarResgate(d, txId) {
  const tx = d.transactions.find(t => t.id === txId)
  return sinc({
    ...d,
    accounts: efeitoTransferencia(d.accounts, tx, -1),
    transactions: d.transactions.filter(t => t.id !== txId),
    schedules: reabrirBaixasDoLancamento(d.schedules, tx),
  })
}
const transfers = (d) => d.transactions.filter(t => t.type === 'transfer')
const saldoDe = (d, id) => d.accounts.find(a => a.id === id).balance
const mudarDespesa = (d, f) => sinc({ ...d, schedules: d.schedules.map(s => (s.id === 'sch_escola' ? f(s) : s)) })

describe('quem gera resgate e de onde', () => {
  it('despesa em conta com grupo numerado com conta padrão gera; G, D, sem grupo e cartão não', () => {
    const ctx = { accounts, gerencialGroups }
    expect(despesaGeraResgate(despesa(), ctx)?.conta.id).toBe('ca')
    expect(despesaGeraResgate(despesa({ grupoGerencial: 'gImp' }), ctx)?.conta.id).toBe('imp')
    expect(despesaGeraResgate(despesa({ grupoGerencial: 'gG' }), ctx)).toBeNull()
    expect(despesaGeraResgate(despesa({ grupoGerencial: 'gD' }), ctx)).toBeNull()
    expect(despesaGeraResgate(despesa({ grupoGerencial: null }), ctx)).toBeNull()
    expect(despesaGeraResgate(despesa({ accountId: 'cartao' }), ctx)).toBeNull()
  })
  it('"Resgatar de": só as funções da conta do grupo, em ordem alfabética pt-BR (sem acento/maiúscula)', () => {
    expect(opcoesResgatarDe('ca', reserveFunctions).map(f => f.name)).toEqual(['Escola', 'IPVA'])
    const mais = [...reserveFunctions, { id: 'f3', name: 'óleo', accountId: 'ca' }, { id: 'f4', name: 'Academia', accountId: 'ca' }, { id: 'f5', name: 'Oficina', accountId: 'ca' }]
    expect(opcoesResgatarDe('ca', mais).map(f => f.name)).toEqual(['Academia', 'Escola', 'IPVA', 'Oficina', 'óleo'])
    expect(opcoesResgatarDe('imp', reserveFunctions)).toEqual([])
  })
})

describe('criar', () => {
  it('mensal 12x → 12 resgates com a mesma data e o mesmo valor, da conta do grupo para a conta da despesa', () => {
    const d = criado()
    const r = resgateDe(d)
    expect(r).toMatchObject({ id: idResgateVinculado('sch_escola'), tipo: 'resgate_reserva', transactionType: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1268, reservaFuncaoId: 'fEscola', autoRegister: false })
    expect(pendentes(r)).toEqual(pendentes(despesaDe(d)))
    expect(pendentes(r)).toHaveLength(12)
    expect(r.description).toBe('Resgate Contas Anuais › Escola — ESCOLA EXEMPLO 2027')
  })
  it('idempotente: criar de novo e sincronizar de novo não muda nada', () => {
    const d = criado()
    expect(criarResgateSeFaltar(d, 'sch_escola')).toBe(d)
    expect(sinc(d)).toBe(d)
  })
  it('agendamento ANTIGO: resgate só das pendentes, nenhum retroativo', () => {
    let desp = despesa()
    desp = aplicarBaixa(aplicarBaixa(desp, '2027-01-08', metaBaixaGerada('tx_a')), '2027-02-08', metaBaixaGerada('tx_b'))
    const d = sinc(criarResgateSeFaltar(estado([desp], { transactions: [
      { id: 'tx_a', type: 'expense', amount: 1268, date: '2027-01-08', scheduleId: 'sch_escola' },
      { id: 'tx_b', type: 'expense', amount: 1268, date: '2027-02-08', scheduleId: 'sch_escola' },
    ] }), 'sch_escola'))
    const r = resgateDe(d)
    expect(r.registered).toEqual([])
    expect(pendentes(r)).toEqual(pendentes(despesaDe(d)))
    expect(pendentes(r)).toHaveLength(10)
    expect(d.transactions.filter(t => t.scheduleId === r.id)).toHaveLength(0)
  })
  it('sem pendentes (tudo pago) → não cria', () => {
    let desp = despesa({ frequency: 'once', occurrenceType: 'continuous' })
    desp = aplicarBaixa(desp, '2027-01-08', metaBaixaGerada('tx_a'))
    const d0 = estado([desp])
    expect(criarResgateSeFaltar(d0, 'sch_escola')).toBe(d0)
  })
})

describe('pagamento separado (regra de 13/11/2026)', () => {
  it('pagar a despesa grava só a despesa: o resgate da mesma ocorrência fica pendente; saldos só da despesa', () => {
    let d = criado()
    const ca0 = saldoDe(d, 'ca')
    const itau0 = saldoDe(d, 'itau')
    d = pagar(d, '2027-01-08', { date: '2027-01-10', amount: 1300 })
    const r = resgateDe(d)
    expect(r.registered).toEqual([])
    expect(pendentes(r)[0]).toBe('2027-01-08')
    // A âncora da despesa avançou; a série do resgate continua com as 12 (sem parcela a mais).
    expect(despesaDe(d).nextOccurrence).toBe('2027-02-08')
    expect(pendentes(r)).toHaveLength(12)
    expect(pendentes(r).at(-1)).toBe('2027-12-08')
    expect(transfers(d)).toHaveLength(0)
    expect(saldoDe(d, 'ca')).toBe(ca0)
    expect(saldoDe(d, 'itau')).toBe(itau0 - 1300)
    expect(sinc(d)).toBe(d)
  })
  it('pagar depois o resgate: transferência única com o valor pago; a despesa não muda', () => {
    let d = pagar(criado(), '2027-01-08', { amount: 1300 })
    const ca0 = saldoDe(d, 'ca')
    const despAntes = despesaDe(d)
    d = pagarResgate(d, '2027-01-08', { amount: 1300 })
    expect(transfers(d)).toHaveLength(1)
    expect(transfers(d)[0]).toMatchObject({ accountId: 'ca', toAccountId: 'itau', amount: 1300, reservaFuncaoId: 'fEscola' })
    expect(resgateDe(d).registered).toEqual(['2027-01-08'])
    expect(saldoDe(d, 'ca')).toBe(ca0 - 1300)
    expect(despesaDe(d)).toBe(despAntes)
    expect(sinc(d)).toBe(d)
  })
  it('pagar o resgate ANTES da despesa: a despesa continua pendente; pagar a despesa depois não cria outro', () => {
    let d = pagarResgate(criado(), '2027-01-08')
    expect(despesaDe(d).registered).toEqual([])
    expect(pendentes(despesaDe(d))[0]).toBe('2027-01-08')
    d = pagar(d, '2027-01-08')
    expect(transfers(d)).toHaveLength(1)
  })
})

describe('estornar um não mexe no outro', () => {
  it('estornar a despesa não mexe no resgate pago', () => {
    let d = pagarResgate(pagar(criado(), '2027-01-08'), '2027-01-08')
    const ca0 = saldoDe(d, 'ca')
    d = estornar(d, 'tx_pg_2027-01-08')
    expect(despesaDe(d).registered).toEqual([])
    expect(resgateDe(d).registered).toEqual(['2027-01-08'])
    expect(transfers(d).map(t => t.id)).toEqual(['tx_rs_2027-01-08'])
    expect(saldoDe(d, 'ca')).toBe(ca0)
  })
  it('estornar o resgate não mexe na despesa paga', () => {
    let d = pagarResgate(pagar(criado(), '2027-01-08'), '2027-01-08')
    d = estornarResgate(d, 'tx_rs_2027-01-08')
    expect(resgateDe(d).registered).toEqual([])
    expect(pendentes(resgateDe(d))[0]).toBe('2027-01-08')
    expect(despesaDe(d).registered).toEqual(['2027-01-08'])
    expect(d.transactions.map(t => t.id)).toEqual(['tx_pg_2027-01-08'])
  })
})

describe('pular, mudar data/valor, encurtar, excluir', () => {
  it('pular uma ocorrência pula o resgate dela; desfazer o pulo volta', () => {
    let d = mudarDespesa(criado(), s => ({ ...s, skipped: ['2027-03-08'] }))
    expect(pendentes(resgateDe(d))).not.toContain('2027-03-08')
    expect(pendentes(resgateDe(d))).toEqual(pendentes(despesaDe(d)))
    d = mudarDespesa(d, s => ({ ...s, skipped: [] }))
    expect(pendentes(resgateDe(d))).toContain('2027-03-08')
  })
  it('só esta: data e valor de UMA ocorrência', () => {
    const d = mudarDespesa(criado(), s => planoAgendamento(s, {
      occDate: '2027-04-08', escopo: ESCOPO.PARCELA, pendentes: pendentes(s),
      mudancas: [{ campo: 'date', de: '2027-04-08', para: '2027-04-15' }, { campo: 'amount', de: 1268, para: 1500 }],
    }).schedule)
    const r = resgateDe(d)
    expect(r.overrides['2027-04-08']).toMatchObject({ date: '2027-04-15', amount: 1500 })
    const prev = previsoesDasFuncoes(reserveFunctions, { accounts, schedules: d.schedules, getNextOccurrences: computeOccurrences }, { ini: '2027-04-01', fim: '2027-04-30' })
    expect(prev.fEscola).toEqual([expect.objectContaining({ tipo: 'resgate', date: '2027-04-15', amount: 1500 })])
  })
  it('esta e as próximas: valor e dia da série a partir da ocorrência', () => {
    const d = mudarDespesa(criado(), s => planoAgendamento(s, {
      occDate: '2027-01-08', escopo: ESCOPO.PROXIMAS, pendentes: pendentes(s), proximasDoNovo: x => pendentes(x),
      mudancas: [{ campo: 'amount', de: 1268, para: 1400 }, { campo: 'date', de: '2027-01-08', para: '2027-01-12' }],
    }).schedule)
    const r = resgateDe(d)
    expect(r.amount).toBe(1400)
    expect(pendentes(r)).toEqual(pendentes(despesaDe(d)))
    expect(pendentes(r)[1]).toBe('2027-02-12')
  })
  it('encurtar a série (esta e as seguintes saem) e mudar a série inteira', () => {
    let d = mudarDespesa(criado(), s => ({ ...s, installments: 6 }))
    expect(pendentes(resgateDe(d))).toHaveLength(6)
    d = mudarDespesa(d, s => ({ ...s, amount: 999, startDate: '2027-01-20' }))
    expect(resgateDe(d)).toMatchObject({ amount: 999, startDate: '2027-01-20' })
    expect(pendentes(resgateDe(d))).toEqual(pendentes(despesaDe(d)))
  })
  it('excluir o agendamento da despesa exclui o do resgate; o resgate já pago fica como lançamento', () => {
    let d = pagarResgate(criado(), '2027-01-08')
    d = sinc({ ...d, schedules: d.schedules.filter(s => s.id !== 'sch_escola') })
    expect(d.schedules).toHaveLength(0)
    expect(d.transactions.filter(t => t.type === 'transfer')).toHaveLength(1)
  })
  it('resgate pago não é recalculado: mudar valor/data da despesa ou PULAR a despesa não mexe nele', () => {
    let d = pagarResgate(criado(), '2027-01-08')
    d = mudarDespesa(d, s => ({ ...s, amount: 2000, overrides: { '2027-01-08': { date: '2027-01-20' } } }))
    expect(transfers(d)[0]).toMatchObject({ amount: 1268, date: '2027-01-08' })
    expect(resgateDe(d).registered).toEqual(['2027-01-08'])
    expect(resgateDe(d).overrides['2027-01-08']).toBeUndefined()
    // Pular a despesa daquela ocorrência: a despesa fica pulada, o resgate continua pago.
    d = mudarDespesa(d, s => ({ ...s, skipped: ['2027-01-08'] }))
    expect(resgateDe(d).registered).toEqual(['2027-01-08'])
    expect(resgateDe(d).skipped).not.toContain('2027-01-08')
    expect(transfers(d)).toHaveLength(1)
    expect(pendentes(resgateDe(d))).toEqual(pendentes(despesaDe(d)))
  })
  it('mudar data, pular e excluir a despesa levam o resgate PENDENTE (mesmo com a despesa já paga)', () => {
    let d = pagar(criado(), '2027-01-08')
    d = mudarDespesa(d, s => ({ ...s, overrides: { '2027-02-08': { date: '2027-02-15' } }, skipped: ['2027-03-08'] }))
    expect(occEfetiva(resgateDe(d), '2027-02-08').date).toBe('2027-02-15')
    expect(pendentes(resgateDe(d))).not.toContain('2027-03-08')
    expect(pendentes(resgateDe(d))).toContain('2027-01-08')
    d = sinc({ ...d, schedules: d.schedules.filter(s => s.id !== 'sch_escola') })
    expect(resgateDe(d)).toBeUndefined()
  })
})

describe('editar "Resgatar de" e a classificação', () => {
  it('trocar a função muda só os resgates pendentes', () => {
    let d = pagarResgate(criado(), '2027-01-08')
    d = mudarDespesa(d, s => ({ ...s, reservaFuncaoId: 'fIpva' }))
    expect(resgateDe(d).reservaFuncaoId).toBe('fIpva')
    expect(d.transactions.find(t => t.type === 'transfer').reservaFuncaoId).toBe('fEscola')
    d = pagarResgate(d, '2027-02-08')
    expect(d.transactions.find(t => t.dataOcorrencia === '2027-02-08' && t.type === 'transfer').reservaFuncaoId).toBe('fIpva')
  })
  it('trocar o grupo para G, D ou nenhum apaga os pendentes', () => {
    for (const g of ['gG', 'gD', null]) {
      const d = mudarDespesa(criado(), s => ({ ...s, grupoGerencial: g }))
      expect(resgateDe(d)).toBeUndefined()
    }
  })
  it('trocar a conta para cartão: o resgate ligado sai (o motor do cartão assume — nada em dobro)', () => {
    const d = mudarDespesa(criado(), s => ({ ...s, accountId: 'cartao', accountType: 'credit' }))
    expect(resgateDe(d)).toBeUndefined()
  })
  it('trocar para Imperium (sem funções): resgate de Imperium, sem função', () => {
    const d = mudarDespesa(criado(), s => ({ ...s, grupoGerencial: 'gImp' }))
    expect(resgateDe(d)).toMatchObject({ accountId: 'imp', reservaFuncaoId: null })
  })
  it('só esta com outro grupo: aquela ocorrência fica sem resgate', () => {
    const d = mudarDespesa(criado(), s => ({ ...s, overrides: { '2027-05-08': { grupoGerencial: 'gD' } } }))
    expect(pendentes(resgateDe(d))).not.toContain('2027-05-08')
    expect(pendentes(resgateDe(d))).toHaveLength(11)
  })
})

describe('nada em dobro', () => {
  it('reserva: cada ocorrência sai UMA vez da função (previsto) e o efetivado conta uma vez no saldo', () => {
    let d = criado()
    const prev = previsoesDasFuncoes(reserveFunctions, { accounts, schedules: d.schedules, getNextOccurrences: computeOccurrences }, { ini: '2027-01-01', fim: '2027-12-31' })
    expect(prev.fEscola.filter(i => i.tipo === 'resgate')).toHaveLength(12)
    expect(prev.fEscola.filter(i => i.tipo === 'provisao')).toHaveLength(0)
    d = pagarResgate(pagar(d, '2027-01-08'), '2027-01-08')
    const idx = indexarReserva({ transactions: d.transactions })
    expect(saldoDaFuncao({ id: 'fEscola', accountId: 'ca', saldoInicial: 5000 }, '2027-12-31', idx).saldo).toBe(5000 - 1268)
  })
  it('fluxo da conta: despesa e resgate na mesma data e valor (líquido zero)', () => {
    const d = criado()
    const r = resgateDe(d)
    const desp = despesaDe(d)
    for (const k of pendentes(desp)) expect(computeOccurrences(r, 400)).toContain(k)
    expect(r.toAccountId).toBe(desp.accountId)
    expect(r.amount).toBe(desp.amount)
  })
  it('o motor do cartão não enxerga o resgate ligado (sem cartão)', () => {
    const r = resgateDe(criado())
    expect(r.cardId).toBeNull()
    expect(r.faturaMesAno).toBeNull()
  })
})

describe('frase e aviso de provisão', () => {
  it('N resgates (série com fim) ou sem fim', () => {
    expect(resumoResgates(despesa())).toEqual({ continua: false, n: 12 })
    expect(resumoResgates(despesa({ occurrenceType: 'continuous' }))).toEqual({ continua: true, n: null })
  })
  it('provisão aberta da mesma função no mesmo mês', () => {
    const prov = { id: 'p1', isProvisao: true, provisaoEfetivada: false, reservaFuncaoId: 'fEscola', frequency: 'annual', startDate: '2027-01-26', transactionType: 'expense', amount: 1300, registered: [], skipped: [], overrides: {} }
    const outra = { ...prov, id: 'p2', reservaFuncaoId: 'fIpva' }
    const r = provisoesNoMesmoMes(despesa(), 'fEscola', [prov, outra])
    expect(r).toEqual([{ provisao: prov, mes: '2027-01' }])
    expect(provisoesNoMesmoMes(despesa(), 'fEscola', [{ ...prov, provisaoEfetivada: true }])).toEqual([])
  })
})

describe('ambiente sem a coluna nova', () => {
  it('sem resgate ligado o sincronizador devolve o mesmo estado', () => {
    const d = estado([despesa()])
    expect(sinc(d)).toBe(d)
  })
})

it('derivar sem resgate antigo devolve null para despesa que não gera', () => {
  expect(derivarResgate(despesa({ grupoGerencial: 'gD' }), null, { accounts, gerencialGroups, reserveFunctions })).toBeNull()
  expect(novoResgateVinculado(despesa(), { accounts, gerencialGroups, reserveFunctions }).overrides._resgateDesde).toBe('2027-01-08')
})

const mudarResgate = (d, f) => sinc({ ...d, schedules: d.schedules.map(s => (s.agendamentoVinculadoId ? f(s) : s)) })

describe('mexer só no resgate (a despesa continua mandando)', () => {
  it('excluir UMA ocorrência do resgate: some só nele; mudar/pagar a despesa não a traz de volta', () => {
    let d = mudarResgate(criado(), r => excluirOcorrenciaDoResgate(r, '2027-03-08'))
    expect(pendentes(resgateDe(d))).not.toContain('2027-03-08')
    expect(pendentes(despesaDe(d))).toContain('2027-03-08')
    d = mudarDespesa(d, s => ({ ...s, amount: 1300 }))
    expect(pendentes(resgateDe(d))).not.toContain('2027-03-08')
    d = pagar(d, '2027-03-08')
    expect(transfers(d)).toHaveLength(0)
    expect(pendentes(resgateDe(d))).not.toContain('2027-03-08')
    expect(sinc(d)).toBe(d)
  })
  it('excluir o resgate inteiro (marca na despesa): salvar a despesa não o recria', () => {
    const d = criado()
    const semResgate = { ...d, schedules: d.schedules.filter(s => !s.agendamentoVinculadoId).map(s => ({ ...s, overrides: { ...s.overrides, _resgateExcluido: true } })) }
    expect(criarResgateSeFaltar(semResgate, 'sch_escola')).toBe(semResgate)
  })
  it('mudar a data do resgate vale; depois mudar a data da despesa → vale a da despesa', () => {
    let d = mudarResgate(criado(), r => mudarDataDoResgate(r, despesaDe(criado()), '2027-02-08', '2027-02-05'))
    expect(occEfetiva(resgateDe(d), '2027-02-08').date).toBe('2027-02-05')
    expect(occEfetiva(despesaDe(d), '2027-02-08').date).toBe('2027-02-08')
    d = mudarDespesa(d, s => ({ ...s, amount: 1290 })) // outra mudança na despesa: a data do resgate fica
    expect(occEfetiva(resgateDe(d), '2027-02-08').date).toBe('2027-02-05')
    d = mudarDespesa(d, s => ({ ...s, overrides: { ...s.overrides, '2027-02-08': { date: '2027-02-12' } } }))
    expect(occEfetiva(resgateDe(d), '2027-02-08').date).toBe('2027-02-12')
  })
  it('pular a despesa pula o resgate mesmo com data mudada à mão', () => {
    let d = mudarResgate(criado(), r => mudarDataDoResgate(r, despesaDe(criado()), '2027-02-08', '2027-02-05'))
    d = mudarDespesa(d, s => ({ ...s, skipped: ['2027-02-08'] }))
    expect(pendentes(resgateDe(d))).not.toContain('2027-02-08')
  })
})

describe('vincular a um resgate já feito', () => {
  const feito = { id: 'tx_feito', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1268, date: '2027-01-06', reservaFuncaoId: 'fEscola' }
  const outro = { id: 'tx_outro', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 900, date: '2027-01-08' }
  const longe = { id: 'tx_longe', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1268, date: '2027-03-01' }
  it('candidatos: só transferências da reserva para a conta, sem vínculo, ±15 dias; mesmo valor primeiro', () => {
    const d = { ...criado(), transactions: [outro, feito, longe] }
    const c = candidatosResgateFeito(resgateDe(d), '2027-01-08', d)
    expect(c.map(x => x.tx.id)).toEqual(['tx_feito', 'tx_outro'])
  })
  it('vincular: paga com aquele lançamento; pagar a despesa NÃO cria outro; saldos certos; desvincular volta a pendente', () => {
    let d = { ...criado(), transactions: [feito] }
    const r = resgateDe(d)
    const plano = planejarVinculo(d, { txId: 'tx_feito', scheduleId: r.id, data: '2027-01-08', manter: 'agendamento' })
    expect(plano.ok).toBe(true)
    d = sinc({ ...d, schedules: d.schedules.map(s => (s.id === r.id ? plano.schedule : s)) })
    expect(resgateDe(d).registered).toEqual(['2027-01-08'])
    const ca0 = d.accounts.find(a => a.id === 'ca').balance
    const itau0 = d.accounts.find(a => a.id === 'itau').balance
    d = pagar(d, '2027-01-08')
    expect(d.transactions.filter(t => t.type === 'transfer').map(t => t.id)).toEqual(['tx_feito'])
    expect(d.accounts.find(a => a.id === 'ca').balance).toBe(ca0)
    expect(d.accounts.find(a => a.id === 'itau').balance).toBe(itau0 - 1268)
    // Desvincular com a despesa já paga: o resgate volta a pendente (nada é gerado sozinho).
    const des = planejarDesvinculo(d, { scheduleId: r.id, data: '2027-01-08' })
    d = sinc({ ...d, schedules: d.schedules.map(s => (s.id === r.id ? des.schedule : s)) })
    expect(transfers(d).map(t => t.id)).toEqual(['tx_feito'])
    expect(resgateDe(d).registered).toEqual([])
    expect(pendentes(resgateDe(d))).toContain('2027-01-08')
  })
  it('desvincular antes de pagar: volta a pendente', () => {
    let d = { ...criado(), transactions: [feito] }
    const r = resgateDe(d)
    d = sinc({ ...d, schedules: d.schedules.map(s => (s.id === r.id ? planejarVinculo(d, { txId: 'tx_feito', scheduleId: r.id, data: '2027-01-08', manter: 'agendamento' }).schedule : s)) })
    const des = planejarDesvinculo(d, { scheduleId: r.id, data: '2027-01-08' })
    d = sinc({ ...d, schedules: d.schedules.map(s => (s.id === r.id ? des.schedule : s)) })
    expect(resgateDe(d).registered).toEqual([])
    expect(pendentes(resgateDe(d))).toContain('2027-01-08')
  })
})

describe('ordem no mesmo dia: resgate antes da despesa', () => {
  it('resgatePrimeiro reconhece agendamento, linha projetada e lançamento do resgate', () => {
    const r = resgateDe(criado())
    expect(ehDoResgateLigado(r)).toBe(true)
    expect(ehDoResgateLigado({ _key: `${r.id}_2027-01-08`, _scheduleId: r.id })).toBe(true)
    expect(ehDoResgateLigado({ id: idTxResgate(r.id, '2027-01-08') })).toBe(true)
    expect(ehDoResgateLigado({ id: 'tx_123', scheduleId: r.id })).toBe(true) // lançamento do Pagar na linha do resgate
    expect(ehDoResgateLigado({ _key: 'sch_escola_2027-01-08', _scheduleId: 'sch_escola' })).toBe(false)
    const lista = [{ id: 'despesa', _scheduleId: 'sch_escola' }, { id: 'resgate', _scheduleId: r.id }]
    expect(lista.sort(resgatePrimeiro).map(x => x.id)).toEqual(['resgate', 'despesa'])
  })
})
