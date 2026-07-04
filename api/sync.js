import { upsertRows, deleteRows, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body = await parseBody(req)
    const { type } = body

    if (type === 'section') {
      // Sync genérico: upsert + delete por id
      const { table, upsert, delete: toDelete } = body
      await Promise.all([
        deleteRows(table, toDelete),
        upsertRows(table, upsert),
      ])

    } else if (type === 'accounts') {
      // Contas + cartões (tabelas separadas)
      const { upsert, delete: toDelete, cards, deleteCards } = body
      await Promise.all([
        deleteRows('contas', toDelete),
        upsertRows('contas', upsert),
      ])
      // Cartões dependem das contas → executa em sequência
      await Promise.all([
        deleteRows('cartoes', deleteCards),
        upsertRows('cartoes', cards),
      ])

    } else if (type === 'payees') {
      // Favorecidos usam name como PK
      const { add, remove } = body
      await Promise.all([
        deleteRows('favorecidos', remove, 'name'),
        upsertRows('favorecidos', (add || []).map(name => ({ name })), 'name'),
      ])

    } else if (type === 'settings') {
      // Linha única na tabela configuracoes (id = 1)
      const { data } = body
      await upsertRows('configuracoes', [{ id: 1, ...data }], 'id')

    } else {
      return res.status(400).json({ error: `Unknown sync type: ${type}` })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[api/sync]', err.message)
    res.status(500).json({ error: err.message })
  }
}
