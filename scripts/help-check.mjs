// npm run help:check — confere a base do help de campo contra o código (Etapa 6).
// Lista, por tela:
//   1. CAMPOS SEM data-help-id: controle (input, select, textarea, seletores do app, liga/desliga)
//      dentro de um formulário com data-help-form que não está num contêiner data-help-id
//      (nem marcado data-guia-fora). Análise do JSX de cada arquivo — o que vem de outro componente
//      é conferido em tempo de execução (aviso no console em dev: src/help/avisoDev.js).
//   2. IDS SEM CONTEÚDO: data-help-id="…" / <HelpCampo campo="…"> que não existe em src/help/.
//   3. CONTEÚDO PENDENTE: campo da base marcado `pendente` ou sem relacaoComTela.
// Sai com código 1 quando há qualquer item (limpo = 0). Nada específico de cliente.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as espree from 'espree'

// Componentes do app que são um campo (além de input/select/textarea).
export const COMPONENTES_CAMPO = new Set(['SearchableSelect', 'InputMoeda', 'DateInput', 'CategorySelect', 'TipoDocumentoSelect', 'Toggle', 'CampoValor', 'FavorecidoAutocomplete', 'TransferenciaPerfisCategorias', 'FimRepeticao'])
const INPUT_FORA = new Set(['hidden', 'submit', 'button', 'reset', 'image'])

const nomeDo = (n) => n?.type === 'JSXIdentifier' ? n.name : n?.type === 'JSXMemberExpression' ? `${nomeDo(n.object)}.${n.property.name}` : ''
const attr = (el, nome) => el.openingElement.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === nome)
const valorLiteral = (a) => {
  const v = a?.value
  if (!v) return a ? true : null
  if (v.type === 'Literal') return v.value
  if (v.type === 'JSXExpressionContainer' && v.expression.type === 'Literal') return v.expression.value
  if (v.type === 'JSXExpressionContainer' && v.expression.type === 'TemplateLiteral' && !v.expression.expressions.length) return v.expression.quasis[0].value.cooked
  return undefined // dinâmico
}

function ehControle(el, locais = new Set()) {
  const nome = nomeDo(el.openingElement.name)
  if (nome === 'input') { const t = valorLiteral(attr(el, 'type')); return !(typeof t === 'string' && INPUT_FORA.has(t)) }
  if (nome === 'select' || nome === 'textarea' || COMPONENTES_CAMPO.has(nome) || locais.has(nome)) return true
  return valorLiteral(attr(el, 'role')) === 'switch' || valorLiteral(attr(el, 'aria-haspopup')) === 'listbox'
}

// Contêiner que dá o passo ao controle: data-help-id / data-guia-fora, ou componente do app que
// repassa o id para data-help-id (props help, ajuda, helpId — ex.: <Campo help="…">, <CategorySelect helpId="…">).
// Em help/ajuda (que em alguns componentes é texto), só vale um id 'tela.campo' ou uma expressão.
const ID = /^[a-zA-Z]+\.[a-zA-Z0-9]+$/
const PROPS_ID = ['help', 'ajuda', 'helpId']
const idDaProp = (el) => {
  if (!/^[A-Z]/.test(nomeDo(el.openingElement.name))) return null
  for (const n of PROPS_ID) {
    const a = attr(el, n)
    if (!a) continue
    const v = valorLiteral(a)
    if (v === undefined) return true // dinâmico: o componente repassa
    if (typeof v === 'string' && ID.test(v)) return v
  }
  return null
}
const cobre = (el) => !!(attr(el, 'data-help-id') || attr(el, 'data-guia-fora') || idDaProp(el))

// Componentes do próprio arquivo que desenham um campo (ex.: LinhaToggle): o uso deles é um campo.
function componentesLocaisComCampo(ast) {
  const nomes = new Set()
  // Só conta controle que o próprio componente não cobre (ex.: CamposRepasse usa <Campo help>).
  const temControle = (no) => {
    if (!no || typeof no.type !== 'string') return false
    if (no.type === 'JSXElement') { if (cobre(no)) return false; if (ehControle(no)) return true }
    return Object.keys(no).some(k => k !== 'loc' && k !== 'range' && (Array.isArray(no[k]) ? no[k].some(temControle) : no[k] && typeof no[k].type === 'string' && temControle(no[k])))
  }
  for (let st of ast.body) {
    if (st.type === 'ExportNamedDeclaration' && st.declaration) st = st.declaration
    if (st.type === 'FunctionDeclaration' && /^[A-Z]/.test(st.id?.name || '') && temControle(st.body)) nomes.add(st.id.name)
    if (st.type === 'VariableDeclaration') {
      for (const d of st.declarations) {
        if (/^[A-Z]/.test(d.id?.name || '') && /Function/.test(d.init?.type || '') && temControle(d.init.body)) nomes.add(d.id.name)
      }
    }
  }
  return nomes
}

// Um arquivo → { controles sem id: [{ linha, nome, form }], ids usados: [{ id, linha }] }.
export function analisarArquivo(codigo) {
  const ast = espree.parse(codigo, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true })
  const semId = []
  const ids = []
  const locais = componentesLocaisComCampo(ast)
  const andar = (no, pilha) => {
    if (!no || typeof no.type !== 'string') return
    let p = pilha
    if (no.type === 'JSXElement') {
      const nome = nomeDo(no.openingElement.name)
      const idAqui = valorLiteral(attr(no, 'data-help-id'))
      if (typeof idAqui === 'string') ids.push({ id: idAqui, linha: no.loc.start.line })
      if (nome === 'HelpCampo') { const c = valorLiteral(attr(no, 'campo')); if (typeof c === 'string') ids.push({ id: c, linha: no.loc.start.line }) }
      const daProp = idDaProp(no)
      if (typeof daProp === 'string') ids.push({ id: daProp, linha: no.loc.start.line })
      p = [...pilha, no]
      const form = [...p].reverse().find(e => attr(e, 'data-help-form'))
      if (form && ehControle(no, locais)) {
        const coberto = p.slice(p.indexOf(form)).some(cobre)
        if (!coberto) semId.push({ linha: no.loc.start.line, nome, form: valorLiteral(attr(form, 'data-help-form')) || '?' })
      }
    }
    for (const k of Object.keys(no)) {
      if (k === 'parent' || k === 'loc' || k === 'range') continue
      const v = no[k]
      if (Array.isArray(v)) v.forEach(x => andar(x, p))
      else if (v && typeof v.type === 'string') andar(v, p)
    }
  }
  andar(ast, [])
  return { semId, ids }
}

const PERMITIDOS_SEM_RELACAO = new Set() // nenhum: todo campo explica a relação com a tela
export function conteudoPendente(CAMPOS) {
  return Object.entries(CAMPOS)
    .filter(([id, c]) => !PERMITIDOS_SEM_RELACAO.has(id) && (c.pendente || !String(c.relacaoComTela || '').trim()))
    .map(([id]) => id)
}

// arquivos: [{ caminho, codigo }] → relatório.
export function checar(arquivos, { CAMPOS, telaDoCampo }) {
  const semId = []
  const semConteudo = []
  for (const { caminho, codigo } of arquivos) {
    let r
    try { r = analisarArquivo(codigo) } catch (e) { semId.push({ caminho, linha: e.lineNumber || 0, nome: `(não deu para ler: ${e.message})`, form: '?' }); continue }
    for (const s of r.semId) semId.push({ caminho, ...s })
    for (const u of r.ids) if (!CAMPOS[u.id]) semConteudo.push({ caminho, ...u })
  }
  const pendentes = conteudoPendente(CAMPOS).map(id => ({ id, tela: telaDoCampo(id) }))
  return { semId, semConteudo, pendentes, limpo: !semId.length && !semConteudo.length && !pendentes.length }
}

function listarJsx(dir) {
  const out = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...listarJsx(p))
    else if (/\.jsx$/.test(n) && !/\.test\.jsx$/.test(n)) out.push(p)
  }
  return out
}

async function main() {
  const raiz = fileURLToPath(new URL('..', import.meta.url))
  const base = await import(pathToFileURL(join(raiz, 'src/help/index.js')).href)
  const arquivos = listarJsx(join(raiz, 'src')).map(c => ({ caminho: relative(raiz, c).split(sep).join('/'), codigo: readFileSync(c, 'utf8') }))
  const r = checar(arquivos, base)
  const grupo = (itens, chave) => itens.reduce((m, i) => ((m[i[chave] || '?'] ||= []).push(i), m), {})
  if (r.semId.length) {
    console.log(`\n✗ Campos sem data-help-id (${r.semId.length}):`)
    for (const [arq, itens] of Object.entries(grupo(r.semId, 'caminho'))) {
      console.log(`  ${arq}`)
      for (const i of itens) console.log(`    linha ${i.linha}: <${i.nome}> no formulário "${i.form}"`)
    }
  }
  if (r.semConteudo.length) {
    console.log(`\n✗ Ids sem conteúdo em src/help/ (${r.semConteudo.length}):`)
    for (const i of r.semConteudo) console.log(`  ${i.id}  (${i.caminho}:${i.linha})`)
  }
  if (r.pendentes.length) {
    console.log(`\n✗ Conteúdo pendente (sem relacaoComTela) (${r.pendentes.length}):`)
    for (const [tela, itens] of Object.entries(grupo(r.pendentes, 'tela'))) console.log(`  ${tela}: ${itens.map(i => i.id).join(', ')}`)
  }
  console.log(r.limpo ? '\n✓ help:check limpo.' : '')
  process.exitCode = r.limpo ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
