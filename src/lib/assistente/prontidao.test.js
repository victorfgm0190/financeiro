import { describe, it, expect } from 'vitest'
import {
  sugerirAcaoDespesa, ACAO, parcelaAtualDoTexto, numeroContratoDoTexto, naturezaDoDocumento, pediuAgendar,
  primeiraOcorrencia, vezesAte, contratoNoHistorico,
} from './prontidao'

const HOJE = '2026-11-12'
const sug = (o) => sugerirAcaoDespesa({ hoje: HOJE, ...o })

describe('leituras do texto', () => {
  it('parcela de algo que já existe', () => {
    expect(parcelaAtualDoTexto('Compra aprovada SEGURO X parcela 10/12')).toEqual({ numero: 10, total: 12 })
    expect(parcelaAtualDoTexto('boleto parcela 3 de 10')).toEqual({ numero: 3, total: 10 })
    expect(parcelaAtualDoTexto('IPVA cota 2/3')).toEqual({ numero: 2, total: 3 })
    expect(parcelaAtualDoTexto('3ª parcela de 10')).toEqual({ numero: 3, total: 10 })
    expect(parcelaAtualDoTexto('compra em 12x')).toBeNull()
    expect(parcelaAtualDoTexto('dia 10/12 às 10:22')).toBeNull()
  })
  it('número de contrato e variações', () => {
    expect(numeroContratoDoTexto('Boleto ... Contrato nº 12345 vencimento')).toBe('12345')
    expect(numeroContratoDoTexto('Nº do contrato: AB-778/2026')).toBe('AB-778/2026')
    expect(numeroContratoDoTexto('cód. contrato 998877')).toBe('998877')
    expect(numeroContratoDoTexto('contrato de locação residencial')).toBeNull()
  })
  it('natureza do documento e pedido explícito de agendar', () => {
    expect(naturezaDoDocumento({ tipoDocumento: { sigla: 'NF', nome: 'Nota fiscal' } })).toBe('nota_fiscal')
    expect(naturezaDoDocumento({ texto: 'CUPOM FISCAL ELETRONICO - SAT' })).toBe('cupom')
    expect(pediuAgendar('despesa de energia 250 e agende todo dia 10')).toBe(true)
    expect(pediuAgendar('despesa de internet 120 na conta X')).toBe(false)
  })
})

describe('sugerirAcaoDespesa', () => {
  it('13) foto de cupom fiscal → Só despesa, tipo Cupom', () => {
    const r = sug({ natureza: 'cupom', descricao: 'Posto Ipiranga' })
    expect(r).toMatchObject({ acaoSugerida: ACAO.SO_DESPESA, natureza: 'cupom' })
    expect(r.motivo).toMatch(/Cupom/)
  })
  it('14) NF de compra → Só despesa, tipo NF', () => {
    expect(sug({ natureza: 'nota_fiscal', descricao: 'Magazine' })).toMatchObject({ acaoSugerida: ACAO.SO_DESPESA, natureza: 'nota_fiscal' })
  })
  it('15) boleto com contrato e vencimento futuro → pergunta do contrato, Só agendamento, Mensal, nº preenchido', () => {
    const r = sug({ natureza: 'boleto', texto: 'Boleto Financeira Y Contrato nº 12345', vencimento: '2026-12-10', pago: false })
    expect(r).toMatchObject({ acaoSugerida: ACAO.SO_AGENDAMENTO, recorrenciaSugerida: 'monthly', numeroContrato: '12345' })
    expect(r.pergunta).toBe('Esse boleto tem o contrato nº 12345 — parece cobrança mensal. Deseja lançar a despesa e criar o agendamento mensal?')
  })
  it('16) mesmo boleto já pago + despesa anterior do mesmo contrato → Despesa + agendamento, reaproveita favorecido/categoria', () => {
    const historico = { transactions: [{ id: 'a', type: 'expense', date: '2026-10-10', payee: 'Financeira Y', categoryId: 'cat_fin', accountId: 'cc', notes: 'Contrato nº 12345' }], schedules: [] }
    const r = sug({ natureza: 'boleto', texto: 'Contrato nº 12345', vencimento: '2026-11-10', pago: true, historico })
    expect(r).toMatchObject({ acaoSugerida: ACAO.DESPESA_AGENDAMENTO, recorrenciaSugerida: 'monthly', regra: 'contrato_conhecido' })
    expect(r.reaproveitar).toEqual({ payee: 'Financeira Y', categoryId: 'cat_fin', accountId: 'cc' })
    expect(primeiraOcorrencia({ data: '2026-11-10', recorrencia: 'monthly' })).toBe('2026-12-10')
  })
  it('17) boleto de aluguel sem contrato → Mensal', () => {
    const r = sug({ natureza: 'boleto', descricao: 'Aluguel apartamento', pago: true })
    expect(r).toMatchObject({ acaoSugerida: ACAO.DESPESA_AGENDAMENTO, recorrenciaSugerida: 'monthly' })
    expect(r.motivo).toBe('Conta de aluguel — costuma ser mensal')
  })
  it('18) IPVA → Anual; com cota → Parcelado', () => {
    expect(sug({ natureza: 'boleto', descricao: 'IPVA 2027', pago: true })).toMatchObject({ recorrenciaSugerida: 'annual' })
    expect(sug({ natureza: 'boleto', descricao: 'IPVA 2027 cota 1/3', pago: true })).toMatchObject({ recorrenciaSugerida: 'installment', parcelasRestantes: 2 })
  })
  it('19) academia nos 2 meses anteriores → Despesa + agendamento Mensal, mesmo por texto', () => {
    const historico = { transactions: [
      { type: 'expense', date: '2026-09-05', payee: 'Academia Forma' }, { type: 'expense', date: '2026-10-05', payee: 'Academia Forma' },
    ] }
    expect(sug({ favorecido: 'Academia Forma', descricao: 'Academia', historico })).toMatchObject({ acaoSugerida: ACAO.DESPESA_AGENDAMENTO, recorrenciaSugerida: 'monthly', regra: 'historico' })
    expect(sug({ favorecido: 'Academia Forma', historico: { transactions: historico.transactions.slice(1) } }).acaoSugerida).toBeNull()
  })
  it('20/30) sem indícios → nenhum destacado', () => {
    expect(sug({ descricao: 'Internet', favorecido: 'Provedor' })).toMatchObject({ acaoSugerida: null, recorrenciaSugerida: null, motivo: null })
  })
  it('21/22) dia informado e data final → 1ª ocorrência e nº de vezes', () => {
    expect(primeiraOcorrencia({ data: '2026-11-12', dia: 10, recorrencia: 'monthly' })).toBe('2026-12-10')
    expect(vezesAte({ inicio: '2026-12-12', ate: '2027-12-31', recorrencia: 'monthly' })).toBe(13)
    expect(primeiraOcorrencia({ data: '2026-11-12', recorrencia: 'annual' })).toBe('2027-11-12')
  })
  it('contrato no histórico também pelo agendamento', () => {
    expect(contratoNoHistorico('12345', { schedules: [{ id: 's', description: 'Financiamento contrato 12345', payee: 'Banco', categoryId: 'c', accountId: 'cc' }] }))
      .toMatchObject({ payee: 'Banco', categoryId: 'c' })
    expect(contratoNoHistorico('12', {})).toBeNull()
  })
})

import { repeticaoDaPrevia, categoriasProvaveis } from './prontidao'
describe('repetição da prévia', () => {
  it('21) "agende todo dia 10": a despesa é a ocorrência de 10/11 e o agendamento começa em 10/12', () => {
    expect(repeticaoDaPrevia({ data: '2026-11-12', recorrencia: 'monthly', dia: 10 })).toEqual({
      repeatFrequency: 'monthly', repeatStartDate: '2026-11-10', repeatOccurrenceType: 'continuous', primeira: '2026-12-10',
    })
  })
  it('22) "mensal até dezembro de 2027" → nº de vezes', () => {
    expect(repeticaoDaPrevia({ data: '2026-11-12', recorrencia: 'monthly', ate: '2027-12-31' })).toMatchObject({ repeatOccurrenceType: 'installment', repeatInstallments: 14 })
  })
  it('parcela 3 de 10 → a atual + 7 restantes', () => {
    expect(repeticaoDaPrevia({ data: '2026-11-12', recorrencia: 'installment', parcelasRestantes: 7 })).toMatchObject({ repeatFrequency: 'monthly', repeatInstallments: 8 })
  })
  it('categorias prováveis para completar o rateio', () => {
    const txs = [
      { type: 'expense', categoryId: 'a', date: '2026-11-01' }, { type: 'expense', categoryId: 'a', date: '2026-10-01' },
      { type: 'expense', categoryId: 'b', date: '2026-11-02' }, { type: 'expense', categoryId: 'c', date: '2025-01-01' },
    ]
    expect(categoriasProvaveis(txs, { hoje: '2026-11-12', excluir: ['b'] })).toEqual(['a'])
  })
})

import { agendamentosDoLancamento, mesmoContrato } from './agendamentoDoLancamento'
import { computeOccurrences } from '../occurrences'
describe('27) comprovante com agendamento pendente do mesmo contrato', () => {
  it('oferece a baixa mesmo com o nome diferente; sem contrato e nome diferente não', () => {
    const s = { id: 'fin', description: 'Financiamento · Contrato nº 12345', payee: 'Banco Z', transactionType: 'expense', accountId: 'cc', amount: 389.9,
      frequency: 'monthly', startDate: '2026-11-10', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {} }
    const lanc = { type: 'expense', accountId: 'cc', amount: 389.9, date: '2026-11-10', description: 'Pagamento boleto', payee: 'Financeira Y', contrato: '12345' }
    const ctx = { schedules: [s], accounts: [{ id: 'cc', type: 'checking' }], transactions: [], getNextOccurrences: (x, n) => computeOccurrences(x, n) }
    expect(mesmoContrato(lanc, s)).toBe(true)
    expect(agendamentosDoLancamento(lanc, ctx).map(c => c.schedule_id)).toEqual(['fin'])
    expect(agendamentosDoLancamento({ ...lanc, contrato: null }, ctx)).toEqual([])
  })
})
