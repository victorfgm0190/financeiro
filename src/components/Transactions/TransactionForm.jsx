import { useState, useMemo } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today, fmt } from '../shared/utils'
import ScheduleMatchModal from '../shared/ScheduleMatchModal'
import CategorySelect from '../shared/CategorySelect'
import DebtPlanModal from './DebtPlanModal'
import DebtPaymentModal from './DebtPaymentModal'

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
  { value: 'transfer', label: 'Transferência' },
]

function GerencialSelect({ value, onChange, grupos }) {
  const sorted = useMemo(() => [...grupos].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  }), [grupos])

  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      {sorted.map(g => (
        <option key={g.id} value={g.id}>
          {g.number} · {g.name}
        </option>
      ))}
    </select>
  )
}

export default function TransactionForm({ initial, onClose }) {
  const {
    accounts, accountGroups, categories, costCenters, payees,
    gerencialGroups, processarLancamentoGerencial,
    addTransaction, updateTransaction, addPayee, addCostCenter,
    findMatchingSchedule, addRecurringMatchException, markScheduleRegistered, getNextOccurrences,
  } = useApp()

  const defaultGrupoId = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'

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
    grupoGerencial: initial?.grupoGerencial || defaultGrupoId,
  })

  const [step, setStep] = useState('form') // 'form' | 'resgate' | 'schedule-match' | 'debt-plan' | 'debt-payment'
  const [resgateInfo, setResgateInfo] = useState(null)
  const [scheduleMatch, setScheduleMatch] = useState(null) // { schedule, tx }
  const [debtCtx, setDebtCtx] = useState(null) // { account, group, amount, date, sourceAccountId }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedAccount = accounts.find(a => a.id === form.accountId)
  const isCredit = selectedAccount?.type === 'credit'
  const showGerencial = isCredit && form.type === 'expense'

  const relevantCategories = categories.filter(c => c.type === 'both' || c.type === form.type)

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.amount || !form.accountId) return
    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)
    if (form.costCenter && !costCenters.includes(form.costCenter)) addCostCenter(form.costCenter)

    const txData = {
      ...form,
      amount: Number(form.amount),
      accountType: selectedAccount?.type,
      grupoGerencial: showGerencial ? form.grupoGerencial : null,
    }

    if (initial?.id) {
      updateTransaction(initial.id, txData)
      onClose()
      return
    }

    // Detect debt/loan account transfer before saving
    if (form.type === 'transfer' && form.toAccountId && !initial?.id) {
      const toAcc = accounts.find(a => a.id === form.toAccountId)
      const toGroup = (accountGroups || []).find(g => g.id === toAcc?.accountGroupId)
      if (toGroup?.behavior === 'divida' || toGroup?.behavior === 'emprestimo') {
        const ctx = { account: toAcc, group: toGroup, amount: Number(form.amount), date: form.date, sourceAccountId: form.accountId }
        if (toAcc.debtPlan) {
          // Payment flow — intercept, do NOT save as a normal transfer
          setDebtCtx(ctx)
          setStep('debt-payment')
          return
        } else {
          // New loan — save transfer normally, then show plan setup
          addTransaction(txData)
          setDebtCtx(ctx)
          setStep('debt-plan')
          return
        }
      }
    }

    addTransaction(txData)

    if (showGerencial && form.grupoGerencial) {
      const resultado = processarLancamentoGerencial(
        { accountId: form.accountId, amount: Number(form.amount), date: form.date },
        form.grupoGerencial
      )
      if (resultado.needsResgate && resultado.contaResgate) {
        setResgateInfo({ ...resultado, amount: Number(form.amount), date: form.date })
        setStep('resgate')
        return
      }
    }

    // Verifica agendamento recorrente para cartão de crédito
    if (isCredit && form.type === 'expense') {
      const match = findMatchingSchedule(txData)
      if (match) {
        setScheduleMatch({ schedule: match, tx: txData })
        setStep('schedule-match')
        return
      }
    }

    onClose()
  }

  const handleResgate = () => {
    if (resgateInfo?.contaResgate && contaPrincipal) {
      addTransaction({
        type: 'transfer',
        accountId: resgateInfo.contaResgate.id,
        toAccountId: contaPrincipal.id,
        amount: resgateInfo.amount,
        date: resgateInfo.date,
        description: `Resgate ${resgateInfo.grupo.name}`,
        grupoGerencial: resgateInfo.grupo.id,
      })
    }
    onClose()
  }

  // ── Tela de match com agendamento recorrente ─────────────────────────────────
  if (step === 'schedule-match' && scheduleMatch) {
    const handleRegister = () => {
      const nextOccs = getNextOccurrences(scheduleMatch.schedule, 3)
      const dateToMark = nextOccs[0] || scheduleMatch.tx.date
      markScheduleRegistered(scheduleMatch.schedule.id, dateToMark)
      onClose()
    }
    return (
      <ScheduleMatchModal
        schedule={scheduleMatch.schedule}
        tx={scheduleMatch.tx}
        categories={categories}
        onRegister={handleRegister}
        onKeep={onClose}
        onNeverAsk={() => {
          addRecurringMatchException(scheduleMatch.tx.payee || scheduleMatch.tx.description)
          onClose()
        }}
      />
    )
  }

  // ── Configuração de plano de dívida / empréstimo ────────────────────────────
  if (step === 'debt-plan' && debtCtx) {
    return (
      <DebtPlanModal
        account={debtCtx.account}
        group={debtCtx.group}
        amount={debtCtx.amount}
        date={debtCtx.date}
        onClose={onClose}
      />
    )
  }

  // ── Pagamento de parcela de dívida ───────────────────────────────────────────
  if (step === 'debt-payment' && debtCtx) {
    return (
      <DebtPaymentModal
        account={debtCtx.account}
        group={debtCtx.group}
        amount={debtCtx.amount}
        date={debtCtx.date}
        sourceAccountId={debtCtx.sourceAccountId}
        onClose={onClose}
      />
    )
  }

  // ── Tela de confirmação de resgate ──────────────────────────────────────────
  if (step === 'resgate') {
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center mx-auto">
            <ArrowLeftRight size={22} className="text-blue-400" />
          </div>
          <h3 className="font-semibold text-gray-100">Fazer resgate?</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Deseja resgatar{' '}
            <span className="text-white font-semibold">{fmt(resgateInfo.amount)}</span> da conta{' '}
            <span className="text-white font-semibold">{resgateInfo.contaResgate.name}</span>
            {contaPrincipal ? (
              <> para <span className="text-white font-semibold">{contaPrincipal.name}</span></>
            ) : null}
            ?
          </p>
          {resgateInfo.grupo && (
            <p className="text-xs text-gray-600">
              Grupo {resgateInfo.grupo.alias} · {resgateInfo.grupo.name}
            </p>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Não agora</button>
          <button className="btn-primary flex-1" onClick={handleResgate}>Sim, resgatar</button>
        </div>
      </div>
    )
  }

  // ── Formulário principal ────────────────────────────────────────────────────
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
        <>
          <div>
            <label className="label">Valor (R$) *</label>
            <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
          </div>
          {(() => {
            const toAcc = accounts.find(a => a.id === form.toAccountId)
            const toGroup = (accountGroups || []).find(g => g.id === toAcc?.accountGroupId)
            if (!toGroup?.behavior) return null
            const hasPlan = !!toAcc?.debtPlan
            const isEmp = toGroup.behavior === 'emprestimo'
            return (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${hasPlan ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                <span className="shrink-0 mt-0.5">{hasPlan ? '✓' : '⚠'}</span>
                {hasPlan
                  ? `Pagamento de ${isEmp ? 'empréstimo' : 'dívida'} — plano de ${toAcc.debtPlan.installments} parcelas ativo`
                  : `Conta de ${isEmp ? 'empréstimo a terceiros' : 'dívida'} — você poderá configurar o plano de parcelas após registrar`
                }
              </div>
            )
          })()}
        </>
      )}

      <div>
        <label className="label">Data *</label>
        <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
      </div>

      {form.type !== 'transfer' && (
        <>
          <div>
            <label className="label">Categoria</label>
            <CategorySelect
              categories={categories}
              type={form.type}
              value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}
            />
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

      {showGerencial && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-2">
          <label className="label" style={{ marginBottom: 0 }}>Classificação Gerencial</label>
          <GerencialSelect
            value={form.grupoGerencial}
            onChange={v => set('grupoGerencial', v)}
            grupos={gerencialGroups}
          />
          {form.grupoGerencial && (() => {
            const g = gerencialGroups.find(x => x.id === form.grupoGerencial)
            if (!g || g.number === 'D') return (
              <p className="text-xs text-gray-500">Lançamento registrado como despesa normal.</p>
            )
            if (g.number === 1) return (
              <p className="text-xs text-purple-300">
                Transferência automática será criada para a subconta "Ger. {selectedAccount?.apelido || selectedAccount?.name || 'CC'}".
              </p>
            )
            const acc = accounts.find(a => a.id === g.defaultAccountId)
            return (
              <p className="text-xs text-blue-300">
                Após registrar, você poderá resgatar da conta{acc ? ` "${acc.name}"` : ' padrão do grupo'}.
              </p>
            )
          })()}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Registrar'}</button>
      </div>
    </form>
  )
}
