import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { filtrarAgendamentos } from './agendamentosFiltro'
import { buildScheduleGroups } from './agendamentosGrupos'
import {
  linhasDosAgendamentos, linhasDosPagos, planilhaAgendamentos, colunasExportacao, nomeArquivoAgendamentos,
} from './exportarAgendamentos'

const HOJE = '2026-10-31'
const next = (s, n = 1) => (s._next || []).slice(0, n)
const ag = (id, extra) => ({
  id, description: id, transactionType: 'expense', frequency: 'once', accountId: 'cc', amount: 100,
  startDate: extra._next?.[0] || '2026-01-01', ...extra,
})
const ctx = {
  accounts: [{ id: 'cc', name: 'Conta Corrente', apelido: 'CC1' }, { id: 'res', name: 'Reserva' }],
  categories: [{ id: 'cat_luz', name: 'Energia' }, { id: 'cat_agua', name: 'Água' }],
  gerencialGroups: [{ id: 'grp_1', number: 1, alias: 'G', name: 'Gerencial' }],
  tiposDocumento: [{ id: 'td_bol', sigla: 'BOL', nome: 'Boleto' }],
  hoje: HOJE,
}

const schedules = [
  ag('LUZ DEZ', { _next: ['2026-12-10'], amount: 210.5, categoryId: 'cat_luz', payee: 'Enel', costCenter: 'Casa', tipoDocumentoId: 'td_bol' }),
  ag('AGUA', { _next: ['2026-11-05'], amount: 80, categoryId: 'cat_agua' }),
  ag('LUZ ATRASADA', { _next: ['2026-10-20'], amount: 190, categoryId: 'cat_luz', grupoGerencial: 'grp_1' }),
  ag('FINANC', {
    _next: ['2026-11-15'], amount: 500, categoryId: 'cat_luz', frequency: 'monthly', occurrenceType: 'installment',
    installments: 4, startDate: '2026-10-15', registered: ['2026-10-15'],
  }),
  ag('ANTIGA', { _next: [], amount: 50, categoryId: 'cat_luz', startDate: '2026-03-01', registered: ['2026-03-01'] }),
]

const exportar = (filtros) => linhasDosAgendamentos(
  buildScheduleGroups(filtrarAgendamentos(schedules, filtros, next, HOJE), next, { agruparSeries: false }), ctx)

describe('exportação de agendamentos', () => {
  it('sem filtro: tudo, na ordem da tabela (por vencimento; concluídos no fim)', () => {
    const l = exportar({})
    expect(l.map(x => x.descricao)).toEqual(['LUZ ATRASADA', 'AGUA', 'FINANC', 'LUZ DEZ', 'ANTIGA'])
    expect(l.map(x => x.status)).toEqual(['Em atraso', 'A pagar', 'A pagar', 'A pagar', 'Concluído'])
  })

  it('respeita os filtros da tela (categoria + faixa de valor + descrição)', () => {
    expect(exportar({ categoryId: 'cat_luz', min: 200 }).map(x => x.descricao)).toEqual(['FINANC', 'LUZ DEZ'])
    expect(exportar({ desc: 'luz' }).map(x => x.descricao)).toEqual(['LUZ ATRASADA', 'LUZ DEZ'])
    expect(exportar({ from: '2026-11-01', to: '2026-11-30' }).map(x => x.descricao)).toEqual(['AGUA', 'FINANC'])
  })

  it('campos: favorecido, conta, categoria, centro de custo, tipo doc., parcela, valor numérico', () => {
    const l = exportar({})
    const luz = l.find(x => x.descricao === 'LUZ DEZ')
    expect(luz).toMatchObject({
      vencimento: '2026-12-10', favorecido: 'Enel', conta: 'CC1', categoria: 'Energia', centroCusto: 'Casa',
      tipoDocumento: 'BOL', valor: 210.5,
    })
    expect(l.find(x => x.descricao === 'FINANC').parcela).toBe('2/4')
    expect(l.find(x => x.descricao === 'LUZ ATRASADA').grupoGerencial).toBe('G - Gerencial')
  })

  it('Grupo gerencial só com o controle gerencial ligado', () => {
    expect(colunasExportacao({ gerencial: true }).map(([, h]) => h)).toContain('Grupo gerencial')
    expect(colunasExportacao({ gerencial: false }).map(([, h]) => h)).not.toContain('Grupo gerencial')
    expect(colunasExportacao({ gerencial: false }).map(([, h]) => h)).toEqual([
      'Vencimento', 'Descrição', 'Favorecido', 'Conta', 'Categoria', 'Centro de custo', 'Tipo de documento', 'Parcela', 'Valor', 'Status',
    ])
  })

  it('planilha: valor é número em R$, vencimento é data', () => {
    const wb = planilhaAgendamentos(exportar({ desc: 'luz dez' }), { gerencial: true })
    const ws = wb.Sheets.Agendamentos
    expect(ws.A1.v).toBe('Vencimento')
    expect(ws.A2).toMatchObject({ t: 'n', z: 'dd/mm/yyyy' })
    expect(XLSX.SSF.format('dd/mm/yyyy', ws.A2.v)).toBe('10/12/2026')
    expect(ws.J2).toMatchObject({ t: 'n', v: 210.5 })
    expect(ws.J2.z).toContain('R$')
  })

  it('aba Pagos: linhas já filtradas pela tela', () => {
    const l = linhasDosPagos([
      { key: 'a', vencimento: '2026-10-05', dataPagamento: '2026-10-04', description: 'AGUA', payee: 'Sabesp', accountId: 'cc', categoryId: 'cat_agua', amount: 79.9, parcela: 2, total: 12, schedule: { costCenter: 'Casa' } },
    ], ctx)
    expect(l[0]).toMatchObject({ descricao: 'AGUA', parcela: '2/12', valor: 79.9, status: 'Pago em 04/10/2026', centroCusto: 'Casa' })
  })

  it('nome do arquivo agendamentos-AAAAMMDD.xlsx', () => {
    expect(nomeArquivoAgendamentos(new Date(2026, 9, 31))).toBe('agendamentos-20261031.xlsx')
  })
})
