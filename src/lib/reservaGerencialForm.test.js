import { describe, it, expect } from 'vitest'
import {
  grupoDaContaReserva, contaReservaDoGrupoGerencial, funcaoParaConta, escolherContaReserva,
  desligarReserva, escolherGrupo, grupoTravadoPelaReserva, divergenciaReserva, reservaInicial,
} from './reservaGerencialForm.js'

// Cadastro genérico: grupo 2 → reserva A (várias funções), 3 → reserva B (uma função),
// 4 → conta comum; reserva C sem grupo.
const gerencialGroups = [
  { id: 'gD', number: 'D' }, { id: 'g1', number: 1 },
  { id: 'g2', number: 2, defaultAccountId: 'resA' }, { id: 'g3', number: 3, defaultAccountId: 'resB' },
  { id: 'g4', number: 4, defaultAccountId: 'comum' },
]
const accounts = [
  { id: 'resA', name: 'Reserva A', isReserva: true }, { id: 'resB', name: 'Reserva B', isReserva: true },
  { id: 'resC', name: 'Reserva C', isReserva: true }, { id: 'comum', name: 'Comum', type: 'checking' },
]
const reserveFunctions = [
  { id: 'fA1', name: 'Férias', accountId: 'resA' }, { id: 'fA2', name: 'Fralda', accountId: 'resA' },
  { id: 'fB', name: 'Única B', accountId: 'resB' },
]
const ctx = (o = {}) => ({ cartao: true, gerencialGroups, accounts, reserveFunctions, memo: {}, defaultGrupoId: 'gD', ...o })
const vazio = { useReserva: false, reservaAccountId: '', reservaFuncaoId: '', grupoGerencial: 'gD' }

describe('ligação grupo ↔ conta de reserva pelo cadastro', () => {
  it('conta → grupo numerado; grupo → conta só se for de reserva', () => {
    expect(grupoDaContaReserva('resA', gerencialGroups)).toBe('g2')
    expect(grupoDaContaReserva('resC', gerencialGroups)).toBeNull()
    expect(contaReservaDoGrupoGerencial('g3', ctx())).toBe('resB')
    expect(contaReservaDoGrupoGerencial('g4', ctx())).toBeNull()
    expect(contaReservaDoGrupoGerencial('gD', ctx())).toBeNull()
  })
  it('função ao trocar de conta: a atual, a lembrada, a única, ou vazio', () => {
    expect(funcaoParaConta('fA1', 'resA', ctx())).toBe('fA1')
    expect(funcaoParaConta('fA1', 'resB', ctx())).toBe('fB')
    expect(funcaoParaConta('fB', 'resA', ctx())).toBe('')
    expect(funcaoParaConta('fB', 'resA', ctx({ memo: { resA: 'fA2' } }))).toBe('fA2')
  })
})

describe('cartão: reserva define a classificação', () => {
  it('reserva A → grupo 2 travado, pede a função', () => {
    const f = escolherContaReserva(vazio, 'resA', ctx())
    expect(f).toMatchObject({ useReserva: true, reservaAccountId: 'resA', grupoGerencial: 'g2', reservaFuncaoId: '' })
    expect(grupoTravadoPelaReserva(f, ctx())).toBe('g2')
  })
  it('reserva B → grupo 3 travado e a única função já escolhida', () => {
    const f = escolherContaReserva(vazio, 'resB', ctx())
    expect(f).toMatchObject({ grupoGerencial: 'g3', reservaFuncaoId: 'fB' })
    expect(grupoTravadoPelaReserva(f, ctx())).toBe('g3')
  })
  it('classificação 2 lá embaixo → liga a reserva A e pede só a função', () => {
    expect(escolherGrupo(vazio, 'g2', ctx())).toMatchObject({ useReserva: true, reservaAccountId: 'resA', grupoGerencial: 'g2', reservaFuncaoId: '' })
    expect(escolherGrupo(vazio, 'g3', ctx())).toMatchObject({ reservaAccountId: 'resB', reservaFuncaoId: 'fB' })
  })
  it('classificação 4 (conta comum) → nada muda na reserva', () => {
    expect(escolherGrupo(vazio, 'g4', ctx())).toEqual({ ...vazio, grupoGerencial: 'g4' })
  })
  it('desligar a reserva → classificação volta para D', () => {
    const f = escolherContaReserva(vazio, 'resA', ctx())
    expect(desligarReserva(f, ctx())).toMatchObject({ useReserva: false, reservaAccountId: '', reservaFuncaoId: '', grupoGerencial: 'gD' })
  })
  it('vídeo: reserva → A → Férias → mexer na classificação/reserva não perde a função', () => {
    const memo = {}
    let f = escolherContaReserva(vazio, 'resA', ctx({ memo }))
    f = { ...f, reservaFuncaoId: 'fA1' }
    // a classificação está travada; escolher o mesmo grupo (caminho inverso) mantém tudo
    expect(escolherGrupo(f, 'g2', ctx({ memo }))).toMatchObject({ useReserva: true, reservaAccountId: 'resA', reservaFuncaoId: 'fA1', grupoGerencial: 'g2' })
    // trocar para B e voltar para A devolve Férias (lembrada por conta)
    memo.resA = f.reservaFuncaoId
    const b = escolherContaReserva(f, 'resB', ctx({ memo }))
    expect(b).toMatchObject({ grupoGerencial: 'g3', reservaFuncaoId: 'fB' })
    expect(escolherContaReserva(b, 'resA', ctx({ memo }))).toMatchObject({ grupoGerencial: 'g2', reservaFuncaoId: 'fA1' })
  })
  it('reserva sem grupo: classificação livre (resgate avulso); vinda de reserva com grupo volta a D', () => {
    const c = escolherContaReserva(vazio, 'resC', ctx())
    expect(c).toMatchObject({ reservaAccountId: 'resC', grupoGerencial: 'gD' })
    expect(grupoTravadoPelaReserva(c, ctx())).toBeNull()
    const a = escolherContaReserva(vazio, 'resA', ctx())
    expect(escolherContaReserva(a, 'resC', ctx())).toMatchObject({ grupoGerencial: 'gD' })
  })
  it('conta corrente: a reserva não mexe na classificação', () => {
    expect(escolherContaReserva(vazio, 'resB', ctx({ cartao: false }))).toMatchObject({ grupoGerencial: 'gD', reservaFuncaoId: 'fB' })
  })
})

describe('lançamento existente', () => {
  it('cartão com grupo de reserva abre com a reserva ligada; função única só no novo', () => {
    expect(reservaInicial({ grupoGerencial: 'g3', novo: true }, ctx())).toEqual({ useReserva: true, reservaAccountId: 'resB', reservaFuncaoId: 'fB' })
    expect(reservaInicial({ grupoGerencial: 'g3', novo: false }, ctx())).toEqual({ useReserva: true, reservaAccountId: 'resB', reservaFuncaoId: '' })
    expect(reservaInicial({ grupoGerencial: 'g4', novo: true }, ctx()).useReserva).toBe(false)
    expect(reservaInicial({ grupoGerencial: 'gD', contaVinculada: 'resC' }, ctx({ cartao: false })).reservaAccountId).toBe('resC')
  })
  it('grupo e função divergentes: aviso, sem corrigir ao abrir', () => {
    const ini = reservaInicial({ grupoGerencial: 'g3', reservaFuncaoId: 'fA2' }, ctx())
    const f = { ...ini, grupoGerencial: 'g3' }
    expect(f.reservaFuncaoId).toBe('fA2')
    expect(divergenciaReserva(f, ctx())).toMatch(/Fralda.*Reserva A.*Reserva B/)
    expect(divergenciaReserva(escolherContaReserva(vazio, 'resA', ctx()), ctx())).toBeNull()
  })
  it('reserva com grupo gravada com classificação D: aviso e sem trava', () => {
    const f = { useReserva: true, reservaAccountId: 'resA', reservaFuncaoId: 'fA1', grupoGerencial: 'gD' }
    expect(grupoTravadoPelaReserva(f, ctx())).toBeNull()
    expect(divergenciaReserva(f, ctx())).toMatch(/Reserva A/)
  })
})
