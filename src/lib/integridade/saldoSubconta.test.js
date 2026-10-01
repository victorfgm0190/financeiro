import { describe, it, expect } from 'vitest'
import { executarRegras, ultimoMarco } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { OPC, GRUPOS, CONTAS, gasto, etapaA, fixtureBug, porRegra } from './fixtures'

// GER_SALDO_SUBCONTA: faturas fechadas e faturas com devolução executada estão liquidadas (fora do
// esperado); marco de saldo aceito zera a diferença histórica.

const SO_SALDO = { ...OPC, regras: ['GER_SALDO_SUBCONTA'] }
const saldo = (dados) => executarRegras(dados, SO_SALDO)

// ── Itaupers: fatura 10/2026 com todas as etapas A (saldo R$ 5.701,32 = total G da 10) e histórico
// de 03/2026 (R$ 26,36) e 04/2026 (R$ 67,55) cujo dinheiro já saiu da subconta por fora (sem
// devolução registrada). A regra antiga esperava R$ 93,91 a mais.
function itaupers() {
  const d = fixtureBug()
  for (const id of ['tx_1789736376094_z41mpw3eroa', 'tx_1789736376094_kvw8u5eevwc']) {
    d.transactions.push(etapaA(d.transactions.find(t => t.id === id)))
  }
  const mar = gasto('tx_mar', 'Padaria', 26.36, '2026-03')
  const abr = gasto('tx_abr', 'Livraria', 67.55, '2026-04')
  d.transactions.push(mar, abr, etapaA(mar), etapaA(abr), {
    id: 'tx_saida_antiga', type: 'transfer', accountId: 'acc_ger_itaupers', toAccountId: 'acc_cc',
    amount: 93.91, date: '2026-05-20', description: 'Devolução manual', origin: 'manual',
  })
  return d
}

// ── NUGI: fatura 09/2026 quitada com devolução EXECUTADA que só lista um dos gastos (R$ 100); o
// outro (R$ 218,63) a regra antiga ainda esperava na subconta. 10/2026 aberta, R$ 50 com etapa A.
const NUGI = [
  { id: 'acc_nugi', name: 'Nubank GI', apelido: 'NUGI', type: 'credit', closingDay: 5, dueDay: 12 },
  { id: 'acc_ger_nugi', name: 'Ger. NUGI', type: 'gerencial', balance: 0 },
]
function nugi() {
  const g = (id, desc, valor, fmy) => gasto(id, desc, valor, fmy, { accountId: 'acc_nugi' })
  const et = (x) => etapaA(x, { toAccountId: 'acc_ger_nugi', cardId: 'acc_nugi' })
  const n1 = g('tx_n1', 'Mercado', 100, '2026-09')
  const n2 = g('tx_n2', 'Farmácia', 218.63, '2026-09')
  const n3 = g('tx_n3', 'Posto', 50, '2026-10')
  const dev = {
    id: 'fsch_acc_nugi_202609_gerencial_devolucao', tipo: 'gerencial_devolucao', transactionType: 'transfer',
    accountId: 'acc_ger_nugi', toAccountId: 'acc_cc', amount: 318.63, cardId: 'acc_nugi', faturaMesAno: '2026-09',
    faturaRef: '09/2026', frequency: 'once', startDate: '2026-09-15', registered: ['2026-09-15'], skipped: [],
    sourceExpenseIds: ['tx_n1'],
  }
  const devTx = {
    id: 'tx_dev_nugi_09', type: 'transfer', accountId: 'acc_ger_nugi', toAccountId: 'acc_cc', amount: 318.63,
    date: '2026-09-15', sourceScheduleId: dev.id, origin: 'agendamento',
  }
  return {
    transactions: [n1, n2, n3, et(n1), et(n2), et(n3), devTx],
    schedules: [dev], accounts: [...CONTAS, ...NUGI], gerencialGroups: GRUPOS,
  }
}

const fechadas = (...chaves) => Object.fromEntries(chaves.map(k => [k, true]))

describe('GER_SALDO_SUBCONTA — faturas liquidadas', () => {
  it('Itaupers com 03/2026 e 04/2026 ainda abertas: esperado inclui R$ 93,91 a mais', () => {
    const [p] = saldo(itaupers())
    expect(p.encontrado).toMatchObject({ saldo: 5701.32, diferenca: -93.91 })
    expect(p.esperado.por_fatura.map(f => f.fatura)).toEqual(['03/2026', '04/2026', '10/2026'])
  })

  it('fatura fechada nunca entra no esperado: NUGI 09/2026 fechada não gera pendência', () => {
    const d = { ...nugi(), faturasFechadas: fechadas('acc_nugi_2026-09') }
    expect(saldo(d)).toEqual([])
  })

  it('fatura com devolução executada não entra no esperado, mesmo aberta', () => {
    expect(saldo(nugi())).toEqual([])
  })

  it('com 03/2026 e 04/2026 fechadas, o Itaupers não gera pendência', () => {
    const d = { ...itaupers(), faturasFechadas: fechadas('acc_itaupers_2026-03', 'acc_itaupers_2026-04') }
    expect(saldo(d)).toEqual([])
  })

  it('a diferença real numa fatura aberta continua sendo detectada', () => {
    const d = { ...nugi() }
    d.transactions = [...d.transactions, gasto('tx_n4', 'Sem etapa', 80, '2026-10', { accountId: 'acc_nugi' })]
    const [p] = saldo(d)
    expect(p).toMatchObject({ origem_id: 'acc_ger_nugi', conta_id: 'acc_nugi', fatura_ref: '09/2026' })
    expect(p.encontrado.diferenca).toBe(-80)
    expect(p.esperado.por_fatura).toEqual([{ fatura: '10/2026', valor: 130, gastos: 2 }])
  })
})

describe('GER_SALDO_SUBCONTA — marco de saldo', () => {
  const marco = (extra = {}) => ({
    id: 'm1', contaId: 'acc_ger_itaupers', data: '2026-09-30', saldo: 5701.32, diferencaAceita: -93.91,
    motivo: 'histórico antigo conferido', criadoEm: '2026-09-30T12:00:00Z', ...extra,
  })

  it('o marco zera a diferença histórica', () => {
    expect(saldo(itaupers())).toHaveLength(1)
    expect(saldo({ ...itaupers(), marcosSaldo: [marco()] })).toEqual([])
  })

  it('uma diferença nova depois do marco volta a gerar pendência', () => {
    const d = { ...itaupers(), marcosSaldo: [marco()] }
    d.transactions = [...d.transactions, gasto('tx_novo', 'Restaurante', 120, '2026-10', { dateCartao: '2026-09-29' })]
    const [p] = saldo(d)
    expect(p.encontrado.diferenca).toBe(-120)
    expect(p.esperado.marco).toMatchObject({ id: 'm1', diferenca_aceita: -93.91 })
    // Com a etapa A do gasto novo, volta a bater.
    d.transactions.push(etapaA(d.transactions.find(t => t.id === 'tx_novo')))
    expect(saldo(d)).toEqual([])
  })

  it('vale o último marco da subconta', () => {
    const ms = [marco({ id: 'velho', data: '2026-08-01' }), marco({ id: 'novo' }), marco({ id: 'outra', contaId: 'acc_ger_nugi', data: '2026-12-01' })]
    expect(ultimoMarco(ms, 'acc_ger_itaupers').id).toBe('novo')
  })
})

describe('GER_SALDO_SUBCONTA — varredura completa limpa as pendências antigas', () => {
  it('partindo das pendências atuais do Itaupers e do NUGI, uma varredura resolve as duas', () => {
    const faturasFechadas = fechadas('acc_itaupers_2026-03', 'acc_itaupers_2026-04', 'acc_nugi_2026-09')
    const dados = {
      ...itaupers(), faturasFechadas,
      accounts: [...CONTAS, ...NUGI],
    }
    const n = nugi()
    dados.transactions = [...dados.transactions, ...n.transactions]
    dados.schedules = [...dados.schedules, ...n.schedules]

    const atual = (origem, conta, fatura) => ({
      id: `GER_SALDO_SUBCONTA|${origem}`, regra: 'GER_SALDO_SUBCONTA', severidade: 'aprovar', origem_id: origem,
      conta_id: conta, fatura_ref: fatura, status: 'pendente', resolvida_por: null,
    })
    // NUGI apontando para a 10/2026; um segundo cenário com a pendência numa fatura que fechou.
    for (const faturaNugi of ['10/2026', '09/2026']) {
      const existentes = [atual('acc_ger_itaupers', 'acc_itaupers', '03/2026'), atual('acc_ger_nugi', 'acc_nugi', faturaNugi)]
      // "Varrer agora": sem desde (janela padrão) — GER_SALDO_SUBCONTA não depende dela.
      const divs = executarRegras(dados, OPC)
      expect(porRegra(divs).GER_SALDO_SUBCONTA).toBeUndefined()
      const plano = planejarVarredura(existentes, divs, { desde: '2026-06' }, { faturasFechadas })
      const t = aplicarPlano(existentes, plano, 't')
      const saldos = t.filter(p => p.regra === 'GER_SALDO_SUBCONTA')
      expect(saldos.filter(p => p.status === 'pendente')).toEqual([])
      expect(saldos.map(p => [p.origem_id, p.status, p.resolvida_por])).toEqual([
        ['acc_ger_itaupers', 'resolvida', 'varredura'],
        ['acc_ger_nugi', 'resolvida', 'varredura'],
      ])
    }
  })

  it('ignorada por fatura_fechada (versão anterior) também é resolvida', () => {
    const existentes = [{
      id: 'x', regra: 'GER_SALDO_SUBCONTA', origem_id: 'acc_ger_nugi', conta_id: 'acc_nugi', fatura_ref: '09/2026',
      status: 'ignorada', resolvida_por: 'fatura_fechada',
    }]
    const faturasFechadas = fechadas('acc_nugi_2026-09')
    const plano = planejarVarredura(existentes, [], {}, { faturasFechadas })
    expect(aplicarPlano(existentes, plano, 't')[0]).toMatchObject({ status: 'resolvida', resolvida_por: 'varredura' })
  })
})
