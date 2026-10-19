import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadFromDb, pingDb, scheduleToRow, categoryToRow, settingsToRow, definirConfirmadorExclusaoEmMassa } from './db.js'
import {
  mudancasEntre, mesclarNaFila, removerEnviadas, aplicarFilaSobreDados, enviarFila, entradaRateios, rotuloDaEntrada,
} from './filaOffline.js'
import { tentarReconectar } from './syncSeguro.js'
import { criarArmazenamento, backendMemoria, nomeDoBanco } from './armazenamentoLocal.js'

// Fila de pendências com o db.js de verdade e um servidor falso no lugar do fetch (/api/load,
// /api/ping, /api/sync, /api/sync-srf, /api/lancamento-rateios). Os passos seguem o AppContext:
// abrir (fila do aparelho + load do banco → fila reaplicada), editar (mudancasEntre → fila) e
// enviar (enviarFila → sai da fila o que o servidor confirmou).

const TABELA_DA_CARGA = {
  lancamentos: 'txs', agendamentos: 'scheds', categorias: 'cats', orcamento: 'buds', regras_classificacao: 'rules',
  reservas_funcoes: 'gers', gerencial_rules: 'grules', reservas: 'pays', envelopes: 'envs', grupos_conta: 'groups',
  perfis: 'perfis', card_imports: 'imports', reserve_functions: 'rfns', favorecido_alias: 'aliases', contas: 'accs',
}

function criarServidor({ cfg, tabelas = {} }) {
  const banco = { cfg: { ...cfg }, tabelas: {}, favorecidos: new Set(), srf: new Map(), rateios: new Map() }
  for (const t of Object.keys(TABELA_DA_CARGA)) banco.tabelas[t] = new Map((tabelas[t] || []).map(r => [r.id, r]))
  const srv = { banco, chamadas: [], fora: false }
  const resposta = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo })
  srv.fetch = async (url, opts = {}) => {
    const path = String(url).split('?')[0]
    if (srv.fora) throw new TypeError('Failed to fetch')
    if (path === '/api/ping') return resposta({ ok: true })
    if (path === '/api/load') {
      const d = { cfg: { ...banco.cfg }, faves: [...banco.favorecidos].map(name => ({ name })), rateios: [], srfs: [], tipos: [] }
      for (const [t, chave] of Object.entries(TABELA_DA_CARGA)) d[chave] = [...banco.tabelas[t].values()].map(r => ({ ...r }))
      return resposta(d)
    }
    const body = JSON.parse(opts.body)
    srv.chamadas.push({ path, body })
    if (path === '/api/sync') {
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
    if (path === '/api/sync-srf') { banco.srf.set(body.scheduleId, body.rows); return resposta({ ok: true }) }
    if (path === '/api/lancamento-rateios') {
      if (body.action === 'delete') banco.rateios.delete(body.lancamentoId); else banco.rateios.set(body.lancamentoId, body.rateios)
      return resposta({ ok: true })
    }
    return resposta({ error: 'rota desconhecida' }, 404)
  }
  return srv
}

const PADRAO = {
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', faturasFechadas: {}, categoryGroups: [] },
  costCenters: [], gerencialGroups: [],
  accounts: [], transactions: [], schedules: [], categories: [], budgets: [], classificationRules: [], gerencialRules: [],
  payables: [], payees: [], envelopes: [], accountGroups: [], profiles: [], cardImports: [], reserveFunctions: [],
  scheduleReservaFuncoes: [], favorecidoAliases: [], rateios: [],
}
const CFG = { ...settingsToRow({ ...PADRAO.settings, financialMonthStartDay: 15, faturasFechadas: { 'card_1:2026-09': true }, categoryGroups: ['Casa'] }, []), id: 1 }
const sched = (id, amount) => scheduleToRow({ id, description: `Agendamento ${id}`, amount, startDate: '2026-10-01', frequency: 'monthly', transactionType: 'expense', accountId: 'acc_1' })
const editar = (dados, id, mudanca) => ({ ...dados, schedules: dados.schedules.map(s => (s.id === id ? { ...s, ...mudanca } : s)) })

// "Abrir o app": fila do aparelho + load do banco → dados = banco com a fila reaplicada.
async function abrir(arm) {
  const fila = new Map((await arm.lerFila()).map(e => [e.chave, e]))
  const r = await loadFromDb(PADRAO)
  const dados = r.status === 'connected' ? aplicarFilaSobreDados(r.data, [...fila.values()]) : null
  return { fila, dados, status: r.status }
}
// "Editar": o que mudou vai para a fila (memória + aparelho).
async function registrar(arm, fila, antes, depois) {
  const mudaram = mesclarNaFila(fila, mudancasEntre(antes, depois))
  await arm.gravarEntradas(mudaram)
}
// "Enviar": o que o servidor confirmou sai da fila.
async function enviar(arm, fila) {
  let enviadas
  try { enviadas = await enviarFila([...fila.values()]) } catch (err) { enviadas = err.enviadas || [] }
  await arm.removerEntradas(removerEnviadas(fila, enviadas))
}

let srv
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  srv = criarServidor({ cfg: CFG, tabelas: { agendamentos: [sched('X', 100), sched('Y', 200)], categorias: [categoryToRow({ id: 'cat_1', name: 'Mercado', type: 'expense' })] } })
  vi.stubGlobal('fetch', srv.fetch)
})

describe('o que entra na fila', () => {
  it('só os itens novos, alterados e apagados; nada quando nada mudou', async () => {
    const { dados } = await abrir(criarArmazenamento(backendMemoria()))
    expect(mudancasEntre(dados, { ...dados })).toEqual([])
    const depois = { ...editar(dados, 'X', { amount: 150 }), schedules: [...editar(dados, 'X', { amount: 150 }).schedules.filter(s => s.id !== 'Y'), { ...dados.schedules[0], id: 'Z' }] }
    const e = mudancasEntre(dados, depois)
    expect(e.map(x => `${x.op}:${x.chave}`).sort()).toEqual(['apagar:agendamentos:Y', 'gravar:agendamentos:X', 'gravar:agendamentos:Z'])
  })

  it('objeto novo com o mesmo conteúdo não entra', async () => {
    const { dados } = await abrir(criarArmazenamento(backendMemoria()))
    expect(mudancasEntre(dados, { ...dados, schedules: dados.schedules.map(s => ({ ...s })) })).toEqual([])
  })

  it('configuração: só as colunas que mudaram, acumuladas numa entrada', () => {
    const fila = new Map()
    const a = { ...PADRAO, settings: { ...PADRAO.settings } }
    const b = { ...a, settings: { ...a.settings, financialMonthStartDay: 10 } }
    const c = { ...b, settings: { ...b.settings, categoryGroups: ['Lazer'] } }
    mesclarNaFila(fila, mudancasEntre(a, b))
    mesclarNaFila(fila, mudancasEntre(b, c))
    expect(fila.size).toBe(1)
    expect(fila.get('configuracoes').item).toEqual({ campos: ['financial_month_start_day', 'category_groups'], valores: { financial_month_start_day: 10, category_groups: ['Lazer'] } })
  })

  it('favorecidos, contas e detalhamento de fatura viram entradas próprias', () => {
    const antes = { ...PADRAO, payees: ['Ana'], accounts: [], scheduleReservaFuncoes: [] }
    const depois = { ...antes, payees: ['Ana', 'Bia'], accounts: [{ id: 'card_1', name: 'Cartão', type: 'credit' }], scheduleReservaFuncoes: [{ id: 'r1', scheduleId: 'S', valor: 10 }] }
    expect(mudancasEntre(antes, depois).map(e => e.chave).sort()).toEqual(['contas:card_1', 'favorecidos:Bia', 'schedule_reserva_funcoes:S'])
  })

  it('rótulo para o painel usa o nome da tela', () => {
    const [e] = mudancasEntre(PADRAO, { ...PADRAO, transactions: [{ id: 't1', description: 'Mercado', amount: 10 }] })
    expect(rotuloDaEntrada(e)).toEqual({ tela: 'lançamentos', nome: 'Mercado', acao: 'alteração' })
  })
})

describe('cenários pedidos', () => {
  it('fechar o app offline com edição pendente → reabrir → a edição ainda está na fila e é enviada ao reconectar', async () => {
    const aparelho = backendMemoria() // o IndexedDB do aparelho: sobrevive ao "fechar"

    // sessão 1: abriu com internet, caiu a conexão, editou X e fechou o app
    let arm = criarArmazenamento(aparelho)
    const s1 = await abrir(arm)
    srv.fora = true
    await registrar(arm, s1.fila, s1.dados, editar(s1.dados, 'X', { amount: 111 }))
    await enviar(arm, s1.fila) // falha: sem internet
    expect(s1.fila.size).toBe(1)

    // sessão 2 (outro dia): ainda sem internet — a fila está lá
    arm = criarArmazenamento(aparelho)
    expect((await arm.lerFila()).map(e => e.chave)).toEqual(['agendamentos:X'])
    const off = await abrir(arm)
    expect(off.status).toBe('error')
    expect(srv.banco.tabelas.agendamentos.get('X').amount).toBe(100)

    // a internet volta: recarrega do banco, reaplica a fila e envia
    srv.fora = false
    const r = await tentarReconectar({ carregouDoBanco: false, ping: pingDb, carregar: () => loadFromDb(PADRAO) })
    expect(r.acao).toBe('recarregado')
    const fila = new Map((await arm.lerFila()).map(e => [e.chave, e]))
    const dados = aplicarFilaSobreDados(r.result.data, [...fila.values()])
    expect(dados.schedules.find(s => s.id === 'X').amount).toBe(111) // a tela mostra a versão do aparelho
    await enviar(arm, fila)
    expect(srv.banco.tabelas.agendamentos.get('X').amount).toBe(111)
    expect(await arm.lerFila()).toEqual([])
  })

  it('mesma edição feita duas vezes → envia só a versão final', async () => {
    const arm = criarArmazenamento(backendMemoria())
    const { fila, dados } = await abrir(arm)
    const v1 = editar(dados, 'X', { amount: 120 })
    const v2 = editar(v1, 'X', { amount: 130 })
    await registrar(arm, fila, dados, v1)
    await registrar(arm, fila, v1, v2)
    expect(fila.size).toBe(1)
    await enviar(arm, fila)
    const envios = srv.chamadas.filter(c => c.body.table === 'agendamentos')
    expect(envios).toHaveLength(1)
    expect(envios[0].body.upsert.map(l => [l.id, l.amount])).toEqual([['X', 130]])
  })

  it('dois usuários no mesmo navegador não veem a fila um do outro', async () => {
    const aparelho = new Map() // nome do banco IndexedDB → conteúdo (como o navegador faz)
    const abrirDoUsuario = (sessao) => {
      const nome = nomeDoBanco(sessao)
      if (!aparelho.has(nome)) aparelho.set(nome, backendMemoria())
      return criarArmazenamento(aparelho.get(nome))
    }
    const ana = { id: 'u_ana', ambSigla: 'vm' }
    const bia = { id: 'u_bia', ambSigla: 'vm' }
    expect(nomeDoBanco(ana)).not.toBe(nomeDoBanco(bia))
    expect(nomeDoBanco({ id: 'u_ana', ambSigla: 'aa' })).not.toBe(nomeDoBanco(ana)) // outro ambiente, outra fila

    const armAna = abrirDoUsuario(ana)
    const s = await abrir(armAna)
    await registrar(armAna, s.fila, s.dados, editar(s.dados, 'X', { amount: 999 }))
    expect(await armAna.lerFila()).toHaveLength(1)
    expect(await abrirDoUsuario(bia).lerFila()).toEqual([])
  })

  it('dois aparelhos: B altera X, A (carregado antes) altera Y; X continua com a alteração de B', async () => {
    const armA = criarArmazenamento(backendMemoria())
    const armB = criarArmazenamento(backendMemoria())
    const A = await abrir(armA)
    const B = await abrir(armB)
    await registrar(armB, B.fila, B.dados, editar(B.dados, 'X', { amount: 111 }))
    await enviar(armB, B.fila)
    await registrar(armA, A.fila, A.dados, editar(A.dados, 'Y', { amount: 222 }))
    await enviar(armA, A.fila)
    expect(srv.banco.tabelas.agendamentos.get('X').amount).toBe(111)
    expect(srv.banco.tabelas.agendamentos.get('Y').amount).toBe(222)
  })

  it('caso de 15/10: sem cache, nada vai para a fila; ao reconectar, nada sobrescreve o banco', async () => {
    const cfgAntes = JSON.stringify(srv.banco.cfg)
    srv.fora = true
    expect((await loadFromDb(PADRAO)).status).toBe('error')
    srv.fora = false
    const r = await tentarReconectar({ carregouDoBanco: false, ping: pingDb, carregar: () => loadFromDb(PADRAO) })
    const dados = aplicarFilaSobreDados(r.result.data, []) // fila vazia (sem cache, nada é enfileirado)
    expect(mudancasEntre(dados, dados)).toEqual([])
    expect(srv.chamadas).toEqual([])
    expect(JSON.stringify(srv.banco.cfg)).toBe(cfgAntes)
  })
})

describe('envio', () => {
  it('configuração vai só com as colunas alteradas e camposAlterados', async () => {
    const arm = criarArmazenamento(backendMemoria())
    const { fila, dados } = await abrir(arm)
    await registrar(arm, fila, dados, { ...dados, settings: { ...dados.settings, categoryGroups: ['Casa', 'Lazer'] } })
    await enviar(arm, fila)
    const [c] = srv.chamadas
    expect(c.body).toEqual({ type: 'settings', data: { category_groups: ['Casa', 'Lazer'] }, camposAlterados: ['category_groups'] })
    expect(srv.banco.cfg.faturas_fechadas).toEqual({ 'card_1:2026-09': true })
  })

  it('rateios e detalhamento de fatura vão pelos endpoints próprios', async () => {
    const fila = new Map()
    mesclarNaFila(fila, [entradaRateios('tx_1', [{ id: 'r1', categoriaId: 'c', valor: 5 }])])
    mesclarNaFila(fila, mudancasEntre({ ...PADRAO }, { ...PADRAO, scheduleReservaFuncoes: [{ id: 'd1', scheduleId: 'S', valor: 3 }] }))
    await enviarFila([...fila.values()])
    expect(srv.banco.rateios.get('tx_1')).toHaveLength(1)
    expect(srv.banco.srf.get('S')).toHaveLength(1)
  })

  it('falha no meio: o que foi enviado sai, o resto fica; entrada alterada durante o envio não sai', async () => {
    const arm = criarArmazenamento(backendMemoria())
    const { fila, dados } = await abrir(arm)
    await registrar(arm, fila, dados, { ...editar(dados, 'X', { amount: 1 }), categories: [{ ...dados.categories[0], name: 'Super' }] })
    let chamadas = 0
    vi.stubGlobal('fetch', async (url, opts) => {
      if (++chamadas === 2) throw new TypeError('Failed to fetch')
      return srv.fetch(url, opts)
    })
    let erro
    try { await enviarFila([...fila.values()]) } catch (e) { erro = e }
    expect(erro.enviadas).toHaveLength(1)
    // a entrada enviada foi alterada de novo antes da confirmação: continua na fila
    const enviada = erro.enviadas[0]
    mesclarNaFila(fila, [{ ...enviada, versao: 'nova' }])
    expect(removerEnviadas(fila, erro.enviadas)).toEqual([])
    expect(fila.size).toBe(2)
  })

  it('exclusão em massa recusada pelo servidor: pergunta e reenvia com a confirmação', async () => {
    const arm = criarArmazenamento(backendMemoria())
    const { fila, dados } = await abrir(arm)
    await registrar(arm, fila, dados, { ...dados, schedules: [] })
    let recusou = false
    vi.stubGlobal('fetch', async (url, opts) => {
      const body = JSON.parse(opts?.body || '{}')
      if (body.type === 'section' && !body.confirmarExclusaoEmMassa) {
        recusou = true
        return { ok: false, status: 409, json: async () => ({ codigo: 'exclusao_em_massa', tabela: 'agendamentos', apagar: 2, total: 2 }) }
      }
      return srv.fetch(url, opts)
    })
    definirConfirmadorExclusaoEmMassa(async () => true)
    await enviar(arm, fila)
    expect(recusou).toBe(true)
    expect(srv.banco.tabelas.agendamentos.size).toBe(0)
    expect(fila.size).toBe(0)
  })
})
