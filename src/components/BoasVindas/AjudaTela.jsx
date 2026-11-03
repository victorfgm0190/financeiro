// "?" DE CADA TELA — o ponto único de ajuda da tela. Toque abre um menu:
//   • "Tour desta tela" (sempre funciona, mesmo com "Não mostrar mais") — GuiaInterativo;
//   • "Ver todas as funções desta tela" — painel com a lista numerada e um selo com o mesmo número em
//     cima de cada bloco. O selo acompanha o bloco e SOME quando ele sai da parte visível ou fica atrás
//     do painel/cabeçalho. Passar o mouse/clicar no item rola suavemente até o bloco e só então o
//     destaca — nunca executa a ação dele ("Abrir" faz isso, fechando o guia antes). Item sem bloco na
//     tela: "não aparece agora" + quando aparece. Desktop largo: o conteúdo abre espaço para o painel;
//     celular/tela estreita: ao tocar num item o painel recolhe (botão "Reabrir guia");
//   • "Faça comigo" — as tarefas guiadas da tela (✓ nas já concluídas);
//   • "Voltar a mostrar o tour sozinho nesta tela" — só se a tela estiver marcada "Não mostrar mais".
// O tour abre SOZINHO na primeira visita (useGuiaTela). Com os guias desligados (Configurações ›
// Geral › Guias das telas), o "?" não aparece. Botões achados por data-guia="<tela>.<chave>".
// Textos: src/lib/ajudaTelas.js (AJUDA_TELAS). `pagina`: a tela; uma subtela aberta (useSubtelaGuia)
// com guia próprio vale no lugar dela.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X, Play, ListOrdered, RotateCcw, LayoutGrid, Hand, Check, BookOpen, ExternalLink } from 'lucide-react'
import { navegarPara } from '../../lib/abrirTela'
import { ajudaHash } from '../../lib/ajudaRota'
import { ajudaDaTela, guiaDaTela } from '../../lib/ajudaTelas'
import { useSubtelaAtiva } from './subtelaGuia'
import { useContextoAjuda } from './contextoAjuda'
import { useGuiaTela, useEstadoBoasVindas } from './useGuiaTela'
import { tarefasDaTela } from '../../lib/tarefasGuiadas'
import { iniciarTarefa } from './tourEstado'
import { useIsMobile } from '../../hooks/useIsMobile'
import { elementoDoItem, areaVisivel, faixasFixas, itemAcionavel } from './guiaElementos'
import { posicionarSelos, quandoAparece } from './tourPassos'

// Selos (viewport) — recalculados (requestAnimationFrame) ao rolar, redimensionar e quando a tela
// muda. Bloco fora da parte visível ou atrás do painel/cabeçalho: sem selo. Também diz quais itens
// têm bloco na tela agora (mesmo rolado para fora) — os outros "não aparecem agora".
function useSelos(tela, itens, ativo, painel) {
  const [estado, setEstado] = useState({ selos: [], existentes: [] })
  useLayoutEffect(() => {
    if (!ativo) return
    let raf = 0
    const medir = () => {
      raf = 0
      const medidas = []
      const existentes = []
      const faixas = faixasFixas()
      itens.forEach((it, i) => {
        const el = elementoDoItem(tela, it.chave)
        if (!el) return
        existentes.push(it.chave)
        // Cabeçalho/barra fixos tapam o selo — menos o do bloco que fica dentro deles.
        const bloqueios = faixas.filter(f => !f.el.contains(el))
        medidas.push({ chave: it.chave, numero: i + 1, rect: el.getBoundingClientRect(), area: areaVisivel(el), bloqueios })
      })
      const p = painel.current?.getBoundingClientRect()
      const bloqueios = [p && p.width > 0 ? { top: p.top - 4, left: p.left - 4, right: p.right + 4, bottom: p.bottom + 4 } : null]
      const out = { selos: posicionarSelos(medidas, bloqueios), existentes }
      setEstado(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
    }
    const agendar = () => { if (!raf) raf = requestAnimationFrame(medir) }
    medir()
    window.addEventListener('scroll', agendar, true)
    window.addEventListener('resize', agendar)
    const t = setInterval(agendar, 600) // a tela muda sem rolar (abas, listas carregando)
    return () => { window.removeEventListener('scroll', agendar, true); window.removeEventListener('resize', agendar); clearInterval(t); if (raf) cancelAnimationFrame(raf) }
  }, [tela, itens, ativo, painel])
  return ativo ? estado : { selos: [], existentes: [] }
}

// Tela larga o bastante para o painel ficar AO LADO do conteúdo (o conteúdo abre espaço para ele).
const QUERY_LARGA = '(min-width: 1024px)'
const mqlLarga = () => (typeof window !== 'undefined' ? window.matchMedia?.(QUERY_LARGA) : null)
const assinarLarga = (f) => { const m = mqlLarga(); m?.addEventListener?.('change', f); return () => m?.removeEventListener?.('change', f) }
const useTelaLarga = () => useSyncExternalStore(assinarLarga, () => !!mqlLarga()?.matches, () => false)

// Espera a rolagem suave terminar (posição parada por alguns quadros, ou um tempo máximo).
function depoisDeRolar(el, feito) {
  let ultimo = ''
  let parado = 0
  let vivo = true
  const inicio = Date.now()
  const passo = () => {
    if (!vivo) return
    const r = el.getBoundingClientRect()
    const k = `${Math.round(r.top)}|${Math.round(r.left)}`
    parado = k === ultimo ? parado + 1 : 0
    ultimo = k
    if (parado >= 3 || Date.now() - inicio > 900) { feito(); return }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
  return () => { vivo = false }
}

export default function AjudaTela({ pagina, className = '' }) {
  const subtela = useSubtelaAtiva()
  const tela = subtela && ajudaDaTela(subtela) ? subtela : pagina
  const ctx = useContextoAjuda()
  const guia = guiaDaTela(tela, ctx)
  // Configurações: na primeira visita, o tour geral (abas) vem antes do tour da seção.
  const telaGeral = pagina === 'settings' && tela !== pagina && ajudaDaTela(pagina) ? pagina : null
  const { ligados, oculto, listaAberta: aberto, abrirTour, abrirLista, fecharLista, voltarAMostrar } = useGuiaTela(tela, { primeiraTela: telaGeral })
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
  const painel = useRef(null)
  const { selos, existentes } = useSelos(tela, itens, aberto, painel)
  const larga = useTelaLarga()
  const lado = aberto && !isMobile && larga // painel ao lado do conteúdo
  const [recolhido, setRecolhido] = useState(false) // celular/tela estreita: painel recolhido p/ ver o destaque
  const esconder = useCallback(() => { setRecolhido(false); fecharLista() }, [fecharLista])
  const destacado = useRef(null)
  const cancelar = useRef(null) // espera da rolagem / atraso do passar o mouse em andamento

  // Desktop: o conteúdo ganha à direita o espaço do painel e se reorganiza (index.css).
  useEffect(() => {
    if (!lado) return
    document.documentElement.setAttribute('data-guia-painel', '')
    return () => document.documentElement.removeAttribute('data-guia-painel')
  }, [lado])

  const tirarDestaque = useCallback(() => {
    cancelar.current?.()
    cancelar.current = null
    destacado.current?.classList.remove('guia-destaque')
    destacado.current = null
  }, [])
  // Rola suavemente até o bloco (centro) e SÓ ENTÃO acende o destaque. Não executa a ação do bloco.
  const destacar = useCallback((chave, { atraso = 0 } = {}) => {
    tirarDestaque()
    const el = elementoDoItem(tela, chave)
    if (!el) return
    let parar = null
    const acender = () => { el.classList.add('guia-destaque'); destacado.current = el }
    const ir = () => {
      const r = el.getBoundingClientRect()
      const a = areaVisivel(el)
      const p = painel.current?.getBoundingClientRect()
      const atrasDoPainel = p && p.width > 0 && r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top && (isMobile || !larga)
      const visivel = a && r.top >= a.top && r.bottom <= a.bottom && r.left >= a.left && r.right <= a.right
      if (visivel && !atrasDoPainel) { acender(); return }
      el.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      parar = depoisDeRolar(el, acender)
    }
    const t = atraso ? setTimeout(ir, atraso) : (ir(), 0)
    cancelar.current = () => { clearTimeout(t); parar?.() }
  }, [tela, isMobile, larga, tirarDestaque])
  // Toque/clique no item: no celular o painel recolhe para mostrar o destaque.
  const escolher = useCallback((chave) => {
    if (!lado) setRecolhido(true)
    destacar(chave)
  }, [lado, destacar])
  // "Abrir": a ação do bloco, com o guia FECHADO antes (nada por baixo do guia).
  const abrirAcao = useCallback((chave) => {
    tirarDestaque()
    esconder()
    requestAnimationFrame(() => elementoDoItem(tela, chave)?.click())
  }, [tela, esconder, tirarDestaque])
  useEffect(() => { if (!aberto) tirarDestaque() }, [aberto, tirarDestaque])
  useEffect(() => tirarDestaque, [tirarDestaque])
  useEffect(() => {
    if (!aberto) return
    const esc = (e) => { if (e.key === 'Escape') esconder() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto, esconder])

  if (!guia || !ligados) return null
  const naTela = new Set(existentes)
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
            <button type="button" role="menuitem" className={opcao} onClick={() => { setMenu(false); setRecolhido(false); abrirLista() }}>
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
              className="fixed z-[35] w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold leading-5 text-center shadow-lg ring-2 ring-surface pointer-events-none"
              style={{ top: s.top, left: s.left }}>{s.numero}</span>
          ))}
          {recolhido && (
            <button type="button" onClick={() => setRecolhido(false)} data-testid="reabrir-guia"
              className="fixed z-[90] right-3 bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-4 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-primary text-white text-sm font-medium shadow-2xl">
              <HelpCircle size={16} aria-hidden="true" /> Reabrir guia
            </button>
          )}
          {!recolhido && <aside ref={painel} role="dialog" aria-modal="false" aria-label={`Guia: ${guia.titulo}`} data-testid="guia-tela"
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
                  {itens.map((it, i) => {
                    const presente = naTela.has(it.chave)
                    const el = presente ? elementoDoItem(tela, it.chave) : null
                    const podeAbrir = itemAcionavel(it, el)
                    return (
                      <li key={it.chave} className="flex items-start gap-1">
                        <button type="button" data-testid={`item-guia-${it.chave}`}
                          className={`flex-1 min-w-0 flex items-start gap-2 text-left rounded-lg px-1.5 py-1.5 ${presente ? 'hover:bg-surface-hover focus:bg-surface-hover' : 'cursor-default'}`}
                          onMouseEnter={() => presente && destacar(it.chave, { atraso: 150 })} onFocus={() => presente && destacar(it.chave)}
                          onClick={() => presente && escolher(it.chave)}>
                          <span className={`shrink-0 w-5 h-5 mt-0.5 rounded-full text-[11px] font-bold leading-5 text-center ${presente ? 'bg-primary text-white' : 'bg-surface-2 text-texto-2 border border-borda'}`}>{i + 1}</span>
                          <span className="min-w-0">
                            <span className={`font-medium ${presente ? '' : 'text-texto-2'}`}>{it.rotulo}</span> — <span className="leading-relaxed">{it.texto}</span>
                            {!presente && (
                              <span className="block mt-0.5 text-xs text-texto-2" data-testid="nao-aparece">
                                <span className="font-semibold">não aparece agora</span>
                                {!String(it.texto || '').includes(quandoAparece(it)) && <> · {quandoAparece(it)}</>}
                              </span>
                            )}
                          </span>
                        </button>
                        {podeAbrir && (
                          <button type="button" onClick={() => abrirAcao(it.chave)} title={`Fechar o guia e abrir "${it.rotulo}"`}
                            className="shrink-0 mt-1 inline-flex items-center gap-1 min-h-[28px] px-1.5 rounded text-xs text-primary-fg hover:underline">
                            Abrir <ExternalLink size={12} aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    )
                  })}
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
          </aside>}
        </>,
        document.body,
      )}
    </>
  )
}
