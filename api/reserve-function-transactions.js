import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Lançamentos vinculados a uma função de reserva (reserva_funcao_id) num período.
// Recebe { functionId, startDate, endDate }. JOIN em contas para resolver os nomes das
// contas (origem e destino) — usado pelo modal "Origem" do Resumo de Reservas.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { functionId, startDate, endDate } = await parseBody(req)
    if (!functionId) return res.json({ transactions: [] })

    const where = ['l.reserva_funcao_id = $1']
    const params = [functionId]
    if (startDate) { params.push(startDate); where.push(`l.date >= $${params.length}`) }
    if (endDate) { params.push(endDate); where.push(`l.date <= $${params.length}`) }

    // Direção pelo account_id da PRÓPRIA função (rf.account_id = conta de reserva):
    //   saída  = transferência saindo da conta da reserva (resgate);
    //   entrada = transferência entrando na conta, ou receita na conta da reserva.
    // Despesa (cartão) vinculada à função é só provisão → 'neutro' (nem entrada nem saída).
    const rows = await query(
      `SELECT l.id, l.date, l.description, l.amount, l.type,
              l.account_id, l.to_account_id,
              ca.name AS conta_nome,
              cb.name AS conta_destino_nome,
              CASE
                WHEN l.type = 'transfer' AND l.account_id    = rf.account_id THEN 'saida'
                WHEN l.type = 'transfer' AND l.to_account_id = rf.account_id THEN 'entrada'
                WHEN l.type = 'income'   AND l.account_id    = rf.account_id THEN 'entrada'
                ELSE 'neutro'
              END AS direcao
       FROM lancamentos l
       LEFT JOIN contas ca ON ca.id = l.account_id
       LEFT JOIN contas cb ON cb.id = l.to_account_id
       LEFT JOIN reserve_functions rf ON rf.id = l.reserva_funcao_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.date DESC NULLS LAST`,
      params,
    )
    res.json({ transactions: rows })
  } catch (err) {
    console.error('[api/reserve-function-transactions]', err.message)
    res.status(500).json({ error: err.message })
  }
}
