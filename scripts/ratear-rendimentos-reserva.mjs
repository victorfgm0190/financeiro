// RENDIMENTOS DE RESERVA — rateio retroativo (29/10). Rateia entre as funções da conta de reserva
// os rendimentos já lançados (receita sem função na conta de reserva), na MESMA regra do app
// (src/lib/rendimentoReserva.js): em ordem de data, proporcional ao saldo de cada função NAQUELE
// dia (só saldo positivo, centavos na maior) — cada rendimento já rateado entra no saldo do
// seguinte. Grava ajustes em reserve_adjustments (observação "Rendimento", lancamento_id = o
// rendimento), iguais aos que o app grava ao lançar um rendimento novo.
//
// NÃO altera lançamentos, saldos das contas nem totais: só divide o valor entre as funções.
// Cada rendimento é conferido antes (existe, mesma conta/data/valor, ainda sem rateio, continua
// sendo receita sem função); o que não bater é PULADO com o motivo. Tudo numa transação.
// Rode com o app FECHADO em todos os aparelhos.
//
// Dados reais (ids, valores) ficam FORA do git: docs/privado/rateio-rendimentos.json
// { banco, linhas: [{ rotulo, lancamento, conta, contaNome, data, valor, nome }] }
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/ratear-rendimentos-reserva.mjs            ← só PRÉVIA (SELECT)
//   node --env-file=.env.local scripts/ratear-rendimentos-reserva.mjs --aplicar  ← grava
//   ... [--dados outro.json] [--detalhe]   (--detalhe: lista a parte de cada função por rendimento)
import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'
import { rateioDoRendimento } from '../src/lib/rendimentoReserva.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const detalhe = args.includes('--detalhe')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/ratear-rendimentos-reserva.mjs')
  process.exit(1)
}
const arqDados = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : 'docs/privado/rateio-rendimentos.json'
const DADOS = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const BANCO = DADOS.banco
const LINHAS = [...(DADOS.linhas || [])].sort((a, b) => a.data.localeCompare(b.data) || a.lancamento.localeCompare(b.lancamento))

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(n * 100) / 100

async function lerEstado(q) {
  const functions = (await q(`SELECT id, name, account_id, saldo_inicial::float AS si FROM reserve_functions`))
    .map(f => ({ id: f.id, name: f.name, accountId: f.account_id, saldoInicial: f.si }))
  const periods = (await q(`SELECT function_id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, saldo_inicial::float AS saldo_inicial FROM reserve_periods`))
  const adjustments = (await q(`SELECT id, function_id, to_char(data, 'YYYY-MM-DD') AS data, valor::float AS valor, lancamento_id FROM reserve_adjustments`))
  const transactions = (await q(`SELECT id, type, account_id, to_account_id, amount::float AS amount, to_char(date::date, 'YYYY-MM-DD') AS date, reserva_funcao_id
                                   FROM lancamentos WHERE reserva_funcao_id IS NOT NULL`))
    .map(t => ({ id: t.id, type: t.type, accountId: t.account_id, toAccountId: t.to_account_id, amount: t.amount, date: t.date, reservaFuncaoId: t.reserva_funcao_id }))
  const rend = new Map((await q(`SELECT id, type, account_id, to_char(date::date, 'YYYY-MM-DD') AS date, amount::float AS amount, reserva_funcao_id, reserva_auto
                                   FROM lancamentos WHERE id = ANY($1)`, [LINHAS.map(l => l.lancamento)])).map(r => [r.id, r]))
  return { functions, periods, adjustments, transactions, rend }
}

function motivoPular(l, { rend, adjustments }) {
  const t = rend.get(l.lancamento)
  if (!t) return 'lançamento não existe'
  if (t.type !== 'income' || t.reserva_funcao_id || t.reserva_auto) return 'não é mais receita sem função'
  if (t.account_id !== l.conta) return 'mudou de conta'
  if (t.date !== l.data) return `data mudou (${t.date})`
  if (Math.abs(t.amount - l.valor) > 0.005) return `valor mudou (${brl(t.amount)})`
  if (adjustments.some(a => a.lancamento_id === l.lancamento)) return 'já está rateado'
  return null
}

const db = new pg.Client(configTlsVerificado(urlDoDatabase(BANCO)))
await db.connect()
try {
  const q0 = async (sql, p = []) => (await db.query(sql, p)).rows
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · banco ${BANCO} · ${LINHAS.length} rendimento(s)`)
  const estado = await lerEstado(q0)
  const nomeFn = new Map(estado.functions.map(f => [f.id, f.name]))

  // Plano em ordem de data: cada rateio entra nos ajustes antes do próximo (saldo no dia).
  const adjs = [...estado.adjustments]
  const plano = [], pulos = []
  const porConta = {}
  const porFuncao = {}
  for (const l of LINHAS) {
    const m = motivoPular(l, { ...estado, adjustments: adjs })
    if (m) { pulos.push([l, m]); continue }
    const partes = rateioDoRendimento({ id: l.lancamento, accountId: l.conta, amount: l.valor, date: l.data },
      { functions: estado.functions, periods: estado.periods, adjustments: adjs, transactions: estado.transactions })
    if (!partes.length) { pulos.push([l, 'nenhuma função com saldo positivo na data']); continue }
    adjs.push(...partes)
    plano.push([l, partes])
    porConta[l.contaNome] = r2((porConta[l.contaNome] || 0) + l.valor)
    for (const p of partes) {
      const k = `${l.contaNome} · ${nomeFn.get(p.function_id) || p.function_id}`
      porFuncao[k] = r2((porFuncao[k] || 0) + p.valor)
    }
    if (detalhe) {
      console.log(`   ${l.rotulo} ${l.data} ${l.contaNome} R$ ${brl(l.valor)} → ${partes.map(p => `${nomeFn.get(p.function_id)} ${brl(p.valor)}`).join(' · ')}`)
    }
  }

  console.log('\n── Rateio por função (soma dos rendimentos)')
  for (const [k, v] of Object.entries(porFuncao).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(40)} ${brl(v).padStart(10)}`)

  if (aplicar) {
    await comoDonoDoBanco(db, BANCO, async (q) => {
      for (const [l, partes] of plano) {
        const [ja] = await q('SELECT 1 FROM reserve_adjustments WHERE lancamento_id = $1 LIMIT 1', [l.lancamento])
        if (ja) throw new Error(`${l.rotulo}: rateio apareceu durante a gravação — nada foi gravado`)
        for (const a of partes) {
          await q(`INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao, lancamento_id)
                   VALUES ($1, $2, $3, $4, $5, $6)`, [a.id, a.function_id, a.data, a.valor, a.observacao, a.lancamento_id])
        }
      }
    })
    const [n] = await q0('SELECT count(*)::int AS n, COALESCE(sum(valor), 0)::float AS v FROM reserve_adjustments WHERE lancamento_id = ANY($1)', [LINHAS.map(l => l.lancamento)])
    console.log(`\n── DEPOIS: ${n.n} ajuste(s) de rendimento gravados, somando R$ ${brl(n.v)}`)
  }

  console.log(`\n══ RELATÓRIO ${aplicar ? '' : '(prévia — rode com --aplicar para gravar)'}`)
  console.log(`   ${aplicar ? 'Rateados' : 'A ratear'}: ${plano.length} — ${Object.entries(porConta).map(([c, v]) => `${c} R$ ${brl(v)}`).join(' · ') || '—'}`)
  console.log(`   Pulados: ${pulos.length}`)
  for (const [l, m] of pulos) console.log(`     ${l.rotulo} ${l.data} ${l.contaNome} R$ ${brl(l.valor)}: ${m}`)
} finally {
  await db.end()
}
