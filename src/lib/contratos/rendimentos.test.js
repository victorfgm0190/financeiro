import { describe, it, expect } from 'vitest'
import { competenciasDoRepasse } from './parcelas.js'
import { rendimentosRepasse, rendimentosDiretos, somarRelatorios, conferenciaInforme, mesesDeReferencia, tipoDeducao } from './rendimentos.js'

// Dados fictícios. Caso de referência aprovado em 07/11/2026 (aluguel 2.200, adm 10%, início 21/02/2026).
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
  informes_adm: { 2026: { rendimentos: 16000, deducoes: null } },
}
const HOJE = '2026-02-25'
const linhas = competenciasDoRepasse(CONTRATO, { hoje: HOJE })
const mes = (rel, ym) => rel.meses.find(m => m.mes === ym)

describe('rendimentos 2026 — visão "Pagamento do inquilino" (padrão)', () => {
  const rel = rendimentosRepasse(CONTRATO, linhas, { ano: 2026 })

  it('aluguel bruto de 02 a 09 = 586,67 + 7 × 2.200,00 = 15.986,67, mesmo nos meses sem repasse', () => {
    expect(rel.totais.bruto).toBe(15986.67)
    expect(mes(rel, '2026-02').bruto).toBe(586.67)
    for (const ym of ['2026-03', '2026-04', '2026-05']) {
      expect(mes(rel, ym).bruto).toBe(2200)
      expect(mes(rel, ym).repasse).toBe(0)
    }
    expect(mes(rel, '2026-01').bruto).toBe(0)
    expect(mes(rel, '2026-10').bruto).toBe(0)
  })

  it('repasses recebidos no ano = 7.301,65 (1.370,65 em 07; 1.977,00 em 08, 09 e 10), previstos sem registro', () => {
    expect(rel.totais.repasse).toBe(7301.65)
    expect(mes(rel, '2026-07').repasse).toBe(1370.65)
    expect(mes(rel, '2026-10').repasse).toBe(1977)
    expect(rel.totais.repassePrevisto).toBe(7301.65)
  })

  it('deduções dedutíveis por tipo; consumo e benfeitoria fora da base', () => {
    const m02 = mes(rel, '2026-02')
    expect(m02.dedutiveis).toMatchObject({ taxa_adm: 11.67, taxa_unica: 470, tarifa: 0 })
    expect(m02.totalDedutiveis).toBe(481.67)
    expect(m02.base).toBe(105)
    expect(m02.naoDedutiveis).toBe(121.86)
    expect(mes(rel, '2026-03').naoDedutiveis).toBe(4799.49)
    // adm: 11,67 + 7 × 220 = 1.551,67; taxa única 2.200; tarifa 4 × 3
    expect(rel.totais.dedutiveis).toMatchObject({ taxa_adm: 1551.67, taxa_unica: 2200, tarifa: 12 })
    expect(rel.totais.totalDedutiveis).toBe(3763.67)
    expect(rel.totais.base).toBe(12223)
    expect(rel.porTipo.consumo).toEqual({ dedutivel: 0, naoDedutivel: 121.86 })
    expect(rel.porTipo.benfeitoria).toEqual({ dedutivel: 0, naoDedutivel: 4799.49 })
  })

  it('saldo com a administradora no fim do mês: −16,86 em 02 … +1.370,65 em 06 (repasse cai em 07) … 0 em 10', () => {
    expect(mes(rel, '2026-01').saldoFim).toBeNull()
    expect(mes(rel, '2026-02').saldoFim).toBe(-16.86)
    expect(mes(rel, '2026-05').saldoFim).toBe(-606.35)
    expect(mes(rel, '2026-06').saldoFim).toBe(1370.65)
    expect(mes(rel, '2026-07').saldoFim).toBe(1977)
    expect(mes(rel, '2026-10').saldoFim).toBe(0)
    // Identidade do mês: saldo anterior + resultado − repasse.
    expect(mes(rel, '2026-07').saldoFim).toBe(Math.round((1370.65 + mes(rel, '2026-07').resultado - 1370.65) * 100) / 100)
  })

  it('data real do pagamento do inquilino muda o mês do aluguel', () => {
    const c = { ...CONTRATO, competencias: [...CONTRATO.competencias, { competencia: '2026-09', status: 'aberta', itens: [], data_pagamento_inquilino: '2026-10-02' }] }
    const r = rendimentosRepasse(c, competenciasDoRepasse(c, { hoje: HOJE }), { ano: 2026 })
    expect(mes(r, '2026-09').bruto).toBe(0)
    expect(mes(r, '2026-10').bruto).toBe(2200)
    expect(r.totais.bruto).toBe(15986.67)
  })
})

describe('outras visões', () => {
  it('Competência: o mesmo total no ano; Repasse: 02 a 06 entram em 07 (o repasse que as quitou)', () => {
    const comp = rendimentosRepasse(CONTRATO, linhas, { ano: 2026, referencia: 'competencia' })
    expect(comp.totais.bruto).toBe(15986.67)
    const rep = rendimentosRepasse(CONTRATO, linhas, { ano: 2026, referencia: 'repasse' })
    expect(mes(rep, '2026-07').bruto).toBe(586.67 + 4 * 2200)
    expect(mes(rep, '2026-10').bruto).toBe(2200)
    expect(rep.totais.bruto).toBe(15986.67)
    expect(mesesDeReferencia(linhas, 'repasse').slice(0, 5)).toEqual(['2026-07', '2026-07', '2026-07', '2026-07', '2026-07'])
  })

  it('repasse registrado usa a data e o valor reais', () => {
    const l = competenciasDoRepasse(CONTRATO, { hoje: HOJE, repassesReais: { '2026-06': 1360 } })
    const r = rendimentosRepasse(CONTRATO, l, { ano: 2026, datasRepasse: { '2026-06': { valor: 1360, data: '2026-07-12' } } })
    expect(mes(r, '2026-07').repasse).toBe(1360)
    expect(mes(r, '2026-07').repassePrevisto).toBe(0)
    expect(mes(r, '2026-07').saldoFim).toBe(1987.65)
  })

  it('ano seguinte sem competências: tudo zero, saldo final do ano anterior', () => {
    const r = rendimentosRepasse(CONTRATO, linhas, { ano: 2027 })
    expect(r.totais.bruto).toBe(0)
    expect(r.saldoInicioAno).toBe(0)
  })

  it('contrato sem administradora: aluguel recebido direto, sem deduções', () => {
    const r = rendimentosDiretos([
      { competencia: '2026-01', data: '2026-02-05', valor: 1500, recebido: true },
      { competencia: '2026-02', data: '2026-03-05', valor: 1500, recebido: false },
    ], { ano: 2026 })
    expect(mes(r, '2026-02')).toMatchObject({ bruto: 1500, base: 1500, repasse: 1500, repassePrevisto: 0 })
    expect(mes(r, '2026-03').repassePrevisto).toBe(1500)
    const c = rendimentosDiretos([{ competencia: '2026-01', data: '2026-02-05', valor: 1500, recebido: true }], { ano: 2026, referencia: 'competencia' })
    expect(mes(c, '2026-01').bruto).toBe(1500)
  })

  it('todos os contratos: soma mês a mês e por tipo', () => {
    const a = rendimentosRepasse(CONTRATO, linhas, { ano: 2026 })
    const t = somarRelatorios([a, a])
    expect(t.totais.bruto).toBe(31973.34)
    expect(t.porTipo.benfeitoria.naoDedutivel).toBe(9598.98)
    expect(mes(t, '2026-02').saldoFim).toBe(-33.72)
  })

  it('conferência com o informe: diferença = informado − calculado; sem informe = null', () => {
    const rel = rendimentosRepasse(CONTRATO, linhas, { ano: 2026 })
    const c = conferenciaInforme(CONTRATO, 2026, rel.totais)
    expect(c.rendimentos).toEqual({ informado: 16000, calculado: 15986.67, diferenca: 13.33 })
    expect(c.deducoes).toEqual({ informado: null, calculado: 3763.67, diferenca: null })
  })

  it('tipo da dedução: despesa pela natureza', () => {
    expect(tipoDeducao({ tipo: 'despesa', natureza: 'iptu' })).toBe('iptu')
    expect(tipoDeducao({ tipo: 'despesa' })).toBe('outra')
    expect(tipoDeducao({ tipo: 'taxa_adm' })).toBe('taxa_adm')
  })
})
