import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'

// CONSULTAS salvas da tela "Fluxo de Caixa Futuro": nome + conjunto de contas (por conta / por
// grupo / contas principais) + opções do cálculo + horizonte padrão.
//   GET               → lista todas (o front filtra pelo perfil ativo)
//   POST              → cria
//   PUT               → atualiza por id
//   DELETE ?id=xxx    → remove
// Só UMA consulta pode ser padrao = true: marcar uma desmarca as outras na MESMA transação.
// Neon nunca é acessado direto do browser, sempre por este endpoint.

const MODOS = new Set(['conta', 'grupo', 'principais'])
const HORIZONTES = new Set([15, 30, 45, 60])

export const DDL_FLUXO_CONSULTAS = `CREATE TABLE IF NOT EXISTS fluxo_consultas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    modo TEXT NOT NULL CHECK (modo IN ('conta', 'grupo', 'principais')),
    account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    perfil_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    incluir_agendamentos BOOLEAN NOT NULL DEFAULT true,
    incluir_lancamentos_futuros BOOLEAN NOT NULL DEFAULT true,
    incluir_envelopes BOOLEAN NOT NULL DEFAULT true,
    ocultar_reserva BOOLEAN NOT NULL DEFAULT false,
    ocultar_patrimonio BOOLEAN NOT NULL DEFAULT false,
    horizonte_padrao INTEGER NOT NULL DEFAULT 30,
    padrao BOOLEAN NOT NULL DEFAULT false,
    ordem INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`

// DDL viva da tabela (a cópia em supabase/schema.sql é documentação). Roda uma vez por cold start.
let schemaPronto = false
async function ensureSchema() {
  if (schemaPronto) return
  await query(DDL_FLUXO_CONSULTAS)
  schemaPronto = true
}

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

const COLS = `id, nome, modo, account_ids, group_ids, perfil_ids, incluir_agendamentos,
  incluir_lancamentos_futuros, incluir_envelopes, ocultar_reserva, ocultar_patrimonio,
  horizonte_padrao, padrao, ordem, created_at, updated_at`

const listaIds = (v) => JSON.stringify(Array.isArray(v) ? v.filter(Boolean).map(String) : [])

// Valida e normaliza o corpo de POST/PUT. Devolve { erro } ou { dados } (na ordem dos $2..$14).
export function normalizarConsultaBody(body) {
  const nome = String(body?.nome || '').trim()
  const modo = String(body?.modo || '')
  const horizonte = Number(body?.horizonte_padrao ?? 30)
  if (!nome) return { erro: 'nome é obrigatório' }
  if (!MODOS.has(modo)) return { erro: "modo deve ser 'conta', 'grupo' ou 'principais'" }
  if (!HORIZONTES.has(horizonte)) return { erro: 'horizonte_padrao deve ser 15, 30, 45 ou 60' }
  const b = (v, def) => (v == null ? def : !!v)
  return {
    dados: [
      nome, modo, listaIds(body.account_ids), listaIds(body.group_ids), listaIds(body.perfil_ids),
      b(body.incluir_agendamentos, true), b(body.incluir_lancamentos_futuros, true),
      b(body.incluir_envelopes, true), b(body.ocultar_reserva, false), b(body.ocultar_patrimonio, false),
      horizonte, b(body.padrao, false), body.ordem == null || body.ordem === '' ? null : Number(body.ordem),
    ],
  }
}

// Desmarca a padrão das OUTRAS consultas quando esta é marcada (mesma transação da escrita).
export const SQL_DESMARCAR_PADRAO = 'UPDATE fluxo_consultas SET padrao = false, updated_at = now() WHERE padrao AND id <> $1'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureSchema()

    if (req.method === 'GET') {
      const rows = await query(`SELECT ${COLS} FROM fluxo_consultas ORDER BY ordem NULLS LAST, nome`)
      return res.json({ consultas: rows })
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await parseBody(req)
      const editar = req.method === 'PUT'
      if (editar && !body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      const { erro, dados } = normalizarConsultaBody(body)
      if (erro) return res.status(400).json({ error: erro })

      const row = await withTransaction(async (q) => {
        const [r] = editar
          ? await q(
            `UPDATE fluxo_consultas SET
                nome = $2, modo = $3, account_ids = $4::jsonb, group_ids = $5::jsonb, perfil_ids = $6::jsonb,
                incluir_agendamentos = $7, incluir_lancamentos_futuros = $8, incluir_envelopes = $9,
                ocultar_reserva = $10, ocultar_patrimonio = $11, horizonte_padrao = $12, padrao = $13,
                ordem = $14, updated_at = now()
              WHERE id = $1
          RETURNING ${COLS}`,
            [body.id, ...dados],
          )
          : await q(
            `INSERT INTO fluxo_consultas (
                nome, modo, account_ids, group_ids, perfil_ids, incluir_agendamentos,
                incluir_lancamentos_futuros, incluir_envelopes, ocultar_reserva, ocultar_patrimonio,
                horizonte_padrao, padrao, ordem)
              VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12,
                      COALESCE($13, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM fluxo_consultas)))
          RETURNING ${COLS}`,
            dados,
          )
        if (r?.padrao) await q(SQL_DESMARCAR_PADRAO, [r.id])
        return r
      })
      if (!row) return res.status(404).json({ error: 'Consulta não encontrada' })
      return res.json({ ok: true, consulta: row })
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query('DELETE FROM fluxo_consultas WHERE id = $1', [id])
      return res.json({ ok: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/fluxo-consultas]', err.message)
    res.status(500).json({ error: err.message })
  }
}
