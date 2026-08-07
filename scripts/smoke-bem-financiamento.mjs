// Smoke test end-to-end dos 8 endpoints de Bem Imobilizado / Financiamento.
// Chama os handlers direto (sem subir HTTP), grava no banco real e LIMPA tudo no final.
//
// Uso:
//   node --env-file=.env.local scripts/smoke-bem-financiamento.mjs
//   node --env-file=.env.local scripts/smoke-bem-financiamento.mjs --keep   (não limpa, p/ inspeção)

import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret'
const TOKEN = jwt.sign({ sub: 'smoke' }, process.env.JWT_SECRET, { expiresIn: '10m' })
const KEEP = process.argv.includes('--keep')

const { query } = await import('../api/_db.js')
const criarBem = (await import('../api/bem/criar.js')).default
const getBem = (await import('../api/bem/[id].js')).default
const registrarEntrada = (await import('../api/bem/[id]/registrar-entrada.js')).default
const estornarEntrada = (await import('../api/bem/[id]/estornar-entrada.js')).default
const atualizarValores = (await import('../api/bem/[id]/atualizar-valores.js')).default
const movimentacoes = (await import('../api/bem/[id]/movimentacoes.js')).default
const criarFin = (await import('../api/financiamento/criar.js')).default
const getFin = (await import('../api/financiamento/[id].js')).default
const listarParcelas = (await import('../api/financiamento/[id]/parcelas.js')).default
const pagarParcela = (await import('../api/financiamento/parcela/[id]/pagar.js')).default

let falhas = 0
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  ok   ${label}`)
  else { falhas++; console.log(`  FAIL ${label}${extra ? ' → ' + extra : ''}`) }
}
const eq = (label, got, want) => ok(label, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

function fakeReq(method, url, body, query = {}) {
  return { method, url, body, query, headers: { authorization: `Bearer ${TOKEN}` } }
}
function fakeRes() {
  const r = { statusCode: 200, payload: null }
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (p) => { r.payload = p; return r }
  r.end = () => r
  return r
}
async function call(handler, method, url, body, q) {
  const res = fakeRes()
  await handler(fakeReq(method, url, body, q), res)
  return { status: res.statusCode, body: res.payload }
}

const criados = { contas: [], categorias: [], lancamentos: [], financing: [] }

async function criarCategoria(id, name, type) {
  await query(
    `INSERT INTO categorias (id, name, type) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [id, name, type],
  )
  criados.categorias.push(id)
  return id
}

async function limpar() {
  // Um passo que falhou no meio deixa ids undefined na lista — filtra antes de mandar pro ANY().
  for (const k of Object.keys(criados)) criados[k] = criados[k].filter(Boolean)
  for (const finId of criados.financing) {
    await query(
      `DELETE FROM agendamentos WHERE financing_installment_id IN
         (SELECT id FROM financing_installments WHERE financing_id = $1)`, [finId])
    await query(`DELETE FROM financing_installments WHERE financing_id = $1`, [finId])
    await query(`DELETE FROM financing WHERE id = $1`, [finId])
  }
  for (const contaId of criados.contas) {
    await query(`DELETE FROM bem_movimentacoes WHERE bem_id = $1 OR bem_origem_id = $1`, [contaId])
    await query(`DELETE FROM lancamentos WHERE bem_id = $1`, [contaId])
  }
  if (criados.lancamentos.length) {
    await query(`DELETE FROM lancamentos WHERE id = ANY($1)`, [criados.lancamentos])
  }
  if (criados.contas.length) {
    await query(`DELETE FROM contas WHERE id = ANY($1)`, [criados.contas])
  }
  if (criados.categorias.length) {
    await query(`DELETE FROM categorias WHERE id = ANY($1)`, [criados.categorias])
  }
}

async function main() {
  const sufixo = Date.now().toString(36)
  const cats = {
    perda: await criarCategoria(`cat_smoke_perda_${sufixo}`, 'Perda de Venda de Bem', 'expense'),
    ganho: await criarCategoria(`cat_smoke_ganho_${sufixo}`, 'Ganho de Venda de Bem', 'income'),
    prestacao: await criarCategoria(`cat_smoke_prest_${sufixo}`, 'Prestação do Automóvel', 'expense'),
    taxa: await criarCategoria(`cat_smoke_taxa_${sufixo}`, 'Taxa de Financiamento', 'expense'),
  }
  const payloadCats = {
    categoria_perda_bem_id: cats.perda,
    categoria_ganho_bem_id: cats.ganho,
    categoria_prestacao_id: cats.prestacao,
    categoria_taxa_finan_id: cats.taxa,
  }

  console.log('\n1) POST /api/bem/criar (bem antigo — HB20)')
  let r = await call(criarBem, 'POST', '/api/bem/criar', {
    nome: `[SMOKE] HB20S ${sufixo}`, valor_nota_fiscal: 80000, ...payloadCats,
  })
  eq('status 200', r.status, 200)
  ok('success', r.body?.success === true, JSON.stringify(r.body))
  const bemAntigoId = r.body?.bem?.id
  criados.contas.push(bemAntigoId)
  // O bem antigo já vinha com saldo igual à nota fiscal antes do trade-in.
  await query(`UPDATE contas SET balance = 80000 WHERE id = $1`, [bemAntigoId])

  console.log('\n1b) POST /api/bem/criar (bem novo — TIGGO)')
  r = await call(criarBem, 'POST', '/api/bem/criar', {
    nome: `[SMOKE] TIGGO 5X PRO ${sufixo}`, valor_nota_fiscal: 120000,
    descricao: 'Veículo adquirido em agosto/2026', ...payloadCats,
  })
  eq('status 200', r.status, 200)
  const bemId = r.body?.bem?.id
  criados.contas.push(bemId)
  eq('valor_nota_fiscal', r.body?.bem?.valor_nota_fiscal, 120000)
  eq('saldo inicial', r.body?.bem?.saldo, 0)
  eq('tipo', r.body?.bem?.tipo, 'bem_imobilizado')

  console.log('\n1c) validações de erro')
  r = await call(criarBem, 'POST', '/api/bem/criar', { nome: 'x', valor_nota_fiscal: 0, ...payloadCats })
  eq('valor_nota_fiscal <= 0 → 400', r.status, 400)
  r = await call(criarBem, 'POST', '/api/bem/criar', { nome: 'x', valor_nota_fiscal: 10, categoria_perda_bem_id: 'cat_nao_existe' })
  eq('categorias faltando → 400', r.status, 400)
  r = await call(criarBem, 'GET', '/api/bem/criar', {})
  eq('GET em rota POST → 405', r.status, 405)

  console.log('\n2) GET /api/bem/[id]')
  r = await call(getBem, 'GET', `/api/bem/${bemId}`, null, { id: bemId })
  eq('status 200', r.status, 200)
  eq('nome da categoria resolvido', r.body?.bem?.categorias?.prestacao?.nome, 'Prestação do Automóvel')
  eq('sem financiamento ainda', r.body?.bem?.financiamento, null)
  eq('foi_vendido false', r.body?.bem?.foi_vendido, false)
  r = await call(getBem, 'GET', '/api/bem/acc_inexistente', null, { id: 'acc_inexistente' })
  eq('bem inexistente → 404', r.status, 404)

  console.log('\n3) POST /api/bem/[id]/registrar-entrada')
  const txId = `tx_smoke_${sufixo}`
  await query(
    `INSERT INTO lancamentos (id, type, amount, date, description, origin)
     VALUES ($1, 'transfer', 15000, '2026-08-15', '[SMOKE] Entrada Nubank', 'manual')`, [txId])
  criados.lancamentos.push(txId)

  r = await call(registrarEntrada, 'POST', `/api/bem/${bemId}/registrar-entrada`, {
    data: '2026-08-15',
    transferencias: [
      { transferencia_id: txId, valor: 15000, categoria_id: cats.prestacao, descricao: 'Entrada Nubank' },
      { bem_origem_id: bemAntigoId, valor: 45000, descricao: 'Trade-in HB20' },
    ],
  }, { id: bemId })
  eq('status 200', r.status, 200)
  eq('entrada_total', r.body?.entrada_total, 60000)
  eq('saldo do bem', r.body?.bem?.saldo, 60000)
  const antigo = r.body?.bem_antigo
  eq('perda_ganho (45000 − 80000)', antigo?.perda_ganho, -35000)
  eq('perda', antigo?.perda, 35000)
  eq('saldo_reducido (bem liquidado → 0)', antigo?.saldo_reducido, 0)
  eq('foi_vendido', antigo?.foi_vendido, true)
  ok('movimentacao_id gerado', !!antigo?.movimentacao_id)

  const [txVinc] = await query(`SELECT bem_id, category_id FROM lancamentos WHERE id = $1`, [txId])
  eq('transferência vinculada ao bem', txVinc?.bem_id, bemId)
  const [antigoDb] = await query(
    `SELECT foi_vendido, bem_destino_id, balance FROM contas WHERE id = $1`, [bemAntigoId])
  eq('bem antigo aponta para o novo', antigoDb?.bem_destino_id, bemId)
  eq('bem antigo vendido', antigoDb?.foi_vendido, true)
  eq('saldo do bem antigo zerado no banco', Number(antigoDb?.balance), 0)

  r = await call(registrarEntrada, 'POST', `/api/bem/${bemId}/registrar-entrada`, {
    transferencias: [{ bem_origem_id: bemAntigoId, valor: 100 }],
  }, { id: bemId })
  eq('trade-in de bem já vendido → 400', r.status, 400)

  console.log('\n4) POST /api/financiamento/criar')
  const [contaCorrente] = await query(
    `SELECT id FROM contas WHERE type NOT IN ('credit','asset','liability') LIMIT 1`)
  r = await call(criarFin, 'POST', '/api/financiamento/criar', {
    bem_id: bemId, valor_principal: 60000, num_parcelas: 60, valor_parcela: 1342.33,
    banco: 'Safra', data_primeira_parcela: '2026-09-15',
    conta_origem_id: contaCorrente?.id,
  })
  eq('status 200', r.status, 200)
  ok('success', r.body?.success === true, JSON.stringify(r.body))
  const fin = r.body?.financiamento
  const finId = fin?.id
  criados.financing.push(finId)
  criados.contas.push(fin?.conta_divida_id)
  eq('juros_totais', fin?.juros_totais, 20539.8)
  eq('valor_total', fin?.valor_total, 80539.8)
  eq('principal_por_parcela', fin?.principal_por_parcela, 1000)
  eq('parcelas criadas', fin?.parcelas_criadas, 60)
  eq('agendamentos criados', fin?.agendamentos_criados, 60)

  // A conta de dívida precisa sair inteira na resposta: o frontend usa esses campos para pôr a
  // conta no estado React na hora, sem esperar o próximo full-load.
  const contaDivida = r.body?.conta_divida
  eq('conta de dívida: id bate com o do financiamento', contaDivida?.id, fin?.conta_divida_id)
  eq('conta de dívida: nome', contaDivida?.name, `Contas a Pagar - Fin. [SMOKE] TIGGO 5X PRO ${sufixo}`)
  // 'liability' é o tipo que AccountForm rotula "Dívida / Passivo" e que o PatrimonioPanel
  // agrupa em Dívidas. Não existe type 'debt' neste app — procurar por ele acha zero linhas.
  eq('conta de dívida: type', contaDivida?.type, 'liability')
  eq('conta de dívida: saldo = −valor_total', contaDivida?.balance, -80539.8)

  const [dividaDb] = await query(
    `SELECT name, type, balance, initial_balance FROM contas WHERE id = $1`, [contaDivida?.id])
  ok('conta de dívida existe no banco', !!dividaDb, 'nenhuma linha em contas')
  eq('type no banco', dividaDb?.type, 'liability')
  eq('saldo no banco', Number(dividaDb?.balance), -80539.8)
  eq('saldo inicial no banco', Number(dividaDb?.initial_balance), -80539.8)

  const [{ n: nAgend }] = await query(
    `SELECT COUNT(*)::int AS n FROM agendamentos WHERE financing_installment_id IN
       (SELECT id FROM financing_installments WHERE financing_id = $1)`, [finId])
  eq('60 agendamentos no banco', nAgend, 60)
  const [ag] = await query(
    `SELECT transaction_type, frequency, auto_register, account_id, to_account_id,
            start_date, amount, description
       FROM agendamentos WHERE financing_installment_id IN
       (SELECT id FROM financing_installments WHERE financing_id = $1 AND numero_parcela = 1)`, [finId])
  eq('agendamento é transferência', ag?.transaction_type, 'transfer')
  eq('frequency once', ag?.frequency, 'once')
  eq('auto_register desligado', ag?.auto_register, false)
  eq('destino = conta de dívida', ag?.to_account_id, fin?.conta_divida_id)
  eq('1º vencimento', String(ag?.start_date).slice(0, 10), '2026-09-15')
  const [ultAg] = await query(
    `SELECT start_date FROM agendamentos WHERE financing_installment_id IN
       (SELECT id FROM financing_installments WHERE financing_id = $1 AND numero_parcela = 60)`, [finId])
  eq('60º vencimento', String(ultAg?.start_date).slice(0, 10), '2031-08-15')
  const [divida] = await query(`SELECT type, balance FROM contas WHERE id = $1`, [fin?.conta_divida_id])
  eq('conta de dívida é liability', divida?.type, 'liability')
  eq('saldo devedor inicial', Number(divida?.balance), -80539.8)

  r = await call(criarFin, 'POST', '/api/financiamento/criar', {
    bem_id: bemId, valor_principal: 100, num_parcelas: 2, valor_parcela: 60,
    data_primeira_parcela: '2026-09-15',
  })
  eq('financiamento duplicado → 400', r.status, 400)

  console.log('\n5) GET /api/financiamento/[id]')
  r = await call(getFin, 'GET', `/api/financiamento/${finId}`, null, { id: finId })
  eq('status 200', r.status, 200)
  eq('60 parcelas', r.body?.financiamento?.parcelas?.length, 60)
  eq('provisão principal', r.body?.financiamento?.provisao?.principal, 60000)
  eq('realizado zerado', r.body?.financiamento?.realizado?.total, 0)
  eq('total_restante', r.body?.financiamento?.analise?.total_restante, 80539.8)
  eq('status open', r.body?.financiamento?.status, 'open')

  console.log('\n6) GET /api/financiamento/[id]/parcelas')
  r = await call(listarParcelas, 'GET', `/api/financiamento/${finId}/parcelas?page=1&limit=20`,
    null, { id: finId, page: '1', limit: '20' })
  eq('status 200', r.status, 200)
  eq('total_parcelas', r.body?.total_parcelas, 60)
  eq('página com 20', r.body?.parcelas?.length, 20)
  eq('total_pages', r.body?.total_pages, 3)
  eq('1ª da página 1', r.body?.parcelas?.[0]?.numero, 1)
  r = await call(listarParcelas, 'GET', `/api/financiamento/${finId}/parcelas?page=3&limit=20`,
    null, { id: finId, page: '3', limit: '20' })
  eq('1ª da página 3', r.body?.parcelas?.[0]?.numero, 41)

  console.log('\n7) POST /api/financiamento/parcela/[id]/pagar (parcial → total)')
  const [p1] = await query(
    `SELECT id FROM financing_installments WHERE financing_id = $1 AND numero_parcela = 1`, [finId])
  r = await call(pagarParcela, 'POST', `/api/financiamento/parcela/${p1.id}/pagar`, {
    valor_pago: 1000, data_pagamento: '2026-09-15', conta_origem_id: contaCorrente?.id,
  }, { id: p1.id })
  eq('status 200', r.status, 200)
  eq('status parcial', r.body?.parcela?.status, 'partial')
  eq('principal pago', r.body?.parcela?.principal_pago, 1000)
  eq('juros pagos', r.body?.parcela?.juros_pago, 0)
  eq('desvio de juros', r.body?.parcela?.desvio_juros, 342.33)
  eq('1 lançamento (só prestação)', r.body?.lancamentos_criados?.length, 1)
  eq('categoria do lançamento', r.body?.lancamentos_criados?.[0]?.categoria_nome, 'Prestação do Automóvel')
  eq('saldo do bem', r.body?.saldos_atualizados?.bem?.saldo_novo, 61000)
  eq('saldo da dívida', r.body?.saldos_atualizados?.divida?.saldo_novo, -79539.8)
  eq('financiamento parcial', r.body?.financiamento?.status, 'partial')

  r = await call(pagarParcela, 'POST', `/api/financiamento/parcela/${p1.id}/pagar`, {
    valor_pago: 342.33, data_pagamento: '2026-09-20',
  }, { id: p1.id })
  eq('status 200', r.status, 200)
  eq('status paid', r.body?.parcela?.status, 'paid')
  eq('principal acumulado', r.body?.parcela?.principal_pago, 1000)
  eq('juros acumulados', r.body?.parcela?.juros_pago, 342.33)
  eq('desvio zerado', r.body?.parcela?.desvio_juros, 0)
  eq('1 lançamento (só juros)', r.body?.lancamentos_criados?.length, 1)
  eq('categoria do 2º lançamento', r.body?.lancamentos_criados?.[0]?.categoria_nome, 'Taxa de Financiamento')
  eq('saldo do bem', r.body?.saldos_atualizados?.bem?.saldo_novo, 61342.33)

  const [agPaga] = await query(
    `SELECT registered FROM agendamentos WHERE financing_installment_id = $1`, [p1.id])
  ok('agendamento marcado como registrado', JSON.stringify(agPaga?.registered || []).includes('2026-09-15'),
    JSON.stringify(agPaga?.registered))

  r = await call(pagarParcela, 'POST', `/api/financiamento/parcela/${p1.id}/pagar`,
    { valor_pago: 10 }, { id: p1.id })
  eq('pagar parcela já quitada → 400', r.status, 400)
  r = await call(pagarParcela, 'POST', `/api/financiamento/parcela/${p1.id}/pagar`,
    { valor_pago: -5 }, { id: p1.id })
  eq('valor negativo → 400', r.status, 400)

  const [{ soma }] = await query(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS soma FROM lancamentos
      WHERE bem_id = $1 AND origin = 'pagamento_divida'`, [bemId])
  eq('Σ lançamentos do pagamento', Math.round(soma * 100) / 100, 1342.33)

  console.log('\n5b) GET /api/financiamento/[id] após pagamento')
  r = await call(getFin, 'GET', `/api/financiamento/${finId}`, null, { id: finId })
  eq('realizado principal', r.body?.financiamento?.realizado?.principal, 1000)
  eq('realizado juros', r.body?.financiamento?.realizado?.juros, 342.33)
  eq('principal restante', r.body?.financiamento?.analise?.principal_restante, 59000)
  eq('desvio de juros acumulado', r.body?.financiamento?.analise?.desvio_juros, 0)

  console.log('\n8) GET /api/bem/[id]/movimentacoes')
  r = await call(movimentacoes, 'GET', `/api/bem/${bemId}/movimentacoes`, null, { id: bemId })
  eq('status 200', r.status, 200)
  const movs = r.body?.movimentacoes || []
  eq('3 movimentações', movs.length, 3)
  const tipos = movs.map(m => m.tipo).sort()
  eq('tipos', JSON.stringify(tipos), JSON.stringify(['entrada_trade_in', 'entrada_venda', 'pagamento_parcela']))
  const tradeIn = movs.find(m => m.tipo === 'entrada_trade_in')
  eq('trade-in: perda_ganho', tradeIn?.perda_ganho, -35000)
  eq('trade-in: bem de origem', tradeIn?.bem_origem, `[SMOKE] HB20S ${sufixo}`)
  const pag = movs.find(m => m.tipo === 'pagamento_parcela')
  eq('pagamento: parcela 1/60', `${pag?.numero_parcela}/${pag?.num_parcelas}`, '1/60')
  eq('pagamento: categoria de juros', pag?.categoria_juros, 'Taxa de Financiamento')
  eq('trade-in: saldo do bem antigo antes', tradeIn?.saldo_origem_anterior, 80000)

  console.log('\n9) POST /api/bem/[id]/estornar-entrada')
  r = await call(estornarEntrada, 'POST', `/api/bem/${bemId}/estornar-entrada`, {}, { id: bemId })
  eq('com financiamento e sem confirmar → 409', r.status, 409)

  const [saldoAntesEstorno] = await query(`SELECT balance FROM contas WHERE id = $1`, [bemId])
  r = await call(estornarEntrada, 'POST', `/api/bem/${bemId}/estornar-entrada`,
    { confirmar_com_financiamento: true }, { id: bemId })
  eq('status 200', r.status, 200)
  // Só o trade-in volta do saldo do bem: a transferência nunca somou lá (ela creditou a conta
  // quando foi criada), então o estorno também não pode tirá-la.
  eq('saldo do bem', r.body?.bem?.saldo, Number(saldoAntesEstorno.balance) - 45000)
  eq('trade-in revertido', r.body?.trade_in_revertido, 45000)
  eq('1 transferência desvinculada', r.body?.transferencias_desvinculadas?.length, 1)
  eq('1 lançamento de perda apagado', r.body?.lancamentos_removidos?.length, 1)
  eq('valor da perda apagada', r.body?.lancamentos_removidos?.[0]?.valor, 35000)
  eq('1 bem restaurado', r.body?.bens_restaurados?.length, 1)
  eq('saldo restaurado', r.body?.bens_restaurados?.[0]?.saldo, 80000)
  eq('saldo não é estimativa', r.body?.bens_restaurados?.[0]?.saldo_estimado, false)

  const [antigoRestaurado] = await query(
    `SELECT balance, foi_vendido, bem_destino_id, data_venda FROM contas WHERE id = $1`, [bemAntigoId])
  eq('bem antigo: saldo no banco', Number(antigoRestaurado?.balance), 80000)
  eq('bem antigo: não vendido', antigoRestaurado?.foi_vendido, false)
  eq('bem antigo: sem destino', antigoRestaurado?.bem_destino_id, null)
  eq('bem antigo: sem data de venda', antigoRestaurado?.data_venda, null)

  // A transferência é uma movimentação bancária real: sai o vínculo, o lançamento fica.
  const [txSolta] = await query(`SELECT bem_id FROM lancamentos WHERE id = $1`, [txId])
  ok('transferência preservada', !!txSolta, 'lançamento foi apagado indevidamente')
  eq('transferência desvinculada', txSolta?.bem_id, null)

  const [{ n: perdasVivas }] = await query(
    `SELECT COUNT(*)::int AS n FROM lancamentos WHERE bem_id = $1 AND origin = 'patrimonio_auto'`,
    [bemId])
  eq('nenhuma perda/ganho remanescente', perdasVivas, 0)

  r = await call(movimentacoes, 'GET', `/api/bem/${bemId}/movimentacoes`, null, { id: bemId })
  const movsDepois = r.body?.movimentacoes || []
  eq('sobrou só o pagamento de parcela', movsDepois.length, 1)
  eq('tipo remanescente', movsDepois[0]?.tipo, 'pagamento_parcela')

  r = await call(estornarEntrada, 'POST', `/api/bem/${bemId}/estornar-entrada`,
    { confirmar_com_financiamento: true }, { id: bemId })
  eq('estornar duas vezes → 400', r.status, 400)

  // Refazer depois do estorno tem que funcionar — é o ciclo inteiro que o usuário faz.
  console.log('\n9b) refazer a entrada após o estorno')
  r = await call(registrarEntrada, 'POST', `/api/bem/${bemId}/registrar-entrada`, {
    data: '2026-08-15',
    transferencias: [
      { transferencia_id: txId, valor: 15000, categoria_id: cats.prestacao, descricao: 'Entrada Nubank' },
      { bem_origem_id: bemAntigoId, valor: 60000, descricao: 'Trade-in HB20 refeito' },
    ],
  }, { id: bemId })
  eq('status 200', r.status, 200)
  eq('perda recalculada (60000 − 80000)', r.body?.bem_antigo?.perda_ganho, -20000)
  eq('bem antigo zerado de novo', r.body?.bem_antigo?.saldo_reducido, 0)

  console.log('\n10) POST /api/bem/[id]/atualizar-valores')
  // Bem "de papel": nunca entrou em movimentação nenhuma, é o caso do Gabriel Tanios — saldo
  // zero e os dois valores só existem se alguém digitar.
  r = await call(criarBem, 'POST', '/api/bem/criar', {
    nome: `[SMOKE] GABRIEL TANIOS ${sufixo}`, valor_nota_fiscal: 1, ...payloadCats,
  })
  const bemLivreId = r.body?.bem?.id
  criados.contas.push(bemLivreId)
  eq('método padrão é valor_pago', r.body?.bem?.patrimonio_use_method, 'valor_pago')
  eq('valor_pago_manual nasce vazio', r.body?.bem?.valor_pago_manual, null)

  r = await call(atualizarValores, 'POST', `/api/bem/${bemLivreId}/atualizar-valores`, {
    valor_nota_fiscal: 500000, valor_pago_manual: 300000, patrimonio_use_method: 'nota_fiscal',
  }, { id: bemLivreId })
  eq('status 200', r.status, 200)
  eq('nota fiscal gravada', r.body?.valores?.valor_nota_fiscal, 500000)
  eq('valor pago gravado', r.body?.valores?.valor_pago_manual, 300000)
  eq('método gravado', r.body?.valores?.patrimonio_use_method, 'nota_fiscal')
  eq('bem serializado acompanha', r.body?.bem?.valor_pago_manual, 300000)

  const [livreDb] = await query(
    `SELECT valor_nota_fiscal, valor_pago_manual, patrimonio_use_method FROM contas WHERE id = $1`,
    [bemLivreId])
  eq('NF no banco', Number(livreDb?.valor_nota_fiscal), 500000)
  eq('valor pago no banco', Number(livreDb?.valor_pago_manual), 300000)
  eq('método no banco', livreDb?.patrimonio_use_method, 'nota_fiscal')

  // null explícito limpa; campo ausente não é tocado. COALESCE não distinguiria os dois.
  r = await call(atualizarValores, 'POST', `/api/bem/${bemLivreId}/atualizar-valores`,
    { valor_pago_manual: null }, { id: bemLivreId })
  eq('status 200', r.status, 200)
  eq('valor pago limpo', r.body?.valores?.valor_pago_manual, null)
  eq('NF preservada (campo ausente)', r.body?.valores?.valor_nota_fiscal, 500000)
  eq('método preservado (campo ausente)', r.body?.valores?.patrimonio_use_method, 'nota_fiscal')

  r = await call(atualizarValores, 'POST', `/api/bem/${bemLivreId}/atualizar-valores`, {}, { id: bemLivreId })
  eq('payload vazio → 400', r.status, 400)
  r = await call(atualizarValores, 'POST', `/api/bem/${bemLivreId}/atualizar-valores`,
    { valor_nota_fiscal: -1 }, { id: bemLivreId })
  eq('valor negativo → 400', r.status, 400)
  r = await call(atualizarValores, 'POST', `/api/bem/${bemLivreId}/atualizar-valores`,
    { patrimonio_use_method: 'chute' }, { id: bemLivreId })
  eq('método inválido → 400', r.status, 400)
  r = await call(atualizarValores, 'POST', '/api/bem/acc_inexistente/atualizar-valores',
    { patrimonio_use_method: 'valor_pago' }, { id: 'acc_inexistente' })
  eq('bem inexistente → 404', r.status, 404)

  console.log('\n10b) trava dos bens com histórico')
  // TIGGO é destino de movimentações; HB20S é origem do trade-in. Os dois travam.
  for (const [rotulo, id] of [['bem com movimentações', bemId], ['bem dado em trade-in', bemAntigoId]]) {
    r = await call(atualizarValores, 'POST', `/api/bem/${id}/atualizar-valores`,
      { valor_nota_fiscal: 999 }, { id })
    eq(`${rotulo}: editar valor → 409`, r.status, 409)
  }
  const [tiggoIntacto] = await query(`SELECT valor_nota_fiscal FROM contas WHERE id = $1`, [bemId])
  eq('NF do TIGGO intacta após o 409', Number(tiggoIntacto?.valor_nota_fiscal), 120000)

  // O método continua liberado mesmo com histórico: escolher qual valor o Patrimônio lê não
  // reescreve nada.
  r = await call(atualizarValores, 'POST', `/api/bem/${bemId}/atualizar-valores`,
    { patrimonio_use_method: 'nota_fiscal' }, { id: bemId })
  eq('bem com movimentações: trocar método → 200', r.status, 200)
  eq('método trocado', r.body?.valores?.patrimonio_use_method, 'nota_fiscal')
}

try {
  await main()
} catch (err) {
  falhas++
  console.error('\nERRO NÃO TRATADO:', err)
} finally {
  if (KEEP) console.log('\n--keep: dados de teste MANTIDOS no banco.')
  else { await limpar(); console.log('\nDados de teste removidos.') }
  console.log(falhas === 0 ? '\n✅ SMOKE TEST OK — todos os 8 endpoints validados.' : `\n❌ ${falhas} FALHA(S).`)
  process.exit(falhas === 0 ? 0 : 1)
}
