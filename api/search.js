import { query, parseBody } from './_db.js'

// Busca Global combinada: lançamentos (lancamentos) + agendamentos (agendamentos).
// Filtros: value (tolerância ±0,01), text (descrição/favorecido ILIKE), from/to (período),
// profileId (filtra pelas contas do perfil ativo). O status (pago/não pago) e o status de
// recorrência dos agendamentos são refinados no frontend, que tem a lógica de ocorrências.
const LIMIT = 50
const TOL = 0.01

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { value, text, from, to, profileId } = await parseBody(req)

    const hasValue = value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value))
    const v = hasValue ? Math.abs(Number(value)) : null
    const txt = (text || '').trim()
    const like = txt ? `%${txt}%` : null

    // Perfil ativo: ids das contas que pertencem a ele.
    let accIds = null
    if (profileId) {
      const rows = await query(`SELECT id FROM contas WHERE profile_id = $1`, [profileId])
      accIds = rows.map(r => r.id)
      if (accIds.length === 0) accIds = ['__none__'] // garante conjunto vazio
    }

    // ── Lançamentos ──
    {
      const where = []
      const params = []
      let i = 1
      if (hasValue) { where.push(`ABS(ABS(amount) - $${i}) <= ${TOL}`); params.push(v); i++ }
      if (like) { where.push(`(description ILIKE $${i} OR payee ILIKE $${i})`); params.push(like); i++ }
      if (from) { where.push(`date >= $${i}`); params.push(from); i++ }
      if (to) { where.push(`date <= $${i}`); params.push(to); i++ }
      if (accIds) { where.push(`(account_id = ANY($${i}) OR to_account_id = ANY($${i}))`); params.push(accIds); i++ }
      var txRows = await query(
        `SELECT * FROM lancamentos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC NULLS LAST LIMIT ${LIMIT}`,
        params,
      )
    }

    // ── Agendamentos ── (período: começou até a data final; recorrência é resolvida no front)
    {
      const where = []
      const params = []
      let i = 1
      if (hasValue) { where.push(`ABS(ABS(amount) - $${i}) <= ${TOL}`); params.push(v); i++ }
      if (like) { where.push(`(description ILIKE $${i} OR payee ILIKE $${i})`); params.push(like); i++ }
      if (to) { where.push(`start_date <= $${i}`); params.push(to); i++ }
      if (accIds) { where.push(`(account_id IS NULL OR account_id = ANY($${i}))`); params.push(accIds); i++ }
      var scRows = await query(
        `SELECT * FROM agendamentos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY start_date DESC NULLS LAST LIMIT ${LIMIT}`,
        params,
      )
    }

    res.json({ transactions: txRows, schedules: scRows })
  } catch (err) {
    console.error('[api/search]', err.message)
    res.status(500).json({ error: err.message })
  }
}
