import { useState, useMemo } from 'react'
import { CreditCard, DollarSign, Calendar, FileText, ArrowLeft } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, today } from '../shared/utils'
import Modal from '../shared/Modal'
import ExtratoGerencial from './ExtratoGerencial'

function GerBadge({ grupoId, gerencialGroups }) {
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null

  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) {
    cls += ' bg-emerald-500/20 text-emerald-400'
  } else if (grupo.number === 'D') {
    cls += ' bg-gray-700/60 text-gray-500'
  } else {
    cls += ' bg-blue-500/20 text-blue-400'
  }

  return <span className={cls}>{grupo.alias}</span>
}

export default function CreditCardPanel() {
  const { accounts, transactions, categories, gerencialGroups, addTransaction } = useApp()
  const [payModal, setPayModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [payFromAccount, setPayFromAccount] = useState('')
  const [showExtrato, setShowExtrato] = useState(false)
  const [extratoCardId, setExtratoCardId] = useState(null)

  const creditCards = accounts.filter(a => a.type === 'credit')
  const bankAccounts = accounts.filter(a => a.type !== 'credit')

  const getCardTransactions = (cardId) =>
    transactions
      .filter(tx => tx.accountId === cardId && tx.type === 'expense')
      .sort((a, b) => b.date.localeCompare(a.date))

  const getCurrentBill = (card) => {
    const now = new Date()
    const closingDay = card.closingDay || 1
    let billStart, billEnd
    if (now.getDate() < closingDay) {
      billStart = new Date(now.getFullYear(), now.getMonth() - 1, closingDay).toISOString().split('T')[0]
      billEnd = new Date(now.getFullYear(), now.getMonth(), closingDay - 1).toISOString().split('T')[0]
    } else {
      billStart = new Date(now.getFullYear(), now.getMonth(), closingDay).toISOString().split('T')[0]
      billEnd = new Date(now.getFullYear(), now.getMonth() + 1, closingDay - 1).toISOString().split('T')[0]
    }
    const billTxs = transactions.filter(tx =>
      tx.accountId === card.id && tx.type === 'expense' &&
      tx.date >= billStart && tx.date <= billEnd
    )
    return { total: billTxs.reduce((s, t) => s + t.amount, 0), transactions: billTxs, start: billStart, end: billEnd }
  }

  const handlePay = () => {
    if (!payModal || !payAmount || !payFromAccount) return
    addTransaction({
      type: 'credit_payment',
      accountId: payModal.id,
      fromAccountId: payFromAccount,
      amount: Number(payAmount),
      date: payDate,
      description: `Pagamento fatura ${payModal.name}`,
      categoryId: '',
    })
    setPayModal(null)
    setPayAmount('')
    setPayFromAccount('')
  }

  // Checa se alguma transação tem grupoGerencial preenchido neste cartão
  const hasGerCol = (cardId) =>
    transactions.some(tx => tx.accountId === cardId && tx.type === 'expense' && tx.grupoGerencial)

  if (creditCards.length === 0) {
    return (
      <div className="card text-center py-16">
        <CreditCard size={40} className="text-gray-700 mx-auto mb-4" />
        <p className="text-gray-400 mb-2">Nenhum cartão de crédito cadastrado</p>
        <p className="text-gray-600 text-sm">Adicione um cartão na seção Contas</p>
      </div>
    )
  }

  if (showExtrato) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          onClick={() => setShowExtrato(false)}
        >
          <ArrowLeft size={14} /> Voltar ao Cartão
        </button>
        <ExtratoGerencial initialCardId={extratoCardId} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {creditCards.map(card => {
        const currentBill = getCurrentBill(card)
        const cardTxs = getCardTransactions(card.id)
        const usage = card.creditLimit ? (card.creditDebt / card.creditLimit) * 100 : 0
        const showGer = hasGerCol(card.id)

        return (
          <div key={card.id} className="space-y-4">
            {/* Cabeçalho do cartão */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="col-span-1 rounded-xl bg-gray-800 border border-gray-700 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-gray-300">
                    <CreditCard size={16} style={{ color: '#0F6E56' }} />
                    <span className="text-sm">{card.name}</span>
                    {card.apelido && <span className="text-xs text-gray-500">· {card.apelido}</span>}
                  </div>
                  <button
                    onClick={() => { setExtratoCardId(card.id); setShowExtrato(true) }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    title="Extrato Gerencial"
                  >
                    <FileText size={12} /> Extrato
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-1">Dívida Total</p>
                <p className="text-3xl font-bold mb-4 text-white">{fmt(card.creditDebt || 0)}</p>
                <div className="h-1.5 bg-gray-700 rounded-full mb-1">
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, usage)}%`, backgroundColor: '#0F6E56' }} />
                </div>
                <p className="text-xs text-gray-500">{fmt(card.creditDebt || 0)} / {fmt(card.creditLimit || 0)}</p>
                <div className="mt-4 flex justify-between text-xs text-gray-500">
                  <span>Fecha dia {card.closingDay}</span>
                  <span>Vence dia {card.dueDay}</span>
                </div>
              </div>

              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div className="card">
                  <div className="flex items-center gap-2 mb-2 text-gray-400">
                    <Calendar size={14} />
                    <span className="text-xs uppercase tracking-wide">Fatura Atual</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-400">{fmt(currentBill.total)}</p>
                  <p className="text-xs text-gray-500 mt-1">{fmtDate(currentBill.start)} – {fmtDate(currentBill.end)}</p>
                </div>
                <div className="card">
                  <div className="flex items-center gap-2 mb-2 text-gray-400">
                    <DollarSign size={14} />
                    <span className="text-xs uppercase tracking-wide">Limite Disponível</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {fmt((card.creditLimit || 0) - (card.creditDebt || 0))}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">de {fmt(card.creditLimit || 0)}</p>
                </div>
                <div className="col-span-2">
                  <button
                    className="btn-primary w-full flex items-center justify-center gap-2"
                    onClick={() => { setPayModal(card); setPayAmount(String(currentBill.total)) }}
                  >
                    <DollarSign size={14} /> Pagar Fatura
                  </button>
                </div>
              </div>
            </div>

            {/* Extrato do cartão */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">Lançamentos do Cartão</h3>
                {showGer && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">G</span> Gerencial
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-bold">2+</span> Grupo
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500 text-xs font-bold">D</span> Despesa
                  </div>
                )}
              </div>
              {cardTxs.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Nenhum lançamento no cartão</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Data</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Categoria</th>
                      {showGer && (
                        <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Ger.</th>
                      )}
                      <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardTxs.slice(0, 30).map(tx => {
                      const cat = categories.find(c => c.id === tx.categoryId)
                      const isInCurrentBill = tx.date >= currentBill.start && tx.date <= currentBill.end
                      return (
                        <tr
                          key={tx.id}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${isInCurrentBill ? '' : 'opacity-50'}`}
                        >
                          <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
                          <td className="px-4 py-3">
                            <p className="text-gray-200">{tx.description}</p>
                            {tx.payee && <p className="text-xs text-gray-500">{tx.payee}</p>}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {cat
                              ? <span className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-300">{cat.icon} {cat.name}</span>
                              : null}
                          </td>
                          {showGer && (
                            <td className="px-4 py-3">
                              {tx.grupoGerencial
                                ? <GerBadge grupoId={tx.grupoGerencial} gerencialGroups={gerencialGroups} />
                                : <span className="text-gray-700 text-xs">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right font-semibold text-red-400 whitespace-nowrap">
                            {fmt(tx.amount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })}

      {/* Modal de pagamento */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Pagar Fatura do Cartão" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Conta de Débito</label>
            <select className="input" value={payFromAccount} onChange={e => setPayFromAccount(e.target.value)}>
              <option value="">Selecione a conta...</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Valor do Pagamento</label>
            <input className="input" type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Data do Pagamento</label>
            <input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPayModal(null)}>Cancelar</button>
            <button
              className="btn-primary flex-1"
              onClick={handlePay}
              disabled={!payFromAccount || !payAmount}
            >
              Confirmar Pagamento
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
