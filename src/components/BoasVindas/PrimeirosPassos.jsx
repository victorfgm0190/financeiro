// Checklist "Primeiros passos" no Painel (desktop) e no Início (celular): some quando tudo está feito
// ou quando o usuário clica "Ocultar" (gravado no banco, por usuário). Textos: src/lib/ajudaTelas.js.
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { checklistComStatus, CHECKLIST_TITULO, CHECKLIST_SUBTITULO, CHECKLIST_OCULTAR } from '../../lib/ajudaTelas'
import { assinarBoasVindas, carregarBoasVindas, estadoBoasVindas, ocultarChecklist } from '../../lib/boasVindasApi'
import { useContextoAjuda } from './contextoAjuda'
import { useAcoesPrimeirosPassos } from './AcoesPrimeirosPassos'

export default function PrimeirosPassos({ className = '' }) {
  const ctx = useContextoAjuda()
  const { profiles, accounts, schedules, dbStatus } = useApp()
  const [estado, setEstado] = useState(estadoBoasVindas)
  const { executar, modais } = useAcoesPrimeirosPassos()
  useEffect(() => assinarBoasVindas(setEstado), [])
  useEffect(() => { if (dbStatus === 'connected') carregarBoasVindas() }, [dbStatus])

  const { itens, completo } = checklistComStatus(ctx, { profiles, accounts, schedules })
  // Sem saber do banco (null), não aparece: melhor do que reaparecer para quem ocultou.
  // Guias desligados: o checklist some (volta ao religar).
  if (!estado || estado.guiasLigados === false || estado.checklistOcultoEm || completo || !itens.length) return modais
  const feitos = itens.filter(i => i.feito).length

  return (
    <>
      <section data-testid="primeiros-passos" className={`card space-y-3 ${className}`} aria-label={CHECKLIST_TITULO}>
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-texto-1">{CHECKLIST_TITULO} <span className="font-normal text-texto-2">({feitos} de {itens.length})</span></h2>
            <p className="text-xs text-texto-2 mt-0.5">{CHECKLIST_SUBTITULO}</p>
          </div>
          <button type="button" className="ml-auto text-xs text-texto-2 hover:text-texto-1 min-h-[32px] px-1" onClick={ocultarChecklist}>{CHECKLIST_OCULTAR}</button>
        </div>
        <ul className="space-y-1.5">
          {itens.map(i => (
            <li key={i.id} className="flex items-center gap-2 text-sm min-h-[40px]">
              {i.feito
                ? <CheckCircle2 size={18} className="text-primary-fg shrink-0" aria-label="feito" />
                : <Circle size={18} className="text-texto-3 shrink-0" aria-label="a fazer" />}
              <span className={`flex-1 min-w-0 ${i.feito ? 'text-texto-2 line-through' : 'text-texto-1'}`}>{i.texto}</span>
              {!i.feito && <button type="button" className="btn-secondary text-xs py-1.5 shrink-0" onClick={() => executar(i.acao)}>{i.botao}</button>}
            </li>
          ))}
        </ul>
      </section>
      {modais}
    </>
  )
}
