// Valida o "Limite Disponível"/"Dívida Total" novos (creditLimitUsage, a MESMA função da tela)
// contra os dados do Neon. Somente leitura: nada é gravado.
//
//   node --env-file=.env.local scripts/diag-limite-uso.mjs               (tabela por cartão)
//   node --env-file=.env.local scripts/diag-limite-uso.mjs itaupers      (+ fatura a fatura do cartão)
import pg from 'pg'
import { createJiti } from 'jiti'

// jiti resolve os imports sem extensão de src/components/shared/utils.js.
const jiti = createJiti(import.meta.url)
const { creditLimitUsage } = await jiti.import('../src/components/shared/utils.js')
const { faturaEstaFechada } = await jiti.import('../src/lib/faturasFechadas.js')

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida.')
  process.exit(1)
}

const filtro = (process.argv[2] || '').toLowerCase()
const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v) => (v == null ? null : Number(v))
const dia = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
try {
  const [contas, lancs, ags, cfg] = await Promise.all([
    pool.query(`SELECT id, name, apelido, closing_day, credit_limit, credit_debt FROM contas WHERE type = 'credit'`),
    pool.query(`SELECT id, type, account_id, to_account_id, amount, date, fatura_month_year
                FROM lancamentos WHERE type IN ('expense', 'income', 'credit_payment', 'transfer')`),
    pool.query(`SELECT id, tipo, card_id, fatura_mes_ano, amount, registered FROM agendamentos WHERE tipo = 'pagamento_fatura'`),
    pool.query(`SELECT faturas_fechadas FROM configuracoes WHERE id = 1`),
  ])
  // Mesmo formato camelCase que o app usa (db.js rowToTx/rowToSchedule), só com os campos lidos.
  const transactions = lancs.rows.map(r => ({
    id: r.id, type: r.type, accountId: r.account_id, toAccountId: r.to_account_id,
    amount: Number(r.amount), date: dia(r.date), faturaMonthYear: r.fatura_month_year || null,
  }))
  const schedules = ags.rows.map(r => ({
    id: r.id, tipo: r.tipo, cardId: r.card_id, faturaMesAno: r.fatura_mes_ano,
    amount: Number(r.amount), registered: r.registered || [],
  }))
  const fechadas = cfg.rows[0]?.faturas_fechadas || {}
  const isFechada = (cardId, k) => faturaEstaFechada(fechadas, cardId, k)

  const linhas = []
  for (const c of contas.rows) {
    const card = { id: c.id, closingDay: c.closing_day, creditLimit: num(c.credit_limit) }
    const { total, faturas } = creditLimitUsage(card, transactions, schedules, { isFechada })
    linhas.push({ cartao: c.apelido || c.name, limite: card.creditLimit || 0, uso: total, antigo: num(c.credit_debt) || 0 })

    const nome = `${c.name} ${c.apelido || ''}`.toLowerCase()
    if (filtro && nome.includes(filtro)) {
      console.log(`\n${c.name} — fatura a fatura`)
      console.table(faturas.map(f => ({
        fatura: f.billKey, total: f.billTotal.toFixed(2), pago: f.totalPago.toFixed(2),
        status: f.isFaturaPaga ? 'paga' : f.isFaturaParcial ? 'parcial' : f.billTotal > 0 ? 'aberta' : 'vazia',
        fechada: isFechada(c.id, f.billKey), fechadaAntiga: f.fechadaAntiga, emAberto: f.emAberto.toFixed(2),
      })))
    }
  }
  console.log('\ncartão | limite | uso novo | limite disponível | credit_debt antigo')
  for (const l of linhas) {
    console.log(`${l.cartao} | ${fmt(l.limite)} | ${fmt(l.uso)} | ${fmt(l.limite - l.uso)} | ${fmt(l.antigo)}`)
  }
} finally {
  await pool.end()
}
