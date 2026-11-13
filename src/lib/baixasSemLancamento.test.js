import { describe, it, expect } from 'vitest'
import { historicoOcorrencias, STATUS_OCORRENCIA as ST } from './ocorrenciasRegistradas'
import { mapaBaixasSemLancamento, revisaoBaixasSemLancamento, baixasSemLancamento, ehAgendamentoAutomatico, metaPagoFora, textoAlertaBaixas } from './baixasSemLancamento'
import { computeOccurrences } from './occurrences'

// Caso real (vm, 13/11/2026), anonimizado: série reaproveitada — início movido para 05/01/2027
// depois de uma baixa sem lançamento em 10/10/2026.
const REAPROVEITADA = {
  id: 'sch_material', description: 'MATERIAL', transactionType: 'expense', amount: 276, frequency: 'monthly',
  occurrenceType: 'installment', installments: 5, startDate: '2027-01-05', nextOccurrence: '2027-01-05',
  registered: ['2026-10-10'], skipped: [], registeredMeta: {}, overrides: { _diaVencimento: 5 },
  accountId: 'acc_cartao', categoryId: 'cat_escola',
}

describe('histórico de série reaproveitada', () => {
  const h = historicoOcorrencias(REAPROVEITADA, [])
  it('a baixa mantém o vencimento da própria data (não herda a nova Data de Início)', () => {
    expect(h.linhas[0]).toMatchObject({ parcela: 1, total: 5, vencimento: '2026-10-10', status: ST.BAIXADA, semLancamento: true, pagoFora: false })
  })
  it('previsto da série inteira (5 × 276) e a baixa sem lançamento à parte', () => {
    expect([h.totalPrevisto, h.totalPago, h.nSemLancamento, h.totalSemLancamento]).toEqual([1380, 0, 1, 276])
  })
  it('a primeira pendente não repete o vencimento da baixada', () => {
    expect(computeOccurrences(REAPROVEITADA, 1)[0]).toBe('2027-01-05')
    expect(h.linhas[0].vencimento).not.toBe('2027-01-05')
  })
})

describe('mapa e revisão das baixas sem lançamento', () => {
  const doMotor = { ...REAPROVEITADA, id: 'fsch_acc_1_202605_pagamento_fatura', tipo: 'pagamento_fatura' }
  const contrato = { ...REAPROVEITADA, id: 'ctr_x_aluguel_202608', contratoId: 'ctr_x' }
  const comLanc = { ...REAPROVEITADA, id: 'sch_pago', registered: ['2026-10-10'], registeredMeta: { '2026-10-10': { tipo: 'pago', lancamento_id: 'tx_ok' } } }
  const apagado = { ...REAPROVEITADA, id: 'sch_apagado', registeredMeta: { '2026-10-10': { tipo: 'pago', lancamento_id: 'tx_sumiu' } } }
  const pagoFora = { ...REAPROVEITADA, id: 'sch_fora', registeredMeta: { '2026-10-10': metaPagoFora('2026-11-13') } }
  const cartao = { ...REAPROVEITADA, id: 'sch_cartao', registeredMeta: { '2026-10-10': { tipo: 'ja_no_cartao' } } }
  const txs = [{ id: 'tx_ok', date: '2026-10-10', amount: 276, type: 'expense', accountId: 'acc_cartao' }]

  it('fora: motor, contrato, com lançamento, pago fora do Finup, já no cartão', () => {
    const m = mapaBaixasSemLancamento([REAPROVEITADA, doMotor, contrato, comLanc, apagado, pagoFora, cartao], txs)
    expect([...m.keys()].sort()).toEqual(['sch_apagado', 'sch_material'])
    expect(m.get('sch_material')).toEqual([{ data: '2026-10-10', vencimento: '2026-10-10', parcela: 1, total: 5, valor: 276 }])
    expect(ehAgendamentoAutomatico(doMotor) && ehAgendamentoAutomatico(contrato) && !ehAgendamentoAutomatico(REAPROVEITADA)).toBe(true)
  })
  it('lançamento vinculado apagado conta como baixa sem lançamento', () => {
    expect(baixasSemLancamento(apagado, txs)).toHaveLength(1)
  })
  it('revisão sugere o lançamento solto de mesmo valor', () => {
    const solto = { id: 'tx_solto', date: '2026-10-11', amount: 276, type: 'expense', accountId: 'acc_cartao', categoryId: 'cat_escola' }
    const outro = { id: 'tx_outro', date: '2026-10-11', amount: 90, type: 'expense', accountId: 'acc_cartao', categoryId: 'cat_escola' }
    const [l] = revisaoBaixasSemLancamento([REAPROVEITADA], [solto, outro])
    expect(l).toMatchObject({ key: 'sch_material|2026-10-10', data: '2026-10-10', valor: 276 })
    expect(l.candidato?.id).toBe('tx_solto')
    expect(revisaoBaixasSemLancamento([REAPROVEITADA], [outro])[0].candidato).toBeNull()
  })
  it('texto do alerta', () => {
    expect(textoAlertaBaixas(1)).toBe('1 parcela baixada sem lançamento')
    expect(textoAlertaBaixas(3)).toBe('3 parcelas baixadas sem lançamento')
  })
})

describe('exclusão do lançamento: manter a baixa sem lançamento', () => {
  it('a baixa fica, o meta deixa de apontar o lançamento apagado e ela entra na revisão', async () => {
    const { manterBaixasDoLancamento, baixasDoLancamento, reabrirBaixasDoLancamento } = await import('./scheduleBaixa')
    const s = { ...REAPROVEITADA, registeredMeta: { '2026-10-10': { tipo: 'pago', lancamento_id: 'tx1' } } }
    const tx = { id: 'tx1', date: '2026-10-12', amount: 276 }
    expect(baixasDoLancamento([s], tx).map(b => b.data)).toEqual(['2026-10-10'])
    const [mantida] = manterBaixasDoLancamento([s], tx)
    expect(mantida.registered).toEqual(['2026-10-10'])
    expect(mantida.registeredMeta['2026-10-10']).toMatchObject({ tipo: 'mantida_na_exclusao', lancamento_id: null, lancamento_excluido: 'tx1' })
    expect(baixasSemLancamento(mantida, [])).toHaveLength(1)
    // Padrão (voltar para pendente): a baixa some.
    expect(reabrirBaixasDoLancamento([s], tx)[0].registered).toEqual([])
  })
})

describe('desfazer baixa anterior à Data de Início', () => {
  it('série reaproveitada: a âncora fica no novo início (não volta para 10/10/2026)', async () => {
    const { desfazerBaixa } = await import('./scheduleBaixa')
    const d = desfazerBaixa(REAPROVEITADA, '2026-10-10')
    expect(d.nextOccurrence).toBe('2027-01-05')
    expect(computeOccurrences(d, 10)).toEqual(['2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05'])
  })
  it('1ª parcela paga dois dias antes do início: volta a ser a 1ª pendente', async () => {
    const { desfazerBaixa } = await import('./scheduleBaixa')
    const s = { ...REAPROVEITADA, startDate: '2026-06-20', nextOccurrence: '2026-07-20', registered: ['2026-06-18'], overrides: {} }
    expect(desfazerBaixa(s, '2026-06-18').nextOccurrence).toBe('2026-06-20')
  })
})
