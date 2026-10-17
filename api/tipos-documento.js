import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { ensureTiposDocumentoSchema, normalizarTipoBody, SQL_USOS_TIPO } from './_tiposDocumento.js'
import { comAmbiente } from './_ambiente.js'

// Cadastro de TIPOS DE DOCUMENTO.
//   GET                       → lista todos (ativos e inativos), por ordem
//   POST                      → cria
//   PUT { id, ... }           → atualiza um
//   PUT { reordenar: [ids] }  → grava a ordem (índice da lista), numa transação
//   DELETE ?id=xxx            → exclui; EM USO só inativa (ativo = false); sistema = true → 409
// Neon nunca é acessado direto do browser, sempre por este endpoint.

const COLS = 'id, nome, sigla, natureza, cor, ordem, ativo, sistema, created_at'

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureTiposDocumentoSchema()

    if (req.method === 'GET') {
      const rows = await query(`SELECT ${COLS} FROM tipos_documento ORDER BY ordem, nome`)
      return res.json({ tipos: rows })
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req)
      if (Array.isArray(body?.reordenar)) {
        const ids = body.reordenar.filter(Boolean).map(String)
        await withTransaction(async (q) => {
          for (let i = 0; i < ids.length; i++) {
            await q('UPDATE tipos_documento SET ordem = $2 WHERE id = $1', [ids[i], i + 1])
          }
        })
        return res.json({ ok: true, updated: ids.length })
      }
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      const { erro, dados } = normalizarTipoBody(body)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        `UPDATE tipos_documento SET nome = $2, sigla = $3, natureza = $4, cor = $5, ativo = $6,
            ordem = COALESCE($7, ordem)
          WHERE id = $1 RETURNING ${COLS}`,
        [body.id, dados.nome, dados.sigla, dados.natureza, dados.cor, dados.ativo, dados.ordem],
      )
      if (!row) return res.status(404).json({ error: 'Tipo não encontrado' })
      return res.json({ ok: true, tipo: row })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const { erro, dados } = normalizarTipoBody(body)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        `INSERT INTO tipos_documento (nome, sigla, natureza, cor, ativo, ordem)
          VALUES ($1, $2, $3, $4, $5, COALESCE($6, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM tipos_documento)))
          RETURNING ${COLS}`,
        [dados.nome, dados.sigla, dados.natureza, dados.cor, dados.ativo, dados.ordem],
      )
      return res.json({ ok: true, tipo: row })
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      const [tipo] = await query('SELECT id, sistema FROM tipos_documento WHERE id = $1', [id])
      if (!tipo) return res.status(404).json({ error: 'Tipo não encontrado' })
      if (tipo.sistema) return res.status(409).json({ error: 'Tipo do sistema não pode ser excluído' })
      const [usos] = await query(SQL_USOS_TIPO, [id])
      if ((usos?.agendamentos || 0) + (usos?.lancamentos || 0) > 0) {
        const [row] = await query(`UPDATE tipos_documento SET ativo = false WHERE id = $1 RETURNING ${COLS}`, [id])
        return res.json({ ok: true, inativado: true, usos, tipo: row })
      }
      await query('DELETE FROM tipos_documento WHERE id = $1', [id])
      return res.json({ ok: true, excluido: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/tipos-documento]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
