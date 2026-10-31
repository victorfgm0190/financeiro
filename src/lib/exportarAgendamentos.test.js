import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { filtrarAgendamentos } from './agendamentosFiltro'
import { buildScheduleGroups } from './agendamentosGrupos'
import { filtrarPorTipo } from './agendamentosTipo'
import { montarPlanilha, nomeArquivoFinup } from './exportExcel'
import {
  linhasDosAgendamentos, linhasDosPagos, specAgendamentos, periodoDoArquivo,
} from './exportarAgendamentos'

const HOJE = '2026-10-31'
const next = (s, n = 1) => (s._next || []).slice(0, n)
const ag = (id, extra) => ({
  id, description: id, transactionType: 'expense', frequency: 'once', accountId: 'cc', amount: 100,
  startDate: extra._next?.[0] || '2026-01-01', ...extra,
})
const ctx = {
  accounts: [{ id: 'cc', name: 'Conta Corrente', apelido: 'CC1' }, { id: 'res', name: 'Reserva' }],
  categories: [{ id: 'cat_luz', name: 'Energia' }, { id: 'cat_sal', name: 'Salário' }],
  hoje: HOJE,
}
const schedules = [
  ag('LUZ DEZ', { _next: ['2026-12-10'], amount: 210.5, categoryId: 'cat_luz', payee: 'Enel' }),
  ag('SALARIO', { _next: ['2026-11-05'], amount: 5000, categoryId: 'cat_sal', transactionType: 'income', payee: 'Empresa' }),
  ag('LUZ ATRASADA', { _next: ['2026-10-20'], amount: 190, categoryId: 'cat_luz' }),
  ag('RESERVA', { _next: ['2026-11-15'], amount: 300, transactionType: 'transfer', toAccountId: 'res' }),
  ag('ANTIGA', { _next: [], amount: 50, categoryId: 'cat_luz', startDate: '2026-03-01', registered: ['2026-03-01'] }),
]
const linhasDa = (filtros = {}, tipo = 'todos') => linhasDosAgendamentos(
  buildScheduleGroups(filtrarPorTipo(filtrarAgendamentos(schedules, filtros, next, HOJE), tipo), next, { agruparSeries: false }), ctx)

describe('exportação de agendamentos', () => {
  it('ordem da tabela e status no vocabulário do relatório', () => {
    const l = linhasDa()
    expect(l.map(x => x.descricao)).toEqual(['LUZ ATRASADA', 'SALARIO', 'RESERVA', 'LUZ DEZ', 'ANTIGA'])
    expect(l.map(x => x.status)).toEqual(['Vencido', 'A receber', 'Pendente', 'A pagar', 'Pago'])
    expect(l.map(x => x.tipo)).toEqual(['Saída', 'Entrada', 'Transferência', 'Saída', 'Saída'])
    expect(l.find(x => x.descricao === 'RESERVA').conta).toBe('CC1 → Reserva')
  })

  it('respeita os filtros da tela (categoria + valor + período + tipo)', () => {
    expect(linhasDa({ categoryId: 'cat_luz', min: 200 }).map(x => x.descricao)).toEqual(['LUZ DEZ'])
    expect(linhasDa({ from: '2026-11-01', to: '2026-11-30' }).map(x => x.descricao)).toEqual(['SALARIO', 'RESERVA'])
    expect(linhasDa({}, 'entradas').map(x => x.descricao)).toEqual(['SALARIO'])
  })

  it.each([
    ['todos', 'Agendamentos (a pagar e a receber)', 'Finup_Agendamentos_a-pagar-e-receber_2026-10.xlsx', ['Total a receber', 'Total a pagar', 'Saldo previsto'], true],
    ['entradas', 'Agendamentos (a receber)', 'Finup_Agendamentos_a-receber_2026-10.xlsx', ['Total previsto', 'Recebido', 'A receber', 'Vencido'], false],
    ['saidas', 'Agendamentos (a pagar)', 'Finup_Agendamentos_a-pagar_2026-10.xlsx', ['Total previsto', 'Pago', 'A pagar', 'Vencido'], false],
    ['transferencias', 'Agendamentos (transferências)', 'Finup_Agendamentos_transferencias_2026-10.xlsx', ['Total previsto', 'Realizado', 'Pendente', 'Vencido'], false],
  ])('tipo %s: título, arquivo, resumo e colunas', (tipo, titulo, arquivo, resumo, comTipo) => {
    const spec = specAgendamentos(linhasDa({}, tipo), { tipo, filtros: [`Tipo: ${tipo}`], periodo: periodoDoArquivo('mes', { hoje: HOJE }) })
    expect(spec.titulo).toBe(titulo)
    expect(nomeArquivoFinup(spec.nomeArquivo.relatorio, spec.nomeArquivo.periodo)).toBe(arquivo)
    expect(spec.resumo.map(r => r.rotulo)).toEqual(resumo)
    expect(spec.colunas.map(c => c.titulo)).toEqual([
      'Vencimento', 'Cliente/Favorecido', 'Descrição', 'Categoria', ...(comTipo ? ['Tipo'] : []), 'Valor (R$)', 'Conta', 'Status',
    ])
    expect(spec.filtros).toContain(`Tipo: ${tipo}`)
  })

  it('planilha "Todos": saldo previsto = a receber − a pagar (transferência fora), por fórmula', async () => {
    const spec = specAgendamentos(linhasDa(), { tipo: 'todos' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await montarPlanilha(ExcelJS, spec, { ident: { nomeAmbiente: 'X', frase: '', perfil: 'Todos os perfis' } }).xlsx.writeBuffer())
    const ws = wb.worksheets[0]
    const valores = [1, 2, 3, 4, 5, 6, 7, 8].map(c => ws.getRow(6).getCell(c)).filter(c => c.master.address === c.address).map(c => c.value).filter(v => v && v.formula)
    expect(valores.map(v => v.result)).toEqual([5000, 450.5, 4549.5])
    expect(valores[2].formula).toMatch(/^SUMIFS\(.+"Entrada"\)-SUMIFS\(.+"Saída"\)$/)
  })

  it('aba Pagos: Recebido para entrada, Pago para saída', () => {
    const l = linhasDosPagos([
      { vencimento: '2026-10-05', dataPagamento: '2026-10-04', description: 'AGUA', payee: 'Sabesp', accountId: 'cc', amount: 79.9, transactionType: 'expense' },
      { vencimento: '2026-10-05', dataPagamento: '2026-10-05', description: 'SALARIO', payee: 'Empresa', accountId: 'cc', amount: 5000, transactionType: 'income' },
    ], ctx)
    expect(l.map(x => x.status)).toEqual(['Pago', 'Recebido'])
  })

  it('período do arquivo', () => {
    expect(periodoDoArquivo('custom', { de: '2026-11-01', ate: '2026-11-30', hoje: HOJE })).toBe('20261101-20261130')
    expect(periodoDoArquivo('futuros', { hoje: HOJE })).toBe('a-partir-de-20261031')
    expect(periodoDoArquivo('tudo', { hoje: HOJE })).toBe('tudo')
  })
})
