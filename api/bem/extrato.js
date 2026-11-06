import { query } from '../_db.js'
import { requireAuth } from '../_auth.js'
import { contextoPerfis } from '../_permissoesApi.js'
import { dadosDoExtrato, num, fail, explicarErro } from '../_bem.js'
import { comAmbiente } from '../_ambiente.js'

// GET /api/bem/extrato[?bem_id=] — os dados brutos do Extrato do bem (src/lib/extratoBem.js): bens,
// lançamentos, trocas, parcelas e cotas de consórcio. Só leitura. Quem classifica é a lib, para a Visão
// Bem e a Visão Caixa saírem do mesmo cálculo. Com perfis restritos, só os bens dos perfis permitidos.
async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    const url = new URL(req.url, 'http://x')
    const bemId = req.query?.bem_id || url.searchParams.get('bem_id') || null

    const ctx = await contextoPerfis(query, req.user)
    const linhasBens = await query(
      `SELECT id, name, profile_id, tipo_bem, valor_nota_fiscal, valor_pago_manual, categoria_prestacao_id, categoria_taxa_finan_id
         FROM contas
        WHERE type = 'asset' AND ($1::text IS NULL OR id = $1)
        ORDER BY name`,
      [bemId],
    )
    const permitidos = ctx ? linhasBens.filter(b => ctx.contas.has(b.id)) : linhasBens
    const ids = permitidos.map(b => b.id)
    const bens = permitidos.map(b => ({
      id: b.id,
      nome: b.name,
      perfil_id: b.profile_id ?? null,
      tipo_bem: b.tipo_bem ?? null,
      valor_nota_fiscal: num(b.valor_nota_fiscal),
      valor_pago_manual: b.valor_pago_manual == null ? null : num(b.valor_pago_manual),
      categoria_prestacao_id: b.categoria_prestacao_id ?? null,
      categoria_taxa_id: b.categoria_taxa_finan_id ?? null,
    }))
    const cotas = ids.length === 0 ? [] : await query(
      `SELECT bem_id, valor_carta, saldo_devedor_informado FROM consorcio_cotas WHERE bem_id = ANY($1)`, [ids],
    )

    return res.json({ success: true, bens, cotas, ...(await dadosDoExtrato(query, ids)) })
  } catch (err) {
    console.error('[api/bem/extrato]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(handler)
