import { useState, useMemo } from 'react'
import {
  Plus, ArrowLeft, CreditCard, Wallet,
  ChevronRight, Edit2, Trash2, ArrowUpCircle, Undo2,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, groupedAccountOptions, accountPriority } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TransactionForm from './TransactionForm'
import ExtratoContaPanel from '../Accounts/ExtratoContaPanel'

// ─── Credit fatura helpers ──────────────────────────────────────────────────

function getBillKey(date, card) {
  if (!date || !card) return ''
  const closingDay = card.closingDay || 1
  const d = new Date(date + 'T00:00:00')
  const day = d.getDate()
  let month, year
  if (day < closingDay) {
    month = d.getMonth() === 0 ? 12 : d.getMonth()
    year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  } else {
    month = d.getMonth() + 1
    year = d.getFullYear()
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

function getBillLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return `${m}/${y}`
}

// ─── Account picker (step 1 of new-tx modal) ───────────────────────────────

function AccountPickerButton({ a, onSelect }) {
  return (
    <button
      onClick={() => onSelect(a)}
      className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors text-left group mb-1"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-700 group-hover:bg-gray-600 flex items-center justify-center transition-colors shrink-0">
          {a.type === 'credit'
            ? <CreditCard size={14} className="text-purple-400" />
            : <Wallet size={14} className="text-emerald-400" />}
        </div>
        <div>
          <p className="text-sm text-gray-200 font-medium">{a.apelido || a.name}</p>
          <p className="text-xs text-gray-500">{a.type === 'credit' ? 'Cartão de Crédito' : 'Conta Bancária'}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold shrink-0 ml-2 ${a.type === 'credit' ? 'text-purple-400' : (a.balance || 0) >= 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
        {a.type === 'credit' ? fmt(a.creditDebt || 0) : fmt(a.balance || 0)}
      </span>
    </button>
  )
}

function AccountPicker({ accounts, accountGroups, onSelect }) {
  const [showAll, setShowAll] = useState(false)
  const top = accounts.filter(a => accountPriority(a) === 0)
  const mid = accounts.filter(a => accountPriority(a) === 1)
  const rest = accounts.filter(a => accountPriority(a) === 2)
  const visible = showAll ? [...top, ...mid, ...rest] : [...top, ...mid]

  return (
    <div className="space-y-1">
      <p className="text-sm text-gray-400 mb-3">Selecione a conta para o lançamento:</p>
      {visible.map(a => <AccountPickerButton key={a.id} a={a} onSelect={onSelect} />)}
      {!showAll && rest.length > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-xs text-gray-500 hover:text-gray-300 py-2 border border-dashed border-gray-700 hover:border-gray-600 rounded-xl transition-colors"
        >
          Ver todas — {rest.length} conta{rest.length !== 1 ? 's' : ''} oculta{rest.length !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

// ─── Fatura detail view ─────────────────────────────────────────────────────

function FaturaView({ card, billKey, onBack, onNewTx }) {
  const { transactions, categories, deleteTransaction, reverseTransaction } = useApp()
  const [editTx, setEditTx] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmEstorno, setConfirmEstorno] = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const handleReverse = (tx) => {
    reverseTransaction(tx.id)
    setConfirmEstorno(null)
    const msg = tx.scheduleId
      ? `Lançamento estornado. Agendamento restaurado para ${fmtDate(tx.date)}.`
      : 'Lançamento estornado.'
    showToast(msg)
  }

  const label = getBillLabel(billKey)
  const txs = useMemo(() =>
    transactions
      .filter(tx => tx.accountId === card.id && tx.type === 'expense' && getBillKey(tx.date, card) === billKey)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, card, billKey]
  )
  const total = txs.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={14} /> Lançamentos
        </button>
        <ChevronRight size={12} className="text-gray-600" />
        <span className="text-sm text-gray-400">{card.apelido || card.name}</span>
        <ChevronRight size={12} className="text-gray-600" />
        <span className="text-sm text-gray-200">Fatura {label}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-base font-bold text-orange-600">{fmt(total)}</span>
          <button
            onClick={onNewTx}
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <Plus size={12} /> Novo
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase">Fatura</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{fmt(total)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase">Lançamentos</p>
          <p className="text-xl font-bold text-gray-200 mt-1">{txs.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {txs.length === 0 ? (
          <div className="text-center py-10">
            <ArrowUpCircle size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhum lançamento nesta fatura</p>
            <button onClick={onNewTx} className="btn-primary mt-3 text-xs">Adicionar lançamento</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Categoria</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">Valor</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {txs.map(tx => {
                  const cat = categories.find(c => c.id === tx.categoryId)
                  return (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(tx.date)}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-200 text-sm">{tx.description}</p>
                        {tx.payee && <p className="text-xs text-gray-500">{tx.payee}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {cat && <span className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-300">{cat.icon} {cat.name}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600 whitespace-nowrap text-sm">
                        {fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => setConfirmEstorno(tx)}
                            title="Estornar lançamento"
                            className="p-1.5 text-gray-700 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors"
                          >
                            <Undo2 size={11} />
                          </button>
                          <button
                            onClick={() => { setEditTx(tx); setShowEdit(true) }}
                            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(tx)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-700 bg-gray-900/30">
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-300">Total da Fatura</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-orange-600">{fmt(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditTx(null) }} title="Editar Lançamento">
        <TransactionForm initial={editTx} onClose={() => { setShowEdit(false); setEditTx(null) }} />
      </Modal>
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteTransaction(confirmDelete.id)}
        title="Excluir Lançamento"
        message={`Excluir "${confirmDelete?.description}"?`}
        danger
      />
      <ConfirmDialog
        open={!!confirmEstorno}
        onClose={() => setConfirmEstorno(null)}
        onConfirm={() => handleReverse(confirmEstorno)}
        title="Estornar Lançamento"
        message={
          confirmEstorno?.scheduleId
            ? `Estornar este lançamento? O agendamento voltará para pendente na data ${fmtDate(confirmEstorno?.date)}.`
            : 'Estornar este lançamento? Esta ação não pode ser desfeita.'
        }
        confirmLabel="Confirmar Estorno"
        danger
      />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

// ─── Account extrato view ───────────────────────────────────────────────────

function AccountView({ account, onBack, onNewTx, onEditTx }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={14} /> Lançamentos
        </button>
        <ChevronRight size={12} className="text-gray-600" />
        <span className="text-sm text-gray-200">{account.apelido || account.name}</span>
        <button
          onClick={onNewTx}
          className="ml-auto btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
        >
          <Plus size={12} /> Novo lançamento
        </button>
      </div>
      <ExtratoContaPanel account={account} onEdit={onEditTx} />
    </div>
  )
}

// ─── Accounts list view ─────────────────────────────────────────────────────

function AccountsList({ bankAccounts, creditCards, cardFaturas, onSelectAccount, onSelectFatura, onNewTx }) {
  return (
    <div className="space-y-6">
      {/* Contas bancárias */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Contas</h2>
          <button onClick={() => onNewTx()} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Plus size={12} /> Novo
          </button>
        </div>
        {bankAccounts.length === 0 ? (
          <div className="card text-center py-10">
            <Wallet size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhuma conta cadastrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bankAccounts.map(a => (
              <button
                key={a.id}
                onClick={() => onSelectAccount(a)}
                className="card text-left hover:bg-gray-800/60 transition-colors group border border-transparent hover:border-gray-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 group-hover:bg-gray-700 flex items-center justify-center transition-colors shrink-0">
                      <Wallet size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors truncate">
                      {a.apelido || a.name}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0 ml-2" />
                </div>
                <p className={`text-2xl font-bold ${(a.balance || 0) >= 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
                  {fmt(a.balance || 0)}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">Saldo atual</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cartões de crédito */}
      {creditCards.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <CreditCard size={14} className="text-gray-500" />
            Cartões de Crédito
          </h2>
          <div className="space-y-3">
            {creditCards.map(card => {
              const faturas = cardFaturas[card.id] || []
              return (
                <div key={card.id} className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-purple-400 shrink-0" />
                      <span className="text-sm font-semibold text-gray-200">{card.apelido || card.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        Dívida: <span className="text-purple-400 font-semibold">{fmt(card.creditDebt || 0)}</span>
                      </span>
                      <button
                        onClick={() => onNewTx(card)}
                        className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                        title="Novo lançamento no cartão"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  {faturas.length === 0 ? (
                    <p className="text-center py-6 text-gray-600 text-xs">Nenhum lançamento no cartão</p>
                  ) : (
                    <div>
                      {faturas.map(fat => (
                        <button
                          key={fat.key}
                          onClick={() => onSelectFatura(card, fat.key)}
                          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-800/40 last:border-0 hover:bg-gray-800/30 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs text-gray-500 uppercase tracking-wide shrink-0">Fatura</span>
                            <span className="text-sm font-semibold text-gray-200">{fat.label}</span>
                            <span className="text-xs text-gray-600 shrink-0">{fat.count} lançamento{fat.count !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-sm font-bold text-orange-600">{fmt(fat.total)}</span>
                            <ChevronRight size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root panel ─────────────────────────────────────────────────────────────

export default function TransactionsPanel() {
  const { accounts: allAccounts, profileAccounts, accountGroups } = useApp()
  const accounts = profileAccounts

  // view: null | { type: 'account', account } | { type: 'fatura', card, billKey }
  const [view, setView] = useState(null)

  // new-tx modal: step 'pick' (account picker) or 'form' (TransactionForm)
  const [showModal, setShowModal] = useState(false)
  const [modalStep, setModalStep] = useState('pick')
  const [modalAccount, setModalAccount] = useState(null)
  const [editTx, setEditTx] = useState(null)

  const bankAccounts = useMemo(
    () => accounts.filter(a => a.type !== 'credit').sort((a, b) => accountPriority(a) - accountPriority(b)),
    [accounts]
  )
  const creditCards = useMemo(
    () => accounts.filter(a => a.type === 'credit').sort((a, b) => (a.appPriority ? 0 : 1) - (b.appPriority ? 0 : 1)),
    [accounts]
  )

  const { transactions } = useApp()

  const cardFaturas = useMemo(() => {
    const result = {}
    creditCards.forEach(card => {
      const groups = {}
      transactions
        .filter(tx => tx.accountId === card.id && tx.type === 'expense')
        .forEach(tx => {
          const key = getBillKey(tx.date, card)
          if (!groups[key]) groups[key] = { key, label: getBillLabel(key), count: 0, total: 0 }
          groups[key].count++
          groups[key].total += tx.amount
        })
      result[card.id] = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
    })
    return result
  }, [creditCards, transactions])

  const openNewTx = (account = null) => {
    setEditTx(null)
    if (account) {
      setModalAccount(account)
      setModalStep('form')
    } else {
      setModalAccount(null)
      setModalStep(accounts.length > 1 ? 'pick' : 'form')
    }
    setShowModal(true)
  }

  const openEditTx = (tx) => {
    setEditTx(tx)
    setModalAccount(null)
    setModalStep('form')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditTx(null)
    setModalAccount(null)
    setModalStep('pick')
  }

  // Account extrato view
  if (view?.type === 'account') {
    return (
      <>
        <AccountView
          account={view.account}
          onBack={() => setView(null)}
          onNewTx={() => openNewTx(view.account)}
          onEditTx={openEditTx}
        />
        <Modal open={showModal} onClose={closeModal} title={editTx?.id ? 'Editar Lançamento' : 'Novo Lançamento'}>
          <TransactionForm
            initial={editTx || { accountId: modalAccount?.id }}
            onClose={closeModal}
          />
        </Modal>
      </>
    )
  }

  // Credit fatura view
  if (view?.type === 'fatura') {
    return (
      <>
        <FaturaView
          card={view.card}
          billKey={view.billKey}
          onBack={() => setView(null)}
          onNewTx={() => openNewTx(view.card)}
        />
        <Modal open={showModal} onClose={closeModal} title="Novo Lançamento">
          <TransactionForm
            initial={editTx || { accountId: modalAccount?.id, type: 'expense' }}
            onClose={closeModal}
          />
        </Modal>
      </>
    )
  }

  // Accounts list
  return (
    <>
      <AccountsList
        bankAccounts={bankAccounts}
        creditCards={creditCards}
        cardFaturas={cardFaturas}
        onSelectAccount={a => setView({ type: 'account', account: a })}
        onSelectFatura={(card, billKey) => setView({ type: 'fatura', card, billKey })}
        onNewTx={openNewTx}
      />
      <Modal
        open={showModal}
        onClose={closeModal}
        title={modalStep === 'pick' ? 'Qual conta?' : 'Novo Lançamento'}
      >
        {modalStep === 'pick' ? (
          <AccountPicker
            accounts={accounts}
            accountGroups={accountGroups}
            onSelect={a => { setModalAccount(a); setModalStep('form') }}
          />
        ) : (
          <TransactionForm
            initial={{ accountId: modalAccount?.id }}
            onClose={closeModal}
          />
        )}
      </Modal>
    </>
  )
}
