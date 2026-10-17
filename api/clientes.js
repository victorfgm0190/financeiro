import { parseBody } from './_db.js'
import { centralQuery as query, withCentralTransaction as withTransaction } from './_central.js'
import { requireAuth } from './_auth.js'
import { ErroHttp } from './_usuarios.js'
import {
  ensurePlataformaSchema, ehAdminPlataforma, validarCliente, siglaOcupada, buscarCliente, registrarHistorico,
  checarSigla, queryParam, statusValido,
} from './_plataforma.js'
import { provisionarCliente } from './_provisionar.js'
import { enviarEmail, ErroEmail } from './_email.js'
import { modeloBoasVindas } from './_emailBoasVindas.js'
import { comAmbiente } from './_ambiente.js'
import { AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'

// CONTROLE DE CLIENTES da plataforma — só o administrador da plataforma (PLATAFORMA_ADMIN), nunca
// o nível 'admin' comum.
//   GET ?acao=resumo           → { novos } (o menu usa: 403 = não mostra)
//   GET                        → { clientes, novos }
//   GET ?id=x                  → { cliente, historico }
//   GET ?acao=sigla&sigla=&nome=&id= → disponibilidade (ignora o próprio cliente na edição)
//   POST { ...campos }         → novo cliente manual (origem 'manual', status 'pedido')
//   PATCH { id, ...campos }    → edição (status NÃO muda por aqui)
//   POST ?acao=aprovar { id }  → provisionarCliente (api/_provisionar.js) → { cliente, mensagem }
//   POST ?acao=status { id, acao: recusar|suspender|reativar|cancelar, motivo? }
//   POST ?acao=email { id }    → e-mail de boas-vindas (Resend) → { id do Resend }; histórico
//                                'email_enviado' ou 'email_falhou'

const CAMPOS_EDITAVEIS = ['nome', 'email', 'telefone', 'tipo_pessoa', 'documento', 'empresa', 'sigla', 'como_conheceu',
  'plano', 'valor_mensal', 'dia_vencimento', 'limite_usuarios', 'observacoes']

// Transições pelos botões. Reativar volta para 'aprovado': nesta fase não existe ambiente ativo
// (na Etapa 2, suspenso com ambiente criado volta para 'ativo').
const TRANSICOES = {
  recusar: { de: ['pedido'], para: 'recusado' },
  suspender: { de: ['aprovado', 'ativo'], para: 'suspenso' },
  reativar: { de: ['suspenso', 'cancelado'], para: 'aprovado' },
  cancelar: { de: ['pedido', 'aprovado', 'ativo', 'suspenso', 'recusado'], para: 'cancelado' },
}

const contarNovos = async (q) => (await q("SELECT count(*)::int AS n FROM plataforma_clientes WHERE status = 'pedido'"))[0]?.n || 0

async function exigirSiglaLivre(q, sigla, idAtual = null) {
  if (sigla && (await siglaOcupada(q, sigla, idAtual))) throw new ErroHttp(409, 'Essa sigla já está em uso')
}

export async function criarClienteManual(q, body, autor) {
  const dados = validarCliente(body, { exigirDocumento: false })
  if (!dados.sigla) throw new ErroHttp(400, 'Informe a sigla')
  await exigirSiglaLivre(q, dados.sigla)
  const cols = Object.keys(dados)
  const [r] = await q(
    `INSERT INTO plataforma_clientes (${cols.join(', ')}, origem, status)
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, 'manual', 'pedido') RETURNING id`,
    cols.map(c => dados[c]),
  )
  await registrarHistorico(q, r.id, 'criado', 'Cadastro manual', autor)
  return buscarCliente(q, r.id)
}

export async function editarCliente(q, body, autor) {
  if (!body?.id) throw new ErroHttp(400, 'id é obrigatório')
  const atual = await buscarCliente(q, body.id, { travar: true })
  if (!atual) throw new ErroHttp(404, 'Cliente não encontrado')
  const entrada = Object.fromEntries(Object.entries(body).filter(([k]) => CAMPOS_EDITAVEIS.includes(k)))
  if ('telefone' in entrada) entrada.nao_whatsapp = body.nao_whatsapp === true
  const dados = validarCliente(entrada, { parcial: true, atual, exigirDocumento: false })
  if ('sigla' in dados) {
    if (!dados.sigla) throw new ErroHttp(400, 'Informe a sigla')
    // Sigla é o endereço do ambiente: depois de aprovado só muda junto com a migração do ambiente.
    if (dados.sigla !== atual.sigla && !['pedido', 'recusado'].includes(atual.status)) {
      throw new ErroHttp(409, 'A sigla não pode mudar depois da aprovação')
    }
    await exigirSiglaLivre(q, dados.sigla, atual.id)
  }
  const mudou = Object.keys(dados).filter(k => String(dados[k] ?? '') !== String(atual[k] ?? ''))
  if (!mudou.length) return atual
  await q(
    `UPDATE plataforma_clientes SET ${mudou.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
    [atual.id, ...mudou.map(c => dados[c])],
  )
  await registrarHistorico(q, atual.id, 'editado', `Campos: ${mudou.join(', ')}`, autor)
  return buscarCliente(q, atual.id)
}

export async function mudarStatus(q, body, autor) {
  const t = TRANSICOES[body?.acao]
  if (!t) throw new ErroHttp(400, 'Ação inválida')
  const atual = await buscarCliente(q, body.id, { travar: true })
  if (!atual) throw new ErroHttp(404, 'Cliente não encontrado')
  if (!t.de.includes(atual.status)) throw new ErroHttp(409, `Não é possível ${body.acao} um cliente com status "${atual.status}"`)
  if (!statusValido(t.para)) throw new ErroHttp(500, 'Status inválido')
  await q('UPDATE plataforma_clientes SET status = $2, updated_at = now() WHERE id = $1', [atual.id, t.para])
  const motivo = String(body.motivo ?? '').trim().slice(0, 1000)
  await registrarHistorico(q, atual.id, t.para, `Status ${atual.status} → ${t.para}${motivo ? ` · ${motivo}` : ''}`, autor)
  return buscarCliente(q, atual.id)
}

// Só cliente já aprovado recebe boas-vindas. O envio fica fora de transação (chamada externa) e o
// resultado — sucesso ou falha — vai para o histórico.
const PODE_RECEBER_EMAIL = ['aprovado', 'ativo']

export async function enviarBoasVindas(q, id, autor) {
  const c = await buscarCliente(q, id)
  if (!c) throw new ErroHttp(404, 'Cliente não encontrado')
  if (!PODE_RECEBER_EMAIL.includes(c.status)) throw new ErroHttp(409, 'Só cliente aprovado recebe o e-mail de boas-vindas')
  const { assunto, html, texto } = modeloBoasVindas(c)
  try {
    const { id: idResend } = await enviarEmail({ para: c.email, assunto, html, texto })
    await registrarHistorico(q, c.id, 'email_enviado', `Boas-vindas para ${c.email} · id ${idResend}`, autor)
    return { id: idResend, para: c.email }
  } catch (err) {
    if (!(err instanceof ErroEmail)) throw err
    await registrarHistorico(q, c.id, 'email_falhou', `Boas-vindas para ${c.email} · ${err.message}`, autor)
    throw new ErroHttp(err.status, err.message)
  }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (!requireAuth(req, res)) return
  // Só no ambiente principal (o do Victor) e só para o PLATAFORMA_ADMIN. Os dados ficam no central.
  if (!ehAdminPlataforma(req.user) || req.ambiente?.sigla !== AMBIENTE_PRINCIPAL) return res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma' })
  const autor = req.user.username
  const acao = queryParam(req, 'acao')

  try {
    await ensurePlataformaSchema()

    if (req.method === 'GET') {
      if (acao === 'resumo') return res.json({ novos: await contarNovos(query) })
      if (acao === 'sigla') {
        return res.json(await checarSigla(query, queryParam(req, 'sigla'), queryParam(req, 'nome') || '', queryParam(req, 'id')))
      }
      const id = queryParam(req, 'id')
      if (id) {
        const cliente = await buscarCliente(query, id)
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' })
        const historico = await query('SELECT * FROM plataforma_historico WHERE cliente_id = $1 ORDER BY created_at DESC, id', [id])
        return res.json({ cliente, historico })
      }
      const clientes = (await query('SELECT * FROM plataforma_clientes ORDER BY created_at DESC'))
        .map(c => ({ ...c, valor_mensal: c.valor_mensal == null ? null : Number(c.valor_mensal) }))
      return res.json({ clientes, novos: clientes.filter(c => c.status === 'pedido').length })
    }

    const body = await parseBody(req)
    if (req.method === 'POST' && acao === 'aprovar') {
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      return res.json({ ok: true, ...(await provisionarCliente(String(body.id), { autor })) })
    }
    if (req.method === 'POST' && acao === 'email') {
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      return res.json({ ok: true, ...(await enviarBoasVindas(query, String(body.id), autor)) })
    }
    if (req.method === 'POST' && acao === 'status') {
      return res.json({ ok: true, cliente: await withTransaction(q => mudarStatus(q, body, autor)) })
    }
    if (req.method === 'POST') return res.json({ ok: true, cliente: await withTransaction(q => criarClienteManual(q, body, autor)) })
    if (req.method === 'PATCH') return res.json({ ok: true, cliente: await withTransaction(q => editarCliente(q, body, autor)) })
    return res.status(405).end()
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message })
    if (err?.code === '23505') return res.status(409).json({ error: 'Essa sigla já está em uso' })
    console.error('[api/clientes]', err.message)
    return res.status(500).json({ error: 'Falha ao processar a solicitação' })
  }
}

export default comAmbiente(handler)
