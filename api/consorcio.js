import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { contextoPerfis, exigirContaPermitida } from './_permissoesApi.js'
import { pode } from '../src/lib/permissoes.js'
import { num, fail, explicarErro, isIsoDate } from './_bem.js'
import { gravarAberturaDaCota, estornarAberturasOrfas } from './_bemBaixas.js'
import { comAmbiente } from './_ambiente.js'

// GET /api/consorcio            → todos os consórcios permitidos, com as cotas.
// GET /api/consorcio?bem_id=    → um consórcio (ou null), com cotas e eventos.
// PUT /api/consorcio            → cadastra ou edita. Converte um bem existente sem tocar nos lançamentos:
//                                 só contas.tipo_bem muda; entradas e vínculos ficam como estão.
// PATCH /api/consorcio          → plano de venda: { bem_id, funcao_reserva_id, cotas: [{ numero, plano_mes,
//                                 plano_valor, vendida_em, vendida_valor }] }. Só previsão: nada de lançamento.

const COLS_COTA = ['valor_carta', 'percentual_parcela', 'valor_parcela_cheia', 'saldo_devedor_informado', 'valor_pago_informado', 'plano_valor', 'vendida_valor']
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
  // Histórico de abertura de cada cota, para o cadastro mostrar e o prazo considerar.
  const aberturas = ids.length ? await query(
    `SELECT bem_id, cota_numero, quantidade_parcelas, valor, data FROM bem_baixas WHERE bem_id = ANY($1) AND tipo = 'abertura' AND estornado_em IS NULL`, [ids],
  ) : []
  const comAbertura = (c) => {
    const a = aberturas.find(x => x.bem_id === c.bem_id && x.cota_numero === c.numero)
    return { ...c, abertura_parcelas: a ? num(a.quantidade_parcelas) : null, abertura_valor: a ? num(a.valor) : null, abertura_data: a?.data ?? null }
  }
  const consorcios = permitidos.map(c => ({ ...c, cotas: cotas.filter(x => x.bem_id === c.bem_id).map(cotaParaApi).map(comAbertura) }))
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
  for (const d of [b.data_adesao, ...cotas.flatMap(c => [c.data_adesao, c.saldo_devedor_data, c.previsao_encerramento, c.data_ultima_parcela, c.abertura_data])]) {
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
    // Editar o cadastro recria as cotas: o plano de venda de cada uma continua, pelo número.
    const planos = new Map((await q(`SELECT numero, plano_mes, plano_valor, vendida_em, vendida_valor FROM consorcio_cotas WHERE bem_id = $1`, [bemId])).map(p => [p.numero, p]))
    await q(`DELETE FROM consorcio_cotas WHERE bem_id = $1`, [bemId])
    for (const c of cotas) {
      await q(
        `INSERT INTO consorcio_cotas (bem_id, numero, data_adesao, valor_carta, prazo_meses, percentual_parcela, valor_parcela_cheia,
           saldo_devedor_informado, saldo_devedor_data, parcelas_pagas_informadas, valor_pago_informado,
           previsao_encerramento, data_ultima_parcela, plano_mes, plano_valor, vendida_em, vendida_valor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [bemId, textoOuNull(c.numero), textoOuNull(c.data_adesao), Number(c.valor_carta), numeroOuNull(c.prazo_meses), Number(c.percentual_parcela),
          numeroOuNull(c.valor_parcela_cheia) ?? 0, numeroOuNull(c.saldo_devedor_informado), textoOuNull(c.saldo_devedor_data),
          numeroOuNull(c.parcelas_pagas_informadas), numeroOuNull(c.valor_pago_informado),
          textoOuNull(c.previsao_encerramento), textoOuNull(c.data_ultima_parcela),
          planos.get(textoOuNull(c.numero))?.plano_mes ?? null, planos.get(textoOuNull(c.numero))?.plano_valor ?? null,
          planos.get(textoOuNull(c.numero))?.vendida_em ?? null, planos.get(textoOuNull(c.numero))?.vendida_valor ?? null],
      )
    }
    await estornarAberturasOrfas(q, bemId, cotas.map(c => textoOuNull(c.numero)))
    for (const c of cotas) await gravarAberturaDaCota(q, bemId, c)
    await q(`UPDATE contas SET tipo_bem = 'consorcio' WHERE id = $1`, [bemId])
  })
  return res.json({ success: true, bem_id: bemId, tipo_bem: 'consorcio', situacao })
}

async function salvarPlano(req, res) {
  if (!pode(req.user, 'patrimonio', 'editar')) return fail(res, 403, 'Sem permissão para Patrimônio')
  const b = await parseBody(req)
  if (!b.bem_id) return fail(res, 400, 'bem_id é obrigatório')
  await exigirContaPermitida(query, req.user, b.bem_id)
  const [cons] = await query(`SELECT bem_id FROM consorcios WHERE bem_id = $1`, [b.bem_id])
  if (!cons) return fail(res, 404, 'Consórcio não encontrado')
  const cotas = Array.isArray(b.cotas) ? b.cotas : []
  for (const c of cotas) {
    if (textoOuNull(c.plano_mes) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(c.plano_mes)) return fail(res, 400, 'Mês previsto inválido')
    if (textoOuNull(c.vendida_em) && !isIsoDate(c.vendida_em)) return fail(res, 400, 'Data da venda inválida')
    if (numeroOuNull(c.plano_valor) != null && Number(c.plano_valor) < 0) return fail(res, 400, 'Valor de venda inválido')
  }
  const funcaoId = textoOuNull(b.funcao_reserva_id)
  if (funcaoId) {
    const [fn] = await query(`SELECT account_id FROM reserve_functions WHERE id = $1`, [funcaoId])
    if (!fn) return fail(res, 400, 'Função de reserva não encontrada')
    await exigirContaPermitida(query, req.user, fn.account_id)
  }
  await withTransaction(async (q) => {
    await q(`UPDATE consorcios SET funcao_reserva_id = $2, updated_at = now() WHERE bem_id = $1`, [b.bem_id, funcaoId])
    for (const c of cotas) {
      await q(
        `UPDATE consorcio_cotas SET plano_mes = $3, plano_valor = $4, vendida_em = $5, vendida_valor = $6 WHERE bem_id = $1 AND numero = $2`,
        [b.bem_id, c.numero, textoOuNull(c.plano_mes), numeroOuNull(c.plano_valor), textoOuNull(c.vendida_em), numeroOuNull(c.vendida_valor)],
      )
    }
  })
  return res.json({ success: true })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') return await listar(req, res)
    if (req.method === 'PUT') return await salvar(req, res)
    if (req.method === 'PATCH') return await salvarPlano(req, res)
    return fail(res, 405, 'Método não permitido')
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message)
    console.error('[api/consorcio]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(handler)
