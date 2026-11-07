import { describe, it, expect } from 'vitest'
import { calcularSaldos, repassesRegistrados } from './saldoRepasse.js'
import { comporCompetencia, resumoComposicao, conferirTaxaUnica, parcelaTaxaUnica, dedutiveisIr, itensParaGravar, novoItemManual } from './composicaoRepasse.js'
import { competenciasDoRepasse, gerarPlanoParcelas, agendamentoDaParcela, planejarSincronizacao } from './parcelas.js'

// Dados fictícios (nenhum nome real). Caso de referência aprovado em 07/11/2026.
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, conta_id: 'conta-x',
  categoria_id: 'cat-aluguel', taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm',
  itens_repasse: [
    { id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [470, 865, 865], vigencia_inicio: '2026-02', ativo: true },
    { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Tarifa bancária', valor: 3, vigencia_inicio: '2026-06', ativo: true },
  ],
  competencias: [
    {
      competencia: '2026-02', status: 'aberta', itens: [
        { chave: 'adm', tipo: 'taxa_adm', origem: 'auto', informado: true, valor: -11.67, valor_calculado: -58.67, dedutivel_ir: true },
        { chave: 'm:a', tipo: 'despesa', natureza: 'consumo', descricao: 'Água', valor: -96.73, origem: 'manual', dedutivel_ir: false },
        { chave: 'm:b', tipo: 'despesa', natureza: 'consumo', descricao: 'Luz', valor: -25.13, origem: 'manual', dedutivel_ir: false },
      ],
    },
    {
      competencia: '2026-03', status: 'aberta', itens: [
        { chave: 'm:c', tipo: 'benfeitoria', descricao: 'Reparo feito pelo inquilino', valor: -4799.49, origem: 'manual', somar_ao_bem: true, dedutivel_ir: false },
      ],
    },
  ],
}
const HOJE = '2026-02-25'
const porComp = (linhas) => Object.fromEntries(linhas.map(l => [l.competencia, l]))

describe('caso de referência: aluguel 2.200, adm 10%, início 21/02/2026', () => {
  const linhas = competenciasDoRepasse(CONTRATO, { hoje: HOJE })
  const m = porComp(linhas)

  it('1º mês proporcional 586,67; adm informada 11,67 guarda o calculado; taxa única 470/865/865; tarifa a partir de 06', () => {
    const it02 = m['2026-02'].itens
    expect(it02.find(i => i.tipo === 'aluguel').valor).toBe(586.67)
    expect(it02.find(i => i.tipo === 'taxa_adm')).toMatchObject({ valor: -11.67, valor_calculado: -58.67, informado: true })
    expect(it02.find(i => i.tipo === 'taxa_unica')).toMatchObject({ valor: -470, descricao: 'Intermediação 1/3' })
    expect(m['2026-03'].itens.find(i => i.tipo === 'taxa_unica')).toMatchObject({ valor: -865, descricao: 'Intermediação 2/3' })
    expect(m['2026-04'].itens.find(i => i.tipo === 'taxa_unica')).toMatchObject({ valor: -865, descricao: 'Intermediação 3/3' })
    expect(m['2026-05'].itens.some(i => i.tipo === 'taxa_unica')).toBe(false)
    expect(m['2026-03'].itens.find(i => i.tipo === 'taxa_adm')).toMatchObject({ valor: -220, informado: false })
    expect(m['2026-05'].itens.some(i => i.tipo === 'tarifa')).toBe(false)
    expect(m['2026-06'].itens.find(i => i.tipo === 'tarifa')).toMatchObject({ valor: -3 })
  })

  it('saldos: 02 = −16,86 · 03 = −3.701,35 · 04 = −2.586,35 · 05 = −606,35 · 06 = +1.370,65 · 07 a 09 = 1.977,00', () => {
    expect(linhas.map(l => [l.competencia, l.saldo, l.repasse])).toEqual([
      ['2026-02', -16.86, 0], ['2026-03', -3701.35, 0], ['2026-04', -2586.35, 0], ['2026-05', -606.35, 0],
      ['2026-06', 1370.65, 1370.65], ['2026-07', 1977, 1977], ['2026-08', 1977, 1977], ['2026-09', 1977, 1977],
    ])
    expect(m['2026-02']).toMatchObject({ bruto: 586.67, resultado: -16.86, deducoes: 603.53 })
    expect(m['2026-06']).toMatchObject({ saldo_anterior: -606.35, resultado: 1977, transportado: 0 })
  })

  it('sem repasse de 02 a 05: nenhum agendamento; 1º repasse em 10/07/2026', () => {
    const plano = gerarPlanoParcelas(CONTRATO, { hoje: HOJE })
    expect(plano.map(p => [p.id, p.vencimento, p.valor])).toEqual([
      ['ctr_c9_aluguel_202606', '2026-07-10', 1370.65], ['ctr_c9_aluguel_202607', '2026-08-10', 1977],
      ['ctr_c9_aluguel_202608', '2026-09-10', 1977], ['ctr_c9_aluguel_202609', '2026-10-10', 1977],
    ])
    expect(plano[0].composicao).toMatchObject({ tipo: 'repasse', competencia: '2026-06', saldo_anterior: -606.35, resultado: 1977, saldo: 1370.65, total: 1370.65 })
    expect(agendamentoDaParcela(CONTRATO, plano[0])).toMatchObject({ transactionType: 'income', payee: 'Administradora Exemplo', amount: 1370.65 })
  })

  it('competência que fica ≤ 0 tem o agendamento pendente removido (nunca vale zero nem negativo)', () => {
    const semComposicao = { ...CONTRATO, competencias: [] }
    const antes = gerarPlanoParcelas(semComposicao, { hoje: HOJE }).map(p => agendamentoDaParcela(semComposicao, p))
    expect(antes.map(s => s.id)).toContain('ctr_c9_aluguel_202603')
    const sinc = planejarSincronizacao(CONTRATO, antes, gerarPlanoParcelas(CONTRATO, { hoje: HOJE }))
    expect(sinc.remover.map(s => s.id).sort()).toEqual(['ctr_c9_aluguel_202602', 'ctr_c9_aluguel_202603', 'ctr_c9_aluguel_202604', 'ctr_c9_aluguel_202605'])
    expect(sinc.atualizar.map(a => [a.id, a.changes.amount])).toEqual([['ctr_c9_aluguel_202606', 1370.65]])
  })

  it('dedutíveis para IR: adm, tarifa e taxa única por padrão; consumo e benfeitoria não', () => {
    expect(dedutiveisIr(m['2026-02'].itens)).toBe(481.67)
    expect(dedutiveisIr(m['2026-03'].itens)).toBe(1085)
  })
})

describe('saldo com a administradora', () => {
  it('meses negativos seguidos acumulam; o positivo repassa tudo e zera', () => {
    const r = calcularSaldos({}, [
      { competencia: '2026-01', resultado: -100 }, { competencia: '2026-02', resultado: -50 },
      { competencia: '2026-03', resultado: 120 }, { competencia: '2026-04', resultado: 500 },
    ])
    expect(r.map(l => [l.saldo, l.repasse, l.transportado])).toEqual([[-100, 0, -100], [-150, 0, -150], [-30, 0, -30], [470, 470, 0]])
  })

  it('saldo zero não repassa (nem agendamento de valor zero)', () => {
    const r = calcularSaldos({}, [{ competencia: '2026-01', resultado: -10 }, { competencia: '2026-02', resultado: 10 }])
    expect(r[1]).toMatchObject({ saldo: 0, repasse: 0 })
  })

  it('repasse real diferente do calculado (sem ajuste): o real fica e a diferença passa para a seguinte', () => {
    const r = calcularSaldos({}, [{ competencia: '2026-01', resultado: 1000, repasseReal: 990 }, { competencia: '2026-02', resultado: 1000 }])
    expect(r.map(l => [l.saldo, l.transportado])).toEqual([[1000, 10], [1010, 0]])
  })

  it('saldo inicial com a administradora entra antes da competência informada; as anteriores ficam fora', () => {
    const r = calcularSaldos({ saldo_inicial_adm: -300, saldo_inicial_competencia: '2026-03' }, [
      { competencia: '2026-02', resultado: 900 }, { competencia: '2026-03', resultado: 1000 },
    ])
    expect(r[0]).toMatchObject({ foraDoSaldo: true, repasse: 0 })
    expect(r[1]).toMatchObject({ saldo_anterior: -300, saldo: 700, repasse: 700 })
  })

  it('repasses registrados: valor do lançamento da baixa, pela competência do id', () => {
    const s = [{ id: 'ctr_c9_aluguel_202606', contratoId: 'c9', contratoPapel: 'aluguel', amount: 1370.65, registered: ['2026-07-10'], registeredMeta: { '2026-07-10': { lancamento_id: 't1' } } }]
    expect(repassesRegistrados(CONTRATO, s, [{ id: 't1', amount: 1360 }])).toEqual({ '2026-06': 1360 })
  })
})

describe('composição do repasse', () => {
  it('base "bruto menos taxas": adm sobre o aluguel menos a taxa única do mês', () => {
    const c = { ...CONTRATO, taxa_adm_base: 'bruto_menos_taxas', competencias: [] }
    const m = porComp(competenciasDoRepasse(c, { hoje: HOJE }))
    expect(m['2026-02'].itens.find(i => i.tipo === 'taxa_adm').valor).toBe(-11.67)
    expect(m['2026-03'].itens.find(i => i.tipo === 'taxa_adm').valor).toBe(-133.5)
  })

  it('competência fechada vale como foi gravada (o contrato mudar não mexe nela)', () => {
    const linha = { competencia: '2026-05', status: 'fechada', itens: [{ chave: 'aluguel', tipo: 'aluguel', valor: 2000, origem: 'auto' }] }
    expect(resumoComposicao(comporCompetencia(CONTRATO, '2026-05', { valor: 2200, desc: 'Aluguel' }, linha)).resultado).toBe(2000)
  })

  it('aberta: informado à mão fica; o resto segue o contrato', () => {
    const linha = { competencia: '2026-05', itens: [{ chave: 'aluguel', tipo: 'aluguel', valor: 2100, informado: true, origem: 'auto' }] }
    const itens = comporCompetencia(CONTRATO, '2026-05', { valor: 2200, desc: 'Aluguel' }, linha)
    expect(itens.find(i => i.tipo === 'aluguel')).toMatchObject({ valor: 2100, valor_calculado: 2200, informado: true })
    expect(itens.find(i => i.tipo === 'taxa_adm').valor).toBe(-210)
  })

  it('taxa única: aviso quando a soma das parcelas não bate com o total (não bloqueia)', () => {
    expect(conferirTaxaUnica({ valor: 2200, valores_parcelas: [470, 865, 865] })).toBeNull()
    expect(conferirTaxaUnica({ valor: 2200, valores_parcelas: [470, 865] })).toEqual({ soma: 1335, total: 2200, diferenca: 865 })
    expect(parcelaTaxaUnica({ vigencia_inicio: '2026-02', valores_parcelas: [1, 2] }, '2026-04')).toBeNull()
  })

  it('gravação: automáticos guardam informado e calculado; manuais com natureza e "somar ao bem"', () => {
    const it = novoItemManual('despesa', { natureza: 'iptu' })
    expect(it).toMatchObject({ tipo: 'despesa', natureza: 'iptu', dedutivel_ir: true, origem: 'manual' })
    expect(novoItemManual('benfeitoria')).toMatchObject({ somar_ao_bem: false, dedutivel_ir: false })
    const g = itensParaGravar([{ chave: 'adm', tipo: 'taxa_adm', origem: 'auto', valor: -11.67, valor_calculado: -58.67, informado: true, descricao: 'Taxa' }])
    expect(g[0]).toEqual({ chave: 'adm', tipo: 'taxa_adm', descricao: 'Taxa', valor: -11.67, categoria_id: null, dedutivel_ir: false, origem: 'auto', informado: true, valor_calculado: -58.67 })
  })
})
