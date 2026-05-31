import { query } from './_db.js'

export default async function handler(req, res) {
  try {
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS gerencial_schedule_id TEXT`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS app_priority BOOLEAN DEFAULT FALSE`)
    const [accs, txs, scheds, cats, buds, rules, gers, pays, faves, cfgRows, envs, groups, perfis, imports] =
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
      ])

    res.json({
      accs, txs, scheds, cats, buds, rules, gers, pays, faves,
      cfg: cfgRows[0] || null,
      envs, groups, perfis, imports,
    })
  } catch (err) {
    const isTableMissing =
      err.code === '42P01' ||
      (err.message || '').includes('does not exist') ||
      (err.message || '').includes('relation')
    res.status(isTableMissing ? 404 : 500).json({ error: err.message, code: err.code })
  }
}
