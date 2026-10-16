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
