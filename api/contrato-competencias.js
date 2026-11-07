import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { exigirModulo, contratoVisivel, normalizarCompetencia, MSG_SEM_COMPOSICAO } from './_contratos.js'

// COMPOSIÇÃO DO REPASSE por competência (contrato a receber por administradora) — tabela
// contrato_competencias, a ÚNICA fonte da verdade da composição (a cópia no agendamento é só para
// exibir). Fora do /api/sync, como as demais tabelas do módulo.
//   GET ?contrato_id=x                                         → { competencias }
//   PUT { contrato_id, competencia, itens, status, observacao } → grava (cria ou substitui) → { competencia }
//   DELETE ?contrato_id=x&competencia=AAAA-MM                  → volta ao padrão do contrato

const linhaNumerica = (r) => r && ({ ...r, itens: Array.isArray(r.itens) ? r.itens : [] })
const semTabela = async () => !(await query("SELECT to_regclass('contrato_competencias') IS NOT NULL AS t"))[0]?.t

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  try {
    if (await semTabela()) {
      if (req.method === 'GET') return res.json({ competencias: [] })
      return res.status(409).json({ error: MSG_SEM_COMPOSICAO, codigo: 'banco_desatualizado' })
    }
    if (req.method === 'GET') {
      const id = queryParam(req, 'contrato_id')
      if (!(await contratoVisivel(query, id, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      const rows = await query('SELECT * FROM contrato_competencias WHERE contrato_id = $1 ORDER BY competencia', [id])
      return res.json({ competencias: rows.map(linhaNumerica) })
    }
    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const c = await contratoVisivel(query, body?.contrato_id, req.user)
      if (!c) return res.status(404).json({ error: 'Contrato não encontrado' })
      if (!c.modo_repasse) return res.status(400).json({ error: 'Composição do repasse só em contrato a receber por administradora' })
      const { erro, dados } = normalizarCompetencia(body)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        `INSERT INTO contrato_competencias (contrato_id, competencia, itens, status, observacao)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (contrato_id, competencia)
         DO UPDATE SET itens = EXCLUDED.itens, status = EXCLUDED.status, observacao = EXCLUDED.observacao, updated_at = now()
         RETURNING *`,
        [c.id, dados.competencia, JSON.stringify(dados.itens), dados.status, dados.observacao],
      )
      return res.json({ ok: true, competencia: linhaNumerica(row) })
    }
    if (req.method === 'DELETE') {
      const id = queryParam(req, 'contrato_id')
      const comp = queryParam(req, 'competencia')
      if (!(await contratoVisivel(query, id, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      await query('DELETE FROM contrato_competencias WHERE contrato_id = $1 AND competencia = $2', [id, String(comp || '')])
      return res.json({ ok: true })
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/contrato-competencias]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
