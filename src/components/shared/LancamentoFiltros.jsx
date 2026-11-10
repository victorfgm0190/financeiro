import { useMemo } from 'react'
import { X } from 'lucide-react'
import { EMPTY_LANC_FILTROS, hasLancFiltros } from './utils'
import { useApp } from '../../context/AppContext'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import InputMoeda from './InputMoeda'
import HelpCampo from './HelpCampo'

// Barra de filtros em tempo real para listas de lançamentos.
// `fields` controla quais inputs aparecem (default: os 5 originais). Os filtros
// 'categoria' e 'valor' são opt-in (precisam estar em `fields`); 'categoria' usa
// a lista `categories`.
// legendaExtra: [[rótulo, id de help]] dos controles passados em `extra` (entram na legenda com ⓘ).
export default function LancamentoFiltros({ filtros, setFiltros, fields, categories = [], extra = null, legendaExtra = [] }) {
  const show = fields || ['data', 'historico', 'favorecido', 'de', 'para']
  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const active = hasLancFiltros(filtros)

  const inputCls = 'bg-surface-2 border border-borda-campo text-texto-1 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary placeholder:text-texto-3'

  const textInputs = [
    { key: 'data', placeholder: 'Data', w: 'w-28' },
    { key: 'historico', placeholder: 'Histórico', w: 'flex-1 min-w-[110px]' },
    { key: 'favorecido', placeholder: 'Favorecido', w: 'flex-1 min-w-[110px]' },
    { key: 'de', placeholder: 'Conta De', w: 'flex-1 min-w-[100px]' },
    { key: 'para', placeholder: 'Conta Para', w: 'flex-1 min-w-[100px]' },
  ].filter(i => show.includes(i.key))

  // Grupos e categorias na ordem salva em Configurações → Categorias (ordenarCategorias); o
  // agrupamento abaixo preserva essa ordem.
  const { categoryGroupOrder } = useApp()
  const catGroups = useMemo(() => {
    const grouped = {}
    const ungrouped = []
    for (const c of ordenarCategorias(categories, categoryGroupOrder)) {
      if (c.group) { if (!grouped[c.group]) grouped[c.group] = []; grouped[c.group].push(c) }
      else ungrouped.push(c)
    }
    const names = Object.keys(grouped)
    return { grouped, ungrouped, names }
  }, [categories, categoryGroupOrder])

  const catLabel = c => `${c.icon ? c.icon + ' ' : ''}${c.name}`

  // Legenda com ⓘ (os campos da linha não têm rótulo, só placeholder): uma linha curta acima.
  const ROTULOS = { data: 'Data', historico: 'Histórico', favorecido: 'Favorecido', de: 'Conta De', para: 'Conta Para', categoria: 'Categoria' }
  const legenda = [
    ...show.filter(k => ROTULOS[k]).map(k => [ROTULOS[k], `filtroLanc.${k}`]),
    ...(show.includes('valor') ? [['Valor de/até', 'filtroLanc.valorDe']] : []),
    ...(show.includes('valorBusca') ? [['Valor', 'filtroLanc.valor'], ['Exato/Aprox.', 'filtroLanc.valorModo']] : []),
    ...legendaExtra,
  ]

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-borda bg-surface/60 flex-wrap" data-help-form="filtrosLancamentos">
      <p data-testid="legenda-filtros-lanc" className="basis-full flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-texto-3 -mb-1">
        {legenda.map(([r, id]) => <span key={id} className="inline-flex items-center">{r}<HelpCampo campo={id} /></span>)}
      </p>
      {textInputs.map(i => (
        <input
          key={i.key}
          type="text"
          data-help-id={`filtroLanc.${i.key}`}
          value={filtros[i.key] || ''}
          onChange={e => set(i.key, e.target.value)}
          placeholder={i.placeholder}
          className={`${i.w} ${inputCls}`}
        />
      ))}

      {show.includes('categoria') && (
        <select
          data-help-id="filtroLanc.categoria"
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
          <InputMoeda
            min="0"
            helpId="filtroLanc.valorDe"
            value={filtros.valorDe || ''}
            onChange={e => set('valorDe', e.target.value)}
            placeholder="De R$"
            className={`w-24 ${inputCls}`}
          />
          <InputMoeda
            min="0"
            helpId="filtroLanc.valorAte"
            value={filtros.valorAte || ''}
            onChange={e => set('valorAte', e.target.value)}
            placeholder="Até R$"
            className={`w-24 ${inputCls}`}
          />
        </>
      )}

      {show.includes('valorBusca') && (
        <div className="flex items-center gap-1 flex-1 min-w-[150px] sm:flex-none">
          <InputMoeda
            helpId="filtroLanc.valor"
            value={filtros.valor || ''}
            onChange={e => set('valor', e.target.value)}
            placeholder="Valor"
            aria-label="Valor"
            className={`flex-1 min-w-0 sm:w-24 sm:flex-none ${inputCls}`}
          />
          <select
            data-help-id="filtroLanc.valorModo"
            value={filtros.valorModo || 'exato'}
            onChange={e => set('valorModo', e.target.value)}
            aria-label="Modo do filtro de valor"
            className={`shrink-0 ${inputCls}`}
          >
            <option value="exato">Exato</option>
            <option value="aproximado">Aprox.</option>
          </select>
        </div>
      )}

      {extra}

      <button
        type="button"
        onClick={() => setFiltros(EMPTY_LANC_FILTROS)}
        disabled={!active}
        title="Limpar todos os filtros"
        className={`shrink-0 p-1.5 rounded-md transition-colors ${
          active
            ? 'text-texto-2 hover:text-texto-1 hover:bg-surface-hover bg-surface-2'
            : 'text-texto-3 cursor-not-allowed'
        }`}
      >
        <X size={14} />
      </button>
    </div>
  )
}
