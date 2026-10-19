// Navegação por teclado: elementos focáveis de um container e mover o foco "como o Tab faria".
// Usado pelo focus trap do Modal e pelo SearchableSelect (Tab com o menu aberto segue para o
// próximo campo, em vez de cair no <body> quando o menu — portado — é desmontado).

const SELETOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focaveis(container) {
  if (!container) return []
  return [...container.querySelectorAll(SELETOR)].filter(el =>
    el.tabIndex !== -1 && !el.closest('[inert]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0))
}

// Container do "escopo de Tab" de um elemento: o modal aberto que o contém, senão o documento.
export const escopoDoFoco = (el) => el?.closest?.('[data-modal-painel]') || document.body

// Foca o próximo (ou anterior) focável depois de `el`, dentro do escopo, circulando.
export function moverFoco(el, voltar = false) {
  const lista = focaveis(escopoDoFoco(el))
  if (!lista.length) return
  const i = lista.indexOf(el)
  const alvo = i < 0 ? lista[0] : lista[(i + (voltar ? -1 : 1) + lista.length) % lista.length]
  alvo.focus()
}
