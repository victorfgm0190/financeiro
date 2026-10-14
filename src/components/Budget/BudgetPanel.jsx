import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, TrendingUp, AlertTriangle, Ban } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import CategorySelect from '../shared/CategorySelect'

export default function BudgetPanel() {
  const { budgets, categories, profileTransactions: transactions, addBudget, updateBudget, deleteBudget, getFinancialPeriod } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editBudget, setEditBudget] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [form, setForm] = useState({ categoryId: '', amount: '' })

  const period = getFinancialPeriod()

  const periodStr = {
    start: period.start.toISOString().split('T')[0],
    end: period.end.toISOString().split('T')[0],
  }

  const categorySpent = useMemo(() => {
    const spent = {}
    transactions
      .filter(tx => tx.type === 'expense' && tx.date >= periodStr.start && tx.date <= periodStr.end)
      .forEach(tx => {
        if (tx.categoryId) spent[tx.categoryId] = (spent[tx.categoryId] || 0) + tx.amount
      })
    return spent
  }, [transactions, periodStr])

  const totalBudgeted = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent = budgets.reduce((s, b) => s + (categorySpent[b.categoryId] || 0), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.categoryId || !form.amount) return
    if (editBudget) {
      updateBudget(editBudget.id, { categoryId: form.categoryId, amount: Number(form.amount) })
    } else {
      addBudget({ categoryId: form.categoryId, amount: Number(form.amount) })
    }
    setShowForm(false)
    setEditBudget(null)
    setForm({ categoryId: '', amount: '' })
  }

  const openEdit = (b) => {
    setEditBudget(b)
    setForm({ categoryId: b.categoryId, amount: String(b.amount) })
    setShowForm(true)
  }

  const usedCategoryIds = budgets.map(b => b.categoryId)
  const availableCategories = categories.filter(c =>
    c.type === 'expense' || c.type === 'both'
  ).filter(c => !usedCategoryIds.includes(c.id) || (editBudget && editBudget.categoryId === c.id))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-xs text-texto-2 uppercase tracking-wide">Total Orçado</p>
          <p className="text-xl font-bold text-texto-1 mt-1">{fmt(totalBudgeted)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-texto-2 uppercase tracking-wide">Total Gasto</p>
          <p className="text-xl font-bold text-despesa mt-1">{fmt(totalSpent)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-texto-2 uppercase tracking-wide">Saldo do Orçamento</p>
          <p className={`text-xl font-bold mt-1 ${totalBudgeted - totalSpent >= 0 ? 'text-receita' : 'text-despesa'}`}>
            {fmtSinal(totalBudgeted - totalSpent)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-texto-2">Orçamentos por Categoria</h2>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setEditBudget(null); setForm({ categoryId: '', amount: '' }); setShowForm(true) }}>
          <Plus size={14} /> Novo Orçamento
        </button>
      </div>

      {budgets.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingUp size={32} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-3">Nenhum orçamento cadastrado</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Criar orçamento</button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(budget => {
            const cat = categories.find(c => c.id === budget.categoryId)
            const spent = categorySpent[budget.categoryId] || 0
            const pct = budget.amount > 0 ? Math.min(100, (spent / budget.amount) * 100) : 0
            const overBudget = spent > budget.amount
            const nearLimit = pct >= 80 && !overBudget

            return (
              <div key={budget.id} className={`card border ${overBudget ? 'border-perigo/40' : nearLimit ? 'border-aviso/30' : 'border-borda'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat?.icon || '📌'}</span>
                    <div>
                      <p className="font-medium text-texto-1 text-sm">{cat?.name || budget.categoryId}</p>
                      <p className="text-xs text-texto-3">{fmt(spent)} de {fmt(budget.amount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {overBudget && (
                      <span className="flex items-center gap-1 text-perigo">
                        <Ban size={14} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Estourado</span>
                      </span>
                    )}
                    {nearLimit && <AlertTriangle size={14} className="text-aviso" />}
                    <span className={`text-sm font-bold ${overBudget ? 'text-perigo' : nearLimit ? 'text-aviso' : 'text-texto-2'}`}>
                      {pct.toFixed(0)}%
                    </span>
                    <button onClick={() => openEdit(budget)} className="p-1.5 text-texto-3 hover:text-texto-2 hover:bg-surface-hover rounded transition-colors">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => setConfirmDelete(budget)} className="p-1.5 text-texto-3 hover:text-perigo hover:bg-perigo-bg rounded transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${overBudget ? 'bg-perigo' : nearLimit ? 'bg-aviso' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-texto-3 mt-1">
                  <span>Restante: {fmt(budget.amount - spent)}</span>
                  <span>Orçado: {fmt(budget.amount)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditBudget(null) }} title={editBudget ? 'Editar Orçamento' : 'Novo Orçamento'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Categoria *</label>
            <CategorySelect
              categories={availableCategories}
              type="expense"
              value={form.categoryId}
              onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              placeholder="Selecione a categoria..."
              required
            />
          </div>
          <div>
            <label className="label">Valor Orçado (R$) *</label>
            <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" required />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={() => { setShowForm(false); setEditBudget(null) }}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1">{editBudget ? 'Salvar' : 'Criar'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteBudget(confirmDelete.id)}
        title="Excluir Orçamento"
        message={`Excluir orçamento de "${categories.find(c => c.id === confirmDelete?.categoryId)?.name}"?`}
        danger
      />
    </div>
  )
}
