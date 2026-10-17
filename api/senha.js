import process from 'node:process'
import { query, withTransaction, parseBody } from './_db.js'
import { withCentralTransaction, buscarAmbientePorSigla, ambienteAtivo } from './_central.js'
import { rodarNoAmbiente } from './_conexao.js'
import { ambienteDoReq } from './_ambiente.js'
import { ipDoReq, queryParam } from './_plataforma.js'
import { enviarEmail } from './_email.js'
import { modeloRedefinirSenha, urlDefinirSenha } from './_emailSenha.js'
import { gerarTokenSenha, buscarTokenValido, definirSenhaComToken, ERRO_LINK } from './_senhaTokens.js'
import { normUser, SENHA_MIN, ehTabelaInexistente } from './_usuarios.js'
import { normalizarSigla } from '../src/lib/plataforma.js'

// LINKS DE SENHA — rota PÚBLICA (sem token; por isso sem comAmbiente). O ambiente vem como no login:
// do endereço (<sigla>.finup.app.br) ou, no www / vercel.app / localhost, do campo Ambiente. Nada roda
// sem ambiente resolvido (o _db.js lança fora de rodarNoAmbiente — nunca cai no neondb).
//   POST ?acao=esqueci { ambiente?, login }   → SEMPRE a mesma resposta (RESPOSTA_ESQUECI); se houver
//        usuário ativo COM e-mail, gera link 'redefinir' (1 h) e envia. Limite: 3 por hora por IP e
//        por usuário (tabela senha_pedidos do central); acima do limite, mesma resposta, sem e-mail.
//   GET  ?acao=validar&token=…                → { ok, nome, tipo } ou 410 ERRO_LINK
//   POST ?acao=definir { token, novaSenha }    → grava a senha (mín. SENHA_MIN) e gasta o link
// validar/definir procuram o token SÓ no banco do ambiente do ENDEREÇO (o link do e-mail aponta para
// ele): token de um ambiente nunca vale em outro. O convite (admin) sai por /api/usuarios.

export const LIMITE_POR_HORA = 3
export const RESPOSTA_ESQUECI = { ok: true, mensagem: 'Se o usuário existir, enviaremos um link para o e-mail cadastrado.' }

const SQL_USUARIO_COM_EMAIL = `
  SELECT id, username, nome, email FROM usuarios
   WHERE (username = $1 OR lower(email) = $1) AND ativo AND coalesce(trim(email), '') <> ''
   ORDER BY (username = $1) DESC
   LIMIT 1`

// Registra o pedido na chave e diz se ainda está dentro do limite (o pedido acima do limite também
// conta: insistir não reabre a janela).
async function dentroDoLimite(chave, agora) {
  return withCentralTransaction(async (cq) => {
    await cq('SELECT pg_advisory_xact_lock(hashtext($1))', [`senha_pedidos:${chave}`])
    await cq("DELETE FROM senha_pedidos WHERE criado_em < $1::timestamptz - interval '1 day'", [agora])
    const [{ n }] = await cq(
      "SELECT count(*)::int AS n FROM senha_pedidos WHERE chave = $1 AND criado_em > $2::timestamptz - interval '1 hour'",
      [chave, agora],
    )
    await cq('INSERT INTO senha_pedidos (chave, criado_em) VALUES ($1, $2)', [chave, agora])
    return n < LIMITE_POR_HORA
  })
}

// Núcleo do "Esqueci minha senha". Nunca lança para o chamador por causa do usuário/ambiente: tudo
// que não for "gerou e enviou" termina na mesma resposta.
export async function esqueciSenha(req, body = {}, { env = process.env, agora = new Date(), enviar = enviarEmail } = {}) {
  const doEndereco = ambienteDoReq(req, env)
  const sigla = doEndereco.principal ? (normalizarSigla(body.ambiente) || doEndereco.sigla) : doEndereco.sigla
  const login = normUser(body.login)
  const ip = ipDoReq(req)

  if (!(await dentroDoLimite(`ip:${ip}`, agora))) return RESPOSTA_ESQUECI
  if (!login || !sigla) return RESPOSTA_ESQUECI
  const amb = await buscarAmbientePorSigla(sigla)
  if (!ambienteAtivo(amb)) return RESPOSTA_ESQUECI

  await rodarNoAmbiente(amb, async () => {
    let u
    try {
      ;[u] = await query(SQL_USUARIO_COM_EMAIL, [login])
    } catch (err) {
      if (!ehTabelaInexistente(err)) throw err
    }
    if (!u || !(await dentroDoLimite(`usr:${amb.id}:${u.id}`, agora))) return
    const token = await withTransaction((q) => gerarTokenSenha(q, u.id, 'redefinir', { ip, agora }))
    const { assunto, html, texto } = modeloRedefinirSenha({ nome: u.nome || u.username, url: urlDefinirSenha(amb.sigla, token) })
    try {
      await enviar({ para: u.email, assunto, html, texto }, { env })
    } catch (err) {
      console.error(`[api/senha] e-mail de redefinição não enviado (ambiente ${amb.sigla}):`, err.message)
    }
  })
  return RESPOSTA_ESQUECI
}

// Ambiente do ENDEREÇO (validar/definir) já ativo, ou null.
async function ambienteDoEndereco(req) {
  const { sigla } = ambienteDoReq(req)
  const amb = sigla ? await buscarAmbientePorSigla(sigla) : null
  return ambienteAtivo(amb) ? amb : null
}

export async function validarLink(req, token, { agora = new Date() } = {}) {
  const amb = await ambienteDoEndereco(req)
  if (!amb || !token) return null
  const t = await rodarNoAmbiente(amb, () => buscarTokenValido(query, token, { agora }))
  return t ? { ok: true, nome: t.nome, tipo: t.tipo } : null
}

export async function definirSenha(req, body = {}, { agora = new Date() } = {}) {
  const amb = await ambienteDoEndereco(req)
  if (!amb || !body.token) return false
  return rodarNoAmbiente(amb, () => withTransaction((q) => definirSenhaComToken(q, String(body.token), body.novaSenha, { agora })))
}

const erroSenhaCurta = (v) => typeof v !== 'string' || v.length < SENHA_MIN

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const acao = queryParam(req, 'acao')
  try {
    if (acao === 'validar') {
      if (req.method !== 'GET') return res.status(405).end()
      const r = await validarLink(req, String(queryParam(req, 'token') || ''))
      return r ? res.json(r) : res.status(410).json({ error: ERRO_LINK })
    }
    if (req.method !== 'POST') return res.status(405).end()
    const body = (await parseBody(req)) || {}
    if (acao === 'esqueci') return res.json(await esqueciSenha(req, body))
    if (acao === 'definir') {
      if (erroSenhaCurta(body.novaSenha)) return res.status(400).json({ error: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres` })
      return (await definirSenha(req, body)) ? res.json({ ok: true }) : res.status(410).json({ error: ERRO_LINK })
    }
    return res.status(400).json({ error: 'Ação inválida' })
  } catch (err) {
    console.error('[api/senha]', acao, err.message)
    if (acao === 'esqueci') return res.json(RESPOSTA_ESQUECI) // nem a falha interna muda a resposta
    return res.status(500).json({ error: 'Não foi possível concluir. Tente novamente.' })
  }
}
