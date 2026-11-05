// @vitest-environment jsdom
// Resposta de gravação com viradaRecalculoPendente → evento para a tela avisar (nunca sucesso calado).
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('./api.js', async (orig) => ({ ...(await orig()), gravacaoPermitida: () => true, exigirConexao: () => {}, authHeaders: () => ({}) }))
const db = await import('./db.js')

afterEach(() => { vi.unstubAllGlobals() })

describe('aviso de recálculo pendente', () => {
  it('dispara o evento quando a API responde viradaRecalculoPendente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, written: { upserted: 1 }, viradaRecalculoPendente: true }), { status: 200 })))
    const ouvinte = vi.fn()
    window.addEventListener(db.EVENTO_RECALCULO_PENDENTE, ouvinte)
    await db.postSync({ type: 'section', table: 'lancamentos', upsert: [], delete: [] })
    expect(ouvinte).toHaveBeenCalledTimes(1)
    await db.createReserveAdjustment({ id: 'a' })
    expect(ouvinte).toHaveBeenCalledTimes(2)
    window.removeEventListener(db.EVENTO_RECALCULO_PENDENTE, ouvinte)
  })

  it('resposta normal não dispara', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    const ouvinte = vi.fn()
    window.addEventListener(db.EVENTO_RECALCULO_PENDENTE, ouvinte)
    await db.postSync({ type: 'section', table: 'lancamentos', upsert: [], delete: [] })
    expect(ouvinte).not.toHaveBeenCalled()
    window.removeEventListener(db.EVENTO_RECALCULO_PENDENTE, ouvinte)
  })
})
