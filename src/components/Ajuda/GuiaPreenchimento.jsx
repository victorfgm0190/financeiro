// PREENCHIMENTO GUIADO — um por vez no app (montado no App). Percorre o roteiro do formulário
// (src/help/<tela>.js › formularios) acendendo cada campo com um balão: pré-requisitos ("Cadastrar
// agora" e voltar) → objetivo → campos na ordem (pula os escondidos; acompanha a troca de etapa do
// wizard) → obrigatórios vazios → "Ao salvar, vai acontecer…" com os dados reais → acende o Salvar.
// Não bloqueia nada: a pessoa digita no próprio campo. Enter avança (fora de lista aberta e de texto
// longo), Esc sai (com o help de campo aberto, o Esc é dele). O guia NUNCA preenche nem salva.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Wand2, X, CheckCircle2, Circle } from 'lucide-react'
import { helpDoCampo, helpDoFormulario } from '../../help/index.js'
import {
  lerPreenchimento, assinarPreenchimento, encerrarPreenchimento, provedorGuia, raizDoForm, elementoDoCampo,
  controleDo, campoVazio, botaoDoForm, faseDepoisDosCampos, definirRetornoGuia, visivel, ABRIR_FORMULARIO, armarPreenchimento,
} from '../../help/guiaPreenchimento.js'
import { lerHelpCampo } from '../../help/helpCampoEstado.js'
import { MARGEM, LARGURA_BALAO, posicaoBalao } from '../BoasVindas/tourPassos'
import { iniciarTarefa } from '../BoasVindas/tourEstado'
import { useContextoAjuda } from '../BoasVindas/contextoAjuda'
import { tarefaDisponivel, tarefaPorId } from '../../lib/tarefasGuiadas'
import { marcarTarefaConcluida } from '../../lib/boasVindasApi'
import { navegarPara } from '../../lib/abrirTela'
import { useIsMobile } from '../../hooks/useIsMobile'

const VIGIA_MS = 250

export default function GuiaPreenchimento() {
  const { ativo } = useSyncExternalStore(assinarPreenchimento, lerPreenchimento, lerPreenchimento)
  if (!ativo || typeof document === 'undefined') return null
  return <Guia key={ativo.seq} ativo={ativo} />
}

function Guia({ ativo }) {
  const { form, tarefaId } = ativo
  const roteiro = helpDoFormulario(form)
  const ordem = roteiro?.ordemCampos || []
  const isMobile = useIsMobile()
  const ctx = useContextoAjuda()
  // Fase inicial: pré-requisitos só se falta algo.
  const [fase, setFase] = useState(() => {
    const itens = provedorGuia(form)?.preRequisitos?.()
    return itens?.some(i => !i.ok) ? 'prereq' : 'objetivo'
  })
  const [trilha, setTrilha] = useState([]) // campos mostrados, na ordem
  const [pos, setPos] = useState(-1)
  const [faltam, setFaltam] = useState([])
  const [aviso, setAviso] = useState('')
  const [rect, setRect] = useState(null)
  const [tamBalao, setTamBalao] = useState({ largura: LARGURA_BALAO, altura: 200 })
  const [teclado, setTeclado] = useState(0)
  const balao = useRef(null)
  const clicouSalvar = useRef(false)
  const id = fase === 'campo' ? trilha[pos] : null
  const campo = id ? helpDoCampo(id) : null

  const irPara = useCallback((novoId) => {
    setAviso('')
    setTrilha(t => {
      const i = t.indexOf(novoId)
      if (i >= 0) { setPos(i); return t }
      setPos(t.length)
      return [...t, novoId]
    })
    setFase('campo')
  }, [])
  // Depois dos campos visíveis: próximo campo, obrigatórios vazios, avançar etapa ou resumo.
  const seguir = useCallback((extraVisitado = null) => {
    const raiz = raizDoForm(form)
    const visitados = new Set(trilha)
    if (extraVisitado) visitados.add(extraVisitado)
    const r = faseDepoisDosCampos({ raiz, form, ordem, visitados })
    setAviso('')
    if (r.fase === 'campo') irPara(r.id)
    else { if (r.fase === 'faltando') setFaltam(r.faltam); setFase(r.fase) }
  }, [form, ordem, trilha, irPara])

  const proximo = useCallback(({ pular = false } = {}) => {
    if (fase === 'campo') {
      const el = elementoDoCampo(raizDoForm(form), id)
      if (!pular && campo?.obrigatorio && campoVazio(el)) { setAviso('Este campo é obrigatório. Preencha ou use "Pular".'); return }
      // Já passou por um campo depois deste (voltou): segue a trilha se ele ainda está na tela.
      const adiante = trilha.slice(pos + 1).find(x => elementoDoCampo(raizDoForm(form), x))
      if (adiante) return irPara(adiante)
      return seguir(id)
    }
    if (fase === 'objetivo') return seguir()
    if (fase === 'faltando') return setFase(botaoDoForm(form, 'avancar') ? 'avancar' : 'resumo')
    if (fase === 'resumo') return setFase('salvar')
    if (fase === 'pronto') return encerrarPreenchimento()
  }, [fase, form, id, campo, trilha, pos, irPara, seguir])

  const voltar = useCallback(() => {
    const raiz = raizDoForm(form)
    const de = fase === 'campo' ? pos - 1 : trilha.length - 1
    for (let i = de; i >= 0; i--) {
      if (elementoDoCampo(raiz, trilha[i])) { setAviso(''); setPos(i); setFase('campo'); return }
    }
  }, [fase, form, pos, trilha])
  const podeVoltar = (() => {
    if (!['campo', 'avancar', 'faltando', 'resumo', 'salvar'].includes(fase)) return false
    const raiz = raizDoForm(form)
    const de = fase === 'campo' ? pos - 1 : trilha.length - 1
    for (let i = de; i >= 0; i--) if (elementoDoCampo(raiz, trilha[i])) return true
    return false
  })()

  // Elemento aceso da fase.
  const alvo = useCallback(() => {
    const raiz = raizDoForm(form)
    if (fase === 'campo') return elementoDoCampo(raiz, id)
    if (fase === 'avancar') return botaoDoForm(form, 'avancar')
    if (fase === 'salvar') return botaoDoForm(form, 'salvar')
    if (fase === 'faltando') return elementoDoCampo(raiz, faltam[0])
    return null
  }, [form, fase, id, faltam])

  // Vigia: formulário fechou, campo sumiu (etapa trocou, opção escondeu), etapa nova apareceu.
  const sumiuDesde = useRef(0)
  useEffect(() => {
    const t = setInterval(() => {
      const raiz = raizDoForm(form)
      if (!raiz) {
        if (fase === 'pronto') return
        if (fase === 'salvar' && clicouSalvar.current) { if (tarefaId) marcarTarefaConcluida(tarefaId); setFase('pronto'); return }
        if (!sumiuDesde.current) sumiuDesde.current = Date.now()
        else if (Date.now() - sumiuDesde.current > 600) encerrarPreenchimento()
        return
      }
      sumiuDesde.current = 0
      if (fase === 'campo' && !elementoDoCampo(raiz, id)) seguir(id)
      else if (fase === 'avancar') {
        const r = faseDepoisDosCampos({ raiz, form, ordem, visitados: new Set(trilha) })
        if (r.fase === 'campo') irPara(r.id)
        else if (!botaoDoForm(form, 'avancar')) setFase('resumo')
      } else if (fase === 'salvar' && !botaoDoForm(form, 'salvar')) {
        // Wizard: o Salvar só aparece na última etapa — volta para os campos.
        seguir()
      }
    }, VIGIA_MS)
    return () => clearInterval(t)
  }, [form, fase, id, trilha, ordem, tarefaId, seguir, irPara])

  // Campo novo: rola até ele e põe o foco no controle (a pessoa já digita). Outras fases: foco no balão.
  useEffect(() => {
    const el = alvo()
    if (el) el.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    if (fase === 'campo' && el) {
      const c = controleDo(el)
      if (c && document.activeElement !== c && !el.contains(document.activeElement)) c.focus?.({ preventScroll: true })
    } else if (fase !== 'salvar' && fase !== 'avancar') {
      balao.current?.querySelector('[data-principal]')?.focus?.({ preventScroll: true })
    }
  }, [fase, id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clique no Salvar (para saber, quando o formulário fechar, que foi salvo e não cancelado).
  useEffect(() => {
    if (fase !== 'salvar') return
    const clique = (e) => { const b = botaoDoForm(form, 'salvar'); if (b && b.contains(e.target)) clicouSalvar.current = true }
    document.addEventListener('click', clique, true)
    return () => document.removeEventListener('click', clique, true)
  }, [fase, form])

  // Posição do elemento aceso (ou do formulário, para o balão ficar ao lado).
  useEffect(() => {
    let raf = 0
    let ultimo = ''
    const medir = () => {
      const el = alvo() || raizDoForm(form)
      const r = el && visivel(el) ? el.getBoundingClientRect() : null
      const k = r ? `${r.top}|${r.left}|${r.width}|${r.height}` : ''
      if (k !== ultimo) { ultimo = k; setRect(r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right } : null) }
      raf = requestAnimationFrame(medir)
    }
    raf = requestAnimationFrame(medir)
    return () => cancelAnimationFrame(raf)
  }, [alvo, form])

  // Celular: o balão fica acima do teclado (visualViewport).
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const medir = () => setTeclado(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => { vv.removeEventListener('resize', medir); vv.removeEventListener('scroll', medir) }
  }, [])

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

  // Teclas: Esc sai (o help de campo aberto tem prioridade); Enter avança.
  useEffect(() => {
    const tecla = (e) => {
      if (e.isComposing) return
      if (e.key === 'Escape') {
        if (lerHelpCampo().aberto || e.defaultPrevented) return
        e.preventDefault(); e.stopPropagation()
        encerrarPreenchimento()
        return
      }
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
      const t = e.target
      const noBalao = balao.current?.contains(t)
      if (noBalao) {
        if (t.closest?.('button')) return // o botão com foco faz o clique dele
        e.preventDefault(); proximo(); return
      }
      if (fase !== 'campo') return
      const el = elementoDoCampo(raizDoForm(form), id)
      if (!el || !el.contains(t)) return
      if (t.tagName === 'TEXTAREA' || t.closest?.('[aria-expanded="true"]') || t.getAttribute?.('aria-expanded') === 'true') return
      if (t.tagName === 'BUTTON') return
      e.preventDefault(); e.stopPropagation()
      proximo()
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [fase, form, id, proximo])

  // Pré-requisito: fecha o formulário, faz o cadastro (Faça comigo) e oferece voltar depois.
  const cadastrarAgora = (passo) => {
    const prov = provedorGuia(form)
    if (ABRIR_FORMULARIO[form]) definirRetornoGuia({ form, titulo: ABRIR_FORMULARIO[form].titulo })
    encerrarPreenchimento()
    // Reabrindo o formulário (pelo "Voltar" do fim da tarefa ou à mão), ele já começa guiado.
    armarPreenchimento(form)
    prov?.fechar?.()
    const t = tarefaPorId(passo.tarefa)
    if (tarefaDisponivel(t, ctx, { celular: isMobile })) iniciarTarefa(t.id)
    else navegarPara(passo.tela, passo.hash ? { hash: passo.hash } : {})
  }

  if (!roteiro) return null
  const elAlvo = alvo()
  const comAlvo = !!(elAlvo && rect && ['campo', 'avancar', 'salvar', 'faltando'].includes(fase))
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pos2 = posicaoBalao(rect, tamBalao, { vw, vh }, { ordem: ['direita', 'esquerda', 'abaixo', 'acima'] })
  const rotuloSalvar = (botaoDoForm(form, 'salvar')?.textContent || 'Salvar').trim()
  const rotuloAvancar = (botaoDoForm(form, 'avancar')?.textContent || 'Avançar').trim()
  const prov = provedorGuia(form)
  const nCampo = pos + 1
  // Celular: em baixo, acima do teclado; no Avançar/Salvar (barra presa ao pé), em cima.
  const estiloCelular = fase === 'avancar' || fase === 'salvar'
    ? { top: 'calc(8px + env(safe-area-inset-top))' }
    : { bottom: teclado ? teclado : 'env(safe-area-inset-bottom)' }

  let titulo = 'Preencher com guia'
  let corpo
  let acoes
  const btnSair = <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={encerrarPreenchimento}>Sair</button>
  const btnVoltar = podeVoltar && <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={voltar}>Voltar</button>

  if (fase === 'prereq') {
    const itens = prov?.preRequisitos?.() || []
    titulo = 'Antes de começar'
    corpo = (
      <ul className="space-y-1.5 mt-1">
        {itens.map(i => (
          <li key={i.passo?.id || i.texto} className="flex flex-wrap items-center gap-2 text-sm">
            {i.ok ? <CheckCircle2 size={15} className="text-primary-fg shrink-0" aria-label="já feito" /> : <Circle size={15} className="text-texto-3 shrink-0" aria-label="a fazer" />}
            <span className={`flex-1 min-w-[8rem] ${i.ok ? 'text-texto-2' : 'text-texto-1'}`}>{i.texto}</span>
            {!i.ok && <button type="button" className="btn-primary text-xs py-1" onClick={() => cadastrarAgora(i.passo)}>Cadastrar agora</button>}
          </li>
        ))}
      </ul>
    )
    acoes = <>{btnSair}<button type="button" data-principal className="btn-secondary text-sm min-h-[40px] ml-auto" onClick={() => setFase('objetivo')}>Continuar mesmo assim</button></>
  } else if (fase === 'objetivo') {
    corpo = (
      <>
        <p className="text-sm text-texto-1 leading-relaxed">{roteiro.objetivo}</p>
        <p className="text-xs text-texto-2 mt-2">Vou acender um campo por vez. {isMobile ? 'Toque em Próximo para seguir.' : 'Enter avança, Esc sai.'}</p>
      </>
    )
    acoes = <>{btnSair}<button type="button" data-principal className="btn-primary text-sm min-h-[40px] ml-auto" onClick={() => proximo()}>Começar</button></>
  } else if (fase === 'campo' && campo) {
    titulo = campo.titulo
    corpo = (
      <>
        {campo.obrigatorio && <p className="text-[11px] font-medium text-aviso">Obrigatório</p>}
        <p className="text-sm text-texto-1 leading-relaxed">{campo.paraQueServe}</p>
        {campo.relacaoComTela && <p className="text-xs text-texto-2 mt-1.5 leading-relaxed">{campo.relacaoComTela}</p>}
        {campo.exemplo && <p className="text-xs text-texto-3 mt-1.5">Exemplo: {campo.exemplo}</p>}
        {aviso && <p role="alert" className="text-xs text-perigo mt-2">{aviso}</p>}
      </>
    )
    acoes = (
      <>
        {btnVoltar}
        <button type="button" className="btn-secondary text-sm min-h-[40px] ml-auto" onClick={() => proximo({ pular: true })}>Pular</button>
        <button type="button" data-principal className="btn-primary text-sm min-h-[40px]" onClick={() => proximo()}>Próximo</button>
      </>
    )
  } else if (fase === 'avancar') {
    titulo = 'Próxima etapa'
    corpo = <p className="text-sm text-texto-1 leading-relaxed">Os campos desta etapa terminaram. Clique em “{rotuloAvancar}” para seguir; o guia continua na etapa seguinte.</p>
    acoes = <>{btnVoltar}<p className="ml-auto text-xs text-texto-2" data-testid="espera-avancar">{isMobile ? 'Toque' : 'Clique'} no destaque</p></>
  } else if (fase === 'faltando') {
    titulo = 'Faltam campos obrigatórios'
    corpo = (
      <ul className="space-y-1 mt-1">
        {faltam.map(f => (
          <li key={f}><button type="button" className="text-sm text-primary-fg hover:underline min-h-[32px] text-left" onClick={() => irPara(f)}>{helpDoCampo(f)?.titulo || f}</button></li>
        ))}
      </ul>
    )
    acoes = <>{btnVoltar}<button type="button" data-principal className="btn-secondary text-sm min-h-[40px] ml-auto" onClick={() => proximo()}>Seguir mesmo assim</button></>
  } else if (fase === 'resumo') {
    titulo = 'Ao salvar, vai acontecer…'
    const linhas = (() => { try { return prov?.resumo?.() || [] } catch { return [] } })()
    corpo = (
      <div data-testid="guia-resumo">
        {linhas.length > 0 && <ul className="list-disc pl-4 space-y-0.5 text-sm text-texto-1">{linhas.map(l => <li key={l}>{l}</li>)}</ul>}
        <p className="text-xs text-texto-2 mt-2 leading-relaxed">{roteiro.resumoAoSalvar}</p>
      </div>
    )
    acoes = <>{btnVoltar}<button type="button" data-principal className="btn-primary text-sm min-h-[40px] ml-auto" onClick={() => proximo()}>Próximo</button></>
  } else if (fase === 'salvar') {
    titulo = 'Salvar'
    corpo = <p className="text-sm text-texto-1 leading-relaxed">Confira e clique em “{rotuloSalvar}”. Se faltar algo, o formulário avisa e o guia continua aqui.</p>
    acoes = <>{btnVoltar}<p className="ml-auto text-xs text-texto-2">{isMobile ? 'Toque' : 'Clique'} no destaque</p></>
  } else if (fase === 'pronto') {
    titulo = 'Pronto!'
    corpo = <p className="text-sm text-texto-1 leading-relaxed">{tarefaPorId(tarefaId)?.final || 'Salvo.'}</p>
    acoes = <button type="button" data-principal className="btn-primary text-sm min-h-[40px] ml-auto" onClick={encerrarPreenchimento}>Concluir</button>
  } else {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[105] pointer-events-none" data-testid="guia-preenchimento" data-fase={fase} data-campo={id || ''}>
      {comAlvo && (
        <div aria-hidden="true" className={`guia-spotlight absolute rounded-lg ${fase === 'avancar' || fase === 'salvar' ? 'guia-clique' : ''}`}
          style={{ top: rect.top - MARGEM, left: rect.left - MARGEM, width: rect.width + MARGEM * 2, height: rect.height + MARGEM * 2 }} />
      )}
      <div ref={balao} role="dialog" aria-modal="false" aria-label={`Preencher com guia: ${titulo}`} tabIndex={-1} data-testid="balao-guia"
        className={`pointer-events-auto outline-none bg-surface border border-borda-forte shadow-2xl p-4 ${isMobile
          ? 'fixed inset-x-0 max-h-[45vh] overflow-y-auto rounded-t-2xl border-x-0 border-b-0'
          : 'absolute rounded-2xl'}`}
        style={isMobile ? estiloCelular : { top: pos2.top, left: pos2.left, width: LARGURA_BALAO }}>
        <div className="flex items-start gap-2">
          {fase === 'pronto' ? <CheckCircle2 size={18} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" /> : <Wand2 size={18} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-texto-2">{fase === 'campo' ? `Preencher com guia · campo ${nCampo}` : 'Preencher com guia'}</p>
            <h2 className="text-sm font-semibold text-texto-1">{titulo}</h2>
            <div className="mt-1">{corpo}</div>
          </div>
          <button type="button" onClick={encerrarPreenchimento} aria-label="Sair do guia" title="Sair do guia (Esc)"
            className="w-9 h-9 -mr-2 -mt-2 flex items-center justify-center text-texto-2 hover:text-texto-1 shrink-0"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-2 mt-3">{acoes}</div>
      </div>
    </div>,
    document.body,
  )
}
