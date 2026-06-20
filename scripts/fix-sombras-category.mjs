// Backfill: alinha o category_id das sombras de reserva (lançamentos reservaAuto
// "Reserva: X" / "Resgate Reserva: X") à categoria vinculada à função de reserva
// (reserve_functions.category_id). Só toca em sombras cuja função JÁ tem categoria.
//
// Subcomandos:
//   node --env-file=.env.local scripts/fix-sombras-category.mjs preview   (só simula)
//   node --env-file=.env.local scripts/fix-sombras-category.mjs apply     (aplica)

import pg from 'pg'

const cmd = process.argv[2]
if (cmd !== 'preview' && cmd !== 'apply') {
  console.error('Uso: node --env-file=.env.local scripts/fix-sombras-category.mjs <preview|apply>')
  process.exit(1)
}

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/fix-sombras-category.mjs ' + cmd)
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

// Sombras elegíveis: descrição de reserva + reserva_funcao_id ligado a uma função COM
// categoria, onde a categoria atual da sombra difere da categoria da função.
const PREVIEW_SQL = `
  SELECT rf.id AS func_id, rf.name AS func_name, rf.category_id, c.name AS cat_name,
         COUNT(*) AS n
  FROM lancamentos l
  JOIN reserve_functions rf ON l.reserva_funcao_id = rf.id
  LEFT JOIN categorias c ON c.id = rf.category_id
  WHERE rf.category_id IS NOT NULL
    AND (l.description LIKE 'Reserva: %' OR l.description LIKE 'Resgate Reserva: %')
    AND l.category_id IS DISTINCT FROM rf.category_id
  GROUP BY rf.id, rf.name, rf.category_id, c.name
  ORDER BY rf.name
`

const UPDATE_SQL = `
  UPDATE lancamentos l
  SET category_id = rf.category_id
  FROM reserve_functions rf
  WHERE l.reserva_funcao_id = rf.id
    AND rf.category_id IS NOT NULL
    AND (l.description LIKE 'Reserva: %' OR l.description LIKE 'Resgate Reserva: %')
    AND l.category_id IS DISTINCT FROM rf.category_id
`

async function main() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(PREVIEW_SQL)
    const total = rows.reduce((s, r) => s + Number(r.n), 0)

    if (rows.length === 0) {
      console.log('Nenhuma sombra a atualizar (nenhuma função com categoria vinculada e sombras divergentes).')
      return
    }

    console.log(`\n${cmd === 'preview' ? '[PREVIEW] ' : ''}Sombras a atualizar por função de reserva:\n`)
    for (const r of rows) {
      console.log(`  • ${r.func_name} → ${r.cat_name || r.category_id}: ${r.n} sombra(s)`)
    }
    console.log(`\n  Total: ${total} sombra(s).\n`)

    if (cmd === 'preview') {
      console.log('[PREVIEW] Nenhuma alteração aplicada. Rode com "apply" para gravar.')
      return
    }

    await client.query('BEGIN')
    const res = await client.query(UPDATE_SQL)
    if (res.rowCount !== total) {
      await client.query('ROLLBACK')
      console.error(`✖ Abortado: UPDATE afetou ${res.rowCount} linha(s), mas o preview previa ${total}. Nada foi gravado.`)
      process.exit(1)
    }
    await client.query('COMMIT')
    console.log(`✔ Concluído. ${res.rowCount} sombra(s) atualizada(s).`)
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* noop */ }
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('✖ Erro:', err.message)
  process.exit(1)
})
