// Resgate ligado à despesa de conta com classificação gerencial que gera resgate. Dados fictícios.
import { describe, it, expect } from 'vitest'
import {
  derivarResgate, novoResgateVinculado, sincronizarResgatesVinculados, criarResgateSeFaltar,
  despesaGeraResgate, opcoesResgatarDe, idResgateVinculado, idTxResgate, resumoResgates, provisoesNoMesmoMes,
} from './resgateVinculado'
import { computeOccurrences } from './occurrences'
import { aplicarBaixa, metaBaixaGerada, reabrirBaixasDoLancamento } from './scheduleBaixa'
import { planoAgendamento, ESCOPO } from './camposSerie'
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
// "Pagar" a ocorrência da despesa: lançamento + baixa (o que registerScheduleOccurrence faz).
function pagar(d, chave, { date = chave, amount = 1268, id = `tx_pg_${chave}` } = {}) {
  const tx = { id, type: 'expense', accountId: 'itau', amount, date, scheduleId: 'sch_escola', dataOcorrencia: chave }
  return sinc({
    ...d,
    accounts: d.accounts.map(a => (a.id === 'itau' ? { ...a, balance: a.balance - amount } : a)),
    transactions: [...d.transactions, tx],
    schedules: d.schedules.map(s => (s.id === 'sch_escola' ? aplicarBaixa(s, chave, metaBaixaGerada(id)) : s)),
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
  it('"Resgatar de": só as funções da conta do grupo, na ordem das Reservas', () => {
    expect(opcoesResgatarDe('ca', reserveFunctions).map(f => f.name)).toEqual(['IPVA', 'Escola'])
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

describe('efetivar junto', () => {
  it('pagar a ocorrência efetiva o resgate da mesma ocorrência, com a data e o valor reais do pagamento', () => {
    let d = criado()
    const saldoCa = d.accounts.find(a => a.id === 'ca').balance
    d = pagar(d, '2027-01-08', { date: '2027-01-10', amount: 1300 })
    const r = resgateDe(d)
    expect(r.registered).toEqual(['2027-01-08'])
    const tx = d.transactions.find(t => t.id === idTxResgate(r.id, '2027-01-08'))
    expect(tx).toMatchObject({ type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1300, date: '2027-01-10', reservaFuncaoId: 'fEscola', scheduleId: r.id, dataOcorrencia: '2027-01-08' })
    expect(d.transactions.filter(t => t.parentTxId === tx.id)).toHaveLength(1) // sombra da reserva
    expect(d.accounts.find(a => a.id === 'ca').balance).toBe(saldoCa - 1300)
    expect(pendentes(r)).toEqual(pendentes(despesaDe(d)))
    expect(sinc(d)).toBe(d)
  })
  it('resgate pago à mão antes da despesa: pagar a despesa depois não cria outro', () => {
    let d = criado()
    const r0 = resgateDe(d)
    d = { ...d, transactions: [...d.transactions, { id: 'tx_manual', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1268, date: '2027-01-08', scheduleId: r0.id }],
      schedules: d.schedules.map(s => (s.id === r0.id ? aplicarBaixa(s, '2027-01-08', metaBaixaGerada('tx_manual')) : s)) }
    d = pagar(sinc(d), '2027-01-08')
    expect(d.transactions.filter(t => t.type === 'transfer')).toHaveLength(1)
  })
})

describe('estornar / excluir o lançamento da despesa', () => {
  it('estorna o resgate da mesma ocorrência e reabre as duas', () => {
    let d = pagar(criado(), '2027-01-08')
    const saldoCa = d.accounts.find(a => a.id === 'ca').balance
    d = estornar(d, 'tx_pg_2027-01-08')
    const r = resgateDe(d)
    expect(r.registered).toEqual([])
    expect(d.transactions).toHaveLength(0) // resgate e sombra saíram
    expect(d.accounts.find(a => a.id === 'ca').balance).toBe(saldoCa + 1268)
    expect(pendentes(r)).toHaveLength(12)
    expect(pendentes(r)).toEqual(pendentes(despesaDe(d)))
  })
  it('resgate pago à mão não é desfeito pelo estorno da despesa', () => {
    let d = criado()
    const r0 = resgateDe(d)
    d = sinc({ ...d, transactions: [{ id: 'tx_manual', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1268, date: '2027-01-08', scheduleId: r0.id }],
      schedules: d.schedules.map(s => (s.id === r0.id ? aplicarBaixa(s, '2027-01-08', metaBaixaGerada('tx_manual')) : s)) })
    d = estornar(pagar(d, '2027-01-08'), 'tx_pg_2027-01-08')
    expect(d.transactions.map(t => t.id)).toEqual(['tx_manual'])
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
    expect(r.overrides['2027-04-08']).toEqual({ date: '2027-04-15', amount: 1500 })
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
  it('excluir o agendamento da despesa exclui o do resgate; o resgate já efetivado fica como lançamento', () => {
    let d = pagar(criado(), '2027-01-08')
    d = sinc({ ...d, schedules: d.schedules.filter(s => s.id !== 'sch_escola') })
    expect(d.schedules).toHaveLength(0)
    expect(d.transactions.filter(t => t.type === 'transfer')).toHaveLength(1)
  })
  it('efetivado não é recalculado: mudar o valor da série depois não mexe no lançamento do resgate', () => {
    let d = pagar(criado(), '2027-01-08')
    d = mudarDespesa(d, s => ({ ...s, amount: 2000 }))
    expect(d.transactions.find(t => t.type === 'transfer').amount).toBe(1268)
    expect(resgateDe(d).registered).toEqual(['2027-01-08'])
  })
})

describe('editar "Resgatar de" e a classificação', () => {
  it('trocar a função muda só os resgates pendentes', () => {
    let d = pagar(criado(), '2027-01-08')
    d = mudarDespesa(d, s => ({ ...s, reservaFuncaoId: 'fIpva' }))
    expect(resgateDe(d).reservaFuncaoId).toBe('fIpva')
    expect(d.transactions.find(t => t.type === 'transfer').reservaFuncaoId).toBe('fEscola')
    d = pagar(d, '2027-02-08')
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
    d = pagar(d, '2027-01-08')
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
