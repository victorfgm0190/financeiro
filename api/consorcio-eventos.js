import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { exigirContaPermitida } from './_permissoesApi.js'
import { pode } from '../src/lib/permissoes.js'
import { dadosDoExtrato, genId, num, round2, fail, explicarErro, isIsoDate, criarLancamentoCategorizado } from './_bem.js'
import { custoEstimadoPorCota } from '../src/lib/consorcio.js'
import { LIMITE_ISENCAO_PEQUENO_VALOR, AVISO_ISENCAO } from '../src/lib/planoVendaConsorcio.js'
import { extratoDoBem, resumoDoBem } from '../src/lib/extratoBem.js'
import { comAmbiente } from './_ambiente.js'
import { comGuardaVirada } from './_guardaVirada.js'

// POST /api/consorcio-eventos — eventos do consórcio, todos com estorno.
//   { acao: 'registrar', bem_id, tipo, data, dados, agendamentos }
//     contemplar { nova_parcela } · reajuste { nova_parcela } · usar_carta { valor_bem }
//     vender     { valor, conta_destino_id }: o consórcio inteiro (as cotas que restam)
//     vender_cota { cota_numero, valor, conta_destino_id, comprador, custos_valor, custos_categoria_id,
//                   custo_cota, observacao, categoria_resultado_id }
//   { acao: 'previa_cota', bem_id, cota_numero, ... } — as contas da venda da cota, sem gravar.
//   { acao: 'estornar', evento_id } — só o evento mais recente, para o que ele guardou continuar valendo.
// Os agendamentos são do estado do app (o sync os grava): o app muda e manda aqui a foto de antes.
// O saldo da conta corrente também é do app: a venda grava os lançamentos e devolve para ele espelhar.

const TIPOS = new Set(['contemplar', 'reajuste', 'vender', 'usar_carta', 'vender_cota'])
const erro = (status, message) => Object.assign(new Error(message), { status })

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
  // O custo das cotas já vendidas saiu do bem na venda de cada uma.
  const [{ jaVendido }] = await q(`SELECT COALESCE(SUM(vendida_custo), 0) AS "jaVendido" FROM consorcio_cotas WHERE bem_id = $1`, [bem.id])
  const custoRestante = round2(resumo.custoProprioLiquido - num(jaVendido))
  const ganho = round2(valor - custoRestante)
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
    dados: { ...dados, valor, custo_proprio: custoRestante, ganho },
    anterior: { saldo: num(bem.balance), situacao: consorcio.situacao, lancamentos: lancamentos.map(l => l.id) },
    efeitos: { lancamentos, saldo: 0, conta: { foiVendido: true, dataVenda: data } },
  }
}

// As contas da venda da cota, iguais na prévia e na gravação.
async function contasDaCota(q, { bem, consorcio, dados, data }) {
  const cotas = (await q(`SELECT * FROM consorcio_cotas WHERE bem_id = $1 ORDER BY created_at, numero`, [bem.id]))
  const cota = cotas.find(c => c.numero === dados.cota_numero)
  if (!cota) throw erro(404, 'Cota não encontrada.')
  if (cota.vendida_em) throw erro(409, 'Esta cota já foi vendida.')
  const bemExtrato = { id: bem.id, valor_nota_fiscal: num(bem.valor_nota_fiscal), categoria_prestacao_id: bem.categoria_prestacao_id, categoria_taxa_id: bem.categoria_taxa_finan_id, valor_pago_manual: bem.valor_pago_manual == null ? null : num(bem.valor_pago_manual) }
  const extrato = await dadosDoExtrato(q, [bem.id])
  const resumo = resumoDoBem(bemExtrato, extratoDoBem(bemExtrato, extrato), extrato.parcelas)
  const estimado = custoEstimadoPorCota(cotas, resumo.pagoSemJuros, extrato.baixas || [])[cotas.indexOf(cota)]
  const informado = dados.custo_cota === '' || dados.custo_cota == null ? null : round2(Number(dados.custo_cota))
  const custo = informado ?? estimado
  const valor = round2(Number(dados.valor) || 0)
  const custos = round2(Number(dados.custos_valor) || 0)
  const mes = String(data || '').slice(0, 7)
  const vendasDoMes = round2(cotas.filter(c => c.vendida_em && String(c.vendida_em).slice(0, 7) === mes).reduce((s, c) => s + num(c.vendida_valor), 0))
  const [fn] = consorcio.funcao_reserva_id && dados.conta_destino_id
    ? await q(`SELECT id, name FROM reserve_functions WHERE id = $1 AND account_id = $2`, [consorcio.funcao_reserva_id, dados.conta_destino_id])
    : []
  return { cota, cotas, estimado, custo, valor, custos, resultado: round2(valor - custos - custo), vendasDoMes, funcao: fn || null }
}

const QUAL_BEM = async (bemId) => {
  const [consorcio] = await query(`SELECT * FROM consorcios WHERE bem_id = $1`, [bemId])
  if (!consorcio) throw erro(404, 'Consórcio não encontrado')
  const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [bemId])
  return { consorcio, bem }
}

async function previaCota(req, res, b) {
  if (!b.bem_id) return fail(res, 400, 'bem_id é obrigatório')
  await exigirContaPermitida(query, req.user, b.bem_id)
  if (b.conta_destino_id) await exigirContaPermitida(query, req.user, b.conta_destino_id)
  const { consorcio, bem } = await QUAL_BEM(b.bem_id)
  const c = await contasDaCota(query, { bem, consorcio, dados: b, data: b.data })
  const totalDoMes = round2(c.vendasDoMes + c.valor)
  return res.json({
    success: true,
    custo_estimado: c.estimado,
    custo: c.custo,
    resultado: c.resultado,
    vendas_do_mes: totalDoMes,
    aviso_isencao: totalDoMes > LIMITE_ISENCAO_PEQUENO_VALOR ? AVISO_ISENCAO : null,
    categorias: { ganho: bem.categoria_ganho_bem_id || null, perda: bem.categoria_perda_bem_id || null },
    funcao: c.funcao ? { id: c.funcao.id, nome: c.funcao.name } : null,
  })
}

async function venderCota(q, { bem, consorcio, data, dados, eventoId }) {
  const c = await contasDaCota(q, { bem, consorcio, dados, data })
  if (!(c.valor > 0)) throw erro(400, 'Informe o valor recebido.')
  if (!dados.conta_destino_id) throw erro(400, 'Escolha a conta que recebeu.')
  const [destino] = await q(`SELECT id, type FROM contas WHERE id = $1`, [dados.conta_destino_id])
  if (!destino || ['asset', 'liability', 'credit', 'gerencial'].includes(destino.type)) throw erro(400, 'Conta de destino inválida.')
  if (c.custo < 0) throw erro(400, 'Custo da cota inválido.')
  if (c.custos > 0 && !dados.custos_categoria_id) throw erro(400, 'Escolha a categoria dos custos da venda.')
  const categoria = dados.categoria_resultado_id || (c.resultado > 0 ? bem.categoria_ganho_bem_id : bem.categoria_perda_bem_id)
  if (c.resultado !== 0 && !categoria) throw erro(400, `Escolha a categoria de ${c.resultado > 0 ? 'ganho' : 'perda'} do bem antes de vender.`)

  const lancamentos = []
  const comprador = String(dados.comprador || '').trim() || null
  const observacao = String(dados.observacao || '').trim() || null
  const entradaId = genId('tx_venda')
  const descricao = `Venda da cota ${c.cota.numero} - ${bem.name}`
  await q(
    `INSERT INTO lancamentos (id, type, account_id, to_account_id, amount, date, description, bem_id, payee, notes, reserva_funcao_id, origin, reconciled)
     VALUES ($1, 'transfer', $2, $3, $4, $5, $6, $2, $7, $8, $9, 'venda_bem', FALSE)`,
    [entradaId, bem.id, destino.id, c.valor, data, descricao, comprador, observacao, c.funcao?.id || null],
  )
  lancamentos.push({ id: entradaId, type: 'transfer', accountId: bem.id, toAccountId: destino.id, amount: c.valor, date: data, description: descricao, bemId: bem.id, payee: comprador || '', notes: observacao || '', reservaFuncaoId: c.funcao?.id || null, origin: 'venda_bem' })
  if (c.custos > 0) {
    const desc = `Custos da venda da cota ${c.cota.numero} - ${bem.name}`
    const id = await criarLancamentoCategorizado(q, { categoriaId: dados.custos_categoria_id, valor: c.custos, descricao: desc, bemId: bem.id, data, tipo: 'expense', origin: 'venda_bem', accountId: destino.id })
    lancamentos.push({ id, type: 'expense', accountId: destino.id, amount: c.custos, date: data, description: desc, categoryId: dados.custos_categoria_id, bemId: bem.id, origin: 'venda_bem' })
  }
  if (c.resultado !== 0) {
    const tipo = c.resultado > 0 ? 'income' : 'expense'
    const desc = `${c.resultado > 0 ? 'Ganho' : 'Perda'} na venda da cota ${c.cota.numero} - ${bem.name}`
    const id = await criarLancamentoCategorizado(q, { categoriaId: categoria, valor: Math.abs(c.resultado), descricao: desc, bemId: bem.id, data, tipo, origin: 'patrimonio_auto', accountId: null })
    lancamentos.push({ id, type: tipo, accountId: null, amount: Math.abs(c.resultado), date: data, description: desc, categoryId: categoria, bemId: bem.id, origin: 'patrimonio_auto' })
  }
  await q(
    `UPDATE consorcio_cotas SET vendida_em = $3, vendida_valor = $4, vendida_custo = $5, vendida_evento_id = $6 WHERE bem_id = $1 AND numero = $2`,
    [bem.id, c.cota.numero, data, c.valor, c.custo, eventoId],
  )
  // Era a última cota: o consórcio foi vendido por inteiro, e o resíduo da estimativa não fica no bem.
  const ultima = c.cotas.every(x => x.numero === c.cota.numero || x.vendida_em)
  const saldo = ultima ? 0 : Math.max(0, round2(num(bem.balance) - c.custo))
  await q(`UPDATE contas SET balance = $2${ultima ? ', foi_vendido = TRUE, data_venda = $3' : ''} WHERE id = $1`, ultima ? [bem.id, saldo, data] : [bem.id, saldo])
  if (ultima) await q(`UPDATE consorcios SET situacao = 'vendida', updated_at = now() WHERE bem_id = $1`, [bem.id])
  return {
    dados: { cota_numero: c.cota.numero, valor: c.valor, conta_destino_id: destino.id, comprador, observacao, custos_valor: c.custos, custo_cota: c.custo, custo_estimado: c.estimado, ganho: c.resultado, funcao_id: c.funcao?.id || null },
    anterior: { saldo: num(bem.balance), situacao: consorcio.situacao, lancamentos: lancamentos.map(l => l.id), cota_numero: c.cota.numero, ultima },
    efeitos: { lancamentos, saldo, ...(ultima ? { conta: { foiVendido: true, dataVenda: data } } : {}) },
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

  if (dados.conta_destino_id) await exigirContaPermitida(query, req.user, dados.conta_destino_id)
  const resultado = await withTransaction(async (q) => {
    let efeitos = {}
    let dadosFinais = dados
    let anterior = { situacao: consorcio.situacao }
    const id = genId('cev')
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
    } else if (tipo === 'vender_cota') {
      const v = await venderCota(q, { bem, consorcio, data, dados, eventoId: id })
      efeitos = v.efeitos
      dadosFinais = v.dados
      anterior = v.anterior
    }
    anterior.agendamentos = Array.isArray(b.agendamentos) ? b.agendamentos : []
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
      saida.conta = { foiVendido: false, dataVenda: null }
    }
    if (ev.tipo === 'vender_cota') {
      const ids = ant.lancamentos || []
      await q(`DELETE FROM lancamentos WHERE id = ANY($1)`, [ids])
      await q(`UPDATE consorcio_cotas SET vendida_em = NULL, vendida_valor = NULL, vendida_custo = NULL, vendida_evento_id = NULL WHERE bem_id = $1 AND numero = $2`, [ev.bem_id, ant.cota_numero])
      await q(`UPDATE contas SET balance = $2${ant.ultima ? ', foi_vendido = FALSE, data_venda = NULL' : ''} WHERE id = $1`, [ev.bem_id, num(ant.saldo)])
      saida.lancamentos = ids
      saida.saldo = num(ant.saldo)
      if (ant.ultima) saida.conta = { foiVendido: false, dataVenda: null }
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
    if (b.acao === 'previa_cota') return await previaCota(req, res, b)
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
