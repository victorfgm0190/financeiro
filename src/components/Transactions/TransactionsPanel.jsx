import { useState, useMemo } from 'react'
import { Plus, Search, Filter, Trash2, Edit2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, ChevronDown } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import TransactionForm from './TransactionForm'

const TYPE_CONFIG = {
  income: { label: 'Receita', icon: ArrowUpCircle, color: 'text-emerald-400' },
  expense: { label: 'Despesa', icon: ArrowDownCircle, color: 'text-red-400' },
  transfer: { label: 'Transferência', icon: ArrowLeftRight, color: 'text-blue-400' },
  credit_payment: { label: 'Pgto Cartão', icon: ArrowDownCircle, color: 'text-purple-400' },
}

export default function TransactionsPanel() {
  const { transactions, accounts, categories, deleteTransaction, getFinancialPeriod } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterPeriod, setFilterPeriod] = useState('current')
  const [showFilters, setShowFilters] = useState(false)

  const period = getFinancialPeriod()

  const filtered = useMemo(() => {
    let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

    if (filterPeriod === 'current') {
      list = list.filter(tx => tx.date >= period.start.toISOString().split('T')[0] && tx.date <= period.end.toISOString().split('T')[0])
    }
    if (filterType) list = list.filter(tx => tx.type === filterType)
    if (filterAccount) list = list.filter(tx => tx.accountId === filterAccount || tx.toAccountId === filterAccount)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(tx =>
        tx.description?.toLowerCase().includes(q) ||
        tx.payee?.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q)
      )
    }
    return list
  }, [transactions, search, filterType, filterAccount, filterPeriod, period])

  const totals = useMemo(() => ({
    income: filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    expense: filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
  }), [filtered])

  const getAccount = (id) => accounts.find(a => a.id === id)
  const getCategory = (id) => categories.find(c => c.id === id)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Receitas</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{fmt(totals.income)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Despesas</p>
          <p className="text-xl font-bold text-red-400 mt-1">{fmt(totals.expense)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Saldo do Período</p>
          <p className={`text-xl font-bold mt-1 ${totals.income - totals.expense >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt(totals.income - totals.expense)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9" placeholder="Buscar lançamentos..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => setShowFilters(v => !v)}>
          <Filter size={14} /> Filtros <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setEditTx(null); setShowForm(true) }}>
          <Plus size={14} /> Novo
        </button>
      </div>

      {showFilters && (
        <div className="card grid grid-cols-3 gap-3">
          <div>
            <label className="label">Período</label>
            <select className="input" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
              <option value="current">Mês atual</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
              <option value="transfer">Transferência</option>
            </select>
          </div>
          <div>
            <label className="label">Conta</label>
            <select className="input" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
              <option value="">Todas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <ArrowLeftRight size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">Nenhum lançamento encontrado</p>
            <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Registrar primeiro lançamento</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Data</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Categoria</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium hidden lg:table-cell">Conta</th>
                <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">Valor</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const conf = TYPE_CONFIG[tx.type] || TYPE_CONFIG.expense
                const Icon = conf.icon
                const cat = getCategory(tx.categoryId)
                const acc = getAccount(tx.accountId)
                return (
                  <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className={conf.color} />
                        <div>
                          <p className="text-gray-200 font-medium">{tx.description || conf.label}</p>
                          {tx.payee && <p className="text-xs text-gray-500">{tx.payee}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {cat ? <span className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-300">{cat.icon} {cat.name}</span> : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-400 text-xs">
                      {acc?.name || '—'}
                      {tx.toAccountId && <span className="text-gray-600"> → {getAccount(tx.toAccountId)?.name}</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'transfer' ? 'text-blue-400' : 'text-red-400'}`}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-'}{fmt(tx.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditTx(tx); setShowForm(true) }} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => setConfirmDelete(tx)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditTx(null) }} title={editTx ? 'Editar Lançamento' : 'Novo Lançamento'}>
        <TransactionForm initial={editTx} onClose={() => { setShowForm(false); setEditTx(null) }} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteTransaction(confirmDelete.id)}
        title="Excluir Lançamento"
        message={`Excluir "${confirmDelete?.description || 'este lançamento'}"? O saldo da conta será ajustado.`}
        danger
      />
    </div>
  )
}
