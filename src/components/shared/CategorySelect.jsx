import { useMemo } from 'react'
import SearchableSelect from './SearchableSelect'
import { useApp } from '../../context/AppContext'
import { filtrarCategoriasPorPerfil, categoriaDisponivelParaPerfil } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'

// `categories` chega JÁ ORDENADA (ordenarCategorias: grupos na ordem salva/padrão, depois
// sortOrder/alfabética) — aqui só agrupa, preservando a ordem de chegada.
function buildGroups(categories, type) {
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

  const sortedGroups = Object.keys(grouped)

  return { filtered, grouped, ungrouped, sortedGroups }
}

// ── Com busca: o SearchableSelect do sistema (mesmo teclado e foco em todas as telas) ─────────

function SearchableDropdown({ categories, type, value, onChange, className, placeholder }) {
  const options = useMemo(() => buildGroups(categories, type).filtered.map(c => ({
    id: c.id, label: [c.icon, c.name].filter(Boolean).join(' '), group: c.group || undefined,
  })), [categories, type])
  return (
    <SearchableSelect
      options={options}
      value={value || ''}
      onChange={id => onChange({ target: { value: id } })}
      placeholder={placeholder}
      preserveGroupOrder
      ungroupedLast
      ungroupedLabel="Sem grupo"
      triggerClassName={className}
      compacto={/text-xs/.test(className || '')}
    />
  )
}

// ── Public component ───────────────────────────────────────────────────────────

// Categorias por perfil: `perfilId` ausente (undefined) = perfil do chip do topo; null explícito =
// sem filtro (ex.: telas de configuração que listam tudo). A categoria já selecionada (`value`)
// fica sempre na lista, mesmo sendo de outro perfil — editar não apaga nem troca o que foi gravado.
export default function CategorySelect({
  categories: categoriesProp,
  value,
  onChange,
  type,
  className = 'input',
  placeholder = 'Sem categoria',
  required = false,
  searchable = false,
  perfilId,
}) {
  const { activeProfileId, categoryGroupOrder } = useApp()
  const perfil = perfilId === undefined ? activeProfileId : perfilId
  const categories = useMemo(
    () => ordenarCategorias(filtrarCategoriasPorPerfil(categoriesProp, perfil, value ? [value] : []), categoryGroupOrder),
    [categoriesProp, perfil, value, categoryGroupOrder]
  )
  const selecionada = value ? categoriesProp?.find(c => c.id === value) : null
  const deOutroPerfil = !!selecionada && !categoriaDisponivelParaPerfil(selecionada, perfil)
  const aviso = deOutroPerfil && (
    <p className="text-[11px] text-aviso mt-0.5">⚠ Categoria de outro perfil</p>
  )

  if (searchable) {
    return (
      <>
        <SearchableDropdown
          categories={categories}
          type={type}
          value={value}
          onChange={onChange}
          className={className}
          placeholder={placeholder}
        />
        {aviso}
      </>
    )
  }

  const { grouped, ungrouped, sortedGroups } = buildGroups(categories, type)
  const hasGroups = sortedGroups.length > 0

  return (
    <>
    <select className={className} value={value} onChange={onChange} required={required}>
      <option value="">{placeholder}</option>
      {sortedGroups.map(groupName => (
        <optgroup key={groupName} label={groupName}>
          {grouped[groupName].map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </optgroup>
      ))}
      {ungrouped.length > 0 && hasGroups ? (
        <optgroup label="Sem grupo">
          {ungrouped.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </optgroup>
      ) : (
        ungrouped.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)
      )}
    </select>
    {aviso}
    </>
  )
}
