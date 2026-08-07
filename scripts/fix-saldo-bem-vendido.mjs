// Correção de dados: zera o saldo de bens já vendidos (foi_vendido = TRUE) que ficaram com
// balance ≠ 0.
//
// Origem do problema: até a correção em api/bem/[id]/registrar-entrada.js, o trade-in gravava
// `balance = balance − valor_negociado` no bem antigo em vez de zerar. Sobrava um resíduo de
// (saldo − valor_venda) — exatamente a perda, que JÁ tinha virado lançamento próprio. O bem
// vendido continuava somando saldo no patrimônio e a perda era contada duas vezes.
// Caso concreto: HB20S com NF 80.000 dado em entrada por 45.000 ficou com 35.000 fantasma.
//
// Este script conserta o passado; o endpoint já não produz mais o resíduo.
//
// Subcomandos:
//   node --env-file=.env.local scripts/fix-saldo-bem-vendido.mjs preview   (só simula)
//   node --env-file=.env.local scripts/fix-saldo-bem-vendido.mjs apply     (aplica)

import pg from 'pg'

const cmd = process.argv[2]
if (cmd !== 'preview' && cmd !== 'apply') {
  console.error('Uso: node --env-file=.env.local scripts/fix-saldo-bem-vendido.mjs <preview|apply>')
  process.exit(1)
}

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/fix-saldo-bem-vendido.mjs ' + cmd)
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

// `COALESCE(balance, 0) <> 0` cobre tanto o resíduo positivo quanto qualquer saldo negativo
// que tenha sobrado. Só bens marcados como vendidos entram — nenhum bem ativo é tocado.
const PREVIEW_SQL = `
  SELECT id, name, COALESCE(balance, 0) AS balance,
         COALESCE(valor_nota_fiscal, 0) AS valor_nota_fiscal,
         data_venda, bem_destino_id
  FROM contas
  WHERE foi_vendido = TRUE
    AND COALESCE(balance, 0) <> 0
  ORDER BY name
`

const UPDATE_SQL = `
  UPDATE contas
  SET balance = 0
  WHERE foi_vendido = TRUE
    AND COALESCE(balance, 0) <> 0
`

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function main() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(PREVIEW_SQL)

    if (rows.length === 0) {
      console.log('Nenhum bem vendido com saldo residual. Nada a fazer.')
      return
    }

    console.log(`\n${cmd === 'preview' ? '[PREVIEW] ' : ''}Bens vendidos com saldo residual:\n`)
    let total = 0
    for (const r of rows) {
      total += Number(r.balance)
      const venda = r.data_venda ? String(r.data_venda).slice(0, 10) : 'sem data'
      console.log(`  • ${r.name} (${r.id}) — saldo ${fmt(r.balance)} → ${fmt(0)}`)
      console.log(`      NF ${fmt(r.valor_nota_fiscal)} · vendido em ${venda} · destino ${r.bem_destino_id || '—'}`)
    }
    console.log(`\n  ${rows.length} bem(ns), ${fmt(total)} de saldo fantasma a remover.\n`)

    if (cmd === 'preview') {
      console.log('[PREVIEW] Nenhuma alteração aplicada. Rode com "apply" para gravar.')
      return
    }

    await client.query('BEGIN')
    const res = await client.query(UPDATE_SQL)
    if (res.rowCount !== rows.length) {
      await client.query('ROLLBACK')
      console.error(`✖ Abortado: UPDATE afetou ${res.rowCount} linha(s), mas o preview previa ${rows.length}. Nada foi gravado.`)
      process.exit(1)
    }
    await client.query('COMMIT')
    console.log(`✔ Concluído. ${res.rowCount} bem(ns) zerado(s).`)
    console.log('  Recarregue o app para o estado React pegar os saldos novos.')
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
