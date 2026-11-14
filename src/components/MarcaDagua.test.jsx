// @vitest-environment jsdom
// Marca-d'água do cabeçalho: frase exata, só decoração (aria-hidden, sem cliques, fora da impressão,
// fora dos guias) e uma única vez no cabeçalho, com ou sem chips de perfil.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useApp } from '../context/AppContext'
import MarcaDagua from './MarcaDagua'
import Header from './Layout/Header'

vi.mock('../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('./BoasVindas/AjudaTela', () => ({ default: () => null }))
vi.mock('./Offline/BotaoRecarregar', () => ({ default: () => null }))
vi.mock('./Offline/AvisoSairModal', () => ({ default: () => null }))
vi.mock('./Offline/useSair', () => ({ useSair: () => ({ sair: () => {}, saindo: false, aviso: {} }) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })
const marcas = (c) => c.querySelectorAll('[data-marca-dagua]')

describe("marca-d'água", () => {
  it('frase exata e só decoração', () => {
    const { container } = render(<MarcaDagua />)
    const svg = marcas(container)[0]
    expect(svg.textContent).toBe('TOTUS TUUS, MARIA')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('class')).toContain('pointer-events-none')
    expect(svg.getAttribute('class')).toContain('print:hidden')
    expect(svg.getAttribute('class')).toContain('select-none')
    expect(svg.closest('[data-guia]')).toBeNull()
  })
  it.each(['mobile', 'login'])('%s: cor e opacidades por variáveis CSS do tema, símbolo e frase separados, nada no <svg>', (variant) => {
    const { container } = render(<MarcaDagua variant={variant} />)
    const svg = marcas(container)[0]
    expect(svg.getAttribute('class')).toContain('marca-dagua')
    expect(svg.getAttribute('class')).not.toMatch(/opacity|text-texto/)
    expect(svg.querySelector('svg').getAttribute('class')).toBe('marca-dagua-simbolo')
    expect(svg.querySelector('text').getAttribute('class')).toBe('marca-dagua-frase')
  })
  it.each(['mobile', 'login'])('%s: símbolo quadrado 88×88 em (6,2) acima da frase, decorativo', (variant) => {
    const { container } = render(<MarcaDagua variant={variant} />)
    const simbolo = marcas(container)[0].querySelector('svg')
    expect(simbolo.getAttribute('viewBox')).toBe('0 0 400 400')
    expect(simbolo.getAttribute('width')).toBe(simbolo.getAttribute('height'))
    expect([simbolo.getAttribute('x'), simbolo.getAttribute('y'), simbolo.getAttribute('width')]).toEqual(['6', '2', '88'])
    expect(simbolo.getAttribute('aria-hidden')).toBe('true')
    expect(simbolo.getAttribute('pointer-events')).toBe('none')
    expect(simbolo.getAttribute('fill')).toBe('currentColor')
  })
  it.each([['header', true], ['mobile', true], ['login', false]])('variante %s: versão simples = %s', (variant, simples) => {
    const { container } = render(<MarcaDagua variant={variant} />)
    const simbolo = marcas(container)[0].querySelector('svg')
    const circulos = simbolo.querySelectorAll(':scope > circle')
    if (simples) {
      // sem estrelas, um círculo só (r=190, traço 14), faixa sólida (máscara da coroa sem aberturas finas)
      expect(simbolo.querySelectorAll(':scope > path')).toHaveLength(0)
      expect(circulos).toHaveLength(1)
      expect([circulos[0].getAttribute('r'), circulos[0].getAttribute('stroke-width')]).toEqual(['190', '14'])
      expect(simbolo.querySelectorAll('mask')[0].children).toHaveLength(3)
    } else {
      expect(simbolo.querySelectorAll(':scope > path')).toHaveLength(12)
      expect(circulos).toHaveLength(2)
      expect(simbolo.querySelectorAll('mask')[0].children).toHaveLength(8)
    }
    // coroa, cruz, haste e barra iguais nas duas
    expect(simbolo.querySelector('g[mask] path').getAttribute('d')).toMatch(/^M128 250 L116 170/)
    expect(simbolo.querySelectorAll('mask')[1].children).toHaveLength(2)
    expect(simbolo.querySelector(':scope > rect[mask]')).not.toBeNull()
  })
  it('ids das máscaras únicos por instância e referenciados', () => {
    const { container } = render(<><MarcaDagua /><MarcaDagua variant="login" /></>)
    const ids = [...container.querySelectorAll('mask')].map(m => m.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    const refs = [...container.querySelectorAll('[mask]')].map(e => e.getAttribute('mask'))
    expect(refs.sort()).toEqual(ids.map(id => `url(#${id})`).sort())
  })
  it('header: coroa simples de 44px e a frase AO LADO, em texto de 12px, com opacidade própria', () => {
    const { container } = render(<MarcaDagua variant="header" className="hidden @min-[72px]:flex" />)
    const raiz = marcas(container)[0]
    expect(raiz.tagName).toBe('SPAN')
    expect(raiz.getAttribute('class')).toMatch(/\bmarca-dagua\b.*\bitems-center\b.*\bgap-2\b/)
    expect(raiz.getAttribute('class')).toContain('@min-[72px]:flex')
    expect(raiz.querySelectorAll('svg')).toHaveLength(1)
    const [coroa, frase] = raiz.children
    expect(coroa.tagName.toLowerCase()).toBe('svg')
    expect([coroa.getAttribute('width'), coroa.getAttribute('height')]).toEqual(['44', '44'])
    expect(coroa.getAttribute('class')).toContain('marca-dagua-simbolo')
    expect(coroa.querySelectorAll(':scope > circle')).toHaveLength(1)
    expect(frase.tagName).toBe('SPAN')
    expect(frase.textContent).toBe('TOTUS TUUS, MARIA')
    const cls = frase.getAttribute('class')
    expect(cls).toContain('marca-dagua-frase-header')
    expect(cls).not.toMatch(/\bmarca-dagua-frase\s/)
    // sem 280px livres entre chips e Assistente (container = livre − 16px → 264px), some só a frase
    expect(cls).toMatch(/\bhidden @min-\[264px\]:inline\b/)
    expect(cls).toContain('text-[12px]')
    expect(cls).toContain('whitespace-nowrap')
    expect(cls).toMatch(/Georgia/)
    expect(raiz.querySelector('text')).toBeNull()
  })
  it.each([['mobile', 'h-[64px]'], ['login', 'h-[90px]']])('variante %s', (variant, altura) => {
    const { container } = render(<MarcaDagua variant={variant} />)
    const svg = marcas(container)[0]
    expect(svg.getAttribute('data-marca-dagua')).toBe(variant)
    expect(svg.getAttribute('class')).toContain(altura)
    expect(svg.textContent).toBe('TOTUS TUUS, MARIA')
  })
  it.each([
    ['com chips de perfil', [{ id: 'p1', name: 'Perfil Exemplo', type: 'pf', color: '#10b981' }]],
    ['sem chips', []],
  ])('uma única vez no cabeçalho (%s), só no desktop lg+', (_, profiles) => {
    useApp.mockReturnValue({ profiles, activeProfileId: null, setActiveProfileId: () => {} })
    const { container } = render(<Header page="dashboard" onOpenSearch={() => {}} onOpenAssistente={() => {}} />)
    const lista = marcas(container)
    expect(lista).toHaveLength(1)
    expect(lista[0].parentElement.getAttribute('class')).toMatch(/\bhidden lg:flex\b/)
    expect(lista[0].getAttribute('data-marca-dagua')).toBe('header')
    expect(lista[0].getAttribute('class')).toMatch(/\bhidden @min-\[72px\]:flex\b/)
    expect(lista[0].closest('[data-guia]')).toBeNull()
  })
})
