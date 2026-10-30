// Nome PARECIDO (sem nomes fixos): o banco corta e cola o nome do estabelecimento ("BARBEARIACONS")
// e põe prefixo de intermediador de pagamento ("MP *", "PG*", "IFD*"…). Só serve para SUGERIR
// (agendamento/favorecido parecido) — nunca para dar baixa ou trocar o favorecido sozinho. PURO.
import { normalizarTermo } from './texto.js'

export const MIN_LETRAS_PREFIXO = 6

// Prefixo de intermediador pelo FORMATO, não por lista: 2 a 4 letras e um "*" no início.
const RE_INTERMEDIADOR = /^\s*[a-z]{2,4}\s?\*\s*/i

export const semIntermediador = (s) => String(s ?? '').replace(RE_INTERMEDIADOR, '')

// Sem intermediador, sem acento, minúsculas, sem espaços e sem símbolos.
export const nomeCompacto = (s) => normalizarTermo(semIntermediador(s)).replace(/[^a-z0-9]/g, '')

// Um é prefixo do outro, com pelo menos 6 letras no menor ("barbeariacons" ⊂ "barbeariaconstancia").
export function prefixoParecido(a, b) {
  const x = nomeCompacto(a), y = nomeCompacto(b)
  if (Math.min(x.length, y.length) < MIN_LETRAS_PREFIXO) return false
  return x.startsWith(y) || y.startsWith(x)
}

// Algum nome de um lado é parecido com algum do outro.
export const algumParecido = (as, bs) => as.filter(Boolean).some(a => bs.filter(Boolean).some(b => prefixoParecido(a, b)))
