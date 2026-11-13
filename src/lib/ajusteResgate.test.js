// Pagar a despesa por valor diferente do resgate ligado da mesma ocorrência: pergunta, complementar,
// devolução e ajuste da ocorrência pendente (src/lib/ajusteResgate.js). Dados fictícios.
import { describe, it, expect } from 'vitest'
import { perguntaAjusteResgate, txAjusteResgate, valorResgatado, ajustarValorDoResgate, ajustesDaOcorrencia } from './ajusteResgate'
import { criarResgateSeFaltar, sincronizarResgatesVinculados, excluirOcorrenciaDoResgate } from './resgateVinculado'
import { aplicarBaixa, metaBaixaGerada } from './scheduleBaixa'
import { computeOccurrences } from './occurrences'
import { occEfetiva } from './fluxoCaixa'
import { historicoOcorrencias } from './ocorrenciasRegistradas'
import { ORIGIN } from './origins'

const accounts = [
  { id: 'itau', name: 'Banco Exemplo', type: 'checking' },
  { id: 'ca', name: 'Contas Anuais', type: 'savings', isReserva: true },
]
const gerencialGroups = [{ id: 'gCA', number: 2, alias: 'CA', name: 'Contas Anuais', defaultAccountId: 'ca' }]
const reserveFunctions = [{ id: 'fEscola', name: 'Escola', accountId: 'ca' }]
const despesa = {
  id: 'sch_escola', description: 'ESCOLA EXEMPLO', transactionType: 'expense', accountId: 'itau', accountType: 'checking',
  amount: 1000, frequency: 'monthly', startDate: '2027-01-08', occurrenceType: 'installment', installments: 3,
  grupoGerencial: 'gCA', reservaFuncaoId: 'fEscola', registered: [], registeredMeta: {}, skipped: [], overrides: {},
}
const ctx = { accounts, gerencialGroups, reserveFunctions }
const inicial = () => sincronizarResgatesVinculados(criarResgateSeFaltar({ ...ctx, schedules: [despesa], transactions: [] }, 'sch_escola'))
const resgateDe = (d) => d.schedules.find(s => s.agendamentoVinculadoId)
const pergunta = (d, valorPago, chave = '2027-01-08') =>
  perguntaAjusteResgate({ despesaId: 'sch_escola', chave, valorPago, schedules: d.schedules, transactions: d.transactions, accounts, reserveFunctions })
// Resgate da ocorrência pago (linha dele) por `valor`.
function resgatePago(valor = 1000, chave = '2027-01-08') {
  const d = inicial()
  const r = resgateDe(d)
  const tx = { id: 'tx_rs', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: valor, date: chave, scheduleId: r.id, dataOcorrencia: chave }
  return { ...d, transactions: [tx], schedules: d.schedules.map(s => (s.id === r.id ? aplicarBaixa(s, chave, metaBaixaGerada('tx_rs')) : s)) }
}
const comAjuste = (d, p, id = 'tx_aj') => ({ ...d, transactions: [...d.transactions, { id, ...txAjusteResgate(p, { data: '2027-01-10', contaDespesaId: 'itau', descricaoDespesa: 'ESCOLA EXEMPLO' }) }] })

describe('a) resgate da ocorrência já pago', () => {
  it('pagando MAIS: pergunta o complementar; Sim → transferência da diferença da reserva para a conta da despesa', () => {
    const d = resgatePago(1000)
    const p = pergunta(d, 1005)
    expect(p).toMatchObject({ tipo: 'complementar', de: 1000, para: 1005, diferenca: 5 })
    expect(p.texto).toMatch(/^Você resgatou R\$\s*1\.000,00 para esta despesa e está pagando R\$\s*1\.005,00\. Deseja criar um resgate complementar de R\$\s*5,00\?$/)
    const tx = txAjusteResgate(p, { data: '2027-01-10', contaDespesaId: 'itau', descricaoDespesa: 'ESCOLA EXEMPLO' })
    expect(tx).toMatchObject({ type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 5, date: '2027-01-10', reservaFuncaoId: 'fEscola',
      sourceScheduleId: resgateDe(d).id, dataOcorrencia: '2027-01-08', origin: ORIGIN.RESGATE_AJUSTE })
    expect(tx.scheduleId).toBeUndefined()
    const d2 = comAjuste(d, p)
    expect(valorResgatado(resgateDe(d2), '2027-01-08', d2.transactions)).toBe(1005)
    // Já ajustado: pagar de novo o mesmo valor não pergunta.
    expect(pergunta(d2, 1005)).toBeNull()
  })
  it('pagando MENOS: pergunta a devolução para "conta › função"; Sim → da conta da despesa de volta para a reserva', () => {
    const d = resgatePago(1000)
    const p = pergunta(d, 995)
    expect(p).toMatchObject({ tipo: 'devolver', de: 1000, para: 995, diferenca: 5 })
    expect(p.texto).toMatch(/^Você resgatou R\$\s*1\.000,00 para esta despesa e está pagando R\$\s*995,00\. Deseja devolver R\$\s*5,00 para Contas Anuais › Escola\?$/)
    const d2 = comAjuste(d, p)
    expect(ajustesDaOcorrencia(resgateDe(d2).id, '2027-01-08', d2.transactions)[0]).toMatchObject({ accountId: 'itau', toAccountId: 'ca', amount: 5, reservaFuncaoId: 'fEscola' })
    expect(valorResgatado(resgateDe(d2), '2027-01-08', d2.transactions)).toBe(995)
  })
  it('histórico do resgate: o "valor pago" da ocorrência é o líquido (1.005 / 995); sem ocorrência nova', () => {
    for (const [pago, liquido] of [[1005, 1005], [995, 995]]) {
      const d = resgatePago(1000)
      const d2 = comAjuste(d, pergunta(d, pago))
      const r = resgateDe(d2)
      const h = historicoOcorrencias(r, d2.transactions)
      expect(h.linhas).toHaveLength(1)
      expect(h.linhas[0]).toMatchObject({ status: 'paga', valorPago: liquido, ajuste: liquido - 1000 })
    }
  })
  it('complementar/devolução não criam ocorrência nova no resgate nem mudam a série', () => {
    const d = resgatePago(1000)
    const antes = resgateDe(d)
    const d2 = sincronizarResgatesVinculados(comAjuste(d, pergunta(d, 1005)))
    const r = resgateDe(d2)
    expect(r.registered).toEqual(antes.registered)
    expect(computeOccurrences(r, 400)).toEqual(computeOccurrences(antes, 400))
    expect(r.amount).toBe(antes.amount)
  })
})

describe('b) resgate da ocorrência pendente', () => {
  it('pagando mais ou menos: pergunta ajustar SÓ esta ocorrência; continua pendente', () => {
    for (const novo of [1005, 995]) {
      const d = inicial()
      const p = pergunta(d, novo)
      expect(p).toMatchObject({ tipo: 'ajustar', de: 1000, para: novo })
      expect(p.texto).toMatch(new RegExp(`^O resgate desta ocorrência está agendado em R\\$\\s*1\\.000,00\\. Deseja ajustar para R\\$\\s*${novo === 1005 ? '1\\.005' : '995'},00\\?$`))
      const r1 = ajustarValorDoResgate(resgateDe(d), despesa, '2027-01-08', novo)
      const d2 = sincronizarResgatesVinculados({ ...d, schedules: d.schedules.map(s => (s.id === r1.id ? r1 : s)) })
      const r = resgateDe(d2)
      expect(occEfetiva(r, '2027-01-08').amount).toBe(novo)
      expect(occEfetiva(r, '2027-02-08').amount).toBe(1000)
      expect(r.registered).toEqual([])
      expect(computeOccurrences(r, 400)).toEqual(['2027-01-08', '2027-02-08', '2027-03-08'])
    }
  })
  it('o ajuste vale até a despesa mudar o valor dela naquela ocorrência', () => {
    const d = inicial()
    const r1 = ajustarValorDoResgate(resgateDe(d), despesa, '2027-01-08', 1005)
    let d2 = sincronizarResgatesVinculados({ ...d, schedules: d.schedules.map(s => (s.id === r1.id ? r1 : s)) })
    d2 = sincronizarResgatesVinculados({ ...d2, schedules: d2.schedules.map(s => (s.id === 'sch_escola' ? { ...s, overrides: { '2027-01-08': { amount: 1100 } } } : s)) })
    expect(occEfetiva(resgateDe(d2), '2027-01-08').amount).toBe(1100)
  })
})

describe('sem pergunta', () => {
  it('valor igual (pago ou pendente), ocorrência excluída do resgate, despesa sem resgate', () => {
    expect(pergunta(resgatePago(1000), 1000)).toBeNull()
    expect(pergunta(inicial(), 1000)).toBeNull()
    const d = inicial()
    const semJan = { ...d, schedules: d.schedules.map(s => (s.agendamentoVinculadoId ? excluirOcorrenciaDoResgate(s, '2027-01-08') : s)) }
    expect(pergunta(semJan, 1005)).toBeNull()
    expect(perguntaAjusteResgate({ despesaId: 'outra', chave: '2027-01-08', valorPago: 5, schedules: d.schedules })).toBeNull()
  })
})
