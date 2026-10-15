import { describe, it, expect } from 'vitest'
import {
  combinacaoDoEvento, normalizarCombinacao, validarCombinacao, teclasDaCombinacao, teclaDoCode,
} from './combinacao.js'
import { ACOES, CONTEXTOS, mapaEfetivo, acoesEmConflito } from './registry.js'

const ev = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('combinacaoDoEvento — a partir de e.code (funciona no ABNT2)', () => {
  it('letra, dígito e numpad com modificadores na ordem canônica', () => {
    expect(combinacaoDoEvento(ev('KeyN', { altKey: true }))).toBe('Alt+N')
    expect(combinacaoDoEvento(ev('Digit2', { altKey: true }))).toBe('Alt+2')
    expect(combinacaoDoEvento(ev('Numpad2', { altKey: true }))).toBe('Alt+2')
    expect(combinacaoDoEvento(ev('KeyF', { shiftKey: true, altKey: true }))).toBe('Alt+Shift+F')
    expect(combinacaoDoEvento(ev('Enter', { ctrlKey: true }))).toBe('Ctrl+Enter')
    expect(combinacaoDoEvento(ev('NumpadEnter', { ctrlKey: true }))).toBe('Ctrl+Enter')
  })
  it('modificador sozinho ou tecla desconhecida → null', () => {
    expect(combinacaoDoEvento(ev('AltLeft', { altKey: true }))).toBeNull()
    expect(combinacaoDoEvento(ev('ShiftRight', { shiftKey: true }))).toBeNull()
    expect(combinacaoDoEvento(ev(''))).toBeNull()
    expect(teclaDoCode('MediaPlayPause')).toBeNull()
  })
})

describe('normalizarCombinacao', () => {
  it('aceita minúsculas e qualquer ordem de modificadores', () => {
    expect(normalizarCombinacao('alt+n')).toBe('Alt+N')
    expect(normalizarCombinacao('Shift+Ctrl+1')).toBe('Ctrl+Shift+1')
    expect(normalizarCombinacao('control + enter')).toBe('Ctrl+Enter')
    expect(normalizarCombinacao('Alt+Semicolon')).toBe('Alt+Semicolon')
  })
  it('rejeita lixo e modificador repetido', () => {
    expect(normalizarCombinacao('Alt+Alt+N')).toBeNull()
    expect(normalizarCombinacao('Hyper+N')).toBeNull()
    expect(normalizarCombinacao('Alt+NN')).toBeNull()
    expect(normalizarCombinacao('')).toBeNull()
    expect(normalizarCombinacao(null)).toBeNull()
  })
})

describe('validarCombinacao', () => {
  it('bloqueia reservadas do navegador/sistema e a fixa Ctrl+Enter', () => {
    for (const c of ['Ctrl+N', 'Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+N', 'Ctrl+Tab', 'Alt+F4', 'Alt+F', 'Alt+D', 'Alt+E', 'Ctrl+R', 'Ctrl+L', 'Ctrl+Enter']) {
      expect(validarCombinacao(c)).toBeTruthy()
    }
    expect(validarCombinacao('F5')).toMatch(/reservada/)
  })
  it('exige Alt ou Ctrl', () => {
    expect(validarCombinacao('Shift+N')).toMatch(/modificador/)
    expect(validarCombinacao('N')).toMatch(/modificador/)
    expect(validarCombinacao('Alt+N')).toBeNull()
    expect(validarCombinacao('Ctrl+Shift+K')).toBeNull()
  })
})

describe('teclasDaCombinacao', () => {
  it('exibe as teclas separadas, com rótulo ABNT2 na pontuação', () => {
    expect(teclasDaCombinacao('Alt+N')).toEqual(['Alt', 'N'])
    expect(teclasDaCombinacao('Alt+Semicolon')).toEqual(['Alt', 'Ç'])
    expect(teclasDaCombinacao('Shift+?')).toEqual(['Shift', '?'])
    expect(teclasDaCombinacao(null)).toEqual([])
  })
})

describe('registry', () => {
  it('ids únicos, contexto conhecido e padrão válido', () => {
    expect(new Set(ACOES.map(a => a.id)).size).toBe(ACOES.length)
    for (const a of ACOES) {
      expect(CONTEXTOS.some(c => c.id === a.contexto)).toBe(true)
      expect(validarCombinacao(a.padrao)).toBeNull()
      expect(normalizarCombinacao(a.padrao)).toBe(a.padrao)
    }
  })
  it('os padrões não conflitam entre si', () => {
    const mapa = mapaEfetivo()
    for (const a of ACOES) expect(acoesEmConflito(a.id, mapa[a.id], mapa)).toEqual([])
  })
  it('mapaEfetivo: gravado sobrepõe o padrão; null desativa; ausente usa o padrão', () => {
    const mapa = mapaEfetivo({ 'conta.novoLancamento': 'Alt+K', 'nav.envelopes': null })
    expect(mapa['conta.novoLancamento']).toBe('Alt+K')
    expect(mapa['nav.envelopes']).toBeNull()
    expect(mapa['lancamento.gravar']).toBe('Alt+G')
  })
  it('conflito no mesmo contexto ou com global; contextos diferentes convivem', () => {
    const mapa = mapaEfetivo()
    expect(acoesEmConflito('conta.novoLancamento', 'Alt+N', mapa)).toEqual([]) // Alt+N também em Agendamentos
    expect(acoesEmConflito('agend.lancarProvisao', 'Alt+N', mapa).map(a => a.id)).toEqual(['agend.novoAgendamento'])
    expect(acoesEmConflito('lancamento.gravar', 'Alt+Shift+F', mapa).map(a => a.id)).toEqual(['nav.fluxoCaixa'])
    expect(acoesEmConflito('nav.envelopes', 'Alt+G', mapa).map(a => a.id)).toEqual(['lancamento.gravar'])
  })
})
