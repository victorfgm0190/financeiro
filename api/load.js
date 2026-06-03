import { query } from './_db.js'

export default async function handler(req, res) {
  try {
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS gerencial_schedule_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fatura_month_year TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS parent_tx_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
    await query(`CREATE TABLE IF NOT EXISTS reserve_functions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_id TEXT,
      saldo_inicial NUMERIC DEFAULT 0,
      entradas NUMERIC DEFAULT 0,
      saidas NUMERIC DEFAULT 0,
      despesa_anual NUMERIC DEFAULT 0,
      deposito_mensal NUMERIC DEFAULT 0,
      mes_vencimento TEXT,
      ordem INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )`)
    await query(`ALTER TABLE grupos_conta ADD COLUMN IF NOT EXISTS anchor_account_id TEXT`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS app_priority BOOLEAN DEFAULT FALSE`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT NULL`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS projected_balance NUMERIC DEFAULT NULL`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS conta_aplicacao BOOLEAN DEFAULT FALSE`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS balance_snapshot JSONB`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS day_of_month INTEGER`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS amount_approx NUMERIC`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS grupo_gerencial TEXT`)
    await query(`CREATE TABLE IF NOT EXISTS gerencial_rules (
      id TEXT PRIMARY KEY,
      contains TEXT NOT NULL,
      is_parcelado TEXT DEFAULT 'any',
      min_amount NUMERIC,
      max_amount NUMERIC,
      grupo_gerencial_id TEXT NOT NULL,
      "order" INTEGER DEFAULT 0
    )`)
    const [accs, txs, scheds, cats, buds, rules, gers, pays, faves, cfgRows, envs, groups, perfis, imports, grules, rfns] =
      await Promise.all([
        query('SELECT * FROM contas'),
        query('SELECT * FROM lancamentos ORDER BY created_at'),
        query('SELECT * FROM agendamentos'),
        query('SELECT * FROM categorias'),
        query('SELECT * FROM orcamento'),
        query('SELECT * FROM regras_classificacao'),
        query('SELECT * FROM reservas_funcoes'),
        query('SELECT * FROM reservas'),
        query('SELECT name FROM favorecidos'),
        query('SELECT * FROM configuracoes WHERE id = 1'),
        query('SELECT * FROM envelopes'),
        query('SELECT * FROM grupos_conta ORDER BY "order"'),
        query('SELECT * FROM perfis'),
        query('SELECT * FROM card_imports ORDER BY imported_at DESC'),
        query('SELECT * FROM gerencial_rules ORDER BY "order"'),
        query('SELECT * FROM reserve_functions ORDER BY ordem, name'),
      ])

    res.json({
      accs, txs, scheds, cats, buds, rules, gers, pays, faves,
      cfg: cfgRows[0] || null,
      envs, groups, perfis, imports, grules, rfns,
    })
  } catch (err) {
    const isTableMissing =
      err.code === '42P01' ||
      (err.message || '').includes('does not exist') ||
      (err.message || '').includes('relation')
    res.status(isTableMissing ? 404 : 500).json({ error: err.message, code: err.code })
  }
}
