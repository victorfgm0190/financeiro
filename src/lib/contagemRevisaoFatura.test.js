// Contagem única da revisão da fatura (Importar Fatura → etapa 2). Dados fictícios.
import { describe, it, expect } from 'vitest'
import {
  situacaoLinha, contarRevisaoFatura, abaInicial, linhasDaAba, agruparEstornosCentavos,
  conferenciaDaFatura, separarSufixo, lerConferenciaAberta, lembrarConferenciaAberta, SITUACAO,
} from './contagemRevisaoFatura'
import { linhasAImportar, projetarTotalFatura } from './revisaoImportacao'

const linha = (id, extra = {}) => ({ _id: id, description: `Loja ${id}`, amount: 10, type: 'expense', selected: true, faturaMonthYear: '2026-11', ...extra })
const TX = { id: 't1', accountId: 'card', type: 'expense', amount: 10, description: 'Loja', date: '2026-11-02', faturaMonthYear: '2026-11' }

// Uma fatura com cada situação.
const ROWS = [
  linha('novo1'),
  linha('novo2', { amount: 20 }),
  linha('pre', { _jaLancado: { origem: 'pre', tx: { id: 'p' } } }),                         // pré-lançamento: importado
  linha('existe', { selected: false, _isDuplicate: true, _dupLevel: 'certeza', _dbTx: TX }),
  linha('colisao', { selected: false, _collisionTx: { ...TX, id: 't2' }, _dbTx: { ...TX, id: 't2' } }), // "No banco ↻"
  linha('jalancado', { selected: false, _isDuplicate: true, _dupLevel: 'certeza', _dbTx: { ...TX, id: 't3' }, _jaLancado: { origem: 'match', tx: TX } }),
  linha('escolher', { selected: false, _jaLancadoOpcoes: [TX] }),
  linha('possivel', { selected: false, _dupLevel: 'possivel', _dupTx: TX }),
  linha('forcada', { selected: true, _dupLevel: 'possivel', _dupTx: TX }),                  // "importar mesmo assim"
  linha('escolhidaNova', { selected: true, _jaLancadoOpcoes: [TX], _jaLancadoEscolha: 'novo' }),
  linha('desmarcada', { selected: false, amount: 5 }),
  linha('estorno', { type: 'income', amount: 3 }),
]

describe('situação de cada linha', () => {
  it.each([
    ['novo1', SITUACAO.IMPORTAR], ['pre', SITUACAO.IMPORTAR], ['forcada', SITUACAO.IMPORTAR], ['escolhidaNova', SITUACAO.IMPORTAR],
    ['existe', SITUACAO.CONCILIADO], ['colisao', SITUACAO.CONCILIADO], ['jalancado', SITUACAO.CONCILIADO],
    ['escolher', SITUACAO.DECISAO], ['possivel', SITUACAO.DECISAO],
    ['desmarcada', SITUACAO.DESMARCADO],
  ])('%s → %s', (id, sit) => {
    expect(situacaoLinha(ROWS.find(r => r._id === id))).toBe(sit)
  })
})

describe('contagem única', () => {
  const c = contarRevisaoFatura(ROWS)
  it('fecha: total = importar + já conciliados + decisão + desmarcados', () => {
    expect(c.total).toBe(ROWS.length)
    expect(c.importar.qtd + c.conciliados.qtd + c.decisao.qtd + c.desmarcados.qtd).toBe(c.total)
    expect(c).toMatchObject({ importar: { qtd: 6 }, conciliados: { qtd: 3 }, decisao: { qtd: 2 }, desmarcados: { qtd: 1 } })
  })
  it('"A importar" é exatamente o que a confirmação insere (linhasAImportar)', () => {
    expect(c.importar.qtd).toBe(linhasAImportar(ROWS).length)
    const ids = new Set(linhasAImportar(ROWS).map(r => r._id))
    expect(ROWS.filter(r => situacaoLinha(r) === SITUACAO.IMPORTAR).every(r => ids.has(r._id))).toBe(true)
  })
  it('valores com o sinal da fatura (estorno abate) e o total do arquivo soma as quatro', () => {
    expect(c.importar.valor).toBe(10 + 20 + 10 + 10 + 10 - 3)
    expect(c.arquivo.valor).toBe(Math.round((c.importar.valor + c.conciliados.valor + c.decisao.valor + c.desmarcados.valor) * 100) / 100)
  })
  it('a colisão ("No banco ↻") conta em "Já no Finup" — era a diferença 149 × 154', () => {
    const soDuplicadas = ROWS.filter(r => r._isDuplicate).length
    expect(c.conciliados.qtd).toBe(soDuplicadas + 1)
  })
})

describe('abas', () => {
  it('abre em "Precisam de decisão" se houver; senão em "Para importar"', () => {
    expect(abaInicial(contarRevisaoFatura(ROWS))).toBe('decisao')
    expect(abaInicial(contarRevisaoFatura(ROWS.filter(r => situacaoLinha(r) !== SITUACAO.DECISAO)))).toBe('importar')
  })
  it('"Para importar" traz as marcadas e, à parte, as desmarcadas; decisão e conciliados só os seus', () => {
    const { linhas, desmarcadas } = linhasDaAba(ROWS, 'importar')
    expect(linhas.map(r => r._id)).toEqual(['novo1', 'novo2', 'pre', 'forcada', 'escolhidaNova', 'estorno'])
    expect(desmarcadas.map(r => r._id)).toEqual(['desmarcada'])
    expect(linhasDaAba(ROWS, 'decisao').linhas.map(r => r._id)).toEqual(['escolher', 'possivel'])
    expect(linhasDaAba(ROWS, 'conciliados').linhas.map(r => r._id)).toEqual(['existe', 'colisao', 'jalancado'])
    expect(linhasDaAba(ROWS, 'todos').linhas).toHaveLength(ROWS.length)
  })
})

describe('estornos de centavos', () => {
  const est = (id, amount, categoryId = 'c1') => linha(id, { type: 'income', amount, categoryId })
  it('2+ estornos < R$ 1,00 da mesma categoria viram um grupo na posição do primeiro', () => {
    const rows = [linha('a'), est('e1', 0.12), linha('b'), est('e2', 0.3), est('e3', 0.5, 'c2'), est('e4', 1.5)]
    const itens = agruparEstornosCentavos(rows)
    expect(itens.map(i => i.tipo === 'grupo' ? `G(${i.rows.map(r => r._id)})` : i.row._id)).toEqual(['a', 'G(e1,e2)', 'b', 'e3', 'e4'])
    expect(itens[1].total).toBe(-0.42)
  })
  it('sem estornos de centavos repetidos: a lista fica igual', () => {
    const rows = [linha('a'), est('e1', 0.12)]
    expect(agruparEstornosCentavos(rows).map(i => i.row._id)).toEqual(['a', 'e1'])
  })
})

describe('conferência da fatura', () => {
  const card = 'card'
  const gravado = (id, amount, extra = {}) => ({ id, accountId: card, type: 'expense', accountType: 'credit', amount, description: id, date: '2026-11-03', faturaMonthYear: '2026-11', ...extra })
  const transactions = [
    gravado('ja', 50),
    gravado('so-finup', 30),                                            // gravado, não veio no arquivo
    gravado('parcela-prevista', 40, { installmentNum: 3, installmentTotal: 5 }), // aguardando o banco
    gravado('centavos', 19.99),
  ]
  const rows = [
    linha('l-ja', { amount: 50, selected: false, _isDuplicate: true, _dupLevel: 'certeza', _dbTx: transactions[0] }),
    linha('l-cent', { amount: 20, selected: false, _isDuplicate: true, _dupLevel: 'certeza', _dbTx: transactions[3] }),
    linha('l-desm', { amount: 7, selected: false }),
    linha('l-novo', { amount: 12 }),
  ]
  const projecao = projetarTotalFatura(rows, { fatura: '2026-11', accountId: card, transactions, aberta: true })
  const conf = conferenciaDaFatura(projecao)
  it('agrupa por motivo, com quantidade e subtotal; a soma dos subtotais é a diferença', () => {
    expect(conf.grupos.map(g => [g.titulo, g.qtd, g.subtotal])).toEqual([
      ['Gravado no Finup, ainda não veio no arquivo', 1, -30],
      ['Parcelas previstas aguardando lançamento do banco', 1, -40],
      ['Diferença de centavos entre Finup e arquivo', 1, 0.01],
      ['Linhas desmarcadas, não serão importadas', 1, 7],
    ])
    expect(conf.diferenca).toBe(Math.round((projecao.arquivo - projecao.projetado) * 100) / 100)
    expect(conf.explicada).toBe(conf.diferenca)
    expect(conf).toMatchObject({ totalmenteExplicada: true, semExplicacao: 0, qtdItens: 4 })
  })
  it('sobra sem explicação → não está totalmente explicada', () => {
    const c = conferenciaDaFatura({ ...projecao, projetado: projecao.projetado - 5 })
    expect(c.totalmenteExplicada).toBe(false)
    expect(c.semExplicacao).toBe(5)
  })
  it('diferença de R$ 1,00 ou mais não é chamada de "centavos"', () => {
    const c = conferenciaDaFatura({ arquivo: 10, projetado: 8, itens: [{ tipo: 'valor_diferente', valor: 2, linha: linha('x') }] })
    expect(c.grupos[0].titulo).toBe('Diferença de valor entre Finup e arquivo')
  })
  it('sem diferença nem itens: nada a mostrar', () => {
    expect(conferenciaDaFatura({ arquivo: 10, projetado: 10, itens: [] }).semDiferenca).toBe(true)
    expect(conferenciaDaFatura(null)).toBeNull()
  })
})

describe('descrição: cidade/sufixo na 2ª linha', () => {
  it('separa só quando há 2+ espaços seguidos', () => {
    expect(separarSufixo('PADARIA PAO QUENTE      SAO PAULO')).toEqual({ principal: 'PADARIA PAO QUENTE', sufixo: 'SAO PAULO' })
    expect(separarSufixo('Loja Exemplo 3/10')).toEqual({ principal: 'Loja Exemplo 3/10', sufixo: '' })
    expect(separarSufixo('')).toEqual({ principal: '', sufixo: '' })
  })
})

describe('painel aberto/fechado lembrado por usuário', () => {
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }
  it('lembra por ambiente e usuário; sem storage (ou com erro) não quebra', () => {
    const st = mem()
    const sessao = { ambSigla: 'XX', id: 'u1' }
    expect(lerConferenciaAberta(sessao, st)).toBeNull()
    lembrarConferenciaAberta(sessao, true, st)
    expect(lerConferenciaAberta(sessao, st)).toBe(true)
    expect(lerConferenciaAberta({ ambSigla: 'XX', id: 'u2' }, st)).toBeNull()
    const quebra = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
    expect(lerConferenciaAberta(sessao, quebra)).toBeNull()
    expect(() => lembrarConferenciaAberta(sessao, false, quebra)).not.toThrow()
  })
})
