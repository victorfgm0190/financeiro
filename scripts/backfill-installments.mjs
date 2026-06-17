// PR2 — Backfill de parcelas + chave única (uq_lancamentos_installment).
//
// Reusa as funções REAIS do app (src/lib/installments.js) — paridade total com
// detectInstallment/normalizeInstallmentBase, sem reescrever regex em SQL.
//
// ⚠️ Toda escrita é um subcomando EXPLÍCITO. Os comandos de "gate" são read-only.
//
// Uso (server-side, NUNCA no browser):
//   node --env-file=.env.local scripts/backfill-installments.mjs <comando>
//
// Comandos read-only (gates):
//   check-columns   confirma colunas installment_* em lancamentos
//   gate1           candidatos do backfill: total + amostra 20 (antes/depois)
//   gate2           calcula installment_key (em memória) e lista duplicatas
//
// Comandos de ESCRITA (rodar só após aprovação por escrito do gate correspondente):
//   apply-backfill  UPDATE installment_num/total nos candidatos do gate1
//   apply-keys      ADD COLUMN installment_key + popula todas as linhas com num/total
//   create-index    CREATE UNIQUE INDEX parcial uq_lancamentos_installment

import pg from 'pg'
import { detectInstallment, normalizeInstallmentBase, installmentKey } from '../src/lib/installments.js'

const cmd = process.argv[2]
const KNOWN = ['check-columns', 'gate1', 'gate2', 'series', 'refs', 'delete-dups', 'manual-mark-preview', 'manual-mark-apply', 'apply-backfill', 'apply-keys', 'create-index']
const WRITES = new Set(['delete-dups', 'manual-mark-apply', 'apply-backfill', 'apply-keys', 'create-index'])

// Marcação manual aprovada: parcelas cujo formato o detector NÃO reconhece (código da
// loja com muitos dígitos antes da barra). num/total fixados à mão; installment_key
// calculado pela mesma fórmula (installmentKey).
const MANUAL_MARKS = [
  { desc: 'BR1*PRIVALIA 7216001/03', num: 1, total: 3 },
  { desc: 'BR1*PRIVALIA 7216002/03', num: 2, total: 3 },
  { desc: 'LOJAS RENNER FL 7601/03', num: 1, total: 3 },
  { desc: 'LOJAS RENNER FL 7602/03', num: 2, total: 3 },
]

// Duplicatas reais aprovadas para remoção (a linha "mais novo" de cada par PAYSERVICE,
// mesmo created_at e mesmo card_import nos dois lados = inserção dupla na importação).
const DELETE_IDS = [
  'tx_1781036229910_6z74elk6vha', // payservice 2/5
  'tx_1781527511431_iqcxbeozmx7', // payservice 3/5
  'tx_1781619979896_zyr6bt9kbps', // payservice 4/5
]

// Flags estilo --chave=valor (ex.: --base="clinica higa-ct lt" --account=acc_123).
function parseFlags(args) {
  const f = {}
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) f[m[1]] = m[2]
  }
  return f
}
const flags = parseFlags(process.argv.slice(3))

if (!cmd || !KNOWN.includes(cmd)) {
  console.error(`Comando inválido: ${cmd || '(vazio)'}\nUse um de: ${KNOWN.join(', ')}`)
  process.exit(1)
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode: node --env-file=.env.local scripts/backfill-installments.mjs <comando>')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Base normalizada + chave de parcela. Usa as funções reais sobre a DESCRIÇÃO.
function baseNormOf(description) {
  const det = detectInstallment(description || '')
  return normalizeInstallmentBase(det ? det.base : (description || ''))
}

// Chave: account_id | base | num/total | centavos | serie_inicio.
// Delega para installmentKey (fonte única em src/lib/installments.js) — mesma fórmula
// usada por txToRow nas inserções novas, garantindo paridade histórico ↔ futuro.
// NOTA: a chave mantém installment_num (além de serie_inicio). Sem `num`, as parcelas
// 1/3, 2/3, 3/3 de UMA mesma série teriam serie_inicio idêntico e colidiriam entre si.
function keyOf(row) {
  return installmentKey({
    accountId: row.account_id,
    description: row.description,
    installmentNum: row.installment_num,
    installmentTotal: row.installment_total,
    amount: row.amount,
    faturaMonthYear: row.fatura_month_year,
    date: row.date,
  })
}
// tx_ids de uma card_import pode vir como array (JSONB) ou string JSON (TEXT).
function txIdsOf(imp) {
  let v = imp.tx_ids
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = [] } }
  return Array.isArray(v) ? v : []
}

// ── check-columns (read-only) ────────────────────────────────────────────────
async function checkColumns(client) {
  const { rows } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'lancamentos' AND column_name LIKE 'installment%'
    ORDER BY column_name
  `)
  if (rows.length === 0) {
    console.log('Nenhuma coluna installment_* encontrada em lancamentos.')
  } else {
    console.log('Colunas installment_* em lancamentos:')
    for (const r of rows) console.log(`  • ${r.column_name}  (${r.data_type})`)
  }
}

// Candidatos do backfill: despesa de cartão, installment_num NULL, descrição casa.
async function loadCandidates(client) {
  const { rows } = await client.query(`
    SELECT id, account_id, description, amount, date, fatura_month_year,
           installment_num, installment_total
    FROM lancamentos
    WHERE type = 'expense' AND account_type = 'credit' AND installment_num IS NULL
    ORDER BY date, created_at
  `)
  const out = []
  for (const r of rows) {
    const det = detectInstallment(r.description || '')
    if (!det) continue
    out.push({ ...r, _num: det.num, _total: det.total })
  }
  return out
}

// ── gate1 (read-only) ─────────────────────────────────────────────────────────
async function gate1(client) {
  const cands = await loadCandidates(client)
  console.log(`\n[GATE 1] Candidatos ao backfill (despesa de cartão, installment_num IS NULL, descrição casa):`)
  console.log(`Total: ${cands.length} linha(s).\n`)
  if (cands.length === 0) return
  // Sanidade: prova que cada candidato é uma linha distinta (sem agregação).
  const distinctIds = new Set(cands.map(c => c.id)).size
  const distinctAccts = new Set(cands.map(c => c.account_id)).size
  console.log(`IDs distintos entre os candidatos: ${distinctIds} de ${cands.length} | contas distintas: ${distinctAccts}\n`)
  console.log('Amostra de até 20 (ANTES → DEPOIS) — id e conta COMPLETOS de cada linha:')
  for (const c of cands.slice(0, 20)) {
    console.log(
      `  id=${c.id}  conta=${c.account_id}\n` +
      `      desc="${c.description}"  valor=${fmtBRL(c.amount)}  data=${c.date}` +
      `  ::  installment_num/total: NULL/NULL → ${c._num}/${c._total}`
    )
  }
  console.log(`\nNada foi alterado. Para aplicar (após aprovação): apply-backfill`)
}

// ── apply-backfill (WRITE) ──────────────────────────────────────────────────
async function applyBackfill(client) {
  const cands = await loadCandidates(client)
  if (cands.length === 0) { console.log('Nenhum candidato. Nada a fazer.'); return }
  console.log(`[WRITE] Aplicando backfill em ${cands.length} linha(s)...`)
  await client.query('BEGIN')
  try {
    for (const c of cands) {
      await client.query(
        'UPDATE lancamentos SET installment_num = $1, installment_total = $2 WHERE id = $3 AND installment_num IS NULL',
        [c._num, c._total, c.id]
      )
    }
    await client.query('COMMIT')
    console.log(`✔ Backfill aplicado: ${cands.length} linha(s) atualizada(s).`)
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

// ── gate2 (read-only): calcula installment_key em memória e lista duplicatas ──
async function loadFilled(client) {
  const { rows } = await client.query(`
    SELECT id, created_at, account_id, description, amount, date, fatura_month_year,
           category_id, grupo_gerencial, payee, reserva_funcao_id,
           installment_num, installment_total
    FROM lancamentos
    WHERE installment_num IS NOT NULL AND installment_total IS NOT NULL
    ORDER BY date, created_at
  `)
  return rows
}
async function gate2(client) {
  const rows = await loadFilled(client)
  console.log(`\n[GATE 2] Linhas com installment_num/total preenchidos: ${rows.length}`)
  const byKey = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(r)
  }
  const dups = [...byKey.entries()].filter(([, v]) => v.length > 1)
  if (dups.length === 0) {
    console.log('✔ Nenhuma duplicata pela chave (account_id | base | num/total | centavos | serie_inicio).')
    console.log('Após aprovação: apply-keys e depois create-index.')
    return
  }
  // Cruza com card_imports: txId → importação(ões) que o contêm.
  const { rows: imps } = await client.query('SELECT id, imported_at, mes_ano, filename, account_id, tx_ids FROM card_imports')
  const impByTx = new Map()
  for (const imp of imps) {
    for (const txid of txIdsOf(imp)) {
      if (!impByTx.has(txid)) impByTx.set(txid, [])
      impByTx.get(txid).push(imp)
    }
  }
  const ts = (v) => (v?.toISOString?.() || String(v))
  console.log(`\n⚠ ${dups.length} grupo(s) de DUPLICATAS pela chave nova — casos completos (NÃO decidi qual manter):\n`)
  for (const [k, group] of dups) {
    const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    console.log(`  chave: ${k}`)
    sorted.forEach((r, i) => {
      const rImps = impByTx.get(r.id) || []
      const impStr = rImps.length
        ? rImps.map(im => `import=${im.id} "${im.filename}" mes=${im.mes_ano} em ${ts(im.imported_at)}`).join(' ; ')
        : 'sem card_import vinculado'
      console.log(
        `    ${i === 0 ? '↑ MAIS ANTIGO' : '  mais novo  '}  id=${r.id}  created_at=${ts(r.created_at)}\n` +
        `        parcela=${r.installment_num}/${r.installment_total}  ${fmtBRL(r.amount)}  data=${r.date}  fatura=${r.fatura_month_year || '-'}  desc="${r.description}"\n` +
        `        ${impStr}`
      )
    })
    console.log('')
  }
  console.log('Resolva as duplicatas antes do create-index (o índice único vai falhar enquanto existirem).')
}

// ── apply-keys (WRITE): coluna + popula chave ────────────────────────────────
async function applyKeys(client) {
  console.log('[WRITE] ADD COLUMN installment_key (idempotente) + populando...')
  await client.query('ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS installment_key TEXT')
  const rows = await loadFilled(client)
  await client.query('BEGIN')
  try {
    for (const r of rows) {
      await client.query('UPDATE lancamentos SET installment_key = $1 WHERE id = $2', [keyOf(r), r.id])
    }
    await client.query('COMMIT')
    console.log(`✔ installment_key populada em ${rows.length} linha(s).`)
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

// ── create-index (WRITE): índice único parcial ───────────────────────────────
async function createIndex(client) {
  console.log('[WRITE] Criando índice único parcial uq_lancamentos_installment...')
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_installment
    ON lancamentos (installment_key)
    WHERE installment_key IS NOT NULL
  `)
  console.log('✔ Índice criado (ou já existente).')
}

// ── series (read-only): série completa por base normalizada (+ conta opcional) ─
async function series(client) {
  const baseQ = normalizeInstallmentBase(flags.base || '')
  if (!baseQ) { console.log('Informe --base="<base normalizada>" (e opcional --account=<id>).'); return }
  const params = []
  let where = `type = 'expense' AND account_type = 'credit'`
  if (flags.account) { params.push(flags.account); where += ` AND account_id = $${params.length}` }
  const { rows } = await client.query(`
    SELECT id, created_at, account_id, description, amount, date, fatura_month_year,
           installment_num, installment_total, installment_key
    FROM lancamentos
    WHERE ${where}
    ORDER BY date, created_at
  `, params)
  // Casa pela base normalizada COMPUTADA (mesma função do app), não por SQL.
  const matched = rows.filter(r => baseNormOf(r.description).includes(baseQ))
  const ts = (r) => (r.created_at?.toISOString?.() || String(r.created_at))
  console.log(`\n[SÉRIE] base~="${baseQ}"${flags.account ? ` conta=${flags.account}` : ''} → ${matched.length} linha(s), por data:\n`)
  for (const r of matched) {
    console.log(
      `  ${r.date}  parcela ${(r.installment_num ?? '–')}/${(r.installment_total ?? '–')}  ${fmtBRL(r.amount).padStart(12)}  fatura=${r.fatura_month_year || '-'}\n` +
      `      id=${r.id}  created_at=${ts(r)}\n` +
      `      desc="${r.description}"  key=${r.installment_key || keyOf(r)}`
    )
  }
  // Pares duplicados DENTRO desta seleção (por chave computada); marca o mais antigo.
  const byKey = new Map()
  for (const r of matched) {
    const k = keyOf(r)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(r)
  }
  const dups = [...byKey.entries()].filter(([, v]) => v.length > 1)
  if (dups.length) {
    console.log(`\nPares duplicados nesta seleção (mais antigo por created_at marcado):`)
    for (const [k, g] of dups) {
      const sorted = [...g].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      console.log(`  chave: ${k}`)
      sorted.forEach((r, i) => console.log(`    ${i === 0 ? '↑ MAIS ANTIGO' : '  mais novo   '}  id=${r.id}  created_at=${ts(r)}  parcela=${r.installment_num}/${r.installment_total}`))
    }
  } else {
    console.log('\n(Sem duplicatas por chave nesta seleção.)')
  }
}

// ── refs (read-only): referências aos ids antes do DELETE ────────────────────
async function refs(client) {
  console.log(`\n[REFS] Verificando referências aos ${DELETE_IDS.length} ids aprovados:`)
  for (const id of DELETE_IDS) console.log(`  ${id}`)

  // (a) FKs declaradas no banco que apontam para lancamentos.
  const fks = await client.query(`
    SELECT conrelid::regclass::text AS from_table, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'lancamentos'::regclass
  `)
  console.log(`\nFKs declaradas referenciando lancamentos: ${fks.rows.length}`)
  fks.rows.forEach(f => console.log(`  ${f.from_table}.${f.conname}: ${f.def}`))

  // (b) lancamento_rateios.lancamento_id
  const rat = await client.query(
    'SELECT id, lancamento_id, categoria_id, valor FROM lancamento_rateios WHERE lancamento_id = ANY($1)', [DELETE_IDS])
  console.log(`\nlancamento_rateios referenciando esses ids: ${rat.rows.length}`)
  rat.rows.forEach(r => console.log(`  rateio id=${r.id} lancamento_id=${r.lancamento_id} cat=${r.categoria_id} ${fmtBRL(r.valor)}`))

  // (c) lancamentos.parent_tx_id (parcelas-filhas apontando para esses ids)
  const child = await client.query(
    'SELECT id, description, parent_tx_id FROM lancamentos WHERE parent_tx_id = ANY($1)', [DELETE_IDS])
  console.log(`\nlancamentos com parent_tx_id nesses ids (filhas): ${child.rows.length}`)
  child.rows.forEach(r => console.log(`  filha id=${r.id} parent=${r.parent_tx_id} desc="${r.description}"`))

  // (d) schedule_reserva_funcoes referencia agendamentos (schedule_id), não lancamentos.
  // Checagem defensiva: nenhum desses ids deve aparecer como schedule_id.
  const srf = await client.query(
    'SELECT id, schedule_id FROM schedule_reserva_funcoes WHERE schedule_id = ANY($1)', [DELETE_IDS])
  console.log(`\nschedule_reserva_funcoes com schedule_id nesses ids (esperado 0): ${srf.rows.length}`)

  const total = rat.rows.length + child.rows.length + srf.rows.length
  console.log(`\n${total === 0
    ? '✔ Nenhuma referência encontrada nessas tabelas — remoção segura.'
    : '⚠ Existem referências — NÃO remover sem tratar antes.'}`)
}

// ── delete-dups (WRITE): remove os 3 ids, em transação, com guarda de referências ─
async function deleteDups(client) {
  // Guarda: re-checa referências; se houver QUALQUER uma, não remove.
  const rat = await client.query('SELECT count(*)::int AS n FROM lancamento_rateios WHERE lancamento_id = ANY($1)', [DELETE_IDS])
  const child = await client.query('SELECT count(*)::int AS n FROM lancamentos WHERE parent_tx_id = ANY($1)', [DELETE_IDS])
  if (rat.rows[0].n > 0 || child.rows[0].n > 0) {
    console.log(`✖ Abortado: ${rat.rows[0].n} rateio(s) e ${child.rows[0].n} filha(s) referenciam esses ids. Rode 'refs' e trate antes.`)
    return
  }
  // Confere que existem exatamente os 3 esperados antes de remover.
  const before = await client.query(
    'SELECT id, description, amount, date, fatura_month_year, installment_num, installment_total FROM lancamentos WHERE id = ANY($1)', [DELETE_IDS])
  console.log(`Linhas encontradas para remoção (${before.rows.length} de ${DELETE_IDS.length} esperadas):`)
  before.rows.forEach(r => console.log(
    `  id=${r.id} ${r.installment_num}/${r.installment_total} ${fmtBRL(r.amount)} data=${r.date} fatura=${r.fatura_month_year || '-'} "${r.description}"`))
  if (before.rows.length !== DELETE_IDS.length) {
    console.log(`⚠ Abortado: esperava ${DELETE_IDS.length} linhas, encontrei ${before.rows.length}. Nada removido.`)
    return
  }
  await client.query('BEGIN')
  try {
    const del = await client.query('DELETE FROM lancamentos WHERE id = ANY($1)', [DELETE_IDS])
    if (del.rowCount !== DELETE_IDS.length) {
      await client.query('ROLLBACK')
      console.log(`✖ ROLLBACK: DELETE afetaria ${del.rowCount}, esperado ${DELETE_IDS.length}.`)
      return
    }
    await client.query('COMMIT')
    console.log(`✔ Removidas ${del.rowCount} linha(s) dentro da transação.`)
    console.log('⚠ Lembrete: rode scripts/recalc-credit-debt.mjs — o credit_debt do cartão estava inflado pelas duplicatas.')
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

// ── manual-mark (preview read-only / apply write) ────────────────────────────
async function loadManualTargets(client) {
  const out = []
  for (const mk of MANUAL_MARKS) {
    const { rows } = await client.query(
      `SELECT id, account_id, description, amount, date, fatura_month_year,
              installment_num, installment_total, installment_key
       FROM lancamentos WHERE description = $1`, [mk.desc])
    out.push({ mk, rows })
  }
  return out
}
function keyForMark(r, mk) {
  return installmentKey({
    accountId: r.account_id, description: r.description,
    installmentNum: mk.num, installmentTotal: mk.total,
    amount: r.amount, faturaMonthYear: r.fatura_month_year, date: r.date,
  })
}
async function manualMarkPreview(client) {
  const targets = await loadManualTargets(client)
  console.log('\n[MANUAL-MARK] Prévia (ANTES → DEPOIS) — nada aplicado:\n')
  for (const { mk, rows } of targets) {
    if (rows.length === 0) { console.log(`  ⚠ NÃO ENCONTRADO (descrição exata): "${mk.desc}"\n`); continue }
    if (rows.length > 1) console.log(`  ⚠ ${rows.length} linhas casam "${mk.desc}" — TODAS seriam marcadas:`)
    for (const r of rows) {
      console.log(`  id=${r.id}  "${r.description}"  ${fmtBRL(r.amount)}  fatura=${r.fatura_month_year || '-'}`)
      console.log(`      num/total: ${r.installment_num ?? 'NULL'}/${r.installment_total ?? 'NULL'} → ${mk.num}/${mk.total}`)
      console.log(`      installment_key: ${r.installment_key || 'NULL'} → ${keyForMark(r, mk)}\n`)
    }
  }
  console.log('Após aprovação explícita: manual-mark-apply')
}
async function manualMarkApply(client) {
  const targets = await loadManualTargets(client)
  const missing = targets.filter(t => t.rows.length === 0).map(t => t.mk.desc)
  if (missing.length) { console.log(`✖ Abortado: descrição(ões) não encontrada(s):\n  ${missing.join('\n  ')}`); return }
  await client.query('BEGIN')
  try {
    let n = 0
    for (const { mk, rows } of targets) {
      for (const r of rows) {
        const res = await client.query(
          'UPDATE lancamentos SET installment_num = $1, installment_total = $2, installment_key = $3 WHERE id = $4',
          [mk.num, mk.total, keyForMark(r, mk), r.id])
        n += res.rowCount
      }
    }
    await client.query('COMMIT')
    console.log(`✔ ${n} linha(s) marcada(s) (installment_num/total + installment_key).`)
  } catch (err) { await client.query('ROLLBACK'); throw err }
}

async function main() {
  const client = await pool.connect()
  try {
    if (WRITES.has(cmd)) console.log(`\n*** COMANDO DE ESCRITA: ${cmd} ***`)
    if (cmd === 'check-columns') await checkColumns(client)
    else if (cmd === 'gate1') await gate1(client)
    else if (cmd === 'gate2') await gate2(client)
    else if (cmd === 'series') await series(client)
    else if (cmd === 'refs') await refs(client)
    else if (cmd === 'delete-dups') await deleteDups(client)
    else if (cmd === 'manual-mark-preview') await manualMarkPreview(client)
    else if (cmd === 'manual-mark-apply') await manualMarkApply(client)
    else if (cmd === 'apply-backfill') await applyBackfill(client)
    else if (cmd === 'apply-keys') await applyKeys(client)
    else if (cmd === 'create-index') await createIndex(client)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => { console.error('✖ Erro:', err.message); process.exit(1) })
