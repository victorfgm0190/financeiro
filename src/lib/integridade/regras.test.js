import { describe, it, expect } from 'vitest'
import { executarRegras, montarContexto, classeDoGrupo, aberturaFatura, REGRAS } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'

import { OPC, GRUPOS, CONTAS, gasto, etapaA, devolucao, fixtureBug, porRegra } from './fixtures'


describe('Motor de Integridade — bug de 30/09/2026 (Fatura 10/2026 Itaupers)', () => {
  const divs = executarRegras(fixtureBug(), OPC)
  const r = porRegra(divs)

  it('acusa GER_ETAPA_A_FALTANDO para os dois gastos novos, e só para eles', () => {
    expect((r.GER_ETAPA_A_FALTANDO || []).map(d => d.origem_id).sort()).toEqual([
      'tx_1789736376094_kvw8u5eevwc', 'tx_1789736376094_z41mpw3eroa',
    ])
    const jim = r.GER_ETAPA_A_FALTANDO.find(d => d.origem_id === 'tx_1789736376094_z41mpw3eroa')
    expect(jim.severidade).toBe('auto')
    expect(jim.fatura_ref).toBe('10/2026')
    expect(jim.esperado).toMatchObject({ etapa_a_id: 'tx_gerA_tx_1789736376094_z41mpw3eroa', valor: 316.68, para: 'acc_ger_itaupers' })
    // A série antiga TEM etapa A — aparece como irmã, mas não cobre o gasto novo.
    expect(jim.encontrado.irmas_com_etapa_a.map(i => i.id)).toEqual(['tx_jim_1', 'tx_jim_2', 'tx_jim_3'])
  })

  it('acusa GER_FECHAMENTO_FATURA da 10/2026 com diferença de R$ 358,62', () => {
    expect(r.GER_FECHAMENTO_FATURA).toHaveLength(1)
    const f = r.GER_FECHAMENTO_FATURA[0]
    expect(f.origem_id).toBe('acc_itaupers|2026-10')
    expect(f.encontrado.soma_gastos_g).toBe(5701.32)
    expect(f.encontrado.soma_etapas_a).toBe(5342.70)
    expect(f.encontrado.diferenca_g_etapa_a).toBe(358.62)
    expect(f.encontrado.gastos_sem_etapa_a.map(g => g.id)).toHaveLength(2)
  })

  it('acusa PARCELA_NUMERO_INCOERENTE para o Jim.com (exibido 3/3, favorecido 1/3, sem 1/3 na série)', () => {
    expect((r.PARCELA_NUMERO_INCOERENTE || []).map(d => d.origem_id)).toEqual(['tx_1789736376094_z41mpw3eroa'])
    const d = r.PARCELA_NUMERO_INCOERENTE[0]
    expect(d.esperado).toMatchObject({ parcela: '1/3', favorecido: 'Jim.com* 60278703 1/3', fatura_parcela_origem: '08/2026' })
    expect(d.encontrado).toMatchObject({ parcela_exibida: '3/3', motivos: ['parcela_de_origem_ausente'] })
  })

  it('marca "projeção" no resumo do gasto', () => {
    expect(r.GER_ETAPA_A_FALTANDO.every(d => d.encontrado.gasto.projecao === false)).toBe(true)
  })

  it('não confunde o 3/3 novo com o 3/3 da série antiga: não é PARCELA_DUPLICADA', () => {
    expect(r.PARCELA_DUPLICADA).toBeUndefined()
  })

  it('a subconta Ger. fica R$ 358,62 abaixo do esperado', () => {
    expect(r.GER_SALDO_SUBCONTA).toHaveLength(1)
    expect(r.GER_SALDO_SUBCONTA[0].encontrado.diferenca).toBe(-358.62)
  })

  it('a série "3/3 em 10/2026" fica sem 1/3 e 2/3 — numeração a conferir', () => {
    const faltas = (r.SERIE_PARCELAS_INCOMPLETA || []).map(d => d.esperado.faltando.map(f => `${f.parcela}@${f.fatura}`))
    expect(faltas).toEqual([['1/3@08/2026', '2/3@09/2026'], ['1/3@08/2026', '2/3@09/2026']])
  })

  it('nenhuma outra regra dispara na fixture', () => {
    expect(Object.keys(r).sort()).toEqual([
      'GER_ETAPA_A_FALTANDO', 'GER_FECHAMENTO_FATURA', 'GER_SALDO_SUBCONTA',
      'PARCELA_NUMERO_INCOERENTE', 'PARCELA_SEM_VINCULO', 'SERIE_PARCELAS_INCOMPLETA',
    ])
    // As séries da fixture são legadas (sem serie_id em nenhuma parcela): só informativo, sem opção.
    expect(r.PARCELA_SEM_VINCULO.every(d => d.severidade === 'aprovar' && d.esperado.opcoes.length === 0)).toBe(true)
  })

  it('com as etapas A criadas, tudo fecha', () => {
    const d = fixtureBug()
    for (const id of ['tx_1789736376094_z41mpw3eroa', 'tx_1789736376094_kvw8u5eevwc']) {
      d.transactions.push(etapaA(d.transactions.find(t => t.id === id)))
    }
    const r2 = porRegra(executarRegras(d, OPC))
    expect(r2.GER_ETAPA_A_FALTANDO).toBeUndefined()
    expect(r2.GER_FECHAMENTO_FATURA).toBeUndefined()
    expect(r2.GER_SALDO_SUBCONTA).toBeUndefined()
  })
})

describe('PARCELA_NUMERO_INCOERENTE — favorecido herdado', () => {
  const serie = (n, fmy, extra = {}) => gasto(`tx_s${n}`, `Curso X ${n}/3`, 90, fmy, {
    installmentNum: n, installmentTotal: 3, grupoGerencial: 'grp_D', payee: 'Curso X 1/3', ...extra,
  })
  const d = (txs) => ({ accounts: CONTAS, gerencialGroups: GRUPOS, schedules: [], transactions: txs })
  const regra = { ...OPC, regras: ['PARCELA_NUMERO_INCOERENTE'] }

  it('parcelas 2/3 e 3/3 geradas de um 1/3 existente não são incoerentes', () => {
    expect(executarRegras(d([serie(1, '2026-08'), serie(2, '2026-09'), serie(3, '2026-10')]), regra)).toEqual([])
  })
  it('sem a parcela 1/3 de origem, a 3/3 com favorecido 1/3 é incoerente', () => {
    const r = executarRegras(d([serie(3, '2026-10')]), regra)
    expect(r.map(x => [x.origem_id, x.encontrado.motivos[0]])).toEqual([['tx_s3', 'parcela_de_origem_ausente']])
  })
  it('favorecido com número MAIOR que o exibido é sempre incoerente', () => {
    const r = executarRegras(d([serie(1, '2026-08', { payee: 'Curso X 2/3' })]), regra)
    expect(r.map(x => x.encontrado.motivos)).toEqual([['descricao_original']])
  })
  it('favorecido sem "N/M" (definido por regra de classificação) é ignorado', () => {
    expect(executarRegras(d([serie(3, '2026-10', { payee: 'Curso X' })]), regra)).toEqual([])
  })
})

describe('Etapa A é verificada por gasto', () => {
  it('reconhece etapa A com id antigo tx_ger_ vinculada por source_expense_id', () => {
    const g = gasto('tx_a', 'Livraria', 80, '2026-09')
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS,
      transactions: [g, etapaA(g, { id: 'tx_ger_1780000000000_x1', origin: 'gerencial_auto' })],
      schedules: [devolucao('2026-09', [g])],
    }
    expect(executarRegras(d, OPC)).toEqual([])
  })

  it('reconhece tx_ger_ legado só com parent_tx_id (origin auto-provisao)', () => {
    const g = gasto('tx_b', 'Livraria', 80, '2026-09')
    const et = etapaA(g, { id: 'tx_ger_1770000000000_y2', origin: 'auto-provisao', parentTxId: g.id, sourceExpenseId: null })
    const d = { accounts: CONTAS, gerencialGroups: GRUPOS, transactions: [g, et], schedules: [devolucao('2026-09', [g])] }
    expect(executarRegras(d, OPC)).toEqual([])
  })

  it('etapa A de uma parcela irmã não cobre a outra parcela', () => {
    const p1 = gasto('tx_p1', 'Curso Online 1/2', 100, '2026-09', { installmentNum: 1, installmentTotal: 2 })
    const p2 = gasto('tx_p2', 'Curso Online 2/2', 100, '2026-10', { installmentNum: 2, installmentTotal: 2 })
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS,
      transactions: [p1, p2, etapaA(p1)],
      schedules: [devolucao('2026-09', [p1]), devolucao('2026-10', [p2])],
    }
    const r = porRegra(executarRegras(d, OPC))
    expect(r.GER_ETAPA_A_FALTANDO.map(x => x.origem_id)).toEqual(['tx_p2'])
  })

  it('duplicada, valor divergente e órfã', () => {
    const g1 = gasto('tx_d1', 'Restaurante', 120, '2026-09')
    const g2 = gasto('tx_d2', 'Padaria', 30, '2026-09')
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS,
      transactions: [
        g1, g2, etapaA(g1), etapaA(g1, { id: 'tx_ger_dup_1', origin: 'gerencial_auto' }),
        etapaA(g2, { amount: 25 }),
        { ...etapaA(g2), id: 'tx_gerA_tx_sumiu', sourceExpenseId: 'tx_sumiu', amount: 10 },
      ],
      schedules: [devolucao('2026-09', [g1, g2])],
    }
    const r = porRegra(executarRegras(d, OPC))
    expect(r.GER_ETAPA_A_DUPLICADA.map(x => x.origem_id)).toEqual(['tx_d1'])
    expect(r.GER_ETAPA_A_VALOR.map(x => x.origem_id)).toEqual(['tx_d2'])
    expect(r.GER_ETAPA_A_ORFA.map(x => x.origem_id)).toEqual(['tx_gerA_tx_sumiu'])
  })
})

describe('Sem falso positivo', () => {
  it('gasto G com estorno, gasto D e gasto de grupo numerado com resgate em dia', () => {
    const g = gasto('tx_g', 'Loja de Roupas', 200, '2026-09')
    const estorno = { ...g, id: 'tx_estorno', type: 'income', amount: 200, grupoGerencial: null }
    const dGasto = gasto('tx_dd', 'Uber', 35, '2026-09', { grupoGerencial: 'grp_D' })
    const semGrupo = gasto('tx_sg', 'Café', 9, '2026-09', { grupoGerencial: null })
    const num = gasto('tx_num', 'IPVA', 900, '2026-09', { grupoGerencial: 'grp_2' })
    const resgate = {
      id: 'fsch_acc_itaupers_202609_resgate_reserva_acc_res_ca', tipo: 'resgate_reserva',
      transactionType: 'transfer', accountId: 'acc_res_ca', toAccountId: 'acc_cc', amount: 900,
      cardId: 'acc_itaupers', faturaMesAno: '2026-09', frequency: 'once', startDate: '2026-09-12',
      registered: [], skipped: [], sourceExpenseIds: ['tx_num'],
    }
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS,
      transactions: [g, estorno, etapaA(g), dGasto, semGrupo, num],
      schedules: [devolucao('2026-09', [g]), resgate],
    }
    expect(executarRegras(d, OPC)).toEqual([])
  })
})

describe('PARCELA_DUPLICADA', () => {
  const base = () => gasto('tx_l1', 'Loja Y 2/5', 100, '2026-09', { installmentNum: 2, installmentTotal: 5, grupoGerencial: 'grp_D', createdAt: '2026-08-01T00:00:00Z' })

  it('mesma parcela da mesma compra duas vezes → acusa a mais nova', () => {
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS, schedules: [],
      transactions: [base(), { ...base(), id: 'tx_l2', createdAt: '2026-09-01T00:00:00Z' }],
    }
    const r = porRegra(executarRegras(d, { ...OPC, regras: ['PARCELA_DUPLICADA'] }))
    expect(r.PARCELA_DUPLICADA.map(x => x.origem_id)).toEqual(['tx_l2'])
    expect(r.PARCELA_DUPLICADA[0].encontrado).toMatchObject({ parcela: '2/5', faturas: ['09/2026'], ids: ['tx_l1', 'tx_l2'] })
  })

  it('favorecido (descrição do banco) diz outra parcela → compra nova, não duplicata', () => {
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS, schedules: [],
      transactions: [base(), { ...base(), id: 'tx_l2', payee: 'Loja Y 4/5' }],
    }
    expect(executarRegras(d, { ...OPC, regras: ['PARCELA_DUPLICADA'] })).toEqual([])
  })

  it('gêmeas legítimas (installment_occurrence) não são duplicata', () => {
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS, schedules: [],
      transactions: [base(), { ...base(), id: 'tx_l2', installmentOccurrence: 2 }],
    }
    expect(executarRegras(d, { ...OPC, regras: ['PARCELA_DUPLICADA'] })).toEqual([])
  })
})

describe('Comportamento vem de reservas_funcoes.number, não do nome', () => {
  it('classifica G / numerado / D', () => {
    expect(classeDoGrupo({ number: 1 })).toBe('G')
    expect(classeDoGrupo({ number: 7 })).toBe('NUM')
    expect(classeDoGrupo({ number: '3' })).toBe('NUM')
    expect(classeDoGrupo({ number: 'D' })).toBe('D')
  })

  it('grupo novo numerado chamado "Gerencial" com etapa A → NUM_COM_ETAPA_A; D com etapa A → D_COM_ETAPA_A', () => {
    const grupos = [...GRUPOS, { id: 'grp_novo', number: 7, name: 'Gerencial', defaultAccountId: 'acc_res_ca' }]
    const n = gasto('tx_n', 'Assinatura', 50, '2026-09', { grupoGerencial: 'grp_novo' })
    const dd = gasto('tx_dd', 'Taxi', 20, '2026-09', { grupoGerencial: 'grp_D' })
    const d = { accounts: CONTAS, gerencialGroups: grupos, transactions: [n, dd, etapaA(n), etapaA(dd)], schedules: [] }
    const r = porRegra(executarRegras(d, OPC))
    expect(r.NUM_COM_ETAPA_A.map(x => x.origem_id)).toEqual(['tx_n'])
    expect(r.D_COM_ETAPA_A.map(x => x.origem_id)).toEqual(['tx_dd'])
    expect(r.NUM_RESGATE_FALTANDO.map(x => x.origem_id)).toEqual(['acc_itaupers|2026-09|acc_res_ca'])
  })

  it('grupo inexistente e grupo numerado sem conta-origem', () => {
    const grupos = [...GRUPOS, { id: 'grp_sem', number: 4, name: 'PharmaLog', defaultAccountId: null }]
    const d = {
      accounts: CONTAS, gerencialGroups: grupos, schedules: [],
      transactions: [
        gasto('tx_x', 'Farmácia', 10, '2026-09', { grupoGerencial: 'grp_apagado' }),
        gasto('tx_y', 'Laboratório', 10, '2026-09', { grupoGerencial: 'grp_sem' }),
      ],
    }
    const r = porRegra(executarRegras(d, OPC))
    expect(r.GRUPO_INEXISTENTE.map(x => x.origem_id)).toEqual(['tx_x'])
    expect(r.NUM_SEM_CONTA_ORIGEM.map(x => x.origem_id)).toEqual(['grp_sem'])
  })
})

describe('Resgate de grupo numerado', () => {
  const num = (id, amount) => gasto(id, `Gasto ${id}`, amount, '2026-09', { grupoGerencial: 'grp_2' })
  const resgate = (amount, ids, extra = {}) => ({
    id: 'fsch_acc_itaupers_202609_resgate_reserva_acc_res_ca', tipo: 'resgate_reserva',
    transactionType: 'transfer', accountId: 'acc_res_ca', toAccountId: 'acc_cc', amount,
    cardId: 'acc_itaupers', faturaMesAno: '2026-09', frequency: 'once', startDate: '2026-09-12',
    registered: [], skipped: [], sourceExpenseIds: ids, ...extra,
  })

  it('valor do pendente inclui os previstos (sch:)', () => {
    const prev = {
      id: 'sch_seguro', transactionType: 'expense', accountId: 'acc_itaupers', amount: 150,
      frequency: 'once', startDate: '2026-08-20', grupoGerencial: 'grp_2', registered: [], skipped: [],
    }
    const base = { accounts: CONTAS, gerencialGroups: GRUPOS, transactions: [num('tx_n1', 300)] }
    const ok = executarRegras({ ...base, schedules: [prev, resgate(450, ['tx_n1', 'sch:sch_seguro@2026-08-20'])] }, OPC)
    expect(ok).toEqual([])
    const r = porRegra(executarRegras({ ...base, schedules: [prev, resgate(300, ['tx_n1'])] }, OPC))
    expect(r.NUM_RESGATE_VALOR[0].esperado.valor).toBe(450)
    expect(r.NUM_RESGATE_VALOR[0].encontrado.valor).toBe(300)
  })

  it('resgate pendente sem gasto é órfão', () => {
    const d = { accounts: CONTAS, gerencialGroups: GRUPOS, transactions: [], schedules: [resgate(100, ['tx_sumiu'])] }
    const r = porRegra(executarRegras(d, OPC))
    expect(r.NUM_RESGATE_ORFAO.map(x => x.origem_id)).toEqual(['fsch_acc_itaupers_202609_resgate_reserva_acc_res_ca'])
  })

  it('gasto novo fora do resgate já executado → CADEIA_INCOMPLETA (aprovar)', () => {
    const d = {
      accounts: CONTAS, gerencialGroups: GRUPOS,
      transactions: [num('tx_n1', 300), num('tx_n2', 50)],
      schedules: [resgate(300, ['tx_n1'], { registered: ['2026-09-12'] })],
    }
    const r = porRegra(executarRegras(d, OPC))
    expect(r.CADEIA_INCOMPLETA.map(x => [x.origem_id, x.severidade])).toEqual([['tx_n2', 'aprovar']])
    expect(r.NUM_RESGATE_VALOR[0].esperado.valor).toBe(50)
  })
})

describe('Varredura', () => {
  it('rodar 2× seguidas dá o mesmo resultado (idempotência)', () => {
    const dados = fixtureBug()
    const divs1 = executarRegras(dados, OPC)
    const plano1 = planejarVarredura([], divs1, { desde: '2026-06' })
    expect(plano1.resumo).toMatchObject({ novas: divs1.length, mantidas: 0, resolvidas: 0 })
    const tabela1 = aplicarPlano([], plano1, 't1')

    const divs2 = executarRegras(dados, OPC)
    expect(divs2).toEqual(divs1)
    const plano2 = planejarVarredura(tabela1, divs2, { desde: '2026-06' })
    expect(plano2.resumo).toMatchObject({ novas: 0, mantidas: divs1.length, reabertas: 0, resolvidas: 0 })
    const tabela2 = aplicarPlano(tabela1, plano2, 't2')
    const semTempo = (t) => t.map(({ verificada_em, ...p }) => p) // eslint-disable-line no-unused-vars
    expect(semTempo(tabela2)).toEqual(semTempo(tabela1))
  })

  it('pendência corrigida é resolvida pela varredura; ignorada não reabre', () => {
    const dados = fixtureBug()
    const t1 = aplicarPlano([], planejarVarredura([], executarRegras(dados, OPC), {}), 't1')
    const ignorada = t1.find(p => p.regra === 'PARCELA_NUMERO_INCOERENTE')
    ignorada.status = 'ignorada'
    for (const id of ['tx_1789736376094_z41mpw3eroa', 'tx_1789736376094_kvw8u5eevwc']) {
      dados.transactions.push(etapaA(dados.transactions.find(t => t.id === id)))
    }
    const plano = planejarVarredura(t1, executarRegras(dados, OPC), {})
    const t2 = aplicarPlano(t1, plano, 't2')
    const status = (regra) => t2.filter(p => p.regra === regra).map(p => [p.status, p.resolvida_por])
    expect(status('GER_ETAPA_A_FALTANDO')).toEqual([['resolvida', 'varredura'], ['resolvida', 'varredura']])
    expect(status('GER_FECHAMENTO_FATURA')).toEqual([['resolvida', 'varredura']])
    expect(status('PARCELA_NUMERO_INCOERENTE')).toEqual([['ignorada', null]])
  })

  it('varredura restrita não resolve o que ficou fora do escopo', () => {
    const t1 = aplicarPlano([], planejarVarredura([], executarRegras(fixtureBug(), OPC), {}), 't1')
    const plano = planejarVarredura(t1, [], { faturas: ['2026-09'] })
    // GER_SALDO_SUBCONTA é avaliada inteira: a fatura_ref dela é só onde a pendência aparece.
    expect(plano.resolver.every(id => {
      const p = t1.find(x => x.id === id)
      return p.fatura_ref === '09/2026' || !p.fatura_ref || p.regra === 'GER_SALDO_SUBCONTA'
    })).toBe(true)
    expect(plano.resolver).not.toContain('GER_ETAPA_A_FALTANDO|tx_1789736376094_z41mpw3eroa')
  })
})

describe('Auxiliares', () => {
  it('fatura abre no dia seguinte ao fechamento anterior', () => {
    expect(aberturaFatura('2026-10', { closingDay: 5 })).toBe('2026-09-06')
    expect(aberturaFatura('2026-03', { closingDay: 30 })).toBe('2026-03-01')
  })
  it('todas as regras têm código, severidade e verificar', () => {
    for (const r of REGRAS) {
      expect(r.codigo).toMatch(/^[A-Z_]+$/)
      expect(['auto', 'aprovar']).toContain(r.severidade)
      expect(typeof r.verificar).toBe('function')
    }
  })
  it('verificar de uma regra isolada funciona sobre o contexto montado', () => {
    const ctx = montarContexto(fixtureBug(), OPC)
    const regra = REGRAS.find(r => r.codigo === 'GER_ETAPA_A_FALTANDO')
    expect(regra.verificar(ctx)).toHaveLength(2)
  })
})
