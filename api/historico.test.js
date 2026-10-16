import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { upsertRowsNoClient } from './_db.js'
import { DDL_HISTORICO } from './_historico.js'
import { aplicarEdicao } from './historico.js'
import { aplicarTipoEmMassa } from './agendamentos.js'
import { aplicarBulkLancamentos } from './transactions-bulk-update.js'
import { sincronizarFavorecidoAgendamentos } from './_bem.js'
import { scheduleToRow } from '../src/lib/db.js'

// Histórico de alterações num Postgres de verdade (PGlite, em memória): mesma transação da
// alteração, 1 linha por campo/item com o mesmo lote, e o favorecido do financiamento só nas
// parcelas pendentes.
let db
const q = async (sql, params = []) => (await db.query(sql, params)).rows
// PGlite como "client" do upsertRowsNoClient (mesma interface query(sql, params) → { rows }).
const client = () => ({ query: (sql, params) => db.query(sql, params) })

const SCH_COLS = Object.keys(scheduleToRow({ id: 'x', amount: 1, frequency: 'once', startDate: '2026-01-01' }))
const tipoCol = (c) => (c === 'amount' ? 'NUMERIC'
  : ['registered', 'registered_meta', 'skipped', 'overrides', 'source_expense_ids'].includes(c) ? 'JSONB'
    : ['installments', 'remind_days_before'].includes(c) ? 'INTEGER'
      : ['auto_register', 'confirmado', 'is_provisao', 'provisao_efetivada'].includes(c) ? 'BOOLEAN' : 'TEXT')

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE agendamentos (${SCH_COLS.map(c => `"${c}" ${tipoCol(c)}${c === 'id' ? ' PRIMARY KEY' : ''}`).join(', ')}, financing_installment_id TEXT)`)
  await db.exec(`CREATE TABLE lancamentos (id TEXT PRIMARY KEY, date TEXT, category_id TEXT, description TEXT)`)
  await db.exec(`CREATE TABLE tipos_documento (id TEXT PRIMARY KEY)`)
  for (const sql of DDL_HISTORICO) await db.exec(sql)
})

const diarista = { id: 'sch_dia', description: 'Diarista', transactionType: 'expense', accountId: 'acc', amount: 200, categoryId: 'cat_limpeza', frequency: 'monthly', startDate: '2026-09-10', registered: ['2026-09-10'] }

describe('POST /api/historico — edição + histórico na mesma transação', () => {
  it('grava o agendamento alterado e 1 linha por campo, com o lote e o motivo', async () => {
    await upsertRowsNoClient(client(), 'agendamentos', [scheduleToRow(diarista)])
    const novo = { ...diarista, categoryId: 'cat_casa', overrides: { '2026-10-10': { amount: 220 } } }
    const r = await aplicarEdicao(q, client(), {
      lote_id: 'L1', motivo: 'Renegociação',
      agendamentos: [scheduleToRow(novo)],
      historico: [
        { entidade: 'agendamento', entidade_id: 'sch_dia', escopo: 'proximas', campo: 'categoryId', valor_anterior: 'cat_limpeza', valor_novo: 'cat_casa', serie_key: 'agendamento|sch_dia' },
        { entidade: 'agendamento', entidade_id: 'sch_dia', escopo: 'parcela', campo: 'amount', valor_anterior: 200, valor_novo: 220, ocorrencia_data: '2026-10-10' },
      ],
    }, upsertRowsNoClient)
    expect(r.historico).toBe(2)
    expect((await q("SELECT category_id FROM agendamentos WHERE id = 'sch_dia'"))[0].category_id).toBe('cat_casa')
    const h = await q('SELECT * FROM historico_alteracoes ORDER BY campo')
    expect(h.map(x => [x.campo, x.lote_id, x.motivo])).toEqual([['amount', 'L1', 'Renegociação'], ['categoryId', 'L1', 'Renegociação']])
    expect(h[0].valor_novo).toBe(220)
    expect(h[0].ocorrencia_data).toBe('2026-10-10')
  })

  it('se o histórico falha, a alteração também não fica (rollback)', async () => {
    await upsertRowsNoClient(client(), 'agendamentos', [scheduleToRow(diarista)])
    await db.exec('DROP TABLE historico_alteracoes')
    await expect(db.transaction(async (tx) => {
      const tq = async (sql, params = []) => (await tx.query(sql, params)).rows
      await aplicarEdicao(tq, { query: (s, p) => tx.query(s, p) }, {
        lote_id: 'L2',
        agendamentos: [scheduleToRow({ ...diarista, categoryId: 'cat_casa' })],
        historico: [{ entidade: 'agendamento', entidade_id: 'sch_dia', escopo: 'parcela', campo: 'categoryId', valor_anterior: 'cat_limpeza', valor_novo: 'cat_casa' }],
      }, upsertRowsNoClient)
    })).rejects.toThrow()
    expect((await q("SELECT category_id FROM agendamentos WHERE id = 'sch_dia'"))[0].category_id).toBe('cat_limpeza')
  })

  it('linha inválida é recusada antes de gravar qualquer coisa', async () => {
    await expect(aplicarEdicao(q, client(), { lote_id: 'L', historico: [{ entidade: 'outra', entidade_id: 'x', campo: 'a' }] }, upsertRowsNoClient))
      .rejects.toThrow(/entidade/)
  })
})

describe('edições em massa gravam histórico', () => {
  it('tipo de documento em massa: só quem mudou ganha linha, mesmo lote', async () => {
    await q("INSERT INTO tipos_documento VALUES ('t_bol')")
    await upsertRowsNoClient(client(), 'agendamentos', [
      scheduleToRow({ ...diarista, id: 'a' }), scheduleToRow({ ...diarista, id: 'b', tipoDocumentoId: 't_bol' }),
    ])
    const r = await aplicarTipoEmMassa(q, { ids: ['a', 'b'], tipoId: 't_bol', loteId: 'LM', motivo: 'Padronização' })
    expect(r).toMatchObject({ updated: 2, historico: 1 })
    const h = await q('SELECT entidade_id, campo, valor_anterior, valor_novo, motivo FROM historico_alteracoes')
    expect(h).toEqual([{ entidade_id: 'a', campo: 'tipoDocumentoId', valor_anterior: null, valor_novo: 't_bol', motivo: 'Padronização' }])
  })

  it('lançamentos em massa (data/categoria): 1 linha por campo e por lançamento', async () => {
    await q("INSERT INTO lancamentos VALUES ('t1', '2026-10-01', 'c1', 'x'), ('t2', '2026-10-02', 'c2', 'y')")
    const r = await aplicarBulkLancamentos(q, { ids: ['t1', 't2'], date: '2026-10-05', categoryId: 'c2', loteId: 'LB', motivo: null })
    expect(r).toMatchObject({ updated: 2, historico: 3 }) // t1: data+categoria; t2: só data
    const h = await q('SELECT entidade_id, campo FROM historico_alteracoes ORDER BY entidade_id, campo')
    expect(h).toEqual([{ entidade_id: 't1', campo: 'categoryId' }, { entidade_id: 't1', campo: 'date' }, { entidade_id: 't2', campo: 'date' }])
  })
})

describe('financiamento (TIGGO): favorecido só nas parcelas PENDENTES', () => {
  it('pagas mantêm o favorecido; pendentes mudam com histórico e motivo', async () => {
    await db.exec(`CREATE TABLE financing_installments (id TEXT PRIMARY KEY, financing_id TEXT, status TEXT DEFAULT 'open')`)
    for (let n = 1; n <= 4; n++) {
      const paga = n <= 2
      await q('INSERT INTO financing_installments VALUES ($1, $2, $3)', [`fi_${n}`, 'fin_tiggo', paga ? 'paid' : 'open'])
      await upsertRowsNoClient(client(), 'agendamentos', [scheduleToRow({
        id: `sch_${n}`, amount: 1500, frequency: 'once', startDate: `2027-0${n}-15`, payee: 'Banco X',
        registered: paga ? [`2027-0${n}-15`] : [],
      })])
      await q('UPDATE agendamentos SET financing_installment_id = $1 WHERE id = $2', [`fi_${n}`, `sch_${n}`])
    }
    const ids = await sincronizarFavorecidoAgendamentos(q, 'fin_tiggo', 'Banco Y', { loteId: 'LF', motivo: 'Renegociação', serieKey: 'financiamento|acc_div' })
    expect(ids.sort()).toEqual(['sch_3', 'sch_4'])
    const payees = await q('SELECT id, payee FROM agendamentos ORDER BY id')
    expect(payees.map(p => p.payee)).toEqual(['Banco X', 'Banco X', 'Banco Y', 'Banco Y'])
    const h = await q('SELECT entidade_id, escopo, valor_anterior, valor_novo, motivo, serie_key FROM historico_alteracoes ORDER BY entidade_id')
    expect(h).toEqual([
      { entidade_id: 'sch_3', escopo: 'serie', valor_anterior: 'Banco X', valor_novo: 'Banco Y', motivo: 'Renegociação', serie_key: 'financiamento|acc_div' },
      { entidade_id: 'sch_4', escopo: 'serie', valor_anterior: 'Banco X', valor_novo: 'Banco Y', motivo: 'Renegociação', serie_key: 'financiamento|acc_div' },
    ])
  })
})

describe('origem do histórico', () => {
  it('grava origem revisao_automatica (exclusão sem rows) e deixa null nas edições comuns', async () => {
    const r = await aplicarEdicao(q, client(), {
      lote_id: 'R1',
      historico: [
        { entidade: 'lancamento', entidade_id: 'tx_dup', escopo: 'parcela', campo: 'exclusao', valor_anterior: { id: 'tx_dup', amount: 19.9 }, valor_novo: null, motivo: 'Revisão automática: duplicata', origem: 'revisao_automatica' },
        { entidade: 'lancamento', entidade_id: 'tx_ok', escopo: 'parcela', campo: 'description', valor_anterior: 'a', valor_novo: 'b' },
      ],
    }, upsertRowsNoClient)
    expect(r.historico).toBe(2)
    const h = await q('SELECT entidade_id, campo, origem, valor_anterior FROM historico_alteracoes ORDER BY entidade_id')
    expect(h).toEqual([
      { entidade_id: 'tx_dup', campo: 'exclusao', origem: 'revisao_automatica', valor_anterior: { id: 'tx_dup', amount: 19.9 } },
      { entidade_id: 'tx_ok', campo: 'description', origem: null, valor_anterior: 'a' },
    ])
  })

  it('origem desconhecida é recusada', async () => {
    await expect(aplicarEdicao(q, client(), {
      lote_id: 'R2',
      historico: [{ entidade: 'lancamento', entidade_id: 'x', campo: 'exclusao', origem: 'qualquer' }],
    }, upsertRowsNoClient)).rejects.toThrow(/origem inválida/)
  })
})

describe('motor/sync não gravam histórico', () => {
  it('upsert de sync (upsertRowsNoClient) não toca historico_alteracoes', async () => {
    await upsertRowsNoClient(client(), 'agendamentos', [scheduleToRow({ ...diarista, amount: 999 })])
    expect((await q('SELECT COUNT(*)::int AS n FROM historico_alteracoes'))[0].n).toBe(0)
  })
})
