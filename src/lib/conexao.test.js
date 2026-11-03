import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadFromDb, pingDb, scheduleToRow, settingsToRow } from './db.js'
import { mudancasEntre, mesclarNaFila, removerEnviadas, aplicarFilaSobreDados, enviarFilaIsolando, tipoDeFalha, ehErroDeRede } from './filaOffline.js'
import { statusSemBanco, tentarSairDoModoSemBanco, semRede, MSG_SERVIDOR } from './conexao.js'
import { textoIndicador } from './offlineUi.js'

// Falso "Sem internet" (03/11/2026): com a internet funcionando, uma falha da API (5xx, tempo
// esgotado) ou um erro do próprio app deixava o app em modo Local com a faixa "Sem internet".
// Estes testes seguem os passos do AppContext com o db.js de verdade e um servidor falso.

const PADRAO = {
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', faturasFechadas: {}, categoryGroups: [] },
  costCenters: [], gerencialGroups: [],
  accounts: [], transactions: [], schedules: [], categories: [], budgets: [], classificationRules: [], gerencialRules: [],
  payables: [], payees: [], envelopes: [], accountGroups: [], profiles: [], cardImports: [], reserveFunctions: [],
  scheduleReservaFuncoes: [], favorecidoAliases: [], rateios: [],
}
const CFG = { ...settingsToRow(PADRAO.settings, []), id: 1 }
const sched = (id, amount) => scheduleToRow({ id, description: `Agendamento ${id}`, amount, startDate: '2026-12-01', frequency: 'monthly', transactionType: 'expense', accountId: 'acc_1' })

// Servidor falso: `modo` = 'ok' | 'erro' (API responde 503) | 'sem-rede' (fetch rejeita).
function criarServidor() {
  const agendamentos = new Map([['s1', sched('s1', 100)]])
  const srv = { modo: 'ok', agendamentos, upserts: [], pings: 0 }
  const resp = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo })
  srv.fetch = async (url, opts = {}) => {
    const path = String(url).split('?')[0]
    if (srv.modo === 'sem-rede') throw new TypeError('Failed to fetch')
    if (path === '/api/ping') { srv.pings++; return srv.modo === 'erro' ? resp({ ok: false }, 503) : resp({ ok: true }) }
    if (srv.modo === 'erro') return resp({ error: 'Service Unavailable' }, 503)
    if (path === '/api/load') {
      return resp({
        cfg: CFG, cats: [{ id: 'c1', name: 'Casa' }], accs: [], txs: [], scheds: [...agendamentos.values()].map(r => ({ ...r })),
        buds: [], rules: [], gers: [], grules: [], pays: [], faves: [], envs: [], groups: [], perfis: [], imports: [],
        rfns: [], rateios: [], srfs: [], aliases: [], tipos: [],
      })
    }
    const body = JSON.parse(opts.body)
    if (path === '/api/sync' && body.type === 'section' && body.table === 'agendamentos') {
      for (const r of body.upsert || []) { srv.upserts.push(r.id); agendamentos.set(r.id, { ...(agendamentos.get(r.id) || {}), ...r }) }
      for (const id of body.delete || []) agendamentos.delete(id)
      return resp({ ok: true })
    }
    return resp({ ok: true })
  }
  return srv
}

let srv
const nav = { onLine: true }
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
  srv = criarServidor()
  vi.stubGlobal('fetch', srv.fetch)
  nav.onLine = true
})

// Edição no app → entradas na fila (o que o efeito de sync do AppContext faz).
function editar(dados, fila, mudanca) {
  const depois = { ...dados, schedules: [...dados.schedules.filter(s => s.id !== mudanca.id), mudanca] }
  mesclarNaFila(fila, mudancasEntre(dados, depois))
  return depois
}

async function enviar(fila) {
  const { enviadas, falhas } = await enviarFilaIsolando([...fila.values()])
  removerEnviadas(fila, enviadas)
  return falhas
}

describe('status sem banco: "Sem internet" só sem rede', () => {
  it('aparelho com rede e API falhando → servidor; sem rede → local', () => {
    expect(statusSemBanco({ onLine: true })).toBe('servidor')
    expect(statusSemBanco({ onLine: false })).toBe('local')
    expect(semRede(undefined)).toBe(false)
    expect(textoIndicador({ online: true, servidor: true, pendentes: 2 })).toBe('Servidor sem resposta · 2 alterações aguardando envio')
    expect(textoIndicador({ online: true, servidor: true, pendentes: 0 })).not.toMatch(/Sem internet/)
    expect(textoIndicador({ online: false, pendentes: 1 })).toBe('Sem internet · 1 alteração aguardando envio')
    expect(MSG_SERVIDOR).toBe('Não foi possível falar com o servidor — tentando de novo')
  })

  it('erro do próprio app (sem status, não é de rede) não vira "rede": o item fica marcado com o erro real', () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')")
    expect(ehErroDeRede(bug)).toBe(false)
    expect(tipoDeFalha(bug)).toBe('recusa')
    expect(tipoDeFalha(new TypeError('Failed to fetch'))).toBe('rede')
    expect(tipoDeFalha(Object.assign(new Error('x'), { semResposta: true }))).toBe('rede')
  })

  it('fetch que rejeita é marcado como sem resposta pelo db.js', async () => {
    srv.modo = 'sem-rede'
    expect(await pingDb()).toBe(false)
    const r = await enviarFilaIsolando([{ chave: 'agendamentos:s9', tipo: 'secao', tabela: 'agendamentos', id: 's9', op: 'gravar', item: { id: 's9', description: 'x', amount: 1 }, versao: '1' }])
      .catch(e => e)
    expect(r.semResposta).toBe(true)
    expect(tipoDeFalha(r)).toBe('rede')
  })
})

describe('online → falha da API → API volta', () => {
  it('mostra "servidor" (não offline), guarda na fila e, quando a API volta, recarrega e envia', async () => {
    // Abre com a API falhando (503): status "servidor", nunca "local".
    srv.modo = 'erro'
    const r0 = await loadFromDb(PADRAO)
    expect(r0.status).toBe('error')
    expect(statusSemBanco(nav)).toBe('servidor')

    // Edição durante a falha (sobre o cache do aparelho) → fila.
    const fila = new Map()
    const cache = { ...PADRAO, schedules: [{ id: 's1', description: 'Agendamento s1', amount: 100 }] }
    editar(cache, fila, { id: 's2', description: 'Novo', amount: 50, startDate: '2026-12-05', frequency: 'monthly', transactionType: 'expense', accountId: 'acc_1' })
    expect(fila.size).toBe(1)

    // Retry com a API ainda fora: continua "servidor", com o erro.
    let t = await tentarSairDoModoSemBanco({ carregouDoBanco: false, ping: pingDb, carregar: () => loadFromDb(PADRAO), nav })
    expect(t).toMatchObject({ status: 'servidor', acao: 'aguardar' })

    // API volta: recarrega (fila reaplicada) e envia.
    srv.modo = 'ok'
    t = await tentarSairDoModoSemBanco({ carregouDoBanco: false, ping: pingDb, carregar: () => loadFromDb(PADRAO), nav })
    expect(t.status).toBe('connected')
    expect(t.acao).toBe('recarregado')
    const dados = aplicarFilaSobreDados(t.result.data, [...fila.values()])
    expect(dados.schedules.map(s => s.id).sort()).toEqual(['s1', 's2'])
    expect(await enviar(fila)).toEqual([])
    expect(fila.size).toBe(0)
    expect(srv.agendamentos.get('s2')).toMatchObject({ id: 's2', amount: 50 })
  })

  it('já conectado: envio falha com 503 repetido → item não some da fila; API volta → envia', async () => {
    const r = await loadFromDb(PADRAO)
    const fila = new Map()
    editar(r.data, fila, { ...r.data.schedules[0], amount: 120 })
    srv.modo = 'erro'
    const falhas = await enviar(fila)
    expect(falhas).toHaveLength(1)
    expect(tipoDeFalha(falhas[0].err)).toBe('servidor')
    expect(fila.size).toBe(1)
    srv.modo = 'ok'
    const t = await tentarSairDoModoSemBanco({ carregouDoBanco: true, ping: pingDb, carregar: () => loadFromDb(PADRAO), nav })
    expect(t).toMatchObject({ status: 'connected', acao: 'enviar-pendentes' })
    expect(await enviar(fila)).toEqual([])
    expect(fila.size).toBe(0)
    expect(srv.agendamentos.get('s1').amount).toBe(120)
  })
})

describe('offline real → grava local → online → envia sem duplicar', () => {
  it('sem rede: status local, nem pinga; com rede de volta: envia com o mesmo id, uma linha só', async () => {
    const r = await loadFromDb(PADRAO)
    expect(r.status).toBe('connected')
    const fila = new Map()

    // Cai a rede: o envio falha por rede → status "local".
    srv.modo = 'sem-rede'
    nav.onLine = false
    const dados = editar(r.data, fila, { id: 'novo1', description: 'Criado sem internet', amount: 30, startDate: '2026-12-10', frequency: 'monthly', transactionType: 'expense', accountId: 'acc_1' })
    const erro = await enviar(fila).catch(e => e)
    expect(tipoDeFalha(erro)).toBe('rede')
    expect(statusSemBanco(nav)).toBe('local')
    expect(fila.size).toBe(1)

    // Retry sem rede: nem tenta o servidor.
    const antes = srv.pings
    let t = await tentarSairDoModoSemBanco({ carregouDoBanco: true, ping: pingDb, carregar: () => loadFromDb(PADRAO), nav })
    expect(t).toMatchObject({ status: 'local', acao: 'aguardar' })
    expect(srv.pings).toBe(antes)

    // Outra edição do MESMO item offline: substitui a entrada (vai a versão final).
    editar(dados, fila, { ...dados.schedules.find(s => s.id === 'novo1'), amount: 35 })
    expect(fila.size).toBe(1)

    // Rede de volta (evento online) → conecta e envia.
    srv.modo = 'ok'
    nav.onLine = true
    t = await tentarSairDoModoSemBanco({ carregouDoBanco: true, ping: pingDb, carregar: () => loadFromDb(PADRAO), nav })
    expect(t).toMatchObject({ status: 'connected', acao: 'enviar-pendentes' })
    const copia = [...fila.values()]
    expect(await enviar(fila)).toEqual([])
    expect(fila.size).toBe(0)
    // Reenvio da mesma entrada (ex.: resposta perdida) → upsert pelo id: continua uma linha.
    await enviarFilaIsolando(copia)
    expect([...srv.agendamentos.keys()].filter(id => id === 'novo1')).toHaveLength(1)
    expect(srv.agendamentos.size).toBe(2)
    expect(srv.agendamentos.get('novo1').amount).toBe(35)
  })
})
