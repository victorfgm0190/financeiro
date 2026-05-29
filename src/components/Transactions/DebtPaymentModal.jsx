import { useState, useMemo } from 'react'
import { CheckCircle, AlertCircle, TrendingDown, ArrowRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

export default function DebtPaymentModal({ account, group, amount, date, sourceAccountId, onClose }) {
  const { payables, categories, payDebtInstallment } = useApp()

  const plan = account.debtPlan
  const isEmprestimo = group?.behavior === 'emprestimo'

  // Next pending installment for this debt account
  const nextInstallment = useMemo(() =>
    payables
      .filter(p => p.origin === 'debt_installment' && p.cartaoId === account.id && p.status === 'pending')
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))[0] || null,
    [payables, account.id]
  )

  const standardPrincipal = plan ? Math.min(amount, plan.installmentAmount) : amount
  const [principal, setPrincipal] = useState(standardPrincipal.toFixed(2))

  const interest = useMemo(() => Math.max(0, amount - (Number(principal) || 0)), [principal, amount])

  const interestCategory = categories.find(c => c.id === plan?.interestCategoryId)
  const remainingAfter = Math.max(0, (account.balance || 0) - (Number(principal) || 0))
  const installmentsDone = (plan?.paidInstallments || 0) + 1
  const totalInstallments = plan?.installments || '?'

  const handleConfirm = () => {
    payDebtInstallment({
      debtAccountId: account.id,
      sourceAccountId,
      payableId: nextInstallment?.id || null,
      paidAmount: amount,
      principalAmount: Number(principal) || 0,
      interestAmount: interest,
      interestCategoryId: plan?.interestCategoryId || null,
      date,
      description: nextInstallment?.description || account.name,
    })
    onClose()
  }

  if (!plan) {
    return (
      <div className="space-y-4 text-center py-6">
        <AlertCircle size={32} className="text-amber-400 mx-auto" />
        <p className="text-sm text-gray-300">Esta conta não tem um plano de pagamento configurado.</p>
        <p className="text-xs text-gray-500">Registre a transferência normalmente e configure o plano depois.</p>
        <button className="btn-secondary w-full" onClick={onClose}>Fechar</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
        <TrendingDown size={15} className="text-emerald-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-emerald-300">
            {isEmprestimo ? 'Recebimento de parcela' : 'Pagamento de parcela'}
          </p>
          <p className="text-xs text-emerald-400/70 mt-0.5 truncate">
            {nextInstallment?.description || account.name}
          </p>
        </div>
      </div>

      {/* Plan status KPIs */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card py-2.5">
          <p className="text-xs text-gray-500">Parcela</p>
          <p className="text-base font-bold text-gray-200">{installmentsDone}/{totalInstallments}</p>
        </div>
        <div className="card py-2.5">
          <p className="text-xs text-gray-500">Saldo devedor</p>
          <p className="text-base font-bold text-red-400">{fmt(account.balance || 0)}</p>
        </div>
        <div className="card py-2.5">
          <p className="text-xs text-gray-500">Após pagar</p>
          <p className="text-base font-bold text-emerald-400">{fmt(remainingAfter)}</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        <div>
          <label className="label">Valor pago</label>
          <div className="input bg-gray-900 text-gray-400 pointer-events-none">{fmt(amount)}</div>
        </div>

        <div>
          <label className="label">Principal (amortização)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            max={amount}
            value={principal}
            onChange={e => setPrincipal(e.target.value)}
          />
          <p className="text-xs text-gray-600 mt-0.5">
            Parcela padrão: {fmt(plan.installmentAmount)}
          </p>
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
          <div className="flex-1">
            <p className="text-xs text-gray-500">
              Juros{interestCategory ? ` · ${interestCategory.icon} ${interestCategory.name}` : ''}
            </p>
            <p className={`text-sm font-semibold mt-0.5 ${interest > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
              {fmt(interest)}
            </p>
          </div>
          {interest === 0 && <CheckCircle size={15} className="text-emerald-500 shrink-0" />}
        </div>
      </div>

      {/* Preview of what will be created */}
      <div className="p-3 bg-gray-800/60 rounded-lg space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">O que será lançado</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Saída da conta corrente</span>
          <span className="text-red-400 font-medium">−{fmt(amount)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Redução da dívida ({account.name})</span>
          <span className="text-emerald-400 font-medium">−{fmt(Number(principal) || 0)}</span>
        </div>
        {interest > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              {interestCategory ? `${interestCategory.icon} ${interestCategory.name}` : 'Juros'}
            </span>
            <span className="text-amber-400 font-medium">+{fmt(interest)}</span>
          </div>
        )}
        {nextInstallment && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-gray-600 border-t border-gray-700">
            <CheckCircle size={11} className="text-emerald-600 shrink-0" />
            Parcela {nextInstallment.installmentNumber}/{nextInstallment.totalInstallments} marcada como paga
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-primary flex-1" onClick={handleConfirm}>
          Confirmar Pagamento
        </button>
      </div>
    </div>
  )
}
