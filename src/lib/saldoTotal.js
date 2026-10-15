// "Saldo Total" do Painel: soma do saldo de TODAS as contas recebidas, menos cartões de crédito
// (reservas e investimentos entram). Quem chama passa as contas do perfil ativo (profileAccounts).
// Mesma função no card do Painel desktop e na linha "Saldo total (todas as contas)" do Início mobile.
export function saldoTotalContas(accounts) {
  return (accounts || []).filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)
}
