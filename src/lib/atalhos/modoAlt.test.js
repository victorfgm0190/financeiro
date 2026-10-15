import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { criarModoAlt } from './modoAlt'

const tecla = (key, extra = {}) => ({ key, ctrlKey: false, shiftKey: false, metaKey: false, repeat: false, ...extra })

describe('modo "segurar Alt"', () => {
  let estados, modo
  beforeEach(() => {
    vi.useFakeTimers()
    estados = []
    modo = criarModoAlt({ aoMudar: (v) => estados.push(v) })
  })
  afterEach(() => vi.useRealTimers())

  it('liga após 400 ms segurando só o Alt e desliga ao soltar', () => {
    modo.keydown(tecla('Alt'))
    vi.advanceTimersByTime(399)
    expect(estados).toEqual([])
    vi.advanceTimersByTime(1)
    expect(estados).toEqual([true])
    modo.keyup(tecla('Alt'))
    expect(estados).toEqual([true, false])
  })

  it('Alt+tecla antes dos 400 ms não liga (atalho normal)', () => {
    modo.keydown(tecla('Alt'))
    modo.keydown(tecla('g', { altKey: true }))
    vi.advanceTimersByTime(1000)
    expect(estados).toEqual([])
  })

  it('outra tecla com o modo ligado desliga', () => {
    modo.keydown(tecla('Alt'))
    vi.advanceTimersByTime(400)
    modo.keydown(tecla('n', { altKey: true }))
    expect(estados).toEqual([true, false])
  })

  it('auto-repeat do Alt não reinicia o tempo nem liga duas vezes', () => {
    modo.keydown(tecla('Alt'))
    vi.advanceTimersByTime(300)
    modo.keydown(tecla('Alt', { repeat: true }))
    vi.advanceTimersByTime(100)
    modo.keydown(tecla('Alt', { repeat: true }))
    vi.advanceTimersByTime(1000)
    expect(estados).toEqual([true])
  })

  it('soltar o Alt antes dos 400 ms cancela', () => {
    modo.keydown(tecla('Alt'))
    vi.advanceTimersByTime(200)
    modo.keyup(tecla('Alt'))
    vi.advanceTimersByTime(1000)
    expect(estados).toEqual([])
  })

  it('AltGr (Ctrl+Alt) e Shift+Alt não ligam', () => {
    modo.keydown(tecla('Alt', { ctrlKey: true }))
    modo.keydown(tecla('AltGraph'))
    modo.keydown(tecla('Alt', { shiftKey: true }))
    vi.advanceTimersByTime(1000)
    expect(estados).toEqual([])
  })

  it('desligar() (blur da janela) cancela o timer e desliga', () => {
    modo.keydown(tecla('Alt'))
    modo.desligar()
    vi.advanceTimersByTime(1000)
    expect(estados).toEqual([])
    modo.keydown(tecla('Alt'))
    vi.advanceTimersByTime(400)
    modo.desligar()
    expect(estados).toEqual([true, false])
  })
})
