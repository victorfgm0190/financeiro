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
const marcas = (c) => c.querySelectorAll('svg[data-marca-dagua]')

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
  it('cor e opacidades por variáveis CSS do tema: símbolo e frase separados, nada no <svg>', () => {
    const { container } = render(<MarcaDagua />)
    const svg = marcas(container)[0]
    expect(svg.getAttribute('class')).toContain('marca-dagua')
    expect(svg.getAttribute('class')).not.toMatch(/opacity|text-texto/)
    expect(svg.querySelector('svg').getAttribute('class')).toBe('marca-dagua-simbolo')
    expect(svg.querySelector('text').getAttribute('class')).toBe('marca-dagua-frase')
  })
  it('símbolo quadrado no lugar do anterior (88×88 em 6,2), decorativo', () => {
    const { container } = render(<MarcaDagua />)
    const simbolo = marcas(container)[0].querySelector('svg')
    expect(simbolo.getAttribute('viewBox')).toBe('0 0 400 400')
    expect(simbolo.getAttribute('width')).toBe(simbolo.getAttribute('height'))
    expect([simbolo.getAttribute('x'), simbolo.getAttribute('y'), simbolo.getAttribute('width')]).toEqual(['6', '2', '88'])
    expect(simbolo.getAttribute('aria-hidden')).toBe('true')
    expect(simbolo.getAttribute('pointer-events')).toBe('none')
    expect(simbolo.getAttribute('fill')).toBe('currentColor')
  })
  it('ids das máscaras únicos por instância e referenciados', () => {
    const { container } = render(<><MarcaDagua /><MarcaDagua variant="login" /></>)
    const ids = [...container.querySelectorAll('mask')].map(m => m.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    const refs = [...container.querySelectorAll('[mask]')].map(e => e.getAttribute('mask'))
    expect(refs.sort()).toEqual(ids.map(id => `url(#${id})`).sort())
  })
  it.each([['header', 'h-[52px]'], ['mobile', 'h-[64px]'], ['login', 'h-[90px]']])('variante %s', (variant, altura) => {
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
    expect(lista[0].closest('[data-guia]')).toBeNull()
  })
})
