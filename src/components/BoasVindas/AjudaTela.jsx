// GUIA DA TELA — o botão "?" ao lado do título de cada tela e o guia que ele abre (também sozinho, ao
// entrar na tela: useGuiaTela). O guia lista, numerados, os botões e controles da tela; enquanto está
// aberto, cada botão listado ganha um selo com o mesmo número, e passar o mouse/tocar num item
// destaca o botão (contorno pulsante) e rola a tela até ele.
//   • desktop: painel flutuante à direita (não cobre a tela inteira); celular: folha inferior rolável,
//     acima da barra de navegação;
//   • rodapé: "Esconder" (só agora — volta ao recarregar) e "Não mostrar mais" (grava no banco).
// Os botões são achados pelo atributo data-guia="<tela>.<chave>"; o que não estiver visível (menu
// fechado, outra aba) fica na lista sem selo. Textos: src/lib/ajudaTelas.js (AJUDA_TELAS).
// `pagina`: a tela; uma subtela aberta (useSubtelaGuia) com guia próprio vale no lugar dela.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X } from 'lucide-react'
import { ajudaDaTela, guiaDaTela } from '../../lib/ajudaTelas'
import { useSubtelaAtiva } from './subtelaGuia'
import { useContextoAjuda } from './contextoAjuda'
import { useGuiaTela } from './useGuiaTela'
import { useIsMobile } from '../../hooks/useIsMobile'
import { elementoDoItem } from './guiaElementos'

// Posição dos selos (viewport) — recalculada ao rolar, redimensionar e quando a tela muda.
function useSelos(tela, itens, ativo) {
  const [selos, setSelos] = useState([])
  useLayoutEffect(() => {
    if (!ativo) return
    let raf = 0
    const medir = () => {
      raf = 0
      const out = []
      itens.forEach((it, i) => {
        const el = elementoDoItem(tela, it.chave)
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.bottom < 0 || r.top > window.innerHeight) return
        out.push({ chave: it.chave, numero: i + 1, top: Math.max(2, r.top - 8), left: Math.min(window.innerWidth - 22, Math.max(2, r.right - 12)) })
      })
      setSelos(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
    }
    const agendar = () => { if (!raf) raf = requestAnimationFrame(medir) }
    medir()
    window.addEventListener('scroll', agendar, true)
    window.addEventListener('resize', agendar)
    const t = setInterval(agendar, 600) // a tela muda sem rolar (abas, listas carregando)
    return () => { window.removeEventListener('scroll', agendar, true); window.removeEventListener('resize', agendar); clearInterval(t); if (raf) cancelAnimationFrame(raf) }
  }, [tela, itens, ativo])
  return ativo ? selos : []
}

export default function AjudaTela({ pagina, className = '' }) {
  const subtela = useSubtelaAtiva()
  const tela = subtela && ajudaDaTela(subtela) ? subtela : pagina
  const ctx = useContextoAjuda()
  const guia = guiaDaTela(tela, ctx)
  const { aberto, abrir, esconder, naoMostrarMais, oculto } = useGuiaTela(tela)
  const isMobile = useIsMobile()
  const itens = guia?.itens || []
  const selos = useSelos(tela, itens, aberto)
  const destacado = useRef(null)

  const tirarDestaque = useCallback(() => {
    destacado.current?.classList.remove('guia-destaque')
    destacado.current = null
  }, [])
  const destacar = useCallback((chave) => {
    tirarDestaque()
    const el = elementoDoItem(tela, chave)
    if (!el) return
    el.classList.add('guia-destaque')
    destacado.current = el
    const r = el.getBoundingClientRect()
    if (r.top < 60 || r.bottom > window.innerHeight - (isMobile ? window.innerHeight * 0.55 : 20)) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [tela, isMobile, tirarDestaque])
  useEffect(() => { if (!aberto) tirarDestaque() }, [aberto, tirarDestaque])
  useEffect(() => tirarDestaque, [tirarDestaque])
  useEffect(() => {
    if (!aberto) return
    const esc = (e) => { if (e.key === 'Escape') esconder() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto, esconder])

  if (!guia) return null
  const comSelo = new Set(selos.map(s => s.chave))
  return (
    <>
      <button type="button" onClick={abrir} aria-label={`Ajuda: ${guia.titulo}`} title="Guia desta tela"
        className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-texto-2 hover:text-texto-1 hover:bg-surface-hover ${className}`}>
        <HelpCircle size={17} />
      </button>
      {aberto && createPortal(
        <>
          {selos.map(s => (
            <span key={s.chave} aria-hidden="true" data-testid="selo-guia"
              className="fixed z-[85] w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold leading-5 text-center shadow-lg ring-2 ring-surface pointer-events-none"
              style={{ top: s.top, left: s.left }}>{s.numero}</span>
          ))}
          <aside role="dialog" aria-modal="false" aria-label={`Guia: ${guia.titulo}`} data-testid="guia-tela"
            className={isMobile
              ? 'fixed inset-x-0 z-[90] bottom-[calc(68px+env(safe-area-inset-bottom))] max-h-[55vh] flex flex-col bg-surface border-t border-borda-forte rounded-t-2xl shadow-2xl'
              : 'fixed z-[90] right-4 top-20 bottom-4 w-[22rem] max-w-[calc(100vw-2rem)] flex flex-col bg-surface border border-borda-forte rounded-2xl shadow-2xl'}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-borda shrink-0">
              <HelpCircle size={18} className="text-primary-fg shrink-0" />
              <h2 className="text-base font-semibold text-texto-1 flex-1 min-w-0">{guia.titulo}</h2>
              <button type="button" onClick={esconder} aria-label="Fechar guia" className="w-11 h-11 -mr-2 flex items-center justify-center text-texto-2 hover:text-texto-1"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm text-texto-1">
              <p className="leading-relaxed">{guia.descricao}</p>
              {itens.length > 0 && (
                <ol className="space-y-1" onMouseLeave={tirarDestaque}>
                  {itens.map((it, i) => (
                    <li key={it.chave}>
                      <button type="button" className="w-full flex items-start gap-2 text-left rounded-lg px-1.5 py-1.5 hover:bg-surface-hover focus:bg-surface-hover"
                        onMouseEnter={() => destacar(it.chave)} onFocus={() => destacar(it.chave)} onClick={() => destacar(it.chave)}>
                        <span className={`shrink-0 w-5 h-5 mt-0.5 rounded-full text-[11px] font-bold leading-5 text-center ${comSelo.has(it.chave) ? 'bg-primary text-white' : 'bg-surface-2 text-texto-2 border border-borda'}`}>{i + 1}</span>
                        <span className="min-w-0"><span className="font-medium">{it.rotulo}</span> — <span className="leading-relaxed">{it.texto}</span></span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {guia.dicas.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">Dicas</h3>
                  <ul className="list-disc pl-5 space-y-1">{guia.dicas.map(d => <li key={d} className="leading-relaxed">{d}</li>)}</ul>
                </section>
              )}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-borda shrink-0">
              <button type="button" className="btn-secondary flex-1 min-h-[44px]" onClick={esconder}>Esconder</button>
              <button type="button" className="btn-secondary flex-1 min-h-[44px]" onClick={naoMostrarMais} disabled={oculto}
                title={oculto ? 'Este guia já não abre sozinho. Para voltar, use Configurações › Guias das telas.' : 'Este guia não abre mais sozinho nesta tela (em nenhum aparelho). O "?" continua funcionando.'}>
                {oculto ? 'Não abre sozinho' : 'Não mostrar mais'}
              </button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  )
}
