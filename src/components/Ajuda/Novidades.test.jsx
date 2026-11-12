// @vitest-environment jsdom
// "O que mudou nesta versão": novidades não vistas (última vista no servidor), público, usuário novo,
// espera tour, e o histórico em Ajuda → Novidades.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import OQueMudou, { HistoricoNovidades } from './Novidades'
import { _reiniciarBoasVindas, carregarBoasVindas } from '../../lib/boasVindasApi'
import { _reiniciarTour, iniciarTour, encerrarTour } from '../BoasVindas/tourEstado'
import { _reiniciarJornada } from '../BoasVindas/jornadaEstado'
import { _reiniciarAvisos, quererAviso } from '../../lib/filaDeAvisos'
import { NOVIDADES } from '../../novidades'

const sessao = { atual: { id: 'u1', nivel: 'operador' } }
vi.mock('../../lib/api', async (orig) => ({ ...(await orig()), getSessao: () => sessao.atual }))
vi.mock('../../context/AppContext', () => ({ useApp: vi.fn(() => ({ dbStatus: 'connected' })) }))

const n = (id, extra = {}) => ({ id, data: id.slice(0, 10).replace(/\./g, '-'), titulo: `Título ${id}`, publico: 'todos', obrigatoria: false, itens: [`Item ${id}`], ...extra })
const LISTA = [n('2026.11.11-2'), n('2026.11.11', { publico: 'admin' }), n('2026.11.10'), n('2026.11.01')]

let banco
const posts = () => fetch.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o.body))
async function preparar(b) {
  banco = { tourVistoEm: '2026-11-01T10:00:00Z', guiasOcultos: [], guiasLigados: true, progresso: {}, ...b }
  vi.stubGlobal('fetch', vi.fn(async (_u, o = {}) => {
    if (o.method === 'POST') { const c = JSON.parse(o.body); if (c.novidadeVista) banco.progresso = { ...banco.progresso, novidadeVista: c.novidadeVista } }
    return { ok: true, status: 200, json: async () => banco }
  }))
  await carregarBoasVindas()
}
const janela = () => screen.queryByTestId('o-que-mudou')
const pausa = () => act(() => new Promise(r => setTimeout(r, 60)))

beforeEach(() => { _reiniciarBoasVindas(); _reiniciarTour(); _reiniciarJornada(); _reiniciarAvisos(); sessao.atual = { id: 'u1', nivel: 'operador' } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('"O que mudou" depois de atualizar', () => {
  it('mostra as versões ainda não vistas (sem as de administrador) e "Entendi" grava a mais nova no servidor', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.01' } })
    render(<OQueMudou lista={LISTA} espera={10} />)
    await screen.findByTestId('o-que-mudou')
    expect(screen.getByTestId('novidade-2026.11.11-2')).toBeTruthy()
    expect(screen.getByTestId('novidade-2026.11.10')).toBeTruthy()
    expect(screen.queryByTestId('novidade-2026.11.11')).toBeNull() // só administrador
    expect(screen.queryByTestId('novidade-2026.11.01')).toBeNull() // já vista
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(janela()).toBeNull()
    await waitFor(() => expect(posts()).toContainEqual({ novidadeVista: '2026.11.11-2' }))
    cleanup()
    // Outro aparelho: a última vista vem do servidor.
    _reiniciarBoasVindas(); await carregarBoasVindas()
    render(<OQueMudou lista={LISTA} espera={10} />)
    await pausa()
    expect(janela()).toBeNull()
  })

  it('administrador vê também as de administrador', async () => {
    sessao.atual = { id: 'u1', nivel: 'admin' }
    await preparar({ progresso: { novidadeVista: '2026.11.10' } })
    render(<OQueMudou lista={LISTA} espera={10} />)
    await screen.findByTestId('o-que-mudou')
    expect(screen.getByTestId('novidade-2026.11.11')).toBeTruthy()
  })

  it('usuário novo (boas-vindas ainda não vistas): sem janela; marca a mais nova como vista', async () => {
    await preparar({ tourVistoEm: null })
    render(<OQueMudou lista={LISTA} espera={10} />)
    await pausa()
    expect(janela()).toBeNull()
    await waitFor(() => expect(posts()).toContainEqual({ novidadeVista: '2026.11.11-2' }))
  })

  it('espera tour e o aviso de atualização (um de cada vez)', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.01' } })
    act(() => iniciarTour('accounts'))
    act(() => quererAviso('atualizacao', true))
    render(<OQueMudou lista={LISTA} espera={10} />)
    await pausa()
    expect(janela()).toBeNull()
    act(() => encerrarTour())
    await pausa()
    expect(janela()).toBeNull()
    act(() => quererAviso('atualizacao', false))
    await screen.findByTestId('o-que-mudou')
  })

  it('espera outra janela aberta fechar', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.01' } })
    const outra = document.createElement('div')
    outra.setAttribute('aria-modal', 'true')
    document.body.appendChild(outra)
    render(<OQueMudou lista={LISTA} espera={10} />)
    await pausa()
    expect(janela()).toBeNull()
    outra.remove()
    await screen.findByTestId('o-que-mudou')
  })
})

describe('Ajuda → Novidades', () => {
  it('histórico completo do arquivo de verdade (as entregas desta semana)', () => {
    render(<HistoricoNovidades />)
    const visiveis = NOVIDADES.filter(x => x.publico === 'todos')
    for (const x of visiveis) expect(screen.getByTestId(`novidade-${x.id}`).textContent).toContain(x.titulo)
    expect(screen.getByText('Importar Fatura mais inteligente')).toBeTruthy()
    expect(screen.queryByText('Backup completo e backup ao sair')).toBeNull() // só administrador
  })
  it('administrador vê o backup', () => {
    sessao.atual = { id: 'u1', nivel: 'admin' }
    render(<HistoricoNovidades />)
    expect(screen.getByText('Backup completo e backup ao sair')).toBeTruthy()
  })
})
