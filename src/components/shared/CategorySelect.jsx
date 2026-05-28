const GROUP_ORDER = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação',
  'Lazer', 'Vestuário', 'Impostos', 'Seguros', 'Bancos', 'Outras Despesas',
  'Remunerações', 'Rendimentos', 'Outras Receitas',
]

export default function CategorySelect({
  categories,
  value,
  onChange,
  type,
  className = 'input',
  placeholder = 'Sem categoria',
  required = false,
}) {
  const filtered = type
    ? categories.filter(c => c.type === type || c.type === 'both')
    : categories

  const grouped = {}
  const ungrouped = []
  for (const cat of filtered) {
    if (cat.group) {
      if (!grouped[cat.group]) grouped[cat.group] = []
      grouped[cat.group].push(cat)
    } else {
      ungrouped.push(cat)
    }
  }

  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a)
    const ib = GROUP_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'pt-BR')
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  const hasGroups = sortedGroups.length > 0

  return (
    <select className={className} value={value} onChange={onChange} required={required}>
      <option value="">{placeholder}</option>
      {ungrouped.length > 0 && hasGroups ? (
        <optgroup label="— Geral">
          {ungrouped.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </optgroup>
      ) : (
        ungrouped.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)
      )}
      {sortedGroups.map(groupName => (
        <optgroup key={groupName} label={groupName}>
          {grouped[groupName].map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
