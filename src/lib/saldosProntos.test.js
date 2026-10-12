import { describe, it, expect } from 'vitest'
import { estadoSaldos, LIMITE_MS } from './saldosProntos'

describe('estadoSaldos', () => {
  it('connecting dentro do limite → carregando (sem valor parcial)', () => {
    expect(estadoSaldos('connecting', 0)).toBe('carregando')
    expect(estadoSaldos('connecting', LIMITE_MS - 1)).toBe('carregando')
  })
  it('connected → pronto, mesmo depois do limite', () => {
    expect(estadoSaldos('connected', 0)).toBe('pronto')
    expect(estadoSaldos('connected', LIMITE_MS * 10)).toBe('pronto')
  })
  it('falha (local) ou demora além do limite → desatualizado', () => {
    expect(estadoSaldos('local', 0)).toBe('desatualizado')
    expect(estadoSaldos('connecting', LIMITE_MS)).toBe('desatualizado')
  })
})
