import { useState, useRef, useEffect } from 'react'
import { ListFilter, X } from 'lucide-react'
import { fmt } from './utils'

// Dropdown multiselect de valores reais. `values` = números distintos já ordenados
// (maior → menor). `selected` = Set<number>. `onChange(novoSet)`. Fecha ao clicar fora.
export default function ValueFilterDropdown({ label = 'Valor', values = [], selected, onChange, iconColor = 'text-gray-500' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const count = selected?.size || 0

  const toggle = (v) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange(next)
  }
  const clear = (e) => { e.stopPropagation(); onChange(new Set()) }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors ${
          count > 0
            ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300'
            : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        }`}
        title={`Filtrar por valor — ${label}`}
      >
        <ListFilter size={12} className={count > 0 ? '' : iconColor} />
        <span className="whitespace-nowrap">{label}{count > 0 ? ` (${count})` : ''}</span>
        {count > 0 && (
          <X
            size={12}
            onClick={clear}
            className="hover:text-white"
            role="button"
            aria-label="Limpar seleção"
          />
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-44 max-h-64 overflow-y-auto bg-surface border border-gray-700 rounded-lg shadow-xl py-1">
          {values.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-600">Nenhum valor no período</p>
          ) : values.map(v => (
            <label key={v} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={selected?.has(v) || false}
                onChange={() => toggle(v)}
                className="accent-[#0F6E56] shrink-0"
              />
              <span className="tabular-nums">{fmt(v)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
