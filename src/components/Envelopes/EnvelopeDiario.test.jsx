// @vitest-environment jsdom
// Envelope com orçamento diário na tela: cadastro (Tipo de orçamento, valor por dia, dias, feriados),
// card (orçamento, gasto, previsto, excesso, dias restantes, A gastar) e detalhe com a conta
// "8 dias × R$ 40,00 - R$ 13,00 de excesso = R$ 307,00". Mensal continua como antes.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { feriadosAtivos } from '../../lib/feriados'
import { normalizarFeriado } from '../../../api/feriados.js'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: EnvelopesPanel } = await import('./EnvelopesPanel.jsx')

const DIARIO = { id: 'd', name: 'Almoço', categoryIds: ['alm'], accountId: 'cc', tipoOrcamento: 'diario', valorDia: 40, diasSemana: [1, 2, 3, 4, 5], descontarFeriados: true, limitAmount: 0, dueDay: 1, history: [] }
const MENSAL = { id: 'm', name: 'Mercado', categoryIds: ['merc'], accountId: 'cc', limitAmount: 800, dueDay: 14, history: [] }
const TX = [
  { id: 'a', type: 'expense', accountId: 'cc', amount: 500, categoryId: 'alm', date: '2026-10-20', description: 'Almoços' },
  { id: 'b', type: 'expense', accountId: 'cc', amount: 33, categoryId: 'alm', date: '2026-11-03', description: 'Almoço' },
  { id: 'c', type: 'expense', accountId: 'cc', amount: 100, categoryId: 'merc', date: '2026-10-25', description: 'Mercado' },
]
const base = (o = {}) => Object.assign(app, {
  envelopes: [MENSAL, DIARIO], profileTransactions: TX, categories: [{ id: 'alm', name: 'Almoço', type: 'expense' }, { id: 'merc', name: 'Mercado', type: 'expense' }],
  profileAccounts: [{ id: 'cc', name: 'Conta', type: 'checking' }], accountGroups: [], settings: { financialMonthStartDay: 15, financialMonthMode: 'custom' },
  pode: () => true, rateiosByLancamento: null, activeProfileId: null, categoryGroupOrder: [],
  addEnvelope: vi.fn(), updateEnvelope: vi.fn(), deleteEnvelope: vi.fn(),
  orcamentoEnvelopes: { startDay: 15, diaInicio: 15, hoje: '2026-11-04', feriadosDe: (i, f) => feriadosAtivos([], i, f) },
  ...o,
})

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0)) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('tela Envelopes — orçamento diário', () => {
  it('card do diário: R$ 40/dia seg–sex, orçamento 840, gasto 533, previsto 520, excesso 13, 8 dias, A gastar 307; mensal igual a antes', () => {
    base()
    render(<EnvelopesPanel />)
    const card = screen.getByTestId('envelope-diario')
    const t = card.textContent
    expect(t).toMatch(/40,00\/dia · Segunda a sexta · sem feriados/)
    expect(t).toMatch(/Gasto R\$\s*533,00 de R\$\s*840,00 \(21 dias\)/)
    expect(t).toMatch(/A gastar R\$\s*307,00/)
    expect(t).toMatch(/Previsto até ontem R\$\s*520,00 · excesso R\$\s*13,00 · 8 dias restantes/)
    // Mensal: "Gasto 100 de 800 · Disponível 700", como sempre.
    expect(screen.getByText('Mercado').closest('.card').textContent).toMatch(/Disponível R\$\s*700,00/)
  })

  it('detalhe do diário mostra a conta', () => {
    base()
    render(<EnvelopesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver lançamentos de Almoço' }))
    expect(screen.getByTestId('conta-diario').textContent).toBe('8 dias × R$ 40,00 - R$ 13,00 de excesso = R$ 307,00'.replace(/R\$ /g, 'R$ '))
  })

  it('cadastro: Diário grava tipo, valor por dia, lista de dias e feriados; prévia do ciclo', () => {
    base({ envelopes: [] })
    render(<EnvelopesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar primeiro envelope' }))
    const modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByPlaceholderText('Digite o nome do envelope'), { target: { value: 'Almoço' } })
    fireEvent.click(within(modal).getByLabelText('Diário'))
    fireEvent.change(within(modal).getByPlaceholderText('Quanto pode gastar em cada dia que conta'), { target: { value: '40' } })
    fireEvent.change(within(modal).getByDisplayValue('Segunda a sexta'), { target: { value: 'seg_sab' } })
    fireEvent.click(within(modal).getByLabelText(/Descontar feriados/))
    expect(within(modal).getByTestId('previa-orcamento').textContent).toMatch(/15\/10 a 14\/11\): 26 dias × R\$\s*40,00 = R\$\s*1\.040,00/)
    fireEvent.click(within(modal).getByRole('button', { name: 'Salvar' }))
    expect(app.addEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Almoço', tipoOrcamento: 'diario', valorDia: 40, diasSemana: [1, 2, 3, 4, 5, 6], descontarFeriados: true, limitAmount: 0,
    }))
  })

  it('cadastro: Mensal continua pedindo o limite e o dia', () => {
    base({ envelopes: [] })
    render(<EnvelopesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar primeiro envelope' }))
    const modal = screen.getByRole('dialog')
    expect(within(modal).getByLabelText('Mensal').checked).toBe(true)
    expect(within(modal).getByText('Limite Mensal (R$)')).toBeTruthy()
  })
})

describe('api/feriados — validação', () => {
  it('feriado do usuário: nome, abrangência e data (ou dia e mês, todo ano)', () => {
    expect(normalizarFeriado({ nome: 'Aniversário', abrangencia: 'municipal', data: '2026-11-10' }).dados).toEqual({ nome: 'Aniversário', abrangencia: 'municipal', data: '2026-11-10', dia_mes: null, ativo: true })
    expect(normalizarFeriado({ nome: 'Data magna', abrangencia: 'estadual', dia_mes: '07-02' }).dados).toMatchObject({ data: null, dia_mes: '07-02' })
    expect(normalizarFeriado({ nome: '', data: '2026-01-01' }).erro).toMatch(/nome/)
    expect(normalizarFeriado({ nome: 'X', abrangencia: 'nacional', data: '2026-01-01' }).erro).toMatch(/abrangencia/)
    expect(normalizarFeriado({ nome: 'X' }).erro).toMatch(/data/)
  })
})
