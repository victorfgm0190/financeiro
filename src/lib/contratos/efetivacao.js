// GANCHO DE EFETIVAÇÃO (P5) — decisões puras de posEfetivacaoContrato / reverterEfetivacaoContrato.
// Quem aplica é o useContratos; aqui só "o que fazer" com a parcela que acabou de ser paga (ou
// estornada), para os 5 pontos de efetivação do app usarem a MESMA regra.
import { r2 } from './parcelas.js'

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

// Estorno/exclusão do lançamento → { reabrir, remover, manter }: créditos compensados NESTE
// pagamento voltam a abertos; o crédito GERADO por ele (condomínio) sai — se ainda aberto. Gerado e
// já compensado em outro aluguel pago fica (`manter`), para o usuário decidir.
export function planejarReversao({ tx, creditos }) {
  const doTx = (creditos || [])
  return {
    reabrir: doTx.filter(c => c.status === 'compensado' && c.compensado_em_lancamento_id === tx.id).map(c => c.id),
    remover: doTx.filter(c => c.origem_lancamento_id === tx.id && c.status === 'aberto').map(c => c.id),
    manter: doTx.filter(c => c.origem_lancamento_id === tx.id && c.status === 'compensado').map(c => c.id),
  }
}
