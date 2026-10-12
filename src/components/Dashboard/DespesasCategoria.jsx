import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useDespesasPorCategoria } from '../../hooks/useDespesasPorCategoria'
import CategoriaLancamentos from '../shared/CategoriaLancamentos'
import { fmt } from '../shared/utils'

// Blocos "Maiores Despesas" (pizza) e "Ranking por Categoria" — os mesmos no Painel (desktop) e no
// card do Início (mobile). Valores, % e a lista do clique saem de despesasPorCategoria
// (src/lib) via useDespesasPorCategoria, com o período e o modo (Cheio/Líquido) recebidos.

const PIE_COLORS = ['#6366f1', '#f97316', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899']

const TOP = 5

// Segmented control genérico (filtros de período, Cheio/Líquido, Pizza/Ranking).
// `grande`: alvos de 44px (mobile).
export function Segmentado({ opcoes, valor, onChange, grande = false, rotulo }) {
  return (
    <div role="group" aria-label={rotulo} className={`flex gap-1 ${grande ? 'p-1 rounded-xl bg-gray-900 border border-gray-800' : ''}`}>
      {opcoes.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={valor === o.value}
          title={o.title}
          className={grande
            ? `flex-1 min-h-[44px] rounded-lg text-xs font-medium transition-colors ${valor === o.value ? 'bg-gray-700 text-gray-100' : 'text-gray-500'}`
            : `text-xs px-2 py-1 rounded transition-colors ${valor === o.value ? 'bg-gray-700 text-gray-200' : 'text-gray-600 hover:text-gray-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const nomeCat = (categories, id) => {
  const c = categories.find(x => x.id === id)
  return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : id
}

// Pizza + legenda. Clicar numa fatia ou linha da legenda abre a lista logo abaixo da legenda
// (mesmo item fecha; outro troca). A categoria aberta sobrevive à troca de período/modo.
export function PizzaDespesas({ periodo, modo, grande = false }) {
  const { categories } = useApp()
  const { categorias } = useDespesasPorCategoria(periodo, modo)
  const [aberta, setAberta] = useState(null)
  const alternar = (id) => setAberta(a => (a === id ? null : id))
  const top = categorias.slice(0, TOP)

  if (top.length === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500 text-center py-10">Sem despesas no período</p>
        {aberta && <CategoriaLancamentos categoriaId={aberta} periodo={periodo} modo={modo} />}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={top}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={2}
            dataKey="valor"
            onClick={(d) => alternar(d.categoryId)}
            style={{ cursor: 'pointer' }}
          >
            {top.map((c, i) => (
              <Cell
                key={c.categoryId}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
                fillOpacity={aberta && aberta !== c.categoryId ? 0.3 : 1}
                stroke={aberta === c.categoryId ? '#e5e7eb' : 'transparent'}
                strokeWidth={aberta === c.categoryId ? 2 : 0}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, _n, item) => [fmt(v), nomeCat(categories, item?.payload?.categoryId)]}
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legenda (clicável, acessível por teclado) */}
      <div className="space-y-1 mt-1">
        {top.map((c, i) => {
          const sel = aberta === c.categoryId
          return (
            <button
              key={c.categoryId}
              type="button"
              onClick={() => alternar(c.categoryId)}
              aria-expanded={sel}
              className={`w-full flex items-center justify-between px-2 rounded-lg transition-colors text-left group cursor-pointer ${grande ? 'min-h-[44px]' : 'py-1.5'} ${sel ? 'bg-gray-800/70' : 'hover:bg-gray-800/60'} ${aberta && !sel ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-xs text-gray-300 truncate group-hover:text-white transition-colors">{nomeCat(categories, c.categoryId)}</span>
              </div>
              <span className="text-xs text-gray-500 shrink-0 ml-2 tabular-nums">
                {c.pct.toFixed(0)}% — {fmt(c.valor)}
              </span>
            </button>
          )
        })}
      </div>

      {aberta && (
        <div className="mt-2">
          <CategoriaLancamentos categoriaId={aberta} periodo={periodo} modo={modo} />
        </div>
      )}
    </div>
  )
}

// Ranking com barra. Clicar numa linha expande a lista logo abaixo dela (acordeão, um por vez).
export function RankingDespesas({ periodo, modo, grande = false }) {
  const { categories } = useApp()
  const { categorias } = useDespesasPorCategoria(periodo, modo)
  const [aberta, setAberta] = useState(null)
  const top = categorias.slice(0, TOP)

  if (top.length === 0) return <p className="text-xs text-gray-500 text-center py-4">Sem despesas no período</p>

  return (
    <div className="space-y-2.5">
      {top.map(c => {
        const cat = categories.find(x => x.id === c.categoryId)
        const sel = aberta === c.categoryId
        const Seta = sel ? ChevronDown : ChevronRight
        return (
          <div key={c.categoryId}>
            <button
              type="button"
              onClick={() => setAberta(a => (a === c.categoryId ? null : c.categoryId))}
              aria-expanded={sel}
              className={`w-full text-left cursor-pointer rounded-lg px-1 -mx-1 hover:bg-gray-800/40 ${grande ? 'min-h-[44px] py-1.5' : ''}`}
            >
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-300 flex items-center gap-1">
                  <Seta size={12} className="text-gray-600" />
                  {cat?.icon} {cat?.name ?? c.categoryId}
                </span>
                <span className="text-gray-400">{fmt(c.valor)} <span className="text-gray-600">({c.pct.toFixed(0)}%)</span></span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, c.pct)}%`, background: cat?.color || '#EA580C' }} />
              </div>
            </button>
            {sel && (
              <div className="mt-2">
                <CategoriaLancamentos categoriaId={c.categoryId} periodo={periodo} modo={modo} />
              </div>
            )}
          </div>
        )
      })}
      {/* Categoria aberta que saiu do top após trocar período/modo continua visível. */}
      {aberta && !top.some(c => c.categoryId === aberta) && (
        <CategoriaLancamentos categoriaId={aberta} periodo={periodo} modo={modo} />
      )}
    </div>
  )
}
