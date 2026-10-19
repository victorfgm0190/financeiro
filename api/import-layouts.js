import { query, parseBody } from './_db.js'
import { registroPorBanco } from './_conexao.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'

// MODELOS DE IMPORTAÇÃO do usuário logado (planilha de banco não reconhecida → mapeamento salvo).
// Por ambiente (banco do cliente) e por usuário. Os modelos PRONTOS de bancos ficam no código
// (src/lib/importers/generico.js), não aqui.
//   GET                                                   → { layouts: [...] } do usuário
//   POST { nome, banco, tipo, assinatura, mapeamento }    → upsert por (usuário, tipo, assinatura)
//   DELETE ?id=x                                          → apaga um modelo do usuário

// user_id sem FK: o login de emergência tem id 'env:<usuário>' e não tem linha em usuarios.
export const DDL_IMPORT_LAYOUTS = `CREATE TABLE IF NOT EXISTS import_layouts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    banco TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('cartao', 'conta')),
    assinatura TEXT NOT NULL,
    mapeamento JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tipo, assinatura)
  )`

const pronto = registroPorBanco()
export async function ensureImportLayoutsSchema() {
  if (pronto.jaRodou()) return
  await query(DDL_IMPORT_LAYOUTS)
  pronto.marcar()
}

const COLUNAS = ['colData', 'colDescricao', 'colValor', 'colDebito', 'colCredito', 'colFavorecido']
// Body → { erro } ou { layout } normalizado (só os campos conhecidos do mapeamento).
export function normalizarLayout(b) {
  const nome = String(b?.nome || '').trim().slice(0, 120)
  const tipo = b?.tipo
  const assinatura = String(b?.assinatura || '').trim()
  const m = b?.mapeamento
  if (!nome) return { erro: 'Informe o nome do modelo' }
  if (tipo !== 'cartao' && tipo !== 'conta') return { erro: 'Tipo inválido (cartao ou conta)' }
  if (!assinatura || assinatura.length > 2000) return { erro: 'Assinatura do cabeçalho inválida' }
  if (!m || typeof m !== 'object') return { erro: 'Mapeamento inválido' }
  const mapeamento = {}
  for (const c of COLUNAS) {
    const v = m[c]
    mapeamento[c] = Number.isInteger(v) && v >= 0 && v < 200 ? v : null
  }
  if (mapeamento.colData == null || mapeamento.colDescricao == null ||
    (mapeamento.colValor == null && (mapeamento.colDebito == null || mapeamento.colCredito == null))) {
    return { erro: 'Mapeamento incompleto: data, descrição e valor (ou débito e crédito)' }
  }
  mapeamento.linhaCabecalho = Number.isInteger(m.linhaCabecalho) && m.linhaCabecalho >= 0 ? m.linhaCabecalho : 0
  mapeamento.formatoData = ['dmy', 'ymd', 'mdy'].includes(m.formatoData) ? m.formatoData : 'dmy'
  mapeamento.decimal = m.decimal === '.' ? '.' : ','
  mapeamento.sinalDespesa = m.sinalDespesa === 'positivo' ? 'positivo' : 'negativo'
  mapeamento.ignorar = (Array.isArray(m.ignorar) ? m.ignorar : []).map(x => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 30)
  return { layout: { nome, banco: String(b?.banco || '').trim().slice(0, 80) || null, tipo, assinatura, mapeamento } }
}

const linhaParaLayout = (r) => ({ id: r.id, nome: r.nome, banco: r.banco, tipo: r.tipo, assinatura: r.assinatura, mapeamento: r.mapeamento })

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  const userId = req.user?.id
  if (!userId) return res.status(400).json({ error: 'Sessão sem usuário' })
  try {
    await ensureImportLayoutsSchema()

    if (req.method === 'GET') {
      const rows = await query('SELECT id, nome, banco, tipo, assinatura, mapeamento FROM import_layouts WHERE user_id = $1 ORDER BY nome', [userId])
      return res.json({ layouts: rows.map(linhaParaLayout) })
    }

    if (req.method === 'POST') {
      const { erro, layout } = normalizarLayout(await parseBody(req))
      if (erro) return res.status(400).json({ error: erro })
      const [r] = await query(
        `INSERT INTO import_layouts (user_id, nome, banco, tipo, assinatura, mapeamento)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, tipo, assinatura) DO UPDATE
           SET nome = EXCLUDED.nome, banco = EXCLUDED.banco, mapeamento = EXCLUDED.mapeamento, updated_at = now()
         RETURNING id, nome, banco, tipo, assinatura, mapeamento`,
        [userId, layout.nome, layout.banco, layout.tipo, layout.assinatura, JSON.stringify(layout.mapeamento)],
      )
      return res.json({ ok: true, layout: linhaParaLayout(r) })
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      if (!id) return res.status(400).json({ error: 'Informe o id' })
      const r = await query('DELETE FROM import_layouts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
      return res.json({ ok: true, apagados: r.length })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/import-layouts]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
