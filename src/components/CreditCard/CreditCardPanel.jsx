import { useState, useMemo } from 'react'
import {
  CreditCard, DollarSign, Calendar, FileText, FileBarChart, ArrowLeft,
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, CheckCircle2, Circle, CheckSquare, RotateCcw,
  ListChecks, PencilLine, Check, X, ArrowUpCircle, AlertTriangle,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useRegisterFab } from '../../context/FabContext'
import { fmt, fmtDate, today, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros, accountsForView, classifyFatura } from '../shared/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TxMobileItem from '../shared/TxMobileItem'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import GerencialTotalizer from '../shared/GerencialTotalizer'
import ReconciliarModal from '../shared/ReconciliarModal'
import BulkEditModal from '../shared/BulkEditModal'
import TransactionForm from '../Transactions/TransactionForm'
import ExtratoGerencial from './ExtratoGerencial'
import RelatorioFatura from './RelatorioFatura'
import DateInput from '../shared/DateInput'

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
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
  else if (grupo.number === 'D') cls += ' bg-gray-700/60 text-gray-500'
  else cls += ' bg-orange-500/20 text-orange-600'
  return <span className={cls}>{grupo.alias}</span>
}

// ─── Main panel ───────────────────────────────────────────────────────────────

// Indicador informativo da diferença entre o pago e o total da fatura (diferenca = pago − fatura).
// Sempre par cor+ícone (sem verde/vermelho). Tolerância de 1 centavo evita "pago a mais R$0,00".
function DiferencaPagamento({ diferenca, compact = false, className = '' }) {
  let label, color, Icon
  if (diferenca > 0.01) { label = `Pago a mais ${fmt(diferenca)}`; color = 'text-blue-400'; Icon = ArrowUpCircle }
  else if (diferenca < -0.01) { label = `Falta pagar ${fmt(-diferenca)}`; color = 'text-amber-500'; Icon = AlertTriangle }
  else { label = 'Quitada totalmente'; color = 'text-gray-400'; Icon = CheckCircle2 }
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${color} ${className}`}>
      <Icon size={compact ? 11 : 13} className="shrink-0" />
      {label}
    </span>
  )
}

export default function CreditCardPanel() {
  const {
    profileAccounts: accounts,
    profileTransactions: transactions,
    profileSchedules: schedules,
    categories, gerencialGroups,
    addTransaction, deleteTransaction, setReconciled, recalcularAgendamentosFatura,
    reconciliarGerencial,
  } = useApp()
  const isMobile = useIsMobile()
  const [toast, setToast] = useState(null)
  const [reconciling, setReconciling] = useState(false)

  const handleReconciliarGerencial = async () => {
    if (!selectedCard || reconciling) return
    setReconciling(true)
    try {
      const r = await reconciliarGerencial(selectedCard.id)
      // Auditoria: ao contrário de apenas marcar reconciled=true, este botão recalcula
      // (cria/atualiza/remove) os agendamentos gerenciais da(s) fatura(s) do cartão via
      // reconcileFaturaState e corrige os saldos das contas Ger. Detalhe completo no resumo.
      console.log('[Reconciliar Gerenciais] resumo:', {
        cartao: selectedCard.apelido || selectedCard.name,
        agendasCriadas: r.agendasCriadas,
        agendasAtualizadas: r.agendasAtualizadas,
        agendasRemovidas: r.agendasRemovidas,
        saldosCorrigidos: r.saldosCorrigidos,
        detalhes: r.detalhes,
      })
      const totalAgendas = r.agendasCriadas + r.agendasAtualizadas + r.agendasRemovidas
      if (totalAgendas === 0 && r.saldosCorrigidos === 0) {
        setToast('✓ Tudo sincronizado')
      } else {
        const ag = `${totalAgendas} agendamento${totalAgendas !== 1 ? 's' : ''} ajustado${totalAgendas !== 1 ? 's' : ''}`
        const sl = `${r.saldosCorrigidos} saldo${r.saldosCorrigidos !== 1 ? 's' : ''} corrigido${r.saldosCorrigidos !== 1 ? 's' : ''}`
        setToast(`🔄 ${ag}, ${sl}`)
      }
    } catch (e) {
      setToast(`Erro ao reconciliar: ${e.message}`)
    } finally {
      setReconciling(false)
    }
  }

  const creditCards = useMemo(() => accountsForView(accounts.filter(a => a.type === 'credit' && a.active !== false), isMobile), [accounts, isMobile])
  const bankAccounts = useMemo(() => accountsForView(accounts.filter(a => a.type !== 'credit'), isMobile), [accounts, isMobile])

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
    setSelectMode(false); setSelectedIds(new Set())
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

  // ── Pagamentos da fatura selecionada ─────────────────────────────────────
  // Lançamentos credit_payment do cartão atual cuja fatura_ref OU mês da data caem na
  // fatura selecionada. Não entram no totalizador gerencial nem no billTotal.
  const billPayments = useMemo(() => {
    if (!selectedCard || !billKey) return []
    return transactions
      .filter(tx =>
        // credit_payment do cartão (casado por fatura_ref ou mês da data)
        (tx.type === 'credit_payment' &&
          tx.accountId === selectedCard.id &&
          ((tx.faturaMonthYear && tx.faturaMonthYear === billKey) || (tx.date || '').slice(0, 7) === billKey))
        // pagamento REAL via transferência vinculada (destino = cartão + fatura_month_year)
        || (tx.type === 'transfer' && tx.toAccountId === selectedCard.id && tx.faturaMonthYear === billKey)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, selectedCard, billKey])

  // Agendamentos tipo='pagamento_fatura' já registrados (ocorrências) deste cartão/fatura.
  const scheduledPaidTotal = useMemo(() => {
    if (!selectedCard || !billKey) return 0
    return (schedules || [])
      .filter(s => s.tipo === 'pagamento_fatura' && s.cardId === selectedCard.id && s.faturaMesAno === billKey)
      .reduce((sum, s) => sum + (s.registered?.length || 0) * (Number(s.amount) || 0), 0)
  }, [schedules, selectedCard, billKey])

  // Pagamentos REAIS (credit_payment + transferências vinculadas) da fatura.
  const totalPagoReal = useMemo(
    () => Math.round(billPayments.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100,
    [billPayments]
  )
  // Prevalência: havendo pagamento real, ele PREVALECE sobre o valor abstrato do agendamento
  // pagamento_fatura (anti-duplicidade). Sem pagamento real, mantém o abstrato (faturas históricas).
  const totalPago = useMemo(
    () => totalPagoReal > 0 ? totalPagoReal : Math.round(scheduledPaidTotal * 100) / 100,
    [totalPagoReal, scheduledPaidTotal]
  )
  const { saldoRestante, isFaturaPaga, isFaturaParcial } = classifyFatura(billTotal, totalPago)
  // Diferença pago − fatura. NUNCA armazenada: recalculada no render a partir de totalPago e
  // billTotal (ambos reativos a `transactions`), então reage a reimportações que mudem o billTotal.
  const diferencaPagamento = Math.round((totalPago - billTotal) * 100) / 100

  // Filtros em tempo real — afetam só as linhas exibidas; o Total da Fatura segue
  // calculado sobre a fatura completa (billTotal).
  const [filtros, setFiltros] = useState(EMPTY_LANC_FILTROS)
  const displayBillTxs = useMemo(
    () => hasLancFiltros(filtros) ? billTxs.filter(tx => matchLancFiltros(tx, filtros, accounts)) : billTxs,
    [billTxs, filtros, accounts]
  )

  // Reconciliação — lançamentos NÃO reconciliados da fatura em exibição.
  const [showReconciliar, setShowReconciliar] = useState(false)
  const [bulkEditTxs, setBulkEditTxs] = useState(null)
  const billPending = useMemo(
    () => billTxs.filter(tx => !tx.reconciled).sort((a, b) => a.date.localeCompare(b.date)),
    [billTxs]
  )

  // ── Seleção múltipla (modo "Selecionar") ──
  // Espelha o padrão do Extrato de Conta: checkbox por linha + barra de ações flutuante
  // para "Alterar Selecionados" (BulkEditModal → altera a data de sistema em lote via API)
  // e conciliar/desconciliar em lote. Reaproveita setReconciled e bulkUpdateTransactions.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()) }
  const toggleSelectMode = () => selectMode ? exitSelect() : setSelectMode(true)

  const selectableIds = useMemo(() => displayBillTxs.map(tx => tx.id), [displayBillTxs])
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  const toggleSelectAllVisible = () => setSelectedIds(prev => {
    if (allVisibleSelected) {
      const next = new Set(prev)
      selectableIds.forEach(id => next.delete(id))
      return next
    }
    return new Set([...prev, ...selectableIds])
  })
  const selectedTxs = useMemo(
    () => transactions.filter(tx => selectedIds.has(tx.id)),
    [transactions, selectedIds]
  )
  const handleBulkReconcile = (value) => {
    if (selectedIds.size === 0) return
    setReconciled([...selectedIds], value)
    const n = selectedIds.size
    setToast(`${n} ${n !== 1 ? 'lançamentos' : 'lançamento'} ${value ? (n !== 1 ? 'conciliados' : 'conciliado') : (n !== 1 ? 'desconciliados' : 'desconciliado')}`)
  }

  // FAB mobile: novo lançamento no cartão/fatura selecionados (inativo nas
  // subtelas de extrato/relatório, onde o modal não está montado).
  useRegisterFab(
    () => { if (!showExtrato && !showRelatorio) setShowNewTx(true) },
    [showExtrato, showRelatorio]
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
      faturaMonthYear: billKey, // vincula o pagamento à fatura aberta
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

      {/* ── Header (seletor + KPIs) — fixo no topo ao rolar apenas no desktop (md+);
             no mobile rola normalmente para liberar a tela à lista ── */}
      <div className="space-y-4 md:sticky md:top-0 md:z-20 md:bg-gray-950 md:pb-2 md:-mb-2">

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
            onClick={() => { exitSelect(); setBillKey(k => offsetBillKey(k, -1)) }}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-gray-200 px-3 whitespace-nowrap min-w-[160px] text-center">
            {getBillLabel(billKey)}
          </span>
          <button
            onClick={() => { exitSelect(); setBillKey(k => offsetBillKey(k, +1)) }}
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

      {/* Diferença de pagamento — compacta no header (mobile; rola junto com o cabeçalho) */}
      <div className="md:hidden flex items-center justify-between gap-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Diferença</span>
        <DiferencaPagamento diferenca={diferencaPagamento} compact />
      </div>

      {/* ── KPIs + botões de ação ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
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
          <p className="text-2xl font-bold text-receita">
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
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <CheckCircle2 size={13} />
            <span className="text-xs uppercase tracking-wide">{totalPago === 0 ? 'Saldo a Pagar' : 'Valor Pago'}</span>
          </div>
          <p className={`text-2xl font-bold ${isFaturaPaga ? 'text-emerald-400' : isFaturaParcial ? 'text-orange-500' : 'text-gray-200'}`}>
            {fmt(totalPago === 0 ? saldoRestante : totalPago)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            de {fmt(billTotal)} · {isFaturaPaga ? 'Paga ✓' : isFaturaParcial ? 'Parcialmente paga' : 'Não paga'}
          </p>
          <DiferencaPagamento diferenca={diferencaPagamento} className="mt-1.5" />
        </div>
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary flex-1 hidden md:flex items-center justify-center gap-2 text-sm"
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
          <button
            className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors py-1"
            onClick={handleReconciliarGerencial}
            disabled={reconciling}
            title="Reconcilia agendamentos gerenciais e saldos das contas Ger. deste cartão"
          >
            <RotateCcw size={12} className={reconciling ? 'animate-spin' : ''} />
            {reconciling ? 'Reconciliando…' : '🔄 Reconciliar Gerenciais'}
          </button>
        </div>
      </div>
      </div>

      {/* ── Tabela de lançamentos da fatura ── */}
      <div className="card p-0 overflow-hidden">
        {/* Linha de resumo no topo do extrato da fatura */}
        <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-gray-500">
            Fatura <span className="text-gray-300 font-medium">{fmt(billTotal)}</span>
            {' · '}Pago <span className="text-gray-300 font-medium">{fmt(totalPago)}</span>
          </span>
          <DiferencaPagamento diferenca={diferencaPagamento} />
        </div>
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-300">{getBillLabel(billKey)}</h3>
          <div className="flex items-center gap-3">
            {hasGer && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-reserva/20 text-reserva text-xs font-bold">G</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 text-xs font-bold">2+</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500 text-xs font-bold">D</span>
              </div>
            )}
            {billTxs.length > 0 && (
              <button
                onClick={toggleSelectMode}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                title={selectMode ? 'Sair do modo de seleção' : 'Selecionar lançamentos para alterar ou conciliar'}
              >
                <ListChecks size={12} /> {selectMode ? 'Cancelar Seleção' : 'Selecionar'}
              </button>
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

            {/* Mobile: cards estilo app bancário */}
            <div className="md:hidden">
              {billPayments.map(p => (
                <TxMobileItem
                  key={p.id}
                  type="credit_payment"
                  title="Pagamento de Fatura"
                  dateLabel={fmtDate(p.date)}
                  amount={p.amount}
                />
              ))}
              {displayBillTxs.length === 0 ? (
                <p className="text-center py-8 text-gray-500 text-xs">Nenhum lançamento corresponde aos filtros</p>
              ) : displayBillTxs.map(tx => (
                <TxMobileItem
                  key={tx.id}
                  type="expense"
                  title={tx.payee || tx.description || 'Despesa'}
                  subtitle={tx.payee ? tx.description : null}
                  dateLabel={fmtDate(tx.date)}
                  amount={tx.amount}
                  dimmed={!tx.reconciled}
                  onClick={selectMode ? () => toggleSelect(tx.id) : () => setEditTx(tx)}
                  leading={
                    selectMode ? (
                      <input
                        type="checkbox"
                        className="accent-[#0F6E56] shrink-0"
                        checked={selectedIds.has(tx.id)}
                        onChange={() => toggleSelect(tx.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setReconciled([tx.id], !tx.reconciled) }}
                        className="p-1 rounded hover:bg-gray-700/50 transition-colors shrink-0"
                        title={tx.reconciled ? 'Reconciliado — toque para desmarcar' : 'Marcar como reconciliado'}
                      >
                        {tx.reconciled
                          ? <CheckCircle2 size={16} className="text-emerald-500" />
                          : <Circle size={16} className="text-gray-600" />}
                      </button>
                    )
                  }
                />
              ))}
            </div>

            {/* Desktop: tabela */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {selectMode && (
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          className="accent-[#0F6E56]"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          title="Selecionar todos os visíveis"
                        />
                      </th>
                    )}
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
                  {/* Pagamentos da fatura (credit_payment) — linhas destacadas no topo */}
                  {billPayments.map(p => (
                    <tr key={p.id} className="border-b border-gray-800/50 bg-green-900/30">
                      {selectMode && <td className="px-3 py-3" />}
                      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                          <span className="text-emerald-300 text-sm font-medium">Pagamento de Fatura</span>
                          <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">PAGAMENTO</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell" />
                      {hasGer && <td className="px-4 py-3" />}
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400 whitespace-nowrap text-sm">{fmt(p.amount)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-2 py-3" />
                    </tr>
                  ))}
                  {displayBillTxs.length === 0 && (
                    <tr>
                      <td colSpan={(hasGer ? 7 : 6) + (selectMode ? 1 : 0)} className="text-center py-8 text-gray-500 text-xs">
                        Nenhum lançamento corresponde aos filtros
                      </td>
                    </tr>
                  )}
                  {displayBillTxs.map(tx => {
                    const cat = categories.find(c => c.id === tx.categoryId)
                    const isSelected = selectedIds.has(tx.id)
                    return (
                      <tr
                        key={tx.id}
                        onClick={selectMode ? () => toggleSelect(tx.id) : undefined}
                        className={`border-b border-gray-800/50 transition-colors ${selectMode ? 'cursor-pointer' : ''} ${selectMode && isSelected ? 'bg-blue-500/10' : 'hover:bg-gray-800/30'} ${tx.reconciled ? '' : 'opacity-60'}`}
                      >
                        {selectMode && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              className="accent-[#0F6E56]"
                              checked={isSelected}
                              onChange={() => toggleSelect(tx.id)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {tx.dateCartao && tx.dateCartao !== tx.date ? (
                            <>
                              <span className="block">Sistema: {fmtDate(tx.date)}</span>
                              <span className="block text-[10px] text-gray-600">Cartão: {fmtDate(tx.dateCartao)}</span>
                            </>
                          ) : (
                            fmtDate(tx.date)
                          )}
                        </td>
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
                              onClick={(e) => { e.stopPropagation(); setEditTx(tx) }}
                              title="Editar"
                              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                            >
                              <Edit2 size={11} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(tx) }}
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
                            onClick={(e) => { e.stopPropagation(); setReconciled([tx.id], !tx.reconciled) }}
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
            <div className="px-4 py-3 border-t-2 border-gray-700 bg-surface/30 flex items-center justify-between">
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
          onAlterar={(txs) => { setShowReconciliar(false); setBulkEditTxs(txs) }}
        />
      )}

      {bulkEditTxs && (
        <BulkEditModal
          txs={bulkEditTxs}
          onClose={() => setBulkEditTxs(null)}
          onApplied={(n) => { exitSelect(); setToast(`${n} ${n === 1 ? 'lançamento alterado' : 'lançamentos alterados'}`) }}
        />
      )}

      {/* Espaçador p/ a barra de ações fixa não cobrir o último lançamento (mais alto no
          mobile por causa da navegação inferior). */}
      {selectMode && <div className="h-36 md:h-24" />}

      {/* ── Barra de ações (modo Selecionar) — acima do BottomNav no mobile ── */}
      {selectMode && (
        <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-[45] px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-3xl bg-surface border border-gray-700 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-300 font-medium">
              {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <button
                onClick={() => setBulkEditTxs(selectedTxs)}
                disabled={selectedIds.size === 0}
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PencilLine size={12} /> Alterar Selecionados
              </button>
              <button
                onClick={() => handleBulkReconcile(true)}
                disabled={selectedIds.size === 0}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Conciliar lançamentos selecionados"
              >
                <Check size={12} /> Conciliar
              </button>
              <button
                onClick={() => handleBulkReconcile(false)}
                disabled={selectedIds.size === 0}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Desconciliar lançamentos selecionados"
              >
                <Circle size={12} /> Desconciliar
              </button>
              <button
                onClick={exitSelect}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
              >
                <X size={12} /> Cancelar
              </button>
            </div>
          </div>
        </div>
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
            <DateInput className="input" value={payDate} onChange={e => setPayDate(e.target.value)} />
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
