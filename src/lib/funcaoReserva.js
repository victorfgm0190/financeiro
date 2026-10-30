// Função de reserva PADRÃO de um lançamento sem função (30/10): evita movimento "sem função" na
// conta de reserva quando a escolha é óbvia.
//   • transferência que entra/sai de conta de reserva com UMA só função → essa função
//     (exceto a diferença "saldo a distribuir", que é sem função de propósito);
//   • despesa (cartão) num grupo gerencial NUMERADO cuja conta de reserva tem UMA só função → essa.
// Com mais de uma função a escolha é do usuário: o formulário e a importação exigem.
import { ORIGIN } from './origins.js'

const ehContaReserva = (a) => !!a && (a.isReserva || a.vinculoTipo === 'reserva')

export function funcaoUnicaDaConta(contaId, reserveFunctions) {
  if (!contaId) return null
  const fns = (reserveFunctions || []).filter(f => f.accountId === contaId)
  return fns.length === 1 ? fns[0].id : null
}

// Conta de reserva de um grupo gerencial numerado (number ≠ 1, com conta-origem), ou null.
export function contaReservaDoGrupo(grupoId, gerencialGroups) {
  const g = (gerencialGroups || []).find(x => x.id === grupoId)
  if (!g || typeof g.number !== 'number' || g.number === 1 || !g.defaultAccountId) return null
  return g.defaultAccountId
}

// O grupo exige escolher a função (conta de reserva com MAIS de uma função)?
export function grupoExigeFuncao(grupoId, gerencialGroups, reserveFunctions) {
  const conta = contaReservaDoGrupo(grupoId, gerencialGroups)
  return !!conta && (reserveFunctions || []).filter(f => f.accountId === conta).length > 1
}

export function funcaoPadraoDoLancamento(tx, { accounts, gerencialGroups, reserveFunctions }) {
  if (!tx || tx.reservaFuncaoId) return null
  if (tx.type === 'transfer') {
    if (tx.origin === ORIGIN.RESERVA_A_DISTRIBUIR) return null
    const conta = (id) => (accounts || []).find(a => a.id === id)
    const para = conta(tx.toAccountId), de = conta(tx.accountId)
    if (ehContaReserva(para)) return funcaoUnicaDaConta(para.id, reserveFunctions)
    if (ehContaReserva(de)) return funcaoUnicaDaConta(de.id, reserveFunctions)
    return null
  }
  if (tx.type === 'expense' && tx.grupoGerencial) {
    return funcaoUnicaDaConta(contaReservaDoGrupo(tx.grupoGerencial, gerencialGroups), reserveFunctions)
  }
  return null
}
