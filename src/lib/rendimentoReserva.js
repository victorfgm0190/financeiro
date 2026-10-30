// Rendimento (juros) numa conta de RESERVA: rateado automaticamente entre as funções da conta,
// proporcional ao saldo de cada uma na data do rendimento (só saldo positivo; centavos na maior).
// Gravado como AJUSTE de cada função (reserve_adjustments, observação "Rendimento", lancamento_id =
// o lançamento do rendimento): editar/apagar o rendimento refaz/apaga o rateio. O lançamento em si
// continua como hoje (receita, saldo da conta, totais) — o rateio só divide o valor entre funções.
import { reserveMovOf } from './reserveDailyLedger.js'
import { ratearProporcional } from './reservaDistribuir.js'

export const OBS_RENDIMENTO = 'Rendimento'

const r2 = (n) => Math.round(n * 100) / 100
const ehContaReserva = (a) => !!a && (a.isReserva || a.vinculoTipo === 'reserva')

// Receita SEM função numa conta de reserva (botão "Lançar Rendimento" ou outro juro/rendimento).
export function ehRendimentoDeReserva(tx, accounts) {
  if (!tx || tx.type !== 'income' || tx.reservaFuncaoId || tx.reservaAuto) return false
  return ehContaReserva((accounts || []).find(a => a.id === tx.accountId))
}

// Ajuste vindo de um rendimento (coluna "Rendimentos", fora da coluna "Ajuste").
export const ehAjusteDeRendimento = (a) => !!a?.lancamento_id

// Saldo de cada função da conta NA data (inclusive): saldo inicial do período vigente naquela data
// + movimentos com a função (reserveMovOf) + ajustes do período até a data. `ignorarLancamentoId`:
// os ajustes do próprio rendimento (refazer o rateio numa edição).
export function saldosDasFuncoesNaData({ functions, periods, adjustments, transactions, contaId, date, ignorarLancamentoId = null }) {
  const fns = (functions || []).filter(f => f.accountId === contaId)
  return fns.map(f => {
    const periodo = (periods || [])
      .filter(p => p.function_id === f.id && String(p.data_inicio).slice(0, 10) <= date)
      .sort((a, b) => String(b.data_inicio).localeCompare(String(a.data_inicio)))[0]
    const inicio = periodo ? String(periodo.data_inicio).slice(0, 10) : '0001-01-01'
    let saldo = periodo ? Number(periodo.saldo_inicial) || 0 : Number(f.saldoInicial) || 0
    for (const tx of transactions || []) {
      if (tx.reservaFuncaoId !== f.id || tx.date < inicio || tx.date > date) continue
      const m = reserveMovOf(tx, f.accountId)
      saldo += m.entrada - m.saida
    }
    for (const a of adjustments || []) {
      if (a.function_id !== f.id || a.data < inicio || a.data > date) continue
      if (ignorarLancamentoId && a.lancamento_id === ignorarLancamentoId) continue
      saldo += Number(a.valor) || 0
    }
    return { id: f.id, saldo: r2(saldo) }
  })
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
