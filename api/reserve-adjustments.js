import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'

// Histórico de ajustes por função de reserva (data + valor ± + observação).
//   GET    → lista todos os ajustes (todas as funções)
//   POST   → insere/atualiza { id, function_id, data, valor, observacao }
//   PUT    → atualiza { id, valor, observacao }
//   DELETE → remove por id (?id=xxx) ou todos os de um rendimento (?lancamento_id=xxx)
// lancamento_id (migração 2026-10-29_ajuste_rendimento): ajuste que é a parte de uma função no
// rendimento da conta de reserva. Sem a coluna ainda (banco não migrado), segue sem ela.
// Substitui o ajuste_override JSONB (mantido como fallback legado no ReservasPanel).
// Neon nunca é acessado direto do browser — sempre via este endpoint.

// id do query string, com fallback via URL (robusto entre runtimes da Vercel).
function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}
const queryId = (req) => queryParam(req, 'id')
// Coluna ainda não criada (42703) → repete sem ela.
const semColuna = (err) => err?.code === '42703'

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      const sql = (comLanc) => `SELECT id, function_id,
                to_char(data, 'YYYY-MM-DD') AS data,
                valor, observacao, created_at${comLanc ? ', lancamento_id' : ''}
           FROM reserve_adjustments
          ORDER BY function_id, data DESC`
      let rows
      try { rows = await query(sql(true)) } catch (err) { if (!semColuna(err)) throw err; rows = await query(sql(false)) }
      return res.json({ adjustments: rows })
    }

    if (req.method === 'POST') {
      const { id, function_id, data, valor, observacao, lancamento_id } = await parseBody(req)
      if (!id || !function_id || !data) {
        return res.status(400).json({ error: 'id, function_id e data são obrigatórios' })
      }
      const params = [id, function_id, data, Number(valor) || 0, observacao ?? null]
      try {
        await query(
          `INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao, lancamento_id)
                VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
                function_id   = EXCLUDED.function_id,
                data          = EXCLUDED.data,
                valor         = EXCLUDED.valor,
                observacao    = EXCLUDED.observacao,
                lancamento_id = EXCLUDED.lancamento_id`,
          [...params, lancamento_id ?? null],
        )
      } catch (err) {
        if (!semColuna(err)) throw err
        // Parte de rendimento SEM a coluna de vínculo: não grava (ficaria solta, sem o lançamento).
        if (lancamento_id) return res.status(409).json({ error: 'Banco sem a migração 2026-10-29_ajuste_rendimento (rode scripts/migrar-ambientes.js).' })
        await query(
          `INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao)
                VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
                function_id = EXCLUDED.function_id,
                data        = EXCLUDED.data,
                valor       = EXCLUDED.valor,
                observacao  = EXCLUDED.observacao`,
          params,
        )
      }
      return res.json({ ok: true, id })
    }

    if (req.method === 'PUT') {
      const { id, valor, observacao } = await parseBody(req)
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query(
        `UPDATE reserve_adjustments SET valor = $2, observacao = $3 WHERE id = $1`,
        [id, Number(valor) || 0, observacao ?? null],
      )
      return res.json({ ok: true, id })
    }

    if (req.method === 'DELETE') {
      const lancamentoId = queryParam(req, 'lancamento_id')
      if (lancamentoId) {
        try {
          await query(`DELETE FROM reserve_adjustments WHERE lancamento_id = $1`, [lancamentoId])
        } catch (err) { if (!semColuna(err)) throw err }
        return res.json({ ok: true, lancamento_id: lancamentoId })
      }
      const id = queryId(req)
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query(`DELETE FROM reserve_adjustments WHERE id = $1`, [id])
      return res.json({ ok: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/reserve-adjustments]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
