import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useScrollScope } from '../../hooks/useScrollRestoration'
import { fmt, fmtDate } from '../shared/utils'
import DateInput from '../shared/DateInput'
import ReconcileBadge from '../shared/ReconcileBadge'

function GerBadge({ grupoId, gerencialGroups }) {
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
  else if (grupo.number === 'D') cls += ' bg-surface-hover/60 text-texto-3'
  else cls += ' bg-despesa/20 text-despesa'
  return <span className={cls}>{grupo.alias}</span>
}

// dia <= closingDay → fatura do mês corrente; dia > closingDay → mês seguinte.
function getBillLabel(date, card) {
  if (!date || !card) return ''
  const closingDay = card.closingDay || 1
  const d = new Date(date + 'T00:00:00')
  const day = d.getDate()
  const ref = day <= closingDay
    ? new Date(d.getFullYear(), d.getMonth(), 1)
    : new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return `${String(ref.getMonth() + 1).padStart(2, '0')}/${ref.getFullYear()}`
}

export default function ExtratoGerencial({ initialCardId }) {
  const { accounts, transactions, gerencialGroups, updateTransaction, pode } = useApp()
  const podeEditar = pode('cartao', 'editar')
  useScrollScope('credit:extrato')

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
        <h2 className="text-sm font-semibold text-texto-2 mb-4">Extrato Gerencial</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Cartão</label>
            <select className="input" value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)}>
              <option value="">Selecione...</option>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">De</label>
            <DateInput className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <DateInput className="input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {rowsWithBalance.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-texto-3 text-sm">Nenhum lançamento no período</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda">
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium whitespace-nowrap">Data</th>
                <th className="text-center px-3 py-3 text-xs text-texto-2 font-medium">Nº</th>
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium">Descrição</th>
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium hidden lg:table-cell">Movimentação</th>
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Favorecido</th>
                <th className="text-center px-3 py-3 text-xs text-texto-2 font-medium">Ger</th>
                <th className="text-center px-3 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Fatura</th>
                <th className="text-center px-3 py-3 text-xs text-texto-2 font-medium">R</th>
                <th className="text-right px-3 py-3 text-xs text-texto-2 font-medium">Pagamento</th>
                <th className="text-right px-3 py-3 text-xs text-texto-2 font-medium">Depósito</th>
                <th className="text-right px-3 py-3 text-xs text-texto-2 font-medium">Saldo</th>
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
                    className="border-b border-borda/50 hover:bg-surface-hover/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-texto-2 whitespace-nowrap text-xs">{fmtDate(tx.date)}</td>
                    <td className="px-3 py-2.5 text-center text-texto-3 text-xs">{tx._seq}</td>
                    <td className="px-3 py-2.5 text-texto-1 max-w-xs">
                      <p className="truncate">{tx.description}</p>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        tx.type === 'expense' ? 'bg-despesa/15 text-despesa'
                        : tx.type === 'income' ? 'bg-receita/15 text-receita'
                        : tx.type === 'credit_payment' ? 'bg-receita/15 text-receita'
                        : 'bg-surface-hover text-texto-2'
                      }`}>{movLabel}</span>
                    </td>
                    <td className="px-3 py-2.5 text-texto-3 text-xs hidden md:table-cell">{tx.payee || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {tx.grupoGerencial
                        ? <GerBadge grupoId={tx.grupoGerencial} gerencialGroups={gerencialGroups} />
                        : <span className="text-texto-3 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-texto-3 hidden md:table-cell">
                      {getBillLabel(tx.date, card)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ReconcileBadge
                        reconciled={tx.reconciled}
                        onClick={() => { if (podeEditar) updateTransaction(tx.id, { reconciled: !tx.reconciled }) }}
                        title={tx.reconciled ? 'Desmarcar conferido' : 'Marcar como conferido'}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-despesa font-medium whitespace-nowrap text-xs">
                      {tx._pagamento > 0 ? fmt(tx._pagamento) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right text-receita font-medium whitespace-nowrap text-xs">
                      {tx._deposito > 0 ? fmt(tx._deposito) : ''}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap text-xs ${tx._balance < 0 ? 'text-despesa' : 'text-receita'}`}>
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
