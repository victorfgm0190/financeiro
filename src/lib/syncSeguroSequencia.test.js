import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadFromDb, pingDb, sincronizarEstado, criarConfirmado, scheduleToRow, categoryToRow, settingsToRow,
} from './db.js'
import { tentarReconectar, reaplicarPendencias } from './syncSeguro.js'

// Sequências do sync com o db.js de verdade e um servidor falso no lugar do fetch (/api/load,
// /api/ping, /api/sync). Reproduzem o caso de 15/10/2026 (load falha → ping volta → o app NÃO
// sobrescreve configuracoes nem categorias) e o de dois aparelhos no mesmo ambiente (um não
// desfaz a edição do outro). Os passos seguem o AppContext: aplicarCargaDoBanco + efeito de sync.

const TABELA_DA_CARGA = {
  lancamentos: 'txs', agendamentos: 'scheds', categorias: 'cats', orcamento: 'buds', regras_classificacao: 'rules',
  reservas_funcoes: 'gers', gerencial_rules: 'grules', reservas: 'pays', envelopes: 'envs', grupos_conta: 'groups',
  perfis: 'perfis', card_imports: 'imports', reserve_functions: 'rfns', favorecido_alias: 'aliases', contas: 'accs',
}

function criarServidor({ cfg, tabelas }) {
  const banco = { cfg: { ...cfg }, tabelas: {}, favorecidos: new Set() }
  for (const t of Object.keys(TABELA_DA_CARGA)) banco.tabelas[t] = new Map((tabelas[t] || []).map(r => [r.id, r]))
  const srv = { banco, syncs: [], loadFalha: false, pingOk: true }

  const resposta = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo })
  srv.fetch = async (url, opts = {}) => {
    const path = String(url).split('?')[0]
    if (path === '/api/ping') {
      if (!srv.pingOk) throw new TypeError('Failed to fetch')
      return resposta({ ok: true })
    }
    if (path === '/api/load') {
      if (srv.loadFalha) throw new TypeError('Failed to fetch')
      const d = { cfg: { ...banco.cfg }, faves: [...banco.favorecidos].map(name => ({ name })), rateios: [], srfs: [], tipos: [] }
      for (const [t, chave] of Object.entries(TABELA_DA_CARGA)) d[chave] = [...banco.tabelas[t].values()].map(r => ({ ...r }))
      return resposta(d)
    }
    if (path === '/api/sync') {
      const body = JSON.parse(opts.body)
      srv.syncs.push(body)
      if (body.type === 'settings') banco.cfg = { ...banco.cfg, ...body.data }
      if (body.type === 'section') {
        const m = banco.tabelas[body.table]
        for (const id of body.delete || []) m.delete(id)
        for (const r of body.upsert || []) m.set(r.id, { ...(m.get(r.id) || {}), ...r })
      }
      if (body.type === 'accounts') {
        for (const id of body.delete || []) banco.tabelas.contas.delete(id)
        for (const r of body.upsert || []) banco.tabelas.contas.set(r.id, r)
      }
      if (body.type === 'payees') {
        for (const n of body.remove || []) banco.favorecidos.delete(n)
        for (const n of body.add || []) banco.favorecidos.add(n)
      }
      return resposta({ ok: true, written: { upserted: (body.upsert || []).length } })
    }
    return resposta({ error: 'rota desconhecida' }, 404)
  }
  return srv
}

// O que o app tem sem banco e sem cache (como o defaultData): dia 1, nada fechado, categorias padrão.
const PADRAO = {
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', faturasFechadas: {}, categoryGroups: [] },
  costCenters: [],
  gerencialGroups: [],
  accounts: [], transactions: [], schedules: [],
  categories: [{ id: 'cat_mercado', name: 'Mercado', type: 'expense', group: 'Alimentação' }],
  budgets: [], classificationRules: [], gerencialRules: [], payables: [], payees: [], envelopes: [],
  accountGroups: [], profiles: [], cardImports: [], reserveFunctions: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
}

// Banco real: dia 15, faturas fechadas, grupos, e a categoria padrão personalizada (perfil, ordem).
const CFG_REAL = {
  ...settingsToRow({ ...PADRAO.settings, financialMonthStartDay: 15, faturasFechadas: { 'card_1:2026-09': true }, categoryGroups: ['Casa', 'Lazer'], estornoCartaoEnabled: true }, [{ id: 'cc1', name: 'Casa' }]),
  id: 1,
}
const CAT_REAL = categoryToRow({ id: 'cat_mercado', name: 'Supermercado', type: 'expense', group: 'Casa', perfilIds: ['p1'], sortOrder: 3 })
const sched = (id, amount, extra = {}) => scheduleToRow({ id, description: `Agendamento ${id}`, amount, startDate: '2026-10-01', frequency: 'monthly', transactionType: 'expense', accountId: 'acc_1', ...extra })

// aplicarCargaDoBanco (AppContext), resumido: dados do banco valem; confirmado sai deles.
function aplicarCarga(result, pendentes = null, local = null) {
  const doBanco = { ...result.data }
  let dados = doBanco
  if (pendentes?.origem === 'cache') dados = reaplicarPendencias(pendentes.base, local, doBanco).dados
  return { prev: doBanco, data: dados, confirmado: criarConfirmado(doBanco) }
}

let srv
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('caso de 15/10: load falha → ping volta', () => {
  beforeEach(() => {
    srv = createServidorPadrao()
    vi.stubGlobal('fetch', srv.fetch)
  })
  function createServidorPadrao() {
    return criarServidor({ cfg: CFG_REAL, tabelas: { categorias: [CAT_REAL], agendamentos: [sched('s1', 100)] } })
  }

  it('navegador sem cache: nada vai ao banco; ao reconectar, recarrega e não sobrescreve configuracoes nem categorias', async () => {
    const cfgAntes = JSON.stringify(srv.banco.cfg)
    const catAntes = JSON.stringify(srv.banco.tabelas.categorias.get('cat_mercado'))

    // 1. abertura: o load falha → modo Local com os padrões
    srv.loadFalha = true
    const inicial = await loadFromDb(PADRAO)
    expect(inicial.status).toBe('error')
    const carregouDoBanco = false

    // 2. ping volta, mas o load ainda falha: continua Local, nada enviado
    let r = await tentarReconectar({ carregouDoBanco, ping: pingDb, carregar: () => loadFromDb(PADRAO) })
    expect(r.acao).toBe('recarregado')
    expect(r.result.status).toBe('error')
    expect(srv.syncs).toHaveLength(0)

    // 3. o load volta: o app recarrega ANTES de enviar qualquer coisa
    srv.loadFalha = false
    r = await tentarReconectar({ carregouDoBanco, ping: pingDb, carregar: () => loadFromDb(PADRAO) })
    expect(r.result.status).toBe('connected')
    const estado = aplicarCarga(r.result, { base: PADRAO, origem: 'padrao' })
    expect(estado.data.settings.financialMonthStartDay).toBe(15)

    // 4. o sync seguinte não tem o que enviar
    expect(await sincronizarEstado(estado.prev, estado.data, estado.confirmado)).toBe(0)
    expect(srv.syncs).toHaveLength(0)
    expect(JSON.stringify(srv.banco.cfg)).toBe(cfgAntes)
    expect(JSON.stringify(srv.banco.tabelas.categorias.get('cat_mercado'))).toBe(catAntes)
  })

  it('mesmo com prev vazio (o full-sync antigo), nada igual ao banco é reenviado', async () => {
    srv.loadFalha = false
    const r = await loadFromDb(PADRAO)
    const estado = aplicarCarga(r)
    const vazio = Object.fromEntries(Object.keys(PADRAO).map(k => [k, Array.isArray(PADRAO[k]) ? [] : {}]))
    // prev vazio (o EMPTY_PREV do full-sync antigo), mas com o confirmado do banco: só iria o que
    // DIFERE do banco. O estado aqui É o do banco, então nada de configuração nem de categoria.
    await sincronizarEstado(vazio, estado.data, estado.confirmado)
    expect(srv.syncs.filter(s => s.type === 'settings')).toHaveLength(0)
    expect(srv.syncs.filter(s => s.table === 'categorias' && s.upsert.length)).toHaveLength(0)
  })

  it('navegador com cache: ao reconectar, só a alteração feita no modo Local vai ao banco', async () => {
    // cache = foto antiga do banco (dia 15) + uma edição feita offline no agendamento s1
    const cache = { ...PADRAO, settings: { ...PADRAO.settings, financialMonthStartDay: 15 }, schedules: [{ id: 's1', description: 'Agendamento s1', amount: 100 }] }
    const local = { ...cache, schedules: [{ ...cache.schedules[0], amount: 150 }] }
    srv.loadFalha = true
    expect((await loadFromDb(PADRAO)).status).toBe('error')
    srv.loadFalha = false
    const r = await tentarReconectar({ carregouDoBanco: false, ping: pingDb, carregar: () => loadFromDb(PADRAO) })
    const estado = aplicarCarga(r.result, { base: cache, origem: 'cache' }, local)
    await sincronizarEstado(estado.prev, estado.data, estado.confirmado)

    expect(srv.syncs.map(s => s.type + ':' + (s.table || ''))).toEqual(['section:agendamentos'])
    expect(srv.syncs[0].upsert.map(l => [l.id, l.amount])).toEqual([['s1', 150]])
    expect(srv.banco.cfg.financial_month_start_day).toBe(15)
    expect(srv.banco.cfg.faturas_fechadas).toEqual({ 'card_1:2026-09': true })
  })
})

describe('dois aparelhos no mesmo ambiente', () => {
  beforeEach(() => {
    srv = criarServidor({ cfg: CFG_REAL, tabelas: { agendamentos: [sched('X', 100), sched('Y', 200)], categorias: [CAT_REAL] } })
    vi.stubGlobal('fetch', srv.fetch)
  })

  const editarAgendamento = (estado, id, mudanca) => ({
    ...estado.data,
    schedules: estado.data.schedules.map(s => (s.id === id ? { ...s, ...mudanca } : s)),
  })

  it('B altera X; A (carregado antes) altera Y e sincroniza; X continua com a alteração de B', async () => {
    const A = aplicarCarga(await loadFromDb(PADRAO))
    const B = aplicarCarga(await loadFromDb(PADRAO))

    const dataB = editarAgendamento(B, 'X', { amount: 111 })
    await sincronizarEstado(B.prev, dataB, B.confirmado)
    expect(srv.banco.tabelas.agendamentos.get('X').amount).toBe(111)

    const dataA = editarAgendamento(A, 'Y', { amount: 222 })
    await sincronizarEstado(A.prev, dataA, A.confirmado)

    expect(srv.banco.tabelas.agendamentos.get('X').amount).toBe(111) // edição de B preservada
    expect(srv.banco.tabelas.agendamentos.get('Y').amount).toBe(222)
    const envioA = srv.syncs[srv.syncs.length - 1]
    expect(envioA.upsert.map(l => l.id)).toEqual(['Y'])
  })

  it('configurações: cada aparelho envia só a chave que mudou', async () => {
    const A = aplicarCarga(await loadFromDb(PADRAO))
    const B = aplicarCarga(await loadFromDb(PADRAO))

    const dataB = { ...B.data, settings: { ...B.data.settings, faturasFechadas: { ...B.data.settings.faturasFechadas, 'card_1:2026-10': true } } }
    await sincronizarEstado(B.prev, dataB, B.confirmado)
    const dataA = { ...A.data, settings: { ...A.data.settings, categoryGroups: ['Casa', 'Lazer', 'Saúde'] } }
    await sincronizarEstado(A.prev, dataA, A.confirmado)

    const settings = srv.syncs.filter(s => s.type === 'settings')
    expect(settings.map(s => Object.keys(s.data))).toEqual([['faturas_fechadas'], ['category_groups']])
    expect(settings.map(s => s.camposAlterados)).toEqual([['faturas_fechadas'], ['category_groups']])
    expect(srv.banco.cfg.faturas_fechadas).toEqual({ 'card_1:2026-09': true, 'card_1:2026-10': true })
    expect(srv.banco.cfg.category_groups).toEqual(['Casa', 'Lazer', 'Saúde'])
  })

  it('depois de um envio confirmado, a mesma linha não é reenviada', async () => {
    const A = aplicarCarga(await loadFromDb(PADRAO))
    const d1 = editarAgendamento(A, 'Y', { amount: 300 })
    await sincronizarEstado(A.prev, d1, A.confirmado)
    const d2 = { ...d1, categories: d1.categories.map(c => ({ ...c, name: 'Super' })) }
    await sincronizarEstado(d1, d2, A.confirmado)
    expect(srv.syncs.map(s => s.table)).toEqual(['agendamentos', 'categorias'])
  })
})
