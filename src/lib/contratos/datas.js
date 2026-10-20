// Datas do módulo de Contratos, só em texto ('AAAA-MM' / 'AAAA-MM-DD'): nada de Date, sem fuso.

const pad = (n) => String(n).padStart(2, '0')

export const ymDe = (data) => String(data || '').slice(0, 7)

export function addMeses(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`
}

export function mesesEntre(ymA, ymB) {
  const [ya, ma] = ymA.split('-').map(Number)
  const [yb, mb] = ymB.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

const ultimoDia = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Dia `dia` do mês `ym`; mês sem esse dia → último dia (31 → 28/02).
export const diaNoMes = (ym, dia) => `${ym}-${pad(Math.min(Number(dia) || 1, ultimoDia(ym)))}`

export const diaDe = (data) => Number(String(data || '').slice(8, 10)) || null

export function addMesesData(data, n) {
  return diaNoMes(addMeses(ymDe(data), n), diaDe(data))
}

export const hojeStr = (agora = new Date()) =>
  `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`

export const fmtYm = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '—')
