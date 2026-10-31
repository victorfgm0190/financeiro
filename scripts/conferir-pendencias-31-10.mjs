// Confere, em cada ambiente ativo/suspenso, as colunas e a constraint da migração 2026-10-31_pendencias.
// Só leitura. Uso: node --env-file=.env.local scripts/conferir-pendencias-31-10.mjs
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'

const conectar = async (url) => { const c = new pg.Client(configTlsVerificado(url)); await c.connect(); return c }
const ESPERADO = [
  ['historico_alteracoes', 'usuario_id'], ['historico_alteracoes', 'usuario_nome'], ['historico_alteracoes', 'autor'],
  ['lancamento_rateios', 'grupo_gerencial'], ['agendamentos', 'numero_contrato'], ['lancamentos', 'numero_contrato'],
]
const central = await conectar(process.env.CENTRAL_DATABASE_URL)
const ambientes = (await central.query("SELECT sigla, database_name FROM ambientes WHERE status IN ('ativo','suspenso') ORDER BY sigla")).rows
await central.end()
for (const a of ambientes) {
  const db = await conectar(urlDoDatabase(a.database_name))
  const cols = (await db.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()")).rows
  const tem = new Set(cols.map(c => `${c.table_name}.${c.column_name}`))
  const faltam = ESPERADO.filter(([t, c]) => !tem.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`)
  const chk = (await db.query("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'ia_apelidos_tipo_check'")).rows[0]?.d || '(sem ia_apelidos)'
  console.log(`[${a.sigla}] colunas: ${faltam.length ? 'FALTAM ' + faltam.join(', ') : 'todas ok'} · ia_apelidos: ${/acao_despesa/.test(chk) && /recorrencia/.test(chk) ? 'tipos novos ok' : chk}`)
  await db.end()
}
