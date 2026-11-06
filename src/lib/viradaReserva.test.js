import { describe, it, expect } from 'vitest'
import { montarCenario, F, CONTA_RESERVA, CONTA_CORRENTE, REAJUSTES } from './__fixtures__/cenarioVirada.js'
import { montarPrevia, bloqueiosDeData, registrosDaVirada, recalcularViradas, ultimoCorteDe, lerSnapshot, resumoDaVirada, agruparFechamentos } from './viradaReserva.js'
import { saldosDasFuncoes, somaSaldos, saldoDaFuncao, indexarReserva } from './saldoReserva.js'
import { saldosDaConta } from './saldos.js'
import { configDoMes, mesesPendentes } from './mesFinanceiro.js'

const cfg = configDoMes({ financialMonthStartDay: 15 })
const MES1 = { inicio: '2026-08-01', fim: '2026-08-14' }
const MES2 = { inicio: '2026-08-15', fim: '2026-09-14' }
let seq = 0
const novoId = () => `id_${++seq}`

// Aplica a virada ao cenário como o servidor faria (snapshot + período novo, com virada_id).
function virar(c, mes, viradaId) {
  const previa = montarPrevia({ mes, ...c })
  const { snapshots, periodos } = registrosDaVirada({ previa, viradaId, novoId })
  c.snapshots = [...c.snapshots, ...snapshots]
  c.periods = [...c.periods, ...periodos]
  c.viradas = [...(c.viradas || []), { id: viradaId, data_inicio: mes.inicio, data_corte: mes.fim, status: 'ativa' }]
  return previa
}
const linha = (previa, fid) => previa.linhas.find(l => l.functionId === fid)

describe('cenário do pedido (dia 15)', () => {
  it('pendências desde o fechamento de 31/07: 01/08–14/08 e 15/08–14/09, em ordem', () => {
    const c = montarCenario()
    expect(mesesPendentes({ ultimoCorte: ultimoCorteDe(c.snapshots), hoje: '2026-09-20', cfg })).toEqual([MES1, MES2])
  })

  it('virada com corte em 14/08: soma das funções e conta = 1.710,00', () => {
    const c = montarCenario()
    const p = montarPrevia({ mes: MES1, ...c })
    const conta = p.contas.find(x => x.accountId === CONTA_RESERVA)
    expect(conta.somaFuncoes).toBe(1710)
    expect(conta.saldoConta).toBe(1710)
    expect(conta.diferenca).toBe(0)
    expect(conta.rendimentosMes).toBe(160)
    expect(p.avisos.map(a => a.codigo)).toEqual([])
  })

  it('virada com corte em 14/09: soma das funções e conta = 2.050,00', () => {
    const c = montarCenario()
    virar(c, MES1, 'v1')
    const p = montarPrevia({ mes: MES2, ...c })
    const conta = p.contas[0]
    expect(conta.somaFuncoes).toBe(2050)
    expect(conta.saldoConta).toBe(2050)
    expect(conta.diferenca).toBe(0)
    expect(conta.rendimentosMes).toBe(190)
  })

  it('após os lançamentos de 15/09: conta e soma das funções = 2.200,00', () => {
    const c = montarCenario()
    virar(c, MES1, 'v1')
    virar(c, MES2, 'v2')
    const saldos = saldosDasFuncoes({ ...c, ate: '2026-09-15' })
    expect(somaSaldos(saldos)).toBe(2200)
    expect(saldosDaConta(CONTA_RESERVA, 1550, c.transactions, '2026-09-15').balance).toBe(2200)
  })

  it('reajustes rateados na data de cada um, proporcionais aos saldos positivos, centavos fechando', () => {
    const c = montarCenario()
    for (const r of REAJUSTES) {
      const partes = c.adjustments.filter(a => a.lancamento_id === r.id)
      expect(partes.reduce((s, a) => Math.round((s + a.valor) * 100) / 100, 0)).toBe(r.amount)
      for (const a of partes) expect(a.data).toBe(r.date)
    }
    // 01/08: saldos 361,67 / 578,67 / 609,67 → 11,66 / 18,66 / 19,68 (sobra na maior)
    const p0801 = Object.fromEntries(c.adjustments.filter(a => a.lancamento_id === 'rj_0801').map(a => [a.function_id, a.valor]))
    expect(p0801).toEqual({ [F.ipva]: 11.66, [F.seguro]: 18.66, [F.fralda]: 19.68 })
  })

  it('a virada não rateia de novo: os rendimentos da prévia são os já gravados', () => {
    const c = montarCenario()
    const antes = c.adjustments.length
    const p = montarPrevia({ mes: MES1, ...c })
    registrosDaVirada({ previa: p, viradaId: 'v1', novoId })
    expect(c.adjustments.length).toBe(antes)
    const soma = p.linhas.reduce((s, l) => s + l.rendimentos, 0)
    expect(Math.round(soma * 100) / 100).toBe(160)
  })
})

describe('acúmulo no mês, snapshot e recomeço', () => {
  it('Saldo Final = Inicial + Entradas − Saídas + Ajuste + Rendimentos e vira o Saldo Inicial seguinte', () => {
    const c = montarCenario()
    const p1 = virar(c, MES1, 'v1')
    const p2 = montarPrevia({ mes: MES2, ...c })
    for (const fid of Object.values(F)) {
      const l1 = linha(p1, fid)
      const l2 = linha(p2, fid)
      expect(l2.saldoInicial).toBeCloseTo(l1.saldoFinal, 6)
      expect(l2.saldoFinal).toBeCloseTo(l2.saldoInicial + l2.entradas - l2.saidas + l2.ajuste + l2.rendimentos, 6)
      expect(l2.inicio).toBe('2026-08-15')
    }
    // No mês novo as colunas recomeçam: só os movimentos de 15/08 a 14/09.
    expect(linha(p2, F.ipva).entradas).toBe(200)
    expect(linha(p2, F.fralda).entradas).toBe(250)
    expect(linha(p2, F.fralda).saidas).toBe(300)
    expect(linha(p2, F.seguro).saidas).toBe(100)
    expect(linha(p1, F.ipva).entradas).toBe(0)
  })

  it('durante o mês as colunas acumulam até a data e a virada não muda o Saldo de hoje', () => {
    const c = montarCenario()
    const hoje = '2026-09-01'
    const antes = saldosDasFuncoes({ ...c, ate: hoje })
    virar(c, MES1, 'v1')
    const depois = saldosDasFuncoes({ ...c, ate: hoje })
    for (let i = 0; i < antes.length; i++) expect(depois[i].saldo).toBeCloseTo(antes[i].saldo, 6)
    const ipva = depois.find(s => s.functionId === F.ipva)
    expect(ipva.inicio).toBe('2026-08-15')
    expect(ipva.entradas).toBe(200)               // 15/08
    expect(ipva.rendimentos).toBeGreaterThan(0)   // 21/08 e 31/08
  })

  it('snapshot guarda Ajuste e Rendimentos separados; Distribuir soma em Ajuste', () => {
    const c = montarCenario()
    c.adjustments.push({ id: 'dist1', function_id: F.ipva, data: '2026-08-12', valor: 10, observacao: 'Distribuição do saldo a distribuir' })
    const p = montarPrevia({ mes: MES1, ...c })
    const { snapshots } = registrosDaVirada({ previa: p, viradaId: 'v1', novoId })
    const s = snapshots.find(x => x.function_id === F.ipva)
    expect(s.ajuste).toBe(10)
    expect(s.rendimentos).toBe(linha(p, F.ipva).rendimentos)
    expect(s.rendimentos).toBeGreaterThan(0)
    expect(s.saldo).toBeCloseTo(s.saldo_inicial + s.entradas - s.saidas + s.ajuste + s.rendimentos, 6)
    expect(resumoDaVirada(p).contas[0].diferenca).toBe(-10)
  })

  it('snapshot antigo (rendimentos NULL) continua legível: ajuste já inclui os rendimentos', () => {
    const s = lerSnapshot({ saldo_inicial: '746.87', entradas: '284.00', saidas: '0', ajuste: '5.5', rendimentos: null, saldo: '1036.37' })
    expect(s.rendimentos).toBeNull()
    expect(s.ajusteIncluiRendimentos).toBe(true)
    expect(s.ajuste).toBe(5.5)
    expect(lerSnapshot({ ajuste: 1, rendimentos: '2.5' }).rendimentos).toBe(2.5)
  })

  it('ajuste com data futura não afeta o saldo antes da data nem entra na virada', () => {
    const c = montarCenario()
    c.adjustments.push({ id: 'fut', function_id: F.ipva, data: '2026-08-20', valor: 500, observacao: 'futuro' })
    const idx = indexarReserva(c)
    const fn = c.functions[0]
    expect(saldoDaFuncao(fn, '2026-08-19', idx).ajuste).toBe(0)
    expect(saldoDaFuncao(fn, '2026-08-20', idx).ajuste).toBe(500)
    expect(linha(montarPrevia({ mes: MES1, ...c }), F.ipva).ajuste).toBe(0)
  })
})

describe('avisos (não bloqueiam)', () => {
  it('função negativa e diferença sem explicação', () => {
    const c = montarCenario()
    // Resgate maior que o saldo da função e um dinheiro que some da conta sem lançamento ligado.
    c.transactions.push({ id: 'rx', date: '2026-08-05', type: 'transfer', amount: 500, accountId: CONTA_RESERVA, toAccountId: CONTA_CORRENTE, reservaFuncaoId: F.ipva })
    c.accounts[0] = { ...c.accounts[0], initialBalance: 1540 } // conta 10,00 abaixo da soma
    const p = montarPrevia({ mes: MES1, ...c })
    expect(p.avisos.find(a => a.codigo === 'negativa').itens.map(i => i.functionId)).toEqual([F.ipva])
    const conta = p.contas[0]
    expect(conta.diferenca).toBe(-10)
    expect(conta.diferencaAnterior).toBe(-10)
    expect(conta.semExplicacao).toBe(0) // a diferença já vinha de antes do mês
    expect(p.avisos.some(a => a.codigo === 'diferenca')).toBe(true)
  })

  it('lançamento da conta de reserva sem função e receita sem rateio', () => {
    const c = montarCenario()
    c.transactions.push({ id: 'solto', date: '2026-08-03', type: 'transfer', amount: 70, accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: null, description: 'Depósito sem função' })
    c.transactions.push({ id: 'semrateio', date: '2026-08-04', type: 'income', amount: 5, accountId: CONTA_RESERVA, reservaFuncaoId: null, description: 'Juros' })
    c.transactions.push({ id: 'desp', date: '2026-08-06', type: 'expense', amount: 3, accountId: CONTA_RESERVA, reservaFuncaoId: F.seguro, description: 'Tarifa' })
    const p = montarPrevia({ mes: MES1, ...c })
    const codigos = p.avisos.map(a => a.codigo)
    expect(codigos).toContain('sem_funcao')
    expect(codigos).not.toContain('receita_sem_rateio') // o rendimento real é rateado na virada
    expect(p.avisos.find(a => a.codigo === 'sem_funcao').itens.map(i => i.id)).toEqual(['solto', 'desp'])
    const conta = p.contas[0]
    expect(conta.diferenca).toBe(67) // 70 − 3; os 5 de rendimento entraram nas funções
    expect(conta.rendimentoARatear).toBe(5)
    expect(conta.lancamentosSemFuncao).toBe(67)
    expect(conta.resto).toBe(67) // lançamento sem função não é rendimento: a virada para
    expect(conta.explicadoNoMes).toBe(67)
    expect(conta.semExplicacao).toBe(0)
  })

  it('agendamentos vencidos no período e função sem conta', () => {
    const c = montarCenario()
    c.schedules = [{ id: 'sch1', description: 'Depósito IPVA', transactionType: 'transfer', amount: 142, frequency: 'monthly', startDate: '2026-08-10', nextOccurrence: '2026-08-10', accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: F.ipva, registered: [], skipped: [] }]
    c.functions.push({ id: 'f_solta', name: 'Sem conta', accountId: null, saldoInicial: 0 })
    const p = montarPrevia({ mes: MES1, ...c })
    expect(p.avisos.find(a => a.codigo === 'vencidos').itens).toEqual([{ scheduleId: 'sch1', description: 'Depósito IPVA', date: '2026-08-10', valor: 142 }])
    expect(p.avisos.find(a => a.codigo === 'sem_conta').itens).toEqual([{ functionId: 'f_solta', nome: 'Sem conta' }])
    expect(p.semConta).toHaveLength(1)
  })
})

describe('bloqueios de data', () => {
  const ultimoCorte = '2026-07-31'
  it('mês já fechado', () => {
    expect(bloqueiosDeData({ mes: { inicio: '2026-07-15', fim: '2026-07-31' }, ultimoCorte, hoje: '2026-09-20', cfg })[0].codigo).toBe('mes_ja_fechado')
  })
  it('mês ainda não encerrado', () => {
    expect(bloqueiosDeData({ mes: { inicio: '2026-09-15', fim: '2026-10-14' }, ultimoCorte: '2026-09-14', hoje: '2026-10-14', cfg })[0].codigo).toBe('mes_nao_encerrado')
  })
  it('corte sem o mês anterior fechado', () => {
    expect(bloqueiosDeData({ mes: MES2, ultimoCorte, hoje: '2026-09-20', cfg })[0].codigo).toBe('mes_anterior_aberto')
  })
  it('primeiro pendente: liberado', () => {
    expect(bloqueiosDeData({ mes: MES1, ultimoCorte, hoje: '2026-09-20', cfg })).toEqual([])
  })
})

describe('lançamento retroativo em mês fechado', () => {
  it('recalcula a virada do mês e as seguintes, sem registro novo', () => {
    const c = montarCenario()
    virar(c, MES1, 'v1')
    virar(c, MES2, 'v2')
    expect(recalcularViradas(c)).toEqual([])
    c.transactions.push({ id: 'retro', date: '2026-08-10', type: 'transfer', amount: 40, accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: F.ipva })
    const m = recalcularViradas(c)
    const de = (virada, tabela, campo) => m.filter(x => x.viradaId === virada && x.tabela === tabela && x.campo === campo && x.functionId === F.ipva)
    expect(de('v1', 'reserve_period_snapshots', 'entradas')[0]).toMatchObject({ antes: 0, depois: 40 })
    expect(de('v1', 'reserve_periods', 'saldo_inicial')[0].depois - de('v1', 'reserve_periods', 'saldo_inicial')[0].antes).toBeCloseTo(40, 6)
    expect(de('v2', 'reserve_period_snapshots', 'saldo_inicial')).toHaveLength(1)
    expect(de('v2', 'reserve_periods', 'saldo_inicial')[0].depois - de('v2', 'reserve_periods', 'saldo_inicial')[0].antes).toBeCloseTo(40, 6)
    // só a função afetada muda
    expect(m.every(x => x.functionId === F.ipva)).toBe(true)
  })
})

describe('Histórico: rótulo do período fechado', () => {
  const snap = (fid, ini, fim, extra = {}) => ({ id: `${fid}_${fim}`, function_id: fid, function_name: fid, data_inicio: ini, data_fim: fim, saldo_inicial: 0, entradas: 0, saidas: 0, ajuste: 0, rendimentos: 1, saldo: 0, ...extra })
  it('função sem período anterior (0001-01-01) não transforma o mês em "(início)"', () => {
    const g = agruparFechamentos([snap('a', '2026-07-15', '2026-08-14'), snap('b', '2026-07-15', '2026-08-14'), snap('nova', '0001-01-01', '2026-08-14')])
    expect(g).toHaveLength(1)
    expect(g[0].dataInicio).toBe('2026-07-15')
    expect(g[0].snaps).toHaveLength(3) // nenhum valor some ou muda
  })
  it('fechamento em que nenhuma função tinha período continua "(início)"; mais recente primeiro', () => {
    const g = agruparFechamentos([snap('a', '0001-01-01', '2026-07-14', { rendimentos: null }), snap('a', '2026-07-15', '2026-08-14')])
    expect(g.map(x => [x.dataInicio, x.dataFim, x.antigo])).toEqual([['2026-07-15', '2026-08-14', false], ['0001-01-01', '2026-07-14', true]])
  })
})

describe('bloqueio de mês anterior ao início do uso', () => {
  const cfg1 = configDoMes({ financialMonthStartDay: 1 })
  it('ambiente sem virada: mês anterior ao da primeira função é recusado; o mês dela é liberado', () => {
    const b = bloqueiosDeData({ mes: { inicio: '2026-08-01', fim: '2026-08-31' }, ultimoCorte: null, hoje: '2026-11-05', cfg: cfg1, inicioUso: '2026-09-10' })
    expect(b[0].codigo).toBe('antes_do_inicio')
    expect(bloqueiosDeData({ mes: { inicio: '2026-09-01', fim: '2026-09-30' }, ultimoCorte: null, hoje: '2026-11-05', cfg: cfg1, inicioUso: '2026-09-10' })).toEqual([])
    expect(bloqueiosDeData({ mes: { inicio: '2026-10-01', fim: '2026-10-31' }, ultimoCorte: null, hoje: '2026-11-05', cfg: cfg1, inicioUso: '2026-09-10' })[0].codigo).toBe('mes_anterior_aberto')
  })
})
