import { query } from './_db.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { rows } = await query(
        `SELECT id, grupo, nome_finup, nome_dindin,
                nao_criar, ignorar_transferencias, vincular_cnpj, rendimento_permitido
         FROM account_mapping ORDER BY id`
      )
      return res.json(rows)
    } catch (err) {
      if (err.message?.includes('does not exist')) return res.json([])
      return res.status(500).json({ error: err.message })
    }
  }
  res.status(405).json({ error: 'Method not allowed' })
}
