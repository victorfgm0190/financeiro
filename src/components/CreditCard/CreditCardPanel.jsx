import { useState, useMemo, useEffect, useRef } from 'react'
import EscolhaBaixaExclusao from '../shared/EscolhaBaixaExclusao'
import {
  CreditCard, DollarSign, Calendar, FileText, FileBarChart, ArrowLeft,
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, CheckCircle2, Circle, CheckSquare,
  ListChecks, PencilLine, Check, X, ArrowUpCircle, AlertTriangle, MoreHorizontal, ShieldCheck,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useRegisterFab } from '../../context/FabContext'
import { fmt, fmtDate, today, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros, accountsForView } from '../shared/utils'
import { ORIGIN } from '../../lib/origins'
import { agendamentosPrevistosDaFatura } from '../../lib/gerencialPrevistos'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useScrollSaver } from '../../hooks/useScrollRestoration'
import Modal from '../shared/Modal'
import DataPagamentoField from '../shared/DataPagamentoField'
import { dataPadraoPagamento, hojeSP } from '../../lib/dataPagamento'
import { faturaDoCartao } from '../../lib/fatura'
import { faturaToDate, textoDataCompra } from '../../lib/parcelas'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TxMobileItem from '../shared/TxMobileItem'
import SeloPagamentoCartao from '../shared/SeloPagamentoCartao'
import { ROTULO_PAGAMENTO_CARTAO } from '../../lib/rotuloMovimento'
import ReconcileBadge from '../shared/ReconcileBadge'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import GerencialTotalizer from '../shared/GerencialTotalizer'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import ReconciliarModal from '../shared/ReconciliarModal'
import BulkEditModal from '../shared/BulkEditModal'
import TransactionForm from '../Transactions/TransactionForm'
import AccountForm from '../Accounts/AccountForm'
import DuplicateButton from '../shared/DuplicateButton'
import ExtratoFatura from './ExtratoFatura'
import VerificarCorrigirModal from './VerificarCorrigirModal'
import { avisoDaFatura } from '../../lib/verificarCartao'
import { getSessao } from '../../lib/api'
import RelatorioFatura from './RelatorioFatura'
import { lancamentosDaFatura, situacaoDaFatura, faturaPadraoDoCartao, previstoDaFaturaFn, pagoDaFatura } from '../../lib/faturaCartao'
import InputMoeda from '../shared/InputMoeda'
import SeloCambio from '../shared/SeloCambio'
import HelpCampo from '../shared/HelpCampo'

// ─── Helpers (mirrors TransactionsPanel) ─────────────────────────────────────

// Mesma convenção de computeFaturaRef: dia <= closingDay → fatura do mês corrente;
// dia > closingDay → fatura do mês seguinte (a fatura do mês M fecha no dia F de M).
// Fonte única (lib/fatura): mesmo fechamento padrão do resto do app.
const getBillKey = (date, card) => faturaDoCartao(date, card)

// Fatura de um lançamento: lib/faturaCartao faturaDoLancamento (fonte única).

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
  else if (grupo.number === 'D') cls += ' bg-surface-hover/60 text-texto-3'
  else cls += ' bg-despesa/20 text-despesa'
  return <span className={cls}>{grupo.alias}</span>
}

// Badge cinza pequeno com o id do lançamento — clique copia o id para a área de transferência.
function CopyIdBadge({ id }) {
  const [copied, setCopied] = useState(false)
  if (!id) return null
  const copy = (e) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Clique para copiar o ID"
      className="mt-0.5 inline-block font-mono text-[9px] text-texto-3 hover:text-texto-2 bg-surface-2/60 hover:bg-surface-hover/60 px-1 py-0.5 rounded transition-colors"
    >
      {copied ? 'copiado!' : id}
    </button>
  )
}

// Badge amarelo de parcela ("3/12") — mesmo estilo do badge de parcela da importação.
// Retorna null quando o lançamento não é parcelado (num nulo/0).
function InstallmentBadge({ num, total, dataCompra = null }) {
  if (!num || num <= 0) return null
  const compra = textoDataCompra(dataCompra)
  return (
    <span className="mt-0.5 mr-1.5 inline-block bg-surface-2 text-texto-2 text-xs px-1.5 py-0.5 rounded font-medium"
      title={compra ? `Parcela ${num}/${total || '?'} · ${compra}` : undefined}>
      {num}/{total || '?'}{compra && <span className="font-normal"> · {compra}</span>}
    </span>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

// Indicador informativo da diferença entre o pago e o total da fatura (diferenca = pago − fatura).
// Sempre par cor+ícone (sem verde/vermelho). Tolerância de 1 centavo evita "pago a mais R$0,00".
function DiferencaPagamento({ diferenca, semValor = false, compact = false, className = '' }) {
  let label, color, Icon
  if (semValor) { label = 'Nada a pagar'; color = 'text-texto-3'; Icon = CheckCircle2 }
  else if (diferenca > 0.01) { label = `Pago a mais ${fmt(diferenca)}`; color = 'text-receita'; Icon = ArrowUpCircle }
  else if (diferenca < -0.01) { label = `Falta pagar ${fmt(-diferenca)}`; color = 'text-aviso'; Icon = AlertTriangle }
  else { label = 'Quitada totalmente'; color = 'text-texto-2'; Icon = CheckCircle2 }
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
    addTransaction, deleteTransaction, setReconciled, getOccurrencesProjecao: getNextOccurrences,
    isFaturaFechada, fecharFatura, abrirFatura, creditUsage, pode, settings,
  } = useApp()
  // Nível de acesso (Cartão de Crédito): novo lançamento/pagar fatura = incluir; fechar/abrir,
  // atualizar, revisar, reconciliar e seleção = editar; excluir = excluir. Sem permissão o botão some.
  const podeIncluir = pode('cartao', 'incluir')
  const podeEditar = pode('cartao', 'editar')
  const podeExcluir = pode('cartao', 'excluir')
  // "Editar cartão": o MESMO AccountForm da tela Contas (updateAccount) — permissão de Contas.
  const podeEditarCartao = pode('contas', 'editar')
  const [editarCartao, setEditarCartao] = useState(false)
  const isMobile = useIsMobile()
  const [toast, setToast] = useState(null)
  // "Verificar e corrigir" (substitui Atualizar, Revisar Movimentos Automáticos e Reconciliar
  // Gerenciais): { secao } aberto, ou null. Menu "⋯ Mais", só administrador.
  const [verificar, setVerificar] = useState(null)
  const [menuMais, setMenuMais] = useState(false)
  const ehAdministrador = getSessao()?.nivel === 'admin'

  const creditCards = useMemo(() => accountsForView(accounts.filter(a => a.type === 'credit' && a.active !== false), isMobile), [accounts, isMobile])
  const bankAccounts = useMemo(() => accountsForView(accounts.filter(a => a.type !== 'credit'), isMobile), [accounts, isMobile])

  // ── State ────────────────────────────────────────────────────────────────
  // "Ir para a fatura" da aba Integridade deixa { cardId, faturaMesAno } em sessionStorage; é lido
  // (e apagado) uma vez, na montagem.
  const [faturaInicial] = useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem('finup:abrirFatura') || 'null')
      sessionStorage.removeItem('finup:abrirFatura')
      return v && creditCards.some(c => c.id === v.cardId) ? v : null
    } catch { return null }
  })
  const [selectedCardId, setSelectedCardId] = useState(() => faturaInicial?.cardId || creditCards[0]?.id || '')
  const [billKey, setBillKey] = useState(() => {
    if (faturaInicial?.faturaMesAno) return faturaInicial.faturaMesAno
    const card = creditCards[0]
    return card ? getBillKey(today(), card) : ''
  })
  // Fatura inicial = a fatura padrão do cartão (lib/faturaCartao faturaPadraoDoCartao, a MESMA do
  // Extrato e do Relatório pelo menu): a fechada não paga; senão a aberta. Escolhida uma vez, quando
  // os lançamentos chegam; "Ir para a fatura" (faturaInicial) e a navegação do usuário mandam.
  const faturaPadraoEscolhida = useRef(!!faturaInicial?.faturaMesAno)
  useEffect(() => {
    if (faturaPadraoEscolhida.current || !transactions.length) return
    const card = accounts.find(a => a.id === selectedCardId) || creditCards[0]
    if (!card) return
    faturaPadraoEscolhida.current = true
    // Uma vez só, quando os dados chegam (não é estado derivado: depois o usuário navega livremente).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBillKey(faturaPadraoDoCartao({ transactions, schedules, card, hoje: today(), previstoDe: previstoDaFaturaFn({ schedules, card, getOccurrences: getNextOccurrences }) }))
  }, [transactions, schedules, accounts, selectedCardId, creditCards, getNextOccurrences])
  const [showExtrato, setShowExtrato] = useState(false)
  const [showRelatorio, setShowRelatorio] = useState(false)
  const saveScroll = useScrollSaver()
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(hojeSP)
  const [payFromAccount, setPayFromAccount] = useState('')
  const [showNewTx, setShowNewTx] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [manterBaixa, setManterBaixa] = useState(false)
  const [showPrevistos, setShowPrevistos] = useState(false)

  // Duplicar lançamento de cartão: abre o form em modo NOVO (sem id) com os dados originais e a
  // data escolhida. Mantém o account_id do cartão e o grupo gerencial; descarta vínculos de
  // automação/série e fatura/dateCartao (recalculadas pela nova data). NÃO salva sozinho.
  // Parcelados: duplica só a parcela clicada (num/total/parentTxId descartados).
  const handleDuplicate = (tx, newDate) => {
    // eslint-disable-next-line no-unused-vars
    const { id, createdAt, scheduleId, origin, gerencialScheduleId, reservaAuto, parentTxId, installmentNum, installmentTotal, installmentKey, faturaMonthYear, dateCartao, dataOcorrencia, ...rest } = tx
    setEditTx({ ...rest, date: newDate || tx.date, origin: ORIGIN.DUPLICADO })
  }

  const selectedCard = useMemo(
    () => accounts.find(a => a.id === selectedCardId) || creditCards[0] || null,
    [accounts, selectedCardId, creditCards]
  )
  // Vencimento da fatura selecionada (mês da fatura + dia de vencimento do cartão, clampado ao
  // fim do mês): data padrão do "Pagar Fatura". Sem dueDay cadastrado não há vencimento.
  const vencimentoFatura = useMemo(() => {
    if (!billKey || !selectedCard?.dueDay) return null
    // faturaToDate: a mesma do motor das faturas e de proximoVencimentoCartao (lib/dashboardHoje).
    const [y, m] = billKey.split('-').map(Number)
    return faturaToDate(`${y}-${String(m).padStart(2, '0')}`, Number(selectedCard.dueDay))
  }, [billKey, selectedCard])

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
  // Fonte ÚNICA (lib/faturaCartao): a mesma do Extrato da Fatura e do Relatório Gerencial.
  const fatura = useMemo(() => lancamentosDaFatura(transactions, selectedCard, billKey), [transactions, selectedCard, billKey])
  const billTxs = useMemo(() => [...fatura.despesas].sort((a, b) => b.date.localeCompare(a.date)), [fatura])

  // Estornos da fatura (receitas lançadas no cartão) — abatem do total e aparecem
  // em linha separada no totalizador gerencial. Pagamentos de fatura (credit_payment)
  // não entram aqui (e billTxs já é só despesa).
  const billEstornos = fatura.estornos
  // Total da fatura = despesas − estornos (lib/faturaCartao).
  const billTotal = fatura.total
  // Lançamentos alimentados ao totalizador gerencial: despesas + estornos.
  const totalizerTxs = useMemo(() => [...billTxs, ...billEstornos], [billTxs, billEstornos])
  // Lista EXIBIDA da fatura: despesas + estornos numa lista só, ordenada por data.
  // Só afeta exibição/seleção/reconciliação — billTotal e o abatimento dos estornos
  // seguem calculados pela lib/faturaCartao.
  const billLancamentos = useMemo(
    () => [...billTxs, ...billEstornos].sort((a, b) => b.date.localeCompare(a.date)),
    [billTxs, billEstornos]
  )
  // Controle gerencial desligado: sem coluna Ger., totais por grupo e Extrato gerencial (o grupo
  // gravado nos lançamentos antigos continua no banco; só não aparece).
  const gerencialLigado = controleGerencialAtivo(settings)
  // Aviso automático da fatura (regras do motor de integridade só para ela + lançamento sem tipo).
  const aviso = useMemo(() => (selectedCard && billKey
    ? avisoDaFatura({ transactions, accounts, schedules, gerencialGroups, faturasFechadas: settings?.faturasFechadas || {}, card: selectedCard, fatura: billKey, hoje: today(), gerencialLigado })
    : null), [transactions, accounts, schedules, gerencialGroups, settings, selectedCard, billKey, gerencialLigado])
  const hasGer = gerencialLigado && billLancamentos.some(tx => tx.grupoGerencial)

  // ── Pagamentos da fatura selecionada ─────────────────────────────────────
  // Lançamentos credit_payment do cartão atual cuja fatura_ref OU mês da data caem na
  // fatura selecionada. Não entram no totalizador gerencial nem no billTotal.
  // credit_payment do cartão (casado por fatura_ref ou mês da data) e pagamento REAL via
  // transferência vinculada (destino = cartão + fatura_month_year) — lib/faturaCartao.
  const billPayments = useMemo(() => [...fatura.pagamentos].sort((a, b) => b.date.localeCompare(a.date)), [fatura])

  // Agendamentos tipo='pagamento_fatura' já registrados (ocorrências) deste cartão/fatura.

  // Despesas AGENDADAS (manuais) do cartão cujas próximas ocorrências PENDENTES caem na fatura
  // selecionada — projeção do que ainda vai entrar. getNextOccurrences já exclui ocorrências
  // registradas/puladas, evitando dupla contagem com os lançamentos já efetivados (billTotal).
  // Exclui os agendamentos automáticos da fatura (pagamento/devolução/resgate). Data e valor
  // EFETIVOS da ocorrência (override) — ver agendamentosPrevistosDaFatura.
  const agendamentosPrevistos = useMemo(() => (
    selectedCard && billKey
      ? agendamentosPrevistosDaFatura({
          schedules, cardId: selectedCard.id, billKey, getOccurrences: getNextOccurrences,
          billKeyOf: d => getBillKey(d, selectedCard),
        })
      : []
  ), [schedules, selectedCard, billKey, getNextOccurrences])
  const totalPrevisto = agendamentosPrevistos.reduce((sum, a) => sum + a.amount, 0)

  // Pago da fatura (lib/faturaCartao pagoDaFatura — a MESMA regra da fatura padrão): pagamentos
  // REAIS (credit_payment + transferências vinculadas) prevalecem; sem eles, as ocorrências
  // registradas do agendamento pagamento_fatura (faturas históricas). Anti-duplicidade.
  const totalPago = useMemo(
    () => pagoDaFatura(transactions, schedules, selectedCard, billKey, fatura),
    [transactions, schedules, selectedCard, billKey, fatura]
  )
  // REGRA DOS PREVISTOS (lib/faturaCartao situacaoDaFatura): as compras agendadas que ainda não
  // viraram lançamento contam em tudo o que fala DESTA fatura — total a pagar, Saldo a Pagar,
  // situação (Paga/Parcial/Não paga) e a diferença, no card e nas barras. A Dívida Total (uso do
  // limite) mostra só o já lançado, com os previstos à parte. Fatura sem valor: "Nada a pagar".
  const situacao = situacaoDaFatura({ total: billTotal, previsto: totalPrevisto, pago: totalPago })
  const isFaturaPaga = situacao.paga
  const isFaturaParcial = situacao.parcial
  const saldoAPagarComPrevistos = situacao.saldoRestante
  const billTotalComPrevistos = situacao.aPagar

  // Dívida Total / Limite Disponível: em aberto do cartão inteiro (todas as faturas não pagas),
  // independente do seletor de fatura. Não usa creditDebt (acumulador que infla com o tempo).
  const usoLimite = creditUsage(selectedCard?.id)

  // Fatura fechada: bloqueia novos lançamentos e importação; edição/exclusão dos existentes segue normal.
  const faturaFechada = isFaturaFechada(selectedCard?.id, billKey)
  const handleFecharFatura = () => {
    if (!selectedCard || !billKey) return
    fecharFatura(selectedCard.id, billKey)
    setToast('🔒 Fatura fechada.')
  }
  const handleAbrirFatura = () => {
    if (!selectedCard || !billKey) return
    abrirFatura(selectedCard.id, billKey)
    setToast('🔓 Fatura aberta.')
  }
  // Diferença pago − (fatura + previstos). NUNCA armazenada: recalculada no render, então reage a
  // reimportações que mudem o total.
  const diferencaPagamento = situacao.diferenca

  // Filtros em tempo real — afetam só as linhas exibidas; o Total da Fatura segue
  // calculado sobre a fatura completa (billTotal).
  const [filtros, setFiltros] = useState(EMPTY_LANC_FILTROS)
  const displayBillTxs = useMemo(
    () => hasLancFiltros(filtros) ? billLancamentos.filter(tx => matchLancFiltros(tx, filtros, accounts)) : billLancamentos,
    [billLancamentos, filtros, accounts]
  )

  // Reconciliação — lançamentos NÃO reconciliados da fatura em exibição.
  const [showReconciliar, setShowReconciliar] = useState(false)
  const [bulkEditTxs, setBulkEditTxs] = useState(null)
  const billPending = useMemo(
    () => billLancamentos.filter(tx => !tx.reconciled).sort((a, b) => a.date.localeCompare(b.date)),
    [billLancamentos]
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

  // FAB mobile: novo lançamento no cartão/fatura selecionados — não repete o card "Lançamento"
  // (já vem no cartão). Sem item nas subtelas de extrato/relatório (o modal não está montado) e
  // com a fatura fechada.
  const fabCartao = podeIncluir && selectedCard && !showExtrato && !showRelatorio && !faturaFechada
  useRegisterFab(
    fabCartao ? () => setShowNewTx(true) : null,
    [fabCartao, selectedCard?.id],
    `Novo lançamento no cartão ${selectedCard?.apelido || selectedCard?.name || ''}`.trim()
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
        <CreditCard size={40} className="text-texto-3 mx-auto mb-4" />
        <p className="text-texto-2 mb-2">Nenhum cartão de crédito cadastrado</p>
        <p className="text-texto-3 text-sm">Adicione um cartão na seção Contas</p>
      </div>
    )
  }

  if (showExtrato) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors"
          onClick={() => { saveScroll(); setShowExtrato(false) }}
        >
          <ArrowLeft size={14} /> Voltar ao Cartão
        </button>
        <ExtratoFatura initialCardId={selectedCard?.id} initialBillKey={billKey} />
      </div>
    )
  }

  if (showRelatorio) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors"
          onClick={() => { saveScroll(); setShowRelatorio(false) }}
        >
          <ArrowLeft size={14} /> Voltar ao Cartão
        </button>
        <RelatorioFatura initialCardId={selectedCard?.id} initialBillKey={billKey} />
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header (seletor + KPIs) — fixo no topo ao rolar apenas no desktop (md+);
             no mobile rola normalmente para liberar a tela à lista ── */}
      <div className="space-y-4 md:sticky md:top-0 md:z-20 md:bg-page md:pb-2 md:-mb-2">

      {/* ── Seletor de cartão + navegador de fatura ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Dropdown de cartão */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]" data-help-form="seletorCartao" data-help-id="filtroCartao.cartao">
          <CreditCard size={15} className="text-texto-2 shrink-0" />
          <select
            data-guia="credit.cartao"
            className="bg-surface-2 border border-borda-campo text-texto-1 rounded-lg px-3 py-2 text-sm focus:outline-none w-full min-w-0"
            value={selectedCardId}
            onChange={e => handleCardChange(e.target.value)}
          >
            {creditCards.map(c => (
              <option key={c.id} value={c.id}>{c.apelido || c.name}</option>
            ))}
          </select>
          <HelpCampo campo="filtroCartao.cartao" />
          {podeEditarCartao && selectedCard && (
            <button type="button" data-guia="credit.editar-cartao" onClick={() => setEditarCartao(true)} title="Editar cartão" aria-label="Editar cartão"
              className="p-2 rounded-lg border border-borda-campo bg-surface-2 text-texto-2 hover:text-texto-1 hover:bg-surface-hover transition-colors shrink-0 min-h-[38px]">
              <Edit2 size={14} />
            </button>
          )}
        </div>

        {/* Navegador de fatura */}
        <div data-guia="credit.fatura" className="flex items-center gap-1 bg-surface-2 border border-borda-forte rounded-lg px-1 py-1 shrink-0">
          <button
            onClick={() => { exitSelect(); setBillKey(k => offsetBillKey(k, -1)) }}
            className="p-1.5 text-texto-2 hover:text-texto-1 hover:bg-surface-hover rounded transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-medium text-texto-1 px-3 whitespace-nowrap min-w-[160px] text-center">
            {getBillLabel(billKey)}
          </span>
          <button
            onClick={() => { exitSelect(); setBillKey(k => offsetBillKey(k, +1)) }}
            className="p-1.5 text-texto-2 hover:text-texto-1 hover:bg-surface-hover rounded transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Links auxiliares */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {/* Extrato da Fatura: a fatura como o banco mostra (sem grupo gerencial). */}
          <button
            data-guia="credit.extrato"
            onClick={() => { saveScroll(); setShowExtrato(true) }}
            className="btn-amber"
            title="A fatura como o banco mostra: lançamentos, parcelas, estornos e o total, sem grupos gerenciais"
          >
            <FileText size={13} /> Extrato da Fatura
          </button>
          <button
            data-guia="credit.relatorio"
            onClick={() => { saveScroll(); setShowRelatorio(true) }}
            className="btn-amber"
            title={gerencialLigado
              ? 'A fatura separada por grupo gerencial (cards com valor e %), e o extrato gerencial por data'
              : 'A fatura com o total e os gastos por categoria'}
          >
            <FileBarChart size={13} /> {gerencialLigado ? 'Relatório Gerencial da Fatura' : 'Relatório da Fatura'}
          </button>
        </div>
      </div>

      {/* Diferença de pagamento — compacta no header (mobile; rola junto com o cabeçalho) */}
      <div className="md:hidden flex items-center justify-between gap-2 bg-surface-2/60 border border-borda-forte rounded-lg px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-texto-3">Diferença</span>
        <DiferencaPagamento diferenca={diferencaPagamento} semValor={situacao.semValor} compact />
      </div>

      {/* ── KPIs + botões de ação ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Fatura Selecionada ocupa a linha inteira no mobile (col-span-2) p/ os "previstos"/
            "total" caberem — no grid estreito de 2 colunas ficavam apertados/cortados. */}
        <div data-guia="credit.fatura-selecionada" className="card col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <Calendar size={13} />
            <span className="text-xs uppercase tracking-wide">Fatura Selecionada</span>
          </div>
          <p className="text-2xl font-bold text-despesa">{fmt(billTotal)}</p>
          <p className="text-xs text-texto-3 mt-1">{billLancamentos.length} lançamento{billLancamentos.length !== 1 ? 's' : ''}</p>
          {totalPrevisto > 0 && (
            <>
              <p className="text-xs text-texto-2 mt-1">
                + <span className="text-texto-2">{fmt(totalPrevisto)} previstos</span>
              </p>
              <p className="text-sm font-semibold text-texto-1 mt-0.5">
                = {fmt(billTotal + totalPrevisto)} total
              </p>
            </>
          )}
        </div>
        <div data-guia="credit.limite" className="card">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <DollarSign size={13} />
            <span className="text-xs uppercase tracking-wide">Limite Disponível</span>
          </div>
          <p className="text-2xl font-bold text-receita">
            {fmt((selectedCard?.creditLimit || 0) - usoLimite)}
          </p>
          <p className="text-xs text-texto-3 mt-1">de {fmt(selectedCard?.creditLimit || 0)}</p>
        </div>
        <div data-guia="credit.divida-total" className="card">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <CreditCard size={13} />
            <span className="text-xs uppercase tracking-wide">Dívida Total</span>
          </div>
          <p className="text-2xl font-bold text-texto-1">{fmt(usoLimite)}</p>
          <p className="text-xs text-texto-3 mt-1">Fecha dia {selectedCard?.closingDay || '—'} · Vence dia {selectedCard?.dueDay || '—'}</p>
          {totalPrevisto > 0 && (
            <p className="text-xs text-texto-3 mt-0.5" title="A Dívida Total é o que já foi lançado no cartão. As compras agendadas entram quando viram lançamento.">
              + {fmt(totalPrevisto)} previstos nesta fatura (ainda não lançados)
            </p>
          )}
        </div>
        <div data-guia="credit.pagamento" className="card">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <CheckCircle2 size={13} />
            <span className="text-xs uppercase tracking-wide">{totalPago === 0 ? 'Saldo a Pagar' : 'Valor Pago'}</span>
          </div>
          <p className={`text-2xl font-bold ${isFaturaPaga ? 'text-primary-fg' : isFaturaParcial ? 'text-aviso' : 'text-texto-1'}`}>
            {fmt(totalPago === 0 ? saldoAPagarComPrevistos : totalPago)}
          </p>
          <p className="text-xs text-texto-3 mt-1">
            de {fmt(billTotalComPrevistos)} · {situacao.semValor ? 'Nada a pagar' : isFaturaPaga ? 'Paga ✓' : isFaturaParcial ? 'Parcialmente paga' : 'Não paga'}
          </p>
          <DiferencaPagamento diferenca={diferencaPagamento} semValor={situacao.semValor} className="mt-1.5" />
          {podeEditar && <button
            data-guia="credit.fechar"
            onClick={faturaFechada ? handleAbrirFatura : handleFecharFatura}
            className={`mt-2 inline-block text-xs rounded px-3 py-1 border transition-colors ${
              faturaFechada
                ? 'text-primary-fg border-primary/40 hover:bg-primary/10'
                : 'text-perigo border-perigo/40 bg-perigo-bg hover:bg-perigo/20'
            }`}
          >
            {faturaFechada ? '🔓 Abrir Fatura' : '🔒 Fechar Fatura'}
          </button>}
        </div>
        <div className="flex flex-col gap-2">
          {podeIncluir && <button
            data-guia="credit.novo"
            disabled={faturaFechada}
            title={faturaFechada ? 'Fatura fechada — abra a fatura para adicionar lançamentos' : undefined}
            className={`btn-primary flex-1 hidden md:flex items-center justify-center gap-2 text-sm ${faturaFechada ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => setShowNewTx(true)}
          >
            <Plus size={14} /> Novo Lançamento
          </button>}
          {podeIncluir && <button
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
            data-guia="credit.pagar"
            onClick={() => { setShowPayModal(true); setPayAmount(String(billTotal)); setPayDate(dataPadraoPagamento(vencimentoFatura)) }}
          >
            <DollarSign size={14} /> Pagar Fatura
          </button>}
          {/* ⋯ Mais: ferramentas de conferência, só para administrador. "Verificar e corrigir" substitui
              Atualizar, Revisar Movimentos Automáticos e Reconciliar Gerenciais (prévia + confirmação). */}
          {ehAdministrador && podeEditar && (
            <div className="relative">
              <button type="button" data-guia="credit.mais" aria-haspopup="menu" aria-expanded={menuMais}
                className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                onClick={() => setMenuMais(m => !m)}>
                <MoreHorizontal size={14} /> Mais
              </button>
              {menuMais && (
                <div role="menu" className="absolute right-0 mt-1 z-30 w-64 card p-1 shadow-xl border border-borda">
                  <button type="button" role="menuitem" data-guia="credit.verificar"
                    className="w-full text-left text-sm px-3 py-2 rounded hover:bg-surface-hover flex items-center gap-2"
                    onClick={() => { setMenuMais(false); setVerificar({ secao: aviso?.secao || null }) }}>
                    <ShieldCheck size={14} /> Verificar e corrigir
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Aviso automático: as regras do motor de integridade só para esta fatura (lib/verificarCartao
          avisoDaFatura). Sem diferença, nada aparece. Gerencial desligado: só o não gerencial. */}
      {aviso && ehAdministrador && podeEditar && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-aviso/30 bg-aviso/10 px-3 py-2 text-xs" data-testid="aviso-verificar">
          <span className="flex items-center gap-1.5 text-texto-1">
            <AlertTriangle size={13} className="text-aviso shrink-0" />
            Esta fatura tem {aviso.total} {aviso.total === 1 ? 'pendência' : 'pendências'}
            {aviso.semEtapa > 0.005 ? ` (ex.: ${fmt(aviso.semEtapa)} sem etapa A)` : aviso.semTipo > 0 ? ` (ex.: ${aviso.semTipo} sem tipo de conta)` : ''}.
          </span>
          <button type="button" className="text-primary-fg underline font-medium" onClick={() => setVerificar({ secao: aviso.secao })}>Verificar e corrigir</button>
        </div>
      )}

      {/* ── Tabela de lançamentos da fatura ── */}
      <div className="card p-0 overflow-hidden">
        {/* Linha de resumo no topo do extrato da fatura */}
        <div className="px-4 py-2 border-b border-borda flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-texto-3">
            Fatura <span className="text-texto-2 font-medium">{fmt(billTotal)}</span>
            {totalPrevisto > 0 && <> + previstos <span className="text-texto-2 font-medium">{fmt(totalPrevisto)}</span></>}
            {' · '}Pago <span className="text-texto-2 font-medium">{fmt(totalPago)}</span>
          </span>
          <DiferencaPagamento diferenca={diferencaPagamento} semValor={situacao.semValor} />
        </div>
        <div className="px-4 py-3 border-b border-borda flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-texto-2">
            {getBillLabel(billKey)}
            {faturaFechada && (
              <span className="ml-2 text-xs bg-surface-2 text-texto-2 px-2 py-0.5 rounded font-medium align-middle">
                FECHADA
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            {hasGer && (
              <div className="flex items-center gap-2 text-xs text-texto-3">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-reserva/20 text-reserva text-xs font-bold">G</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-despesa/20 text-despesa text-xs font-bold">2+</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-hover/60 text-texto-3 text-xs font-bold">D</span>
              </div>
            )}
            {billLancamentos.length > 0 && podeEditar && (
              <button
                data-guia="credit.selecionar"
                onClick={toggleSelectMode}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                title={selectMode ? 'Sair do modo de seleção' : 'Selecionar lançamentos para alterar ou conciliar'}
              >
                <ListChecks size={12} /> {selectMode ? 'Cancelar Seleção' : 'Selecionar'}
              </button>
            )}
            {billLancamentos.length > 0 && !isMobile && podeEditar && (
              <button
                data-guia="credit.reconciliar"
                onClick={() => setShowReconciliar(true)}
                className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1"
                title="Reconciliar transações da fatura"
              >
                <CheckSquare size={12} /> Reconciliar
              </button>
            )}
          </div>
        </div>

        {billLancamentos.length > 0 && (
          <LancamentoFiltros filtros={filtros} setFiltros={setFiltros} fields={['data', 'historico', 'favorecido', 'de', 'para', 'valorBusca']} />
        )}

        {billLancamentos.length === 0 ? (
          <div className="text-center py-12">
            <Calendar size={28} className="text-texto-3 mx-auto mb-2" />
            <p className="text-texto-3 text-sm">Nenhum lançamento nesta fatura</p>
            {podeIncluir && (
              <button
                onClick={() => setShowNewTx(true)}
                disabled={faturaFechada}
                className={`btn-primary mt-3 text-xs ${faturaFechada ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Adicionar lançamento
              </button>
            )}
          </div>
        ) : (
          <>
            {gerencialLigado && <GerencialTotalizer txs={totalizerTxs} gerencialGroups={gerencialGroups} previstos={agendamentosPrevistos} showReconciled />}

            {/* Mobile: cards estilo app bancário */}
            <div className="md:hidden">
              {billPayments.map(p => (
                <TxMobileItem
                  key={p.id}
                  type="pagamento_cartao"
                  title={p.description || ROTULO_PAGAMENTO_CARTAO}
                  dateLabel={fmtDate(p.date)}
                  amount={p.amount}
                />
              ))}
              {displayBillTxs.length === 0 ? (
                <p className="text-center py-8 text-texto-3 text-xs">Nenhum lançamento corresponde aos filtros</p>
              ) : displayBillTxs.map(tx => (
                // Estorno abate da fatura → valor exibido com sinal negativo (fmt formata
                // o negativo dentro do TxMobileItem). Só exibição: tx.amount segue positivo.
                <TxMobileItem
                  key={tx.id}
                  type={tx.type === 'income' ? 'income' : 'expense'}
                  typeLabel={tx.type === 'income' ? 'Estorno' : undefined}
                  title={tx.payee || tx.description || (tx.type === 'income' ? 'Estorno' : 'Despesa')}
                  subtitle={tx.payee || tx.estimado || tx.moeda ? <>{tx.payee ? tx.description : null} <SeloCambio tx={tx} /></> : null}
                  dateLabel={fmtDate(tx.date)}
                  amount={tx.type === 'income' ? -tx.amount : tx.amount}
                  onClick={selectMode ? () => toggleSelect(tx.id) : () => setEditTx(tx)}
                  leading={
                    selectMode ? (
                      <input
                        type="checkbox"
                        className="accent-primary shrink-0"
                        data-help-id="lancamentoLote.selecionar"
                        aria-label={`Selecionar ${tx.description || tx.payee || 'lançamento'}`}
                        checked={selectedIds.has(tx.id)}
                        onChange={() => toggleSelect(tx.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <ReconcileBadge
                        reconciled={tx.reconciled}
                        onClick={(e) => { e.stopPropagation(); if (podeEditar) setReconciled([tx.id], !tx.reconciled) }}
                        title={!podeEditar ? (tx.reconciled ? 'Reconciliado' : 'Não reconciliado') : tx.reconciled ? 'Reconciliado — toque para desmarcar' : 'Marcar como reconciliado'}
                      />
                    )
                  }
                />
              ))}
            </div>

            {/* Desktop: tabela */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda">
                    {selectMode && (
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          data-help-id="lancamentoLote.selecionar"
                          aria-label="Selecionar todos os visíveis"
                          title="Selecionar todos os visíveis"
                        /><HelpCampo campo="lancamentoLote.selecionar" />
                      </th>
                    )}
                    <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Data</th>
                    <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Descrição</th>
                    <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Categoria</th>
                    {hasGer && <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Ger.</th>}
                    <th className="text-right px-4 py-3 text-xs text-texto-2 font-medium">Valor</th>
                    <th className="px-4 py-3 w-16" />
                    <th data-guia="credit.conciliado" className="px-2 py-3 text-center text-xs text-texto-2 font-medium w-10" title="Reconciliado">R</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Pagamentos da fatura (credit_payment) — linhas destacadas no topo */}
                  {billPayments.map(p => (
                    <tr key={p.id} className="border-b border-borda/50 bg-primary/10">
                      {selectMode && <td className="px-3 py-3" />}
                      <td className="px-4 py-3 text-texto-2 text-xs whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-primary-fg text-sm font-medium truncate">{p.description || ROTULO_PAGAMENTO_CARTAO}</span>
                          <SeloPagamentoCartao className="!text-[10px]" />
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell" />
                      {hasGer && <td className="px-4 py-3" />}
                      <td className="px-4 py-3 text-right font-semibold text-primary-fg whitespace-nowrap text-sm">{fmt(p.amount)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-2 py-3" />
                    </tr>
                  ))}
                  {displayBillTxs.length === 0 && (
                    <tr>
                      <td colSpan={(hasGer ? 7 : 6) + (selectMode ? 1 : 0)} className="text-center py-8 text-texto-3 text-xs">
                        Nenhum lançamento corresponde aos filtros
                      </td>
                    </tr>
                  )}
                  {displayBillTxs.map(tx => {
                    const cat = categories.find(c => c.id === tx.categoryId)
                    const isSelected = selectedIds.has(tx.id)
                    // Estorno = receita lançada no cartão. Aparece na mesma lista, marcado
                    // com badge azul e valor na cor de receita do app.
                    const isEstorno = tx.type === 'income'
                    return (
                      <tr
                        key={tx.id}
                        onClick={selectMode ? () => toggleSelect(tx.id) : undefined}
                        className={`border-b border-borda/50 transition-colors ${selectMode ? 'cursor-pointer' : ''} ${selectMode && isSelected ? 'bg-primary/10' : 'hover:bg-surface-hover/30'}`}
                      >
                        {selectMode && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              className="accent-primary"
                              data-help-id="lancamentoLote.selecionar"
                              aria-label={`Selecionar ${tx.description || tx.payee || 'lançamento'}`}
                              checked={isSelected}
                              onChange={() => toggleSelect(tx.id)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-texto-2 text-xs whitespace-nowrap">
                          {tx.dateCartao && tx.dateCartao !== tx.date ? (
                            <>
                              <span className="block">Sistema: {fmtDate(tx.date)}</span>
                              <span className="block text-[10px] text-texto-3">Cartão: {fmtDate(tx.dateCartao)}</span>
                            </>
                          ) : (
                            fmtDate(tx.date)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm ${tx.reconciled ? 'text-texto-1' : 'text-texto-1 font-medium'}`}>{tx.description}</p>
                            <SeloCambio tx={tx} />
                            {isEstorno && (
                              <span className="text-[10px] font-bold bg-receita/20 text-receita px-1.5 py-0.5 rounded shrink-0">ESTORNO</span>
                            )}
                          </div>
                          {tx.payee && <p className="text-xs text-texto-3">{tx.payee}</p>}
                          <InstallmentBadge num={tx.installmentNum} total={tx.installmentTotal} dataCompra={tx.dataCompra} />
                          <CopyIdBadge id={tx.id} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {cat && (
                            <span className="text-xs bg-surface-2 px-2 py-1 rounded-full text-texto-2">
                              {cat.icon} {cat.name}
                            </span>
                          )}
                        </td>
                        {hasGer && (
                          <td className="px-4 py-3">
                            {tx.grupoGerencial
                              ? <GerBadge grupoId={tx.grupoGerencial} gerencialGroups={gerencialGroups} />
                              : <span className="text-texto-3 text-xs">—</span>}
                          </td>
                        )}
                        <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap text-sm ${isEstorno ? 'text-receita' : 'text-despesa'}`}>
                          {isEstorno ? `-${fmt(tx.amount)}` : fmt(tx.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div data-guia="credit.acoes-linha" className="flex gap-1 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditTx(tx) }}
                              title="Editar"
                              className="p-1.5 text-texto-3 hover:text-texto-2 hover:bg-surface-hover rounded transition-colors"
                            >
                              <Edit2 size={11} />
                            </button>
                            {podeIncluir && (
                              <DuplicateButton
                                onConfirm={(date) => handleDuplicate(tx, date)}
                                sourceTx={tx}
                                iconSize={11}
                                className="p-1.5 text-texto-3 hover:text-primary-fg hover:bg-primary/10 rounded transition-colors"
                              />
                            )}
                            {podeExcluir && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDelete(tx) }}
                                title="Excluir"
                                aria-label="Excluir"
                                className="p-1.5 text-texto-3 hover:text-perigo hover:bg-perigo-bg rounded transition-colors"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <ReconcileBadge
                            reconciled={tx.reconciled}
                            onClick={(e) => { e.stopPropagation(); if (podeEditar) setReconciled([tx.id], !tx.reconciled) }}
                            title={podeEditar ? undefined : (tx.reconciled ? 'Reconciliado' : 'Não reconciliado')}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t-2 border-borda-forte bg-surface/30 flex items-center justify-between">
              <span className="text-sm font-bold text-texto-2">Total da Fatura</span>
              <span className="text-sm font-bold text-despesa">{fmt(billTotal)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Agendamentos previstos (despesas agendadas que ainda vão entrar nesta fatura) ── */}
      {agendamentosPrevistos.length > 0 && (
        <div className="mt-4 border border-dashed border-borda-forte rounded-lg">
          <button
            data-guia="credit.previstos"
            onClick={() => setShowPrevistos(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-texto-2"
          >
            <span>
              📅 Agendamentos previstos ({agendamentosPrevistos.length})
              <span className="ml-2 text-texto-2">+ {fmt(totalPrevisto)}</span>
            </span>
            <span className="text-texto-3">{showPrevistos ? '▲' : '▼'}</span>
          </button>

          {showPrevistos && (
            <div className="px-4 pb-3 space-y-2">
              {agendamentosPrevistos.map(a => (
                <div key={a.key} className="flex items-center justify-between py-2 border-t border-borda-forte opacity-75">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-texto-2 shrink-0">
                      {new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <span className="text-sm text-texto-1 truncate">{a.description}</span>
                    <span className="text-xs text-texto-2 outline-dashed outline-1 -outline-offset-1 outline-borda-forte px-1.5 py-0.5 rounded shrink-0">Previsto</span>
                  </div>
                  <span className="text-sm text-despesa shrink-0">{fmt(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {verificar && (
        <VerificarCorrigirModal card={selectedCard} billKey={billKey} secaoInicial={verificar.secao} onClose={() => setVerificar(null)} />
      )}

      {/* Espaçador p/ a barra de ações fixa não cobrir o último lançamento (mais alto no
          mobile por causa da navegação inferior). */}
      {selectMode && <div className="h-36 md:h-24" />}

      {/* ── Barra de ações (modo Selecionar) — acima da barra inferior do mobile ── */}
      {selectMode && (
        <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] md:bottom-0 inset-x-0 z-[45] px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-3xl bg-surface border border-borda-forte rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-texto-2 font-medium">
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
              {/* Conciliar/Desconciliar em lote: só no computador. */}
              {!isMobile && (
                <>
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
                </>
              )}
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

      <Modal open={editarCartao && !!selectedCard} onClose={() => setEditarCartao(false)} title="Editar Conta">
        {editarCartao && selectedCard && <AccountForm initial={selectedCard} onClose={() => setEditarCartao(false)} />}
      </Modal>

      <Modal open={!!editTx} onClose={() => setEditTx(null)} title={editTx?.id ? 'Editar Lançamento' : 'Duplicar Lançamento'} size="lg">
        <TransactionForm
          initial={editTx}
          onClose={() => setEditTx(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => { setConfirmDelete(null); setManterBaixa(false) }}
        onConfirm={() => { deleteTransaction(confirmDelete.id, { manterBaixa }); setConfirmDelete(null) }}
        title="Excluir Lançamento"
        message={`Excluir "${confirmDelete?.description}"?`}
        danger
      >
        {confirmDelete && <EscolhaBaixaExclusao tx={confirmDelete} manter={manterBaixa} onChange={setManterBaixa} />}
      </ConfirmDialog>

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Pagar Fatura do Cartão" size="sm">
        <div className="space-y-4" data-help-form="pagamentoFatura">
          <div data-help-id="pagamentoFatura.conta">
            <label className="label">Conta de Débito<HelpCampo campo="pagamentoFatura.conta" /></label>
            <select className="input" value={payFromAccount} onChange={e => setPayFromAccount(e.target.value)}>
              <option value="">Selecione a conta...</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.apelido || a.name} — {fmt(a.balance)}</option>
              ))}
            </select>
          </div>
          <div data-help-id="pagamentoFatura.valor">
            <label className="label">Valor do Pagamento<HelpCampo campo="pagamentoFatura.valor" /></label>
            <InputMoeda negativo value={payAmount} onChange={e => setPayAmount(e.target.value)} />
          </div>
          <div data-help-id="pagamentoFatura.data">
            <label className="label">Data do Pagamento<HelpCampo campo="pagamentoFatura.data" /></label>
            <DataPagamentoField value={payDate} onChange={e => setPayDate(e.target.value)} vencimento={vencimentoFatura} />
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
