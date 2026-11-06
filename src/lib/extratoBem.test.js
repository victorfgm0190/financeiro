import { describe, it, expect } from 'vitest'
import {
  extratoDoBem, resumoDoBem, linhaDoTempo, saidasPorMes, totaisDeSaidas, faltaPagar, CLASSE,
} from './extratoBem.js'

const bem = { id: 'bem', nome: 'Carro', valor_nota_fiscal: 150000, categoria_prestacao_id: 'cat_p', categoria_taxa_id: 'cat_j' }

// Bem de 150.000, entrada de 100.000 em janeiro, 10 × 6.000 (5.000 + 1.000) de fevereiro a novembro.
function financiado(pagas) {
  const meses = ['02', '03', '04', '05', '06', '07', '08', '09', '10', '11']
  const lancamentos = [{ id: 'ent', type: 'transfer', date: '2026-01-10', amount: 100000, account_id: 'itau', to_account_id: 'bem', bem_id: 'bem', origem_tipo: 'checking' }]
  const parcelas = meses.map((m, i) => {
    const paga = i < pagas
    if (paga) {
      lancamentos.push({ id: `p${i}`, type: 'expense', origin: 'pagamento_divida', date: `2026-${m}-10`, amount: 5000, account_id: 'itau', bem_id: 'bem', category_id: 'cat_p', description: `Parcela ${i + 1}/10` })
      lancamentos.push({ id: `j${i}`, type: 'expense', origin: 'pagamento_divida', date: `2026-${m}-10`, amount: 1000, account_id: 'itau', bem_id: 'bem', category_id: 'cat_j', description: `Parcela ${i + 1}/10 - Juros` })
    }
    return {
      id: `i${i}`, bem_id: 'bem', numero: i + 1, status: paga ? 'paid' : 'open',
      principal_provisioned: 5000, juros_provisioned: 1000, total_provisioned: 6000,
      total_pago: paga ? 6000 : 0, desconto_antecipacao: 0, data_pagamento: paga ? `2026-${m}-10` : null,
    }
  })
  return { lancamentos, trocas: [], parcelas }
}

describe('validação: bem de 150.000, entrada 100.000, 10 × 6.000', () => {
  it('mês a mês: 100.000/60.000 → 106.000/54.000/1.000', () => {
    const d = financiado(1)
    const t = linhaDoTempo(extratoDoBem(bem, d), d.parcelas)
    expect(t[0]).toEqual({ mes: '2026-01', pagoNoMes: 100000, pagoAcumulado: 100000, jurosAcumulados: 0, faltaPagar: 60000 })
    expect(t[1]).toEqual({ mes: '2026-02', pagoNoMes: 6000, pagoAcumulado: 106000, jurosAcumulados: 1000, faltaPagar: 54000 })
  })
  it('final: pago 160.000, juros 10.000, custo final 160.000', () => {
    const d = financiado(10)
    const linhas = extratoDoBem(bem, d)
    const r = resumoDoBem(bem, linhas, d.parcelas)
    expect(r).toMatchObject({
      pagoComJuros: 160000, pagoSemJuros: 150000, jurosPagos: 10000, faltaPagar: 0,
      custoFinalRealizado: 160000, custoFinalProjetado: 160000, proprios: 160000, terceiros: 0,
    })
    expect(linhaDoTempo(linhas, d.parcelas).at(-1)).toMatchObject({ pagoAcumulado: 160000, jurosAcumulados: 10000, faltaPagar: 0 })
  })
  it('no meio do caminho, realizado e projetado são diferentes', () => {
    const d = financiado(1)
    const r = resumoDoBem(bem, extratoDoBem(bem, d), d.parcelas)
    expect(r.custoFinalRealizado).toBe(151000)
    expect(r.custoFinalProjetado).toBe(160000)
    expect(r.faltaPagar).toBe(54000)
  })
  it('a linha do tempo não tem buraco e vai até a data pedida', () => {
    const lancamentos = [
      { id: 'a', type: 'transfer', date: '2026-01-10', amount: 10, account_id: 'itau', to_account_id: 'bem' },
      { id: 'b', type: 'transfer', date: '2026-03-10', amount: 10, account_id: 'itau', to_account_id: 'bem' },
    ]
    const t = linhaDoTempo(extratoDoBem(bem, { lancamentos }), [], { ate: '2026-04-20' })
    expect(t.map(x => [x.mes, x.pagoAcumulado])).toEqual([['2026-01', 10], ['2026-02', 10], ['2026-03', 20], ['2026-04', 20]])
  })
})

describe('classificação', () => {
  const classe = (l) => extratoDoBem(bem, { lancamentos: [l] })[0]
  const base = { id: 'x', date: '2026-04-25', amount: 100 }

  it('receita na conta do bem é pago por terceiro, sem caixa', () => {
    expect(classe({ ...base, type: 'income', account_id: 'bem' })).toMatchObject({ classe: CLASSE.TERCEIRO, origem: 'terceiro', caixa: false })
  })
  it('receita em outra conta ligada ao bem é devolução', () => {
    expect(classe({ ...base, type: 'income', account_id: 'itau', bem_id: 'bem' })).toMatchObject({ classe: CLASSE.DEVOLUCAO, caixa: true })
  })
  it('rendimento manual e despesa na conta do bem são ajuste', () => {
    expect(classe({ ...base, type: 'income', account_id: 'bem', origin: 'rendimento_manual' }).classe).toBe(CLASSE.AJUSTE)
    expect(classe({ ...base, type: 'expense', account_id: 'bem' })).toMatchObject({ classe: CLASSE.AJUSTE, valor: -100 })
  })
  it('espelho e ganho/perda da troca não são pagamento', () => {
    expect(classe({ ...base, type: 'expense', bem_id: 'bem', reserva_auto: true })).toBeUndefined()
    expect(classe({ ...base, type: 'expense', bem_id: 'bem', origin: 'patrimonio_auto' })).toBeUndefined()
  })
  it('lançamento de outro bem fica fora', () => {
    expect(classe({ ...base, type: 'transfer', account_id: 'itau', to_account_id: 'outro', bem_id: 'outro' })).toBeUndefined()
  })
  it('transferência entre bens é pagamento, mas não caixa', () => {
    expect(classe({ ...base, type: 'transfer', account_id: 'outro', to_account_id: 'bem', origem_tipo: 'asset' })).toMatchObject({ classe: CLASSE.PRINCIPAL, caixa: false })
  })
  it('usa a data real do lançamento', () => {
    expect(classe({ ...base, type: 'transfer', account_id: 'itau', to_account_id: 'bem', date: '2026-06-08' }).data).toBe('2026-06-08')
  })
})

describe('terceiros, devoluções e troca', () => {
  const dados = {
    lancamentos: [
      { id: 'b', type: 'income', date: '2026-04-25', amount: 683.4, account_id: 'bem' },
      { id: 'r', type: 'income', date: '2026-06-12', amount: 341.5, account_id: 'itau', bem_id: 'bem' },
      { id: 't', type: 'transfer', date: '2026-06-08', amount: 5460, account_id: 'itau', to_account_id: 'bem', origem_tipo: 'checking' },
    ],
  }
  it('terceiro entra no pago e reduz só o custo próprio; devolução abate', () => {
    const r = resumoDoBem({ ...bem, valor_nota_fiscal: 0 }, extratoDoBem(bem, dados), [])
    expect(r).toMatchObject({ pagoComJuros: 6143.4, terceiros: 683.4, proprios: 5460, devolucoes: 341.5, custoProprioLiquido: 5118.5 })
  })
  it('caixa separa terceiro e devolução do total de saídas', () => {
    const l = saidasPorMes([{ bem, linhas: extratoDoBem(bem, dados) }])
    expect(l.find(x => x.mes === '2026-04')).toMatchObject({ total: 0, terceiros: 683.4 })
    expect(l.find(x => x.mes === '2026-06')).toMatchObject({ total: 5460, principal: 5460, devolucoes: 341.5 })
    expect(totaisDeSaidas(l)).toMatchObject({ total: 5460, terceiros: 683.4, devolucoes: 341.5 })
  })
  it('trade-in conta como pago, mas não é caixa', () => {
    const d = { trocas: [{ id: 'm', bem_id: 'bem', data: '2026-01-05', valor: 60000 }] }
    const linhas = extratoDoBem(bem, d)
    expect(resumoDoBem(bem, linhas, [])).toMatchObject({ pagoSemJuros: 60000, proprios: 60000 })
    expect(saidasPorMes([{ bem, linhas }])).toEqual([])
  })
  it('caixa respeita o período e separa principal de juros', () => {
    const d = financiado(2)
    const l = saidasPorMes([{ bem, linhas: extratoDoBem(bem, d) }], { de: '2026-02-01', ate: '2026-02-28' })
    expect(l).toEqual([{ bemId: 'bem', bem: 'Carro', mes: '2026-02', principal: 5000, juros: 1000, total: 6000, terceiros: 0, devolucoes: 0 }])
  })
  it('parcela sem conta de origem não é saída de caixa', () => {
    const d = { lancamentos: [{ id: 'p', type: 'expense', origin: 'pagamento_divida', date: '2026-02-10', amount: 500, account_id: null, bem_id: 'bem', description: 'Parcela 1/2' }] }
    const linhas = extratoDoBem(bem, d)
    expect(resumoDoBem(bem, linhas, []).pagoSemJuros).toBe(500)
    expect(saidasPorMes([{ bem, linhas }])).toEqual([])
  })
})

describe('falta pagar e desconto', () => {
  const parcelas = [
    { id: 'a', bem_id: 'bem', numero: 1, status: 'paid', total_provisioned: 1087.8, juros_provisioned: 422.8, total_pago: 1087.8, desconto_antecipacao: 0, data_pagamento: '2026-09-10' },
    { id: 'b', bem_id: 'bem', numero: 2, status: 'paid', total_provisioned: 1103.72, juros_provisioned: 438.72, total_pago: 1087.3, desconto_antecipacao: 16.42, data_pagamento: '2026-10-05' },
    { id: 'c', bem_id: 'bem', numero: 3, status: 'open', total_provisioned: 1000, juros_provisioned: 335, total_pago: 0, desconto_antecipacao: 0, data_pagamento: null },
    { id: 'd', bem_id: 'bem', numero: 4, status: 'partial', total_provisioned: 1000, juros_provisioned: 335, total_pago: 400, desconto_antecipacao: 0, data_pagamento: '2026-11-01' },
  ]
  it('parcela quitada com desconto não deve mais nada; parcial deve o resto', () => {
    expect(faltaPagar(parcelas)).toBe(1600)
  })
  it('desconto vira linha informativa e não entra no pago', () => {
    const linhas = extratoDoBem(bem, { parcelas })
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ classe: CLASSE.DESCONTO, valor: 16.42, data: '2026-10-05', caixa: false })
    expect(resumoDoBem(bem, linhas, parcelas).pagoComJuros).toBe(0)
  })
  it('projetado desconta o desconto uma vez; realizado usa os juros já líquidos', () => {
    const lancamentos = [{ id: 'j', type: 'expense', origin: 'pagamento_divida', date: '2026-10-05', amount: 422.3, account_id: 'itau', bem_id: 'bem', description: 'Parcela 2 - Juros' }]
    const r = resumoDoBem(bem, extratoDoBem(bem, { lancamentos, parcelas }), parcelas)
    expect(r.custoFinalRealizado).toBe(150422.3)
    expect(r.custoFinalProjetado).toBe(r2(150000 + 1531.52 - 16.42))
  })
})

function r2(n) { return Math.round(n * 100) / 100 }
