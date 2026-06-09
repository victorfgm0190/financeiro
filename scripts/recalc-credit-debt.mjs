// Recálculo único de credit_debt e credit_month_bill de todos os cartões de crédito,
// a partir dos lançamentos atuais. Fórmula (por cartão, casando account_id):
//   net = Σ(expense) − Σ(credit_payment) − Σ(income)   → clampado em 0 (sem dívida negativa)
//
// Fonte de verdade lida pelo app: tabela `contas` (credit_debt + credit_month_bill).
// `cartoes` é espelho secundário (só credit_debt) — atualizado também por consistência.
//
// Uso:
//   node --env-file=.env.local scripts/recalc-credit-debt.mjs            (aplica)
//   node --env-file=.env.local scripts/recalc-credit-debt.mjs --dry-run  (só simula)

import pg from 'pg'

const DRY_RUN = process.argv.includes('--dry-run')
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/recalc-credit-debt.mjs')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

// Detalhamento por tipo (para o relatório) + net consolidado, por cartão.
const SELECT_SQL = `
  SELECT
    c.id,
    c.name,
    c.credit_debt        AS old_debt,
    c.credit_month_bill  AS old_bill,
    COALESCE(SUM(CASE WHEN l.type = 'expense'        THEN l.amount ELSE 0 END), 0) AS sum_expense,
    COALESCE(SUM(CASE WHEN l.type = 'credit_payment' THEN l.amount ELSE 0 END), 0) AS sum_payment,
    COALESCE(SUM(CASE WHEN l.type = 'income'         THEN l.amount ELSE 0 END), 0) AS sum_income
  FROM contas c
  LEFT JOIN lancamentos l ON l.account_id = c.id
  WHERE c.type = 'credit'
  GROUP BY c.id, c.name, c.credit_debt, c.credit_month_bill
  ORDER BY c.name
`

async function main() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(SELECT_SQL)
    if (rows.length === 0) {
      console.log('Nenhum cartão de crédito (contas.type = \'credit\') encontrado.')
      return
    }

    console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Recalculando ${rows.length} cartão(ões)...\n`)

    const plan = rows.map((r) => {
      const expense = round2(r.sum_expense)
      const payment = round2(r.sum_payment)
      const income = round2(r.sum_income)
      const net = round2(expense - payment - income)
      const newDebt = Math.max(0, net) // dívida não fica negativa (mesma intenção do app)
      return {
        id: r.id,
        name: r.name,
        oldDebt: round2(r.old_debt),
        oldBill: round2(r.old_bill),
        expense, payment, income,
        newDebt,
        changed: round2(r.old_debt) !== newDebt || round2(r.old_bill) !== newDebt,
      }
    })

    for (const p of plan) {
      const mark = p.changed ? '•' : ' '
      console.log(
        `${mark} ${p.name}\n` +
        `    despesas ${fmtBRL(p.expense)}  − pagamentos ${fmtBRL(p.payment)}  − estornos ${fmtBRL(p.income)}\n` +
        `    debt:  ${fmtBRL(p.oldDebt)}  →  ${fmtBRL(p.newDebt)}` +
        (round2(p.oldBill) !== p.newDebt ? `   |  monthBill: ${fmtBRL(p.oldBill)}  →  ${fmtBRL(p.newDebt)}` : '') +
        '\n'
      )
    }

    if (DRY_RUN) {
      const n = plan.filter((p) => p.changed).length
      console.log(`[DRY-RUN] Nenhuma alteração aplicada. ${n} cartão(ões) teriam mudança.`)
      return
    }

    await client.query('BEGIN')
    for (const p of plan) {
      await client.query(
        'UPDATE contas SET credit_debt = $1, credit_month_bill = $2 WHERE id = $3',
        [p.newDebt, p.newDebt, p.id]
      )
      // Espelho em cartoes (só tem credit_debt); ignora se a linha não existir.
      await client.query(
        'UPDATE cartoes SET credit_debt = $1 WHERE id = $2',
        [p.newDebt, p.id]
      )
    }
    await client.query('COMMIT')

    const changed = plan.filter((p) => p.changed).length
    console.log(`✔ Concluído. ${plan.length} cartão(ões) processado(s), ${changed} com valores ajustados.`)
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
