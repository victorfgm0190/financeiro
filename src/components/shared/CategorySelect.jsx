import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'

const GROUP_ORDER = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação',
  'Lazer', 'Vestuário', 'Impostos', 'Seguros', 'Bancos', 'Outras Despesas',
  'Remunerações', 'Rendimentos', 'Outras Receitas',
]

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

  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a)
    const ib = GROUP_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'pt-BR')
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  return { filtered, grouped, ungrouped, sortedGroups }
}

// ── Searchable dropdown ────────────────────────────────────────────────────────

function SearchableDropdown({ categories, type, value, onChange, className, placeholder }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState({})
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const { filtered, grouped, ungrouped, sortedGroups } = buildGroups(categories, type)

  const q = query.toLowerCase()
  const matchUngrouped = ungrouped.filter(c => !q || c.name.toLowerCase().includes(q))
  const matchGrouped = {}
  for (const grp of sortedGroups) {
    // A busca casa tanto pelo nome do grupo quanto pelo nome da categoria:
    // se o grupo casa, todas as suas categorias aparecem.
    const groupMatches = grp.toLowerCase().includes(q)
    const cats = grouped[grp].filter(c => !q || groupMatches || c.name.toLowerCase().includes(q))
    if (cats.length) matchGrouped[grp] = cats
  }
  const matchGroups = sortedGroups.filter(g => matchGrouped[g])
  const hasResults = matchUngrouped.length > 0 || matchGroups.length > 0

  const selectedCat = filtered.find(c => c.id === value)

  // position dropdown via portal
  useEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dropW = Math.max(rect.width, 208)
    // flip up if not enough space below
    const spaceBelow = window.innerHeight - rect.bottom
    const dropH = Math.min(256, window.innerHeight * 0.45)
    const top = spaceBelow >= dropH + 8 ? rect.bottom + 2 : rect.top - dropH - 2
    setDropdownStyle({
      position: 'fixed',
      top,
      left: rect.left,
      width: dropW,
      zIndex: 9999,
    })
    if (inputRef.current) inputRef.current.focus()
  }, [open])

  // close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const portal = document.getElementById('cat-select-portal')
        if (portal && portal.contains(e.target)) return
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (id) => {
    onChange({ target: { value: id } })
    setOpen(false)
    setQuery('')
  }

  const triggerCls = `${className} flex items-center justify-between gap-1 cursor-pointer text-left`

  return (
    <div ref={containerRef} className="relative">
      <button type="button" className={triggerCls} onClick={() => setOpen(o => !o)}>
        <span className="truncate min-w-0">
          {selectedCat
            ? <>{selectedCat.icon} {selectedCat.name}</>
            : <span className="text-gray-500">{placeholder}</span>}
        </span>
        <svg className="shrink-0 text-gray-500" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && createPortal(
        <div id="cat-select-portal" style={dropdownStyle}
          className="bg-surface border border-gray-700 rounded-lg shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-1.5 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-1.5 bg-gray-800 rounded px-2 py-1">
              <Search size={11} className="text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                className="bg-transparent text-xs text-gray-200 outline-none placeholder-gray-600 w-full"
                placeholder="Buscar categoria..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="text-gray-600 hover:text-gray-400 shrink-0" onClick={() => setQuery('')}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l6 6M8 2l-6 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {!query && (
              <button type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-800"
                onClick={() => select('')}
              >
                {placeholder}
              </button>
            )}

            {matchGroups.map(groupName => (
              <div key={groupName}>
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wider font-medium">{groupName}</div>
                {matchGrouped[groupName].map(c => (
                  <button key={c.id} type="button"
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 ${c.id === value ? 'text-[#0F6E56] font-medium' : 'text-gray-200'}`}
                    onClick={() => select(c.id)}
                  >
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            ))}

            {/* Categorias sem grupo — sempre por último */}
            {matchUngrouped.length > 0 && (
              <>
                {matchGroups.length > 0 && (
                  <div className="px-3 pt-1.5 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wider font-medium">Sem grupo</div>
                )}
                {matchUngrouped.map(c => (
                  <button key={c.id} type="button"
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 ${c.id === value ? 'text-[#0F6E56] font-medium' : 'text-gray-200'}`}
                    onClick={() => select(c.id)}
                  >
                    {c.icon} {c.name}
                  </button>
                ))}
              </>
            )}

            {!hasResults && (
              <p className="px-3 py-3 text-xs text-gray-600 text-center">Nenhuma categoria encontrada</p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Public component ───────────────────────────────────────────────────────────

export default function CategorySelect({
  categories,
  value,
  onChange,
  type,
  className = 'input',
  placeholder = 'Sem categoria',
  required = false,
  searchable = false,
}) {
  if (searchable) {
    return (
      <SearchableDropdown
        categories={categories}
        type={type}
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
      />
    )
  }

  const { grouped, ungrouped, sortedGroups } = buildGroups(categories, type)
  const hasGroups = sortedGroups.length > 0

  return (
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
  )
}
