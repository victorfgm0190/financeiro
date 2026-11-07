import { describe, it, expect } from 'vitest'
import { totaisFluxoFuturo, funcoesDoFluxoNoPerfil } from './fluxoReservaTotais.js'

describe('funcoesDoFluxoNoPerfil', () => {
  const perfis = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
  const contas = [
    { id: 'ra', profileId: 'p1' }, { id: 'rb', profileId: 'p2' },
    { id: 'rs', profileId: null }, { id: 'rx', profileId: 'perfil-apagado' },
  ]
  const funcoes = [
    { id: 'a', accountId: 'ra' }, { id: 'b', accountId: 'rb' },
    { id: 's', accountId: 'rs' }, { id: 'x', accountId: 'rx' },
  ]
  const ids = (r) => r.funcoes.map(f => f.id)

  it('"Tudo" mostra todas; perfil mostra as dele mais as Sem vínculo', () => {
    expect(ids(funcoesDoFluxoNoPerfil(funcoes, contas, perfis, null))).toEqual(['a', 'b', 's', 'x'])
    expect(ids(funcoesDoFluxoNoPerfil(funcoes, contas, perfis, 'p1'))).toEqual(['a', 's', 'x'])
    expect(ids(funcoesDoFluxoNoPerfil(funcoes, contas, perfis, 'p2'))).toEqual(['b', 's', 'x'])
    expect(ids(funcoesDoFluxoNoPerfil(funcoes, contas, perfis, 'p3'))).toEqual(['s', 'x'])
  })

  it('marca como Sem vínculo a conta sem perfil ou com perfil inexistente', () => {
    expect([...funcoesDoFluxoNoPerfil(funcoes, contas, perfis, 'p1').semVinculo]).toEqual(['s', 'x'])
  })
})

const mes = (dep, res, prov, saldo) => ({ dep, res, prov, saldo })
const saldos = { a: 1000.1, b: -300.2, c: 0 }
const projections = [
  { f: { id: 'a' }, monthly: [mes(0, 0, 0, 1000.1), mes(100.1, 50, 10, 1040.2)] },
  { f: { id: 'b' }, monthly: [mes(0, 0, 0, -300.2), mes(0.2, 0, 0, -300)] },
  { f: { id: 'c' }, monthly: [mes(0, 0, 0, 0), mes(0, 0, 0, 0)] },
]
const investidoDe = (f) => saldos[f.id] || 0

describe('totaisFluxoFuturo', () => {
  it('soma com sinal, sem erro de ponto flutuante', () => {
    const t = totaisFluxoFuturo(projections, investidoDe)
    expect(t.investido).toBe(699.9)
    expect(t.monthly[0]).toEqual({ dep: 0, res: 0, prov: 0, saldo: 699.9 })
    expect(t.monthly[1]).toEqual({ dep: 100.3, res: 50, prov: 10, saldo: 740.2 })
  })

  it('soma só as linhas recebidas: mudou o filtro, muda o total', () => {
    const t = totaisFluxoFuturo(projections.slice(0, 1), investidoDe)
    expect(t.investido).toBe(1000.1)
    expect(t.monthly[1].saldo).toBe(1040.2)
  })

  it('soma que se anula vira zero exato (a tela mostra "—")', () => {
    const t = totaisFluxoFuturo([
      { f: { id: 'x' }, monthly: [mes(0, 0, 0, 0.1)] },
      { f: { id: 'y' }, monthly: [mes(0, 0, 0, -0.1)] },
    ], () => 0)
    expect(Object.is(t.monthly[0].saldo, 0)).toBe(true)
  })

  it('acompanha qualquer quantidade de meses; sem linhas, sem meses', () => {
    const umMes = [{ f: { id: 'a' }, monthly: Array.from({ length: 24 }, () => mes(1, 0, 0, 1)) }]
    expect(totaisFluxoFuturo(umMes, investidoDe).monthly).toHaveLength(24)
    expect(totaisFluxoFuturo([], investidoDe)).toEqual({ investido: 0, monthly: [] })
  })
})
