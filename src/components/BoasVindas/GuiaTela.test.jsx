// @vitest-environment jsdom
// Guia da Tela: abre sozinho (não por cima do tour), Esconder × Não mostrar mais, "?" reabre,
// selos numerados e destaque, subtelas, Reativar/Desativar todos. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import AjudaTela from './AjudaTela'
import GuiasTelasPanel from './GuiasTelasPanel'
import { useSubtelaGuia } from './subtelaGuia'
import { _reiniciarGuias } from './useGuiaTela'
import { _reiniciarBoasVindas, definirTourAberto } from '../../lib/boasVindasApi'
import { AJUDA_TELAS, TELAS_COM_GUIA, itemVisivel, guiaDaTela } from '../../lib/ajudaTelas'
import { montarContextoAjuda } from './contextoAjuda'
import { DDL_GUIAS, ocultarGuias } from '../../../api/boas-vindas.js'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
const app = (gerencial = true) => useApp.mockReturnValue({
  dbStatus: 'connected', podeVer: () => true, pode: () => true, settings: { controleGerencial: gerencial },
})

// Servidor falso de /api/boas-vindas (o "banco": vale entre recargas e navegadores).
let banco
const servidor = () => vi.fn(async (url, opts = {}) => {
  const b = opts.body ? JSON.parse(opts.body) : {}
  if (opts.method === 'POST' && b.guiaOculto) banco.guiasOcultos = [...new Set([...banco.guiasOcultos, b.guiaOculto])]
  if (opts.method === 'POST' && b.guiasTodos) banco.guiasOcultos = [...TELAS_COM_GUIA]
  if (opts.method === 'DELETE') banco.guiasOcultos = []
  return { ok: true, status: 200, json: async () => ({ ...banco, guiasOcultos: [...banco.guiasOcultos] }) }
})
const recarregar = () => { cleanup(); _reiniciarGuias(); _reiniciarBoasVindas() }
beforeEach(() => {
  recarregar()
  banco = { tourVistoEm: '2026-11-01T10:00:00Z', checklistOcultoEm: null, guiasOcultos: [] }
  vi.stubGlobal('fetch', servidor())
  app()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const guia = () => screen.queryByTestId('guia-tela')

describe('abertura automática', () => {
  it('ao entrar na tela o guia aparece; "Esconder" fecha só agora — ao recarregar, volta', async () => {
    render(<AjudaTela pagina="accounts" />)
    expect(await screen.findByTestId('guia-tela')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Esconder' }))
    expect(guia()).toBeNull()
    expect(fetch.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0) // nada gravado
    recarregar()
    render(<AjudaTela pagina="accounts" />)
    expect(await screen.findByTestId('guia-tela')).toBeTruthy()
  })
  it('"Não mostrar mais" grava no banco: não volta ao recarregar nem em outro navegador; o "?" reabre', async () => {
    render(<AjudaTela pagina="accounts" />)
    await screen.findByTestId('guia-tela')
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar mais' }))
    expect(guia()).toBeNull()
    await waitFor(() => expect(banco.guiasOcultos).toEqual(['accounts']))
    recarregar()
    render(<AjudaTela pagina="accounts" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await act(async () => {})
    expect(guia()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    expect(guia()).toBeTruthy()
    // outra tela continua abrindo
    recarregar()
    render(<AjudaTela pagina="credit" />)
    expect(await screen.findByTestId('guia-tela')).toBeTruthy()
  })
  it('não abre por cima do tour: espera ele fechar; sem tour visto (vai abrir o tour), não abre', async () => {
    banco.tourVistoEm = null
    render(<AjudaTela pagina="accounts" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await act(async () => {})
    expect(guia()).toBeNull()
    recarregar()
    banco.tourVistoEm = '2026-11-01T10:00:00Z'
    definirTourAberto(true)
    render(<AjudaTela pagina="accounts" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await act(async () => {})
    expect(guia()).toBeNull()
    act(() => definirTourAberto(false))
    expect(await screen.findByTestId('guia-tela')).toBeTruthy()
  })
  it('carga do banco falhou: não abre sozinho, mas o "?" funciona', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'x' }) })))
    render(<AjudaTela pagina="accounts" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await act(async () => {})
    expect(guia()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    expect(guia()).toBeTruthy()
  })
})

describe('selos numerados e destaque', () => {
  it('cada botão listado e visível ganha o selo com o número do item; passar o mouse destaca', async () => {
    const itens = AJUDA_TELAS.accounts.itens
    const n = itens.findIndex(i => i.chave === 'nova') + 1
    render(<><button data-guia="accounts.nova">Nova Conta</button><button data-guia="accounts.grupos" style={{ display: 'none' }}>Grupos</button><AjudaTela pagina="accounts" /></>)
    const botao = screen.getByRole('button', { name: 'Nova Conta' })
    botao.getBoundingClientRect = () => ({ top: 100, bottom: 130, left: 500, right: 600, width: 100, height: 30 })
    await screen.findByTestId('guia-tela')
    await waitFor(() => expect(screen.getAllByTestId('selo-guia').map(s => s.textContent)).toEqual([String(n)]))
    const item = screen.getAllByRole('button').find(b => b.textContent.startsWith(`${n}Nova Conta`))
    fireEvent.mouseEnter(item)
    expect(botao.classList.contains('guia-destaque')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Esconder' }))
    expect(botao.classList.contains('guia-destaque')).toBe(false)
    expect(screen.queryByTestId('selo-guia')).toBeNull()
  })
})

describe('itens por módulo e subtelas', () => {
  it('itens do controle gerencial somem com ele desligado', () => {
    const com = guiaDaTela('settings:categorias', montarContextoAjuda({ podeVer: () => true, pode: () => true, settings: { controleGerencial: true } }))
    const sem = guiaDaTela('settings:categorias', montarContextoAjuda({ podeVer: () => true, pode: () => true, settings: { controleGerencial: false } }))
    expect(com.itens.length).toBeGreaterThan(sem.itens.length)
    expect(sem.itens.some(i => i.modulo === 'gerencial')).toBe(false)
    expect(itemVisivel({ modulo: 'pode:usuarios:ver' }, { pode: () => false })).toBe(false)
  })
  it('subtela aberta (ex.: Configurações › Perfis) usa o guia dela', async () => {
    const Perfis = () => { useSubtelaGuia('settings:perfis'); return null }
    render(<><Perfis /><AjudaTela pagina="settings" /></>)
    expect((await screen.findByTestId('guia-tela')).textContent).toContain(AJUDA_TELAS['settings:perfis'].titulo)
  })
  it('tela sem guia: sem "?"', () => {
    const { container } = render(<AjudaTela pagina="inexistente" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('Configurações › Guias das telas', () => {
  it('Desativar todos e Reativar todos', async () => {
    render(<GuiasTelasPanel />)
    await screen.findByText('Todos os guias estão ativos.')
    fireEvent.click(screen.getByRole('button', { name: /Desativar todos os guias/ }))
    await waitFor(() => expect(banco.guiasOcultos).toHaveLength(TELAS_COM_GUIA.length))
    expect(await screen.findByText(`${TELAS_COM_GUIA.length} de ${TELAS_COM_GUIA.length} telas não abrem o guia sozinhas.`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Reativar todos os guias/ }))
    await waitFor(() => expect(banco.guiasOcultos).toEqual([]))
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(true)
  })
})

describe('API', () => {
  it('tabela guia_telas_ocultas por usuário; só telas conhecidas', async () => {
    expect(DDL_GUIAS).toMatch(/CREATE TABLE IF NOT EXISTS guia_telas_ocultas/)
    expect(DDL_GUIAS).toMatch(/UNIQUE \(user_id, tela_id\)/)
    const chamadas = []
    const q = async (sql, p) => { chamadas.push({ sql, p }); return [] }
    expect(await ocultarGuias(q, 'u1', ['accounts', 'tela-que-nao-existe'])).toBe(1)
    expect(chamadas[0].p).toEqual(['u1', ['accounts']])
    expect(await ocultarGuias(q, 'u1', ['nada'])).toBe(0)
  })
})
