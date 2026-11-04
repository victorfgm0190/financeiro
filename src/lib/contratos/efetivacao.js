// GANCHO DE EFETIVAÇÃO (P5) — decisões puras de posEfetivacaoContrato / reverterEfetivacaoContrato.
// Quem aplica é o useContratos; aqui só "o que fazer" com a parcela que acabou de ser paga (ou
// estornada), para os 5 pontos de efetivação do app usarem a MESMA regra.
import { r2 } from './parcelas.js'
import { itensDoCredito } from './creditos.js'

const soma = (itens, f = () => true) => r2((itens || []).filter(f).reduce((a, i) => a + (Number(i.valor) || 0), 0))

// → { lancamento, compensar, perguntarReajuste, pedirComposicao, estimar }
//   lancamento: campos a gravar no lançamento (contratoId, composicao); compensar: ids de créditos
//   abatidos neste aluguel; perguntarReajuste: parcela projetada paga (vale como confirmação);
//   pedirComposicao/estimar: condomínio (com tela / sem tela, ex.: auto-registro).
export function planejarPosEfetivacao({ contrato, parcela, tx, auto = false }) {
  const nada = { lancamento: null, compensar: [], perguntarReajuste: null, pedirComposicao: false, estimar: false }
  if (!contrato || !parcela || !tx) return nada
  const papel = parcela.contratoPapel || 'aluguel'
  const pago = r2(tx.amount)

  if (papel === 'condominio') {
    return { ...nada, lancamento: { contratoId: contrato.id }, pedirComposicao: !auto, estimar: auto }
  }
  if (papel !== 'aluguel') return { ...nada, lancamento: { contratoId: contrato.id } }

  const c = parcela.composicao || { itens: [], total: r2(parcela.amount) }
  const itens = [...(c.itens || [])]
  const previsto = r2(c.total ?? parcela.amount)
  if (Math.abs(pago - previsto) > 0.005) itens.push({ tipo: 'ajuste', desc: 'Diferença no pagamento', valor: r2(pago - previsto) })
  const composicao = { ...c, tipo: 'aluguel', itens, total: pago }
  const compensar = [...new Set((c.itens || []).filter(i => i.tipo === 'credito' && i.credito_id).map(i => i.credito_id))]
  let perguntarReajuste = null
  if (parcela.valorStatus === 'projetado') {
    // Base que o pagamento confirma: o valor pago sem os itens que não são a base (bonificação,
    // créditos) — ex.: pagou 4.100 com bonificação −200 → base 4.300.
    const base = r2(pago - soma(c.itens, i => i.tipo !== 'base'))
    perguntarReajuste = { parcelaId: parcela.id, base, baseProjetada: r2(c.base ?? previsto), ciclo: c.ciclo ?? null }
  }
  return { ...nada, lancamento: { contratoId: contrato.id, composicao }, compensar, perguntarReajuste }
}

// Pagamento a menor (D4): previsto = itens da composição sem o ajuste ("Diferença no pagamento");
// sem composição, o valor esperado da parcela. → { previsto, pago, diferenca } (> 0 = pagou menos).
export function diferencaDoPagamento(tx, esperado = null) {
  const c = tx?.composicao
  const pago = r2(tx?.amount)
  const temItens = c?.itens?.length && c.tipo !== 'condominio'
  const previsto = temItens ? soma(c.itens, i => i.tipo !== 'ajuste') : r2(esperado ?? pago)
  return { previsto, pago, diferenca: r2(previsto - pago) }
}

// Valor esperado de uma linha PAGA da ficha (decide o botão "Justificar diferença" e alimenta o modal):
//   série vinculada de aluguel: o plano do contrato para a competência (base e desconto temporário) —
//     a série pode ter guardado o valor já descontado e esconderia a diferença;
//   parcela gerada (e série sem plano na competência): o previsto da baixa; sem ele, o da parcela —
//     ali o previsto pode já incluir créditos, e o plano criaria diferença falsa.
//   plano: gerarPlanoParcelas do contrato.
export function esperadoDoPagamento(linha, plano = null) {
  if (linha.vinculada && linha.papel === 'aluguel') {
    const p = (plano || []).find(x => x.papel === 'aluguel' && x.competencia === linha.competencia)
    if (p) return r2(p.valor)
  }
  return linha.meta?.valor_previsto ?? (linha.schedule ? r2(linha.schedule.composicao?.total ?? linha.schedule.amount) : null)
}

// "Justificar diferença": créditos ligados (abertos escolhidos + o manual criado já compensado)
// explicam quanto se pagou a menos. A soma não passa da diferença; o que sobra continua como
// "Diferença no pagamento". O VALOR do lançamento não muda — só a composição.
//   ligados: [{ id, valor, descricao, itens, origem_lancamento_id }]
// → { ok, erro?, composicao, diferenca, justificado, restante }
export function planejarJustificativa({ tx, esperado = null, ligados = [] }) {
  const { previsto, pago, diferenca } = diferencaDoPagamento(tx, esperado)
  if (!(diferenca > 0.005)) return { ok: false, erro: 'Este pagamento não ficou abaixo do esperado.' }
  const justificado = r2(ligados.reduce((a, c) => a + (Number(c.valor) || 0), 0))
  if (!(justificado > 0)) return { ok: false, erro: 'Escolha um crédito ou informe um crédito manual.' }
  if (justificado > diferenca + 0.005) return { ok: false, erro: 'A soma dos créditos passa da diferença do pagamento.' }
  const c = tx.composicao?.itens?.length && tx.composicao.tipo !== 'condominio' ? tx.composicao : null
  const base = c ? c.itens.filter(i => i.tipo !== 'ajuste') : [{ tipo: 'base', desc: 'Valor esperado', valor: previsto }]
  const itens = [...base, ...ligados.flatMap(itensDoCredito)]
  const restante = r2(pago - soma(itens))
  if (Math.abs(restante) > 0.005) itens.push({ tipo: 'ajuste', desc: 'Diferença no pagamento', valor: restante })
  return {
    ok: true, diferenca, justificado, restante: r2(-restante),
    composicao: { ...(c || { tipo: 'aluguel' }), tipo: c?.tipo || 'aluguel', itens, total: pago },
  }
}

// Estorno/exclusão do lançamento → { reabrir, remover, voltarPrevisto, manter }: créditos
// compensados NESTE pagamento voltam a abater (aberto, ou previsto se o condomínio de origem ainda
// não foi pago — `statusReabrir`); o crédito GERADO por ele (condomínio) sai — se ainda aberto. Se a
// parcela de origem tem o boleto informado (`informadas`: ids das parcelas), ele volta a
// 'previsto' em vez de sair. Gerado e já compensado em outro aluguel pago fica (`manter`), para o
// usuário decidir.
export function planejarReversao({ tx, creditos, informadas = new Set() }) {
  const doTx = (creditos || [])
  const gerados = doTx.filter(c => c.origem_lancamento_id === tx.id)
  const informado = (c) => !!c.origem_agendamento_id && informadas.has(c.origem_agendamento_id)
  const reabrir = doTx.filter(c => c.status === 'compensado' && c.compensado_em_lancamento_id === tx.id)
  return {
    reabrir: reabrir.map(c => c.id),
    statusReabrir: Object.fromEntries(reabrir.map(c => [c.id, c.origem_agendamento_id && !c.origem_lancamento_id ? 'previsto' : 'aberto'])),
    remover: gerados.filter(c => c.status === 'aberto' && !informado(c)).map(c => c.id),
    voltarPrevisto: gerados.filter(c => c.status === 'aberto' && informado(c)).map(c => c.id),
    manter: gerados.filter(c => c.status === 'compensado').map(c => c.id),
  }
}
