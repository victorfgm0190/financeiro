import { describe, it, expect, vi } from 'vitest'
import {
  CHAVE_AVISO_APP, DIAS_ENTRE_AVISOS, lerAvisoApp, deveMostrarAvisoApp, registrarAvisoMostrado,
  naoMostrarMaisAvisoApp, marcarAppInstalado, reativarAvisoApp, aoMudarAvisoApp,
} from './avisoAplicativo.js'

const lsFalso = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m }
}
const abaComum = { modo: 'sem-instalacao', instalado: false }
const agora = new Date('2026-11-11T12:00:00Z')
const diasAtras = (d) => new Date(agora.getTime() - d * 86400000).toISOString()
const pode = (o) => deveMostrarAvisoApp({ situacao: abaComum, computador: true, agora, ...o })

describe('quando o aviso "Use como aplicativo" aparece', () => {
  it('computador, aba comum, nunca mostrado: aparece', () => expect(pode({})).toBe(true))
  it('celular: nunca', () => expect(pode({ computador: false })).toBe(false))
  it('já aberto como aplicativo: nunca', () => expect(pode({ situacao: { modo: 'instalado', instalado: true } })).toBe(false))
  it('com outro guia/aviso na tela: espera', () => expect(pode({ bloqueado: true })).toBe(false))
  it('no máximo 1 vez a cada 7 dias', () => {
    expect(DIAS_ENTRE_AVISOS).toBe(7)
    expect(pode({ prefs: { mostradoEm: diasAtras(0) } })).toBe(false)
    expect(pode({ prefs: { mostradoEm: diasAtras(6.9) } })).toBe(false)
    expect(pode({ prefs: { mostradoEm: diasAtras(7) } })).toBe(true)
  })
  it('"Não mostrar mais": nunca mais (até reativar)', () => expect(pode({ prefs: { nunca: true, mostradoEm: diasAtras(30) } })).toBe(false))
  it('depois de instalado neste aparelho: não volta', () => expect(pode({ prefs: { instaladoEm: diasAtras(30) } })).toBe(false))
  it('sem saber a situação: não mostra', () => expect(pode({ situacao: null })).toBe(false))
})

describe('guardado por aparelho', () => {
  it('mostrado, "Não mostrar mais", instalado e reativar', () => {
    const ls = lsFalso()
    const avisos = vi.fn()
    const parar = aoMudarAvisoApp(avisos)
    registrarAvisoMostrado(agora, ls)
    expect(lerAvisoApp(ls)).toEqual({ mostradoEm: agora.toISOString() })
    naoMostrarMaisAvisoApp(ls)
    expect(lerAvisoApp(ls).nunca).toBe(true)
    reativarAvisoApp(ls)
    expect(lerAvisoApp(ls)).toMatchObject({ nunca: false, mostradoEm: null })
    expect(pode({ prefs: lerAvisoApp(ls) })).toBe(true)
    marcarAppInstalado(agora, ls)
    expect(pode({ prefs: lerAvisoApp(ls) })).toBe(false)
    expect(avisos).toHaveBeenCalledTimes(4)
    parar()
  })
  it('valor estragado ou localStorage indisponível: começa do zero, sem erro', () => {
    const ls = lsFalso()
    ls.setItem(CHAVE_AVISO_APP, '{quebrado')
    expect(lerAvisoApp(ls)).toEqual({})
    const quebrado = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    expect(lerAvisoApp(quebrado)).toEqual({})
    expect(() => naoMostrarMaisAvisoApp(quebrado)).not.toThrow()
  })
})
