// Ordem dos candidatos do "Vincular" (teste manual 31/10, Parte A): categoria > valor (exato, depois
// aproximado) > favorecido parecido > data mais próxima; outra conta também aparece. Dados fictícios.
import { describe, it, expect } from 'vitest'
import { computeOccurrences } from './occurrences'
import { candidatosDoLancamento, candidatosDaOcorrencia, nivelValor } from './vinculo'

const next = (s, n) => computeOccurrences(s, n)
const ag = (id, o) => ({
  id, description: id, payee: null, transactionType: 'expense', accountId: 'cc', frequency: 'monthly', occurrenceType: 'continuous',
  registered: [], skipped: [], overrides: {}, startDate: '2026-11-10', amount: 100, categoryId: 'cat_x', ...o,
})
// Lançamento no CARTÃO, categoria Salão, rateado em 2 linhas (Salão + Presente).
const TX = { id: 'tx1', type: 'expense', accountId: 'card', accountType: 'credit', amount: 179, date: '2026-11-10', description: 'Barbearia Alfa', payee: 'Barbearia Alfa', categoryId: 'cat_salao' }
const RATEIOS = new Map([['tx1', [{ categoriaId: 'cat_salao', valor: 120 }, { categoriaId: 'cat_presente', valor: 59 }]]])
const ids = (lista) => lista.map(c => c.scheduleId || c.tx?.id)

describe('ordem do Vincular (a partir do lançamento)', () => {
  it('categoria igual com valor diferente vem antes de valor igual com categoria diferente; outra conta aparece', () => {
    const mesmaCat = ag('ag_salao', { amount: 90, categoryId: 'cat_salao' }) // conta corrente, valor diferente
    const mesmoValor = ag('ag_valor', { amount: 179, categoryId: 'cat_luz', accountId: 'card' })
    const c = candidatosDoLancamento(TX, { schedules: [mesmoValor, mesmaCat], getNextOccurrences: next, rateios: RATEIOS })
    expect(ids(c)).toEqual(['ag_salao', 'ag_valor'])
    expect(c[0].motivos).toEqual(['mesma categoria'])
    expect(c[1].motivos).toEqual(['mesmo valor'])
  })
  it('categoria via linha do rateio (do lançamento e do agendamento) conta', () => {
    const presente = ag('ag_presente', { amount: 30, categoryId: 'cat_presente' })
    const outro = ag('ag_outro', { amount: 179, categoryId: 'cat_luz' })
    expect(ids(candidatosDoLancamento(TX, { schedules: [outro, presente], getNextOccurrences: next, rateios: RATEIOS }))).toEqual(['ag_presente', 'ag_outro'])
    // rateio do AGENDAMENTO (lancamentoId = id do agendamento) com uma linha de Salão
    const agRateado = ag('ag_rateado', { amount: 30, categoryId: 'cat_misc' })
    const r2 = new Map([...RATEIOS, ['ag_rateado', [{ categoriaId: 'cat_misc', valor: 10 }, { categoriaId: 'cat_salao', valor: 20 }]]])
    expect(ids(candidatosDoLancamento(TX, { schedules: [outro, agRateado], getNextOccurrences: next, rateios: r2 }))).toEqual(['ag_rateado', 'ag_outro'])
  })
  it('dentro da mesma categoria: valor exato > aproximado > diferente; empate → data mais próxima', () => {
    const exato = ag('ag_exato', { amount: 179, categoryId: 'cat_salao', startDate: '2026-11-20' })
    const proximo = ag('ag_proximo', { amount: 170, categoryId: 'cat_salao', startDate: '2026-11-10' })
    const longe = ag('ag_longe', { amount: 60, categoryId: 'cat_salao', startDate: '2026-11-10' })
    const perto = ag('ag_perto', { amount: 60, categoryId: 'cat_salao', startDate: '2026-11-12' })
    const c = candidatosDoLancamento({ ...TX, date: '2026-11-11' }, { schedules: [longe, perto, proximo, exato], getNextOccurrences: next, rateios: RATEIOS })
    expect(ids(c).slice(0, 2)).toEqual(['ag_exato', 'ag_proximo'])
    expect(c[1].motivos).toEqual(['mesma categoria', 'valor próximo'])
    // mesma categoria e mesmo nível de valor: a ocorrência mais perto da data do lançamento primeiro
    const c2 = candidatosDoLancamento({ ...TX, date: '2026-11-12' }, { schedules: [longe, perto], getNextOccurrences: next, rateios: RATEIOS })
    expect(ids(c2)).toEqual(['ag_perto', 'ag_longe'])
  })
  it('favorecido parecido desempata antes da data', () => {
    const fav = ag('ag_fav', { amount: 60, categoryId: 'cat_salao', payee: 'Barbearia Alfa Ltda', startDate: '2026-11-20' })
    const semFav = ag('ag_semfav', { amount: 60, categoryId: 'cat_salao', startDate: '2026-11-10' })
    const c = candidatosDoLancamento(TX, { schedules: [semFav, fav], getNextOccurrences: next, rateios: RATEIOS })
    expect(ids(c)).toEqual(['ag_fav', 'ag_semfav'])
    expect(c[0].motivos).toContain('favorecido parecido')
  })
  it('valor aproximado é proporcional ao valor', () => {
    expect(nivelValor(179, 179)).toBe(2)
    expect(nivelValor(179, 165)).toBe(1) // 14 ≤ 17,90
    expect(nivelValor(179, 150)).toBe(0)
    expect(nivelValor(10, 10.9)).toBe(1) // mínimo R$ 1
  })
})

describe('mesma ordem a partir da ocorrência', () => {
  const OCC = ag('ag_salao', { amount: 179, categoryId: 'cat_salao', accountId: 'cc' })
  it('categoria (inclusive por linha do rateio) > valor; lançamento do cartão aparece para agendamento da conta', () => {
    const tCat = { id: 't_cat', type: 'expense', accountId: 'card', amount: 120, date: '2026-11-10', description: 'X', categoryId: 'cat_misc' }
    const tValor = { id: 't_valor', type: 'expense', accountId: 'cc', amount: 179, date: '2026-11-10', description: 'Y', categoryId: 'cat_luz' }
    const rateios = new Map([['t_cat', [{ categoriaId: 'cat_misc', valor: 60 }, { categoriaId: 'cat_salao', valor: 60 }]]])
    const c = candidatosDaOcorrencia(OCC, '2026-11-10', { transactions: [tValor, tCat], rateios })
    expect(c.map(x => x.tx.id)).toEqual(['t_cat', 't_valor'])
    expect(c[0].motivos).toEqual(['mesma categoria'])
    expect(c[1].motivos).toEqual(['mesmo valor'])
  })
})

describe('mesma ordem nas parcelas da mesclagem', () => {
  const parcela = (id, o) => ({ id, type: 'expense', accountId: 'card', accountType: 'credit', date: '2026-11-15', installmentNum: 3, installmentTotal: 10, faturaMonthYear: '2026-12', description: id, ...o })
  it('parcela da mesma categoria antes da de valor igual', () => {
    const tx = { id: 'av', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: '2026-11-15', faturaMonthYear: '2026-12', categoryId: 'cat_seg' }
    const pValor = parcela('p_valor', { amount: 150, categoryId: 'cat_outro' })
    const pCat = parcela('p_cat', { amount: 140, categoryId: 'cat_seg' })
    const c = candidatosDoLancamento(tx, { schedules: [], transactions: [pValor, pCat, tx], closingDay: 25 })
    expect(c.map(x => x.id)).toEqual(['p_cat', 'p_valor'])
  })
})
