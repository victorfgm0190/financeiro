// CONFERE um arquivo de backup com o banco de um ambiente — o MESMO código da tela (api/_backup.js):
// confere a integridade do arquivo (impressão digital de cada tabela × cabeçalho) e, no banco,
// quantidade + impressão digital de cada tabela. SÓ LEITURA (transação READ ONLY).
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/backup-conferir.js --ambiente vm --arquivo <caminho.json>
// Sai com código 1 se alguma tabela não bater.
import process from 'node:process'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { conferirNoBanco } from '../api/_backup.js'
import { validarArquivo, conferirIntegridade, versaoDoManifesto } from '../src/lib/backupFormato.js'

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? String(args[args.indexOf(n) + 1] || '') : null)
const sigla = (arg('--ambiente') || '').toLowerCase()
const caminho = arg('--arquivo')
if (!sigla || !caminho || !process.env.CENTRAL_DATABASE_URL) {
  console.error('Uso: node --env-file=.env.local scripts/backup-conferir.js --ambiente <sigla> --arquivo <caminho.json>')
  process.exit(1)
}

const conectar = async (url) => { const c = new pg.Client(configTlsVerificado(url)); await c.connect(); return c }
let central
let db
try {
  const arq = JSON.parse(readFileSync(caminho, 'utf8'))
  const v = validarArquivo(arq)
  if (!v.ok) throw new Error(v.erro)
  const integ = await conferirIntegridade(arq)
  if (!integ.ok) throw new Error(`Arquivo alterado ou corrompido: ${integ.divergentes.join(', ')}`)
  console.log(`Arquivo íntegro · origem ${arq.manifesto.ambiente} · gerado em ${arq.manifesto.geradoEm} · versão ${versaoDoManifesto(arq.manifesto) || '—'}`)

  central = await conectar(process.env.CENTRAL_DATABASE_URL)
  const [amb] = (await central.query('SELECT sigla, database_name FROM ambientes WHERE sigla = $1', [sigla])).rows
  if (!amb) throw new Error(`Ambiente ${sigla} não existe no central.`)
  db = await conectar(urlDoDatabase(amb.database_name))
  const q = async (sql, p = []) => (await db.query(sql, p)).rows
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const conf = await conferirNoBanco(q, arq.manifesto)
  await db.query('ROLLBACK')

  console.log(`\n${'tabela'.padEnd(30)} ${'no arquivo'.padStart(10)} ${'no banco'.padStart(10)}  resultado`)
  for (const c of conf) {
    console.log(`${c.tabela.padEnd(30)} ${String(c.arquivo?.linhas ?? '—').padStart(10)} ${String(c.banco?.linhas ?? '—').padStart(10)}  ${c.ok ? 'ok' : `DIFERENTE${c.motivo ? ` (${c.motivo})` : c.banco && c.arquivo && c.banco.linhas === c.arquivo.linhas ? ' (mesma quantidade, conteúdo diferente)' : ''}`}`)
  }
  const ruins = conf.filter(c => !c.ok)
  console.log(`\n${ruins.length ? `✖ ${ruins.length} tabela(s) diferente(s)` : `✔ todas as ${conf.length} tabelas conferem`} · ambiente ${amb.sigla}`)
  if (ruins.length) process.exitCode = 1
} catch (err) {
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await db?.end()
  await central?.end()
}
