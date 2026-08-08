import { describe, it, expect } from 'vitest'
import { installmentKey, detectInstallment } from './installments'

// As duas "Payservice 5/5" de R$ 59,60 de 21/03/2026 que a fatura 08/2026 traz — cobranças
// legítimas e idênticas em tudo. É o caso que fazia a segunda sumir na importação.
const gemea = {
  accountId: 'acc_1780091925522', description: 'Payservice 5/5',
  installmentNum: 5, installmentTotal: 5, amount: 59.60,
  faturaMonthYear: '2026-08', date: '2026-03-21',
}

describe('installmentKey', () => {
  it('mantém a chave sem sufixo na 1ª ocorrência (compatível com o que já está gravado)', () => {
    const esperada = 'acc_1780091925522|payservice|5/5|5960|2026-04'
    expect(installmentKey(gemea)).toBe(esperada)
    // Ausente, null ou 1 têm que dar exatamente a mesma chave — senão o índice único veria
    // todas as parcelas já gravadas como novas.
    expect(installmentKey({ ...gemea, installmentOccurrence: null })).toBe(esperada)
    expect(installmentKey({ ...gemea, installmentOccurrence: 1 })).toBe(esperada)
  })

  it('distingue gêmeas legítimas pelo ordinal', () => {
    const k1 = installmentKey(gemea)
    const k2 = installmentKey({ ...gemea, installmentOccurrence: 2 })
    const k3 = installmentKey({ ...gemea, installmentOccurrence: 3 })
    expect(k2).toBe('acc_1780091925522|payservice|5/5|5960|2026-04#2')
    expect(new Set([k1, k2, k3]).size).toBe(3)
  })

  it('serie_inicio recua (num − 1) meses a partir da fatura', () => {
    // Parcela 5/5 na fatura 08/2026 → a série começou em 04/2026.
    expect(installmentKey(gemea)).toContain('|2026-04')
    // Parcela 1/5 na mesma fatura → série começa nela mesma.
    expect(installmentKey({ ...gemea, installmentNum: 1 })).toContain('|2026-08')
  })

  it('separa séries de mesmo valor e total que começam em meses distintos', () => {
    const outraSerie = installmentKey({ ...gemea, faturaMonthYear: '2026-09' })
    expect(outraSerie).not.toBe(installmentKey(gemea))
  })

  it('devolve null quando não é parcela (fica fora do índice parcial)', () => {
    expect(installmentKey({ ...gemea, installmentNum: null })).toBeNull()
    expect(installmentKey({ ...gemea, installmentTotal: null })).toBeNull()
  })
})

describe('detectInstallment', () => {
  it('lê N/Total mesmo colado na descrição', () => {
    expect(detectInstallment('CLINICA HIGA-CT LT01/03')).toMatchObject({ num: 1, total: 3 })
    expect(detectInstallment('Payservice 5/5')).toMatchObject({ num: 5, total: 5, base: 'Payservice' })
  })

  it('rejeita o que não é parcela', () => {
    expect(detectInstallment('Posto Shangri-la')).toBeNull()
    expect(detectInstallment('Compra 5/3')).toBeNull()   // num > total
    expect(detectInstallment('Data 21/03')).toBeNull()   // total 3 < num 21
  })
})
