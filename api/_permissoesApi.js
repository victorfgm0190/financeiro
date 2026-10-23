import { pode, MODULO_DA_TABELA, podeGravarConfiguracoes, temTodosPerfis } from '../src/lib/permissoes.js'
import { ErroHttp } from './_usuarios.js'

// Autorização do /api/sync e recorte por PERFIS PERMITIDOS (leitura e gravação). As regras de
// módulo/ação estão em src/lib/permissoes.js; aqui só o que precisa do banco.

// Tabelas cujo dado pertence a uma conta (recortadas pelos perfis permitidos).
const TABELAS_COM_CONTA = new Set(['contas', 'cartoes', 'lancamentos', 'agendamentos'])

// Contas (ids) dos perfis permitidos. Conta sem perfil não entra: só "todos" a vê.
export async function contasPermitidas(q, perfis) {
  const rows = await q('SELECT id FROM contas WHERE profile_id = ANY($1)', [perfis])
  return new Set(rows.map(r => r.id))
}

// Funções de reserva das contas permitidas — sombras de reserva (lançamento sem conta) pertencem à
// conta da função.
async function funcoesPermitidas(q, contas) {
  const rows = await q('SELECT id FROM reserve_functions WHERE account_id = ANY($1)', [[...contas]])
  return new Set(rows.map(r => r.id))
}

// A linha (snake_case) pertence às contas permitidas?
export function linhaPermitida(tabela, r, contas, funcoes = new Set(), perfis = []) {
  if (!r) return false
  if (tabela === 'contas') return !!r.profile_id && perfis.includes(r.profile_id)
  if (tabela === 'cartoes') return contas.has(r.id)
  const temConta = r.account_id || r.to_account_id
  if (temConta) return contas.has(r.account_id) || contas.has(r.to_account_id)
  return !!r.reserva_funcao_id && funcoes.has(r.reserva_funcao_id)
}

// Recorta as linhas de LEITURA de uma tabela pelos perfis permitidos (null = sem recorte).
export function recortarLeitura(tabela, rows, ctx) {
  if (!ctx || !TABELAS_COM_CONTA.has(tabela)) return rows
  return rows.filter(r => linhaPermitida(tabela, r, ctx.contas, ctx.funcoes, ctx.perfis))
}

export async function contextoPerfis(q, user) {
  if (temTodosPerfis(user?.perfis)) return null
  const perfis = user.perfis
  const contas = await contasPermitidas(q, perfis)
  return { perfis, contas, funcoes: await funcoesPermitidas(q, contas) }
}

// Filtra { upsert, delete } de uma tabela para o que o usuário pode gravar:
//   linha NOVA (id fora do banco) → incluir; linha existente → editar; delete → excluir;
//   e, com perfis restritos, só linhas das contas permitidas (a nova versão E a gravada).
// Nada permitido em um pedido que tinha conteúdo → 403. Devolve { upsert, delete, filtradas }.
export async function filtrarGravacao(q, user, { tabela, modulo, upsert = [], del = [], idCol = 'id', extraContas = [] }) {
  const perm = {
    incluir: pode(user, modulo, 'incluir'), editar: pode(user, modulo, 'editar'), excluir: pode(user, modulo, 'excluir'),
  }
  const ctx = TABELAS_COM_CONTA.has(tabela) ? await contextoPerfis(q, user) : null
  if (ctx) for (const id of extraContas) ctx.contas.add(id)
  const total = upsert.length + del.length
  if (perm.incluir && perm.editar && perm.excluir && !ctx) return { upsert, delete: del, filtradas: 0 }
  if (!perm.incluir && !perm.editar && !perm.excluir) {
    if (total > 0) throw new ErroHttp(403, `Sem permissão para gravar em ${modulo}`)
    return { upsert: [], delete: [], filtradas: 0 }
  }

  const ids = [...new Set([...upsert.map(r => r?.[idCol]), ...del].filter(v => v != null))]
  const existentes = new Map()
  if (ids.length) {
    const cols = ctx && tabela !== 'cartoes'
      ? (tabela === 'contas' ? `"${idCol}", profile_id` : `"${idCol}", account_id, to_account_id, reserva_funcao_id`)
      : `"${idCol}"`
    for (const r of await q(`SELECT ${cols} FROM ${tabela} WHERE "${idCol}" = ANY($1)`, [ids])) existentes.set(r[idCol], r)
  }
  const permitida = (r) => !ctx || linhaPermitida(tabela, r, ctx.contas, ctx.funcoes, ctx.perfis)

  const upOk = upsert.filter(r => {
    const atual = existentes.get(r?.[idCol])
    if (atual) return perm.editar && permitida(atual) && permitida(r)
    return perm.incluir && permitida(r)
  })
  const delOk = perm.excluir ? del.filter(id => { const atual = existentes.get(id); return !atual || permitida(atual) }) : []
  const filtradas = total - upOk.length - delOk.length
  if (total > 0 && upOk.length + delOk.length === 0) throw new ErroHttp(403, `Sem permissão para gravar em ${modulo}`)
  return { upsert: upOk, delete: delOk, filtradas }
}

// Autoriza um corpo do /api/sync. Devolve o corpo (filtrado) a gravar; 403 via ErroHttp.
export async function autorizarSync(q, user, body) {
  const { type } = body || {}
  if (type === 'settings') {
    if (!podeGravarConfiguracoes(user)) throw new ErroHttp(403, 'Sem permissão para gravar configurações')
    return body
  }
  if (type === 'payees') {
    if (!pode(user, 'lancamentos', 'incluir') && !pode(user, 'lancamentos', 'editar')) {
      if ((body.add || []).length || (body.remove || []).length) throw new ErroHttp(403, 'Sem permissão para gravar favorecidos')
    }
    return pode(user, 'lancamentos', 'excluir') ? body : { ...body, remove: [] }
  }
  if (type === 'accounts') {
    const contas = await filtrarGravacao(q, user, { tabela: 'contas', modulo: 'contas', upsert: body.upsert || [], del: body.delete || [] })
    const cards = await filtrarGravacao(q, user, { tabela: 'cartoes', modulo: 'contas', upsert: body.cards || [], del: body.deleteCards || [], extraContas: contas.upsert.map(r => r.id) })
      .catch(err => { if (err instanceof ErroHttp && contas.upsert.length + contas.delete.length > 0) return { upsert: [], delete: [] }; throw err })
    return { ...body, upsert: contas.upsert, delete: contas.delete, cards: cards.upsert, deleteCards: cards.delete }
  }
  if (type === 'section') {
    const tabela = body.table
    const modulo = MODULO_DA_TABELA[tabela]
    if (!modulo) {
      // Tabela fora do mapa: só quem configura o sistema grava.
      if (!pode(user, 'configuracoes', 'editar')) throw new ErroHttp(403, `Sem permissão para gravar em ${tabela}`)
      return body
    }
    if (tabela === 'configuracoes' && podeGravarConfiguracoes(user)) return body
    const r = await filtrarGravacao(q, user, { tabela, modulo, upsert: body.upsert || [], del: body.delete || [] })
    return { ...body, upsert: r.upsert, delete: r.delete }
  }
  return body
}

// ─── Rotas fora do /api/sync (GRAFITY B3/B4) ─────────────────────────────────────────────────────
// Mesmo recorte por perfis permitidos das gravações/leituras do sync, para as rotas que recebem ids.
// Usuário com "todos" os perfis passa sem consulta extra.

const TABELAS_POR_ID = new Set(['lancamentos', 'agendamentos'])

// Gravação por ids: algum id EXISTENTE é de conta fora dos perfis permitidos → 403 (nada é gravado).
// Id que não existe não protege nada de ninguém (linha ainda não sincronizada) e passa.
export async function exigirLinhasPermitidas(q, user, tabela, ids) {
  if (!TABELAS_POR_ID.has(tabela)) throw new Error(`exigirLinhasPermitidas: tabela inválida (${tabela})`)
  const lista = [...new Set((ids || []).filter(v => v != null).map(String))]
  if (!lista.length) return
  const ctx = await contextoPerfis(q, user)
  if (!ctx) return
  const rows = await q(`SELECT id, account_id, to_account_id, reserva_funcao_id FROM ${tabela} WHERE id = ANY($1)`, [lista])
  if (rows.some(r => !linhaPermitida(tabela, r, ctx.contas, ctx.funcoes, ctx.perfis))) {
    throw new ErroHttp(403, 'Sem permissão para registros de um perfil não permitido')
  }
}

// Rateio: o lancamento_id do rateio é um lançamento OU um agendamento (rateio do agendamento).
export async function exigirDonoDoRateio(q, user, id) {
  await exigirLinhasPermitidas(q, user, 'lancamentos', [id])
  await exigirLinhasPermitidas(q, user, 'agendamentos', [id])
}

// Leitura de lançamentos (rows com account_id/to_account_id/reserva_funcao_id): só os dos perfis.
export async function recortarLancamentos(q, user, rows) {
  return recortarLeitura('lancamentos', rows, await contextoPerfis(q, user))
}

// Leitura por conta (ex.: conferência de fatura do cartão): conta fora dos perfis → 403.
export async function exigirContaPermitida(q, user, accountId) {
  const ctx = await contextoPerfis(q, user)
  if (ctx && !ctx.contas.has(accountId)) throw new ErroHttp(403, 'Sem permissão para esta conta')
}

// Leitura por função de reserva: função de conta fora dos perfis → false.
export async function funcaoPermitida(q, user, funcaoId) {
  const ctx = await contextoPerfis(q, user)
  return !ctx || ctx.funcoes.has(funcaoId)
}
