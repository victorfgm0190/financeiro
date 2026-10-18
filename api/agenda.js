import { ambienteDoReq } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { conteudoPublico } from './_agendaFeed.js'

// ROTA PÚBLICA do feed .ics (Google Agenda / iPhone): GET /api/agenda?t=<token>&tipo=despesa|receita
// Sem login e FORA do comAmbiente: valida o token e lê o .ics SÓ no banco central — nunca abre o
// banco do ambiente (api/agenda.test.js prova). O ambiente é o do ENDEREÇO (o feed de um ambiente
// não responde em outro). Qualquer falha → 404 vazio, sem dizer o motivo; o 404 também fica 1 h
// no cache da Vercel (link revogado que o Google continua pedindo não chega ao banco).

const CACHE = 's-maxage=3600, stale-while-revalidate=86400'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end()
  res.setHeader('Cache-Control', CACHE)
  let conteudo
  try {
    conteudo = await conteudoPublico(queryParam(req, 't'), ambienteDoReq(req).sigla, queryParam(req, 'tipo'))
  } catch (err) {
    console.error('[api/agenda]', err.message)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(503).end()
  }
  if (!conteudo) return res.status(404).end()
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="finup.ics"')
  return res.status(200).send(req.method === 'HEAD' ? '' : conteudo)
}
