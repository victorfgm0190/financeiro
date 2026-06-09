import { useMemo } from 'react'
import { X } from 'lucide-react'
import { EMPTY_LANC_FILTROS, hasLancFiltros } from './utils'

// Barra de filtros em tempo real para listas de lançamentos.
// `fields` controla quais inputs aparecem (default: os 5 originais). Os filtros
// 'categoria' e 'valor' são opt-in (precisam estar em `fields`); 'categoria' usa
// a lista `categories`.
export default function LancamentoFiltros({ filtros, setFiltros, fields, categories = [], extra = null }) {
  const show = fields || ['data', 'historico', 'favorecido', 'de', 'para']
  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const active = hasLancFiltros(filtros)

  const inputCls = 'bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-gray-500 placeholder:text-gray-600'

  const textInputs = [
    { key: 'data', placeholder: 'DD/MM/AAAA', w: 'w-28' },
    { key: 'historico', placeholder: 'Histórico', w: 'flex-1 min-w-[110px]' },
    { key: 'favorecido', placeholder: 'Favorecido', w: 'flex-1 min-w-[110px]' },
    { key: 'de', placeholder: 'Conta De', w: 'flex-1 min-w-[100px]' },
    { key: 'para', placeholder: 'Conta Para', w: 'flex-1 min-w-[100px]' },
  ].filter(i => show.includes(i.key))

  const catGroups = useMemo(() => {
    const grouped = {}
    const ungrouped = []
    for (const c of categories) {
      if (c.group) { if (!grouped[c.group]) grouped[c.group] = []; grouped[c.group].push(c) }
      else ungrouped.push(c)
    }
    const names = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { grouped, ungrouped, names }
  }, [categories])

  const catLabel = c => `${c.icon ? c.icon + ' ' : ''}${c.name}`

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900/60 flex-wrap">
      {textInputs.map(i => (
        <input
          key={i.key}
          type="text"
          value={filtros[i.key] || ''}
          onChange={e => set(i.key, e.target.value)}
          placeholder={i.placeholder}
          className={`${i.w} ${inputCls}`}
        />
      ))}

      {show.includes('categoria') && (
        <select
          value={filtros.categoria || ''}
          onChange={e => set('categoria', e.target.value)}
          className={`flex-1 min-w-[140px] ${inputCls}`}
        >
          <option value="">Todas as categorias</option>
          {catGroups.names.map(g => (
            <optgroup key={g} label={g}>
              {catGroups.grouped[g].map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
            </optgroup>
          ))}
          {catGroups.ungrouped.length > 0 && (
            catGroups.names.length > 0
              ? <optgroup label="Sem grupo">
                  {catGroups.ungrouped.map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
                </optgroup>
              : catGroups.ungrouped.map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)
          )}
        </select>
      )}

      {show.includes('valor') && (
        <>
          <input
            type="number"
            step="0.01"
            min="0"
            value={filtros.valorDe || ''}
            onChange={e => set('valorDe', e.target.value)}
            placeholder="De R$"
            className={`w-24 ${inputCls}`}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={filtros.valorAte || ''}
            onChange={e => set('valorAte', e.target.value)}
            placeholder="Até R$"
            className={`w-24 ${inputCls}`}
          />
        </>
      )}

      {extra}

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
