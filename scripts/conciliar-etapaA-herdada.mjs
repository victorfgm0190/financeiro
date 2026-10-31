// Concilia as etapas A (tx_gerA_<gasto>) e as provisões do Executar Gerenciais (tx_ger_*, parent_tx_id)
// que estão pendentes com o gasto de origem já conciliado. Só mexe em `reconciled` — valores, datas,
// contas e saldos ficam como estão. Vale para qualquer banco: aponte NEON_DATABASE_URL para ele.
//
//   node --env-file=.env.local scripts/conciliar-etapaA-herdada.mjs            → preview (só SELECT)
//   node --env-file=.env.local scripts/conciliar-etapaA-herdada.mjs --executar → aplica (transação)
//
// Feche o app antes de executar (o sync do cliente pode sobrescrever) e recarregue depois.
import pg from 'pg'

const executar = process.argv.includes('--executar')
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error('NEON_DATABASE_URL não definido'); process.exit(1) }

const ALVO = `
  SELECT a.id, a.date, a.amount, a.fatura_ref, g.id AS gasto_id, g.description AS gasto
  FROM lancamentos a
  JOIN lancamentos g ON g.id = CASE WHEN a.id LIKE 'tx_gerA_%' THEN SUBSTRING(a.id, 9) ELSE a.parent_tx_id END
  WHERE a.type = 'transfer'
    AND (a.id LIKE 'tx_gerA_%' OR (a.id LIKE 'tx\\_ger\\_%' AND a.parent_tx_id IS NOT NULL))
    AND NOT COALESCE(a.reconciled, false)
    AND g.type = 'expense' AND g.reconciled
  ORDER BY a.date, a.id`

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  const { rows } = await c.query(ALVO)
  console.log(`Etapas A pendentes com o gasto já conciliado: ${rows.length}`)
  console.table(rows.map(r => ({ id: r.id, data: r.date, valor: Number(r.amount), fatura: r.fatura_ref, gasto: r.gasto })))
  if (!executar || rows.length === 0) {
    if (!executar) console.log('Preview apenas. Rode com --executar para aplicar.')
  } else {
    await c.query('BEGIN')
    const ids = rows.map(r => r.id)
    const r = await c.query('UPDATE lancamentos SET reconciled = true WHERE id = ANY($1) AND NOT COALESCE(reconciled, false)', [ids])
    if (r.rowCount !== ids.length) {
      await c.query('ROLLBACK')
      throw new Error(`Esperava ${ids.length} linhas, atualizou ${r.rowCount} — desfeito.`)
    }
    await c.query('COMMIT')
    console.log(`Conciliadas: ${r.rowCount}`)
  }
} finally {
  await c.end()
}
