import { differenceInDays } from 'date-fns'

// Data de hoje (YYYY-MM-DD, de useHoje) como Date local ao meio-dia. Os cálculos do Dashboard que
// recebiam `new Date()` só usam dia/mês/ano: com o meio-dia o resultado é o mesmo de "agora" no
// mesmo dia, e o valor muda quando o dia vira (useHoje) — sem ficar preso ao dia do 1º cálculo.
export function dataDoDia(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

// Alerta de vencimento do Dashboard: cartões ativos com vencimento em até 5 dias. Vencimento no
// dueDay deste mês; se já passou (inclusive o próprio dia, como antes), o do mês seguinte.
export function alertasVencimentoCartao(accounts, hoje) {
  const agora = dataDoDia(hoje)
  return accounts.filter(a => a.type === 'credit' && a.active !== false).filter(a => {
    let due = new Date(agora.getFullYear(), agora.getMonth(), a.dueDay || 10)
    if (due < agora) due = new Date(agora.getFullYear(), agora.getMonth() + 1, a.dueDay || 10)
    return differenceInDays(due, agora) <= 5
  })
}
