import { describe, it, expect } from 'vitest'
import {
  abas, acoes, secoesMais, resolverCards, prefDosCards, moduloDaPagina,
  moduloMobile, moduloAposNavegar, paginasSoDesktop, secoesConfigSoDesktop,
} from './navegacao'
import { mobileModules } from './modules'

const M = [
  { id: 'a', place: 'tab' }, { id: 'b', place: 'tab', card: true }, { id: 'c', place: 'tab' },
  { id: 'd', place: 'tab' }, { id: 'e', place: 'tab' },
  { id: 'r', place: 'more', group: 'G1', card: true, page: 'reservas' },
  { id: 'x', place: 'more', group: 'G2' }, { id: 'y', place: 'more', group: 'G1', card: true },
  { id: 'p1', place: 'action', primary: true }, { id: 'p2', place: 'action' },
  { id: 'inicio', place: 'more' },
  { id: 'dk', place: 'desktop', page: 'import', configSecoes: ['controle-gerencial'] }, { id: 'cfg', place: 'config', page: 'settings' },
]

describe('navegação mobile', () => {
  it('barra inferior: no máximo 4 abas, na ordem do registro', () => {
    expect(abas(M).map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ações do "+": primárias e lista', () => {
    const r = acoes(M)
    expect(r.primarias.map(m => m.id)).toEqual(['p1'])
    expect(r.outras.map(m => m.id)).toEqual(['p2'])
  })

  it('"Mais": grupos na ordem e configurações; módulos só do computador não aparecem', () => {
    expect(secoesMais(M).map(s => [s.titulo, s.itens.map(i => i.id)])).toEqual([
      ['G1', ['r', 'y']], ['G2', ['x']], ['Outros', ['inicio']], ['Configurações', ['cfg']],
    ])
  })

  it('cards: sem preferência → todos ligados na ordem do registro', () => {
    expect(prefDosCards(resolverCards(M, null))).toEqual([
      { id: 'b', on: true }, { id: 'r', on: true }, { id: 'y', on: true },
    ])
  })

  it('cards: preferência manda na ordem e no liga/desliga; card novo entra ligado no fim', () => {
    const pref = [{ id: 'y', on: false }, { id: 'zz', on: true }, { id: 'b', on: true }]
    expect(prefDosCards(resolverCards(M, pref))).toEqual([
      { id: 'y', on: false }, { id: 'b', on: true }, { id: 'r', on: true },
    ])
  })

  it('módulo pela página do desktop (módulo só do computador não conta)', () => {
    expect(moduloDaPagina(M, 'reservas').id).toBe('r')
    expect(moduloDaPagina(M, 'nada')).toBeNull()
    expect(moduloDaPagina(M, 'import')).toBeNull()
  })

  it('redireciona para o Início ao cair num módulo só do computador ou inexistente', () => {
    expect(moduloMobile(M, 'dk')).toBe('inicio')
    expect(moduloMobile(M, 'sumiu')).toBe('inicio')
    expect(moduloMobile(M, 'r')).toBe('r')
  })

  it('navigate para página só do computador → Início; página com módulo → ele; outra → fica', () => {
    expect(moduloAposNavegar(M, 'import', 'r')).toBe('inicio')
    expect(moduloAposNavegar(M, 'settings', 'r')).toBe('cfg')
    expect(moduloAposNavegar(M, 'pagina-sem-modulo', 'r')).toBe('r')
    expect(moduloAposNavegar(M, 'pagina-sem-modulo', 'dk')).toBe('inicio')
  })

  it('registro real: Importar, Conciliação e Grupos gerenciais fora do mobile', () => {
    expect(paginasSoDesktop(mobileModules).has('import')).toBe(true)
    expect([...secoesConfigSoDesktop(mobileModules)].sort()).toEqual(['controle-gerencial', 'grupo-gerencial'])
    expect(moduloAposNavegar(mobileModules, 'import', 'fluxo')).toBe('inicio')
    const ids = secoesMais(mobileModules).flatMap(s => s.itens.map(i => i.id))
    expect(ids).not.toContain('importar')
    expect(ids).not.toContain('conciliacao')
    expect(ids).not.toContain('gerenciais')
  })
})
