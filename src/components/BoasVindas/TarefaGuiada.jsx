// TAREFA GUIADA "Faça comigo" — desenhada pelo GuiaInterativo (mesmo spotlight do tour), mas a
// pessoa MEXE na tela: nada bloqueia os cliques. Cada passo acende um botão/campo e espera:
//   'clique'    → o clique nele (ou em algo dentro dele);
//   'preencher' → o campo mudar (escolha num seletor na hora; digitação, depois de uma pausa);
//   'salvar'    → aparecer o item novo no app (novoItem: coleção do useApp + filtro);
//   'nenhuma'   → só explica (Próximo).
// Salvou antes da hora (em qualquer passo)? Vai direto para "Pronto!". Elemento que não aparece em
// alguns segundos (aba fechada, outro aparelho) → balão no centro com Próximo, sem travar.
// "Sair do guia" (Esc) encerra sem deixar nada na tela. O guia NUNCA preenche nem salva nada.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Hand, X, CheckCircle2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { tarefaPorId, tarefasDaTela } from '../../lib/tarefasGuiadas'
import { marcarTarefaConcluida } from '../../lib/boasVindasApi'
import { navegarPara } from '../../lib/abrirTela'
import { useContextoAjuda } from './contextoAjuda'
import { elementoPorGuia } from './guiaElementos'
import { encerrarTour, iniciarTarefa } from './tourEstado'
import { MARGEM, LARGURA_BALAO, posicaoBalao } from './tourPassos'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ESPERA_ELEMENTO_MS, PAUSA_DIGITACAO_MS, passosDaTarefa, itemNovo } from './tarefaPassos'

export default function TarefaGuiada({ tarefaId }) {
  const app = useApp()
  const ctx = useContextoAjuda()
  const isMobile = useIsMobile()
  const t = tarefaPorId(tarefaId)
  const passos = useMemo(() => passosDaTarefa(t, { celular: isMobile }), [t, isMobile])
  const [i, setI] = useState(0)
  const [fim, setFim] = useState(false)
  const [naoAchou, setNaoAchou] = useState(false)
  const [el, setEl] = useState(null)
  const [rect, setRect] = useState(null)
  const [outras, setOutras] = useState(false)
  const balao = useRef(null)
  const [tamBalao, setTamBalao] = useState({ largura: LARGURA_BALAO, altura: 180 })
  const colecao = t?.novoItem?.colecao
  const lista = colecao ? app[colecao] : null
  // Ids da coleção no começo (o que aparecer depois é o que a pessoa criou nesta tarefa).
  const [idsAntes] = useState(() => new Set((lista || []).map(x => x?.id)))
  const passo = passos[i]

  // Começa na tela da tarefa (e na seção certa de Configurações).
  useEffect(() => { if (t) navegarPara(t.tela, t.hash ? { hash: t.hash } : undefined) }, [t])

  // Salvou (em qualquer passo, mesmo antes da hora): a tarefa está pronta.
  const salvou = !!(colecao && itemNovo(lista, idsAntes, t?.novoItem?.filtro))
  const terminou = fim || salvou
  useEffect(() => { if (salvou && t) marcarTarefaConcluida(t.id) }, [salvou, t])
  const concluir = useCallback(() => { setFim(true); if (t) marcarTarefaConcluida(t.id) }, [t])
  const avancar = useCallback(() => {
    if (i >= passos.length - 1) concluir()
    else setI(i + 1)
  }, [i, passos.length, concluir])

  // Acha o elemento da vez (espera ele aparecer — modal abrindo, tela carregando).
  useEffect(() => {
    if (terminou || !passo) return
    let vivo = true
    const inicio = Date.now()
    const procurar = () => {
      if (!vivo) return
      const e = elementoPorGuia(passo.alvo)
      if (e) { setEl(e); setNaoAchou(false); e.scrollIntoView?.({ block: 'center', inline: 'nearest' }); return }
      setEl(null)
      if (Date.now() - inicio > ESPERA_ELEMENTO_MS) { setNaoAchou(true); return }
      timer = setTimeout(procurar, 250)
    }
    let timer = setTimeout(procurar, 0)
    return () => { vivo = false; clearTimeout(timer) }
  }, [passo, terminou])

  // Posição do elemento (acompanha rolagem, modal se mexendo).
  useEffect(() => {
    if (!el || terminou) return
    let raf = 0
    let ultimo = ''
    const medir = () => {
      const r = el.isConnected ? el.getBoundingClientRect() : null
      const k = r ? `${r.top}|${r.left}|${r.width}|${r.height}` : ''
      if (k !== ultimo) { ultimo = k; setRect(r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right } : null) }
      raf = requestAnimationFrame(medir)
    }
    raf = requestAnimationFrame(medir)
    return () => cancelAnimationFrame(raf)
  }, [el, terminou])

  // Espera do passo: clique / preenchimento.
  useEffect(() => {
    if (terminou || !passo || (passo.espera !== 'clique' && passo.espera !== 'preencher')) return
    const dentro = (alvo) => alvo?.closest?.(`[data-guia="${passo.alvo}"]`)
    let pausa = 0
    const clique = (e) => { if (passo.espera === 'clique' && dentro(e.target)) setTimeout(avancar, 60) }
    const mudou = (e) => { if (passo.espera === 'preencher' && dentro(e.target)) { clearTimeout(pausa); setTimeout(avancar, 250) } }
    const digitou = (e) => { if (passo.espera === 'preencher' && dentro(e.target)) { clearTimeout(pausa); pausa = setTimeout(avancar, PAUSA_DIGITACAO_MS) } }
    document.addEventListener('click', clique, true)
    document.addEventListener('change', mudou, true)
    document.addEventListener('input', digitou, true)
    return () => {
      clearTimeout(pausa)
      document.removeEventListener('click', clique, true)
      document.removeEventListener('change', mudou, true)
      document.removeEventListener('input', digitou, true)
    }
  }, [passo, terminou, avancar])

  // Esc sai do guia; Enter só avança com o foco no balão (nos campos, Enter é do formulário).
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); encerrarTour() }
      else if (e.key === 'Enter' && balao.current?.contains(e.target) && !e.target.closest?.('button')) { e.preventDefault(); if (terminou) encerrarTour(); else avancar() }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [avancar, terminou])

  useEffect(() => {
    const b = balao.current
    if (!b || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const r = e.target.getBoundingClientRect()
      setTamBalao(x => (Math.abs(r.width - x.largura) > 1 || Math.abs(r.height - x.altura) > 1 ? { largura: r.width, altura: r.height } : x))
    })
    ro.observe(b)
    return () => ro.disconnect()
  }, [])

  if (!t) return null
  const comAlvo = !terminou && !naoAchou && el && rect
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pos = posicaoBalao(comAlvo ? rect : null, tamBalao, { vw, vh })
  const demais = terminou ? tarefasDaTela(t.tela, ctx, { celular: isMobile }).filter(x => x.id !== t.id) : []

  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none" data-testid="tarefa-guiada">
      {comAlvo && (
        <div aria-hidden="true" className="guia-spotlight absolute rounded-lg"
          style={{ top: rect.top - MARGEM, left: rect.left - MARGEM, width: rect.width + MARGEM * 2, height: rect.height + MARGEM * 2 }} />
      )}
      <div ref={balao} role="dialog" aria-modal="false" aria-label={`Faça comigo: ${t.titulo}`} tabIndex={-1} data-testid="balao-tarefa"
        className={`pointer-events-auto outline-none bg-surface border border-borda-forte shadow-2xl p-4 ${isMobile
          ? 'absolute inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] max-h-[45vh] overflow-y-auto rounded-t-2xl border-x-0 border-b-0'
          : 'absolute rounded-2xl'}`}
        style={isMobile ? undefined : { top: pos.top, left: pos.left, width: LARGURA_BALAO }}>
        <div className="flex items-start gap-2">
          {terminou ? <CheckCircle2 size={18} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" /> : <Hand size={18} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-texto-2">{terminou ? 'Faça comigo' : `Faça comigo · passo ${i + 1} de ${passos.length}`}</p>
            <h2 className="text-sm font-semibold text-texto-1">{terminou ? 'Pronto!' : t.titulo}</h2>
            <p className="text-sm text-texto-1 mt-1 leading-relaxed" data-testid="texto-tarefa">
              {terminou ? t.final : naoAchou ? `Não achei este passo na tela agora. ${passo.texto} Quando terminar, toque em Próximo.` : passo.texto}
            </p>
          </div>
          <button type="button" onClick={encerrarTour} aria-label="Fechar guia" title="Sair do guia (Esc)"
            className="w-9 h-9 -mr-2 -mt-2 flex items-center justify-center text-texto-2 hover:text-texto-1 shrink-0"><X size={16} /></button>
        </div>
        {terminou ? (
          <div className="mt-3 space-y-2">
            {outras && demais.length > 0 && (
              <ul className="space-y-1">
                {demais.map(x => (
                  <li key={x.id}><button type="button" className="w-full text-left text-sm text-primary-fg hover:underline min-h-[36px]" onClick={() => iniciarTarefa(x.id)}>{x.titulo}</button></li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              {demais.length > 0 && !outras && <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={() => setOutras(true)}>Fazer outra tarefa</button>}
              <button type="button" className="btn-primary text-sm min-h-[40px] ml-auto" onClick={encerrarTour}>Concluir</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-3">
            {i > 0 && <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={() => setI(v => Math.max(0, v - 1))}>Voltar</button>}
            <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={encerrarTour}>Sair do guia</button>
            <button type="button" className="btn-primary text-sm min-h-[40px] ml-auto" onClick={avancar}>Próximo</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
