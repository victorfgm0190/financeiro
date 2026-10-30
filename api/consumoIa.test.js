import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { consumoDoBanco, listarPrecos, validarPreco, salvarPreco } from './_consumoIa.js'

// Consumo de IA: leitura agregada do ia_uso (com e sem as colunas da migração 2026-10-30_ia_uso_consumo),
// período no fuso de São Paulo, e o cadastro de preços do central.
const banco = async (ddl) => {
  const db = new PGlite()
  await db.exec(ddl)
  return { db, q: async (sql, p = []) => (await db.query(sql, p)).rows }
}
const ANTIGA = `CREATE TABLE ia_uso (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, ambiente TEXT, ferramenta TEXT,
  tokens_entrada INTEGER NOT NULL DEFAULT 0, tokens_saida INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  com_imagem BOOLEAN NOT NULL DEFAULT false, usuario TEXT);`
const NOVA = `${ANTIGA} ALTER TABLE ia_uso ADD COLUMN modelo TEXT, ADD COLUMN duracao_ms INTEGER, ADD COLUMN stop_reason TEXT,
  ADD COLUMN tokens_cache_leitura INTEGER, ADD COLUMN tokens_cache_criacao INTEGER;`

describe('consumoDoBanco', () => {
  it('soma por dia × ferramenta × modelo, com cache, tempo, imagens e cortadas (dia em São Paulo)', async () => {
    const { db, q } = await banco(NOVA)
    await db.exec(`INSERT INTO ia_uso (ferramenta, tokens_entrada, tokens_saida, com_imagem, modelo, duracao_ms, stop_reason, tokens_cache_leitura, tokens_cache_criacao, created_at) VALUES
      ('lote', 26000, 3072, false, 'm1', 30000, 'max_tokens', 25000, 0, '2026-10-30 15:00:00+00'),
      ('lote', 26000, 2000, true, 'm1', 20000, 'tool_use', 25000, 0, '2026-10-30 16:00:00+00'),
      ('registrar_lancamento', 25000, 700, false, 'm1', NULL, NULL, 0, 25000, '2026-10-31 02:30:00+00'),
      ('lote', 1, 1, false, 'm1', 1, NULL, 0, 0, '2026-11-01 03:30:00+00')`)
    const g = await consumoDoBanco(q, { inicio: '2026-10-30', fim: '2026-10-31', ambiente: 'vm' })
    expect(g).toEqual([
      { ambiente: 'vm', dia: '2026-10-30', ferramenta: 'lote', modelo: 'm1', chamadas: 2, entrada: 52000, leitura: 50000, criacao: 0, saida: 5072, imagens: 1, duracaoSoma: 50000, duracaoN: 2, cortadas: 1 },
      // 02:30 UTC de 31/10 = 23:30 de 30/10 em São Paulo
      { ambiente: 'vm', dia: '2026-10-30', ferramenta: 'registrar_lancamento', modelo: 'm1', chamadas: 1, entrada: 25000, leitura: 0, criacao: 25000, saida: 700, imagens: 0, duracaoSoma: 0, duracaoN: 0, cortadas: 0 },
    ])
  })
  it('banco sem a migração: só tokens e imagens; sem ia_uso: vazio', async () => {
    const { db, q } = await banco(ANTIGA)
    await db.exec(`INSERT INTO ia_uso (ferramenta, tokens_entrada, tokens_saida, created_at) VALUES ('perguntar', 100, 10, '2026-10-30 15:00:00+00')`)
    const [g] = await consumoDoBanco(q, { inicio: '2026-10-01', fim: '2026-10-31', ambiente: 'cv' })
    expect(g).toMatchObject({ modelo: null, chamadas: 1, entrada: 100, leitura: 0, duracaoN: 0, cortadas: 0 })
    const vazio = await banco('SELECT 1')
    expect(await consumoDoBanco(vazio.q, { inicio: '2026-10-01', fim: '2026-10-31', ambiente: 'x' })).toEqual([])
  })
})

describe('preços (central)', () => {
  it('valida, grava/atualiza por modelo + vigência e lista; vazio = sem preço', async () => {
    expect(validarPreco({ modelo: '', vigencia: '2026-10-01' }).erro).toMatch(/modelo/)
    expect(validarPreco({ modelo: 'm1', vigencia: 'x' }).erro).toMatch(/vigência/)
    expect(validarPreco({ modelo: 'm1', vigencia: '2026-10-01', saida: -1 }).erro).toMatch(/inválido/)
    const sem = await banco('SELECT 1')
    expect(await listarPrecos(sem.q)).toEqual({ precos: [], semTabela: true })
    const { q } = await banco(`CREATE TABLE ia_precos (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, modelo TEXT NOT NULL, vigencia DATE NOT NULL,
      entrada NUMERIC(12,4), saida NUMERIC(12,4), cache_leitura NUMERIC(12,4), cache_criacao NUMERIC(12,4), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (modelo, vigencia))`)
    await salvarPreco(q, validarPreco({ modelo: 'm1', vigencia: '2026-10-01', entrada: '' }).dados)
    await salvarPreco(q, validarPreco({ modelo: 'm1', vigencia: '2026-10-01', entrada: 1.5, saida: 7 }).dados)
    const { precos } = await listarPrecos(q)
    expect(precos).toHaveLength(1)
    expect(precos[0]).toMatchObject({ modelo: 'm1', vigencia: '2026-10-01', entrada: 1.5, saida: 7, cache_leitura: null })
  })
})
