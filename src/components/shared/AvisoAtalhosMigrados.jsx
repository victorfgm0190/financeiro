import { Keyboard, X } from 'lucide-react'
import { useAtalhos } from '../../context/atalhosHooks'
import { navegarPara } from '../../lib/abrirTela'
import { configHash } from '../../lib/configRota'

// Aviso ÚNICO da migração das regras de atalho (AtalhosContext corrige no banco ao carregar, então não
// aparece de novo): quais atalhos voltaram ao padrão ou foram desativados, e por quê.
export default function AvisoAtalhosMigrados() {
  const ctx = useAtalhos()
  const itens = ctx?.avisoMigracao
  if (!itens?.length) return null
  return (
    <div role="status" data-testid="aviso-atalhos-migrados"
      className="fixed z-[80] left-4 bottom-4 max-w-sm bg-surface border border-aviso/60 rounded-xl shadow-2xl p-3 text-xs text-texto-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-texto-1 flex items-center gap-1.5"><Keyboard size={14} className="text-aviso" /> Atalhos ajustados às regras novas</p>
        <button type="button" aria-label="Fechar aviso" className="p-1 -m-1 text-texto-3 hover:text-texto-1" onClick={ctx.fecharAvisoMigracao}><X size={14} /></button>
      </div>
      <ul className="list-disc pl-4 space-y-0.5">{itens.map(t => <li key={t}>{t}</li>)}</ul>
      <button type="button" className="btn-secondary text-xs py-1" onClick={() => { ctx.fecharAvisoMigracao(); navegarPara('settings', { hash: configHash('cadastros', 'atalhos') }) }}>Ver atalhos</button>
    </div>
  )
}
