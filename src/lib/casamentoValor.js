// Importar Fatura / Conciliar Fatura — regra ÚNICA de valor e loja no casamento linha × lançamento
// (correção de 12/11/2026, achado do teste com a fatura real).
//
// Problema: estornos de centavos do mesmo dia (0,01; 0,02; 0,03; 0,04; 0,04; 0,05…) casavam com a
// loja errada — a tolerância de ±R$ 0,01 em valor de centavos é de 20% a 100% — e o resultado mudava
// com a ordem dos lançamentos. Regras:
//   • valor abaixo de R$ 1,00: só casa com valor EXATO, ou com ±0,01 se for a MESMA loja;
//   • havendo mais de um par possível, a mesma loja vem antes da diferença de valor;
//   • pareamento determinístico: a ordem das linhas e dos lançamentos não muda o resultado.
// PURO.
import { stripParcelaSuffix, normDescComparacao } from './conciliacaoMatch.js'
import { nomeSemSufixo } from './nomeEstabelecimento.js'

export const VALOR_CENTAVOS = 1 // abaixo de R$ 1,00
export const TOL_VALOR = 0.01

const cent = (v) => Math.round(Math.abs(Number(v) || 0) * 100)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Nome da loja para comparar: sem sufixo de parcela, sem cidade/país, sem pontuação e sem números
// (terminal, códigos). "AMAZON MARKETPLACE   SAO PAULO BR" → "amazon marketplace".
export function lojaNormalizada(descricao) {
  const s = normDescComparacao(nomeSemSufixo(stripParcelaSuffix(descricao))).toLowerCase()
  return s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim()
}

// Mesma loja: o mesmo nome normalizado (ou um começando pelo outro, com 4+ letras: "Raia" ×
// "Raia Drogasil"), ou o mesmo favorecido.
export function mesmaLoja(a, b) {
  const la = lojaNormalizada(a?.description), lb = lojaNormalizada(b?.description)
  if (la && lb) {
    if (la === lb) return true
    if (Math.min(la.length, lb.length) >= 4 && (la.startsWith(`${lb} `) || lb.startsWith(`${la} `))) return true
  }
  const pa = norm(a?.payee), pb = norm(b?.payee)
  return !!pa && pa === pb
}

// O valor de `a` (linha) é compatível com o de `b` (lançamento) dentro de `tol`?
export function valorCompativel(a, b, tol = TOL_VALOR) {
  const va = cent(a?.amount), vb = cent(b?.amount)
  const d = Math.abs(va - vb)
  if (d === 0) return true
  if (d > Math.round(tol * 100)) return false
  if (Math.min(va, vb) < VALOR_CENTAVOS * 100) return mesmaLoja(a, b)
  return true
}

// Chave estável de uma linha ou lançamento (desempate determinístico, sem depender da posição).
export function chaveEstavel(x) {
  return [
    String(x?._dateCartao || x?.dateCartao || x?.date || '').slice(0, 10),
    lojaNormalizada(x?.description), String(cent(x?.amount)).padStart(12, '0'),
    String(x?._installment?.num ?? x?.installmentNum ?? ''), norm(x?.description), String(x?.id ?? x?._id ?? ''),
  ].join('|')
}

// Compara dois pares { linha, tx, ordem: [números] }: menor `ordem` primeiro; empate pelas chaves.
export function compararPares(p, q) {
  for (let i = 0; i < Math.max(p.ordem.length, q.ordem.length); i++) {
    const d = (p.ordem[i] ?? 0) - (q.ordem[i] ?? 0)
    if (d) return d
  }
  const a = chaveEstavel(p.linha), b = chaveEstavel(q.linha)
  if (a !== b) return a < b ? -1 : 1
  const c = chaveEstavel(p.tx), d = chaveEstavel(q.tx)
  return c < d ? -1 : c > d ? 1 : 0
}

// Pareamento 1:1 global: ordena todos os pares possíveis (compararPares) e fica com o melhor de cada
// linha e de cada lançamento. → Map(id da linha → tx).
export function parearUmPraUm(pares, idLinha = (l) => l._id, idTx = (t) => t.id) {
  const out = new Map()
  const usados = new Set()
  for (const p of [...pares].sort(compararPares)) {
    const il = idLinha(p.linha), it = idTx(p.tx)
    if (out.has(il) || usados.has(it)) continue
    out.set(il, p.tx)
    usados.add(it)
  }
  return out
}
