// Gera os ícones do app (PWA, iOS e favicon) a partir da logo oficial: public/brand/finup-logo.svg.
//
//   node scripts/gerar-icones.mjs
//
// A logo é horizontal (símbolo + "Finup"); o texto fica ilegível em ícone, então só o SÍMBOLO entra:
// o primeiro <rect> da logo (o quadrado da marca) e o <g> desenhado sobre ele. Trocou a logo? Rode de
// novo — nada aqui depende do desenho, só dessa estrutura (rect de fundo + g do símbolo).
//
// Saída em public/icons/:
//   icon-192.png, icon-512.png        purpose "any": o símbolo como é (cantos arredondados, fundo transparente)
//   icon-maskable-512.png             purpose "maskable": fundo sólido da marca, desenho no centro dentro
//                                     da zona segura (círculo de 80%), sem transparência
//   apple-touch-icon.png (180)        fundo sólido (o iOS não aceita transparência; ele mesmo arredonda)
//   favicon-32.png, favicon-16.png,   o símbolo com traço um pouco mais grosso (legível a 16px)
//   favicon.svg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const LOGO = `${raiz}public/brand/finup-logo.svg`
const SAIDA = `${raiz}public/icons/`

const svg = readFileSync(LOGO, 'utf8')
const rect = svg.match(/<rect\b[^>]*\/>/)?.[0]
const grupo = svg.match(/<g\b[\s\S]*?<\/g>/)?.[0]
if (!rect || !grupo) throw new Error(`${LOGO}: esperado um <rect> (fundo do símbolo) e um <g> (desenho do símbolo)`)
const attr = (tag, nome) => tag.match(new RegExp(`\\b${nome}="([^"]*)"`))?.[1]
const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(n => Number(attr(rect, n) || 0))
const COR_MARCA = attr(rect, 'fill')
if (!w || !h || !COR_MARCA) throw new Error(`${LOGO}: <rect> sem width/height/fill`)

// Traço mais grosso para tamanhos minúsculos (só multiplica o stroke-width que a logo já tem).
const engrossar = (g, fator) => g.replace(/stroke-width="([\d.]+)"/, (_, v) => `stroke-width="${+(v * fator).toFixed(2)}"`)

// O símbolo inteiro (quadrado arredondado + desenho), recortado no quadrado.
const simbolo = ({ g = grupo } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${rect}${g}</svg>`

// Só o desenho, sobre fundo sólido de ponta a ponta; `zoom` > 1 aproxima a partir do centro.
const desenhoSobreFundo = zoom => {
  const vw = w / zoom, vh = h / zoom
  const vx = x + (w - vw) / 2, vy = y + (h - vh) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}">` +
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${COR_MARCA}"/>${grupo}</svg>`
}

const png = (fonte, tamanho, { opaco = false } = {}) => {
  let s = sharp(Buffer.from(fonte), { density: 72 * Math.ceil(tamanho / 48) * 2 }).resize(tamanho, tamanho)
  if (opaco) s = s.flatten({ background: COR_MARCA })
  return s.png({ compressionLevel: 9 }).toBuffer()
}

mkdirSync(SAIDA, { recursive: true })
const favicon = simbolo({ g: engrossar(grupo, 1.4) })
const arquivos = {
  'icon-192.png': await png(simbolo(), 192),
  'icon-512.png': await png(simbolo(), 512),
  // Desenho com ~50% da largura: folga larga dentro do círculo de 80% (zona segura do maskable).
  'icon-maskable-512.png': await png(desenhoSobreFundo(1.1), 512, { opaco: true }),
  'apple-touch-icon.png': await png(desenhoSobreFundo(1.15), 180, { opaco: true }),
  'favicon-32.png': await png(favicon, 32),
  'favicon-16.png': await png(favicon, 16),
  'favicon.svg': favicon + '\n',
}
for (const [nome, conteudo] of Object.entries(arquivos)) {
  writeFileSync(SAIDA + nome, conteudo)
  console.log(`public/icons/${nome}`)
}
console.log(`cor da marca: ${COR_MARCA}`)
