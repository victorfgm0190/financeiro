// <option>/<optgroup> do seletor nativo de CONTA DESTINO, agrupados por perfil (perfil atual primeiro;
// depois um <optgroup> por outro perfil permitido). Um perfil só: igual ao AccountOptions de sempre.
// Uso: <select …><OpcoesDestinoPorPerfil accounts={todasAsContas} accountGroups={…} excludeId={origem} /></select>
import { useApp } from '../../context/AppContext'
import { useIsMobile } from '../../hooks/useIsMobile'
import { blocosDestinoPorPerfil } from '../../lib/contasPorPerfil'
import { perfilDaConta } from '../../lib/perfilConta'
import AccountOptions from './AccountOptions'
import { groupedAccountOptions } from './utils'

export default function OpcoesDestinoPorPerfil({ accounts, accountGroups, excludeId = null, placeholder = 'Selecione...' }) {
  const { profiles, activeProfileId } = useApp()
  const isMobile = useIsMobile()
  const blocos = blocosDestinoPorPerfil(accounts, profiles, activeProfileId, { excludeId, isMobile })
  if (blocos.length <= 1) return <AccountOptions accounts={blocos[0]?.contas || []} accountGroups={accountGroups} placeholder={placeholder} />
  return (
    <>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {blocos.map(b => {
        const { nomeCompleto } = perfilDaConta(b.contas[0], profiles)
        const rotulo = b.perfil ? `Perfil: ${nomeCompleto}${b.atual ? ' (atual)' : ''}` : 'Contas sem perfil'
        return (
          <optgroup key={b.key} label={rotulo}>
            {groupedAccountOptions(b.contas, accountGroups).flatMap(g => g.accounts).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </optgroup>
        )
      })}
    </>
  )
}
