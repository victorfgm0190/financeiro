// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

// Faixa do topo e indicador da barra lateral: "Sem internet" só quando o aparelho está sem rede;
// API falhando mostra "Não foi possível falar com o servidor". Com pendentes, "Enviar agora" mostra o
// erro real.
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('./PainelPendencias', () => ({ default: () => null }))
const { default: FaixaOffline } = await import('./FaixaOffline.jsx')
const { default: IndicadorSync } = await import('./IndicadorSync.jsx')

const preparar = (extra) => Object.assign(app, { dbStatus: 'connected', erroArmazenamento: null, filaPendentes: [], filaErros: [], enviarAgora: vi.fn(async () => ({ ok: true })), ...extra })
afterEach(() => { cleanup(); for (const k of Object.keys(app)) delete app[k] })

describe('FaixaOffline', () => {
  it('servidor sem resposta: mensagem de servidor, não "Sem internet"', () => {
    preparar({ dbStatus: 'servidor' })
    render(<FaixaOffline />)
    expect(screen.getByText(/Não foi possível falar com o servidor — tentando de novo/)).toBeTruthy()
    expect(screen.queryByText(/Sem internet/)).toBeNull()
  })
  it('sem rede: "Sem internet"', () => {
    preparar({ dbStatus: 'local' })
    render(<FaixaOffline />)
    expect(screen.getByText(/Sem internet/)).toBeTruthy()
  })
  it('conectado: nenhuma faixa', () => {
    preparar()
    const { container } = render(<FaixaOffline />)
    expect(container.textContent).toBe('')
  })
})

describe('IndicadorSync (barra lateral)', () => {
  it('com pendentes: "N alterações aguardando envio" e "Enviar agora" mostrando o erro real', async () => {
    preparar({ filaPendentes: [{ chave: 'a' }, { chave: 'b' }], enviarAgora: vi.fn(async () => ({ ok: false, erro: 'POST /api/sync → 500' })) })
    render(<IndicadorSync />)
    expect(screen.getByText('2 alterações aguardando envio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Enviar agora/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/POST \/api\/sync → 500/))
    expect(app.enviarAgora).toHaveBeenCalledTimes(1)
  })
  it('servidor fora com pendentes: não diz "Sem internet"', () => {
    preparar({ dbStatus: 'servidor', filaPendentes: [{ chave: 'a' }] })
    render(<IndicadorSync />)
    expect(screen.getByText('Servidor sem resposta · 1 alteração aguardando envio')).toBeTruthy()
    expect(screen.queryByText(/Sem internet/)).toBeNull()
  })
  it('sem pendentes: sem botão "Enviar agora"', () => {
    preparar()
    render(<IndicadorSync />)
    expect(screen.queryByRole('button', { name: /Enviar agora/ })).toBeNull()
  })
})
