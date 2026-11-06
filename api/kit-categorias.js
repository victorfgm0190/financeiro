import { withTransaction, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { centralQuery } from './_central.js'
import { capitalFaltante } from '../src/lib/kitCategorias.js'

// Kit de categorias do ambiente (lista em src/lib/kitCategorias.js).
//   GET                    → { tipo: 'PF' | 'PJ' } — tipo do cliente, no central (sem cliente → PF).
//   POST { acao: 'capital' } → cria as categorias de ganho/perda de capital que faltam, na hora: o
//     cadastro de bem exige que elas já estejam no banco ao salvar (o sync da tela demora um instante).
//     Não duplica: compara os nomes sem acento e sem maiúsculas. Devolve { criadas, ... }.
async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      const clienteId = req.ambiente?.cliente_id
      const [c] = clienteId ? await centralQuery('SELECT tipo_pessoa FROM plataforma_clientes WHERE id = $1', [clienteId]) : []
      return res.json({ tipo: String(c?.tipo_pessoa || '').toUpperCase() === 'PJ' ? 'PJ' : 'PF' })
    }
    if (req.method !== 'POST') return res.status(405).end()
    const body = await parseBody(req)
    if (body?.acao !== 'capital') return res.status(400).json({ error: 'Ação desconhecida.' })
    const criadas = await withTransaction(async (q) => {
      const faltam = capitalFaltante(await q('SELECT id, name, type FROM categorias'))
      for (const c of faltam) {
        await q(
          `INSERT INTO categorias (id, name, type, color, icon, category_group)
                VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [c.id, c.name, c.type, c.color, c.icon, c.group],
        )
      }
      return faltam
    })
    return res.json({ criadas })
  } catch (err) {
    console.error('[api/kit-categorias]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
