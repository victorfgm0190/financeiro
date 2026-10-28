// "Hoje" e datas do dia SEMPRE no calendário de São Paulo, em 'YYYY-MM-DD' (formato do Neon).
// NUNCA use new Date().toISOString().slice(0, 10): toISOString é UTC e, das 21h à meia-noite de
// Brasília, já devolve o dia seguinte. Vale também para a função da Vercel, que roda em UTC.
const FUSO = 'America/Sao_Paulo'

export const hojeSP = (agora = new Date()) => new Date(agora).toLocaleDateString('en-CA', { timeZone: FUSO })

// Date montado com componentes locais (new Date(y, m, d), startOfMonth/endOfMonth do date-fns,
// getFinancialPeriod) → 'YYYY-MM-DD' pelos mesmos componentes locais. toISOString erraria o dia:
// endOfMonth = 23:59:59 local = dia 1º do mês seguinte em UTC.
export const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
