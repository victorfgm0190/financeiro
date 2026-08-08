import { describe, it, expect } from 'vitest'
import { assignInstallmentOccurrences } from './parcelas'
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
