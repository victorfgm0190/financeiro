import { query } from '../_db.js'
import { requireAuth } from '../_auth.js'
import { contextoPerfis } from '../_permissoesApi.js'
import { SELECT_PARCELAS, serializarParcela, num, fail, explicarErro } from '../_bem.js'
import { comAmbiente } from '../_ambiente.js'

// GET /api/bem/extrato[?bem_id=] — os dados brutos do Extrato do bem (src/lib/extratoBem.js): bens,
// lançamentos, trocas e parcelas. Só leitura. Quem classifica é a lib, para a Visão Bem e a Visão Caixa
// saírem do mesmo cálculo. Com perfis restritos, só os bens dos perfis permitidos.
async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    const url = new URL(req.url, 'http://x')
    const bemId = req.query?.bem_id || url.searchParams.get('bem_id') || null

    const ctx = await contextoPerfis(query, req.user)
    const linhasBens = await query(
      `SELECT id, name, profile_id, valor_nota_fiscal, categoria_prestacao_id, categoria_taxa_finan_id
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
      valor_nota_fiscal: num(b.valor_nota_fiscal),
      categoria_prestacao_id: b.categoria_prestacao_id ?? null,
      categoria_taxa_id: b.categoria_taxa_finan_id ?? null,
    }))
    if (ids.length === 0) return res.json({ success: true, bens: [], lancamentos: [], trocas: [], parcelas: [] })

    const lancamentos = await query(
      `SELECT l.id, l.type, l.date, l.amount, l.account_id, l.to_account_id, l.bem_id, l.category_id,
              l.description, l.payee, l.origin, l.reserva_auto, o.type AS origem_tipo, d.type AS destino_tipo
         FROM lancamentos l
         LEFT JOIN contas o ON o.id = l.account_id
         LEFT JOIN contas d ON d.id = l.to_account_id
        WHERE (l.bem_id = ANY($1) OR l.to_account_id = ANY($1) OR l.account_id = ANY($1))
          AND COALESCE(l.reserva_auto, false) = false
        ORDER BY l.date, l.created_at`,
      [ids],
    )
    const trocas = await query(
      `SELECT id, bem_id, valor, descricao, to_char(data::date, 'YYYY-MM-DD') AS data
         FROM bem_movimentacoes
        WHERE tipo = 'entrada_trade_in' AND bem_id = ANY($1)`,
      [ids],
    )
    const financiamentos = await query(`SELECT id, bem_id FROM financing WHERE bem_id = ANY($1)`, [ids])
    const bemDoFinanciamento = new Map(financiamentos.map(f => [f.id, f.bem_id]))
    const parcelas = financiamentos.length === 0 ? [] : await query(
      `${SELECT_PARCELAS} WHERE financing_id = ANY($1) ORDER BY numero_parcela`,
      [financiamentos.map(f => f.id)],
    )

    return res.json({
      success: true,
      bens,
      lancamentos: lancamentos.map(l => ({ ...l, amount: num(l.amount) })),
      trocas: trocas.map(t => ({ ...t, valor: num(t.valor) })),
      parcelas: parcelas.map(p => ({ ...serializarParcela(p), bem_id: bemDoFinanciamento.get(p.financing_id) })),
    })
  } catch (err) {
    console.error('[api/bem/extrato]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(handler)
