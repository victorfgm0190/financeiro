import { createHash } from 'node:crypto'
import { query } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'

// GET /api/last-change — assinatura leve do estado do banco, para o app saber se vale recarregar ao
// voltar para a aba/app. Nenhum registro sai daqui: só um hash de MAX(updated_at) + COUNT(*) das
// tabelas que o /api/load traz. A contagem pega as exclusões (que não mexem no MAX); o updated_at é
// mantido por trigger que ignora UPDATE sem mudança (supabase/migrations/2026-10-25_updated_at.sql).
//
// Só o hash: usuário restrito a alguns perfis não fica sabendo quantas linhas os outros perfis têm
// (no máximo recarrega à toa quando outro perfil muda).
export const TABELAS_ASSINATURA = [
  'contas', 'cartoes', 'lancamentos', 'agendamentos', 'categorias', 'orcamento',
  'regras_classificacao', 'reservas_funcoes', 'reservas', 'favorecidos', 'configuracoes',
  'envelopes', 'grupos_conta', 'perfis', 'card_imports', 'gerencial_rules', 'reserve_functions',
  'lancamento_rateios', 'schedule_reserva_funcoes', 'favorecido_alias', 'tipos_documento',
]

const SQL = TABELAS_ASSINATURA
  .map(t => `SELECT '${t}' AS t, MAX(updated_at) AS m, COUNT(*)::int AS n FROM ${t}`)
  .join('\nUNION ALL\n')

export function assinar(linhas) {
  const texto = linhas
    .map(r => `${r.t}:${r.m ? new Date(r.m).toISOString() : '-'}:${r.n}`)
    .sort()
    .join('|')
  return createHash('sha256').update(texto).digest('hex').slice(0, 32)
}

// Também chamada pelo /api/load (antes dos SELECTs): a carga já volta com a assinatura de referência.
export const lerAssinatura = async (q = query) => assinar(await q(SQL))

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    res.json({ assinatura: await lerAssinatura() })
  } catch (err) {
    console.error('[api/last-change]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
