// PR3 / Migração D3 — renomeia as transferências gerenciais legadas (etapa A do Grupo G)
// de id ALEATÓRIO para id DETERMINÍSTICO tx_gerA_<expenseId>, derivado da despesa de origem.
//
// Contexto: o item 8 (já em main) passou a derivar a etapa A com id determinístico
// (tx_gerA_<id>) no motor (reconcileFaturaState). As etapas A criadas ANTES disso têm id
// aleatório e o app só as adota por correspondência transitória (descrição+valor). Esta
// migração materializa essa adoção UMA vez, renomeando o id no banco.
//
// ⚠️ Toda escrita é um subcomando EXPLÍCITO. migrate-preview é read-only.
// ⚠️ NUNCA rodar no browser — acesso ao Neon só server-side, via este script.
//
// Uso:
//   node --env-file=.env.local scripts/migrate-etapaA.mjs migrate-preview
//   node --env-file=.env.local scripts/migrate-etapaA.mjs migrate-apply   (só após aprovação)
//
//   migrate-preview  read-only: casa cada transferência legada à despesa de origem,
//                    verifica referências ao id antigo e lista old_id → novo_id + status.
//   migrate-apply    WRITE: dentro de uma transação, UPDATE id (old → novo) APENAS nas
//                    linhas com status OK; confere rowCount antes do COMMIT. Ambíguas,
//                    sem match e bloqueadas (referência/colisão) são só relatadas.

import pg from 'pg'

const cmd = process.argv[2]
const KNOWN = ['migrate-preview', 'inspect-blocked', 'remove-blocked', 'migrate-apply']
const WRITES = new Set(['remove-blocked', 'migrate-apply'])

const PREFIX = 'Reserva Gerencial - '

// Transfers bloqueados aprovados para remoção (saída de inspect-blocked, refs = 0).
// Cada um é a cópia redundante de um grupo "vários transfers → mesmo novo_id": o outro
// transfer do grupo permanece e será migrado a tx_gerA_<expenseId> no migrate-apply.
const REMOVE_IDS = [
  'tx_ger_1781036229910_tygukesbwv8', // PAYSERVICE 02/05 — duplicata idêntica
  'tx_ger_1781543977287_okrn2zcalo',  // OUTLETCENTERB 04/10 — extra sem parent
  'tx_ger_1781558457999_49guzm61iti',  // OUTLETCENTERB 04/10 — extra sem parent
  'tx_ger_1781527511431_vfobbura8qc', // PAYSERVICE 03/05 — duplicata idêntica
  'tx_ger_1781619979896_jc9q09dv48e', // PAYSERVICE 04/05 — duplicata idêntica
]

if (!cmd || !KNOWN.includes(cmd)) {
  console.error(`Comando inválido: ${cmd || '(vazio)'}\nUse um de: ${KNOWN.join(', ')}`)
  process.exit(1)
}
if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode: node --env-file=.env.local scripts/migrate-etapaA.mjs <comando>')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cents = (n) => Math.round((Number(n) || 0) * 100)
const etapaAId = (expenseId) => `tx_gerA_${expenseId}`

// Resolve o id do Grupo G (number = 1). number é JSONB → o número 1 fica gravado como '1'.
async function resolveGrupoG(client) {
  const { rows } = await client.query(`SELECT id, name, number FROM reservas_funcoes WHERE number = '1'::jsonb`)
  if (rows.length === 0) throw new Error("Nenhum grupo gerencial com number=1 (Grupo G) encontrado em reservas_funcoes.")
  if (rows.length > 1) throw new Error(`Mais de um grupo com number=1: ${rows.map(r => r.id).join(', ')} — ambíguo, abortando.`)
  return rows[0]
}

// Transferências legadas: type='transfer', grupo G, "Reserva Gerencial -...", id ainda aleatório.
async function loadLegacyTransfers(client, grupoId) {
  const { rows } = await client.query(`
    SELECT id, account_id, to_account_id, amount, date, description, fatura_month_year,
           grupo_gerencial, parent_tx_id, created_at
    FROM lancamentos
    WHERE type = 'transfer'
      AND grupo_gerencial = $1
      AND description ILIKE 'Reserva Gerencial -%'
      AND id NOT LIKE 'tx_gerA_%'
    ORDER BY date, created_at
  `, [grupoId])
  return rows
}

// Candidatas a despesa de origem do Grupo G (despesa de cartão).
async function loadExpenses(client, grupoId) {
  const { rows } = await client.query(`
    SELECT id, description, amount, date, fatura_month_year
    FROM lancamentos
    WHERE type = 'expense'
      AND account_type = 'credit'
      AND grupo_gerencial = $1
    ORDER BY date, created_at
  `, [grupoId])
  return rows
}

// Casa cada transferência legada à despesa de origem por: descrição (texto após o prefixo)
// e valor (centavos exatos). Indexa as despesas por "desc|centavos" para O(1) e detectar
// ambiguidade (mais de uma despesa com mesma descrição+valor).
function buildPlan(transfers, expenses) {
  const byKey = new Map() // "desc|cents" → [expense, ...]
  for (const e of expenses) {
    const k = `${e.description || ''}|${cents(e.amount)}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(e)
  }
  const plan = []
  for (const t of transfers) {
    const desc = t.description || ''
    // texto após 'Reserva Gerencial - ' (a descrição é gravada com .trim() do todo).
    const stripped = desc.startsWith(PREFIX) ? desc.slice(PREFIX.length) : null
    if (stripped === null) {
      // ILIKE casou mas o prefixo exato não bate (ex.: caixa diferente) — sem match seguro.
      plan.push({ t, matches: [], status: 'sem match', reason: 'prefixo não confere (case)' })
      continue
    }
    const matches = byKey.get(`${stripped}|${cents(t.amount)}`) || []
    if (matches.length === 0) plan.push({ t, stripped, matches, status: 'sem match' })
    else if (matches.length > 1) plan.push({ t, stripped, matches, status: 'ambígua' })
    else plan.push({ t, stripped, matches, expense: matches[0], novo: etapaAId(matches[0].id), status: 'OK' })
  }
  return plan
}

// Verifica referências ao id ANTIGO em lancamento_rateios e lancamentos.parent_tx_id, e
// detecta colisão do novo id (já existente) ou dois transfers mapeando ao mesmo novo id.
async function annotateBlocks(client, plan) {
  const oldIds = plan.map(p => p.t.id)
  const refRat = new Map()   // old_id → nº de rateios
  const refChild = new Map() // old_id → nº de filhas (parent_tx_id)
  if (oldIds.length) {
    const rat = await client.query(
      'SELECT lancamento_id, count(*)::int AS n FROM lancamento_rateios WHERE lancamento_id = ANY($1) GROUP BY lancamento_id', [oldIds])
    rat.rows.forEach(r => refRat.set(r.lancamento_id, r.n))
    const child = await client.query(
      'SELECT parent_tx_id, count(*)::int AS n FROM lancamentos WHERE parent_tx_id = ANY($1) GROUP BY parent_tx_id', [oldIds])
    child.rows.forEach(r => refChild.set(r.parent_tx_id, r.n))
  }

  // Novos ids OK que já existem no banco (colisão de PK).
  const okNovos = plan.filter(p => p.status === 'OK').map(p => p.novo)
  const existing = new Set()
  if (okNovos.length) {
    const { rows } = await client.query('SELECT id FROM lancamentos WHERE id = ANY($1)', [okNovos])
    rows.forEach(r => existing.add(r.id))
  }
  // Dois transfers OK apontando para o mesmo novo id.
  const novoCount = new Map()
  for (const p of plan) if (p.status === 'OK') novoCount.set(p.novo, (novoCount.get(p.novo) || 0) + 1)

  for (const p of plan) {
    p.refRat = refRat.get(p.t.id) || 0
    p.refChild = refChild.get(p.t.id) || 0
    if (p.status !== 'OK') continue
    const blocks = []
    if (p.refRat) blocks.push(`${p.refRat} rateio(s) → old_id`)
    if (p.refChild) blocks.push(`${p.refChild} filha(s) parent_tx_id → old_id`)
    if (existing.has(p.novo)) blocks.push('novo_id já existe (colisão PK)')
    if (novoCount.get(p.novo) > 1) blocks.push('dois transfers → mesmo novo_id')
    if (blocks.length) { p.status = 'bloqueada'; p.blocks = blocks }
  }
  return plan
}

function statusIcon(s) {
  if (s === 'OK') return 'OK'
  if (s === 'ambígua') return '⚠ ambígua'
  if (s === 'sem match') return '⚠ sem match'
  if (s === 'bloqueada') return '⛔ bloqueada'
  return s
}

async function listFks(client) {
  const { rows } = await client.query(`
    SELECT conrelid::regclass::text AS from_table, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'lancamentos'::regclass
  `)
  return rows
}

// ── migrate-preview (read-only) ──────────────────────────────────────────────
async function preview(client) {
  const g = await resolveGrupoG(client)
  console.log(`\n[MIGRATE-PREVIEW] Grupo G: id=${g.id} name="${g.name}" number=${JSON.stringify(g.number)}`)

  const fks = await listFks(client)
  console.log(`\nFKs declaradas referenciando lancamentos: ${fks.length}`)
  fks.forEach(f => console.log(`  ${f.from_table}.${f.conname}: ${f.def}`))
  console.log('  (além das FKs, checo lancamento_rateios.lancamento_id e lancamentos.parent_tx_id por valor.)')

  const transfers = await loadLegacyTransfers(client, g.id)
  const expenses = await loadExpenses(client, g.id)
  console.log(`\nTransferências legadas (id aleatório): ${transfers.length} | despesas G (cartão): ${expenses.length}\n`)

  const plan = await annotateBlocks(client, buildPlan(transfers, expenses))

  for (const p of plan) {
    const t = p.t
    const head = `  ${t.id} | ${fmtBRL(t.amount)} | ${t.date} | "${t.description}"`
    if (p.status === 'OK') {
      console.log(`${head}\n      → despesa: ${p.expense.id} | fatura=${p.expense.fatura_month_year || '-'} | novo_id=${p.novo} | status: ${statusIcon(p.status)}`)
    } else if (p.status === 'bloqueada') {
      console.log(`${head}\n      → despesa: ${p.expense.id} | fatura=${p.expense.fatura_month_year || '-'} | novo_id=${p.novo} | status: ${statusIcon(p.status)} (${p.blocks.join('; ')})`)
    } else if (p.status === 'ambígua') {
      console.log(`${head}\n      → ${p.matches.length} despesas casam (desc+valor): ${p.matches.map(m => m.id).join(', ')} | status: ${statusIcon(p.status)}`)
    } else {
      const why = p.reason ? ` (${p.reason})` : ''
      console.log(`${head}\n      → nenhuma despesa casa (texto após prefixo + valor)${why} | status: ${statusIcon(p.status)}`)
    }
    if (p.refRat || p.refChild) console.log(`      ⚠ referências ao old_id: ${p.refRat} rateio(s), ${p.refChild} filha(s)`)
  }

  const n = (s) => plan.filter(p => p.status === s).length
  console.log(`\n── Rodapé ──────────────────────────────────────────────`)
  console.log(`  OK (migráveis):   ${n('OK')}`)
  console.log(`  ⚠ ambíguas:       ${n('ambígua')}`)
  console.log(`  ⚠ sem match:      ${n('sem match')}`)
  console.log(`  ⛔ bloqueadas:     ${n('bloqueada')}  (referência ao old_id ou colisão de novo_id)`)
  console.log(`  total transfers:  ${plan.length}`)
  console.log(`\nNada foi alterado. Para aplicar APENAS as OK (após aprovação): migrate-apply`)
}

// ── inspect-blocked (read-only) ──────────────────────────────────────────────
// Detalha os pares "dois transfers → mesmo novo_id": ambos casam a MESMA despesa
// sobrevivente (após removermos as duplicatas anteriores). Para cada par, mostra os
// ids, created_at e parent_tx_id, e checa se o parent_tx_id ainda EXISTE. O transfer
// cujo parent_tx_id aponta para uma despesa já removida (ou inexistente) é o órfão —
// candidato seguro à remoção; o outro fica para migrar a tx_gerA_<expenseId>.
async function inspectBlocked(client) {
  const g = await resolveGrupoG(client)
  const transfers = await loadLegacyTransfers(client, g.id)
  const expenses = await loadExpenses(client, g.id)
  const plan = buildPlan(transfers, expenses)

  // Agrupa os transfers OK por novo_id (= expenseId). Grupos com 2+ são os bloqueados.
  const byNovo = new Map()
  for (const p of plan) {
    if (p.status !== 'OK') continue
    if (!byNovo.has(p.novo)) byNovo.set(p.novo, [])
    byNovo.get(p.novo).push(p)
  }
  const collisions = [...byNovo.entries()].filter(([, ps]) => ps.length > 1)

  // Resolve existência de cada parent_tx_id referenciado pelos transfers em colisão.
  const parentIds = [...new Set(collisions.flatMap(([, ps]) => ps.map(p => p.t.parent_tx_id).filter(Boolean)))]
  const alive = new Set()
  if (parentIds.length) {
    const { rows } = await client.query('SELECT id FROM lancamentos WHERE id = ANY($1)', [parentIds])
    rows.forEach(r => alive.add(r.id))
  }
  const ts = (v) => (v?.toISOString?.() || String(v))

  console.log(`\n[INSPECT-BLOCKED] Grupo G=${g.id} | grupos "transfers → mesmo novo_id": ${collisions.length}\n`)
  const removeList = []   // ids recomendados para remoção
  const manualGroups = [] // grupos sem recomendação inequívoca
  for (const [novo, ps] of collisions) {
    const exp = ps[0].expense
    console.log(`  novo_id=${novo}`)
    console.log(`    despesa sobrevivente: ${exp.id} | ${fmtBRL(exp.amount)} | fatura=${exp.fatura_month_year || '-'} | "${exp.description}"`)
    const annotated = ps.map(p => ({
      p, pid: p.t.parent_tx_id,
      parentAlive: p.t.parent_tx_id ? alive.has(p.t.parent_tx_id) : null, // null = sem parent
    }))
    const keepers = annotated.filter(a => a.pid && a.parentAlive)

    // Decisão:
    //  • 1 transfer ligado à despesa sobrevivente (parent_tx_id vivo) → MANTÉM esse; remove o resto.
    //  • nenhum ligado, todos sem parent → duplicatas idênticas; mantém 1 (created_at asc, id asc), remove o resto.
    //  • >1 ligado → ambíguo, manual.
    let keep = null, decidable = true, motivo = ''
    if (keepers.length === 1) { keep = keepers[0]; motivo = 'único com parent_tx_id apontando à despesa sobrevivente' }
    else if (keepers.length === 0 && annotated.every(a => a.pid === null || !a.parentAlive)) {
      keep = [...annotated].sort((a, b) =>
        (new Date(a.p.t.created_at) - new Date(b.p.t.created_at)) || String(a.p.t.id).localeCompare(String(b.p.t.id)))[0]
      motivo = 'duplicatas idênticas (nenhum tem parent vivo) — mantido 1 por created_at/id'
    } else { decidable = false }

    for (const a of annotated) {
      const role = !decidable ? '❓' : (a === keep ? '✅ MANTER → migrar' : '❌ REMOVER')
      console.log(`      ${a.p.t.id}  data=${a.p.t.date}  created_at=${ts(a.p.t.created_at)}  parent_tx_id=${a.pid || '—'}${a.pid ? (a.parentAlive ? ' (vivo)' : ' (REMOVIDO)') : ''}  ${role}`)
    }
    if (decidable) {
      const remove = annotated.filter(a => a !== keep).map(a => a.p.t.id)
      console.log(`      ➜ manter ${keep.p.t.id}; remover: ${remove.join(', ')}`)
      console.log(`        motivo: ${motivo}`)
      remove.forEach(id => removeList.push(id))
    } else {
      console.log(`      ➜ ⚠ ambíguo (${keepers.length} com parent vivo) — inspecionar manualmente.`)
      manualGroups.push(novo)
    }
    console.log('')
  }

  // Segurança: nenhum id a remover pode ser referenciado (rateio / parent_tx_id de terceiros).
  let refRat = [], refChild = []
  if (removeList.length) {
    refRat = (await client.query('SELECT lancamento_id, count(*)::int n FROM lancamento_rateios WHERE lancamento_id = ANY($1) GROUP BY lancamento_id', [removeList])).rows
    refChild = (await client.query('SELECT parent_tx_id, count(*)::int n FROM lancamentos WHERE parent_tx_id = ANY($1) GROUP BY parent_tx_id', [removeList])).rows
  }

  console.log(`── Resumo ──────────────────────────────────────────────`)
  console.log(`  grupos analisados: ${collisions.length}  | ambíguos (manual): ${manualGroups.length}`)
  console.log(`  remoções recomendadas: ${removeList.length}`)
  removeList.forEach(id => console.log(`    ❌ ${id}`))
  const refTotal = refRat.length + refChild.length
  console.log(`  referências aos ids a remover: ${refTotal === 0 ? '✔ nenhuma (remoção segura)' : '⚠ EXISTEM — ver abaixo'}`)
  refRat.forEach(r => console.log(`    rateio → ${r.lancamento_id}: ${r.n}`))
  refChild.forEach(r => console.log(`    parent_tx_id → ${r.parent_tx_id}: ${r.n}`))
  console.log(`\nNada foi alterado. (Remoção e migração são passos separados — aguardo sua aprovação.)`)
}

// ── remove-blocked (WRITE) ───────────────────────────────────────────────────
// Remove os 5 transfers redundantes aprovados (REMOVE_IDS), em transação. Guarda contra
// referências (rateio / parent_tx_id) e confere existência + rowCount=5 antes do COMMIT.
async function removeBlocked(client) {
  // Guarda: re-checa referências; qualquer uma aborta sem tocar no banco.
  const rat = await client.query('SELECT count(*)::int n FROM lancamento_rateios WHERE lancamento_id = ANY($1)', [REMOVE_IDS])
  const child = await client.query('SELECT count(*)::int n FROM lancamentos WHERE parent_tx_id = ANY($1)', [REMOVE_IDS])
  if (rat.rows[0].n > 0 || child.rows[0].n > 0) {
    console.log(`✖ Abortado: ${rat.rows[0].n} rateio(s) e ${child.rows[0].n} filha(s) referenciam esses ids. Trate antes.`)
    return
  }
  // Confere que existem exatamente os 5 esperados antes de remover.
  const before = await client.query(
    'SELECT id, type, amount, date, description, grupo_gerencial, parent_tx_id FROM lancamentos WHERE id = ANY($1)', [REMOVE_IDS])
  console.log(`Linhas encontradas para remoção (${before.rows.length} de ${REMOVE_IDS.length} esperadas):`)
  before.rows.forEach(r => console.log(
    `  id=${r.id} type=${r.type} ${fmtBRL(r.amount)} data=${r.date} parent=${r.parent_tx_id || '—'} "${r.description}"`))
  if (before.rows.length !== REMOVE_IDS.length) {
    console.log(`⚠ Abortado: esperava ${REMOVE_IDS.length} linhas, encontrei ${before.rows.length}. Nada removido.`)
    return
  }
  // Sanidade: todos devem ser transfers (não apaga nada que não seja transferência).
  const naoTransfer = before.rows.filter(r => r.type !== 'transfer')
  if (naoTransfer.length) {
    console.log(`⚠ Abortado: ${naoTransfer.length} linha(s) não são type='transfer': ${naoTransfer.map(r => r.id).join(', ')}.`)
    return
  }
  await client.query('BEGIN')
  try {
    const del = await client.query('DELETE FROM lancamentos WHERE id = ANY($1)', [REMOVE_IDS])
    if (del.rowCount !== REMOVE_IDS.length) {
      await client.query('ROLLBACK')
      console.log(`✖ ROLLBACK: DELETE afetaria ${del.rowCount}, esperado ${REMOVE_IDS.length}. Nada removido.`)
      return
    }
    await client.query('COMMIT')
    console.log(`✔ COMMIT: ${del.rowCount} transfer(s) bloqueado(s) removido(s).`)
    console.log('Próximo passo (após sua confirmação): migrate-apply.')
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

// ── migrate-apply (WRITE) ────────────────────────────────────────────────────
async function apply(client) {
  const g = await resolveGrupoG(client)
  const transfers = await loadLegacyTransfers(client, g.id)
  const expenses = await loadExpenses(client, g.id)
  const plan = await annotateBlocks(client, buildPlan(transfers, expenses))

  const ok = plan.filter(p => p.status === 'OK')
  const skipped = plan.length - ok.length
  console.log(`\n[MIGRATE-APPLY] Grupo G=${g.id} | OK=${ok.length} migráveis | ${skipped} apenas relatadas (ambígua/sem match/bloqueada).`)
  if (ok.length === 0) { console.log('Nenhuma linha OK. Nada a fazer.'); return }

  await client.query('BEGIN')
  try {
    let n = 0
    for (const p of ok) {
      // Guarda por linha: só renomeia se o old_id existe e o novo ainda NÃO existe.
      const res = await client.query(
        `UPDATE lancamentos SET id = $1
         WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM lancamentos WHERE id = $1)`,
        [p.novo, p.t.id])
      n += res.rowCount
      console.log(`  ${res.rowCount === 1 ? '✔' : '✖'} ${p.t.id} → ${p.novo}`)
    }
    if (n !== ok.length) {
      await client.query('ROLLBACK')
      console.log(`✖ ROLLBACK: esperava ${ok.length} UPDATE(s), efetivei ${n}. Nada aplicado.`)
      return
    }
    await client.query('COMMIT')
    console.log(`✔ COMMIT: ${n} transferência(s) renomeada(s) para id determinístico.`)
  } catch (err) {
    await client.query('ROLLBACK'); throw err
  }
}

async function main() {
  const client = await pool.connect()
  try {
    if (WRITES.has(cmd)) console.log(`\n*** COMANDO DE ESCRITA: ${cmd} ***`)
    if (cmd === 'migrate-preview') await preview(client)
    else if (cmd === 'inspect-blocked') await inspectBlocked(client)
    else if (cmd === 'remove-blocked') await removeBlocked(client)
    else if (cmd === 'migrate-apply') await apply(client)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => { console.error('✖ Erro:', err.message); process.exit(1) })
