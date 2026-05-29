import pg from 'pg'
const { Pool } = pg

let pool

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    })
  }
  return pool
}

export async function query(sql, params = []) {
  const { rows } = await getPool().query(sql, params)
  return rows
}

// Faz upsert de um array de rows numa tabela.
// Os rows já devem estar em snake_case (produzidos pelos *ToRow do frontend).
export async function upsertRows(table, rows, conflictCol = 'id') {
  if (!rows || rows.length === 0) return
  const cols = Object.keys(rows[0])
  let idx = 1
  const values = rows
    .map(() => `(${cols.map(() => `$${idx++}`).join(', ')})`)
    .join(', ')
  const params = rows.flatMap(row =>
    cols.map(c => {
      const v = row[c]
      if (v === null || v === undefined) return null
      if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date))) return JSON.stringify(v)
      return v
    })
  )
  const updateSet = cols
    .filter(c => c !== conflictCol)
    .map(c => `"${c}" = EXCLUDED."${c}"`)
    .join(', ')
  const sql = `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES ${values} ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet}`
  await getPool().query(sql, params)
}

export async function deleteRows(table, ids, col = 'id') {
  if (!ids || ids.length === 0) return
  await getPool().query(`DELETE FROM ${table} WHERE "${col}" = ANY($1)`, [ids])
}

// Lê e parseia o body JSON de uma Vercel Function request.
export async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
    req.on('error', reject)
  })
}
