// Importar Fatura — reimportação com a parcela escrita COLADA à cidade ("Yelumseg Parc8sao Paulobra"):
// a parcela conciliada nunca pode virar "Novo" (duplicaria a fatura). Dados fictícios com a forma real.
import { describe, it, expect } from 'vitest'
import { detectParcela } from './installments'
import { resolverLinhasRevisao, patchColisao, camposAlteradosColisao, mudancasDaColisao, diferencasDoConciliado } from './revisaoImportacao'
import { aplicarJaLancados } from './casamentoFatura'
import { aplicarCorrespondencias } from './importacaoCorrespondencias'
import { contarRevisaoFatura } from './contagemRevisaoFatura'
import { linhasDaFaturaParaRevisao } from './linhasFaturaImportada'

const CARD = 'card_x'
const accounts = [{ id: CARD, type: 'credit', closingDay: 13, name: 'Cartão X' }]
const tx = (o) => ({ accountId: CARD, accountType: 'credit', type: 'expense', reconciled: false, origin: 'manual', payee: '', ...o })
const revisar = (rows, transactions) => {
  const base = resolverLinhasRevisao(rows, { accountId: CARD, transactions, closingDay: 13 })
  const ja = aplicarJaLancados(base, { transactions, accountId: CARD, closingDay: 13 })
  return aplicarCorrespondencias(ja, { transactions, accounts, accountId: CARD })
}
const status = (r) => {
  if (r._jaLancado) return 'ja_lancado'
  if (r._collisionTx) return 'no_banco'
  if (r._isDuplicate) return 'ja_existe'
  if (r._dupLevel === 'possivel') return 'possivel'
  if (r._jaLancadoOpcoes) return 'escolher'
  return r.selected ? 'novo' : 'desmarcada'
}
const qtd = (out) => { const c = contarRevisaoFatura(out); return { importar: c.importar.qtd, conciliados: c.conciliados.qtd, decisao: c.decisao.qtd } }

// Série 12× de 205,61: 7/12 na fatura 10, 8/12 CONCILIADA na 11 (gravada com o texto do banco), 9/12 na 12.
const SERIE = 'serie_seguro'
const P7 = tx({ id: 'p7', description: 'Seguradora Parc7', amount: 205.61, date: '2026-09-15', dateCartao: '2026-09-30', faturaMonthYear: '2026-10', installmentNum: 7, installmentTotal: 12, serieId: SERIE })
const P8 = tx({ id: 'p8', description: 'Seguradora Parc8sao Paulobra', amount: 205.61, date: '2026-10-31', dateCartao: '2026-10-31', faturaMonthYear: '2026-11', installmentNum: 8, installmentTotal: 12, serieId: SERIE, reconciled: true })
const P9 = tx({ id: 'p9', description: 'Seguradora Parc2 09/12', amount: 205.61, date: '2026-11-15', faturaMonthYear: '2026-12', installmentNum: 9, installmentTotal: 12, serieId: SERIE })
const TXS = [P7, P8, P9]
const doArquivo = (description, date = '2026-10-31', amount = 205.61) => ({ type: 'expense', description, date, amount, movimentacao: '' })

describe('detector: parcela colada à cidade', () => {
  it('"Parc8sao Paulobra" é a parcela 8; a base é só o nome antes dela', () => {
    expect(detectParcela('Seguradora Parc8sao Paulobra')).toMatchObject({ num: 8, total: null, base: 'Seguradora' })
    expect(detectParcela('Seguradora Parc9sao Paulobra')).toMatchObject({ num: 9, total: null, base: 'Seguradora' })
    expect(detectParcela('Seguradora Parc7')).toMatchObject({ num: 7, total: null, base: 'Seguradora' })
  })
  it('não é parcela: Parceria, Parcial, Parcelado sem número, número da loja', () => {
    for (const s of ['Parceria Comercio Ltda', 'Parcial Store', 'Parcelado', 'Loja Parc 2000', 'Parc24h Conveniencia', 'Parc2go Delivery']) {
      expect(detectParcela(s), s).toBeNull()
    }
  })
})

describe('reimportação da fatura com a parcela conciliada', () => {
  it('do texto real do arquivo: "Parc8sao" vira 8/12 pela série gravada e casa com a conciliada — 0 a importar', () => {
    const rows = linhasDaFaturaParaRevisao([doArquivo('Seguradora Parc8sao Paulobra')], { accountId: CARD, transactions: TXS, closingDay: 13, reference: '2026-11' })
    expect(rows[0]._installment).toMatchObject({ num: 8, total: 12 })
    expect(rows[0].faturaMonthYear).toBe('2026-11')
    const out = revisar(rows, TXS)
    expect(status(out[0])).toBe('no_banco')
    expect(out[0]._dbTx.id).toBe('p8')
    expect(qtd(out)).toEqual({ importar: 0, conciliados: 1, decisao: 0 })
  })
  it('parcela 9 colada na fatura seguinte casa com a 9/12 já gravada', () => {
    const rows = linhasDaFaturaParaRevisao([doArquivo('Seguradora Parc9sao Paulobra', '2026-11-30')], { accountId: CARD, transactions: TXS, closingDay: 13, reference: '2026-12' })
    const out = revisar(rows, TXS)
    expect(rows[0]._installment).toMatchObject({ num: 9, total: 12 })
    expect(status(out[0])).toBe('no_banco')
    expect(out[0]._dbTx.id).toBe('p9')
    expect(qtd(out).importar).toBe(0)
  })
  it('linha SEM parcela legível × conciliado com parcela: mesma descrição e data do cartão → já conciliado, em silêncio', () => {
    const linha = { type: 'expense', description: 'Seguradora  PARC8SAO Paulobra', amount: 205.61, date: '2026-10-31', _dateCartao: '2026-10-31', faturaMonthYear: '2026-11', selected: true, _id: 1 }
    const out = revisar([linha], TXS)
    expect(status(out[0])).toBe('ja_existe')
    expect(out[0]._dbTx.id).toBe('p8')
    expect(qtd(out)).toEqual({ importar: 0, conciliados: 1, decisao: 0 })
  })
  it('compra à vista diferente, mesmo valor e mesma data: não casa (descrição outra)', () => {
    const linha = { type: 'expense', description: 'Auto Posto Central', amount: 205.61, date: '2026-10-31', _dateCartao: '2026-10-31', faturaMonthYear: '2026-11', selected: true, _id: 1 }
    const out = revisar([linha], TXS)
    expect(out[0]._dbTx?.id).not.toBe('p8')
    expect(status(out[0])).toBe('novo')
  })
  it('mesma descrição, data do cartão diferente: não casa por este caminho', () => {
    const linha = { type: 'expense', description: 'Seguradora Parc8sao Paulobra', amount: 205.61, date: '2026-10-30', _dateCartao: '2026-10-30', faturaMonthYear: '2026-11', selected: true, _id: 1 }
    const out = revisar([linha], [P8])
    expect(status(out[0])).not.toBe('ja_existe')
  })
})

describe('1:1 com compras iguais no mesmo dia', () => {
  const A = tx({ id: 'a', description: 'Loja Bela Parc3sao Paulobra', amount: 50, date: '2026-11-02', dateCartao: '2026-11-02', faturaMonthYear: '2026-11', installmentNum: 3, installmentTotal: 5, serieId: 's1', reconciled: true })
  const B = tx({ ...A, id: 'b', serieId: 's2' })
  const linha = (id) => ({ type: 'expense', description: 'Loja Bela Parc3sao Paulobra', amount: 50, date: '2026-11-02', _dateCartao: '2026-11-02', faturaMonthYear: '2026-11', selected: true, _id: id })
  it('2 linhas × 2 conciliados: cada linha casa com um', () => {
    const out = revisar([linha(1), linha(2)], [A, B])
    expect(out.map(status)).toEqual(['ja_existe', 'ja_existe'])
    expect(new Set(out.map(r => r._dbTx.id))).toEqual(new Set(['a', 'b']))
  })
  it('2 linhas × 1 conciliado: uma casa, a outra segue as regras normais (não some)', () => {
    const out = revisar([linha(1), linha(2)], [A])
    expect(out.filter(r => status(r) === 'ja_existe')).toHaveLength(1)
    expect(out.filter(r => r._dbTx?.id === 'a')).toHaveLength(1)
    expect(qtd(out).importar).toBe(1)
  })
})

describe('conciliado reconhecido na reimportação nunca é alterado', () => {
  // A data de sistema calculada para a parcela 8 na fatura 11 é 15/10 (série); a conciliada está em 31/10.
  const rowP8 = { type: 'expense', description: 'Seguradora Parc8sao Paulobra', amount: 205.61, date: '2026-10-15', _dateCartao: '2026-10-31', faturaMonthYear: '2026-11', _installment: { num: 8, total: 12 }, categoryId: 'cat_x', grupoGerencial: 'g1' }
  const patchDe = (row, t) => patchColisao(row, t, { saveDate: row.date, faturaRef: '11/2026', serieId: t.serieId })
  it('conciliado: nada a gravar, mesmo com data de sistema, categoria e grupo diferentes', () => {
    expect(camposAlteradosColisao(patchDe(rowP8, P8), P8)).toContain('date') // sem a regra, mudaria a data
    expect(mudancasDaColisao(rowP8, P8, patchDe(rowP8, P8))).toEqual([])
    expect(diferencasDoConciliado(rowP8, P8)).toEqual([]) // valor, data do cartão e descrição iguais
  })
  it('conciliado com diferença real (data do cartão, descrição, valor): vira informação, não mudança', () => {
    const row = { ...rowP8, _dateCartao: '2026-10-30', description: 'Seguradora Parc8 Outra', amount: 205.62 }
    expect(mudancasDaColisao(row, P8, patchDe(row, P8))).toEqual([])
    expect(diferencasDoConciliado(row, P8).map(d => d.campo)).toEqual(['valor', 'dataCartao', 'descricao'])
  })
  it('NÃO conciliado (projeção): continua sendo atualizado pela colisão, como antes', () => {
    const proj = { ...P8, id: 'proj', reconciled: false, dateCartao: null, date: '2026-10-15', description: 'Seguradora Parc2 08/12' }
    const m = mudancasDaColisao(rowP8, proj, patchDe(rowP8, proj))
    expect(m).toEqual(expect.arrayContaining(['dateCartao', 'description']))
    expect(m).not.toContain('date') // a data de sistema da série já é a da projeção
    expect(diferencasDoConciliado(rowP8, proj)).toEqual([])
  })
})

describe('data das parcelas 2..N: a da série; a do cartão fica em date_cartao', () => {
  it('"N/Total" do arquivo: data do cartão é a da compra original; a data gravada é a da série', () => {
    const rows = linhasDaFaturaParaRevisao([doArquivo('Loja Nova 9/12', '2026-02-13', 100)], { accountId: CARD, transactions: [], closingDay: 13, reference: '2026-11', financialStartDay: 15 })
    expect(rows[0]._installment).toMatchObject({ num: 9, total: 12 })
    expect(rows[0]._dateCartao).toBe('2026-02-13')
    expect(rows[0].date).toBe('2026-10-15')
  })
})
