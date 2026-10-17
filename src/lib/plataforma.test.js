import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cpfValido, cnpjValido, candidatasSigla, sugerirSigla, problemaSigla, normalizarSigla, telefoneWhatsApp, formatarDocumento,
} from './plataforma'
import { resumoClientes } from './clientesApi'
import { mobileModules } from '../mobile/modules'

describe('CPF / CNPJ', () => {
  it('confere os dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('000.000.000-00')).toBe(false)
    expect(cpfValido('1234')).toBe(false)
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000180')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81')
  })
})

describe('sigla', () => {
  it('iniciais ignorando de/da/do/dos/das, sem acento, minúscula', () => {
    expect(candidatasSigla('Victor Fernandes dos Santos Moreira')[0]).toBe('vfsm')
    expect(candidatasSigla('José da Ávila')[0]).toBe('ja')
    expect(normalizarSigla('Ação-01 X')).toBe('acao01x')
  })
  it('alternativas: letras do último sobrenome, depois número', () => {
    expect(sugerirSigla('Maria da Silva Souza', ['mss'])).toBe('msso')
    expect(sugerirSigla('Ana Lima', ['al', 'ali', 'alim', 'alima'])).toBe('al2')
    // Nome de uma palavra: a inicial sozinha não serve (mínimo 2).
    expect(candidatasSigla('Victor').slice(0, 2)).toEqual(['vi', 'vic'])
  })
  it('regras de formato e reservadas', () => {
    expect(problemaSigla('a')).toMatch(/2 a 20/)
    expect(problemaSigla('a'.repeat(21))).toMatch(/2 a 20/)
    expect(problemaSigla('Abc')).toMatch(/minúsculas/)
    for (const r of ['www', 'app', 'api', 'admin', 'mail', 'suporte', 'login', 'finup']) expect(problemaSigla(r)).toMatch(/reservada/)
    expect(problemaSigla('ok1')).toBeNull()
    expect(candidatasSigla('Ana Pereira Pinto')).not.toContain('app')
  })
  it('telefone para o wa.me ganha o 55', () => {
    expect(telefoneWhatsApp('(11) 91234-5678')).toBe('5511912345678')
    expect(telefoneWhatsApp('5511912345678')).toBe('5511912345678')
  })
})

describe('menu Clientes Finup', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('403 da API (admin comum) → menu escondido; 200 → visível com contador', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'tok' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'x' }) })))
    expect(await resumoClientes()).toEqual({ admin: false, novos: 0 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ novos: 2 }) })))
    expect(await resumoClientes()).toEqual({ admin: true, novos: 2 })
  })
  it('o módulo mobile é marcado como da plataforma (não depende de nível de acesso)', () => {
    expect(mobileModules.find(m => m.id === 'clientes')).toMatchObject({ page: 'clientes', plataforma: true })
  })
})
