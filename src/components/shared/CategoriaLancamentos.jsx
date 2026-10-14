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
    return <p className="text-xs text-texto-3 py-3 px-2">Sem lançamentos de {nome} no período.</p>
  }

  const despesas = [...dados.despesas].sort((a, b) => b.amount - a.amount)
  const visiveis = todos ? despesas : despesas.slice(0, LIMITE)
  const linhaResumo = (rotulo, valor, ativo) => (
    <div className={`flex justify-between ${ativo ? 'text-texto-1 font-semibold' : 'text-texto-3'}`}>
      <span>{rotulo}</span><span className="tabular-nums">{fmt(valor)}</span>
    </div>
  )

  return (
    <div className="rounded-lg border border-borda bg-surface-2/40 px-3 py-3 space-y-3">
      <p className="text-xs text-texto-2">
        <span className="font-semibold text-texto-1">{nome}</span> · {fmt(dados.valor)} · {dados.despesas.length} lançamento{dados.despesas.length !== 1 ? 's' : ''}
      </p>

      <div className="text-xs space-y-0.5">
        {linhaResumo('Despesa cheia', dados.cheio, modo === 'cheio')}
        {linhaResumo('(−) Resgate da reserva', dados.resgate, false)}
        {linhaResumo('= Líquido', dados.liquido, modo === 'liquido')}
      </div>

      <ul className="divide-y divide-borda/70">
        {visiveis.map(tx => (
          <li key={tx.id}>
            <button
              type="button"
              onClick={() => abrir(tx)}
              className="w-full flex items-center justify-between gap-3 py-2 min-h-[44px] text-left hover:bg-surface-hover/40 rounded"
            >
              <div className="min-w-0">
                <p className="text-sm text-texto-1 truncate">{tx.description || nome}</p>
                <p className="text-[11px] text-texto-3 truncate">{fmtDate(tx.date)} · {contaNome(tx.accountId)}</p>
              </div>
              <span className="text-sm font-semibold text-despesa shrink-0 tabular-nums">−{fmt(tx.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!todos && despesas.length > LIMITE && (
        <button type="button" onClick={() => setTodos(true)} className="text-xs text-primary-fg min-h-[44px]">
          Ver todos ({despesas.length})
        </button>
      )}

      {dados.resgates.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-texto-3 mb-1">
            Resgates da reserva{modo === 'cheio' ? ' (não abatem no modo Cheio)' : ''}
          </p>
          <ul className="divide-y divide-borda/70">
            {dados.resgates.map(tx => (
              // Resgate é lançamento automático (sombra da reserva): só informativo, sem edição.
              <li key={tx.id} className="flex items-center justify-between gap-3 py-2 min-h-[44px]">
                <div className="min-w-0">
                  <p className="text-sm text-texto-2 truncate">{tx.description || 'Resgate da reserva'}</p>
                  <p className="text-[11px] text-texto-3 truncate">{fmtDate(tx.date)} · {contaNome(tx.accountId)}</p>
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
