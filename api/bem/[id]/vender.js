import { query, parseBody, withTransaction } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import { getRouteId, genId, num, round2, fail, explicarErro, isIsoDate, criarLancamentoCategorizado, registrarMovimentacao } from '../../_bem.js'
import { comAmbiente } from '../../_ambiente.js'
import { exigirContaPermitida } from '../../_permissoesApi.js'
import { comGuardaVirada } from '../../_guardaVirada.js'
import { saldoContabilDoBem, resultadoDaVenda } from '../../../src/lib/vendaBem.js'

// POST /api/bem/[id]/vender — venda de um bem por dinheiro, sem troca. Consórcio vende a cota por
// /api/consorcio-eventos; os lançamentos têm a mesma forma: entrada 'venda_bem' e resultado 'patrimonio_auto'.
//   { acao: 'previa', ... }     → as contas, sem gravar (saldo contábil, dívida, ganho ou perda)
//   { acao: 'consultar' }       → a venda que está valendo
//   { acao: 'confirmar', data, valor, conta_destino_id, comprador, custos_valor, custos_categoria_id,
//     observacao, categoria_resultado_id, quitar, valor_quitacao, agendamentos }
//   { acao: 'estornar' }        → desfaz tudo o que a venda criou
// Os agendamentos são do estado do app: o app os encerra e manda aqui a foto de antes, para o estorno.
// O saldo das contas correntes também é do app: a rota devolve os lançamentos para ele espelhar.

const erro = (status, message) => Object.assign(new Error(message), { status })

// Financiamento ainda aberto e o que falta amortizar (principal, como no resto do módulo).
async function dividaDoBem(q, bemId) {
  const [fin] = await q(`SELECT * FROM financing WHERE bem_id = $1 AND status NOT IN ('canceled', 'completed') ORDER BY created_at DESC LIMIT 1`, [bemId])
  if (!fin) return null
  const abertas = await q(`SELECT * FROM financing_installments WHERE financing_id = $1 AND status <> 'paid' ORDER BY numero_parcela`, [fin.id])
  if (!abertas.length) return null
  const saldoDevedor = round2(abertas.reduce((s, p) => s + num(p.principal_provisioned) - num(p.principal_pago), 0))
  return { fin, abertas, saldoDevedor, agendamentos: [...new Set(abertas.map(p => p.schedule_id).filter(Boolean))] }
}

async function contexto(q, bemId) {
  const [bem] = await q(`SELECT * FROM contas WHERE id = $1`, [bemId])
  if (!bem) throw erro(404, `bem ${bemId} não encontrado`)
  const [consorcio] = await q(`SELECT bem_id FROM consorcios WHERE bem_id = $1`, [bemId])
  if (consorcio) throw erro(409, 'Consórcio é vendido pela aba Consórcio, cota a cota.')
  return { bem, divida: await dividaDoBem(q, bemId), saldoContabil: saldoContabilDoBem(bem) }
}

function lerPedido(b, ctx) {
  const valor = round2(Number(b.valor))
  const custos = round2(Number(b.custos_valor) || 0)
  const quitar = !!b.quitar && !!ctx.divida
  const quitacao = quitar ? round2(b.valor_quitacao == null || b.valor_quitacao === '' ? ctx.divida.saldoDevedor : Number(b.valor_quitacao)) : 0
  return { valor, custos, quitar, quitacao, resultado: resultadoDaVenda({ valor, custos, saldoContabil: ctx.saldoContabil, quitacao }) }
}

const previa = (ctx, pedido) => ({
  saldo_contabil: ctx.saldoContabil,
  divida: ctx.divida ? { saldo_devedor: ctx.divida.saldoDevedor, parcelas_abertas: ctx.divida.abertas.length, agendamentos: ctx.divida.agendamentos } : null,
  resultado: pedido.resultado,
  categorias: { ganho: ctx.bem.categoria_ganho_bem_id || null, perda: ctx.bem.categoria_perda_bem_id || null },
})

async function validar(q, b, ctx, pedido) {
  if (ctx.bem.foi_vendido) throw erro(409, 'Este bem já foi vendido.')
  if (!isIsoDate(b.data)) throw erro(400, 'Informe a data da venda.')
  if (!(pedido.valor > 0)) throw erro(400, 'Informe o valor recebido.')
  if (!b.conta_destino_id) throw erro(400, 'Escolha a conta que recebeu.')
  const [destino] = await q(`SELECT id, type FROM contas WHERE id = $1`, [b.conta_destino_id])
  if (!destino || ['credit', 'asset', 'liability', 'gerencial'].includes(destino.type)) throw erro(400, 'Conta de destino inválida.')
  if (pedido.custos < 0) throw erro(400, 'Custos da venda inválidos.')
  if (pedido.custos > 0 && !b.custos_categoria_id) throw erro(400, 'Escolha a categoria dos custos da venda.')
  if (pedido.quitar && !(pedido.quitacao > 0)) throw erro(400, 'Informe o valor da quitação.')
  if (pedido.quitar && !ctx.bem.categoria_prestacao_id) throw erro(400, 'Parametrize a categoria de prestação do bem antes de quitar.')
  const categoria = b.categoria_resultado_id || (pedido.resultado > 0 ? ctx.bem.categoria_ganho_bem_id : ctx.bem.categoria_perda_bem_id)
  if (pedido.resultado !== 0 && !categoria) throw erro(400, `Escolha a categoria de ${pedido.resultado > 0 ? 'ganho' : 'perda'} do bem antes de vender.`)
  // O saldo contábil é o de hoje: pagamento depois da data deixaria o cálculo errado.
  const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM bem_movimentacoes WHERE bem_id = $1 AND left(data::text, 10) > $2`, [ctx.bem.id, b.data])
  if (n > 0) throw erro(409, 'Há movimentação deste bem depois desta data. Use uma data igual ou posterior à última movimentação.')
  return categoria
}

async function quitar(q, { ctx, data, valor, contaId, lancamentos, movimentacoes }) {
  const { bem, divida } = ctx
  const descricao = `Quitação do financiamento na venda - ${bem.name}`
  const id = await criarLancamentoCategorizado(q, { categoriaId: bem.categoria_prestacao_id, valor, descricao, bemId: bem.id, data, tipo: 'expense', origin: 'pagamento_divida', accountId: contaId })
  lancamentos.push({ id, type: 'expense', accountId: contaId, amount: valor, date: data, description: descricao, categoryId: bem.categoria_prestacao_id, bemId: bem.id, origin: 'pagamento_divida' })
  for (const p of divida.abertas) {
    const principal = num(p.principal_provisioned)
    const juros = num(p.juros_pago)
    await q(
      `UPDATE financing_installments SET principal_pago = $2, total_pago = $3, data_pagamento = $4, status = 'paid', saldo_restante = 0,
              desconto_antecipacao = $5 WHERE id = $1`,
      [p.id, principal, round2(principal + juros), data, round2(Math.max(0, num(p.juros_provisioned) - juros))],
    )
  }
  await q(`UPDATE financing SET status = 'completed' WHERE id = $1`, [divida.fin.id])
  let saldoDivida = null
  if (divida.fin.conta_divida_id) {
    const [d] = await q(`SELECT balance FROM contas WHERE id = $1`, [divida.fin.conta_divida_id])
    saldoDivida = num(d?.balance)
    await q(`UPDATE contas SET balance = 0 WHERE id = $1`, [divida.fin.conta_divida_id])
  }
  movimentacoes.push(await registrarMovimentacao(q, {
    bemId: bem.id, tipo: 'pagamento_parcela', data, descricao, valor, principal: divida.saldoDevedor, juros: 0, categoriaId: bem.categoria_prestacao_id, lancamentoId: id,
  }))
  return {
    financiamento: divida.fin.id,
    status: divida.fin.status,
    divida_id: divida.fin.conta_divida_id || null,
    saldo_divida: saldoDivida,
    parcelas: divida.abertas.map(p => ({
      id: p.id, principal_pago: p.principal_pago, total_pago: p.total_pago, data_pagamento: p.data_pagamento, status: p.status,
      saldo_restante: p.saldo_restante, desconto_antecipacao: p.desconto_antecipacao,
    })),
  }
}

async function confirmar(req, res, bemId, b) {
  const ctx = await contexto(query, bemId)
  const pedido = lerPedido(b, ctx)
  const categoria = await validar(query, b, ctx, pedido)
  await exigirContaPermitida(query, req.user, b.conta_destino_id)
  const { bem } = ctx
  const { data, conta_destino_id: contaId } = b

  const resultado = await withTransaction(async (q) => {
    const lancamentos = []
    const movimentacoes = []
    const comprador = String(b.comprador || '').trim() || null
    const observacao = String(b.observacao || '').trim() || null

    const entradaId = genId('tx_venda')
    const descricao = `Venda - ${bem.name}`
    await q(
      `INSERT INTO lancamentos (id, type, account_id, to_account_id, amount, date, description, bem_id, payee, notes, origin, reconciled)
       VALUES ($1, 'transfer', $2, $3, $4, $5, $6, $2, $7, $8, 'venda_bem', FALSE)`,
      [entradaId, bem.id, contaId, pedido.valor, data, descricao, comprador, observacao],
    )
    lancamentos.push({ id: entradaId, type: 'transfer', accountId: bem.id, toAccountId: contaId, amount: pedido.valor, date: data, description: descricao, bemId: bem.id, payee: comprador || '', notes: observacao || '', origin: 'venda_bem' })

    if (pedido.custos > 0) {
      const desc = `Custos da venda - ${bem.name}`
      const id = await criarLancamentoCategorizado(q, { categoriaId: b.custos_categoria_id, valor: pedido.custos, descricao: desc, bemId: bem.id, data, tipo: 'expense', origin: 'venda_bem', accountId: contaId })
      lancamentos.push({ id, type: 'expense', accountId: contaId, amount: pedido.custos, date: data, description: desc, categoryId: b.custos_categoria_id, bemId: bem.id, origin: 'venda_bem' })
    }

    const quitacao = pedido.quitar ? await quitar(q, { ctx, data, valor: pedido.quitacao, contaId, lancamentos, movimentacoes }) : null

    let resultadoId = null
    if (pedido.resultado !== 0) {
      const tipo = pedido.resultado > 0 ? 'income' : 'expense'
      const desc = `${pedido.resultado > 0 ? 'Ganho' : 'Perda'} na venda - ${bem.name}`
      resultadoId = await criarLancamentoCategorizado(q, { categoriaId: categoria, valor: Math.abs(pedido.resultado), descricao: desc, bemId: bem.id, data, tipo, origin: 'patrimonio_auto', accountId: null })
      lancamentos.push({ id: resultadoId, type: tipo, accountId: null, amount: Math.abs(pedido.resultado), date: data, description: desc, categoryId: categoria, bemId: bem.id, origin: 'patrimonio_auto' })
    }

    movimentacoes.push(await registrarMovimentacao(q, {
      bemId: bem.id, tipo: 'venda', data, descricao, bemOrigemId: bem.id, valor: pedido.valor, perdaGanho: pedido.resultado, categoriaId: categoria || null, lancamentoId: resultadoId,
    }))
    await q(`UPDATE contas SET balance = 0, foi_vendido = TRUE, data_venda = $2 WHERE id = $1`, [bem.id, data])

    const dados = {
      valor: pedido.valor, conta_destino_id: contaId, comprador, observacao, custos_valor: pedido.custos, custos_categoria_id: b.custos_categoria_id || null,
      saldo_contabil: ctx.saldoContabil, quitacao: pedido.quitacao, resultado: pedido.resultado, divida_aberta: ctx.divida && !pedido.quitar ? ctx.divida.saldoDevedor : 0,
    }
    const anterior = {
      saldo: num(bem.balance),
      lancamentos: lancamentos.map(l => l.id),
      movimentacoes,
      quitacao,
      agendamentos: Array.isArray(b.agendamentos) ? b.agendamentos : [],
    }
    const id = genId('venda')
    await q(`INSERT INTO bem_vendas (id, bem_id, data, dados, anterior, criado_por) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [id, bem.id, data, JSON.stringify(dados), JSON.stringify(anterior), req.user?.username || req.user?.sub || null])
    return { id, dados, lancamentos }
  })
  const divida = ctx.divida && pedido.quitar && ctx.divida.fin.conta_divida_id ? { id: ctx.divida.fin.conta_divida_id, saldo: 0 } : null
  return res.json({
    success: true, venda: { id: resultado.id, data, ...resultado.dados },
    efeitos: { lancamentos: resultado.lancamentos, saldo: 0, conta: { foiVendido: true, dataVenda: data }, divida },
  })
}

async function estornar(res, bemId) {
  const [venda] = await query(`SELECT * FROM bem_vendas WHERE bem_id = $1 AND estornado_em IS NULL`, [bemId])
  if (!venda) return fail(res, 404, 'Este bem não tem venda para estornar.')
  const ant = venda.anterior || {}
  await withTransaction(async (q) => {
    const ids = ant.lancamentos || []
    if (ids.length) await q(`DELETE FROM lancamentos WHERE id = ANY($1)`, [ids])
    if ((ant.movimentacoes || []).length) await q(`DELETE FROM bem_movimentacoes WHERE id = ANY($1)`, [ant.movimentacoes])
    await q(`UPDATE contas SET balance = $2, foi_vendido = FALSE, data_venda = NULL WHERE id = $1`, [bemId, num(ant.saldo)])
    const qt = ant.quitacao
    if (qt) {
      for (const p of qt.parcelas || []) {
        await q(
          `UPDATE financing_installments SET principal_pago = $2, total_pago = $3, data_pagamento = $4, status = $5, saldo_restante = $6, desconto_antecipacao = $7 WHERE id = $1`,
          [p.id, p.principal_pago, p.total_pago, p.data_pagamento, p.status, p.saldo_restante, p.desconto_antecipacao],
        )
      }
      await q(`UPDATE financing SET status = $2 WHERE id = $1`, [qt.financiamento, qt.status])
      if (qt.divida_id) await q(`UPDATE contas SET balance = $2 WHERE id = $1`, [qt.divida_id, num(qt.saldo_divida)])
    }
    await q(`UPDATE bem_vendas SET estornado_em = now() WHERE id = $1`, [venda.id])
  })
  return res.json({
    success: true,
    efeitos: {
      lancamentos: ant.lancamentos || [], saldo: num(ant.saldo), conta: { foiVendido: false, dataVenda: null },
      divida: ant.quitacao?.divida_id ? { id: ant.quitacao.divida_id, saldo: num(ant.quitacao.saldo_divida) } : null,
      agendamentos: ant.agendamentos || [],
    },
  })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')
  try {
    const b = await parseBody(req)
    const bemId = getRouteId(req, 1) || b.bem_id
    if (!bemId) return fail(res, 400, 'bem_id é obrigatório')
    await exigirContaPermitida(query, req.user, bemId)
    if (b.acao === 'consultar') {
      const [venda] = await query(`SELECT id, data, dados FROM bem_vendas WHERE bem_id = $1 AND estornado_em IS NULL`, [bemId])
      return res.json({ success: true, venda: venda ? { id: venda.id, data: venda.data, ...venda.dados } : null })
    }
    if (b.acao === 'previa') {
      const ctx = await contexto(query, bemId)
      return res.json({ success: true, ...previa(ctx, lerPedido(b, ctx)) })
    }
    if (b.acao === 'confirmar') return await confirmar(req, res, bemId, b)
    if (b.acao === 'estornar') return await estornar(res, bemId)
    return fail(res, 400, 'Ação desconhecida')
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message)
    console.error('[api/bem/[id]/vender]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

export default comAmbiente(comGuardaVirada(handler))
