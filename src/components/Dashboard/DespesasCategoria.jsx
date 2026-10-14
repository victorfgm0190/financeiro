import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useDespesasPorCategoria } from '../../hooks/useDespesasPorCategoria'
import CategoriaLancamentos from '../shared/CategoriaLancamentos'
import { montarBlocos, corDaCategoria, OUTRAS_ID, SEM_CATEGORIA_ID, TOP_CATEGORIAS } from '../../lib/despesasPorCategoria'
import { fmt } from '../shared/utils'
import { useThemeColors } from '../../hooks/useTheme'
import { estiloTooltip } from '../../lib/chartPalette'

// Blocos "Maiores Despesas" (pizza) e "Ranking por Categoria" — os mesmos no Painel (desktop) e no
// mobile. Valores, % e a lista do clique saem de UM resultado de despesasPorCategoria (src/lib) via
// useDespesasPorCategoria, recortado por montarBlocos, com o período e o modo (Cheio/Líquido)
// recebidos: o valor de uma categoria é idêntico na pizza, na legenda e no ranking.
//   pizza: 6 maiores + "Outras (N)" (clicar abre a lista das categorias dentro dela)
//   legenda e ranking: 5 primeiras; `todas` → todas. `onAlternarTodas` mostra o botão
//   "Ver todas (N)" / "Mostrar menos" no rodapé.

// Segmented control genérico (filtros de período, Cheio/Líquido, Pizza/Ranking).
// `grande`: alvos de 44px (mobile).
export function Segmentado({ opcoes, valor, onChange, grande = false, rotulo }) {
  return (
    <div role="group" aria-label={rotulo} className={`flex gap-1 ${grande ? 'p-1 rounded-xl bg-surface border border-borda' : ''}`}>
      {opcoes.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={valor === o.value}
          title={o.title}
          className={grande
            ? `flex-1 min-h-[44px] rounded-lg text-xs font-medium transition-colors ${valor === o.value ? 'bg-primary/15 text-primary-fg' : 'text-texto-3'}`
            : `text-xs px-2 py-1 rounded transition-colors ${valor === o.value ? 'bg-primary/15 text-primary-fg' : 'text-texto-3 hover:text-texto-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const nomeCat = (categories, id) => {
  if (id === OUTRAS_ID) return 'Outras'
  if (id === SEM_CATEGORIA_ID) return 'Sem categoria'
  const c = categories.find(x => x.id === id)
  return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : id
}

// < 1% aparece como "<1%".
const pctTxt = (p) => (p > 0 && p < 1 ? '<1%' : `${p.toFixed(0)}%`)

// Recortes do bloco e a categoria aberta (uma por vez; a mesma fecha). "Outras" aberta fecha se
// deixar de existir após trocar período/modo.
function useBloco(periodo, modo, todas) {
  const { categorias, base } = useDespesasPorCategoria(periodo, modo)
  const { pizza, lista, total } = montarBlocos(categorias, base, todas)
  const [aberta, setAberta] = useState(null)
  const alternar = (id) => setAberta(a => (a === id ? null : id))
  return { pizza, lista, total, aberta: aberta === OUTRAS_ID && !pizza.outras ? null : aberta, alternar }
}

function BotaoTodas({ total, todas, onAlternar, grande }) {
  if (!onAlternar || total <= TOP_CATEGORIAS) return null
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={todas}
      className={`w-full mt-2 text-xs text-primary-fg hover:text-texto-1 rounded-lg ${grande ? 'min-h-[44px]' : 'py-1.5'}`}
    >
      {todas ? 'Mostrar menos' : `Ver todas (${total})`}
    </button>
  )
}

// Linha da legenda. `indice`: posição da categoria no resultado (cor da fatia).
function LinhaLegenda({ c, indice, sel, esmaecer, onClick, grande }) {
  const { categories } = useApp()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={sel}
      className={`w-full flex items-center justify-between px-2 rounded-lg transition-colors text-left group cursor-pointer ${grande ? 'min-h-[44px]' : 'py-1.5'} ${sel ? 'bg-surface-hover/70' : 'hover:bg-surface-hover/60'} ${esmaecer ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDaCategoria(c.categoryId, indice) }} />
        <span className="text-xs text-texto-2 truncate group-hover:text-texto-1 transition-colors">{nomeCat(categories, c.categoryId)}</span>
      </div>
      <span className="text-xs text-texto-3 shrink-0 ml-2 tabular-nums">
        {pctTxt(c.pct)} — {fmt(c.valor)}
      </span>
    </button>
  )
}

// Clique na fatia "Outras": a lista das categorias dentro dela; cada uma abre os próprios
// lançamentos. `inicio`: posição da 1ª categoria de Outras no resultado (cor).
function OutrasLista({ outras, inicio, periodo, modo, grande }) {
  const [aberta, setAberta] = useState(null)
  return (
    <div className="rounded-lg border border-borda bg-surface-2/40 px-2 py-2 space-y-1">
      <p className="text-xs text-texto-2 px-2 pb-1">
        <span className="font-semibold text-texto-1">Outras ({outras.membros.length})</span> · {fmt(outras.valor)}
      </p>
      {outras.membros.map((c, i) => (
        <div key={c.categoryId}>
          <LinhaLegenda
            c={c}
            indice={inicio + i}
            sel={aberta === c.categoryId}
            onClick={() => setAberta(a => (a === c.categoryId ? null : c.categoryId))}
            grande={grande}
          />
          {aberta === c.categoryId && (
            <div className="mt-1 mb-2">
              <CategoriaLancamentos categoriaId={c.categoryId} periodo={periodo} modo={modo} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Pizza + legenda. Clicar numa fatia ou linha da legenda abre a lista logo abaixo da legenda
// (mesmo item fecha; outro troca). A categoria aberta sobrevive à troca de período/modo.
export function PizzaDespesas({ periodo, modo, grande = false, todas = false, onAlternarTodas }) {
  const { categories } = useApp()
  const cor = useThemeColors()
  const { pizza, lista, total, aberta, alternar } = useBloco(periodo, modo, todas)
  const { fatias, outras } = pizza

  if (fatias.length === 0) {
    return (
      <div>
        <p className="text-xs text-texto-3 text-center py-10">Sem despesas no período</p>
        {aberta && aberta !== OUTRAS_ID && <CategoriaLancamentos categoriaId={aberta} periodo={periodo} modo={modo} />}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={fatias}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={2}
            dataKey="valor"
            onClick={(d) => alternar(d.categoryId)}
            style={{ cursor: 'pointer' }}
          >
            {fatias.map((c, i) => (
              <Cell
                key={c.categoryId}
                fill={corDaCategoria(c.categoryId, i)}
                fillOpacity={aberta && aberta !== c.categoryId ? 0.3 : 1}
                stroke={aberta === c.categoryId ? cor.texto1 : 'transparent'}
                strokeWidth={aberta === c.categoryId ? 2 : 0}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, _n, item) => {
              const p = item?.payload
              return [fmt(v), p?.outras ? `Outras (${p.membros.length})` : nomeCat(categories, p?.categoryId)]
            }}
            {...estiloTooltip(cor)}
            itemStyle={{ color: cor.texto1 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legenda (clicável, acessível por teclado): 5 primeiras ou todas. */}
      <div className="space-y-1 mt-1">
        {lista.map((c, i) => (
          <LinhaLegenda
            key={c.categoryId}
            c={c}
            indice={i}
            sel={aberta === c.categoryId}
            esmaecer={aberta && aberta !== c.categoryId}
            onClick={() => alternar(c.categoryId)}
            grande={grande}
          />
        ))}
      </div>

      {aberta && (
        <div className="mt-2">
          {aberta === OUTRAS_ID
            ? outras && <OutrasLista outras={outras} inicio={fatias.length - 1} periodo={periodo} modo={modo} grande={grande} />
            : <CategoriaLancamentos categoriaId={aberta} periodo={periodo} modo={modo} />}
        </div>
      )}

      <BotaoTodas total={total} todas={todas} onAlternar={onAlternarTodas} grande={grande} />
    </div>
  )
}

// Ranking com barra: 5 primeiras ou todas. Clicar numa linha expande a lista logo abaixo dela
// (acordeão, um por vez).
export function RankingDespesas({ periodo, modo, grande = false, todas = false, onAlternarTodas }) {
  const { categories } = useApp()
  const { lista, total, aberta, alternar } = useBloco(periodo, modo, todas)

  if (lista.length === 0) return <p className="text-xs text-texto-3 text-center py-4">Sem despesas no período</p>

  return (
    <div>
      <div className="space-y-2.5">
        {lista.map((c, i) => {
          const cat = categories.find(x => x.id === c.categoryId)
          const sel = aberta === c.categoryId
          const Seta = sel ? ChevronDown : ChevronRight
          return (
            <div key={c.categoryId}>
              <button
                type="button"
                onClick={() => alternar(c.categoryId)}
                aria-expanded={sel}
                className={`w-full text-left cursor-pointer rounded-lg px-1 -mx-1 hover:bg-surface-hover/40 ${grande ? 'min-h-[44px] py-1.5' : ''}`}
              >
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-texto-2 flex items-center gap-1">
                    <Seta size={12} className="text-texto-3" />
                    {nomeCat(categories, c.categoryId)}
                  </span>
                  <span className="text-texto-2">{fmt(c.valor)} <span className="text-texto-3">({pctTxt(c.pct)})</span></span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, c.pct)}%`, background: cat?.color || corDaCategoria(c.categoryId, i) }} />
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
        {/* Categoria aberta que saiu da lista (período/modo/Mostrar menos) continua visível. */}
        {aberta && !lista.some(c => c.categoryId === aberta) && (
          <CategoriaLancamentos categoriaId={aberta} periodo={periodo} modo={modo} />
        )}
      </div>
      <BotaoTodas total={total} todas={todas} onAlternar={onAlternarTodas} grande={grande} />
    </div>
  )
}
