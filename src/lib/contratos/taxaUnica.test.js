import { describe, it, expect } from 'vitest'
import { parcelasIguais, formaDaTaxa, valoresDaForma, projetarTaxasUnicas } from './taxaUnica.js'
import { competenciasDoRepasse, gerarPlanoParcelas } from './parcelas.js'
import { itensParaGravar } from './composicaoRepasse.js'
import {
  conferirSaldoAnterior, linhaAjusteSaldo, montarConferencia, linhasDoProjetado, compararComProjetado, avisosTaxasUnicas,
  extratoPendente, linhasDaLeitura,
} from './conferenciaExtrato.js'
import { conferirRepasse } from './conferenciaExtrato.js'
import { saldoTaxasUnicas } from './taxaUnica.js'

// Dados fictícios. Caso de referência: aluguel 2.200, adm. 10%, início 21/02/2026, 1º mês 586,67,
// intermediação 2.200, tarifa 3,00 de 06/2026; adm. de 02 informada 11,67, Sanepar 96,73, luz 25,13
// (02) e benfeitoria 4.799,49 (03).
const tu = (valores_parcelas) => ({ id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas, vigencia_inicio: '2026-02', ativo: true })
const COMP_MANUAIS = [
  {
    competencia: '2026-02', status: 'aberta', itens: [
      { chave: 'adm', tipo: 'taxa_adm', origem: 'auto', informado: true, valor: -11.67, valor_calculado: -58.67, dedutivel_ir: true },
      { chave: 'm:a', tipo: 'despesa', natureza: 'consumo', descricao: 'Sanepar', valor: -96.73, origem: 'manual', dedutivel_ir: false },
      { chave: 'm:b', tipo: 'despesa', natureza: 'consumo', descricao: 'Luz', valor: -25.13, origem: 'manual', dedutivel_ir: false },
    ],
  },
  { competencia: '2026-03', status: 'aberta', itens: [{ chave: 'm:c', tipo: 'benfeitoria', descricao: 'Reparo', valor: -4799.49, origem: 'manual', somar_ao_bem: false, dedutivel_ir: false }] },
]
const contrato = (taxa, competencias = COMP_MANUAIS) => ({
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, conta_id: 'conta-x',
  categoria_id: 'cat-aluguel', taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm',
  itens_repasse: [taxa, { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Tarifa bancária', valor: 3, vigencia_inicio: '2026-06', ativo: true }],
  competencias,
})
const HOJE = '2026-02-25'
const porComp = (ls) => Object.fromEntries(ls.map(l => [l.competencia, l]))
const unicaDe = (l) => l.itens.filter(i => i.tipo === 'taxa_unica').reduce((a, i) => a - i.valor, 0)

describe('taxa única: forma de desconto', () => {
  it('parcelas iguais com os centavos na última: 2.200 em 3 = 733,33 + 733,33 + 733,34', () => {
    expect(parcelasIguais(2200, 3)).toEqual([733.33, 733.33, 733.34])
    expect(valoresDaForma(2200, 'uma_vez')).toEqual([2200])
    expect(valoresDaForma(2200, 'valores', { valores: [470, 865, 865] })).toEqual([470, 865, 865])
  })
  it('a forma sai dos valores gravados', () => {
    expect(formaDaTaxa(tu([2200]))).toEqual({ forma: 'uma_vez', n: 1 })
    expect(formaDaTaxa(tu([]))).toEqual({ forma: 'uma_vez', n: 1 })
    expect(formaDaTaxa(tu([733.33, 733.33, 733.34]))).toEqual({ forma: 'iguais', n: 3 })
    expect(formaDaTaxa(tu([470, 865, 865]))).toEqual({ forma: 'valores', n: 3 })
  })
})

describe('só projeção: intermediação nas três formas chega no mesmo repasse', () => {
  for (const [nome, valores] of [['de uma vez', [2200]], ['3 iguais', parcelasIguais(2200, 3)], ['valores informados', [470, 865, 865]]]) {
    it(`${nome}: saldo de 04/2026 = −2.586,35 e 1º repasse 1.370,65 em 06/2026`, () => {
      const c = contrato(tu(valores))
      const m = porComp(competenciasDoRepasse(c, { hoje: HOJE }))
      expect(m['2026-04'].saldo).toBe(-2586.35)
      expect(m['2026-06']).toMatchObject({ saldo: 1370.65, repasse: 1370.65 })
      expect(['2026-02', '2026-03', '2026-04'].reduce((a, k) => a + unicaDe(m[k]), 0)).toBeCloseTo(2200, 2)
      expect(m['2026-05'].itens.some(i => i.tipo === 'taxa_unica')).toBe(false)
      expect(gerarPlanoParcelas(c, { hoje: HOJE })[0]).toMatchObject({ competencia: '2026-06', valor: 1370.65 })
    })
  }
  it('3 iguais: 733,33 / 733,33 / 733,34 com "1/3", "2/3", "3/3"', () => {
    const m = porComp(competenciasDoRepasse(contrato(tu(parcelasIguais(2200, 3))), { hoje: HOJE }))
    expect(m['2026-02'].itens.find(i => i.tipo === 'taxa_unica')).toMatchObject({ valor: -733.33, descricao: 'Intermediação 1/3', taxa_id: 'tu' })
    expect(m['2026-04'].itens.find(i => i.tipo === 'taxa_unica')).toMatchObject({ valor: -733.34, descricao: 'Intermediação 3/3' })
  })
})

// Competência conferida pelo extrato: a composição real (aqui, a projetada com a taxa única do extrato).
function conferir(c, competencia, taxaReal) {
  const l = porComp(competenciasDoRepasse(c, { hoje: HOJE }))[competencia]
  const linhas = linhasDoProjetado(l.itens).filter(x => x.tipo !== 'taxa_unica')
  linhas.push({ id: 'tu', descricao: 'Intermediação', valor: -taxaReal, tipo: 'taxa_unica', taxa_id: 'tu' })
  const { itens, conferencia } = montarConferencia(c, l, linhas, { repasse: 0 }, { origem: 'manual', hoje: '2026-11-07' })
  const resto = (c.competencias || []).filter(x => x.competencia !== competencia)
  return { ...c, competencias: [...resto, { competencia, status: 'fechada', itens: itensParaGravar(itens), conferencia }] }
}

describe('projeção "de uma vez" + conferência de 02, 03 e 04 com 470 / 865 / 865', () => {
  const base = contrato(tu([2200]))
  it('projeção pura: 2.200 em 02', () => {
    expect(unicaDe(porComp(competenciasDoRepasse(base, { hoje: HOJE }))['2026-02'])).toBe(2200)
  })
  it('02 conferida com 470 → 03 projeta 1.730 ("saldo a descontar")', () => {
    const c = conferir(base, '2026-02', 470)
    const m = porComp(competenciasDoRepasse(c, { hoje: HOJE }))
    expect(m['2026-02'].conferida).toBe(true)
    expect(unicaDe(m['2026-02'])).toBe(470)
    expect(m['2026-03'].itens.find(i => i.tipo === 'taxa_unica')).toMatchObject({ valor: -1730, descricao: 'Intermediação (saldo a descontar)' })
    expect(unicaDe(m['2026-04'])).toBe(0)
  })
  it('03 conferida com 865 → 04 projeta 865; 04 conferida com 865 → zerou; mesmo resultado final', () => {
    let c = conferir(base, '2026-02', 470)
    c = conferir(c, '2026-03', 865)
    let m = porComp(competenciasDoRepasse(c, { hoje: HOJE }))
    expect(unicaDe(m['2026-04'])).toBe(865)
    c = conferir(c, '2026-04', 865)
    m = porComp(competenciasDoRepasse(c, { hoje: HOJE }))
    for (const k of ['2026-05', '2026-06', '2026-07']) expect(unicaDe(m[k])).toBe(0)
    expect(m['2026-04'].saldo).toBe(-2586.35)
    expect(m['2026-06']).toMatchObject({ saldo: 1370.65, repasse: 1370.65 })
    const lista = competenciasDoRepasse(c, { hoje: HOJE }).map(l => ({ competencia: l.competencia, cobrada: !l.semCobranca, linha: l.linha }))
    expect(Object.keys(projetarTaxasUnicas(c, lista).tu)).toEqual(['2026-02', '2026-03', '2026-04'])
  })
  it('extrato que traz mais do que falta: avisa (não bloqueia)', () => {
    const c = conferir(base, '2026-02', 2000)
    const linhas = competenciasDoRepasse(c, { hoje: HOJE }).map(l => ({ competencia: l.competencia, cobrada: !l.semCobranca, linha: l.linha }))
    const saldos = saldoTaxasUnicas(c, linhas, '2026-03')
    expect(saldos.tu).toMatchObject({ total: 2200, descontado: 2000, falta: 200 })
    const avisos = avisosTaxasUnicas([{ tipo: 'taxa_unica', taxa_id: 'tu', valor: -865 }], saldos, c)
    expect(avisos[0]).toMatch(/desconta R\$ 865,00, mas faltavam R\$ 200,00/)
  })
})

describe('conferência: saldo anterior, comparação e repasse conferido', () => {
  it('saldo anterior do extrato diferente do Finup → aviso e ajuste de R$ X', () => {
    const l = porComp(competenciasDoRepasse(contrato(tu([470, 865, 865])), { hoje: HOJE }))['2026-04']
    expect(l.saldo_anterior).toBe(-3701.35)
    const dif = conferirSaldoAnterior(-3700, l.saldo_anterior)
    expect(dif).toEqual({ extrato: -3700, finup: -3701.35, diferenca: 1.35 })
    expect(conferirSaldoAnterior(-3701.35, l.saldo_anterior)).toBeNull()
    const linhas = [...linhasDoProjetado(l.itens), linhaAjusteSaldo(dif.diferenca)]
    const { resumo, itens } = montarConferencia(contrato(tu([470, 865, 865])), l, linhas, {}, { hoje: '2026-11-07' })
    expect(itens.at(-1)).toMatchObject({ tipo: 'ajuste', valor: 1.35, origem: 'manual' })
    // Com o ajuste, o saldo do Finup bate com o do extrato.
    expect(resumo.saldo).toBe(Math.round((-3700 + l.resultado) * 100) / 100)
  })

  it('compara lido × projetado por tipo (taxa única pela taxa do contrato)', () => {
    const c = contrato(tu([470, 865, 865]))
    const l = porComp(competenciasDoRepasse(c, { hoje: HOJE }))['2026-02']
    const linhas = linhasDaLeitura({ itens: [
      { descricao: 'Aluguel 02/2026', valor: 586.67, natureza: 'credito' },
      { descricao: 'Taxa de administração', valor: 11.67, natureza: 'debito' },
      { descricao: 'Intermediação 1/3', valor: 500, natureza: 'debito' },
      { descricao: 'SANEPAR', valor: 96.73, natureza: 'debito' },
    ] }, c)
    expect(linhas.map(x => [x.tipo, x.valor, x.taxa_id, x.natureza])).toEqual([
      ['aluguel', 586.67, null, null], ['taxa_adm', -11.67, null, null], ['taxa_unica', -500, 'tu', null], ['despesa', -96.73, null, 'consumo'],
    ])
    const cmp = Object.fromEntries(compararComProjetado(linhas, l.itens, c).map(x => [x.chave, x]))
    expect(cmp['taxa_unica:tu']).toMatchObject({ rotulo: 'Intermediação', lido: -500, projetado: -470, diferenca: -30 })
    expect(cmp.despesa).toMatchObject({ lido: -96.73, projetado: -121.86, diferenca: 25.13 })
  })

  it('repasse conferido = líquido do extrato: vira o valor do agendamento e a diferença passa adiante', () => {
    const c0 = contrato(tu([470, 865, 865]))
    const l = porComp(competenciasDoRepasse(c0, { hoje: HOJE }))['2026-06']
    const { itens, conferencia } = montarConferencia(c0, l, linhasDoProjetado(l.itens), { repasse: 1360 }, { hoje: '2026-11-07' })
    const c = { ...c0, competencias: [...c0.competencias, { competencia: '2026-06', status: 'fechada', itens: itensParaGravar(itens), conferencia }] }
    const m = porComp(competenciasDoRepasse(c, { hoje: HOJE }))
    expect(m['2026-06']).toMatchObject({ repasse: 1360, transportado: 10.65, conferida: true })
    expect(m['2026-07'].saldo).toBe(1987.65)
    const plano = gerarPlanoParcelas(c, { hoje: HOJE })
    expect(plano[0]).toMatchObject({ competencia: '2026-06', valor: 1360 })
    expect(plano[0].composicao.conferida).toBe(true)
  })
})

describe('lembrete do extrato', () => {
  const c = contrato(tu([2200]))
  const linhas = (cc) => competenciasDoRepasse(cc, { hoje: HOJE })
  it('a partir do dia 5 do mês do repasse, a competência anterior não conferida', () => {
    expect(extratoPendente(c, linhas(c), '2026-03-04')).toBeNull()
    expect(extratoPendente(c, linhas(c), '2026-03-05')).toEqual({ competencia: '2026-02', texto: 'Extrato de 02/2026 da Administradora Exemplo ainda não conferido' })
    expect(extratoPendente(c, linhas(c), '2026-04-20')?.competencia).toBe('2026-03')
    const conf = conferir(c, '2026-03', 865)
    expect(extratoPendente(conf, linhas(conf), '2026-04-20')).toBeNull()
  })
})

describe('conferirRepasse — valor do extrato × saldo do Finup', () => {
  it('maio: total −606,35 × saldo −653,35 → diferença 47,00 (os dois negativos também comparam)', () => {
    expect(conferirRepasse(null, -653.35, -606.35)).toEqual({ extrato: -606.35, calculado: -653.35, diferenca: 47, fonte: 'total' })
    expect(conferirRepasse(0, -653.35, -606.35)).toMatchObject({ diferenca: 47, fonte: 'total' })
  })
  it('não pergunta quando batem ou o extrato não traz o total', () => {
    expect(conferirRepasse(null, -653.35, -653.35)).toBeNull()
    expect(conferirRepasse(null, -653.35, null)).toBeNull()
    expect(conferirRepasse(0, -653.35, null)).toBeNull()
  })
  it('com repasse, compara o líquido repassado', () => {
    expect(conferirRepasse(1360, 1370.65, null)).toMatchObject({ diferenca: -10.65, fonte: 'repasse' })
    expect(conferirRepasse(0, 120, null)).toMatchObject({ diferenca: -120, fonte: 'repasse' })
  })
})
