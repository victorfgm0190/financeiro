import crypto from 'node:crypto'
import { centralQuery, withCentralTransaction, _limparCacheAmbientes } from './_central.js'
import { rodarNoAmbiente, poolAdminDoDatabase, conexaoAdminVerificada } from './_conexao.js'
import { cifrarSenha, aadDoAmbiente } from './_cifraDb.js'
import { papelDoBanco, gerarSenhaDoBanco, criarOuAtualizarPapel, transferirDono, fecharConexao, comoDonoDoBanco } from './_usuarioBanco.js'
import { ErroHttp, hashSenha } from './_usuarios.js'
import { buscarCliente, registrarHistorico, siglaOcupada } from './_plataforma.js'
import { criarDatabase, ErroNeon } from './_neon.js'
import { ESTRUTURA_BASE, MIGRACOES } from './_sqlEmbutido.js'
import { aplicarKitBasico } from './_kitBasico.js'
import { gerarTokenSenha } from './_senhaTokens.js'
import { enviarEmail, ErroEmail } from './_email.js'
import { modeloBoasVindas } from './_emailBoasVindas.js'
import { urlDefinirSenha } from './_emailSenha.js'
import { problemaSigla, DOMINIO_CLIENTES } from '../src/lib/plataforma.js'

// PONTO ÚNICO de provisionamento de um cliente da plataforma (botão Aprovar do Controle de Clientes;
// no futuro o aviso da plataforma de pagamento chama ESTA mesma função).
//
// Cria o AMBIENTE do cliente em PASSOS. Cada chamada de provisionarProximoPasso() executa UM passo
// pendente e devolve o andamento — a tela chama de novo até concluir (mostra o progresso e nunca
// estoura o tempo de uma função da Vercel). Cada passo é idempotente e, ao terminar, grava o evento
// prov_<passo> no plataforma_historico: se falhar no meio, "Tentar novamente" continua do passo que
// falhou e repetir um passo não duplica nada.
//
// REGRA: o banco do cliente nasce VAZIO — só a estrutura (supabase/estrutura_base.sql, sem dados) +
// migrações + o kit básico (api/_kitBasico.js). NADA é copiado do neondb.

export const PASSOS = [
  { id: 'ambiente', rotulo: 'Registro do ambiente' },
  { id: 'database', rotulo: 'Banco de dados no Neon' },
  { id: 'usuario', rotulo: 'Usuário próprio do banco' },
  { id: 'estrutura', rotulo: 'Estrutura (tabelas e migrações)' },
  { id: 'kit', rotulo: 'Kit básico' },
  { id: 'admin', rotulo: 'Organização e usuário admin' },
  { id: 'convite', rotulo: 'E-mail de boas-vindas com o convite' },
  { id: 'ativar', rotulo: 'Ativar o ambiente' },
]
const evento = (passo) => `prov_${passo}`

// Estados de onde dá para provisionar ('aprovado' = provisionamento em andamento).
const PODE_PROVISIONAR = ['pedido', 'recusado', 'aprovado']

export const databaseDoCliente = (sigla) => `cliente_${sigla}`
export const enderecoDoCliente = (sigla) => `https://${sigla}.${DOMINIO_CLIENTES}`
const nomeDoAmbiente = (c) => String((c.tipo_pessoa === 'PJ' && c.empresa) || c.nome).trim().slice(0, 150)

// Texto para copiar / WhatsApp (o e-mail leva o botão do convite).
export function mensagemBoasVindas(c) {
  const primeiroNome = String(c.nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  return [
    `Olá, ${primeiroNome}! Seu pedido para usar o Finup foi aprovado e o seu ambiente está pronto.`,
    '',
    `Acesse: https://${DOMINIO_CLIENTES}`,
    `Ambiente: ${String(c.sigla).toUpperCase()}`,
    `Usuário: admin (ou o e-mail ${c.email})`,
    `Endereço do seu ambiente: ${enderecoDoCliente(c.sigla)}`,
    '',
    `Enviamos para ${c.email} o link para você criar a sua senha (vale 48 horas).`,
    'Qualquer dúvida, é só responder esta mensagem.',
  ].join('\n')
}

async function ambienteDoCliente(q, c) {
  // Sem db_senha_cifrada: o ambiente daqui nunca carrega a senha do banco.
  const [amb] = await q('SELECT id, sigla, nome, database_name, status, cliente_id, schema_versao FROM ambientes WHERE cliente_id = $1 OR sigla = $2 ORDER BY (cliente_id = $1) DESC LIMIT 1', [c.id, c.sigla])
  return amb || null
}

async function passosFeitos(q, clienteId) {
  const rows = await q('SELECT DISTINCT evento FROM plataforma_historico WHERE cliente_id = $1 AND evento LIKE $2', [clienteId, 'prov\\_%'])
  return new Set(rows.map(r => r.evento))
}

// Andamento para a tela.
export async function estadoProvisionamento(q, clienteId) {
  const cliente = await buscarCliente(q, clienteId)
  if (!cliente) throw new ErroHttp(404, 'Cliente não encontrado')
  const feitos = await passosFeitos(q, cliente.id)
  const passos = PASSOS.map(p => ({ ...p, feito: feitos.has(evento(p.id)) }))
  const concluido = passos.every(p => p.feito)
  return {
    cliente, passos, concluido,
    proximo: passos.find(p => !p.feito)?.id || null,
    endereco: cliente.sigla ? enderecoDoCliente(cliente.sigla) : null,
    ...(concluido ? { mensagem: mensagemBoasVindas(cliente) } : {}),
  }
}

// Transação no banco do CLIENTE como neondb_owner (pool admin), com SET LOCAL ROLE <database>_app
// quando o usuário próprio já existe: tabelas e linhas do provisionamento nascem com dono certo, sem os
// limites de tempo das sessões do papel. rodarNoAmbiente mantém o contexto para quem lê o ambiente.
const noCliente = (amb, fn) => rodarNoAmbiente(amb, async () => {
  const client = await poolAdminDoDatabase(amb.database_name).connect()
  try {
    return await comoDonoDoBanco(client, amb.database_name, fn)
  } finally {
    client.release()
  }
})

async function idDoAdmin(q) {
  const [u] = await q("SELECT id FROM usuarios WHERE username = 'admin'")
  return u?.id || null
}

// Gera o convite (48 h) do admin no banco do cliente e envia o e-mail de boas-vindas com o botão.
// Devolve o id do Resend. O token só existe no e-mail (no banco, o hash).
async function enviarConvite(amb, c, { enviar = enviarEmail } = {}) {
  const token = await noCliente(amb, async (q) => {
    const id = await idDoAdmin(q)
    if (!id) throw new ErroHttp(409, 'Usuário admin não encontrado no ambiente')
    return gerarTokenSenha(q, id, 'convite')
  })
  const { assunto, html, texto } = modeloBoasVindas(c, { url: urlDefinirSenha(c.sigla, token) })
  try {
    const { id } = await enviar({ para: c.email, assunto, html, texto })
    return id
  } catch (err) {
    if (err instanceof ErroEmail) throw new ErroHttp(err.status, `E-mail não enviado: ${err.message}`)
    throw err
  }
}

const EXECUTAR = {
  // a) Linha em ambientes ('provisionando', cliente_<sigla>) e cliente 'aprovado'.
  async ambiente(q, c, { autor }) {
    const amb = await ambienteDoCliente(q, c)
    if (amb && amb.cliente_id !== c.id) throw new ErroHttp(409, `A sigla ${c.sigla} já é de outro ambiente`)
    if (!amb) {
      await q(`INSERT INTO ambientes (sigla, nome, database_name, status, cliente_id) VALUES ($1, $2, $3, 'provisionando', $4)
               ON CONFLICT (sigla) DO NOTHING`, [c.sigla, nomeDoAmbiente(c), databaseDoCliente(c.sigla), c.id])
    }
    if (c.status !== 'aprovado') {
      await q("UPDATE plataforma_clientes SET status = 'aprovado', updated_at = now() WHERE id = $1", [c.id])
      await registrarHistorico(q, c.id, 'aprovado', `Status ${c.status} → aprovado · sigla ${c.sigla}`, autor)
    }
    return `ambiente ${c.sigla} · database ${databaseDoCliente(c.sigla)}`
  },
  // b) Database no Neon (já existente → segue).
  async database(q, c, { neon }) {
    const amb = await ambienteDoCliente(q, c)
    const { criado } = await criarDatabase(amb.database_name, neon)
    return `${amb.database_name} ${criado ? 'criado' : 'já existia'}`
  },
  // b2) Usuário Postgres próprio do banco (R7): papel <database>_app, dono do banco, CONNECT só para
  // ele e o neondb_owner, senha cifrada no central. Repetir = senha nova (o ambiente ainda não está no ar).
  async usuario(q, c) {
    const amb = await ambienteDoCliente(q, c)
    const papel = papelDoBanco(amb.database_name)
    const senha = gerarSenhaDoBanco()
    const cifrada = cifrarSenha(senha, aadDoAmbiente(amb.id, amb.database_name)) // sem FINUP_DB_KEY → erro antes de mexer no banco
    const client = await conexaoAdminVerificada(amb.database_name) // a senha vai em texto no CREATE ROLE
    let situacao
    try {
      const aq = async (sql, params = []) => (await client.query(sql, params)).rows
      await client.query('BEGIN')
      try {
        situacao = await criarOuAtualizarPapel(aq, papel, senha)
        await transferirDono(aq, papel)
        await fecharConexao(aq, papel)
        await client.query('COMMIT')
      } catch (err) {
        try { await client.query('ROLLBACK') } catch { /* ignore */ }
        throw err
      }
    } finally {
      client.release()
    }
    await q('UPDATE ambientes SET db_usuario = $2, db_senha_cifrada = $3, updated_at = now() WHERE id = $1', [amb.id, papel, cifrada])
    return `${papel} ${situacao}`
  },
  // c) Estrutura base + migrações, numa transação, registradas em _migracoes.
  async estrutura(q, c) {
    const amb = await ambienteDoCliente(q, c)
    const versao = await noCliente(amb, async (cq, client) => {
      await cq(`CREATE TABLE IF NOT EXISTS _migracoes (
        nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(), linha_de_base BOOLEAN NOT NULL DEFAULT false)`)
      const feitas = new Set((await cq('SELECT nome FROM _migracoes')).map(r => r.nome))
      if (!feitas.has('_estrutura_base')) {
        await client.query(ESTRUTURA_BASE) // vários comandos: sem parâmetros (protocolo simples)
        await cq("INSERT INTO _migracoes (nome) VALUES ('_estrutura_base')")
      }
      for (const m of MIGRACOES.filter(x => !feitas.has(x.nome))) {
        await client.query(m.sql)
        await cq('INSERT INTO _migracoes (nome) VALUES ($1)', [m.nome])
      }
      return MIGRACOES.length
    })
    await q('UPDATE ambientes SET schema_versao = $2, updated_at = now() WHERE id = $1', [amb.id, versao])
    return `estrutura base + ${versao} migrações · versão ${versao}`
  },
  // d) Kit básico (api/_kitBasico.js).
  async kit(q, c) {
    const amb = await ambienteDoCliente(q, c)
    await noCliente(amb, (cq) => aplicarKitBasico(cq, c))
    return 'categorias, grupos, tipos de documento e configurações'
  },
  // e) Organização + usuário admin (senha aleatória inutilizável: o cliente define pelo convite).
  async admin(q, c) {
    const amb = await ambienteDoCliente(q, c)
    return noCliente(amb, async (cq) => {
      if (await idDoAdmin(cq)) return 'admin já existia'
      let [org] = await cq('SELECT id FROM organizacoes ORDER BY created_at, id LIMIT 1')
      if (!org) [org] = await cq('INSERT INTO organizacoes (nome) VALUES ($1) RETURNING id', [nomeDoAmbiente(c)])
      const senhaInutilizavel = await hashSenha(crypto.randomBytes(32).toString('base64url'))
      const [u] = await cq(
        `INSERT INTO usuarios (username, nome, email, senha_hash, nivel, ativo, trocar_senha, criado_por, created_at, updated_at)
         VALUES ('admin', $1, $2, $3, 'admin', true, false, 'provisionamento', now(), now()) RETURNING id`,
        [String(c.nome).trim().slice(0, 100), String(c.email).trim().toLowerCase(), senhaInutilizavel],
      )
      await cq("INSERT INTO membros (usuario_id, organizacao_id, papel) VALUES ($1, $2, 'admin')", [u.id, org.id])
      return `admin (${String(c.email).toLowerCase()})`
    })
  },
  // f) Convite (48 h) + e-mail de boas-vindas com o botão "Criar minha senha".
  async convite(q, c, { enviar }) {
    const amb = await ambienteDoCliente(q, c)
    const id = await enviarConvite(amb, c, { enviar })
    return `boas-vindas com convite para ${c.email} · id ${id}`
  },
  // g) Ambiente e cliente 'ativo'.
  async ativar(q, c) {
    const amb = await ambienteDoCliente(q, c)
    await q("UPDATE ambientes SET status = 'ativo', updated_at = now() WHERE id = $1", [amb.id])
    await q("UPDATE plataforma_clientes SET status = 'ativo', updated_at = now() WHERE id = $1", [c.id])
    return `${enderecoDoCliente(c.sigla)} no ar`
  },
}

// Executa o PRÓXIMO passo pendente e devolve o andamento. Em erro: grava 'prov_falhou' no histórico
// e lança (a tela mostra a mensagem e o botão "Tentar novamente").
// `deps` (testes): { neon: { env, fetch, dormir, esperaMs }, enviar }.
export async function provisionarProximoPasso(clienteId, { autor = null, neon = {}, enviar = enviarEmail } = {}) {
  let passo = null
  try {
    const feito = await withCentralTransaction(async (q) => {
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`provisionar:${clienteId}`]) // um clique de cada vez
      const c = await buscarCliente(q, clienteId, { travar: true })
      if (!c) throw new ErroHttp(404, 'Cliente não encontrado')
      if (c.status === 'ativo') return null
      if (!PODE_PROVISIONAR.includes(c.status)) throw new ErroHttp(409, `Cliente com status "${c.status}" não pode ser aprovado`)
      const problema = problemaSigla(c.sigla)
      if (problema) throw new ErroHttp(409, `Sigla: ${problema}`)
      if (await siglaOcupada(q, c.sigla, c.id)) throw new ErroHttp(409, 'Sigla já está em uso por outro cliente')

      const feitos = await passosFeitos(q, c.id)
      passo = PASSOS.find(p => !feitos.has(evento(p.id)))
      if (!passo) return null
      const detalhe = await EXECUTAR[passo.id](q, c, { autor, neon, enviar })
      await registrarHistorico(q, c.id, evento(passo.id), `${passo.rotulo}: ${detalhe}`, autor)
      return passo.id
    })
    if (feito === 'ativar') _limparCacheAmbientes()
  } catch (err) {
    if (passo) {
      const msg = err instanceof ErroHttp || err instanceof ErroNeon ? err.message : `erro interno (${err.message})`
      await centralQuery('INSERT INTO plataforma_historico (cliente_id, evento, detalhe, autor) VALUES ($1, $2, $3, $4)',
        [clienteId, 'prov_falhou', `${passo.rotulo}: ${msg}`.slice(0, 1000), autor]).catch(() => {})
    }
    if (err instanceof ErroNeon) throw new ErroHttp(err.status, err.message)
    throw err
  }
  return estadoProvisionamento(centralQuery, clienteId)
}

// Provisiona até o fim (scripts/testes). A tela usa provisionarProximoPasso() passo a passo.
export async function provisionarCliente(clienteId, opcoes = {}) {
  let estado
  for (let i = 0; i <= PASSOS.length; i++) {
    estado = await provisionarProximoPasso(clienteId, opcoes)
    if (estado.concluido) break
  }
  return estado
}

// "Reenviar convite" (cliente ativo): convite novo (invalida o anterior) + boas-vindas.
export async function reenviarConvite(clienteId, { autor = null, enviar = enviarEmail } = {}) {
  const c = await buscarCliente(centralQuery, clienteId)
  if (!c) throw new ErroHttp(404, 'Cliente não encontrado')
  if (c.status !== 'ativo') throw new ErroHttp(409, 'Só cliente ativo recebe o convite')
  const amb = await ambienteDoCliente(centralQuery, c)
  if (!amb || amb.status !== 'ativo') throw new ErroHttp(409, 'Ambiente do cliente não está ativo')
  try {
    const id = await enviarConvite(amb, c, { enviar })
    await registrarHistorico(centralQuery, c.id, 'convite_reenviado', `Boas-vindas com convite para ${c.email} · id ${id}`, autor)
    return { ok: true, para: c.email, id }
  } catch (err) {
    await registrarHistorico(centralQuery, c.id, 'email_falhou', `Convite para ${c.email} · ${err.message}`, autor).catch(() => {})
    throw err
  }
}
