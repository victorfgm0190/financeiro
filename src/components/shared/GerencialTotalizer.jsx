import { Fragment } from 'react'
import { fmt } from './utils'

const round2 = n => Math.round(n * 100) / 100

// Token exibido: G (grupo 1), D (grupo D), ou o número (numerados).
function token(g) {
  if (g.number === 1) return 'G'
  if (g.number === 'D') return 'D'
  return String(g.number)
}
// Ordem: G primeiro, numerados em ordem, D por último.
function sortKey(g) {
  if (g.number === 1) return -1
  if (g.number === 'D') return 1e9
  return typeof g.number === 'number' ? g.number : 1e8
}
function tokenColor(g) {
  if (g.number === 1) return 'text-emerald-400'
  if (g.number === 'D') return 'text-gray-500'
  return 'text-orange-500'
}

// Totalizador discreto por grupo gerencial — soma apenas despesas (ignora estornos/receitas)
// e mostra só os grupos com pelo menos um lançamento. Retorna null quando não há nada.
export default function GerencialTotalizer({ txs, gerencialGroups }) {
  const totals = new Map()
  for (const tx of txs || []) {
    if (tx.type !== 'expense' || !tx.grupoGerencial) continue
    totals.set(tx.grupoGerencial, round2((totals.get(tx.grupoGerencial) || 0) + (Number(tx.amount) || 0)))
  }
  const items = [...totals.entries()]
    .map(([gid, total]) => {
      const g = gerencialGroups.find(x => x.id === gid)
      return g ? { g, total } : null
    })
    .filter(Boolean)
    .sort((a, b) => sortKey(a.g) - sortKey(b.g))

  if (items.length === 0) return null

  return (
    <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900/40 flex items-center gap-x-3 gap-y-1.5 flex-wrap text-xs">
      {items.map(({ g, total }, i) => (
        <Fragment key={g.id}>
          {i > 0 && <span className="text-gray-700 select-none">|</span>}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={`font-bold ${tokenColor(g)}`}>{token(g)}</span>
            <span className="text-gray-500">· {g.name}:</span>
            <span className="font-semibold text-gray-300">{fmt(total)}</span>
          </span>
        </Fragment>
      ))}
    </div>
  )
}
