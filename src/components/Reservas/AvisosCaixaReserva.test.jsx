// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: AvisosCaixaReserva } = await import('./AvisosCaixaReserva.jsx')

const conta = { id: 'res', name: 'Reserva', type: 'savings', isReserva: true, initialBalance: 0 }
const dep = (id, date, amount, funcao) => ({ id, type: 'transfer', amount, date, accountId: 'cc', toAccountId: 'res', reservaFuncaoId: funcao })
const iso = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fn = (id, saldoInicial) => ({ id, name: id.toUpperCase(), accountId: 'res', saldoInicial })

beforeEach(() => {
  localStorage.clear()
  Object.assign(app, {
    accounts: [conta, { id: 'cc', name: 'Corrente', type: 'checking', initialBalance: 0 }],
    reserveFunctions: [fn('a', 0)], reservePeriods: [], reserveAdjustments: [], transactions: [dep('t1', iso(-5), 1000, 'a')],
    schedules: [], scheduleReservaFuncoes: [], getNextOccurrences: () => [], settings: {}, usuario: { id: 'u1' },
  })
})
afterEach(() => { cleanup() })

describe('aviso de caixa na tela', () => {
  it('sem negativa e com caixa: não aparece nada', () => {
    render(<AvisosCaixaReserva />)
    expect(screen.queryByTestId('avisos-caixa-reserva')).toBeNull()
  })
  it('função negativa: mostra o valor e a lista; dispensar some e volta se a situação mudar', () => {
    app.reserveFunctions = [fn('a', 0), fn('b', -300)]
    const { unmount } = render(<AvisosCaixaReserva />)
    const aviso = screen.getByTestId('aviso-caixa-res')
    expect(aviso.textContent).toMatch(/Funções negativas somam/)
    expect(aviso.textContent).toMatch(/B /)
    fireEvent.click(screen.getByRole('button', { name: /Dispensar/ }))
    expect(screen.queryByTestId('aviso-caixa-res')).toBeNull()
    unmount()
    render(<AvisosCaixaReserva />)
    expect(screen.queryByTestId('aviso-caixa-res')).toBeNull()
    cleanup()
    app.reserveFunctions = [fn('a', 0), fn('b', -500)]
    render(<AvisosCaixaReserva />)
    expect(screen.getByTestId('aviso-caixa-res')).toBeTruthy()
  })
  it('saída agendada maior que o caixa, dentro da janela: aviso com a data; fora da janela, não', () => {
    const data = iso(30)
    app.schedules = [{ id: 's', transactionType: 'transfer', amount: 1500, accountId: 'res', toAccountId: 'cc', reservaFuncaoId: 'a', description: 'Compra do carro', frequency: 'once', startDate: data }]
    app.getNextOccurrences = () => [data]
    const { unmount } = render(<AvisosCaixaReserva />)
    const texto = screen.getByTestId('aviso-caixa-res').textContent
    expect(texto).toContain(`Em ${data.slice(8, 10)}/${data.slice(5, 7)} a conta não terá dinheiro para Compra do carro`)
    expect(texto).toMatch(/faltam R\$\s*500,00/)
    unmount()
    app.settings = { reservaDiasCaixa: 10 }
    render(<AvisosCaixaReserva />)
    expect(screen.queryByTestId('aviso-caixa-res')).toBeNull()
  })
  it('no Painel: compacto, sem a lista, com o atalho', () => {
    app.reserveFunctions = [fn('a', 0), fn('b', -300)]
    const onVer = vi.fn()
    render(<AvisosCaixaReserva compacto onVer={onVer} />)
    expect(screen.getByTestId('aviso-caixa-res').textContent).not.toMatch(/B −/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(onVer).toHaveBeenCalled()
  })
})
