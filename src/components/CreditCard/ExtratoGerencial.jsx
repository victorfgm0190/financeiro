import { useState, useMemo } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'

function GerBadge({ grupoId, gerencialGroups }) {
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-emerald-500/20 text-emerald-400'
  else if (grupo.number === 'D') cls += ' bg-gray-700/60 text-gray-500'
  else cls += ' bg-orange-500/20 text-orange-600'
  return <span className={cls}>{grupo.alias}</span>
}

function getBillLabel(date, card) {
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
  return `${String(month).padStart(2, '0')}/${year}`
}

export default function ExtratoGerencial({ initialCardId }) {
  const { accounts, transactions, gerencialGroups, updateTransaction } = useApp()

  const creditCards = accounts.filter(a => a.type === 'credit')
  const [selectedCardId, setSelectedCardId] = useState(initialCardId || creditCards[0]?.id || '')

  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(lastOfMonth)

  const card = accounts.find(a => a.id === selectedCardId)

  const rows = useMemo(() => {
    if (!selectedCardId) return []
    return transactions
      .filter(tx => {
        if (tx.accountId !== selectedCardId && tx.toAccountId !== selectedCardId) return false
        const d = tx.date || ''
        return d >= from && d <= to
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [transactions, selectedCardId, from, to])

  const rowsWithBalance = useMemo(() => {
    let balance = 0
    return rows.map((tx, idx) => {
      let pagamento = 0
      let deposito = 0
      if (tx.type === 'expense') {
        pagamento = tx.amount
        balance -= tx.amount
      } else if (tx.type === 'income') {
        deposito = tx.amount
        balance += tx.amount
      } else if (tx.type === 'transfer') {
        if (tx.accountId === selectedCardId) { pagamento = tx.amount; balance -= tx.amount }
        else { deposito = tx.amount; balance += tx.amount }
      } else if (tx.type === 'credit_payment') {
        deposito = tx.amount
        balance += tx.amount
      }
      return { ...tx, _pagamento: pagamento, _deposito: deposito, _balance: balance, _seq: idx + 1 }
    })
  }, [rows, selectedCardId])

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Extrato Gerencial</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Cartão</label>
            <select className="input" value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)}>
              <option value="">Selecione...</option>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">De</label>
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {rowsWithBalance.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500 text-sm">Nenhum lançamento no período</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                <th className="text-center px-3 py-3 text-xs text-gray-400 font-medium">Nº</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium hidden lg:table-cell">Movimentação</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Favorecido</th>
                <th className="text-center px-3 py-3 text-xs text-gray-400 font-medium">Ger</th>
                <th className="text-center px-3 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Fatura</th>
                <th className="text-center px-3 py-3 text-xs text-gray-400 font-medium">R</th>
                <th className="text-right px-3 py-3 text-xs text-gray-400 font-medium">Pagamento</th>
                <th className="text-right px-3 py-3 text-xs text-gray-400 font-medium">Depósito</th>
                <th className="text-right px-3 py-3 text-xs text-gray-400 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithBalance.map(tx => {
                const movLabel = tx.type === 'expense' ? 'Compra'
                  : tx.type === 'income' ? 'Crédito'
                  : tx.type === 'credit_payment' ? 'Pagamento'
                  : 'Transferência'
                return (
                  <tr
                    key={tx.id}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${tx.reconciled ? 'opacity-60' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap text-xs">{fmtDate(tx.date)}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{tx._seq}</td>
                    <td className="px-3 py-2.5 text-gray-200 max-w-xs">
                      <p className="truncate">{tx.description}</p>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        tx.type === 'expense' ? 'bg-orange-500/15 text-orange-600'
                        : tx.type === 'income' ? 'bg-blue-500/15 text-blue-600'
                        : tx.type === 'credit_payment' ? 'bg-blue-500/15 text-blue-600'
                        : 'bg-gray-700 text-gray-400'
                      }`}>{movLabel}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs hidden md:table-cell">{tx.payee || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {tx.grupoGerencial
                        ? <GerBadge grupoId={tx.grupoGerencial} gerencialGroups={gerencialGroups} />
                        : <span className="text-gray-700 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 hidden md:table-cell">
                      {getBillLabel(tx.date, card)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => updateTransaction(tx.id, { reconciled: !tx.reconciled })}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                        title={tx.reconciled ? 'Desmarcar conferido' : 'Marcar como conferido'}
                      >
                        {tx.reconciled
                          ? <CheckSquare size={14} style={{ color: '#0F6E56' }} />
                          : <Square size={14} />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right text-orange-600 font-medium whitespace-nowrap text-xs">
                      {tx._pagamento > 0 ? fmt(tx._pagamento) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-600 font-medium whitespace-nowrap text-xs">
                      {tx._deposito > 0 ? fmt(tx._deposito) : ''}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap text-xs ${tx._balance < 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                      {fmt(Math.abs(tx._balance))}{tx._balance < 0 ? ' D' : ' C'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
