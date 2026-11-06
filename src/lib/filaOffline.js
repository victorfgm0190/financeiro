// FILA de alterações pendentes de envio — o coração do modo sem internet. Funções PURAS sobre o
// estado do app (a persistência no IndexedDB é de src/lib/armazenamentoLocal.js; quem orquestra é o
// AppContext). Testadas em filaOffline.test.js.
//
// Toda mudança do estado vira uma ENTRADA por item (`tabela:id`), online ou não. A entrada só sai da
// fila quando o servidor confirma o envio. O mesmo item alterado de novo SUBSTITUI a entrada: vai a
// versão final, não cada passo. Ao abrir o app (ou reconectar), os dados do banco passam a valer e a
// fila é reaplicada por cima (aplicarFilaSobreDados) antes de enviar — nunca o estado inteiro.
//
// Tipos de entrada:
//   secao  — linha de uma tabela do sync genérico (SECOES_SYNC: lançamentos, agendamentos…)
//   conta  — conta (e o cartão, se for de crédito)
//   favorecido — nome do favorecido
//   config — colunas de configuracoes alteradas (uma entrada só, com a união dos campos)
//   srf    — detalhamento de fatura de UM agendamento (substitui tudo dele)
//   rateios — rateios de UM lançamento (substitui tudo dele; item null = apagar)

import {
  SECOES_SYNC, accountToRow, cardToRow, settingsToRow, srfSignature, CHAVE_APP_DA_CONFIGURACAO,
  postSync, enviarConfiguracoes, syncSrf, saveRateios, deleteRateios,
} from './db.js'
import { NOMES_NA_TELA } from './syncSeguro.js'

let seq = 0
const novaVersao = (agora) => `${agora}-${++seq}`
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function entrada(tipo, tabela, id, op, item, agora) {
  return { chave: `${tabela}:${id}`, tipo, tabela, id, op, item, versao: novaVersao(agora), em: agora }
}

// Itens com id: novos, alterados (o toRow difere) e apagados entre `antes` e `depois`.
function diffLista(antes, depois, toRow, emitir) {
  const porId = new Map((antes || []).filter(Boolean).map(i => [i.id, i]))
  const vistos = new Set()
  for (const item of depois || []) {
    if (!item || item.id == null) continue
    vistos.add(item.id)
    const a = porId.get(item.id)
    if (!a) emitir('gravar', item)
    else if (a !== item && !igual(toRow(a), toRow(item))) emitir('gravar', item)
  }
  for (const [id, a] of porId) if (!vistos.has(id)) emitir('apagar', a)
}

const linhasDaConta = (a) => [accountToRow(a), a.type === 'credit' ? cardToRow(a) : null]

const porAgendamento = (itens) => {
  const m = new Map()
  for (const it of itens || []) {
    if (!it?.scheduleId) continue
    if (!m.has(it.scheduleId)) m.set(it.scheduleId, [])
    m.get(it.scheduleId).push(it)
  }
  return m
}

// Entradas para as mudanças entre `prev` (último estado já enfileirado) e `data`.
export function mudancasEntre(prev, data, agora = Date.now()) {
  if (!prev || !data || prev === data) return []
  const out = []
  for (const { chave, tabela, toRow } of SECOES_SYNC) {
    if (prev[chave] === data[chave]) continue
    diffLista(prev[chave], data[chave], toRow, (op, item) => out.push(entrada('secao', tabela, item.id, op, item, agora)))
  }
  if (prev.accounts !== data.accounts) {
    diffLista(prev.accounts, data.accounts, linhasDaConta, (op, item) => out.push(entrada('conta', 'contas', item.id, op, item, agora)))
  }
  if (prev.payees !== data.payees) {
    const a = new Set(prev.payees || [])
    const d = new Set(data.payees || [])
    for (const n of d) if (!a.has(n)) out.push(entrada('favorecido', 'favorecidos', n, 'gravar', n, agora))
    for (const n of a) if (!d.has(n)) out.push(entrada('favorecido', 'favorecidos', n, 'apagar', n, agora))
  }
  if (prev.settings !== data.settings || prev.costCenters !== data.costCenters) {
    const la = settingsToRow(prev.settings || {}, prev.costCenters)
    const ld = settingsToRow(data.settings || {}, data.costCenters)
    const campos = Object.keys(ld).filter(k => !igual(la[k], ld[k]))
    if (campos.length) {
      const e = entrada('config', 'configuracoes', 'linha', 'gravar', { campos, valores: Object.fromEntries(campos.map(k => [k, ld[k]])) }, agora)
      out.push({ ...e, chave: 'configuracoes' })
    }
  }
  if (prev.scheduleReservaFuncoes !== data.scheduleReservaFuncoes) {
    const a = porAgendamento(prev.scheduleReservaFuncoes)
    const d = porAgendamento(data.scheduleReservaFuncoes)
    for (const id of new Set([...a.keys(), ...d.keys()])) {
      const linhas = d.get(id) || []
      if (srfSignature(a.get(id) || []) !== srfSignature(linhas)) out.push(entrada('srf', 'schedule_reserva_funcoes', id, 'gravar', linhas, agora))
    }
  }
  return out
}

// Rateios de um lançamento (gravados por endpoint próprio): entrada para quando não há conexão.
export function entradaRateios(lancamentoId, lista, agora = Date.now()) {
  return entrada('rateios', 'lancamento_rateios', lancamentoId, lista ? 'gravar' : 'apagar', lista || null, agora)
}

// Junta entradas novas à fila (Map chave → entrada). A de configuração acumula os campos; as
// demais substituem a anterior do mesmo item. Devolve as entradas que mudaram (para persistir).
export function mesclarNaFila(fila, novas) {
  const mudaram = []
  for (const e of novas) {
    const atual = fila.get(e.chave)
    let final = e
    if (e.tipo === 'config' && atual) {
      const campos = [...new Set([...atual.item.campos, ...e.item.campos])]
      final = { ...e, item: { campos, valores: { ...atual.item.valores, ...e.item.valores } } }
    }
    fila.set(e.chave, final)
    mudaram.push(final)
  }
  return mudaram
}

// Remove da fila só as entradas enviadas que não foram substituídas no meio do envio.
export function removerEnviadas(fila, enviadas) {
  const removidas = []
  for (const e of enviadas) {
    if (fila.get(e.chave)?.versao === e.versao) { fila.delete(e.chave); removidas.push(e.chave) }
  }
  return removidas
}

const substituirPorId = (lista, item) => {
  const sem = (lista || []).filter(i => i?.id !== item.id)
  const idx = (lista || []).findIndex(i => i?.id === item.id)
  if (idx < 0) return [...sem, item]
  return [...sem.slice(0, idx), item, ...sem.slice(idx)]
}

// Os dados do banco (recém-carregados) com a fila reaplicada por cima: o que está na fila é a
// versão do aparelho e ainda não chegou ao banco.
export function aplicarFilaSobreDados(dados, entradas) {
  if (!entradas?.length) return dados
  const out = { ...dados }
  const secaoDaTabela = Object.fromEntries(SECOES_SYNC.map(s => [s.tabela, s.chave]))
  for (const e of entradas) {
    if (e.tipo === 'secao') {
      const chave = secaoDaTabela[e.tabela]
      if (!chave) continue
      out[chave] = e.op === 'apagar' ? (out[chave] || []).filter(i => i?.id !== e.id) : substituirPorId(out[chave], e.item)
    } else if (e.tipo === 'conta') {
      out.accounts = e.op === 'apagar' ? (out.accounts || []).filter(a => a?.id !== e.id) : substituirPorId(out.accounts, e.item)
    } else if (e.tipo === 'favorecido') {
      const s = new Set(out.payees || [])
      if (e.op === 'apagar') s.delete(e.id); else s.add(e.id)
      out.payees = [...s]
    } else if (e.tipo === 'config') {
      out.settings = { ...(out.settings || {}) }
      for (const campo of e.item.campos) {
        if (campo === 'cost_centers') out.costCenters = e.item.valores[campo]
        else if (CHAVE_APP_DA_CONFIGURACAO[campo]) out.settings[CHAVE_APP_DA_CONFIGURACAO[campo]] = e.item.valores[campo]
      }
    } else if (e.tipo === 'srf') {
      out.scheduleReservaFuncoes = [...(out.scheduleReservaFuncoes || []).filter(r => r?.scheduleId !== e.id), ...(e.item || [])]
    } else if (e.tipo === 'rateios') {
      out.rateios = [...(out.rateios || []).filter(r => r?.lancamentoId !== e.id), ...(e.item || []).map(r => ({ ...r, lancamentoId: e.id }))]
    }
  }
  return out
}

const LOTE = 500

// Envia a fila ao banco, em ordem (contas antes dos cartões, depois as seções, favorecidos,
// configurações, detalhamento e rateios). Devolve as entradas enviadas; numa falha, lança o erro
// com `err.enviadas` = o que já foi (para o chamador tirar da fila) — o resto fica para a próxima.
export async function enviarFila(entradas) {
  const enviadas = []
  let lote = []
  try {
    // Período virado: uma confirmação só para o lote, antes de gravar qualquer coisa (nem o saldo das contas).
    const estorno = await verificarPeriodoVirado(entradas)
    if (estorno) lote = estorno.lote
    const contas = entradas.filter(e => e.tipo === 'conta')
    if (contas.length) {
      const grav = contas.filter(e => e.op === 'gravar').map(e => e.item)
      const apag = contas.filter(e => e.op === 'apagar')
      lote = contas
      await postSync({
        type: 'accounts',
        upsert: grav.map(accountToRow),
        delete: apag.map(e => e.id),
        cards: grav.filter(a => a.type === 'credit').map(cardToRow),
        deleteCards: apag.filter(e => e.item?.type === 'credit').map(e => e.id),
      })
      enviadas.push(...contas)
    }

    const toRowDaTabela = Object.fromEntries(SECOES_SYNC.map(s => [s.tabela, s.toRow]))
    const secoes = entradas.filter(e => e.tipo === 'secao' && toRowDaTabela[e.tabela])
    for (const tabela of [...new Set(secoes.map(e => e.tabela))]) {
      const daTabela = secoes.filter(e => e.tabela === tabela)
      const grav = daTabela.filter(e => e.op === 'gravar')
      const apag = daTabela.filter(e => e.op === 'apagar')
      if (estorno && tabela === estorno.tabela) {
        // Confirmado: o lote inteiro numa operação só, para estornar e refazer uma vez.
        lote = daTabela
        await postSync({ type: 'section', table: tabela, upsert: grav.map(e => toRowDaTabela[tabela](e.item)), delete: apag.map(e => e.id) }, { confirmarEstorno: true })
        enviadas.push(...daTabela)
        continue
      }
      for (let i = 0; i === 0 || i < grav.length; i += LOTE) {
        const pagina = grav.slice(i, i + LOTE)
        lote = [...pagina, ...(i === 0 ? apag : [])]
        await postSync({ type: 'section', table: tabela, upsert: pagina.map(e => toRowDaTabela[tabela](e.item)), delete: i === 0 ? apag.map(e => e.id) : [] })
        enviadas.push(...lote)
      }
    }

    const fav = entradas.filter(e => e.tipo === 'favorecido')
    if (fav.length) {
      lote = fav
      await postSync({ type: 'payees', add: fav.filter(e => e.op === 'gravar').map(e => e.id), remove: fav.filter(e => e.op === 'apagar').map(e => e.id) })
      enviadas.push(...fav)
    }

    for (const e of entradas.filter(x => x.tipo === 'config')) {
      lote = [e]
      await enviarConfiguracoes(e.item.valores, e.item.campos)
      enviadas.push(e)
    }
    for (const e of entradas.filter(x => x.tipo === 'srf')) {
      lote = [e]
      await syncSrf(e.id, e.item || [])
      enviadas.push(e)
    }
    for (const e of entradas.filter(x => x.tipo === 'rateios')) {
      lote = [e]
      if (e.op === 'apagar') await deleteRateios(e.id)
      else await saveRateios(e.id, e.item || [])
      enviadas.push(e)
    }
  } catch (err) {
    err.enviadas = enviadas
    err.lote = err.lote || lote
    throw err
  }
  return enviadas
}

// Pergunta ao servidor (sem gravar) se os lançamentos da fila caem em período virado. Sem confirmação do
// usuário, lança com `periodoRecusado`. Sem resposta do servidor, a falha segue como qualquer outra de envio.
async function verificarPeriodoVirado(entradas) {
  const SECOES = ['lancamentos', 'reserve_functions']
  const toRow = Object.fromEntries(SECOES_SYNC.map(s => [s.tabela, s.toRow]))
  for (const tabela of SECOES) {
    const daTabela = entradas.filter(e => e.tipo === 'secao' && e.tabela === tabela)
    if (!daTabela.length) continue
    try {
      const r = await postSync({
        type: 'section', table: tabela, somenteVerificar: true,
        upsert: daTabela.filter(e => e.op === 'gravar').map(e => toRow[tabela](e.item)),
        delete: daTabela.filter(e => e.op === 'apagar').map(e => e.id),
      })
      if (r?.estornoConfirmado) return { tabela, lote: daTabela }
    } catch (err) {
      if (err?.codigo === 'periodo_virado') err.periodoRecusado = true
      err.lote = daTabela
      throw err
    }
  }
  return null
}

// Tipo da falha de envio:
//   'rede'     — sem conexão / servidor fora / sessão: tenta de novo depois, sem marcar nada;
//   'recusa'   — o servidor ou o banco recusou a alteração (validação, permissão, regra do banco):
//                repetir não adianta, a entrada fica marcada com erro até o usuário corrigir ou descartar;
//   'servidor' — erro 5xx sem motivo do banco: pode ser passageiro, tenta mais algumas vezes.
// Erro SEM resposta HTTP que não é de rede (ex.: um TypeError ao montar a linha de um item) é
// 'recusa': repetir não resolve e, tratado como rede, prendia o app em "Sem internet" com a internet
// funcionando. Assim o item fica marcado com o erro real e os outros seguem.
export function tipoDeFalha(err) {
  if (ehErroDeRede(err) || err?.status === 401 || err?.status === 408 || err?.status === 429) return 'rede'
  if (err?.status >= 500 && !err.dados?.codigoBanco) return 'servidor'
  return 'recusa'
}

// Envia a fila separando o que o servidor RECUSA: um lote recusado é reenviado item a item, para
// que um item com problema não prenda os outros. Devolve { enviadas, falhas: [{ entrada, err }] }.
// Falha de rede (ou exclusão em massa recusada pelo usuário) interrompe e é lançada como antes, com
// `err.enviadas` e `err.falhas` do que já se resolveu.
export async function enviarFilaIsolando(entradas, enviar = enviarFila) {
  const enviadas = []
  const falhas = []
  const interromper = (err) => { err.enviadas = [...enviadas]; err.falhas = falhas; return err }
  let resto = entradas
  while (resto.length) {
    try {
      enviadas.push(...await enviar(resto))
      break
    } catch (err) {
      const ok = err.enviadas || []
      enviadas.push(...ok)
      if (err.exclusaoRecusada || err.periodoRecusado || tipoDeFalha(err) === 'rede') throw interromper(err)
      const lote = err.lote?.length ? err.lote : resto.filter(e => !ok.includes(e))
      if (lote.length === 1) falhas.push({ entrada: lote[0], err })
      else {
        for (const e of lote) {
          try {
            enviadas.push(...await enviar([e]))
          } catch (err1) {
            if (err1.exclusaoRecusada || err1.periodoRecusado || tipoDeFalha(err1) === 'rede') throw interromper(err1)
            falhas.push({ entrada: e, err: err1 })
          }
        }
      }
      const fora = new Set([...ok, ...lote])
      resto = resto.filter(e => !fora.has(e))
    }
  }
  return { enviadas, falhas }
}

// Motivo da recusa em português, para o aviso e o painel. `err.dados` = corpo da resposta da API
// ({ error, codigo, codigoBanco, coluna }).
const MOTIVO_DO_BANCO = {
  23505: 'já existe um registro igual (duplicado)',
  23503: 'ele depende de outro item que não existe mais (por exemplo, uma conta ou categoria apagada)',
  23502: 'falta preencher um campo obrigatório',
  23514: 'um valor não é aceito pelas regras do sistema',
  22001: 'um texto passou do tamanho permitido',
  22003: 'um número passou do tamanho permitido',
  '22P02': 'algum valor está em formato inválido (data ou número)',
  22007: 'uma data está em formato inválido',
  22008: 'uma data está fora do permitido',
  42703: 'o banco deste ambiente está desatualizado (falta um campo) — avise o suporte',
  '42P01': 'o banco deste ambiente está desatualizado (falta uma tabela) — avise o suporte',
}
export function motivoDaRecusa(err) {
  const d = err?.dados || {}
  const doBanco = MOTIVO_DO_BANCO[d.codigoBanco]
  if (doBanco) return d.coluna && d.codigoBanco === '23502' ? `${doBanco} (${d.coluna})` : doBanco
  if (err?.status === 403) return 'seu nível de acesso não permite esta alteração'
  if (err?.status === 413) return 'a alteração é grande demais para enviar de uma vez'
  if (err?.status >= 500) return `o servidor não conseguiu gravar (erro ${err.status})`
  if (d.error) return String(d.error)
  if (!err?.status) return `erro no aplicativo ao preparar o envio${err?.message ? `: ${err.message}` : ''}`
  return `o servidor recusou a alteração${err?.status ? ` (erro ${err.status})` : ''}`
}

// Erro de rede (a requisição não chegou a ter resposta: sem conexão, servidor fora, tempo esgotado)
// × erro de resposta (o servidor respondeu com falha) × erro do próprio app (sem status e sem ser de
// rede). Os fetch de src/lib/db.js marcam `semResposta`; o TypeError do fetch também é reconhecido.
export const ehErroDeRede = (err) => {
  if (!err || err.status) return false
  if (err.semResposta || err.semConexao) return true
  return (err.name === 'TypeError' && /fetch|network|load failed/i.test(String(err.message || '')))
    || err.name === 'AbortError' || err.name === 'TimeoutError'
}

// Texto do painel de pendências: "Lançamento · Mercado" etc.
const NOMES_EXTRA = { configuracoes: 'configurações', schedule_reserva_funcoes: 'detalhamento de fatura', lancamento_rateios: 'rateios' }
export function rotuloDaEntrada(e) {
  const tela = NOMES_NA_TELA[e.tabela] || NOMES_EXTRA[e.tabela] || e.tabela
  const it = e.item
  const nome = e.tipo === 'config' ? (e.item?.campos || []).length + ' campo(s)'
    : e.tipo === 'favorecido' ? e.id
      : (it && !Array.isArray(it) && (it.description || it.name || it.payee || it.padrao)) || e.id
  return { tela, nome, acao: e.op === 'apagar' ? 'exclusão' : 'alteração' }
}
