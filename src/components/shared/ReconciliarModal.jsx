import { useState, useMemo } from 'react'
import { X, CheckCircle } from 'lucide-react'
import { fmt, fmtDate } from './utils'

// Modal de reconciliação em lote. `items` deve conter APENAS os lançamentos
// NÃO reconciliados do período em exibição (mês/fatura). onApply(ids, value).
export default function ReconciliarModal({ items, onApply, onClose }) {
  const [selected, setSelected] = useState(() => new Set(items.map(t => t.id)))
  const [operation, setOperation] = useState('reconciliar')

  const allSelected = items.length > 0 && selected.size === items.length
  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(t => t.id)))

  const total = useMemo(
    () => items.filter(t => selected.has(t.id)).reduce((s, t) => s + (t.amount || 0), 0),
    [items, selected]
  )

  const apply = () => {
    if (selected.size === 0) return
    onApply([...selected], operation === 'reconciliar')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="font-semibold text-gray-100 flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-400" /> Reconciliar Transações
          </h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-10">
              Nenhum lançamento pendente de reconciliação neste período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-emerald-500 cursor-pointer align-middle"
                      title="Selecionar todos"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Histórico</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map(t => (
                  <tr
                    key={t.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => toggle(t.id)}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-emerald-500 cursor-pointer align-middle"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-200 truncate max-w-0">
                      {t.description || 'Lançamento'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-200 whitespace-nowrap">
                      {fmt(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {items.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-300">
                  <input
                    type="radio"
                    name="recOp"
                    checked={operation === 'reconciliar'}
                    onChange={() => setOperation('reconciliar')}
                    className="accent-emerald-500 cursor-pointer"
                  />
                  Reconciliar
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-300">
                  <input
                    type="radio"
                    name="recOp"
                    checked={operation === 'nao'}
                    onChange={() => setOperation('nao')}
                    className="accent-emerald-500 cursor-pointer"
                  />
                  Não reconciliar
                </label>
              </div>
              <span className="text-xs text-gray-500">
                {selected.size} selecionado{selected.size !== 1 ? 's' : ''} · {fmt(total)}
              </span>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                onClick={apply}
                disabled={selected.size === 0}
              >
                <CheckCircle size={14} /> Aplicar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
