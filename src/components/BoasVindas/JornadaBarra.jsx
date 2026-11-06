// Barra discreta da JORNADA, em qualquer tela, enquanto um passo aberto pelo painel está em andamento:
//   • conhecer → durante o tour fica esmaecida ("Siga o tour da tela…"), sem o "Entendi". Tour até o
//     fim: "Concluir este passo? ✔ Entendi" e o próximo passo. Fechado no meio: "Entendi ✔" e "Ver de novo";
//   • fazer    → avisa que conclui sozinho; quando o dado aparece no banco, mostra ✔ e o próximo.
// Montada uma vez no App. Some com ✕ (o passo continua pendente no painel) ou com a jornada desligada.
import { CheckCircle2, X, Compass } from 'lucide-react'
import { jornadaComStatus, proximoDepois } from '../../lib/onboardingSteps'
import { marcarEtapa } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'
import { abrirPassoJornada, encerrarPassoJornada, useFimTourJornada, usePassoJornadaAtivo } from './jornadaEstado'
import { useTourAtivo } from './tourEstado'
import { useDadosJornada, JORNADA_BOTOES } from './jornadaDados'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function JornadaBarra() {
  const ativoId = usePassoJornadaAtivo()
  const fim = useFimTourJornada()
  const tour = useTourAtivo()
  const ctx = useContextoAjuda()
  const { estado, dados } = useDadosJornada()
  const { executar, modais } = useAcoesPrimeirosPassos()
  const isMobile = useIsMobile()
  if (!ativoId || !estado || estado.jornadaLigada === false) return modais

  const st = jornadaComStatus(ctx, dados)
  const passo = st.passos.find(p => p.id === ativoId)
  if (!passo) return modais
  const proximo = proximoDepois(st, passo.id)
  const abrir = (p) => abrirPassoJornada(p, { ctx, celular: isMobile, executar })
  const conhecer = passo.tipo === 'conhecer' && !passo.feito
  const emTour = conhecer && (fim === 'aguardando' || (tour?.tipo === 'tour' && !!tour.jornada))
  const tourAteFim = conhecer && !emTour && fim === 'concluido'
  const entendi = () => marcarEtapa(passo.id, 'feita')

  return (
    <>
      <div role="status" data-testid="jornada-barra" data-em-tour={emTour ? 'sim' : undefined}
        className={`fixed z-40 left-3 right-3 bottom-20 md:left-auto md:right-4 md:bottom-4 md:w-[22rem] card shadow-2xl border border-borda-forte p-3 space-y-2 transition-opacity ${emTour ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-2">
          <Compass size={16} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-texto-3">Jornada · {st.feitas}/{st.total}</p>
            <p className="text-sm font-medium text-texto-1 flex items-center gap-1.5">
              {passo.feito && <CheckCircle2 size={14} className="text-primary-fg shrink-0" aria-label="concluído" />}
              {passo.titulo}
            </p>
            {!passo.feito && (
              <p className="text-xs text-texto-2 mt-0.5">
                {passo.tipo === 'fazer' ? 'Faça na tela: este passo conclui sozinho quando você salvar.'
                  : emTour ? 'Siga o tour da tela…'
                    : tourAteFim ? 'Concluir este passo?'
                      : 'Veja o tour da tela e, quando terminar, clique em "Entendi".'}
              </p>
            )}
          </div>
          <button type="button" aria-label="Fechar a barra da jornada" className="text-texto-3 hover:text-texto-1 p-1 -m-1" onClick={encerrarPassoJornada}><X size={14} /></button>
        </div>
        {!emTour && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {conhecer && <button type="button" className="btn-primary text-xs py-1.5" onClick={entendi}>{JORNADA_BOTOES.entendi}</button>}
            {!passo.feito && !tourAteFim && <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => abrir(passo)}>Ver de novo</button>}
            {tourAteFim && proximo && (
              <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => { entendi(); abrir(proximo) }}>Próximo: {proximo.titulo}</button>
            )}
            {passo.feito && proximo && <button type="button" className="btn-primary text-xs py-1.5" onClick={() => abrir(proximo)}>Próximo: {proximo.titulo}</button>}
            {passo.feito && !proximo && <button type="button" className="btn-primary text-xs py-1.5" onClick={encerrarPassoJornada}>Concluir</button>}
          </div>
        )}
      </div>
      {modais}
    </>
  )
}
