import { describe, it, expect } from 'vitest'
import {
  parsearTextoBoleto, classificarItens, resumoItens, composicaoCondominio, composicaoEstimada, creditoDaComposicao,
  itemDiferenca, regraDoItem,
} from './composicao.js'
import { distribuirCreditos, planoCreditosAluguel, adiarCredito, composicaoComCreditos } from './creditos.js'
import { planejarPosEfetivacao, planejarReversao } from './efetivacao.js'
import { gerarPlanoParcelas, planejarSincronizacao, planoConfirmacaoReajuste } from './parcelas.js'

// Regras globais do kit (api/_kitBasico.js KIT_REGRAS_ITENS).
const REGRAS = [
  ['fundo de reserva', 'comeca_com'], ['fundo trabalhista', 'comeca_com'], ['fundo de obras', 'comeca_com'],
  ['obra', 'contem'], ['chamada de capital', 'contem'], ['taxa extra', 'contem'],
].map(([padrao, tipo_match], i) => ({ id: `g${i}`, contrato_id: null, padrao, tipo_match, responsavel: 'proprietario' }))

const BOLETO = `Taxa de Condomínio 795,11
Espaço Gourmet (16/09/2026-Espaço Gourmet Seg T Q Qui - 1) 243,15
Taxa de Mudança (04/09/2026- Mudança - 08:00 as 12:00) 162,10
Fundo de Reserva 79,10
Controle 70,00
Água M³: 552,7500(Set)-543,7900(Ago)= 8,9600 49,46
Fundo Trabalhista 25,75
Encargos 0,00`

describe('parser do texto colado do boleto', () => {
  it('exemplo do pedido: 8 itens, soma 1.424,67', () => {
    const { itens, ignoradas } = parsearTextoBoleto(BOLETO)
    expect(itens.map(i => i.valor)).toEqual([795.11, 243.15, 162.10, 79.10, 70, 49.46, 25.75, 0])
    expect(itens[1].desc).toBe('Espaço Gourmet (16/09/2026-Espaço Gourmet Seg T Q Qui - 1)')
    expect(itens[5].desc).toBe('Água M³: 552,7500(Set)-543,7900(Ago)= 8,9600')
    expect(resumoItens(itens).total).toBe(1424.67)
    expect(ignoradas).toEqual([])
  })
  it('"(+)/(-)", R$, milhar, descrição quebrada em duas linhas e linha de total', () => {
    const r = parsearTextoBoleto('Taxa ordinária ..... R$ 1.234,56\n(-) Desconto pontualidade 50,00\nMulta -10,00\nRateio de\nobra emergencial 300,00\nTaxa de Mudança - 162,10\nTotal 1.536,66')
    expect(r.itens).toEqual([
      { desc: 'Taxa ordinária', valor: 1234.56 },
      { desc: 'Desconto pontualidade', valor: -50 },
      { desc: 'Multa', valor: -10 },
      { desc: 'Rateio de obra emergencial', valor: 300 },
      { desc: 'Taxa de Mudança', valor: 162.10 },
    ])
    expect(r.total).toBe(1536.66)
    expect(parsearTextoBoleto('Desconto (-) 50,00').itens[0]).toEqual({ desc: 'Desconto', valor: -50 })
    expect(parsearTextoBoleto('(+) Taxa 10,00').itens[0]).toEqual({ desc: 'Taxa', valor: 10 })
    expect(parsearTextoBoleto('Desconto 50,00 (-)').itens[0].valor).toBe(-50)
  })
})

describe('classificação pelas regras', () => {
  it('proprietário = 104,85 (fundo de reserva + trabalhista); sem regra fica sem dono', () => {
    const itens = classificarItens(parsearTextoBoleto(BOLETO).itens, REGRAS, 'c1')
    expect(itens.find(i => i.desc === 'Fundo de Reserva')).toMatchObject({ responsavel: 'proprietario', regra: 'começa com "fundo de reserva"' })
    const res = resumoItens(itens)
    expect(res.proprietario).toBe(104.85)
    expect(res.semDono).toBe(6)
  })
  it('regra do contrato vence a global; item marcado à mão fica', () => {
    const regras = [...REGRAS, { id: 'c', contrato_id: 'c1', padrao: 'Fundo de obras', tipo_match: 'comeca_com', responsavel: 'inquilino' }]
    expect(regraDoItem('Fundo de Obras 2026', regras, 'c1').id).toBe('c')
    expect(regraDoItem('Fundo de Obras 2026', regras, 'outro').id).toBe('g2')
    expect(classificarItens([{ desc: 'Fundo de Reserva', valor: 1, responsavel: 'inquilino', manual: true }], REGRAS, 'c1')[0].responsavel).toBe('inquilino')
  })
  it('soma ≠ valor pago: diferença vira item do inquilino', () => {
    const itens = [{ desc: 'Taxa', valor: 100, responsavel: 'inquilino' }]
    expect(resumoItens(itens, 100.03).diferenca).toBe(0.03)
    expect(itemDiferenca(0.03)).toMatchObject({ desc: 'Diferença/arredondamento', valor: 0.03, responsavel: 'inquilino' })
  })
})

// Contrato: aluguel 3.900 dia 15, bonificação 200 nos 12 primeiros meses, condomínio dia 5.
const C = {
  id: 'c1', tipo: 'pagar', objeto: 'Apto', favorecido: 'Imob', data_inicio: '2026-09-15', data_fim: '2028-08-31', valor_base: 3900,
  periodicidade: 'mensal', dia_vencimento: 15, indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12,
  tem_condominio: true, valor_condominio_previsto: 1300, dia_vencimento_condominio: 5, conta_id: 'cc', categoria_id: 'm', categoria_condominio_id: 'm',
}
const parcelas = (contrato = C) => planejarSincronizacao(contrato, [], gerarPlanoParcelas(contrato, { hoje: '2026-10-21', apartirDe: '2026-10' })).criar
const aplicar = (schedules, mudancas) => schedules.map(s => { const m = mudancas.find(x => x.id === s.id); return m ? { ...s, ...m.changes } : s })
const credito = (o) => ({ id: 'cr1', contrato_id: 'c1', status: 'aberto', data_origem: '2026-10-08', valor: 104.85, itens: [{ desc: 'Fundo de Reserva', valor: 79.10 }, { desc: 'Fundo Trabalhista', valor: 25.75 }], ...o })

describe('crédito do proprietário no aluguel (regra de 21/10)', () => {
  it('exemplo do pedido: aluguel seguinte = 3.900 − 200 − 104,85 = 3.595,15, item a item com a origem', () => {
    const s = parcelas()
    const plano = planoCreditosAluguel(C, s, [credito()])
    expect(plano).toHaveLength(1)
    expect(plano[0].id).toBe('ctr_c1_aluguel_202610')
    expect(plano[0].changes.amount).toBe(3595.15)
    expect(plano[0].changes.composicao.itens).toEqual([
      { tipo: 'base', desc: 'Aluguel contratual', valor: 3900 },
      { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
      { tipo: 'credito', desc: 'Fundo de Reserva cond. 08/10', valor: -79.10, credito_id: 'cr1' },
      { tipo: 'credito', desc: 'Fundo Trabalhista cond. 08/10', valor: -25.75, credito_id: 'cr1' },
    ])
  })

  it('condomínio pago 05/12 (1.200 = 1.000 meu + 200 dono) → aluguel de 15/12 = 3.900 − 350 − 200 = 3.350', () => {
    const c = { ...C, bonificacao_valor: 350 }
    const s = parcelas(c)
    const comp = composicaoCondominio([{ desc: 'Taxa', valor: 1000, responsavel: 'inquilino' }, { desc: 'Fundo de obras', valor: 200, responsavel: 'proprietario' }])
    const cr = { id: 'cr2', ...creditoDaComposicao(comp, { contratoId: 'c1', tx: { id: 'tx_c', date: '2026-12-05' }, parcela: { id: 'ctr_c1_condominio_202612' } }) }
    expect(cr).toMatchObject({ valor: 200, descricao: 'Condomínio 05/12', data_origem: '2026-12-05' })
    const plano = planoCreditosAluguel(c, s, [cr])
    expect(plano.map(m => [m.id, m.changes.amount])).toEqual([['ctr_c1_aluguel_202612', 3350]])
  })

  it('aluguel do mês já pago → abate no seguinte; vencimento anterior ao crédito não recebe', () => {
    const s = parcelas().map(x => (x.id === 'ctr_c1_aluguel_202612' ? { ...x, registered: [x.startDate] } : x))
    const dist = distribuirCreditos(C, s, [credito({ data_origem: '2026-12-05' })])
    expect(dist.get('ctr_c1_aluguel_202611')).toEqual([])
    expect(dist.get('ctr_c1_aluguel_202701').map(c => c.id)).toEqual(['cr1'])
  })

  it('desmarcar ("não abater neste mês") empurra o crédito para o próximo', () => {
    let s = parcelas()
    s = aplicar(s, [{ id: 'ctr_c1_aluguel_202610', changes: adiarCredito(s.find(x => x.id === 'ctr_c1_aluguel_202610'), 'cr1') }])
    const plano = planoCreditosAluguel(C, s, [credito()])
    expect(plano.map(m => [m.id, m.changes.amount])).toEqual([['ctr_c1_aluguel_202611', 3595.15]])
  })

  it('crédito compensado sai da parcela; sem mudança não gera plano', () => {
    const s = aplicar(parcelas(), planoCreditosAluguel(C, parcelas(), [credito()]))
    expect(planoCreditosAluguel(C, s, [credito()])).toEqual([])
    const volta = planoCreditosAluguel(C, s, [credito({ status: 'compensado' })])
    expect(volta[0].changes.amount).toBe(3700)
  })
})

describe('posEfetivacaoContrato (itens a–e)', () => {
  const s = aplicar(parcelas(), planoCreditosAluguel(C, parcelas(), [credito()]))
  const aluguelOut = s.find(x => x.id === 'ctr_c1_aluguel_202610')

  it('a) pago = previsto: lançamento ganha contrato e composição; compensa os créditos da parcela', () => {
    const r = planejarPosEfetivacao({ contrato: C, parcela: aluguelOut, tx: { id: 't', amount: 3595.15 } })
    expect(r.lancamento.contratoId).toBe('c1')
    expect(r.lancamento.composicao.total).toBe(3595.15)
    expect(r.lancamento.composicao.itens.some(i => i.tipo === 'ajuste')).toBe(false)
    expect(r.compensar).toEqual(['cr1'])
    expect(r.perguntarReajuste).toBeNull()
  })

  it('a) pago diferente do previsto: item "Diferença no pagamento"', () => {
    const r = planejarPosEfetivacao({ contrato: C, parcela: aluguelOut, tx: { id: 't', amount: 3600 } })
    expect(r.lancamento.composicao.itens.at(-1)).toEqual({ tipo: 'ajuste', desc: 'Diferença no pagamento', valor: 4.85 })
  })

  it('b) parcela projetada paga: vale como confirmação de reajuste (base sem bonificação)', () => {
    const c = { ...C, indice_reajuste: 'FIXO', percentual_fixo: 5, data_inicio: '2025-09-15' }
    const p = parcelas(c).find(x => x.id === 'ctr_c1_aluguel_202610')
    expect(p.valorStatus).toBe('projetado')
    const r = planejarPosEfetivacao({ contrato: c, parcela: p, tx: { id: 't', amount: 4100 } })
    expect(r.perguntarReajuste).toMatchObject({ parcelaId: p.id, base: 4100, baseProjetada: 4095 })
    const pago = { ...p, registered: [p.startDate] }
    const plano = planoConfirmacaoReajuste(c, [pago, ...parcelas(c).filter(x => x.id !== p.id)], p.id, r.perguntarReajuste.base, { escopo: 'ciclo' })
    expect(plano.mudancas.find(m => m.id === 'ctr_c1_aluguel_202611').changes.amount).toBe(4100)
    expect(plano.mudancas.find(m => m.id === p.id)).toBeUndefined()
  })

  it('c) condomínio: pede a composição; auto-registro estima pela última conhecida', () => {
    const cond = s.find(x => x.id === 'ctr_c1_condominio_202610')
    expect(planejarPosEfetivacao({ contrato: C, parcela: cond, tx: { id: 't', amount: 1200 } })).toMatchObject({ pedirComposicao: true, estimar: false })
    expect(planejarPosEfetivacao({ contrato: C, parcela: cond, tx: { id: 't', amount: 1200 }, auto: true })).toMatchObject({ pedirComposicao: false, estimar: true })
    const ultima = composicaoCondominio([{ desc: 'Taxa', valor: 1100, responsavel: 'inquilino' }, { desc: 'Fundo de Reserva', valor: 80, responsavel: 'proprietario' }])
    const est = composicaoEstimada(1200, ultima)
    expect(est).toMatchObject({ estimada: true, total: 1200, proprietario: 80, inquilino: 1120 })
  })

  it('d) sem crédito na parcela, nada a compensar; e) agendamento sem contrato não faz nada', () => {
    const semCredito = parcelas().find(x => x.id === 'ctr_c1_aluguel_202611')
    expect(planejarPosEfetivacao({ contrato: C, parcela: semCredito, tx: { id: 't', amount: 3700 } }).compensar).toEqual([])
    expect(planejarPosEfetivacao({ contrato: null, parcela: semCredito, tx: { id: 't', amount: 1 } }).lancamento).toBeNull()
  })

  it('composição de aluguel com crédito soma ao total da parcela', () => {
    expect(composicaoComCreditos(parcelas()[1], [credito()]).amount).toBe(3595.15)
  })
})

describe('reverterEfetivacaoContrato (estorno)', () => {
  const creditos = [
    credito({ id: 'a', status: 'compensado', compensado_em_lancamento_id: 'tx_alug' }),
    credito({ id: 'b', status: 'aberto', origem_lancamento_id: 'tx_cond' }),
    credito({ id: 'c', status: 'compensado', origem_lancamento_id: 'tx_cond', compensado_em_lancamento_id: 'outro' }),
  ]
  it('estorno do aluguel reabre os créditos compensados nele', () => {
    expect(planejarReversao({ tx: { id: 'tx_alug' }, creditos })).toEqual({ reabrir: ['a'], remover: [], manter: [] })
  })
  it('estorno do condomínio remove o crédito gerado (o já compensado fica)', () => {
    expect(planejarReversao({ tx: { id: 'tx_cond' }, creditos })).toEqual({ reabrir: [], remover: ['b'], manter: ['c'] })
  })
})

describe('relatórios: Valor pago × Despesa real', async () => {
  const { lancamentosNoModo, CREDITO_PROPRIETARIO_ID } = await import('./despesaReal.js')
  const aluguel = { id: 'a', contratoId: 'c1', categoryId: 'alug', type: 'expense', amount: 3595.15, composicao: { itens: [
    { tipo: 'base', valor: 3900 }, { tipo: 'bonificacao', valor: -200 }, { tipo: 'credito', valor: -79.10, credito_id: 'cr' }, { tipo: 'credito', valor: -25.75, credito_id: 'cr' },
  ] } }
  const cond = { id: 'c', contratoId: 'c1', categoryId: 'cond', type: 'expense', amount: 1424.67, composicao: { tipo: 'condominio', itens: [
    { desc: 'Taxa', valor: 1319.82, responsavel: 'inquilino' }, { desc: 'Fundo de Reserva', valor: 79.10, responsavel: 'proprietario' }, { desc: 'Fundo Trabalhista', valor: 25.75, responsavel: 'proprietario' },
  ] } }
  const outro = { id: 'x', categoryId: 'mercado', type: 'expense', amount: 50 }
  const soma = (l, cat) => Math.round(l.filter(t => !cat || t.categoryId === cat).reduce((a, t) => a + t.amount, 0) * 100) / 100

  it('Despesa real: aluguel = base − bonificação; condomínio = itens do inquilino; créditos se anulam; total = pago', () => {
    const real = lancamentosNoModo([aluguel, cond, outro], 'real')
    expect(soma(real, 'alug')).toBe(3700)
    expect(soma(real, 'cond')).toBe(1319.82)
    expect(soma(real, CREDITO_PROPRIETARIO_ID)).toBe(0)
    expect(soma(real)).toBe(soma([aluguel, cond, outro]))
  })
  it('Valor pago: a lista como está', () => {
    const l = [aluguel, cond, outro]
    expect(lancamentosNoModo(l, 'pago')).toBe(l)
  })
})
