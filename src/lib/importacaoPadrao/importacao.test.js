import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { gerarExcelImportacao } from './excel'
import { lerArquivo, lerCsv } from './leitura'
import { lerOfx, decodificarOfx } from './ofx'
import { montarPrevia, lancamentosParaGravar, SEM_CATEGORIA, PREFIXO_NOVA } from './previa'
import { lerData, lerValor, rotulosCategorias, LINHA_CABECALHO, LINHAS_PREPARADAS } from './comum'

const CONTA = { id: 'acc_itau', name: 'Itaú Corrente', type: 'checking' }
const CATEGORIAS = [
  { id: 'c_sal', name: 'Salário', type: 'income' },
  { id: 'c_ali1', name: 'Alimentação', group: 'Casa', type: 'expense' },
  { id: 'c_ali2', name: 'Alimentação', group: 'Trabalho', type: 'expense' },
  { id: 'c_mor', name: 'Moradia', type: 'expense' },
]
const FAVORECIDOS = ['Mercado Bom Preço', 'Empresa X', 'Mercado Bom Preço']
const enc = (s) => new TextEncoder().encode(s)

async function gerar(extra = {}) {
  const buf = await gerarExcelImportacao(ExcelJS, { conta: CONTA, ambiente: 'teste1', categorias: CATEGORIAS, favorecidos: FAVORECIDOS, agora: new Date('2026-10-18T12:00:00Z'), ...extra })
  return new Uint8Array(buf)
}
// Preenche a aba Lançamentos do arquivo gerado (como o usuário faria no Excel) e devolve os bytes.
async function preencher(bytes, linhas) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  const ws = wb.getWorksheet('Lançamentos')
  for (const [n, vals] of linhas) vals.forEach((v, i) => { ws.getCell(n, i + 1).value = v })
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

describe('valores e datas', () => {
  it('lerValor: BR, ponto decimal, número, negativos', () => {
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('1234.56')).toBe(1234.56)
    expect(lerValor('-89,90')).toBe(-89.9)
    expect(lerValor('R$ 1.000,00')).toBe(1000)
    expect(lerValor('(12,30)')).toBe(-12.3)
    expect(lerValor('12,30-')).toBe(-12.3)
    expect(lerValor(-234.5)).toBe(-234.5)
    expect(lerValor('abc')).toBeNaN()
    expect(lerValor('')).toBeNaN()
  })
  it('lerData: série do Excel sem erro de fuso, textos BR/ISO, datas inexistentes', () => {
    expect(lerData(46310)).toBe('2026-10-15') // série do Excel
    expect(lerData('15/10/2026')).toBe('2026-10-15')
    expect(lerData('5/1/26')).toBe('2026-01-05')
    expect(lerData('2026-10-15')).toBe('2026-10-15')
    expect(lerData(new Date(Date.UTC(2026, 9, 15)))).toBe('2026-10-15')
    expect(lerData('31/02/2026')).toBeNull()
    expect(lerData('ontem')).toBeNull()
  })
  it('rótulos de categoria: nome repetido vira "Nome (Grupo)"', () => {
    expect(rotulosCategorias(CATEGORIAS).map(r => r.rotulo)).toEqual(['Alimentação (Casa)', 'Alimentação (Trabalho)', 'Moradia', 'Salário'])
  })
})

describe('Excel gerado', () => {
  it('abas, título travado, colunas de digitação livres, validações e listas', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await gerar())
    expect(wb.worksheets.map(w => [w.name, w.state])).toEqual([
      ['Lançamentos', 'visible'], ['Instruções', 'visible'], ['Listas', 'hidden'], ['_finup', 'veryHidden'],
    ])
    const ws = wb.getWorksheet('Lançamentos')
    expect(ws.getCell('A1').value).toBe('Importação de lançamentos — conta: Itaú Corrente')
    expect(String(ws.getCell('A2').value)).toContain('Ambiente: TESTE1')
    expect([1, 2, 3, 4, 5].map(c => ws.getCell(LINHA_CABECALHO, c).value)).toEqual(['DATA', 'VALOR', 'DESCRIÇÃO', 'CATEGORIA', 'FAVORECIDO'])
    expect(ws.sheetProtection?.sheet).toBe(true)
    // título e cabeçalho travados; digitação livre na linha 4, na 1003 e além (coluna inteira)
    expect(ws.getCell('A1').protection?.locked).not.toBe(false)
    expect(ws.getCell('C3').protection?.locked).not.toBe(false)
    for (const ref of ['A4', 'B4', 'C500', 'D1003', 'E2000']) expect(ws.getCell(ref).protection?.locked).toBe(false)
    expect(ws.getColumn(1).numFmt).toBe('dd/mm/yyyy')
    expect(ws.getColumn(2).numFmt).toBe('#,##0.00')
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 })
    // validações (uma por coluna, linhas 4..1003)
    const dv = ws.dataValidations.model
    const fim = LINHA_CABECALHO + LINHAS_PREPARADAS
    const de = (col) => Object.entries(dv).find(([k]) => k.startsWith(`${col}${LINHA_CABECALHO + 1}`))?.[1] ?? dv[`${col}${LINHA_CABECALHO + 1}`]
    expect(de('A')).toMatchObject({ type: 'date', showErrorMessage: true })
    expect(de('B')).toMatchObject({ type: 'decimal' })
    expect(de('D')).toMatchObject({ type: 'list', formulae: ['Listas!$A$2:$A$5'], errorStyle: 'warning' })
    expect(de('E')).toMatchObject({ type: 'list', formulae: ['Listas!$B$2:$B$3'] })
    expect(de('E').showErrorMessage).toBeFalsy() // aceita favorecido novo
    expect(JSON.stringify(Object.keys(dv))).toContain(String(fim))
    // listas
    const wl = wb.getWorksheet('Listas')
    expect(wl.getColumn(1).values.slice(1)).toEqual(['CATEGORIAS', 'Alimentação (Casa)', 'Alimentação (Trabalho)', 'Moradia', 'Salário'])
    expect(wl.getColumn(2).values.slice(1)).toEqual(['FAVORECIDOS', 'Empresa X', 'Mercado Bom Preço'])
    // identificação
    const id = Object.fromEntries(wb.getWorksheet('_finup').getSheetValues().slice(1).map(r => [r[1], r[2]]))
    expect(id).toMatchObject({ conta_id: 'acc_itau', conta_nome: 'Itaú Corrente', ambiente: 'teste1' })
    // instruções com 2 exemplos
    const wi = wb.getWorksheet('Instruções')
    const textoInstr = JSON.stringify(wi.getSheetValues())
    expect(textoInstr).toContain('negativo = saída')
    expect(textoInstr).toContain('Salário do mês')
    expect(textoInstr).toContain('Supermercado')
  })

  it('preenchido e reimportado sem erro — inclusive linha depois da 1.000ª; arquivo identifica a conta', async () => {
    const bytes = await preencher(await gerar(), [
      [4, [new Date(Date.UTC(2026, 9, 1)), 5000, 'Salário outubro', 'Salário', 'Empresa X']],
      [5, [new Date(Date.UTC(2026, 9, 2)), -234.5, 'Supermercado', 'Alimentação (Casa)', 'Mercado Bom Preço']],
      [6, ['03/10/2026', '1.234,56', 'Venda de móvel', '', 'Comprador Novo']],
      [7, [new Date(Date.UTC(2026, 9, 31)), -1500, 'Aluguel', 'Moradia', '']],
      [1100, [new Date(Date.UTC(2026, 10, 1)), -10, 'Depois da linha 1000', '', '']],
    ])
    const r = lerArquivo({ nome: 'importar.xlsx', bytes, XLSX })
    expect(r.formato).toBe('xlsx')
    expect(r.erros).toEqual([])
    expect(r.contaArquivo).toEqual({ id: 'acc_itau', nome: 'Itaú Corrente', ambiente: 'teste1' })
    expect(r.linhas.map(l => [l.linha, l.data, l.valor, l.descricao, l.categoria, l.favorecido])).toEqual([
      [4, '2026-10-01', 5000, 'Salário outubro', 'Salário', 'Empresa X'],
      [5, '2026-10-02', -234.5, 'Supermercado', 'Alimentação (Casa)', 'Mercado Bom Preço'],
      [6, '2026-10-03', 1234.56, 'Venda de móvel', '', 'Comprador Novo'],
      [7, '2026-10-31', -1500, 'Aluguel', 'Moradia', ''],
      [1100, '2026-11-01', -10, 'Depois da linha 1000', '', ''],
    ])
  })

  it('erros por linha (número da linha + motivo)', async () => {
    const bytes = await preencher(await gerar(), [
      [4, ['', 10, 'Sem data', '', '']],
      [5, [new Date(Date.UTC(2026, 9, 2)), 'dez reais', 'Valor ruim', '', '']],
      [6, [new Date(Date.UTC(2026, 9, 3)), -5, '', '', '']],
      [7, ['31/02/2026', 0, 'Data e valor', '', '']],
    ])
    const r = lerArquivo({ nome: 'x.xlsx', bytes, XLSX })
    expect(r.erros.map(e => e.motivo)).toEqual([
      'Linha 4: data vazia',
      'Linha 5: valor inválido ("dez reais")',
      'Linha 6: descrição vazia',
      'Linha 7: data inválida ("31/02/2026"), valor zero',
    ])
  })
})

describe('CSV', () => {
  it('; e , como separador, cabeçalho sem acento/maiúscula, valores BR e com ponto, aspas', () => {
    const a = lerCsv('Data;Valor;Descricao;categoria;FAVORECIDO\n01/10/2026;1.234,56;"Venda; parcial";Salário;Empresa X\n02/10/2026;-89,90;Mercado;;\n')
    expect(a.erros).toEqual([])
    expect(a.linhas.map(l => [l.linha, l.data, l.valor, l.descricao, l.categoria])).toEqual([
      [2, '2026-10-01', 1234.56, 'Venda; parcial', 'Salário'], [3, '2026-10-02', -89.9, 'Mercado', ''],
    ])
    const b = lerCsv('DATA,VALOR,DESCRIÇÃO\n2026-10-05,1234.56,Pix recebido\n2026-10-06,-10.5,"Taxa, banco"\n06/10/2026,,Sem valor\n')
    expect(b.linhas.slice(0, 2).map(l => [l.data, l.valor, l.descricao])).toEqual([['2026-10-05', 1234.56, 'Pix recebido'], ['2026-10-06', -10.5, 'Taxa, banco']])
    expect(b.erros).toEqual([{ linha: 4, motivo: 'Linha 4: valor vazio' }])
    expect(lerCsv('foo;bar\n1;2').erros[0].motivo).toMatch(/Cabeçalho não encontrado/)
  })
  it('CSV salvo pelo Excel em windows-1252 (acentos)', () => {
    const latin = new Uint8Array([...enc('Data;Valor;Descri'), 0xE7, 0xE3, ...enc('o\n01/10/2026;-5,00;Padaria Jo'), 0xE3, ...enc('o\n')])
    const r = lerArquivo({ nome: 'x.csv', bytes: latin, XLSX })
    expect(r.linhas[0]).toMatchObject({ descricao: 'Padaria João', valor: -5 })
  })
})

// Dois bancos sintéticos: OFX 1.02 SGML em windows-1252 (estilo Itaú) e OFX 2 XML UTF-8 (estilo Nubank).
const OFX_ITAU = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<BRANCHID>1234<ACCTID>56789-0<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-150.00<FITID>20261005001<MEMO>PAG BOLETO ENERGIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>3500.00<FITID>20261006002<MEMO>SALARIO EMPRESA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007<TRNAMT>-42,90<FITID>20261007003<NAME>PADARIA SÃO JOÃO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007<TRNAMT>-42,90<FITID>20261007003<NAME>PADARIA REPETIDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026<TRNAMT>abc<FITID>x</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
const OFX_NU = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0260</BANKID><ACCTID>9999-1</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261010000000[-3:BRT]</DTPOSTED><TRNAMT>-19.90</TRNAMT><FITID>abc-1</FITID><MEMO>Transferência enviada &amp; Pix - Açaí</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261011000000[-3:BRT]</DTPOSTED><TRNAMT>250.00</TRNAMT><FITID>abc-2</FITID><MEMO>Pix recebido</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
// "Codifica" em windows-1252 (só os caracteres usados: Ã = 0xC3).
const em1252 = (s) => new Uint8Array([...s].map(ch => (ch === 'Ã' ? 0xC3 : ch.charCodeAt(0))))

describe('OFX', () => {
  it('banco 1 (SGML, windows-1252): data, valor (ponto ou vírgula), descrição, FITID, banco/conta, erro por transação', () => {
    const r = lerArquivo({ nome: 'extrato.ofx', bytes: em1252(OFX_ITAU), XLSX })
    expect(r.formato).toBe('ofx')
    expect(r.ofx).toEqual({ banco: '0341', conta: '56789-0' })
    expect(r.linhas.slice(0, 3).map(l => [l.data, l.valor, l.descricao, l.fitid])).toEqual([
      ['2026-10-05', -150, 'PAG BOLETO ENERGIA', '20261005001'],
      ['2026-10-06', 3500, 'SALARIO EMPRESA', '20261006002'],
      ['2026-10-07', -42.9, 'PADARIA SÃO JOÃO', '20261007003'],
    ])
    expect(r.erros).toEqual([{ linha: 5, motivo: 'Transação 5: data inválida, valor inválido, sem descrição' }])
  })
  it('banco 2 (XML, UTF-8, entidades)', () => {
    const r = lerOfx(decodificarOfx(enc(OFX_NU)))
    expect(r.banco).toBe('0260')
    expect(r.conta).toBe('9999-1')
    expect(r.linhas.map(l => [l.data, l.valor, l.descricao, l.fitid])).toEqual([
      ['2026-10-10', -19.9, 'Transferência enviada & Pix - Açaí', 'abc-1'],
      ['2026-10-11', 250, 'Pix recebido', 'abc-2'],
    ])
    expect(r.erros).toEqual([])
  })
})

describe('prévia: duplicados, categorias e totais', () => {
  const transacoes = [
    { id: 't1', accountId: 'acc_itau', type: 'expense', amount: 234.5, date: '2026-10-02', description: 'SUPERMERCADO BOM PRECO' },
    { id: 't2', accountId: 'acc_itau', type: 'expense', amount: 150, date: '2026-10-05', description: 'Energia', fitid: '20261005001' },
    { id: 't3', accountId: 'outra', type: 'expense', amount: 10, date: '2026-10-09', description: 'Cafe', fitid: 'abc-1' },
  ]
  const L = (linha, data, valor, descricao, categoria = '', extra = {}) => ({ linha, data, valor, descricao, categoria, favorecido: '', fitid: null, erros: [], ...extra })

  it('planilha: parecido com o banco e dentro do arquivo → desmarcados; erros fora; totais só dos marcados', () => {
    const p = montarPrevia({
      formato: 'xlsx', contaId: 'acc_itau', transacoes, categorias: CATEGORIAS,
      linhas: [
        L(4, '2026-10-02', -234.5, 'Supermercado Bom Preço', 'Alimentação (Casa)'), // duplicado do banco
        L(5, '2026-10-02', 234.5, 'Supermercado Bom Preço'), // mesmo valor, mas ENTRADA → não é duplicado
        L(6, '2026-10-03', -50, 'Farmácia', 'Remédios'),
        L(7, '2026-10-03', -50, 'farmacia'), // duplicado da linha 6
        L(8, '2026-10-04', 5000, 'Salário', 'salario'),
        L(9, null, 0, '', '', { erros: ['data vazia'] }),
      ],
    })
    expect(p.itens.map(i => [i.linha, !!i.duplicado, i.selecionado])).toEqual([
      [4, true, false], [5, false, true], [6, false, true], [7, true, false], [8, false, true], [9, false, false],
    ])
    expect(p.itens[0].duplicado).toMatch(/já existente em 02\/10\/2026/)
    expect(p.itens[3].duplicado).toBe('Parecido com a linha 6 do arquivo')
    expect(p.comErro.map(i => i.linha)).toEqual([9])
    expect(p.totais).toEqual({ qtd: 3, entradas: 5234.5, saidas: 50, resultado: 5184.5, de: '2026-10-02', ate: '2026-10-04' })
    // categorias: rótulo exato, nome sem acento, pendente
    expect(p.itens.map(i => i.categoriaStatus)).toEqual(['ok', 'sem', 'pendente', 'sem', 'ok', 'sem'])
    expect(p.itens[4].categoriaId).toBe('c_sal')
    expect(p.categoriasPendentes).toEqual([{ chave: 'remedios', texto: 'Remédios', linhas: 1, escolha: null }])
    // marcar o duplicado manualmente entra no total
    const p2 = montarPrevia({ formato: 'xlsx', contaId: 'acc_itau', transacoes, categorias: CATEGORIAS, linhas: [L(4, '2026-10-02', -234.5, 'Supermercado Bom Preço')], selecao: { 4: true } })
    expect(p2.totais.qtd).toBe(1)
  })

  it('OFX: FITID já importado nesta conta e repetido no arquivo; o de outra conta não conta', () => {
    const p = montarPrevia({
      formato: 'ofx', contaId: 'acc_itau', transacoes, categorias: CATEGORIAS,
      linhas: [
        L(1, '2026-10-05', -150, 'PAG BOLETO ENERGIA', '', { fitid: '20261005001' }),
        L(2, '2026-10-07', -42.9, 'PADARIA', '', { fitid: 'x9' }),
        L(3, '2026-10-07', -42.9, 'PADARIA', '', { fitid: 'x9' }),
        L(4, '2026-10-09', -10, 'Cafe', '', { fitid: 'abc-1' }), // FITID existe, mas em OUTRA conta
      ],
    })
    expect(p.itens.map(i => i.duplicado)).toEqual(['Mesmo FITID já importado nesta conta', null, 'FITID repetido no arquivo (transação 2)', null])
    expect(p.totais.qtd).toBe(2)
  })

  it('de-para salvo, escolha na prévia, "sem categoria" e "criar nova" → lançamentos para gravar', () => {
    const linhas = [L(4, '2026-10-01', -10, 'A', 'Mercadinho'), L(5, '2026-10-01', -20, 'B', 'Aluguel casa'), L(6, '2026-10-01', -30, 'C', 'Pet'), L(7, '2026-10-01', -40, 'D', 'Lixo')]
    const p = montarPrevia({
      formato: 'csv', contaId: 'acc_itau', transacoes: [], categorias: CATEGORIAS, linhas,
      depara: { mercadinho: 'c_ali1', 'categoria apagada': 'nao-existe' },
      escolhas: { 'aluguel casa': 'c_mor', pet: `${PREFIXO_NOVA}Pet`, lixo: SEM_CATEGORIA },
    })
    expect(p.itens.map(i => [i.categoriaStatus, i.categoriaId])).toEqual([['depara', 'c_ali1'], ['escolhida', 'c_mor'], ['nova', null], ['escolhida', null]])
    let n = 0
    const tx = lancamentosParaGravar(p, {
      contaId: 'acc_itau', tipoConta: 'checking', grupoGerencialId: 'grp_D', importacaoId: 'lote1', origem: 'importacao_padrao',
      novoId: () => `tx${++n}`, idsNovas: { pet: 'c_pet_novo' },
    })
    expect(tx).toEqual([
      { id: 'tx1', type: 'expense', accountId: 'acc_itau', accountType: 'checking', amount: 10, date: '2026-10-01', description: 'A', categoryId: 'c_ali1', payee: null, grupoGerencial: 'grp_D', origin: 'importacao_padrao', importacaoId: 'lote1', fitid: null },
      expect.objectContaining({ id: 'tx2', categoryId: 'c_mor' }),
      expect.objectContaining({ id: 'tx3', categoryId: 'c_pet_novo' }),
      expect.objectContaining({ id: 'tx4', categoryId: null }),
    ])
  })
})
