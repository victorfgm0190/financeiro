import { query } from './_db.js'
import { requireAuth } from './_auth.js'

// Backfill de rastreabilidade dos tx_ger_* históricos (provisões gerenciais criadas antes do
// commit 661a4f16, 12/07/2026, quando executarProvisoesGerenciais passou a gravar
// source_expense_id/fatura_ref/card_id). Recupera os campos a partir da parcela de origem,
// alcançada via parent_tx_id (único elo que os registros legados preservam).
//
//   GET  → preview (read-only): lista os registros recuperáveis e os valores que receberiam.
//   POST → apply (WRITE): executa o UPDATE atômico (um único statement = uma transação implícita).
//
// Só toca registros com source_expense_id IS NULL AND parent_tx_id IS NOT NULL — os
// irrecuperáveis (sem parent_tx_id) ficam intactos. Idempotente: rodar de novo após o apply
// não casa mais nenhuma linha (source_expense_id deixou de ser NULL).

// Expressão compartilhada entre preview e apply: fatura_ref da parcela de origem, com fallback
// derivando de fatura_month_year (YYYY-MM → MM/YYYY), idêntico ao resolveFaturaRef do frontend.
const NOVO_FATURA_REF = `CASE
    WHEN p.fatura_ref IS NOT NULL THEN p.fatura_ref
    WHEN p.fatura_month_year IS NOT NULL THEN
      LPAD(SPLIT_PART(p.fatura_month_year, '-', 2), 2, '0') || '/' || SPLIT_PART(p.fatura_month_year, '-', 1)
    ELSE NULL
  END`

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return

  try {
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT
           t.id,
           t.description,
           t.date,
           t.parent_tx_id AS novo_source_expense_id,
           p.account_id   AS novo_card_id,
           ${NOVO_FATURA_REF} AS novo_fatura_ref
         FROM lancamentos t
         JOIN lancamentos p ON p.id = t.parent_tx_id
         WHERE t.id LIKE 'tx_ger_%'
           AND t.source_expense_id IS NULL
           AND t.parent_tx_id IS NOT NULL
         ORDER BY t.date`,
      )
      return res.json({ ok: true, count: rows.length, rows })
    }

    if (req.method === 'POST') {
      const rows = await query(
        `UPDATE lancamentos t
         SET
           source_expense_id = p.id,
           card_id           = p.account_id,
           fatura_ref        = ${NOVO_FATURA_REF}
         FROM lancamentos p
         WHERE t.parent_tx_id = p.id
           AND t.id LIKE 'tx_ger_%'
           AND t.source_expense_id IS NULL
           AND t.parent_tx_id IS NOT NULL
         RETURNING t.id, t.source_expense_id, t.card_id, t.fatura_ref`,
      )
      return res.json({ ok: true, updated: rows.length, rows })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/backfill-ger-rastreabilidade]', err.message)
    res.status(500).json({ error: err.message })
  }
}
