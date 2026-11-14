// Motor de integridade × regra do ciclo financeiro (decisão de 14/11/2026): para PARCELA 2..N, a
// etapa A é devida quando o FECHAMENTO da fatura entra no ciclo financeiro atual do cliente — a mesma
// regra do "Verificar e corrigir" (lib/etapaACiclo). À vista e parcela 1: como sempre (fatura aberta).
// Dados FICTÍCIOS: cartão que fecha dia 13 e vence dia 20.
import { describe, it, expect } from 'vitest'
import { executarRegras } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { GRUPOS, CONTAS, gasto, etapaA, devolucao, porRegra } from './fixtures'
import { avisoDaFatura } from '../verificarCartao'

const card = { ...CONTAS.find(c => c.id === 'acc_itaupers'), closingDay: 13, dueDay: 20 }
const contas = CONTAS.map(c => (c.id === card.id ? card : c))
const DIA15 = { financialMonthStartDay: 15, financialMonthMode: 'custom' }
const DIA1 = { financialMonthStartDay: 1, financialMonthMode: 'custom' }
const CALENDARIO = { financialMonthStartDay: 15, financialMonthMode: 'calendar' }

// Parcela 2/3 confirmada na fatura 12/2026 (fecha 13/12), ainda sem etapa A.
const parcela = (id, valor, fmy = '2026-12', num = 2) =>
  gasto(id, `Loja ${num}/3`, valor, fmy, { installmentNum: num, installmentTotal: 3, serieId: `s_${id}`, date: '2026-11-10' })
const dados = (settings, txs, schedules = []) => ({
  transactions: txs, accounts: contas, gerencialGroups: GRUPOS, schedules, settings, faturasFechadas: {},
})
const etapasFaltando = (d, hoje) => (porRegra(executarRegras(d, { hoje })).GER_ETAPA_A_FALTANDO || []).map(x => x.origem_id).sort()

describe('GER_ETAPA_A_FALTANDO — parcela 2..N pelo ciclo financeiro', () => {
  const txs = () => [parcela('p2', 49.37), parcela('p3', 20)]
  const sch = (t) => [devolucao('2026-12', t)]

  it('início do mês no dia 15: no dia 14 a parcela da próxima fatura NÃO gera pendência', () => {
    const t = txs()
    expect(etapasFaltando(dados(DIA15, t, sch(t)), '2026-11-14')).toEqual([])
  })

  it('início do mês no dia 15: a partir do dia 15 passa a ser cobrada', () => {
    const t = txs()
    expect(etapasFaltando(dados(DIA15, t, sch(t)), '2026-11-15')).toEqual(['p2', 'p3'])
    expect(etapasFaltando(dados(DIA15, t, sch(t)), '2026-11-20')).toEqual(['p2', 'p3'])
  })

  it('acompanha a configuração: início no dia 1 e mês calendário (ciclo 01–30/11 não alcança o fechamento 13/12)', () => {
    const t = txs()
    for (const cfg of [DIA1, CALENDARIO]) {
      expect(etapasFaltando(dados(cfg, t, sch(t)), '2026-11-20')).toEqual([])
      // Em dezembro o fechamento 13/12 cai no ciclo → cobrada.
      expect(etapasFaltando(dados(cfg, t, sch(t)), '2026-12-02')).toEqual(['p2', 'p3'])
    }
    // Com o dia 15, em 20/11 (ciclo 15/11–14/12) já é cobrada.
    expect(etapasFaltando(dados(DIA15, t, sch(t)), '2026-11-20')).toEqual(['p2', 'p3'])
  })

  it('sem configuração gravada: ciclo começando no dia 1 (padrão)', () => {
    const t = txs()
    const d = { ...dados(DIA1, t, sch(t)), settings: undefined }
    expect(etapasFaltando(d, '2026-11-20')).toEqual([])
  })

  it('parcela com etapa A não é cobrada em nenhum dia', () => {
    const t = txs()
    const d = dados(DIA15, [...t, etapaA(t[0]), etapaA(t[1])], sch(t))
    expect(etapasFaltando(d, '2026-11-15')).toEqual([])
  })

  it('à vista e parcela 1 sem etapa A continuam gerando pendência já com a fatura aberta (dia 14)', () => {
    const avista = gasto('av', 'Mercado', 30, '2026-12', { date: '2026-11-14' })
    const p1 = parcela('p1', 10, '2026-12', 1)
    const t = [avista, p1, parcela('p2', 49.37)]
    expect(etapasFaltando(dados(DIA15, t, sch(t)), '2026-11-14')).toEqual(['av', 'p1'])
  })
})

describe('GER_FECHAMENTO_FATURA — parcelas aguardando não desequilibram a fatura', () => {
  it('dia 14: devolução com todos os gastos G e parcelas aguardando → a fatura fecha', () => {
    const t = [parcela('p2', 49.37), parcela('p3', 20)]
    const r = porRegra(executarRegras(dados(DIA15, t, [devolucao('2026-12', t)]), { hoje: '2026-11-14' }))
    expect(r.GER_FECHAMENTO_FATURA).toBeUndefined()
    expect(r.GER_SALDO_SUBCONTA).toBeUndefined()
  })

  it('dia 15: a fatura passa a não fechar (as etapas A são devidas) até o "Executar Gerenciais"', () => {
    const t = [parcela('p2', 49.37), parcela('p3', 20)]
    const sch = [devolucao('2026-12', t)]
    const r = porRegra(executarRegras(dados(DIA15, t, sch), { hoje: '2026-11-15' }))
    expect(r.GER_FECHAMENTO_FATURA).toHaveLength(1)
    expect(r.GER_FECHAMENTO_FATURA[0].encontrado).toMatchObject({ soma_sem_etapa_a: 69.37, soma_aguardando: 0 })
    const ok = porRegra(executarRegras(dados(DIA15, [...t, etapaA(t[0]), etapaA(t[1])], sch), { hoje: '2026-11-15' }))
    expect(ok.GER_FECHAMENTO_FATURA).toBeUndefined()
  })

  it('parcela aguardando ao lado de uma à vista sem etapa A: só a à vista desequilibra', () => {
    const avista = gasto('av', 'Mercado', 30, '2026-12', { date: '2026-11-14' })
    const t = [avista, parcela('p2', 49.37)]
    const r = porRegra(executarRegras(dados(DIA15, t, [devolucao('2026-12', t)]), { hoje: '2026-11-14' }))
    expect(r.GER_FECHAMENTO_FATURA).toHaveLength(1)
    expect(r.GER_FECHAMENTO_FATURA[0].encontrado).toMatchObject({ soma_gastos_g: 30, soma_sem_etapa_a: 30, soma_aguardando: 49.37 })
  })
})

describe('Faixa da fatura × motor de integridade: mesmo número, sem contar duas vezes', () => {
  const faixa = (d, fatura, hoje) => avisoDaFatura({ ...d, card, fatura, hoje, settings: d.settings })

  it('dia 14: à vista sem etapa A → a faixa de erro conta os mesmos lançamentos que o motor', () => {
    const avista = gasto('av', 'Mercado', 30, '2026-12', { date: '2026-11-14' })
    const t = [avista, parcela('p2', 49.37), parcela('p3', 20)]
    const d = dados(DIA15, t, [devolucao('2026-12', t)])
    const motor = etapasFaltando(d, '2026-11-14')
    const a = faixa(d, '2026-12', '2026-11-14')
    expect(motor).toEqual(['av'])
    // Fechamento da fatura e saldo da Ger. diferem só por causa do mesmo lançamento: contam uma vez.
    expect(a.erro.total).toBe(motor.length)
    expect(a.mes).toBeNull()
  })

  it('dia 15: as parcelas cobradas pelo motor são as da faixa "prontas para a etapa A" (sem faixa de erro)', () => {
    const t = [parcela('p2', 49.37), parcela('p3', 20)]
    const d = dados(DIA15, t, [devolucao('2026-12', t)])
    const motor = etapasFaltando(d, '2026-11-15')
    const a = faixa(d, '2026-12', '2026-11-15')
    expect(a.erro).toBeNull()
    expect(a.mes.qtd).toBe(motor.length)
    expect([...a.mes.ids].sort()).toEqual(motor)
  })

  it('lançamento sem tipo de conta E sem etapa A conta uma vez só', () => {
    const avista = gasto('av', 'Mercado', 30, '2026-12', { date: '2026-11-14', accountType: null })
    const t = [avista]
    const d = dados(DIA15, t, [devolucao('2026-12', t)])
    expect(etapasFaltando(d, '2026-11-14')).toEqual(['av'])
    expect(faixa(d, '2026-12', '2026-11-14').erro.total).toBe(1)
  })
})

describe('Alertas gravados: a próxima varredura limpa o que a regra nova não cobra mais', () => {
  it('pendência GER_ETAPA_A_FALTANDO de parcela aguardando, gravada pela regra antiga, vira "resolvida"', () => {
    const t = [parcela('p2', 49.37)]
    const d = dados(DIA15, t, [devolucao('2026-12', t)])
    // Simula a pendência gravada pela regra antiga (fatura aberta) no dia 14.
    const antiga = executarRegras(d, { hoje: '2026-11-15' }).filter(x => x.regra === 'GER_ETAPA_A_FALTANDO')
    expect(antiga).toHaveLength(1)
    const tabela = aplicarPlano([], planejarVarredura([], antiga, {}), 't0')
    const plano = planejarVarredura(tabela, executarRegras(d, { hoje: '2026-11-14' }), { desde: '2026-09' })
    expect(plano.resolver).toEqual([tabela[0].id])
    const depois = aplicarPlano(tabela, plano, 't1')
    expect(depois[0]).toMatchObject({ status: 'resolvida', resolvida_por: 'varredura' })
  })
})
