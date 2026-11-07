import { describe, it, expect } from 'vitest'
import { dataRepasse, diasProporcionais, valorProporcional, primeiroMes, competenciasRepasse, ehModoRepasse } from './repasse.js'
import {
  gerarPlanoParcelas, agendamentoDaParcela, planejarSincronizacao, linhasDoContrato, inicioDasParcelas, competenciaDaParcela, vencimentos,
} from './parcelas.js'
import { validarEtapa } from './validacao.js'

// Dados fictícios: nenhum nome real de administradora, inquilino, imóvel ou conta.
const CONTRATO = {
  id: 'c1', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  contraparte_nome: 'Inquilino Exemplo', data_inicio: '2026-03-10', data_fim: '2026-08-31', valor_base: 3000, periodicidade: 'mensal',
  dia_vencimento: 5, dia_repasse: 12, repasse_meses_depois: 1, indice_reajuste: 'NENHUM', conta_id: 'conta-x', categoria_id: 'cat-aluguel',
  bonificacao_valor: 0, bonificacao_meses: 0, tem_condominio: false,
}
const HOJE = '2026-04-01'

describe('repasse — datas e 1º mês', () => {
  it('modo repasse só em contrato a receber com a opção ligada', () => {
    expect(ehModoRepasse(CONTRATO)).toBe(true)
    expect(ehModoRepasse({ ...CONTRATO, tipo: 'pagar' })).toBe(false)
    expect(ehModoRepasse({ ...CONTRATO, modo_repasse: false })).toBe(false)
  })

  it('data do repasse: dia fixo, N meses depois da competência; dia inexistente vira o último', () => {
    expect(dataRepasse(CONTRATO, '2026-03')).toBe('2026-04-12')
    expect(dataRepasse({ ...CONTRATO, repasse_meses_depois: 0 }, '2026-03')).toBe('2026-03-12')
    expect(dataRepasse({ ...CONTRATO, repasse_meses_depois: 2 }, '2026-11')).toBe('2027-01-12')
    expect(dataRepasse({ ...CONTRATO, dia_repasse: 31 }, '2026-01')).toBe('2026-02-28')
    // Sem a coluna (contrato gravado antes): mês seguinte.
    expect(dataRepasse({ ...CONTRATO, repasse_meses_depois: undefined }, '2026-03')).toBe('2026-04-12')
  })

  it('1º mês proporcional: valor / 30 × dias, do dia do início ao fim do mês (máx. 30)', () => {
    expect(diasProporcionais('2026-03-10')).toBe(22)
    expect(diasProporcionais('2026-02-15')).toBe(14)
    expect(diasProporcionais('2026-03-01')).toBeNull()
    expect(diasProporcionais('2026-03-02')).toBe(30)
    expect(valorProporcional(3000, 22)).toBe(2200)
    expect(valorProporcional(2750, 14)).toBe(1283.33)
    expect(primeiroMes(CONTRATO)).toEqual({ valor: 2200, calculado: 2200, dias: 22, informado: false })
    expect(primeiroMes({ ...CONTRATO, valor_primeiro_mes: 2100 })).toEqual({ valor: 2100, calculado: 2200, dias: 22, informado: true })
    expect(primeiroMes({ ...CONTRATO, data_inicio: '2026-03-01' })).toBeNull()
    expect(primeiroMes({ ...CONTRATO, data_inicio: '2026-03-01', valor_primeiro_mes: 2900 })).toMatchObject({ valor: 2900, informado: true })
  })

  it('competências: mensal do mês do início ao mês do fim; mês sem cobrança não consome número', () => {
    const l = competenciasRepasse(CONTRATO, { hoje: HOJE })
    expect(l.map(v => [v.numero, v.competencia, v.vencimento])).toEqual([
      [1, '2026-03', '2026-04-12'], [2, '2026-04', '2026-05-12'], [3, '2026-05', '2026-06-12'],
      [4, '2026-06', '2026-07-12'], [5, '2026-07', '2026-08-12'], [6, '2026-08', '2026-09-12'],
    ])
    expect(l[0].vencimentoInquilino).toBe('2026-03-05')
    const p = competenciasRepasse(CONTRATO, { hoje: HOJE, comPulados: true, pular: new Set(['2026-05']) })
    expect(p.map(v => v.numero)).toEqual([1, 2, null, 3, 4, 5])
    // Sem fim: até 12 meses depois do mês de hoje.
    expect(competenciasRepasse({ ...CONTRATO, data_fim: null }, { hoje: HOJE }).at(-1).competencia).toBe('2027-04')
  })
})

describe('repasse — parcelas (agendamentos de recebimento)', () => {
  const plano = gerarPlanoParcelas(CONTRATO, { hoje: HOJE })

  it('id pela competência do aluguel, data = dia do repasse, 1º mês proporcional', () => {
    expect(plano.map(p => [p.id, p.vencimento, p.valor])).toEqual([
      ['ctr_c1_aluguel_202603', '2026-04-12', 2200], ['ctr_c1_aluguel_202604', '2026-05-12', 3000],
      ['ctr_c1_aluguel_202605', '2026-06-12', 3000], ['ctr_c1_aluguel_202606', '2026-07-12', 3000],
      ['ctr_c1_aluguel_202607', '2026-08-12', 3000], ['ctr_c1_aluguel_202608', '2026-09-12', 3000],
    ])
    expect(plano[0].composicao.itens).toEqual([{ tipo: 'base', desc: 'Aluguel contratual — proporcional 22 dias', valor: 2200, proporcional: true }])
    expect(plano[0].composicao).toMatchObject({ competencia: '2026-03', bruto: true })
    const informado = gerarPlanoParcelas({ ...CONTRATO, valor_primeiro_mes: 2150.5 }, { hoje: HOJE })
    expect(informado[0]).toMatchObject({ valor: 2150.5 })
    expect(informado[0].composicao.itens[0].desc).toBe('Aluguel contratual — 1º mês (informado)')
  })

  it('agendamento: recebimento da administradora, competência na descrição', () => {
    const ag = agendamentoDaParcela(CONTRATO, plano[1])
    expect(ag).toMatchObject({
      id: 'ctr_c1_aluguel_202604', transactionType: 'income', payee: 'Administradora Exemplo', startDate: '2026-05-12',
      amount: 3000, contratoId: 'c1', contratoPapel: 'aluguel', description: 'Repasse aluguel 04/2026 · Imóvel Exemplo',
    })
  })

  it('condomínio não vira boleto no modo repasse', () => {
    const p = gerarPlanoParcelas({ ...CONTRATO, tem_condominio: true, valor_condominio_previsto: 500 }, { hoje: HOJE })
    expect(p.every(x => x.papel === 'aluguel')).toBe(true)
  })

  it('a competência vem do id (a data é a do repasse): extensão, início e remoção usam a competência', () => {
    const existentes = plano.slice(0, 3).map(p => agendamentoDaParcela(CONTRATO, p))
    expect(competenciaDaParcela(existentes[0])).toBe('2026-03')
    expect(inicioDasParcelas(CONTRATO, existentes)).toBe('2026-03')
    const sinc = planejarSincronizacao(CONTRATO, existentes, plano, { soExtender: true })
    expect(sinc.criar.map(s => s.id)).toEqual(['ctr_c1_aluguel_202606', 'ctr_c1_aluguel_202607', 'ctr_c1_aluguel_202608'])
    // apartirDe = competência: a parcela de 03/2026 (repasse em 04/2026) não é removida por "abril".
    const so = planejarSincronizacao(CONTRATO, existentes, [], { apartirDe: '2026-04' })
    expect(so.remover.map(s => s.id)).toEqual(['ctr_c1_aluguel_202604', 'ctr_c1_aluguel_202605'])
  })

  it('ficha: linha com a competência do id e numeração pelo calendário do contrato', () => {
    const existentes = plano.slice(0, 2).map(p => agendamentoDaParcela(CONTRATO, p))
    const linhas = linhasDoContrato(CONTRATO, existentes, [], { hoje: HOJE, plano })
    expect(linhas.map(l => [l.competencia, l.vencimento, l.numero])).toEqual([['2026-03', '2026-04-12', 1], ['2026-04', '2026-05-12', 2]])
    expect(vencimentos(CONTRATO, 'aluguel', { hoje: HOJE })).toHaveLength(6)
  })

  it('contrato a pagar continua igual (sem proporcional, competência = mês do vencimento)', () => {
    const pagar = { ...CONTRATO, tipo: 'pagar', modo_repasse: false, dia_vencimento: 10 }
    const p = gerarPlanoParcelas(pagar, { hoje: HOJE })
    expect(p[0]).toMatchObject({ id: 'ctr_c1_aluguel_202603', vencimento: '2026-03-10', valor: 3000 })
    expect(p[0].composicao.competencia).toBeUndefined()
    expect(agendamentoDaParcela(pagar, p[0]).description).toBe('Aluguel · Imóvel Exemplo')
  })
})

describe('repasse — validação do cadastro', () => {
  const f = {
    modalidade: 'aluguel', tipo: 'receber', modo_repasse: true, perfil_id: 'pf', favorecido: 'Administradora Exemplo', data_inicio: '2026-03-10',
    sem_fim: true, conta_id: 'conta-x', categoria_id: 'cat', valor_base: '3.000,00', dia_vencimento: '5', dia_repasse: '12',
    bonificacao_valor: '', saldo_inicial_valor: '', saldo_inicial_competencia: '', valor_primeiro_mes: '',
  }
  it('exige administradora e dia do repasse; saldo inicial pede a competência', () => {
    expect(validarEtapa(0, { ...f, favorecido: '' })).toMatch(/administradora/)
    expect(validarEtapa(1, f)).toBe('')
    expect(validarEtapa(1, { ...f, dia_repasse: '' })).toMatch(/Dia do repasse/)
    expect(validarEtapa(1, { ...f, saldo_inicial_valor: '150,00' })).toMatch(/competência do saldo inicial/)
    expect(validarEtapa(1, { ...f, saldo_inicial_valor: '150,00', saldo_inicial_competencia: '2026-03' })).toBe('')
    // Fora do modo repasse o dia do repasse não é pedido.
    expect(validarEtapa(1, { ...f, modo_repasse: false, dia_repasse: '' })).toBe('')
  })
})
