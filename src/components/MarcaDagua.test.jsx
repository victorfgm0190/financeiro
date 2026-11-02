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
const marcas = (c) => c.querySelectorAll('svg[viewBox="-10 0 120 118"]')

describe("marca-d'água", () => {
  it('frase exata e só decoração', () => {
    const { container } = render(<MarcaDagua />)
    const svg = marcas(container)[0]
    expect(svg.textContent).toBe('TOTUS TUUS, MARIA')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('class')).toContain('pointer-events-none')
    expect(svg.getAttribute('class')).toContain('print:hidden')
    expect(svg.closest('[data-guia]')).toBeNull()
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
