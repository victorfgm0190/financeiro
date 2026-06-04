import { X } from 'lucide-react'
import { EMPTY_LANC_FILTROS, hasLancFiltros } from './utils'

// Barra de filtros em tempo real para listas de lançamentos.
// `fields` controla quais inputs aparecem (default: todos os 5).
export default function LancamentoFiltros({ filtros, setFiltros, fields }) {
  const show = fields || ['data', 'historico', 'favorecido', 'de', 'para']
  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const active = hasLancFiltros(filtros)

  const inputs = [
    { key: 'data', placeholder: 'DD/MM/AAAA', w: 'w-28' },
    { key: 'historico', placeholder: 'Histórico', w: 'flex-1 min-w-[110px]' },
    { key: 'favorecido', placeholder: 'Favorecido', w: 'flex-1 min-w-[110px]' },
    { key: 'de', placeholder: 'Conta De', w: 'flex-1 min-w-[100px]' },
    { key: 'para', placeholder: 'Conta Para', w: 'flex-1 min-w-[100px]' },
  ].filter(i => show.includes(i.key))

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900/60 flex-wrap">
      {inputs.map(i => (
        <input
          key={i.key}
          type="text"
          value={filtros[i.key] || ''}
          onChange={e => set(i.key, e.target.value)}
          placeholder={i.placeholder}
          className={`${i.w} bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-gray-500 placeholder:text-gray-600`}
        />
      ))}
      <button
        type="button"
        onClick={() => setFiltros(EMPTY_LANC_FILTROS)}
        disabled={!active}
        title="Limpar todos os filtros"
        className={`shrink-0 p-1.5 rounded-md transition-colors ${
          active
            ? 'text-gray-300 hover:text-white hover:bg-gray-700 bg-gray-800'
            : 'text-gray-700 cursor-not-allowed'
        }`}
      >
        <X size={14} />
      </button>
    </div>
  )
}
