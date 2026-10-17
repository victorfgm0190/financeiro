import { query, parseBody, withTransaction, upsertRowsNoClient } from './_db.js'
import { requireAuth } from './_auth.js'
import { ensureTiposDocumentoSchema } from './_tiposDocumento.js'
import {
  ensureHistoricoSchema, normalizarLinhaHistorico, inserirHistorico, SQL_HISTORICO_COLS,
} from './_historico.js'
import { comAmbiente } from './_ambiente.js'

// HISTÓRICO DE ALTERAÇÕES
//   GET ?entidade=agendamento&entidade_id=x   → linhas do registro
//   GET ?serie_key=x                          → linhas da série
//   GET ?lote_id=x                            → todas as linhas de uma edição
//   GET ?resumo=1                             → [{ entidade, entidade_id }] com histórico (indicador nas listas)
//   POST { agendamentos, lancamentos, historico, lote_id, motivo }
//        → grava as linhas alteradas (rows snake_case, as mesmas do sync) E o histórico na MESMA
//          transação. É o caminho das edições feitas pelo usuário; o sync não grava histórico.

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

// Aplica edição + histórico com o client/q de uma transação. Exportado para teste (PGlite).
export async function aplicarEdicao(q, client, body, upsert = upsertRowsNoClient) {
  const linhas = []
  for (const l of body?.historico || []) {
    const { erro, linha } = normalizarLinhaHistorico(l, { loteId: body.lote_id, motivo: body.motivo })
    if (erro) throw Object.assign(new Error(erro), { status: 400 })
    linhas.push(linha)
  }
  const ag = await upsert(client, 'agendamentos', body?.agendamentos || [])
  const lc = await upsert(client, 'lancamentos', body?.lancamentos || [])
  const h = await inserirHistorico(q, linhas)
  return { agendamentos: ag, lancamentos: lc, historico: h }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureHistoricoSchema()

    if (req.method === 'GET') {
      if (queryParam(req, 'resumo')) {
        const rows = await query('SELECT DISTINCT entidade, entidade_id FROM historico_alteracoes')
        return res.json({ itens: rows })
      }
      const loteId = queryParam(req, 'lote_id')
      const serieKey = queryParam(req, 'serie_key')
      const entidadeId = queryParam(req, 'entidade_id')
      const entidade = queryParam(req, 'entidade')
      let rows
      if (loteId) {
        rows = await query(`SELECT ${SQL_HISTORICO_COLS} FROM historico_alteracoes WHERE lote_id = $1 ORDER BY created_at DESC, entidade_id, campo`, [loteId])
      } else if (serieKey) {
        rows = await query(`SELECT ${SQL_HISTORICO_COLS} FROM historico_alteracoes WHERE serie_key = $1 ORDER BY created_at DESC LIMIT 1000`, [serieKey])
      } else if (entidadeId) {
        rows = entidade
          ? await query(`SELECT ${SQL_HISTORICO_COLS} FROM historico_alteracoes WHERE entidade = $1 AND entidade_id = $2 ORDER BY created_at DESC`, [entidade, entidadeId])
          : await query(`SELECT ${SQL_HISTORICO_COLS} FROM historico_alteracoes WHERE entidade_id = $1 ORDER BY created_at DESC`, [entidadeId])
      } else {
        return res.status(400).json({ error: 'informe entidade_id, serie_key ou lote_id' })
      }
      return res.json({ historico: rows })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      // tipo_documento_id vai nas rows do sync: a coluna precisa existir antes do upsert.
      await ensureTiposDocumentoSchema()
      const r = await withTransaction((q, client) => aplicarEdicao(q, client, body))
      return res.json({ ok: true, ...r })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/historico]', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
