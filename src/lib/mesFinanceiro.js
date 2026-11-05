// Mês financeiro do cliente (Configurações › Período): dia de início + modo. Puro — usado pela tela e
// pelo servidor (virada de saldo das reservas). Mesma regra de getFinancialPeriod (AppContext):
//   • modo "calendar": do dia 1 ao último dia do mês;
//   • modo "custom": do dia de início até a véspera do dia de início do mês seguinte
//     (dia 15 → 15/10 a 14/11; o dia 15 já pertence ao mês novo).
// Mês com menos dias que o dia configurado (ex.: dia 31 em fevereiro): o início cai no último dia
// do mês — a tela de Configurações limita a 28, mas o cálculo não pode pular nem repetir dias.

const pad = (n) => String(n).padStart(2, '0')

export function iso(y, m0, d) {
  const dt = new Date(y, m0, d)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export function somarDias(dataIso, n) {
  const [y, m, d] = String(dataIso).slice(0, 10).split('-').map(Number)
  return iso(y, m - 1, d + n)
}

const ultimoDiaDoMes = (y, m0) => new Date(y, m0 + 1, 0).getDate()

// { startDay, mode } a partir das configurações do app (settings) ou da linha configuracoes.
export function configDoMes(settings = {}) {
  const startDay = Number(settings.financialMonthStartDay ?? settings.financial_month_start_day) || 1
  const modo = settings.financialMonthMode ?? settings.financial_month_mode
  return { startDay: Math.min(Math.max(Math.trunc(startDay), 1), 31), mode: modo === 'calendar' ? 'calendar' : 'custom' }
}

// Dia em que começa o mês financeiro que abre no mês-calendário (y, m0).
function inicioNoMesCalendario(y, m0, cfg) {
  const dia = cfg.mode === 'calendar' ? 1 : Math.min(cfg.startDay, ultimoDiaDoMes(y, m0))
  return iso(y, m0, dia)
}

// Mês financeiro que contém `dataIso`: { inicio, fim } (YYYY-MM-DD, inclusive).
export function mesFinanceiroDe(dataIso, cfg) {
  const [y, m] = String(dataIso).slice(0, 10).split('-').map(Number)
  let ay = y
  let am = m - 1
  let inicio = inicioNoMesCalendario(ay, am, cfg)
  if (dataIso < inicio) {
    const ant = new Date(y, m - 2, 1)
    ay = ant.getFullYear()
    am = ant.getMonth()
    inicio = inicioNoMesCalendario(ay, am, cfg)
  }
  const prox = new Date(ay, am + 1, 1)
  const fim = somarDias(inicioNoMesCalendario(prox.getFullYear(), prox.getMonth(), cfg), -1)
  return { inicio, fim }
}

// Meses financeiros ENCERRADOS e ainda sem virada, em ordem cronológica.
//   ultimoCorte = último dia do último período fechado (data_fim do snapshot mais recente), ou null.
//   Com corte: o primeiro pendente começa no dia seguinte a ele (pode ser um mês parcial, se o dia
//   de início mudou) e vai até o fim do mês financeiro desse dia; os demais são meses cheios.
//   Sem corte (nunca houve virada): só o último mês encerrado, acumulando desde o começo.
// Encerrado = fim < hoje (dia 15 → no dia 15/11 o mês de 15/10 a 14/11 já está encerrado).
export function mesesPendentes({ ultimoCorte, hoje, cfg, limite = 60 }) {
  if (!ultimoCorte) {
    const atual = mesFinanceiroDe(hoje, cfg)
    const anterior = mesFinanceiroDe(somarDias(atual.inicio, -1), cfg)
    return [{ ...anterior, primeiro: true }]
  }
  const out = []
  let inicio = somarDias(ultimoCorte, 1)
  while (out.length < limite) {
    const { fim } = mesFinanceiroDe(inicio, cfg)
    if (fim >= hoje) break
    out.push({ inicio, fim })
    inicio = somarDias(fim, 1)
  }
  return out
}

// "15/10/2026" a partir de "2026-10-15".
export const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
export const rotuloMes = (m) => `${dataBR(m.inicio)} a ${dataBR(m.fim)}`
