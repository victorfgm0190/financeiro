import { useState, useMemo } from 'react'
import {
  CreditCard, DollarSign, Calendar, FileText, FileBarChart, ArrowLeft,
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, CheckCircle2, Circle, CheckSquare, RotateCcw,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, today, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import GerencialTotalizer from '../shared/GerencialTotalizer'
import ReconciliarModal from '../shared/ReconciliarModal'
import TransactionForm from '../Transactions/TransactionForm'
import ExtratoGerencial from './ExtratoGerencial'
import RelatorioFatura from './RelatorioFatura'

// ─── Helpers (mirrors TransactionsPanel) ─────────────────────────────────────

// Mesma convenção de computeFaturaRef: dia <= closingDay → fatura do mês corrente;
// dia > closingDay → fatura do mês seguinte (a fatura do mês M fecha no dia F de M).
function getBillKey(date, card) {
  if (!date || !card) return ''
  const closingDay = card.closingDay || 1
  const d = new Date(date + 'T00:00:00')
  const day = d.getDate()
  let month0, year
  if (day <= closingDay) {
    month0 = d.getMonth()
    year = d.getFullYear()
  } else {
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    month0 = n.getMonth()
    year = n.getFullYear()
  }
  return `${year}-${String(month0 + 1).padStart(2, '0')}`
}

// Fatura de um lançamento: usa o faturaMonthYear explícito (importação/gerencial)
// quando presente; senão deriva da data pelo dia de fechamento.
function txBillKey(tx, card) {
  return tx.faturaMonthYear || getBillKey(tx.date, card)
}

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function getBillLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return `Fatura ${MONTHS_PT[parseInt(m, 10) - 1]}/${y}`
}

function offsetBillKey(key, months) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Gerencial badge ──────────────────────────────────────────────────────────

function GerBadge({ grupoId, gerencialGroups }) {
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-emerald-500/20 text-emerald-400'
  else if (grupo.number === 'D') cls += ' bg-gray-700/60 text-gray-500'
  else cls += ' bg-orange-500/20 text-orange-600'
  return <span className={cls}>{grupo.alias}</span>
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function CreditCardPanel() {
  const {
    profileAccounts: accounts,
    profileTransactions: transactions,
    categories, gerencialGroups,
    addTransaction, deleteTransaction, setReconciled, recalcularAgendamentosFatura,
  } = useApp()
  const [toast, setToast] = useState(null)

  const creditCards = useMemo(() => accounts.filter(a => a.type === 'credit' && a.active !== false), [accounts])
  const bankAccounts = useMemo(() => accounts.filter(a => a.type !== 'credit'), [accounts])

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedCardId, setSelectedCardId] = useState(() => creditCards[0]?.id || '')
  const [billKey, setBillKey] = useState(() => {
    const card = creditCards[0]
    return card ? getBillKey(today(), card) : ''
  })
  const [showExtrato, setShowExtrato] = useState(false)
  const [showRelatorio, setShowRelatorio] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [payFromAccount, setPayFromAccount] = useState('')
  const [showNewTx, setShowNewTx] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const selectedCard = useMemo(
    () => accounts.find(a => a.id === selectedCardId) || creditCards[0] || null,
    [accounts, selectedCardId, creditCards]
  )

  // Keep same month when switching cards (per spec)
  const handleCardChange = (cardId) => {
    setSelectedCardId(cardId)
    if (!billKey) {
      const card = accounts.find(a => a.id === cardId)
      if (card) setBillKey(getBillKey(today(), card))
    }
  }

  // ── Transactions for selected bill ───────────────────────────────────────
  const billTxs = useMemo(() => {
    if (!selectedCard || !billKey) return []
    return transactions
      .filter(tx =>
        tx.accountId === selectedCard.id &&
        tx.type === 'expense' &&
        txBillKey(tx, selectedCard) === billKey
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, selectedCard, billKey])

  // Estornos da fatura (receitas lançadas no cartão) — abatem do total e aparecem
  // em linha separada no totalizador gerencial. Pagamentos de fatura (credit_payment)
  // não entram aqui (e billTxs já é só despesa).
  const billEstornos = useMemo(() => {
    if (!selectedCard || !billKey) return []
    return transactions.filter(tx =>
      tx.accountId === selectedCard.id &&
      tx.type === 'income' &&
      txBillKey(tx, selectedCard) === billKey
    )
  }, [transactions, selectedCard, billKey])

  const estornoTotal = billEstornos.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  // Total da fatura = despesas - estornos
  const billTotal = billTxs.reduce((s, t) => s + t.amount, 0) - estornoTotal
  // Lançamentos alimentados ao totalizador gerencial: despesas + estornos.
  const totalizerTxs = useMemo(() => [...billTxs, ...billEstornos], [billTxs, billEstornos])
  const hasGer = billTxs.some(tx => tx.grupoGerencial)

  // Filtros em tempo real — afetam só as linhas exibidas; o Total da Fatura segue
  // calculado sobre a fatura completa (billTotal).
  const [filtros, setFiltros] = useState(EMPTY_LANC_FILTROS)
  const displayBillTxs = useMemo(
    () => hasLancFiltros(filtros) ? billTxs.filter(tx => matchLancFiltros(tx, filtros, accounts)) : billTxs,
    [billTxs, filtros, accounts]
  )

  // Reconciliação — lançamentos NÃO reconciliados da fatura em exibição.
  const [showReconciliar, setShowReconciliar] = useState(false)
  const billPending = useMemo(
    () => billTxs.filter(tx => !tx.reconciled).sort((a, b) => a.date.localeCompare(b.date)),
    [billTxs]
  )

  // ── Pay invoice ──────────────────────────────────────────────────────────
  const handlePay = () => {
    if (!selectedCard || !payAmount || !payFromAccount) return
    addTransaction({
      type: 'credit_payment',
      accountId: selectedCard.id,
      fromAccountId: payFromAccount,
      amount: Number(payAmount),
      date: payDate,
      description: `Pagamento fatura ${selectedCard.name}`,
      categoryId: '',
    })
    setShowPayModal(false)
    setPayAmount('')
    setPayFromAccount('')
  }

  // ── Subviews ─────────────────────────────────────────────────────────────
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
        <ExtratoGerencial initialCardId={selectedCardId} />
      </div>
    )
  }

  if (showRelatorio) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          onClick={() => setShowRelatorio(false)}
        >
          <ArrowLeft size={14} /> Voltar ao Cartão
        </button>
        <RelatorioFatura initialCardId={selectedCardId} />
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Seletor de cartão + navegador de fatura ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Dropdown de cartão */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <CreditCard size={15} className="text-purple-400 shrink-0" />
          <select
            className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none w-full"
            value={selectedCardId}
            onChange={e => handleCardChange(e.target.value)}
          >
            {creditCards.map(c => (
              <option key={c.id} value={c.id}>{c.apelido || c.name}</option>
            ))}
          </select>
        </div>

        {/* Navegador de fatura */}
        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-1 py-1 shrink-0">
          <button
            onClick={() => setBillKey(k => offsetBillKey(k, -1))}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-gray-200 px-3 whitespace-nowrap min-w-[160px] text-center">
            {getBillLabel(billKey)}
          </span>
          <button
            onClick={() => setBillKey(k => offsetBillKey(k, +1))}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Links auxiliares */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <button
            onClick={() => setShowExtrato(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <FileText size={12} /> Extrato
          </button>
          <button
            onClick={() => setShowRelatorio(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <FileBarChart size={12} /> Relatório
          </button>
        </div>
      </div>

      {/* ── KPIs + botões de ação ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <Calendar size={13} />
            <span className="text-xs uppercase tracking-wide">Fatura Selecionada</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{fmt(billTotal)}</p>
          <p className="text-xs text-gray-500 mt-1">{billTxs.length} lançamento{billTxs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <DollarSign size={13} />
            <span className="text-xs uppercase tracking-wide">Limite Disponível</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {fmt((selectedCard?.creditLimit || 0) - (selectedCard?.creditDebt || 0))}
          </p>
          <p className="text-xs text-gray-500 mt-1">de {fmt(selectedCard?.creditLimit || 0)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <CreditCard size={13} />
            <span className="text-xs uppercase tracking-wide">Dívida Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-200">{fmt(selectedCard?.creditDebt || 0)}</p>
          <p className="text-xs text-gray-500 mt-1">Fecha dia {selectedCard?.closingDay || '—'} · Vence dia {selectedCard?.dueDay || '—'}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
            onClick={() => setShowNewTx(true)}
          >
            <Plus size={14} /> Novo Lançamento
          </button>
          <button
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
            onClick={() => { setShowPayModal(true); setPayAmount(String(billTotal)) }}
          >
            <DollarSign size={14} /> Pagar Fatura
          </button>
          <button
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
            onClick={() => {
              if (!selectedCard || !billKey) return
              const [by, bm] = billKey.split('-')
              recalcularAgendamentosFatura(selectedCard.id, by, bm)
              setToast(`Fatura atualizada: ${fmt(billTotal)}`)
            }}
            title="Recalcula o total da fatura e atualiza a conta a pagar"
          >
            <RotateCcw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* ── Tabela de lançamentos da fatura ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-300">{getBillLabel(billKey)}</h3>
          <div className="flex items-center gap-3">
            {hasGer && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">G</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 text-xs font-bold">2+</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500 text-xs font-bold">D</span>
              </div>
            )}
            {billTxs.length > 0 && (
              <button
                onClick={() => setShowReconciliar(true)}
                className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1"
                title="Reconciliar transações da fatura"
              >
                <CheckSquare size={12} /> Reconciliar
              </button>
            )}
          </div>
        </div>

        {billTxs.length > 0 && (
          <LancamentoFiltros filtros={filtros} setFiltros={setFiltros} />
        )}

        {billTxs.length === 0 ? (
          <div className="text-center py-12">
            <Calendar size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhum lançamento nesta fatura</p>
            <button onClick={() => setShowNewTx(true)} className="btn-primary mt-3 text-xs">
              Adicionar lançamento
            </button>
          </div>
        ) : (
          <>
            <GerencialTotalizer txs={totalizerTxs} gerencialGroups={gerencialGroups} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Data</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Categoria</th>
                    {hasGer && <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Ger.</th>}
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">Valor</th>
                    <th className="px-4 py-3 w-16" />
                    <th className="px-2 py-3 text-center text-xs text-gray-400 font-medium w-10" title="Reconciliado">R</th>
                  </tr>
                </thead>
                <tbody>
                  {displayBillTxs.length === 0 && (
                    <tr>
                      <td colSpan={hasGer ? 7 : 6} className="text-center py-8 text-gray-500 text-xs">
                        Nenhum lançamento corresponde aos filtros
                      </td>
                    </tr>
                  )}
                  {displayBillTxs.map(tx => {
                    const cat = categories.find(c => c.id === tx.categoryId)
                    return (
                      <tr key={tx.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${tx.reconciled ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(tx.date)}</td>
                        <td className="px-4 py-3">
                          <p className="text-gray-200 text-sm">{tx.description}</p>
                          {tx.payee && <p className="text-xs text-gray-500">{tx.payee}</p>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {cat && (
                            <span className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-300">
                              {cat.icon} {cat.name}
                            </span>
                          )}
                        </td>
                        {hasGer && (
                          <td className="px-4 py-3">
                            {tx.grupoGerencial
                              ? <GerBadge grupoId={tx.grupoGerencial} gerencialGroups={gerencialGroups} />
                              : <span className="text-gray-700 text-xs">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-semibold text-orange-600 whitespace-nowrap text-sm">
                          {fmt(tx.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => setEditTx(tx)}
                              title="Editar"
                              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(tx)}
                              title="Excluir"
                              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setReconciled([tx.id], !tx.reconciled)}
                            title={tx.reconciled ? 'Reconciliado — clique para desmarcar' : 'Marcar como reconciliado'}
                            className="p-1 rounded hover:bg-gray-700/50 transition-colors"
                          >
                            {tx.reconciled
                              ? <CheckCircle2 size={15} className="text-emerald-500" />
                              : <Circle size={15} className="text-gray-600 hover:text-gray-400" />}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t-2 border-gray-700 bg-gray-900/30 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-300">Total da Fatura</span>
              <span className="text-sm font-bold text-orange-600">{fmt(billTotal)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Modais ── */}

      {showReconciliar && (
        <ReconciliarModal
          items={billPending}
          onApply={setReconciled}
          onClose={() => setShowReconciliar(false)}
        />
      )}

      <Modal open={showNewTx} onClose={() => setShowNewTx(false)} title="Novo Lançamento" size="lg">
        <TransactionForm
          initial={{ type: 'expense', accountId: selectedCard?.id, date: today(), faturaMonthYear: billKey }}
          onClose={() => setShowNewTx(false)}
        />
      </Modal>

      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="Editar Lançamento" size="lg">
        <TransactionForm
          initial={editTx}
          onClose={() => setEditTx(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteTransaction(confirmDelete.id); setConfirmDelete(null) }}
        title="Excluir Lançamento"
        message={`Excluir "${confirmDelete?.description}"?`}
        danger
      />

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Pagar Fatura do Cartão" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Conta de Débito</label>
            <select className="input" value={payFromAccount} onChange={e => setPayFromAccount(e.target.value)}>
              <option value="">Selecione a conta...</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.apelido || a.name} — {fmt(a.balance)}</option>
              ))}
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
            <button className="btn-secondary flex-1" onClick={() => setShowPayModal(false)}>Cancelar</button>
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
