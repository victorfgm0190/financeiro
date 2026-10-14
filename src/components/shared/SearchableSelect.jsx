import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'
import { compararGruposPadrao } from '../../lib/ordemCategorias'

// Ordem padrão de grupos (GROUP_ORDER/alfabética). Listas de CATEGORIA já chegam ordenadas pela
// ordem salva (ordenarCategorias) e passam `preserveGroupOrder`; este é só o fallback.
function sortGroups(groupNames) {
  return [...groupNames].sort(compararGruposPadrao)
}

// Posição do dropdown portado (position:fixed = coords de viewport). Mantém o menu COLADO ao
// campo: abre logo abaixo; se não houver espaço embaixo (campo na parte de baixo do modal/tela),
// abre ACIMA; e faz clamp horizontal + de altura ao viewport — assim o menu nunca cai "no
// centro-baixo, longe do campo".
function computeMenuStyle(rect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.max(rect.width, 220)
  const left = Math.round(Math.min(Math.max(8, rect.left), Math.max(8, vw - width - 8)))
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top
  // Abre para cima só quando faltar espaço embaixo E houver mais espaço em cima.
  const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow
  const maxHeight = Math.max(140, Math.min(256, (openAbove ? spaceAbove : spaceBelow) - 12))
  return {
    position: 'fixed',
    left,
    width,
    zIndex: 9999,
    maxHeight,
    ...(openAbove
      ? { bottom: Math.round(vh - rect.top + 4) }
      : { top: Math.round(rect.bottom + 4) }),
  }
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
  sections = null,            // [{ key, label }] — blocos de topo, na ordem dada, casados por `option.section`
                              // (opção sem seção conhecida cai no último). Dentro de cada bloco, o
                              // agrupamento por `group` é o de sempre.
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
  const { allItems, blocks } = useMemo(() => {
    const secList = sections?.length ? sections : [{ key: null, label: null }]
    const known = new Set(secList.map(s => s.key))
    const lastKey = secList[secList.length - 1].key
    const sectionOf = (opt) => (sections?.length ? (known.has(opt.section) ? opt.section : lastKey) : null)

    const blocks = secList.map(sec => {
      const groupedMap = {}
      const ungrouped = []
      for (const opt of filtered) {
        if (sectionOf(opt) !== sec.key) continue
        if (opt.group) {
          if (!groupedMap[opt.group]) groupedMap[opt.group] = []
          groupedMap[opt.group].push(opt)
        } else {
          ungrouped.push(opt)
        }
      }
      const sortedGroupNames = preserveGroupOrder ? Object.keys(groupedMap) : sortGroups(Object.keys(groupedMap))
      return { key: sec.key, label: sec.label, groupedMap, ungrouped, sortedGroupNames }
    }).filter(b => b.ungrouped.length > 0 || b.sortedGroupNames.length > 0)

    // Ordem de navegação por teclado = ordem de renderização.
    const allItems = []
    if (!required) allItems.push({ id: '', label: placeholder })
    for (const b of blocks) {
      const pushUngrouped = () => { for (const opt of b.ungrouped) allItems.push(opt) }
      const pushGrouped = () => { for (const g of b.sortedGroupNames) for (const opt of b.groupedMap[g]) allItems.push(opt) }
      // ungroupedLast: grupos primeiro, "sem grupo" no final.
      if (ungroupedLast) { pushGrouped(); pushUngrouped() } else { pushUngrouped(); pushGrouped() }
    }

    return { allItems, blocks }
  }, [filtered, required, placeholder, ungroupedLast, preserveGroupOrder, sections])

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
    if (idx === active) return 'bg-surface-hover text-texto-1'
    if (id && id === value) return 'bg-primary/15 text-primary-fg'
    if (!id) return 'text-texto-3 hover:bg-surface-hover'
    return 'text-texto-2 hover:bg-surface-hover'
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={`input flex items-center justify-between gap-2 text-left w-full ${!selected ? 'text-texto-3' : ''}`}
      >
        <span className="flex-1 truncate min-w-0">{selected ? selected.label : placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !required && (
            <span
              className="p-0.5 rounded text-texto-3 hover:text-texto-2"
              onMouseDown={e => { e.stopPropagation(); onChange('') }}
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-texto-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          // O dropdown é portado para document.body. Sem isto, o clique numa opção sobe pela
          // ÁRVORE REACT (portais borbulham por ela, não pelo DOM) até ancestrais como o Modal/
          // linha do extrato, fechando o modal ou disparando handlers do pai. Barrar a
          // propagação aqui resolve de uma vez para TODOS os SearchableSelect do sistema.
          onClick={(e) => e.stopPropagation()}
          style={computeMenuStyle(rect)}
          className="bg-surface border border-borda-forte rounded-lg shadow-2xl flex flex-col max-h-64"
        >
          <div className="px-2 py-2 border-b border-borda shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-2 rounded-lg">
              <Search size={12} className="text-texto-3 shrink-0" />
              <input
                ref={searchRef}
                className="flex-1 bg-transparent text-sm text-texto-1 outline-none placeholder-texto-3"
                value={search}
                onChange={e => { setSearch(e.target.value); setActive(-1) }}
                onKeyDown={handleKeyDown}
                placeholder="Buscar..."
              />
            </div>
          </div>

          <div ref={listRef} className="overflow-y-auto overscroll-contain min-h-0">
            {allItems.length === 0 && (
              <p className="text-xs text-texto-3 px-3 py-3 text-center">Nenhum resultado</p>
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

            {blocks.map(({ key: secKey, label: secLabel, ungrouped, groupedMap, sortedGroupNames }) => {
              const ungroupedBlock = ungrouped.length > 0 && (
                <div key="__ungrouped">
                  {ungroupedLabel && sortedGroupNames.length > 0 && (
                    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-texto-3 bg-surface sticky top-0">
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
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-texto-3 bg-surface sticky top-0">
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
              return (
                <div key={secKey ?? '__all'}>
                  {secLabel && (
                    <p className="px-3 pt-2.5 pb-1 mt-1 border-t border-borda-forte text-[11px] font-bold tracking-wider text-texto-2 bg-surface-2/60">
                      {secLabel}
                    </p>
                  )}
                  {ungroupedLast
                    ? <>{groupedBlock}{ungroupedBlock}</>
                    : <>{ungroupedBlock}{groupedBlock}</>}
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
