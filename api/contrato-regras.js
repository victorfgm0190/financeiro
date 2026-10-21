import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { normalizarRegra, exigirModulo, contratoVisivel, perfisDoUsuario } from './_contratos.js'

// REGRAS DE ITENS DO BOLETO (quem paga cada item do condomínio: inquilino × proprietário).
// contrato_id NULL = regra global do ambiente; a do contrato vence a global.
//   GET [?contrato_id=x]                                   → { regras } (globais + dos contratos visíveis)
//   POST { contrato_id?, padrao, tipo_match, responsavel } → cria
//   PUT  { id, padrao, tipo_match, responsavel, observacao } → altera
//   DELETE ?id=x                                           → exclui

async function regraVisivel(id, user) {
  const [r] = await query('SELECT * FROM contrato_regras_itens WHERE id = $1', [String(id || '')])
  if (!r) return null
  if (r.contrato_id && !(await contratoVisivel(query, r.contrato_id, user))) return null
  return r
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  try {
    if (req.method === 'GET') {
      const contratoId = queryParam(req, 'contrato_id')
      if (contratoId) {
        if (!(await contratoVisivel(query, contratoId, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
        const regras = await query('SELECT * FROM contrato_regras_itens WHERE contrato_id IS NULL OR contrato_id = $1 ORDER BY contrato_id NULLS LAST, padrao', [contratoId])
        return res.json({ regras })
      }
      const perfis = perfisDoUsuario(req.user)
      const regras = perfis
        ? await query(`SELECT r.* FROM contrato_regras_itens r LEFT JOIN contratos c ON c.id = r.contrato_id
            WHERE r.contrato_id IS NULL OR c.perfil_id = ANY($1) ORDER BY r.contrato_id NULLS FIRST, r.padrao`, [perfis])
        : await query('SELECT * FROM contrato_regras_itens ORDER BY contrato_id NULLS FIRST, padrao')
      return res.json({ regras })
    }
    if (req.method === 'POST') {
      const body = await parseBody(req)
      const { erro, regra } = normalizarRegra(body)
      if (erro) return res.status(400).json({ error: erro })
      const contratoId = body?.contrato_id ? String(body.contrato_id) : null
      if (contratoId && !(await contratoVisivel(query, contratoId, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      const [row] = await query(
        `INSERT INTO contrato_regras_itens (contrato_id, padrao, tipo_match, responsavel, observacao)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [contratoId, regra.padrao, regra.tipo_match, regra.responsavel, regra.observacao],
      )
      return res.json({ ok: true, regra: row })
    }
    if (req.method === 'PUT') {
      const body = await parseBody(req)
      if (!(await regraVisivel(body?.id, req.user))) return res.status(404).json({ error: 'Regra não encontrada' })
      const { erro, regra } = normalizarRegra(body)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        'UPDATE contrato_regras_itens SET padrao = $2, tipo_match = $3, responsavel = $4, observacao = $5 WHERE id = $1 RETURNING *',
        [body.id, regra.padrao, regra.tipo_match, regra.responsavel, regra.observacao],
      )
      return res.json({ ok: true, regra: row })
    }
    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      if (!(await regraVisivel(id, req.user))) return res.status(404).json({ error: 'Regra não encontrada' })
      await query('DELETE FROM contrato_regras_itens WHERE id = $1', [id])
      return res.json({ ok: true, id })
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/contrato-regras]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
