// SÓ DESENVOLVIMENTO — carregado apenas pelo modoDev.js (import dinâmico sob import.meta.env.DEV).
// Dados fictícios para testar o visual sem banco. Ficam só em memória: o modoDev os entrega ao
// app como se fossem o cache do localStorage (finup_v1), sem gravar em lugar nenhum.
// Montados com os mesmos conversores do /api/load (rowTo*), para terem o formato completo.
import { rowToAccount, rowToTx, rowToSchedule, rowToReserveFunction, rowToEnvelope } from '../lib/db'

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Dia `dia` do mês deslocado `meses` a partir de hoje.
function noMes(meses, dia) {
  const h = new Date()
  return iso(new Date(h.getFullYear(), h.getMonth() + meses, dia))
}
const mesAno = (meses) => noMes(meses, 1).slice(0, 7)
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }

const CC = 'dev_acc_cc'
const POUP = 'dev_acc_poup'
const CART = 'dev_acc_cartao'
const DIN = 'dev_acc_din'
const FIN = 'dev_acc_fin'

function contas() {
  return [
    { id: CC, name: 'Conta Corrente', type: 'checking', bank: 'Banco Fictício', balance: 8450.32, initial_balance: 5000, is_main: true, conta_corrente_principal: true, fluxo_caixa_principal: true, account_group_id: 'grp_acc_1', order: 0 },
    { id: POUP, name: 'Poupança', type: 'savings', bank: 'Banco Fictício', balance: 12000, initial_balance: 12000, account_group_id: 'grp_acc_2', order: 1, is_reserva: true, reserva_type: 'geral', vinculo_tipo: 'reserva' },
    { id: CART, name: 'Cartão Visa', type: 'credit', bank: 'Banco Fictício', balance: -1840.9, credit_limit: 8000, closing_day: 5, due_day: 12, payment_account_id: CC, account_group_id: 'grp_acc_4', order: 2 },
    { id: DIN, name: 'Carteira', type: 'cash', balance: 230.5, initial_balance: 300, account_group_id: 'grp_acc_5', order: 3 },
    { id: FIN, name: 'Financiamento Carro', type: 'liability', balance: -45000, account_group_id: 'grp_acc_8', order: 4 },
  ].map(rowToAccount)
}

function lancamentos() {
  let n = 0
  const tx = (t) => ({ id: `dev_tx_${++n}`, origin: 'manual', created_at: new Date().toISOString(), ...t })
  const linhas = []
  for (const m of [-2, -1, 0]) {
    linhas.push(
      tx({ type: 'income', account_id: CC, amount: 7200, date: noMes(m, 5), description: 'Salário', category_id: 'cat_9', payee: 'Empresa Fictícia' }),
      tx({ type: 'expense', account_id: CC, amount: 2100, date: noMes(m, 10), description: 'Aluguel', category_id: 'cat_3', payee: 'Imobiliária Exemplo' }),
      tx({ type: 'expense', account_id: CC, amount: 612.4, date: noMes(m, 8), description: 'Supermercado', category_id: 'cat_ali_sup', payee: 'Mercado Bom Preço' }),
      tx({ type: 'expense', account_id: CC, amount: 189.9, date: noMes(m, 15), description: 'Internet e telefone', category_id: 'cat_3' }),
      tx({ type: 'transfer', account_id: CC, to_account_id: POUP, amount: 800, date: noMes(m, 6), description: 'Transferência para poupança' }),
      tx({ type: 'expense', account_id: CART, account_type: 'credit', amount: 245.7, date: noMes(m, 2), description: 'Restaurante', category_id: 'cat_ali_ref', fatura_month_year: mesAno(m) }),
      tx({ type: 'expense', account_id: CART, account_type: 'credit', amount: 389.0, date: noMes(m, 3), description: 'Farmácia', category_id: 'cat_4', fatura_month_year: mesAno(m) }),
      tx({ type: 'expense', account_id: CART, account_type: 'credit', amount: 129.9, date: noMes(m, 4), description: 'Streaming', category_id: 'cat_5', fatura_month_year: mesAno(m) }),
    )
  }
  linhas.push(
    tx({ type: 'income', account_id: CC, amount: 1350, date: diasAtras(3), description: 'Freelance — projeto site', category_id: 'cat_10' }),
    tx({ type: 'expense', account_id: DIN, amount: 42.5, date: diasAtras(1), description: 'Padaria', category_id: 'cat_ali_pad' }),
    tx({ type: 'expense', account_id: CC, amount: 560, date: diasAtras(2), description: 'Lazer — show', category_id: 'cat_5' }),
    tx({ type: 'income', account_id: POUP, amount: 61.2, date: diasAtras(4), description: 'Rendimento poupança', category_id: 'cat_11' }),
  )
  return linhas.map(rowToTx)
}

function agendamentos() {
  const base = { auto_register: false, remind_days_before: 3, occurrence_type: 'continuous', registered: [], skipped: [] }
  return [
    { ...base, id: 'dev_ag_aluguel', description: 'Aluguel', transaction_type: 'expense', account_id: CC, amount: 2100, category_id: 'cat_3', frequency: 'monthly', start_date: noMes(-2, 10), registered: [noMes(-2, 10), noMes(-1, 10)] },
    { ...base, id: 'dev_ag_salario', description: 'Salário', transaction_type: 'income', account_id: CC, amount: 7200, category_id: 'cat_9', frequency: 'monthly', start_date: noMes(-2, 5), registered: [noMes(-2, 5), noMes(-1, 5), noMes(0, 5)] },
    { ...base, id: 'dev_ag_escola', description: 'Curso de inglês (parcelado)', transaction_type: 'expense', account_id: CC, amount: 350, category_id: 'cat_6', frequency: 'monthly', start_date: noMes(-1, 20), occurrence_type: 'installment', installments: 10, registered: [noMes(-1, 20)] },
    { ...base, id: 'dev_ag_luz', description: 'Conta de luz (em atraso)', transaction_type: 'expense', account_id: CC, amount: 287.35, category_id: 'cat_3', frequency: 'monthly', start_date: diasAtras(5) },
    { ...base, id: 'dev_ag_ipva', description: 'IPVA', transaction_type: 'expense', account_id: CC, amount: 1890, category_id: 'cat_2', frequency: 'once', start_date: noMes(1, 15) },
    { ...base, id: 'dev_ag_reembolso', description: 'Reembolso a receber', transaction_type: 'income', account_id: CC, amount: 430, category_id: 'cat_12', frequency: 'once', start_date: noMes(0, 25) },
    { ...base, id: 'dev_ag_poupanca', description: 'Aporte mensal poupança', transaction_type: 'transfer', account_id: CC, to_account_id: POUP, amount: 800, frequency: 'monthly', start_date: noMes(1, 6) },
  ].map(rowToSchedule)
}

function reservas() {
  return [
    { id: 'dev_res_emerg', name: 'Emergência', account_id: POUP, saldo_inicial: 6000, despesa_anual: 0, deposito_mensal: 300, ordem: 0 },
    { id: 'dev_res_ferias', name: 'Férias', account_id: POUP, saldo_inicial: 2500, despesa_anual: 6000, deposito_mensal: 500, mes_vencimento: 1, ordem: 1 },
    { id: 'dev_res_ipva', name: 'IPVA / Seguro', account_id: POUP, saldo_inicial: 1200, despesa_anual: 3200, deposito_mensal: 270, mes_vencimento: 3, ordem: 2 },
  ].map(rowToReserveFunction)
}

function envelopes() {
  return [
    { id: 'dev_env_mercado', name: 'Mercado', limit_amount: 1500, due_day: 1, category_ids: ['cat_ali_sup', 'cat_8', 'cat_ali_pad'], account_id: CC },
    { id: 'dev_env_lazer', name: 'Lazer', limit_amount: 400, due_day: 1, category_ids: ['cat_5'], account_id: CC },
    { id: 'dev_env_saude', name: 'Saúde', limit_amount: 600, due_day: 1, category_ids: ['cat_4'], account_id: CC },
  ].map(rowToEnvelope)
}

// Só as seções preenchidas; o AppContext completa o resto com o defaultData (categorias,
// grupos gerenciais, grupos de conta, settings…).
export function gerarDadosFicticios() {
  return {
    accounts: contas(),
    transactions: lancamentos(),
    schedules: agendamentos(),
    reserveFunctions: reservas(),
    envelopes: envelopes(),
  }
}
