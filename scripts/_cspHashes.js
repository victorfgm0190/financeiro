import { createHash } from 'node:crypto'

// Hashes (CSP 'sha256-…') dos <script> EMBUTIDOS de um HTML. A CSP do vercel.json libera só esses
// scripts embutidos; o teste src/lib/cabecalhosSeguranca.test.js recalcula a partir do index.html
// (com o script injetado pelo vite.config.js) e falha se o vercel.json ficar desatualizado.
export function hashesDosScriptsEmbutidos(html) {
  const out = []
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(html))) out.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`)
  return out
}
