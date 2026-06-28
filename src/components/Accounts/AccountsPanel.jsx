import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Star, Trash2, Edit2, CreditCard, Landmark, PiggyBank,
  DollarSign, ArrowUp, ArrowDown, Settings, Building2,
  ChevronDown, ChevronRight, RefreshCw, EyeOff, Eye,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, accountsForView, creditBillKey, creditBillStatus } from '../shared/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import AccountForm from './AccountForm'
import ExtratoContaPanel from './ExtratoContaPanel'
import TransactionForm from '../Transactions/TransactionForm'

const ACCOUNT_ICONS = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
  cash: DollarSign,
  asset: Building2,
  liability: Landmark,
}

const ACCOUNT_LABELS = {
  checking: 'Conta Corrente',
  savings: 'Poupança',
  credit: 'Cartão de Crédito',
  cash: 'Dinheiro',
  asset: 'Bem / Ativo',
  liability: 'Dívida / Passivo',
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TYPE_COLORS = {
  checking: 'from-blue-600 to-blue-800',
  savings: 'from-emerald-600 to-emerald-800',
  credit: 'from-purple-600 to-purple-800',
  cash: 'from-amber-600 to-amber-800',
  asset: 'from-teal-600 to-teal-800',
  liability: 'from-rose-700 to-rose-900',
}

// Dias (>= 0) até o próximo vencimento do cartão (dueDay). Se o dueDay já passou
// no mês atual, conta para o mês seguinte. Hoje == dueDay → 0.
function daysUntilDue(dueDay) {
  const d = dueDay || 1
  const now = new Date()
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let due = new Date(now.getFullYear(), now.getMonth(), d)
  if (due < t0) due = new Date(now.getFullYear(), now.getMonth() + 1, d)
  return Math.round((due - t0) / 86400000)
}

function UpdateValueModal({ account, onClose }) {
  const { updateAccountValue } = useApp()
  const [newValue, setNewValue] = useState(String(account.balance ?? ''))
  const [note, setNote] = useState('')

  const lastEntry = (account.valueHistory || []).slice(-1)[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newValue === '') return
    updateAccountValue(account.id, Number(newValue), note)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {lastEntry && (
        <div className="p-3 bg-gray-800 rounded-lg text-xs text-gray-400">
          Último valor: <span className="text-gray-200 font-medium">{fmt(lastEntry.value)}</span> em {lastEntry.date}
          {lastEntry.note && <span className="ml-1 italic">— {lastEntry.note}</span>}
        </div>
      )}
      <div>
        <label className="label">Novo Valor (R$) *</label>
        <input
          className="input"
          type="number"
          step="0.01"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="0,00"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label">Observação</label>
        <input
          className="input"
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ex: Avaliação de mercado, atualização FIPE..."
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">Atualizar Valor</button>
      </div>
    </form>
  )
}

function GroupManager({ groups }) {
  const { addAccountGroup, updateAccountGroup, deleteAccountGroup, moveAccountGroup } = useApp()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('financeiro')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const sorted = [...groups].sort((a, b) => a.order - b.order)
  const active = sorted.filter(g => !g.inibido)
  const inibidos = sorted.filter(g => g.inibido)

  const handleAdd = () => {
    if (!newName.trim()) return
    addAccountGroup({ name: newName.trim(), type: newType })
    setNewName('')
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {active.map((g, i) => (
          <div key={g.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800">
            {editId === g.id ? (
              <>
                <input
                  className="input flex-1 py-1.5 text-sm"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { updateAccountGroup(g.id, { name: editName }); setEditId(null) }
                    if (e.key === 'Escape') setEditId(null)
                  }}
                  autoFocus
                />
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => { updateAccountGroup(g.id, { name: editName }); setEditId(null) }}>Salvar</button>
                <button className="btn-secondary text-xs py-1.5 px-2" onClick={() => setEditId(null)}>✕</button>
              </>
            ) : (
              <>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${g.type === 'financeiro' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {g.type === 'financeiro' ? 'Fin.' : 'Pat.'}
                </span>
                <span className="flex-1 text-sm text-gray-200">{g.name}</span>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveAccountGroup(g.id, 'up')} disabled={i === 0} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 transition-colors">
                    <ArrowUp size={12} />
                  </button>
                  <button onClick={() => moveAccountGroup(g.id, 'down')} disabled={i === active.length - 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 transition-colors">
                    <ArrowDown size={12} />
                  </button>
                  <button onClick={() => { setEditId(g.id); setEditName(g.name) }} className="p-1 rounded hover:bg-gray-700 text-gray-400 transition-colors">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(g.id)} className="p-1 rounded hover:bg-gray-700 text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {inibidos.length > 0 && (
          <div className="pt-2 space-y-1">
            <p className="text-xs text-gray-600 px-1">Grupos inibidos ({inibidos.length})</p>
            {inibidos.map(g => (
              <div key={g.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800/50 opacity-50">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${g.type === 'financeiro' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {g.type === 'financeiro' ? 'Fin.' : 'Pat.'}
                </span>
                <span className="flex-1 text-sm text-gray-400 line-through">{g.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-500 shrink-0">Inibido</span>
                <EyeOff size={11} className="text-gray-600 shrink-0" />
              </div>
            ))}
          </div>
        )}
        {sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Nenhum grupo cadastrado</p>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-700">
        <select className="input w-36 text-sm" value={newType} onChange={e => setNewType(e.target.value)}>
          <option value="financeiro">Financeiro</option>
          <option value="patrimonial">Patrimonial</option>
        </select>
        <input
          className="input flex-1 text-sm"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nome do novo grupo..."
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn-primary px-3" onClick={handleAdd}>
          <Plus size={14} />
        </button>
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => { deleteAccountGroup(confirmDeleteId); setConfirmDeleteId(null) }}
          title="Excluir Grupo"
          message="As contas deste grupo ficarão sem grupo atribuído. Continuar?"
          danger
        />
      )}
    </div>
  )
}

const rb = v => Math.round(v * 100) / 100

function AccountCard({ account, siblings, onEdit, onDelete, onExtrato, onUpdateValue, isNextDue = false, nextDueDays = null }) {
  const { setMainAccount, moveAccount, recalcularSaldo, updateAccount, transactions, schedules, getNextOccurrences, getFinancialPeriod, getAccountSaldos } = useApp()
  const Icon = ACCOUNT_ICONS[account.type] || Landmark
  const isCredit = account.type === 'credit'
  const highlightCard = isCredit && isNextDue

  // Fatura do MÊS ATUAL e PRÓXIMA fatura, calculadas AO VIVO a partir dos lançamentos
  // (não do campo account.creditMonthBill, que pode estar defasado e refletir a dívida
  // total). billTotal = despesas − estornos da fatura; status (Paga/Parcial/Não paga)
  // pela mesma regra do KPI "Valor Pago" do Cartão de Crédito.
  const creditInfo = useMemo(() => {
    if (!isCredit) return null
    const n = new Date()
    const todayLocal = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    const currentKey = creditBillKey(todayLocal, account)
    const current = creditBillStatus(account, transactions, schedules, currentKey)
    // Próxima fatura = mês seguinte ao da fatura atual (trata virada de ano).
    const [cy, cm] = currentKey.split('-').map(Number)
    const nd = new Date(cy, cm, 1) // cm é 1-indexed → este Date já é o mês seguinte
    const nextKey = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`
    const next = creditBillStatus(account, transactions, schedules, nextKey)
    return { current, nextTotal: next.billTotal, nextLabel: MONTH_NAMES[nd.getMonth()] }
  }, [isCredit, account, transactions, schedules])

  // Badge de status só quando há fatura no mês atual (billTotal > 0).
  const faturaStatus = creditInfo && creditInfo.current.billTotal > 0.005 ? creditInfo.current : null
  const statusBadge = faturaStatus
    ? (faturaStatus.isFaturaPaga
        ? { label: 'Paga ✓', cls: 'bg-blue-600/40 text-blue-50' }
        : faturaStatus.isFaturaParcial
          ? { label: 'Parcialmente paga', cls: 'bg-orange-400/30 text-orange-50' }
          : { label: 'Não paga', cls: 'bg-sky-400/25 text-sky-50' })
    : null
  const gradient = TYPE_COLORS[account.type] || 'from-gray-600 to-gray-800'
  const idx = siblings.findIndex(a => a.id === account.id)
  const isAsset = account.type === 'asset'
  const isInactive = account.active === false
  const [confirmInactivate, setConfirmInactivate] = useState(false)

  // Contas principais (isMain, não-cartão/ativo/passivo): exibem os 5 saldos do ciclo.
  const isMainChecking = account.isMain && !['credit', 'asset', 'liability'].includes(account.type)
  const saldos = useMemo(
    () => isMainChecking ? getAccountSaldos(account) : null,
    [isMainChecking, account, getAccountSaldos]
  )
  // Linhas de saldo a exibir: oculta cada saldo igual ao anterior mostrado; oculta
  // os saldos de calendário no modo 'calendar'.
  const saldoRows = useMemo(() => {
    if (!saldos?.applicable) return null
    const rows = []
    let last = saldos.saldoAtual
    rows.push({ key: 'atual', label: 'Saldo Atual', val: saldos.saldoAtual, primary: true })
    const push = (key, label, val, cls) => {
      if (val == null) return
      if (Math.abs(val - last) < 0.005) return
      rows.push({ key, label, val, cls }); last = val
    }
    push('finalCiclo', 'Final Ciclo', saldos.saldoFinalCiclo, 'text-purple-300/70')
    push('projetado', 'Projetado', saldos.saldoProjetado, 'text-sky-300/70')
    if (saldos.mode === 'custom') {
      push('atualCal', 'Atual Calendário', saldos.saldoAtualCalendario, 'text-amber-300/70')
      push('finalCal', 'Final Calendário', saldos.saldoFinalCalendario, 'text-amber-200/60')
    }
    return rows
  }, [saldos])

  const { projetado, finalBal } = useMemo(() => {
    if (['credit', 'asset', 'liability'].includes(account.type)) return { projetado: null, finalBal: null }
    const period = getFinancialPeriod()
    const endStr = period.end.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    const principal = account.balance || 0

    let scheduleDelta = 0
    for (const s of schedules) {
      const fromAcc = s.accountId === account.id
      const toAcc = s.toAccountId === account.id
      if (!fromAcc && !toAcc) continue
      const nexts = getNextOccurrences(s, 35).filter(d => d > todayStr && d <= endStr)
      for (const _d of nexts) {
        if (s.transactionType === 'income' && fromAcc) scheduleDelta += s.amount
        else if (s.transactionType === 'expense' && fromAcc) scheduleDelta -= s.amount
        else if (s.transactionType === 'transfer') {
          if (fromAcc && !toAcc) scheduleDelta -= s.amount
          else if (!fromAcc && toAcc) scheduleDelta += s.amount
        }
      }
    }

    let futureDelta = 0
    for (const tx of transactions) {
      if (tx.date <= todayStr || tx.date > endStr) continue
      if (tx.accountId !== account.id && tx.toAccountId !== account.id) continue
      if (tx.type === 'income' && tx.accountId === account.id) futureDelta += tx.amount
      else if (tx.type === 'expense' && tx.accountId === account.id) futureDelta -= tx.amount
      else if (tx.type === 'transfer' || tx.type === 'credit_payment') {
        if (tx.toAccountId === account.id) futureDelta += tx.amount
        else if (tx.accountId === account.id) futureDelta -= tx.amount
      }
    }

    return {
      projetado: rb(principal + scheduleDelta),
      finalBal: rb(principal + scheduleDelta + futureDelta),
    }
  }, [account.id, account.type, account.balance, schedules, transactions, getNextOccurrences, getFinancialPeriod])

  // "Saldo com Futuros": Saldo Atual (account.balance, lançamentos date <= hoje) + TODOS os
  // lançamentos com data FUTURA (date > hoje) que tocam a conta — sem limite de ciclo. Espelha o
  // mesmo critério/efeito de recalcularSaldo (income/expense/transfer/credit_payment + data local).
  // Só para contas correntes/poupança (não cartão/ativo/passivo). Retorna null quando não há
  // futuros (a linha extra não aparece). Display-only: NÃO altera account.balance nem o contexto.
  const saldoComFuturos = useMemo(() => {
    if (['credit', 'asset', 'liability'].includes(account.type)) return null
    const n = new Date()
    const todayStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
    let futureDelta = 0
    for (const tx of transactions) {
      if (!tx.date || tx.date <= todayStr) continue // só lançamentos futuros (date > hoje)
      if (tx.accountId !== account.id && tx.toAccountId !== account.id) continue
      if (tx.type === 'income' && tx.accountId === account.id) futureDelta += tx.amount
      else if (tx.type === 'expense' && tx.accountId === account.id && tx.accountType !== 'credit') futureDelta -= tx.amount
      else if (tx.type === 'transfer') {
        if (tx.accountId === account.id) futureDelta -= tx.amount
        else if (tx.toAccountId === account.id) futureDelta += tx.amount
      } else if (tx.type === 'credit_payment' && tx.fromAccountId === account.id) futureDelta -= tx.amount
    }
    if (Math.abs(futureDelta) < 0.005) return null
    return rb((account.balance || 0) + futureDelta)
  }, [account.id, account.type, account.balance, transactions])

  return (
    <>
    <div
      className={`relative rounded-xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg cursor-pointer ${isInactive ? 'opacity-50' : ''}`}
      style={highlightCard ? { border: '2px solid #185FA5' } : undefined}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', account.id)
      }}
      onClick={() => onExtrato(account)}
    >
      {highlightCard && (
        <span
          className="absolute text-[10px] font-semibold text-white px-2 py-0.5 rounded-full shadow whitespace-nowrap"
          style={{ top: '-11px', left: '14px', backgroundColor: '#185FA5' }}
        >
          Próxima fatura · {nextDueDays === 0 ? 'hoje' : `${nextDueDays} dia${nextDueDays !== 1 ? 's' : ''}`}
        </span>
      )}
      {account.isMain && (
        <span className="absolute top-3 right-10 text-yellow-300"><Star size={13} fill="currentColor" /></span>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={13} className="opacity-80 shrink-0" />
            <span className="text-xs opacity-70">{ACCOUNT_LABELS[account.type] || account.type}</span>
          </div>
          <h3 className="font-semibold text-sm truncate">{account.name}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {account.apelido && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/60">{account.apelido}</span>
            )}
            {account.fluxoCaixaPrincipal && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500/30 text-blue-200">FC</span>
            )}
            {account.isInvestimento && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-purple-500/30 text-purple-200">INV</span>
            )}
            {account.contaCorrentePrincipal && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-500/30 text-emerald-200">CC</span>
            )}
            {isInactive && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-gray-500/40 text-gray-200">Inativa</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0 ml-2">
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); onEdit(account) }} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Editar conta">
              <Edit2 size={11} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (isInactive) updateAccount(account.id, { active: true })
                else setConfirmInactivate(true)
              }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title={isInactive ? 'Reativar conta' : 'Inativar conta'}
            >
              {isInactive ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(account) }} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Excluir conta">
              <Trash2 size={11} />
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); moveAccount(account.id, 'up') }} disabled={idx === 0} className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors">
              <ArrowUp size={10} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); moveAccount(account.id, 'down') }} disabled={idx === siblings.length - 1} className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors">
              <ArrowDown size={10} />
            </button>
          </div>
        </div>
      </div>

      {account.type === 'credit' ? (
        highlightCard ? (
          /* ── Cartão destacado: fatura do mês atual + status + próxima fatura ── */
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-bold" style={{ fontSize: '22px', lineHeight: 1.1 }}>{fmt(creditInfo?.current.billTotal || 0)}</p>
              {statusBadge
                ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                : <span className="text-xs opacity-75">a pagar</span>}
            </div>
            {creditInfo && creditInfo.nextTotal > 0.005 && (
              <p className="text-xs opacity-75 mt-0.5">{creditInfo.nextLabel}: {fmt(creditInfo.nextTotal)} em aberto</p>
            )}
            <p className="text-xs opacity-70 mt-0.5">Dívida total: {fmt(account.creditDebt || 0)}</p>
            <div className="flex gap-3 text-xs opacity-60 mt-1">
              <span>Fecha dia {account.closingDay}</span>
              <span>Vence dia {account.dueDay}</span>
            </div>
            {account.creditLimit > 0 && (
              <p className="text-xs opacity-50 mt-1">Limite: {fmt(account.creditLimit)}</p>
            )}
          </div>
        ) : (
          /* ── Demais cartões: fatura do mês atual + status + próxima fatura ── */
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-lg font-bold">{fmt(creditInfo?.current.billTotal || 0)}</p>
              {statusBadge
                ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                : <span className="text-xs opacity-60">fatura</span>}
            </div>
            {creditInfo && creditInfo.nextTotal > 0.005 && (
              <p className="text-xs opacity-60 mt-0.5">{creditInfo.nextLabel}: {fmt(creditInfo.nextTotal)} em aberto</p>
            )}
            <p className="text-xs opacity-60 mt-0.5">Dívida total: {fmt(account.creditDebt || 0)}</p>
            <div className="flex gap-3 text-xs opacity-60 mt-1">
              <span>Fecha dia {account.closingDay}</span>
              <span>Vence dia {account.dueDay}</span>
            </div>
            {account.creditLimit > 0 && (
              <div className="mt-2">
                <div className="h-1 bg-white/20 rounded-full">
                  <div
                    className="h-1 bg-white rounded-full"
                    style={{ width: `${Math.min(100, ((account.creditDebt || 0) / account.creditLimit) * 100)}%` }}
                  />
                </div>
                <p className="text-xs opacity-50 mt-0.5">Limite: {fmt(account.creditLimit)}</p>
              </div>
            )}
          </div>
        )
      ) : (
        <div>
          {isMainChecking && saldoRows ? (
            <>
              <p className="text-xs opacity-70 mb-0.5">Saldo Atual</p>
              <p className="text-xl font-bold">{fmt(saldoRows[0].val)}</p>
              {saldoRows.slice(1).map(r => (
                <p key={r.key} className={`text-xs mt-0.5 ${r.cls}`}>{r.label}: {fmt(r.val)}</p>
              ))}
            </>
          ) : (
            <>
              <p className="text-xs opacity-70 mb-0.5">{account.type === 'liability' ? 'Saldo Devedor' : 'Saldo Principal'}</p>
              <p className="text-xl font-bold">{fmt(account.balance || 0)}</p>
              {saldoComFuturos != null && (
                <p className="text-xs text-sky-300/70 mt-0.5">Com futuros: {fmt(saldoComFuturos)}</p>
              )}
              {projetado != null && Math.abs(projetado - (account.balance || 0)) >= 0.005 && (
                <p className="text-xs text-sky-300/70 mt-0.5">Projetado: {fmt(projetado)}</p>
              )}
              {finalBal != null && Math.abs(finalBal - (projetado ?? (account.balance || 0))) >= 0.005 && (
                <p className="text-xs text-purple-300/60 mt-0.5">Final: {fmt(finalBal)}</p>
              )}
            </>
          )}
          {account.acquisitionValue != null && (
            <p className="text-xs opacity-50 mt-0.5">
              Aquisição: {fmt(account.acquisitionValue)}
              {account.balance && account.acquisitionValue
                ? ` (${account.balance >= account.acquisitionValue ? '+' : ''}${fmt(account.balance - account.acquisitionValue)})`
                : ''}
            </p>
          )}
          {isAsset && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateValue(account) }}
              className="mt-1.5 text-xs flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
            >
              <RefreshCw size={10} /> Atualizar Valor
            </button>
          )}
          {!isAsset && account.type !== 'liability' && (
            <button
              onClick={(e) => { e.stopPropagation(); recalcularSaldo(account.id) }}
              className="mt-1.5 text-xs flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
            >
              <RefreshCw size={10} /> Recalcular
            </button>
          )}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setMainAccount(account.id) }}
        className={`mt-2.5 text-xs flex items-center gap-1 transition-opacity ${account.isMain ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
      >
        <Star size={10} fill={account.isMain ? 'currentColor' : 'none'} />
        {account.isMain ? 'Conta principal' : 'Definir como principal'}
      </button>
    </div>

    <ConfirmDialog
      open={confirmInactivate}
      onClose={() => setConfirmInactivate(false)}
      onConfirm={() => { updateAccount(account.id, { active: false }); setConfirmInactivate(false) }}
      title="Inativar Conta"
      message="Deseja inativar esta conta? Ela não aparecerá nos formulários de lançamento."
      confirmLabel="Inativar"
    />
    </>
  )
}

function calcGroupBalance(accounts) {
  return accounts.reduce((sum, a) =>
    a.type === 'credit' ? sum - (a.creditDebt || 0) : sum + (a.balance || 0), 0)
}

function balColor(amount) {
  if (amount > 0.005) return 'text-receita'
  if (amount < -0.005) return 'text-despesa'
  return 'text-gray-300'
}

function GroupSection({ group, accounts, onEdit, onDelete, onExtrato, onUpdateValue, onDropAccount, isDragOver, onDragOverGroup, onDragLeaveGroup, nextDueCardId, nextDueDays }) {
  const [collapsed, setCollapsed] = useState(false)
  const total = calcGroupBalance(accounts)
  const typeBadge = group.type === 'financeiro'
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">Financeiro</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Patrimonial</span>

  return (
    <div
      className={`space-y-3 rounded-xl transition-colors ${isDragOver ? 'ring-2 ring-emerald-500/50 bg-emerald-500/5' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOverGroup?.() }}
      onDragLeave={e => { if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) onDragLeaveGroup?.() }}
      onDrop={e => { e.preventDefault(); onDropAccount?.(e.dataTransfer.getData('text/plain')) }}
    >
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2.5 w-full text-left rounded-xl bg-white/5 border border-white/10 py-3 px-4 hover:bg-white/8 transition-colors"
      >
        {collapsed
          ? <ChevronRight size={14} className="text-gray-400 shrink-0" />
          : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
        <span className="font-semibold text-sm text-gray-100">{group.name}</span>
        {typeBadge}
        <span className="text-xs text-gray-600 ml-2">{accounts.length} conta{accounts.length !== 1 ? 's' : ''}</span>
        <span className={`font-bold text-base ml-auto ${balColor(total)}`}>{fmt(total)}</span>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-2 border-l border-gray-800">
          {accounts.map(a => (
            <AccountCard
              key={a.id}
              account={a}
              siblings={accounts}
              onEdit={onEdit}
              onDelete={onDelete}
              onExtrato={onExtrato}
              onUpdateValue={onUpdateValue}
              isNextDue={a.id === nextDueCardId}
              nextDueDays={nextDueDays}
            />
          ))}
          {accounts.length === 0 && (
            <p className="text-gray-600 text-sm py-2 col-span-3">Nenhuma conta neste grupo</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function AccountsPanel() {
  const { profileAccounts: accounts, accountGroups = [], activeAccountGroups = [], deleteAccount, updateAccount, deleteTransaction } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [extratoAccount, setExtratoAccount] = useState(null)
  const [showGroupManager, setShowGroupManager] = useState(false)
  const [updateValueAccount, setUpdateValueAccount] = useState(null)
  const [showTxForm, setShowTxForm] = useState(false)
  const [editTxInitial, setEditTxInitial] = useState(null)
  const isMobile = useIsMobile()

  const totalAssets = accounts
    .filter(a => a.type !== 'credit' && a.type !== 'liability')
    .reduce((sum, a) => sum + (a.balance || 0), 0)
  const totalCredit = accounts
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + (a.creditDebt || 0), 0)

  // Cartão de crédito com vencimento mais próximo (menor nº de dias até o dueDay);
  // empate → maior fatura atual (creditMonthBill). Destacado entre os cards de cartão.
  const { nextDueCardId, nextDueDays } = useMemo(() => {
    let best = null
    for (const c of accounts) {
      if (c.type !== 'credit' || c.active === false) continue
      const days = daysUntilDue(c.dueDay)
      const bill = c.creditMonthBill || 0
      if (!best || days < best.days || (days === best.days && bill > best.bill)) {
        best = { id: c.id, days, bill }
      }
    }
    return { nextDueCardId: best?.id ?? null, nextDueDays: best?.days ?? null }
  }, [accounts])

  const sortedGroups = [...activeAccountGroups].sort((a, b) => a.order - b.order)
  const financialGroups = sortedGroups.filter(g => g.type === 'financeiro')
  const patrimonialGroups = sortedGroups.filter(g => g.type === 'patrimonial')

  // No mobile, contas marcadas como "Ocultar no Mobile" somem da grade (saldos/totais acima ficam intactos).
  const visibleAccounts = accountsForView(accounts, isMobile)
  const getGroupAccounts = (groupId) =>
    visibleAccounts.filter(a => a.accountGroupId === groupId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const ungrouped = visibleAccounts.filter(a => !a.accountGroupId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const handleEdit = (account) => { setEditAccount(account); setShowForm(true) }
  const handleDelete = (account) => setConfirmDelete(account)
  const handleExtrato = (account) => setExtratoAccount(account)
  const handleUpdateValue = (account) => setUpdateValueAccount(account)

  const closeTxForm = () => { setShowTxForm(false); setEditTxInitial(null) }

  const [dragOverGroup, setDragOverGroup] = useState(null)
  const handleDropAccount = (targetGroupId, accountId) => {
    if (!accountId) return
    updateAccount(accountId, { accountGroupId: targetGroupId || null })
    setDragOverGroup(null)
  }
  useEffect(() => {
    const reset = () => setDragOverGroup(null)
    document.addEventListener('dragend', reset)
    return () => document.removeEventListener('dragend', reset)
  }, [])

  // Inline extrato mode — replace the whole panel
  if (extratoAccount) {
    const liveAccount = accounts.find(a => a.id === extratoAccount.id) || extratoAccount
    return (
      <>
        <ExtratoContaPanel
          account={liveAccount}
          onClose={() => setExtratoAccount(null)}
          backButton
          onEdit={(tx) => { setEditTxInitial(tx); setShowTxForm(true) }}
          onNewTx={() => { setEditTxInitial(null); setShowTxForm(true) }}
          onDelete={deleteTransaction}
        />
        <Modal
          open={showTxForm}
          onClose={closeTxForm}
          title={editTxInitial?.id ? 'Editar Lançamento' : 'Novo Lançamento'}
        >
          <TransactionForm
            initial={editTxInitial || { type: 'expense', accountId: liveAccount.id }}
            onClose={closeTxForm}
          />
        </Modal>
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total em Contas</p>
          <p className="text-2xl font-bold text-receita mt-1">{fmt(totalAssets)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Dívida Cartão</p>
          <p className="text-2xl font-bold text-despesa mt-1">{fmt(totalCredit)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Patrimônio Líquido</p>
          <p className={`text-2xl font-bold mt-1 ${totalAssets - totalCredit >= 0 ? 'text-receita' : 'text-despesa'}`}>
            {fmt(totalAssets - totalCredit)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Contas ({accounts.length})</h2>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setShowGroupManager(true)}>
            <Settings size={13} /> Grupos
          </button>
          <button className="btn-primary flex items-center gap-1.5" onClick={() => { setEditAccount(null); setShowForm(true) }}>
            <Plus size={14} /> Nova Conta
          </button>
        </div>
      </div>

      {accounts.length === 0 && sortedGroups.length === 0 ? (
        <div className="card text-center py-12">
          <Landmark size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma conta cadastrada</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Adicionar primeira conta</button>
        </div>
      ) : (
        <div className="space-y-8">
          {financialGroups.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-800 pb-1.5">Financeiro</p>
              <div className="space-y-5">
                {financialGroups.map(g => (
                  <GroupSection
                    key={g.id}
                    group={g}
                    accounts={getGroupAccounts(g.id)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onExtrato={handleExtrato}
                    onUpdateValue={handleUpdateValue}
                    onDropAccount={id => handleDropAccount(g.id, id)}
                    isDragOver={dragOverGroup === g.id}
                    onDragOverGroup={() => setDragOverGroup(g.id)}
                    onDragLeaveGroup={() => setDragOverGroup(null)}
                    nextDueCardId={nextDueCardId}
                    nextDueDays={nextDueDays}
                  />
                ))}
              </div>
            </div>
          )}

          {patrimonialGroups.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-800 pb-1.5">Patrimonial</p>
              <div className="space-y-5">
                {patrimonialGroups.map(g => (
                  <GroupSection
                    key={g.id}
                    group={g}
                    accounts={getGroupAccounts(g.id)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onExtrato={handleExtrato}
                    onUpdateValue={handleUpdateValue}
                    onDropAccount={id => handleDropAccount(g.id, id)}
                    isDragOver={dragOverGroup === g.id}
                    onDragOverGroup={() => setDragOverGroup(g.id)}
                    onDragLeaveGroup={() => setDragOverGroup(null)}
                    nextDueCardId={nextDueCardId}
                    nextDueDays={nextDueDays}
                  />
                ))}
              </div>
            </div>
          )}

          {(ungrouped.length > 0 || sortedGroups.length > 0) && (
            <div
              className={`space-y-3 rounded-xl transition-colors ${dragOverGroup === 'ungrouped' ? 'ring-2 ring-gray-500/50 bg-gray-500/5' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOverGroup('ungrouped') }}
              onDragLeave={e => { if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) setDragOverGroup(null) }}
              onDrop={e => { e.preventDefault(); handleDropAccount(null, e.dataTransfer.getData('text/plain')) }}
            >
              <div className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 py-3 px-4">
                <span className="font-semibold text-sm text-gray-100">Sem Grupo</span>
                <span className="text-xs text-gray-600 ml-2">{ungrouped.length} conta{ungrouped.length !== 1 ? 's' : ''}</span>
                {ungrouped.length > 0 && <span className={`font-bold text-base ml-auto ${balColor(calcGroupBalance(ungrouped))}`}>{fmt(calcGroupBalance(ungrouped))}</span>}
              </div>
              {ungrouped.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ungrouped.map(a => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      siblings={ungrouped}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onExtrato={handleExtrato}
                      onUpdateValue={handleUpdateValue}
                      isNextDue={a.id === nextDueCardId}
                      nextDueDays={nextDueDays}
                    />
                  ))}
                </div>
              ) : dragOverGroup === 'ungrouped' ? (
                <div className="h-16 border-2 border-dashed border-gray-600 rounded-xl flex items-center justify-center">
                  <p className="text-xs text-gray-500">Soltar aqui para remover do grupo</p>
                </div>
              ) : null}
            </div>
          )}

          {accounts.length === 0 && (
            <div className="card text-center py-8">
              <Landmark size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma conta cadastrada</p>
              <button className="btn-primary mt-3" onClick={() => { setEditAccount(null); setShowForm(true) }}>Adicionar primeira conta</button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditAccount(null) }}
        title={editAccount ? 'Editar Conta' : 'Nova Conta'}
      >
        <AccountForm
          initial={editAccount}
          onClose={() => { setShowForm(false); setEditAccount(null) }}
        />
      </Modal>

      <Modal
        open={showGroupManager}
        onClose={() => setShowGroupManager(false)}
        title="Gerenciar Grupos de Contas"
      >
        <GroupManager groups={accountGroups} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteAccount(confirmDelete.id); setConfirmDelete(null) }}
        title="Excluir Conta"
        message={`Tem certeza que deseja excluir a conta "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        danger
      />

      <Modal
        open={!!updateValueAccount}
        onClose={() => setUpdateValueAccount(null)}
        title={`Atualizar Valor — ${updateValueAccount?.name || ''}`}
        size="sm"
      >
        {updateValueAccount && (
          <UpdateValueModal account={updateValueAccount} onClose={() => setUpdateValueAccount(null)} />
        )}
      </Modal>
    </div>
  )
}
