import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { acaoPorId } from '../src/lib/atalhos/registry.js'
import { normalizarCombinacao, validarCombinacao } from '../src/lib/atalhos/combinacao.js'

// ATALHOS DE TECLADO do usuário logado (as ações são fixas em src/lib/atalhos/registry.js).
// Só o que o usuário ALTEROU fica gravado; ação sem linha usa o padrão do registry.
//   GET                                          → [{ acaoId, combinacao }] do usuário
//   PUT { acaoId, combinacao }                    → upsert de uma ação (combinacao null = desativado)
//   PUT { itens: [{ acaoId, combinacao }, ...] }  → várias numa transação (substituir conflito)
//   DELETE ?acao_id=x                             → restaura o padrão de uma ação
//   DELETE                                        → restaura todos os padrões

// user_id sem FK: o login fixo de emergência tem id 'env:<usuário>' e não tem linha em usuarios.
export const DDL_ATALHOS = `CREATE TABLE IF NOT EXISTS atalhos_usuario (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    acao_id TEXT NOT NULL,
    combinacao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, acao_id)
  )`

let pronto = false
async function ensureAtalhosSchema() {
  if (pronto) return
  await query(DDL_ATALHOS)
  pronto = true
}

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

// { acaoId, combinacao } do body → { erro } ou { item } com a combinação canônica.
export function normalizarItem(it) {
  const acaoId = typeof it?.acaoId === 'string' ? it.acaoId : ''
  if (!acaoPorId(acaoId)) return { erro: `Ação desconhecida: ${acaoId || '(vazia)'}` }
  if (it.combinacao == null || it.combinacao === '') return { item: { acaoId, combinacao: null } }
  const erro = validarCombinacao(it.combinacao)
  if (erro) return { erro }
  return { item: { acaoId, combinacao: normalizarCombinacao(it.combinacao) } }
}

export async function gravarAtalhos(q, userId, itens) {
  for (const it of itens) {
    await q(
      `INSERT INTO atalhos_usuario (user_id, acao_id, combinacao) VALUES ($1, $2, $3)
        ON CONFLICT (user_id, acao_id) DO UPDATE SET combinacao = EXCLUDED.combinacao, updated_at = now()`,
      [userId, it.acaoId, it.combinacao],
    )
  }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const userId = req.user?.id
  if (!userId) return res.status(400).json({ error: 'Sessão sem usuário' })
  try {
    await ensureAtalhosSchema()

    if (req.method === 'GET') {
      const rows = await query('SELECT acao_id, combinacao FROM atalhos_usuario WHERE user_id = $1', [userId])
      return res.json({ atalhos: rows.map(r => ({ acaoId: r.acao_id, combinacao: r.combinacao })) })
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const brutos = Array.isArray(body?.itens) ? body.itens : [body]
      if (!brutos.length) return res.status(400).json({ error: 'Nada para gravar' })
      const itens = []
      for (const b of brutos) {
        const { erro, item } = normalizarItem(b)
        if (erro) return res.status(400).json({ error: erro })
        itens.push(item)
      }
      await withTransaction(q => gravarAtalhos(q, userId, itens))
      return res.json({ ok: true, atalhos: itens })
    }

    if (req.method === 'DELETE') {
      const acaoId = queryParam(req, 'acao_id')
      if (acaoId) await query('DELETE FROM atalhos_usuario WHERE user_id = $1 AND acao_id = $2', [userId, acaoId])
      else await query('DELETE FROM atalhos_usuario WHERE user_id = $1', [userId])
      return res.json({ ok: true })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/atalhos]', err.message)
    res.status(500).json({ error: err.message })
  }
}
