// /api/boas-vindas: gravação só dos campos pedidos (tour visto não volta a ficar vazio). Sem banco.
import { describe, it, expect } from 'vitest'
import { DDL_BOAS_VINDAS, DDL_AJUDA_CAMPOS, DDL_JORNADA, gravarBoasVindas, gravarAjudaCampos, gravarJornadaLigada, refazerJornada, gravarEtapa, gravarPreferenciaJornada, gravarPeriodoFluxo, gravarOfertaGuia } from './boas-vindas.js'
import { ETAPAS_JORNADA } from '../src/lib/onboardingSteps.js'

const fakeQ = () => {
  const chamadas = []
  const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ tour_visto_em: 't', checklist_oculto_em: null }] }
  return { q, chamadas }
}

describe('/api/boas-vindas', () => {
  it('oferta do Preenchimento Guiado: resposta por formulário em progresso; "nunca" desliga todas; inválido → null', async () => {
    const { q, chamadas } = fakeQ()
    expect(await gravarOfertaGuia(q, 'u1', { form: 'agendamento', resposta: 'nao' })).not.toBeNull()
    expect(chamadas[0].sql).toContain("'{guiaOfertas}'")
    expect(chamadas[0].params).toEqual(['u1', 'agendamento', 'nao', '{}'])
    await gravarOfertaGuia(q, 'u1', { form: 'contrato', resposta: 'nunca' })
    expect(chamadas[1].params[3]).toBe('{"guiaOfertaDesligada":true}')
    expect(await gravarOfertaGuia(q, 'u1', { form: 'x; drop', resposta: 'sim' })).toBeNull()
    expect(await gravarOfertaGuia(q, 'u1', { form: 'agendamento', resposta: 'talvez' })).toBeNull()
    expect(chamadas).toHaveLength(2)
  })
  it('tabela por usuário (user_id TEXT, sem FK — login de emergência não tem linha em usuarios)', () => {
    expect(DDL_BOAS_VINDAS).toMatch(/CREATE TABLE IF NOT EXISTS boas_vindas_usuario/)
    expect(DDL_BOAS_VINDAS).toMatch(/user_id TEXT PRIMARY KEY/)
    expect(DDL_BOAS_VINDAS).not.toMatch(/REFERENCES/)
  })
  it('tour visto: upsert que preserva a primeira data', async () => {
    const { q, chamadas } = fakeQ()
    expect(await gravarBoasVindas(q, 'u1', { tourVisto: true })).toEqual({ tourVistoEm: 't', checklistOcultoEm: null, guiasLigados: true, ajudaCampos: true, jornadaLigada: true, progresso: {} })
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

  it('ícones de ajuda nos campos: coluna por usuário, ligada por padrão; gravar só mexe nela', async () => {
    expect(DDL_AJUDA_CAMPOS).toMatch(/ADD COLUMN IF NOT EXISTS ajuda_campos BOOLEAN NOT NULL DEFAULT true/)
    const chamadas = []
    const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ ajuda_campos: false }] }
    expect((await gravarAjudaCampos(q, 'u1', false)).ajudaCampos).toBe(false)
    expect(chamadas[0].sql).toMatch(/SET ajuda_campos = EXCLUDED.ajuda_campos/)
    expect(chamadas[0].sql).not.toMatch(/guias_ligados = /)
    expect(chamadas[0].params).toEqual(['u1', false])
  })

  it('jornada: coluna por usuário (ligada por padrão); liga/desliga só mexe nela', async () => {
    expect(DDL_JORNADA).toMatch(/ADD COLUMN IF NOT EXISTS jornada_ligada BOOLEAN NOT NULL DEFAULT true/)
    const chamadas = []
    const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ jornada_ligada: false }] }
    expect((await gravarJornadaLigada(q, 'u1', false)).jornadaLigada).toBe(false)
    expect(chamadas[0].sql).toMatch(/SET jornada_ligada = EXCLUDED.jornada_ligada/)
    expect(chamadas[0].sql).not.toMatch(/guias_ligados = |ajuda_campos = /)
  })
  it('jornada: etapas dela são aceitas; "Refazer" tira só as etapas da jornada e volta a mostrar o painel', async () => {
    const chamadas = []
    const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ progresso: {} }] }
    expect(await gravarEtapa(q, 'u1', 'j-painel', 'feita')).not.toBeNull()
    expect(await gravarEtapa(q, 'u1', 'nao-existe', 'feita')).toBeNull()
    await refazerJornada(q, 'u1')
    const ultima = chamadas.at(-1)
    expect(ultima.sql).toContain("- $2::text[]")
    expect(ultima.sql).toContain('checklist_oculto_em = NULL')
    expect(ultima.params).toEqual(['u1', ETAPAS_JORNADA])
  })

  it('jornada: painel expandido e objetivo ficam em progresso; objetivo desconhecido é recusado; refazer limpa o objetivo', async () => {
    const chamadas = []
    const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ progresso: { jornadaExpandida: true } }] }
    expect((await gravarPreferenciaJornada(q, 'u1', { expandida: true })).progresso.jornadaExpandida).toBe(true)
    expect(JSON.parse(chamadas[0].params[1])).toEqual({ jornadaExpandida: true })
    expect(chamadas[0].sql).toContain("|| $2::jsonb")
    await gravarPreferenciaJornada(q, 'u1', { objetivo: 'contrato' })
    expect(JSON.parse(chamadas[1].params[1])).toEqual({ objetivo: 'contrato' })
    await gravarPreferenciaJornada(q, 'u1', { objetivo: null })
    expect(JSON.parse(chamadas[2].params[1])).toEqual({ objetivo: null })
    expect(await gravarPreferenciaJornada(q, 'u1', { objetivo: 'nao-existe' })).toBeNull()
    expect(await gravarPreferenciaJornada(q, 'u1', {})).toBeNull()
    await refazerJornada(q, 'u1')
    expect(chamadas.at(-1).sql).toContain("- 'objetivo'")
  })

  it('período do Fluxo Futuro: guardado relativo em progresso.fluxoPeriodo; null tira a chave; inválido → 400', async () => {
    const chamadas = []
    const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ progresso: {} }] }
    expect(await gravarPeriodoFluxo(q, 'u1', { de: 0, meses: 24 })).not.toBeNull()
    expect(chamadas[0].sql).toContain("|| jsonb_build_object('fluxoPeriodo', $2::jsonb)")
    expect(chamadas[0].params).toEqual(['u1', JSON.stringify({ de: 0, meses: 24 })])
    expect(await gravarPeriodoFluxo(q, 'u1', null)).not.toBeNull()
    expect(chamadas[1].sql).toContain("- 'fluxoPeriodo'")
    expect(chamadas[1].params).toEqual(['u1'])
    expect(await gravarPeriodoFluxo(q, 'u1', { de: 0, meses: 999 })).toBeNull()
    expect(await gravarPeriodoFluxo(q, 'u1', 'x')).toBeNull()
    expect(chamadas).toHaveLength(2)
  })
})
