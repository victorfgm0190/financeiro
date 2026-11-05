// Cenário do pedido da virada assistida (06/11/2026), mês financeiro começando no dia 15.
// Saldos iniciais em 31/07/2026 (total 1.550,00): IPVA 361,6667; Seguro 578,6667; Fralda 609,6667.
// "Reajustes" = rendimentos (receita sem função na conta de reserva), rateados na data de cada um
// pela regra de hoje (rateioDoRendimento) — gerados em ordem, como o app faz ao lançar cada um.
import { rateioDoRendimento } from '../rendimentoReserva.js'

export const CONTA_RESERVA = 'acc_res'
export const CONTA_CORRENTE = 'acc_cc'
export const F = { ipva: 'f_ipva', seguro: 'f_seguro', fralda: 'f_fralda' }

const tr = (id, date, amount, de, para, funcao) => ({ id, date, type: 'transfer', amount, accountId: de, toAccountId: para, reservaFuncaoId: funcao, description: id })
const dep = (id, date, amount, funcao) => tr(id, date, amount, CONTA_CORRENTE, CONTA_RESERVA, funcao)
const res = (id, date, amount, funcao) => tr(id, date, amount, CONTA_RESERVA, CONTA_CORRENTE, funcao)
const reajuste = (id, date, amount) => ({ id, date, type: 'income', amount, accountId: CONTA_RESERVA, toAccountId: null, reservaFuncaoId: null, description: 'Reajuste' })

export const REAJUSTES = [
  reajuste('rj_0801', '2026-08-01', 50), reajuste('rj_0810', '2026-08-10', 60), reajuste('rj_0811', '2026-08-11', 50),
  reajuste('rj_0821', '2026-08-21', 30), reajuste('rj_0831', '2026-08-31', 100),
  reajuste('rj_0905', '2026-09-05', 30), reajuste('rj_0910', '2026-09-10', 30),
]

export function montarCenario() {
  const functions = [
    { id: F.ipva, name: 'IPVA', accountId: CONTA_RESERVA, saldoInicial: 0, ordem: 0 },
    { id: F.seguro, name: 'Seguro', accountId: CONTA_RESERVA, saldoInicial: 0, ordem: 1 },
    { id: F.fralda, name: 'Fralda', accountId: CONTA_RESERVA, saldoInicial: 0, ordem: 2 },
  ]
  const accounts = [
    { id: CONTA_RESERVA, name: 'Reserva', type: 'checking', initialBalance: 1550 },
    { id: CONTA_CORRENTE, name: 'Corrente', type: 'checking', initialBalance: 10000 },
  ]
  const periods = [
    { id: 'p_ipva_0', function_id: F.ipva, data_inicio: '2026-08-01', saldo_inicial: 361.6667 },
    { id: 'p_seg_0', function_id: F.seguro, data_inicio: '2026-08-01', saldo_inicial: 578.6667 },
    { id: 'p_fra_0', function_id: F.fralda, data_inicio: '2026-08-01', saldo_inicial: 609.6667 },
  ]
  // Fechamento antigo (anterior à virada assistida) até 31/07.
  const snapshots = functions.map((f, i) => ({
    id: `snap_legado_${i}`, periodo_id: 'legacy', data_inicio: '0001-01-01', data_fim: '2026-07-31', function_id: f.id, function_name: f.name,
    saldo_inicial: 0, entradas: 0, saidas: 0, ajuste: 0, rendimentos: null, saldo: periods[i].saldo_inicial, saldo_atualizado: periods[i].saldo_inicial,
  }))
  const movimentos = [
    dep('ipva_0815', '2026-08-15', 200, F.ipva), dep('seg_0815', '2026-08-15', 100, F.seguro),
    dep('fra_0815', '2026-08-15', 250, F.fralda), res('fra_r_0815', '2026-08-15', 300, F.fralda),
    res('seg_r_0820', '2026-08-20', 100, F.seguro),
    dep('ipva_0915', '2026-09-15', 200, F.ipva), dep('seg_0915', '2026-09-15', 100, F.seguro),
    dep('fra_0915', '2026-09-15', 250, F.fralda), res('fra_r_0915', '2026-09-15', 300, F.fralda),
    res('seg_r_0915', '2026-09-15', 100, F.seguro),
  ]
  const transactions = [...movimentos, ...REAJUSTES].sort((a, b) => a.date.localeCompare(b.date))
  // Rateio de cada reajuste na data dele, com os ajustes dos anteriores já gravados.
  let adjustments = []
  for (const r of REAJUSTES) {
    adjustments = [...adjustments, ...rateioDoRendimento(r, { functions, periods, adjustments, transactions })]
  }
  return { functions, accounts, periods, snapshots, transactions, adjustments, schedules: [] }
}
