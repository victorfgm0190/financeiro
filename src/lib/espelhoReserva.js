// Perfil dos ESPELHOS automáticos de reserva/investimento (reservaAuto: "Reserva: X",
// "Resgate Reserva: X", "Investimento - X"…). O espelho não tem conta (accountId null); o dono é a
// conta de reserva/investimento da transferência que o gerou (parentTxId):
//   depósito (despesa que não é perna de resgate) → destino da transferência;
//   resgate (receita, ou a perna de despesa do resgate) → origem da transferência.
// Sem transferência-pai resolvível, vale a conta da função de reserva (reservaFuncaoId).
import { isResgateReservaSombra } from '../components/shared/utils.js'

export function contaDonaDoEspelho(tx, txById, funcAccById) {
  const pai = tx.parentTxId ? txById.get(tx.parentTxId) : null
  if (pai?.type === 'transfer') {
    const deposito = tx.type === 'expense' && !isResgateReservaSombra(tx)
    const id = deposito ? pai.toAccountId : pai.accountId
    if (id) return id
  }
  return (tx.reservaFuncaoId && funcAccById.get(tx.reservaFuncaoId)) || null
}

// O espelho entra no perfil? Só no perfil dono da conta; sem dono identificável (ou conta sem
// perfil), como antes: entra em todos.
export function espelhoNoPerfil(tx, { txById, funcAccById, accById, profileAccountIds }) {
  const dono = contaDonaDoEspelho(tx, txById, funcAccById)
  if (!dono || !accById.get(dono)?.profileId) return true
  return profileAccountIds.has(dono)
}
