import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { ensureIaSchema, normalizarTermo, TIPOS_APELIDO } from './_ia.js'

// APELIDOS DA IA: termo do usuário → cadastro (categoria/conta: id; favorecido: nome). O assistente
// os usa com prioridade sobre o palpite; apelido que aponta para cadastro apagado/renomeado é
// ignorado na leitura (api/_ia.js montarContexto), nunca vira valor inválido.
//   GET                                   → lista
//   POST { itens: [{ tipo, termo, ref_id }] } → upsert (aprendizado ao confirmar a prévia; usos + 1)
//   PUT  { id, termo?, ref_id? }          → edita (Configurações › Cadastros › Apelidos da IA)
//   DELETE ?id=x                          → exclui

const COLS = 'id, tipo, termo, ref_id, usos, created_at, updated_at'

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

const refLimpo = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  try {
    await ensureIaSchema()

    if (req.method === 'GET') {
      const rows = await query(`SELECT ${COLS} FROM ia_apelidos ORDER BY tipo, termo`)
      return res.json({ apelidos: rows })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const itens = (Array.isArray(body?.itens) ? body.itens : [])
        .map(i => ({ tipo: i?.tipo, termo: normalizarTermo(i?.termo), ref: refLimpo(i?.ref_id) }))
        .filter(i => TIPOS_APELIDO.includes(i.tipo) && i.termo && i.ref)
        .slice(0, 10)
      if (!itens.length) return res.status(400).json({ error: 'Nenhum apelido válido' })
      const salvos = []
      for (const i of itens) {
        const [row] = await query(
          `INSERT INTO ia_apelidos (tipo, termo, ref_id) VALUES ($1, $2, $3)
           ON CONFLICT (tipo, termo) DO UPDATE
             SET ref_id = EXCLUDED.ref_id, usos = ia_apelidos.usos + 1, updated_at = now()
           RETURNING ${COLS}`, [i.tipo, i.termo, i.ref])
        salvos.push(row)
      }
      return res.json({ ok: true, apelidos: salvos })
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const id = String(body?.id || '').trim()
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      const [atual] = await query(`SELECT ${COLS} FROM ia_apelidos WHERE id = $1`, [id])
      if (!atual) return res.status(404).json({ error: 'Apelido não encontrado' })
      const termo = body?.termo !== undefined ? normalizarTermo(body.termo) : atual.termo
      const ref = body?.ref_id !== undefined ? refLimpo(body.ref_id) : atual.ref_id
      if (!termo || !ref) return res.status(400).json({ error: 'termo e ref_id não podem ficar vazios' })
      const [dup] = await query('SELECT id FROM ia_apelidos WHERE tipo = $1 AND termo = $2 AND id <> $3', [atual.tipo, termo, id])
      if (dup) return res.status(409).json({ error: 'Já existe um apelido com esse termo' })
      const [row] = await query(
        `UPDATE ia_apelidos SET termo = $2, ref_id = $3, updated_at = now() WHERE id = $1 RETURNING ${COLS}`, [id, termo, ref])
      return res.json({ ok: true, apelido: row })
    }

    if (req.method === 'DELETE') {
      const id = String(queryParam(req, 'id') || '').trim()
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      const [atual] = await query('SELECT id FROM ia_apelidos WHERE id = $1', [id])
      if (!atual) return res.status(404).json({ error: 'Apelido não encontrado' })
      await query('DELETE FROM ia_apelidos WHERE id = $1', [id])
      return res.json({ ok: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/ia-apelidos]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
