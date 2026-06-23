// Backfill: gera retroativamente os lançamentos sombra (reserva_auto=true) das 18
// transferências de resgate de reserva gravadas ANTES do fix d1219b2, que ficaram órfãs
// (sem o par _r/_d). Replica exatamente o que buildReservaAutoTxs faz no ramo de resgate
// (fromAcc.isReserva): insere, por transferência, um _r (income) e um _d (expense).
//
// Cada sombra:
//   id = {tx_id}_r | {tx_id}_d ; type income|expense ; reserva_auto=true ; origin='manual'
//   parent_tx_id = {tx_id} ; account_id=null ; to_account_id=null
//   date/amount/reserva_funcao_id = iguais à transferência
//   category_id = categoria da função (null quando exibir_como_despesa=false)
//   description = "Resgate Reserva: CA"
//
// Idempotente: pula qualquer id ({tx_id}_r/_d) que já exista. Verifica antes a existência
// das 18 transferências-pai (aborta no apply se alguma estiver faltando).
//
// Uso:
//   node --env-file=.env.local scripts/backfill-resgate-shadows-d1219b2.mjs preview
//   node --env-file=.env.local scripts/backfill-resgate-shadows-d1219b2.mjs apply

import pg from 'pg'

const cmd = process.argv[2]
if (cmd !== 'preview' && cmd !== 'apply') {
  console.error('Uso: node --env-file=.env.local scripts/backfill-resgate-shadows-d1219b2.mjs <preview|apply>')
  process.exit(1)
}

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/backfill-resgate-shadows-d1219b2.mjs ' + cmd)
  process.exit(1)
}

// As 18 transferências órfãs. categoryId = null quando exibir_como_despesa=false.
const ORPHANS = [
  { id: 'tx_1781058746398_8_wt0ccmkumm',   date: '2026-05-18', amount: 30.00,   funcId: 'res_init_10', categoryId: 'cat_tra_man' },
  { id: 'tx_1781058746398_0_tvcfu10qd8t',  date: '2026-05-18', amount: 43.64,   funcId: 'res_init_18', categoryId: 'cat_cup_dro' },
  { id: 'tx_1781058746398_1_wryx6gkfg7l',  date: '2026-05-18', amount: 31.33,   funcId: 'res_init_26', categoryId: 'cat_out_pre' },
  { id: 'tx_1781058746398_6_1cqic2613lm',  date: '2026-05-18', amount: 219.70,  funcId: 'res_init_15', categoryId: 'cat_sau_aca' },
  { id: 'tx_1781058746398_5_63eklwrr9lj',  date: '2026-05-18', amount: 205.61,  funcId: 'res_init_7',  categoryId: 'cat_seg_aut' },
  { id: 'tx_1781058746398_2_jzlokgf06d',   date: '2026-05-18', amount: 369.37,  funcId: 'res_init_25', categoryId: 'cat_cup_ves' },
  { id: 'tx_1781058746398_7_ml132wfk6w',   date: '2026-05-18', amount: 400.00,  funcId: 'res_init_29', categoryId: 'cat_cup_sal' },
  { id: 'tx_1781058746398_3_xqf5f9wrdud',  date: '2026-05-18', amount: 855.90,  funcId: 'res_init_23', categoryId: null },
  { id: 'tx_1781058746398_4_m4gkk8ilco',   date: '2026-05-18', amount: 168.42,  funcId: 'res_init_11', categoryId: 'cat_tra_man' },
  { id: 'tx_1781058746398_0_jicxyz4odsf',  date: '2026-05-18', amount: 66.99,   funcId: 'res_init_10', categoryId: 'cat_tra_man' },
  { id: 'tx_1781058746398_9_0jhxxvqo13n6', date: '2026-05-18', amount: 1672.64, funcId: 'res_init_27', categoryId: null },
  { id: 'tx_1781743300757_1_3k4q9ttkh7e',  date: '2026-06-17', amount: 455.79,  funcId: 'res_init_25', categoryId: 'cat_cup_ves' },
  { id: 'tx_1781743300757_4_3c0a69ych4v',  date: '2026-06-17', amount: 205.61,  funcId: 'res_init_7',  categoryId: 'cat_seg_aut' },
  { id: 'tx_1781743300757_3_tt0txbqods',   date: '2026-06-17', amount: 349.17,  funcId: 'res_init_29', categoryId: 'cat_cup_sal' },
  { id: 'tx_1781743300757_2_kzlb6iqgoa',   date: '2026-06-17', amount: 189.80,  funcId: 'res_init_15', categoryId: 'cat_sau_aca' },
  { id: 'tx_1781743300757_6_j18hzf3lx9',   date: '2026-06-17', amount: 855.90,  funcId: 'res_init_23', categoryId: null },
  { id: 'tx_1781743300757_0_3q2q1oqf1em',  date: '2026-06-17', amount: 178.82,  funcId: 'res_init_18', categoryId: 'cat_cup_dro' },
  { id: 'tx_1781743300757_5_cn50hwwzbm4',  date: '2026-06-17', amount: 168.42,  funcId: 'res_init_11', categoryId: 'cat_tra_man' },
]

// Expande cada órfã nas duas sombras (_r income, _d expense).
function buildShadows(o) {
  const common = {
    account_id: null,
    to_account_id: null,
    amount: o.amount,
    date: o.date,
    description: 'Resgate Reserva: CA',
    category_id: o.categoryId,
    reserva_auto: true,
    parent_tx_id: o.id,
    reserva_funcao_id: o.funcId,
    origin: 'manual',
  }
  return [
    { id: `${o.id}_r`, type: 'income',  ...common },
    { id: `${o.id}_d`, type: 'expense', ...common },
  ]
}

const SHADOWS = ORPHANS.flatMap(buildShadows)

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

const fmtBRL = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const client = await pool.connect()
  try {
    // 1) Confere as 18 transferências-pai.
    const parentIds = ORPHANS.map(o => o.id)
    const { rows: parentsFound } = await client.query(
      'SELECT id FROM lancamentos WHERE id = ANY($1)', [parentIds]
    )
    const parentSet = new Set(parentsFound.map(r => r.id))
    const missingParents = parentIds.filter(id => !parentSet.has(id))

    // 2) Sombras que já existem (idempotência).
    const shadowIds = SHADOWS.map(s => s.id)
    const { rows: existing } = await client.query(
      'SELECT id FROM lancamentos WHERE id = ANY($1)', [shadowIds]
    )
    const existingSet = new Set(existing.map(r => r.id))
    const toInsert = SHADOWS.filter(s => !existingSet.has(s.id))

    console.log(`\n${cmd === 'preview' ? '[PREVIEW] ' : ''}Backfill de sombras de resgate (fix d1219b2)\n`)
    console.log(`  Transferências órfãs.....: ${ORPHANS.length}`)
    console.log(`  Sombras esperadas (×2)...: ${SHADOWS.length}`)
    console.log(`  Pais encontrados no banco: ${parentSet.size}/${parentIds.length}`)
    console.log(`  Sombras já existentes....: ${existingSet.size}`)
    console.log(`  Sombras a inserir........: ${toInsert.length}\n`)

    if (missingParents.length > 0) {
      console.log('  ⚠ Transferências-pai NÃO encontradas no banco:')
      for (const id of missingParents) console.log(`     - ${id}`)
      console.log('')
    }
    if (existingSet.size > 0) {
      console.log('  ↷ Sombras já existentes (serão puladas):')
      for (const id of existingSet) console.log(`     - ${id}`)
      console.log('')
    }

    console.log('  Registros a inserir:')
    for (const s of toInsert) {
      console.log(
        `     ${s.id.padEnd(34)} ${s.type.padEnd(7)} ${fmtBRL(s.amount).padStart(10)} ` +
        `${s.date} func=${s.reserva_funcao_id} cat=${s.category_id ?? 'null'}`
      )
    }
    console.log('')

    if (cmd === 'preview') {
      console.log('[PREVIEW] Nenhuma alteração aplicada. Rode com "apply" para gravar.')
      return
    }

    // Segurança: não grava sombra cujo pai não existe.
    if (missingParents.length > 0) {
      console.error(`✖ Abortado: ${missingParents.length} transferência(s)-pai ausente(s). Nenhuma sombra foi gravada.`)
      process.exit(1)
    }
    if (toInsert.length === 0) {
      console.log('Nada a inserir — todas as sombras já existem. (idempotente)')
      return
    }

    // INSERT multi-row em UMA única ida ao banco (evita 36 round-trips, mais robusto a
    // quedas transitórias de conexão). ON CONFLICT DO NOTHING reforça a idempotência.
    const COLS = ['id', 'type', 'account_id', 'to_account_id', 'amount', 'date', 'description',
                  'category_id', 'reserva_auto', 'parent_tx_id', 'reserva_funcao_id', 'origin']
    let p = 0
    const valuesSql = toInsert.map(() => `(${COLS.map(() => `$${++p}`).join(',')})`).join(', ')
    const params = toInsert.flatMap(s => [
      s.id, s.type, s.account_id, s.to_account_id, s.amount, s.date, s.description,
      s.category_id, s.reserva_auto, s.parent_tx_id, s.reserva_funcao_id, s.origin,
    ])
    await client.query('BEGIN')
    const res = await client.query(
      `INSERT INTO lancamentos (${COLS.join(', ')}) VALUES ${valuesSql} ON CONFLICT (id) DO NOTHING`,
      params
    )
    if (res.rowCount !== toInsert.length) {
      await client.query('ROLLBACK')
      console.error(`✖ Abortado: inseridas ${res.rowCount}, esperadas ${toInsert.length}. Nada foi gravado (rollback).`)
      process.exit(1)
    }
    await client.query('COMMIT')
    console.log(`✔ Concluído. ${res.rowCount} sombra(s) inserida(s).`)
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
