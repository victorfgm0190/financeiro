import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolverTema, lerPreferencia, CHAVES_TEMA, THEME_COLOR, corBarra } from './useTheme'
import { MOBILE_MEDIA_QUERY } from '../lib/breakpoints'

describe('resolverTema', () => {
  it('light e dark valem independentemente do sistema', () => {
    expect(resolverTema('light', false)).toBe('light')
    expect(resolverTema('light', true)).toBe('light')
    expect(resolverTema('dark', false)).toBe('dark')
    expect(resolverTema('dark', true)).toBe('dark')
  })

  it('system segue o prefers-color-scheme', () => {
    expect(resolverTema('system', true)).toBe('light')
    expect(resolverTema('system', false)).toBe('dark')
  })

  it('preferência ausente ou inválida cai no escuro', () => {
    expect(resolverTema(undefined, true)).toBe('dark')
    expect(resolverTema('azul', true)).toBe('dark')
  })
})

describe('lerPreferencia', () => {
  afterEach(() => vi.unstubAllGlobals())

  const comStorage = (dados) => vi.stubGlobal('window', {
    localStorage: { getItem: (k) => (k in dados ? dados[k] : null) },
  })

  it('lê a chave de cada contexto separadamente', () => {
    comStorage({ [CHAVES_TEMA.mobile]: 'light', [CHAVES_TEMA.desktop]: 'system' })
    expect(lerPreferencia('mobile')).toBe('light')
    expect(lerPreferencia('desktop')).toBe('system')
  })

  it('sem valor salvo ou valor inválido → dark', () => {
    comStorage({ [CHAVES_TEMA.mobile]: 'roxo' })
    expect(lerPreferencia('mobile')).toBe('dark')
    expect(lerPreferencia('desktop')).toBe('dark')
  })

  it('localStorage que lança erro → dark', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('bloqueado') } } })
    expect(lerPreferencia('desktop')).toBe('dark')
  })

  it('sem window (SSR/teste) → dark', () => {
    expect(lerPreferencia('mobile')).toBe('dark')
  })
})

// O script anti-flash do index.html repete valores literais (não pode importar módulos).
describe('index.html anti-flash em sincronia com o código', () => {
  const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')

  it('usa a mesma media query de mobile', () => {
    expect(html).toContain(`var MOBILE_MEDIA_QUERY = '${MOBILE_MEDIA_QUERY}'`)
  })

  it('usa as mesmas chaves do localStorage', () => {
    expect(html).toContain(`mobile: '${CHAVES_TEMA.mobile}'`)
    expect(html).toContain(`desktop: '${CHAVES_TEMA.desktop}'`)
  })

  it('usa as mesmas cores de theme-color', () => {
    expect(html).toContain(`dark: '${THEME_COLOR.dark}'`)
    expect(html).toContain(`light: '${THEME_COLOR.light}'`)
    expect(html).toContain(`darkDesktop: '${THEME_COLOR.darkDesktop}'`)
    expect(html).toContain("var cor = tema === 'light' ? THEME_COLOR.light : contexto === 'desktop' ? THEME_COLOR.darkDesktop : THEME_COLOR.dark")
  })
})

describe('corBarra', () => {
  it('escuro do computador usa o fundo suave', () => {
    expect(corBarra('dark', 'desktop')).toBe('#202329')
  })
  it('escuro do celular e tema claro não mudam', () => {
    expect(corBarra('dark', 'mobile')).toBe('#030712')
    expect(corBarra('light', 'mobile')).toBe('#EEF1F6')
    expect(corBarra('light', 'desktop')).toBe('#EEF1F6')
  })
})
