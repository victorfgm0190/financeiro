// Limpeza da importação de 15/10/2026 13:57 (imp_1792083424128_wb34, "fatura-fechada-final
// 5060-outubro2026 (1).xlsx") gravada com competência 2024-10 em vez de 2026-10 no ITAU AZUL.
// Todos os 13 lançamentos já existiam na fatura 10/2026; 4 deles (grupo G) ganharam etapa A
// (tx_gerA_) duplicada na Ger. ITAUAZUL, inflando o saldo em R$ 112,74.
//
// Alvo, por id EXPLÍCITO (nada por padrão de data): os tx_ids do card_import + as etapas A cujo
// source_expense_id é um deles + o próprio card_import. Saldos: Principal e Ger. pelo efeito exato
// das transferências removidas (conferido contra o recálculo completo de lib/saldos); credit_debt
// do cartão abatido pela soma das despesas removidas.
//
//   node --env-file=.env.local scripts/cleanup-fatura-2024-10-itauazul.mjs preview   (read-only)
//   node --env-file=.env.local scripts/cleanup-fatura-2024-10-itauazul.mjs delete    (WRITE)

import pg from 'pg'
import { txDeLinha } from '../src/lib/integridade/dbRows.js'
import { saldosDaConta, efeitoNaConta } from '../src/lib/saldos.js'

const IMPORT_ID = 'imp_1792083424128_wb34'
const CARD = 'acc_1780099057223'
const cmd = process.argv[2]
if (!['preview', 'delete'].includes(cmd)) { console.error('Use: preview | delete'); process.exit(1) }

const rb = (v) => Math.round((Number(v) || 0) * 100) / 100
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL, max: 2 })

async function plano(db) {
  const { rows: [imp] } = await db.query('SELECT * FROM card_imports WHERE id = $1', [IMPORT_ID])
  if (!imp) throw new Error(`card_import ${IMPORT_ID} não existe (já limpo?)`)
  if (imp.mes_ano !== '2024-10' || imp.account_id !== CARD) throw new Error('card_import não é o esperado')
  const txIds = Array.isArray(imp.tx_ids) ? imp.tx_ids : JSON.parse(imp.tx_ids)
  const { rows: gastos } = await db.query('SELECT * FROM lancamentos WHERE id = ANY($1) ORDER BY date, id', [txIds])
  const ruins = gastos.filter(g => g.account_id !== CARD || g.fatura_month_year !== '2024-10' || g.type !== 'expense')
  if (ruins.length) throw new Error(`lançamento fora do padrão: ${ruins.map(r => r.id).join(', ')}`)
  const { rows: etapas } = await db.query(
    `SELECT * FROM lancamentos WHERE type = 'transfer' AND source_expense_id = ANY($1) ORDER BY date, id`, [txIds])
  const { rows: outrosRefs } = await db.query(
    `SELECT id FROM lancamentos WHERE (parent_tx_id = ANY($1) OR espelho_origem_id = ANY($1)) AND NOT (id = ANY($2))`,
    [txIds, etapas.map(e => e.id)])
  if (outrosRefs.length) throw new Error(`outros lançamentos apontam para o lote: ${outrosRefs.map(r => r.id).join(', ')}`)

  const removidos = new Set([...gastos, ...etapas].map(r => r.id))
  const { rows: todos } = await db.query('SELECT * FROM lancamentos')
  const txsDepois = todos.filter(r => !removidos.has(r.id)).map(txDeLinha)
  const contasIds = [...new Set(etapas.flatMap(e => [e.account_id, e.to_account_id]))]
  const { rows: contas } = await db.query('SELECT * FROM contas WHERE id = ANY($1) OR id = $2', [contasIds, CARD])
  const saldos = contas.filter(c => c.type !== 'credit').map(c => {
    const delta = rb(etapas.reduce((s, e) => s - efeitoNaConta(txDeLinha(e), c.id), 0))
    const recalc = saldosDaConta(c.id, Number(c.initial_balance) || 0, txsDepois)
    return {
      id: c.id, nome: c.apelido || c.name, delta,
      balance: [rb(c.balance), rb(Number(c.balance) + delta)], recalcBalance: recalc.balance,
      projected: [rb(c.projected_balance), rb(Number(c.projected_balance) + delta)], recalcProjected: recalc.projected,
    }
  })
  const card = contas.find(c => c.id === CARD)
  const somaGastos = rb(gastos.reduce((s, g) => s + Number(g.amount), 0))
  const debt = [rb(card.credit_debt), rb(Math.max(0, Number(card.credit_debt) - somaGastos))]
  const bill = [rb(card.credit_month_bill), rb(Math.max(0, Number(card.credit_month_bill) - somaGastos))]
  return { imp, gastos, etapas, saldos, somaGastos, debt, bill }
}

function imprimir(p) {
  console.log(`\ncard_import ${p.imp.id} · ${p.imp.filename} · mes_ano ${p.imp.mes_ano} · ${p.imp.count} itens`)
  console.log(`\nLançamentos do cartão (fatura 10/2024) — ${p.gastos.length}, total ${brl(p.somaGastos)}:`)
  for (const g of p.gastos) console.log(`  ${g.id.padEnd(32)} ${g.date}  ${brl(g.amount).padStart(12)}  ${g.description}`)
  console.log(`\nReservas gerenciais (etapa A) — ${p.etapas.length}:`)
  for (const e of p.etapas) console.log(`  ${e.id.padEnd(40)} ${e.date}  ${brl(e.amount).padStart(10)}  ${e.description}  [${e.fatura_ref}]`)
  console.log('\nSaldos:')
  for (const s of p.saldos) {
    console.log(`  ${s.nome}: balance ${brl(s.balance[0])} → ${brl(s.balance[1])} (recálculo completo ${brl(s.recalcBalance)}) · projetado ${brl(s.projected[0])} → ${brl(s.projected[1])} (recálculo ${brl(s.recalcProjected)})`)
  }
  console.log(`  ITAUAZUL credit_debt ${brl(p.debt[0])} → ${brl(p.debt[1])} · credit_month_bill ${brl(p.bill[0])} → ${brl(p.bill[1])}`)
}

const db = await pool.connect()
try {
  if (cmd === 'preview') {
    imprimir(await plano(db))
  } else {
    await db.query('BEGIN')
    const p = await plano(db)
    imprimir(p)
    const ids = [...p.gastos, ...p.etapas].map(r => r.id)
    const del = await db.query('DELETE FROM lancamentos WHERE id = ANY($1)', [ids])
    if (del.rowCount !== ids.length) throw new Error(`DELETE apagou ${del.rowCount} de ${ids.length}`)
    await db.query('DELETE FROM card_imports WHERE id = $1', [IMPORT_ID])
    await db.query('DELETE FROM pendencias_integridade WHERE origem_id = ANY($1)', [ids])
    for (const s of p.saldos) {
      await db.query('UPDATE contas SET balance = $2, projected_balance = $3 WHERE id = $1', [s.id, s.balance[1], s.projected[1]])
    }
    await db.query('UPDATE contas SET credit_debt = $2, credit_month_bill = $3 WHERE id = $1', [CARD, p.debt[1], p.bill[1]])
    await db.query('COMMIT')
    console.log(`\n✔ ${del.rowCount} lançamentos + card_import removidos; saldos atualizados.`)
  }
} catch (e) {
  if (cmd === 'delete') await db.query('ROLLBACK').catch(() => {})
  console.error('✖', e.message)
  process.exitCode = 1
} finally {
  db.release()
  await pool.end()
}
