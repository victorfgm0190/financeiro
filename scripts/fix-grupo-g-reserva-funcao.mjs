// Limpeza de reserva_funcao_id ÓRFÃ em lançamentos do Grupo G (grp_1).
//
// Contexto: o Grupo G (number=1, "Gerencial") NÃO tem função de reserva. Lançamentos desse
// grupo que carregam reserva_funcao_id têm uma função órfã de outro grupo (diagnóstico
// aprovado). A guarda no app (sanitizeReservaFuncao) já impede novos casos; este script
// higieniza os existentes.
//
// ⚠️ Toda escrita é um subcomando EXPLÍCITO. preview é read-only.
// ⚠️ NUNCA rodar no browser — acesso ao Neon só server-side, via este script.
//
// Uso:
//   node --env-file=.env.local scripts/fix-grupo-g-reserva-funcao.mjs preview
//   node --env-file=.env.local scripts/fix-grupo-g-reserva-funcao.mjs apply   (só após aprovação)

import pg from 'pg'

const cmd = process.argv[2]
const KNOWN = ['preview', 'apply']
const WRITES = new Set(['apply'])

const WHERE = `grupo_gerencial = 'grp_1' AND reserva_funcao_id IS NOT NULL`

if (!cmd || !KNOWN.includes(cmd)) {
  console.error(`Comando inválido: ${cmd || '(vazio)'}\nUse um de: ${KNOWN.join(', ')}`)
  process.exit(1)
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode: node --env-file=.env.local scripts/fix-grupo-g-reserva-funcao.mjs <comando>')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function loadOrfaos(client) {
  const { rows } = await client.query(
    `SELECT id, date, description, amount, fatura_month_year, reserva_funcao_id
     FROM lancamentos
     WHERE ${WHERE}
     ORDER BY fatura_month_year, date`,
  )
  return rows
}

// ── preview (read-only) ──────────────────────────────────────────────────────
async function preview(client) {
  const rows = await loadOrfaos(client)
  console.log(`\n[PREVIEW] Lançamentos do Grupo G (grp_1) com reserva_funcao_id órfã: ${rows.length}\n`)
  if (rows.length === 0) {
    console.log('✔ Nada a limpar. Banco já consistente.')
    return
  }
  for (const r of rows) {
    console.log(
      `  ${r.date}  ${fmtBRL(r.amount).padStart(12)}  fatura=${r.fatura_month_year || '-'}` +
      `  reserva_funcao_id=${r.reserva_funcao_id}\n      "${r.description}"  id=${r.id}`,
    )
  }
  console.log(`\n── Total: ${rows.length} lançamento(s) a limpar (reserva_funcao_id → NULL).`)
  console.log('Nada foi alterado. Para aplicar (após aprovação): apply')
}

// ── apply (WRITE) ────────────────────────────────────────────────────────────
async function apply(client) {
  const rows = await loadOrfaos(client)
  const esperado = rows.length
  console.log(`\n[APPLY] ${esperado} lançamento(s) a limpar (reserva_funcao_id → NULL).`)
  if (esperado === 0) { console.log('Nada a fazer.'); return }
  await client.query('BEGIN')
  try {
    const res = await client.query(`UPDATE lancamentos SET reserva_funcao_id = NULL WHERE ${WHERE}`)
    if (res.rowCount !== esperado) {
      await client.query('ROLLBACK')
      console.log(`✖ ROLLBACK: UPDATE afetaria ${res.rowCount}, esperado ${esperado}. Nada alterado.`)
      return
    }
    await client.query('COMMIT')
    console.log(`✔ COMMIT: ${res.rowCount} linha(s) atualizada(s) (reserva_funcao_id = NULL).`)
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

async function main() {
  const client = await pool.connect()
  try {
    if (WRITES.has(cmd)) console.log(`\n*** COMANDO DE ESCRITA: ${cmd} ***`)
    if (cmd === 'preview') await preview(client)
    else if (cmd === 'apply') await apply(client)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => { console.error('✖ Erro:', err.message); process.exit(1) })
