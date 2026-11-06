import { describe, it, expect, beforeEach } from 'vitest'
import { bancoDoArquivo } from './_testes/bancoTeste.js'
import { upsertApelidos } from './ia-apelidos.js'
import { normalizarTermo } from './_ia.js'
import { sugerirAcaoDespesa, ACAO } from '../src/lib/assistente/prontidao.js'
import {
  termosPreferencia, preferenciaDe, aplicarPreferencias, preferenciasParaAprender, TIPO_ACAO, TIPO_RECORRENCIA, MIN_USOS,
} from '../src/lib/assistente/preferencias.js'

// Cenário 10 (pendências 31/10): escolher "Só despesa" 2 vezes para o mesmo favorecido em que a
// sugestão era agendamento → na 3ª a sugestão é "Só despesa". Outro cliente (outro banco) e outro
// perfil do mesmo cliente não são afetados. Postgres real (PGlite), mesma SQL do /api/ia-apelidos.
const novoBanco = async () => {
  const db = await bancoDoArquivo(async (b) => {
    await b.exec(`CREATE TABLE ia_apelidos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tipo TEXT NOT NULL CHECK (tipo IN ('categoria', 'conta', 'favorecido', 'descricao_fatura', 'acao_despesa', 'recorrencia')),
      termo TEXT NOT NULL, ref_id TEXT NOT NULL, usos INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tipo, termo))`)
  })
  return { db, q: async (sql, params = []) => (await db.query(sql, params)).rows }
}
let clienteA, clienteB
beforeEach(async () => { clienteA = await novoBanco(); clienteB = await novoBanco() })

const BOLETO = { natureza: 'boleto', favorecido: 'Academia X', descricao: 'Mensalidade', pago: true, hoje: '2026-11-12' }

// Uma prévia: sugestão (regras + preferências do banco) e, se `escolha`, o que a prévia grava ao confirmar.
async function previa({ q }, perfilId, escolha = null) {
  const apelidos = await q('SELECT tipo, termo, ref_id, usos FROM ia_apelidos')
  const termos = termosPreferencia({ perfilId, favorecido: BOLETO.favorecido })
  const prefAcao = preferenciaDe(apelidos, TIPO_ACAO, termos)
  const prefRec = preferenciaDe(apelidos, TIPO_RECORRENCIA, termos)
  const p = aplicarPreferencias(sugerirAcaoDespesa(BOLETO), { acao: prefAcao, recorrencia: prefRec, nome: BOLETO.favorecido })
  if (escolha) {
    const itens = preferenciasParaAprender({ termos, prefAcao, prefRec, acaoEscolhida: escolha, acaoDasRegras: p.acaoDasRegras, recDasRegras: p.recorrenciaDasRegras })
    if (itens.length) await upsertApelidos(q, itens.map(i => ({ tipo: i.tipo, termo: normalizarTermo(i.termo), ref: i.ref_id })))
  }
  return p
}

describe('preferência aprendida na prévia (cenário 10)', () => {
  it('2× "Só despesa" onde a regra sugeria agendamento → a 3ª sugere "Só despesa"', async () => {
    expect(MIN_USOS).toBe(2)
    const p1 = await previa(clienteA, 'perfil_pf', ACAO.SO_DESPESA)
    expect(p1.acaoSugerida).toBe(ACAO.DESPESA_AGENDAMENTO) // regra: boleto de serviço → mensal
    const p2 = await previa(clienteA, 'perfil_pf', ACAO.SO_DESPESA)
    expect(p2.acaoSugerida).toBe(ACAO.DESPESA_AGENDAMENTO) // 1 escolha ainda não basta
    const p3 = await previa(clienteA, 'perfil_pf')
    expect(p3).toMatchObject({ acaoSugerida: ACAO.SO_DESPESA, regra: 'preferencia', recorrenciaSugerida: null, acaoDasRegras: ACAO.DESPESA_AGENDAMENTO })
    expect(p3.motivo).toMatch(/costuma escolher "Só despesa" para Academia X/)
    const [row] = await clienteA.q("SELECT tipo, termo, ref_id, usos FROM ia_apelidos WHERE tipo = 'acao_despesa'")
    expect(row).toEqual({ tipo: 'acao_despesa', termo: 'perfil_pf|f:academia x', ref_id: 'so_despesa', usos: 2 })
  })

  it('outro cliente (outro banco) e outro perfil do mesmo cliente não são afetados', async () => {
    await previa(clienteA, 'perfil_pf', ACAO.SO_DESPESA)
    await previa(clienteA, 'perfil_pf', ACAO.SO_DESPESA)
    expect((await previa(clienteA, 'perfil_pf')).acaoSugerida).toBe(ACAO.SO_DESPESA)
    expect((await previa(clienteA, 'perfil_pj')).acaoSugerida).toBe(ACAO.DESPESA_AGENDAMENTO)
    expect((await previa(clienteB, 'perfil_pf')).acaoSugerida).toBe(ACAO.DESPESA_AGENDAMENTO)
    expect(await clienteB.q('SELECT * FROM ia_apelidos')).toEqual([])
  })

  it('mudou de ideia: escolha diferente recomeça a contagem (não vale mais até repetir)', async () => {
    await previa(clienteA, 'perfil_pf', ACAO.SO_DESPESA)
    await previa(clienteA, 'perfil_pf', ACAO.SO_DESPESA)
    // Na 3ª, sugerido "Só despesa" (preferência), mas escolheu agendar → contagem volta a 1.
    await previa(clienteA, 'perfil_pf', ACAO.DESPESA_AGENDAMENTO)
    const [row] = await clienteA.q("SELECT ref_id, usos FROM ia_apelidos WHERE tipo = 'acao_despesa'")
    expect(row).toEqual({ ref_id: 'despesa_agendamento', usos: 1 })
    expect((await previa(clienteA, 'perfil_pf')).regra).not.toBe('preferencia')
  })

  it('escolha igual à sugestão das regras, sem preferência gravada → nada é gravado', async () => {
    await previa(clienteA, 'perfil_pf', ACAO.DESPESA_AGENDAMENTO)
    expect(await clienteA.q('SELECT * FROM ia_apelidos')).toEqual([])
  })

  it('recorrência aprendida (anual em vez de mensal) e o pedido explícito continua mandando', () => {
    const termos = termosPreferencia({ perfilId: 'p', favorecido: 'Academia X' })
    const itens = preferenciasParaAprender({ termos, acaoEscolhida: ACAO.DESPESA_AGENDAMENTO, acaoDasRegras: ACAO.DESPESA_AGENDAMENTO, recEscolhida: 'annual', recDasRegras: 'monthly' })
    expect(itens).toEqual([{ tipo: 'recorrencia', termo: 'p|f:academia x', ref_id: 'annual' }])
    const r = aplicarPreferencias(sugerirAcaoDespesa(BOLETO), { recorrencia: { ref: 'annual', usos: 2 } })
    expect(r.recorrenciaSugerida).toBe('annual')
    // Contrato cadastrado é fato: a preferência não troca.
    const c = aplicarPreferencias({ regra: 'contrato_cadastrado', acaoSugerida: ACAO.SO_DESPESA }, { acao: { ref: 'despesa_agendamento', usos: 5 } })
    expect(c.acaoSugerida).toBe(ACAO.SO_DESPESA)
  })
})
