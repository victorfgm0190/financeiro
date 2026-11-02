// Boas-vindas — RESUMO GERAL curto (um passo por área, 1 frase cada; < 1 minuto). Aparece sozinho no
// primeiro acesso de cada usuário (controle no banco, /api/boas-vindas) e de novo pelo link "Rever tour
// de boas-vindas". Só os passos das áreas ativas no ambiente/usuário (lib/ajudaTelas passosVisiveis).
// Em cada passo: Avançar, Voltar, Pular etapa e Pular (tudo). Último passo: "Como você quer
// continuar?" — Começar a usar | Primeiros passos (abre o checklist). Pular, fechar ou escolher = visto.
import { useEffect, useState } from 'react'
import { Sparkles, Users, Wallet, CreditCard, Calendar, TrendingUp, LayoutDashboard, Layers, Rocket, Info, FileSignature, ArrowRight } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { getSessao } from '../../lib/api'
import { navegarPara } from '../../lib/abrirTela'
import { passosVisiveis, opcoesFinaisBoasVindas, FINAL_BOAS_VINDAS, BOAS_VINDAS_TITULO, TOUR_BOTOES } from '../../lib/ajudaTelas'
import { carregarBoasVindas, estadoBoasVindas, marcarTourVisto, mostrarChecklist, definirTourAberto, EVENTO_ABRIR_TOUR } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'

// Ícones dos passos (nomes em lib/ajudaTelas). Mapa explícito: importar a biblioteca inteira pesaria no app.
const ICONES = { Sparkles, Users, Wallet, CreditCard, Calendar, TrendingUp, LayoutDashboard, Layers, Rocket, FileSignature }
const Icone = ({ nome, ...p }) => { const C = ICONES[nome] || Info; return <C {...p} /> }

// "Primeiros passos": leva ao Painel e rola até o checklist (que volta a aparecer se estava oculto).
function abrirPrimeirosPassos() {
  if (estadoBoasVindas()?.checklistOcultoEm) mostrarChecklist()
  navegarPara('dashboard')
  setTimeout(() => document.querySelector('[data-testid="primeiros-passos"]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 600)
}

export default function BoasVindasTour() {
  const ctx = useContextoAjuda()
  const { dbStatus } = useApp()
  const [aberto, setAberto] = useState(false)
  const [i, setI] = useState(0)

  // Primeiro acesso: só depois de conectar ao banco (sem conexão não dá para saber se já viu).
  useEffect(() => {
    if (dbStatus !== 'connected' || !getSessao()) return
    let vivo = true
    // Guias desligados (Configurações › Geral › Guias das telas): não abre sozinho; "Rever tour" ainda abre.
    carregarBoasVindas().then(e => { if (vivo && e && !e.tourVistoEm && e.guiasLigados !== false) { setI(0); setAberto(true) } })
    return () => { vivo = false }
  }, [dbStatus])
  // O Guia da Tela espera o tour fechar.
  useEffect(() => { definirTourAberto(aberto) }, [aberto])
  useEffect(() => () => definirTourAberto(false), [])
  useEffect(() => {
    const abrir = () => { setI(0); setAberto(true) }
    window.addEventListener(EVENTO_ABRIR_TOUR, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_TOUR, abrir)
  }, [])

  const passos = [...passosVisiveis(ctx), FINAL_BOAS_VINDAS]
  const ultimo = i >= passos.length - 1
  const p = passos[Math.min(i, passos.length - 1)]
  const fechar = () => { setAberto(false); marcarTourVisto() }
  const escolher = (opcao) => {
    fechar()
    if (opcao === 'primeiros-passos') abrirPrimeirosPassos()
    else if (opcao === 'detalhes') navegarPara('ajuda')
  }
  const avancar = () => setI(v => Math.min(v + 1, passos.length - 1))

  return (
    <Modal open={aberto} onClose={fechar} title={BOAS_VINDAS_TITULO} size="md">
      <div className="space-y-4" data-testid="tour-boas-vindas" aria-live="polite">
        <p className="text-[11px] text-texto-2" data-testid="passo-boas-vindas">{i + 1} de {passos.length}</p>
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-11 h-11 rounded-xl bg-primary/15 text-primary-fg flex items-center justify-center">
            <Icone nome={p.icone} size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-texto-1">{p.titulo}</h3>
            <p className="text-sm text-texto-1 mt-1 leading-relaxed">{p.texto}</p>
          </div>
        </div>
        {ultimo && (
          <div className="grid gap-2">
            {opcoesFinaisBoasVindas().map(o => (
              <button key={o.id} type="button" onClick={() => escolher(o.id)}
                className={`${o.id === 'usar' ? 'btn-primary' : 'btn-secondary'} text-left min-h-[52px] flex items-center gap-3 px-4`}>
                <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{o.titulo}</span>
                  <span className="block text-xs opacity-90 font-normal">{o.texto}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <div className="flex gap-1" aria-hidden="true">
            {passos.map((x, k) => <span key={x.id} className={`w-1.5 h-1.5 rounded-full ${k === i ? 'bg-primary-fg' : 'bg-borda-forte'}`} />)}
          </div>
          {!ultimo && (
            <div className="ml-auto flex flex-wrap gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={fechar}>{TOUR_BOTOES.pular}</button>
              {i > 0 && <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={() => setI(v => v - 1)}>{TOUR_BOTOES.voltar}</button>}
              <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={avancar}>{TOUR_BOTOES.pularEtapa}</button>
              <button type="button" className="btn-primary text-sm min-h-[44px]" onClick={avancar}>{TOUR_BOTOES.proximo}</button>
            </div>
          )}
          {ultimo && i > 0 && (
            <button type="button" className="btn-secondary text-sm min-h-[44px] ml-auto" onClick={() => setI(v => v - 1)}>{TOUR_BOTOES.voltar}</button>
          )}
        </div>
      </div>
    </Modal>
  )
}
