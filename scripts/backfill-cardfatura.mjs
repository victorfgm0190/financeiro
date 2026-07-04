// Backfill card_id / fatura_ref dos tx_gerA_* legados.
//
// Contexto: commit 62ed14f passou a gravar card_id/fatura_ref ao criar/atualizar as
// transferências gerenciais tx_gerA_<expenseId> no motor (reconcileFaturaState). As etapas A
// criadas ANTES disso têm card_id/fatura_ref nulos.
//
// ⚠️ Descoberta do diagnóstico: a despesa origem NÃO tem fatura_ref (coluna nova, só gravada
// em tx_gerA_*/pagamentos). A fonte da fatura na despesa é fatura_month_year (YYYY-MM). Logo o
// backfill deriva fatura_ref = MM/YYYY a partir de fatura_month_year — idêntico ao que o motor
// grava (faturaRef = `${mm}/${yyyy}`). card_id = account_id da despesa origem.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-cardfatura-preview.mjs preview   (read-only, default)
//   node --env-file=.env.local scripts/backfill-cardfatura-preview.mjs apply     (WRITE, após aprovação)

import pg from 'pg'

const cmd = process.argv[2] || 'preview'
if (!['preview', 'apply'].includes(cmd)) {
  console.error(`Comando inválido: ${cmd}. Use: preview | apply`)
  process.exit(1)
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/backfill-cardfatura-preview.mjs <preview|apply>')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

// Condição comum: tx_gerA_* pendente cuja origem existe e tem fatura_month_year válido.
const WHERE_APLICAVEL = `
  l_ger.id LIKE 'tx_gerA_%'
  AND (l_ger.card_id IS NULL OR l_ger.fatura_ref IS NULL)
  AND l_orig.account_id IS NOT NULL
  AND l_orig.fatura_month_year ~ '^[0-9]{4}-[0-9]{2}$'
`
// fatura_ref MM/YYYY a partir de fatura_month_year YYYY-MM.
const FATURA_REF_EXPR = `SUBSTRING(l_orig.fatura_month_year FROM 6 FOR 2) || '/' || SUBSTRING(l_orig.fatura_month_year FROM 1 FOR 4)`

async function preview(client) {
  const totais = await client.query(`
    SELECT count(*)::int total,
           count(*) FILTER (WHERE card_id IS NULL)::int card_null,
           count(*) FILTER (WHERE fatura_ref IS NULL)::int fatura_null,
           count(*) FILTER (WHERE source_expense_id IS NULL)::int source_null
    FROM lancamentos WHERE id LIKE 'tx_gerA_%'`)
  const t = totais.rows[0]
  console.log('── Panorama tx_gerA_* ──────────────────────────────────')
  console.log(`  total: ${t.total} | card_id NULL: ${t.card_null} | fatura_ref NULL: ${t.fatura_null} | source_expense_id NULL: ${t.source_null}`)

  const clazz = await client.query(`
    SELECT count(*)::int linhas,
           count(*) FILTER (WHERE l_orig.id IS NULL)::int sem_origem,
           count(*) FILTER (WHERE l_orig.id IS NOT NULL AND l_orig.account_id IS NULL)::int origem_sem_card,
           count(*) FILTER (WHERE l_orig.fatura_month_year ~ '^[0-9]{4}-[0-9]{2}$')::int com_fmy,
           count(*) FILTER (WHERE l_orig.id IS NOT NULL AND (l_orig.fatura_month_year IS NULL OR l_orig.fatura_month_year !~ '^[0-9]{4}-[0-9]{2}$'))::int sem_fmy
    FROM lancamentos l_ger
    LEFT JOIN lancamentos l_orig ON l_orig.id = SUBSTRING(l_ger.id FROM 9)
    WHERE l_ger.id LIKE 'tx_gerA_%' AND (l_ger.card_id IS NULL OR l_ger.fatura_ref IS NULL)`)
  const c = clazz.rows[0]
  console.log('\n── Classificação da origem (linhas a preencher) ────────')
  console.log(`  linhas a preencher: ${c.linhas} | sem origem: ${c.sem_origem} | origem sem card: ${c.origem_sem_card}`)
  console.log(`  com fatura_month_year: ${c.com_fmy} (fatura_ref direto) | sem: ${c.sem_fmy} (precisaria fallback)`)

  const sample = await client.query(`
    SELECT l_ger.id ger_id, l_orig.account_id card_id, l_orig.fatura_month_year fmy, ${FATURA_REF_EXPR} fatura_ref_calc
    FROM lancamentos l_ger JOIN lancamentos l_orig ON l_orig.id = SUBSTRING(l_ger.id FROM 9)
    WHERE ${WHERE_APLICAVEL} ORDER BY l_ger.id LIMIT 8`)
  console.log('\n── Amostra do que o UPDATE gravaria ────────────────────')
  for (const r of sample.rows) console.log(`  ${r.ger_id}\n      card_id=${r.card_id}  fmy=${r.fmy} → fatura_ref=${r.fatura_ref_calc}`)
  console.log('\nNada foi alterado (read-only). Para aplicar: apply')
}

async function apply(client) {
  // Guarda: quantas linhas o UPDATE deveria tocar (aplicáveis) vs. pendentes totais.
  const alvo = await client.query(`
    SELECT count(*)::int n FROM lancamentos l_ger JOIN lancamentos l_orig ON l_orig.id = SUBSTRING(l_ger.id FROM 9)
    WHERE ${WHERE_APLICAVEL}`)
  const pend = await client.query(`
    SELECT count(*)::int n FROM lancamentos WHERE id LIKE 'tx_gerA_%' AND (card_id IS NULL OR fatura_ref IS NULL)`)
  console.log(`Aplicáveis: ${alvo.rows[0].n} | pendentes totais: ${pend.rows[0].n}`)
  if (alvo.rows[0].n === 0) { console.log('Nada a aplicar.'); return }

  await client.query('BEGIN')
  try {
    const res = await client.query(`
      UPDATE lancamentos l_ger
      SET card_id = l_orig.account_id,
          fatura_ref = ${FATURA_REF_EXPR}
      FROM lancamentos l_orig
      WHERE l_orig.id = SUBSTRING(l_ger.id FROM 9) AND ${WHERE_APLICAVEL}`)
    if (res.rowCount !== alvo.rows[0].n) {
      await client.query('ROLLBACK')
      console.log(`✖ ROLLBACK: UPDATE afetou ${res.rowCount}, esperado ${alvo.rows[0].n}. Nada aplicado.`)
      return
    }
    await client.query('COMMIT')
    console.log(`✔ COMMIT: ${res.rowCount} tx_gerA_* com card_id/fatura_ref preenchidos.`)
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

async function main() {
  const client = await pool.connect()
  try {
    if (cmd === 'apply') console.log('\n*** COMANDO DE ESCRITA: apply ***')
    if (cmd === 'preview') await preview(client)
    else await apply(client)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => { console.error('✖ Erro:', err.message); process.exit(1) })
