// GUIA INTERATIVO — o motor único do spotlight (tour da tela). Montado uma vez no App; desenha o
// tour aberto em tourEstado.js:
//   • a tela fica levemente escurecida e só o elemento da vez fica aceso (recorte + contorno pulsante),
//     com um balão ao lado (no celular, uma folha acima da barra inferior);
//   • 1º passo: balão central "Para que serve esta tela"; depois cada item de AJUDA_TELAS da tela na
//     ordem (só os visíveis no ambiente/usuário — mostrar(ctx)); último: "Pronto!" + Concluir;
//   • Voltar / Próximo (Enter) / Pular tour (Esc), indicador "4 de 12", "Não mostrar mais nesta tela";
//   • rola até o elemento; item cujo elemento não existe ou está escondido (menu fechado, sem dados,
//     módulo desligado) é pulado sem erro;
//   • Concluir, Pular ou "Não mostrar mais" = o tour não abre mais sozinho nesta tela (banco).
// Só OBSERVA a interface: não clica, não preenche, não grava nada além da preferência do usuário.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X } from 'lucide-react'
import { guiaDaTela } from '../../lib/ajudaTelas'
import { ocultarGuia, definirGuiasLigados } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'
import { elementoDoItem } from './guiaElementos'
import { useTourAtivo, encerrarTour } from './tourEstado'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MARGEM, LARGURA_BALAO, montarPassos, posicaoBalao } from './tourPassos'

export default function GuiaInterativo() {
  const ativo = useTourAtivo()
  if (!ativo) return null
  return <Tour key={ativo.id} tela={ativo.tela} chaveInicial={ativo.chave} />
}

function Tour({ tela, chaveInicial }) {
  const ctx = useContextoAjuda()
  const isMobile = useIsMobile()
  const guia = useMemo(() => guiaDaTela(tela, ctx), [tela, ctx])
  // Os passos são montados uma vez, na abertura (a tela acabou de desenhar o que tem).
  const [passos] = useState(() => montarPassos(guia, tela))
  const [i, setI] = useState(() => {
    if (!chaveInicial) return 0
    const k = passos.findIndex(p => p.item?.chave === chaveInicial)
    return k > 0 ? k : 0
  })
  const [rect, setRect] = useState(null)
  const [confirmarDesligar, setConfirmarDesligar] = useState(false)
  const balao = useRef(null)
  const [tamBalao, setTamBalao] = useState({ largura: LARGURA_BALAO, altura: 200 })
  const passo = passos[i]
  const total = passos.length

  // Elemento da vez: o guardado, ou de novo pelo data-guia (a tela pode ter redesenhado).
  const alvo = useCallback(() => {
    if (passo?.tipo !== 'item') return null
    if (passo.el?.isConnected && passo.el.getBoundingClientRect().width > 0) return passo.el
    return elementoDoItem(tela, passo.item.chave)
  }, [passo, tela])

  // Rola até o alvo e acompanha a posição dele (rolagem, redimensionamento, tela mudando).
  useLayoutEffect(() => {
    let raf = 0
    let ultimo = ''
    const el = alvo()
    el?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    const medir = () => {
      const e = alvo()
      const r = e ? e.getBoundingClientRect() : null
      const chave = r ? `${r.top}|${r.left}|${r.width}|${r.height}` : ''
      if (chave !== ultimo) { ultimo = chave; setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right } : null) }
      raf = requestAnimationFrame(medir)
    }
    medir()
    return () => cancelAnimationFrame(raf)
  }, [alvo])

  // Elemento sumiu no meio do tour (aba trocou, lista recarregou): segue para o próximo.
  useEffect(() => {
    if (passo?.tipo === 'item' && !alvo()) {
      const t = setTimeout(() => { if (!alvo()) setI(v => Math.min(v + 1, total - 1)) }, 400)
      return () => clearTimeout(t)
    }
  }, [passo, alvo, total])

  // Tamanho do balão (para posicioná-lo sem sair da tela).
  useEffect(() => {
    const b = balao.current
    if (!b || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const r = e.target.getBoundingClientRect()
      setTamBalao(t => (Math.abs(r.width - t.largura) > 1 || Math.abs(r.height - t.altura) > 1 ? { largura: r.width, altura: r.height } : t))
    })
    ro.observe(b)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { balao.current?.focus({ preventScroll: true }) }, [i])

  const fecharMarcando = useCallback(() => { ocultarGuia(tela); encerrarTour() }, [tela])
  const proximo = useCallback(() => { if (i >= total - 1) fecharMarcando(); else setI(i + 1) }, [i, total, fecharMarcando])
  const voltar = () => setI(v => Math.max(0, v - 1))

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharMarcando() }
      else if (e.key === 'Enter' && !e.target.closest?.('button,a,input,textarea,select')) { e.preventDefault(); proximo() }
      else if (e.key === 'ArrowRight') proximo()
      else if (e.key === 'ArrowLeft') voltar()
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [proximo, fecharMarcando])

  if (!guia || !passo) return null
  const comAlvo = passo.tipo === 'item' && rect
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const pos = posicaoBalao(comAlvo ? rect : null, tamBalao, { vw, vh })
  const titulo = passo.tipo === 'intro' ? guia.titulo : passo.tipo === 'fim' ? 'Pronto!' : passo.item.rotulo
  const texto = passo.tipo === 'intro' ? guia.descricao
    : passo.tipo === 'fim' ? 'Você conheceu esta tela. O "?" ao lado do título refaz o tour quando quiser.'
      : passo.item.texto

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="tour-tela">
      {/* Bloqueia cliques na tela durante o tour (só o balão responde). */}
      <div className="absolute inset-0" aria-hidden="true" />
      {comAlvo ? (
        <div aria-hidden="true" className="guia-spotlight absolute rounded-lg pointer-events-none"
          style={{ top: rect.top - MARGEM, left: rect.left - MARGEM, width: rect.width + MARGEM * 2, height: rect.height + MARGEM * 2 }} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[var(--color-guia-escuro)] pointer-events-none" />
      )}
      <div ref={balao} role="dialog" aria-modal="true" aria-label={`Tour: ${guia.titulo}`} tabIndex={-1} data-testid="balao-tour"
        className={isMobile
          ? 'absolute inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] max-h-[45vh] overflow-y-auto bg-surface border-t border-borda-forte rounded-t-2xl shadow-2xl p-4 outline-none'
          : 'absolute bg-surface border border-borda-forte rounded-2xl shadow-2xl p-4 outline-none'}
        style={isMobile ? undefined : { top: pos.top, left: pos.left, width: LARGURA_BALAO }}>
        <div className="flex items-start gap-2">
          <HelpCircle size={18} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-texto-2" data-testid="indicador-tour">{i + 1} de {total}</p>
            <h2 className="text-sm font-semibold text-texto-1">{titulo}</h2>
            <p className="text-sm text-texto-1 mt-1 leading-relaxed">{texto}</p>
          </div>
          <button type="button" onClick={fecharMarcando} aria-label="Fechar tour" title="Pular tour (Esc)"
            className="w-9 h-9 -mr-2 -mt-2 flex items-center justify-center text-texto-2 hover:text-texto-1 shrink-0"><X size={16} /></button>
        </div>

        {passo.tipo === 'intro' && (confirmarDesligar ? (
          <div className="mt-3 rounded-lg border border-borda bg-surface-2 p-2.5 text-xs text-texto-1 space-y-2" role="alert">
            <p>Você pode religar em Configurações › Geral › Guias das telas. A Ajuda continua disponível no menu.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs py-1" onClick={() => setConfirmarDesligar(false)}>Cancelar</button>
              <button type="button" className="btn-primary text-xs py-1" onClick={() => { definirGuiasLigados(false); encerrarTour() }}>Desligar os guias</button>
            </div>
          </div>
        ) : (
          <button type="button" className="mt-2 text-[11px] text-texto-2 underline hover:text-texto-1" onClick={() => setConfirmarDesligar(true)}>
            Não quero guias — desligar todos
          </button>
        ))}

        <div className="flex items-center gap-2 mt-3">
          {i > 0 && <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={voltar}>Voltar</button>}
          {passo.tipo !== 'fim' && <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={fecharMarcando}>Pular tour</button>}
          <button type="button" className="btn-primary text-sm min-h-[40px] ml-auto" onClick={proximo}>
            {passo.tipo === 'fim' ? 'Concluir' : 'Próximo'}
          </button>
        </div>
        {passo.tipo !== 'fim' && (
          <div className="mt-2 pt-2 border-t border-borda">
            <button type="button" className="text-[11px] text-texto-2 hover:text-texto-1" onClick={fecharMarcando}>Não mostrar mais nesta tela</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
