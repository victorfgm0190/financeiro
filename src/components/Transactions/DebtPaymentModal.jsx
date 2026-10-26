import { useState, useMemo } from 'react'
import { CheckCircle, AlertCircle, TrendingDown, ArrowRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import InputMoeda from '../shared/InputMoeda'

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
        <AlertCircle size={32} className="text-aviso mx-auto" />
        <p className="text-sm text-texto-2">Esta conta não tem um plano de pagamento configurado.</p>
        <p className="text-xs text-texto-3">Registre a transferência normalmente e configure o plano depois.</p>
        <button className="btn-secondary w-full" onClick={onClose}>Fechar</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
        <TrendingDown size={15} className="text-primary-fg shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary-fg">
            {isEmprestimo ? 'Recebimento de parcela' : 'Pagamento de parcela'}
          </p>
          <p className="text-xs text-texto-2 mt-0.5 truncate">
            {nextInstallment?.description || account.name}
          </p>
        </div>
      </div>

      {/* Plan status KPIs */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card py-2.5">
          <p className="text-xs text-texto-3">Parcela</p>
          <p className="text-base font-bold text-texto-1">{installmentsDone}/{totalInstallments}</p>
        </div>
        <div className="card py-2.5">
          <p className="text-xs text-texto-3">Saldo devedor</p>
          <p className="text-base font-bold text-despesa">{fmt(account.balance || 0)}</p>
        </div>
        <div className="card py-2.5">
          <p className="text-xs text-texto-3">Após pagar</p>
          <p className="text-base font-bold text-receita">{fmt(remainingAfter)}</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        <div>
          <label className="label">Valor pago</label>
          <div className="input bg-surface text-texto-2 pointer-events-none">{fmt(amount)}</div>
        </div>

        <div>
          <label className="label">Principal (amortização)</label>
          <InputMoeda
            min="0"
            max={amount}
            value={principal}
            onChange={e => setPrincipal(e.target.value)}
          />
          <p className="text-xs text-texto-3 mt-0.5">
            Parcela padrão: {fmt(plan.installmentAmount)}
          </p>
        </div>

        <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg">
          <div className="flex-1">
            <p className="text-xs text-texto-3">
              Juros{interestCategory ? ` · ${interestCategory.icon} ${interestCategory.name}` : ''}
            </p>
            <p className={`text-sm font-semibold mt-0.5 ${interest > 0 ? 'text-aviso' : 'text-texto-3'}`}>
              {fmt(interest)}
            </p>
          </div>
          {interest === 0 && <CheckCircle size={15} className="text-primary-fg shrink-0" />}
        </div>
      </div>

      {/* Preview of what will be created */}
      <div className="p-3 bg-surface-2/60 rounded-lg space-y-2">
        <p className="text-xs text-texto-3 uppercase tracking-wide">O que será lançado</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-texto-2">Saída da conta corrente</span>
          <span className="text-despesa font-medium">−{fmt(amount)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-texto-2">Redução da dívida ({account.name})</span>
          <span className="text-receita font-medium">−{fmt(Number(principal) || 0)}</span>
        </div>
        {interest > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-texto-2">
              {interestCategory ? `${interestCategory.icon} ${interestCategory.name}` : 'Juros'}
            </span>
            <span className="text-aviso font-medium">+{fmt(interest)}</span>
          </div>
        )}
        {nextInstallment && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-texto-3 border-t border-borda-forte">
            <CheckCircle size={11} className="text-primary-fg shrink-0" />
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
