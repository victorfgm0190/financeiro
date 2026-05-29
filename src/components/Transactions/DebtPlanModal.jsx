import { useState, useMemo } from 'react'
import { format, addMonths, parseISO } from 'date-fns'
import { DollarSign, Calendar, User, CreditCard, Tag } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

function fmtBR(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function firstDueAfterToday(dueDay) {
  const now = new Date()
  const candidate = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (candidate > now) return candidate
  return new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
}

export default function DebtPlanModal({ account, group, amount, date, onClose }) {
  const { accounts, categories, addPayable, setDebtPlan } = useApp()

  const isEmprestimo = group?.behavior === 'emprestimo'

  const checkingAccounts = accounts.filter(a => ['checking', 'savings', 'cash'].includes(a.type))
  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both')
  const defaultInterestCatId = categories.find(c => c.id === 'cat_ban_jur')?.id || expenseCategories[0]?.id || ''

  const defaultDueDay = 10
  const defaultFirstDue = format(firstDueAfterToday(defaultDueDay), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    totalAmount: amount,
    payee: '',
    installments: 12,
    dueDay: defaultDueDay,
    firstDueDate: defaultFirstDue,
    installmentAmount: +(amount / 12).toFixed(2),
    debitAccountId: checkingAccounts[0]?.id || '',
    interestCategoryId: defaultInterestCatId,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleInstallmentsChange = (raw) => {
    const n = Math.max(1, Math.min(360, Number(raw) || 1))
    setForm(f => ({ ...f, installments: n, installmentAmount: +(f.totalAmount / n).toFixed(2) }))
  }

  const handleTotalChange = (raw) => {
    const t = Number(raw) || 0
    setForm(f => ({ ...f, totalAmount: t, installmentAmount: +(t / (f.installments || 1)).toFixed(2) }))
  }

  const handleDueDayChange = (raw) => {
    const day = Math.max(1, Math.min(28, Number(raw) || 1))
    const newFirst = format(firstDueAfterToday(day), 'yyyy-MM-dd')
    setForm(f => ({ ...f, dueDay: day, firstDueDate: newFirst }))
  }

  const previewDates = useMemo(() => {
    try {
      const base = parseISO(form.firstDueDate)
      return Array.from({ length: Math.min(form.installments, 3) }, (_, i) =>
        format(addMonths(base, i), 'dd/MM/yyyy')
      )
    } catch { return [] }
  }, [form.firstDueDate, form.installments])

  const totalPayout = form.installmentAmount * form.installments
  const diff = Math.abs(totalPayout - form.totalAmount)

  const handleConfirm = () => {
    if (!form.debitAccountId || form.installments < 1) return

    const plan = {
      totalAmount: form.totalAmount,
      installments: form.installments,
      installmentAmount: form.installmentAmount,
      dueDay: form.dueDay,
      payee: form.payee,
      debitAccountId: form.debitAccountId,
      interestCategoryId: form.interestCategoryId,
      startDate: date,
      paidInstallments: 0,
    }

    setDebtPlan(account.id, plan)

    const base = parseISO(form.firstDueDate)
    for (let i = 0; i < form.installments; i++) {
      const dueDate = format(addMonths(base, i), 'yyyy-MM-dd')
      addPayable({
        origin: 'debt_installment',
        cartaoId: account.id,
        description: `${account.name}${form.payee ? ` · ${form.payee}` : ''} — Parcela ${i + 1}/${form.installments}`,
        amount: form.installmentAmount,
        dueDate,
        status: 'pending',
        installmentNumber: i + 1,
        totalInstallments: form.installments,
        mesAno: dueDate.slice(0, 7),
      })
    }

    onClose()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <DollarSign size={15} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-300">
            {isEmprestimo ? 'Empréstimo concedido' : 'Empréstimo recebido'}
          </p>
          <p className="text-xs text-blue-400/70 mt-0.5">
            {fmt(amount)} em {fmtBR(date)} — conta: {account.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Valor total</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.totalAmount}
            onChange={e => handleTotalChange(e.target.value)}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1"><User size={11} /> Favorecido</label>
          <input
            className="input"
            value={form.payee}
            onChange={e => set('payee', e.target.value)}
            placeholder={isEmprestimo ? 'Quem você emprestou...' : 'Nome do credor...'}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Parcelas</label>
          <input
            className="input"
            type="number"
            min="1"
            max="360"
            value={form.installments}
            onChange={e => handleInstallmentsChange(e.target.value)}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Calendar size={11} /> Dia venc.</label>
          <input
            className="input"
            type="number"
            min="1"
            max="28"
            value={form.dueDay}
            onChange={e => handleDueDayChange(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Vlr. parcela</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.installmentAmount}
            onChange={e => set('installmentAmount', Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div>
        <label className="label">Primeira parcela em</label>
        <input
          className="input"
          type="date"
          value={form.firstDueDate}
          onChange={e => set('firstDueDate', e.target.value)}
        />
      </div>

      <div>
        <label className="label flex items-center gap-1">
          <CreditCard size={11} />
          {isEmprestimo ? 'Conta de recebimento' : 'Conta de débito para pagamentos'}
        </label>
        <select
          className="input"
          value={form.debitAccountId}
          onChange={e => set('debitAccountId', e.target.value)}
          required
        >
          <option value="">Selecione...</option>
          {checkingAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div>
        <label className="label flex items-center gap-1">
          <Tag size={11} />
          {isEmprestimo ? 'Categoria de rendimento (juros)' : 'Categoria de juros'}
        </label>
        <select
          className="input"
          value={form.interestCategoryId}
          onChange={e => set('interestCategoryId', e.target.value)}
        >
          <option value="">Nenhuma</option>
          {expenseCategories.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>

      {form.installments > 0 && form.firstDueDate && (
        <div className="p-3 bg-gray-800 rounded-lg space-y-1.5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resumo do plano</p>
          <p className="text-sm font-semibold text-gray-200">
            {form.installments}× de {fmt(form.installmentAmount)}
          </p>
          <p className="text-xs text-gray-500">
            Vencimentos: {previewDates.join(' · ')}{form.installments > 3 ? ` · ... (+${form.installments - 3})` : ''}
          </p>
          {diff > 0.01 && (
            <p className="text-xs text-amber-400/80">
              Total das parcelas: {fmt(totalPayout)} (difere {fmt(diff)} do principal)
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>
          Não agora
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={handleConfirm}
          disabled={!form.debitAccountId || form.installments < 1}
        >
          Criar Plano ({form.installments} parcelas)
        </button>
      </div>
    </div>
  )
}
