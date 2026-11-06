import { query, parseBody } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import { exigirContaPermitida, exigirLinhasPermitidas } from '../../_permissoesApi.js'
import { pode } from '../../../src/lib/permissoes.js'
import { getRouteId, fail, explicarErro } from '../../_bem.js'
import { comAmbiente } from '../../_ambiente.js'
import { comGuardaVirada } from '../../_guardaVirada.js'

const PAPEIS = new Set(['terceiro', 'devolucao'])

// POST /api/bem/[id]/vincular-receita — liga uma receita ao bem e diz o que ela é, ou desliga.
//   { lancamento_id, papel: 'terceiro' | 'devolucao' | null }
// bem_papel não passa pelo sync (quem grava é só esta rota), então o estado do app não o apaga.
async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')
  if (!pode(req.user, 'patrimonio', 'editar')) return fail(res, 403, 'Sem permissão para Patrimônio')

  try {
    const bemId = getRouteId(req, 1)
    const body = await parseBody(req)
    const { lancamento_id: lancamentoId } = body
    const papel = body.papel ?? null
    if (!bemId || !lancamentoId) return fail(res, 400, 'bem e lancamento_id são obrigatórios')
    if (papel !== null && !PAPEIS.has(papel)) return fail(res, 400, 'papel inválido')

    await exigirContaPermitida(query, req.user, bemId)
    await exigirLinhasPermitidas(query, req.user, 'lancamentos', [lancamentoId])

    const [bem] = await query(`SELECT id FROM contas WHERE id = $1 AND type = 'asset'`, [bemId])
    if (!bem) return fail(res, 404, 'Bem não encontrado')
    const [tx] = await query(`SELECT id, type, account_id, bem_id FROM lancamentos WHERE id = $1`, [lancamentoId])
    if (!tx) return fail(res, 404, 'Lançamento não encontrado. Aguarde a sincronização e tente de novo.')
    if (tx.type !== 'income') return fail(res, 400, 'Só receitas podem ser ligadas por aqui')
    if (tx.bem_id && tx.bem_id !== bemId) return fail(res, 409, 'Esta receita já está ligada a outro bem')

    await query(`UPDATE lancamentos SET bem_id = $2, bem_papel = $3 WHERE id = $1`, [lancamentoId, papel ? bemId : null, papel])
    return res.json({ success: true, lancamento_id: lancamentoId, bem_id: papel ? bemId : null, bem_papel: papel })
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message)
    console.error('[api/bem/[id]/vincular-receita]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(comGuardaVirada(handler))
