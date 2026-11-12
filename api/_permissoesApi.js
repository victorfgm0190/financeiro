import { pode, MODULO_DA_TABELA, podeGravarConfiguracoes, temTodosPerfis } from '../src/lib/permissoes.js'
import { ErroHttp } from './_usuarios.js'

// Autorização do /api/sync e recorte por PERFIS PERMITIDOS (leitura e gravação). As regras de
// módulo/ação estão em src/lib/permissoes.js; aqui só o que precisa do banco.

// Tabelas cujo dado pertence a uma conta (recortadas pelos perfis permitidos).
const TABELAS_COM_CONTA = new Set(['contas', 'cartoes', 'lancamentos', 'agendamentos'])
// Colunas a mais para decidir o dono de ganho/perda de venda de bem (só lançamentos as têm em uso).
const COLUNAS_DO_BEM = { lancamentos: ', origin, bem_id' }

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
  // Ganho/perda de venda de bem (sem conta): segue o perfil do bem vendido (comBemVendido); sem
  // movimentação, o bem ligado. O bem também é uma conta.
  if (r.origin === 'patrimonio_auto' && (r.bem_vendido_id || r.bem_id)) return contas.has(r.bem_vendido_id || r.bem_id)
  return !!r.reserva_funcao_id && funcoes.has(r.reserva_funcao_id)
}

// O bem vendido de um lançamento, em SQL: fonte única da regra, para leitura, gravação e busca.
// A troca cria um lançamento e uma movimentação por bem dado em pagamento, então não há duas baixas no
// mesmo lançamento. Se um dado manual criar esse caso, MIN mantém o resultado igual em qualquer ordem.
export const sqlBemVendido = (lancamentoId) =>
  `(SELECT MIN(m.bem_origem_id) FROM bem_movimentacoes m WHERE m.lancamento_id = ${lancamentoId})`

// Acrescenta `bem_vendido_id` às linhas de ganho/perda de venda de bem, pela movimentação do bem (o bem
// baixado, bem_origem_id). Calculado, nunca gravado: vale para lançamentos novos e antigos.
export async function comBemVendido(q, rows) {
  const ids = rows.filter(r => r.origin === 'patrimonio_auto' && !r.account_id && !r.to_account_id).map(r => r.id)
  if (!ids.length) return rows
  const achados = await q(`SELECT u.id, ${sqlBemVendido('u.id')} AS bem FROM unnest($1::text[]) AS u(id)`, [ids])
  const porLanc = new Map(achados.filter(a => a.bem).map(a => [a.id, a.bem]))
  for (const r of rows) if (porLanc.has(r.id)) r.bem_vendido_id = porLanc.get(r.id)
  return rows
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
      ? (tabela === 'contas' ? `"${idCol}", profile_id` : `"${idCol}", account_id, to_account_id, reserva_funcao_id${COLUNAS_DO_BEM[tabela] || ''}`)
      : `"${idCol}"`
    const linhas = await q(`SELECT ${cols} FROM ${tabela} WHERE "${idCol}" = ANY($1)`, [ids])
    if (ctx && tabela === 'lancamentos') await comBemVendido(q, linhas)
    for (const r of linhas) existentes.set(r[idCol], r)
  }
  const permitida = (r) => !ctx || linhaPermitida(tabela, r, ctx.contas, ctx.funcoes, ctx.perfis)
  // A versão enviada não escolhe o dono do ganho/perda de bem: o app nem manda bem_id e o bem vendido
  // é calculado aqui. Vale o vínculo gravado; bem_vendido_id vindo do cliente é ignorado.
  const versaoEnviada = (r, atual) => {
    if (tabela !== 'lancamentos') return r
    const enviada = { ...r }
    delete enviada.bem_vendido_id
    if (atual?.origin !== 'patrimonio_auto') return enviada
    return { ...enviada, origin: atual.origin, bem_id: atual.bem_id, bem_vendido_id: atual.bem_vendido_id }
  }

  const upOk = upsert.filter(r => {
    const atual = existentes.get(r?.[idCol])
    if (atual) return perm.editar && permitida(atual) && permitida(versaoEnviada(r, atual))
    return perm.incluir && permitida(versaoEnviada(r))
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
  const rows = await q(`SELECT id, account_id, to_account_id, reserva_funcao_id${COLUNAS_DO_BEM[tabela] || ''} FROM ${tabela} WHERE id = ANY($1)`, [lista])
  if (tabela === 'lancamentos') await comBemVendido(q, rows)
  if (rows.some(r => !linhaPermitida(tabela, r, ctx.contas, ctx.funcoes, ctx.perfis))) {
    throw new ErroHttp(403, 'Sem permissão para registros de um perfil não permitido')
  }
}

// ─── POST /api/historico (edição + histórico na mesma transação) ─────────────────────────────────
// Tudo ou nada: cada linha enviada passa pela mesma regra do /api/sync (módulo da tabela + perfis
// permitidos, conferidos pela versão GRAVADA no banco e pela enviada); qualquer linha recusada → 403
// e nada é gravado. As linhas de histórico também: o registro (entidade_id) gravado no banco precisa
// ser de um perfil permitido, e o usuário precisa poder gravar no módulo daquela entidade.
const TABELA_DA_ENTIDADE = { agendamento: ['agendamentos', 'agendamentos'], lancamento: ['lancamentos', 'lancamentos'] }

export async function autorizarEdicaoComHistorico(q, user, body) {
  for (const [tabela, modulo] of Object.values(TABELA_DA_ENTIDADE)) {
    const linhas = Array.isArray(body?.[tabela]) ? body[tabela] : []
    if (!linhas.length) continue
    const r = await filtrarGravacao(q, user, { tabela, modulo, upsert: linhas })
    if (r.filtradas > 0) throw new ErroHttp(403, 'Sem permissão para gravar registros de um perfil não permitido')
  }
  const idsPorEntidade = new Map()
  for (const l of Array.isArray(body?.historico) ? body.historico : []) {
    if (!TABELA_DA_ENTIDADE[l?.entidade] || l?.entidade_id == null) continue
    if (!idsPorEntidade.has(l.entidade)) idsPorEntidade.set(l.entidade, [])
    idsPorEntidade.get(l.entidade).push(String(l.entidade_id))
  }
  for (const [entidade, ids] of idsPorEntidade) {
    const [tabela, modulo] = TABELA_DA_ENTIDADE[entidade]
    if (!pode(user, modulo, 'incluir') && !pode(user, modulo, 'editar') && !pode(user, modulo, 'excluir')) {
      throw new ErroHttp(403, `Sem permissão para gravar em ${modulo}`)
    }
    await exigirLinhasPermitidas(q, user, tabela, ids)
  }
}

// Rateio: o lancamento_id do rateio é um lançamento OU um agendamento (rateio do agendamento).
export async function exigirDonoDoRateio(q, user, id) {
  await exigirLinhasPermitidas(q, user, 'lancamentos', [id])
  await exigirLinhasPermitidas(q, user, 'agendamentos', [id])
}

// Leitura de lançamentos (rows com account_id/to_account_id/reserva_funcao_id): só os dos perfis.
export async function recortarLancamentos(q, user, rows) {
  const ctx = await contextoPerfis(q, user)
  if (ctx) await comBemVendido(q, rows)
  return recortarLeitura('lancamentos', rows, ctx)
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
