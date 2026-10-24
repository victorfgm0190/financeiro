import { describe, it, expect } from 'vitest'
import {
  resolverLinhasRevisao, projetarTotalFatura, compararNaFatura, patchColisao, camposAlteradosColisao, textoResumoImportacao, idsNoBancoConferidos,
  aguardandoLancamentoDoBanco, avaliarConferencia,
} from './revisaoImportacao'

const CARTAO = 'acc_card'
const tx = (o) => ({ accountId: CARTAO, accountType: 'credit', type: 'expense', ...o })
const linha = (o) => ({ type: 'expense', selected: true, faturaMonthYear: '2026-10', _generated: false, ...o })
const resolver = (rows, transactions, extra = {}) =>
  resolverLinhasRevisao(rows, { accountId: CARTAO, transactions, closingDay: 13, ...extra })

describe('compararNaFatura', () => {
  it('descrição sozinha nunca basta: valor diferente não é duplicata', () => {
    const banco = tx({ id: 't', description: 'Yelumseg Parc3', amount: 205.61, faturaMonthYear: '2026-10' })
    expect(compararNaFatura(linha({ description: 'Yelumseg Parc3', amount: 74.29 }), banco)).toBeNull()
  })

  it('não trata o estorno como duplicata da compra que ele estorna', () => {
    const compra = tx({ id: 't', description: 'Aramis', amount: 149.95, dateCartao: '2026-09-10' })
    expect(compararNaFatura(linha({ type: 'income', description: 'Aramis', amount: 149.95, _dateCartao: '2026-09-10' }), compra)).toBeNull()
  })

  it('mesma base e parcela → existe; parcela diferente → possível', () => {
    const banco = tx({ id: 't', description: 'Aramis 4/4', amount: 149.95, installmentNum: 4, installmentTotal: 4 })
    expect(compararNaFatura(linha({ description: 'Aramis 4/4', amount: 149.95, _installment: { num: 4, total: 4 } }), banco)).toBe('existe')
    expect(compararNaFatura(linha({ description: 'Aramis 3/4', amount: 149.95, _installment: { num: 3, total: 4 } }), banco)).toBe('possivel')
  })

  it('casa a parcela do Itaú ("1/3") com a do sistema ("01/03")', () => {
    const banco = tx({ id: 't', description: 'CLINICA HIGA-CT LT01/03', amount: 666.34, dateCartao: '2026-07-10' })
    expect(compararNaFatura(linha({ description: 'Clinica Higa-ct Lt 1/3', amount: 666.34, _installment: { num: 1, total: 3 }, _dateCartao: '2026-07-10' }), banco)).toBe('existe')
  })

  it('"ParcN" do texto é o número da parcela: Parc7 × Parc6 é possível, não existe', () => {
    const banco = tx({ id: 't', description: 'Yelumseg Parc6', amount: 205.61 })
    expect(compararNaFatura(linha({ description: 'Yelumseg Parc7', amount: 205.61 }), banco)).toBe('possivel')
    expect(compararNaFatura(linha({ description: 'Yelumseg Parc6', amount: 205.61 }), banco)).toBe('existe')
  })

  it('tolerância de valor é R$ 0,01', () => {
    const banco = tx({ id: 't', description: 'Netflix.com', amount: 20.90 })
    expect(compararNaFatura(linha({ description: 'Netflix.com', amount: 20.91 }), banco)).toBe('existe')
    expect(compararNaFatura(linha({ description: 'Netflix.com', amount: 20.95 }), banco)).toBeNull()
  })

  it('valor igual sem semelhança de descrição é coincidência', () => {
    const banco = tx({ id: 't', description: 'Posto Shangri-la', amount: 10 })
    expect(compararNaFatura(linha({ description: 'Mercado Livre', amount: 10 }), banco)).toBeNull()
  })

  it('datas de compra conhecidas e diferentes: possível, não existe', () => {
    const banco = tx({ id: 't', description: 'Uber', amount: 15, dateCartao: '2026-09-20' })
    expect(compararNaFatura(linha({ description: 'Uber', amount: 15, _dateCartao: '2026-09-25' }), banco)).toBe('possivel')
  })
})

describe('resolverLinhasRevisao — casos da fatura 10/2026', () => {
  // Caso A: série 74,30 em 5× com as projeções uma fatura atrasadas.
  const yelumseg74 = [
    tx({ id: 'y1', description: 'Yelumseg Parc1', amount: 74.30, faturaMonthYear: '2026-09', installmentNum: 1, installmentTotal: 5 }),
    tx({ id: 'y3', description: 'Yelumseg Parc1 3/5', amount: 74.30, faturaMonthYear: '2026-11', installmentNum: 3, installmentTotal: 5 }),
  ]
  const yelumseg205 = tx({ id: 'y205', description: 'Yelumseg Parc3', amount: 205.61, faturaMonthYear: '2026-06', installmentNum: 3, installmentTotal: 12 })

  it('A: "Yelumseg Parc3" 74,29 de 10/2026 é novo, com aviso da projeção de 11/2026', () => {
    const row = linha({
      _id: 0, description: 'Yelumseg Parc3', amount: 74.29, _dateCartao: '2026-10-11',
      _installment: { num: 3, total: 5, base: 'Yelumseg', matchStr: null }, _serieAnchor: yelumseg74[1],
    })
    const [r] = resolver([row], [...yelumseg74, yelumseg205])
    expect(r._collisionTx).toBeNull()
    expect(r._dupLevel).toBeNull()
    expect(r.selected).toBe(true)
    expect(r._tambemEm.map(o => o.fatura)).toEqual(['2026-11'])
  })

  it('B: "Aramis 3/4" × "Aramis 4/4" manual na mesma fatura é possível duplicata com o registro do banco', () => {
    const manual = tx({ id: 'a4', description: 'Aramis 4/4', amount: 149.95, faturaMonthYear: '2026-10', installmentNum: 4, installmentTotal: 4 })
    const row = linha({ _id: 0, description: 'Aramis 3/4', amount: 149.95, _dateCartao: '2026-07-10', _installment: { num: 3, total: 4, base: 'Aramis', matchStr: '3/4' } })
    const [r] = resolver([row], [manual])
    expect(r._dupLevel).toBe('possivel')
    expect(r._dupTx).toBe(manual)
    expect(r.selected).toBe(false)

    // "É o mesmo": vira atualização do registro existente.
    const [mesmo] = resolver([{ ...row, _mesmoQueId: 'a4' }], [manual])
    expect(mesmo._collisionTx).toBe(manual)
    expect(mesmo._mesmoConfirmado).toBe(true)
    expect(mesmo._dupLevel).toBeNull()
  })

  it('colisão de parcela só vale na mesma fatura e com o mesmo valor', () => {
    const projecao = tx({ id: 'p', description: 'Loja 2/3', amount: 33.34, faturaMonthYear: '2026-10', installmentNum: 2, installmentTotal: 3 })
    const row = linha({ _id: 0, description: 'Loja 2/3', amount: 33.34, _installment: { num: 2, total: 3, base: 'Loja', matchStr: '2/3' } })
    expect(resolver([row], [projecao])[0]._collisionTx).toBe(projecao)
    // Centavos de arredondamento: possível duplicata, nunca "No banco".
    const arred = resolver([{ ...row, amount: 33.37 }], [projecao])[0]
    expect(arred._collisionTx).toBeNull()
    expect(arred._dupLevel).toBe('possivel')
  })

  it('casa 1:1 — duas linhas idênticas e um só lançamento gravado: a segunda é nova', () => {
    const banco = [tx({ id: 'u', description: 'Uber', amount: 50, faturaMonthYear: '2026-10' })]
    const rows = [linha({ _id: 0, description: 'Uber', amount: 50 }), linha({ _id: 1, description: 'Uber', amount: 50 })]
    const [r0, r1] = resolver(rows, banco)
    expect(r0._dupLevel).toBe('certeza')
    expect(r1._dupLevel).toBeNull()
  })

  it('prefere o par com a mesma data de compra', () => {
    const banco = [
      tx({ id: 'd9', description: 'Uber', amount: 15, faturaMonthYear: '2026-10', dateCartao: '2026-09-29' }),
      tx({ id: 'd5', description: 'Uber', amount: 15, faturaMonthYear: '2026-10', dateCartao: '2026-09-25' }),
    ]
    const rows = [linha({ _id: 0, description: 'Uber', amount: 15, _dateCartao: '2026-09-25' }), linha({ _id: 1, description: 'Uber', amount: 15, _dateCartao: '2026-09-29' })]
    const [r0, r1] = resolver(rows, banco)
    expect(r0._dbTx.id).toBe('d5')
    expect(r1._dbTx.id).toBe('d9')
  })

  it('reconhece o estorno já importado', () => {
    const banco = [tx({ id: 'e', type: 'income', description: 'Aramis', amount: 149.95, faturaMonthYear: '2026-10' })]
    expect(resolver([linha({ _id: 0, type: 'income', description: 'Aramis', amount: 149.95 })], banco)[0]._dupLevel).toBe('certeza')
  })

  it('assinatura mensal em outra fatura não gera aviso "Também em"', () => {
    const banco = [tx({ id: 'n', description: 'Netflix.com', amount: 20.90, faturaMonthYear: '2026-09', dateCartao: '2026-09-06' })]
    expect(resolver([linha({ _id: 0, description: 'Netflix.com', amount: 20.90, _dateCartao: '2026-10-06' })], banco)[0]._tambemEm).toEqual([])
  })
})

describe('projetarTotalFatura', () => {
  const opts = (transactions) => ({ fatura: '2026-10', accountId: CARTAO, transactions, closingDay: 13 })

  it('C: total do arquivo inclui todas as linhas (estornos negativos) e a diferença é explicada', () => {
    const banco = [tx({ id: 'a4', description: 'Aramis 4/4', amount: 149.95, faturaMonthYear: '2026-10', installmentNum: 4, installmentTotal: 4 })]
    const rows = [
      linha({ _id: 0, description: 'Aramis 3/4', amount: 149.95, _installment: { num: 3, total: 4, base: 'Aramis', matchStr: '3/4' } }),
      linha({ _id: 1, description: 'Padaria', amount: 20 }),
      linha({ _id: 2, description: 'Padaria', amount: 5, type: 'income' }),
      linha({ _id: 3, description: 'Farmácia', amount: 30, selected: false }),
    ]
    const resolved = resolver(rows, banco)
    const p = projetarTotalFatura(resolved, opts(banco))
    expect(p.arquivo).toBe(194.95)
    // Aramis 4/4 já gravada representa a possível duplicata; Padaria e o estorno entram; a
    // Farmácia desmarcada fica de fora.
    expect(p.projetado).toBe(164.95)
    expect(p.diferenca).toBe(30)
    expect(p.itens).toHaveLength(1)
    expect(p.itens[0]).toMatchObject({ tipo: 'linha_fora', valor: 30 })
  })

  it('lançamento gravado sem linha no arquivo entra na lista', () => {
    const banco = [tx({ id: 'x', description: 'Manual', amount: 12, faturaMonthYear: '2026-10' })]
    const p = projetarTotalFatura(resolver([linha({ _id: 0, description: 'Padaria', amount: 20 })], banco), opts(banco))
    expect(p.projetado).toBe(32)
    expect(p.itens).toEqual([expect.objectContaining({ tipo: 'so_no_banco', valor: -12 })])
    expect(p.itens.reduce((s, i) => s + i.valor, 0)).toBeCloseTo(p.diferenca, 2)
  })
})

describe('colisão — só grava quando o banco muda', () => {
  const banco = tx({
    id: 't1', description: 'Luisinho Manutenc 9/10', date: '2026-10-01', dateCartao: '2026-03-02',
    installmentNum: 9, installmentTotal: 10, serieId: 'ser_1', categoryId: 'cat_a', grupoGerencial: 'grp_1',
    faturaMonthYear: '2026-11', faturaRef: '11/2026', reservaFuncaoId: null,
  })
  const linhaIgual = linha({
    description: 'Luisinho Manutenc 9/10', _dateCartao: '2026-03-02', _installment: { num: 9, total: 10 },
    categoryId: 'cat_a', grupoGerencial: 'grp_1', faturaMonthYear: '2026-11', _reservaFuncaoId: null,
  })
  const opts = { saveDate: '2026-10-01', faturaRef: '11/2026', serieId: 'ser_1' }

  it('linha idêntica ao banco: nenhum campo muda', () => {
    expect(camposAlteradosColisao(patchColisao(linhaIgual, banco, opts), banco, linhaIgual)).toEqual([])
  })

  it('vazio, null e undefined contam como iguais', () => {
    const b = { ...banco, reservaFuncaoId: undefined, categoryId: '' }
    const l = { ...linhaIgual, categoryId: '' }
    expect(camposAlteradosColisao(patchColisao(l, b, opts), b, l)).toEqual([])
  })

  it('nome ou parcela diferentes são atualização', () => {
    const l = { ...linhaIgual, description: 'Luisinho Manutencao 9/10' }
    expect(camposAlteradosColisao(patchColisao(l, banco, opts), banco, l)).toEqual(['description'])
    const b = { ...banco, installmentNum: 8 }
    expect(camposAlteradosColisao(patchColisao(linhaIgual, b, opts), b, linhaIgual)).toEqual(['installmentNum'])
  })

  it('rateio na linha conta como mudança', () => {
    const l = { ...linhaIgual, _rateios: [{ categoryId: 'x', amount: 1 }] }
    expect(camposAlteradosColisao(patchColisao(l, banco, opts), banco, l)).toEqual(['rateios'])
  })
})

describe('textoResumoImportacao', () => {
  it('sem novos nem atualizados: fatura já estava no banco', () => {
    expect(textoResumoImportacao({ novos: 0, existiam: 4, atualizados: 0 })).toBe('Nenhum lançamento novo — a fatura já estava no banco.')
  })
  it('números reais com plural', () => {
    expect(textoResumoImportacao({ novos: 1, existiam: 3, atualizados: 2 })).toBe('1 novo importado · 3 já existiam · 2 atualizados')
    expect(textoResumoImportacao({ salvos: 1 })).toBe('1 lançamento salvo.')
  })
  it('acrescenta os conciliados quando há', () => {
    expect(textoResumoImportacao({ novos: 2, existiam: 1, atualizados: 0, conciliados: 3 }))
      .toBe('2 novos importados · 1 já existia · 0 atualizados · 3 lançamentos marcados como conciliados')
    expect(textoResumoImportacao({ novos: 0, existiam: 1, atualizados: 0, conciliados: 1 }))
      .toBe('Nenhum lançamento novo — a fatura já estava no banco. · 1 lançamento marcado como conciliado')
  })
})

describe('idsNoBancoConferidos', () => {
  it('já existe e colisão entram; possível duplicata e linha nova não', () => {
    const rows = [
      { _id: 'a', _isDuplicate: true, _dbTx: { id: 't1' } },
      { _id: 'b', _collisionTx: { id: 't2' }, _dbTx: { id: 't2' } },
      { _id: 'c', _dupLevel: 'possivel', _dupTx: { id: 't3' } },
      { _id: 'd', selected: true },
    ]
    expect(idsNoBancoConferidos(rows)).toEqual(['t1', 't2'])
  })
  it('passa pelo casamento real: só o lançamento que bateu com o arquivo', () => {
    const banco = [
      tx({ id: 'pad', description: 'Padaria', amount: 20, faturaMonthYear: '2026-11' }),
      tx({ id: 'solo', description: 'Só no sistema', amount: 99, faturaMonthYear: '2026-11' }),
    ]
    const linhas = resolverLinhasRevisao([linha({ _id: 'r1', description: 'Padaria', amount: 20, faturaMonthYear: '2026-11' })],
      { accountId: CARTAO, transactions: banco, closingDay: 13 })
    expect(idsNoBancoConferidos(linhas)).toEqual(['pad'])
  })
})

describe('fatura aberta: parcelas que o banco ainda não lançou', () => {
  const opts = (transactions, aberta) => ({ fatura: '2026-11', accountId: CARTAO, transactions, closingDay: 13, aberta })
  // O caso real (Itaú Personalite, Nov/2026): Yelumseg Parc2 e Parc4 gravadas na fatura, fora do arquivo.
  const banco = [
    tx({ id: 'y2', description: 'Yelumseg Parc2 08/12', amount: 205.61, faturaMonthYear: '2026-11', installmentNum: 2, installmentTotal: 12, serieId: 's1' }),
    tx({ id: 'y4', description: 'Yelumseg Parc4', amount: 74.30, faturaMonthYear: '2026-11', serieId: 's2' }),
    tx({ id: 'pad', description: 'Padaria', amount: 20, faturaMonthYear: '2026-11' }),
  ]
  const rows = [linha({ _id: 0, description: 'Padaria', amount: 20, faturaMonthYear: '2026-11' })]

  it('aberta: parcelas sem linha no arquivo são "aguardando", não divergência; arquivo + aguardando = projetado', () => {
    const p = projetarTotalFatura(resolver(rows, banco), opts(banco, true))
    expect(p.diferenca).toBe(-279.91)
    expect(p.itensAguardando.map(i => i.tx.id)).toEqual(['y2', 'y4'])
    expect(p.aguardando).toBe(279.91)
    expect(p.itensDivergencia).toEqual([])
    expect(p.diferencaReal).toBe(0)
    expect(r2(p.arquivo + p.aguardando)).toBe(p.projetado)
  })

  it('fechada: o comportamento de sempre (divergência real no banner vermelho)', () => {
    const p = projetarTotalFatura(resolver(rows, banco), opts(banco, false))
    expect(p.itensAguardando).toEqual([])
    expect(p.itensDivergencia.map(i => i.tipo)).toEqual(['so_no_banco', 'so_no_banco'])
    expect(p.diferencaReal).toBe(-279.91)
  })

  it('aberta: lançamento sem linha no arquivo que NÃO é parcela continua como divergência', () => {
    const comAvista = [...banco, tx({ id: 'av', description: 'Restaurante', amount: 50, faturaMonthYear: '2026-11' })]
    const p = projetarTotalFatura(resolver(rows, comAvista), opts(comAvista, true))
    expect(p.itensDivergencia.map(i => i.tx.id)).toEqual(['av'])
    expect(p.diferencaReal).toBe(-50)
  })

  it('aguardandoLancamentoDoBanco: só parcela de série e só com a fatura aberta', () => {
    expect(aguardandoLancamentoDoBanco(banco[0], { aberta: true })).toBe(true)
    expect(aguardandoLancamentoDoBanco(banco[1], { aberta: true })).toBe(true)
    expect(aguardandoLancamentoDoBanco(banco[2], { aberta: true })).toBe(false)
    expect(aguardandoLancamentoDoBanco(banco[0], { aberta: false })).toBe(false)
  })
})

const r2 = (n) => Math.round(n * 100) / 100

describe('avaliarConferencia (pós-importação)', () => {
  const arquivo = { total: 8365.51, qtd: 87 }
  it('fatura aberta: arquivo + parcelas aguardando = banco → confere', () => {
    const r = avaliarConferencia(arquivo, { total: 8645.42, qtd: 89 }, { qtd: 2, total: 279.91 })
    expect(r).toMatchObject({ ok: true, diff: 0, esperado: 8645.42, qtdEsperada: 89, aguardando: { qtd: 2, total: 279.91 } })
  })
  it('sem aguardando, a mesma diferença continua acusando', () => {
    expect(avaliarConferencia(arquivo, { total: 8645.42, qtd: 89 })).toMatchObject({ ok: false, diff: 279.91, qtdEsperada: 87 })
  })
  it('diferença além das aguardando segue divergente; sem banco ainda, diff null', () => {
    expect(avaliarConferencia(arquivo, { total: 8700, qtd: 90 }, { qtd: 2, total: 279.91 }).ok).toBe(false)
    expect(avaliarConferencia(arquivo, null, { qtd: 2, total: 279.91 })).toMatchObject({ ok: false, diff: null })
    expect(avaliarConferencia(arquivo, { ok: true }, { qtd: 2, total: 279.91 })).toMatchObject({ ok: false, diff: null })
  })
})
