import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { exigirFuncoesPermitidas } from './_permissoesApi.js'

// Snapshots das viradas de saldo (histórico de períodos fechados por função).
//   GET  → lista todos os snapshots (data_fim DESC)
//   POST → insere um lote { snapshots: [...] } com ON CONFLICT (id) DO NOTHING
// Neon nunca é acessado direto do browser — sempre via este endpoint.

const COLS = [
  'id', 'periodo_id', 'data_inicio', 'data_fim', 'function_id', 'function_name',
  'saldo_inicial', 'entradas', 'saidas', 'ajuste', 'saldo', 'saldo_atualizado',
]

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      // SELECT * (rendimentos e virada_id da virada assistida, quando o banco já tem) + datas em texto.
      const rows = await query(
        `SELECT *, to_char(data_inicio, 'YYYY-MM-DD') AS _inicio, to_char(data_fim, 'YYYY-MM-DD') AS _fim
           FROM reserve_period_snapshots
          ORDER BY data_fim DESC, function_name`,
      )
      return res.json({ snapshots: rows.map(({ _inicio, _fim, ...r }) => ({ ...r, data_inicio: _inicio, data_fim: _fim, rendimentos: r.rendimentos ?? null, virada_id: r.virada_id ?? null })) })
    }

    if (req.method === 'POST') {
      // Com a virada assistida no banco, o snapshot só nasce junto com a virada (api/reserve-virada.js),
      // na mesma transação do período novo. Versão antiga do app em cache → recusa com explicação.
      const [assist] = await query("SELECT to_regclass('reserve_viradas') IS NOT NULL AS tem")
      if (assist?.tem) return res.status(409).json({ error: 'A virada de saldo agora é feita pela virada assistida. Recarregue o aplicativo e use "Virar Saldo" de novo.', codigo: 'use_virada_assistida' })
      const { snapshots } = await parseBody(req)
      if (!Array.isArray(snapshots) || snapshots.length === 0) {
        return res.json({ ok: true, inserted: 0 })
      }
      // Perfis permitidos: todas as funções do lote (tudo ou nada).
      await exigirFuncoesPermitidas(query, req.user, snapshots.filter(s => s?.function_id).map(s => s.function_id))
      // Um único INSERT com múltiplas linhas: monta os placeholders ($1..$N) por linha.
      const values = []
      const params = []
      let i = 1
      for (const s of snapshots) {
        if (!s?.id || !s?.function_id || !s?.data_inicio || !s?.data_fim) continue
        values.push(`(${COLS.map(() => `$${i++}`).join(', ')})`)
        params.push(
          s.id, s.periodo_id ?? 'legacy', s.data_inicio, s.data_fim, s.function_id, s.function_name ?? '',
          Number(s.saldo_inicial) || 0, Number(s.entradas) || 0, Number(s.saidas) || 0,
          Number(s.ajuste) || 0, Number(s.saldo) || 0, Number(s.saldo_atualizado) || 0,
        )
      }
      if (values.length === 0) return res.json({ ok: true, inserted: 0 })
      await query(
        `INSERT INTO reserve_period_snapshots (${COLS.join(', ')})
              VALUES ${values.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params,
      )
      return res.json({ ok: true, inserted: values.length })
    }

    return res.status(405).end()
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error('[api/reserve-snapshots]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
