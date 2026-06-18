import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'

const GROUP_ORDER = [
  // Despesas
  'Alimentação', 'Bancos', 'Contribuicoes', 'Cuidados Pessoais', 'Doações',
  'Educação', 'Empresa', 'Escritorio Contabilidade', 'Filhos', 'Finaciamentos',
  'Fotografia', 'Impostos', 'Lazer', 'Moradia', 'Saúde',
  'Seguro', 'Seguros', 'Transporte', 'Vestuário', 'Outras Despesas',
  // Receitas
  'Remunerações', 'Rendimentos', 'Rendimentos Empresariais', 'Outras Receitas',
  // Investimentos
  'Aplicações',
]

function sortGroups(groupNames) {
  return [...groupNames].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'pt-BR')
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

// options: [{ id, label, group? }]
// onChange: (id: string) => void   (id='' means cleared)
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  required = false,
  ungroupedLast = false,   // quando true, itens sem grupo vão para o FINAL (ex.: categorias "Sem grupo")
  ungroupedLabel = null,   // rótulo da seção de itens sem grupo (mostrado só se houver grupos)
  preserveGroupOrder = false, // usa a ordem dos grupos como vêm em `options` (ex.: Grupos de Contas)
                              // em vez da ordenação por GROUP_ORDER (categorias).
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  const selected = useMemo(() => options.find(o => o.id === value), [options, value])

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    // Busca casa pelo rótulo do item OU pelo nome do grupo.
    return options.filter(o => o.label.toLowerCase().includes(q) || (o.group || '').toLowerCase().includes(q))
  }, [options, search])

  // Build flat items list for keyboard nav + grouped structure for rendering
  const { allItems, ungrouped, groupedMap, sortedGroupNames } = useMemo(() => {
    const groupedMap = {}
    const ungrouped = []
    for (const opt of filtered) {
      if (opt.group) {
        if (!groupedMap[opt.group]) groupedMap[opt.group] = []
        groupedMap[opt.group].push(opt)
      } else {
        ungrouped.push(opt)
      }
    }
    const sortedGroupNames = preserveGroupOrder ? Object.keys(groupedMap) : sortGroups(Object.keys(groupedMap))

    const allItems = []
    if (!required) allItems.push({ id: '', label: placeholder })
    const pushUngrouped = () => { for (const opt of ungrouped) allItems.push(opt) }
    const pushGrouped = () => { for (const g of sortedGroupNames) for (const opt of groupedMap[g]) allItems.push(opt) }
    // ungroupedLast: grupos primeiro, "sem grupo" no final (ordem de navegação por teclado coerente).
    if (ungroupedLast) { pushGrouped(); pushUngrouped() } else { pushUngrouped(); pushGrouped() }

    return { allItems, ungrouped, groupedMap, sortedGroupNames }
  }, [filtered, required, placeholder, ungroupedLast, preserveGroupOrder])

  const idxMap = useMemo(() => {
    const m = {}
    allItems.forEach((item, i) => { m[item.id === '' ? '__empty' : item.id] = i })
    return m
  }, [allItems])

  const getIdx = (id) => idxMap[id === '' ? '__empty' : id] ?? -1

  const openDropdown = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
    setSearch('')
    setActive(-1)
    // O foco é aplicado no useEffect [open] abaixo, depois que o painel é renderizado.
  }

  const closeDropdown = () => {
    setOpen(false)
    setSearch('')
    setActive(-1)
  }

  const handleSelect = (id) => {
    onChange(id)
    closeDropdown()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && active >= 0 && active < allItems.length) {
      e.preventDefault()
      handleSelect(allItems[active].id)
    } else if (e.key === 'Escape') {
      closeDropdown()
    }
  }

  // Ao abrir, foca o campo de busca para digitar/filtrar sem clique extra.
  // rAF garante que o painel já está no DOM (o ref já está atribuído).
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      // Não fechar em cliques no gatilho nem no próprio painel (inclui a scrollbar do container).
      if (triggerRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      closeDropdown()
    }
    const onScroll = (e) => { if (listRef.current?.contains(e.target)) return; closeDropdown() }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (active >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-item]')
      items[active]?.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  const itemClass = (id) => {
    const idx = getIdx(id)
    if (idx === active) return 'bg-gray-700 text-gray-100'
    if (id && id === value) return 'bg-indigo-500/15 text-indigo-300'
    if (!id) return 'text-gray-500 hover:bg-gray-800'
    return 'text-gray-300 hover:bg-gray-800'
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={`input flex items-center justify-between gap-2 text-left w-full ${!selected ? 'text-gray-500' : ''}`}
      >
        <span className="flex-1 truncate min-w-0">{selected ? selected.label : placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !required && (
            <span
              className="p-0.5 rounded text-gray-500 hover:text-gray-300"
              onMouseDown={e => { e.stopPropagation(); onChange('') }}
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 220), zIndex: 9999 }}
          className="bg-surface border border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-64"
        >
          <div className="px-2 py-2 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800 rounded-lg">
              <Search size={12} className="text-gray-500 shrink-0" />
              <input
                ref={searchRef}
                className="flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder-gray-600"
                value={search}
                onChange={e => { setSearch(e.target.value); setActive(-1) }}
                onKeyDown={handleKeyDown}
                placeholder="Buscar..."
              />
            </div>
          </div>

          <div ref={listRef} className="overflow-y-auto overscroll-contain min-h-0">
            {allItems.length === 0 && (
              <p className="text-xs text-gray-600 px-3 py-3 text-center">Nenhum resultado</p>
            )}

            {!required && (
              <button
                type="button"
                data-item
                onClick={() => handleSelect('')}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${itemClass('')}`}
              >
                {placeholder}
              </button>
            )}

            {(() => {
              const ungroupedBlock = ungrouped.length > 0 && (
                <div key="__ungrouped">
                  {ungroupedLabel && sortedGroupNames.length > 0 && (
                    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 bg-surface sticky top-0">
                      {ungroupedLabel}
                    </p>
                  )}
                  {ungrouped.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      data-item
                      onClick={() => handleSelect(opt.id)}
                      className={`w-full text-left px-3 py-2 text-sm truncate transition-colors ${ungroupedLabel && sortedGroupNames.length > 0 ? 'pl-5 ' : ''}${itemClass(opt.id)}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )
              const groupedBlock = sortedGroupNames.map(groupName => (
                <div key={groupName}>
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 bg-surface sticky top-0">
                    {groupName}
                  </p>
                  {groupedMap[groupName].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      data-item
                      onClick={() => handleSelect(opt.id)}
                      className={`w-full text-left px-3 py-2 text-sm pl-5 truncate transition-colors ${itemClass(opt.id)}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))
              return ungroupedLast
                ? <>{groupedBlock}{ungroupedBlock}</>
                : <>{ungroupedBlock}{groupedBlock}</>
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
