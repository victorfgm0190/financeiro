import { describe, it, expect } from 'vitest'
import {
  gerarPlanoParcelas, vencimentos, competenciasReajuste, cicloDaCompetencia, proximoReajuste, basesPorCiclo,
  agendamentoDaParcela, planejarSincronizacao, cobertasDoContrato, confirmadosDe, planoConfirmacaoReajuste,
  idParcela, valorAtual, primeiroVencimento, diferencasParcela,
} from './parcelas.js'
import { addMeses, diaNoMes, mesesEntre } from './datas.js'

const BASE = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto 302', favorecido: 'Imobiliária Silva',
  data_inicio: '2026-01-10', data_fim: '2028-06-30', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 10,
  indice_reajuste: 'IPCA', bonificacao_valor: 200, bonificacao_meses: 3, tem_condominio: true,
  valor_condominio_previsto: 1300, dia_vencimento_condominio: 8, conta_id: 'cc1', categoria_id: 'cat-alug',
  categoria_condominio_id: 'cat-cond', favorecido_condominio: 'Cond. Edifício Sol',
}
const INDICES = { IPCA: { competencia: '2026-09', acumulado_12m: 5 } }

describe('datas', () => {
  it('soma meses e fixa o dia no último do mês', () => {
    expect(addMeses('2026-11', 3)).toBe('2027-02')
    expect(addMeses('2026-01', -1)).toBe('2025-12')
    expect(diaNoMes('2027-02', 31)).toBe('2027-02-28')
    expect(mesesEntre('2026-01', '2028-06')).toBe(29)
  })
})

describe('vencimentos', () => {
  it('primeiro vencimento: o dia no mês do início, ou no seguinte se já passou', () => {
    expect(primeiroVencimento('2026-01-10', 10)).toBe('2026-01-10')
    expect(primeiroVencimento('2026-01-15', 10)).toBe('2026-02-10')
  })
  it('com data de fim gera a vigência inteira', () => {
    const v = vencimentos(BASE, 'aluguel', { hoje: '2026-10-20' })
    expect(v[0]).toEqual({ numero: 1, vencimento: '2026-01-10', competencia: '2026-01' })
    expect(v.at(-1).vencimento).toBe('2028-06-10')
    expect(v).toHaveLength(30)
  })
  it('sem data de fim: até 12 meses depois do mês de hoje', () => {
    const v = vencimentos({ ...BASE, data_fim: null }, 'aluguel', { hoje: '2026-10-20' })
    expect(v.at(-1).competencia).toBe('2027-10')
  })
  it('periodicidade trimestral e única', () => {
    expect(vencimentos({ ...BASE, periodicidade: 'trimestral' }, 'aluguel', {}).slice(0, 3).map(x => x.competencia)).toEqual(['2026-01', '2026-04', '2026-07'])
    expect(vencimentos({ ...BASE, periodicidade: 'unica' }, 'aluguel', {})).toHaveLength(1)
  })
})

describe('reajuste', () => {
  it('aniversários de 12 meses; mês-base nunca antes de 1 ano', () => {
    expect(competenciasReajuste(BASE, '2028-06')).toEqual(['2027-01', '2028-01'])
    expect(competenciasReajuste({ ...BASE, mes_base_reajuste: 3 }, '2028-06')).toEqual(['2027-03', '2028-03'])
    expect(competenciasReajuste({ ...BASE, data_inicio: '2026-08-01', mes_base_reajuste: 3 }, '2029-12')).toEqual(['2028-03', '2029-03'])
    expect(competenciasReajuste({ ...BASE, indice_reajuste: 'NENHUM' }, '2028-06')).toEqual([])
  })
  it('ciclo e próximo reajuste', () => {
    expect(cicloDaCompetencia(BASE, '2026-12')).toBe(0)
    expect(cicloDaCompetencia(BASE, '2027-01')).toBe(1)
    expect(proximoReajuste(BASE, '2026-10-20')).toBe('2027-01-01')
    expect(proximoReajuste({ ...BASE, data_fim: '2026-12-31' }, '2026-10-20')).toBeNull()
  })
  it('bases: confirmado vale; os seguintes projetam pelo índice (FIXO usa o percentual)', () => {
    expect(basesPorCiclo(BASE, 2, { indices: INDICES })).toEqual([
      { base: 3900, status: 'confirmado' }, { base: 4095, status: 'projetado' }, { base: 4299.75, status: 'projetado' },
    ])
    expect(basesPorCiclo(BASE, 2, { indices: INDICES, confirmados: { 1: 4100 } })[2]).toEqual({ base: 4305, status: 'projetado' })
    expect(basesPorCiclo({ ...BASE, indice_reajuste: 'FIXO', percentual_fixo: 10 }, 1, {})[1].base).toBe(4290)
  })
})

describe('gerarPlanoParcelas', () => {
  const plano = gerarPlanoParcelas(BASE, { hoje: '2026-10-20', indices: INDICES })
  const aluguel = plano.filter(p => p.papel === 'aluguel')
  const cond = plano.filter(p => p.papel === 'condominio')
  it('bonificação nas 3 primeiras: 3.900 − 200 = 3.700', () => {
    expect(aluguel.slice(0, 4).map(p => p.valor)).toEqual([3700, 3700, 3700, 3900])
    expect(aluguel[0].composicao.itens).toEqual([
      { tipo: 'base', desc: 'Aluguel contratual', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
    ])
  })
  it('a partir do aniversário, projetado pelo IPCA de 12 meses', () => {
    const jan27 = aluguel.find(p => p.competencia === '2027-01')
    expect(jan27).toMatchObject({ valor: 4095, valorStatus: 'projetado', numero: 13, total: 30 })
    expect(aluguel.find(p => p.competencia === '2026-12').valorStatus).toBe('confirmado')
  })
  it('condomínio previsto, dia próprio, id determinístico', () => {
    expect(cond[0]).toMatchObject({ vencimento: '2026-02-08', valor: 1300, id: idParcela('c1', 'condominio', '2026-02') })
    expect(cond[0].id).toBe('ctr_c1_condominio_202602')
  })
  it('apartirDe corta o começo; valoresMantidos troca o valor e marca manual', () => {
    const p = gerarPlanoParcelas(BASE, { hoje: '2026-10-20', apartirDe: '2026-10', valoresMantidos: { aluguel: { '2026-10': 3500 } } })
    const out = p.find(x => x.papel === 'aluguel' && x.competencia === '2026-10')
    expect(p.filter(x => x.papel === 'aluguel')[0].competencia).toBe('2026-10')
    expect(out).toMatchObject({ valor: 3500, valorStatus: 'confirmado' })
    expect(out.composicao.manual).toBe(true)
  })
})

describe('agendamento e sincronização', () => {
  const plano = gerarPlanoParcelas(BASE, { hoje: '2026-10-20', indices: INDICES, apartirDe: '2026-10' })
  const ag = agendamentoDaParcela(BASE, plano[0])
  it('agendamento único, sem auto-registro, com o contrato', () => {
    expect(ag).toMatchObject({
      id: 'ctr_c1_aluguel_202610', frequency: 'once', startDate: '2026-10-10', amount: 3900, autoRegister: false,
      contratoId: 'c1', contratoPapel: 'aluguel', transactionType: 'expense', accountId: 'cc1', payee: 'Imobiliária Silva',
      description: 'Aluguel · Apto 302',
    })
    const c = agendamentoDaParcela(BASE, plano.find(p => p.papel === 'condominio'))
    expect(c).toMatchObject({ categoryId: 'cat-cond', payee: 'Cond. Edifício Sol' })
  })
  it('primeira vez cria tudo; de novo não muda nada (mesmo com o JSONB reordenado)', () => {
    const r = planejarSincronizacao(BASE, [], plano)
    expect(r.criar).toHaveLength(plano.length)
    const reordenar = (o) => Object.fromEntries(Object.entries(o).reverse())
    const salvos = r.criar.map(s => ({ ...s, composicao: reordenar(s.composicao) }))
    const r2 = planejarSincronizacao(BASE, salvos, plano)
    expect(r2).toEqual({ criar: [], atualizar: [], remover: [] })
  })
  it('paga nunca muda; pendente acompanha o plano; sobra pendente sai', () => {
    const existentes = planejarSincronizacao(BASE, [], plano).criar
    existentes[0] = { ...existentes[0], registered: ['2026-10-10'] }
    const novo = { ...BASE, valor_base: 4000, data_fim: '2027-06-30' }
    const r = planejarSincronizacao(novo, existentes, gerarPlanoParcelas(novo, { hoje: '2026-10-20', indices: INDICES, apartirDe: '2026-10' }), { apartirDe: '2026-10' })
    expect(r.atualizar.find(m => m.id === 'ctr_c1_aluguel_202610')).toBeUndefined()
    expect(r.atualizar.find(m => m.id === 'ctr_c1_aluguel_202611').changes.amount).toBe(4000)
    expect(r.remover.map(s => s.id)).toContain('ctr_c1_aluguel_202707')
    expect(r.criar).toEqual([])
  })
  it('excluída à mão e mês coberto por série vinculada não voltam', () => {
    const r = planejarSincronizacao(BASE, [], plano, { excluidas: ['ctr_c1_aluguel_202611'], cobertas: { aluguel: new Set(['2026-10']) } })
    const ids = r.criar.map(s => s.id)
    expect(ids).not.toContain('ctr_c1_aluguel_202611')
    expect(ids).not.toContain('ctr_c1_aluguel_202610')
    expect(ids).toContain('ctr_c1_aluguel_202612')
  })
  it('soExtender só cria depois da última existente', () => {
    const semFim = { ...BASE, data_fim: null }
    const atual = planejarSincronizacao(semFim, [], gerarPlanoParcelas(semFim, { hoje: '2026-10-20', apartirDe: '2026-10' })).criar
    const depois = gerarPlanoParcelas(semFim, { hoje: '2027-01-05', apartirDe: '2026-10' })
    const r = planejarSincronizacao(semFim, atual, depois, { soExtender: true })
    expect(r.criar.filter(s => s.contratoPapel === 'aluguel').map(s => s.startDate)).toEqual(['2027-11-10', '2027-12-10', '2028-01-10'])
    expect(r.atualizar).toEqual([])
    expect(planejarSincronizacao(semFim, [], depois, { soExtender: true }).criar).toEqual([])
  })
  it('valor manual não é sobrescrito', () => {
    const ex = { ...ag, amount: 3555, composicao: { ...ag.composicao, manual: true } }
    expect(diferencasParcela(ex, ag)).toEqual({})
  })
})

describe('cobertas, confirmados e valor atual', () => {
  it('meses cobertos pelas séries vinculadas', () => {
    const serie = { id: 'sch_1', contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'monthly', registered: ['2026-08-10', '2026-09-10'], skipped: [] }
    const unica = { id: 'sch_2', contratoId: 'c1', contratoPapel: 'condominio', frequency: 'once', startDate: '2026-10-08' }
    const c = cobertasDoContrato(BASE, [serie, unica])
    expect([...c.aluguel]).toEqual(['2026-08', '2026-09'])
    expect([...c.condominio]).toEqual(['2026-10'])
  })
  it('confirmados vêm das parcelas confirmadas de ciclo > 0', () => {
    const s = [{ id: 'ctr_c1_aluguel_202701', contratoPapel: 'aluguel', valorStatus: 'confirmado', composicao: { ciclo: 1, base: 4100 } }]
    expect(confirmadosDe(BASE, s)).toEqual({ 1: 4100 })
  })
  it('valor atual = próxima pendente', () => {
    const s = [
      { id: 'ctr_c1_aluguel_202609', contratoPapel: 'aluguel', startDate: '2026-09-10', amount: 3700, registered: ['2026-09-10'] },
      { id: 'ctr_c1_aluguel_202610', contratoPapel: 'aluguel', startDate: '2026-10-10', amount: 3900, registered: [] },
    ]
    expect(valorAtual(BASE, s)).toBe(3900)
  })
})

describe('confirmar reajuste', () => {
  const parcelas = planejarSincronizacao(BASE, [], gerarPlanoParcelas(BASE, { hoje: '2026-10-20', indices: INDICES, apartirDe: '2026-10' })).criar
  it('aceitar outro valor: o ciclo inteiro confirma e os seguintes reprojetam', () => {
    const r = planoConfirmacaoReajuste(BASE, parcelas, 'ctr_c1_aluguel_202701', 4100, { indices: INDICES })
    expect(r.ciclo).toBe(1)
    expect(r.baseAnterior).toBe(3900)
    expect(r.percentual).toBeCloseTo(5.1282, 3)
    const doCiclo = r.mudancas.filter(m => m.antes.composicao.ciclo === 1)
    expect(doCiclo).toHaveLength(12)
    expect(doCiclo.every(m => m.changes.amount === 4100 && m.changes.valorStatus === 'confirmado')).toBe(true)
    const jan28 = r.mudancas.find(m => m.id === 'ctr_c1_aluguel_202801')
    expect(jan28.changes).toMatchObject({ amount: 4305, valorStatus: 'projetado' })
  })
  it('só esta: as demais ficam como estavam', () => {
    const r = planoConfirmacaoReajuste(BASE, parcelas, 'ctr_c1_aluguel_202701', 4100, { escopo: 'so_esta', indices: INDICES })
    expect(r.mudancas.map(m => m.id)).toEqual(['ctr_c1_aluguel_202701'])
  })
})

describe('valor editado fora do contrato', () => {
  it('parcela com valor ≠ composição conta como manual e não é sobrescrita', () => {
    const p = gerarPlanoParcelas(BASE, { hoje: '2026-10-20', apartirDe: '2026-10' })[0]
    const ag = agendamentoDaParcela(BASE, p)
    expect(diferencasParcela({ ...ag, amount: 3555 }, ag)).toEqual({})
  })
})
