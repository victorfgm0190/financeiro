// Ciclo financeiro (mês financeiro) — movido de src/context/AppContext.jsx SEM mudar nada, para o
// "Verificar e corrigir" (lib/verificarCartao) usar a MESMA regra do motor da fatura.
// Janela do ciclo financeiro CORRENTE, a partir de settings. Mesma regra de getFinancialPeriod.
// Pura e compartilhada: o motor (reconcileFaturaState) e o reconcile por lançamento
// (applyEnsureGerencial) precisam concordar sobre o que é "fatura passada" — cópias
// independentes desse cálculo são justamente como os dois divergiram.
export function cicloFinanceiroAtual(settings, ref = new Date()) {
  if ((settings?.financialMonthMode || 'custom') === 'calendar') {
    return {
      start: new Date(ref.getFullYear(), ref.getMonth(), 1),
      end: new Date(ref.getFullYear(), ref.getMonth() + 1, 0),
    }
  }
  const startDay = settings?.financialMonthStartDay || 1
  return ref.getDate() >= startDay
    ? { start: new Date(ref.getFullYear(), ref.getMonth(), startDay),
        end: new Date(ref.getFullYear(), ref.getMonth() + 1, startDay - 1) }
    : { start: new Date(ref.getFullYear(), ref.getMonth() - 1, startDay),
        end: new Date(ref.getFullYear(), ref.getMonth(), startDay - 1) }
}
