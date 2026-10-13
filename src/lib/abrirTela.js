// Handoff entre telas: quem navega deixa { ... } no sessionStorage e a tela de destino lê (e apaga)
// uma vez, ao montar. Mesmo mecanismo do "Ir para a fatura" da Integridade.
export const ABRIR_FATURA_KEY = 'finup:abrirFatura'    // { cardId, faturaMesAno } → CreditCardPanel
export const ABRIR_EXTRATO_KEY = 'finup:abrirExtrato'  // { accountId } → AccountsPanel
export const ABRIR_BEM_KEY = 'finup:abrirBem'          // { accountId } → PatrimonioPanel

export function deixarHandoff(key, valor) {
  try { sessionStorage.setItem(key, JSON.stringify(valor)) } catch { /* ignore */ }
}

export function lerHandoff(key) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null')
    sessionStorage.removeItem(key)
    return v
  } catch { return null }
}
