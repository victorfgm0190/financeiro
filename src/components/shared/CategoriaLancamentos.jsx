import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useDespesasPorCategoria } from '../../hooks/useDespesasPorCategoria'
import { fmt, fmtDate } from './utils'
import { SEM_CATEGORIA_ID } from '../../lib/despesasPorCategoria'
import Modal from './Modal'
import TransactionForm from '../Transactions/TransactionForm'

const LIMITE = 10

// Lançamentos de UMA categoria no período/modo do bloco clicado (pizza ou ranking). Os números vêm
// da mesma função dos blocos (useDespesasPorCategoria), então o total aqui é o valor do bloco.
// Tocar num lançamento abre a edição existente (TransactionForm).
export default function CategoriaLancamentos({ categoriaId, periodo, modo }) {
  const { categories, accounts, transactions } = useApp()
  const { categorias } = useDespesasPorCategoria(periodo, modo)
  const [todos, setTodos] = useState(false)
  const [editTx, setEditTx] = useState(null)

  const cat = categories.find(c => c.id === categoriaId)
  const nome = cat ? `${cat.icon ? cat.icon + ' ' : ''}${cat.name}` : (categoriaId === SEM_CATEGORIA_ID ? 'Sem categoria' : 'Categoria')
  const dados = categorias.find(c => c.categoryId === categoriaId)
  const contaNome = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  // Linha de rateio/visão de perfil → lançamento real para editar.
  const abrir = (tx) => setEditTx(transactions.find(t => t.id === (tx._rateioOf || tx.id)) || null)

  if (!dados) {
    return <p className="text-xs text-gray-500 py-3 px-2">Sem lançamentos de {nome} no período.</p>
  }

  const despesas = [...dados.despesas].sort((a, b) => b.amount - a.amount)
  const visiveis = todos ? despesas : despesas.slice(0, LIMITE)
  const linhaResumo = (rotulo, valor, ativo) => (
    <div className={`flex justify-between ${ativo ? 'text-gray-100 font-semibold' : 'text-gray-500'}`}>
      <span>{rotulo}</span><span className="tabular-nums">{fmt(valor)}</span>
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-3 space-y-3">
      <p className="text-xs text-gray-300">
        <span className="font-semibold text-gray-100">{nome}</span> · {fmt(dados.valor)} · {dados.despesas.length} lançamento{dados.despesas.length !== 1 ? 's' : ''}
      </p>

      <div className="text-xs space-y-0.5">
        {linhaResumo('Despesa cheia', dados.cheio, modo === 'cheio')}
        {linhaResumo('(−) Resgate da reserva', dados.resgate, false)}
        {linhaResumo('= Líquido', dados.liquido, modo === 'liquido')}
      </div>

      <ul className="divide-y divide-gray-800/70">
        {visiveis.map(tx => (
          <li key={tx.id}>
            <button
              type="button"
              onClick={() => abrir(tx)}
              className="w-full flex items-center justify-between gap-3 py-2 min-h-[44px] text-left hover:bg-gray-800/40 rounded"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{tx.description || nome}</p>
                <p className="text-[11px] text-gray-500 truncate">{fmtDate(tx.date)} · {contaNome(tx.accountId)}</p>
              </div>
              <span className="text-sm font-semibold text-orange-600 shrink-0 tabular-nums">−{fmt(tx.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!todos && despesas.length > LIMITE && (
        <button type="button" onClick={() => setTodos(true)} className="text-xs text-emerald-400 min-h-[44px]">
          Ver todos ({despesas.length})
        </button>
      )}

      {dados.resgates.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
            Resgates da reserva{modo === 'cheio' ? ' (não abatem no modo Cheio)' : ''}
          </p>
          <ul className="divide-y divide-gray-800/70">
            {dados.resgates.map(tx => (
              // Resgate é lançamento automático (sombra da reserva): só informativo, sem edição.
              <li key={tx.id} className="flex items-center justify-between gap-3 py-2 min-h-[44px]">
                <div className="min-w-0">
                  <p className="text-sm text-gray-300 truncate">{tx.description || 'Resgate da reserva'}</p>
                  <p className="text-[11px] text-gray-500 truncate">{fmtDate(tx.date)} · {contaNome(tx.accountId)}</p>
                </div>
                <span className="text-sm font-semibold text-receita shrink-0 tabular-nums">+{fmt(tx.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="Editar Lançamento">
        {editTx && <TransactionForm initial={editTx} onClose={() => setEditTx(null)} />}
      </Modal>
    </div>
  )
}

// Clique em "Outras": os lançamentos de cada categoria dentro dela, agrupados por categoria
// (membros = agruparTopN(...).outras.membros, já em ordem de valor).
export function OutrasLancamentos({ membros, valor, periodo, modo }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-300 px-1">
        <span className="font-semibold text-gray-100">Outras</span> · {fmt(valor)} · {membros.length} categoria{membros.length !== 1 ? 's' : ''}
      </p>
      {membros.map(m => (
        <CategoriaLancamentos key={m.categoryId} categoriaId={m.categoryId} periodo={periodo} modo={modo} />
      ))}
    </div>
  )
}
