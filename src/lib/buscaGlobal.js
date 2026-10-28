// Busca Global — itens visíveis e selos. As sombras automáticas de reserva/investimento
// (reservaAuto: tx_rsg_ resgate, tx_res_ depósito, tx_inv_ investimento; sem conta) são detalhe
// interno dos relatórios: não viram itens próprios. A transferência de origem já representa a
// saída e a entrada — igual ao extrato da conta — e ganha um selo pelo tipo das sombras-filhas.
import { filtrarPorStatus } from './statusEfetivo.js'

export const ehSombraAutomatica = (t) => t?.reservaAuto === true

const SELO_POR_PREFIXO = [
  ['tx_rsg_', 'Resgate de reserva'],
  ['tx_res_', 'Depósito em reserva'],
]

// transactions → Map parentTxId → [selos] (sem repetição, na ordem acima).
export function selosReservaPorPai(transactions) {
  const m = new Map()
  for (const t of transactions || []) {
    if (!ehSombraAutomatica(t) || !t.parentTxId || typeof t.id !== 'string') continue
    const selo = SELO_POR_PREFIXO.find(([p]) => t.id.startsWith(p))?.[1]
    if (!selo) continue
    const arr = m.get(t.parentTxId) || []
    if (!arr.includes(selo)) arr.push(selo)
    m.set(t.parentTxId, arr)
  }
  for (const arr of m.values()) arr.sort((a, b) => SELO_POR_PREFIXO.findIndex(([, s]) => s === a) - SELO_POR_PREFIXO.findIndex(([, s]) => s === b))
  return m
}

// Itens exibidos: sem sombras (inclusive legado sem parentTxId) + filtro de status. Os contadores
// "(n)" e os filtros Todos/Registrado/Pendente consideram só o que sai daqui.
export function itensVisiveisBusca({ txs = [], schedules = [], ...opts }) {
  return filtrarPorStatus({ ...opts, txs: txs.filter(t => !ehSombraAutomatica(t)), schedules })
}

// Valor da busca: Exato = mesmo valor; Aproximado = mesma parte inteira (200,00 → 200,00 a 200,99).
// Sempre pelo valor absoluto (despesa e receita) e em centavos inteiros (sem erro de ponto flutuante).
// Usado pelo /api/search (SQL) e pelo filtro local do GlobalSearch — a mesma regra nos dois.
export const MODOS_VALOR = ['exato', 'aproximado']
export const modoValor = (m) => (MODOS_VALOR.includes(m) ? m : 'exato')

// → [min, max] em centavos, ou null sem valor.
export function faixaValorCentavos(valor, modo) {
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return null
  const c = Math.round(Math.abs(Number(valor)) * 100)
  if (modoValor(modo) === 'exato') return [c, c]
  const base = Math.floor(c / 100) * 100
  return [base, base + 99]
}

export const valorNaFaixa = (amount, faixa) => {
  if (!faixa) return true
  const c = Math.round(Math.abs(Number(amount)) * 100)
  return c >= faixa[0] && c <= faixa[1]
}
