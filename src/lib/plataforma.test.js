import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cpfValido, cnpjValido, candidatasSigla, sugerirSigla, problemaSigla, normalizarSigla, telefoneWhatsApp, formatarDocumento,
  mascararTelefone, normalizarTelefone, problemaTelefone, celularValido, linkWhatsApp, normalizarDocumento, documentoValido,
} from './plataforma'
import { cabecalhoDaPagina } from '../components/Layout/cabecalhoPagina'
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
  it('CNPJ alfanumérico: letras nas 12 primeiras posições, DVs numéricos, valor = ASCII − 48', () => {
    // Exemplo oficial da Receita Federal.
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true)
    expect(cnpjValido('12abc34501de35')).toBe(true)
    expect(cnpjValido('12ABC34501DE36')).toBe(false)
    expect(cnpjValido('12ABC34501DEA5')).toBe(false) // DV com letra
    expect(cnpjValido('AAAAAAAAAAAAAA')).toBe(false)
    expect(normalizarDocumento('PJ', '12.abc.345/01de-35')).toBe('12ABC34501DE35')
    expect(normalizarDocumento('PF', '529.982.247-25')).toBe('52998224725')
    expect(documentoValido('PF', '12ABC34501DE35')).toBe(false)
    expect(formatarDocumento('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
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

describe('telefone', () => {
  it('máscara (43) 99999-9999 enquanto digita', () => {
    expect(mascararTelefone('4')).toBe('(4')
    expect(mascararTelefone('43')).toBe('(43')
    expect(mascararTelefone('43999')).toBe('(43) 999')
    expect(mascararTelefone('439999988')).toBe('(43) 9999-988')
    expect(mascararTelefone('43999998888')).toBe('(43) 99999-8888')
    expect(mascararTelefone('4333221100')).toBe('(43) 3322-1100')
    expect(mascararTelefone('(43) 99999-88889')).toBe('(43) 99999-8888')
    expect(mascararTelefone('')).toBe('')
  })
  it('guarda só dígitos, sem o 55', () => {
    expect(normalizarTelefone('(43) 99999-8888')).toBe('43999998888')
    expect(normalizarTelefone('+55 43 99999-8888')).toBe('43999998888')
  })
  it('celular = 11 dígitos começando com 9; fixo só com "não é WhatsApp"', () => {
    expect(celularValido('43999998888')).toBe(true)
    expect(celularValido('43899998888')).toBe(false)
    expect(problemaTelefone('43999998888')).toBeNull()
    expect(problemaTelefone('4333221100')).toMatch(/não é WhatsApp/)
    expect(problemaTelefone('4333221100', { naoWhatsApp: true })).toBeNull()
    expect(problemaTelefone('43899998888')).toMatch(/inválido/)
    expect(problemaTelefone('4399999')).toMatch(/inválido/)
  })
  it('WhatsApp: wa.me/55<dígitos> só para celular; fixo → botão desabilitado (null)', () => {
    expect(linkWhatsApp('43999998888', 'Olá!')).toBe('https://wa.me/5543999998888?text=Ol%C3%A1!')
    expect(linkWhatsApp('4333221100', 'Olá!')).toBeNull()
    expect(linkWhatsApp(null)).toBeNull()
  })
})

describe('cabeçalho', () => {
  it('Clientes Finup sem seletor de perfil e sem período; outras telas mantêm', () => {
    expect(cabecalhoDaPagina('clientes')).toEqual({ perfis: false, periodo: false })
    expect(cabecalhoDaPagina('dashboard')).toEqual({ perfis: true, periodo: true })
    expect(cabecalhoDaPagina('schedule')).toEqual({ perfis: true, periodo: false })
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
