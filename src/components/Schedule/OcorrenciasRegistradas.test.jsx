// @vitest-environment jsdom
// "Ver ocorrências registradas": baixa sem lançamento não pode parecer pagamento ("Pago em" vazio, data
// da ocorrência no Status), fica em destaque com Vincular/Desfazer, e o rodapé mostra o previsto da
// série inteira e as baixas sem lançamento. Agendamento automático: sem destaque.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../Transactions/TransactionForm', () => ({ default: () => null }))
vi.mock('./VincularLancamento', () => ({ default: () => <div data-testid="busca-vincular" /> }))
const { default: OcorrenciasRegistradas } = await import('./OcorrenciasRegistradas.jsx')

const SERIE = {
  id: 'sch_material', description: 'MATERIAL', transactionType: 'expense', amount: 276, frequency: 'monthly',
  occurrenceType: 'installment', installments: 5, startDate: '2027-01-05', nextOccurrence: '2027-01-05',
  registered: ['2026-10-10'], skipped: [], registeredMeta: {}, overrides: { _diaVencimento: 5 }, accountId: 'cc',
}
const montar = async (schedule = SERIE) => {
  Object.assign(app, {
    schedules: [schedule], pode: () => true, rateiosByLancamento: new Map(),
    markScheduleRegistered: vi.fn(), marcarDataOcorrencia: vi.fn(), desvincularLancamento: vi.fn(), desfazerBaixaOcorrencia: vi.fn(),
  })
  render(<OcorrenciasRegistradas schedule={schedule} transactions={[]} accounts={[{ id: 'cc', name: 'Conta' }]} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Ver ocorrências registradas \(1 de 5\)/ })) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Ver ocorrências registradas — baixa sem lançamento', () => {
  it('Pago em vazio, "sem lançamento" em destaque, ocorrência no Status, vencimento da própria baixa', async () => {
    await montar()
    const linha = screen.getAllByRole('row')[1]
    const c = linha.querySelectorAll('td')
    expect(c[0].textContent).toBe('1/5')
    expect(c[1].textContent).toBe('10/10/2026')
    expect(c[2].textContent).toBe('—')
    expect(within(linha).getByTestId('sem-lancamento').getAttribute('title')).toMatch(/marcada como paga sem nenhum registro de dinheiro/)
    expect(c[6].textContent).toMatch('Baixada sem lançamento — ocorrência de 10/10/2026')
    expect(screen.queryByText(/baixada 10\/10/)).toBeNull()
  })

  it('rodapé: previsto da série inteira (5 × 276), pago e baixadas sem lançamento', async () => {
    await montar()
    const r = screen.getByTestId('rodape-ocorrencias').textContent
    expect(r).toMatch(/Total previsto: R\$\s1\.380,00/)
    expect(r).toMatch(/Total pago: R\$\s0,00/)
    expect(r).toMatch(/Baixadas sem lançamento: 1 \(R\$\s276,00\)/)
  })

  it('Desfazer baixa pede confirmação e chama a ação; Vincular abre a busca', async () => {
    await montar()
    fireEvent.click(screen.getByTestId('desfazer-baixa'))
    expect(screen.getByTestId('confirmar-desfazer-baixa').textContent).toMatch(/ocorrência de 10\/10\/2026\? Ela volta a ficar pendente/)
    fireEvent.click(within(screen.getByTestId('confirmar-desfazer-baixa')).getByRole('button', { name: 'Desfazer baixa' }))
    expect(app.desfazerBaixaOcorrencia).toHaveBeenCalledWith('sch_material', '2026-10-10')
    fireEvent.click(screen.getByTestId('vincular-baixa'))
    expect(screen.getByTestId('busca-vincular')).toBeTruthy()
  })

  it('agendamento automático (fatura): sem destaque, sem ações e sem aviso no rodapé', async () => {
    await montar({ ...SERIE, id: 'fsch_cc_202610_pagamento_fatura', tipo: 'pagamento_fatura' })
    expect(screen.queryByTestId('sem-lancamento')).toBeNull()
    expect(screen.queryByTestId('desfazer-baixa')).toBeNull()
    expect(screen.getByText(/Baixada \(automática\)/)).toBeTruthy()
    expect(screen.getByTestId('rodape-ocorrencias').textContent).not.toMatch('Baixadas sem lançamento')
  })
})
