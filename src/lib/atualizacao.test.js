import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  estadoAtualizacao, marcarVersaoPronta, adiarAtualizacao, atualizacaoParaAvisar, iniciarServiceWorker,
  aplicarAtualizacao, procurarAtualizacao, simularSePedido, _reiniciarAtualizacao, ADIAR_MS, INTERVALO_PROCURA_MS,
} from './atualizacao.js'
import { quererAviso, vezDoAviso, outroAvisoNaFrente, _reiniciarAvisos } from './filaDeAvisos.js'

const n = (id, extra = {}) => ({ id, data: id.slice(0, 10).replace(/\./g, '-'), titulo: id, publico: 'todos', obrigatoria: false, itens: [`item ${id}`], ...extra })
const locais = [n('2026.11.11'), n('2026.11.10')]
const resposta = (novidades) => vi.fn(async () => ({ ok: true, json: async () => ({ commit: 'abc1234', novidades }) }))

// Janela fictícia: eventos de focus/visibilitychange e location.
function janela() {
  const ouv = {}
  const docOuv = {}
  return {
    addEventListener: (t, f) => { (ouv[t] ||= []).push(f) },
    document: { visibilityState: 'visible', addEventListener: (t, f) => { (docOuv[t] ||= []).push(f) } },
    location: { reload: vi.fn(), replace: vi.fn(), pathname: '/', hash: '', search: '' },
    disparar: (t) => (ouv[t] || []).forEach(f => f()),
    dispararDoc: (t) => (docOuv[t] || []).forEach(f => f()),
  }
}
// registerSW fictício do vite-plugin-pwa: guarda as opções e devolve o updateSW.
function registerFalso() {
  const reg = { update: vi.fn(async () => {}) }
  const updateSW = vi.fn(async () => {})
  const registerSW = vi.fn((op) => { registerSW.op = op; return updateSW })
  return { registerSW, updateSW, reg }
}

beforeEach(() => { _reiniciarAtualizacao(); _reiniciarAvisos() })
afterEach(() => { vi.useRealTimers() })

describe('detectar versão nova', () => {
  it('procura ao abrir, ao voltar para a aba/app (no máximo 1 vez por minuto) e a cada 30 min', () => {
    vi.useFakeTimers()
    const w = janela()
    const { registerSW, reg } = registerFalso()
    iniciarServiceWorker(registerSW, w)
    expect(registerSW.op.immediate).toBe(true)
    registerSW.op.onRegisteredSW('/sw.js', reg)
    expect(reg.update).toHaveBeenCalledTimes(1) // ao abrir
    w.disparar('focus')
    expect(reg.update).toHaveBeenCalledTimes(1) // logo depois: não repete
    vi.advanceTimersByTime(61_000)
    w.dispararDoc('visibilitychange')
    expect(reg.update).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(INTERVALO_PROCURA_MS)
    expect(reg.update).toHaveBeenCalledTimes(3)
    expect(procurarAtualizacao({ forcar: true })).toBe(true)
  })

  it('service worker novo em espera → pronta, com as novidades que vêm nela', async () => {
    const buscar = resposta([n('2026.11.12'), n('2026.11.11-2'), ...locais])
    await marcarVersaoPronta({ buscar, locais })
    expect(buscar.mock.calls[0][0]).toMatch(/^\/versao\.json\?nc=/)
    expect(estadoAtualizacao()).toMatchObject({ pronta: true, obrigatoria: false })
    expect(estadoAtualizacao().novas.map(x => x.id)).toEqual(['2026.11.12', '2026.11.11-2'])
    expect(atualizacaoParaAvisar()).toBe(true)
  })

  it('sem /versao.json (rede, versão antiga): avisa assim mesmo, sem as linhas', async () => {
    await marcarVersaoPronta({ buscar: vi.fn(async () => { throw new Error('offline') }), locais })
    expect(estadoAtualizacao()).toMatchObject({ pronta: true, novas: [] })
  })

  it('nunca atualiza sozinho: o onNeedRefresh só marca o aviso', () => {
    const w = janela()
    const { registerSW, updateSW } = registerFalso()
    vi.stubGlobal('fetch', resposta(locais))
    iniciarServiceWorker(registerSW, w)
    registerSW.op.onNeedRefresh()
    expect(updateSW).not.toHaveBeenCalled()
    expect(w.location.reload).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('Mais tarde e obrigatória', () => {
  it('"Mais tarde": volta depois de 4 h', async () => {
    await marcarVersaoPronta({ buscar: resposta([n('2026.11.12'), ...locais]), locais })
    const t0 = Date.now()
    adiarAtualizacao(t0)
    expect(atualizacaoParaAvisar(estadoAtualizacao(), t0 + ADIAR_MS - 1)).toBe(false)
    expect(atualizacaoParaAvisar(estadoAtualizacao(), t0 + ADIAR_MS)).toBe(true)
    expect(ADIAR_MS).toBe(4 * 60 * 60 * 1000)
  })
  it('obrigatória (flag na versão): não adia e traz o motivo', async () => {
    await marcarVersaoPronta({ buscar: resposta([n('2026.11.12', { obrigatoria: true, motivo: 'O banco mudou.' }), ...locais]), locais })
    adiarAtualizacao()
    expect(estadoAtualizacao()).toMatchObject({ obrigatoria: true, motivo: 'O banco mudou.', adiadaAte: 0 })
    expect(atualizacaoParaAvisar()).toBe(true)
  })
})

describe('aplicar', () => {
  it('Atualizar agora: SKIP_WAITING (updateSW) e recarrega quando o SW novo assume', async () => {
    vi.useFakeTimers()
    const w = janela()
    const { registerSW, updateSW } = registerFalso()
    iniciarServiceWorker(registerSW, w)
    await aplicarAtualizacao(w)
    expect(updateSW).toHaveBeenCalledWith(true)
    registerSW.op.onNeedReload()
    expect(w.location.reload).toHaveBeenCalledTimes(1)
  })
  it('outra janela atualizou: esta NÃO recarrega no meio do uso — pede para recarregar', () => {
    const w = janela()
    const { registerSW } = registerFalso()
    iniciarServiceWorker(registerSW, w)
    registerSW.op.onNeedReload()
    expect(w.location.reload).not.toHaveBeenCalled()
    expect(estadoAtualizacao()).toMatchObject({ pronta: true, outraJanela: true, obrigatoria: true })
    adiarAtualizacao()
    expect(atualizacaoParaAvisar()).toBe(true)
  })
  it('simulação (?simular-atualizacao): mostra o aviso; atualizar reabre sem o parâmetro', async () => {
    const w = janela()
    w.location.search = '?simular-atualizacao'
    w.location.pathname = '/'
    w.location.hash = '#ajuda'
    expect(simularSePedido(w, locais)).toBe(true)
    expect(estadoAtualizacao()).toMatchObject({ pronta: true, simulada: true, obrigatoria: false })
    await aplicarAtualizacao(w)
    expect(w.location.replace).toHaveBeenCalledWith('/#ajuda')
    _reiniciarAtualizacao()
    w.location.search = '?simular-atualizacao=obrigatoria'
    simularSePedido(w, locais)
    expect(estadoAtualizacao()).toMatchObject({ obrigatoria: true })
    w.location.search = ''
    _reiniciarAtualizacao()
    expect(simularSePedido(w, locais)).toBe(false)
  })
})

describe('um aviso de cada vez', () => {
  it('atualização > O que mudou > Use como aplicativo', () => {
    quererAviso('aplicativo', true)
    expect(vezDoAviso('aplicativo')).toBe(true)
    quererAviso('novidades', true)
    expect(outroAvisoNaFrente('aplicativo')).toBe(true)
    quererAviso('atualizacao', true)
    expect(vezDoAviso('atualizacao')).toBe(true)
    expect(outroAvisoNaFrente('novidades')).toBe(true)
    quererAviso('atualizacao', false)
    quererAviso('novidades', false)
    expect(vezDoAviso('aplicativo')).toBe(true)
  })
})
