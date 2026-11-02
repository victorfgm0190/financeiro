// Tour de boas-vindas (carrossel): aparece sozinho no primeiro acesso de cada usuário (controle no
// banco, /api/boas-vindas) e de novo pelo link "Rever tour de boas-vindas". Passos só das telas e
// módulos ativos no ambiente/usuário (lib/ajudaTelas passosVisiveis). Pular, fechar ou concluir =
// visto. Textos: src/lib/ajudaTelas.js.
import { useEffect, useState } from 'react'
import { Sparkles, Users, Wallet, CreditCard, Calendar, TrendingUp, LayoutDashboard, Layers, Rocket, Info, CheckCircle2, ArrowRight } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { getSessao } from '../../lib/api'
import {
  passosVisiveis, checklistComStatus, PRIMEIROS_PASSOS_TOUR, BOTOES_PRIMEIROS_PASSOS, TOUR_BOTOES,
} from '../../lib/ajudaTelas'
import { carregarBoasVindas, marcarTourVisto, definirTourAberto, EVENTO_ABRIR_TOUR } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'

// Ícones dos passos (nomes em lib/ajudaTelas). Mapa explícito: importar a biblioteca inteira pesaria no app.
const ICONES = { Sparkles, Users, Wallet, CreditCard, Calendar, TrendingUp, LayoutDashboard, Layers, Rocket }
const Icone = ({ nome, ...p }) => { const C = ICONES[nome] || Info; return <C {...p} /> }

export default function BoasVindasTour() {
  const ctx = useContextoAjuda()
  const { profiles, accounts, schedules, dbStatus } = useApp()
  const [aberto, setAberto] = useState(false)
  const [i, setI] = useState(0)
  const { executar, modais } = useAcoesPrimeirosPassos()

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

  const passos = [...passosVisiveis(ctx), PRIMEIROS_PASSOS_TOUR]
  const ultimo = i === passos.length - 1
  const p = passos[Math.min(i, passos.length - 1)]
  const fechar = () => { setAberto(false); marcarTourVisto() }
  const acoes = checklistComStatus(ctx, { profiles, accounts, schedules }).itens

  return (
    <>
      <Modal open={aberto} onClose={fechar} title="Boas-vindas" size="md">
        <div className="space-y-4" data-testid="tour-boas-vindas" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-11 h-11 rounded-xl bg-primary/15 text-primary-fg flex items-center justify-center">
              <Icone nome={p.icone} size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-texto-1">{p.titulo}</h3>
              <p className="text-sm text-texto-1 mt-1 leading-relaxed">{p.texto}</p>
            </div>
          </div>
          {p.itens && (
            <ul className="space-y-1.5 pl-14 text-sm text-texto-1 list-disc">
              {p.itens.map(t => <li key={t}>{t}</li>)}
            </ul>
          )}
          {p.dica && <p className="ml-14 text-xs text-texto-2 rounded-lg bg-surface-2 border border-borda px-3 py-2">{p.dica}</p>}
          {ultimo && (
            <div className="grid sm:grid-cols-2 gap-2">
              {acoes.map(a => (
                <button key={a.id} type="button" onClick={() => { fechar(); executar(a.acao) }}
                  className="btn-secondary text-sm text-left min-h-[44px] flex items-center gap-2">
                  {a.feito ? <CheckCircle2 size={16} className="text-primary-fg shrink-0" /> : <ArrowRight size={16} className="shrink-0" />}
                  <span>{BOTOES_PRIMEIROS_PASSOS[a.acao]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <div className="flex gap-1" aria-label={`Passo ${i + 1} de ${passos.length}`}>
              {passos.map((x, k) => <span key={x.id} className={`w-1.5 h-1.5 rounded-full ${k === i ? 'bg-primary-fg' : 'bg-borda-forte'}`} />)}
            </div>
            <div className="ml-auto flex gap-2">
              {!ultimo && <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={fechar}>{TOUR_BOTOES.pular}</button>}
              {i > 0 && <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={() => setI(v => v - 1)}>{TOUR_BOTOES.voltar}</button>}
              {ultimo
                ? <button type="button" className="btn-primary text-sm min-h-[44px]" onClick={fechar}>{TOUR_BOTOES.concluir}</button>
                : <button type="button" className="btn-primary text-sm min-h-[44px]" onClick={() => setI(v => v + 1)}>{TOUR_BOTOES.proximo}</button>}
            </div>
          </div>
        </div>
      </Modal>
      {modais}
    </>
  )
}
