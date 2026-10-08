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
