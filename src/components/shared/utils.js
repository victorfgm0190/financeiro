export function fmt(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value ?? 0)
}

export function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
