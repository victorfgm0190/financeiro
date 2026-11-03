// CONDOMÍNIO PREVISTO (D5) — funções puras.
// As parcelas pendentes de condomínio seguem o ÚLTIMO valor pago (por data do lançamento), venha o
// pagamento de parcela gerada ou de série vinculada, pela tela de Agendamentos ou pela do contrato.
// Estorno: o pagamento estornado sai da conta (excluirTx) e a previsão volta ao último pago anterior;
// sem nenhum, ao previsto do contrato. Parcela de valor digitado à mão não muda.
import { occEfetiva } from '../fluxoCaixa.js'
import { ehParcelaGerada, parcelaPaga, valorManual, r2 } from './parcelas.js'

export const DESC_PREVISTO = 'Condomínio previsto'

// → { valor, data, ocorrencia, txId, scheduleId } | null
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
      const valor = r2(tx ? tx.amount : occEfetiva(s, d).amount)
      const data = tx?.date || d
      if (!melhor || data > melhor.data || (data === melhor.data && d > melhor.ocorrencia)) {
        melhor = { valor, data, ocorrencia: d, txId: tx?.id || null, scheduleId: s.id }
      }
    }
  }
  return melhor
}

// Valor que as pendentes devem ter: último pago; sem pagamento, o previsto do contrato.
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
