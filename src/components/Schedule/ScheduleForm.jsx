import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { today } from '../shared/utils'
import { format, addDays } from 'date-fns'

const FREQUENCIES = [
  { value: 'once', label: 'Única' },
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
]

export default function ScheduleForm({ initial, onClose }) {
  const { accounts, categories, costCenters, payees, addSchedule, updateSchedule, getNextOccurrences } = useApp()
  const [form, setForm] = useState({
    description: initial?.description || '',
    transactionType: initial?.transactionType || 'expense',
    accountId: initial?.accountId || accounts[0]?.id || '',
    amount: initial?.amount ?? '',
    categoryId: initial?.categoryId || '',
    payee: initial?.payee || '',
    costCenter: initial?.costCenter || '',
    frequency: initial?.frequency || 'monthly',
    startDate: initial?.startDate || today(),
    occurrenceType: initial?.occurrenceType || 'continuous',
    installments: initial?.installments ?? 12,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedAccount = accounts.find(a => a.id === form.accountId)

  const relevantCategories = categories.filter(c =>
    c.type === 'both' || c.type === form.transactionType
  )

  const previewSchedule = {
    ...form,
    amount: Number(form.amount) || 0,
    registered: [],
    skipped: [],
  }
  const preview = form.startDate && form.frequency ? getNextOccurrences(previewSchedule, 12) : []

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.description || !form.amount || !form.accountId) return
    const data = {
      ...form,
      amount: Number(form.amount),
      accountType: selectedAccount?.type,
      installments: Number(form.installments),
    }
    if (initial) {
      updateSchedule(initial.id, data)
    } else {
      addSchedule(data)
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="label">Tipo</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {['expense', 'income'].map(t => (
            <button type="button" key={t} onClick={() => set('transactionType', t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${form.transactionType === t ? (t === 'income' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {t === 'income' ? 'Receita' : 'Despesa'}
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-2">
        <label className="label">Descrição *</label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Aluguel, Salário..." required />
      </div>

      <div>
        <label className="label">Conta *</label>
        <select className="input" value={form.accountId} onChange={e => set('accountId', e.target.value)} required>
          <option value="">Selecione...</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Valor (R$) *</label>
        <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
      </div>

      <div>
        <label className="label">Categoria</label>
        <select className="input" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
          <option value="">Sem categoria</option>
          {relevantCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Favorecido</label>
        <input className="input" value={form.payee} onChange={e => set('payee', e.target.value)} placeholder="Nome..." list="sch-payees" />
        <datalist id="sch-payees">{payees.map(p => <option key={p} value={p} />)}</datalist>
      </div>

      <div>
        <label className="label">Frequência</label>
        <select className="input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
          {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Data de Início *</label>
        <input className="input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} required />
      </div>

      <div>
        <label className="label">Ocorrência</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {[['continuous', 'Contínua'], ['installment', 'Parcelada']].map(([v, l]) => (
            <button type="button" key={v} onClick={() => set('occurrenceType', v)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${form.occurrenceType === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {form.occurrenceType === 'installment' && (
        <div>
          <label className="label">Nº de Parcelas</label>
          <input className="input" type="number" min="1" max="360" value={form.installments} onChange={e => set('installments', e.target.value)} />
        </div>
      )}

      {preview.length > 0 && (
        <div className="col-span-2">
          <label className="label">Prévia das próximas ocorrências</label>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {preview.map((date, i) => (
              <div key={date} className={`text-center p-2 rounded-lg text-xs ${i === 0 ? 'bg-indigo-500/20 text-indigo-400 font-medium' : 'bg-gray-800 text-gray-400'}`}>
                {date.split('-').reverse().join('/')}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="col-span-2 flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar Agendamento'}</button>
      </div>
    </form>
  )
}
