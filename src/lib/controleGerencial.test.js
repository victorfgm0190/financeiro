import { describe, it, expect } from 'vitest'
import {
  controleGerencialAtivo, grupoEhGerencial, grupoComChaveDesligada, travaGerencial, MSG_TRAVA_GERENCIAL,
  impedimentosDesligar, subcontasGerenciais,
} from './controleGerencial'
import { definicaoFerramenta, acaoPorId, validarAcao } from './assistente/acoes'

const GRUPOS = [{ id: 'grp_1', number: 1, name: 'Gerencial' }, { id: 'grp_2', number: 2, name: 'Contas Anuais' }, { id: 'grp_D', number: 'D', name: 'Despesa' }]
const GER = { id: 'ger_itaupers', name: 'Ger. Itaupers', type: 'gerencial', isGerencial: true, active: true }
const CARTAO = { id: 'itaupers', name: 'Itaupers', type: 'credit' }
const CC = { id: 'itau', name: 'Itau', type: 'checking' }
const ACCOUNTS = [CARTAO, CC, GER]
const saldoZero = () => 0

describe('chave do ambiente', () => {
  it('null/ausente = ligado (comportamento de sempre); false = desligado', () => {
    expect(controleGerencialAtivo({})).toBe(true)
    expect(controleGerencialAtivo({ controleGerencial: null })).toBe(true)
    expect(controleGerencialAtivo({ controleGerencial: true })).toBe(true)
    expect(controleGerencialAtivo({ controleGerencial: false })).toBe(false)
  })
  it('grupo gerencial = G ou numerado; D e vazio não', () => {
    expect(grupoEhGerencial('grp_1', GRUPOS)).toBe(true)
    expect(grupoEhGerencial('grp_2', GRUPOS)).toBe(true)
    expect(grupoEhGerencial('grp_D', GRUPOS)).toBe(false)
    expect(grupoEhGerencial(null, GRUPOS)).toBe(false)
  })
})

describe('desligar — bloqueios', () => {
  it('bloqueado por saldo de conta gerencial', () => {
    const r = impedimentosDesligar({ accounts: ACCOUNTS, schedules: [], gerencialGroups: GRUPOS, saldoDe: (c) => (c.id === 'ger_itaupers' ? 57.07 : 1000) })
    expect(r.contas).toEqual([{ conta: GER, saldo: 57.07 }])
    expect(r.agendamentos).toEqual([])
  })
  it('bloqueado por agendamento gerencial pendente (devolução, com grupo G, ou na subconta)', () => {
    const schedules = [
      { id: 'dev', description: 'Devolução Gerencial', tipo: 'gerencial_devolucao', accountId: 'ger_itaupers', toAccountId: 'itau', amount: 57.07, frequency: 'once', startDate: '2026-11-20', registered: [], skipped: [] },
      { id: 'g', description: 'Assinatura G', grupoGerencial: 'grp_1', accountId: 'itaupers', amount: 30, frequency: 'monthly', startDate: '2026-11-05', registered: [], skipped: [], overrides: { '2026-11-05': { amount: 35 } } },
      { id: 'pago', description: 'Devolução paga', tipo: 'gerencial_devolucao', accountId: 'ger_itaupers', amount: 10, frequency: 'once', startDate: '2026-10-20', registered: ['2026-10-20'], skipped: [] },
      { id: 'normal', description: 'Luz', grupoGerencial: 'grp_D', accountId: 'itau', amount: 200, frequency: 'monthly', startDate: '2026-11-10', registered: [], skipped: [] },
    ]
    const r = impedimentosDesligar({ accounts: ACCOUNTS, schedules, gerencialGroups: GRUPOS, saldoDe: saldoZero })
    expect(r.contas).toEqual([])
    expect(r.agendamentos.map(a => [a.agendamento.id, a.vencimento, a.valor])).toEqual([['dev', '2026-11-20', 57.07], ['g', '2026-11-05', 35]])
  })
  it('tudo zerado e nada pendente → pode desligar; subcontas a inativar', () => {
    expect(impedimentosDesligar({ accounts: ACCOUNTS, schedules: [], gerencialGroups: GRUPOS, saldoDe: saldoZero })).toEqual({ contas: [], agendamentos: [] })
    expect(subcontasGerenciais(ACCOUNTS).map(a => a.id)).toEqual(['ger_itaupers'])
  })
})

describe('desligado — pontos de entrada', () => {
  it('item NOVO não ganha grupo (nada para o motor gerar: sem etapa A); edição mantém o gravado', () => {
    expect(grupoComChaveDesligada({ grupoGerencial: 'grp_1' })).toBeNull() // novo (sem id), ex.: Duplicar
    expect(grupoComChaveDesligada(null)).toBeNull()
    expect(grupoComChaveDesligada({ id: 'tx1', grupoGerencial: 'grp_1' })).toBe('grp_1')
  })
  it('trava valor/data/conta só em item gravado com grupo gerencial e chave desligada', () => {
    const tx = { id: 'tx1', grupoGerencial: 'grp_1' }
    expect(travaGerencial(tx, { ativo: false, gerencialGroups: GRUPOS })).toBe(MSG_TRAVA_GERENCIAL)
    expect(travaGerencial(tx, { ativo: true, gerencialGroups: GRUPOS })).toBeNull()
    expect(travaGerencial({ id: 'tx2', grupoGerencial: 'grp_D' }, { ativo: false, gerencialGroups: GRUPOS })).toBeNull()
    expect(travaGerencial({ grupoGerencial: 'grp_1' }, { ativo: false, gerencialGroups: GRUPOS })).toBeNull()
    expect(MSG_TRAVA_GERENCIAL).toBe('Lançamento do controle gerencial. Para alterar valor, data ou conta, ligue o controle gerencial em Configurações.')
  })
  it('ligar de novo: tudo volta (bloco, grupo do formulário, sem trava)', () => {
    expect(controleGerencialAtivo({ controleGerencial: true })).toBe(true)
    expect(travaGerencial({ id: 'tx1', grupoGerencial: 'grp_1' }, { ativo: true, gerencialGroups: GRUPOS })).toBeNull()
  })
})

describe('Assistente com a chave desligada', () => {
  it('abrir_tela sem o destino "gerenciais" e sem mencionar gerencial', () => {
    const def = definicaoFerramenta(acaoPorId('abrir_tela'), null, { gerencial: false })
    expect(def.input_schema.properties.destino.enum).not.toContain('gerenciais')
    expect(def.description).not.toMatch(/gerenc/i)
    expect(definicaoFerramenta(acaoPorId('abrir_tela'), null).input_schema.properties.destino.enum).toContain('gerenciais')
  })
  it('validação: destino "gerenciais" vira Lançamentos quando desligado', () => {
    const ctx = { idx: { contas: new Map() }, gerencialLigado: false }
    expect(validarAcao('abrir_tela', { destino: 'gerenciais' }, ctx).destino).toBe('tela_lancamentos')
    expect(validarAcao('abrir_tela', { destino: 'gerenciais' }, { ...ctx, gerencialLigado: true }).destino).toBe('gerenciais')
  })
})
