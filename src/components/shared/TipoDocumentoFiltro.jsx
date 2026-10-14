import { useState, useRef, useEffect, useMemo } from 'react'
import { ListFilter, X } from 'lucide-react'
import TipoDocumentoBadge from './TipoDocumentoBadge'
import { SEM_TIPO } from '../../lib/tiposDocumento'

// Multi-select "Tipo de documento" dos filtros. As chaves são as de chaveFiltroTipo: id do tipo,
// 'CC' (fatura sem cadastro), 'RES', 'ENV' e SEM_TIPO. `selected` = Set; vazio = sem filtro.
export default function TipoDocumentoFiltro({ tipos = [], selected, onChange, extras = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [open])

  const opcoes = useMemo(() => [
    { value: SEM_TIPO, label: 'Sem tipo', tipo: null },
    ...tipos.map(t => ({ value: t.id, label: t.nome + (t.ativo === false ? ' (inativo)' : ''), tipo: t })),
    ...extras.map(t => ({ value: t.id, label: t.nome, tipo: { ...t, fallback: true } })),
  ], [tipos, extras])

  const count = selected?.size || 0
  const toggle = (v) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange(next)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`input py-1.5 text-xs flex items-center gap-1.5 text-left ${count > 0 ? 'border-primary text-primary-fg' : 'text-texto-2'}`}
        title="Filtrar por tipo de documento"
      >
        <ListFilter size={12} className="shrink-0" />
        <span className="truncate flex-1">{count > 0 ? `${count} selecionado${count !== 1 ? 's' : ''}` : 'Todos'}</span>
        {count > 0 && (
          <X size={12} className="shrink-0 hover:text-texto-1" role="button" aria-label="Limpar"
            onClick={(e) => { e.stopPropagation(); onChange(new Set()) }} />
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-56 max-h-72 overflow-y-auto bg-surface border border-borda-forte rounded-lg shadow-xl py-1">
          {opcoes.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-xs text-texto-2 hover:bg-surface-hover cursor-pointer">
              <input type="checkbox" checked={selected?.has(o.value) || false} onChange={() => toggle(o.value)} className="accent-primary shrink-0" />
              <span className="w-10 shrink-0"><TipoDocumentoBadge tipo={o.tipo} /></span>
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
