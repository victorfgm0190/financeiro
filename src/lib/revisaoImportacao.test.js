import { describe, it, expect } from 'vitest'
import {
  patchAplicavel, ajusteDeValorDaLinha, motivoAjusteValor, resumoAjustesDeValor, mudancasDaColisao,
  resolverLinhasRevisao, projetarTotalFatura, compararNaFatura, patchColisao, camposAlteradosColisao, textoResumoImportacao, idsNoBancoConferidos, idsReedicaoConferidos,
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

  it('pontuação e plural não separam a mesma compra (Shopee Guardanapos 09/10 × Shopee *Guardanapo 9/10)', () => {
    const banco = tx({ id: 't', description: 'Shopee Guardanapos 09/10', amount: 54.93, installmentNum: 9, installmentTotal: 10, dateCartao: '2026-03-08' })
    expect(compararNaFatura(linha({ description: 'Shopee *Guardanapo 9/10', amount: 54.93, _installment: { num: 9, total: 10 }, _dateCartao: '2026-03-08' }), banco)).toBe('existe')
  })

  it('compras diferentes de mesmo valor e data ("Uber" × "Ifood") não casam', () => {
    const banco = tx({ id: 't', description: 'Ifood *Restaurante', amount: 32.5, dateCartao: '2026-10-05' })
    expect(compararNaFatura(linha({ description: 'Uber *Trip', amount: 32.5, _dateCartao: '2026-10-05' }), banco)).toBeNull()
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
    // Centavos de arredondamento na previsão NÃO conciliada da mesma parcela: atualiza a previsão
    // sozinha (decisão de 12/11/2026) — nunca pergunta ("possível duplicata").
    const arred = resolver([{ ...row, amount: 33.37 }], [projecao])[0]
    expect(arred._collisionTx).toBe(projecao)
    expect(arred._ajustarValor).toBe(true)
    expect(arred._dupLevel).toBeNull()
    expect(patchColisao(arred, projecao, { saveDate: '2026-10-05' }).amount).toBe(33.37)
    // Colisão exata não mexe no valor.
    expect(patchColisao(resolver([row], [projecao])[0], projecao, { saveDate: '2026-10-05' })).not.toHaveProperty('amount')
    // Conciliada (regra de 14/11/2026, vale o valor da fatura do banco): casa e assume o valor do
    // arquivo — só valor, data e fatura; a prévia destaca (_ajusteValor.conciliado).
    const projConc = { ...projecao, reconciled: true }
    const conc = resolver([{ ...row, amount: 33.37 }], [projConc])[0]
    expect(conc._collisionTx).toBe(projConc)
    expect(conc._dupLevel).toBeNull()
    expect(conc._ajusteValor).toMatchObject({ de: 33.34, para: 33.37, conciliado: true })
    expect(Object.keys(patchAplicavel(conc, projConc, patchColisao(conc, projConc, { saveDate: '2026-10-05' }))).sort())
      .toEqual(['amount', 'dateCartao', 'faturaMonthYear'].sort())
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
    // Padaria e o estorno entram; a Farmácia desmarcada fica de fora. A Aramis 3/4 é possível
    // duplicata AINDA SEM DECISÃO: não é representada pela 4/4 gravada (que fica "só no Finup") —
    // vira item 'sem_decisao', que a conferência não conta como explicado.
    expect(p.projetado).toBe(164.95)
    expect(p.diferenca).toBe(30)
    expect(p.itens.map(i => [i.tipo, i.valor])).toEqual([['sem_decisao', 149.95], ['linha_fora', 30], ['so_no_banco', -149.95]])
    expect(p.itens.reduce((s, i) => s + i.valor, 0)).toBeCloseTo(p.diferenca, 2)
    // Decidida ("é a mesma"), a 4/4 representa a linha e sobra só a Farmácia.
    const decidida = projetarTotalFatura(resolver([{ ...rows[0], _mesmoQueId: 'a4' }, ...rows.slice(1)], banco), opts(banco))
    expect(decidida.itens.map(i => i.tipo)).toEqual(['linha_fora'])
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

describe('idsReedicaoConferidos', () => {
  it('só os do arquivo da importação: com data do cartão ou na fatura dela; futuras e desmarcadas não', () => {
    const banco = [
      tx({ id: 'a', dateCartao: '2026-10-02', faturaMonthYear: '2026-11' }),
      tx({ id: 'b', faturaMonthYear: '2026-11' }),
      tx({ id: 'fut', faturaMonthYear: '2026-12', installmentNum: 2, installmentTotal: 3 }),
      tx({ id: 'des', dateCartao: '2026-10-05', faturaMonthYear: '2026-11' }),
    ]
    const rows = ['a', 'b', 'fut'].map(id => ({ _id: id, selected: true })).concat({ _id: 'des', selected: false })
    expect(idsReedicaoConferidos(rows, banco, '2026-11')).toEqual(['a', 'b'])
  })
  it('resumo da reedição com conciliados', () => {
    expect(textoResumoImportacao({ salvos: 3, conciliados: 2 })).toBe('3 lançamentos salvos · 2 lançamentos marcados como conciliados')
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

// ─── Regras de candidato e proteção (Etapa 6b-1, decisões de 12/11/2026) ─────────────────────────
import { faturaEstaAberta, podeExcluirSoNoSistema } from './revisaoImportacao'

describe('fatura aberta: não depende só do cabeçalho do arquivo', () => {
  it('cabeçalho do Itaú, quando diz, manda', () => {
    expect(faturaEstaAberta({ cabecalhoAberta: true, fatura: '2026-01', closingDay: 13, hoje: '2026-11-12' })).toBe(true)
    expect(faturaEstaAberta({ cabecalhoAberta: false, fatura: '2026-12', closingDay: 13, hoje: '2026-11-12' })).toBe(false)
  })
  it('CSV (sem cabeçalho): pelo calendário do cartão — aberta até o dia de fechamento, inclusive', () => {
    expect(faturaEstaAberta({ fatura: '2026-11', closingDay: 13, hoje: '2026-11-12' })).toBe(true)
    expect(faturaEstaAberta({ fatura: '2026-11', closingDay: 13, hoje: '2026-11-13' })).toBe(true)
    expect(faturaEstaAberta({ fatura: '2026-11', closingDay: 13, hoje: '2026-11-14' })).toBe(false)
    expect(faturaEstaAberta({ fatura: '2026-12', closingDay: 13, hoje: '2026-11-20' })).toBe(true)
    // Fechamento no dia 31 num mês de 30 dias: o último dia do mês.
    expect(faturaEstaAberta({ fatura: '2026-11', closingDay: 31, hoje: '2026-11-30' })).toBe(true)
  })
  it('fatura marcada como fechada pelo usuário está fechada', () => {
    expect(faturaEstaAberta({ fatura: '2026-12', closingDay: 13, hoje: '2026-11-20', fechadaPeloUsuario: true })).toBe(false)
  })
  it('parcela prevista sem linha no arquivo de um CSV de fatura aberta = aguardando o banco (não sai)', () => {
    const parcela = tx({ id: 'p', description: 'Loja 3/5', installmentNum: 3, installmentTotal: 5 })
    const aberta = faturaEstaAberta({ fatura: '2026-11', closingDay: 13, hoje: '2026-11-12' })
    expect(aguardandoLancamentoDoBanco(parcela, { aberta })).toBe(true)
  })
})

describe('Conciliar Fatura — "Só no sistema": excluir só à vista não conciliado de fatura fechada', () => {
  const avista = tx({ id: 'a', description: 'Padaria', amount: 10 })
  it('à vista não conciliado de fatura fechada: pode', () => {
    expect(podeExcluirSoNoSistema(avista, { aberta: false })).toBe(true)
  })
  it('nunca conciliado, nunca parcela, nunca fatura aberta', () => {
    expect(podeExcluirSoNoSistema({ ...avista, reconciled: true }, { aberta: false })).toBe(false)
    expect(podeExcluirSoNoSistema(tx({ id: 'p', description: 'Loja 3/5', installmentNum: 3, installmentTotal: 5 }), { aberta: false })).toBe(false)
    expect(podeExcluirSoNoSistema(tx({ id: 'p1', description: 'Loja 5/5', installmentNum: 5, installmentTotal: 5 }), { aberta: false })).toBe(false)
    expect(podeExcluirSoNoSistema(avista, { aberta: true })).toBe(false)
  })
})

describe('"Também em outra fatura": só não conciliado e de fatura aberta', () => {
  const linhaClinica = linha({ _id: 0, description: 'Clinica Exemplo', amount: 300, _dateCartao: '2026-09-20' })
  it('conciliado ou de fatura fechada não aparece', () => {
    const outra = tx({ id: 'o', description: 'Clinica Exemplo', amount: 300, faturaMonthYear: '2026-09', dateCartao: '2026-09-20' })
    expect(resolver([linhaClinica], [outra])[0]._tambemEm.map(o => o.tx.id)).toEqual(['o'])
    expect(resolver([linhaClinica], [{ ...outra, reconciled: true }])[0]._tambemEm).toEqual([])
    const fechada = resolverLinhasRevisao([linhaClinica], { accountId: CARTAO, transactions: [outra], closingDay: 13, faturasFechadas: { [`${CARTAO}_2026-09`]: true } })
    expect(fechada[0]._tambemEm).toEqual([])
  })
})

// VALE O VALOR DA FATURA DO BANCO (14/11/2026). Dados fictícios, no formato do caso real: parcela 4/5
// prevista com R$ 74,30 e o banco cobrando R$ 74,29.
describe('importação: vale o valor da fatura do banco', () => {
  const inst = (num, total) => ({ num, total, base: 'Seguro Parc', matchStr: `${num}/${total}` })
  const serie = [3, 4, 5].map(n => tx({ id: `s${n}`, description: `Seguro Parc${n}`, amount: 74.3, faturaMonthYear: `2026-${8 + n}`.replace('2026-13', '2027-01'), installmentNum: n, installmentTotal: 5, serieId: 'serie1' }))
  const parc4 = serie[1]
  const linha4 = (amount, o = {}) => linha({ _id: 4, description: 'Seguro Parc4', amount, faturaMonthYear: parc4.faturaMonthYear, _installment: inst(4, 5), ...o })

  it('casamento exato: nada muda', () => {
    const [r] = resolver([linha4(74.3)], serie)
    expect(r._collisionTx).toBe(parc4)
    expect(r._ajusteValor).toBeNull()
    expect(patchColisao(r, parc4, { saveDate: parc4.date })).not.toHaveProperty('amount')
  })

  it('por tolerância (R$ 0,01): assume o valor do banco, com motivo para o histórico', () => {
    const [r] = resolver([linha4(74.29)], serie)
    expect(r._collisionTx).toBe(parc4)
    expect(r._ajusteValor).toEqual({ de: 74.3, para: 74.29, diferenca: -0.01, conciliado: false })
    expect(patchColisao(r, parc4, { saveDate: parc4.date }).amount).toBe(74.29)
    expect(motivoAjusteValor(r._ajusteValor)).toBe('Ajustado ao valor da fatura do banco (R$ 74,30 → R$ 74,29)')
    const res = resumoAjustesDeValor([r])
    expect([res.qtd, res.diferenca]).toEqual([1, -0.01])
  })

  it('parcela de série: só a parcela casada muda; as outras ficam como estão', () => {
    const [r] = resolver([linha4(74.29)], serie)
    expect(r._dbTx.id).toBe('s4')
    // O ajuste é do lançamento casado (_dbTx); as outras parcelas não têm linha nem ajuste.
    expect(ajusteDeValorDaLinha(r, r._dbTx)).toMatchObject({ de: 74.3, para: 74.29 })
    expect(serie.filter(t => t.id !== 's4').every(t => t.amount === 74.3)).toBe(true)
  })

  it('reimportação: o lançamento já conciliado com o valor previsto é corrigido (e destacado)', () => {
    const conciliada = serie.map(t => (t.id === 's4' ? { ...t, reconciled: true } : t))
    const [r] = resolver([linha4(74.29)], conciliada)
    expect(r._collisionTx.id).toBe('s4')
    expect(r._ajusteValor.conciliado).toBe(true)
    const patch = patchColisao(r, r._collisionTx, { saveDate: r._collisionTx.date, faturaRef: null })
    expect(mudancasDaColisao(r, r._collisionTx, patch)).toEqual(['amount'])
    expect(patchAplicavel(r, r._collisionTx, patch)).not.toHaveProperty('description')
  })

  it('o total projetado da fatura fica igual ao do arquivo', () => {
    const rows = resolver([linha4(74.29)], serie)
    const p = projetarTotalFatura(rows, { fatura: parc4.faturaMonthYear, accountId: CARTAO, transactions: serie, closingDay: 13 })
    expect(p.projetado).toBe(74.29)
    expect(p.diferenca).toBe(0)
    // Colisão desmarcada ("não atualizar"): o ajuste não é gravado e a diferença aparece.
    const p2 = projetarTotalFatura(rows.map(r => ({ ...r, _ajusteIgnorado: true })), { fatura: parc4.faturaMonthYear, accountId: CARTAO, transactions: serie, closingDay: 13 })
    expect(p2.diferenca).toBe(-0.01)
  })
})
