import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { contextoPerfis, exigirContaPermitida } from './_permissoesApi.js'
import { pode } from '../src/lib/permissoes.js'
import { num, fail, explicarErro, isIsoDate } from './_bem.js'
import { comAmbiente } from './_ambiente.js'

// GET /api/consorcio            → todos os consórcios permitidos, com as cotas.
// GET /api/consorcio?bem_id=    → um consórcio (ou null), com cotas e eventos.
// PUT /api/consorcio            → cadastra ou edita. Converte um bem existente sem tocar nos lançamentos:
//                                 só contas.tipo_bem muda; entradas e vínculos ficam como estão.

const COLS_COTA = ['valor_carta', 'percentual_parcela', 'valor_parcela_cheia', 'saldo_devedor_informado', 'valor_pago_informado']
const cotaParaApi = (c) => ({
  ...c,
  ...Object.fromEntries(COLS_COTA.map(k => [k, c[k] == null ? null : num(c[k])])),
  prazo_meses: c.prazo_meses == null ? null : num(c.prazo_meses),
  parcelas_pagas_informadas: c.parcelas_pagas_informadas == null ? null : num(c.parcelas_pagas_informadas),
})
const numeroOuNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const textoOuNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

async function listar(req, res) {
  const url = new URL(req.url, 'http://x')
  const bemId = req.query?.bem_id || url.searchParams.get('bem_id') || null
  const ctx = await contextoPerfis(query, req.user)
  if (ctx && bemId && !ctx.contas.has(bemId)) return fail(res, 403, 'Sem permissão para este bem')
  const linhas = await query(
    `SELECT c.*, b.name AS bem_nome, b.tipo_bem
       FROM consorcios c JOIN contas b ON b.id = c.bem_id
      WHERE ($1::text IS NULL OR c.bem_id = $1)
      ORDER BY b.name`,
    [bemId],
  )
  const permitidos = ctx ? linhas.filter(c => ctx.contas.has(c.bem_id)) : linhas
  const ids = permitidos.map(c => c.bem_id)
  const cotas = ids.length ? await query(`SELECT * FROM consorcio_cotas WHERE bem_id = ANY($1) ORDER BY created_at, numero`, [ids]) : []
  const consorcios = permitidos.map(c => ({ ...c, cotas: cotas.filter(x => x.bem_id === c.bem_id).map(cotaParaApi) }))
  if (!bemId) return res.json({ success: true, consorcios })
  if (!consorcios[0]) return res.json({ success: true, consorcio: null })
  const eventos = await query(`SELECT * FROM consorcio_eventos WHERE bem_id = $1 ORDER BY created_at DESC`, [bemId])
  return res.json({ success: true, consorcio: { ...consorcios[0], eventos } })
}

async function salvar(req, res) {
  if (!pode(req.user, 'patrimonio', 'editar')) return fail(res, 403, 'Sem permissão para Patrimônio')
  const b = await parseBody(req)
  const bemId = b.bem_id
  if (!bemId) return fail(res, 400, 'bem_id é obrigatório')
  await exigirContaPermitida(query, req.user, bemId)
  const cotas = Array.isArray(b.cotas) ? b.cotas : []
  if (cotas.length === 0) return fail(res, 400, 'Informe ao menos uma cota')
  if (cotas.some(c => !textoOuNull(c.numero))) return fail(res, 400, 'Toda cota precisa de número')
  if (cotas.some(c => !(Number(c.valor_carta) > 0))) return fail(res, 400, 'Toda cota precisa do valor da carta de crédito')
  if (cotas.some(c => !(Number(c.percentual_parcela) > 0))) return fail(res, 400, 'Informe o % da parcela paga de cada cota')
  for (const d of [b.data_adesao, ...cotas.map(c => c.saldo_devedor_data)]) {
    if (textoOuNull(d) && !isIsoDate(d)) return fail(res, 400, 'Data inválida')
  }

  const [bem] = await query(`SELECT id, type, tipo_bem FROM contas WHERE id = $1`, [bemId])
  if (!bem || bem.type !== 'asset') return fail(res, 404, 'Bem não encontrado')
  const [atual] = await query(`SELECT situacao FROM consorcios WHERE bem_id = $1`, [bemId])
  if (!atual) {
    const [fin] = await query(`SELECT id FROM financing WHERE bem_id = $1 AND status <> 'canceled' LIMIT 1`, [bemId])
    if (fin) return fail(res, 409, 'Este bem tem financiamento: não pode virar consórcio.')
  }
  // Quitar é escolha do cadastro; contemplar e vender são eventos, com estorno.
  const situacao = atual?.situacao === 'quitada' || atual?.situacao === 'ativa' || !atual
    ? (b.quitada ? 'quitada' : 'ativa')
    : atual.situacao

  await withTransaction(async (q) => {
    await q(
      `INSERT INTO consorcios (bem_id, administradora, grupo, data_adesao, indice_reajuste, conta_origem_id, situacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (bem_id) DO UPDATE SET administradora = $2, grupo = $3, data_adesao = $4,
         indice_reajuste = $5, conta_origem_id = $6, situacao = $7, updated_at = now()`,
      [bemId, textoOuNull(b.administradora), textoOuNull(b.grupo), textoOuNull(b.data_adesao),
        textoOuNull(b.indice_reajuste), textoOuNull(b.conta_origem_id), situacao],
    )
    await q(`DELETE FROM consorcio_cotas WHERE bem_id = $1`, [bemId])
    for (const c of cotas) {
      await q(
        `INSERT INTO consorcio_cotas (bem_id, numero, valor_carta, prazo_meses, percentual_parcela, valor_parcela_cheia,
           saldo_devedor_informado, saldo_devedor_data, parcelas_pagas_informadas, valor_pago_informado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [bemId, textoOuNull(c.numero), Number(c.valor_carta), numeroOuNull(c.prazo_meses), Number(c.percentual_parcela),
          numeroOuNull(c.valor_parcela_cheia) ?? 0, numeroOuNull(c.saldo_devedor_informado), textoOuNull(c.saldo_devedor_data),
          numeroOuNull(c.parcelas_pagas_informadas), numeroOuNull(c.valor_pago_informado)],
      )
    }
    await q(`UPDATE contas SET tipo_bem = 'consorcio' WHERE id = $1`, [bemId])
  })
  return res.json({ success: true, bem_id: bemId, tipo_bem: 'consorcio', situacao })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') return await listar(req, res)
    if (req.method === 'PUT') return await salvar(req, res)
    return fail(res, 405, 'Método não permitido')
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message)
    console.error('[api/consorcio]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(handler)
