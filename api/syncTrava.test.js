import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { filtrarConfiguracoes, vazioOuPadrao } from './_syncTrava.js'
import { settingsToRow } from '../src/lib/db.js'

// Trava do /api/sync num Postgres de verdade (PGlite, em memória). O handler roda de verdade; só
// a conexão (_db.js), o login, a permissão e o ambiente são trocados por versões de teste.
const estado = vi.hoisted(() => ({ db: null }))
vi.mock('./_db.js', async () => {
  const real = await vi.importActual('./_db.js')
  const query = async (sql, params = []) => (await estado.db.query(sql, params)).rows
  return {
    query,
    ErroIdentificador: real.ErroIdentificador,
    parseBody: async (req) => req.body || {},
    upsertRows: async (table, rows, conflictCol = 'id') => {
      if (!rows?.length) return 0
      const cols = Object.keys(rows[0])
      const params = rows.flatMap(r => cols.map(c => real.serializarParam(table, c, r[c])))
      return (await estado.db.query(real.montarUpsertSql(table, cols, rows.length, conflictCol), params)).affectedRows ?? rows.length
    },
    deleteRows: async (table, ids, col = 'id') => {
      if (!ids?.length) return 0
      return (await estado.db.query(`DELETE FROM ${table} WHERE "${col}" = ANY($1)`, [ids])).affectedRows ?? 0
    },
  }
})
vi.mock('./_auth.js', () => ({ requireAuth: () => true }))
vi.mock('./_permissoesApi.js', () => ({ autorizarSync: async (_q, _u, body) => body }))
vi.mock('./_ambiente.js', () => ({ comAmbiente: (h) => h }))

const { default: syncHandler } = await import('./sync.js')

function resposta() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
  }
}
async function sync(body) {
  const res = resposta()
  await syncHandler({ method: 'POST', body, headers: {}, ambiente: { sigla: 'vm' } }, res)
  return res
}
const q = async (sql, params) => (await estado.db.query(sql, params)).rows

// O que o defaultData produz no syncSettings (o payload que zerou a linha em 15/10/2026).
const PADRAO = settingsToRow({ financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', faturasFechadas: {}, categoryGroups: [] }, [])
const REAL = settingsToRow({
  financialMonthStartDay: 15, financialMonthMode: 'custom', currency: 'BRL', faturasFechadas: { 'card_1:2026-09': true },
  categoryGroups: ['Casa', 'Lazer'], categoryGroupsOrdemManual: true, estornoCartaoEnabled: true, estornoCartaoCategoryId: 'cat_estorno',
  recurringMatchExceptions: ['uber'], mobileHomeCards: ['saldo'], lastBalanceSnapshot: { em: '2026-10-01' },
}, [{ id: 'cc1', name: 'Casa' }])
const JSONB = new Set(['cost_centers', 'recurring_match_exceptions', 'category_groups', 'balance_snapshot', 'faturas_fechadas', 'mobile_home_cards'])
const tipo = (c) => (JSONB.has(c) ? 'JSONB' : c === 'financial_month_start_day' ? 'INTEGER'
  : ['category_groups_ordem_manual', 'estorno_cartao_enabled'].includes(c) ? 'BOOLEAN' : 'TEXT')

beforeEach(async () => {
  estado.db = new PGlite()
  await estado.db.exec(`CREATE TABLE configuracoes (id INTEGER PRIMARY KEY, ${Object.keys(REAL).map(c => `"${c}" ${tipo(c)}`).join(', ')})`)
  await estado.db.exec('CREATE TABLE categorias (id TEXT PRIMARY KEY, name TEXT)')
  await estado.db.exec('CREATE TABLE favorecidos (name TEXT PRIMARY KEY)')
  await estado.db.exec('CREATE TABLE contas (id TEXT PRIMARY KEY, name TEXT)')
  await estado.db.exec('CREATE TABLE cartoes (id TEXT PRIMARY KEY)')
  const cols = Object.keys(REAL)
  await estado.db.query(
    `INSERT INTO configuracoes (id, ${cols.map(c => `"${c}"`).join(', ')}) VALUES (1, ${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map(c => (JSONB.has(c) ? JSON.stringify(REAL[c]) : REAL[c])),
  )
  for (let i = 0; i < 20; i++) await estado.db.query('INSERT INTO categorias VALUES ($1, $2)', [`cat_${i}`, `Categoria ${i}`])
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('configuracoes: valor preenchido não vira vazio/padrão sem camposAlterados', () => {
  it('o payload do defaultData sobre a linha preenchida não troca nada', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await sync({ type: 'settings', data: PADRAO })
    expect(res.statusCode).toBe(200)
    const [linha] = await q('SELECT * FROM configuracoes WHERE id = 1')
    expect(linha.financial_month_start_day).toBe(15)
    expect(linha.faturas_fechadas).toEqual({ 'card_1:2026-09': true })
    expect(linha.category_groups).toEqual(['Casa', 'Lazer'])
    expect(linha.cost_centers).toEqual([{ id: 'cc1', name: 'Casa' }])
    expect(linha.estorno_cartao_enabled).toBe(true)
    expect(linha.mobile_home_cards).toEqual(['saldo'])
    expect(linha.category_groups_ordem_manual).toBe(true)
    expect(res.body.recusados).toEqual(expect.arrayContaining([
      'financial_month_start_day', 'faturas_fechadas', 'category_groups', 'cost_centers', 'estorno_cartao_enabled', 'mobile_home_cards',
    ]))
    // log da recusa: só nomes de coluna e contadores, nunca o conteúdo
    const log = aviso.mock.calls.map(c => c.join(' ')).join('\n')
    expect(log).toContain('RECUSADO settings')
    expect(log).not.toContain('Casa')
    expect(log).not.toContain('card_1')
  })

  it('com camposAlterados (o usuário mudou), grava o vazio/padrão', async () => {
    const res = await sync({ type: 'settings', data: { faturas_fechadas: {}, financial_month_start_day: 1 }, camposAlterados: ['faturas_fechadas', 'financial_month_start_day'] })
    expect(res.body.recusados).toEqual([])
    const [linha] = await q('SELECT faturas_fechadas, financial_month_start_day, category_groups FROM configuracoes WHERE id = 1')
    expect(linha).toEqual({ faturas_fechadas: {}, financial_month_start_day: 1, category_groups: ['Casa', 'Lazer'] })
  })

  it('valor preenchido novo passa mesmo sem camposAlterados (app antigo continua gravando mudanças reais)', async () => {
    await sync({ type: 'settings', data: { financial_month_start_day: 10, category_groups: ['Outro'] } })
    const [linha] = await q('SELECT financial_month_start_day, category_groups FROM configuracoes WHERE id = 1')
    expect(linha).toEqual({ financial_month_start_day: 10, category_groups: ['Outro'] })
  })

  it('linha inexistente (banco novo, seed) grava tudo', async () => {
    await estado.db.exec('DELETE FROM configuracoes')
    await sync({ type: 'settings', data: PADRAO })
    const [linha] = await q('SELECT financial_month_start_day, faturas_fechadas FROM configuracoes WHERE id = 1')
    expect(linha).toEqual({ financial_month_start_day: 1, faturas_fechadas: {} })
  })

  it('regras de vazio/padrão', () => {
    expect(vazioOuPadrao('faturas_fechadas', {})).toBe(true)
    expect(vazioOuPadrao('category_groups', [])).toBe(true)
    expect(vazioOuPadrao('mobile_home_cards', null)).toBe(true)
    expect(vazioOuPadrao('financial_month_start_day', 1)).toBe(true)
    expect(vazioOuPadrao('financial_month_start_day', 15)).toBe(false)
    expect(filtrarConfiguracoes({ currency: 'USD' }, { currency: 'BRL' }).recusados).toEqual(['currency'])
  })
})

describe('exclusão em massa (> 20% da tabela e >= 5 linhas) exige confirmação', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `cat_${i}`)

  it('6 de 20 categorias sem confirmação: 409 e nada apagado (nem gravado)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await sync({ type: 'section', table: 'categorias', upsert: [{ id: 'cat_novo', name: 'Nova' }], delete: ids(6) })
    expect(res.statusCode).toBe(409)
    expect(res.body).toMatchObject({ codigo: 'exclusao_em_massa', tabela: 'categorias', apagar: 6, total: 20 })
    expect((await q('SELECT count(*)::int AS n FROM categorias'))[0].n).toBe(20)
    const log = aviso.mock.calls.map(c => c.join(' ')).join('\n')
    expect(log).toContain('RECUSADO exclusao_em_massa')
    expect(log).not.toContain('Categoria')
  })

  it('com confirmarExclusaoEmMassa, apaga', async () => {
    const res = await sync({ type: 'section', table: 'categorias', upsert: [], delete: ids(6), confirmarExclusaoEmMassa: true })
    expect(res.statusCode).toBe(200)
    expect((await q('SELECT count(*)::int AS n FROM categorias'))[0].n).toBe(14)
  })

  it('até 20% ou menos de 5 linhas passa sem confirmação', async () => {
    expect((await sync({ type: 'section', table: 'categorias', upsert: [], delete: ids(4) })).statusCode).toBe(200)
    expect((await q('SELECT count(*)::int AS n FROM categorias'))[0].n).toBe(16)
  })

  it('ids que não existem no banco não contam', async () => {
    const res = await sync({ type: 'section', table: 'categorias', upsert: [], delete: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'] })
    expect(res.statusCode).toBe(200)
  })

  it('vale também para contas e favorecidos', async () => {
    for (let i = 0; i < 5; i++) {
      await estado.db.query('INSERT INTO contas VALUES ($1, $2)', [`acc_${i}`, `Conta ${i}`])
      await estado.db.query('INSERT INTO favorecidos VALUES ($1)', [`Fav ${i}`])
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const contas = await sync({ type: 'accounts', upsert: [], delete: ['acc_0', 'acc_1', 'acc_2', 'acc_3', 'acc_4'], cards: [], deleteCards: [] })
    expect(contas.statusCode).toBe(409)
    const fav = await sync({ type: 'payees', add: [], remove: ['Fav 0', 'Fav 1', 'Fav 2', 'Fav 3', 'Fav 4'] })
    expect(fav.statusCode).toBe(409)
  })
})
