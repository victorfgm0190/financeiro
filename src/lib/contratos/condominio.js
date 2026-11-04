// CONDOMÍNIO PREVISTO (D5) — funções puras.
// As parcelas pendentes de condomínio seguem o ÚLTIMO valor pago (por data do lançamento), venha o
// pagamento de parcela gerada ou de série vinculada, pela tela de Agendamentos ou pela do contrato.
// Estorno: o pagamento estornado sai da conta (excluirTx) e a previsão volta ao último pago anterior;
// sem nenhum, ao previsto do contrato. Parcela de valor digitado à mão não muda.
// Itens marcados "Só neste boleto" (de inquilino ou de proprietário) saem da previsão: o valor pago
// menos esses itens. Sem composição, o valor pago. O lançamento e o crédito gerado não mudam.
import { occEfetiva } from '../fluxoCaixa.js'
import { ehParcelaGerada, parcelaPaga, valorManual, r2 } from './parcelas.js'

export const DESC_PREVISTO = 'Condomínio previsto'

// Soma dos itens "Só neste boleto" de uma composição de condomínio.
export const somaItensEventuais = (composicao) =>
  r2((composicao?.itens || []).filter(i => i.so_neste_boleto).reduce((a, i) => a + (Number(i.valor) || 0), 0))

// Valor que um pagamento de condomínio repete nos próximos: pago − itens "Só neste boleto".
export const valorParaPrevisao = (valorPago, composicao) => r2(Number(valorPago) - somaItensEventuais(composicao))

// valor = o que a previsão repete (pago − itens "Só neste boleto"); pago = valor do lançamento.
// → { valor, pago, data, ocorrencia, txId, scheduleId } | null
export function ultimoCondominioPago(contrato, schedules, transactions = [], { excluirTx = null } = {}) {
  const porId = new Map((transactions || []).map(t => [t.id, t]))
  let melhor = null
  for (const s of schedules || []) {
    if (s.contratoId !== contrato.id || (s.contratoPapel || 'aluguel') !== 'condominio') continue
    for (const d of s.registered || []) {
      const meta = s.registeredMeta?.[d]
      if (excluirTx && meta?.lancamento_id === excluirTx) continue
      const tx = (meta?.lancamento_id && porId.get(meta.lancamento_id))
        || (transactions || []).find(t => t.scheduleId === s.id && (t.dataOcorrencia || t.date) === d) || null
      if (excluirTx && tx?.id === excluirTx) continue
      const pago = r2(tx ? tx.amount : occEfetiva(s, d).amount)
      const valor = tx?.composicao?.tipo === 'condominio' ? valorParaPrevisao(pago, tx.composicao) : pago
      const data = tx?.date || d
      if (!melhor || data > melhor.data || (data === melhor.data && d > melhor.ocorrencia)) {
        melhor = { valor, pago, data, ocorrencia: d, txId: tx?.id || null, scheduleId: s.id }
      }
    }
  }
  return melhor
}

// Valor que as pendentes devem ter: último pago (sem os itens eventuais); sem pagamento, o previsto
// do contrato.
export function valorPrevistoCondominio(contrato, schedules, transactions, opts = {}) {
  const u = ultimoCondominioPago(contrato, schedules, transactions, opts)
  return r2(u ? u.valor : contrato.valor_condominio_previsto)
}

// Parcelas de condomínio pendentes (não manuais) que mudam para o valor previsto.
// → { valor, atualizar: [{ id, antes, changes }] }
export function planoPrevisaoCondominio(contrato, schedules, transactions, opts = {}) {
  if (!contrato?.tem_condominio) return { valor: null, atualizar: [] }
  const valor = valorPrevistoCondominio(contrato, schedules, transactions, opts)
  if (!(valor > 0)) return { valor, atualizar: [] }
  const atualizar = []
  for (const s of schedules || []) {
    if (!ehParcelaGerada(s, contrato.id) || s.contratoPapel !== 'condominio' || parcelaPaga(s) || valorManual(s)) continue
    if (r2(s.amount) === valor && r2(s.composicao?.total) === valor) continue
    atualizar.push({
      id: s.id, antes: s,
      changes: {
        amount: valor,
        composicao: { ...(s.composicao || {}), itens: [{ tipo: 'previsto', desc: DESC_PREVISTO, valor }], total: valor },
      },
    })
  }
  return { valor, atualizar }
}

// Prévia na tela da composição: a previsão que resulta se `tx` ficar com `composicao`/`valor`.
// → { valor, ultimo } — ultimo = false quando há pagamento de condomínio mais recente (a previsão
// segue aquele, e esta composição não a muda).
export function previsaoComComposicao(contrato, schedules, transactions, tx, { composicao, valor }) {
  const lista = (transactions || []).some(t => t.id === tx.id) ? transactions : [...(transactions || []), tx]
  const novas = lista.map(t => (t.id === tx.id ? { ...t, amount: r2(valor), composicao } : t))
  const u = ultimoCondominioPago(contrato, schedules, novas)
  const proprio = valorParaPrevisao(valor, composicao)
  if (!u || u.txId === tx.id) return { valor: proprio, ultimo: true }
  return { valor: u.valor, ultimo: false }
}
