import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useDespesasPorCategoria } from '../../hooks/useDespesasPorCategoria'
import CategoriaLancamentos, { OutrasLancamentos } from '../shared/CategoriaLancamentos'
import { agruparTopN, corDaCategoria, OUTRAS_ID, TOP_CATEGORIAS } from '../../lib/despesasPorCategoria'
import { fmt } from '../shared/utils'

// Blocos "Maiores Despesas" (pizza) e "Ranking por Categoria" — os mesmos no Painel (desktop) e no
// card do Início (mobile). Valores, % e a lista do clique saem de despesasPorCategoria
// (src/lib) via useDespesasPorCategoria, com o período e o modo (Cheio/Líquido) recebidos.
// Modo fechado: top 5 + "Outras" (agruparTopN); `todas`: uma fatia/linha por categoria.
// `onAlternarTodas`: mostra o botão "Ver todas (N)" / "Mostrar menos" no rodapé.

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
  if (id === OUTRAS_ID) return 'Outras'
  const c = categories.find(x => x.id === id)
  return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : id
}

// < 1% aparece como "<1%" (fatia fina demais para ler, mas segue clicável pela legenda).
const pctTxt = (p) => (p > 0 && p < 1 ? '<1%' : `${p.toFixed(0)}%`)

// Fatias do bloco (top 5 + Outras, ou todas) e a categoria aberta. "Outras" aberta fecha ao
// expandir (deixa de existir); uma categoria aberta continua aberta nos dois modos.
function useBloco(periodo, modo, todas) {
  const { categorias, totalDespesas } = useDespesasPorCategoria(periodo, modo)
  const { fatias, outras } = agruparTopN(categorias, totalDespesas, todas ? null : TOP_CATEGORIAS)
  const [aberta, setAberta] = useState(null)
  const alternar = (id) => setAberta(a => (a === id ? null : id))
  return { categorias, fatias, outras, aberta: aberta === OUTRAS_ID && !outras ? null : aberta, alternar }
}

// Lista do clique: uma categoria, ou as categorias dentro de "Outras" (agrupadas).
function Lista({ id, outras, periodo, modo }) {
  if (id === OUTRAS_ID) {
    return outras ? <OutrasLancamentos membros={outras.membros} valor={outras.valor} periodo={periodo} modo={modo} /> : null
  }
  return <CategoriaLancamentos categoriaId={id} periodo={periodo} modo={modo} />
}

function BotaoTodas({ total, todas, onAlternar, grande }) {
  if (!onAlternar || total <= TOP_CATEGORIAS) return null
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={todas}
      className={`w-full mt-2 text-xs text-emerald-400 hover:text-emerald-300 rounded-lg ${grande ? 'min-h-[44px]' : 'py-1.5'}`}
    >
      {todas ? 'Mostrar menos' : `Ver todas (${total})`}
    </button>
  )
}

// Pizza + legenda. Clicar numa fatia ou linha da legenda abre a lista logo abaixo da legenda
// (mesmo item fecha; outro troca). A categoria aberta sobrevive à troca de período/modo.
export function PizzaDespesas({ periodo, modo, grande = false, todas = false, onAlternarTodas }) {
  const { categories } = useApp()
  const { categorias, fatias, outras, aberta, alternar } = useBloco(periodo, modo, todas)

  if (fatias.length === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500 text-center py-10">Sem despesas no período</p>
        {aberta && <Lista id={aberta} outras={outras} periodo={periodo} modo={modo} />}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={todas ? 220 : 180}>
        <PieChart>
          <Pie
            data={fatias}
            cx="50%"
            cy="50%"
            innerRadius={todas ? 58 : 48}
            outerRadius={todas ? 94 : 78}
            paddingAngle={fatias.length > 12 ? 0.5 : 2}
            dataKey="valor"
            onClick={(d) => alternar(d.categoryId)}
            style={{ cursor: 'pointer' }}
          >
            {fatias.map((c, i) => (
              <Cell
                key={c.categoryId}
                fill={corDaCategoria(c.categoryId, i)}
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

      {/* Legenda (clicável, acessível por teclado) — também o acesso às fatias muito finas. */}
      <div className="space-y-1 mt-1">
        {fatias.map((c, i) => {
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
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDaCategoria(c.categoryId, i) }} />
                <span className="text-xs text-gray-300 truncate group-hover:text-white transition-colors">
                  {nomeCat(categories, c.categoryId)}
                  {c.outras && <span className="text-gray-500"> ({c.membros.length})</span>}
                </span>
              </div>
              <span className="text-xs text-gray-500 shrink-0 ml-2 tabular-nums">
                {pctTxt(c.pct)} — {fmt(c.valor)}
              </span>
            </button>
          )
        })}
      </div>

      {aberta && (
        <div className="mt-2">
          <Lista id={aberta} outras={outras} periodo={periodo} modo={modo} />
        </div>
      )}

      <BotaoTodas total={categorias.length} todas={todas} onAlternar={onAlternarTodas} grande={grande} />
    </div>
  )
}

// Ranking com barra. Clicar numa linha expande a lista logo abaixo dela (acordeão, um por vez).
export function RankingDespesas({ periodo, modo, grande = false, todas = false, onAlternarTodas }) {
  const { categories } = useApp()
  const { categorias, fatias, outras, aberta, alternar } = useBloco(periodo, modo, todas)

  if (fatias.length === 0) return <p className="text-xs text-gray-500 text-center py-4">Sem despesas no período</p>

  return (
    <div>
      <div className="space-y-2.5">
        {fatias.map((c, i) => {
          const cat = categories.find(x => x.id === c.categoryId)
          const sel = aberta === c.categoryId
          const Seta = sel ? ChevronDown : ChevronRight
          const cor = c.outras ? corDaCategoria(OUTRAS_ID) : (cat?.color || corDaCategoria(c.categoryId, i))
          return (
            <div key={c.categoryId}>
              <button
                type="button"
                onClick={() => alternar(c.categoryId)}
                aria-expanded={sel}
                className={`w-full text-left cursor-pointer rounded-lg px-1 -mx-1 hover:bg-gray-800/40 ${grande ? 'min-h-[44px] py-1.5' : ''}`}
              >
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-300 flex items-center gap-1">
                    <Seta size={12} className="text-gray-600" />
                    {c.outras
                      ? <>Outras <span className="text-gray-500">({c.membros.length})</span></>
                      : <>{cat?.icon} {cat?.name ?? c.categoryId}</>}
                  </span>
                  <span className="text-gray-400">{fmt(c.valor)} <span className="text-gray-600">({pctTxt(c.pct)})</span></span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, c.pct)}%`, background: cor }} />
                </div>
              </button>
              {sel && (
                <div className="mt-2">
                  <Lista id={c.categoryId} outras={outras} periodo={periodo} modo={modo} />
                </div>
              )}
            </div>
          )
        })}
        {/* Categoria aberta que saiu da lista após trocar período/modo continua visível. */}
        {aberta && !fatias.some(c => c.categoryId === aberta) && (
          <Lista id={aberta} outras={outras} periodo={periodo} modo={modo} />
        )}
      </div>
      <BotaoTodas total={categorias.length} todas={todas} onAlternar={onAlternarTodas} grande={grande} />
    </div>
  )
}
