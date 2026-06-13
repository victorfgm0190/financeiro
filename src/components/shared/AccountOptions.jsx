import { accountPriority } from './utils'
import { useIsMobile } from '../../hooks/useIsMobile'

// Renders <optgroup>/<option> elements inside a <select>, sorted by priority.
// Tier 0 (isMain / credit) and Tier 1 (appPriority) appear ungrouped at top.
// Tier 2 (rest) appears inside an <optgroup label="Outras contas">.
// Usage: <select ...><AccountOptions accounts={accounts} /></select>
export default function AccountOptions({
  accounts,
  accountGroups, // kept for interface compatibility, unused
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

  const top = pool.filter(a => accountPriority(a) === 0)
  const mid = pool.filter(a => accountPriority(a) === 1)
  const rest = pool.filter(a => accountPriority(a) === 2)
  const hasGroups = top.length + mid.length > 0 && rest.length > 0

  return (
    <>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {top.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
      {mid.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
      {hasGroups ? (
        <optgroup label="Outras contas">
          {rest.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
        </optgroup>
      ) : (
        rest.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)
      )}
    </>
  )
}
