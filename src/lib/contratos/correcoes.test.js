import { describe, it, expect } from 'vitest'
import {
  gerarPlanoParcelas, planejarSincronizacao, planoManutencao, proximaParcela, linhasDoContrato, agendamentoDaParcela,
  rotuloFrequencia, textoProjecao,
} from './parcelas.js'
import { candidatosVinculo, planoVinculo, SCORE_FORTE } from './vinculo.js'
import { validarEtapa, sugerirCategoria } from './validacao.js'
import { computeOccurrences } from '../occurrences.js'

// Correções pedidas depois do teste da Entrega 1 no teste1 (um bloco por item).
const C = {
  id: 'c1', tipo: 'pagar', objeto: '', numero: '', favorecido: 'Empresa ABC', favorecido_condominio: 'Cond. Ed. Sol',
  data_inicio: '2026-01-15', data_fim: '2028-06-30', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 15,
  indice_reajuste: 'IPCA', bonificacao_valor: 0, bonificacao_meses: 0, tem_condominio: true, valor_condominio_previsto: 1300,
  dia_vencimento_condominio: 5, conta_id: 'cc1', categoria_id: 'mor', categoria_condominio_id: 'mor', status: 'ativo',
}
const gerar = (contrato, opts) => planejarSincronizacao(contrato, [], gerarPlanoParcelas(contrato, { hoje: '2026-10-20', apartirDe: '2026-10', ...opts })).criar

describe('1. projeção sem índice e recálculo quando o índice chega', () => {
  it('sem índice: parcela projetada fica no valor anterior (0%) e guarda que foi sem índice', () => {
    const jan = gerar(C, { indices: {} }).find(s => s.id === 'ctr_c1_aluguel_202701')
    expect(jan).toMatchObject({ amount: 3900, valorStatus: 'projetado' })
    expect(jan.composicao.projecao).toEqual({ indice: 'IPCA', taxa_pct: null, competencia: null })
    expect(textoProjecao(jan.composicao.projecao)).toMatch(/sem IPCA \(0%\)/)
  })
  it('índice chegou: manutenção reprojeta só as projetadas pendentes, com o acumulado usado', () => {
    const parcelas = gerar(C, { indices: {} })
    parcelas.find(s => s.id === 'ctr_c1_aluguel_202702').registered = ['2027-02-15']
    const m = planoManutencao(C, parcelas, { hoje: '2026-10-20', indices: { IPCA: { acumulado_12m: 4.5, competencia: '2026-09' } } })
    const jan = m.find(x => x.id === 'ctr_c1_aluguel_202701')
    expect(jan.changes.amount).toBe(4075.5)
    expect(jan.changes.composicao.projecao).toEqual({ indice: 'IPCA', taxa_pct: 4.5, competencia: '2026-09' })
    expect(textoProjecao(jan.changes.composicao.projecao)).toBe('projeção IPCA 4,5% (12m até 09/2026)')
    expect(m.find(x => x.id === 'ctr_c1_aluguel_202702')).toBeUndefined()
    expect(m.find(x => x.id === 'ctr_c1_aluguel_202611')).toBeUndefined()
  })
  it('índice ainda desconhecido: manutenção não mexe em valor', () => {
    const parcelas = gerar(C, { indices: {} })
    expect(planoManutencao(C, parcelas, { hoje: '2026-10-20', indices: {} })).toEqual([])
  })
})

describe('3. próximo vencimento = menor pendente entre todos os papéis', () => {
  it('aluguel 15/12 pendente vence antes do condomínio 05/01', () => {
    const parcelas = gerar(C, {}).filter(s => s.startDate >= '2026-12-01')
    parcelas.find(s => s.id === 'ctr_c1_condominio_202612').registered = ['2026-12-05']
    expect(proximaParcela(C, parcelas)).toMatchObject({ id: 'ctr_c1_aluguel_202612', startDate: '2026-12-15' })
  })
  it('usa a data efetiva (exceção da ocorrência) e considera série vinculada recorrente', () => {
    const p = gerar(C, {}).filter(s => s.id === 'ctr_c1_aluguel_202612')
    p[0].overrides = { '2026-12-15': { date: '2026-12-10' } }
    const serie = { id: 'sch_x', contratoId: 'c1', contratoPapel: 'condominio', frequency: 'monthly', startDate: '2026-12-01', registered: [], skipped: [], overrides: {}, amount: 1200 }
    expect(proximaParcela(C, [...p, serie])).toMatchObject({ id: 'sch_x', startDate: '2026-12-01' })
    expect(proximaParcela(C, p)).toMatchObject({ startDate: '2026-12-10' })
  })
})

describe('4. pagas das séries vinculadas aparecem na ficha', () => {
  it('cada ocorrência paga da série vira linha paga (valor e data do lançamento)', () => {
    const serie = {
      id: 'sch_v', contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'monthly', startDate: '2026-09-15',
      registered: ['2026-09-15'], registeredMeta: { '2026-09-15': { lancamento_id: 'tx1' } }, skipped: [], overrides: {},
      amount: 3800, occurrenceType: 'installment', installments: 1, nextOccurrence: '2026-10-15',
    }
    const linhas = linhasDoContrato(C, [serie, ...gerar(C, {}).slice(0, 2)], [{ id: 'tx1', date: '2026-09-14', amount: 3812.5 }])
    const paga = linhas.find(l => l.paga)
    expect(paga).toMatchObject({ key: 'sch_v@2026-09-15', vencimento: '2026-09-14', valor: 3812.5, vinculada: true })
    expect(linhas.filter(l => !l.paga)).toHaveLength(2)
  })
})

describe('5. vínculo: pré-marcação e papel pela descrição', () => {
  const ag = (o) => ({ description: '', transactionType: 'expense', frequency: 'monthly', startDate: '2026-01-15', registered: [], skipped: [], overrides: {}, ...o })
  it('"Aluguel" pago à administradora do condomínio é sugerido como Aluguel', () => {
    const c = { ...C, favorecido_condominio: 'Imobiliária Lar' }
    const [r] = candidatosVinculo(c, [ag({ id: 'a', payee: 'Imobiliária Lar', description: 'Aluguel', amount: 3900 })])
    expect(r.papel).toBe('aluguel')
  })
  it('condomínio com favorecido e descrição iguais tem score forte (vem marcado)', () => {
    const r = candidatosVinculo(C, [
      ag({ id: 'a', payee: 'Empresa ABC', description: 'Aluguel', amount: 3900 }),
      ag({ id: 'b', payee: 'Cond. Ed. Sol', description: 'Condomínio', amount: 1300, startDate: '2026-01-05' }),
    ])
    expect(r.map(x => x.score >= SCORE_FORTE)).toEqual([true, true])
    expect(r.find(x => x.schedule.id === 'b').papel).toBe('condominio')
  })
  it('série com mês antigo sem pagar: vínculo não deixa pendente nenhuma', () => {
    const s = ag({ id: 'g', registered: ['2026-03-15'], startDate: '2026-01-15', nextOccurrence: null })
    const p = planoVinculo(s, 'aluguel', 'c1')
    expect(p.changes.nextOccurrence).toBe('2026-04-15')
    expect(computeOccurrences({ ...s, ...p.changes }, 5)).toEqual([])
  })
})

describe('6. frequência exibida', () => {
  it('Contrato · periodicidade (condomínio sempre mensal)', () => {
    expect(rotuloFrequencia({ periodicidade: 'trimestral' }, 'aluguel')).toBe('Contrato · trimestral')
    expect(rotuloFrequencia({ periodicidade: 'trimestral' }, 'condominio')).toBe('Contrato · mensal')
  })
})

describe('7. descrição do condomínio', () => {
  const plano = (c) => gerarPlanoParcelas(c, { hoje: '2026-10-20', apartirDe: '2026-10' })
  it('sem objeto/número usa o favorecido do condomínio, nunca o do aluguel', () => {
    const p = plano(C)
    expect(agendamentoDaParcela(C, p.find(x => x.papel === 'condominio')).description).toBe('Condomínio · Cond. Ed. Sol')
    expect(agendamentoDaParcela(C, p.find(x => x.papel === 'aluguel')).description).toBe('Aluguel · Empresa ABC')
  })
  it('com número do contrato usa o número nos dois papéis', () => {
    const c = { ...C, numero: '123' }
    expect(agendamentoDaParcela(c, plano(c).find(x => x.papel === 'condominio')).description).toBe('Condomínio · Contrato 123')
  })
  it('manutenção corrige a descrição das pendentes já criadas', () => {
    const antigas = gerar(C, {}).map(s => ({ ...s, description: s.description.replace('Cond. Ed. Sol', 'Empresa ABC') }))
    const m = planoManutencao(C, antigas, { hoje: '2026-10-20', indices: {} })
    expect(m.find(x => x.id === 'ctr_c1_condominio_202611').changes).toEqual({ description: 'Condomínio · Cond. Ed. Sol' })
  })
})

describe('8. validações do cadastro', () => {
  const f = { conta_id: 'cc1', categoria_id: 'mor', valor_base: '3.900,00', dia_vencimento: '15', bonificacao_valor: '', bonificacao_meses: '' }
  it('bonificação > 0 exige meses', () => {
    expect(validarEtapa(1, { ...f, bonificacao_valor: '200,00' })).toMatch(/quantos meses/)
    expect(validarEtapa(1, { ...f, bonificacao_valor: '200,00', bonificacao_meses: '0' })).toMatch(/quantos meses/)
    expect(validarEtapa(1, { ...f, bonificacao_valor: '200,00', bonificacao_meses: '3' })).toBe('')
    expect(validarEtapa(1, f)).toBe('')
  })
  it('categorias obrigatórias (aluguel; condomínio quando há condomínio)', () => {
    expect(validarEtapa(1, { ...f, categoria_id: '' })).toMatch(/categoria do aluguel/)
    expect(validarEtapa(3, { tem_condominio: true, valor_condominio_previsto: '1.300,00', categoria_condominio_id: '' })).toMatch(/categoria do condomínio/)
    expect(validarEtapa(3, { tem_condominio: false })).toBe('')
  })
  it('sugere "Moradia" do tipo certo', () => {
    const cats = [{ id: 'r', name: 'Moradia', type: 'income' }, { id: 'm', name: 'Moradia', type: 'expense' }]
    expect(sugerirCategoria(cats, 'expense')).toBe('m')
    expect(sugerirCategoria([{ id: 'x', name: 'Lazer', type: 'expense' }], 'expense')).toBe('')
  })
})
