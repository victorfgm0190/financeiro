import { groupedAccountOptions } from './utils'

// Renders <optgroup>/<option> elements inside a <select>, sorted by group order.
// Usage: <select ...><AccountOptions accounts={accounts} accountGroups={accountGroups} /></select>
export default function AccountOptions({
  accounts,
  accountGroups,
  placeholder = 'Selecione...',
  filter,          // optional (a) => bool to pre-filter accounts
  labelFn,         // optional (a) => string for option label, defaults to a.name
}) {
  const pool = filter ? accounts.filter(filter) : accounts
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
