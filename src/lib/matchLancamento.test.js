import { describe, it, expect } from 'vitest'
import {
  buscarCorrespondencias, parcelaDoTexto, normalizarNome, similaridade, ajusteProposto, camposHerdados, categoriaMaisUsada,
} from './matchLancamento'

const CARTAO = { id: 'card', type: 'credit', closingDay: 25, name: 'Cartão X' }
const OUTRO = { id: 'card2', type: 'credit', closingDay: 25, name: 'Cartão Y' }
const accounts = [CARTAO, OUTRO, { id: 'cc', type: 'checking' }]
const parcela = (num, total, extra = {}) => ({
  id: `p${total}_${num}`, type: 'expense', accountId: 'card', amount: 205.61, payee: 'Seguradora Alfa',
  description: `Seguradora Alfa Parc2 ${String(num).padStart(2, '0')}/${total}`, installmentNum: num, installmentTotal: total,
  categoryId: 'cat_seguro', grupoGerencial: 'grp_g', tipoDocumentoId: 'td_cc', costCenter: 'Carro', reconciled: false, ...extra,
})
// Série de 12 (parcela 8 na fatura 11/2026, data do dia financeiro 15/10) + outra série do mesmo favorecido.
const transactions = [
  parcela(7, 12, { date: '2026-09-15', dateCartao: '2026-09-30', faturaMonthYear: '2026-10' }),
  parcela(8, 12, { date: '2026-10-15', faturaMonthYear: '2026-11' }),
  parcela(9, 12, { date: '2026-11-15', faturaMonthYear: '2026-12' }),
  { id: 's5_4', type: 'expense', accountId: 'card', amount: 74.3, payee: 'Seguradora Alfa', description: 'Seguradora Alfa Parc4', installmentNum: 4, installmentTotal: 5, date: '2026-10-15', faturaMonthYear: '2026-11', categoryId: 'cat_seguro' },
  { id: 'mercado', type: 'expense', accountId: 'card', amount: 99.9, payee: 'Mercado Bom', description: 'MERCADO BOM', date: '2026-10-28', faturaMonthYear: '2026-11', categoryId: 'cat_mercado' },
  parcela(8, 12, { id: 'outro_cartao', accountId: 'card2', date: '2026-10-15', faturaMonthYear: '2026-11' }),
]
const SMS = 'Compra aprovada de R$ 205,61 em SeguradoraAlfa Parc8, 31/10 as 10:22, cartao final 4541'
const novo = (extra = {}) => ({
  accountId: 'card', type: 'expense', amount: 205.61, date: '2026-10-31', payee: 'SeguradoraAlfa',
  description: 'SeguradoraAlfa Parc8', textoOriginal: SMS, ...extra,
})

describe('parcela no texto', () => {
  it.each([
    ['Parc8', 8], ['Parc 8', 8], ['8/12', 8], ['08/12', 8], ['P8', 8], ['parcela 8', 8], ['LOJA P 08', 8],
  ])('%s → %i', (txt, n) => { expect(parcelaDoTexto(txt)?.num).toBe(n) })
  it('no SMS, data dd/mm não vira parcela', () => {
    expect(parcelaDoTexto('Compra de R$ 10 em LOJA, 05/11 as 10:00', { aceitaBarra: false })).toBeNull()
    expect(parcelaDoTexto(SMS, { aceitaBarra: false })?.num).toBe(8)
  })
})

describe('nome', () => {
  it('normaliza intermediador, *, acento e parcela', () => {
    expect(normalizarNome('MP *Açaí do João Parc3')).toBe('acai do joao')
    expect(normalizarNome('PTY*LOJA LEGAL 08/12')).toBe('loja legal')
  })
  it('similaridade', () => {
    expect(similaridade('SeguradoraAlfa', 'Seguradora Alfa')).toBeGreaterThanOrEqual(0.9)
    expect(similaridade('PG *Mercado Bom', 'mercado bom')).toBe(1)
    expect(similaridade('Padaria Central', 'Seguradora Alfa')).toBeLessThan(0.6)
  })
})

describe('correspondência na fatura (caso do SMS da parcela)', () => {
  it('parcela que já existe → match forte com a parcela 8, pendente, fatura 11/2026', () => {
    const r = buscarCorrespondencias(novo(), { transactions, accounts })
    expect(r.fortes[0].tx.id).toBe('p12_8')
    expect(r.fortes[0]).toMatchObject({ forca: 'forte', parcelaIgual: true, valorIgual: true, fatura: '2026-11', dataDiverge: false })
    expect(r.fortes.map(m => m.tx.id)).not.toContain('p12_7')
    expect(r.fortes.map(m => m.tx.id)).not.toContain('outro_cartao')
    expect(ajusteProposto(r.fortes[0], novo())).toEqual({})
  })
  it('valor R$ 2,00 diferente → ainda forte, oferece ajuste do valor', () => {
    const r = buscarCorrespondencias(novo({ amount: 207.61 }), { transactions, accounts })
    expect(r.fortes[0]).toMatchObject({ forca: 'forte', valorIgual: false, valorProximo: true, diferencaValor: 2 })
    expect(ajusteProposto(r.fortes[0], novo({ amount: 207.61 }))).toEqual({ amount: 207.61 })
  })
  it('compra nova → nada', () => {
    const r = buscarCorrespondencias(novo({ amount: 48.5, payee: 'Padaria Central', description: 'PADARIA CENTRAL', textoOriginal: 'Compra aprovada de R$ 48,50 em PADARIA CENTRAL' }), { transactions, accounts })
    expect(r).toEqual({ fortes: [], fracos: [] })
  })
  it('só o nome parecido (valor muito diferente) → fraco, só sugestão', () => {
    const r = buscarCorrespondencias(novo({ amount: 30, payee: 'Mercado Bom', description: 'MERCADO BOM', textoOriginal: '' }), { transactions, accounts })
    expect(r.fortes).toEqual([])
    expect(r.fracos[0].tx.id).toBe('mercado')
  })
  it('à vista com data diferente → ajusta a data', () => {
    const r = buscarCorrespondencias(novo({ amount: 99.9, payee: 'Mercado Bom', description: 'MERCADO BOM', textoOriginal: '', date: '2026-10-29' }), { transactions, accounts })
    expect(ajusteProposto(r.fortes[0], { amount: 99.9, date: '2026-10-29' })).toEqual({ date: '2026-10-29' })
  })
  it('pendente antes de conciliado; fatura fechada fica de fora; apelido casa direto', () => {
    const conc = transactions.map(t => (t.id === 'p12_8' ? { ...t, reconciled: true } : t))
    const r = buscarCorrespondencias(novo({ parcela: null, textoOriginal: '', description: 'SeguradoraAlfa' }), { transactions: conc, accounts })
    expect(r.fortes[0].pendente).toBe(true)
    const fechada = buscarCorrespondencias(novo(), { transactions, accounts, faturasFechadas: { 'card_2026-11': true } })
    expect(fechada.fortes.map(m => m.tx.id)).not.toContain('p12_8')
    const ap = buscarCorrespondencias(novo({ payee: 'XPTO 123', description: 'XPTO', amount: 99.9, textoOriginal: '' }), {
      transactions, accounts, apelidos: [{ tipo: 'favorecido', termo: 'xpto', ref_id: 'Mercado Bom' }],
    })
    expect(ap.fortes[0].tx.id).toBe('mercado')
  })
  it('conta que não é cartão → nada', () => {
    expect(buscarCorrespondencias(novo({ accountId: 'cc' }), { transactions, accounts })).toEqual({ fortes: [], fracos: [] })
  })
})

describe('herança e categoria sugerida', () => {
  it('herda categoria, centro de custo, tipo de documento e grupo gerencial', () => {
    expect(camposHerdados(transactions[1])).toEqual({ categoryId: 'cat_seguro', costCenter: 'Carro', tipoDocumentoId: 'td_cc', grupoGerencial: 'grp_g' })
  })
  it('categoria mais usada do favorecido', () => {
    expect(categoriaMaisUsada('SeguradoraAlfa', transactions)).toBe('cat_seguro')
    expect(categoriaMaisUsada('Ninguem', transactions)).toBeNull()
  })
})
