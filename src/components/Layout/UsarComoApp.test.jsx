// @vitest-environment jsdom
// Aviso "Use o Finup como aplicativo" (computador) e Configurações → Geral → Usar como aplicativo.
// O navegador é simulado: display-mode (matchMedia), beforeinstallprompt/appinstalled e o tamanho da tela.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import AvisoUsarComoApp from './UsarComoApp'
import UsarComoAppPanel from '../Settings/UsarComoAppPanel'
import { capturarPedidoDeInstalacao } from '../../lib/instalacao'
import { CHAVE_AVISO_APP, lerAvisoApp } from '../../lib/avisoAplicativo'
import { _reiniciarBoasVindas, carregarBoasVindas, definirTourAberto } from '../../lib/boasVindasApi'
import { _reiniciarTour, iniciarTour, encerrarTour } from '../BoasVindas/tourEstado'
import { _reiniciarJornada } from '../BoasVindas/jornadaEstado'
import { MOBILE_MEDIA_QUERY } from '../../lib/breakpoints'
import { LINK_EDGE, LINK_CHROME } from '../../lib/ambienteNavegador'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn(() => ({ dbStatus: 'connected' })) }))

// Uma vez por arquivo (como o src/main.jsx): guarda o pedido de instalação do navegador.
capturarPedidoDeInstalacao(window)

let consultas // media queries que casam agora
const matchMediaFalso = (q) => ({ matches: consultas.has(q), addEventListener() {}, removeEventListener() {} })
let banco // /api/boas-vindas
const espera = 10
const pausa = () => act(() => new Promise(r => setTimeout(r, 80)))
const aviso = () => screen.queryByTestId('aviso-usar-como-app')

async function preparar({ tourVistoEm = '2026-11-01T10:00:00Z' } = {}) {
  banco = { tourVistoEm, guiasOcultos: [], guiasLigados: true, jornadaLigada: true }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => banco })))
  await carregarBoasVindas()
}
// O navegador oferece a instalação (Chrome/Edge).
function oferecerInstalacao(outcome = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true })
  e.prompt = vi.fn(async () => {})
  e.userChoice = Promise.resolve({ outcome })
  act(() => { window.dispatchEvent(e) })
  return e
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  _reiniciarTour(); _reiniciarJornada(); _reiniciarBoasVindas()
  consultas = new Set()
  window.matchMedia = matchMediaFalso
  delete window.onbeforeinstallprompt
  delete window.showDirectoryPicker
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.dispatchEvent(new Event('appinstalled')); localStorage.clear() })

describe('aviso "Use o Finup como aplicativo"', () => {
  it('navegador que não instala (ex.: Firefox): recomenda Edge ou Chrome, com os links oficiais', async () => {
    await preparar()
    render(<AvisoUsarComoApp espera={espera} />)
    const el = await screen.findByTestId('aviso-usar-como-app')
    expect(el.textContent).toContain('Use o Finup num navegador recomendado')
    expect(el.textContent).toContain('Este navegador não instala o Finup como aplicativo')
    expect(el.textContent).toContain('Microsoft Edge (já vem no Windows) ou o Google Chrome')
    expect(screen.getByRole('link', { name: 'Baixar o Microsoft Edge' }).getAttribute('href')).toBe(LINK_EDGE)
    expect(screen.getByRole('link', { name: 'Baixar o Google Chrome' }).getAttribute('href')).toBe(LINK_CHROME)
    expect(el.textContent).not.toMatch(/PWA/)
    expect(lerAvisoApp().mostradoEm).toBeTruthy()
  })

  it('Chrome/Edge (aba comum): "Instalar o Finup" abre a instalação; instalado, some e não volta', async () => {
    await preparar()
    window.onbeforeinstallprompt = null
    const pedido = oferecerInstalacao('accepted')
    expect(pedido.defaultPrevented).toBe(true) // no computador o botão é quem abre a instalação
    render(<AvisoUsarComoApp espera={espera} />)
    await screen.findByTestId('aviso-usar-como-app')
    expect(aviso().textContent).toContain('Abre na própria janela, com ícone na barra de tarefas')
    fireEvent.click(screen.getByRole('button', { name: /Instalar o Finup/ }))
    await waitFor(() => expect(pedido.prompt).toHaveBeenCalled())
    // Aceitou: some na hora (o navegador abre o app na janela própria); o appinstalled confirma.
    await waitFor(() => expect(aviso()).toBeNull())
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(lerAvisoApp().instaladoEm).toBeTruthy()
    cleanup()
    localStorage.setItem(CHAVE_AVISO_APP, JSON.stringify({ ...lerAvisoApp(), mostradoEm: '2020-01-01T00:00:00Z' }))
    render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
  })

  it('Chrome/Edge que ainda não ofereceu: ensina pelo menu do navegador', async () => {
    await preparar()
    window.onbeforeinstallprompt = null
    render(<AvisoUsarComoApp espera={espera} />)
    await screen.findByTestId('aviso-usar-como-app')
    expect(aviso().textContent).toContain('ícone de instalar na barra de endereço')
    expect(screen.queryByRole('button', { name: /Instalar o Finup/ })).toBeNull()
    // Instalou pelo menu do navegador (appinstalled): some.
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    await waitFor(() => expect(aviso()).toBeNull())
  })

  it('Safari do Mac: "Arquivo → Adicionar ao Dock"', async () => {
    await preparar()
    const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15')
    render(<AvisoUsarComoApp espera={espera} />)
    await screen.findByTestId('aviso-usar-como-app')
    expect(aviso().textContent).toContain('Arquivo → Adicionar ao Dock')
    ua.mockRestore()
  })

  it('aberto como aplicativo (janela própria): não aparece', async () => {
    await preparar()
    consultas.add('(display-mode: standalone)')
    render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
  })

  it('celular: não aparece', async () => {
    await preparar()
    consultas.add(MOBILE_MEDIA_QUERY)
    render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
  })

  it('com tour aberto não aparece; ao fechar o tour, aparece', async () => {
    await preparar()
    act(() => iniciarTour('accounts'))
    render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
    act(() => encerrarTour())
    await screen.findByTestId('aviso-usar-como-app')
  })

  it('não empilha: boas-vindas ainda não vistas ou abertas, ou outra janela na tela', async () => {
    await preparar({ tourVistoEm: null })
    const { unmount } = render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
    unmount(); _reiniciarBoasVindas(); await preparar()
    act(() => definirTourAberto(true))
    const r2 = render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
    r2.unmount(); act(() => definirTourAberto(false))
    const dialogo = document.createElement('div')
    dialogo.setAttribute('role', 'dialog')
    document.body.appendChild(dialogo)
    render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
    expect(lerAvisoApp().mostradoEm).toBeUndefined() // não contou como mostrado
    dialogo.remove()
  })

  it('no máximo 1 vez a cada 7 dias: "Agora não" fecha e só volta depois do prazo', async () => {
    await preparar()
    render(<AvisoUsarComoApp espera={espera} />)
    await screen.findByTestId('aviso-usar-como-app')
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(aviso()).toBeNull()
    cleanup()
    render(<AvisoUsarComoApp espera={espera} />)
    await pausa()
    expect(aviso()).toBeNull()
    cleanup()
    const oitoDias = new Date(Date.now() - 8 * 86400000).toISOString()
    localStorage.setItem(CHAVE_AVISO_APP, JSON.stringify({ mostradoEm: oitoDias }))
    render(<AvisoUsarComoApp espera={espera} />)
    await screen.findByTestId('aviso-usar-como-app')
  })

  it('"Não mostrar mais": não volta; Configurações reativa', async () => {
    await preparar()
    render(<AvisoUsarComoApp espera={espera} />)
    await screen.findByTestId('aviso-usar-como-app')
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar mais' }))
    expect(aviso()).toBeNull()
    cleanup()
    localStorage.setItem(CHAVE_AVISO_APP, JSON.stringify({ ...lerAvisoApp(), mostradoEm: '2020-01-01T00:00:00Z' }))
    render(<><AvisoUsarComoApp espera={espera} /><UsarComoAppPanel /></>)
    await pausa()
    expect(aviso()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar o aviso de novo' }))
    expect(screen.getByText(/o aviso volta a aparecer/)).toBeTruthy()
    await screen.findByTestId('aviso-usar-como-app')
  })
})

describe('Configurações → Geral → Usar como aplicativo', () => {
  it('estado atual: instalado, não instalado ou navegador sem instalação', () => {
    consultas.add('(display-mode: standalone)')
    const { unmount } = render(<UsarComoAppPanel />)
    expect(screen.getByTestId('usar-como-app-situacao').textContent).toContain('Instalado')
    unmount()
    consultas.clear()
    const r2 = render(<UsarComoAppPanel />)
    expect(screen.getByTestId('usar-como-app-situacao').textContent).toContain('não instala o Finup')
    r2.unmount()
    window.onbeforeinstallprompt = null
    render(<UsarComoAppPanel />)
    expect(screen.getByTestId('usar-como-app-situacao').textContent).toContain('Não instalado')
  })

  it('mesmo botão de instalar do aviso', async () => {
    window.onbeforeinstallprompt = null
    const pedido = oferecerInstalacao('dismissed')
    render(<UsarComoAppPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Instalar o Finup/ }))
    await waitFor(() => expect(pedido.prompt).toHaveBeenCalled())
    await screen.findByText(/Instalação cancelada/)
  })

  it('no celular: aponta para "Instalar no celular"', () => {
    consultas.add(MOBILE_MEDIA_QUERY)
    render(<UsarComoAppPanel />)
    expect(screen.getByRole('link', { name: 'Instalar no celular' }).getAttribute('href')).toBe('/instalar')
  })

  it('elementos novos com help de campo', () => {
    const { container } = render(<UsarComoAppPanel />)
    expect(container.querySelector('[data-help-id="aplicativo.usar"]')).toBeTruthy()
  })
})
