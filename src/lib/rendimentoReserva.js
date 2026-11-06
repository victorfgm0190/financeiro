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

// SALDO NEGATIVO NÃO RENDE. Único rateio de rendimento do sistema: só funções com saldo positivo
// recebem, proporcional ao saldo, centavos na maior. Nenhuma positiva: o valor fica "a distribuir".
// saldos: [{ id, saldo }] → { partes: { [id]: valor }, aDistribuir }.
export function ratearRendimento(saldos, valor) {
  const partes = ratearProporcional(saldos, valor)
  return { partes, aDistribuir: Object.keys(partes).length ? 0 : r2(Number(valor) || 0) }
}

// Início do período mais recente da função: antes dele o saldo da função já está fechado.
export function inicioMaisRecente(periods, functionId) {
  let max = null
  for (const p of periods || []) {
    const d = p.function_id === functionId && p.data_inicio ? String(p.data_inicio).slice(0, 10) : null
    if (d && (!max || d > max)) max = d
  }
  return max
}

// A data cai em período já fechado da função? (rendimento nesse caso vira pendência, não rateio)
export const dataFechadaNaFuncao = (periods, functionId, data) => {
  const inicio = inicioMaisRecente(periods, functionId)
  return !!inicio && !!data && String(data).slice(0, 10) < inicio
}

// Ajustes do rateio de UM rendimento (ids determinísticos: refazer substitui). Rendimento com data em
// período fechado não é rateado: não entraria no saldo de ninguém.
export function rateioDoRendimento(tx, ctx) {
  const fns = (ctx.functions || []).filter(f => f.accountId === tx.accountId)
  if (fns.some(f => dataFechadaNaFuncao(ctx.periods, f.id, tx.date))) return []
  const saldos = saldosDasFuncoesNaData({ ...ctx, contaId: tx.accountId, date: tx.date, ignorarLancamentoId: tx.id })
  const { partes } = ratearRendimento(saldos, Number(tx.amount) || 0)
  return Object.entries(partes).map(([functionId, valor]) => ({
    id: `adj_rend_${tx.id}_${functionId}`,
    function_id: functionId,
    data: tx.date,
    valor,
    observacao: OBS_RENDIMENTO,
    lancamento_id: tx.id,
  }))
}

// Refaz, em ordem de data, o rateio dos rendimentos a partir de `desde` (cada um depende do saldo que os
// anteriores deixaram). Devolve só os que mudam: { lancamentoId, date, description, antes, depois, novos }.
export function refazerRendimentos({ functions = [], periods = [], adjustments = [], transactions = [], desde }) {
  const contas = new Set(functions.map(f => f.accountId).filter(Boolean))
  const rendimentos = transactions
    .filter(t => t.type === 'income' && !t.reservaFuncaoId && !t.reservaAuto && contas.has(t.accountId) && t.date && t.date >= desde)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
  const mapa = (lista) => Object.fromEntries(lista.map(a => [a.function_id, r2(Number(a.valor) || 0)]))
  let atuais = adjustments
  const itens = []
  for (const tx of rendimentos) {
    const novos = rateioDoRendimento(tx, { functions, periods, adjustments: atuais, transactions })
    const antes = mapa(atuais.filter(a => a.lancamento_id === tx.id))
    const depois = mapa(novos)
    const mudou = new Set([...Object.keys(antes), ...Object.keys(depois)])
    if ([...mudou].some(id => Math.abs((antes[id] || 0) - (depois[id] || 0)) > 0.005)) {
      itens.push({ lancamentoId: tx.id, date: tx.date, description: tx.description || '', antes, depois, novos })
    }
    atuais = [...atuais.filter(a => a.lancamento_id !== tx.id), ...novos]
  }
  return itens
}
