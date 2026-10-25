// Card "Top 5 Favorecidos" do Painel. As listas de receitas/despesas vêm prontas do DashboardPanel
// (os mesmos lançamentos dos KPIs "Receitas do Mês" / "Despesas do Mês"); aqui só se agrupa por
// favorecido (lib/topFavorecidos). Clique num favorecido → onAbrirLancamentos; "Ver todos" →
// ranking completo da coluna num modal.
import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { fmt } from '../shared/utils'
import { agruparPorFavorecido } from '../../lib/topFavorecidos'
import Modal from '../shared/Modal'

const COLUNAS = {
  receitas: { titulo: 'Top 5 Receitas', vazio: 'Nenhuma receita no período', texto: 'text-receita', barra: 'bg-receita' },
  despesas: { titulo: 'Top 5 Despesas', vazio: 'Nenhuma despesa no período', texto: 'text-despesa', barra: 'bg-despesa' },
}

const lanc = (n) => `${n} lanç.`

function LinhaFavorecido({ pos, g, max, cfg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-surface-hover/60 transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-texto-3 w-4 shrink-0 tabular-nums">{pos}</span>
        <span className="text-sm text-texto-1 truncate min-w-0 flex-1" title={g.nome}>{g.nome}</span>
        <span className={`text-sm font-semibold shrink-0 tabular-nums ${cfg.texto}`}>{fmt(g.total)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 pl-6">
        <div className="h-1 flex-1 bg-surface-2 rounded-full overflow-hidden">
          <div className={`h-1 rounded-full ${cfg.barra}`} style={{ width: `${max > 0 ? Math.max((g.total / max) * 100, 1) : 0}%` }} />
        </div>
        <span className="text-[11px] text-texto-3 shrink-0 tabular-nums">{g.pct.toFixed(1)}% · {lanc(g.qtd)}</span>
      </div>
    </button>
  )
}

function Coluna({ tipo, ranking, onAbrirFavorecido, onVerTodos }) {
  const cfg = COLUNAS[tipo]
  const top = ranking.grupos.slice(0, 5)
  const max = top[0]?.total || 0
  const { semFavorecido } = ranking
  return (
    <div className="min-w-0">
      <h4 className={`text-xs uppercase tracking-wide font-medium mb-2 ${cfg.texto}`}>{cfg.titulo}</h4>
      {top.length === 0 ? (
        <p className="text-xs text-texto-3 text-center py-6">{cfg.vazio}</p>
      ) : (
        <div className="space-y-0.5">
          {top.map((g, i) => (
            <LinhaFavorecido key={g.chave} pos={i + 1} g={g} max={max} cfg={cfg} onClick={() => onAbrirFavorecido(g, cfg)} />
          ))}
        </div>
      )}
      {(semFavorecido.qtd > 0 || ranking.grupos.length > 0) && (
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-borda/50 text-[11px] text-texto-3">
          <span className="truncate">
            {semFavorecido.qtd > 0 && <>Sem favorecido: {fmt(semFavorecido.total)} ({lanc(semFavorecido.qtd)})</>}
          </span>
          {ranking.grupos.length > 0 && (
            <button type="button" onClick={onVerTodos} className="text-primary-fg hover:text-texto-1 shrink-0">Ver todos</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function TopFavorecidos({ receitas, despesas, onAbrirLancamentos }) {
  const rankReceitas = useMemo(() => agruparPorFavorecido(receitas), [receitas])
  const rankDespesas = useMemo(() => agruparPorFavorecido(despesas), [despesas])
  const [todos, setTodos] = useState(null) // 'receitas' | 'despesas'

  const abrirFavorecido = (g, cfg) => onAbrirLancamentos({ title: g.nome, total: g.total, color: cfg.texto, txs: g.txs })
  const rankTodos = todos === 'receitas' ? rankReceitas : rankDespesas
  const cfgTodos = todos ? COLUNAS[todos] : null

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
        <Users size={14} className="text-texto-2" />
        Top 5 Favorecidos
      </h3>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
        <Coluna tipo="receitas" ranking={rankReceitas} onAbrirFavorecido={abrirFavorecido} onVerTodos={() => setTodos('receitas')} />
        <Coluna tipo="despesas" ranking={rankDespesas} onAbrirFavorecido={abrirFavorecido} onVerTodos={() => setTodos('despesas')} />
      </div>

      {todos && (
        <Modal open={!!todos} onClose={() => setTodos(null)} title={todos === 'receitas' ? 'Favorecidos — Receitas' : 'Favorecidos — Despesas'} size="md">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-borda">
              <span className="text-xs text-texto-3 uppercase tracking-wide">
                Total · {rankTodos.grupos.length} favorecido{rankTodos.grupos.length !== 1 ? 's' : ''}
              </span>
              <span className={`text-lg font-bold ${cfgTodos.texto}`}>{fmt(rankTodos.total)}</span>
            </div>
            <div className="space-y-0.5 max-h-96 overflow-y-auto overscroll-contain">
              {rankTodos.grupos.map((g, i) => (
                <LinhaFavorecido
                  key={g.chave} pos={i + 1} g={g} max={rankTodos.grupos[0].total} cfg={cfgTodos}
                  onClick={() => { setTodos(null); abrirFavorecido(g, cfgTodos) }}
                />
              ))}
            </div>
            {rankTodos.semFavorecido.qtd > 0 && (
              <p className="text-[11px] text-texto-3 pt-2 border-t border-borda/50">
                Sem favorecido: {fmt(rankTodos.semFavorecido.total)} ({lanc(rankTodos.semFavorecido.qtd)})
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
