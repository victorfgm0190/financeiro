// Rendimento (juros) numa conta de RESERVA: rateado automaticamente entre as funções da conta,
// proporcional ao saldo de cada uma na data do rendimento (só saldo positivo; centavos na maior).
// Gravado como AJUSTE de cada função (reserve_adjustments, observação "Rendimento", lancamento_id =
// o lançamento do rendimento): editar/apagar o rendimento refaz/apaga o rateio. O lançamento em si
// continua como hoje (receita, saldo da conta, totais) — o rateio só divide o valor entre funções.
import { saldosDasFuncoes, ehAjusteDeRendimento } from './saldoReserva.js'
import { ratearProporcional } from './reservaDistribuir.js'

export const OBS_RENDIMENTO = 'Rendimento'

const r2 = (n) => Math.round(n * 100) / 100
const ehContaReserva = (a) => !!a && (a.isReserva || a.vinculoTipo === 'reserva')

// Receita SEM função numa conta de reserva (botão "Lançar Rendimento" ou outro juro/rendimento).
export function ehRendimentoDeReserva(tx, accounts) {
  if (!tx || tx.type !== 'income' || tx.reservaFuncaoId || tx.reservaAuto) return false
  return ehContaReserva((accounts || []).find(a => a.id === tx.accountId))
}

// Ajuste vindo de um rendimento (coluna "Rendimentos", fora da coluna "Ajuste"). Regra em saldoReserva.
export { ehAjusteDeRendimento }

// Saldo de cada função da conta NA data (inclusive) — fórmula única (src/lib/saldoReserva.js):
// saldo inicial do período vigente + movimentos + ajustes + rendimentos até a data.
// `ignorarLancamentoId`: os ajustes do próprio rendimento (refazer o rateio numa edição).
export function saldosDasFuncoesNaData({ functions, periods, adjustments, transactions, contaId, date, ignorarLancamentoId = null }) {
  const fns = (functions || []).filter(f => f.accountId === contaId)
  return saldosDasFuncoes({ functions: fns, periods, adjustments, transactions, ate: date, ignorarLancamentoId })
    .map(s => ({ id: s.functionId, saldo: r2(s.saldo) }))
}

// Ajustes do rateio de UM rendimento (ids determinísticos: refazer substitui).
export function rateioDoRendimento(tx, ctx) {
  const saldos = saldosDasFuncoesNaData({ ...ctx, contaId: tx.accountId, date: tx.date, ignorarLancamentoId: tx.id })
  const partes = ratearProporcional(saldos, Number(tx.amount) || 0)
  return Object.entries(partes).map(([functionId, valor]) => ({
    id: `adj_rend_${tx.id}_${functionId}`,
    function_id: functionId,
    data: tx.date,
    valor,
    observacao: OBS_RENDIMENTO,
    lancamento_id: tx.id,
  }))
}
