import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { today } from '../shared/utils'

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
  { value: 'transfer', label: 'Transferência' },
]

export default function TransactionForm({ initial, onClose }) {
  const { accounts, categories, costCenters, payees, addTransaction, updateTransaction, addPayee, addCostCenter } = useApp()
  const [form, setForm] = useState({
    type: initial?.type || 'expense',
    accountId: initial?.accountId || accounts[0]?.id || '',
    toAccountId: initial?.toAccountId || '',
    amount: initial?.amount ?? '',
    date: initial?.date || today(),
    categoryId: initial?.categoryId || '',
    description: initial?.description || '',
    payee: initial?.payee || '',
    costCenter: initial?.costCenter || '',
    notes: initial?.notes || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedAccount = accounts.find(a => a.id === form.accountId)
  const isCredit = selectedAccount?.type === 'credit'

  const relevantCategories = categories.filter(c =>
    c.type === 'both' || c.type === form.type
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.amount || !form.accountId) return
    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)
    if (form.costCenter && !costCenters.includes(form.costCenter)) addCostCenter(form.costCenter)

    const data = {
      ...form,
      amount: Number(form.amount),
      accountType: selectedAccount?.type,
    }

    if (initial) {
      updateTransaction(initial.id, data)
    } else {
      addTransaction(data)
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Tipo</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {TYPE_OPTIONS.map(t => (
            <button
              type="button"
              key={t.value}
              onClick={() => set('type', t.value)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.type === t.value
                  ? t.value === 'income' ? 'bg-emerald-600 text-white'
                    : t.value === 'expense' ? 'bg-red-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Conta {form.type === 'transfer' ? 'Origem' : ''} *</label>
          <select className="input" value={form.accountId} onChange={e => set('accountId', e.target.value)} required>
            <option value="">Selecione...</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {form.type === 'transfer' ? (
          <div>
            <label className="label">Conta Destino *</label>
            <select className="input" value={form.toAccountId} onChange={e => set('toAccountId', e.target.value)} required>
              <option value="">Selecione...</option>
              {accounts.filter(a => a.id !== form.accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Valor (R$) *</label>
            <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
          </div>
        )}
      </div>

      {form.type === 'transfer' && (
        <div>
          <label className="label">Valor (R$) *</label>
          <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
        </div>
      )}

      <div>
        <label className="label">Data *</label>
        <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
      </div>

      {form.type !== 'transfer' && (
        <>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
              <option value="">Sem categoria</option>
              {relevantCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Favorecido</label>
            <input
              className="input"
              value={form.payee}
              onChange={e => set('payee', e.target.value)}
              placeholder="Nome do favorecido"
              list="payees-list"
            />
            <datalist id="payees-list">
              {payees.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          <div>
            <label className="label">Centro de Custo</label>
            <select className="input" value={form.costCenter} onChange={e => set('costCenter', e.target.value)}>
              <option value="">Sem centro de custo</option>
              {costCenters.map(cc => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="label">Descrição</label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descrição do lançamento" />
      </div>

      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações adicionais..." />
      </div>

      {isCredit && form.type === 'expense' && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-xs text-purple-300">
          Este lançamento será adicionado à fatura do cartão de crédito.
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Registrar'}</button>
      </div>
    </form>
  )
}
