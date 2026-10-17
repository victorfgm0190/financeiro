import { query } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'

// De-para DINDIN → Finup: só existe no ambiente principal ('vm'). Nos clientes a lista é sempre vazia.

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method === 'GET') {
    if (req.ambiente?.sigla !== AMBIENTE_PRINCIPAL) return res.json([])
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

export default comAmbiente(handler)
