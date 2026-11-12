// @vitest-environment jsdom
// Aviso "Há uma atualização do Finup": envia as pendências antes de atualizar, Mais tarde, obrigatória,
// computador × celular, espera formulário/tour e um aviso de cada vez. Navegador e service worker simulados.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import AvisoAtualizacao from './AvisoAtualizacao'
import AvisoUsarComoApp from './UsarComoApp'
import { estadoAtualizacao, iniciarServiceWorker, marcarVersaoPronta, _reiniciarAtualizacao, ADIAR_MS } from '../../lib/atualizacao'
import { _reiniciarAvisos } from '../../lib/filaDeAvisos'
import { _reiniciarBoasVindas, carregarBoasVindas } from '../../lib/boasVindasApi'
import { _reiniciarTour, iniciarTour, encerrarTour } from '../BoasVindas/tourEstado'
import { _reiniciarJornada } from '../BoasVindas/jornadaEstado'
import { MOBILE_MEDIA_QUERY } from '../../lib/breakpoints'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))

const n = (id, extra = {}) => ({ id, data: id.slice(0, 10).replace(/\./g, '-'), titulo: id, publico: 'todos', obrigatoria: false, itens: [`Novidade ${id}`], ...extra })
const LOCAIS = [n('2026.11.11')]
let consultas
let enviarAgora
let sw // registerSW / updateSW falsos
const aviso = () => screen.queryByTestId('aviso-atualizacao')
const pausa = (ms = 60) => act(() => new Promise(r => setTimeout(r, ms)))

async function versaoNova(remotas = [n('2026.11.12', { itens: ['Linha 1', 'Linha 2', 'Linha 3', 'Linha 4'] }), ...LOCAIS]) {
  await act(() => marcarVersaoPronta({ buscar: async () => ({ ok: true, json: async () => ({ novidades: remotas }) }), locais: LOCAIS }))
}

beforeEach(async () => {
  _reiniciarAtualizacao(); _reiniciarAvisos(); _reiniciarTour(); _reiniciarJornada(); _reiniciarBoasVindas()
  localStorage.clear(); sessionStorage.clear()
  consultas = new Set()
  window.matchMedia = (q) => ({ matches: consultas.has(q), addEventListener() {}, removeEventListener() {} })
  enviarAgora = vi.fn(async () => ({ ok: true }))
  useApp.mockReturnValue({ dbStatus: 'connected', enviarAgora })
  const updateSW = vi.fn(async () => {})
  sw = { updateSW, registerSW: vi.fn(() => updateSW) }
  // O "recarregar" não pode recarregar o jsdom.
  iniciarServiceWorker(sw.registerSW, { addEventListener() {}, document: { addEventListener() {} }, location: { reload: vi.fn() } })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tourVistoEm: '2026-11-01T10:00:00Z', guiasOcultos: [], guiasLigados: true }) })))
  await carregarBoasVindas()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('aviso de atualização', () => {
  it('sem versão nova: nada', async () => {
    render(<AvisoAtualizacao intervalo={20} />)
    await pausa()
    expect(aviso()).toBeNull()
  })

  it('computador: janelinha no canto inferior DIREITO, pergunta e até 3 linhas do que vem', async () => {
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    const el = await screen.findByTestId('aviso-atualizacao')
    expect(el.dataset.formato).toBe('janela')
    expect(el.className).toContain('right-4')
    expect(el.className).not.toContain('left-4')
    expect(el.textContent).toContain('Há uma atualização do Finup')
    expect(el.textContent).toContain('Deseja atualizar agora?')
    expect(screen.getByTestId('aviso-atualizacao-novidades').querySelectorAll('li')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Mais tarde' })).toBeTruthy()
  })

  it('celular: faixa acima da barra de baixo', async () => {
    consultas.add(MOBILE_MEDIA_QUERY)
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    const el = await screen.findByTestId('aviso-atualizacao')
    expect(el.dataset.formato).toBe('faixa')
    expect(el.className).toContain('bottom-20')
  })

  it('Atualizar agora: envia TODAS as pendências primeiro e só depois manda o SKIP_WAITING', async () => {
    const ordem = []
    enviarAgora.mockImplementation(async () => { ordem.push('enviar'); await new Promise(r => setTimeout(r, 30)); ordem.push('enviou'); return { ok: true } })
    sw.updateSW.mockImplementation(async () => { ordem.push('skip-waiting') })
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: /Atualizar agora/ }))
    expect(await screen.findByText(/Enviando suas alterações/)).toBeTruthy()
    await waitFor(() => expect(sw.updateSW).toHaveBeenCalledWith(true))
    expect(ordem).toEqual(['enviar', 'enviou', 'skip-waiting'])
  })

  it('envio falhou: não atualiza e explica (nada se perde)', async () => {
    enviarAgora.mockResolvedValue({ ok: false, erro: 'O servidor não respondeu' })
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: /Atualizar agora/ }))
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('O servidor não respondeu')
    expect(alerta.textContent).toContain('Nada foi perdido')
    expect(sw.updateSW).not.toHaveBeenCalled()
    expect(aviso()).toBeTruthy()
  })

  it('sem internet: nem tenta enviar, não atualiza e explica', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: /Atualizar agora/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('Sem internet')
    expect(enviarAgora).not.toHaveBeenCalled()
    expect(sw.updateSW).not.toHaveBeenCalled()
  })

  it('Mais tarde: some e volta depois de 4 h', async () => {
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais tarde' }))
    expect(aviso()).toBeNull()
    expect(estadoAtualizacao().adiadaAte).toBeGreaterThan(Date.now() + ADIAR_MS - 5000)
    cleanup()
    // 4 h depois (o prazo vencido): volta.
    await act(async () => { estadoAtualizacao().adiadaAte = Date.now() - 1 })
    render(<AvisoAtualizacao intervalo={20} />)
    await screen.findByTestId('aviso-atualizacao')
  })

  it('obrigatória: sem "Mais tarde", com o motivo', async () => {
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova([n('2026.11.12', { obrigatoria: true, motivo: 'O banco mudou e a versão aberta não consegue mais gravar.' }), ...LOCAIS])
    const el = await screen.findByTestId('aviso-atualizacao')
    expect(el.textContent).toContain('Atualização necessária')
    expect(el.textContent).toContain('O banco mudou e a versão aberta não consegue mais gravar.')
    expect(screen.queryByRole('button', { name: 'Mais tarde' })).toBeNull()
  })

  it('espera o formulário aberto (ou campo em edição) e o tour fecharem', async () => {
    const form = document.createElement('div')
    form.setAttribute('aria-modal', 'true')
    document.body.appendChild(form)
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    await pausa()
    expect(aviso()).toBeNull()
    act(() => form.remove())
    await screen.findByTestId('aviso-atualizacao')
    // Campo sendo digitado.
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    act(() => campo.focus())
    await waitFor(() => expect(aviso()).toBeNull())
    act(() => campo.blur())
    await screen.findByTestId('aviso-atualizacao')
    // Tour.
    act(() => iniciarTour('accounts'))
    expect(aviso()).toBeNull()
    act(() => encerrarTour())
    await screen.findByTestId('aviso-atualizacao')
  })

  it('um aviso de cada vez: com atualização pendente, "Use como aplicativo" não aparece (e fica à direita)', async () => {
    render(<><AvisoUsarComoApp espera={10} /><AvisoAtualizacao intervalo={20} /></>)
    const app = await screen.findByTestId('aviso-usar-como-app')
    expect(app.className).toContain('right-4')
    expect(app.className).not.toContain('left-4')
    await versaoNova()
    await screen.findByTestId('aviso-atualizacao')
    expect(screen.queryByTestId('aviso-usar-como-app')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mais tarde' }))
    await screen.findByTestId('aviso-usar-como-app')
    expect(aviso()).toBeNull()
  })
})
