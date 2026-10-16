// Status efetivo (Registrado/Pendente) de um lançamento para exibição.
//
// Lançamentos automáticos de reserva/investimento (`reservaAuto`, ids tx_rsg_/tx_res_/tx_inv_)
// são sombras de categoria SEM conta, gerados junto com a transferência que os origina
// (buildReservaAutoTxs). Nunca são conciliados (não aparecem em extrato nenhum), então o próprio
// `reconciled` deles é sempre false e não diz nada. Regra:
//   • sombra com parentTxId e pai encontrado → herda o `reconciled` da transferência de origem;
//   • sombra sem pai (legado, sem parent_tx_id) → Registrado se a data já chegou;
//   • qualquer outro lançamento → o próprio `reconciled`.
// `txById` é um Map id → lançamento (para achar o pai); `hoje` = 'YYYY-MM-DD'.
export const STATUS = { REGISTRADO: 'registrado', PENDENTE: 'pendente' }

export function paiDaSombra(tx, txById) {
  if (!tx?.reservaAuto || !tx.parentTxId) return null
  return txById?.get(tx.parentTxId) || null
}

export function getEffectiveStatus(tx, txById, hoje) {
  if (tx?.reservaAuto) {
    const pai = paiDaSombra(tx, txById)
    if (pai) return pai.reconciled ? STATUS.REGISTRADO : STATUS.PENDENTE
    if (!tx.parentTxId) return (tx.date && hoje && tx.date <= hoje) ? STATUS.REGISTRADO : STATUS.PENDENTE
  }
  return tx?.reconciled ? STATUS.REGISTRADO : STATUS.PENDENTE
}
