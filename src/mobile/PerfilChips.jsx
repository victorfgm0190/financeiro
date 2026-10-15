import { User, Building2 } from 'lucide-react'
import { useApp } from '../context/AppContext'

// Chips de perfil do mobile (Tudo | CPF | CNPJ): o MESMO estado do desktop (activeProfileId do
// AppContext) e os mesmos ícones/estilos dos chips do Header. Só troca o perfil — os números das
// telas já vêm filtrados por ele (profileAccounts, profileSchedules, getSaldoPrincipalBreakdown…).
export default function PerfilChips() {
  const { profiles, activeProfileId, setActiveProfileId } = useApp()
  if (!profiles?.length) return null

  const base = 'shrink-0 flex items-center gap-1.5 px-3 min-h-[32px] rounded-full text-xs font-medium transition-colors border'
  const inativo = 'bg-surface-2/60 border-borda-forte text-texto-2'

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4" role="group" aria-label="Perfil">
      <button
        type="button"
        onClick={() => setActiveProfileId(null)}
        aria-pressed={activeProfileId === null}
        className={`${base} ${activeProfileId === null ? 'bg-primary/15 border-primary/40 text-primary-fg' : inativo}`}
      >
        Tudo
      </button>
      {profiles.map(p => {
        const ativo = activeProfileId === p.id
        const Icon = p.type === 'pf' ? User : Building2
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveProfileId(ativo ? null : p.id)}
            aria-pressed={ativo}
            title={`${p.name} — ${p.type === 'pf' ? 'CPF' : 'CNPJ'} ${p.document || ''}`}
            className={`${base} ${ativo ? 'bg-surface-2 text-texto-1 border-transparent ring-2 ring-inset' : inativo}`}
            style={ativo ? { '--tw-ring-color': p.color } : {}}
          >
            <Icon size={12} className="shrink-0" />
            <span className="truncate max-w-[7.5rem]">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}
