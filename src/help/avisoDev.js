// Só em desenvolvimento (main.jsx, ramo import.meta.env.DEV — fora do build de produção): avisa no
// console, uma vez por item, o que o `npm run help:check` não enxerga no JSX — o DOM montado:
//   • campo visível dentro de um formulário (data-help-form) sem passo (sem data-help-id com conteúdo);
//   • data-help-id na tela sem conteúdo em src/help/.
import { controlesSemPasso } from './guiaPreenchimento.js'
import { helpDoCampo } from './index.js'

const descrever = (el) => {
  const rotulo = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') ||
    el.closest('label')?.textContent?.trim() || el.parentElement?.querySelector('label')?.textContent?.trim() || ''
  return `<${el.tagName.toLowerCase()}${el.type ? ` type=${el.type}` : ''}>${rotulo ? ` "${rotulo.slice(0, 40)}"` : ''}`
}

// Uma varredura → [mensagem] novas (as já avisadas ficam em `vistos`).
export function varrerHelp(doc = document, vistos = new Set()) {
  const novas = []
  const avisar = (chave, msg) => { if (!vistos.has(chave)) { vistos.add(chave); novas.push(msg) } }
  for (const raiz of doc.querySelectorAll('[data-help-form]')) {
    const form = raiz.getAttribute('data-help-form')
    for (const c of controlesSemPasso(raiz)) {
      const d = descrever(c)
      avisar(`campo:${form}:${d}`, `campo sem data-help-id no formulário "${form}": ${d}`)
    }
  }
  for (const el of doc.querySelectorAll('[data-help-id]')) {
    const id = el.getAttribute('data-help-id')
    if (id && !helpDoCampo(id)) avisar(`id:${id}`, `data-help-id "${id}" sem conteúdo em src/help/`)
  }
  return novas
}

export function instalarAvisoHelpDev() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const vistos = new Set()
  let t = 0
  const varrer = () => { for (const m of varrerHelp(document, vistos)) console.warn(`[help:check] ${m}`) }
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(varrer, 800) })
  obs.observe(document.body, { childList: true, subtree: true })
  return () => { clearTimeout(t); obs.disconnect() }
}
