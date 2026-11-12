import { describe, it, expect } from 'vitest'
import { resolverLinhasRevisao, linhasAImportar, idsNoBancoConferidos } from './revisaoImportacao'
import { aplicarJaLancados, patchesJaLancado, favorecidoDaLinha } from './casamentoFatura'
import { aplicarCorrespondencias, resumoRevisao } from './importacaoCorrespondencias'

// Fatura 11/2026 de um cartão com fechamento dia 13.
const CARD = 'card_x'
const accounts = [{ id: CARD, type: 'credit', closingDay: 13, name: 'Cartão X' }]
const tx = (o) => ({ accountId: CARD, accountType: 'credit', type: 'expense', reconciled: false, ...o })
const linha = (o) => ({ type: 'expense', faturaMonthYear: '2026-11', selected: true, ...o })

const PROJECAO = tx({ id: 'proj8', amount: 205.61, date: '2026-10-15', faturaMonthYear: '2026-11', description: 'Seguradora Alfa Parc2 08/12', payee: 'Seguradora Alfa', installmentNum: 8, installmentTotal: 12, origin: 'importacao_fatura', categoryId: 'cat_seg' })
const ASSISTENTE = tx({ id: 'assist', amount: 32.9, date: '2026-10-25', description: 'Padaria do Zé', payee: 'Padaria do Zé', origin: 'manual' })
const FARMACIA = tx({ id: 'farm', amount: 50, date: '2026-10-20', description: 'Farmácia', payee: 'Pague Menos', origin: 'manual' })
const VIZINHA = tx({ id: 'viz', amount: 120, date: '2026-10-12', description: 'Posto Shell', payee: 'Posto Shell', origin: 'manual' })
const CONCILIADO_OUTRO_MES = tx({ id: 'netflix10', amount: 55.9, date: '2026-09-20', faturaMonthYear: '2026-10', description: 'NETFLIX.COM', reconciled: true, origin: 'importacao_fatura' })

const rows = [
  linha({ _id: 'a', description: 'SEGURADORA ALFA 08/12', amount: 205.61, date: '2026-10-30', _dateCartao: '2026-10-30', _installment: { num: 8, total: 12 } }),
  linha({ _id: 'b', description: 'PADARIA DO ZE LTDA', amount: 32.9, date: '2026-10-25', _dateCartao: '2026-10-25' }),
  linha({ _id: 'c', description: 'FARMACIA PAGUE MENOS', amount: 52, date: '2026-10-20', _dateCartao: '2026-10-20' }),
  linha({ _id: 'd', description: 'LIVRARIA CULTURA', amount: 80, date: '2026-10-22', _dateCartao: '2026-10-22' }),
  linha({ _id: 'e', description: 'POSTO SHELL', amount: 120, date: '2026-10-14', _dateCartao: '2026-10-14' }),
  linha({ _id: 'f', description: 'NETFLIX.COM', amount: 55.9, date: '2026-10-20', _dateCartao: '2026-10-20' }),
]

const revisar = (rs, transactions) => {
  const base = resolverLinhasRevisao(rs, { accountId: CARD, transactions, closingDay: 13 })
  const ja = aplicarJaLancados(base, { transactions, accountId: CARD, closingDay: 13 })
  return aplicarCorrespondencias(ja, { transactions, accounts, accountId: CARD })
}

// O que a confirmação faz (ImportPanel): UPDATE dos "Já lançado", conciliação dos casados, INSERT dos novos.
const confirmar = (out, transactions) => {
  const byId = new Map(transactions.map(t => [t.id, { ...t }]))
  for (const r of out.filter(x => x._jaLancado && x._jaLancado.origem !== 'pre')) {
    for (const { tx: t, changes } of patchesJaLancado(r, { saveDate: r.date, payee: favorecidoDaLinha(r) })) Object.assign(byId.get(t.id), changes)
  }
  for (const id of idsNoBancoConferidos(out)) byId.get(id).reconciled = true
  for (const r of linhasAImportar(out)) {
    byId.set(`novo_${r._id}`, tx({
      id: `novo_${r._id}`, amount: r.amount, date: r.date, dateCartao: r._dateCartao, description: r.description,
      faturaMonthYear: r.faturaMonthYear, reconciled: true, origin: 'importacao_fatura',
      installmentNum: r._installment?.num ?? null, installmentTotal: r._installment?.total ?? null,
    }))
  }
  return [...byId.values()]
}

describe('Importar Fatura × lançamentos que já existem', () => {
  const base = [PROJECAO, ASSISTENTE, FARMACIA, VIZINHA, CONCILIADO_OUTRO_MES]
  // Fatura vizinha PERGUNTA; valor diferente (±5%) deixou de perguntar (12/11/2026). `out` = depois das escolhas.
  const sugerido = Object.fromEntries(revisar(rows, base).map(r => [r._id, r]))
  const escolhas = { c: 'farm', e: 'viz' }
  const out = revisar(rows.map(r => ({ ...r, _jaLancadoEscolha: escolhas[r._id] })), base)
  const por = Object.fromEntries(out.map(r => [r._id, r]))

  it('a) parcela já projetada (mesmo valor, data diferente) → Já existe pelo nº da parcela', () => {
    expect(por.a).toMatchObject({ _isDuplicate: true, _dbTx: PROJECAO, selected: false })
    expect(por.a._jaLancado?.divergente?.valor ?? null).toBeNull()
  })

  it('b) lançado pelo Assistente com outro nome → Já existe e o favorecido passa a ser o da fatura (o atual no histórico)', () => {
    expect(por.b).toMatchObject({ _isDuplicate: true, _dbTx: ASSISTENTE })
    expect(favorecidoDaLinha(por.b)).toBe('PADARIA DO ZE LTDA')
    const [{ changes, mudancas }] = patchesJaLancado(por.b, { saveDate: por.b.date, payee: favorecidoDaLinha(por.b) })
    expect(changes.payee).toBe('PADARIA DO ZE LTDA')
    expect(mudancas).toContainEqual({ campo: 'payee', de: 'Padaria do Zé', para: 'PADARIA DO ZE LTDA' })
  })

  it('c) R$ 2,00 de diferença (mesma loja, ±5%) → NÃO é proposto (nem pergunta, nem aviso): entra como novo, mesmo com uma escolha antiga', () => {
    expect(sugerido.c.selected).toBe(true)
    expect(sugerido.c._jaLancado).toBeUndefined()
    expect(sugerido.c._jaLancadoOpcoes).toBeUndefined()
    expect(sugerido.c._avisoParecido).toBeUndefined()
    // Uma escolha que não está entre as opções permitidas não vincula nada.
    expect(por.c._jaLancado).toBeUndefined()
    expect(por.c.selected).toBe(true)
  })

  it('d) compra nova → Novo; conciliado de outra fatura (assinatura do mês passado) não casa', () => {
    expect(por.d._isDuplicate).toBeFalsy()
    expect(por.d._jaLancadoOpcoes).toBeUndefined()
    expect(por.f._isDuplicate).toBeFalsy()
    expect(linhasAImportar(out).map(r => r._id).sort()).toEqual(['c', 'd', 'f'])
  })

  it('lançado em fatura vizinha (data antes do fechamento) → pergunta; escolhido, vai para a fatura do arquivo', () => {
    expect(sugerido.e._jaLancadoOpcoes.map(t => t.id)).toEqual(['viz'])
    expect(por.e._jaLancado).toMatchObject({ origem: 'match', tx: VIZINHA, fatura: { de: '2026-10', para: '2026-11' } })
  })

  it('resumo do topo e conciliação dos existentes', () => {
    expect(resumoRevisao(out)).toEqual({ novos: 3, jaExistem: 2, valorDiferente: 1, parecidos: 0 })
    expect(idsNoBancoConferidos(out).sort()).toEqual(['assist', 'proj8', 'viz'])
  })

  it('só o nome parecido (valor longe) → novo direto, sem "Parecido" e sem aviso', () => {
    const r1 = revisar([linha({ _id: 'p', description: 'FARMACIA PAGUE MENOS', amount: 140, date: '2026-10-21', _dateCartao: '2026-10-21' })], [FARMACIA])
    expect(r1[0]).toMatchObject({ selected: true })
    expect(r1[0]._jaLancadoOpcoes).toBeUndefined()
    expect(r1[0]._avisoParecido).toBeUndefined()
    expect(resumoRevisao(r1).parecidos).toBe(0)
    expect(linhasAImportar(r1).map(r => r._id)).toEqual(['p'])
  })

  it('"É novo" numa pergunta importa', () => {
    const novo = revisar([linha({ _id: 'p', description: 'FARMACIA PAGUE MENOS', amount: 51, date: '2026-10-21', _dateCartao: '2026-10-21', _jaLancadoEscolha: 'novo' })], [FARMACIA])
    expect(linhasAImportar(novo).map(r => r._id)).toEqual(['p'])
  })

  it('importar a mesma fatura duas vezes não cria nada na segunda', () => {
    const depois = confirmar(out, base)
    // Reimportação: a linha nova não traz as escolhas — os conciliados são reconhecidos em silêncio.
    const segunda = revisar(rows.map(r => ({ ...r })), depois)
    expect(linhasAImportar(segunda)).toEqual([])
    expect(segunda.every(r => r._isDuplicate || r._collisionTx)).toBe(true)
  })

  it('nunca casa em fatura fechada', () => {
    const fechado = aplicarCorrespondencias(
      aplicarJaLancados(resolverLinhasRevisao([rows[2]], { accountId: CARD, transactions: [FARMACIA], closingDay: 13 }), { transactions: [FARMACIA], accountId: CARD, closingDay: 13 }),
      { transactions: [FARMACIA], accounts, accountId: CARD, faturasFechadas: { [`${CARD}_2026-11`]: true } })
    expect(fechado[0]._jaLancado).toBeUndefined()
  })
})
