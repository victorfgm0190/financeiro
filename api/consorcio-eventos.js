import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { exigirContaPermitida } from './_permissoesApi.js'
import { pode } from '../src/lib/permissoes.js'
import { dadosDoExtrato, genId, num, round2, fail, explicarErro, isIsoDate } from './_bem.js'
import { extratoDoBem, resumoDoBem } from '../src/lib/extratoBem.js'
import { comAmbiente } from './_ambiente.js'
import { comGuardaVirada } from './_guardaVirada.js'

// POST /api/consorcio-eventos — eventos do consórcio, todos com estorno.
//   { acao: 'registrar', bem_id, tipo, data, dados, agendamentos }
//     contemplar { nova_parcela } · reajuste { nova_parcela } · usar_carta { valor_bem }
//     vender     { valor, conta_destino_id }
//   { acao: 'estornar', evento_id } — só o evento mais recente, para o que ele guardou continuar valendo.
// Os agendamentos são do estado do app (o sync os grava): o app muda e manda aqui a foto de antes.
// O saldo da conta corrente também é do app: a venda grava os lançamentos e devolve para ele espelhar.

const TIPOS = new Set(['contemplar', 'reajuste', 'vender', 'usar_carta'])

async function vender(q, { bem, consorcio, data, dados }) {
  const valor = round2(Number(dados.valor))
  if (!(valor > 0)) throw Object.assign(new Error('Informe o valor recebido'), { status: 400 })
  if (!dados.conta_destino_id) throw Object.assign(new Error('Escolha a conta que recebeu'), { status: 400 })
  const [destino] = await q(`SELECT id, type FROM contas WHERE id = $1`, [dados.conta_destino_id])
  if (!destino || ['asset', 'liability', 'credit'].includes(destino.type)) {
    throw Object.assign(new Error('Conta de destino inválida'), { status: 400 })
  }

  const bemExtrato = { id: bem.id, valor_nota_fiscal: num(bem.valor_nota_fiscal), categoria_prestacao_id: bem.categoria_prestacao_id, categoria_taxa_id: bem.categoria_taxa_finan_id }
  const extrato = await dadosDoExtrato(q, [bem.id])
  const resumo = resumoDoBem(bemExtrato, extratoDoBem(bemExtrato, extrato), extrato.parcelas)
  const ganho = round2(valor - resumo.custoProprioLiquido)
  const categoria = ganho >= 0 ? bem.categoria_ganho_bem_id : bem.categoria_perda_bem_id
  if (ganho !== 0 && !categoria) {
    throw Object.assign(new Error(`Parametrize a categoria de ${ganho > 0 ? 'ganho' : 'perda'} do bem antes de vender.`), { status: 400 })
  }

  const entradaId = genId('tx_venda')
  await q(
    `INSERT INTO lancamentos (id, type, account_id, to_account_id, amount, date, description, bem_id, origin, reconciled)
     VALUES ($1, 'transfer', $2, $3, $4, $5, $6, $2, 'venda_bem', FALSE)`,
    [entradaId, bem.id, destino.id, valor, data, `Venda - ${bem.name}`],
  )
  const lancamentos = [{ id: entradaId, type: 'transfer', accountId: bem.id, toAccountId: destino.id, amount: valor, date: data, description: `Venda - ${bem.name}`, bemId: bem.id, origin: 'venda_bem' }]
  if (ganho !== 0) {
    const id = genId('tx_venda')
    const tipo = ganho > 0 ? 'income' : 'expense'
    const descricao = `${ganho > 0 ? 'Ganho' : 'Perda'} na venda - ${bem.name}`
    await q(
      `INSERT INTO lancamentos (id, type, account_id, amount, date, description, category_id, bem_id, origin, reconciled)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, 'patrimonio_auto', FALSE)`,
      [id, tipo, Math.abs(ganho), data, descricao, categoria, bem.id],
    )
    lancamentos.push({ id, type: tipo, accountId: null, amount: Math.abs(ganho), date: data, description: descricao, categoryId: categoria, bemId: bem.id, origin: 'patrimonio_auto' })
  }
  await q(`UPDATE contas SET balance = 0, foi_vendido = TRUE, data_venda = $2 WHERE id = $1`, [bem.id, data])
  await q(`UPDATE consorcios SET situacao = 'vendida', updated_at = now() WHERE bem_id = $1`, [bem.id])
  return {
    dados: { ...dados, valor, custo_proprio: resumo.custoProprioLiquido, ganho },
    anterior: { saldo: num(bem.balance), situacao: consorcio.situacao, lancamentos: lancamentos.map(l => l.id) },
    efeitos: { lancamentos, saldo: 0 },
  }
}

async function registrar(req, res, b) {
  const { bem_id: bemId, tipo, data } = b
  const dados = b.dados || {}
  if (!bemId || !TIPOS.has(tipo)) return fail(res, 400, 'Evento inválido')
  if (!isIsoDate(data)) return fail(res, 400, 'Data inválida')
  await exigirContaPermitida(query, req.user, bemId)

  const [consorcio] = await query(`SELECT * FROM consorcios WHERE bem_id = $1`, [bemId])
  if (!consorcio) return fail(res, 404, 'Consórcio não encontrado')
  const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [bemId])
  if (consorcio.situacao === 'vendida') return fail(res, 409, 'Este consórcio já foi vendido')
  if ((tipo === 'contemplar' || tipo === 'reajuste') && !(Number(dados.nova_parcela) > 0)) return fail(res, 400, 'Informe a nova parcela')
  if (tipo === 'contemplar' && consorcio.situacao === 'contemplada') return fail(res, 409, 'Este consórcio já foi contemplado')
  if (tipo === 'usar_carta') {
    if (consorcio.situacao !== 'contemplada') return fail(res, 409, 'A carta só pode ser usada depois da contemplação')
    if (bem.tipo_bem !== 'consorcio') return fail(res, 409, 'A carta já foi usada')
    if (!(Number(dados.valor_bem) > 0)) return fail(res, 400, 'Informe o valor do bem comprado')
  }

  const resultado = await withTransaction(async (q) => {
    let efeitos = {}
    let dadosFinais = dados
    let anterior = { situacao: consorcio.situacao }
    if (tipo === 'contemplar') {
      await q(`UPDATE consorcios SET situacao = 'contemplada', updated_at = now() WHERE bem_id = $1`, [bemId])
    } else if (tipo === 'usar_carta') {
      anterior = { ...anterior, valor_nota_fiscal: bem.valor_nota_fiscal, patrimonio_use_method: bem.patrimonio_use_method, tipo_bem: bem.tipo_bem }
      // A partir daqui ele se comporta como bem comprado: valor do bem + financiamento pela administradora.
      await q(`UPDATE contas SET valor_nota_fiscal = $2, patrimonio_use_method = 'nota_fiscal', tipo_bem = 'bem_imobilizado' WHERE id = $1`, [bemId, Number(dados.valor_bem)])
      efeitos = { conta: { tipoBem: 'bem_imobilizado', valorNotaFiscal: Number(dados.valor_bem), patrimonioUseMethod: 'nota_fiscal' } }
    } else if (tipo === 'vender') {
      const v = await vender(q, { bem, consorcio, data, dados })
      efeitos = v.efeitos
      dadosFinais = v.dados
      anterior = v.anterior
    }
    anterior.agendamentos = Array.isArray(b.agendamentos) ? b.agendamentos : []
    const id = genId('cev')
    await q(
      `INSERT INTO consorcio_eventos (id, bem_id, tipo, data, dados, anterior) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, bemId, tipo, data, JSON.stringify(dadosFinais), JSON.stringify(anterior)],
    )
    return { id, efeitos, dados: dadosFinais }
  })
  return res.json({ success: true, evento_id: resultado.id, dados: resultado.dados, efeitos: resultado.efeitos })
}

async function estornar(req, res, b) {
  const [ev] = await query(`SELECT * FROM consorcio_eventos WHERE id = $1 AND estornado_em IS NULL`, [b.evento_id])
  if (!ev) return fail(res, 404, 'Evento não encontrado')
  await exigirContaPermitida(query, req.user, ev.bem_id)
  const [ultimo] = await query(
    `SELECT id FROM consorcio_eventos WHERE bem_id = $1 AND estornado_em IS NULL ORDER BY created_at DESC LIMIT 1`, [ev.bem_id],
  )
  if (ultimo?.id !== ev.id) return fail(res, 409, 'Estorne primeiro o evento mais recente')
  const ant = ev.anterior || {}
  if (ev.tipo === 'usar_carta') {
    const [fin] = await query(`SELECT id FROM financing WHERE bem_id = $1 AND status <> 'canceled' LIMIT 1`, [ev.bem_id])
    if (fin) return fail(res, 409, 'Este bem já tem financiamento. Cancele o financiamento antes de estornar.')
  }

  const efeitos = await withTransaction(async (q) => {
    const saida = { agendamentos: ant.agendamentos || [] }
    if (ev.tipo === 'vender') {
      const ids = ant.lancamentos || []
      await q(`DELETE FROM lancamentos WHERE id = ANY($1)`, [ids])
      await q(`UPDATE contas SET balance = $2, foi_vendido = FALSE, data_venda = NULL WHERE id = $1`, [ev.bem_id, num(ant.saldo)])
      saida.lancamentos = ids
      saida.saldo = num(ant.saldo)
    }
    if (ev.tipo === 'usar_carta') {
      await q(`UPDATE contas SET valor_nota_fiscal = $2, patrimonio_use_method = $3, tipo_bem = $4 WHERE id = $1`,
        [ev.bem_id, ant.valor_nota_fiscal ?? null, ant.patrimonio_use_method ?? null, ant.tipo_bem || 'consorcio'])
      saida.conta = {
        tipoBem: ant.tipo_bem || 'consorcio',
        valorNotaFiscal: ant.valor_nota_fiscal == null ? null : num(ant.valor_nota_fiscal),
        patrimonioUseMethod: ant.patrimonio_use_method || 'valor_pago',
      }
    }
    if (ant.situacao) await q(`UPDATE consorcios SET situacao = $2, updated_at = now() WHERE bem_id = $1`, [ev.bem_id, ant.situacao])
    await q(`UPDATE consorcio_eventos SET estornado_em = now() WHERE id = $1`, [ev.id])
    return saida
  })
  return res.json({ success: true, efeitos })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')
  if (!pode(req.user, 'patrimonio', 'editar')) return fail(res, 403, 'Sem permissão para Patrimônio')
  try {
    const b = await parseBody(req)
    if (b.acao === 'registrar') return await registrar(req, res, b)
    if (b.acao === 'estornar') return await estornar(req, res, b)
    return fail(res, 400, 'Ação inválida')
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message)
    console.error('[api/consorcio-eventos]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(comGuardaVirada(handler))
