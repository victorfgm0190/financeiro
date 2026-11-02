// @vitest-environment jsdom
// Tour da tela (spotlight) e interruptor geral dos guias. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import AjudaTela from './AjudaTela'
import GuiaInterativo from './GuiaInterativo'
import GuiasTelasPanel from './GuiasTelasPanel'
import { useSubtelaGuia } from './subtelaGuia'
import { _reiniciarTour } from './tourEstado'
import { montarPassos, posicaoBalao, indiceDoItem } from './tourPassos'
import { _reiniciarBoasVindas, definirTourAberto } from '../../lib/boasVindasApi'
import { AJUDA_TELAS, TELAS_COM_GUIA, itemVisivel, guiaDaTela } from '../../lib/ajudaTelas'
import { montarContextoAjuda } from './contextoAjuda'
import { DDL_GUIAS, DDL_GUIAS_LIGADOS, ocultarGuias, gravarGuiasLigados } from '../../../api/boas-vindas.js'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
const app = (gerencial = true) => useApp.mockReturnValue({
  dbStatus: 'connected', podeVer: () => true, pode: () => true, settings: { controleGerencial: gerencial },
})

// Servidor falso de /api/boas-vindas (o "banco": vale entre recargas e navegadores).
let banco
const servidor = () => vi.fn(async (url, opts = {}) => {
  const b = opts.body ? JSON.parse(opts.body) : {}
  if (opts.method === 'POST') {
    if (b.guiaOculto) banco.guiasOcultos = [...new Set([...banco.guiasOcultos, b.guiaOculto])]
    if (b.guiasTodos) banco.guiasOcultos = [...TELAS_COM_GUIA]
    if (b.guiaReativar) banco.guiasOcultos = banco.guiasOcultos.filter(t => t !== b.guiaReativar)
    if (typeof b.guiasLigados === 'boolean') banco.guiasLigados = b.guiasLigados
  }
  if (opts.method === 'DELETE') banco.guiasOcultos = []
  return { ok: true, status: 200, json: async () => ({ ...banco, guiasOcultos: [...banco.guiasOcultos] }) }
})
const recarregar = () => { cleanup(); _reiniciarTour(); _reiniciarBoasVindas() }
beforeEach(() => {
  recarregar()
  banco = { tourVistoEm: '2026-11-01T10:00:00Z', checklistOcultoEm: null, guiasOcultos: [], guiasLigados: true }
  vi.stubGlobal('fetch', servidor())
  app()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// Tela fictícia com dois botões do guia de Contas (visíveis) — o resto não existe na tela.
const visivel = (el) => { if (el) el.getBoundingClientRect = () => ({ top: 100, bottom: 130, left: 100, right: 220, width: 120, height: 30 }) }
function Tela({ pagina = 'accounts', children }) {
  return (
    <>
      <button data-guia="accounts.nova" ref={visivel}>Nova Conta</button>
      <button data-guia="accounts.grupos" ref={visivel}>Grupos</button>
      {children}
      <AjudaTela pagina={pagina} />
      <GuiaInterativo />
    </>
  )
}
const tour = () => screen.queryByTestId('tour-tela')
const esperarTour = () => screen.findByTestId('tour-tela', {}, { timeout: 3000 })
const semTour = async () => { await act(async () => { await new Promise(r => setTimeout(r, 900)) }); expect(tour()).toBeNull() }
const posts = () => fetch.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o.body))

describe('tour da tela', () => {
  it('abre sozinho na primeira visita: intro "para que serve", um passo por botão presente, "Pronto!" → Concluir não abre mais', async () => {
    render(<Tela />)
    await esperarTour()
    expect(screen.getByTestId('balao-tour').textContent).toContain(AJUDA_TELAS.accounts.descricao)
    expect(screen.getByTestId('indicador-tour').textContent).toBe('1 de 5') // intro + 2 botões + "em cada linha" + fim
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByTestId('balao-tour').textContent).toMatch(/^2 de 5(Grupos|Nova Conta)/)
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    // Botões de cada linha (lista vazia na tela): um passo só, com a lista deles.
    expect(screen.getByTestId('balao-tour').textContent).toContain('Em cada linha da lista')
    expect(screen.getByTestId('tour-linhas').textContent).toContain('Excluir')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByTestId('balao-tour').textContent).toContain('Pronto!')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(tour()).toBeNull()
    await waitFor(() => expect(banco.guiasOcultos).toEqual(['accounts']))
    recarregar()
    render(<Tela />)
    await semTour()
  })
  it('Esc (pular) e "Não mostrar mais nesta tela" também impedem a reabertura', async () => {
    render(<Tela />)
    await esperarTour()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(tour()).toBeNull()
    await waitFor(() => expect(posts()).toEqual([{ guiaOculto: 'accounts' }]))
    recarregar(); banco.guiasOcultos = []
    render(<Tela />)
    await esperarTour()
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar mais nesta tela' }))
    await waitFor(() => expect(banco.guiasOcultos).toEqual(['accounts']))
  })
  it('sair no meio trocando de tela não marca nada e o tour volta na próxima visita', async () => {
    const { rerender } = render(<Tela />)
    await esperarTour()
    rerender(<Tela pagina="credit" />) // trocou de tela
    await waitFor(() => expect(screen.queryByText(AJUDA_TELAS.accounts.descricao)).toBeNull())
    expect(banco.guiasOcultos).toEqual([])
    recarregar()
    render(<Tela />)
    await esperarTour()
  })
  it('"?" → "Tour desta tela" funciona sempre (mesmo com "Não mostrar mais"); "Voltar a mostrar" reativa', async () => {
    banco.guiasOcultos = ['accounts']
    render(<Tela />)
    await semTour()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tour desta tela' }))
    expect(tour()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Voltar a mostrar o tour sozinho/ }))
    await waitFor(() => expect(banco.guiasOcultos).toEqual([]))
  })
  it('"?" → "Ajuda detalhada com exemplos" e o "Ver com exemplos" do tour abrem a Central no ponto certo', async () => {
    banco.guiasOcultos = ['accounts']
    const ir = vi.fn()
    window.addEventListener('finup:navegar', ir)
    render(<Tela />)
    await semTour()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajuda detalhada com exemplos' }))
    expect(ir.mock.calls.at(-1)[0].detail.page).toBe('ajuda')
    expect(window.location.hash).toBe('#ajuda/accounts')
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tour desta tela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver com exemplos' }))
    expect(tour()).toBeNull()
    expect(window.location.hash).toMatch(/^#ajuda\/accounts\/(nova|grupos)$/)
    window.removeEventListener('finup:navegar', ir)
    window.history.replaceState(null, '', '/')
  })
  it('não abre por cima das boas-vindas: espera fechar; sem tour de boas-vindas visto, não abre', async () => {
    banco.tourVistoEm = null
    render(<Tela />)
    await semTour()
    recarregar(); banco.tourVistoEm = '2026-11-01T10:00:00Z'
    definirTourAberto(true)
    render(<Tela />)
    await semTour()
    act(() => definirTourAberto(false))
    await esperarTour()
  })
  it('carga do banco falhou: não abre sozinho, mas o "?" funciona', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'x' }) })))
    render(<Tela />)
    await semTour()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tour desta tela' }))
    expect(tour()).toBeTruthy()
  })
  it('"Ver todas as funções" abre a lista com selos nos botões presentes', async () => {
    banco.guiasOcultos = ['accounts']
    render(<Tela />)
    await semTour()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver todas as funções desta tela' }))
    expect(screen.getByTestId('guia-tela')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByTestId('selo-guia')).toHaveLength(2))
  })
  it('Configurações: na primeira visita o tour geral (abas) vem antes do tour da seção', async () => {
    const Perfis = () => { useSubtelaGuia('settings:perfis'); return null }
    render(<><Perfis /><AjudaTela pagina="settings" /><GuiaInterativo /></>)
    await esperarTour()
    expect(screen.getByTestId('balao-tour').textContent).toContain(AJUDA_TELAS.settings.descricao)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('balao-tour').textContent).toContain(AJUDA_TELAS['settings:perfis'].descricao), { timeout: 3000 })
  })
})

describe('partes puras', () => {
  it('passos: intro + só os itens com elemento + fim; alvo ausente fica de fora', () => {
    const guia = { itens: [{ chave: 'a' }, { chave: 'b' }, { chave: 'c' }] }
    const passos = montarPassos(guia, 't', (tela, chave) => (chave === 'b' ? {} : null))
    expect(passos.map(p => p.tipo + (p.item ? `:${p.item.chave}` : ''))).toEqual(['intro', 'item:b', 'fim'])
  })
  it('passos: botões "de cada linha" sem linha na tela viram um passo só; abrir num deles cai nesse passo', () => {
    const guia = { itens: [{ chave: 'a' }, { chave: 'b', porLinha: true }, { chave: 'c', porLinha: true }, { chave: 'd' }] }
    const passos = montarPassos(guia, 't', (tela, chave) => (chave === 'a' || chave === 'd' ? {} : null))
    expect(passos.map(p => p.tipo)).toEqual(['intro', 'item', 'item', 'linhas', 'fim'])
    expect(passos[3].itens.map(i => i.chave)).toEqual(['b', 'c'])
    expect(indiceDoItem(passos, 'c')).toBe(3)
    expect(indiceDoItem(passos, 'd')).toBe(2)
    expect(indiceDoItem(passos, 'zz')).toBe(0)
  })
  it('balão nunca sai da tela', () => {
    const vw = 400, vh = 600, t = { largura: 340, altura: 200 }
    const embaixo = posicaoBalao({ top: 50, bottom: 80, left: 350, width: 40, height: 30 }, t, { vw, vh })
    expect(embaixo.left).toBeLessThanOrEqual(vw - 340 - 8)
    expect(embaixo.top).toBeGreaterThan(80)
    const emCima = posicaoBalao({ top: 500, bottom: 540, left: 10, width: 40, height: 30 }, t, { vw, vh })
    expect(emCima.top + 200).toBeLessThanOrEqual(500)
  })
  it('itens do controle gerencial somem com ele desligado', () => {
    const com = guiaDaTela('settings:categorias', montarContextoAjuda({ podeVer: () => true, pode: () => true, settings: { controleGerencial: true } }))
    const sem = guiaDaTela('settings:categorias', montarContextoAjuda({ podeVer: () => true, pode: () => true, settings: { controleGerencial: false } }))
    expect(com.itens.length).toBeGreaterThan(sem.itens.length)
    expect(itemVisivel({ modulo: 'pode:usuarios:ver' }, { pode: () => false })).toBe(false)
  })
})

describe('interruptor geral dos guias', () => {
  it('desligado: sem "?" e sem tour sozinho; religado: tudo volta e as marcações de cada tela ficam', async () => {
    banco.guiasLigados = false
    banco.guiasOcultos = ['credit']
    render(<><GuiasTelasPanel /><Tela /></>)
    await screen.findByText('Desligados')
    await semTour()
    expect(screen.queryByRole('button', { name: 'Ajuda: Contas' })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Guias do sistema' }))
    await waitFor(() => expect(banco.guiasLigados).toBe(true))
    expect(banco.guiasOcultos).toEqual(['credit'])
    expect(await screen.findByRole('button', { name: 'Ajuda: Contas' })).toBeTruthy()
    await esperarTour()
  })
  it('"Não quero guias — desligar todos" no primeiro balão, com confirmação', async () => {
    render(<Tela />)
    await esperarTour()
    fireEvent.click(screen.getByRole('button', { name: /Não quero guias/ }))
    expect(screen.getByRole('alert').textContent).toMatch(/religar em Configurações › Geral › Guias das telas/)
    fireEvent.click(screen.getByRole('button', { name: 'Desligar os guias' }))
    expect(tour()).toBeNull()
    await waitFor(() => expect(banco.guiasLigados).toBe(false))
    expect(banco.guiasOcultos).toEqual([]) // não marca a tela
  })
  it('lista de telas com o estado de cada uma; um botão por tela', async () => {
    banco.guiasOcultos = ['accounts']
    render(<GuiasTelasPanel />)
    await screen.findByText(`Telas (${TELAS_COM_GUIA.length - 1} de ${TELAS_COM_GUIA.length} mostram o tour sozinhas)`)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar o tour de Contas' }))
    await waitFor(() => expect(banco.guiasOcultos).toEqual([]))
    fireEvent.click(screen.getByRole('button', { name: /Desativar todos os guias/ }))
    await waitFor(() => expect(banco.guiasOcultos).toHaveLength(TELAS_COM_GUIA.length))
  })
})

describe('API', () => {
  it('guias_ligados e guia_telas_ocultas por usuário; só telas conhecidas', async () => {
    expect(DDL_GUIAS_LIGADOS).toBe('ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS guias_ligados BOOLEAN NOT NULL DEFAULT true')
    expect(DDL_GUIAS).toMatch(/UNIQUE \(user_id, tela_id\)/)
    const chamadas = []
    const q = async (sql, p) => { chamadas.push({ sql, p }); return [{ guias_ligados: false }] }
    expect(await ocultarGuias(q, 'u1', ['accounts', 'tela-que-nao-existe'])).toBe(1)
    expect(chamadas[0].p).toEqual(['u1', ['accounts']])
    expect((await gravarGuiasLigados(q, 'u1', false)).guiasLigados).toBe(false)
    expect(chamadas[1].p).toEqual(['u1', false])
  })
})
