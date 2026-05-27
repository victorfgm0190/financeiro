import { useState } from 'react'
import { useApp } from '../../context/AppContext'

const TYPES = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'credit', label: 'Cartão de Crédito' },
  { value: 'cash', label: 'Dinheiro' },
]

export default function AccountForm({ initial, onClose }) {
  const { addAccount, updateAccount } = useApp()
  const [form, setForm] = useState({
    name: initial?.name || '',
    type: initial?.type || 'checking',
    balance: initial?.balance ?? '',
    bank: initial?.bank || '',
    creditLimit: initial?.creditLimit ?? '',
    closingDay: initial?.closingDay ?? 1,
    dueDay: initial?.dueDay ?? 10,
    isMain: initial?.isMain || false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (initial) {
      updateAccount(initial.id, {
        name: form.name,
        type: form.type,
        bank: form.bank,
        balance: form.type === 'credit' ? (initial.balance || 0) : Number(form.balance),
        creditLimit: Number(form.creditLimit),
        closingDay: Number(form.closingDay),
        dueDay: Number(form.dueDay),
        isMain: form.isMain,
      })
    } else {
      addAccount({
        name: form.name,
        type: form.type,
        bank: form.bank,
        balance: form.type === 'credit' ? 0 : Number(form.balance),
        creditLimit: Number(form.creditLimit),
        creditDebt: 0,
        creditMonthBill: 0,
        closingDay: Number(form.closingDay),
        dueDay: Number(form.dueDay),
        isMain: form.isMain,
      })
    }
    onClose()
  }

  const isCredit = form.type === 'credit'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Tipo de Conta</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(t => (
            <label key={t.value} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${form.type === t.value ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 bg-gray-800 text-gray-300'}`}>
              <input type="radio" name="type" value={t.value} checked={form.type === t.value} onChange={e => set('type', e.target.value)} className="sr-only" />
              <span className="text-sm font-medium">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Nome da Conta *</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Nubank, Itaú..." required />
      </div>

      <div>
        <label className="label">Banco / Instituição</label>
        <input className="input" value={form.bank} onChange={e => set('bank', e.target.value)} placeholder="Nome do banco" />
      </div>

      {!isCredit && (
        <div>
          <label className="label">Saldo Atual (R$)</label>
          <input className="input" type="number" step="0.01" value={form.balance} onChange={e => set('balance', e.target.value)} placeholder="0,00" />
        </div>
      )}

      {isCredit && (
        <>
          <div>
            <label className="label">Limite do Cartão (R$)</label>
            <input className="input" type="number" step="0.01" value={form.creditLimit} onChange={e => set('creditLimit', e.target.value)} placeholder="0,00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dia de Fechamento</label>
              <input className="input" type="number" min="1" max="31" value={form.closingDay} onChange={e => set('closingDay', e.target.value)} />
            </div>
            <div>
              <label className="label">Dia de Vencimento</label>
              <input className="input" type="number" min="1" max="31" value={form.dueDay} onChange={e => set('dueDay', e.target.value)} />
            </div>
          </div>
        </>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.isMain} onChange={e => set('isMain', e.target.checked)} className="w-4 h-4 accent-indigo-600" />
        <span className="text-sm text-gray-300">Definir como conta principal</span>
      </label>

      <div className="flex gap-3 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar Conta'}</button>
      </div>
    </form>
  )
}
