import { User, Building2, Unlink } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { perfilDaConta } from '../../lib/perfilConta'

// Selo do perfil vinculado à conta (qualquer tipo, inclusive cartão, gerencial e inativa). Chip
// bg-surface com tokens de tema: legível tanto sobre os degradês dos cards de conta quanto sobre
// a superfície dos modais, nos dois temas. Sem perfil → "Sem vínculo" com borda/texto de aviso.
export default function ProfileBadge({ account, className = '' }) {
  const { profiles } = useApp()
  const { perfil, rotulo, nomeCompleto } = perfilDaConta(account, profiles)
  const Icon = !perfil ? Unlink : perfil.type === 'pf' ? User : Building2
  const cor = perfil ? 'text-texto-2 border-borda-forte' : 'text-aviso border-aviso/60'
  return (
    <span
      title={perfil ? `Perfil: ${nomeCompleto}` : nomeCompleto}
      className={`inline-flex items-center gap-1 max-w-[9rem] px-1.5 py-0.5 rounded text-[11px] leading-tight font-medium bg-surface border ${cor} ${className}`}
    >
      <Icon size={10} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{rotulo}</span>
    </span>
  )
}
