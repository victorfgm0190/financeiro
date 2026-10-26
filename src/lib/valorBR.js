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

// ── Máscara de moeda (InputMoeda) ────────────────────────────────────────────
// Texto digitado ou colado → número. Regras (padrão BR):
// - só vírgula: a última vírgula é o decimal ("1500,5" → 1500.5; "1,234" → 1.23, nunca 1234);
// - só ponto: ponto seguido de exatamente 3 dígitos é milhar ("1.234" → 1234; "1.234.567" → 1234567);
//   com 1–2 dígitos é decimal ("1500.5" → 1500.5);
// - ponto e vírgula juntos: o último separador é o decimal ("1.234,56" e "1,234.56" → 1234.56).
// Casas além da 2ª são descartadas (não arredonda: "100,009" → 100). Aceita "R$", espaços e sinal.
// NaN quando não há dígito.
export function parseMoedaBR(s) {
  const t = String(s ?? '').trim()
  const negativo = /^-|^R\$\s*-|-\s*$/.test(t.replace(/\s/g, '')) || /^\(.*\)$/.test(t)
  const limpo = t.replace(/[^\d.,]/g, '')
  if (!/\d/.test(limpo)) return NaN
  let i = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'))
  // Só pontos e o último seguido de exatamente 3 dígitos: todos são milhar.
  if (i >= 0 && !limpo.includes(',') && /\.\d{3}$/.test(limpo)) i = -1
  const inteiro = (i < 0 ? limpo : limpo.slice(0, i)).replace(/[.,]/g, '') || '0'
  const casas = i < 0 ? '' : limpo.slice(i + 1).replace(/[.,]/g, '').slice(0, 2)
  let n = Number(casas ? `${inteiro}.${casas}` : inteiro)
  if (!Number.isFinite(n)) return NaN
  n = Math.round(n * 100) / 100
  return negativo && n !== 0 ? -n : n
}

const doisDigitos = (n) => {
  const c = Math.round(Math.abs(n) * 100)
  return { inteiro: String(Math.floor(c / 100)), cent: String(c % 100).padStart(2, '0'), neg: n < 0 && c > 0 }
}

// Número → "1.500,50" (milhar e 2 casas). Vazio quando vazio/não numérico — nunca "0,00" por falta de valor.
export function formatarMoedaBR(v) {
  if (v === '' || v == null) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  const { inteiro, cent, neg } = doisDigitos(n)
  return `${neg ? '-' : ''}${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cent}`
}

// Número → "1500,50" (sem milhar), para editar ao entrar no campo. Vazio quando vazio/não numérico.
export function moedaParaEdicao(v) {
  if (v === '' || v == null) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  const { inteiro, cent, neg } = doisDigitos(n)
  return `${neg ? '-' : ''}${inteiro},${cent}`
}
