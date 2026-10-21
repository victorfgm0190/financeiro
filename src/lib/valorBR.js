// Valor monetário digitado no padrão BR → número. NaN quando vazio ou inválido.
//   Com vírgula: vírgula = decimal, pontos = milhar          ("1.234,56" → 1234.56, "341,7" → 341.7)
//   Sem vírgula, ponto + exatamente 3 dígitos em cada grupo = milhar ("1.234" → 1234, "12.345.678")
//   Sem vírgula, ponto + 1 ou 2 dígitos = decimal            ("341.7", "341.70")
//   Sem separador: inteiro                                   ("350" → 350)
export function parseValorBR(s) {
  const t = String(s ?? '').replace(/\s|R\$/g, '')
  if (!t) return NaN
  if (t.includes(',')) {
    if (!/^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/.test(t)) return NaN
    return Number(t.replace(/\./g, '').replace(',', '.'))
  }
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  if (/^-?\d+(\.\d{1,2})?$/.test(t)) return Number(t)
  return NaN
}

// Número → texto para input de valor no padrão BR ("341,70"). Vazio quando não numérico.
export function valorParaInput(v) {
  const n = Number(v)
  if (v === '' || v == null || !Number.isFinite(n)) return ''
  return n.toFixed(2).replace('.', ',')
}

// Enquanto digita: só dígitos, ponto e vírgula; no máximo 2 casas depois da vírgula ("100,000" → "100,00").
export function digitandoValorBR(s) {
  const t = String(s ?? '').replace(/[^\d.,]/g, '')
  const i = t.indexOf(',')
  if (i < 0) return t
  return t.slice(0, i + 1) + t.slice(i + 1).replace(/[.,]/g, '').slice(0, 2)
}

// Valor formatado no padrão BR com milhar e 2 casas ("3.900,00"). Vazio quando não numérico.
export function valorBRFormatado(v) {
  const n = typeof v === 'number' ? v : parseValorBR(v)
  if (v === '' || v == null || !Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
