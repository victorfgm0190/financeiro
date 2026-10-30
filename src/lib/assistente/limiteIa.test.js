import { describe, it, expect } from 'vitest'
import { limitesDoAmbiente, validarLimites, bloqueioDoLimite, LIMITE_IA_PADRAO } from './limiteIa.js'

describe('limite diário do assistente', () => {
  it('padrão 100 por dia / 30 com imagem quando o cliente não configurou (ou o central não migrou)', () => {
    expect(LIMITE_IA_PADRAO).toEqual({ diario: 100, imagem: 30 })
    expect(limitesDoAmbiente(null)).toEqual({ diario: 100, imagem: 30 })
    expect(limitesDoAmbiente({ ia_limite_diario: 50, ia_limite_imagem: 10 })).toEqual({ diario: 50, imagem: 10 })
  })
  it('bloqueia no limite diário; foto bloqueia só pedido com imagem', () => {
    const lim = { diario: 100, imagem: 30 }
    expect(bloqueioDoLimite({ total: 99, imagem: 0 }, lim, false)).toBeNull()
    expect(bloqueioDoLimite({ total: 100, imagem: 0 }, lim, false)).toMatch(/Limite diário do assistente/)
    expect(bloqueioDoLimite({ total: 40, imagem: 30 }, lim, true)).toMatch(/com foto/)
    expect(bloqueioDoLimite({ total: 40, imagem: 30 }, lim, false)).toBeNull()
    expect(bloqueioDoLimite(null, lim, true)).toBeNull()
  })
  it('validação da edição no Controle de Clientes', () => {
    expect(validarLimites({ diario: '200', imagem: '50' })).toEqual({ diario: 200, imagem: 50 })
    expect(validarLimites({ diario: 10, imagem: 20 }).erro).toMatch(/não pode passar/)
    expect(validarLimites({ diario: -1, imagem: 0 }).erro).toBeTruthy()
    expect(validarLimites({ diario: 1.5, imagem: 0 }).erro).toBeTruthy()
  })
})
