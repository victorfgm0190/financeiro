import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'

// Lançamentos PROVISÓRIOS do relatório "Fluxo de Caixa por Conta": entradas/saídas de
// SIMULAÇÃO, gravadas à parte de agendamentos/lancamentos.
//   GET                     → lista todos (ordenado por data)
//   POST                    → cria { id?, date, description, amount, type, account_id, category_id }
//   PUT                     → atualiza por id (mesmos campos)
//   DELETE  ?id=xxx         → remove por id
//   POST    ?acao=efetivar  → { id }: cria o agendamento único equivalente e APAGA o provisório,
//                             tudo na mesma transação (ver efetivar()).
// Nada aqui toca contas.balance nem lancamentos — o provisório só existe para a projeção
// do fluxo. Neon nunca é acessado direto do browser, sempre por este endpoint.

const TIPOS = new Set(['entrada', 'saida'])

// DDL viva da tabela (a cópia em supabase/schema.sql é documentação). Roda uma vez por
// cold start: pendurar no /api/load cobraria o custo de todo mundo por uma tela só.
let schemaPronto = false
async function ensureSchema() {
  if (schemaPronto) return
  await query(`CREATE TABLE IF NOT EXISTS fluxo_provisorios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    account_id TEXT,
    category_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_fluxo_provisorios_date ON fluxo_provisorios (date)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_fluxo_provisorios_account ON fluxo_provisorios (account_id)`)
  schemaPronto = true
}

// id / acao do query string, com fallback via URL (robusto entre runtimes da Vercel).
function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

// Valida e normaliza o corpo de POST/PUT. Devolve { erro } ou { dados }.
function normalizar(body) {
  const date = String(body?.date || '').slice(0, 10)
  const description = String(body?.description || '').trim()
  const amount = Number(body?.amount)
  const type = String(body?.type || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erro: 'date deve ser YYYY-MM-DD' }
  if (!description) return { erro: 'description é obrigatória' }
  if (!Number.isFinite(amount) || amount <= 0) return { erro: 'amount deve ser > 0' }
  if (!TIPOS.has(type)) return { erro: "type deve ser 'entrada' ou 'saida'" }
  if (!body?.account_id) return { erro: 'account_id é obrigatório' }
  return {
    dados: {
      date,
      description,
      amount,
      type,
      account_id: String(body.account_id),
      category_id: body.category_id || null,
    },
  }
}

// Efetivar: o provisório vira um agendamento ÚNICO ("once") com os mesmos dados e some daqui.
// As duas escritas vão na MESMA transação — um provisório apagado sem o agendamento (ou o
// contrário) deixaria a simulação e o fluxo real em desacordo sem deixar rastro.
//
// auto_register = false de propósito: efetivar é transformar a simulação numa PREVISÃO firme,
// não registrar o lançamento. Com true, um provisório datado no passado viraria transação na
// próxima abertura do app e mexeria no saldo da conta — exatamente o que a feature não faz.
// Mesma escolha da Provisão de Despesa (ScheduleForm/ProvisaoForm).
async function efetivar(id) {
  return withTransaction(async (q) => {
    const [prov] = await q('SELECT * FROM fluxo_provisorios WHERE id = $1', [id])
    if (!prov) return { erro: 404 }

    // account_type espelha contas.type (o frontend usa isso para saber se a ponta é cartão).
    const [conta] = await q('SELECT type FROM contas WHERE id = $1', [prov.account_id])

    const scheduleId = 'sch_prov_' + id
    const [sched] = await q(
      `INSERT INTO agendamentos (
         id, description, transaction_type, account_id, to_account_id, amount, category_id,
         account_type, frequency, start_date, occurrence_type, registered, skipped, overrides,
         auto_register, remind_days_before
       ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, 'once', $8, 'continuous',
                 '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, false, 3)
       ON CONFLICT (id) DO UPDATE SET
         description      = EXCLUDED.description,
         transaction_type = EXCLUDED.transaction_type,
         account_id       = EXCLUDED.account_id,
         amount           = EXCLUDED.amount,
         category_id      = EXCLUDED.category_id,
         account_type     = EXCLUDED.account_type,
         start_date       = EXCLUDED.start_date
       RETURNING *`,
      [
        scheduleId,
        prov.description,
        prov.type === 'entrada' ? 'income' : 'expense',
        prov.account_id,
        Number(prov.amount),
        prov.category_id || null,
        conta?.type || null,
        prov.date,
      ],
    )

    await q('DELETE FROM fluxo_provisorios WHERE id = $1', [id])
    return { schedule: sched }
  })
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureSchema()

    if (req.method === 'GET') {
      const rows = await query(
        `SELECT id, date, description, amount, type, account_id, category_id, created_at
           FROM fluxo_provisorios
          ORDER BY date, created_at`,
      )
      return res.json({ provisorios: rows })
    }

    if (req.method === 'POST') {
      if (queryParam(req, 'acao') === 'efetivar') {
        const { id } = await parseBody(req)
        if (!id) return res.status(400).json({ error: 'id é obrigatório' })
        const r = await efetivar(id)
        if (r.erro === 404) return res.status(404).json({ error: 'Provisório não encontrado' })
        return res.json({ ok: true, id, schedule: r.schedule })
      }

      const body = await parseBody(req)
      const { erro, dados } = normalizar(body)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        `INSERT INTO fluxo_provisorios (id, date, description, amount, type, account_id, category_id)
              VALUES (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7)
           RETURNING id, date, description, amount, type, account_id, category_id, created_at`,
        [body?.id || null, dados.date, dados.description, dados.amount, dados.type, dados.account_id, dados.category_id],
      )
      return res.json({ ok: true, provisorio: row })
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req)
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      const { erro, dados } = normalizar(body)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        `UPDATE fluxo_provisorios
            SET date = $2, description = $3, amount = $4, type = $5, account_id = $6, category_id = $7
          WHERE id = $1
      RETURNING id, date, description, amount, type, account_id, category_id, created_at`,
        [body.id, dados.date, dados.description, dados.amount, dados.type, dados.account_id, dados.category_id],
      )
      if (!row) return res.status(404).json({ error: 'Provisório não encontrado' })
      return res.json({ ok: true, provisorio: row })
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query('DELETE FROM fluxo_provisorios WHERE id = $1', [id])
      return res.json({ ok: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/fluxo-provisorios]', err.message)
    res.status(500).json({ error: err.message })
  }
}
