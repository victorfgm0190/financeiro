// Checklist "Primeiros passos" no Painel (desktop) e no Início (celular). Cada etapa: pendente, feita
// (detectada pelos dados), pulada ("Pular por enquanto" — retomável em "Ver etapas puladas") ou "não se
// aplica" (botão próprio da etapa, ex.: "Não tenho cartão de crédito" — fora do progresso). Progresso
// "3 de 5 concluídas". Some quando nada mais está pendente, com "Ocultar" ou com os guias desligados.
// Estados no banco, por usuário (boas_vindas_usuario.progresso). Textos: src/lib/ajudaTelas.js.
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, MinusCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { checklistComStatus, progressoTexto, CHECKLIST_TITULO, CHECKLIST_SUBTITULO, CHECKLIST_OCULTAR, CHECKLIST_BOTOES as B } from '../../lib/ajudaTelas'
import { assinarBoasVindas, carregarBoasVindas, estadoBoasVindas, ocultarChecklist, marcarEtapa } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'
import { TAREFA_DA_ETAPA, tarefaPorId, tarefaDisponivel } from '../../lib/tarefasGuiadas'
import { iniciarTarefa } from './tourEstado'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function PrimeirosPassos({ className = '' }) {
  const ctx = useContextoAjuda()
  const { profiles, accounts, schedules, cardImports, contratos, dbStatus } = useApp()
  const [estado, setEstado] = useState(estadoBoasVindas)
  const [verPuladas, setVerPuladas] = useState(false)
  const [confirmarPular, setConfirmarPular] = useState(null) // etapa com aviso antes de pular
  const { executar, modais } = useAcoesPrimeirosPassos()
  const isMobile = useIsMobile()
  // "Fazer agora": a tarefa guiada da etapa (navega até a tela e já começa); sem ela, o formulário.
  const fazerAgora = (i) => {
    const t = tarefaPorId(TAREFA_DA_ETAPA[i.id])
    if (tarefaDisponivel(t, ctx, { celular: isMobile })) iniciarTarefa(t.id)
    else executar(i.acao)
  }
  useEffect(() => assinarBoasVindas(setEstado), [])
  useEffect(() => { if (dbStatus === 'connected') carregarBoasVindas() }, [dbStatus])

  const st = checklistComStatus(ctx, { profiles, accounts, schedules, cardImports, contratos, progresso: estado?.progresso })
  // Sem saber do banco (null), não aparece: melhor do que reaparecer para quem ocultou.
  // Guias desligados: o checklist some (volta ao religar).
  if (!estado || estado.guiasLigados === false || estado.checklistOcultoEm || st.completo || !st.itens.length) return modais

  const pular = (i) => {
    if (i.avisoAoPular && confirmarPular !== i.id) { setConfirmarPular(i.id); return }
    setConfirmarPular(null)
    marcarEtapa(i.id, 'pulada')
  }
  const visiveis = st.itens.filter(i => i.estado === 'pendente' || i.estado === 'feita')

  return (
    <>
      <section data-testid="primeiros-passos" className={`card space-y-3 ${className}`} aria-label={CHECKLIST_TITULO}>
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-texto-1">{CHECKLIST_TITULO} <span className="font-normal text-texto-2" data-testid="progresso-checklist">· {progressoTexto(st.feitas, st.total)}</span></h2>
            <p className="text-xs text-texto-2 mt-0.5">{CHECKLIST_SUBTITULO}</p>
          </div>
          <button type="button" className="ml-auto text-xs text-texto-2 hover:text-texto-1 min-h-[32px] px-1" onClick={ocultarChecklist}>{CHECKLIST_OCULTAR}</button>
        </div>
        <ul className="space-y-1.5">
          {visiveis.map(i => (
            <li key={i.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[40px]">
                {i.feito
                  ? <CheckCircle2 size={18} className="text-primary-fg shrink-0" aria-label="feita" />
                  : <Circle size={18} className="text-texto-3 shrink-0" aria-label="a fazer" />}
                <span className={`flex-1 min-w-[12rem] ${i.feito ? 'text-texto-2 line-through' : 'text-texto-1'}`}>{i.texto}</span>
                {!i.feito && (
                  <span className="flex flex-wrap gap-1.5 shrink-0">
                    <button type="button" className="btn-primary text-xs py-1.5" onClick={() => fazerAgora(i)}>{B.fazer}</button>
                    <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => pular(i)}>{B.pular}</button>
                    {i.naoSeAplica && <button type="button" className="btn-secondary text-xs py-1.5" onClick={() => marcarEtapa(i.id, 'nao-se-aplica')}>{i.naoSeAplica}</button>}
                  </span>
                )}
              </div>
              {confirmarPular === i.id && (
                <div role="alert" className="mt-1 ml-6 rounded-lg border border-aviso/50 bg-aviso/10 px-3 py-2 text-xs text-texto-1 space-y-2">
                  <p>{i.avisoAoPular}</p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary text-xs py-1" onClick={() => setConfirmarPular(null)}>{B.cancelar}</button>
                    <button type="button" className="btn-secondary text-xs py-1" onClick={() => pular(i)}>{B.pularMesmoAssim}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {st.puladas.length > 0 && (
          <div>
            <button type="button" className="flex items-center gap-1 text-xs text-texto-2 hover:text-texto-1 min-h-[32px]" aria-expanded={verPuladas} onClick={() => setVerPuladas(v => !v)}>
              {verPuladas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {verPuladas ? B.esconderPuladas : `${B.verPuladas} (${st.puladas.length})`}
            </button>
            {verPuladas && (
              <ul className="mt-1 space-y-1">
                {st.puladas.map(i => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm min-h-[36px]">
                    <MinusCircle size={16} className="text-texto-3 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-[12rem] text-texto-2">{i.texto}{i.estado === 'nao-se-aplica' && <span className="text-texto-3"> — {i.naoSeAplica}</span>}</span>
                    <button type="button" className="btn-secondary text-xs py-1" onClick={() => marcarEtapa(i.id, null)}>
                      {i.estado === 'nao-se-aplica' ? B.desfazer : B.retomar}
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
