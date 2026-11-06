import { query, parseBody, withTransaction } from '../_db.js'
import { requireAuth } from '../_auth.js'
import { exigirContaPermitida } from '../_permissoesApi.js'
import { pode } from '../../src/lib/permissoes.js'
import { fail, explicarErro } from '../_bem.js'
import { registrarBaixa, estornarBaixa, gravarAberturaDoFinanciamento } from '../_bemBaixas.js'
import { comAmbiente } from '../_ambiente.js'
import { comGuardaVirada } from '../_guardaVirada.js'

// POST /api/bem/baixas — parcela paga sem movimento em conta do Finup. A leitura vem em /api/bem/extrato.
//   { acao: 'registrar', bem_id, tipo, data, valor, parcela_id | schedule_id + ocorrencia, cota_numero,
//     favorecido, gerar_receita, categoria_id, descricao }
//   { acao: 'abertura', financing_id, parcelas, valor, data } — histórico de abertura do financiamento
//     (a do consórcio é gravada por cota, em PUT /api/consorcio)
//   { acao: 'estornar', baixa_id }
// Mesma regra do Patrimônio: precisa de permissão de edição e o bem tem de ser de um perfil permitido.
// Os agendamentos e o saldo do bem também estão no estado do app: a resposta traz os efeitos para espelhar.

async function registrar(req, res, b) {
  if (!b.bem_id) return fail(res, 400, 'bem_id é obrigatório')
  await exigirContaPermitida(query, req.user, b.bem_id)
  const [bem] = await query(
    `SELECT b.id, b.name, b.type, b.foi_vendido, EXISTS (SELECT 1 FROM consorcios c WHERE c.bem_id = b.id) AS consorcio
       FROM contas b WHERE b.id = $1`, [b.bem_id],
  )
  if (!bem || bem.type !== 'asset') return fail(res, 404, 'Bem não encontrado')
  const r = await withTransaction(q => registrarBaixa(q, bem, {
    tipo: b.tipo, data: b.data, valor: b.valor, parcelaId: b.parcela_id || null, scheduleId: b.schedule_id || null,
    ocorrencia: b.ocorrencia || null, cotaNumero: b.cota_numero, favorecido: b.favorecido, gerarReceita: b.gerar_receita === true,
    categoriaId: b.categoria_id || null, descricao: b.descricao,
  }))
  return res.json({ success: true, baixa_id: r.id, efeitos: r.efeitos })
}

async function abertura(req, res, b) {
  const [fin] = await query(`SELECT * FROM financing WHERE id = $1`, [b.financing_id])
  if (!fin) return fail(res, 404, 'Financiamento não encontrado')
  await exigirContaPermitida(query, req.user, fin.bem_id)
  const r = await withTransaction(q => gravarAberturaDoFinanciamento(q, fin, b))
  return res.json({ success: true, baixa_id: r.id, efeitos: r.efeitos })
}

async function estornar(req, res, b) {
  const [baixa] = await query(`SELECT * FROM bem_baixas WHERE id = $1 AND estornado_em IS NULL`, [b.baixa_id])
  if (!baixa) return fail(res, 404, 'Baixa não encontrada')
  await exigirContaPermitida(query, req.user, baixa.bem_id)
  const efeitos = await withTransaction(q => estornarBaixa(q, baixa))
  return res.json({ success: true, efeitos })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')
  if (!pode(req.user, 'patrimonio', 'editar')) return fail(res, 403, 'Sem permissão para Patrimônio')
  try {
    const b = await parseBody(req)
    if (b.acao === 'registrar') return await registrar(req, res, b)
    if (b.acao === 'abertura') return await abertura(req, res, b)
    if (b.acao === 'estornar') return await estornar(req, res, b)
    return fail(res, 400, 'Ação inválida')
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message)
    console.error('[api/bem/baixas]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(comGuardaVirada(handler))
