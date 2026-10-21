import { describe, it, expect } from 'vitest'
import {
  pode, podeGravar, permissoesDoNivel, normalizarPermissoes, regraDaRota, atendeRegra, podeVerPagina,
  podeVerModuloMobile, MODULOS, MODULO_DA_TABELA, podeGravarConfiguracoes,
} from './permissoes'

const U = (nivel, permissoes = {}) => ({ nivel, permissoes })

describe('níveis', () => {
  it('admin pode tudo', () => {
    for (const m of MODULOS) for (const a of ['ver', 'incluir', 'editar', 'excluir']) expect(pode({ ...U('admin'), modulos: { contratos: true } }, m.id, a)).toBe(true)
  })
  it('operador: tudo, menos Usuários e Configurações; Cadastros só ver', () => {
    const op = U('operador')
    expect(pode(op, 'lancamentos', 'excluir')).toBe(true)
    expect(pode(op, 'usuarios', 'ver')).toBe(false)
    expect(pode(op, 'configuracoes', 'ver')).toBe(false)
    expect(pode(op, 'cadastros', 'ver')).toBe(true)
    expect(pode(op, 'cadastros', 'incluir')).toBe(false)
  })
  it('consulta: só ver, sem Usuários/Configurações/Cadastros', () => {
    const c = U('consulta')
    expect(pode(c, 'agendamentos', 'ver')).toBe(true)
    expect(podeGravar(c, 'agendamentos')).toBe(false)
    expect(pode(c, '*', 'editar')).toBe(false)
    for (const m of ['usuarios', 'configuracoes', 'cadastros']) expect(pode(c, m, 'ver')).toBe(false)
  })
  it('personalizado: JSON; incluir/editar/excluir implicam ver; Painel sempre visível', () => {
    const p = U('personalizado', { fluxo: { incluir: true }, contas: { ver: false, excluir: true } })
    expect(pode(p, 'fluxo', 'ver')).toBe(true)
    expect(pode(p, 'fluxo', 'editar')).toBe(false)
    expect(pode(p, 'contas', 'ver')).toBe(true)
    expect(pode(p, 'painel', 'ver')).toBe(true)
    expect(pode(p, 'reservas', 'ver')).toBe(false)
    expect(normalizarPermissoes({ x: { ver: true } })).not.toHaveProperty('x')
  })
  it('sem usuário/nivel: nada', () => {
    expect(pode(null, 'painel', 'ver')).toBe(false)
    expect(permissoesDoNivel('xx').painel.ver).toBe(false)
  })
})

describe('rotas e tabelas', () => {
  it('leituras e preferências pessoais são livres; gravações têm módulo/ação', () => {
    for (const [r, m] of [['/api/load', 'GET'], ['/api/search', 'POST'], ['/api/transaction-history', 'POST'], ['/api/atalhos', 'PUT'], ['/api/fatura-conferencia', 'POST']]) {
      expect(regraDaRota(r, m)).toBeNull()
    }
    expect(regraDaRota('/api/reserve-periods', 'DELETE')).toEqual({ modulo: 'reservas', acao: 'excluir' })
    expect(regraDaRota('/api/fluxo-consultas?id=1', 'PUT')).toEqual({ modulo: 'fluxo', acao: 'editar' })
    expect(regraDaRota('/api/bem/abc/estornar-entrada', 'POST')).toEqual({ modulo: 'patrimonio', acao: 'excluir' })
    expect(regraDaRota('/api/financiamento/criar', 'POST')).toEqual({ modulo: 'patrimonio', acao: 'incluir' })
    expect(regraDaRota('/api/financiamento/parcela/x/pagar', 'POST')).toEqual({ modulo: 'patrimonio', acao: 'editar' })
    expect(regraDaRota('/api/rota-desconhecida', 'POST')).toEqual({ modulo: '*', acao: 'editar' })
    expect(atendeRegra(U('consulta'), regraDaRota('/api/rota-desconhecida', 'POST'))).toBe(false)
  })
  it('toda tabela do sync tem módulo; configurações: operador grava, consulta não', () => {
    for (const t of ['contas', 'lancamentos', 'agendamentos', 'categorias', 'orcamento', 'envelopes', 'perfis', 'card_imports', 'reserve_functions', 'favorecido_alias', 'reservas', 'reservas_funcoes', 'grupos_conta', 'gerencial_rules', 'regras_classificacao']) {
      expect(MODULO_DA_TABELA[t]).toBeTruthy()
    }
    expect(podeGravarConfiguracoes(U('operador'))).toBe(true)
    expect(podeGravarConfiguracoes(U('consulta'))).toBe(false)
  })
})

describe('navegação', () => {
  it('páginas e Configurações por permissão', () => {
    // Configurações abre para todos (Consulta vê só Dados › Dados deste aparelho).
    expect(podeVerPagina(U('consulta'), 'settings')).toBe(true)
    expect(podeVerPagina(null, 'settings')).toBe(false)
    expect(podeVerPagina(U('operador'), 'settings')).toBe(true)
    expect(podeVerPagina(U('personalizado', { reservas: { ver: true } }), 'reservas')).toBe(true)
    expect(podeVerPagina(U('personalizado'), 'budget')).toBe(false)
  })
  it('mobile: ações do "+" exigem incluir; telas pela página', () => {
    expect(podeVerModuloMobile(U('consulta'), { id: 'lancamento' })).toBe(false)
    expect(podeVerModuloMobile(U('operador'), { id: 'lancamento' })).toBe(true)
    expect(podeVerModuloMobile(U('consulta'), { id: 'inicio' })).toBe(true)
    expect(podeVerModuloMobile(U('consulta'), { id: 'configuracoes', page: 'settings' })).toBe(true)
  })
})
