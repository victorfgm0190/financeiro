// /api/boas-vindas: gravação só dos campos pedidos (tour visto não volta a ficar vazio). Sem banco.
import { describe, it, expect } from 'vitest'
import { DDL_BOAS_VINDAS, gravarBoasVindas } from './boas-vindas.js'

const fakeQ = () => {
  const chamadas = []
  const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ tour_visto_em: 't', checklist_oculto_em: null }] }
  return { q, chamadas }
}

describe('/api/boas-vindas', () => {
  it('tabela por usuário (user_id TEXT, sem FK — login de emergência não tem linha em usuarios)', () => {
    expect(DDL_BOAS_VINDAS).toMatch(/CREATE TABLE IF NOT EXISTS boas_vindas_usuario/)
    expect(DDL_BOAS_VINDAS).toMatch(/user_id TEXT PRIMARY KEY/)
    expect(DDL_BOAS_VINDAS).not.toMatch(/REFERENCES/)
  })
  it('tour visto: upsert que preserva a primeira data', async () => {
    const { q, chamadas } = fakeQ()
    expect(await gravarBoasVindas(q, 'u1', { tourVisto: true })).toEqual({ tourVistoEm: 't', checklistOcultoEm: null, guiasLigados: true })
    expect(chamadas[0].sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE SET tour_visto_em = COALESCE\(boas_vindas_usuario.tour_visto_em, now\(\)\)/)
    expect(chamadas[0].sql).not.toMatch(/checklist_oculto_em = /)
    expect(chamadas[0].params).toEqual(['u1'])
  })
  it('ocultar checklist mexe só nele; nada pedido → null (400)', async () => {
    const { q, chamadas } = fakeQ()
    await gravarBoasVindas(q, 'u1', { checklistOculto: true })
    expect(chamadas[0].sql).toMatch(/SET checklist_oculto_em = now\(\)/)
    expect(chamadas[0].sql).not.toMatch(/SET tour_visto_em/)
    expect(await gravarBoasVindas(q, 'u1', {})).toBeNull()
  })
})
