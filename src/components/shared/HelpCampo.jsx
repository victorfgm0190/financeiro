import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { helpDoCampo, textoCurtoDoCampo } from '../../help/index.js'
import { abrirHelpCampo } from '../../help/helpCampoEstado'
import { assinarBoasVindas, estadoBoasVindas } from '../../lib/boasVindasApi'

// ── Help de campo: ícone ⓘ discreto ao lado do rótulo ───────────────────────────────────────────
//   <HelpCampo campo="cartao.fechamento" />   (texto em src/help/<tela>.js)
//   <HelpCampo texto="..." />                 (texto direto, quando não há chave)
// Desktop: abre ao passar o mouse (movimento real — nunca porque a tela mudou debaixo do ponteiro) e ao
// chegar nele pelo Tab (nunca por foco programático). Mobile: abre ao tocar e fecha ao tocar
// fora ou em Esc. O balão vai num portal com posição fixa — não é cortado por modal com rolagem.
// Some quando o usuário desliga "Mostrar ícones de ajuda nos campos" (Configurações › Guias,
// preferência no banco). Clique no ícone não aciona o campo/checkbox do rótulo.
const LARGURA = 240
// Foco vindo do Tab: só ele abre o balão. Foco programático (modal abrindo, guia, atalho) não.
let ultimaFoiTab = false
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { ultimaFoiTab = e.key === 'Tab' }, true)
  window.addEventListener('pointerdown', () => { ultimaFoiTab = false }, true)
  window.addEventListener('mousedown', () => { ultimaFoiTab = false }, true)
}
const focoPorTeclado = () => ultimaFoiTab
// Hover de verdade: o mouse SE MEXEU sobre o ⓘ, num aparelho com mouse. Quando a tela muda debaixo de
// um ponteiro parado (o guia trocou de passo, a folha rolou), o navegador repete o último ponto — do
// mouse ou do último toque — e isso não pode abrir o balão sozinho (Etapa 5). O ouvinte da janela
// roda DEPOIS do ⓘ (fase de bolha): o ⓘ compara com o ponto anterior.
let ultimoPonto = { x: NaN, y: NaN }
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => { ultimoPonto = { x: e.clientX, y: e.clientY } })
}
const mexeuDeVerdade = (e) => e.clientX !== ultimoPonto.x || e.clientY !== ultimoPonto.y
const temMouse = () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(hover: hover)').matches

function useAjudaCamposLigada() {
  const [e, setE] = useState(estadoBoasVindas)
  useEffect(() => assinarBoasVindas(setE), [])
  return e ? e.ajudaCampos !== false : true
}

export default function HelpCampo({ campo, texto }) {
  const ligada = useAjudaCamposLigada()
  const conteudo = texto || textoCurtoDoCampo(campo)
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState(null)
  const fixoRef = useRef(false) // aberto por toque/clique: não fecha ao tirar o mouse
  const btnRef = useRef(null)
  const id = useId()

  const posicionar = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const vw = window.innerWidth || 1024
    const left = Math.max(8, Math.min(r.left + r.width / 2 - LARGURA / 2, vw - LARGURA - 8))
    const acima = r.top > 120
    setPos({ left, top: acima ? r.top - 8 : r.bottom + 8, acima })
  }
  const abrir = () => { posicionar(); setAberto(true) }
  const fechar = () => { fixoRef.current = false; setAberto(false) }
  // Campo da base de help (src/help): clique/toque abre o painel completo (drawer no computador,
  // bottom sheet no celular); passar o mouse continua mostrando o texto curto.
  const completo = !!campo && !!helpDoCampo(campo)
  const acionar = () => {
    if (completo) { fechar(); abrirHelpCampo(campo, { origem: 'icone' }); return }
    if (aberto && fixoRef.current) { fechar(); return }
    fixoRef.current = true
    abrir()
  }

  useEffect(() => {
    if (!aberto) return
    const fora = (ev) => { if (btnRef.current && !btnRef.current.contains(ev.target)) fechar() }
    const esc = (ev) => { if (ev.key === 'Escape') fechar() }
    const mover = () => fechar()
    document.addEventListener('mousedown', fora)
    document.addEventListener('touchstart', fora)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', mover, true)
    window.addEventListener('resize', mover)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('touchstart', fora)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', mover, true)
      window.removeEventListener('resize', mover)
    }
  }, [aberto])

  if (!ligada || !conteudo) return null

  return (
    <>
      {/* span (e não <button>): dentro de um <label>, um botão viraria o "controle" do rótulo —
          o rótulo deixaria de apontar para o campo e clicar no texto acionaria a ajuda.
          Inline (não inline-flex) + .help-campo-cola: o ⓘ fica preso à última palavra do rótulo e nunca
          quebra sozinho para a linha de baixo (Etapa 4, revisão no celular). */}
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        aria-label={`Ajuda: ${conteudo}`}
        aria-describedby={aberto ? id : undefined}
        aria-expanded={completo ? undefined : aberto}
        aria-haspopup={completo ? 'dialog' : undefined}
        data-testid="help-campo"
        className="help-campo-alvo help-campo-cola ml-1 whitespace-nowrap rounded-full text-texto-3 hover:text-texto-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-help p-1 -m-1"
        onMouseMove={(ev) => { if (!aberto && mexeuDeVerdade(ev) && temMouse()) abrir() }}
        onMouseLeave={() => { if (!fixoRef.current) setAberto(false) }}
        onFocus={() => { if (focoPorTeclado()) abrir() }}
        onBlur={() => { if (!fixoRef.current) setAberto(false) }}
        onClick={(ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          acionar()
        }}
        onKeyDown={(ev) => {
          if (ev.key !== 'Enter' && ev.key !== ' ') return
          ev.preventDefault()
          ev.stopPropagation()
          acionar()
        }}
      >
        <Info size={12} aria-hidden="true" className="inline align-middle" />
      </span>
      {aberto && pos && createPortal(
        <span
          id={id}
          role="tooltip"
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: LARGURA, transform: pos.acima ? 'translateY(-100%)' : undefined, zIndex: 9999 }}
          className="block bg-surface border border-borda-forte text-texto-2 text-xs font-normal normal-case tracking-normal leading-snug rounded-lg px-2.5 py-2 shadow-2xl pointer-events-none whitespace-normal text-left"
        >
          {conteudo}
        </span>,
        document.body,
      )}
    </>
  )
}
