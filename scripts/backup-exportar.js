// Gera o BACKUP COMPLETO de um ambiente por linha de comando — o MESMO código da tela (api/_backup.js +
// src/lib/backupMontagem.js), sem precisar liberar código no ambiente. SÓ LEITURA: tudo numa transação
// REPEATABLE READ, READ ONLY (o arquivo é uma foto única do banco).
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/backup-exportar.js --ambiente vm [--saida <pasta ou arquivo .json>]
// Sem --saida, grava na Área de Trabalho (ou na pasta atual, se não houver Área de Trabalho).
import process from 'node:process'
import os from 'node:os'
import { existsSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { gerarManifesto, lerPagina, lerEstrutura } from '../api/_backup.js'
import { montarBackup, serializarBackup } from '../src/lib/backupMontagem.js'
import { nomeDoArquivo } from '../src/lib/backupFormato.js'

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? String(args[args.indexOf(n) + 1] || '') : null)
const sigla = (arg('--ambiente') || '').toLowerCase()
if (!sigla || !process.env.CENTRAL_DATABASE_URL) {
  console.error('Uso: node --env-file=.env.local scripts/backup-exportar.js --ambiente <sigla> [--saida <pasta|arquivo.json>]')
  process.exit(1)
}

function pastaPadrao() {
  for (const p of [join(os.homedir(), 'Desktop'), join(os.homedir(), 'OneDrive', 'Desktop'), join(os.homedir(), 'Área de Trabalho')]) {
    if (existsSync(p)) return p
  }
  return process.cwd()
}

const conectar = async (url) => { const c = new pg.Client(configTlsVerificado(url)); await c.connect(); return c }
const central = await conectar(process.env.CENTRAL_DATABASE_URL)
let db
try {
  const [amb] = (await central.query('SELECT sigla, database_name FROM ambientes WHERE sigla = $1', [sigla])).rows
  if (!amb) throw new Error(`Ambiente ${sigla} não existe no central.`)
  db = await conectar(urlDoDatabase(amb.database_name))
  const q = async (sql, p = []) => (await db.query(sql, p)).rows
  let appHash = null
  try { appHash = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim() } catch { /* fora do git */ }
  const t0 = Date.now()
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const estrutura = await lerEstrutura(q)
  let ultimo = ''
  const arquivo = await montarBackup({
    obterManifesto: () => gerarManifesto(q, { ambiente: amb.sigla, appHash }),
    obterPagina: (t, o) => lerPagina(q, t, o, { estrutura }),
    onProgresso: ({ tabela, tabelaIndice, totalTabelas }) => {
      if (tabela !== ultimo) { ultimo = tabela; process.stdout.write(`\r  ${tabelaIndice}/${totalTabelas} ${tabela.padEnd(32)}`) }
    },
    tentativas: 1,
  })
  await db.query('ROLLBACK')
  const saida = arg('--saida')
  const destino = saida && saida.toLowerCase().endsWith('.json') ? saida
    : join(saida && existsSync(saida) && statSync(saida).isDirectory() ? saida : pastaPadrao(), nomeDoArquivo(amb.sigla))
  writeFileSync(destino, serializarBackup(arquivo), 'utf8')
  const m = arquivo.manifesto
  const linhas = Object.values(m.tabelas).reduce((s, t) => s + t.linhas, 0)
  console.log(`\n✔ ${destino}`)
  console.log(`  ambiente ${m.ambiente} · ${Object.keys(m.tabelas).length} tabelas · ${linhas} linhas · versão ${m.schema.ultima} · ${(statSync(destino).size / 1048576).toFixed(1)} MB · ${((Date.now() - t0) / 1000).toFixed(1)} s`)
} catch (err) {
  console.error('\n✖', err.message)
  process.exitCode = 1
} finally {
  await db?.end()
  await central.end()
}
