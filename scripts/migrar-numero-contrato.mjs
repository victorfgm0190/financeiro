// Migra o nº do contrato gravado no texto pelo Assistente ("· Contrato nº 12345" na descrição do
// agendamento / observação do lançamento) para o campo próprio numero_contrato, com histórico (autor
// 'sistema'). Roda em TODOS os ambientes ativos/suspensos do central, ou só num (--ambiente <sigla>).
//
//   node --env-file=.env.local scripts/migrar-numero-contrato.mjs                     → prévia (só SELECT)
//   node --env-file=.env.local scripts/migrar-numero-contrato.mjs --ambiente cv       → prévia de um ambiente
//   node --env-file=.env.local scripts/migrar-numero-contrato.mjs --executar [...]    → aplica (transação por ambiente)
//
// Quem já tem numero_contrato DIFERENTE do texto fica de fora (listado como conflito). Depois de
// executar, o app recarrega sozinho (updated_at → /api/last-change).
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { ensureHistoricoSchema } from '../api/_historico.js'
import { planejarMigracaoNumeroContrato, aplicarMigracaoNumeroContrato } from '../api/_numeroContrato.js'

const executar = process.argv.includes('--executar')
const iAmb = process.argv.indexOf('--ambiente')
const so = iAmb > 0 ? String(process.argv[iAmb + 1] || '').toLowerCase() : null
if (!process.env.CENTRAL_DATABASE_URL) { console.error('CENTRAL_DATABASE_URL não definida (use --env-file=.env.local)'); process.exit(1) }

const conectar = async (url) => { const c = new pg.Client(configTlsVerificado(url)); await c.connect(); return c }
const central = await conectar(process.env.CENTRAL_DATABASE_URL)
const ambientes = (await central.query(
  "SELECT sigla, database_name FROM ambientes WHERE status IN ('ativo','suspenso') AND ($1::text IS NULL OR sigla = $1) ORDER BY sigla", [so],
)).rows
await central.end()

for (const a of ambientes) {
  const db = await conectar(urlDoDatabase(a.database_name))
  const q = async (sql, params = []) => (await db.query(sql, params)).rows
  try {
    const plano = await planejarMigracaoNumeroContrato(q)
    const n = plano.agendamentos.mudar.length + plano.lancamentos.mudar.length
    const conflitos = [...plano.agendamentos.conflitos, ...plano.lancamentos.conflitos]
    console.log(`[${a.sigla}] agendamentos: ${plano.agendamentos.mudar.length} · lançamentos: ${plano.lancamentos.mudar.length} · conflitos: ${conflitos.length}`)
    for (const t of ['agendamentos', 'lancamentos']) {
      for (const m of plano[t].mudar) console.log(`   ${t} ${m.id}: ${JSON.stringify(m.campos)}`)
    }
    for (const c of conflitos) console.log(`   CONFLITO ${c.id}: campo=${c.atual} texto=${c.encontrado} (não mexido)`)
    if (!executar || !n) continue
    await ensureHistoricoSchema(q)
    await db.query('BEGIN')
    try {
      const r = await aplicarMigracaoNumeroContrato(q, plano, { loteId: `migr_numero_contrato_${randomUUID()}` })
      await db.query('COMMIT')
      console.log(`   aplicado: ${r.agendamentos} agendamento(s), ${r.lancamentos} lançamento(s), ${r.historico} linha(s) de histórico${r.pulados.length ? ` · pulados (mudaram no meio tempo): ${r.pulados.join(', ')}` : ''}`)
    } catch (err) {
      await db.query('ROLLBACK')
      throw err
    }
  } finally {
    await db.end()
  }
}
if (!executar) console.log('Prévia apenas. Rode com --executar para aplicar.')
