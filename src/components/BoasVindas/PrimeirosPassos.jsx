// JORNADA GUIADA — painel de progresso (antes, o checklist "Primeiros passos"), no Painel (desktop),
// no Início (celular) e na Central de Ajuda. Discreto: "Sua jornada: 7/18", as fases com ✔, o próximo
// passo e "Continuar de onde parei". Passos de src/lib/onboardingSteps.js:
//   • conhecer → "Ver na tela" abre o tour da tela; "Entendi ✔" conclui;
//   • fazer    → "Fazer comigo" abre o "Faça comigo"; conclui sozinho quando o dado existe no banco.
// Concluído some da lista (fica o ✔ da fase). Pular (retomável) e "não se aplica" usam os mesmos
// estados de antes (boas_vindas_usuario.progresso). Some ao concluir tudo (com os parabéns), com
// "Ocultar" ou com a jornada desligada (Configurações › Guias das telas).
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, MinusCircle, ChevronDown, ChevronRight, PartyPopper, Play } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { CHECKLIST_OCULTAR, CHECKLIST_BOTOES as B } from '../../lib/ajudaTelas'
import { jornadaComStatus } from '../../lib/onboardingSteps'
import { carregarBoasVindas, ocultarChecklist, marcarEtapa } from '../../lib/boasVindasApi'
import { useDadosJornada, JORNADA_TITULO, JORNADA_BOTOES } from './jornadaDados'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'
import { abrirPassoJornada } from './jornadaEstado'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function PrimeirosPassos({ className = '' }) {
  const ctx = useContextoAjuda()
  const { dbStatus } = useApp()
  const { estado, dados } = useDadosJornada()
  const [faseAberta, setFaseAberta] = useState(null)
  const [verPuladas, setVerPuladas] = useState(false)
  const [confirmarPular, setConfirmarPular] = useState(null)
  const { executar, modais } = useAcoesPrimeirosPassos()
  const isMobile = useIsMobile()
  useEffect(() => { if (dbStatus === 'connected') carregarBoasVindas() }, [dbStatus])

  const st = jornadaComStatus(ctx, dados)
  // Sem saber do banco (null) não aparece; jornada desligada ou ocultada: some (volta ao religar).
  if (!estado || estado.jornadaLigada === false || estado.checklistOcultoEm || !st.passos.length) return modais

  if (st.completo) {
    return (
      <>
        <section data-testid="primeiros-passos" className={`card flex items-center gap-3 ${className}`} aria-label={JORNADA_TITULO}>
          <PartyPopper size={20} className="text-primary-fg shrink-0" aria-hidden="true" />
          <p className="text-sm text-texto-1 flex-1">Parabéns! Você concluiu a jornada. A ajuda de cada tela continua no "?" ao lado do título.</p>
          <button type="button" className="btn-secondary text-xs py-1.5" onClick={ocultarChecklist}>Fechar</button>
        </section>
        {modais}
      </>
    )
  }

  const abrir = (p) => abrirPassoJornada(p, { ctx, celular: isMobile, executar })
  const pular = (p) => {
    if (p.avisoAoPular && confirmarPular !== p.id) { setConfirmarPular(p.id); return }
    setConfirmarPular(null)
    marcarEtapa(p.id, 'pulada')
  }
  // Fase aberta: a escolhida, ou a do próximo passo.
  const aberta = faseAberta ?? st.proximo?.fase ?? null
  const pct = st.total ? Math.round((st.feitas / st.total) * 100) : 0

  return (
    <>
      <section data-testid="primeiros-passos" className={`card space-y-3 ${className}`} aria-label={JORNADA_TITULO}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-texto-1">
              {JORNADA_TITULO}: <span data-testid="progresso-jornada">{st.feitas}/{st.total}</span>
            </h2>
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da jornada">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <button type="button" className="text-xs text-texto-2 hover:text-texto-1 min-h-[32px] px-1" onClick={ocultarChecklist}>{CHECKLIST_OCULTAR}</button>
        </div>

        {st.proximo && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-texto-2">Próximo passo:</span>
            <span className="text-texto-1 font-medium flex-1 min-w-[10rem]" data-testid="proximo-passo">{st.proximo.titulo}</span>
            <button type="button" className="btn-primary text-xs py-1.5 flex items-center gap-1" onClick={() => abrir(st.proximo)}>
              <Play size={12} aria-hidden="true" /> {JORNADA_BOTOES.continuar}
            </button>
          </div>
        )}

        <ul className="space-y-1">
          {st.fases.map(f => {
            const pendentes = f.passos.filter(p => p.estado === 'pendente')
            const expandida = aberta === f.id
            return (
              <li key={f.id} data-testid={`fase-${f.id}`}>
                <button type="button" className="w-full flex items-center gap-2 text-sm min-h-[36px] text-left" aria-expanded={expandida}
                  onClick={() => setFaseAberta(expandida ? '' : f.id)}>
                  {f.completa
                    ? <CheckCircle2 size={16} className="text-primary-fg shrink-0" aria-label="fase concluída" />
                    : (expandida ? <ChevronDown size={16} className="text-texto-3 shrink-0" /> : <ChevronRight size={16} className="text-texto-3 shrink-0" />)}
                  <span className={`flex-1 ${f.completa ? 'text-texto-2' : 'text-texto-1'}`}>{f.titulo}{f.opcional ? <span className="text-texto-3"> (opcional)</span> : null}</span>
                  <span className="text-xs text-texto-2">{f.feitas}/{f.total}</span>
                </button>
                {expandida && pendentes.length > 0 && (
                  <ul className="ml-6 space-y-2 pb-1">
                    {pendentes.map(p => (
                      <li key={p.id} className="text-sm">
                        <div className="flex items-start gap-2">
                          <Circle size={14} className="text-texto-3 shrink-0 mt-1" aria-label="a fazer" />
                          <div className="flex-1 min-w-0">
                            <p className="text-texto-1">{p.titulo}</p>
                            <p className="text-xs text-texto-2">{p.descricao}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <button type="button" className="btn-primary text-xs py-1" onClick={() => abrir(p)}>
                                {p.tipo === 'fazer' ? JORNADA_BOTOES.fazerComigo : JORNADA_BOTOES.verNaTela}
                              </button>
                              {p.tipo === 'conhecer' && (
                                <button type="button" className="btn-secondary text-xs py-1" onClick={() => marcarEtapa(p.id, 'feita')}>{JORNADA_BOTOES.entendi}</button>
                              )}
                              <button type="button" className="btn-secondary text-xs py-1" onClick={() => pular(p)}>{B.pular}</button>
                              {p.naoSeAplica && <button type="button" className="btn-secondary text-xs py-1" onClick={() => marcarEtapa(p.id, 'nao-se-aplica')}>{p.naoSeAplica}</button>}
                            </div>
                            {confirmarPular === p.id && (
                              <div role="alert" className="mt-1.5 rounded-lg border border-aviso/50 bg-aviso/10 px-3 py-2 text-xs text-texto-1 space-y-2">
                                <p>{p.avisoAoPular}</p>
                                <div className="flex gap-2">
                                  <button type="button" className="btn-secondary text-xs py-1" onClick={() => setConfirmarPular(null)}>{B.cancelar}</button>
                                  <button type="button" className="btn-secondary text-xs py-1" onClick={() => pular(p)}>{B.pularMesmoAssim}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>

        {st.puladas.length > 0 && (
          <div>
            <button type="button" className="flex items-center gap-1 text-xs text-texto-2 hover:text-texto-1 min-h-[32px]" aria-expanded={verPuladas} onClick={() => setVerPuladas(v => !v)}>
              {verPuladas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {verPuladas ? B.esconderPuladas : `${B.verPuladas} (${st.puladas.length})`}
            </button>
            {verPuladas && (
              <ul className="mt-1 space-y-1">
                {st.puladas.map(p => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm min-h-[36px]">
                    <MinusCircle size={16} className="text-texto-3 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-[12rem] text-texto-2">{p.titulo}{p.estado === 'nao-se-aplica' && <span className="text-texto-3"> — {p.naoSeAplica}</span>}</span>
                    <button type="button" className="btn-secondary text-xs py-1" onClick={() => marcarEtapa(p.id, null)}>
                      {p.estado === 'nao-se-aplica' ? B.desfazer : B.retomar}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {modais}
    </>
  )
}
