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
    render(<HistoricoNovidades carregarStatus={async () => ({ liberado: false, ligado: false })} />)
    // As de recurso contratado só aparecem com o recurso liberado (testes abaixo).
    const visiveis = NOVIDADES.filter(x => x.publico === 'todos' && !x.recurso)
    for (const x of visiveis) expect(screen.getByTestId(`novidade-${x.id}`).textContent).toContain(x.titulo)
    for (const x of NOVIDADES.filter(y => y.recurso)) expect(screen.queryByTestId(`novidade-${x.id}`)).toBeNull()
    expect(screen.getByText('Importar Fatura mais inteligente')).toBeTruthy()
    expect(screen.queryByText('Backup completo e backup ao sair')).toBeNull() // só administrador
  })
  it('administrador vê o backup', () => {
    sessao.atual = { id: 'u1', nivel: 'admin' }
    render(<HistoricoNovidades />)
    expect(screen.getByText('Backup completo e backup ao sair')).toBeTruthy()
  })
})

describe('novidade de RECURSO contratado (ex.: sugestões do Assistente)', () => {
  const COM_RECURSO = [n('2026.11.12-5', { recurso: 'ia_sugestoes_importacao', titulo: 'Assistente' }), n('2026.11.12-4', { titulo: 'Geral' }), n('2026.11.11')]
  const status = (liberado) => async () => ({ liberado, ligado: liberado })
  it('sem liberação: só a parte geral (a do recurso não aparece nem fica marcada)', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.11' } })
    render(<OQueMudou lista={COM_RECURSO} espera={10} carregarStatus={status(false)} />)
    await screen.findByTestId('o-que-mudou')
    expect(screen.getByTestId('novidade-2026.11.12-4')).toBeTruthy()
    expect(screen.queryByTestId('novidade-2026.11.12-5')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    await pausa()
    expect(posts()).toEqual([{ novidadeVista: '2026.11.12-4' }])
  })
  it('com liberação: as duas; "Entendi" marca a geral e a do recurso (à parte)', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.11' } })
    render(<OQueMudou lista={COM_RECURSO} espera={10} carregarStatus={status(true)} />)
    await screen.findByTestId('novidade-2026.11.12-5')
    expect(screen.getByTestId('novidade-2026.11.12-4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    await pausa()
    expect(posts()).toEqual(expect.arrayContaining([{ novidadeVista: '2026.11.12-4' }, { novidadesRecursoVistas: ['2026.11.12-5'] }]))
  })
  it('recurso liberado DEPOIS (a geral já vista): a do recurso aparece na próxima abertura', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.12-4' } })
    render(<OQueMudou lista={COM_RECURSO} espera={10} carregarStatus={status(true)} />)
    await screen.findByTestId('novidade-2026.11.12-5')
    expect(screen.queryByTestId('novidade-2026.11.12-4')).toBeNull()
  })
  it('status falhando na 1ª chamada não esconde a do recurso de vez', async () => {
    await preparar({ progresso: { novidadeVista: '2026.11.12-4' } })
    const carregar = vi.fn()
      .mockResolvedValueOnce({ liberado: false, ligado: false, falhou: true })
      .mockResolvedValue({ liberado: true, ligado: true })
    render(<OQueMudou lista={COM_RECURSO} espera={10} carregarStatus={carregar} />)
    expect(await screen.findByTestId('novidade-2026.11.12-5', {}, { timeout: 2000 })).toBeTruthy()
    expect(carregar).toHaveBeenCalledTimes(2)
  })
  it('Ajuda → Novidades: a do recurso só com liberação', async () => {
    await preparar({})
    const { unmount } = render(<HistoricoNovidades lista={COM_RECURSO} carregarStatus={status(false)} />)
    await pausa()
    expect(screen.queryByTestId('novidade-2026.11.12-5')).toBeNull()
    unmount()
    render(<HistoricoNovidades lista={COM_RECURSO} carregarStatus={status(true)} />)
    expect(await screen.findByTestId('novidade-2026.11.12-5')).toBeTruthy()
  })
})
