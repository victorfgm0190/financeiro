// BOAS-VINDAS da jornada guiada: aparece sozinho no primeiro acesso de cada usuário (tour ainda não
// visto, no banco) com a jornada ligada. "Olá, {nome}!", o mapa curto dos módulos que este usuário vê
// (1 linha cada, os mesmos do resumo de boas-vindas) e dois caminhos:
//   • Começar → marca como visto e abre o primeiro passo pendente da jornada;
//   • Já sei usar, pular → marca como visto e desliga a jornada (religa em Configurações › Guias).
// Com a jornada desligada, o resumo antigo (BoasVindasTour) continua sendo o primeiro acesso.
import { useEffect, useState } from 'react'
import { Compass, ArrowRight } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { getSessao } from '../../lib/api'
import { passosVisiveis } from '../../lib/ajudaTelas'
import { jornadaComStatus } from '../../lib/onboardingSteps'
import { carregarBoasVindas, marcarTourVisto, definirJornadaLigada, definirObjetivoJornada, definirTourAberto } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'
import { abrirPassoJornada } from './jornadaEstado'
import { useDadosJornada } from './jornadaDados'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function JornadaBoasVindas() {
  const ctx = useContextoAjuda()
  const { dbStatus, usuario } = useApp()
  const { dados } = useDadosJornada()
  const { executar, modais } = useAcoesPrimeirosPassos()
  const isMobile = useIsMobile()
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (dbStatus !== 'connected' || !getSessao()) return
    let vivo = true
    carregarBoasVindas().then(e => { if (vivo && e && !e.tourVistoEm && e.jornadaLigada !== false) setAberto(true) })
    return () => { vivo = false }
  }, [dbStatus])
  // O guia da tela espera as boas-vindas fecharem.
  useEffect(() => { definirTourAberto(aberto) }, [aberto])

  const nome = String(usuario?.nome || '').trim().split(/\s+/)[0]
  const modulos = passosVisiveis(ctx)
  const objetivos = jornadaComStatus(ctx, dados).objetivosDisponiveis

  const comecar = () => {
    setAberto(false)
    marcarTourVisto()
    const st = jornadaComStatus(ctx, dados)
    if (st.proximo) abrirPassoJornada(st.proximo, { ctx, celular: isMobile, executar })
  }
  // "Quero ir direto para…": só os passos que faltam para o objetivo; depois volta à jornada normal.
  const irParaObjetivo = (o) => {
    setAberto(false)
    marcarTourVisto()
    definirObjetivoJornada(o.id)
    if (o.passos[0]) abrirPassoJornada(o.passos[0], { ctx, celular: isMobile, executar })
  }
  const pular = () => {
    setAberto(false)
    marcarTourVisto()
    definirJornadaLigada(false)
  }

  return (
    <>
      <Modal open={aberto} onClose={() => { setAberto(false); marcarTourVisto() }} title="Boas-vindas" size="md">
        <div className="space-y-4" data-testid="jornada-boas-vindas">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-11 h-11 rounded-xl bg-primary/15 text-primary-fg flex items-center justify-center">
              <Compass size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-texto-1">{nome ? `Olá, ${nome}!` : 'Olá!'}</h3>
              <p className="text-sm text-texto-1 mt-1">O Finup foi feito para você organizar o seu dinheiro num lugar só. Ele tem:</p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {modulos.map(m => (
              <li key={m.id} className="text-sm text-texto-2"><span className="font-medium text-texto-1">{m.titulo}:</span> {m.texto}</li>
            ))}
          </ul>
          <p className="text-sm text-texto-1">Vou te levar para conhecer o sistema passo a passo.</p>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={pular}>Já sei usar, pular</button>
            <button type="button" className="btn-primary text-sm min-h-[44px] flex items-center gap-1.5" onClick={comecar}>
              Começar <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          {objetivos.length > 0 && (
            <div data-testid="objetivos-boas-vindas" className="pt-3 border-t border-borda">
              <p className="text-xs text-texto-2 mb-1.5">Quero ir direto para…</p>
              <div className="flex flex-wrap gap-1.5">
                {objetivos.map(o => <button key={o.id} type="button" className="btn-secondary text-xs py-1.5" onClick={() => irParaObjetivo(o)}>{o.titulo}</button>)}
              </div>
            </div>
          )}
        </div>
      </Modal>
      {modais}
    </>
  )
}
