import { faturaToDate } from './parcelas'

// Data de hoje (YYYY-MM-DD, de useHoje) como Date local ao meio-dia. Os cálculos do Dashboard que
// recebiam `new Date()` só usam dia/mês/ano: com o meio-dia o resultado é o mesmo de "agora" no
// mesmo dia, e o valor muda quando o dia vira (useHoje) — sem ficar preso ao dia do 1º cálculo.
export function dataDoDia(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

const mesSeguinte = (yyyymm) => {
  const [y, m] = yyyymm.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
// Dias de calendário entre duas datas YYYY-MM-DD (data contra data, sem hora nem horário de verão).
export const diasEntre = (de, ate) => {
  const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(ate) - utc(de)) / 86400000)
}

export const DIAS_ALERTA_VENCIMENTO = 5

// Próximo vencimento do cartão a partir de `hoje` (YYYY-MM-DD): o do mês corrente enquanto não
// passou (o próprio dia conta); a partir do dia seguinte, o do mês seguinte. Dia que não existe no
// mês (ex.: 31 em fevereiro) vira o último dia do mês (faturaToDate). Sem dueDay: dia 10 (como antes).
export function proximoVencimentoCartao(dueDay, hoje) {
  const dia = dueDay || 10
  const mes = hoje.slice(0, 7)
  const desteMes = faturaToDate(mes, dia)
  return desteMes >= hoje ? desteMes : faturaToDate(mesSeguinte(mes), dia)
}

// Fonte ÚNICA do "próximo vencimento" do cartão nas telas (Dashboard, selo "Próxima fatura" de
// Contas, Alertas e o contador do menu): { vencimento: 'YYYY-MM-DD', dias } — dias de calendário
// de hoje até o vencimento (0 = vence hoje).
export function vencimentoDoCartao(dueDay, hoje) {
  const vencimento = proximoVencimentoCartao(dueDay, hoje)
  return { vencimento, dias: diasEntre(hoje, vencimento) }
}

// Cartões ativos ordenados do vencimento mais próximo ao mais distante; empate → maior fatura do
// mês (creditMonthBill). → [{ account, vencimento, dias }].
export function cartoesPorVencimento(accounts, hoje) {
  return accounts
    .filter(a => a.type === 'credit' && a.active !== false)
    .map(a => ({ account: a, ...vencimentoDoCartao(a.dueDay, hoje) }))
    .sort((x, y) => x.dias - y.dias || (y.account.creditMonthBill || 0) - (x.account.creditMonthBill || 0))
}

// Alerta de vencimento: cartões ativos que vencem de hoje até 5 dias de calendário à frente
// (vencimento dia 13 → aparece de 08 a 13), na ordem de cartoesPorVencimento.
export function alertasVencimentoCartao(accounts, hoje) {
  return cartoesPorVencimento(accounts, hoje).filter(x => x.dias <= DIAS_ALERTA_VENCIMENTO)
}

// Texto curto do selo "Próxima fatura" (Contas): "vence hoje" / "1 dia" / "N dias".
export const textoDiasCurto = (dias) => (dias === 0 ? 'vence hoje' : `${dias} dia${dias === 1 ? '' : 's'}`)

export const textoVencimento = (dias) => (dias === 0 ? 'vence hoje' : `vence em ${dias} dia${dias === 1 ? '' : 's'}`)
