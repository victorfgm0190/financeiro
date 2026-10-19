import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { parseItauXLS } from '../parsers/itauFatura'
import {
  lerData, lerValor, registro, lerCsv, aplicarModelo, acharModelo, assinaturaCabecalho, palpiteDeModelo, modeloValido,
  deOfx, deLinhasDoCartao, paraLinhaCartao, paraLinhaConta, formatoDoArquivo, modeloDoMapeamentoAntigo, MODELOS_PRONTOS,
} from './index.js'
import { migrarMapeamentosAntigos } from '../importLayoutsApi.js'
import { resolverLinhasRevisao } from '../revisaoImportacao.js'

const lerFixture = (nome) => {
  const wb = XLSX.read(readFileSync(new URL(`../parsers/__fixtures__/${nome}`, import.meta.url)), { type: 'buffer', cellDates: true })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}

describe('registro: data e valor', () => {
  it('datas nos três formatos, série do Excel e Date', () => {
    expect(lerData('31/12/2026')).toBe('2026-12-31')
    expect(lerData('2026-12-31', 'dmy')).toBe('2026-12-31') // ano com 4 dígitos na frente é sempre ymd
    expect(lerData('12/31/2026', 'mdy')).toBe('2026-12-31')
    expect(lerData('05.10.26')).toBe('2026-10-05')
    expect(lerData(46022)).toBe('2025-12-31')
    expect(lerData(new Date(2026, 9, 5))).toBe('2026-10-05')
    expect(lerData('32/01/2026')).toBeNull()
  })
  it('valores com vírgula/ponto, R$, parênteses, sinal no fim e D/C', () => {
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('1,234.56', '.')).toBe(1234.56)
    expect(lerValor('-R$ 12,30')).toBe(-12.3)
    expect(lerValor('(12,30)')).toBe(-12.3)
    expect(lerValor('12,30-')).toBe(-12.3)
    expect(lerValor('50,00 D')).toBe(-50)
    expect(lerValor('50,00 C')).toBe(50)
    expect(Number.isNaN(lerValor('abc'))).toBe(true)
  })
  it('registro: valor absoluto, tipo e parcela detectada na descrição', () => {
    expect(registro({ date: '2026-10-01', description: 'Loja X 2/5', amount: -100, type: 'expense' }))
      .toMatchObject({ amount: 100, type: 'expense', parcela_num: 2, parcela_total: 5 })
  })
})

describe('Itaú segue a interface sem mudar o comportamento', () => {
  it('cada registro guarda a linha do parser (raw) — é ela que a revisão usa, idêntica', () => {
    const { rows } = parseItauXLS(lerFixture('itau-fatura-aberta.xlsx'), [])
    const regs = deLinhasDoCartao(rows)
    expect(regs).toHaveLength(rows.length)
    expect(regs.map(r => r.raw)).toEqual(rows) // mesmas linhas, mesmos objetos
    const soma = (l) => Math.round(l.reduce((s, r) => s + (r.type === 'income' ? -r.amount : r.amount), 0) * 100) / 100
    expect(soma(regs)).toBe(soma(rows))
  })
  it('a linha montada a partir do registro tem o mesmo formato da do parser', () => {
    const { rows } = parseItauXLS(lerFixture('itau-fatura-aberta.xlsx'), [])
    const linha = paraLinhaCartao(deLinhasDoCartao(rows))[0]
    for (const k of Object.keys(rows[0])) expect(linha).toHaveProperty(k)
  })
})

const OFX_CARTAO = `OFXHEADER:100
DATA:OFXSGML
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKACCTFROM><ACCTID>4111</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-120.50<FITID>A1<MEMO>MERCADO BOM 2/3</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>30,00<FITID>A2<NAME>ESTORNO LOJA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261007<TRNAMT>900.00<FITID>A3<MEMO>PAGAMENTO EFETUADO</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`

describe('OFX (sintético)', () => {
  it('cartão: compra = despesa, crédito = estorno, pagamento da fatura fica fora; FITID no raw', () => {
    const { registros, conta } = deOfx(OFX_CARTAO, { tipo: 'cartao' })
    expect(conta).toBe('4111')
    expect(registros.map(r => [r.date, r.type, r.amount, r.raw.fitid])).toEqual([
      ['2026-10-05', 'expense', 120.5, 'A1'], ['2026-10-06', 'income', 30, 'A2'],
    ])
    expect(registros[0]).toMatchObject({ parcela_num: 2, parcela_total: 3 })
    const linhas = paraLinhaCartao(registros, [{ id: 'cat_est', name: 'Estorno' }])
    expect(linhas[1]).toMatchObject({ type: 'income', isDeposit: true, categoryId: 'cat_est', fitid: 'A2' })
  })
  it('conta: pagamento entra (é saída da conta) e a linha vira "conta do arquivo"', () => {
    const { registros } = deOfx(OFX_CARTAO, { tipo: 'conta' })
    expect(registros).toHaveLength(3)
    const linhas = paraLinhaConta(registros, 'Extrato OFX 4111')
    expect(linhas[0]).toMatchObject({ type: 'expense', fromAccount: 'Extrato OFX 4111', toAccount: '', fitid: 'A1' })
    expect(linhas[1]).toMatchObject({ type: 'income', toAccount: 'Extrato OFX 4111' })
  })
  it('revisão do cartão: mesmo FITID já gravado → "Já existe"', () => {
    const linhas = paraLinhaCartao(deOfx(OFX_CARTAO, { tipo: 'cartao' }).registros).map(l => ({ ...l, faturaMonthYear: '2026-10' }))
    const banco = [{ id: 't1', accountId: 'card', type: 'expense', amount: 120.5, description: 'outro texto', fitid: 'A1', faturaMonthYear: '2026-10' }]
    const r = resolverLinhasRevisao(linhas, { accountId: 'card', transactions: banco, closingDay: 13 })
    expect(r[0]).toMatchObject({ _isDuplicate: true, _dupLevel: 'certeza' })
    expect(r[1]._isDuplicate).toBe(false)
  })
  it('formato do arquivo', () => {
    expect(formatoDoArquivo('extrato.ofx')).toBe('ofx')
    expect(formatoDoArquivo('qualquer.txt', 'OFXHEADER:100')).toBe('ofx')
    expect(formatoDoArquivo('fatura.xlsx')).toBe('planilha')
  })
})

describe('planilha genérica com modelo', () => {
  const CSV = 'Extrato Banco Z\n\nData;Histórico;Débito;Crédito\n01/10/2026;"Padaria; Centro";12,30;\n02/10/2026;Salário;;5.000,00\n03/10/2026;SALDO DO DIA;;\n04/10/2026;Pagamento efetuado;100,00;\n'
  it('lê CSV com ";" e aspas; acha o cabeçalho; débito e crédito separados; ignora linhas', () => {
    const tabela = lerCsv(CSV)
    expect(tabela.linhas[1]).toEqual(['Data', 'Histórico', 'Débito', 'Crédito'])
    expect(tabela.linhas[2]).toEqual(['01/10/2026', 'Padaria; Centro', '12,30', ''])
    const m = palpiteDeModelo(tabela)
    expect(m).toMatchObject({ linhaCabecalho: 1, colData: 0, colDescricao: 1, colValor: null, colDebito: 2, colCredito: 3 })
    expect(modeloValido(m)).toBe(true)
    const { registros, ignoradas } = aplicarModelo(tabela, m)
    expect(registros.map(r => [r.date, r.description, r.type, r.amount])).toEqual([
      ['2026-10-01', 'Padaria; Centro', 'expense', 12.3], ['2026-10-02', 'Salário', 'income', 5000],
    ])
    expect(ignoradas).toBe(2)
  })
  it('coluna única de valor com despesas positivas (sinal invertido)', () => {
    const tabela = lerCsv('date,title,amount\n2026-10-05,Uber,23.90\n2026-10-06,Estorno Uber,-23.90\n')
    const modelo = acharModelo(tabela, 'cartao')
    expect(modelo.id).toBe('pronto:nubank-cartao')
    const { registros } = aplicarModelo(tabela, modelo.mapeamento)
    expect(registros.map(r => [r.type, r.amount])).toEqual([['expense', 23.9], ['income', 23.9]])
  })
  it('modelo do usuário vence o pronto; tipo precisa bater', () => {
    const tabela = lerCsv('date,title,amount\n2026-10-05,Uber,23.90\n')
    const meu = { id: 'u1', tipo: 'cartao', assinatura: assinaturaCabecalho(['date', 'title', 'amount']), mapeamento: { ...MODELOS_PRONTOS[0].mapeamento, sinalDespesa: 'negativo' } }
    expect(acharModelo(tabela, 'cartao', [meu]).id).toBe('u1')
    expect(acharModelo(tabela, 'conta', [meu])).toBeNull()
  })
})

describe('migração dos mapeamentos antigos (localStorage → import_layouts)', () => {
  const lsCom = (v) => { const m = new Map([['finup_csv_mappings', JSON.stringify(v)]]); return { getItem: k => m.get(k) ?? null, removeItem: k => m.delete(k), m } }
  const antigo = { 'data|lançamento|valor': { dateCol: 'data', descCol: 'lançamento', amountCol: 'valor', negativeIsExpense: false } }

  it('converte nomes de coluna em índices e a assinatura normalizada', () => {
    expect(modeloDoMapeamentoAntigo('data|lançamento|valor', antigo['data|lançamento|valor'])).toMatchObject({
      tipo: 'cartao', assinatura: 'data|lancamento|valor', mapeamento: { colData: 0, colDescricao: 1, colValor: 2, sinalDespesa: 'positivo' },
    })
  })
  it('copia, confirma na tabela e só então limpa o localStorage; rodar de novo não duplica', async () => {
    const tabela = []
    const api = {
      salvar: vi.fn(async (m) => { const i = tabela.findIndex(t => t.tipo === m.tipo && t.assinatura === m.assinatura); if (i >= 0) tabela[i] = m; else tabela.push(m); return m }),
      listar: vi.fn(async () => [...tabela]),
    }
    const ls = lsCom(antigo)
    await migrarMapeamentosAntigos({ ls, api })
    expect(tabela).toHaveLength(1)
    expect(ls.m.has('finup_csv_mappings')).toBe(false)
    await migrarMapeamentosAntigos({ ls: lsCom(antigo), api })
    expect(tabela).toHaveLength(1)
  })
  it('falhou ao gravar → mantém o localStorage (fallback)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ls = lsCom(antigo)
    await migrarMapeamentosAntigos({ ls, api: { salvar: async () => { throw new Error('sem rede') }, listar: async () => [] } })
    expect(ls.m.has('finup_csv_mappings')).toBe(true)
  })
})
