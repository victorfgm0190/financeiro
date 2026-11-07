import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { montarPlanilha, VERDE, nomeArquivoFinup, corDoSelo, definirIdentidadeExport, identidadeExport } from './exportExcel'

const LOGO = readFileSync(new URL('../../public/brand/finup-logo.png', import.meta.url))
const AGORA = new Date(2026, 9, 31, 14, 5)
const spec = {
  titulo: 'Agendamentos (a pagar e a receber)',
  filtros: ['Período: Este mês', 'Tipo: Todos'],
  colunas: [
    { chave: 'venc', titulo: 'Vencimento', tipo: 'data' },
    { chave: 'desc', titulo: 'Descrição' },
    { chave: 'tipo', titulo: 'Tipo', tipo: 'selo' },
    { chave: 'valor', titulo: 'Valor (R$)', tipo: 'moeda', cor: (l) => (l.tipo === 'Entrada' ? 'receita' : 'despesa') },
    { chave: 'status', titulo: 'Status', tipo: 'status' },
  ],
  linhas: [
    { venc: '2026-11-05', desc: 'Salário', tipo: 'Entrada', valor: 5000, status: 'A receber' },
    { venc: '2026-11-10', desc: 'Luz', tipo: 'Saída', valor: 210.5, status: 'Vencido' },
    { venc: '2026-11-12', desc: 'Água', tipo: 'Saída', valor: 80, status: 'Pago' },
  ],
  resumo: [
    { rotulo: 'Total a receber', soma: 'valor', onde: [{ coluna: 'tipo', valor: 'Entrada' }], cor: 'verde' },
    { rotulo: 'Total a pagar', soma: 'valor', onde: [{ coluna: 'tipo', valor: 'Saída' }], cor: 'vermelho' },
    { rotulo: 'Saldo previsto', partes: [{ sinal: 1, soma: 'valor', onde: [{ coluna: 'tipo', valor: 'Entrada' }] }, { sinal: -1, soma: 'valor', onde: [{ coluna: 'tipo', valor: 'Saída' }] }] },
  ],
  totais: { somar: ['valor'] },
}
const ident = { nomeAmbiente: 'Família Exemplo', frase: 'Uma frase qualquer.', perfil: 'Todos os perfis' }
const ler = async (wb) => {
  const back = new ExcelJS.Workbook()
  await back.xlsx.load(await wb.xlsx.writeBuffer())
  return back
}

describe('exportExcel: layout padrão', () => {
  it('cabeçalho com logo, título, identidade, site, data e linha verde', async () => {
    const wb = await ler(montarPlanilha(ExcelJS, spec, { logo: LOGO, ident, agora: AGORA }))
    const ws = wb.worksheets[0]
    expect(ws.getImages()).toHaveLength(1)
    expect(ws.getCell('B1').value).toBe('Agendamentos (a pagar e a receber)')
    expect(ws.getCell('B1').font).toMatchObject({ bold: true, size: 15, name: 'Arial' })
    expect(ws.getCell('B2').value).toBe('Família Exemplo  ·  Perfil: Todos os perfis')
    expect(ws.getCell('B3').value).toBe('Uma frase qualquer.')
    expect(ws.getCell('B3').font).toMatchObject({ italic: true, size: 9 })
    expect(ws.getCell('D1').value).toBe('finup.app.br')
    expect(ws.getCell('D2').value).toBe('Gerado em 31/10/2026 14:05')
    expect(ws.getCell('C3').border.bottom.style).toBe('thick')
    expect(ws.getCell('A5').value).toBe('Período: Este mês   ·   Tipo: Todos')
  })

  it('resumo por fórmula (SOMASES), cabeçalho verde congelado, autofiltro, moeda e data reais', async () => {
    const wb = await ler(montarPlanilha(ExcelJS, spec, { logo: LOGO, ident, agora: AGORA }))
    const ws = wb.worksheets[0]
    expect(ws.getCell('A8').value.formula).toBe('SUMIFS($D$11:$D$13,$C$11:$C$13,"Entrada")')
    expect(ws.getCell('A8').value.result).toBe(5000)
    expect(ws.getCell('C8').value.formula).toBe('SUMIFS($D$11:$D$13,$C$11:$C$13,"Entrada")-SUMIFS($D$11:$D$13,$C$11:$C$13,"Saída")')
    expect(ws.getCell('C8').value.result).toBe(4709.5)
    expect(ws.getCell('A10').value).toBe('Vencimento')
    expect(ws.getCell('A10').fill.fgColor.argb).toBe('FF0F6E56')
    expect(ws.getCell('A10').font.color.argb).toBe('FFFFFFFF')
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 10, showGridLines: false })
    expect(ws.autoFilter).toBeTruthy()
    const d = ws.getCell('A11')
    expect(d.value).toBeInstanceOf(Date)
    expect(d.numFmt).toBe('dd/mm/yyyy')
    expect(d.value.toISOString().slice(0, 10)).toBe('2026-11-05')
    expect(ws.getCell('D11').value).toBe(5000)
    expect(ws.getCell('D11').numFmt).toContain('"R$"')
    expect(ws.getCell('D11').font.color.argb).toBe('FF0F6E56')
    expect(ws.getCell('D12').font.color.argb).toBe('FF953D18')
    expect(ws.getCell('A12').fill.fgColor.argb).toBe('FFF5F7F9')
    expect(ws.getCell('E12').fill.fgColor.argb).toBe('FFFEE2E2')
    expect(ws.getCell('E13').fill.fgColor.argb).toBe('FFDCFCE7')
    expect(ws.getCell('E11').fill.fgColor.argb).toBe('FFFEF3C7')
  })

  it('linha TOTAL com quantidade e soma por fórmula; impressão paisagem e rodapé', async () => {
    const wb = await ler(montarPlanilha(ExcelJS, spec, { logo: LOGO, ident, agora: AGORA }))
    const ws = wb.worksheets[0]
    expect(ws.getCell('A14').value).toBe('TOTAL')
    expect(ws.getCell('B14').value).toBe('3 títulos')
    expect(ws.getCell('D14').value).toMatchObject({ formula: 'SUM($D$11:$D$13)', result: 5290.5 })
    expect(ws.getCell('D14').border.top.style).toBe('medium')
    expect(ws.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1, printTitlesRow: '10:10' })
    expect(ws.headerFooter.oddFooter).toContain('Finup · finup.app.br · Página &P de &N')
    expect(ws.getColumn(1).width).toBeGreaterThanOrEqual(17)
  })

  it('nome e frase vazios: nome do usuário; sem linha da frase', async () => {
    definirIdentidadeExport({ nomeAmbiente: '', nomeUsuario: 'Usuário Logado', frase: '', perfil: '' })
    expect(identidadeExport()).toEqual({ nomeAmbiente: 'Usuário Logado', frase: '', perfil: 'Todos os perfis' })
    const ws = (await ler(montarPlanilha(ExcelJS, spec, { ident: identidadeExport(), agora: AGORA }))).worksheets[0]
    expect(ws.getCell('B2').value).toBe('Usuário Logado  ·  Perfil: Todos os perfis')
    expect(ws.getCell('B3').value).toBeNull()
    definirIdentidadeExport({ perfil: 'CNPJ' })
    const ws2 = (await ler(montarPlanilha(ExcelJS, spec, { ident: identidadeExport(), agora: AGORA }))).worksheets[0]
    expect(ws2.getCell('B2').value).toBe('Perfil: CNPJ')
  })

  it('linhas de grupo/subtotal ficam fora das somas (coluna auxiliar oculta)', async () => {
    const ws = (await ler(montarPlanilha(ExcelJS, {
      titulo: 'Agrupado', colunas: [{ chave: 'n', titulo: 'Nome' }, { chave: 'v', titulo: 'Valor', tipo: 'moeda' }],
      linhas: [{ n: 'Grupo A', v: 30, _estilo: 'grupo' }, { n: 'x', v: 10 }, { n: 'y', v: 20 }],
      totais: { somar: ['v'] },
    }, { ident, agora: AGORA }))).worksheets[0]
    const total = ws.getCell('A9').value === 'TOTAL' ? 'B9' : null
    expect(total).toBe('B9')
    expect(ws.getCell('B9').value.result).toBe(30)
    expect(ws.getCell('B9').value.formula).toContain('"D"')
    expect(ws.getColumn(4).hidden).toBe(true)
  })

  it('total com título próprio, Conta vazia, SOMA por fórmula e cor pelo valor somado', async () => {
    const ws = (await ler(montarPlanilha(ExcelJS, {
      titulo: 'Fluxo',
      colunas: [
        { chave: 'n', titulo: 'Função' }, { chave: 'c', titulo: 'Conta' },
        { chave: 'd', titulo: 'Dep', tipo: 'moeda', cor: () => 'receita' },
        { chave: 's', titulo: 'Saldo', tipo: 'moeda', cor: (l) => l.s < 0 ? 'despesa' : null },
      ],
      linhas: [{ n: 'a', c: 'X', d: 10, s: 5 }, { n: 'b', c: 'Y', d: 20, s: -8 }],
      totais: { titulo: 'TOTAL GERAL', rotulo: () => '', comCor: true, somar: ['d', 's'] },
    }, { ident, agora: AGORA }))).worksheets[0]
    const r = 8
    expect(ws.getCell(`A${r}`).value).toBe('TOTAL GERAL')
    expect(ws.getCell(`A${r}`).font.bold).toBe(true)
    expect(ws.getCell(`B${r}`).value || '').toBe('')
    expect(ws.getCell(`C${r}`).value.formula).toMatch(/^SUM\(/)
    expect(ws.getCell(`C${r}`).value.result).toBe(30)
    expect(ws.getCell(`C${r}`).font.color.argb).toBe(`FF${VERDE}`)
    expect(ws.getCell(`D${r}`).value.result).toBe(-3)
    expect(ws.getCell(`D${r}`).font.color.argb).toBe('FF953D18')
  })

  it('várias abas e nome do arquivo sem acento/espaço', () => {
    const wb = montarPlanilha(ExcelJS, { abas: [{ ...spec, nome: 'Resumo' }, { ...spec, nome: 'Resumo' }] }, { ident, agora: AGORA })
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumo', 'Resumo 2'])
    expect(nomeArquivoFinup('Fluxo de Caixa por Conta', 'Out 2026')).toBe('Finup_Fluxo-de-Caixa-por-Conta_Out-2026.xlsx')
    expect(nomeArquivoFinup('Agendamentos_a-pagar', '2026-10')).toBe('Finup_Agendamentos_a-pagar_2026-10.xlsx')
    expect(nomeArquivoFinup('Razão Diário', '')).toBe('Finup_Razao-Diario.xlsx')
  })

  it('cores dos selos de status', () => {
    expect(['Recebido', 'Pago', 'Conciliado', 'Pendente', 'A pagar', 'Vencido', 'Estorno', 'Em atraso'].map(corDoSelo))
      .toEqual(['verde', 'verde', 'verde', 'ambar', 'ambar', 'vermelho', 'vermelho', 'vermelho'])
  })
})
