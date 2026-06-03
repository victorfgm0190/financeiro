import { useState, useMemo } from 'react'
import { ArrowLeftRight, PiggyBank } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today, fmt, fmtDate, groupedAccountOptions, accountPriority } from '../shared/utils'
import { computeFaturaRef } from '../../lib/fatura'
import ScheduleMatchModal from '../shared/ScheduleMatchModal'
import SearchableSelect from '../shared/SearchableSelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
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

const GERENCIAL_CONTA_KEY = 'lastGerencialAccountId'

function buildCatOpts(categories, type) {
  return categories
    .filter(c => !type || c.type === type || c.type === 'both')
    .map(c => ({ id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null }))
}

function buildAccOpts(accounts, _accountGroups, excludeId) {
  const pool = excludeId ? accounts.filter(a => a.id !== excludeId) : accounts
  return [...pool]
    .sort((a, b) => accountPriority(a) - accountPriority(b))
    .map(a => ({ id: a.id, label: a.name, group: accountPriority(a) === 2 ? 'Outras contas' : null }))
}

export default function TransactionForm({ initial, onClose, onToast }) {
  const {
    accounts, accountGroups, categories, costCenters, payees, transactions, schedules,
    gerencialGroups, processarLancamentoGerencial, criarParcelasGerencial, ajustarParcelasGrupoGerencial, propagarValorParcelas, reverseGerencialCascadeOnly,
    addTransaction, updateTransaction, addPayee, addCostCenter,
    updateSchedule, deleteSchedule,
    findMatchingSchedule, addRecurringMatchException, markScheduleRegistered, getNextOccurrences,
  } = useApp()

  const defaultGrupoId = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'

  const checkingAccounts = useMemo(
    () => accounts.filter(a => a.type === 'checking' || a.contaCorrentePrincipal),
    [accounts]
  )

  const [gerencialContaId, setGerencialContaId] = useState(() => {
    const saved = localStorage.getItem(GERENCIAL_CONTA_KEY)
    if (saved && accounts.some(a => a.id === saved)) return saved
    return accounts.find(a => a.contaCorrentePrincipal)?.id
      || accounts.find(a => a.type === 'checking')?.id
      || ''
  })

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
    useReserva: false,
    reservaAccountId: '',
    reservaExpenseCategoryId: '',
    installments: 1,
  })

  const [step, setStep] = useState('form')
  const [resgateInfo, setResgateInfo] = useState(null)
  const [scheduleMatch, setScheduleMatch] = useState(null)
  const [debtCtx, setDebtCtx] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedAccount = accounts.find(a => a.id === form.accountId)
  const isCredit = selectedAccount?.type === 'credit'
  const showGerencial = isCredit && form.type === 'expense'

  const reservaAccounts = useMemo(() => accounts.filter(a => a.isReserva), [accounts])
  const matchingSpecificReserva = useMemo(
    () => form.type === 'expense' && form.categoryId
      ? reservaAccounts.find(a => a.reservaType === 'especifica' && a.reservaCategoryId === form.categoryId)
      : null,
    [form.type, form.categoryId, reservaAccounts]
  )

  const transferToAcc = form.type === 'transfer' ? accounts.find(a => a.id === form.toAccountId) : null
  const transferFromAcc = form.type === 'transfer' ? accounts.find(a => a.id === form.accountId) : null
  const isDepositToReserva = !!transferToAcc?.isReserva
  const isWithdrawFromReserva = !!transferFromAcc?.isReserva
  const reservaTransferAcc = isDepositToReserva ? transferToAcc : isWithdrawFromReserva ? transferFromAcc : null
  const needsReservaCategorySelect = !!reservaTransferAcc && reservaTransferAcc.reservaType === 'geral'
  const reservaLinkedCat = reservaTransferAcc?.reservaType === 'especifica'
    ? categories.find(c => c.id === reservaTransferAcc.reservaCategoryId)
    : null

  // Transferência cujo DESTINO é conta de aplicação financeira (e não é reserva):
  // habilita um campo OPCIONAL de categoria para classificar o aporte nos relatórios.
  const isTransferToAplicacao = !!transferToAcc?.contaAplicacao && !isDepositToReserva && !isWithdrawFromReserva

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  // Options for SearchableSelect fields
  const accountOpts = useMemo(() => buildAccOpts(accounts, accountGroups), [accounts, accountGroups])
  const destAccountOpts = useMemo(() => buildAccOpts(accounts, accountGroups, form.accountId), [accounts, accountGroups, form.accountId])
  const categoryOpts = useMemo(() => buildCatOpts(categories, form.type === 'transfer' ? null : form.type), [categories, form.type])
  const expenseCatOpts = useMemo(() => buildCatOpts(categories, 'expense'), [categories])

  const sortedPayees = useMemo(() => {
    const counts = {}
    for (const tx of transactions) {
      if (tx.payee) counts[tx.payee] = (counts[tx.payee] || 0) + 1
    }
    return [...new Set([...payees])].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  }, [transactions, payees])

  // Parcelas seguintes (X+1..N) da mesma cadeia X/N, no mesmo cartão — para propagação de valor
  const subsequentParcelas = useMemo(() => {
    if (!initial?.id || initial.accountType !== 'credit' || initial.type !== 'expense') return []
    const parse = (desc) => {
      const m = (desc || '').match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/)
      if (!m) return null
      const num = parseInt(m[1], 10), total = parseInt(m[2], 10)
      if (num < 1 || total < 2 || num > total) return null
      return { num, total, base: desc.replace(m[0], '').trim().replace(/\s+/g, ' ').toLowerCase() }
    }
    const baseInst = parse(initial.description)
    if (!baseInst) return []
    return transactions.filter(t => {
      if (t.id === initial.id) return false
      if (t.accountId !== initial.accountId || t.type !== 'expense' || t.accountType !== 'credit') return false
      const pi = parse(t.description)
      return pi && pi.total === baseInst.total && pi.num > baseInst.num && pi.base === baseInst.base
    })
  }, [initial, transactions])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.amount || !form.accountId) return
    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)
    if (form.costCenter && !costCenters.includes(form.costCenter)) addCostCenter(form.costCenter)

    if (form.type === 'transfer' && needsReservaCategorySelect && !form.reservaExpenseCategoryId) return

    const isParcelado = !initial?.id && isCredit && form.type === 'expense' && form.installments > 1
    const installmentAmount = isParcelado
      ? Math.round(Number(form.amount) / form.installments * 100) / 100
      : Number(form.amount)

    // eslint-disable-next-line no-unused-vars
    const { useReserva: _ur, reservaAccountId: _rai, reservaExpenseCategoryId: _reci, installments: _inst, ...formFields } = form
    const txData = {
      ...formFields,
      amount: installmentAmount,
      accountType: selectedAccount?.type,
      grupoGerencial: showGerencial ? form.grupoGerencial : null,
      ...(form.type === 'transfer' && form.reservaExpenseCategoryId ? { reservaExpenseCategoryId: form.reservaExpenseCategoryId } : {}),
    }

    // Categoria só é mantida em transferências quando o destino é conta de aplicação
    // financeira (aporte categorizado). Transferências comuns nunca carregam categoria.
    if (form.type === 'transfer' && !isTransferToAplicacao) {
      txData.categoryId = null
    }

    if (initial?.id) {
      updateTransaction(initial.id, txData)

      // Ajuste de automações gerenciais em edição de despesa de cartão
      const isCardExpense = initial.accountType === 'credit' && initial.type === 'expense'
      if (isCardExpense) {
        const prevGrupoId   = initial.grupoGerencial || null
        const newGrupoId    = txData.grupoGerencial  || null
        const prevGrupo     = gerencialGroups.find(g => g.id === prevGrupoId)
        const newGrupo      = gerencialGroups.find(g => g.id === newGrupoId)
        const wasGerencial1 = prevGrupo?.number === 1
        const isGerencial1  = newGrupo?.number === 1
        const wasNumbered   = typeof prevGrupo?.number === 'number' && prevGrupo.number !== 1
        const isNumbered    = typeof newGrupo?.number === 'number' && newGrupo.number !== 1
        const groupChanged  = prevGrupoId !== newGrupoId
        const amountChanged = Math.abs(Number(form.amount) - initial.amount) > 0.005

        if (groupChanged) {
          // — Desfaz automação do grupo anterior —
          if (wasGerencial1) {
            reverseGerencialCascadeOnly(initial)
          }
          if (wasNumbered && initial.gerencialScheduleId) {
            const oldSch = schedules.find(s => s.id === initial.gerencialScheduleId)
            if (oldSch) {
              const done = (oldSch.registered || []).includes(oldSch.startDate)
                        || (oldSch.skipped   || []).includes(oldSch.startDate)
              if (!done) {
                const newAmt = Math.max(0, Math.round(((oldSch.amount || 0) - initial.amount) * 100) / 100)
                if (newAmt <= 0) deleteSchedule(oldSch.id)
                else updateSchedule(oldSch.id, { amount: newAmt })
              }
            }
            updateTransaction(initial.id, { gerencialScheduleId: null })
          }

          // — Aplica automação do novo grupo —
          if (isGerencial1) {
            const contaId = gerencialContaId
            if (contaId) localStorage.setItem(GERENCIAL_CONTA_KEY, contaId)
            processarLancamentoGerencial(
              { accountId: initial.accountId, amount: Number(form.amount), date: form.date, description: form.description },
              newGrupoId, contaId || null
            )
          }
          if (isNumbered) {
            const res = processarLancamentoGerencial(
              { accountId: initial.accountId, amount: Number(form.amount), date: form.date, description: form.description },
              newGrupoId, null
            )
            if (res.gerencialScheduleId) updateTransaction(initial.id, { gerencialScheduleId: res.gerencialScheduleId })
            if (res.scheduleDate) onToast?.(`Agendamento de resgate criado para ${fmtDate(res.scheduleDate)}.`)
          }

          // — Cascata parcelas 2..N —
          if (wasGerencial1 || wasNumbered || isGerencial1 || isNumbered) {
            ajustarParcelasGrupoGerencial(initial.id, {
              prevGrupoId,
              newGrupoId: (isGerencial1 || isNumbered) ? newGrupoId : null,
              amount: Number(form.amount),
              accountId: initial.accountId,
            })
          }
        } else if (amountChanged) {
          // — Mesmo grupo, valor alterado —
          if (wasGerencial1) {
            reverseGerencialCascadeOnly(initial)
            processarLancamentoGerencial(
              { accountId: initial.accountId, amount: Number(form.amount), date: form.date, description: form.description },
              newGrupoId, gerencialContaId || null
            )
          }
          if (wasNumbered && initial.gerencialScheduleId) {
            const oldSch = schedules.find(s => s.id === initial.gerencialScheduleId)
            if (oldSch) {
              const done = (oldSch.registered || []).includes(oldSch.startDate)
                        || (oldSch.skipped   || []).includes(oldSch.startDate)
              if (!done) {
                const delta  = Number(form.amount) - initial.amount
                const newAmt = Math.max(0, Math.round(((oldSch.amount || 0) + delta) * 100) / 100)
                if (newAmt <= 0) { deleteSchedule(oldSch.id); updateTransaction(initial.id, { gerencialScheduleId: null }) }
                else updateSchedule(oldSch.id, { amount: newAmt })
              }
            }
          }
        }
      }

      // Parcelado: oferecer propagação do novo valor para as parcelas seguintes da cadeia
      const amountChangedNow = Math.abs(Number(form.amount) - initial.amount) > 0.005
      if (amountChangedNow && subsequentParcelas.length > 0) {
        setStep('propagate-parcelas')
        return
      }

      onClose()
      return
    }

    if (form.type === 'transfer' && form.toAccountId && !initial?.id) {
      const toAcc = accounts.find(a => a.id === form.toAccountId)
      const toGroup = (accountGroups || []).find(g => g.id === toAcc?.accountGroupId)
      if (toGroup?.behavior === 'divida' || toGroup?.behavior === 'emprestimo') {
        const ctx = { account: toAcc, group: toGroup, amount: Number(form.amount), date: form.date, sourceAccountId: form.accountId }
        if (toAcc.debtPlan) {
          setDebtCtx(ctx)
          setStep('debt-payment')
          return
        } else {
          addTransaction(txData)
          setDebtCtx(ctx)
          setStep('debt-plan')
          return
        }
      }
    }

    const txId = addTransaction(txData)

    if (form.type === 'expense' && form.useReserva && form.reservaAccountId) {
      const reservaAcc = accounts.find(a => a.id === form.reservaAccountId)
      addTransaction({
        type: 'transfer',
        accountId: form.reservaAccountId,
        toAccountId: form.accountId,
        amount: Number(form.amount),
        date: form.date,
        description: `Resgate ${reservaAcc?.apelido || reservaAcc?.name || 'reserva'}: ${form.description || ''}`.trim().replace(/:$/, ''),
        reservaExpenseCategoryId: form.categoryId || null,
      })
    }

    if (showGerencial && form.grupoGerencial) {
      const g = gerencialGroups.find(g => g.id === form.grupoGerencial)
      const contaId = g?.number === 1 ? gerencialContaId : null
      if (g?.number === 1 && gerencialContaId) {
        localStorage.setItem(GERENCIAL_CONTA_KEY, gerencialContaId)
      }
      const resultado = processarLancamentoGerencial(
        { accountId: form.accountId, amount: installmentAmount, date: form.date, description: form.description },
        form.grupoGerencial,
        contaId,
      )
      if (resultado.gerencialScheduleId) {
        updateTransaction(txId, { gerencialScheduleId: resultado.gerencialScheduleId })
      }
      if (resultado.scheduleDate) {
        onToast?.(`Agendamento de resgate criado para ${fmtDate(resultado.scheduleDate)}.`)
      }
      if (isParcelado) {
        criarParcelasGerencial(txId, {
          accountId: form.accountId,
          amount: installmentAmount,
          date: form.date,
          grupoGerencialId: form.grupoGerencial,
          installments: form.installments,
        })
      }
    }

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

  if (step === 'propagate-parcelas') {
    const novoValor = Number(form.amount)
    const n = subsequentParcelas.length
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center mx-auto">
            <ArrowLeftRight size={22} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-gray-100">Aplicar às demais parcelas?</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Aplicar este valor (<span className="text-white font-semibold">{fmt(novoValor)}</span>) a todas as{' '}
            <span className="text-white font-semibold">{n}</span> parcela{n !== 1 ? 's' : ''} seguinte{n !== 1 ? 's' : ''} desta cadeia?
          </p>
          <p className="text-xs text-gray-600">
            Os reflexos gerenciais (provisões, resgates e pagamentos) serão ajustados automaticamente.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Não, só esta</button>
          <button
            className="btn-primary flex-1"
            onClick={() => { propagarValorParcelas(initial.id, novoValor); onClose() }}
          >
            Sim, aplicar a todas
          </button>
        </div>
      </div>
    )
  }

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
          <SearchableSelect
            options={accountOpts}
            value={form.accountId}
            onChange={id => set('accountId', id)}
            placeholder="Selecione a conta..."
            required
          />
        </div>
        {form.type === 'transfer' ? (
          <div>
            <label className="label">Conta Destino *</label>
            <SearchableSelect
              options={destAccountOpts}
              value={form.toAccountId}
              onChange={id => setForm(f => ({ ...f, toAccountId: id, reservaExpenseCategoryId: '', categoryId: '' }))}
              placeholder="Selecione o destino..."
              required
            />
          </div>
        ) : (
          <div>
            <label className="label">{isCredit && form.type === 'expense' && form.installments > 1 ? 'Total (R$) *' : 'Valor (R$) *'}</label>
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
          {(isDepositToReserva || isWithdrawFromReserva) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
              <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                📂 {isDepositToReserva ? 'Despesa a classificar' : 'Categoria do resgate'}
              </p>
              {needsReservaCategorySelect ? (
                <>
                  <SearchableSelect
                    options={expenseCatOpts}
                    value={form.reservaExpenseCategoryId}
                    onChange={id => set('reservaExpenseCategoryId', id)}
                    placeholder="Sem categoria"
                  />
                  {!form.reservaExpenseCategoryId && (
                    <p className="text-xs text-amber-500">Obrigatório para reserva livre</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-300">
                  {isDepositToReserva ? 'Despesa em:' : 'Categoria:'}{' '}
                  <span className="font-semibold">
                    {reservaLinkedCat ? `${reservaLinkedCat.icon} ${reservaLinkedCat.name}` : '🏦 Reservas Gerais'}
                  </span>
                </p>
              )}
            </div>
          )}
          {isTransferToAplicacao && (
            <div>
              <label className="label">Categoria</label>
              <SearchableSelect
                options={expenseCatOpts}
                value={form.categoryId}
                onChange={id => set('categoryId', id)}
                placeholder="Sem categoria"
              />
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Opcional — preencha apenas se quiser classificar o aporte. Com categoria, o
                lançamento aparece nos relatórios como saída; em branco, é uma transferência
                comum (invisível nos relatórios).
              </p>
            </div>
          )}
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
            <SearchableSelect
              options={categoryOpts}
              value={form.categoryId}
              onChange={id => set('categoryId', id)}
              placeholder="Sem categoria"
            />
          </div>

          <div>
            <label className="label">Favorecido</label>
            <FavorecidoAutocomplete
              value={form.payee}
              onChange={v => set('payee', v)}
              suggestions={sortedPayees}
            />
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

      {form.type === 'expense' && !initial?.id && reservaAccounts.length > 0 && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={form.useReserva}
                onChange={e => {
                  const checked = e.target.checked
                  setForm(f => ({
                    ...f,
                    useReserva: checked,
                    reservaAccountId: checked
                      ? (matchingSpecificReserva?.id || reservaAccounts[0]?.id || '')
                      : '',
                  }))
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-indigo-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <PiggyBank size={14} className="text-indigo-400 shrink-0" />
            <span className="text-sm text-indigo-300 select-none">Pago com reserva?</span>
            {matchingSpecificReserva && !form.useReserva && (
              <span className="text-xs text-indigo-500 ml-1">sugerida: {matchingSpecificReserva.apelido || matchingSpecificReserva.name}</span>
            )}
          </label>
          {form.useReserva && (
            <div className="space-y-2">
              <select
                className="input"
                value={form.reservaAccountId}
                onChange={e => set('reservaAccountId', e.target.value)}
              >
                <option value="">Selecione a reserva...</option>
                {reservaAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.reservaType === 'especifica' && a.reservaCategoryId === form.categoryId ? '★ ' : ''}{a.apelido || a.name}
                  </option>
                ))}
              </select>
              {form.reservaAccountId && (
                <p className="text-xs text-indigo-400 leading-relaxed">
                  Será criada uma transferência automática da reserva para a conta da despesa.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isCredit && form.type === 'expense' && !initial?.id && (
        <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={form.installments > 1}
                onChange={e => set('installments', e.target.checked ? 2 : 1)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-gray-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-gray-300 select-none">Parcelado</span>
          </label>
          {form.installments > 1 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400 shrink-0">Parcelas:</label>
              <input
                className="input w-20 text-center"
                type="number"
                min="2"
                max="48"
                value={form.installments}
                onChange={e => set('installments', Math.max(2, Math.min(48, Number(e.target.value) || 2)))}
              />
              {form.amount && (
                <span className="text-xs text-gray-500">
                  {fmt(Math.round(Number(form.amount) / form.installments * 100) / 100)} por parcela
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {showGerencial && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-3">
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

            if (g.number === 1) {
              const subcontaApelido = selectedAccount?.apelido || selectedAccount?.name?.slice(0, 6) || 'CC'
              const contaDestino = accounts.find(a => a.id === gerencialContaId)
              const txDate = form.date ? new Date(form.date + 'T00:00:00') : new Date()
              const faturaRef = computeFaturaRef(txDate, selectedAccount?.closingDay || 14)
              const [fmm, fyyyy] = faturaRef.split('/')
              const dueDay = String(selectedAccount?.dueDay || 10).padStart(2, '0')
              const scheduleDate = `${fyyyy}-${fmm}-${dueDay}`
              return (
                <div className="space-y-2">
                  <div>
                    <label className="label text-xs uppercase tracking-wide text-purple-400">Conta Destino</label>
                    <select
                      className="input"
                      value={gerencialContaId}
                      onChange={e => {
                        setGerencialContaId(e.target.value)
                        localStorage.setItem(GERENCIAL_CONTA_KEY, e.target.value)
                      }}
                      required
                    >
                      <option value="">Selecione a conta corrente...</option>
                      {checkingAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.contaCorrentePrincipal ? ' ★' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {contaDestino ? (
                    <div className="space-y-1">
                      <p className="text-xs text-purple-300 leading-relaxed">
                        Transferência automática será criada para a subconta{' '}
                        <strong className="text-purple-200">"Ger. {subcontaApelido}"</strong>{' '}
                        a partir de <strong className="text-purple-200">{contaDestino.name}</strong>.
                      </p>
                      <p className="text-xs text-purple-400">
                        📅 Fatura {faturaRef} · Agendamento de devolução em {fmtDate(scheduleDate)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-400">
                      Selecione a conta corrente de origem da transferência.
                    </p>
                  )}
                </div>
              )
            }

            const acc = accounts.find(a => a.id === g.defaultAccountId)
            const txDate3 = form.date ? new Date(form.date + 'T00:00:00') : new Date()
            const faturaRef3 = computeFaturaRef(txDate3, selectedAccount?.closingDay || 14)
            const [fmm3, fyyyy3] = faturaRef3.split('/')
            const dueDate3 = `${fyyyy3}-${fmm3}-${String(selectedAccount?.dueDay || 10).padStart(2, '0')}`
            return acc ? (
              <div className="space-y-1">
                <p className="text-xs text-blue-300 leading-relaxed">
                  Agendamento de resgate automático:{' '}
                  <strong className="text-blue-200">{acc.apelido || acc.name}</strong> → conta corrente principal.
                </p>
                <p className="text-xs text-blue-400">
                  📅 Fatura {faturaRef3} · Resgate em {fmtDate(dueDate3)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-400">
                Configure uma conta padrão neste grupo para ativar o resgate automático.
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
