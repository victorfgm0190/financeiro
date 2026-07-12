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

// Postgres limita o protocolo a 65.535 bind-parameters por comando. Chunkamos as rows para
// nunca chegar perto disso (nº de params = rows_no_chunk × nº_de_colunas).
const MAX_BIND_PARAMS = 60000
const MAX_CHUNK_ROWS = 500

// Executa um único INSERT ... ON CONFLICT para um lote de rows homogêneas (mesmas colunas).
async function upsertChunk(client, table, cols, rows, conflictCol) {
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
  await client.query(sql, params)
}

// lancamentos tem um índice único parcial uq_lancamentos_installment(installment_key) WHERE
// installment_key IS NOT NULL. Como o upsert usa ON CONFLICT ("id"), um conflito nesse índice
// (parcela já no banco com id diferente) NÃO é absorvido e derruba o INSERT inteiro. Aqui:
//   1) deduplica as rows de entrada por installment_key (mantém a última — mesma parcela);
//   2) remapeia o id das que já existem no banco para o id existente → vira UPDATE via id.
async function reconcileInstallmentKeys(client, rows) {
  const withKey = rows.filter(r => r.installment_key)
  if (withKey.length === 0) return rows

  // (1) dedup por installment_key preservando a ordem e a última ocorrência
  const lastIdxByKey = new Map()
  rows.forEach((r, i) => { if (r.installment_key) lastIdxByKey.set(r.installment_key, i) })
  const deduped = rows.filter((r, i) => !r.installment_key || lastIdxByKey.get(r.installment_key) === i)

  // (2) remapeia ids das parcelas já existentes no banco
  const keys = [...new Set(deduped.filter(r => r.installment_key).map(r => r.installment_key))]
  const { rows: existing } = await client.query(
    'SELECT id, installment_key FROM lancamentos WHERE installment_key = ANY($1)',
    [keys],
  )
  if (existing.length === 0) return deduped
  const keyToId = new Map(existing.map(r => [r.installment_key, r.id]))
  return deduped.map(r => {
    if (!r.installment_key) return r
    const dbId = keyToId.get(r.installment_key)
    return dbId && dbId !== r.id ? { ...r, id: dbId } : r
  })
}

// Faz upsert de um array de rows numa tabela, em lotes, dentro de uma transação.
// Os rows já devem estar em snake_case (produzidos pelos *ToRow do frontend).
export async function upsertRows(table, rows, conflictCol = 'id') {
  if (!rows || rows.length === 0) return
  const client = await getPool().connect()
  try {
    if (table === 'lancamentos') {
      rows = await reconcileInstallmentKeys(client, rows)
    }
    const cols = Object.keys(rows[0])
    const perChunk = Math.max(1, Math.min(MAX_CHUNK_ROWS, Math.floor(MAX_BIND_PARAMS / cols.length)))

    await client.query('BEGIN')
    for (let i = 0; i < rows.length; i += perChunk) {
      await upsertChunk(client, table, cols, rows.slice(i, i + perChunk), conflictCol)
    }
    await client.query('COMMIT')
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    client.release()
  }
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
