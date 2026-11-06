// JORNADA GUIADA — painel de progresso (antes, o checklist "Primeiros passos"), no Painel (desktop),
// no Início (celular) e na Central de Ajuda (sempre expandido, prop `expandido`).
//   Compacto: "Sua jornada: 9/11 · 2 pulados", barra, próximo passo, "Continuar de onde parei", "Ocultar".
//   "Ver fases ▾": lista das fases e passos, puladas, Extras e "Quero ir direto para…". A escolha fica
//   no banco (progresso.jornadaExpandida).
// Passos em src/lib/onboardingSteps.js: conhecer → tour da tela + "Entendi ✔"; fazer → "Faça comigo",
// conclui sozinho quando o dado existe. Concluído some da lista. O contador e os parabéns valem para as
// fases principais: pulado e "não se aplica" contam como resolvidos; Extras tem o próprio x/y.
// Some com "Ocultar"/"Fechar" ou com a jornada desligada (Configurações › Guias das telas).
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, MinusCircle, ChevronDown, ChevronRight, PartyPopper, Play, Target } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { CHECKLIST_OCULTAR, CHECKLIST_BOTOES as B } from '../../lib/ajudaTelas'
import { jornadaComStatus } from '../../lib/onboardingSteps'
import { carregarBoasVindas, ocultarChecklist, marcarEtapa, definirJornadaExpandida, definirObjetivoJornada } from '../../lib/boasVindasApi'
import { useDadosJornada, JORNADA_TITULO, JORNADA_BOTOES } from './jornadaDados'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'
import { abrirPassoJornada } from './jornadaEstado'
import { useIsMobile } from '../../hooks/useIsMobile'

// Passos pendentes de uma fase, com as ações de cada um.
function ListaPassos({ passos, abrir, pular, confirmarPular, setConfirmarPular }) {
  return (
    <ul className="ml-6 space-y-2 pb-1">
      {passos.map(p => (
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
  )
}

// Linha de uma fase (abre e fecha) + os passos pendentes dela.
function Fase({ fase, titulo, expandida, alternar, ...lista }) {
  const pendentes = fase.passos.filter(p => p.estado === 'pendente')
  return (
    <li data-testid={`fase-${fase.id}`}>
      <button type="button" className="w-full flex items-center gap-2 text-sm min-h-[36px] text-left" aria-expanded={expandida} onClick={alternar}>
        {fase.completa
          ? <CheckCircle2 size={16} className="text-primary-fg shrink-0" aria-label="fase concluída" />
          : (expandida ? <ChevronDown size={16} className="text-texto-3 shrink-0" /> : <ChevronRight size={16} className="text-texto-3 shrink-0" />)}
        <span className={`flex-1 ${fase.completa ? 'text-texto-2' : 'text-texto-1'}`}>{titulo}</span>
        <span className="text-xs text-texto-2">{fase.feitas}/{fase.total}</span>
      </button>
      {expandida && pendentes.length > 0 && <ListaPassos passos={pendentes} {...lista} />}
    </li>
  )
}

function Puladas({ itens }) {
  const [ver, setVer] = useState(false)
  if (!itens.length) return null
  return (
    <div>
      <button type="button" className="flex items-center gap-1 text-xs text-texto-2 hover:text-texto-1 min-h-[32px]" aria-expanded={ver} onClick={() => setVer(v => !v)}>
        {ver ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {ver ? B.esconderPuladas : `${B.verPuladas} (${itens.length})`}
      </button>
      {ver && (
        <ul className="mt-1 space-y-1">
          {itens.map(p => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm min-h-[36px]">
              <MinusCircle size={16} className="text-texto-3 shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-[12rem] text-texto-2">{p.titulo}{p.estado === 'nao-se-aplica' && p.naoSeAplica && <span className="text-texto-3"> — {p.naoSeAplica}</span>}</span>
              <button type="button" className="btn-secondary text-xs py-1" onClick={() => marcarEtapa(p.id, null)}>
                {p.estado === 'nao-se-aplica' ? B.desfazer : B.retomar}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PrimeirosPassos({ className = '', expandido = false }) {
  const ctx = useContextoAjuda()
  const { dbStatus } = useApp()
  const { estado, dados } = useDadosJornada()
  const [faseAberta, setFaseAberta] = useState(null)
  const [confirmarPular, setConfirmarPular] = useState(null)
  const { executar, modais } = useAcoesPrimeirosPassos()
  const isMobile = useIsMobile()
  useEffect(() => { if (dbStatus === 'connected') carregarBoasVindas() }, [dbStatus])

  const st = jornadaComStatus(ctx, dados)
  // Objetivo concluído: a jornada volta ao normal.
  const objetivoConcluido = st.objetivoConcluido
  useEffect(() => { if (objetivoConcluido) definirObjetivoJornada(null) }, [objetivoConcluido])

  // Sem saber do banco (null) não aparece; jornada desligada ou ocultada: some (volta ao religar).
  if (!estado || estado.jornadaLigada === false || estado.checklistOcultoEm || !st.passos.length) return modais

  const abrir = (p) => abrirPassoJornada(p, { ctx, celular: isMobile, executar })
  const pular = (p) => {
    if (p.avisoAoPular && confirmarPular !== p.id) { setConfirmarPular(p.id); return }
    setConfirmarPular(null)
    marcarEtapa(p.id, 'pulada')
  }
  const irParaObjetivo = (o) => {
    definirObjetivoJornada(o.id)
    if (o.passos[0]) abrir(o.passos[0])
  }
  const lista = { abrir, pular, confirmarPular, setConfirmarPular }
  const alternarFase = (id, aberta) => setFaseAberta(aberta ? '' : id)
  const faseAtual = faseAberta ?? st.proximo?.fase ?? null
  const verFases = expandido || estado.progresso?.jornadaExpandida === true

  const extras = st.extras && (
    <ul className="pt-1 border-t border-borda">
      <Fase fase={st.extras} titulo="Extras (opcional)" expandida={faseAberta === st.extras.id || (faseAberta === null && st.proximo?.fase === st.extras.id)}
        alternar={() => alternarFase(st.extras.id, faseAberta === st.extras.id)} {...lista} />
    </ul>
  )

  if (st.completo && !st.objetivo) {
    return (
      <>
        <section data-testid="primeiros-passos" className={`card space-y-2 ${className}`} aria-label={JORNADA_TITULO}>
          <div className="flex items-center gap-3">
            <PartyPopper size={20} className="text-primary-fg shrink-0" aria-hidden="true" />
            <p className="text-sm text-texto-1 flex-1">Parabéns! Você concluiu a jornada. A ajuda de cada tela continua no "?" ao lado do título.</p>
            <button type="button" className="btn-secondary text-xs py-1.5" onClick={ocultarChecklist}>Fechar</button>
          </div>
          {extras}
          <Puladas itens={st.puladas} />
        </section>
        {modais}
      </>
    )
  }

  const pct = st.total ? Math.round((st.feitas / st.total) * 100) : 0
  return (
    <>
      <section data-testid="primeiros-passos" className={`card space-y-2.5 ${className}`} aria-label={JORNADA_TITULO}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-semibold text-texto-1 whitespace-nowrap">
            {JORNADA_TITULO}: <span data-testid="progresso-jornada">{st.feitas}/{st.total}</span>
            {st.pulados > 0 && <span className="font-normal text-texto-2" data-testid="pulados-jornada"> · {st.pulados} {st.pulados === 1 ? 'pulado' : 'pulados'}</span>}
          </h2>
          <div className="h-1.5 flex-1 min-w-[4rem] rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da jornada">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {st.proximo && (
            <span className="text-sm text-texto-2 min-w-0">Próximo passo: <span className="text-texto-1 font-medium" data-testid="proximo-passo">{st.proximo.titulo}</span></span>
          )}
          {st.proximo && (
            <button type="button" className="btn-primary text-xs py-1.5 flex items-center gap-1 whitespace-nowrap" onClick={() => abrir(st.proximo)}>
              <Play size={12} aria-hidden="true" /> {JORNADA_BOTOES.continuar}
            </button>
          )}
          {!expandido && (
            <button type="button" className="text-xs text-texto-2 hover:text-texto-1 min-h-[32px] px-1 whitespace-nowrap" aria-expanded={verFases} onClick={() => definirJornadaExpandida(!verFases)}>
              {verFases ? 'Recolher ▴' : 'Ver fases ▾'}
            </button>
          )}
          <button type="button" className="text-xs text-texto-2 hover:text-texto-1 min-h-[32px] px-1" onClick={ocultarChecklist}>{CHECKLIST_OCULTAR}</button>
        </div>

        {st.objetivo && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-texto-2" data-testid="objetivo-jornada">
            <Target size={14} className="text-primary-fg shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-[10rem]">Objetivo: <span className="text-texto-1 font-medium">{st.objetivo.titulo}</span> · {st.objetivo.passos.length} {st.objetivo.passos.length === 1 ? 'passo' : 'passos'} até lá</span>
            <button type="button" className="underline hover:text-texto-1" onClick={() => definirObjetivoJornada(null)}>Voltar à jornada normal</button>
          </p>
        )}

        {verFases && (
          <>
            <ul className="space-y-1">
              {st.fases.map(f => (
                <Fase key={f.id} fase={f} titulo={f.titulo} expandida={faseAtual === f.id} alternar={() => alternarFase(f.id, faseAtual === f.id)} {...lista} />
              ))}
            </ul>
            {extras}
            <Puladas itens={st.puladas} />
            {st.objetivosDisponiveis.length > 0 && !st.objetivo && (
              <div data-testid="objetivos-jornada" className="pt-1 border-t border-borda">
                <p className="text-xs text-texto-2 mb-1.5">Quero ir direto para…</p>
                <div className="flex flex-wrap gap-1.5">
                  {st.objetivosDisponiveis.map(o => (
                    <button key={o.id} type="button" className="btn-secondary text-xs py-1" onClick={() => irParaObjetivo(o)}>{o.titulo}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {modais}
    </>
  )
}
