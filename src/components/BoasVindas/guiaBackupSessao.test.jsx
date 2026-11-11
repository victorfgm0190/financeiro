// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// (1) O Guia da Tela nunca aciona o backup pelo "Abrir" (exportar/restaurar/conferir só por clique de
// quem usa). (2) "Pular tour" vale para a sessão na hora, mesmo que a gravação no banco falhe — o tour
// não volta ao recarregar a tela.
const { itemAcionavel } = await import('./guiaElementos.js')

describe('Guia da Tela × backup', () => {
  it('"Abrir" não aparece para Exportar, Restaurar nem Conferir backup', () => {
    const botao = document.createElement('button')
    for (const rotulo of ['Exportar backup completo', 'Restaurar backup', 'Conferir com um arquivo de backup', 'Backup ao sair']) {
      expect(itemAcionavel({ rotulo }, botao), rotulo).toBe(false)
    }
    expect(itemAcionavel({ rotulo: 'Nova conta' }, botao)).toBe(true)
  })
})

describe('"Pular tour" na sessão', () => {
  beforeEach(() => { sessionStorage.clear(); vi.resetModules() })

  it('a tela pulada continua oculta ao recarregar mesmo com o servidor sem a gravação', async () => {
    let respostaGet = { tourVistoEm: '2026-11-01', guiasOcultos: [] }
    globalThis.fetch = vi.fn(async (_url, init) => {
      if (init?.method === 'POST') return { ok: false, status: 500, json: async () => ({ error: 'falhou' }) }
      return { ok: true, status: 200, json: async () => respostaGet }
    })
    let api = await import('../../lib/boasVindasApi.js')
    await api.carregarBoasVindas()
    await api.ocultarGuia('settings:backup')
    expect(api.estadoBoasVindas().guiasOcultos).toContain('settings:backup')
    // "Recarregar": módulo novo, servidor ainda sem a tela (o POST falhou).
    vi.resetModules()
    api = await import('../../lib/boasVindasApi.js')
    await api.carregarBoasVindas()
    expect(api.estadoBoasVindas().guiasOcultos).toContain('settings:backup')
    // Reativar devolve o tour.
    respostaGet = { tourVistoEm: '2026-11-01', guiasOcultos: [] }
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => respostaGet }))
    await api.reativarGuia('settings:backup')
    expect(api.guiasOcultosNaSessao()).not.toContain('settings:backup')
  })
})
