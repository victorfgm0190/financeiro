// FINANCIAMENTO — correção dos dados já gravados para a regra nova (29/10):
//   1. Parcela paga ANTES do vencimento, com o PRINCIPAL integral e juros menores (status 'partial'
//      só por causa dos juros): vira 'paid', a diferença vai para desconto_antecipacao, desvio e
//      saldo restante zeram, e a ocorrência do agendamento da parcela é marcada como registrada.
//   2. Conta de dívida de cada financiamento: saldo = −(principal previsto − principal amortizado),
//      o SALDO DEVEDOR DO PRINCIPAL (antes era −(total com juros) + valor pago); initial_balance =
//      −principal previsto (antes −total com juros), coerente com o que o criar grava agora.
//   3. Status do financiamento recalculado pelas parcelas.
// Nenhum lançamento é criado ou alterado; saldo de conta corrente não muda.
// Exige a migração 2026-10-29_financiamento_desconto (coluna desconto_antecipacao).
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/corrigir-financiamento-desconto.js            ← só PRÉVIA (SELECT)
//   node --env-file=.env.local scripts/corrigir-financiamento-desconto.js --aplicar  ← grava
//   ... [--ambiente vm]
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const so = args.includes('--ambiente') ? String(args[args.indexOf('--ambiente') + 1] || '').toLowerCase() : null
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/corrigir-financiamento-desconto.js')
  process.exit(1)
}
const conectar = async (url) => { const c = new pg.Client(configTlsVerificado(url)); await c.connect(); return c }
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

const SQL_PARCELAS = `
  SELECT i.id, i.financing_id, b.name AS bem, i.numero_parcela AS n, f.num_parcelas AS tot, i.schedule_id,
         i.principal_provisioned::numeric AS pp, i.juros_provisioned::numeric AS jp, i.total_provisioned::numeric AS tp,
         i.principal_pago::numeric AS pg, i.juros_pago::numeric AS jg, i.total_pago::numeric AS tg,
         to_char(i.data_vencimento::date, 'YYYY-MM-DD') AS venc, to_char(i.data_pagamento::date, 'YYYY-MM-DD') AS pago_em
    FROM financing_installments i JOIN financing f ON f.id = i.financing_id LEFT JOIN contas b ON b.id = f.bem_id
   WHERE i.status = 'partial' AND i.principal_pago >= i.principal_provisioned AND i.total_pago < i.total_provisioned
     AND i.data_pagamento IS NOT NULL AND i.data_pagamento::date < i.data_vencimento::date
   ORDER BY b.name, i.numero_parcela`

const SQL_DIVIDAS = `
  SELECT f.id, f.status, f.conta_divida_id, c.name, c.balance::numeric AS saldo_atual,
         c.initial_balance::numeric AS inicial_atual,
         f.valor_principal::numeric AS principal,
         COALESCE((SELECT SUM(principal_pago) FROM financing_installments WHERE financing_id = f.id), 0)::numeric AS amortizado
    FROM financing f JOIN contas c ON c.id = f.conta_divida_id ORDER BY c.name`

const central = await conectar(process.env.CENTRAL_DATABASE_URL)
try {
  const ambientes = (await central.query(
    "SELECT sigla, database_name FROM ambientes WHERE status IN ('ativo', 'suspenso') AND ($1::text IS NULL OR sigla = $1) ORDER BY sigla", [so],
  )).rows
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · ${ambientes.length} ambiente(s)`)
  for (const amb of ambientes) {
    const db = await conectar(urlDoDatabase(amb.database_name))
    try {
      console.log(`\n[${amb.sigla}] ${amb.database_name}`)
      const temCol = (await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'financing_installments' AND column_name = 'desconto_antecipacao'`)).rows.length
      if (!(await db.query(`SELECT to_regclass('financing') t`)).rows[0].t) { console.log('  sem financiamento'); continue }
      const parcelas = (await db.query(SQL_PARCELAS)).rows
      const dividas = (await db.query(SQL_DIVIDAS)).rows
      console.log(`  1) parcelas quitadas com desconto: ${parcelas.length}`)
      for (const p of parcelas) {
        console.log(`     ${p.bem} ${p.n}/${p.tot} · vence ${p.venc} · pago ${p.pago_em} · previsto ${r2(p.tp).toFixed(2)} · pago ${r2(p.tg).toFixed(2)} · desconto ${r2(p.tp - p.tg).toFixed(2)}`)
      }
      console.log(`  2) contas de dívida (saldo devedor do principal): ${dividas.length}`)
      for (const d of dividas) {
        const novo = r2(-(Number(d.principal) - Number(d.amortizado)))
        console.log(`     ${d.name}`)
        console.log(`       saldo (balance):          ${r2(d.saldo_atual).toFixed(2)} → ${novo.toFixed(2)} (principal ${r2(d.principal).toFixed(2)} − amortizado ${r2(d.amortizado).toFixed(2)})`)
        console.log(`       saldo inicial (initial):  ${d.inicial_atual == null ? 'null' : r2(d.inicial_atual).toFixed(2)} → ${r2(-Number(d.principal)).toFixed(2)}`)
      }
      if (!aplicar) continue
      if (!temCol) { console.log('  ✖ falta a coluna desconto_antecipacao — rode antes: scripts/migrar-ambientes.js'); continue }

      // Uma transação por ambiente, como <banco>_app (comoDonoDoBanco: BEGIN/SET LOCAL ROLE/COMMIT).
      await comoDonoDoBanco(db, amb.database_name, async (q) => {
        for (const p of parcelas) {
          await q(`UPDATE financing_installments SET status = 'paid', desconto_antecipacao = $2, desvio_juros = 0, saldo_restante = 0
                    WHERE id = $1 AND status = 'partial'`, [p.id, r2(p.tp - p.tg)])
          if (p.schedule_id) {
            await q(`UPDATE agendamentos SET registered = CASE
                        WHEN COALESCE(registered, '[]'::jsonb) @> to_jsonb($2::text) THEN registered
                        ELSE COALESCE(registered, '[]'::jsonb) || to_jsonb($2::text) END,
                      next_occurrence = NULL
                      WHERE id = $1 AND NOT (COALESCE(registered, '[]'::jsonb) @> to_jsonb($2::text))`, [p.schedule_id, p.venc])
          }
        }
        for (const d of dividas) {
          await q('UPDATE contas SET balance = $2, initial_balance = $3 WHERE id = $1',
            [d.conta_divida_id, r2(-(Number(d.principal) - Number(d.amortizado))), r2(-Number(d.principal))])
          const [agg] = await q(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'paid')::int AS pagas,
                                        COUNT(*) FILTER (WHERE status <> 'open')::int AS tocadas
                                   FROM financing_installments WHERE financing_id = $1`, [d.id])
          const st = agg.pagas === agg.total ? 'completed' : (agg.tocadas > 0 ? 'partial' : 'open')
          if (st !== d.status) await q('UPDATE financing SET status = $2 WHERE id = $1', [d.id, st])
        }
      })
      console.log('  ✔ aplicado')
    } finally {
      await db.end()
    }
  }
} finally {
  await central.end()
}
