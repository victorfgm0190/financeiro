import { describe, it, expect } from 'vitest'
import { assignInstallmentOccurrences, inferirSerieParcela, findParcelaDaSerie, membrosDaSerie, serieIdDominante, buildSeries, addMonthToFatura } from './parcelas'
import { installmentKey } from './installments'

const ACC = 'acc_1780091925522'

// Linha de importação no shape que o ImportPanel monta.
const linha = (over = {}) => ({
  description: 'Payservice 5/5', amount: 59.60, date: '2026-03-21',
  type: 'expense', faturaMonthYear: '2026-08',
  _installment: { num: 5, total: 5, base: 'Payservice' },
  ...over,
})

// Chave que txToRow gravaria para a linha, já com o ordinal atribuído.
const chaveDe = (r) => installmentKey({
  accountId: ACC, description: r.description,
  installmentNum: r._installment.num, installmentTotal: r._installment.total,
  amount: r.amount, faturaMonthYear: r.faturaMonthYear, date: r.date,
  installmentOccurrence: r._installmentOccurrence,
})

describe('assignInstallmentOccurrences', () => {
  it('dá chaves distintas às duas "Payservice 5/5" da fatura 08/2026', () => {
    const [a, b] = assignInstallmentOccurrences([linha(), linha()], ACC)

    expect(a._installmentOccurrence).toBeUndefined() // 1ª segue sem sufixo
    expect(b._installmentOccurrence).toBe(2)
    expect(chaveDe(a)).not.toBe(chaveDe(b))
  })

  it('numera 1..N quando há três ou mais gêmeas', () => {
    const rows = assignInstallmentOccurrences([linha(), linha(), linha()], ACC)
    expect(rows.map(r => r._installmentOccurrence)).toEqual([undefined, 2, 3])
    expect(new Set(rows.map(chaveDe)).size).toBe(3)
  })

  it('é estável na reimportação — o mesmo arquivo produz as mesmas chaves', () => {
    const primeira = assignInstallmentOccurrences([linha(), linha()], ACC).map(chaveDe)
    const segunda = assignInstallmentOccurrences([linha(), linha()], ACC).map(chaveDe)
    // Sem isto, reimportar criaria um terceiro lançamento a cada rodada.
    expect(segunda).toEqual(primeira)
  })

  it('não toca em parcelas que só se parecem — valor ou parcela diferentes', () => {
    const rows = assignInstallmentOccurrences([
      linha(),
      linha({ amount: 59.61 }),                                             // centavo diferente
      linha({ _installment: { num: 4, total: 5, base: 'Payservice' } }),     // outra parcela
      linha({ description: 'Payservice Pro 5/5' }),                          // outra base
    ], ACC)
    expect(rows.every(r => r._installmentOccurrence === undefined)).toBe(true)
  })

  it('ignora à vista e estornos', () => {
    const avista = { description: 'Posto Shangri-la', amount: 239.02, type: 'expense', _installment: null }
    const estorno = linha({ type: 'income', description: 'Payservice', _installment: null })
    const rows = assignInstallmentOccurrences([avista, avista, estorno, estorno], ACC)
    expect(rows.every(r => r._installmentOccurrence === undefined)).toBe(true)
  })

  it('agrupa pela fatura de referência quando ela é passada (caminho da conciliação)', () => {
    // Itens crus da conciliação não têm faturaMonthYear: sem o override cairiam no mês da
    // date (2026-03) e gerariam chave diferente da que importConcItem grava.
    const crus = [linha({ faturaMonthYear: undefined }), linha({ faturaMonthYear: undefined })]
    const rows = assignInstallmentOccurrences(crus, ACC, '2026-08')

    expect(rows[1]._installmentOccurrence).toBe(2)
    expect(installmentKey({
      accountId: ACC, description: rows[0].description,
      installmentNum: 5, installmentTotal: 5, amount: rows[0].amount,
      faturaMonthYear: '2026-08', installmentOccurrence: rows[0]._installmentOccurrence,
    })).toBe('acc_1780091925522|payservice|5/5|5960|2026-04')
  })

  it('devolve lista vazia sem quebrar', () => {
    expect(assignInstallmentOccurrences([], ACC)).toEqual([])
  })
})

describe('regressão: serie_id de "Yelumseg Parc7" propaga para a série inteira', () => {
  // Dados do bug: 2/12–6/12 "Yelumseg ParcN" e 8/12–12/12 "Yelumseg N/12", todos sem serie_id;
  // 3/12 e 5/12 vieram de importação antiga sem fatura_month_year (cai no mês da data, o anterior
  // à fatura). A 7/12 importada ganhou o serie_id 'serie_7' e era a única no card.
  const acc = 'acc_1780091925522'
  const p = (id, num, fatura, description, extra = {}) => ({
    id, accountId: acc, accountType: 'credit', type: 'expense', amount: 205.61, description,
    installmentNum: num, installmentTotal: 12, faturaMonthYear: fatura,
    date: `${addMonthToFatura(fatura, -1)}-15`, serieId: null, ...extra,
  })
  const serie = [
    p('y2', 2, '2026-05', 'Yelumseg Parc2'),
    p('y3', 3, null, 'Yelumseg Parc3', { date: '2026-05-15' }),
    p('y4', 4, '2026-07', 'Yelumseg Parc4'),
    p('y5', 5, null, 'Yelumseg Parc5', { date: '2026-07-15' }),
    p('y6', 6, '2026-09', 'Yelumseg Parc6'),
    p('y7', 7, '2026-10', 'Yelumseg Parc7', { serieId: 'serie_7' }),
    p('y8', 8, '2026-11', 'Yelumseg 8/12'),
    p('y9', 9, '2026-12', 'Yelumseg 9/12'),
    p('y10', 10, '2027-01', 'Yelumseg 10/12'),
    p('y11', 11, '2027-02', 'Yelumseg 11/12'),
    p('y12', 12, '2027-03', 'Yelumseg 12/12'),
  ]
  const outros = [
    // Renovação do ano seguinte: mesmo valor e total, 12 meses depois — outra série.
    p('n2', 2, '2027-05', 'Yelumseg Parc2'),
    // Outro cartão e outro valor não entram.
    { ...p('x8', 8, '2026-11', 'Yelumseg 8/12'), accountId: 'outro' },
    { ...p('z8', 8, '2026-11', 'Yelumseg 8/12'), amount: 300 },
  ]
  const ref = { accountId: acc, base: 'Yelumseg', total: 12, amount: 205.61, serieInicio: '2026-04', serieId: 'serie_7' }

  it('membrosDaSerie acha as 11 parcelas (inclusive sem fatura_month_year) e nada mais', () => {
    const m = membrosDaSerie(ref, [...serie, ...outros])
    expect(m.map(t => t.id).sort()).toEqual(serie.map(t => t.id).sort())
  })

  it('o backfill grava o mesmo serie_id em todos os membros', () => {
    const m = membrosDaSerie(ref, [...serie, ...outros])
    const alvo = serieIdDominante(m)
    expect(alvo).toBe('serie_7')
    const depois = serie.map(t => (m.some(x => x.id === t.id) ? { ...t, serieId: alvo } : t))
    expect(new Set(depois.map(t => t.serieId))).toEqual(new Set(['serie_7']))
  })

  it('o serie_id mais frequente vence quando a série está partida', () => {
    expect(serieIdDominante([{ serieId: 'a' }, { serieId: 'b' }, { serieId: 'b' }, { serieId: null }])).toBe('b')
    expect(serieIdDominante([{ serieId: null }])).toBeNull()
  })

  it('card da 7/12: 11/12 no histórico, falta a 1/12 e a série NÃO está completa', () => {
    const s = buildSeries(serie[5], [...serie, ...outros], { closingDay: 13, dueDay: 20 }, 15)
    expect(s.presentes).toBe(11)
    expect(s.completa).toBe(false)
    expect(s.missing.map(x => x.num)).toEqual([1])
    expect(s.missing[0].description).toBe('Yelumseg 1/12')
  })

  it('com as 12 parcelas o card diz completa', () => {
    const s = buildSeries(serie[5], [...serie, p('y1', 1, '2026-04', 'Yelumseg Parc1')], { closingDay: 13 }, 15)
    expect(s.presentes).toBe(12)
    expect(s.completa).toBe(true)
    expect(s.missing).toEqual([])
  })
})

describe('inferirSerieParcela / findParcelaDaSerie — "Yelumseg Parc7"', () => {
  const acc = 'acc_itaupers'
  const serie = [
    { id: 'y6', accountId: acc, type: 'expense', description: 'Yelumseg Parc6', amount: 205.61, installmentNum: 6, installmentTotal: 12, faturaMonthYear: '2026-09', serieId: 'serie_y', categoryId: 'cat_seguro', payee: 'Yelumseg', grupoGerencial: 'grp_3' },
    { id: 'y11', accountId: acc, type: 'expense', description: 'Yelumseg 11/12', amount: 205.61, installmentNum: 11, installmentTotal: 12, faturaMonthYear: '2027-02', serieId: 'serie_y' },
    { id: 'y12', accountId: acc, type: 'expense', description: 'Yelumseg 12/12', amount: 205.61, installmentNum: 12, installmentTotal: 12, faturaMonthYear: '2027-03', serieId: 'serie_y' },
  ]

  it('infere o total 12 e a série da 6/12', () => {
    const r = inferirSerieParcela({ base: 'Yelumseg', num: 7, amount: 205.61, accountId: acc }, serie)
    expect(r.total).toBe(12)
    expect(r.anchor.serieId).toBe('serie_y')
    expect(r.anchor.id).toBe('y6') // irmã mais próxima do número 7
  })

  it('não infere com valor fora da tolerância de R$ 0,05, outro cartão ou descrição diferente', () => {
    expect(inferirSerieParcela({ base: 'Yelumseg', num: 7, amount: 205.70, accountId: acc }, serie)).toBeNull()
    expect(inferirSerieParcela({ base: 'Yelumseg', num: 7, amount: 205.61, accountId: 'outro' }, serie)).toBeNull()
    expect(inferirSerieParcela({ base: 'Posto Shell', num: 7, amount: 205.61, accountId: acc }, serie)).toBeNull()
  })

  it('prefere a série em andamento à encerrada de mesmo valor', () => {
    const antiga = { id: 'old6', accountId: acc, type: 'expense', description: 'Yelumseg Parc6', amount: 205.61, installmentNum: 6, installmentTotal: 12, faturaMonthYear: '2025-09', serieId: 'serie_old' }
    const r = inferirSerieParcela({ base: 'Yelumseg', num: 7, amount: 205.61, accountId: acc }, [antiga, ...serie])
    expect(r.anchor.serieId).toBe('serie_y')
  })

  it('acha a 7/12 já gerada da série (vira colisão, não lançamento novo)', () => {
    const y7 = { id: 'y7', accountId: acc, type: 'expense', description: 'Yelumseg 07/12', amount: 205.61, installmentNum: 7, installmentTotal: 12, faturaMonthYear: '2026-10', serieId: 'serie_y' }
    expect(findParcelaDaSerie(serie[0], 7, 205.61, [...serie, y7])?.id).toBe('y7')
    expect(findParcelaDaSerie(serie[0], 7, 205.61, serie)).toBeNull()
    expect(findParcelaDaSerie(serie[0], 7, 205.61, [...serie, y7], new Set(['y7']))).toBeNull()
  })
})
