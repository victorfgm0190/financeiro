// DIAGNÓSTICO SOMENTE LEITURA — nenhum UPDATE/DELETE. Estima quantos lançamentos
// tiveram o grupo gerencial rebaixado para "D" pelo bug da importação de fatura
// (colisão por installment_key gravava o grupo do CSV por cima do grupo salvo).
//
// Heurística: parcela de cartão hoje no grupo D cujas IRMÃS da mesma série estão em
// um grupo ≠ D. Uma série nasce com o mesmo grupo em todas as parcelas, então uma
// parcela D no meio de irmãs "Phlo"/"Gerencial"/"Contas Anuais" é o rastro do bug.
// Séries com TODAS as parcelas em D não aparecem (indistinguíveis de um D legítimo),
// então o número abaixo é um piso, não o total exato.
//
// Uso:
//   node --env-file=.env.local scripts/diag-colisao-grupo-d.mjs
//   (ou defina NEON_DATABASE_URL no ambiente)

import pg from 'pg'

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Ex.: node --env-file=.env.local scripts/diag-colisao-grupo-d.mjs')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
})

// Grupos gerenciais moram em `reservas_funcoes` (number é JSONB: 1, 2, ... ou "D").
const SQL_GRUPOS = `SELECT id, number #>> '{}' AS number, name FROM reservas_funcoes ORDER BY 2`

// Série = installment_key sem o sufixo "-<num>" (mesmo agrupamento do app).
const SQL_SUSPEITOS = `
  WITH parcelas AS (
    SELECT id, description, date, fatura_month_year, amount, account_id,
           grupo_gerencial, installment_key,
           COALESCE(serie_id, regexp_replace(installment_key, '-[0-9]+$', '')) AS serie
      FROM lancamentos
     WHERE installment_key IS NOT NULL
       AND type = 'expense'
  ),
  series_com_grupo AS (
    SELECT serie,
           COUNT(*) FILTER (WHERE grupo_gerencial = $1) AS em_d,
           COUNT(*) FILTER (WHERE grupo_gerencial IS NOT NULL AND grupo_gerencial <> $1) AS fora_d,
           MIN(grupo_gerencial) FILTER (WHERE grupo_gerencial IS NOT NULL AND grupo_gerencial <> $1) AS grupo_irmas
      FROM parcelas
     GROUP BY serie
  )
  SELECT p.id, p.description, p.date, p.fatura_month_year, p.amount,
         s.grupo_irmas, s.em_d, s.fora_d
    FROM parcelas p
    JOIN series_com_grupo s ON s.serie = p.serie
   WHERE p.grupo_gerencial = $1 AND s.fora_d > 0
   ORDER BY p.date DESC
`

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

try {
  const { rows: grupos } = await pool.query(SQL_GRUPOS)
  const byId = new Map(grupos.map(g => [g.id, g]))
  const grupoD = grupos.find(g => g.number === 'D')
  if (!grupoD) { console.error('✖ Grupo "D" não encontrado em reservas_funcoes.'); process.exit(1) }
  console.log(`Grupo D = ${grupoD.id} (${grupoD.name})\n`)

  const { rows } = await pool.query(SQL_SUSPEITOS, [grupoD.id])
  if (rows.length === 0) { console.log('✔ Nenhuma parcela em D com irmãs fora de D. Nada a corrigir.'); process.exit(0) }

  console.log(`⚠ ${rows.length} parcela(s) em D com irmãs em outro grupo (piso do impacto):\n`)
  let soma = 0
  for (const r of rows) {
    const g = byId.get(r.grupo_irmas)
    soma += Number(r.amount) || 0
    console.log(
      `  ${String(r.date).slice(0, 10)}  fatura ${r.fatura_month_year || '—'}  ${fmtBRL(r.amount).padStart(14)}  ` +
      `${(r.description || '').slice(0, 45).padEnd(45)}  irmãs: ${g ? `${g.number} · ${g.name}` : r.grupo_irmas}  (D:${r.em_d}/≠D:${r.fora_d})`
    )
  }
  console.log(`\nTotal afetado: ${fmtBRL(soma)} em ${rows.length} lançamento(s).`)
  console.log('Nenhuma alteração foi feita — este script só lê.')
} finally {
  await pool.end()
}
