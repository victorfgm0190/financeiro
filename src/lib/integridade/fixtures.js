// Fixture compartilhada dos testes do Motor de Integridade: o caso real de 30/09/2026
// (Fatura 10/2026 Itaupers, R$ 358,62) e construtores de lançamentos/agendamentos.

export const HOJE = '2026-09-30'
export const OPC = { hoje: HOJE }

export const GRUPOS = [
  { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', defaultAccountId: null },
  { id: 'grp_2', number: 2, name: 'Contas Anuais', alias: 'CA', defaultAccountId: 'acc_res_ca' },
  { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', defaultAccountId: null },
]

export const CONTAS = [
  { id: 'acc_cc', name: 'Conta Corrente', type: 'checking', contaCorrentePrincipal: true, balance: 0 },
  { id: 'acc_itaupers', name: 'Itaú Personnalité', apelido: 'Itaupers', type: 'credit', closingDay: 5, dueDay: 12 },
  { id: 'acc_ger_itaupers', name: 'Ger. Itaupers', type: 'gerencial', balance: 0 },
  { id: 'acc_res_ca', name: 'Reserva Contas Anuais', type: 'checking', balance: 0 },
]

export const fmyRef = (fmy) => `${fmy.slice(5, 7)}/${fmy.slice(0, 4)}`

export const gasto = (id, description, amount, fmy, extra = {}) => ({
  id, type: 'expense', accountId: 'acc_itaupers', accountType: 'credit', amount, description,
  date: `${fmy}-01`, dateCartao: '2026-06-20', faturaMonthYear: fmy, grupoGerencial: 'grp_1',
  origin: 'importacao_fatura', createdAt: `${fmy}-01T10:00:00Z`, ...extra,
})

export const etapaA = (g, extra = {}) => ({
  id: `tx_gerA_${g.id}`, type: 'transfer', accountId: 'acc_cc', toAccountId: 'acc_ger_itaupers',
  amount: g.amount, date: g.date, description: `Reserva Gerencial - ${g.description}`,
  grupoGerencial: 'grp_1', cardId: 'acc_itaupers', faturaRef: fmyRef(g.faturaMonthYear),
  sourceExpenseId: g.id, origin: 'etapa_a', ...extra,
})

export const devolucao = (fmy, gastos, { executada = false } = {}) => {
  const amount = Math.round(gastos.reduce((s, g) => s + g.amount, 0) * 100) / 100
  return {
    id: `fsch_acc_itaupers_${fmy.replace('-', '')}_gerencial_devolucao`, tipo: 'gerencial_devolucao',
    transactionType: 'transfer', accountId: 'acc_ger_itaupers', toAccountId: 'acc_cc',
    amount, cardId: 'acc_itaupers', faturaMesAno: fmy, faturaRef: fmyRef(fmy), frequency: 'once',
    startDate: `${fmy}-15`, registered: executada ? [`${fmy}-15`] : [], skipped: [],
    sourceExpenseIds: gastos.map(g => g.id),
  }
}
export const devolucaoExecutada = (sch) => ({
  id: `tx_dev_${sch.id}`, type: 'transfer', accountId: 'acc_ger_itaupers', toAccountId: 'acc_cc',
  amount: sch.amount, date: sch.startDate, description: `Devolução Gerencial Itaupers - Fatura ${sch.faturaRef}`,
  sourceScheduleId: sch.id, origin: 'agendamento',
})

// ── Fixture do bug de 30/09/2026 ─────────────────────────────────────────────
// Série antiga (compra de junho): Jim.com e Farmácias 1/3 (07), 2/3 (08), 3/3 (09), todas com
// etapa A e devolução executada. Na Fatura 10/2026 entram dois gastos G REAIS, exibidos como
// "3/3" — o Jim.com com favorecido (linha cinza) "1/3" — sem etapa A nenhuma.
export function fixtureBug() {
  const transactions = []
  const schedules = []
  for (const [i, fmy] of ['2026-07', '2026-08', '2026-09'].entries()) {
    const n = i + 1
    const jim = gasto(`tx_jim_${n}`, `Jim.com* 60278703 ${n}/3`, 316.68, fmy, { installmentNum: n, installmentTotal: 3 })
    const farm = gasto(`tx_farm_${n}`, `Farmacias Sao Joao ${n}/3`, 41.94, fmy, { installmentNum: n, installmentTotal: 3 })
    transactions.push(jim, farm, etapaA(jim), etapaA(farm))
    const dev = devolucao(fmy, [jim, farm], { executada: true })
    schedules.push(dev)
    transactions.push(devolucaoExecutada(dev))
  }
  const jimNovo = gasto('tx_1789736376094_z41mpw3eroa', 'Jim.com* 60278703 3/3', 316.68, '2026-10', {
    installmentNum: 3, installmentTotal: 3, date: '2026-09-15', dateCartao: '2026-07-11',
    payee: 'Jim.com* 60278703 1/3', createdAt: '2026-09-18T12:59:36Z',
  })
  const farmNovo = gasto('tx_1789736376094_kvw8u5eevwc', 'Farmacias Sao Joao 3/3', 41.94, '2026-10', {
    installmentNum: 3, installmentTotal: 3, date: '2026-09-15', dateCartao: '2026-07-12',
    createdAt: '2026-09-18T12:59:36Z',
  })
  // Demais gastos G da fatura 10 — com etapa A (uma no id novo, outra no id ANTIGO tx_ger_).
  const mercado = gasto('tx_mercado', 'Mercado Central', 5000, '2026-10', { dateCartao: '2026-09-10' })
  const posto = gasto('tx_posto', 'Posto Ipiranga', 342.70, '2026-10', { dateCartao: '2026-09-11' })
  transactions.push(jimNovo, farmNovo, mercado, posto, etapaA(mercado),
    etapaA(posto, { id: 'tx_ger_1789000000000_abc123', origin: 'gerencial_auto', parentTxId: posto.id }))
  schedules.push(devolucao('2026-10', [jimNovo, farmNovo, mercado, posto]))
  return { transactions, schedules, accounts: CONTAS, gerencialGroups: GRUPOS }
}

export const porRegra = (divs) => divs.reduce((m, d) => { (m[d.regra] ||= []).push(d); return m }, {})
