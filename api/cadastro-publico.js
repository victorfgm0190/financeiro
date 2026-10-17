import { parseBody, withTransaction } from './_db.js'
import { ErroHttp } from './_usuarios.js'
import {
  ensurePlataformaSchema, validarCliente, siglaOcupada, sugerirSiglaLivre, registrarHistorico, ipDoReq,
} from './_plataforma.js'

// PEDIDO PÚBLICO "Quero me tornar cliente" — SEM login. Grava o pedido com status 'pedido' para
// aprovação manual no Controle de Clientes; não cria usuário nem dá acesso a nada.
//   POST { nome, email, telefone, tipo_pessoa, documento, empresa?, sigla, como_conheceu?,
//          aceite_termos: true, website (campo invisível anti-robô: tem de vir vazio) }
// Defesas: validação completa aqui (o formulário é só conveniência), limite de envios por IP por
// hora e resposta IGUAL para e-mail novo, e-mail já cadastrado e robô (não revela o que existe).

export const LIMITE_POR_HORA = 3
export const RESPOSTA_OK = { ok: true, mensagem: 'Recebemos seu pedido, entraremos em contato.' }

export async function receberPedido(q, body = {}, ip) {
  // Serializa os envios do mesmo IP: dois pedidos simultâneos não furam o limite.
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`plataforma_cadastro:${ip}`])
  await q("DELETE FROM plataforma_cadastro_envios WHERE created_at < now() - interval '1 day'")
  const [{ n }] = await q("SELECT count(*)::int AS n FROM plataforma_cadastro_envios WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip])
  if (n >= LIMITE_POR_HORA) throw new ErroHttp(429, 'Muitos pedidos enviados deste endereço. Tente novamente mais tarde.')

  const registrarEnvio = () => q('INSERT INTO plataforma_cadastro_envios (ip) VALUES ($1)', [ip])
  if (String(body.website ?? '').trim()) {
    await registrarEnvio()
    return RESPOSTA_OK
  }

  const dados = validarCliente(body)
  if (body.aceite_termos !== true) throw new ErroHttp(400, 'É preciso aceitar os termos de uso e a política de privacidade')

  const [existente] = await q('SELECT id FROM plataforma_clientes WHERE lower(email) = $1 ORDER BY created_at LIMIT 1', [dados.email])
  if (existente) {
    await registrarEnvio()
    await registrarHistorico(q, existente.id, 'pedido_repetido',
      `Novo pedido pelo formulário com o mesmo e-mail · nome ${dados.nome} · sigla ${dados.sigla} · IP ${ip}`, 'formulario')
    return RESPOSTA_OK
  }

  if (await siglaOcupada(q, dados.sigla)) {
    const sugestao = await sugerirSiglaLivre(q, dados.tipo_pessoa === 'PJ' && dados.empresa ? dados.empresa : dados.nome)
    throw Object.assign(new ErroHttp(409, 'Essa sigla já está em uso'), { sugestao })
  }

  const cols = Object.keys(dados)
  const [r] = await q(
    `INSERT INTO plataforma_clientes (${cols.join(', ')}, origem, status, aceite_termos_em, aceite_ip)
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, 'formulario', 'pedido', now(), $${cols.length + 1}) RETURNING id`,
    [...cols.map(c => dados[c]), ip],
  )
  await registrarEnvio()
  await registrarHistorico(q, r.id, 'pedido', `Pedido pelo formulário público · IP ${ip}`, 'formulario')
  return RESPOSTA_OK
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (req.method !== 'POST') return res.status(405).end()
  try {
    await ensurePlataformaSchema()
    const body = await parseBody(req)
    return res.json(await withTransaction(q => receberPedido(q, body || {}, ipDoReq(req))))
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message, ...(err.sugestao ? { sugestao: err.sugestao } : {}) })
    if (err?.code === '23505') return res.status(409).json({ error: 'Essa sigla já está em uso' })
    console.error('[api/cadastro-publico]', err.message)
    return res.status(500).json({ error: 'Não foi possível enviar o pedido. Tente novamente.' })
  }
}
