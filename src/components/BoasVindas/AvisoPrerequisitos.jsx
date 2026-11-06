// Aviso amigável ao abrir uma função sem o que ela exige (src/lib/prerequisitos.js): lista com ✅/⬜ e
// "Fazer agora", que leva até lá com o "Faça comigo". Vale com a jornada ligada ou desligada. Quem já
// tem tudo não vê nada; o formulário continua aberto (só orienta). Só depois de carregar os dados do
// banco, para não piscar enquanto conecta.
import { CheckCircle2, Circle, Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { prerequisitosDe } from '../../lib/prerequisitos'
import { tarefaDisponivel, tarefaPorId } from '../../lib/tarefasGuiadas'
import { navegarPara } from '../../lib/abrirTela'
import { useContextoAjuda } from './contextoAjuda'
import { iniciarTarefa } from './tourEstado'
import { useIsMobile } from '../../hooks/useIsMobile'

function Lista({ pre, onIr }) {
  const ctx = useContextoAjuda()
  const isMobile = useIsMobile()
  const fazer = (p) => {
    const t = tarefaPorId(p.tarefa)
    onIr?.()
    if (tarefaDisponivel(t, ctx, { celular: isMobile })) iniciarTarefa(t.id)
    else navegarPara(p.tela, p.hash ? { hash: p.hash } : {})
  }
  return (
    <div role="note" data-testid="aviso-prerequisitos" className="rounded-lg border border-aviso/50 bg-aviso/10 px-3 py-2.5 text-sm text-texto-1 space-y-2 mb-3">
      <p className="flex items-start gap-2">
        <Info size={15} className="text-aviso shrink-0 mt-0.5" aria-hidden="true" />
        <span>Para {pre.titulo} você precisa antes de:</span>
      </p>
      <ul className="space-y-1.5 ml-6">
        {pre.itens.map(i => (
          <li key={i.passo.id} className="flex flex-wrap items-center gap-2">
            {i.ok
              ? <CheckCircle2 size={15} className="text-primary-fg shrink-0" aria-label="já feito" />
              : <Circle size={15} className="text-texto-3 shrink-0" aria-label="a fazer" />}
            <span className={`flex-1 min-w-[10rem] ${i.ok ? 'text-texto-2' : ''}`}>{i.texto}</span>
            {!i.ok && <button type="button" className="btn-primary text-xs py-1" onClick={() => fazer(i.passo)}>Fazer agora</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AvisoPrerequisitos({ funcao, onIr }) {
  const { profiles, accounts, categories, dbStatus } = useApp()
  if (dbStatus !== 'connected' || !Array.isArray(accounts)) return null
  const pre = prerequisitosDe(funcao, { profiles, accounts, categories })
  if (!pre?.faltam) return null
  return <Lista pre={pre} onIr={onIr} />
}
