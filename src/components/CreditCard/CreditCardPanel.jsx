import { useState, useMemo, useEffect } from 'react'
import {
  CreditCard, DollarSign, Calendar, FileText, FileBarChart, ArrowLeft,
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, CheckCircle2, Circle, CheckSquare, RotateCcw,
  ListChecks, PencilLine, Check, X, ArrowUpCircle, AlertTriangle, GitCompare,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useRegisterFab } from '../../context/FabContext'
import { fmt, fmtDate, today, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros, accountsForView, classifyFatura } from '../shared/utils'
import { ORIGIN } from '../../lib/origins'
import { executarRegras, REGRAS_COMPETENCIA, ymParaRef, refParaYM } from '../../lib/integridade/regras'
import { planejarCorrecoesCompetencia, resumirPlano, acoesDoPlano, linhasHistoricoRevisao } from '../../lib/revisaoCompetencia'
import { novoLoteId } from '../../lib/historico'
import { agendamentosPrevistosDaFatura } from '../../lib/gerencialPrevistos'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useScrollSaver } from '../../hooks/useScrollRestoration'
import Modal from '../shared/Modal'
import DataPagamentoField from '../shared/DataPagamentoField'
import { dataPadraoPagamento, hojeSP } from '../../lib/dataPagamento'
import { dueDateInMonth, faturaDoCartao } from '../../lib/fatura'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TxMobileItem from '../shared/TxMobileItem'
import ReconcileBadge from '../shared/ReconcileBadge'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import GerencialTotalizer from '../shared/GerencialTotalizer'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import ReconciliarModal from '../shared/ReconciliarModal'
import BulkEditModal from '../shared/BulkEditModal'
import TransactionForm from '../Transactions/TransactionForm'
import AccountForm from '../Accounts/AccountForm'
import DuplicateButton from '../shared/DuplicateButton'
import ExtratoGerencial from './ExtratoGerencial'
import RelatorioFatura from './RelatorioFatura'
import InputMoeda from '../shared/InputMoeda'

// ─── Helpers (mirrors TransactionsPanel) ─────────────────────────────────────

// Mesma convenção de computeFaturaRef: dia <= closingDay → fatura do mês corrente;
// dia > closingDay → fatura do mês seguinte (a fatura do mês M fecha no dia F de M).
// Fonte única (lib/fatura): mesmo fechamento padrão do resto do app.
const getBillKey = (date, card) => faturaDoCartao(date, card)

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
function InstallmentBadge({ num, total }) {
  if (!num || num <= 0) return null
  return (
    <span className="mt-0.5 mr-1.5 inline-block bg-surface-2 text-texto-2 text-xs px-1.5 py-0.5 rounded font-medium">
      {num}/{total || '?'}
    </span>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

// Indicador informativo da diferença entre o pago e o total da fatura (diferenca = pago − fatura).
// Sempre par cor+ícone (sem verde/vermelho). Tolerância de 1 centavo evita "pago a mais R$0,00".
function DiferencaPagamento({ diferenca, compact = false, className = '' }) {
  let label, color, Icon
  if (diferenca > 0.01) { label = `Pago a mais ${fmt(diferenca)}`; color = 'text-receita'; Icon = ArrowUpCircle }
  else if (diferenca < -0.01) { label = `Falta pagar ${fmt(-diferenca)}`; color = 'text-aviso'; Icon = AlertTriangle }
  else { label = 'Quitada totalmente'; color = 'text-texto-2'; Icon = CheckCircle2 }
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${color} ${className}`}>
      <Icon size={compact ? 11 : 13} className="shrink-0" />
      {label}
    </span>
  )
}

const ACAO_META = {
  REMOVER_GERENCIAL:  { icon: Trash2,    color: 'text-perigo',      bg: 'bg-perigo-bg',     label: 'Remover transferência gerencial' },
  CRIAR_GERENCIAL:    { icon: Plus,      color: 'text-primary-fg',  bg: 'bg-primary/10', label: 'Criar transferência gerencial' },
  ATUALIZAR_GERENCIAL:{ icon: RotateCcw, color: 'text-ambar',       bg: 'bg-ambar/10',   label: 'Atualizar transferência gerencial' },
  CRIAR_RESGATE:      { icon: Plus,      color: 'text-reserva',     bg: 'bg-reserva/10',     label: 'Criar resgate de reserva' },
  ATUALIZAR_RESGATE:  { icon: RotateCcw, color: 'text-reserva',     bg: 'bg-reserva/10',     label: 'Atualizar resgate de reserva' },
  REMOVER_RESGATE:    { icon: Trash2,    color: 'text-perigo',      bg: 'bg-perigo-bg',     label: 'Remover resgate de reserva' },
  ATUALIZAR_DEVOLUCAO:{ icon: RotateCcw, color: 'text-reserva',     bg: 'bg-reserva/10',     label: 'Atualizar devolução gerencial' },
  ATUALIZAR_PAGAMENTO:{ icon: RotateCcw, color: 'text-texto-2',    bg: 'bg-surface-hover/30',    label: 'Atualizar pagamento da fatura' },
}

function AcaoRow({ a }) {
  const meta = ACAO_META[a.tipo] || { icon: RotateCcw, color: 'text-texto-2', bg: 'bg-surface-hover/30', label: a.tipo }
  const Icon = meta.icon
  const isGer = a.tipo.endsWith('_GERENCIAL')
  return (
    <div className={`flex items-start gap-3 rounded-lg p-3 ${meta.bg}`}>
      <Icon size={16} className={`${meta.color} mt-0.5 shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
        {isGer ? (
          <>
            <p className="text-sm text-texto-1 truncate">{a.descricao || '—'}</p>
            <p className="text-xs text-texto-3">
              {a.valor != null ? fmt(a.valor) : `${fmt(a.valor_anterior)} → ${fmt(a.valor_novo)}`}
              {a.data ? ` · ${fmtDate(a.data)}` : ''}
              {a.de && a.para ? ` · ${a.de} → ${a.para}` : ''}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-texto-1 truncate">{a.grupo || 'Fatura'}</p>
            <p className="text-xs text-texto-3">{fmt(a.valor_anterior)} → {fmt(a.valor_novo)}</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Revisar › Competência: item com a correção sugerida e prévia da correção ───────

const ROTULO_REGRA_COMPETENCIA = {
  COMPETENCIA_IMPLAUSIVEL: 'Gasto em fatura implausível',
  GER_RESERVA_FATURA_INCOERENTE: 'Reserva gerencial com fatura incoerente',
  GER_RESERVA_DUPLICADA_ENTRE_FATURAS: 'Reserva gerencial duplicada entre faturas',
}

function sugestaoCompetencia(it) {
  switch (it.tipo) {
    case 'excluir_duplicata':
      return `Excluir duplicata — o mesmo gasto já está na fatura ${ymParaRef(it.equivalente.fatura)}${it.excluir.length > 1 ? ' (a reserva gerencial dele sai junto)' : ''}`
    case 'mover': return `Mover para a fatura ${ymParaRef(it.mover.para)} (fatura da data da compra)`
    case 'excluir_reserva': return 'Excluir a reserva gerencial (o gasto de origem é mantido)'
    case 'coberta': return 'Resolvida junto com a correção do gasto de origem'
    default: return null
  }
}

function ItemCompetencia({ it, busy, onCorrigir }) {
  const regras = (it.regras || [it.regra]).map(r => ROTULO_REGRA_COMPETENCIA[r] || r)
  const botao = it.tipo === 'excluir_duplicata' ? 'Excluir duplicata'
    : it.tipo === 'mover' ? `Mover para ${ymParaRef(it.mover.para)}`
      : it.tipo === 'excluir_reserva' ? 'Excluir' : null
  const sugestao = sugestaoCompetencia(it)
  return (
    <div className={`flex items-start gap-3 rounded-lg p-3 ${it.tipo === 'coberta' ? 'bg-surface-2/60' : 'bg-perigo-bg'}`}>
      <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${it.tipo === 'coberta' ? 'text-texto-3' : 'text-perigo'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-texto-1">{it.detalhe || it.descricao}</p>
        <p className="text-xs text-texto-3">{regras.join(' · ')}{it.fatura ? ` · Fatura ${ymParaRef(it.fatura)}` : ''}</p>
        {sugestao && <p className="text-xs text-texto-2 mt-1"><span className="font-semibold">Sugestão:</span> {sugestao}</p>}
        {it.aviso && <p className="text-xs text-aviso mt-0.5">{it.aviso}</p>}
      </div>
      {botao && (
        <button className="btn-secondary text-xs px-2.5 py-1 shrink-0 whitespace-nowrap" onClick={onCorrigir} disabled={busy}>
          {botao}
        </button>
      )}
    </div>
  )
}

// Fatura (YYYY-MM) de um lançamento da prévia: gasto → faturaMonthYear; reserva → faturaRef.
const faturaDoLancamento = (t) => t.faturaMonthYear || refParaYM(t.faturaRef) || null

function PreviaCorrecao({ itens, transactions, cardId, isFaturaFechada, busy, onVoltar, onConfirmar }) {
  const txById = useMemo(() => new Map(transactions.map(t => [t.id, t])), [transactions])
  const r = useMemo(() => resumirPlano(itens, txById), [itens, txById])
  const fechadas = [...new Set([
    ...r.excluidos.map(faturaDoLancamento),
    ...r.movidos.flatMap(m => [m.de, m.para]),
  ].filter(ym => ym && isFaturaFechada(cardId, ym)))].sort()
  const linha = (t, extra) => (
    <div key={t.id} className="flex items-baseline justify-between gap-3 text-xs">
      <span className="min-w-0 truncate text-texto-2">
        <span className="text-texto-3">{t.type === 'expense' ? 'Gasto' : 'Reserva'} · </span>
        {t.description || t.id} · {fmtDate(String(t.dateCartao || t.date).slice(0, 10))}
        {extra}
      </span>
      <span className="tabular-nums whitespace-nowrap text-texto-1">{fmt(Number(t.amount) || 0)}</span>
    </div>
  )
  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-2">Prévia da correção — confira antes de aplicar.</p>
      {r.excluidos.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-texto-2">Serão excluídos ({r.excluidos.length})</h4>
          {r.excluidos.map(t => linha(t, faturaDoLancamento(t) ? ` · fatura ${ymParaRef(faturaDoLancamento(t))}` : ''))}
        </section>
      )}
      {r.movidos.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-texto-2">Mudam de fatura ({r.movidos.length})</h4>
          {r.movidos.map(m => m.tx && linha(m.tx, ` · ${ymParaRef(m.de)} → ${ymParaRef(m.para)}`))}
        </section>
      )}
      <div className="rounded-lg bg-surface-2/60 p-3 space-y-1 text-xs">
        {r.qtdGastosExcluidos > 0 && <div className="flex justify-between gap-3"><span className="text-texto-2">Gastos excluídos ({r.qtdGastosExcluidos})</span><span className="tabular-nums text-texto-1">{fmt(r.totalGastosExcluidos)}</span></div>}
        {r.qtdReservasExcluidas > 0 && <div className="flex justify-between gap-3"><span className="text-texto-2">Reservas gerenciais excluídas ({r.qtdReservasExcluidas})</span><span className="tabular-nums text-texto-1">{fmt(r.totalReservasExcluidas)}</span></div>}
        {r.movidos.length > 0 && <div className="flex justify-between gap-3"><span className="text-texto-2">Gastos movidos ({r.movidos.length})</span><span className="tabular-nums text-texto-1">{fmt(r.totalMovido)}</span></div>}
      </div>
      {fechadas.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-aviso">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          Mexe em fatura fechada ({fechadas.map(ymParaRef).join(', ')}). A correção manual é permitida; o motor automático continua ignorando faturas fechadas.
        </p>
      )}
      <p className="text-xs text-texto-3">
        Tudo fica registrado no histórico de alterações (origem: revisão automática). O gasto de origem de uma reserva nunca é apagado.
      </p>
      <div className="flex gap-2 pt-3 border-t border-borda">
        <button className="btn-secondary flex-1" onClick={onVoltar} disabled={busy}>Voltar</button>
        <button className="btn-danger flex-1" onClick={onConfirmar} disabled={busy}>
          {busy ? 'Aplicando…' : 'Confirmar e aplicar'}
        </button>
      </div>
    </div>
  )
}

export default function CreditCardPanel() {
  const {
    profileAccounts: accounts,
    profileTransactions: transactions,
    profileSchedules: schedules,
    categories, gerencialGroups, scheduleReservaFuncoes,
    addTransaction, deleteTransaction, updateTransaction, setReconciled, recalcularAgendamentosFatura, registrarEdicao,
    reconciliarGerencial, revisarMovimentosFatura, getOccurrencesProjecao: getNextOccurrences,
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
  const [reconciling, setReconciling] = useState(false)
  const [revisarState, setRevisarState] = useState(null) // { loading, executando, preview, previa, recarregar }

  const handleReconciliarGerencial = async () => {
    if (!selectedCard || reconciling) return
    setReconciling(true)
    try {
      // Persiste o detalhamento por lançamento (schedule_reserva_funcoes) do gerencial_devolucao /
      // resgate_reserva ANTES de reconciliar. recalcularAgendamentosFatura aplica o estado sem o
      // gate de "mudança" de reconciliarGerencial — esse gate só conta agendamentos/saldos e ignora
      // o SRF, então descartaria as linhas novas quando amount/saldo já estão corretos (backfill).
      // Espelha o fluxo de import (recalc → reconcile); reconciliarGerencial preserva o SRF já baked.
      // Apenas a FATURA SELECIONADA (billKey): o usuário reconcilia fatura por fatura, evitando um
      // payload gigante de /api/sync (todas as faturas do cartão de uma vez → erro de sincronização).
      if (billKey) {
        const [y, m] = billKey.split('-')
        if (y && m) recalcularAgendamentosFatura(selectedCard.id, y, m)
      }
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

  const faturaRefFromBillKey = () => {
    if (!billKey) return null
    const [by, bm] = billKey.split('-')
    return `${bm}/${by}`
  }

  // Verificações extras (client-side) sobre a fatura selecionada — complementam a engine
  // (revisarMovimentosFatura, seção 1). Não mutam nada; só levantam inconsistências p/ preview.
  //  A) Fantasmas: lançamentos na conta Ger. do cartão sem fatura_ref e com id NÃO reconhecido
  //     (não começa com tx_gerA_ nem tx_ger_).
  //  B) resgate_reserva cuja soma do detalhamento (schedule_reserva_funcoes) diverge do amount.
  //  C) gerencial_devolucao sem detalhamento (0 linhas) ou com soma divergente do amount.
  //  (A competência — seção 4 — é calculada ao vivo em `competenciaRevisao`, mais abaixo.)
  const computeRevisaoExtras = () => {
    if (!selectedCard || !billKey) return { fantasmas: [], agendamentos: [] }
    const apelido = selectedCard.apelido || selectedCard.name?.slice(0, 6) || 'CC'
    const gerAccId = accounts.find(a => a.name === `Ger. ${apelido}`)?.id || null

    const fantasmas = gerAccId ? transactions.filter(tx =>
      tx.toAccountId === gerAccId &&
      !tx.faturaRef &&
      !(typeof tx.id === 'string' && (tx.id.startsWith('tx_gerA_') || tx.id.startsWith('tx_ger_')))
    ) : []

    const linhasDe = (schedId) => (scheduleReservaFuncoes || []).filter(srf => srf.scheduleId === schedId)
    const somaDe = (schedId) => linhasDe(schedId).reduce((acc, srf) => acc + (Number(srf.valor) || 0), 0)

    const faturaSchedules = (schedules || []).filter(s => s.cardId === selectedCard.id && s.faturaMesAno === billKey)
    const fatura = faturaRefFromBillKey()
    const agendamentos = []
    for (const s of faturaSchedules.filter(s => s.tipo === 'resgate_reserva')) {
      const soma = somaDe(s.id)
      if (Math.abs((Number(s.amount) || 0) - soma) > 0.01)
        agendamentos.push({ tipo: 'resgate_reserva', fatura, esperado: Number(s.amount) || 0, soma, motivo: 'divergencia' })
    }
    for (const s of faturaSchedules.filter(s => s.tipo === 'gerencial_devolucao')) {
      const soma = somaDe(s.id)
      const qtd = linhasDe(s.id).length
      if (qtd === 0 || Math.abs((Number(s.amount) || 0) - soma) > 0.01)
        agendamentos.push({ tipo: 'gerencial_devolucao', fatura, esperado: Number(s.amount) || 0, soma, motivo: qtd === 0 ? 'sem_detalhamento' : 'divergencia' })
    }
    return { fantasmas, agendamentos }
  }

  const handleAbrirRevisar = async () => {
    if (!selectedCard || !billKey) return
    setRevisarState({ loading: true, executando: false, preview: null, fantasmas: [], agendamentos: [], previa: null })
    try {
      const preview = await revisarMovimentosFatura({ cardId: selectedCard.id, faturaRef: faturaRefFromBillKey(), dryRun: true })
      const { fantasmas, agendamentos } = computeRevisaoExtras()
      setRevisarState({ loading: false, executando: false, preview, fantasmas, agendamentos, previa: null })
    } catch (e) {
      setRevisarState(null)
      setToast(`Erro ao revisar: ${e.message}`)
    }
  }

  const handleExecutarRevisar = async () => {
    if (!selectedCard || !billKey || !revisarState?.preview) return
    setRevisarState(s => ({ ...s, executando: true }))
    try {
      const { resumo } = await revisarMovimentosFatura({ cardId: selectedCard.id, faturaRef: faturaRefFromBillKey(), dryRun: false })
      setRevisarState(null)
      const n = resumo.total || 0
      setToast(n > 0 ? `${n} movimento${n !== 1 ? 's' : ''} revisado${n !== 1 ? 's' : ''} com sucesso` : 'Tudo em ordem ✓')
    } catch (e) {
      setRevisarState(s => ({ ...s, executando: false }))
      setToast(`Erro ao executar: ${e.message}`)
    }
  }

  // Seção 2 — remove os lançamentos fantasma (preview já mostrou a lista antes da ação).
  const handleDeletarFantasmas = async () => {
    const fantasmas = revisarState?.fantasmas || []
    if (fantasmas.length === 0) return
    setRevisarState(s => ({ ...s, executando: true }))
    try {
      for (const tx of fantasmas) deleteTransaction(tx.id)
      setRevisarState(null)
      setToast(`${fantasmas.length} lançamento${fantasmas.length !== 1 ? 's' : ''} fantasma removido${fantasmas.length !== 1 ? 's' : ''}`)
    } catch (e) {
      setRevisarState(s => ({ ...s, executando: false }))
      setToast(`Erro ao deletar: ${e.message}`)
    }
  }

  // Seção 3 — recalcula os agendamentos geridos da fatura (reconstrói amount + detalhamento).
  const handleRecalcularAgendamentos = async () => {
    if (!selectedCard || !billKey) return
    setRevisarState(s => ({ ...s, executando: true }))
    try {
      const [y, m] = billKey.split('-')
      // recalcularAgendamentosFatura só atualiza o estado em memória (reconcileFaturaState via
      // update). Em seguida reconciliarGerencial fecha o ciclo — mesmo padrão do botão "Reconciliar
      // Gerenciais" (recalc → reconciliar) — garantindo que o detalhamento recém-gerado seja
      // persistido no banco (/api/sync-srf, via o diff de scheduleReservaFuncoes no sync).
      await recalcularAgendamentosFatura(selectedCard.id, y, m)
      await reconciliarGerencial(selectedCard.id)
      setRevisarState(null)
      setToast('Agendamentos recalculados ✓')
    } catch (e) {
      setRevisarState(s => ({ ...s, executando: false }))
      setToast(`Erro ao recalcular: ${e.message}`)
    }
  }

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
    const [y, m] = billKey.split('-').map(Number)
    const d = dueDateInMonth(y, m - 1, Number(selectedCard.dueDay))
    return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [billKey, selectedCard])

  // ── Revisar › Competência fora do lugar ─────────────────────────────────────
  // Gasto do cartão em fatura implausível e reserva gerencial (Ger. do cartão) com fatura divergente
  // da origem ou duplicada em outra fatura — em QUALQUER fatura, não só na selecionada (o lote de
  // 15/10/2026 gravado em 10/2024 ficava invisível na 10/2026). Calculado AO VIVO enquanto o modal
  // está aberto: depois de uma correção a lista se refaz sozinha. Cada item traz a correção sugerida
  // (lib/revisaoCompetencia). Ação manual do usuário: vale também para fatura fechada — o motor de
  // integridade automático continua ignorando as fechadas.
  const revisarAberto = !!revisarState && !revisarState.loading
  const competenciaRevisao = useMemo(() => {
    if (!revisarAberto || !selectedCard) return []
    const apelido = selectedCard.apelido || selectedCard.name?.slice(0, 6) || 'CC'
    const gerAccId = accounts.find(a => a.name === `Ger. ${apelido}`)?.id || null
    return executarRegras(
      { transactions, accounts, schedules, gerencialGroups },
      { desde: null, regras: REGRAS_COMPETENCIA },
    ).filter(d => d.conta_id === selectedCard.id || (gerAccId && d.conta_id === gerAccId))
  }, [revisarAberto, selectedCard, transactions, accounts, schedules, gerencialGroups])
  const planoCompetencia = useMemo(
    () => (selectedCard && competenciaRevisao.length
      ? planejarCorrecoesCompetencia({ divergencias: competenciaRevisao, transactions, card: selectedCard })
      : { itens: [], resumo: null }),
    [competenciaRevisao, transactions, selectedCard],
  )
  const itensCorrigiveis = planoCompetencia.itens.filter(it => ['excluir_duplicata', 'mover', 'excluir_reserva'].includes(it.tipo))

  // Depois de corrigir, refaz as outras seções (engine da fatura, fantasmas, agendamentos) já com
  // o estado novo — o effect roda depois do render, com transactions/schedules atualizados.
  useEffect(() => {
    if (!revisarState?.recarregar || !selectedCard || !billKey) return
    let vivo = true
    revisarMovimentosFatura({ cardId: selectedCard.id, faturaRef: faturaRefFromBillKey(), dryRun: true })
      .then(preview => {
        if (!vivo) return
        const { fantasmas, agendamentos } = computeRevisaoExtras()
        setRevisarState(st => (st ? { ...st, preview, fantasmas, agendamentos, recarregar: false } : st))
      })
      .catch(() => { if (vivo) setRevisarState(st => (st ? { ...st, recarregar: false } : st)) })
    return () => { vivo = false }
  }, [revisarState?.recarregar]) // eslint-disable-line react-hooks/exhaustive-deps

  // Aplica as correções (um item ou "Corrigir todos", sempre depois da prévia). O histórico é
  // gravado ANTES (origem revisao_automatica): se o registro falha, nada é alterado. As ações são
  // as normais do app — deleteTransaction leva junto a etapa A do gasto e reverte saldos;
  // updateTransaction move a fatura e refaz a reserva — e, no fim, reconciliarGerencial refaz os
  // agendamentos de resgate/devolução das faturas afetadas e o saldo das subcontas Ger.
  const aplicarCorrecoesCompetencia = async (itensAlvo) => {
    if (!selectedCard || !itensAlvo?.length) return
    setRevisarState(st => ({ ...st, executando: true }))
    try {
      const txById = new Map(transactions.map(t => [t.id, t]))
      const loteId = novoLoteId()
      const historico = linhasHistoricoRevisao(itensAlvo, txById, { loteId })
      await registrarEdicao({ historico, loteId, motivo: 'Revisão automática do cartão' })
      const { excluir, mover } = acoesDoPlano(itensAlvo)
      for (const id of excluir) deleteTransaction(id)
      for (const m of mover) updateTransaction(m.id, { faturaMonthYear: m.para })
      const faturas = [...new Set(itensAlvo.flatMap(it => [it.fatura, it.faturaGasto, it.mover?.para]).filter(Boolean))]
      await reconciliarGerencial(selectedCard.id, faturas)
      const r = resumirPlano(itensAlvo, txById)
      setRevisarState(st => (st ? { ...st, executando: false, previa: null, recarregar: true } : st))
      const partes = []
      if (r.excluidos.length) partes.push(`${r.excluidos.length} lançamento${r.excluidos.length !== 1 ? 's' : ''} excluído${r.excluidos.length !== 1 ? 's' : ''}`)
      if (r.movidos.length) partes.push(`${r.movidos.length} movido${r.movidos.length !== 1 ? 's' : ''} de fatura`)
      setToast(`✓ ${partes.join(', ')} · registrado no histórico`)
    } catch (e) {
      setRevisarState(st => (st ? { ...st, executando: false } : st))
      setToast(`Erro ao corrigir: ${e.message}`)
    }
  }

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
  // Lista EXIBIDA da fatura: despesas + estornos numa lista só, ordenada por data.
  // Só afeta exibição/seleção/reconciliação — billTotal e o abatimento dos estornos
  // seguem calculados sobre billTxs/estornoTotal acima.
  const billLancamentos = useMemo(
    () => [...billTxs, ...billEstornos].sort((a, b) => b.date.localeCompare(a.date)),
    [billTxs, billEstornos]
  )
  // Controle gerencial desligado: sem coluna Ger., totais por grupo e Extrato gerencial (o grupo
  // gravado nos lançamentos antigos continua no banco; só não aparece).
  const gerencialLigado = controleGerencialAtivo(settings)
  const hasGer = gerencialLigado && billLancamentos.some(tx => tx.grupoGerencial)

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
  // Saldo a Pagar e total da fatura EXIBIDOS no KPI incluem as despesas ainda agendadas
  // (totalPrevisto) → total real previsto. Não afetam billTotal nem a classificação de
  // pagamento (isFaturaPaga/isFaturaParcial), que seguem baseados só nos lançamentos efetivados.
  const saldoAPagarComPrevistos = saldoRestante + totalPrevisto
  const billTotalComPrevistos = billTotal + totalPrevisto

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
  // Diferença pago − fatura. NUNCA armazenada: recalculada no render a partir de totalPago e
  // billTotal (ambos reativos a `transactions`), então reage a reimportações que mudem o billTotal.
  const diferencaPagamento = Math.round((totalPago - billTotal) * 100) / 100

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

  // FAB mobile: novo lançamento no cartão/fatura selecionados (inativo nas
  // subtelas de extrato/relatório, onde o modal não está montado).
  useRegisterFab(
    podeIncluir ? () => { if (!showExtrato && !showRelatorio && !faturaFechada) setShowNewTx(true) } : null,
    [showExtrato, showRelatorio, faturaFechada, podeIncluir]
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

  if (showExtrato && !isMobile) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors"
          onClick={() => { saveScroll(); setShowExtrato(false) }}
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
          className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors"
          onClick={() => { saveScroll(); setShowRelatorio(false) }}
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
      <div className="space-y-4 md:sticky md:top-0 md:z-20 md:bg-page md:pb-2 md:-mb-2">

      {/* ── Seletor de cartão + navegador de fatura ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Dropdown de cartão */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <CreditCard size={15} className="text-texto-2 shrink-0" />
          <select
            className="bg-surface-2 border border-borda-campo text-texto-1 rounded-lg px-3 py-2 text-sm focus:outline-none w-full"
            value={selectedCardId}
            onChange={e => handleCardChange(e.target.value)}
          >
            {creditCards.map(c => (
              <option key={c.id} value={c.id}>{c.apelido || c.name}</option>
            ))}
          </select>
          {podeEditarCartao && selectedCard && (
            <button type="button" onClick={() => setEditarCartao(true)} title="Editar cartão" aria-label="Editar cartão"
              className="p-2 rounded-lg border border-borda-campo bg-surface-2 text-texto-2 hover:text-texto-1 hover:bg-surface-hover transition-colors shrink-0 min-h-[38px]">
              <Edit2 size={14} />
            </button>
          )}
        </div>

        {/* Navegador de fatura */}
        <div className="flex items-center gap-1 bg-surface-2 border border-borda-forte rounded-lg px-1 py-1 shrink-0">
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
          {/* Extrato Gerencial: só no computador (grupos gerenciais fora do mobile). */}
          {!isMobile && gerencialLigado && (
            <button
              onClick={() => { saveScroll(); setShowExtrato(true) }}
              className="btn-amber"
            >
              <FileText size={13} /> Extrato
            </button>
          )}
          <button
            onClick={() => { saveScroll(); setShowRelatorio(true) }}
            className="btn-amber"
          >
            <FileBarChart size={13} /> Relatório
          </button>
        </div>
      </div>

      {/* Diferença de pagamento — compacta no header (mobile; rola junto com o cabeçalho) */}
      <div className="md:hidden flex items-center justify-between gap-2 bg-surface-2/60 border border-borda-forte rounded-lg px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-texto-3">Diferença</span>
        <DiferencaPagamento diferenca={diferencaPagamento} compact />
      </div>

      {/* ── KPIs + botões de ação ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Fatura Selecionada ocupa a linha inteira no mobile (col-span-2) p/ os "previstos"/
            "total" caberem — no grid estreito de 2 colunas ficavam apertados/cortados. */}
        <div className="card col-span-2 sm:col-span-1">
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
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <DollarSign size={13} />
            <span className="text-xs uppercase tracking-wide">Limite Disponível</span>
          </div>
          <p className="text-2xl font-bold text-receita">
            {fmt((selectedCard?.creditLimit || 0) - usoLimite)}
          </p>
          <p className="text-xs text-texto-3 mt-1">de {fmt(selectedCard?.creditLimit || 0)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <CreditCard size={13} />
            <span className="text-xs uppercase tracking-wide">Dívida Total</span>
          </div>
          <p className="text-2xl font-bold text-texto-1">{fmt(usoLimite)}</p>
          <p className="text-xs text-texto-3 mt-1">Fecha dia {selectedCard?.closingDay || '—'} · Vence dia {selectedCard?.dueDay || '—'}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-texto-2">
            <CheckCircle2 size={13} />
            <span className="text-xs uppercase tracking-wide">{totalPago === 0 ? 'Saldo a Pagar' : 'Valor Pago'}</span>
          </div>
          <p className={`text-2xl font-bold ${isFaturaPaga ? 'text-primary-fg' : isFaturaParcial ? 'text-aviso' : 'text-texto-1'}`}>
            {fmt(totalPago === 0 ? saldoAPagarComPrevistos : totalPago)}
          </p>
          <p className="text-xs text-texto-3 mt-1">
            de {fmt(billTotalComPrevistos)} · {isFaturaPaga ? 'Paga ✓' : isFaturaParcial ? 'Parcialmente paga' : 'Não paga'}
          </p>
          <DiferencaPagamento diferenca={diferencaPagamento - totalPrevisto} className="mt-1.5" />
          {podeEditar && <button
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
            disabled={faturaFechada}
            title={faturaFechada ? 'Fatura fechada — abra a fatura para adicionar lançamentos' : undefined}
            className={`btn-primary flex-1 hidden md:flex items-center justify-center gap-2 text-sm ${faturaFechada ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => setShowNewTx(true)}
          >
            <Plus size={14} /> Novo Lançamento
          </button>}
          {podeIncluir && <button
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
            onClick={() => { setShowPayModal(true); setPayAmount(String(billTotal)); setPayDate(dataPadraoPagamento(vencimentoFatura)) }}
          >
            <DollarSign size={14} /> Pagar Fatura
          </button>}
          {podeEditar && <button
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
            onClick={() => {
              if (!selectedCard || !billKey) return
              const [by, bm] = billKey.split('-')
              recalcularAgendamentosFatura(selectedCard.id, by, bm)
              // reconciliarGerencial reconcilia todas as faturas do cartão E recalcula os SALDOS das
              // contas Ger. (passo B) — que recalcularAgendamentosFatura sozinho não faz. O motor
              // per-gasto já (re)materializa os resgates; aqui garantimos os saldos consistentes.
              reconciliarGerencial(selectedCard.id)
              setToast(`Fatura atualizada: ${fmt(billTotal)}`)
            }}
            title="Recalcula o total da fatura e atualiza a conta a pagar"
          >
            <RotateCcw size={14} /> Atualizar
          </button>}
          {podeEditar && <button
            className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
            onClick={handleAbrirRevisar}
            title="Revisa os movimentos automáticos (transferências gerenciais e resgates) da fatura e mostra os ajustes pendentes antes de aplicar"
          >
            <GitCompare size={14} /> Revisar Movimentos Automáticos
          </button>}
          {!isMobile && podeEditar && (
            <button
              className="flex items-center justify-center gap-1.5 text-xs text-texto-3 hover:text-texto-2 disabled:opacity-50 transition-colors py-1"
              onClick={handleReconciliarGerencial}
              disabled={reconciling}
              title="Reconcilia agendamentos gerenciais e saldos das contas Ger. deste cartão"
            >
              <RotateCcw size={12} className={reconciling ? 'animate-spin' : ''} />
              {reconciling ? 'Reconciliando…' : '🔄 Reconciliar Gerenciais'}
            </button>
          )}
        </div>
      </div>
      </div>

      {/* ── Tabela de lançamentos da fatura ── */}
      <div className="card p-0 overflow-hidden">
        {/* Linha de resumo no topo do extrato da fatura */}
        <div className="px-4 py-2 border-b border-borda flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-texto-3">
            Fatura <span className="text-texto-2 font-medium">{fmt(billTotal)}</span>
            {' · '}Pago <span className="text-texto-2 font-medium">{fmt(totalPago)}</span>
          </span>
          <DiferencaPagamento diferenca={diferencaPagamento} />
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
                onClick={toggleSelectMode}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                title={selectMode ? 'Sair do modo de seleção' : 'Selecionar lançamentos para alterar ou conciliar'}
              >
                <ListChecks size={12} /> {selectMode ? 'Cancelar Seleção' : 'Selecionar'}
              </button>
            )}
            {billLancamentos.length > 0 && !isMobile && podeEditar && (
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

        {billLancamentos.length > 0 && (
          <LancamentoFiltros filtros={filtros} setFiltros={setFiltros} />
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
                  type="credit_payment"
                  title="Pagamento de Fatura"
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
                  subtitle={tx.payee ? tx.description : null}
                  dateLabel={fmtDate(tx.date)}
                  amount={tx.type === 'income' ? -tx.amount : tx.amount}
                  onClick={selectMode ? () => toggleSelect(tx.id) : () => setEditTx(tx)}
                  leading={
                    selectMode ? (
                      <input
                        type="checkbox"
                        className="accent-primary shrink-0"
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
                          title="Selecionar todos os visíveis"
                        />
                      </th>
                    )}
                    <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Data</th>
                    <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Descrição</th>
                    <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Categoria</th>
                    {hasGer && <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Ger.</th>}
                    <th className="text-right px-4 py-3 text-xs text-texto-2 font-medium">Valor</th>
                    <th className="px-4 py-3 w-16" />
                    <th className="px-2 py-3 text-center text-xs text-texto-2 font-medium w-10" title="Reconciliado">R</th>
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
                          <CheckCircle2 size={13} className="text-primary-fg shrink-0" />
                          <span className="text-primary-fg text-sm font-medium">Pagamento de Fatura</span>
                          <span className="text-[10px] font-bold bg-primary/15 text-primary-fg px-1.5 py-0.5 rounded">PAGAMENTO</span>
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
                            {isEstorno && (
                              <span className="text-[10px] font-bold bg-receita/20 text-receita px-1.5 py-0.5 rounded shrink-0">ESTORNO</span>
                            )}
                          </div>
                          {tx.payee && <p className="text-xs text-texto-3">{tx.payee}</p>}
                          <InstallmentBadge num={tx.installmentNum} total={tx.installmentTotal} />
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
                          <div className="flex gap-1 justify-end">
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

      {revisarState && (
        <Modal
          open
          onClose={() => { if (!revisarState.executando) setRevisarState(null) }}
          title={`Revisar Movimentos Automáticos — Fatura ${faturaRefFromBillKey() || ''}`}
          size="lg"
        >
          {revisarState.loading ? (
            <div className="py-10 text-center text-texto-2 text-sm">
              <RotateCcw size={20} className="animate-spin mx-auto mb-2" /> Analisando movimentos…
            </div>
          ) : revisarState.previa ? (
            <PreviaCorrecao
              itens={revisarState.previa.itens}
              transactions={transactions}
              cardId={selectedCard?.id}
              isFaturaFechada={isFaturaFechada}
              busy={revisarState.executando}
              onVoltar={() => setRevisarState(st => ({ ...st, previa: null }))}
              onConfirmar={() => aplicarCorrecoesCompetencia(revisarState.previa.itens)}
            />
          ) : (() => {
            const acoes = revisarState.preview?.acoes || []
            const fantasmas = revisarState.fantasmas || []
            const agendamentos = revisarState.agendamentos || []
            const competencia = planoCompetencia.itens
            const busy = revisarState.executando
            if (acoes.length + fantasmas.length + agendamentos.length + competencia.length === 0) return (
              <div className="py-10 text-center">
                <CheckCircle2 size={28} className="text-primary-fg mx-auto mb-2" />
                <p className="text-texto-2 text-sm">✅ Nenhuma inconsistência encontrada</p>
              </div>
            )
            return (
              <div className="space-y-5">
                {/* SEÇÃO 1 — Transferências Gerenciais (engine existente) */}
                {acoes.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-texto-2">Transferências Gerenciais</h4>
                      <span className="text-xs text-texto-3">{acoes.length} ajuste{acoes.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">{acoes.map((a, i) => <AcaoRow key={i} a={a} />)}</div>
                    <button className="btn-primary w-full text-sm" onClick={handleExecutarRevisar} disabled={busy}>
                      {busy ? 'Executando…' : `Executar ${acoes.length} ajuste${acoes.length !== 1 ? 's' : ''}`}
                    </button>
                  </section>
                )}
                {/* SEÇÃO 2 — Lançamentos sem origem reconhecida (fantasmas) */}
                {fantasmas.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-texto-2">Lançamentos sem origem reconhecida</h4>
                    <div className="space-y-2">
                      {fantasmas.map(tx => (
                        <div key={tx.id} className="flex items-start gap-3 rounded-lg p-3 bg-aviso/10">
                          <AlertTriangle size={16} className="text-aviso mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-texto-1 truncate">{tx.description || '—'}</p>
                            <p className="text-xs text-texto-3">{fmt(Number(tx.amount) || 0)}{tx.date ? ` · ${fmtDate(tx.date)}` : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="btn-danger w-full text-sm" onClick={handleDeletarFantasmas} disabled={busy}>
                      {busy ? 'Processando…' : `Deletar ${fantasmas.length} lançamento${fantasmas.length !== 1 ? 's' : ''} fantasma`}
                    </button>
                  </section>
                )}
                {/* SEÇÃO 3 — Agendamentos de resgate (divergência / detalhamento) */}
                {agendamentos.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-texto-2">Agendamentos de resgate</h4>
                    <div className="space-y-2">
                      {agendamentos.map((ag, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-lg p-3 bg-reserva/10">
                          <RotateCcw size={16} className="text-reserva mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-texto-1">
                              {ag.tipo === 'resgate_reserva' ? 'Resgate Reserva' : 'Devolução Gerencial'}
                              {ag.fatura ? ` · Fatura ${ag.fatura}` : ''}
                            </p>
                            <p className="text-xs text-texto-3">
                              {ag.motivo === 'sem_detalhamento' ? 'Sem detalhamento · ' : ''}
                              esperado {fmt(ag.esperado)} · soma atual {fmt(ag.soma)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="btn-primary w-full text-sm" onClick={handleRecalcularAgendamentos} disabled={busy}>
                      {busy ? 'Recalculando…' : 'Recalcular agendamentos'}
                    </button>
                  </section>
                )}
                {/* SEÇÃO 4 — Competência (qualquer fatura do cartão) */}
                {competencia.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-texto-2">Competência fora do lugar (todas as faturas)</h4>
                      <span className="text-xs text-texto-3">{competencia.length} item{competencia.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      {competencia.map(it => (
                        <ItemCompetencia
                          key={it.chave}
                          it={it}
                          busy={busy}
                          onCorrigir={() => setRevisarState(st => ({ ...st, previa: { itens: [it] } }))}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-texto-3">
                      As correções passam por uma prévia e ficam registradas no histórico de alterações
                      (origem: revisão automática). Valem também para fatura fechada.
                    </p>
                  </section>
                )}
              </div>
            )
          })()}
          {!revisarState.loading && !revisarState.previa && (
            <div className="flex gap-2 pt-4 mt-4 border-t border-borda">
              <button className="btn-secondary flex-1" onClick={() => setRevisarState(null)} disabled={revisarState.executando}>
                Fechar
              </button>
              {itensCorrigiveis.length > 0 && (
                <button
                  className="btn-danger flex-1"
                  onClick={() => setRevisarState(st => ({ ...st, previa: { itens: itensCorrigiveis } }))}
                  disabled={revisarState.executando}
                >
                  Corrigir todos ({itensCorrigiveis.length})
                </button>
              )}
            </div>
          )}
        </Modal>
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
            <InputMoeda negativo value={payAmount} onChange={e => setPayAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Data do Pagamento</label>
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
