// @vitest-environment jsdom
// useAgendaFeed: depois de gravar o .ics, avisa a tela (EVENTO_AGENDA_PUBLICADO) com o feed e o que
// foi gravado — é o que troca "Gerando…" por "Atualizada em…". Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ obter: vi.fn(), publicar: vi.fn() }))
vi.mock('../lib/agendaFeedApi', async (orig) => ({ ...(await orig()), obterAgendaFeed: api.obter, publicarAgendaFeed: api.publicar }))
vi.mock('../lib/agendaFeed', () => ({ gerarFeed: () => ({ despesa: { hash: 'h1', conteudo: 'BEGIN:VCALENDAR' } }) }))
vi.mock('../context/AppContext', () => {
  const ctx = { schedules: [], payables: [], accounts: [], categories: [], payees: [], getNextOccurrences: () => [], pode: () => true, usuario: { id: 'u1', origem: 'db', ambSigla: 'teste1' }, dbStatus: 'connected' }
  return { useApp: () => ctx }
})

const { useAgendaFeed } = await import('./useAgendaFeed.js')
const { avisarFeedMudou, EVENTO_AGENDA_PUBLICADO } = await import('../lib/agendaFeedApi')

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('useAgendaFeed — aviso de publicação', () => {
  it('feed criado pela tela → publica e dispara o evento com o id e os gravados', async () => {
    api.obter.mockResolvedValue({ configurado: true, feed: null })
    const gravados = { despesa: { hash: 'h1', geradoEm: '2026-11-09T18:04:00.000Z' } }
    api.publicar.mockResolvedValue({ ok: true, gravados })
    const recebidos = []
    const ouvir = (e) => recebidos.push(e.detail)
    window.addEventListener(EVENTO_AGENDA_PUBLICADO, ouvir)
    renderHook(() => useAgendaFeed())
    await waitFor(() => expect(api.obter).toHaveBeenCalled())
    avisarFeedMudou({ id: 'f9', tipos: ['despesa'], mostrarValores: true, cache: {} })
    await waitFor(() => expect(recebidos).toEqual([{ feedId: 'f9', gravados }]))
    expect(api.publicar).toHaveBeenCalledWith({ despesa: 'BEGIN:VCALENDAR' })
    window.removeEventListener(EVENTO_AGENDA_PUBLICADO, ouvir)
  })
})
