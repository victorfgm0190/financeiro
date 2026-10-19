// Interface ÚNICA dos importadores (cartão e conta corrente). Todo parser devolve registros:
//
//   { date, description, payee, amount, type, parcela_num, parcela_total, raw }
//
//   date           'YYYY-MM-DD' (data do lançamento no banco / da compra no cartão)
//   description    texto do banco
//   payee          favorecido, quando o arquivo traz ('' quando não)
//   amount         valor ABSOLUTO (> 0)
//   type           'expense' | 'income' (estorno, crédito, depósito)
//   parcela_num    nº da parcela (null = à vista)   parcela_total  total de parcelas (null)
//   raw            a linha original do parser (Itaú/Dindin: a linha do fluxo de sempre;
//                  OFX: { fitid, … }; genérico: as células)
//
// Tudo o que vem depois do parser (revisão, classificação, gerenciais, parcelas futuras,
// cobrança recorrente, duplicatas) recebe a mesma linha — vale para qualquer origem.

import { detectParcela } from '../installments.js'

export function registro({ date, description, payee = '', amount, type, parcela_num = null, parcela_total = null, raw = null }) {
  const desc = String(description || '').replace(/\s+/g, ' ').trim()
  const p = parcela_num == null ? detectParcela(desc) : null
  return {
    date, description: desc, payee: String(payee || '').trim(),
    amount: Math.round(Math.abs(Number(amount) || 0) * 100) / 100,
    type: type === 'income' ? 'income' : 'expense',
    parcela_num: parcela_num ?? p?.num ?? null,
    parcela_total: parcela_total ?? p?.total ?? null,
    raw,
  }
}

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const normalizarTexto = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim()

// 'dmy' (31/12/2026) | 'ymd' (2026-12-31) | 'mdy' (12/31/2026). Aceita / - . como separador,
// ano com 2 dígitos, número de série do Excel e Date.
export function lerData(v, formato = 'dmy') {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const t = String(v).trim().slice(0, 10)
  const m = t.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/)
  if (!m) return null
  let [, a, b, c] = m
  let y, mo, d
  if (formato === 'ymd' || a.length === 4) { y = a; mo = b; d = c }
  else if (formato === 'mdy') { mo = a; d = b; y = c }
  else { d = a; mo = b; y = c }
  if (y.length === 2) y = `20${y}`
  const yi = Number(y), mi = Number(mo), di = Number(d)
  if (!yi || mi < 1 || mi > 12 || di < 1 || di > 31) return null
  return `${yi}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`
}

// Valor com sinal. `decimal` ',' (1.234,56) ou '.' (1,234.56). Aceita "R$", espaços, (12,30),
// 12,30- e o sufixo D/C dos extratos (D = débito, negativo).
export function lerValor(v, decimal = ',') {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN
  let t = String(v ?? '').trim()
  if (!t) return NaN
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (/\s*[Dd]$/.test(t)) { neg = true; t = t.replace(/\s*[Dd]$/, '') } else t = t.replace(/\s*[Cc]$/, '')
  if (/-\s*$/.test(t)) { neg = true; t = t.replace(/-\s*$/, '') }
  t = t.replace(/R\$|\s/gi, '')
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1) } else if (t.startsWith('+')) t = t.slice(1)
  t = decimal === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  if (!/^\d*\.?\d+$/.test(t)) return NaN
  const n = Math.round(Number(t) * 100) / 100
  return neg ? -n : n
}
