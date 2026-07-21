// Limpeza das etapas A (tx_gerA_<expenseId>) criadas ERRADAMENTE para PROJEÇÕES de parcela 2..N
// em faturas futuras (bug do commit daff84c, corrigido em reconcileFaturaState via isProjecaoParcela).
//
// Alvo: transferências tx_gerA_* cuja despesa de origem é uma parcela 2..N (installment_num > 1),
// de uma fatura POSTERIOR a 08/2026 (fatura_month_year > '2026-08') e AINDA NÃO confirmada
// (date_cartao IS NULL = projeção). Parcelas 2..N já importadas (date_cartao preenchido) NÃO são
// tocadas — a etapa A delas é correta.
//
// ⚠️ Toda escrita é subcomando EXPLÍCITO. `preview` é read-only. `delete` reverte o saldo das duas
//    contas afetadas (Principal e subconta Ger.) e apaga as linhas, tudo numa transação.
// ⚠️ NUNCA rodar no browser — acesso ao Neon só server-side, via este script.
//
// Uso:
//   node --env-file=.env.local scripts/cleanup-etapaA-projecoes.mjs preview   (read-only)
//   node --env-file=.env.local scripts/cleanup-etapaA-projecoes.mjs delete    (WRITE, após revisar)

import pg from 'pg'

const cmd = process.argv[2]
const KNOWN = ['preview', 'delete']
if (!cmd || !KNOWN.includes(cmd)) {
  console.error(`Comando inválido: ${cmd || '(vazio)'}\nUse: ${KNOWN.join(' | ')}`)
  process.exit(1)
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode: node --env-file=.env.local scripts/cleanup-etapaA-projecoes.mjs <comando>')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 })
const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Etapas A erradas (projeções de parcela 2..N em fatura futura, sem date_cartao).
const SELECT_WRONG = `
  SELECT a.id AS etapa_a_id, a.amount, a.date, a.description,
         a.account_id AS principal_id, a.to_account_id AS subconta_id, a.card_id,
         e.id AS expense_id, e.installment_num, e.installment_total,
         e.fatura_month_year, e.date_cartao, e.origin AS expense_origin, e.description AS expense_desc
  FROM lancamentos a
  JOIN lancamentos e ON e.id = a.source_expense_id
  WHERE a.id LIKE 'tx_gerA_%' AND a.type = 'transfer'
    AND COALESCE(e.installment_num, 0) > 1
    AND e.fatura_month_year > '2026-08'
    AND e.date_cartao IS NULL
  ORDER BY e.fatura_month_year, a.amount DESC
`

async function loadWrong(client) { return (await client.query(SELECT_WRONG)).rows }

async function preview(client) {
  const rows = await loadWrong(client)
  console.log(`\n[PREVIEW] Etapas A de PROJEÇÃO a remover (parcela 2..N, fatura > 08/2026, date_cartao NULL): ${rows.length}\n`)
  const porFatura = {}
  const deltaPrincipal = new Map(), deltaSub = new Map()
  let total = 0
  for (const r of rows) {
    console.log(`  ${r.etapa_a_id} | ${fmtBRL(r.amount)} | ${r.date} | "${r.description}"`)
    console.log(`      → despesa ${r.expense_id} | parc ${r.installment_num}/${r.installment_total} | fatura ${r.fatura_month_year} | date_cartao ${r.date_cartao || 'NULL'} | origin ${r.expense_origin}`)
    console.log(`      → saldo: Principal(${r.principal_id}) +${fmtBRL(r.amount)} · Subconta(${r.subconta_id}) -${fmtBRL(r.amount)}`)
    porFatura[r.fatura_month_year] = (porFatura[r.fatura_month_year] || 0) + 1
    total += Number(r.amount) || 0
    deltaPrincipal.set(r.principal_id, (deltaPrincipal.get(r.principal_id) || 0) + Number(r.amount))
    deltaSub.set(r.subconta_id, (deltaSub.get(r.subconta_id) || 0) + Number(r.amount))
  }
  console.log(`\n── Resumo ──────────────────────────────────────────────`)
  console.log(`  linhas: ${rows.length} | total: ${fmtBRL(total)}`)
  console.log(`  por fatura: ${Object.entries(porFatura).map(([f, n]) => `${f}=${n}`).join(', ') || '(nenhuma)'}`)
  console.log(`  ajuste de saldo ao apagar:`)
  for (const [id, v] of deltaPrincipal) console.log(`    Principal ${id}: +${fmtBRL(v)}`)
  for (const [id, v] of deltaSub) console.log(`    Subconta  ${id}: -${fmtBRL(v)}`)
  console.log(`\nNada foi alterado. Para aplicar: delete`)
}

async function del(client) {
  const rows = await loadWrong(client)
  if (rows.length === 0) { console.log('Nenhuma etapa A de projeção a remover. Nada a fazer.'); return }
  const ids = rows.map(r => r.etapa_a_id)
  // Deltas de saldo agregados por conta (revertem exatamente o efeito da etapa A: Principal→Sub).
  const deltaPrincipal = new Map(), deltaSub = new Map()
  for (const r of rows) {
    deltaPrincipal.set(r.principal_id, (deltaPrincipal.get(r.principal_id) || 0) + Number(r.amount))
    deltaSub.set(r.subconta_id, (deltaSub.get(r.subconta_id) || 0) + Number(r.amount))
  }
  console.log(`\n*** DELETE: ${ids.length} etapa(s) A de projeção ***`)
  await client.query('BEGIN')
  try {
    // Reverte saldo: credita a Principal (desfaz o débito) e debita a Subconta (desfaz o crédito).
    for (const [id, v] of deltaPrincipal) await client.query('UPDATE contas SET balance = balance + $1 WHERE id = $2', [v, id])
    for (const [id, v] of deltaSub)       await client.query('UPDATE contas SET balance = balance - $1 WHERE id = $2', [v, id])
    const res = await client.query('DELETE FROM lancamentos WHERE id = ANY($1) AND type = $2', [ids, 'transfer'])
    if (res.rowCount !== ids.length) {
      await client.query('ROLLBACK')
      console.log(`✖ ROLLBACK: DELETE afetaria ${res.rowCount}, esperado ${ids.length}. Nada aplicado.`)
      return
    }
    await client.query('COMMIT')
    console.log(`✔ COMMIT: ${res.rowCount} etapa(s) A removida(s); saldos das contas ajustados.`)
    console.log('Recomendado: abrir o app e rodar "Reconciliar Gerenciais" p/ recompor os agendamentos de devolução das faturas afetadas.')
  } catch (err) { await client.query('ROLLBACK'); throw err }
}

async function main() {
  const client = await pool.connect()
  try {
    if (cmd === 'preview') await preview(client)
    else if (cmd === 'delete') await del(client)
  } finally { client.release(); await pool.end() }
}
main().catch((err) => { console.error('✖ Erro:', err.message); process.exit(1) })
