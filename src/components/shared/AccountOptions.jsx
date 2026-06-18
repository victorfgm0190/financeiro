import { groupedAccountOptions } from './utils'
import { useIsMobile } from '../../hooks/useIsMobile'

// Renderiza <optgroup>/<option> dentro de um <select>, AGRUPADOS e ORDENADOS pela ordem dos
// Grupos de Contas definida em Configurações (igual à tela de Contas). Cada grupo vira um
// <optgroup label="<nome do grupo>">; contas sem grupo aparecem soltas no fim.
// Requer `accountGroups` para agrupar; sem ele, cai numa lista plana (sem regressão).
// Uso: <select ...><AccountOptions accounts={accounts} accountGroups={accountGroups} /></select>
export default function AccountOptions({
  accounts,
  accountGroups,
  placeholder = 'Selecione...',
  filter,
  labelFn,
}) {
  // Contas inativas (active === false) nunca aparecem nos selects de formulário.
  // No mobile (<md), contas marcadas como "Ocultar no Mobile" também são omitidas.
  const isMobile = useIsMobile()
  const pool = (filter ? accounts.filter(filter) : accounts)
    .filter(a => a.active !== false && (!isMobile || !a.hideOnMobile))
  const label = labelFn || (a => a.name)
  const groups = groupedAccountOptions(pool, accountGroups)

  return (
    <>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {groups.map(({ group, accounts: accs }) =>
        group ? (
          <optgroup key={group.id} label={group.name}>
            {accs.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
          </optgroup>
        ) : (
          accs.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)
        )
      )}
    </>
  )
}
