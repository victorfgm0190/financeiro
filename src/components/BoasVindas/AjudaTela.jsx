// "?" DE CADA TELA — o ponto único de ajuda da tela. Toque abre um menu:
//   • "Tour desta tela" (sempre funciona, mesmo com "Não mostrar mais") — GuiaInterativo;
//   • "Ver todas as funções desta tela" — painel com a lista numerada e um selo com o mesmo número em
//     cima de cada botão (passar o mouse/tocar no item destaca o botão e rola até ele);
//   • "Faça comigo" — as tarefas guiadas da tela (✓ nas já concluídas);
//   • "Voltar a mostrar o tour sozinho nesta tela" — só se a tela estiver marcada "Não mostrar mais".
// O tour abre SOZINHO na primeira visita (useGuiaTela). Com os guias desligados (Configurações ›
// Geral › Guias das telas), o "?" não aparece. Botões achados por data-guia="<tela>.<chave>".
// Textos: src/lib/ajudaTelas.js (AJUDA_TELAS). `pagina`: a tela; uma subtela aberta (useSubtelaGuia)
// com guia próprio vale no lugar dela.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X, Play, ListOrdered, RotateCcw, LayoutGrid, Hand, Check, BookOpen } from 'lucide-react'
import { navegarPara } from '../../lib/abrirTela'
import { ajudaHash } from '../../lib/ajudaRota'
import { ajudaDaTela, guiaDaTela } from '../../lib/ajudaTelas'
import { useSubtelaAtiva } from './subtelaGuia'
import { useContextoAjuda } from './contextoAjuda'
import { useGuiaTela, useEstadoBoasVindas } from './useGuiaTela'
import { tarefasDaTela } from '../../lib/tarefasGuiadas'
import { iniciarTarefa } from './tourEstado'
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
  // Configurações: na primeira visita, o tour geral (abas) vem antes do tour da seção.
  const telaGeral = pagina === 'settings' && tela !== pagina && ajudaDaTela(pagina) ? pagina : null
  const { ligados, oculto, listaAberta: aberto, abrirTour, abrirLista, fecharLista: esconder, voltarAMostrar } = useGuiaTela(tela, { primeiraTela: telaGeral })
  const [menu, setMenu] = useState(false)
  const estadoBv = useEstadoBoasVindas()
  const feitas = estadoBv?.progresso?.tarefas || {}
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menu) return
    const fora = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false) }
    const esc = (e) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc) }
  }, [menu])
  const isMobile = useIsMobile()
  const tarefas = tarefasDaTela(tela, ctx, { celular: isMobile })
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

  if (!guia || !ligados) return null
  const comSelo = new Set(selos.map(s => s.chave))
  const opcao = 'w-full flex items-center gap-2 px-3 min-h-[40px] text-left text-sm text-texto-1 hover:bg-surface-hover rounded-lg'
  return (
    <>
      <span className="relative inline-flex" ref={menuRef}>
        <button type="button" onClick={() => setMenu(v => !v)} aria-label={`Ajuda: ${guia.titulo}`} title="Ajuda desta tela"
          aria-haspopup="menu" aria-expanded={menu}
          className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-texto-2 hover:text-texto-1 hover:bg-surface-hover ${className}`}>
          <HelpCircle size={17} />
        </button>
        {menu && (
          <div role="menu" aria-label="Ajuda desta tela" data-testid="menu-ajuda"
            className="absolute left-0 top-full mt-1 z-[70] w-72 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-borda-forte bg-surface shadow-2xl p-1.5">
            <button type="button" role="menuitem" className={opcao} onClick={() => { setMenu(false); abrirTour(tela) }}>
              <Play size={15} className="text-primary-fg shrink-0" /> Tour desta tela
            </button>
            {telaGeral && (
              <button type="button" role="menuitem" className={opcao} onClick={() => { setMenu(false); abrirTour(telaGeral) }}>
                <LayoutGrid size={15} className="text-texto-2 shrink-0" /> Tour geral de Configurações
              </button>
            )}
            {tarefas.length > 0 && (
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-texto-2 uppercase tracking-wide flex items-center gap-1.5">
                <Hand size={13} aria-hidden="true" /> Faça comigo
              </div>
            )}
            {tarefas.map(x => (
              <button key={x.id} type="button" role="menuitem" className={`${opcao} pl-7`} onClick={() => { setMenu(false); iniciarTarefa(x.id) }}>
                <span className="flex-1 min-w-0">{x.titulo}</span>
                {feitas[x.id] && <Check size={15} className="text-primary-fg shrink-0" aria-label="concluída" />}
              </button>
            ))}
            {tarefas.length > 0 && <div className="my-1 border-t border-borda" />}
            <button type="button" role="menuitem" className={opcao} onClick={() => { setMenu(false); abrirLista() }}>
              <ListOrdered size={15} className="text-texto-2 shrink-0" /> Ver todas as funções desta tela
            </button>
            <button type="button" role="menuitem" className={opcao} onClick={() => { setMenu(false); navegarPara('ajuda', { hash: ajudaHash(tela) }) }}>
              <BookOpen size={15} className="text-texto-2 shrink-0" /> Ajuda detalhada com exemplos
            </button>
            {oculto && (
              <button type="button" role="menuitem" className={opcao} onClick={() => { setMenu(false); voltarAMostrar() }}>
                <RotateCcw size={15} className="text-texto-2 shrink-0" /> Voltar a mostrar o tour sozinho nesta tela
              </button>
            )}
          </div>
        )}
      </span>
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
              <button type="button" className="btn-secondary flex-1 min-h-[44px]" onClick={esconder}>Fechar</button>
              <button type="button" className="btn-primary flex-1 min-h-[44px]" onClick={() => abrirTour(tela)}>Tour desta tela</button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  )
}
