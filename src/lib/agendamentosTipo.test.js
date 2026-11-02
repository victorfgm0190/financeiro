// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  tipoDoItem, filtrarPorTipo, contarPorTipo, lerTipoAgendamento, salvarTipoAgendamento, TITULO_RELATORIO_TIPO, ARQUIVO_TIPO,
} from './agendamentosTipo'
import { filtrarAgendamentos } from './agendamentosFiltro'
import { mobileModules } from '../mobile/modules'

const HOJE = '2026-10-31'
const next = (s) => (s._next ? [s._next] : [])
const lista = [
  { id: 'sal', transactionType: 'income', amount: 5000, description: 'SALARIO', _next: '2026-11-05', frequency: 'once', startDate: '2026-11-05' },
  { id: 'alug', transactionType: 'income', amount: 1200, description: 'ALUGUEL RECEBIDO', _next: '2026-12-10', frequency: 'once', startDate: '2026-12-10' },
  { id: 'luz', transactionType: 'expense', amount: 210, description: 'LUZ', _next: '2026-11-10', frequency: 'once', startDate: '2026-11-10' },
  { id: 'res', transactionType: 'transfer', amount: 300, description: 'RESERVA', _next: '2026-11-15', frequency: 'once', startDate: '2026-11-15' },
]

describe('filtro por tipo de agendamento', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* sem DOM */ } })

  it('classifica entrada, saída, transferência e fatura a pagar', () => {
    expect(lista.map(tipoDoItem)).toEqual(['entradas', 'entradas', 'saidas', 'transferencias'])
    expect(tipoDoItem({ id: 'fatura', amount: 900, dueDate: '2026-11-20' })).toBe('saidas')
    expect(tipoDoItem({ type: 'credit_payment' })).toBe('transferencias')
  })

  it('recorta e conta; Todos não recorta', () => {
    expect(filtrarPorTipo(lista, 'todos')).toHaveLength(4)
    expect(filtrarPorTipo(lista, 'entradas').map(s => s.id)).toEqual(['sal', 'alug'])
    expect(contarPorTipo(lista)).toEqual({ todos: 4, entradas: 2, saidas: 1, transferencias: 1, pagamentos_cartao: 0 })
  })

  it('soma com os outros filtros: contagem sobre o período já aplicado', () => {
    const novembro = filtrarAgendamentos(lista, { from: '2026-11-01', to: '2026-11-30' }, next, HOJE)
    expect(contarPorTipo(novembro)).toEqual({ todos: 3, entradas: 1, saidas: 1, transferencias: 1, pagamentos_cartao: 0 })
    expect(filtrarPorTipo(novembro, 'entradas').map(s => s.id)).toEqual(['sal'])
  })

  it('lembra a escolha (padrão Todos; valor inválido volta a Todos)', () => {
    expect(lerTipoAgendamento()).toBe('todos')
    salvarTipoAgendamento('saidas')
    expect(lerTipoAgendamento()).toBe('saidas')
    salvarTipoAgendamento('xyz')
    expect(lerTipoAgendamento()).toBe('todos')
  })

  it('título e nome de arquivo do relatório por tipo', () => {
    expect(TITULO_RELATORIO_TIPO.entradas).toBe('Agendamentos (a receber)')
    expect(ARQUIVO_TIPO.todos).toBe('a-pagar-e-receber')
  })

  it('menu do celular: a aba da tela se chama Agendamentos', () => {
    const m = mobileModules.find(x => x.page === 'schedule')
    expect(m.label).toBe('Agendamentos')
  })
})
