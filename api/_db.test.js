import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { montarUpsertSql, separarLimpezaDeParcela, CAMPOS_PARCELA_PROTEGIDOS, serializarParam } from './_db.js'
import { txToRow, categoryToRow, rowToCategory } from '../src/lib/db.js'

// O upsert de lancamentos executado num Postgres de verdade (PGlite, em memória): NULL vindo do app
// não apaga os 4 campos de parcela — e SÓ eles. Qualquer outra coluna recebe o NULL normalmente.

const COLS = Object.keys(txToRow({ id: 'x', type: 'expense', amount: 1, description: 'x' }))
  .filter(c => c !== '_limpar_parcela')
const tipo = (c) => (['amount'].includes(c) ? 'NUMERIC'
  : ['installment_num', 'installment_total', 'installment_occurrence'].includes(c) ? 'INTEGER'
    : ['reconciled', 'reserva_auto', 'is_espelho'].includes(c) ? 'BOOLEAN'
      : c === 'created_at' ? 'TIMESTAMPTZ' : 'TEXT')

const cheio = {
  id: 'tx_bia_2', type: 'expense', accountId: 'acc_itaupers', accountType: 'credit', amount: 132.5,
  date: '2026-07-13', dateCartao: '2026-07-13', description: 'Biashoes Mod-ct Ou 2/4', payee: 'Biashoes Mod-ct Ou 2/4',
  notes: 'obs', categoryId: 'cat_roupa', costCenter: 'cc1', grupoGerencial: 'grp_1', faturaMonthYear: '2026-08',
  faturaRef: '08/2026', installmentNum: 2, installmentTotal: 4, serieId: 'serie_1783911754890_acyz9s50',
  reservaFuncaoId: 'rf_1', createdAt: '2026-07-13T10:00:00Z',
}

let db
async function upsert(tx) {
  const { protegidas, limpar } = separarLimpezaDeParcela([txToRow(tx)])
  for (const [lote, preservar] of [[protegidas, CAMPOS_PARCELA_PROTEGIDOS], [limpar, []]]) {
    if (!lote.length) continue
    const cols = Object.keys(lote[0])
    await db.query(montarUpsertSql('lancamentos', cols, lote.length, 'id', preservar), lote.flatMap(r => cols.map(c => r[c] ?? null)))
  }
  return (await db.query('SELECT * FROM lancamentos WHERE id = $1', [tx.id])).rows[0]
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE lancamentos (${COLS.map(c => `"${c}" ${tipo(c)}${c === 'id' ? ' PRIMARY KEY' : ''}`).join(', ')})`)
  await db.exec('CREATE UNIQUE INDEX uq_lancamentos_installment ON lancamentos (installment_key) WHERE installment_key IS NOT NULL')
  await db.exec(`CREATE TABLE categorias (
    id TEXT PRIMARY KEY, name TEXT, type TEXT, color TEXT, icon TEXT, category_group TEXT,
    investment_account_id TEXT, gera_espelho BOOLEAN, conta_espelho_id TEXT,
    default_gerencial_group TEXT, perfil_ids TEXT[]
  )`)
  await upsert(cheio)
// A 1ª instância do PGlite carrega o WASM; com a suíte inteira rodando em paralelo isso passa dos
// 10s padrão e o 1º teste falhava por timeout do hook, não por erro.
}, 30000)

describe('upsert de lancamentos no Postgres (PGlite)', () => {
  it('a linha cheia grava os campos de parcela e a chave', async () => {
    const r = (await db.query('SELECT * FROM lancamentos')).rows[0]
    expect(r).toMatchObject({ installment_num: 2, installment_total: 4, serie_id: cheio.serieId, installment_key: 'acc_itaupers|biashoes mod-ct ou|2/4|13250|2026-07' })
  })

  it('NULL vindo do app NÃO apaga os 4 campos de parcela', async () => {
    const r = await upsert({ ...cheio, installmentNum: null, installmentTotal: null, serieId: null })
    expect(r).toMatchObject({ installment_num: 2, installment_total: 4, serie_id: cheio.serieId, installment_key: 'acc_itaupers|biashoes mod-ct ou|2/4|13250|2026-07' })
  })

  it('qualquer OUTRA coluna continua recebendo o NULL normalmente', async () => {
    const anulaveis = ['notes', 'payee', 'categoryId', 'costCenter', 'grupoGerencial', 'dateCartao', 'faturaMonthYear', 'faturaRef', 'reservaFuncaoId']
    const r = await upsert({ ...cheio, ...Object.fromEntries(anulaveis.map(k => [k, null])) })
    for (const c of ['notes', 'payee', 'category_id', 'cost_center', 'grupo_gerencial', 'date_cartao', 'fatura_month_year', 'fatura_ref', 'reserva_funcao_id']) {
      expect(r[c], c).toBeNull()
    }
    expect(r).toMatchObject({ installment_num: 2, serie_id: cheio.serieId })
  })

  it('valor novo não-nulo nos 4 campos continua atualizando', async () => {
    const r = await upsert({ ...cheio, installmentNum: 3, serieId: 'serie_nova' })
    expect(r).toMatchObject({ installment_num: 3, serie_id: 'serie_nova', installment_key: 'acc_itaupers|biashoes mod-ct ou|3/4|13250|2026-06' })
  })

  it('"Marcar como à vista" (_limparParcela) é a única forma de gravar NULL neles', async () => {
    const r = await upsert({ ...cheio, installmentNum: null, installmentTotal: null, _limparParcela: true })
    expect(r).toMatchObject({ installment_num: null, installment_total: null, installment_key: null })
  })

  it('o SQL só protege os 4 campos', () => {
    const sql = montarUpsertSql('lancamentos', COLS, 1, 'id', CAMPOS_PARCELA_PROTEGIDOS)
    expect(sql.match(/COALESCE/g)).toHaveLength(4)
    for (const c of COLS.filter(c => c !== 'id' && !CAMPOS_PARCELA_PROTEGIDOS.includes(c))) {
      expect(sql).toContain(`"${c}" = EXCLUDED."${c}"`)
    }
  })
})

// categorias.perfil_ids é TEXT[]: o upsert genérico manda array (não JSON) para essa coluna, e as
// demais colunas de categorias continuam como antes.
async function upsertCat(cat) {
  const row = categoryToRow(cat)
  const cols = Object.keys(row)
  await db.query(montarUpsertSql('categorias', cols, 1, 'id'), cols.map(c => serializarParam('categorias', c, row[c])))
  return rowToCategory((await db.query('SELECT * FROM categorias WHERE id = $1', [cat.id])).rows[0])
}
const catBase = { id: 'cat_x', name: 'Refeição', type: 'expense', icon: '🍽', group: 'Alimentação' }

describe('categorias.perfil_ids no Postgres (PGlite)', () => {
  it('sem perfis grava NULL e lê como [] (todos os perfis)', async () => {
    expect((await upsertCat({ ...catBase, perfilIds: [] })).perfilIds).toEqual([])
    expect((await db.query('SELECT perfil_ids FROM categorias')).rows[0].perfil_ids).toBeNull()
  })

  it('grava e lê 1 e vários perfis', async () => {
    expect((await upsertCat({ ...catBase, perfilIds: ['perf_pj'] })).perfilIds).toEqual(['perf_pj'])
    expect((await upsertCat({ ...catBase, perfilIds: ['perf_pf', 'perf_pj'] })).perfilIds).toEqual(['perf_pf', 'perf_pj'])
  })

  it('desmarcar todos volta para NULL', async () => {
    await upsertCat({ ...catBase, perfilIds: ['perf_pj'] })
    expect((await upsertCat({ ...catBase, perfilIds: [] })).perfilIds).toEqual([])
  })

  it('categoria antiga (sem o campo no app) continua valendo para todos', async () => {
    const c = await upsertCat(catBase)
    expect(c.perfilIds).toEqual([])
    expect(c).toMatchObject({ name: 'Refeição', group: 'Alimentação' })
  })

  it('serializarParam: só o TEXT[] declarado vai como array; o resto continua JSON', () => {
    expect(serializarParam('categorias', 'perfil_ids', ['a'])).toEqual(['a'])
    expect(serializarParam('agendamentos', 'registered', ['2026-10-01'])).toBe('["2026-10-01"]')
    expect(serializarParam('categorias', 'name', 'x')).toBe('x')
    expect(serializarParam('categorias', 'perfil_ids', null)).toBeNull()
  })
})
