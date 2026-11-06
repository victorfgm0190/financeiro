// Aba "Pagos" de Agendamentos: tudo o que foi efetivamente pago ou recebido em CONTA, com ou sem vínculo
// com agendamento. A lista nasce dos lançamentos gravados (um por linha, sem duplicar a baixa); a
// ocorrência casada (pagamentosDosAgendamentos) só completa vencimento e parcela.
//
// Fora: compra e parcela em cartão, registro sintético (id sch:), espelho e sombra de reserva, valor
// estimado, provisão, ganho/perda de troca de bens, o que não tem conta e transferência ENTRE CONTAS
// (bancária, reserva, gerencial). Transferência só entra se uma ponta for bem ou dívida, ou se for
// pagamento de cartão. Baixa sem movimento (bem_baixas) não é lançamento e nem chega aqui.
import { pagamentosDosAgendamentos } from './ocorrenciasRegistradas.js'

const dia = (v) => (v ? String(v).slice(0, 10) : '')
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const ORIGENS_FORA = new Set(['patrimonio_auto', 'patrimonioAuto', 'auto-provisao'])
const TIPOS_DE_TRANSFERENCIA = new Set(['transfer', 'credit_payment'])

const TIPOS_BEM_OU_DIVIDA = new Set(['asset', 'liability'])

const ehCartao = (contaPorId, id) => contaPorId.get(id)?.type === 'credit'
const ehBemOuDivida = (contaPorId, id) => TIPOS_BEM_OU_DIVIDA.has(contaPorId.get(id)?.type)

// credit_payment guarda o cartão em accountId e a conta pagadora em fromAccountId (fluxoCaixa.js).
const pontasDe = (tx) => (tx.type === 'credit_payment'
  ? { de: tx.fromAccountId || null, para: tx.accountId || null }
  : { de: tx.accountId || null, para: tx.toAccountId || null })

// É um pagamento ou recebimento real em conta? Cartão é reconhecido pelo TIPO da conta.
export function lancamentoPagoEmConta(tx, contaPorId) {
  if (!tx?.id || String(tx.id).startsWith('sch:')) return false
  if (tx.reservaAuto || tx.isEspelho || tx.estimado || ORIGENS_FORA.has(tx.origin)) return false
  const { de, para } = pontasDe(tx)
  if (!de) return false
  if (TIPOS_DE_TRANSFERENCIA.has(tx.type)) {
    return [de, para].some(id => ehCartao(contaPorId, id) || ehBemOuDivida(contaPorId, id))
  }
  return !ehCartao(contaPorId, tx.accountId) && tx.accountType !== 'credit'
}

// `transactions`: os do perfil em foco (transferência entra se qualquer ponta for do perfil).
// `todasTransactions` e `schedules`: de todos os perfis, para achar o vínculo de qualquer lançamento.
// `contasDoPerfil` (Set; null = Tudo): pagamento de fatura no formato antigo também entra pela conta
// pagadora, que o recorte de perfil não olha. Só exibição.
export function pagosEmConta({ transactions = [], todasTransactions = transactions, schedules = [], accounts = [], contasDoPerfil = null }) {
  const contaPorId = new Map(accounts.map(a => [a.id, a]))
  const ocorrenciaPorTx = new Map()
  for (const l of pagamentosDosAgendamentos(schedules, todasTransactions)) {
    if (l.txId && !ocorrenciaPorTx.has(l.txId)) ocorrenciaPorTx.set(l.txId, l)
  }
  const linhas = []
  const dentro = new Set(transactions.map(t => t.id))
  const pelaPagadora = contasDoPerfil
    ? todasTransactions.filter(t => t.type === 'credit_payment' && !dentro.has(t.id) && contasDoPerfil.has(t.fromAccountId))
    : []
  for (const tx of [...transactions, ...pelaPagadora]) {
    if (!lancamentoPagoEmConta(tx, contaPorId)) continue
    const oc = ocorrenciaPorTx.get(tx.id) || null
    const s = oc?.schedule || null
    const transferencia = TIPOS_DE_TRANSFERENCIA.has(tx.type)
    const { de, para } = pontasDe(tx)
    linhas.push({
      key: `tx_${tx.id}`,
      txId: tx.id,
      tx,
      schedule: s,
      scheduleId: s?.id || null,
      semVinculo: !s,
      avulso: !!oc?.avulso,
      dataPagamento: dia(tx.date),
      vencimento: oc?.vencimento || null,
      parcela: oc?.parcela || null,
      total: oc?.total || null,
      description: tx.description || s?.description || '',
      payee: tx.payee || s?.payee || '',
      categoryId: tx.categoryId || s?.categoryId || null,
      tipoDocumentoId: tx.tipoDocumentoId || s?.tipoDocumentoId || null,
      tipo: s?.tipo || null,
      accountId: de,
      toAccountId: para,
      amount: r2(tx.amount),
      transactionType: tx.type,
      pagamentoCartao: transferencia && (ehCartao(contaPorId, de) || ehCartao(contaPorId, para)),
    })
  }
  return linhas.sort((a, b) => b.dataPagamento.localeCompare(a.dataPagamento) || a.description.localeCompare(b.description))
}
