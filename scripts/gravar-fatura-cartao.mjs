// FATURA DE REFERÊNCIA (29/10) — grava fatura_month_year em despesas de cartão antigas que
// ficaram sem ela (o app recalculava pela data). Grava a fatura em que cada uma JÁ aparece hoje
// (data + dia de fechamento do cartão), listada no arquivo de dados.
//
// Só a coluna fatura_month_year muda; valores, datas, contas e saldos não. Cada linha é conferida
// antes de gravar (lançamento existe, é despesa do cartão informado, mesma data e valor, ainda
// sem fatura, e a fatura calculada hoje é a do arquivo); a que não bater é PULADA (com o motivo).
// Tudo numa transação só. Rode com o app FECHADO em todos os aparelhos.
//
// Dados reais (ids, valores) ficam FORA do git: docs/privado/fatura-sem-fatura.json
// { banco, linhas: [{ rotulo, lancamento, cartao, data, valor, fatura, nome }] }
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/gravar-fatura-cartao.mjs            ← só PRÉVIA (SELECT)
//   node --env-file=.env.local scripts/gravar-fatura-cartao.mjs --aplicar  ← grava
//   ... [--dados outro.json]
import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'
import { faturaDoCartao } from '../src/lib/fatura.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/gravar-fatura-cartao.mjs')
  process.exit(1)
}
const arqDados = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : 'docs/privado/fatura-sem-fatura.json'
const DADOS = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const BANCO = DADOS.banco
const LINHAS = DADOS.linhas || []

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rot = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '—')

async function lerEstado(q) {
  const txs = new Map((await q(`SELECT l.id, l.type, l.account_id, to_char(l.date::date, 'YYYY-MM-DD') AS date, l.amount::float AS amount,
                                       l.fatura_month_year, l.description, k.type AS conta_tipo, k.closing_day, COALESCE(k.apelido, k.name) AS cartao
                                  FROM lancamentos l LEFT JOIN contas k ON k.id = l.account_id
                                 WHERE l.id = ANY($1)`, [LINHAS.map(l => l.lancamento)])).map(r => [r.id, r]))
  const [cfg] = await q('SELECT faturas_fechadas FROM configuracoes LIMIT 1')
  return { txs, fechadas: cfg?.faturas_fechadas || {} }
}

function mostrar(titulo, { txs }) {
  console.log(`\n── ${titulo}`)
  for (const l of LINHAS) {
    const t = txs.get(l.lancamento)
    console.log(`   ${l.rotulo.padEnd(3)} ${l.data} ${String(l.nome).padEnd(16).slice(0, 16)} R$ ${brl(l.valor).padStart(8)} · `
      + (t ? `${t.cartao} · fatura gravada ${rot(t.fatura_month_year)}` : 'LANÇAMENTO NÃO ENCONTRADO'))
  }
}

function motivoPular(l, { txs, fechadas }) {
  const t = txs.get(l.lancamento)
  if (!t) return 'lançamento não existe'
  if (t.fatura_month_year === l.fatura) return 'já tem esta fatura gravada'
  if (t.fatura_month_year) return `já tem outra fatura gravada (${rot(t.fatura_month_year)})`
  if (t.type !== 'expense' || t.conta_tipo !== 'credit') return 'não é despesa de cartão'
  if (t.account_id !== l.cartao) return 'mudou de cartão'
  if (t.date !== l.data) return `data mudou (${t.date})`
  if (Math.abs(t.amount - l.valor) > 0.005) return `valor mudou (${brl(t.amount)})`
  const hoje = faturaDoCartao(t.date, { closingDay: t.closing_day })
  if (hoje !== l.fatura) return `a fatura pela data hoje é ${rot(hoje)}, não ${rot(l.fatura)}`
  if (fechadas[`${l.cartao}_${l.fatura}`] === true) return `a fatura ${rot(l.fatura)} está fechada`
  return null
}

const db = new pg.Client(configTlsVerificado(urlDoDatabase(BANCO)))
await db.connect()
try {
  const q0 = async (sql, p = []) => (await db.query(sql, p)).rows
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · banco ${BANCO} · ${LINHAS.length} lançamento(s)`)
  const antes = await lerEstado(q0)
  mostrar('ANTES', antes)

  const plano = [], pulos = []
  for (const l of LINHAS) {
    const m = motivoPular(l, antes)
    if (m) pulos.push([l, m])
    else plano.push(l)
  }

  if (aplicar) {
    await comoDonoDoBanco(db, BANCO, async (q) => {
      for (const l of plano) {
        const r = await q(`UPDATE lancamentos SET fatura_month_year = $2
                            WHERE id = $1 AND fatura_month_year IS NULL AND account_id = $3 RETURNING id`, [l.lancamento, l.fatura, l.cartao])
        if (r.length !== 1) throw new Error(`${l.rotulo}: o lançamento mudou durante a gravação — nada foi gravado`)
      }
    })
    mostrar('DEPOIS', await lerEstado(q0))
  }

  console.log(`\n══ RELATÓRIO ${aplicar ? '' : '(prévia — rode com --aplicar para gravar)'}`)
  console.log(`   ${aplicar ? 'Gravadas' : 'A gravar'}: ${plano.length} — ${plano.map(l => `${l.rotulo} → ${rot(l.fatura)}`).join(', ') || '—'}`)
  console.log(`   Puladas: ${pulos.length}`)
  for (const [l, m] of pulos) console.log(`     ${l.rotulo} ${l.data} ${l.nome}: ${m}`)
} finally {
  await db.end()
}
