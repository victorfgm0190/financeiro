import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { executarRegras, hojeSP, addMesesYM } from '../src/lib/integridade/regras.js'
import { planejarVarredura } from '../src/lib/integridade/motor.js'
import { dadosDeLinhas } from '../src/lib/integridade/dbRows.js'

// Motor de Integridade — pendências de dados (ver src/lib/integridade/regras.js).
//   GET                         → lista (filtros: status, regra, conta_id, fatura_ref); ?resumo=1 → só contagens
//   POST action=varrer          → roda as regras e grava as divergências { desde?: 'YYYY-MM' | 'todas' }
//   POST action=ignorar|reabrir → { id } muda o status (resolvida_por = 'usuario')
// Este endpoint SÓ detecta: não cria, altera nem apaga nada em lancamentos/agendamentos/contas.

let schemaPronto = false
async function ensureSchema() {
  if (schemaPronto) return
  await query(`CREATE TABLE IF NOT EXISTS pendencias_integridade (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    regra         TEXT NOT NULL,
    severidade    TEXT NOT NULL CHECK (severidade IN ('auto','aprovar')),
    origem_id     TEXT NOT NULL,
    conta_id      TEXT,
    fatura_ref    TEXT,
    descricao     TEXT,
    esperado      JSONB,
    encontrado    JSONB,
    status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','resolvida','ignorada')),
    detectada_em  TIMESTAMPTZ DEFAULT now(),
    verificada_em TIMESTAMPTZ DEFAULT now(),
    resolvida_em  TIMESTAMPTZ,
    resolvida_por TEXT,
    UNIQUE (regra, origem_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_pendencias_integridade_status ON pendencias_integridade (status)`)
  schemaPronto = true
}

function param(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

const COLS = ['regra', 'severidade', 'origem_id', 'conta_id', 'fatura_ref', 'descricao', 'esperado', 'encontrado']
const CHUNK = 400

// Um único upsert cobre nova / mantida / reaberta / ignorada: a pendência resolvida que reaparece
// volta a pendente (detectada_em nova); a ignorada continua ignorada.
async function gravar(q, linhas) {
  for (let i = 0; i < linhas.length; i += CHUNK) {
    const lote = linhas.slice(i, i + CHUNK)
    let n = 1
    const values = lote.map(() => `(${COLS.map(() => `$${n++}`).join(', ')}, now())`).join(', ')
    const params = lote.flatMap(d => COLS.map(c =>
      (c === 'esperado' || c === 'encontrado') ? (d[c] == null ? null : JSON.stringify(d[c])) : (d[c] ?? null)))
    await q(
      `INSERT INTO pendencias_integridade (${COLS.join(', ')}, verificada_em) VALUES ${values}
       ON CONFLICT (regra, origem_id) DO UPDATE SET
         severidade    = EXCLUDED.severidade,
         conta_id      = EXCLUDED.conta_id,
         fatura_ref    = EXCLUDED.fatura_ref,
         descricao     = EXCLUDED.descricao,
         esperado      = EXCLUDED.esperado,
         encontrado    = EXCLUDED.encontrado,
         verificada_em = now(),
         detectada_em  = CASE WHEN pendencias_integridade.status = 'resolvida' THEN now() ELSE pendencias_integridade.detectada_em END,
         resolvida_em  = CASE WHEN pendencias_integridade.status = 'resolvida' THEN NULL ELSE pendencias_integridade.resolvida_em END,
         resolvida_por = CASE WHEN pendencias_integridade.status = 'resolvida' THEN NULL ELSE pendencias_integridade.resolvida_por END,
         status        = CASE WHEN pendencias_integridade.status = 'resolvida' THEN 'pendente' ELSE pendencias_integridade.status END`,
      params,
    )
  }
}

async function varrer(body) {
  const hoje = hojeSP()
  const desde = body?.desde === 'todas' ? null
    : (/^\d{4}-\d{2}$/.test(body?.desde || '') ? body.desde : addMesesYM(hoje.slice(0, 7), -3))

  const [lancamentos, contas, agendamentos, grupos] = await Promise.all([
    query('SELECT * FROM lancamentos'),
    query('SELECT * FROM contas'),
    query('SELECT * FROM agendamentos'),
    query('SELECT * FROM reservas_funcoes'),
  ])
  const divergencias = executarRegras(dadosDeLinhas({ lancamentos, contas, agendamentos, grupos }), { hoje, desde })

  return withTransaction(async (q) => {
    const existentes = await q('SELECT id, regra, origem_id, conta_id, fatura_ref, status FROM pendencias_integridade')
    const plano = planejarVarredura(existentes, divergencias, { desde })
    await gravar(q, plano.gravar)
    if (plano.resolver.length) {
      await q(
        `UPDATE pendencias_integridade
            SET status = 'resolvida', resolvida_em = now(), resolvida_por = 'varredura'
          WHERE id = ANY($1) AND status = 'pendente'`,
        [plano.resolver],
      )
    }
    const porRegra = {}
    for (const d of divergencias) porRegra[d.regra] = (porRegra[d.regra] || 0) + 1
    return {
      hoje, desde,
      novas: plano.resumo.novas + plano.resumo.reabertas,
      mantidas: plano.resumo.mantidas,
      resolvidas: plano.resumo.resolvidas,
      ignoradas: plano.resumo.ignoradas,
      total_divergencias: divergencias.length,
      por_regra: porRegra,
    }
  })
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureSchema()

    if (req.method === 'GET') {
      if (param(req, 'resumo')) {
        const rows = await query(
          `SELECT status, regra, severidade, COUNT(*)::int AS qtd
             FROM pendencias_integridade GROUP BY status, regra, severidade`,
        )
        const pendentes = rows.filter(r => r.status === 'pendente').reduce((s, r) => s + r.qtd, 0)
        return res.json({ pendentes, grupos: rows })
      }
      const filtros = []
      const params = []
      for (const campo of ['status', 'regra', 'conta_id', 'fatura_ref']) {
        const v = param(req, campo)
        if (v) { params.push(v); filtros.push(`${campo} = $${params.length}`) }
      }
      const rows = await query(
        `SELECT * FROM pendencias_integridade
          ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
          ORDER BY regra, fatura_ref NULLS FIRST, origem_id`,
        params,
      )
      return res.json({ pendencias: rows })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const action = param(req, 'action') || body?.action
      if (action === 'varrer') return res.json({ ok: true, ...(await varrer(body)) })
      if (action === 'ignorar' || action === 'reabrir') {
        if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
        const [row] = action === 'ignorar'
          ? await query(
            `UPDATE pendencias_integridade
                SET status = 'ignorada', resolvida_em = now(), resolvida_por = 'usuario'
              WHERE id = $1 RETURNING *`, [body.id])
          : await query(
            `UPDATE pendencias_integridade
                SET status = 'pendente', resolvida_em = NULL, resolvida_por = 'usuario'
              WHERE id = $1 RETURNING *`, [body.id])
        if (!row) return res.status(404).json({ error: 'Pendência não encontrada' })
        return res.json({ ok: true, pendencia: row })
      }
      return res.status(400).json({ error: `action inválida: ${action}` })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/integridade]', err.message)
    res.status(500).json({ error: err.message })
  }
}
