// RESERVAS — atribuição de função (30/10) às transferências que ficaram SEM função nas contas de
// reserva (resgates de fatura com detalhamento sem função, depósitos/resgates manuais), conforme
// a lista aprovada. Só a coluna reserva_funcao_id do lançamento muda: valores, datas, contas,
// saldos das contas e os espelhos (totais de receita/despesa) ficam como estão.
//
// Cada linha é conferida antes (existe, é transferência de/para a conta de reserva, mesma data e
// valor, ainda sem função, a função é da conta); a que não bater é PULADA com o motivo. Mostra o
// "Saldo a distribuir" de cada conta antes e depois (saldo real − Σ saldos das funções, na regra
// de src/lib/rendimentoReserva.js). Tudo numa transação. Rode com o app FECHADO.
//
// Dados reais (ids, valores) ficam FORA do git: docs/privado/atribuir-funcoes-reserva.json
// { banco, linhas: [{ rotulo, lancamento, conta, contaNome, data, valor, de, para, funcao, funcaoNome, nome }] }
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/atribuir-funcoes-reserva.mjs            ← só PRÉVIA (SELECT)
//   node --env-file=.env.local scripts/atribuir-funcoes-reserva.mjs --aplicar  ← grava
//   ... [--dados outro.json]
import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'
import { saldosDasFuncoesNaData } from '../src/lib/rendimentoReserva.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/atribuir-funcoes-reserva.mjs')
  process.exit(1)
}
const arqDados = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : 'docs/privado/atribuir-funcoes-reserva.json'
const DADOS = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const BANCO = DADOS.banco
const LINHAS = DADOS.linhas || []
const CONTAS = [...new Map(LINHAS.map(l => [l.conta, l.contaNome])).entries()]

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(n * 100) / 100
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

// "Saldo a distribuir" por conta = saldo real − Σ saldos das funções (hoje).
async function aDistribuir(q) {
  const functions = (await q(`SELECT id, account_id, saldo_inicial::float AS si FROM reserve_functions`))
    .map(f => ({ id: f.id, accountId: f.account_id, saldoInicial: f.si }))
  const periods = await q(`SELECT function_id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, saldo_inicial::float AS saldo_inicial FROM reserve_periods`)
  const adjustments = await q(`SELECT function_id, to_char(data, 'YYYY-MM-DD') AS data, valor::float AS valor FROM reserve_adjustments`)
  const transactions = (await q(`SELECT id, type, account_id, to_account_id, amount::float AS amount, to_char(date::date, 'YYYY-MM-DD') AS date, reserva_funcao_id
                                   FROM lancamentos WHERE reserva_funcao_id IS NOT NULL`))
    .map(t => ({ id: t.id, type: t.type, accountId: t.account_id, toAccountId: t.to_account_id, amount: t.amount, date: t.date, reservaFuncaoId: t.reserva_funcao_id }))
  const out = {}
  for (const [conta, nome] of CONTAS) {
    const [k] = await q('SELECT balance::float AS b FROM contas WHERE id = $1', [conta])
    const soma = saldosDasFuncoesNaData({ functions, periods, adjustments, transactions, contaId: conta, date: hoje }).reduce((s, f) => s + f.saldo, 0)
    out[nome] = { real: k?.b ?? 0, funcoes: r2(soma), aDistribuir: r2((k?.b ?? 0) - soma) }
  }
  return out
}

function motivoPular(l, t, fn) {
  if (!t) return 'lançamento não existe'
  if (t.type !== 'transfer') return 'não é transferência'
  if (t.reserva_funcao_id === l.funcao) return 'já tem esta função'
  if (t.reserva_funcao_id) return `já tem outra função (${t.reserva_funcao_id})`
  if (t.account_id !== l.de || t.to_account_id !== l.para) return 'contas mudaram'
  if (t.date !== l.data) return `data mudou (${t.date})`
  if (Math.abs(t.amount - l.valor) > 0.005) return `valor mudou (${brl(t.amount)})`
  if (!fn || fn.account_id !== l.conta) return 'a função não é desta conta de reserva'
  return null
}

const db = new pg.Client(configTlsVerificado(urlDoDatabase(BANCO)))
await db.connect()
try {
  const q0 = async (sql, p = []) => (await db.query(sql, p)).rows
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · banco ${BANCO} · ${LINHAS.length} lançamento(s)`)
  const txs = new Map((await q0(`SELECT id, type, account_id, to_account_id, amount::float AS amount, to_char(date::date, 'YYYY-MM-DD') AS date, reserva_funcao_id
                                   FROM lancamentos WHERE id = ANY($1)`, [LINHAS.map(l => l.lancamento)])).map(r => [r.id, r]))
  const fns = new Map((await q0('SELECT id, name, account_id FROM reserve_functions')).map(f => [f.id, f]))

  const plano = [], pulos = []
  for (const l of LINHAS) {
    const m = motivoPular(l, txs.get(l.lancamento), fns.get(l.funcao))
    if (m) pulos.push([l, m])
    else plano.push(l)
  }
  for (const l of plano) console.log(`   ${l.rotulo} ${l.contaNome.padEnd(7)} ${l.data} R$ ${brl(l.valor).padStart(10)}  ${String(l.nome).slice(0, 44).padEnd(44)} → ${l.funcaoNome}`)

  const antes = await aDistribuir(q0)
  if (aplicar) {
    await comoDonoDoBanco(db, BANCO, async (q) => {
      for (const l of plano) {
        const r = await q(`UPDATE lancamentos SET reserva_funcao_id = $2
                            WHERE id = $1 AND reserva_funcao_id IS NULL AND type = 'transfer' RETURNING id`, [l.lancamento, l.funcao])
        if (r.length !== 1) throw new Error(`${l.rotulo}: o lançamento mudou durante a gravação — nada foi gravado`)
      }
    })
  }
  // Prévia: o "depois" simula a atribuição (mesma conta, só a função muda).
  const depois = aplicar ? await aDistribuir(q0) : await aDistribuir(async (sql, p) => {
    const rows = await q0(sql, p)
    if (!/FROM lancamentos WHERE reserva_funcao_id IS NOT NULL/.test(sql)) return rows
    const extra = await q0(`SELECT id, type, account_id, to_account_id, amount::float AS amount, to_char(date::date, 'YYYY-MM-DD') AS date
                              FROM lancamentos WHERE id = ANY($1)`, [plano.map(l => l.lancamento)])
    const fnDe = new Map(plano.map(l => [l.lancamento, l.funcao]))
    return [...rows, ...extra.map(t => ({ ...t, reserva_funcao_id: fnDe.get(t.id) }))]
  })

  console.log(`\n── Saldo a distribuir (saldo real − Σ funções, hoje)${aplicar ? '' : ' — depois = simulado'}`)
  for (const [, nome] of CONTAS) {
    console.log(`   ${nome.padEnd(8)} real ${brl(antes[nome].real).padStart(10)} | antes: Σ funções ${brl(antes[nome].funcoes).padStart(10)} → a distribuir ${brl(antes[nome].aDistribuir).padStart(10)}`
      + ` | depois: Σ funções ${brl(depois[nome].funcoes).padStart(10)} → a distribuir ${brl(depois[nome].aDistribuir).padStart(10)}`)
  }

  console.log(`\n══ RELATÓRIO ${aplicar ? '' : '(prévia — rode com --aplicar para gravar)'}`)
  console.log(`   ${aplicar ? 'Atribuídas' : 'A atribuir'}: ${plano.length}`)
  console.log(`   Puladas: ${pulos.length}`)
  for (const [l, m] of pulos) console.log(`     ${l.rotulo} ${l.data} ${l.contaNome} ${l.nome}: ${m}`)
} finally {
  await db.end()
}
