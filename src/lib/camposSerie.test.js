import { describe, it, expect } from 'vitest'
import {
  diffCampos, precisaEscolherEscopo, planoAgendamento, planoRegistros, occCampos,
  irmasLancamento, parcelaCartaoPendente, descricaoParaIrma, irmasFinanciamento,
  agendamentoUnicoPendente, agendamentoDoMotor, serieKeyDe, mensagemAplicada, ESCOPO,
} from './camposSerie'
import { linhasHistorico } from './historico'
import { computeOccurrences as getNextOccurrences } from './occurrences'

// ── Caminho A: agendamento da diarista, 5 parcelas mensais, 1/5 já paga ─────────────────────
const DIARISTA = {
  id: 'sch_dia', description: 'Diarista', transactionType: 'expense', accountId: 'acc_itau', amount: 200,
  categoryId: 'cat_limpeza', payee: 'Maria', costCenter: 'Casa', grupoGerencial: 'grp_D', tipoDocumentoId: 't_rec',
  frequency: 'monthly', occurrenceType: 'installment', installments: 5, startDate: '2026-09-10',
  nextOccurrence: '2026-10-10', registered: ['2026-09-10'], skipped: [], overrides: {},
}
const pend = (s) => getNextOccurrences(s, 400)

describe('classificação e diff', () => {
  it('diff normaliza vazio/null e valor', () => {
    expect(diffCampos({ categoryId: '', amount: 200 }, { categoryId: null, amount: '200.00' })).toEqual([])
    expect(diffCampos({ categoryId: 'a' }, { categoryId: 'b', payee: undefined })).toEqual([{ campo: 'categoryId', de: 'a', para: 'b' }])
  })
  it('só pergunta quando muda campo da PARCELA e há próximas pendentes', () => {
    expect(precisaEscolherEscopo([{ campo: 'payee', de: 'a', para: 'b' }], 3)).toBe(false)
    expect(precisaEscolherEscopo([{ campo: 'categoryId', de: 'a', para: 'b' }], 3)).toBe(true)
    expect(precisaEscolherEscopo([{ campo: 'categoryId', de: 'a', para: 'b' }], 0)).toBe(false)
  })
})

describe('Caminho A — agendamento com ocorrências', () => {
  const pendentes = pend(DIARISTA)
  it('o caso tem 4 pendentes (2/5..5/5)', () => {
    expect(pendentes).toEqual(['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10'])
  })

  it('"Só esta": categoria na 2/5 vira override só dela; 3/5..5/5 seguem a série; 1/5 (paga) intocada', () => {
    const mud = [{ campo: 'categoryId', de: 'cat_limpeza', para: 'cat_casa' }]
    const { schedule: s, afetadas, escopo } = planoAgendamento(DIARISTA, { occDate: '2026-10-10', mudancas: mud, escopo: ESCOPO.PARCELA, pendentes })
    expect(escopo).toBe('parcela')
    expect(afetadas).toEqual(['2026-10-10'])
    expect(s.categoryId).toBe('cat_limpeza')
    expect(occCampos(s, '2026-10-10').categoryId).toBe('cat_casa')
    expect(occCampos(s, '2026-11-10').categoryId).toBe('cat_limpeza')
    expect(s.registered).toEqual(['2026-09-10'])
    expect(s.overrides['2026-10-10']).toEqual({ categoryId: 'cat_casa' }) // sem amount congelado
  })

  it('"Esta e as próximas": 2/5..5/5 mudam; pendentes ANTERIORES congelam o valor antigo', () => {
    const mud = [{ campo: 'categoryId', de: 'cat_limpeza', para: 'cat_casa' }]
    const { schedule: s, afetadas } = planoAgendamento(DIARISTA, { occDate: '2026-10-10', mudancas: mud, escopo: ESCOPO.PROXIMAS, pendentes })
    expect(s.categoryId).toBe('cat_casa')
    expect(afetadas).toHaveLength(4)
    for (const d of pendentes) expect(occCampos(s, d).categoryId).toBe('cat_casa')
    // editando a 3/5: a 2/5 (pendente anterior) mantém a categoria antiga via override
    const r2 = planoAgendamento(DIARISTA, { occDate: '2026-11-10', mudancas: mud, escopo: ESCOPO.PROXIMAS, pendentes })
    expect(occCampos(r2.schedule, '2026-10-10').categoryId).toBe('cat_limpeza')
    expect(occCampos(r2.schedule, '2026-11-10').categoryId).toBe('cat_casa')
    expect(r2.afetadas).toEqual(['2026-11-10', '2026-12-10', '2027-01-10'])
  })

  it('"Esta e as próximas" remove override do mesmo campo nas seguintes (o novo valor vale)', () => {
    const comOv = { ...DIARISTA, overrides: { '2026-12-10': { amount: 250 } } }
    const { schedule: s } = planoAgendamento(comOv, { occDate: '2026-10-10', mudancas: [{ campo: 'amount', de: 200, para: 220 }], escopo: ESCOPO.PROXIMAS, pendentes })
    expect(occCampos(s, '2026-12-10').amount).toBe(220)
  })

  it('data "só esta": override só de data — corrige o amount congelado (inconsistência 3)', () => {
    const { schedule: s } = planoAgendamento(DIARISTA, { occDate: '2026-10-10', mudancas: [{ campo: 'date', de: '2026-10-10', para: '2026-10-13' }], escopo: ESCOPO.PARCELA, pendentes })
    expect(s.overrides['2026-10-10']).toEqual({ date: '2026-10-13' })
    expect(occCampos({ ...s, amount: 300 }, '2026-10-10').amount).toBe(300) // valor da série continua valendo
  })

  it('data "esta e as próximas": desloca as próximas pelo mesmo nº de dias', () => {
    const { schedule: s } = planoAgendamento(DIARISTA, {
      occDate: '2026-10-10', mudancas: [{ campo: 'date', de: '2026-10-10', para: '2026-10-13' }],
      escopo: ESCOPO.PROXIMAS, pendentes, proximasDoNovo: pend,
    })
    expect(pend(s)).toEqual(['2026-10-13', '2026-11-13', '2026-12-13', '2027-01-13'])
    expect(s.registered).toEqual(['2026-09-10'])
  })

  it('campo da série (favorecido) vai para o agendamento: todas as pendentes, sem override', () => {
    const { schedule: s, escopo, afetadas } = planoAgendamento(DIARISTA, { occDate: '2026-10-10', mudancas: [{ campo: 'payee', de: 'Maria', para: 'Joana' }], escopo: ESCOPO.PARCELA, pendentes })
    expect(s.payee).toBe('Joana')
    expect(escopo).toBe('serie')
    expect(afetadas).toHaveLength(4)
    expect(s.overrides).toEqual({})
  })
})

// ── Caminho D/E: lançamentos parcelados de cartão ─────────────────────────────────────────
const parc = (n, extra = {}) => ({
  id: `tx_${n}`, accountId: 'cc', type: 'expense', accountType: 'credit', amount: 200,
  description: `Diarista ${String(n).padStart(2, '0')}/05`, categoryId: 'cat_limpeza', payee: 'Maria',
  installmentNum: n, installmentTotal: 5, serieId: 'serie_1', date: `2026-${String(8 + n).padStart(2, '0')}-01`,
  faturaMonthYear: `2026-${String(8 + n).padStart(2, '0')}`, ...extra,
})
const TXS = [1, 2, 3, 4, 5].map(n => parc(n))
const FECHADAS = { 'cc_2026-09': true } // 1/5 em fatura fechada (paga)

describe('Caminho D — lançamentos parcelados', () => {
  const irmas = irmasLancamento(TXS[1], TXS)
  const ehPendente = (t) => parcelaCartaoPendente(t, { faturasFechadas: FECHADAS })
  const base = { escopo: ESCOPO.PARCELA, irmas, ehPendente, ordem: t => t.installmentNum, numParcela: 2, total: 5 }

  it('irmãs por serieId (não pela descrição)', () => {
    expect(irmas.map(t => t.id)).toEqual(['tx_1', 'tx_3', 'tx_4', 'tx_5'])
    const semSerie = TXS.map(t => ({ ...t, serieId: null, parentTxId: t.id === 'tx_1' ? null : 'tx_1', description: 'Diarista' }))
    expect(irmasLancamento(semSerie[1], semSerie).map(t => t.id)).toEqual(['tx_1', 'tx_3', 'tx_4', 'tx_5'])
  })

  it('"Só esta": categoria só na 2/5', () => {
    const p = planoRegistros(TXS[1], { ...base, mudancas: [{ campo: 'categoryId', de: 'cat_limpeza', para: 'cat_casa' }] })
    expect(p.map(x => x.id)).toEqual(['tx_2'])
  })

  it('"Esta e as próximas": 3/5..5/5 mudam; 1/5 (fatura fechada) nunca', () => {
    const p = planoRegistros(TXS[1], { ...base, escopo: ESCOPO.PROXIMAS, mudancas: [{ campo: 'categoryId', de: 'cat_limpeza', para: 'cat_casa' }] })
    expect(p.map(x => x.id)).toEqual(['tx_2', 'tx_3', 'tx_4', 'tx_5'])
    expect(p.every(x => x.changes.categoryId === 'cat_casa')).toBe(true)
  })

  it('campo da série vai para TODAS as pendentes (inclusive anteriores), nunca para a paga', () => {
    const txs = TXS.map(t => (t.id === 'tx_1' ? t : t))
    const pend1 = [...txs]; pend1[0] = { ...pend1[0] } // 1/5 fechada
    const p = planoRegistros(TXS[2], { ...base, irmas: irmasLancamento(TXS[2], TXS), numParcela: 3, mudancas: [{ campo: 'payee', de: 'Maria', para: 'Joana' }] })
    expect(p.map(x => x.id).sort()).toEqual(['tx_2', 'tx_3', 'tx_4', 'tx_5'])
  })

  it('valor e data em "esta e as próximas": valor igual, data deslocada, descrição com o próprio N/M', () => {
    const p = planoRegistros(TXS[1], {
      ...base, escopo: ESCOPO.PROXIMAS,
      mudancas: [
        { campo: 'amount', de: 200, para: 250 },
        { campo: 'date', de: '2026-10-01', para: '2026-10-05' },
        { campo: 'description', de: 'Diarista 02/05', para: 'Faxina 02/05' },
      ],
    })
    const t4 = p.find(x => x.id === 'tx_4')
    expect(t4.changes).toEqual({ amount: 250, date: '2026-12-05', description: 'Faxina 04/05' })
  })

  it('fatura paga (pagamento registrado) também bloqueia', () => {
    const sch = [{ id: 'fsch_cc_202611_pagamento_fatura', registered: ['2026-11-10'] }]
    expect(parcelaCartaoPendente(TXS[2], { schedules: sch })).toBe(false)
    expect(parcelaCartaoPendente(TXS[3], { schedules: sch })).toBe(true)
  })

  it('descrição sem N/M vai igual', () => {
    expect(descricaoParaIrma('Diarista', 2, 5, 4)).toBe('Diarista')
    expect(descricaoParaIrma('TIGGO 10/60', 10, 60, 11)).toBe('TIGGO 11/60')
  })
})

// ── Caminho F: financiamento (TIGGO 60x) ──────────────────────────────────────────────────
describe('Caminho F — parcelas de financiamento', () => {
  const fin = (n, pago) => ({
    id: `sch_fin_${n}`, tipoComponente: 'financiamento', financingInstallmentId: `fi_${n}`,
    toAccountId: 'acc_divida_tiggo', accountId: 'acc_itau', amount: 1500, payee: 'Banco X',
    startDate: `2027-${String(n).padStart(2, '0')}-15`, registered: pago ? [`2027-${String(n).padStart(2, '0')}-15`] : [],
  })
  const parcelas = [1, 2, 3, 4, 5].map(n => fin(n, n <= 2))
  const item = parcelas[2]
  const opts = { irmas: irmasFinanciamento(item, parcelas), ehPendente: agendamentoUnicoPendente, ordem: s => s.startDate }

  it('irmãs pela conta da dívida; pagas fora', () => {
    expect(opts.irmas).toHaveLength(4)
    const p = planoRegistros(item, { ...opts, escopo: ESCOPO.PARCELA, mudancas: [{ campo: 'payee', de: 'Banco X', para: 'Banco Y' }] })
    expect(p.map(x => x.id)).toEqual(['sch_fin_3', 'sch_fin_4', 'sch_fin_5'])
  })
  it('"Só esta" × "Esta e as próximas" na conta', () => {
    const mud = [{ campo: 'accountId', de: 'acc_itau', para: 'acc_bb' }]
    expect(planoRegistros(item, { ...opts, escopo: ESCOPO.PARCELA, mudancas: mud }).map(x => x.id)).toEqual(['sch_fin_3'])
    expect(planoRegistros(item, { ...opts, escopo: ESCOPO.PROXIMAS, mudancas: mud }).map(x => x.id)).toEqual(['sch_fin_3', 'sch_fin_4', 'sch_fin_5'])
  })
  it('chave da série', () => {
    expect(serieKeyDe({ agendamento: item })).toBe('financiamento|acc_divida_tiggo')
    expect(serieKeyDe({ lancamento: TXS[0] })).toBe('serie|serie_1')
  })
})

describe('Caminho I — motor da fatura fica fora', () => {
  it('reconhece os agendamentos do motor', () => {
    expect(agendamentoDoMotor({ id: 'fsch_cc_202610_pagamento_fatura', tipo: 'pagamento_fatura' })).toBe(true)
    expect(agendamentoDoMotor(DIARISTA)).toBe(false)
  })
})

describe('histórico', () => {
  it('1 linha por campo e por item, mesmo lote_id', () => {
    const p = planoRegistros(TXS[1], {
      escopo: ESCOPO.PROXIMAS, irmas: irmasLancamento(TXS[1], TXS), ordem: t => t.installmentNum,
      ehPendente: (t) => parcelaCartaoPendente(t, { faturasFechadas: FECHADAS }), numParcela: 2, total: 5,
      mudancas: [{ campo: 'categoryId', de: 'cat_limpeza', para: 'cat_casa' }, { campo: 'payee', de: 'Maria', para: 'Joana' }],
    })
    const linhas = linhasHistorico({ entidade: 'lancamento', itens: p, serieKey: 'serie|serie_1', loteId: 'L1', motivo: 'Renegociação' })
    expect(linhas).toHaveLength(8) // 4 parcelas × 2 campos
    expect(new Set(linhas.map(l => l.lote_id))).toEqual(new Set(['L1']))
    expect(linhas.every(l => l.motivo === 'Renegociação' && l.serie_key === 'serie|serie_1')).toBe(true)
    expect(linhas.find(l => l.entidade_id === 'tx_1')).toBeUndefined() // paga não entra
  })
  it('o motor (origem ≠ usuário) não gera histórico', () => {
    expect(linhasHistorico({ entidade: 'agendamento', itens: [{ id: 'x', mudancas: [{ campo: 'amount', de: 1, para: 2 }] }], loteId: 'L', origem: 'motor' })).toEqual([])
  })
  it('mensagem do toast', () => {
    expect(mensagemAplicada(4)).toBe('Alteração aplicada a 4 parcelas pendentes. Histórico registrado.')
  })
})
