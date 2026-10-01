import { describe, it, expect } from 'vitest'
import { executarRegras } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { planejarAjuste } from './ajustes'
import { OPC, GRUPOS, CONTAS, gasto, fixtureBug, porRegra } from './fixtures'

// Mesmo formato do botão "Fechar Fatura": { '<cardId>_<YYYY-MM>': true }.
const fechadas = (...yms) => Object.fromEntries(yms.map(ym => [`acc_itaupers_${ym}`, true]))
const comFechadas = (dados, mapa) => ({ ...dados, faturasFechadas: mapa })
const varrer = (tabela, dados, mapa = {}) => {
  const plano = planejarVarredura(tabela, executarRegras(comFechadas(dados, mapa), OPC), {}, { faturasFechadas: mapa })
  return { plano, tabela: aplicarPlano(tabela, plano, 't') }
}

describe('Faturas fechadas não são avaliadas', () => {
  it('pendência de fatura fechada não aparece', () => {
    const divs = executarRegras(comFechadas(fixtureBug(), fechadas('2026-10')), OPC)
    expect(divs.filter(d => d.fatura_ref === '10/2026')).toEqual([])
    const r = porRegra(divs)
    expect(r.GER_ETAPA_A_FALTANDO).toBeUndefined()
    expect(r.GER_FECHAMENTO_FATURA).toBeUndefined()
    expect(r.PARCELA_NUMERO_INCOERENTE).toBeUndefined()
  })

  it('o critério também vem de settings.faturasFechadas (estado do app)', () => {
    const d = { ...fixtureBug(), settings: { faturasFechadas: fechadas('2026-10') } }
    expect(porRegra(executarRegras(d, OPC)).GER_ETAPA_A_FALTANDO).toBeUndefined()
  })

  it('fatura fechada de OUTRO cartão não afeta este', () => {
    const d = comFechadas(fixtureBug(), { 'acc_outro_2026-10': true })
    expect(porRegra(executarRegras(d, OPC)).GER_ETAPA_A_FALTANDO).toHaveLength(2)
  })

  it('fechar a fatura ignora as pendências dela (status ignorada, resolvida_por fatura_fechada)', () => {
    const dados = fixtureBug()
    const t1 = varrer([], dados).tabela
    const da10 = t1.filter(p => p.fatura_ref === '10/2026').map(p => p.id).sort()
    expect(da10.length).toBeGreaterThan(0)

    const { plano, tabela: t2 } = varrer(t1, dados, fechadas('2026-10'))
    expect(plano.arquivar.sort()).toEqual(da10)
    expect(plano.resumo.arquivadas).toBe(da10.length)
    for (const id of da10) {
      expect(t2.find(p => p.id === id)).toMatchObject({ status: 'ignorada', resolvida_por: 'fatura_fechada' })
    }
    // Nada apagado: histórico mantido.
    expect(t2).toHaveLength(t1.length)
    // Rodar de novo com a fatura ainda fechada não muda nada.
    const { plano: p3 } = varrer(t2, dados, fechadas('2026-10'))
    expect(p3.arquivar).toEqual([])
    expect(p3.resolver).toEqual([])
  })

  it('reabrir a fatura volta a avaliar: divergência que continua reabre como pendente', () => {
    const dados = fixtureBug()
    const t1 = varrer([], dados).tabela
    const t2 = varrer(t1, dados, fechadas('2026-10')).tabela
    const { plano, tabela: t3 } = varrer(t2, dados, {})
    expect(plano.resumo.reabertas).toBeGreaterThan(0)
    for (const p of t3.filter(x => x.fatura_ref === '10/2026')) {
      expect(p).toMatchObject({ status: 'pendente', resolvida_por: null })
    }
  })

  it('reabrir a fatura: divergência corrigida enquanto estava fechada vira resolvida', () => {
    const dados = fixtureBug()
    const t1 = varrer([], dados).tabela
    const t2 = varrer(t1, dados, fechadas('2026-10')).tabela
    // Corrigido "por fora": o Jim.com novo deixa de existir.
    const corrigido = { ...dados, transactions: dados.transactions.filter(t => t.id !== 'tx_1789736376094_z41mpw3eroa') }
    const t3 = varrer(t2, corrigido, {}).tabela
    expect(t3.find(p => p.id === 'GER_ETAPA_A_FALTANDO|tx_1789736376094_z41mpw3eroa'))
      .toMatchObject({ status: 'resolvida', resolvida_por: 'varredura' })
  })

  it('ignorada pelo usuário continua ignorada ao reabrir a fatura', () => {
    const dados = fixtureBug()
    const t1 = varrer([], dados).tabela
    const alvo = t1.find(p => p.regra === 'PARCELA_NUMERO_INCOERENTE')
    Object.assign(alvo, { status: 'ignorada', resolvida_por: 'usuario' })
    const t2 = varrer(t1, dados, fechadas('2026-10')).tabela
    const t3 = varrer(t2, dados, {}).tabela
    expect(t3.find(p => p.id === alvo.id)).toMatchObject({ status: 'ignorada', resolvida_por: 'usuario' })
  })

  it('GER_SALDO_SUBCONTA não é arquivada quando a fatura que ela apontava fecha (muda para a próxima aberta)', () => {
    const dados = fixtureBug()
    const t1 = varrer([], dados, fechadas('2026-10')).tabela
    const saldo = (t) => t.find(p => p.regra === 'GER_SALDO_SUBCONTA')
    expect(saldo(t1).fatura_ref).toBe('07/2026')
    const t2 = varrer(t1, dados, fechadas('2026-07', '2026-10')).tabela
    expect(saldo(t2)).toMatchObject({ status: 'pendente', fatura_ref: '08/2026' })
  })

  it('Ajustar recusa gasto de fatura fechada', () => {
    const d = { ...fixtureBug(), settings: { faturasFechadas: fechadas('2026-10') } }
    const r = planejarAjuste(d, { regra: 'GER_ETAPA_A_FALTANDO', origem_id: 'tx_1789736376094_z41mpw3eroa' }, { agora: '2026-09-30T12:00:00Z' })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/fechada/)
  })
})

describe('Faturas fechadas — séries de parcelas usam a fechada só como referência', () => {
  const base = (transactions) => ({ transactions, schedules: [], accounts: CONTAS, gerencialGroups: GRUPOS })
  const parc = (id, n, fmy, extra = {}) => gasto(id, `Loja Y ${n}/3`, 100, fmy, {
    installmentNum: n, installmentTotal: 3, grupoGerencial: 'grp_D', serieId: 'serie_y', ...extra,
  })

  it('SERIE_PARCELAS_REPETIDA: parcela repetida entre fechada e aberta → pendência só na aberta', () => {
    const d = base([parc('y1', 1, '2026-07'), parc('y2a', 2, '2026-08'), parc('y2b', 2, '2026-09'), parc('y3', 3, '2026-10')])
    const r = porRegra(executarRegras(comFechadas(d, fechadas('2026-08')), { ...OPC, regras: ['SERIE_PARCELAS_REPETIDA'] }))
    expect(r.SERIE_PARCELAS_REPETIDA).toHaveLength(1)
    expect(r.SERIE_PARCELAS_REPETIDA[0].fatura_ref).toBe('09/2026')
    // As duas faturas fechadas: nenhuma pendência.
    const r2 = executarRegras(comFechadas(d, fechadas('2026-08', '2026-09')), { ...OPC, regras: ['SERIE_PARCELAS_REPETIDA'] })
    expect(r2).toEqual([])
  })

  it('PARCELA_DUPLICADA na mesma fatura fechada: nada; na mesma aberta: acusa', () => {
    const d = base([parc('y2a', 2, '2026-09', { serieId: null }), parc('y2b', 2, '2026-09', { serieId: null })])
    const regra = { ...OPC, regras: ['PARCELA_DUPLICADA'] }
    expect(executarRegras(comFechadas(d, fechadas('2026-09')), regra)).toEqual([])
    expect(executarRegras(d, regra)).toHaveLength(1)
  })

  it('SERIE_PARCELAS_INCOMPLETA: parcela faltando em fatura fechada não é pendência', () => {
    const d = base([parc('y1', 1, '2026-07'), parc('y3', 3, '2026-09')])
    const regra = { ...OPC, regras: ['SERIE_PARCELAS_INCOMPLETA'] }
    expect(executarRegras(d, regra)).toHaveLength(1)
    expect(executarRegras(comFechadas(d, fechadas('2026-08')), regra)).toEqual([])
  })

  it('PARCELA_NUMERO_INCOERENTE: parcela de origem numa fatura fechada serve de referência', () => {
    // 3/3 (aberta) gerada a partir do 1/3 que está numa fatura fechada: coerente.
    const d = base([
      parc('y1', 1, '2026-07', { payee: 'Loja Y 1/3', serieId: null }),
      parc('y3', 3, '2026-09', { payee: 'Loja Y 1/3', serieId: null }),
    ])
    const regra = { ...OPC, regras: ['PARCELA_NUMERO_INCOERENTE'] }
    expect(executarRegras(comFechadas(d, fechadas('2026-07')), regra)).toEqual([])
    // Sem a 1/3, a 3/3 aberta é incoerente; a fechada nunca gera pendência.
    const semOrigem = base([parc('y3', 3, '2026-09', { payee: 'Loja Y 1/3', serieId: null })])
    expect(executarRegras(semOrigem, regra).map(x => x.origem_id)).toEqual(['y3'])
    expect(executarRegras(comFechadas(semOrigem, fechadas('2026-09')), regra)).toEqual([])
  })

  it('SERIE_GRUPO_DIVERGENTE: aberta diferente do grupo das fechadas acusa; divergência só entre fechadas não', () => {
    const regra = { ...OPC, regras: ['SERIE_GRUPO_DIVERGENTE'] }
    const d = base([parc('y1', 1, '2026-07'), parc('y2', 2, '2026-08'), parc('y3', 3, '2026-09', { grupoGerencial: 'grp_1' })])
    const r = executarRegras(comFechadas(d, fechadas('2026-07', '2026-08')), regra)
    expect(r).toHaveLength(1)
    expect(r[0].fatura_ref).toBe('09/2026')
    expect(executarRegras(comFechadas(d, fechadas('2026-07', '2026-08', '2026-09')), regra)).toEqual([])
  })
})
