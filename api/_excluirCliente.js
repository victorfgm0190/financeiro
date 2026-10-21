import { centralQuery, withCentralTransaction, _limparCacheAmbientes } from './_central.js'
import { nomeDatabaseCentral, fecharPoolDoDatabase, poolAdminDoDatabase } from './_conexao.js'
import { papelDoBanco } from './_usuarioBanco.js'
import { ErroHttp } from './_usuarios.js'
import { buscarCliente, registrarHistorico } from './_plataforma.js'
import { excluirDatabase, RE_DATABASE_CLIENTE, ErroNeon } from './_neon.js'
import { SIGLAS_RESERVADAS } from '../src/lib/plataforma.js'
import { AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'

// EXCLUIR CLIENTE (Controle de Clientes, só PLATAFORMA_ADMIN). Só cliente CANCELADO ou que NUNCA foi
// aprovado (sem ambiente). Apaga, nesta ordem, com retomada se falhar no meio:
//   a) o database cliente_<sigla> no Neon (lá estão usuários, organização e senha_tokens do cliente);
//      ao terminar grava 'excl_database' no histórico — repetir pula este passo;
//   b) no central, numa transação: login_handoff, senha_pedidos e agenda_feeds do ambiente, o ambiente, o
//      histórico e o cadastro do cliente;
//   c) na MESMA transação, a auditoria em plataforma_exclusoes (sigla, nome, data, autor; sem senha
//      nem token).
// Depois disso a sigla fica livre. NUNCA toca no neondb (nem nas plataforma_* antigas dele): o
// database do cliente tem de ser cliente_<sigla> e o central não pode ser o neondb.

const PROTEGIDOS = ['neondb', 'finup_central']

async function ambienteDoCliente(q, c) {
  const [amb] = await q('SELECT id, sigla, nome, database_name, status, cliente_id FROM ambientes WHERE cliente_id = $1 OR sigla = $2 ORDER BY (cliente_id = $1) DESC LIMIT 1', [c.id, c.sigla])
  return amb || null
}

// Pode excluir? (sem a sigla digitada). Devolve { pode, motivo }.
export function situacaoExclusao(c, amb, { central = nomeDatabaseCentral() } = {}) {
  const sigla = String(c?.sigla || '')
  if (!sigla) return { pode: false, motivo: 'Cliente sem sigla' }
  if (sigla === AMBIENTE_PRINCIPAL || SIGLAS_RESERVADAS.includes(sigla)) return { pode: false, motivo: 'Sigla reservada: este ambiente não pode ser excluído' }
  // O central nunca pode ser o banco do vm (as plataforma_* antigas do neondb não são tocadas).
  if (central === 'neondb') return { pode: false, motivo: 'Banco central inválido para exclusão' }
  if (amb) {
    if (amb.cliente_id !== c.id || amb.sigla !== sigla) return { pode: false, motivo: `A sigla ${sigla} pertence a outro ambiente` }
    const db = amb.database_name
    if (!RE_DATABASE_CLIENTE.test(db) || db !== `cliente_${sigla}` || PROTEGIDOS.includes(db) || db === central) {
      return { pode: false, motivo: `Database "${db}" não é um banco de cliente` }
    }
    if (c.status !== 'cancelado' || amb.status !== 'cancelado') return { pode: false, motivo: 'Cancele o cliente antes de excluir' }
    return { pode: true }
  }
  if (!['pedido', 'recusado', 'cancelado'].includes(c.status)) return { pode: false, motivo: 'Cancele o cliente antes de excluir' }
  return { pode: true }
}

export async function situacaoExclusaoDoCliente(q, c) {
  return situacaoExclusao(c, await ambienteDoCliente(q, c))
}

// Usuário próprio do banco (R7, api/_usuarioBanco.js): antes do DROP o database volta para o
// neondb_owner (o Neon exclui como sempre excluiu); depois, o papel <database>_app é removido.
// Banco que já não existe (nova tentativa, 3D000) → segue. Qualquer outra falha PARA a exclusão:
// sem o dono devolvido não se pede o DROP ao Neon.
async function devolverDonoAoAdmin(database) {
  try {
    await poolAdminDoDatabase(database).query(
      "DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO CURRENT_USER', current_database()); END $$")
  } catch (err) {
    if (err?.code === '3D000') return
    throw new Error(`dono de ${database} não devolvido ao admin: ${err.message}`, { cause: err })
  }
}
async function excluirPapel(database) {
  await poolAdminDoDatabase(nomeDatabaseCentral()).query(`DROP ROLE IF EXISTS "${papelDoBanco(database)}"`)
}

export async function excluirCliente(clienteId, { confirmacao, autor = null, neon = {} } = {}) {
  const c = await buscarCliente(centralQuery, clienteId)
  if (!c) throw new ErroHttp(404, 'Cliente não encontrado')
  const amb = await ambienteDoCliente(centralQuery, c)
  const sit = situacaoExclusao(c, amb)
  if (!sit.pode) throw new ErroHttp(409, sit.motivo)
  if (String(confirmacao ?? '').trim().toLowerCase() !== c.sigla) throw new ErroHttp(400, 'A sigla digitada não confere')

  // a) database no Neon
  let database = 'sem database (cliente nunca aprovado)'
  if (amb) {
    const [{ feito }] = await centralQuery("SELECT count(*) > 0 AS feito FROM plataforma_historico WHERE cliente_id = $1 AND evento = 'excl_database'", [c.id])
    if (!feito) {
      try {
        await devolverDonoAoAdmin(amb.database_name)
        await fecharPoolDoDatabase(amb.database_name)
        const { excluido } = await excluirDatabase(amb.database_name, { ...neon, protegidos: [nomeDatabaseCentral()] })
        await excluirPapel(amb.database_name)
        await registrarHistorico(centralQuery, c.id, 'excl_database', `Database ${amb.database_name} ${excluido ? 'excluído do Neon' : 'já não existia no Neon'}`, autor)
      } catch (err) {
        const msg = err instanceof ErroNeon || err instanceof ErroHttp ? err.message : `erro interno (${err.message})`
        await registrarHistorico(centralQuery, c.id, 'excl_falhou', `Exclusão do database: ${msg}`.slice(0, 1000), autor).catch(() => {})
        throw err instanceof ErroNeon ? new ErroHttp(err.status, err.message) : err
      }
    }
    database = `${amb.database_name} excluído`
  }

  // b) + c) central e auditoria, juntos
  const apagado = await withCentralTransaction(async (q) => {
    const atual = await buscarCliente(q, c.id, { travar: true })
    if (!atual) throw new ErroHttp(404, 'Cliente não encontrado')
    const conta = async (sql, p) => (await q(`SELECT count(*)::int AS n FROM ${sql}`, p))[0].n
    const n = { login_handoff: 0, senha_pedidos: 0, agenda_feeds: 0, ambiente: 0 }
    if (amb) {
      n.login_handoff = await conta('login_handoff WHERE ambiente_id = $1', [amb.id])
      n.senha_pedidos = await conta('senha_pedidos WHERE ambiente_id = $1 OR chave LIKE $2', [amb.id, `usr:${amb.id}:%`])
      n.agenda_feeds = await conta('agenda_feeds WHERE ambiente_sigla = $1', [amb.sigla])
      n.ambiente = await conta('ambientes WHERE id = $1 AND cliente_id = $2', [amb.id, c.id])
      if (n.login_handoff) await q('DELETE FROM login_handoff WHERE ambiente_id = $1', [amb.id])
      if (n.senha_pedidos) await q('DELETE FROM senha_pedidos WHERE ambiente_id = $1 OR chave LIKE $2', [amb.id, `usr:${amb.id}:%`])
      // Agenda no celular: os feeds do ambiente (o cache vai junto, ON DELETE CASCADE).
      if (n.agenda_feeds) await q('DELETE FROM agenda_feeds WHERE ambiente_sigla = $1', [amb.sigla])
      if (n.ambiente) await q('DELETE FROM ambientes WHERE id = $1 AND cliente_id = $2', [amb.id, c.id])
    }
    n.historico = await conta('plataforma_historico WHERE cliente_id = $1', [c.id])
    if (n.historico) await q('DELETE FROM plataforma_historico WHERE cliente_id = $1', [c.id])
    n.cliente = await conta('plataforma_clientes WHERE id = $1', [c.id])
    await q('DELETE FROM plataforma_clientes WHERE id = $1', [c.id])
    const detalhe = `${database} · central: ${n.ambiente} ambiente, ${n.login_handoff} login_handoff, ${n.senha_pedidos} senha_pedidos, ${n.agenda_feeds} agenda_feeds, ${n.historico} histórico, ${n.cliente} cadastro`
    await q(
      `INSERT INTO plataforma_exclusoes (cliente_id, sigla, nome, email, database_name, autor, detalhe)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [c.id, c.sigla, c.nome, c.email, amb?.database_name || null, autor, detalhe],
    )
    return { ...n, detalhe }
  })
  _limparCacheAmbientes()
  return { ok: true, sigla: c.sigla, apagado }
}
