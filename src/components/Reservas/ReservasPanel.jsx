import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react'
import {
  Plus, Edit2, Trash2, RotateCcw, CheckCircle, AlertTriangle, Layers,
  ArrowDownCircle, ArrowUpCircle, PiggyBank, ChevronLeft, ChevronRight, FileSpreadsheet, GripVertical, MessageSquare, List, ScrollText,
} from 'lucide-react'
import { exportarExcel } from '../../lib/exportExcel'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { fetchReserveFunctionTransactions, fetchViradaReservaStatus, viradaReservaAcao } from '../../lib/db'
import { activePeriodByFunction } from '../../lib/reserveDailyLedger'
import { indexarReserva, saldoDaFuncao } from '../../lib/saldoReserva'
import { agruparFechamentos, ultimoCorteDe } from '../../lib/viradaReserva'
import { rotuloMes } from '../../lib/mesFinanceiro'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import ResgateBreakdownModal from '../Schedule/ResgateBreakdownModal'
import { itemAbreComposicao } from '../../lib/resgateComposicao'
import ViradaAssistidaModal from './ViradaAssistidaModal'
import HelpCampo from '../shared/HelpCampo'
import RazaoDiarioTab from './RazaoDiarioTab'
import InputMoeda from '../shared/InputMoeda'
import FunctionForm from './FuncaoReservaForm'
import { isoLocal } from '../../lib/hoje'
import { erroDistribuicao, OBS_DISTRIBUICAO } from '../../lib/reservaDistribuir'
import { ehAjusteDeRendimento } from '../../lib/rendimentoReserva'
import { buildFluxoWindow, computeScheduledByFunction } from '../../lib/fluxoReservaProjecao'
import { totaisFluxoFuturo, funcoesReservaNoPerfil, linhasDasFuncoesNoPerfil } from '../../lib/fluxoReservaTotais'
import { mesDaData, somarMeses, periodoDaPreferencia, preferenciaDoPeriodo, janelaDoPeriodo } from '../../lib/fluxoPeriodo'
import { carregarBoasVindas, assinarBoasVindas, estadoBoasVindas, definirPeriodoFluxo } from '../../lib/boasVindasApi'
import SeletorPeriodoFluxo from './SeletorPeriodoFluxo'
import ExtratoReservaModal from './ExtratoReservaModal'
import { realizadosDaFuncao } from '../../lib/extratoReserva'
import ProfileBadge from '../shared/ProfileBadge'
import AvisosCaixaReserva from './AvisosCaixaReserva'
import { parseValorBR } from '../../lib/valorBR'
import { useSubtelaGuia } from '../BoasVindas/subtelaGuia'

// Relatórios exportados (layout em lib/exportExcel). Período do arquivo = mês atual (AAAA-MM).
const mesAtualArquivo = () => isoLocal(new Date()).slice(0, 7)
const exportarRelatorio = (spec) => exportarExcel(spec).catch(err => window.alert(`Não consegui exportar: ${err?.message || err}`))

// Funções de reserva vivem no estado global (Neon). accountBalances segue local (override
// de saldo real da conta — específico do dispositivo). O histórico de saldos iniciais e de
// ajustes agora vive no banco (reserve_periods / reserve_adjustments), não no localStorage.
function useReservas() {
  const { reserveFunctions: functions, addReserveFunction, updateReserveFunction, deleteReserveFunction } = useApp()

  const [accountBalances, setAccountBalancesState] = useState(() => {
    try {
      const s = localStorage.getItem('finup_reserve_balances')
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  })

  useEffect(() => { localStorage.setItem('finup_reserve_balances', JSON.stringify(accountBalances)) }, [accountBalances])

  const addFunction = (fn) => addReserveFunction(fn)
  const updateFunction = (id, changes) => updateReserveFunction(id, changes)
  const deleteFunction = (id) => deleteReserveFunction(id)

  const setAccountBalance = (accountId, value) => {
    setAccountBalancesState(b => ({ ...b, [accountId]: Number(value) }))
  }

  return { functions, accountBalances, addFunction, updateFunction, deleteFunction, setAccountBalance }
}

// Data local 'YYYY-MM-DD' (evita o shift de fuso do toISOString).
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Inline editable number cell ────────────────────────────────────────────
// Valor de movimentação (Entradas/Saídas) do Resumo — SOMENTE LEITURA, clicável. Ao clicar,
// abre o modal de origem com os lançamentos que compõem o valor (via onClick → openOrigem).
// Cores: azul (entradas) / laranja (saídas) / cinza (zero). Sem edição manual / selos AUTO.
function MovValue({ value, tipo, onClick }) {
  const color = value !== 0 ? (tipo === 'entradas' ? 'text-receita' : 'text-despesa') : 'text-texto-3'
  return (
    <button
      onClick={onClick}
      title="Ver lançamentos que compõem este valor"
      className={`text-right text-xs font-semibold whitespace-nowrap hover:underline cursor-pointer ${color}`}
    >
      {value !== 0 ? fmt(value) : <span className="text-texto-3">0,00</span>}
    </button>
  )
}

// ── Function Form (modal) ───────────────────────────────────────────────────
// Toggle inline discreto "Despesa" por função: define se as movimentações da função
// contam como despesa nos relatórios/dashboard. Clique alterna e salva via onToggle.
function DespesaToggle({ on, onToggle }) {
  if (!onToggle) {
    return on
      ? <span className="shrink-0 text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-despesa/20 text-despesa" title="Conta como despesa no Dashboard/Relatórios">Despesa</span>
      : null
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={on
        ? 'Conta como despesa no Dashboard/Relatórios — clique para ignorar'
        : 'Ignorada nos totais de despesa — clique para contar como despesa'}
      className={`shrink-0 text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded transition-colors ${
        on
          ? 'bg-despesa/20 text-despesa hover:bg-despesa/30'
          : 'bg-surface-hover/50 text-texto-3 hover:bg-surface-hover/60'
      }`}
    >
      Despesa
    </button>
  )
}

// Formulário da função: src/components/Reservas/FuncaoReservaForm.jsx (também usado no "+ Nova função" do agendamento).

// ── Tab 0: Contas Reserva ───────────────────────────────────────────────────
function ContasReservaTab({ reservaAccounts, transactions, categories, periodStart, periodEnd }) {
  const [extratoAcc, setExtratoAcc] = useState(null)

  const reservaData = useMemo(() => {
    return reservaAccounts.map(acc => {
      const cat = acc.reservaType === 'especifica'
        ? categories.find(c => c.id === acc.reservaCategoryId)
        : null
      const entradas = transactions
        .filter(tx => tx.type === 'transfer' && tx.toAccountId === acc.id && tx.date >= periodStart && tx.date <= periodEnd)
        .reduce((s, t) => s + t.amount, 0)
      const saidas = transactions
        .filter(tx => tx.type === 'transfer' && tx.accountId === acc.id && tx.date >= periodStart && tx.date <= periodEnd)
        .reduce((s, t) => s + t.amount, 0)
      const txsExtrato = transactions
        .filter(tx => tx.type === 'transfer' && (tx.accountId === acc.id || tx.toAccountId === acc.id))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 40)
      return { acc, cat, entradas, saidas, txsExtrato }
    })
  }, [reservaAccounts, transactions, categories, periodStart, periodEnd])

  const totalSaldo = reservaAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalEntradas = reservaData.reduce((s, d) => s + d.entradas, 0)
  const totalSaidas = reservaData.reduce((s, d) => s + d.saidas, 0)
  const extratoData = reservaData.find(d => d.acc.id === extratoAcc?.id)

  if (reservaAccounts.length === 0) {
    return (
      <div className="card text-center py-12">
        <PiggyBank size={32} className="text-texto-3 mx-auto mb-3" />
        <p className="text-texto-3 text-sm">Nenhuma conta marcada como reserva</p>
        <p className="text-xs text-texto-3 mt-1">Ative "É conta de reserva" no cadastro de uma conta para ela aparecer aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo do topo — valor com fonte responsiva (clamp) p/ nunca cortar no mobile.
          grid-cols-3 garante 3 cards de largura igual; min-w-0 evita que o número estoure a célula. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3" data-guia="reservas.totais">
        <div className="card min-w-0 py-3 px-2 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs text-texto-3 uppercase tracking-wide mb-1">Total Reservado</p>
          <p className={`font-bold tabular-nums whitespace-nowrap text-[clamp(0.72rem,3.6vw,1.25rem)] ${totalSaldo >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmtSinal(totalSaldo)}</p>
        </div>
        <div className="card min-w-0 py-3 px-2 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs text-texto-3 uppercase tracking-wide mb-1">Depósitos no Mês</p>
          <p className="font-bold tabular-nums whitespace-nowrap text-[clamp(0.72rem,3.6vw,1.25rem)] text-receita">{totalEntradas > 0 ? fmt(totalEntradas) : <span className="text-texto-3">—</span>}</p>
        </div>
        <div className="card min-w-0 py-3 px-2 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs text-texto-3 uppercase tracking-wide mb-1">Resgates no Mês</p>
          <p className="font-bold tabular-nums whitespace-nowrap text-[clamp(0.72rem,3.6vw,1.25rem)] text-despesa">{totalSaidas > 0 ? fmt(totalSaidas) : <span className="text-texto-3">—</span>}</p>
        </div>
      </div>

      {/* Lista de contas reserva */}
      <div className="space-y-3">
        {reservaData.map(({ acc, cat, entradas, saidas }) => (
          <div key={acc.id} data-guia={acc === reservaAccounts[0] ? 'reservas.conta' : undefined} className="card">
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm font-semibold text-texto-1 break-words min-w-0">{acc.apelido || acc.name}</span>
                  {acc.reservaType === 'especifica' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-reserva/15 text-reserva shrink-0">
                      {cat ? `${cat.icon} ${cat.name}` : 'Específica'}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-hover text-texto-2 shrink-0">
                      🏦 Geral
                    </span>
                  )}
                </div>
                <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs">
                  {entradas > 0
                    ? <span className="flex items-center gap-1 text-receita whitespace-nowrap"><ArrowDownCircle size={11} className="shrink-0" /> +{fmt(entradas)}</span>
                    : <span className="text-texto-3">Sem depósitos no mês</span>
                  }
                  {saidas > 0 && (
                    <span className="flex items-center gap-1 text-despesa whitespace-nowrap"><ArrowUpCircle size={11} className="shrink-0" /> −{fmt(saidas)}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end text-right shrink-0">
                <p className={`font-bold tabular-nums whitespace-nowrap text-[clamp(0.85rem,4vw,1.25rem)] ${(acc.balance || 0) >= 0 ? 'text-texto-1' : 'text-despesa'}`}>
                  {fmtSinal(acc.balance || 0)}
                </p>
                <button
                  data-guia={acc === reservaAccounts[0] ? 'reservas.extrato' : undefined}
                  onClick={() => setExtratoAcc(acc)}
                  className="text-xs text-texto-3 hover:text-primary-fg transition-colors mt-0.5 whitespace-nowrap"
                >
                  Ver Extrato →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal extrato */}
      {extratoAcc && extratoData && (
        <Modal open onClose={() => setExtratoAcc(null)} title={`Extrato — ${extratoAcc.apelido || extratoAcc.name}`} size="md">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-borda">
              <span className="text-xs text-texto-3 uppercase tracking-wide">Saldo atual</span>
              <span className={`text-lg font-bold ${(extratoAcc.balance || 0) >= 0 ? 'text-texto-1' : 'text-despesa'}`}>
                {fmtSinal(extratoAcc.balance || 0)}
              </span>
            </div>
            {extratoData.txsExtrato.length === 0 ? (
              <p className="text-center text-texto-3 text-sm py-6">Nenhuma movimentação registrada</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-0">
                {extratoData.txsExtrato.map(tx => {
                  const isEntrada = tx.toAccountId === extratoAcc.id
                  const d = tx.date
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-borda/50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {isEntrada
                          ? <ArrowDownCircle size={13} className="text-receita shrink-0" />
                          : <ArrowUpCircle size={13} className="text-despesa shrink-0" />
                        }
                        <div className="min-w-0">
                          <p className="text-sm text-texto-1 truncate">{tx.description || (isEntrada ? 'Depósito' : 'Resgate')}</p>
                          <p className="text-xs text-texto-3">{d.slice(8)}/{d.slice(5,7)}/{d.slice(0,4)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ml-3 ${isEntrada ? 'text-receita' : 'text-despesa'}`}>
                        {isEntrada ? '+' : '−'}{fmt(tx.amount)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Indicador de observação do ajuste ───────────────────────────────────────
// Ícone ao lado do valor de ajuste. Desktop: tooltip nativo (hover via title).
// Mobile: popover ao tocar (fecha ao tocar fora). Renderiza fora do botão que
// abre o modal (evita botão aninhado).
function ObsIndicator({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc) }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        title={text}
        aria-label="Ver observação do ajuste"
        className="text-texto-3 hover:text-texto-2 transition-colors"
      >
        <MessageSquare size={11} />
      </button>
      {open && (
        <span className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-48 max-w-[60vw] rounded-lg border border-borda-forte bg-surface px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-left text-texto-1 shadow-xl whitespace-pre-wrap">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Tab 1: Resumo ───────────────────────────────────────────────────────────
function ResumoTab({ functions, semVinculo, accounts, categories = [], accountBalances, adjustmentsByFn = {}, activePeriodByFn = {}, saldosAtualizados, movFuturosByFn = {}, computeSaldo, todayStr, autoBoundsOf, lastFechamento, canUndo, onAdd, onEdit, onDelete, onUpdateFunction, onSetAccountBalance, onAddPeriod, onAddAdjustment, onUpdateAdjustment, onDeleteAdjustment, onVirar, onUndo, onReorder }) {
  // Nível de acesso (src/lib/permissoes.js): funções, saldos iniciais, ajustes e viradas = reservas.
  const { pode } = useApp()
  const podeIncluir = pode('reservas', 'incluir')
  const podeEditar = pode('reservas', 'editar')
  const podeExcluir = pode('reservas', 'excluir')
  const byOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.name.localeCompare(b.name)
  // Nome da categoria vinculada à função (quando categoryId preenchido).
  const catNameOf = (id) => categories.find(c => c.id === id)?.name
  // Função cujo modal de histórico de ajustes está aberto (Parte 6).
  const [adjFn, setAdjFn] = useState(null)
  // Função cujo modal de Movimentos Futuros (detalhamento) está aberto.
  const [movFn, setMovFn] = useState(null)
  // Modal "Origem" do valor AUTO: { fn, tipo: 'entradas'|'saidas', items, loading, error }.
  const [origem, setOrigem] = useState(null)
  const openOrigem = async (fn, tipo) => {
    setOrigem({ fn, tipo, loading: true, items: [] })
    try {
      const { start, end } = autoBoundsOf(fn.id)
      const { transactions: items } = await fetchReserveFunctionTransactions(fn.id, start, end)
      setOrigem({ fn, tipo, loading: false, items: items || [] })
    } catch {
      setOrigem({ fn, tipo, loading: false, error: true, items: [] })
    }
  }
  // Cor do valor de ajuste: azul (+), laranja (−), cinza (0).
  const ajusteColor = (v) => v > 0 ? 'text-receita' : v < 0 ? 'text-despesa' : 'text-texto-3'
  const groups = useMemo(() => {
    const byAccount = {}
    functions.forEach(f => {
      const key = f.accountId || '__none__'
      ;(byAccount[key] = byAccount[key] || []).push(f)
    })
    const result = []
    accounts.forEach(acc => {
      if (byAccount[acc.id]) result.push({ accountId: acc.id, account: acc, fns: [...byAccount[acc.id]].sort(byOrdem) })
    })
    if (byAccount['__none__']) result.push({ accountId: null, account: null, fns: [...byAccount['__none__']].sort(byOrdem) })
    return result
  }, [functions, accounts])

  // Total do topo = soma das funções EXIBIDAS (as dos grupos), no perfil do topo.
  const grandTotal = groups.reduce((t, g) => t + g.fns.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0), 0)

  const [dragId, setDragId] = useState(null)
  // Coluna "Distribuir": valor (texto) por função; erro e gravação por conta de reserva.
  const [distrib, setDistrib] = useState({})
  const [distErro, setDistErro] = useState({})
  const [distSalvando, setDistSalvando] = useState(null)
  useSubtelaGuia('reservas:resumo')
  const limparDistrib = (accountId, fns) => {
    setDistrib(prev => ({ ...prev, ...Object.fromEntries(fns.map(f => [f.id, ''])) }))
    setDistErro(e => ({ ...e, [accountId]: null }))
  }
  // Grava um AJUSTE por função (reserve_adjustments): não move dinheiro, não conta em total nenhum.
  const confirmarDistrib = async (accountId, fns, aDistribuir) => {
    const valores = Object.fromEntries(fns.map(f => [f.id, parseValorBR(distrib[f.id])]).filter(([, v]) => Number.isFinite(v) && v !== 0))
    const erro = erroDistribuicao(fns.map(f => ({ id: f.id, nome: f.name, saldo: computeSaldo(f) })), valores, aDistribuir)
    if (erro) { setDistErro(e => ({ ...e, [accountId]: erro })); return }
    setDistSalvando(accountId)
    try {
      for (const [functionId, v] of Object.entries(valores)) {
        await onAddAdjustment({ id: newId('adj'), function_id: functionId, data: todayStr, valor: Math.round(v * 100) / 100, observacao: OBS_DISTRIBUICAO })
      }
      limparDistrib(accountId, fns)
    } catch (err) {
      setDistErro(e => ({ ...e, [accountId]: `Não foi possível gravar: ${err.message}` }))
    } finally {
      setDistSalvando(null)
    }
  }
  const handleDropOn = (targetFn) => {
    const dragged = functions.find(f => f.id === dragId)
    setDragId(null)
    if (!dragged || dragged.id === targetFn.id) return
    if ((dragged.accountId || null) !== (targetFn.accountId || null)) return // reordena dentro do mesmo grupo
    const allFns = groups.flatMap(g => g.fns)
    const arr = [...allFns]
    const from = arr.findIndex(f => f.id === dragged.id)
    const to = arr.findIndex(f => f.id === targetFn.id)
    if (from === -1 || to === -1) return
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    onReorder(arr.map(f => f.id))
  }

  const handleExport = () => {
    const linhas = []
    groups.forEach(g => g.fns.forEach(f => {
      linhas.push({
        funcao: f.name,
        conta: g.account ? (g.account.apelido || g.account.name) : 'Sem conta',
        inicial: f.saldoInicial, entradas: f.entradas, saidas: f.saidas, saldo: computeSaldo(f),
        atualizado: saldosAtualizados[f.id] ?? computeSaldo(f),
      })
    }))
    const moeda = (chave, titulo, cor) => ({ chave, titulo, tipo: 'moeda', ...(cor ? { cor: () => cor } : {}) })
    exportarRelatorio({
      titulo: 'Reservas — Resumo', nome: 'Resumo',
      filtros: [`Posição em ${fmtDate(isoLocal(new Date()))}`],
      resumo: [
        { rotulo: 'Saldo inicial', soma: 'inicial' },
        { rotulo: 'Entradas', soma: 'entradas', cor: 'verde' },
        { rotulo: 'Saídas', soma: 'saidas', cor: 'vermelho' },
        { rotulo: 'Saldo atualizado', soma: 'atualizado' },
      ],
      colunas: [
        { chave: 'funcao', titulo: 'Função' }, { chave: 'conta', titulo: 'Conta' },
        moeda('inicial', 'Saldo Inicial'), moeda('entradas', 'Entradas', 'receita'), moeda('saidas', 'Saídas', 'despesa'),
        moeda('saldo', 'Saldo'), moeda('atualizado', 'Saldo Atualizado'),
      ],
      linhas,
      totais: { rotulo: (n) => `${n} ${n === 1 ? 'função' : 'funções'}`, somar: ['inicial', 'entradas', 'saidas', 'saldo', 'atualizado'] },
      nomeArquivo: { relatorio: 'Reservas-Resumo', periodo: mesAtualArquivo() },
    })
  }

  return (
    <div className="space-y-4">
      {/* KPI + actions — no mobile os botões ocupam uma linha própria (w-full) em vez de
          depender de ml-auto, que empurrava "Total reservado:" para fora da borda esquerda. */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 shrink-0" data-guia="reservas:resumo.total">
          <span className="text-xs text-texto-3 uppercase tracking-wide whitespace-nowrap">Total reservado:</span>
          <span className={`text-lg font-bold ${grandTotal >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmtSinal(grandTotal)}</span>
        </div>
        {lastFechamento && (
          <span className="text-xs text-texto-3 hidden sm:inline">Último fechamento: {fmtDate(lastFechamento)}</span>
        )}
        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto flex-wrap justify-end">
          {functions.length > 0 && (
            <button data-guia="reservas:resumo.exportar" onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
            </button>
          )}
          {canUndo && podeEditar && (
            <button data-guia="reservas:resumo.desfazer-virada" onClick={onUndo} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <RotateCcw size={12} /> <span className="hidden sm:inline">Desfazer Virada</span><span className="sm:hidden">Desfazer</span>
            </button>
          )}
          {podeEditar && (
          <button data-guia="reservas:resumo.virar-saldo" onClick={onVirar} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <CheckCircle size={12} /> <span className="hidden sm:inline">Virar Saldo</span><span className="sm:hidden">Virar</span>
          </button>
          )}
          {podeIncluir && (
          <button data-guia="reservas:resumo.nova-funcao" onClick={onAdd} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus size={12} /> <span className="hidden sm:inline">Nova Função</span><span className="sm:hidden">Nova</span>
          </button>
          )}
        </div>
      </div>

      {functions.length === 0 && (
        <div className="card text-center py-12">
          <Layers size={32} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-3">Nenhuma função de reserva cadastrada</p>
          {podeIncluir && <button className="btn-primary mt-4" onClick={onAdd}>Cadastrar Função</button>}
        </div>
      )}

      {groups.map(({ accountId, account, fns }) => {
        const totalSaldo = fns.reduce((s, f) => s + computeSaldo(f), 0)
        const totalAtualizado = fns.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0)
        const totalLiquido = Math.round(fns.reduce((s, f) => s + (movFuturosByFn[f.id]?.liquido || 0), 0) * 100) / 100
        const totalSaldoFuturo = Math.round((totalAtualizado + totalLiquido) * 100) / 100
        const saldoReal = accountId !== null
          ? (accountBalances[accountId] !== undefined ? accountBalances[accountId] : (account?.balance || 0))
          : null
        const diff = saldoReal !== null ? Math.round((saldoReal - totalSaldo) * 100) / 100 : null
        const accLabel = account ? (account.apelido || account.name) : null
        const totalDistrib = Math.round(fns.reduce((s, f) => s + (parseValorBR(distrib[f.id]) || 0), 0) * 100) / 100
        const totalRendimentos = Math.round(fns.reduce((s, f) => s + (f.rendimentos || 0), 0) * 100) / 100

        return (
          <div key={accountId || '__none__'}>
            {/* ── Mobile card layout (hidden md+) ── */}
            <div className="md:hidden space-y-2">
              {/* Group header */}
              <div className="flex items-center gap-3 px-1">
                {accLabel
                  ? <span className="text-xs font-semibold text-texto-2 uppercase tracking-wide">{accLabel}</span>
                  : <span className="text-xs font-semibold text-texto-3 italic uppercase tracking-wide">Sem conta vinculada</span>
                }
                <div className="flex-1 h-px bg-surface-2" />
                <span className={`text-xs font-bold ${totalAtualizado < 0 ? 'text-despesa' : 'text-receita'}`}>
                  {fmtSinal(totalAtualizado)}
                </span>
              </div>

              {/* Saldo Real input on mobile (for linked accounts) */}
              {accountId && (
                <div className="card py-2 px-3 flex items-center gap-2 flex-wrap" data-help-id="reservaResumo.saldoReal">
                  <span className="text-xs text-texto-3 shrink-0">Saldo real da conta:<HelpCampo campo="reservaResumo.saldoReal" /></span>
                  {/* input + diferença ficam juntos: em telas estreitas quebram como bloco abaixo do label */}
                  <div className="flex items-center gap-2 flex-1 min-w-[8rem]">
                    <InputMoeda negativo
                      data-guia={fns === groups.find(g => g.accountId)?.fns ? 'reservas:resumo.saldo-real' : undefined}
                      className="input flex-1 min-w-0 text-xs py-1 text-right"
                      aria-label="Saldo real da conta"
                      value={saldoReal ?? ''}
                      onChange={e => onSetAccountBalance(accountId, e.target.value)}
                    />
                    {diff !== null && diff !== 0 && (
                      <span className={`text-xs font-medium shrink-0 ${diff >= 0 ? 'text-receita' : 'text-despesa'}`}>
                        {diff > 0 ? '+' : ''}{fmtSinal(diff)} a distribuir
                      </span>
                    )}
                  </div>
                </div>
              )}

              {fns.map(f => {
                const saldo = computeSaldo(f)
                const atualizado = saldosAtualizados[f.id] ?? saldo
                const liquido = movFuturosByFn[f.id]?.liquido || 0
                const saldoFuturo = Math.round((atualizado + liquido) * 100) / 100
                return (
                  <div
                    key={f.id}
                    draggable={podeEditar}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(f.id) }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleDropOn(f) }}
                    className={`card py-3 px-3 space-y-2 ${dragId === f.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-texto-1 inline-flex items-center gap-1.5 min-w-0">
                        <GripVertical size={12} className="text-texto-3 cursor-grab shrink-0" />
                        <span className="truncate">{f.name}</span>
                        {f.accountId && semVinculo?.has(f.id) && <ProfileBadge account={account} className="shrink-0" />}
                        <DespesaToggle on={!!f.exibirComoDespesa} onToggle={podeEditar ? () => onUpdateFunction(f.id, { exibirComoDespesa: !f.exibirComoDespesa }) : null} />
                        {/* Categoria só aparece quando difere do nome da função (evita "IPVA … IPVA" duplicado) */}
                        {catNameOf(f.categoryId) && catNameOf(f.categoryId) !== f.name && <span className="text-xs text-texto-2 truncate">{catNameOf(f.categoryId)}</span>}
                      </span>
                      {accLabel && (
                        <span className="text-xs px-2 py-0.5 rounded bg-surface-2 text-texto-2 shrink-0">{account.apelido || account.name.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className={`text-lg font-bold ${atualizado < 0 ? 'text-despesa' : 'text-receita'}`}>
                      {fmtSinal(atualizado)}
                    </div>
                    <div className="flex items-center justify-between text-xs gap-3">
                      <button data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.mov-futuros' : undefined} onClick={() => setMovFn(f)} className="text-texto-3 hover:underline whitespace-nowrap">
                        Mov. Futuros:
                        <span className={`ml-1 font-semibold ${liquido > 0 ? 'text-receita' : liquido < 0 ? 'text-despesa' : 'text-texto-3'}`}>
                          {liquido !== 0 ? (liquido > 0 ? '+' : '') + fmtSinal(liquido) : '0,00'}
                        </span>
                      </button>
                      <span className="text-texto-3 whitespace-nowrap">
                        Saldo Futuro: <span className={`font-semibold ${saldoFuturo < 0 ? 'text-despesa' : 'text-receita'}`}>{fmtSinal(saldoFuturo)}</span>
                      </span>
                    </div>
                    <div className="h-px bg-surface-2" />
                    {/* Duas linhas no mobile: (1) Entradas + Saídas  (2) Ajuste à esq., botões à dir.
                        Garante que os botões editar/excluir nunca saiam da tela e que os selos
                        AUTO/MANUAL não sejam truncados. */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-texto-3 shrink-0">Saldo inicial:</span>
                        <SaldoInicialCell f={f} todayStr={todayStr} activePeriod={activePeriodByFn[f.id]} onAddPeriod={podeEditar ? onAddPeriod : null} />
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0" data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.entradas-saidas' : undefined}>
                          <span className="text-texto-3 shrink-0">Entradas:</span>
                          <MovValue value={f.entradas} tipo="entradas" onClick={() => openOrigem(f, 'entradas')} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-texto-3 shrink-0">Saídas:</span>
                          <MovValue value={f.saidas} tipo="saidas" onClick={() => openOrigem(f, 'saidas')} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-texto-3 shrink-0">Ajuste:</span>
                          <button
                            data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.ajuste' : undefined}
                            onClick={() => setAdjFn(f)}
                            className={`inline-flex items-center gap-1 font-semibold hover:underline ${ajusteColor(f.ajuste)}`}
                            title="Ver histórico de ajustes"
                          >
                            {f.ajuste !== 0 ? (f.ajuste > 0 ? '+' : '') + fmtSinal(f.ajuste) : <span className="text-texto-3">0,00</span>}
                          </button>
                          {podeEditar && <button onClick={() => setAdjFn(f)} title="Adicionar ajuste" className="text-texto-3 hover:text-primary-fg shrink-0"><Plus size={12} /></button>}
                          {f.ajusteObs && <ObsIndicator text={f.ajusteObs} />}
                          {f.rendimentos ? <span className="ml-2 text-texto-3 shrink-0">Rend.: <span className="font-semibold text-receita">{fmtSinal(f.rendimentos)}</span></span> : null}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {podeEditar && (
                          <button data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.editar' : undefined} onClick={() => onEdit(f)} className="p-1.5 rounded hover:bg-surface-hover text-texto-3 hover:text-texto-2 transition-colors">
                            <Edit2 size={12} />
                          </button>
                          )}
                          {podeExcluir && (
                          <button data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.excluir' : undefined} onClick={() => onDelete(f)} className="p-1.5 rounded hover:bg-surface-hover text-texto-3 hover:text-perigo transition-colors">
                            <Trash2 size={12} />
                          </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Desktop table layout (hidden below md) ── */}
            <div className="hidden md:block card p-0 overflow-hidden">
              {/* Account header */}
              <div className="px-4 py-3 border-b border-borda bg-surface-2/30 flex items-center gap-4 flex-wrap">
                {account ? (
                  <>
                    <span className="text-sm font-semibold text-texto-1">{account.apelido || account.name}</span>
                    <span className="text-xs text-texto-3">{fns.length} {fns.length === 1 ? 'função' : 'funções'}</span>
                    <span className="text-xs text-texto-3">
                      Σ saldos: <span className="text-texto-2 font-medium">{fmtSinal(totalSaldo)}</span>
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-xs text-texto-3 shrink-0">Saldo Real:<HelpCampo campo="reservaResumo.saldoReal" /></label>
                      <InputMoeda negativo
                        data-guia={fns === groups.find(g => g.accountId)?.fns ? 'reservas:resumo.saldo-real' : undefined}
                        className="input w-32 text-xs py-1 text-right"
                        helpId="reservaResumo.saldoReal"
                        aria-label="Saldo real da conta"
                        value={saldoReal ?? ''}
                        onChange={e => onSetAccountBalance(accountId, e.target.value)}
                      />
                      {diff !== null && diff !== 0 && (
                        <span className={`text-xs font-medium shrink-0 ${diff >= 0 ? 'text-receita' : 'text-despesa'}`}>
                          {diff > 0 ? '+' : ''}{fmtSinal(diff)} a distribuir
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-texto-3 italic">Sem conta vinculada</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 780 }}>
                  <thead>
                    <tr className="border-b border-borda">
                      <th className="text-left px-4 py-2 text-xs text-texto-2 font-medium">Despesa Anual</th>
                      <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Saldo Inicial</th>
                      <th className="text-right px-4 py-2 text-xs text-receita font-medium w-28">Entradas (+)</th>
                      <th className="text-right px-4 py-2 text-xs text-despesa font-medium w-28">Saídas (−)</th>
                      <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-24">Ajuste</th>
                      <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Distribuir<HelpCampo campo="reservaResumo.distribuir" /></th>
                      <th className="text-right px-4 py-2 text-xs text-receita font-medium w-28" title="Parte da função nos rendimentos da conta (rateio automático pelo saldo)">Rendimentos</th>
                      <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Saldo</th>
                      <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Mov. Futuros</th>
                      <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Saldo Futuro</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {fns.map(f => {
                      const saldo = computeSaldo(f)
                      const atualizado = saldosAtualizados[f.id] ?? saldo
                      const liquido = movFuturosByFn[f.id]?.liquido || 0
                      const saldoFuturo = Math.round((atualizado + liquido) * 100) / 100
                      return (
                        <tr
                          key={f.id}
                          draggable={podeEditar}
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(f.id) }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); handleDropOn(f) }}
                          className={`border-b border-borda/50 hover:bg-surface-hover/20 transition-colors ${dragId === f.id ? 'opacity-40' : ''}`}
                        >
                          <td className="px-4 py-2 text-xs text-texto-1">
                            <span className="inline-flex items-center gap-1.5">
                              <GripVertical size={11} className="text-texto-3 cursor-grab shrink-0" />
                              {f.name}
                              {f.accountId && semVinculo?.has(f.id) && <ProfileBadge account={account} />}
                              <DespesaToggle on={!!f.exibirComoDespesa} onToggle={podeEditar ? () => onUpdateFunction(f.id, { exibirComoDespesa: !f.exibirComoDespesa }) : null} />
                              {catNameOf(f.categoryId) && <span className="text-xs text-texto-2">{catNameOf(f.categoryId)}</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap text-xs text-texto-2">
                            <SaldoInicialCell f={f} todayStr={todayStr} activePeriod={activePeriodByFn[f.id]} onAddPeriod={podeEditar ? onAddPeriod : null} align="right" />
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap" data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.entradas-saidas' : undefined}>
                            <MovValue value={f.entradas} tipo="entradas" onClick={() => openOrigem(f, 'entradas')} />
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <MovValue value={f.saidas} tipo="saidas" onClick={() => openOrigem(f, 'saidas')} />
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <span className="inline-flex items-center justify-end gap-1">
                              <button
                                data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.ajuste' : undefined}
                                onClick={() => setAdjFn(f)}
                                title="Ver histórico de ajustes"
                                className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer ${ajusteColor(f.ajuste)}`}
                              >
                                {f.ajuste !== 0 ? (f.ajuste > 0 ? '+' : '') + fmtSinal(f.ajuste) : <span className="text-texto-3">0,00</span>}
                              </button>
                              {podeEditar && <button onClick={() => setAdjFn(f)} title="Adicionar ajuste" className="text-texto-3 hover:text-primary-fg shrink-0"><Plus size={11} /></button>}
                              {f.ajusteObs && <ObsIndicator text={f.ajusteObs} />}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right">
                            {podeEditar && accountId && diff ? (
                              <InputMoeda negativo
                                className="input w-24 !py-1 !px-2 text-xs text-right"
                                value={distrib[f.id] ?? ''}
                                onChange={e => { const v = e.target.value; setDistrib(prev => ({ ...prev, [f.id]: v })); setDistErro(x => ({ ...x, [accountId]: null })) }}
                                aria-label={`Distribuir para ${f.name}`}
                                helpId="reservaResumo.distribuir"
                              />
                            ) : <span className="text-xs text-texto-3">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold text-receita">
                            {f.rendimentos ? fmtSinal(f.rendimentos) : <span className="text-texto-3">0,00</span>}
                          </td>
                          <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-bold ${saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>
                            {fmtSinal(saldo)}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold">
                            <button
                              data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.mov-futuros' : undefined}
                              onClick={() => setMovFn(f)}
                              title="Ver movimentos futuros previstos"
                              className={`hover:underline cursor-pointer ${liquido > 0 ? 'text-receita' : liquido < 0 ? 'text-despesa' : 'text-texto-3'}`}
                            >
                              {liquido !== 0 ? (liquido > 0 ? '+' : '') + fmtSinal(liquido) : <span className="text-texto-3">0,00</span>}
                            </button>
                          </td>
                          <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-bold ${saldoFuturo < 0 ? 'text-despesa' : 'text-receita'}`}>
                            {fmtSinal(saldoFuturo)}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              {podeEditar && (
                              <button data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.editar' : undefined} onClick={() => onEdit(f)} className="p-1 rounded hover:bg-surface-hover text-texto-3 hover:text-texto-2 transition-colors">
                                <Edit2 size={11} />
                              </button>
                              )}
                              {podeExcluir && (
                              <button data-guia={f === groups[0]?.fns[0] ? 'reservas:resumo.excluir' : undefined} onClick={() => onDelete(f)} className="p-1 rounded hover:bg-surface-hover text-texto-3 hover:text-perigo transition-colors">
                                <Trash2 size={11} />
                              </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Totals row */}
                    <tr className="border-t border-borda-forte bg-surface-2/20">
                      <td className="px-4 py-2 text-xs font-semibold text-texto-3">Total</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold text-texto-2">
                        {fmtSinal(fns.reduce((s, f) => s + f.saldoInicial, 0))}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold text-receita">
                        {fmtSinal(fns.reduce((s, f) => s + f.entradas, 0))}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold text-despesa">
                        {fmtSinal(fns.reduce((s, f) => s + f.saidas, 0))}
                      </td>
                      {(() => { const ta = fns.reduce((s, f) => s + (f.ajuste || 0), 0); return (
                        <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-semibold ${ajusteColor(ta)}`}>
                          {ta !== 0 ? (ta > 0 ? '+' : '') + fmtSinal(ta) : <span className="text-texto-3">0,00</span>}
                        </td>
                      ) })()}
                      <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold text-texto-2">
                        {totalDistrib !== 0 ? fmtSinal(totalDistrib) : ''}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-xs font-semibold text-receita">
                        {totalRendimentos ? fmtSinal(totalRendimentos) : <span className="text-texto-3">0,00</span>}
                      </td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-semibold ${totalSaldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>
                        {fmtSinal(totalSaldo)}
                      </td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-semibold ${totalLiquido > 0 ? 'text-receita' : totalLiquido < 0 ? 'text-despesa' : 'text-texto-3'}`}>
                        {totalLiquido !== 0 ? (totalLiquido > 0 ? '+' : '') + fmtSinal(totalLiquido) : <span className="text-texto-3">0,00</span>}
                      </td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-bold ${totalSaldoFuturo < 0 ? 'text-despesa' : 'text-receita'}`}>
                        {fmtSinal(totalSaldoFuturo)}
                      </td>
                      <td />
                    </tr>
                    {/* Saldo a distribuir = saldo real − Σ saldos das funções (pode ser negativo). */}
                    {accountId && diff !== null && (
                      <tr className="bg-surface-2/10">
                        <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-texto-2">
                          Saldo a distribuir <span className="font-normal text-texto-3">(saldo real {fmtSinal(saldoReal)} − Σ funções)</span>
                        </td>
                        <td className={`px-4 py-2 text-right whitespace-nowrap text-xs font-bold ${diff < 0 ? 'text-despesa' : diff > 0 ? 'text-receita' : 'text-texto-3'}`}>
                          {fmtSinal(diff)}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    )}
                    {accountId && podeEditar && diff ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs" data-guia={fns === groups.find(g => g.accountId)?.fns ? 'reservas:resumo.distribuir' : undefined}>
                            <button type="button" className="btn-secondary text-xs py-1" onClick={() => limparDistrib(accountId, fns)}>Limpar</button>
                            <span className="text-texto-3">
                              Distribuindo <span className="font-semibold text-texto-2">{fmtSinal(totalDistrib)}</span> de {fmtSinal(diff)}
                              {totalDistrib !== 0 && Math.abs(totalDistrib - diff) > 0.001 ? ' (parcial)' : ''}
                            </span>
                            <button type="button" className="btn-primary text-xs py-1 ml-auto disabled:opacity-40"
                              disabled={!totalDistrib || distSalvando === accountId}
                              onClick={() => confirmarDistrib(accountId, fns, diff)}>
                              {distSalvando === accountId ? 'Gravando…' : 'Confirmar distribuição'}
                            </button>
                          </div>
                          {distErro[accountId] && <p className="mt-1 text-xs text-perigo">{distErro[accountId]}</p>}
                          <p className="mt-1 text-[11px] text-texto-3">
                            A distribuição grava um ajuste em cada função: não move dinheiro entre contas e não conta como despesa nem receita. Pode ficar parada; nada obriga a distribuir.
                          </p>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}

      {adjFn && (
        <AjusteHistoricoModal
          fn={adjFn}
          adjustments={(adjustmentsByFn[adjFn.id] || []).filter(a => !ehAjusteDeRendimento(a))}
          activePeriod={activePeriodByFn[adjFn.id]}
          todayStr={todayStr}
          onAdd={podeEditar ? onAddAdjustment : null}
          onUpdate={podeEditar ? onUpdateAdjustment : null}
          onDelete={podeEditar ? onDeleteAdjustment : null}
          onClose={() => setAdjFn(null)}
        />
      )}

      {origem && (
        <OrigemModal origem={origem} onClose={() => setOrigem(null)} />
      )}

      {movFn && (
        <MovFuturosModal fn={movFn} data={movFuturosByFn[movFn.id]} onClose={() => setMovFn(null)} />
      )}
    </div>
  )
}

// Seção (tabela) do modal de Movimentos Futuros — Entradas ou Saídas previstas.
// Com `onAbrirResgate`, as linhas de resgate de cartão (item.resgateScheduleId) ficam clicáveis e
// abrem a composição per-gasto; as demais seguem só texto.
function MovFuturosSecao({ titulo, cor, items, total, vazio, onAbrirResgate }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${cor}`}>{titulo}</p>
      {items.length === 0 ? (
        <p className="text-sm text-texto-3 py-3 text-center">{vazio}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda-forte/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda text-left">
                <th className="px-3 py-2 text-xs text-texto-2 font-medium">Data</th>
                <th className="px-3 py-2 text-xs text-texto-2 font-medium">Descrição</th>
                <th className="px-3 py-2 text-xs text-texto-2 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const clicavel = !!onAbrirResgate && itemAbreComposicao(it)
                return (
                  <tr
                    key={i}
                    className={`border-b border-borda/40 ${clicavel ? 'group cursor-pointer hover:bg-surface-hover/30 transition-colors' : ''}`}
                    {...(clicavel ? {
                      role: 'button',
                      tabIndex: 0,
                      title: 'Ver os gastos que compõem este resgate',
                      onClick: () => onAbrirResgate(it),
                      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrirResgate(it) } },
                    } : {})}
                  >
                    <td className="px-3 py-2 text-xs text-texto-2 whitespace-nowrap">{fmtDate(it.date)}</td>
                    {clicavel ? (
                      <td className="px-3 py-2 text-xs text-texto-2 max-w-xs">
                        <span className="flex items-center gap-1">
                          <span className="truncate group-hover:underline underline-offset-2">{it.label}</span>
                          <ChevronRight size={12} className="shrink-0 text-texto-3 group-hover:text-texto-2" />
                        </span>
                      </td>
                    ) : (
                      <td className="px-3 py-2 text-xs text-texto-2 max-w-xs truncate" title={it.label}>{it.label}</td>
                    )}
                    <td className={`px-3 py-2 text-xs text-right font-medium whitespace-nowrap ${cor}`}>{fmt(it.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-borda-forte bg-surface-2/20">
                <td className="px-3 py-2 text-xs font-semibold text-texto-3">TOTAL</td>
                <td />
                <td className={`px-3 py-2 text-right text-xs font-bold ${cor}`}>{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// Modal de detalhamento de UMA célula do Fluxo Futuro: as ocorrências agendadas que somam o
// Dep (entradas) ou o Res (saídas) daquela função naquele mês.
//
// Reusa MovFuturosSecao — é a mesma tabela do modal de Movimentos Futuros do Resumo, só que
// recortada por mês. Os itens já vêm prontos de computeScheduledByFunction (depItems/resItems),
// que os coleta justamente para isto; nada é buscado no servidor.
//
// Linha de resgate de cartão → ResgateBreakdownModal empilhado por cima. Enquanto ele está aberto,
// o Escape (que os dois Modals escutam) não fecha este: fechar a composição volta para cá.
// A composição abre RECORTADA pela parte desta função (a linha é só a parte dela num resgate
// rateado), validando contra o valor da linha; "Ver fatura inteira" volta à visão completa.
function FluxoCelulaModal({ detalhe, onClose }) {
  const { fnName, tipo, mesLabel, items, total } = detalhe
  const entradas = tipo === 'deps'
  const { transactions, schedules, categories, scheduleReservaFuncoes } = useApp()
  const [resgate, setResgate] = useState(null) // { schedule, item }
  const resgateSched = resgate?.schedule
  const abrirResgate = (it) => {
    const s = (schedules || []).find(x => x.id === it.resgateScheduleId)
    if (s) setResgate({ schedule: s, item: it })
  }
  return (
    <>
    <Modal
      open
      onClose={resgateSched ? () => {} : onClose}
      title={`${entradas ? 'Entradas' : 'Saídas'} previstas — ${fnName} · ${mesLabel}`}
      size="lg"
    >
      <div className="space-y-5">
        <MovFuturosSecao
          titulo={entradas ? 'Entradas previstas' : 'Saídas previstas'}
          cor={entradas ? 'text-receita' : 'text-despesa'}
          items={items}
          total={total}
          vazio={entradas ? 'Nenhuma entrada prevista neste mês' : 'Nenhuma saída prevista neste mês'}
          onAbrirResgate={entradas ? undefined : abrirResgate}
        />
        <div className="flex justify-end">
          <button type="button" className="btn-secondary text-xs py-1.5 px-5" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
    {resgateSched && (
      <ResgateBreakdownModal
        schedule={resgateSched}
        transactions={transactions}
        schedules={schedules}
        categories={categories}
        recorte={{
          functionId: resgate.item.functionId,
          functionName: fnName,
          mesLabel,
          valor: resgate.item.amount,
          det: (scheduleReservaFuncoes || []).filter(srf => srf.scheduleId === resgateSched.id),
        }}
        onClose={() => setResgate(null)}
      />
    )}
    </>
  )
}

// Modal "Movimentos Futuros": entradas e saídas previstas (próximos 12 meses) de uma função.
function MovFuturosModal({ fn, data, onClose }) {
  const deps = data?.deps || []
  const ress = data?.ress || []
  const totalDeps = data?.totalDeps || 0
  const totalRess = data?.totalRess || 0
  const liquido = data?.liquido || 0

  return (
    <Modal open onClose={onClose} title={`Movimentos Futuros — ${fn.name}`} size="lg">
      <div className="space-y-5">
        <MovFuturosSecao titulo="Entradas previstas" cor="text-receita" items={deps} total={totalDeps} vazio="Nenhuma entrada prevista" />
        <MovFuturosSecao titulo="Saídas previstas" cor="text-despesa" items={ress} total={totalRess} vazio="Nenhuma saída prevista" />
        <div className="flex items-center justify-between border-t border-borda pt-3">
          <span className="text-sm font-semibold text-texto-2">LÍQUIDO</span>
          <span className={`text-lg font-bold ${liquido < 0 ? 'text-despesa' : 'text-receita'}`}>
            {(liquido > 0 ? '+' : '') + fmt(liquido)}
          </span>
        </div>
        <div className="flex justify-end">
          <button type="button" className="btn-secondary text-xs py-1.5 px-5" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// Modal "Origem": lançamentos que compõem o valor AUTO (Entradas ou Saídas) de uma função.
function OrigemModal({ origem, onClose }) {
  const { fn, tipo, loading, error, items } = origem
  const { transactions, schedules, categories } = useApp()
  const [breakdownSched, setBreakdownSched] = useState(null)
  // Fase 4: resolve o agendamento de resgate (com composição per-gasto) de uma linha de SAÍDA —
  // via a transferência executada (sourceScheduleId) → schedule resgate_reserva com sourceExpenseIds.
  // Sem link (resgate legado / saída comum) → null, e o botão não aparece (silencioso).
  const resgateSchedOf = (t) => {
    const tx = (transactions || []).find(x => x.id === t.id)
    const sid = tx?.sourceScheduleId
    if (!sid) return null
    const s = (schedules || []).find(x => x.id === sid && x.tipo === 'resgate_reserva')
    return s && (s.sourceExpenseIds || []).length > 0 ? s : null
  }
  // Direção vem do endpoint (classificada pelo account_id da função): só transferências
  // entrando/saindo da conta da reserva. Despesa de cartão é 'neutro' e não aparece aqui.
  const alvo = tipo === 'entradas' ? 'entrada' : 'saida'
  const filtered = (items || []).filter(t => t.direcao === alvo)
  const contaLabel = (t) => t.type === 'transfer'
    ? `${t.conta_nome || '—'} → ${t.conta_destino_nome || '—'}`
    : (t.conta_nome || '—')

  const titulo = `${tipo === 'entradas' ? 'Entradas' : 'Saídas'} — ${fn?.name || ''}`
  return (
    <>
    <Modal open onClose={onClose} title={titulo} size="lg">
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-texto-3 py-6 text-center">Carregando…</p>
        ) : error ? (
          <p className="text-sm text-perigo py-6 text-center">Erro ao buscar os lançamentos.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-texto-3 py-6 text-center">Nenhum lançamento encontrado neste período</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-borda-forte/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left">
                  <th className="px-3 py-2 text-xs text-texto-2 font-medium">Data</th>
                  <th className="px-3 py-2 text-xs text-texto-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 text-xs text-texto-2 font-medium">Conta</th>
                  <th className="px-3 py-2 text-xs text-texto-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-borda/40">
                    <td className="px-3 py-2 text-xs text-texto-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 text-xs text-texto-2 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate" title={t.description}>{t.description || '—'}</span>
                        {tipo === 'saidas' && resgateSchedOf(t) && (
                          <button
                            type="button"
                            onClick={() => setBreakdownSched(resgateSchedOf(t))}
                            title="Ver os gastos que compõem este resgate"
                            className="inline-flex items-center gap-1 text-[11px] bg-primary/15 text-primary-fg px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-primary/25 transition-colors shrink-0"
                          >
                            <List size={10} /> Ver gastos
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-texto-2 truncate">{contaLabel(t)}</td>
                    <td className={`px-3 py-2 text-xs text-right whitespace-nowrap font-medium ${tipo === 'entradas' ? 'text-receita' : 'text-despesa'}`}>{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" className="btn-secondary text-xs py-1.5 px-5" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
    {breakdownSched && (
      <ResgateBreakdownModal
        schedule={breakdownSched}
        transactions={transactions}
        schedules={schedules}
        categories={categories}
        onClose={() => setBreakdownSched(null)}
      />
    )}
    </>
  )
}

// id único (uuid quando disponível; fallback determinístico p/ ambientes sem crypto).
function newId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Célula "Saldo Inicial" clicável (Parte 5) ───────────────────────────────
// Mostra o saldo inicial efetivo (do período ativo, ou legado). Ao clicar abre um popover
// inline (não modal) para registrar um NOVO período: { data_inicio, saldo_inicial }.
function SaldoInicialCell({ f, todayStr, activePeriod, onAddPeriod, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(todayStr)
  const [valor, setValor] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc) }
  }, [open])

  const openPopover = () => {
    setData(todayStr)
    setValor(String(f.saldoInicial ?? 0))
    setOpen(true)
  }
  const save = async () => {
    const v = parseFloat(valor)
    if (isNaN(v) || !data) { setOpen(false); return }
    setSaving(true)
    try {
      await onAddPeriod({ id: newId('rp'), function_id: f.id, data_inicio: data, saldo_inicial: Math.round(v * 100) / 100 })
      setOpen(false)
    } finally { setSaving(false) }
  }

  if (!onAddPeriod) {
    return (
      <span className={`inline-flex items-center whitespace-nowrap text-xs font-semibold text-texto-2 ${align === 'right' ? 'justify-end w-full' : ''}`}
        title={activePeriod ? `Período desde ${fmtDate(activePeriod.data_inicio)}` : undefined}>
        {fmtSinal(f.saldoInicial ?? 0)}
      </span>
    )
  }

  return (
    <span ref={ref} className={`relative inline-flex items-center gap-1 group ${align === 'right' ? 'justify-end w-full' : ''}`}>
      <button
        onClick={openPopover}
        title={activePeriod ? `Período desde ${fmtDate(activePeriod.data_inicio)} — clique para definir um novo` : 'Definir saldo inicial com data de referência'}
        className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold hover:underline cursor-pointer text-texto-2"
      >
        {fmtSinal(f.saldoInicial ?? 0)}
        <Edit2 size={10} className="text-texto-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
      {open && (
        <div data-help-form="reservaSaldoInicial" className={`absolute z-40 top-full mt-1 w-56 rounded-lg border border-borda-forte bg-surface p-3 shadow-xl text-left space-y-2.5 normal-case ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div data-help-id="reservaSaldoInicial.data">
            <label className="text-[11px] text-texto-2 flex items-center gap-1 mb-1">📅 Data de referência<HelpCampo campo="reservaSaldoInicial.data" /></label>
            <input type="date" aria-label="Data de referência" value={data} onChange={e => setData(e.target.value)} className="input w-full text-xs py-1" />
          </div>
          <div data-help-id="reservaSaldoInicial.valor">
            <label className="text-[11px] text-texto-2 flex items-center gap-1 mb-1">💰 Valor<HelpCampo campo="reservaSaldoInicial.valor" /></label>
            <InputMoeda negativo value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00 (aceita negativo)" className="input w-full text-xs py-1 text-right" />
          </div>
          <div className="flex gap-2 pt-0.5">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 text-xs py-1" disabled={saving}>Cancelar</button>
            <button type="button" onClick={save} className="btn-primary flex-1 text-xs py-1" disabled={saving}>{saving ? '…' : 'Salvar'}</button>
          </div>
        </div>
      )}
    </span>
  )
}

// ── Modal "Ajustes — [função]": histórico de ajustes (Parte 6) ──────────────
// Lista os ajustes (reserve_adjustments) da função, com edição inline e exclusão. O TOTAL
// e o cálculo do Resumo consideram apenas os ajustes dentro do período ativo.
function AjusteHistoricoModal({ fn, adjustments, activePeriod, todayStr, onAdd, onUpdate, onDelete, onClose }) {
  const [newData, setNewData] = useState(todayStr)
  const [newValor, setNewValor] = useState('')
  const [newObs, setNewObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editValor, setEditValor] = useState('')
  const [editObs, setEditObs] = useState('')
  const [confirmDelId, setConfirmDelId] = useState(null)

  // Azul (+), laranja (−), cinza (0) — nunca verde/vermelho como único diferenciador.
  const valorColor = (v) => v > 0 ? 'text-receita' : v < 0 ? 'text-despesa' : 'text-texto-3'
  const fmtSigned = (v) => (v > 0 ? '+' : '') + fmt(v)

  const inPeriod = (a) => !activePeriod || a.data >= activePeriod.data_inicio
  const sorted = [...(adjustments || [])].sort((x, y) => x.data.localeCompare(y.data))
  const total = Math.round(sorted.reduce((s, a) => inPeriod(a) ? s + (Number(a.valor) || 0) : s, 0) * 100) / 100

  const handleAdd = async () => {
    const v = parseFloat(newValor)
    if (isNaN(v) || !newData) return
    setBusy(true)
    try {
      await onAdd({ id: newId('adj'), function_id: fn.id, data: newData, valor: Math.round(v * 100) / 100, observacao: newObs.trim() })
      setNewData(todayStr); setNewValor(''); setNewObs('')
    } finally { setBusy(false) }
  }

  const startEdit = (a) => { setEditId(a.id); setEditValor(String(a.valor)); setEditObs(a.observacao || '') }
  const saveEdit = async () => {
    const v = parseFloat(editValor)
    if (isNaN(v)) { setEditId(null); return }
    setBusy(true)
    try {
      await onUpdate({ id: editId, valor: Math.round(v * 100) / 100, observacao: editObs.trim() })
      setEditId(null)
    } finally { setBusy(false) }
  }

  const confirmDelete = async (id) => {
    setBusy(true)
    try { await onDelete(id); setConfirmDelId(null) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Ajustes — ${fn.name}`} size="lg">
      <div className="space-y-4" data-help-form="ajusteReserva">
        {activePeriod && (
          <p className="text-xs text-texto-3">
            Período ativo desde <span className="text-texto-2">{fmtDate(activePeriod.data_inicio)}</span> — o total considera os ajustes a partir desta data.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-borda-forte/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda text-left">
                <th className="px-3 py-2 text-xs text-texto-2 font-medium">Data</th>
                <th className="px-3 py-2 text-xs text-texto-2 font-medium text-right">Valor<HelpCampo campo="ajusteReserva.valor" /></th>
                <th className="px-3 py-2 text-xs text-texto-2 font-medium">Observação<HelpCampo campo="ajusteReserva.observacao" /></th>
                <th className="px-3 py-2 text-xs text-texto-2 font-medium text-right w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-texto-3 text-sm">Nenhum ajuste registrado</td></tr>
              )}
              {sorted.map(a => {
                const editing = editId === a.id
                const fora = !inPeriod(a)
                return (
                  <tr key={a.id} className={`border-b border-borda/40 ${fora ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 text-xs text-texto-2 whitespace-nowrap">
                      {fmtDate(a.data)}
                      {fora && <span className="ml-1 text-[9px] uppercase text-texto-3" title="Fora do período ativo — não entra no total">(fora)</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing
                        ? <InputMoeda negativo helpId="ajusteReserva.valor" aria-label="Valor do ajuste" value={editValor} onChange={e => setEditValor(e.target.value)} className="input w-24 text-xs py-1 text-right" />
                        : <span className={`text-xs font-semibold ${valorColor(Number(a.valor))}`}>{fmtSigned(Number(a.valor) || 0)}</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-texto-2">
                      {editing
                        ? <input type="text" data-help-id="ajusteReserva.observacao" aria-label="Observação" value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="Digite uma observação (opcional)" className="input w-full text-xs py-1" />
                        : <span className="truncate" title={a.observacao || ''}>{a.observacao || <span className="text-texto-3">—</span>}</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {editing ? (
                          <>
                            <button onClick={saveEdit} disabled={busy} className="text-xs text-primary-fg hover:underline px-1">Salvar</button>
                            <button onClick={() => setEditId(null)} className="text-xs text-texto-3 hover:underline px-1">✕</button>
                          </>
                        ) : confirmDelId === a.id ? (
                          <>
                            <span className="text-[10px] text-texto-2">Excluir?</span>
                            <button onClick={() => confirmDelete(a.id)} disabled={busy} className="text-xs text-perigo hover:underline px-1">Sim</button>
                            <button onClick={() => setConfirmDelId(null)} className="text-xs text-texto-3 hover:underline px-1">Não</button>
                          </>
                        ) : (
                          <>
                            {onUpdate && <button onClick={() => startEdit(a)} title="Editar" className="p-1 rounded hover:bg-surface-hover text-texto-3 hover:text-texto-1"><Edit2 size={12} /></button>}
                            {onDelete && <button onClick={() => setConfirmDelId(a.id)} title="Excluir" className="p-1 rounded hover:bg-surface-hover text-texto-3 hover:text-perigo"><Trash2 size={12} /></button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-borda-forte bg-surface-2/20">
                <td className="px-3 py-2 text-xs font-semibold text-texto-2">TOTAL</td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${valorColor(total)}`}>{total !== 0 ? fmtSigned(total) : <span className="text-texto-3">0,00</span>}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Novo ajuste (só com permissão de gravar em Reservas) */}
        {!onAdd && <p className="text-xs text-texto-3">Somente leitura — seu nível de acesso não permite gravar.</p>}
        {onAdd && (
        <div className="rounded-lg border border-borda-forte/60 p-3 space-y-2.5">
          <p className="text-xs font-semibold text-texto-2">+ Novo Ajuste</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div data-help-id="ajusteReserva.data">
              <label className="text-[11px] text-texto-2 flex items-center gap-1 mb-1">📅 Data<HelpCampo campo="ajusteReserva.data" /></label>
              <input type="date" aria-label="Data do ajuste" value={newData} onChange={e => setNewData(e.target.value)} className="input w-full text-xs py-1" />
            </div>
            <div data-help-id="ajusteReserva.valor">
              <label className="text-[11px] text-texto-2 flex items-center gap-1 mb-1">💰 Valor (±)<HelpCampo campo="ajusteReserva.valor" /></label>
              <InputMoeda negativo value={newValor} onChange={e => setNewValor(e.target.value)} placeholder="0,00" className="input w-full text-xs py-1 text-right" />
            </div>
            <div data-help-id="ajusteReserva.observacao">
              <label className="text-[11px] text-texto-2 flex items-center gap-1 mb-1">📝 Observação<HelpCampo campo="ajusteReserva.observacao" /></label>
              <input type="text" value={newObs} onChange={e => setNewObs(e.target.value)} placeholder="Digite uma observação (opcional)" className="input w-full text-xs py-1" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleAdd} disabled={busy || !newValor} className="btn-primary text-xs py-1.5 px-4">Salvar</button>
          </div>
        </div>
        )}

        <p className="text-xs text-texto-3 leading-relaxed">
          Cada ajuste entra no saldo (Saldo Inicial + Entradas − Saídas + Ajuste). Aceita valores negativos
          (ex.: -50). Positivos em azul, negativos em laranja.
        </p>
      </div>
    </Modal>
  )
}

// ── Fluxo Futuro: janela + projeção de dep/res/prov por função (lógica compartilhada) ──
// Extraídos para serem reusados tanto pelo FluxoTab quanto pelo Resumo (colunas Mov. Futuros /
// Saldo Futuro) — fonte única, sem duplicar o cálculo.

// Movimentos FUTUROS por função na janela do Fluxo Futuro (meses futuros, índice >= 1). Retorna
// { [functionId]: { liquido, deps, ress, totalDeps, totalRess } } — deps/ress são as ocorrências
// individuais (entradas / saídas previstas); líquido = totalDeps − totalRess.
function futureMovimentosByFunction(linked, accounts, schedules, scheduleReservaFuncoes, getNextOccurrences) {
  const win = buildFluxoWindow()
  const sched = computeScheduledByFunction(linked, accounts, schedules, scheduleReservaFuncoes, getNextOccurrences, win)
  const round2 = (n) => Math.round(n * 100) / 100
  const out = {}
  for (const f of linked) {
    const s = sched[f.id]
    const deps = (s?.depItems || []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const ress = (s?.resItems || []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const totalDeps = round2(deps.reduce((t, x) => t + (Number(x.amount) || 0), 0))
    const totalRess = round2(ress.reduce((t, x) => t + (Number(x.amount) || 0), 0))
    out[f.id] = { liquido: round2(totalDeps - totalRess), deps, ress, totalDeps, totalRess }
  }
  return out
}

const totalOuTraco = (v) => (v === 0 ? '—' : fmt(v))

// Nome da função (ou TOTAL GERAL) no Fluxo Futuro: abre o Extrato da função. Ícone de extrato ao
// lado; no computador sublinha ao passar o mouse.
function NomeExtrato({ nome, onAbrir, className = '' }) {
  return (
    <button type="button" onClick={onAbrir} title={`Ver o Fluxo de Caixa da Reserva de ${nome}`} aria-label={`Fluxo de Caixa da Reserva: ${nome}`}
      className={`inline-flex items-center gap-1 text-left hover:underline underline-offset-2 cursor-pointer ${className}`}>
      <span className="truncate">{nome}</span>
      <ScrollText size={11} className="shrink-0 text-texto-3" aria-hidden="true" />
    </button>
  )
}

// ── Tab 2: Fluxo Futuro ─────────────────────────────────────────────────────
function FluxoTab({ functions, semVinculo, accounts, categories, saldosAtualizados, schedules, schedulesSemVinculo = schedules, scheduleReservaFuncoes, getNextOccurrences, periodoAberto, realizadosDe, hoje }) {
  // Memo: com 60 meses o cálculo pesa, e um array novo a cada render o refazia sempre.
  const linked = useMemo(() => functions.filter(f => f.accountId), [functions])
  const round2 = (n) => Math.round(n * 100) / 100
  // Célula (função × mês × Dep/Res) cujo detalhamento está aberto. Declarado aqui em cima
  // porque o componente tem `return` antecipado quando não há função vinculada — um useState
  // depois dele quebraria a ordem dos hooks entre renders.
  const [detalhe, setDetalhe] = useState(null)
  // Extrato da função aberto: { funcao } (null = TOTAL GERAL, todas as funções da tela).
  const [extratoAlvo, setExtratoAlvo] = useState(null)

  // Período escolhido (src/lib/fluxoPeriodo.js), guardado por usuário em boas_vindas_usuario.progresso.
  // `atual` = mês do período ABERTO do Controle de Reservas (o do topo); "De" não vai antes dele.
  const atual = periodoAberto
  const [prefPeriodo, setPrefPeriodo] = useState(() => estadoBoasVindas()?.progresso?.fluxoPeriodo ?? null)
  useEffect(() => {
    let vivo = true
    carregarBoasVindas().then(e => { if (vivo && e) setPrefPeriodo(e.progresso?.fluxoPeriodo ?? null) })
    const sair = assinarBoasVindas(e => { if (e) setPrefPeriodo(e.progresso?.fluxoPeriodo ?? null) })
    return () => { vivo = false; sair() }
  }, [])
  const periodo = useMemo(() => periodoDaPreferencia(prefPeriodo, atual), [prefPeriodo, atual])
  const aplicarPeriodo = (p) => {
    const pref = preferenciaDoPeriodo(p, atual)
    setPrefPeriodo(pref)
    definirPeriodoFluxo(pref)
  }

  // Janela calculada: do mês de calendário ANTERIOR ao de hoje (índice 0 = saldo de hoje) até o
  // "Até" — a mesma âncora de sempre (buildFluxoWindow). A projeção começa sempre hoje; as colunas
  // antes do "De" (índice `ini`) só ficam escondidas.
  const inicioJanela = somarMeses(mesDaData(new Date()), -1)
  const janela = useMemo(() => janelaDoPeriodo(periodo, inicioJanela), [periodo, inicioJanela])
  const ini = janela.primeiro
  const win = useMemo(() => buildFluxoWindow(janela.meses), [janela.meses])
  const { winIndexOf } = win
  const nMeses = win.windowMonths.length
  // Meses exibidos. Divisória de ano relativa ao que aparece (a 1ª coluna já mostra o ano).
  const windowMonths = useMemo(
    () => win.windowMonths.slice(ini).map((wm, i) => ({ ...wm, isYearStart: wm.month0 === 0 && i > 0 })),
    [win, ini],
  )

  // Dep/Res por função/mês a partir dos AGENDAMENTOS reais (não dos campos de planejamento).
  // Lógica extraída para computeScheduledByFunction (compartilhada com o Resumo).
  // Função "Sem vínculo": todos os agendamentos (o valor não depende do perfil do topo).
  const scheduledDaJanela = useCallback((w) => ({
    ...computeScheduledByFunction(linked.filter(f => !semVinculo?.has(f.id)), accounts, schedules, scheduleReservaFuncoes, getNextOccurrences, w),
    ...computeScheduledByFunction(linked.filter(f => semVinculo?.has(f.id)), accounts, schedulesSemVinculo, scheduleReservaFuncoes, getNextOccurrences, w),
  }), [linked, semVinculo, accounts, schedules, schedulesSemVinculo, scheduleReservaFuncoes, getNextOccurrences])
  const scheduledByFunction = useMemo(() => scheduledDaJanela(win), [scheduledDaJanela, win])

  // Extrato da função: previstos de um período qualquer pelo MESMO cálculo da grade (mesma âncora da
  // janela, mesmas funções); no período da grade, os próprios valores dela.
  const previstosDoPeriodo = useCallback((p) => {
    if (p.de === periodo.de && p.ate === periodo.ate) return { win, ini, sched: scheduledByFunction }
    const jan = janelaDoPeriodo(p, inicioJanela)
    const w = buildFluxoWindow(jan.meses)
    return { win: w, ini: jan.primeiro, sched: scheduledDaJanela(w) }
  }, [periodo, win, ini, scheduledByFunction, inicioJanela, scheduledDaJanela])

  // Ponto de partida da projeção (o saldo de hoje) — o mesmo para a grade e para o extrato.
  const saldoInicialDe = useCallback(
    (f) => saldosAtualizados[f.id] ?? round2(f.saldoInicial + f.entradas - f.saidas),
    [saldosAtualizados],
  )
  // Projeção em toda a janela calculada (mesma conta de antes, só mais longa)…
  const projecoesCompletas = useMemo(() => {
    return linked.map(f => {
      const account = accounts.find(a => a.id === f.accountId)
      const start = saldoInicialDe(f)
      const schd = scheduledByFunction[f.id] || { deps: new Array(nMeses).fill(0), ress: new Array(nMeses).fill(0), provs: new Array(nMeses).fill(0) }
      let bal = start
      const monthly = win.windowMonths.map((wm, i) => {
        const dep = schd.deps[i]
        const res = schd.ress[i]
        const prov = schd.provs[i]
        // mês anterior (i=0) é a referência do saldo atual; projeção começa no mês corrente.
        // Provisões contam como saída adicional (resgate provisório).
        if (i > 0) bal = round2(bal + dep - res - prov)
        return { dep, res, prov, saldo: bal, neg: bal < 0, ...wm }
      })
      return { f, account, monthly }
    })
  }, [linked, accounts, saldoInicialDe, scheduledByFunction, win, nMeses])
  // …e o recorte exibido: linhas, TOTAL GERAL e Excel usam só os meses do período. O alerta conta
  // também a função que já está negativa hoje (saldo do índice 0 = Total Investido), para nenhuma
  // ficar escondida pelo período escolhido.
  const projections = useMemo(() => projecoesCompletas.map(p => {
    const monthly = p.monthly.slice(ini).map((d, i) => ({ ...d, isYearStart: windowMonths[i].isYearStart }))
    return { ...p, monthly, hasAlert: p.monthly[0].neg || monthly.some(d => d.neg) }
  }), [projecoesCompletas, ini, windowMonths])

  const totalInvested = linked.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0)
  const totalGeral = useMemo(() => totaisFluxoFuturo(projections, f => saldosAtualizados[f.id] || 0), [projections, saldosAtualizados])
  const hasProvisao = projections.some(p => p.monthly.some(m => m.prov > 0))
  const [mobilePage, setMobilePage] = useState(0)
  useSubtelaGuia('reservas:fluxo')

  const yy = (y) => String(y).slice(2)

  const catById = new Map((categories || []).map(c => [c.id, c]))
  // Categoria da função = categoria vinculada à conta de reserva (reservaType 'especifica').
  const catOf = (account) => {
    if (account?.reservaType !== 'especifica') return ''
    const c = catById.get(account.reservaCategoryId)
    return c ? c.name : ''
  }
  // Conta de reserva vinculada à função (ex.: CA, Pharma).
  const contaReservaOf = (account) => account ? (account.apelido || account.name) : ''

  const handleExport = () => {
    const colsMes = []
    windowMonths.forEach((wm, i) => {
      const lbl = `${wm.label}/${yy(wm.year)}`
      colsMes.push(
        { chave: `dep${i}`, titulo: `${lbl} Dep`, tipo: 'moeda', cor: () => 'receita' },
        { chave: `res${i}`, titulo: `${lbl} Res`, tipo: 'moeda', cor: () => 'despesa' },
        { chave: `saldo${i}`, titulo: `${lbl} Saldo`, tipo: 'moeda', cor: (l) => l[`saldo${i}`] < 0 ? 'despesa' : null },
      )
    })
    const linhas = projections.map(({ f, account, monthly }) => {
      const l = { funcao: f.name, conta: account ? (account.apelido || account.name) : '', categoria: catOf(account), reserva: contaReservaOf(account), investido: saldosAtualizados[f.id] || 0 }
      monthly.forEach((d, i) => { l[`dep${i}`] = d.dep; l[`res${i}`] = d.res; l[`saldo${i}`] = d.saldo })
      return l
    })
    const primeiro = windowMonths[0], ultimo = windowMonths[windowMonths.length - 1]
    exportarRelatorio({
      titulo: 'Reservas — Fluxo Futuro', nome: 'Fluxo Futuro',
      filtros: primeiro ? [`Meses: ${primeiro.label}/${yy(primeiro.year)} a ${ultimo.label}/${yy(ultimo.year)}`] : [],
      resumo: [{ rotulo: 'Total investido', soma: 'investido' }],
      colunas: [
        { chave: 'funcao', titulo: 'Função' }, { chave: 'conta', titulo: 'Conta' }, { chave: 'categoria', titulo: 'Categoria' },
        { chave: 'reserva', titulo: 'Conta Reserva' }, { chave: 'investido', titulo: 'Total Investido', tipo: 'moeda', cor: (l) => l.investido < 0 ? 'despesa' : null }, ...colsMes,
      ],
      linhas,
      totais: { titulo: 'TOTAL GERAL', rotulo: () => '', comCor: true, somar: ['investido', ...colsMes.map(c => c.chave)] },
      nomeArquivo: { relatorio: 'Reservas-Fluxo-Futuro', periodo: mesAtualArquivo() },
    })
  }

  if (linked.length === 0) {
    return (
      <div className="card text-center py-12">
        <Layers size={32} className="text-texto-3 mx-auto mb-3" />
        <p className="text-texto-3 text-sm">Nenhuma função vinculada a uma conta.</p>
        <p className="text-xs text-texto-3 mt-1">Edite as funções na aba Resumo para vincular uma conta.</p>
      </div>
    )
  }

  const alertCount = projections.filter(p => p.hasAlert).length
  // Celular: até 3 meses por página, percorrendo o período escolhido.
  const porPagina = Math.min(3, windowMonths.length)
  const ultimaPagina = windowMonths.length - porPagina
  const pagina = Math.min(mobilePage, ultimaPagina)
  const visibleMonths = Array.from({ length: porPagina }, (_, k) => pagina + k)
  const gradeMeses = { gridTemplateColumns: `repeat(${porPagina}, minmax(0, 1fr))` }

  // Ocorrências que somam aquela célula. `depItems`/`resItems` já vêm de
  // computeScheduledByFunction com a data de cada ocorrência — aqui só recorta pelo mês da
  // coluna, usando o MESMO winIndexOf que montou os totais, para lista e total não divergirem.
  const abrirCelula = (f, mi, tipo) => {
    const sched = scheduledByFunction[f.id]
    const brutos = (tipo === 'deps' ? sched?.depItems : sched?.resItems) || []
    const items = brutos
      .filter(it => winIndexOf(it.date) === mi + ini)
      .sort((a, b) => a.date.localeCompare(b.date))
    const wm = windowMonths[mi]
    setDetalhe({
      fnName: f.name,
      tipo,
      mesLabel: `${wm.label}/${wm.year}`,
      items,
      total: items.reduce((t, x) => round2(t + (Number(x.amount) || 0)), 0),
    })
  }

  // O mês de índice 0 da janela é o ANTERIOR ao atual, e computeScheduledByFunction só coleta
  // ocorrências de idx >= 1 — abrir a célula dele mostraria lista vazia com total diferente de zero.
  // `mi` é o índice exibido; na janela é mi + ini.
  const celulaClicavel = (mi, valor) => mi + ini >= 1 && valor > 0

  return (
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="card py-2.5 px-4 flex items-center gap-4 flex-wrap" data-guia="reservas:fluxo.total">
        <Layers size={13} className="text-texto-2" />
        <span className="text-xs text-texto-3">Total investido:</span>
        <span className={`text-sm font-bold ${totalInvested >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmtSinal(totalInvested)}</span>
        {alertCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-despesa ml-2">
            <AlertTriangle size={12} /> {alertCount} {alertCount === 1 ? 'função ficará negativa' : 'funções ficarão negativas'}
          </span>
        )}
        {hasProvisao && (
          <span className="text-xs text-texto-2 italic ml-2" title="Resgates projetados a partir de provisões de despesa ainda não efetivadas">
            ~ resgate provisório (provisão)
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <SeletorPeriodoFluxo periodo={periodo} atual={atual} onAplicar={aplicarPeriodo} />
          <button data-guia="reservas:fluxo.exportar" onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1">
            <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
          </button>
        </div>
      </div>

      {/* ── Mobile layout (hidden md+) ── */}
      <div className="md:hidden space-y-3">
        {/* Month navigator */}
        <div className="flex items-center justify-between gap-2" data-guia="reservas:fluxo.meses">
          <button
            onClick={() => setMobilePage(Math.max(0, pagina - 1))}
            disabled={pagina === 0}
            className="p-1.5 rounded bg-surface-2 text-texto-2 disabled:opacity-30 hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-texto-2 font-medium">
            {visibleMonths.map(mi => `${windowMonths[mi].label}/${yy(windowMonths[mi].year)}`).join(' · ')}
          </span>
          <button
            onClick={() => setMobilePage(Math.min(ultimaPagina, pagina + 1))}
            disabled={pagina >= ultimaPagina}
            className="p-1.5 rounded bg-surface-2 text-texto-2 disabled:opacity-30 hover:bg-surface-hover transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Cards per function */}
        {projections.map(({ f, account, monthly, hasAlert }) => (
          <div key={f.id} data-guia={f === projections[0]?.f ? 'reservas:fluxo.tabela' : undefined} className={`card p-0 overflow-hidden ${hasAlert ? 'border border-aviso/30' : ''}`}>
            {/* Card header */}
            <div className="px-3 py-2.5 border-b border-borda flex items-center gap-2">
              {hasAlert && <AlertTriangle size={11} className="text-aviso shrink-0" />}
              <NomeExtrato nome={f.name} onAbrir={() => setExtratoAlvo({ funcao: f })} className="text-sm font-medium text-texto-1 flex-1 min-w-0" />
              {semVinculo?.has(f.id) && <ProfileBadge account={account} className="shrink-0" />}
              {account && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-texto-2 shrink-0">
                  {account.apelido || account.name.slice(0, 8)}
                </span>
              )}
              <span className={`text-xs font-semibold shrink-0 ${(saldosAtualizados[f.id] || 0) < 0 ? 'text-despesa' : 'text-texto-2'}`}>
                {fmtSinal(saldosAtualizados[f.id] || 0)}
              </span>
            </div>

            {/* 3 month columns */}
            <div className="grid divide-x divide-borda" style={gradeMeses}>
              {visibleMonths.map(mi => {
                const d = monthly[mi]
                return (
                  <div key={mi} className={`px-2 py-2.5 ${d.neg ? 'bg-despesa/10' : ''} ${d.isYearStart ? 'border-l-2 border-l-primary' : ''}`}>
                    <p className="text-[10px] text-texto-3 font-semibold uppercase mb-1.5">
                      {d.label}{d.isYearStart || mi === 0 ? ` ${yy(d.year)}` : ''}
                    </p>
                    {celulaClicavel(mi, d.dep) ? (
                      <button
                        type="button"
                        onClick={() => abrirCelula(f, mi, 'deps')}
                        title="Ver os agendamentos que compõem este valor"
                        className="text-xs text-receita hover:underline cursor-pointer block text-left"
                      >
                        ↓ {fmt(d.dep)}
                      </button>
                    ) : (
                      <p className={`text-xs ${d.dep > 0 ? 'text-receita' : 'text-texto-3'}`}>
                        ↓ {d.dep > 0 ? fmt(d.dep) : '—'}
                      </p>
                    )}
                    {celulaClicavel(mi, d.res) ? (
                      <button
                        type="button"
                        onClick={() => abrirCelula(f, mi, 'ress')}
                        title="Ver os agendamentos que compõem este valor"
                        className="text-xs text-despesa hover:underline cursor-pointer block text-left"
                      >
                        ↑ {fmt(d.res)}
                      </button>
                    ) : (
                      <p className={`text-xs ${d.res > 0 ? 'text-despesa' : 'text-texto-3'}`}>
                        ↑ {d.res > 0 ? fmt(d.res) : '—'}
                      </p>
                    )}
                    {d.prov > 0 && (
                      <p className="text-[11px] italic text-texto-2" title="Resgate futuro (provisão) — estimativa">
                        ↑ ~{fmt(d.prov)}
                      </p>
                    )}
                    <p className={`text-xs font-semibold mt-1 ${d.neg ? 'text-despesa' : d.saldo === 0 ? 'text-texto-3' : 'text-texto-2'}`}>
                      {fmtSinal(d.saldo)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Total geral: fixo no fim da área de rolagem, sem precisar rolar a lista. */}
        <div className="card p-0 overflow-hidden sticky bottom-0 z-20 bg-surface-2 border-t-2 border-t-borda-forte shadow-2xl">
          <div className="px-3 py-2 border-b border-borda flex items-center gap-2">
            <NomeExtrato nome="TOTAL GERAL" onAbrir={() => setExtratoAlvo({ funcao: null })} className="text-sm font-bold text-texto-1 flex-1 min-w-0" />
            <span className={`text-xs font-bold shrink-0 ${totalGeral.investido < 0 ? 'text-despesa' : totalGeral.investido === 0 ? 'text-texto-3' : 'text-texto-2'}`}>
              {totalOuTraco(totalGeral.investido)}
            </span>
          </div>
          <div className="grid divide-x divide-borda" style={gradeMeses}>
            {visibleMonths.map(mi => {
              const t = totalGeral.monthly[mi]
              const wm = windowMonths[mi]
              return (
                <div key={mi} className={`px-2 py-2 ${t.saldo < 0 ? 'bg-despesa/10' : ''} ${wm.isYearStart ? 'border-l-2 border-l-primary' : ''}`}>
                  <p className="text-[10px] text-texto-3 font-semibold uppercase mb-1">
                    {wm.label}{wm.isYearStart || mi === 0 ? ` ${yy(wm.year)}` : ''}
                  </p>
                  <p className={`text-xs font-bold ${t.dep > 0 ? 'text-receita' : 'text-texto-3'}`}>↓ {totalOuTraco(t.dep)}</p>
                  <p className={`text-xs font-bold ${t.res > 0 ? 'text-despesa' : 'text-texto-3'}`}>↑ {totalOuTraco(t.res)}</p>
                  {t.prov > 0 && (
                    <p className="text-[11px] italic font-bold text-texto-2" title="Resgate futuro (provisão) — estimativa">↑ ~{fmt(t.prov)}</p>
                  )}
                  <p className={`text-xs font-bold mt-1 ${t.saldo < 0 ? 'text-despesa' : t.saldo === 0 ? 'text-texto-3' : 'text-texto-2'}`}>
                    {totalOuTraco(t.saldo)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Desktop layout (hidden below md) ── */}
      <div className="hidden md:block card p-0 overflow-hidden" data-guia="reservas:fluxo.tabela">
        {/* Rolagem própria nos dois eixos: é o que permite cabeçalho e rodapé fixos na mesma tabela.
            border-separate porque, com border-collapse, as bordas não acompanham células sticky. */}
        <div className="overflow-auto max-h-[max(20rem,calc(100dvh-16rem))]">
          <table className="text-xs border-separate border-spacing-0" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-surface [&>th]:border-b [&>th]:border-borda">
                <th className="sticky left-0 z-10 bg-surface border-r border-r-borda text-left px-3 py-2.5 text-texto-2 font-medium whitespace-nowrap" style={{ minWidth: 160 }}>Função</th>
                <th className="text-left px-3 py-2.5 text-texto-2 font-medium" style={{ minWidth: 80 }}>Conta</th>
                <th className="text-right px-3 py-2.5 text-texto-2 font-medium" style={{ minWidth: 100 }}>Total Investido</th>
                {windowMonths.map((wm, i) => (
                  <th
                    key={i}
                    colSpan={3}
                    className={`text-center px-1 py-2 font-medium whitespace-nowrap ${wm.isYearStart ? 'border-l-2 border-l-primary text-primary-fg' : 'border-l border-borda text-texto-2'}`}
                    style={{ minWidth: 190 }}
                  >
                    {wm.label}{wm.isYearStart || i === 0 ? ` ${wm.year}` : ''}
                  </th>
                ))}
              </tr>
              <tr className="bg-surface [&>th]:border-b [&>th]:border-b-borda-forte">
                <th className="sticky left-0 z-10 bg-surface border-r border-r-borda" /><th /><th />
                {windowMonths.map((wm, i) => (
                  <Fragment key={i}>
                    <th className={`text-right px-2 py-1.5 text-receita font-medium whitespace-nowrap ${wm.isYearStart ? 'border-l-2 border-l-primary' : 'border-l border-borda'}`} style={{ minWidth: 62 }}>Dep</th>
                    <th className="text-right px-2 py-1.5 text-despesa font-medium whitespace-nowrap" style={{ minWidth: 62 }}>Res</th>
                    <th className="text-right px-2 py-1.5 text-texto-3 font-medium whitespace-nowrap" style={{ minWidth: 66 }}>Saldo</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {projections.map(({ f, account, monthly, hasAlert }) => (
                <tr key={f.id} className={`group [&>td]:border-b [&>td]:border-b-borda/50 hover:bg-surface-hover/20 transition-colors ${hasAlert ? 'bg-aviso/5' : ''}`}>
                  {/* Fundo opaco (a coluna passa por cima das outras) com o mesmo tom do alerta/hover da linha. */}
                  <td className={`sticky left-0 z-10 border-r border-r-borda px-3 py-2 text-texto-1 whitespace-nowrap group-hover:bg-[color-mix(in_srgb,var(--color-surface-hover)_20%,var(--color-surface))] ${hasAlert ? 'bg-[color-mix(in_srgb,var(--color-aviso)_5%,var(--color-surface))]' : 'bg-surface'}`}>
                    {hasAlert && <AlertTriangle size={10} className="inline text-aviso mr-1" />}
                    <NomeExtrato nome={f.name} onAbrir={() => setExtratoAlvo({ funcao: f })} />
                    {semVinculo?.has(f.id) && <ProfileBadge account={account} className="ml-1.5 align-middle" />}
                  </td>
                  <td className="px-3 py-2">
                    {account
                      ? <span className="px-1.5 py-0.5 rounded text-xs bg-surface-2 text-texto-2">{account.apelido || account.name.slice(0, 8)}</span>
                      : <span className="text-texto-3">—</span>
                    }
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${(saldosAtualizados[f.id] || 0) < 0 ? 'text-despesa' : 'text-texto-2'}`}>
                    {fmt(saldosAtualizados[f.id] || 0)}
                  </td>
                  {monthly.map((d, mi) => (
                    <Fragment key={mi}>
                      <td className={`px-2 py-2 text-right ${d.isYearStart ? 'border-l-2 border-l-primary' : 'border-l border-borda'} ${d.dep > 0 ? 'text-receita' : 'text-texto-3'}`}>
                        {celulaClicavel(mi, d.dep) ? (
                          <button
                            type="button"
                            onClick={() => abrirCelula(f, mi, 'deps')}
                            title="Ver os agendamentos que compõem este valor"
                            className="hover:underline cursor-pointer"
                          >
                            {fmt(d.dep)}
                          </button>
                        ) : (d.dep > 0 ? fmt(d.dep) : '—')}
                      </td>
                      <td className={`px-2 py-2 text-right ${d.res > 0 ? 'text-despesa' : 'text-texto-3'}`}>
                        {celulaClicavel(mi, d.res) ? (
                          <button
                            type="button"
                            onClick={() => abrirCelula(f, mi, 'ress')}
                            title="Ver os agendamentos que compõem este valor"
                            className="hover:underline cursor-pointer"
                          >
                            {fmt(d.res)}
                          </button>
                        ) : (d.res > 0 ? fmt(d.res) : '—')}
                        {d.prov > 0 && (
                          <span className="block text-[10px] italic text-texto-2" title="Resgate futuro (provisão) — estimativa">
                            ~{fmt(d.prov)}
                          </span>
                        )}
                      </td>
                      <td data-testid={`fluxo-saldo-${f.id}-${mi}`} className={`px-2 py-2 text-right font-semibold ${d.neg ? 'text-despesa bg-despesa/15' : d.saldo === 0 ? 'text-texto-3' : 'text-texto-2'}`}>
                        {fmt(d.saldo)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-surface-2 font-bold [&>td]:border-t-2 [&>td]:border-t-borda-forte">
                <td className="sticky left-0 z-10 bg-surface-2 border-r border-r-borda px-3 py-2.5 text-texto-1 whitespace-nowrap"><NomeExtrato nome="TOTAL GERAL" onAbrir={() => setExtratoAlvo({ funcao: null })} /></td>
                <td className="px-3 py-2.5" />
                <td className={`px-3 py-2.5 text-right ${totalGeral.investido < 0 ? 'text-despesa' : totalGeral.investido === 0 ? 'text-texto-3' : 'text-texto-2'}`}>
                  {totalOuTraco(totalGeral.investido)}
                </td>
                {totalGeral.monthly.map((t, mi) => {
                  const wm = windowMonths[mi]
                  return (
                    <Fragment key={mi}>
                      <td className={`px-2 py-2.5 text-right ${wm.isYearStart ? 'border-l-2 border-l-primary' : 'border-l border-l-borda'} ${t.dep > 0 ? 'text-receita' : 'text-texto-3'}`}>
                        {totalOuTraco(t.dep)}
                      </td>
                      <td className={`px-2 py-2.5 text-right ${t.res > 0 ? 'text-despesa' : 'text-texto-3'}`}>
                        {totalOuTraco(t.res)}
                        {t.prov > 0 && (
                          <span className="block text-[10px] italic text-texto-2" title="Resgate futuro (provisão) — estimativa">
                            ~{fmt(t.prov)}
                          </span>
                        )}
                      </td>
                      <td data-testid={`fluxo-saldo-total-${mi}`} className={`px-2 py-2.5 text-right ${t.saldo < 0 ? 'text-despesa bg-despesa/15' : t.saldo === 0 ? 'text-texto-3' : 'text-texto-2'}`}>
                        {totalOuTraco(t.saldo)}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {detalhe && <FluxoCelulaModal detalhe={detalhe} onClose={() => setDetalhe(null)} />}
      {extratoAlvo && (
        <ExtratoReservaModal
          funcao={extratoAlvo.funcao}
          funcoes={linked}
          saldoInicialDe={saldoInicialDe}
          previstosDoPeriodo={previstosDoPeriodo}
          realizadosDe={realizadosDe}
          periodoInicial={periodo}
          atual={atual}
          hoje={hoje}
          onClose={() => setExtratoAlvo(null)}
        />
      )}
    </div>
  )
}

// ── Tab 3: Histórico (snapshots das viradas) ────────────────────────────────
// Ajuste e Rendimentos em colunas separadas. Fechamentos antigos (rendimentos NULL) somavam os
// rendimentos no Ajuste: a coluna Rendimentos mostra "—" e uma nota explica (lerSnapshot).
// Filtro de perfil (lib/fluxoReservaTotais): só os fechamentos das funções visíveis; função excluída
// só em "Tudo". Os valores gravados não mudam — o filtro só escolhe as linhas; o Total soma as da tela.
function HistoricoTab({ snapshots, funcoes, semVinculo, contas, perfilAtivoId, selFim, onSelFim }) {
  const ajCor = (v) => v > 0 ? 'text-receita' : v < 0 ? 'text-despesa' : 'text-texto-3'
  const iniLabel = (d) => d && d !== '0001-01-01' ? fmtDate(d) : '(início)'
  const sinal = (v) => v !== 0 ? (v > 0 ? '+' : '') + fmt(v) : <span className="text-texto-3">0,00</span>

  const visiveis = useMemo(
    () => linhasDasFuncoesNoPerfil(snapshots, funcoes, perfilAtivoId),
    [snapshots, funcoes, perfilAtivoId],
  )
  const contaDaFuncao = useMemo(() => {
    const contaPorId = new Map((contas || []).map(a => [a.id, a]))
    return new Map((funcoes || []).map(f => [f.id, contaPorId.get(f.accountId)]))
  }, [funcoes, contas])

  // Um grupo por fechamento (lib/viradaReserva agruparFechamentos): rótulo pelo início real do mês.
  const groups = useMemo(() => agruparFechamentos(visiveis), [visiveis])

  const sel = groups.find(g => g.dataFim === selFim) || groups[0] || null
  useSubtelaGuia('reservas:historico')

  if (!snapshots || snapshots.length === 0 || visiveis.length === 0) {
    const nenhuma = !snapshots || snapshots.length === 0
    return (
      <div className="card text-center py-12">
        <RotateCcw size={32} className="text-texto-3 mx-auto mb-3" />
        <p className="text-texto-3 text-sm">{nenhuma ? 'Nenhuma virada registrada ainda.' : 'Nenhum fechamento das funções deste perfil.'}</p>
        <p className="text-xs text-texto-3 mt-1">
          {nenhuma ? 'Ao usar "Virar Saldo" no Resumo, o período fechado fica guardado aqui.' : 'Escolha "Tudo" no topo para ver os fechamentos de todas as funções.'}
        </p>
      </div>
    )
  }

  const soma = (k) => Math.round((sel?.snaps || []).reduce((s, x) => s + (Number(x[k]) || 0), 0) * 100) / 100
  const t = sel ? {
    saldoInicial: soma('saldo_inicial'), entradas: soma('entradas'), saidas: soma('saidas'), ajuste: soma('ajuste'),
    rendimentos: soma('rendimentos'), saldo: soma('saldo'), atualizado: soma('saldo_atualizado'),
  } : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-texto-3 uppercase tracking-wide shrink-0">Período fechado:<HelpCampo campo="reservaHistorico.periodo" /></label>
        <select
          data-guia="reservas:historico.periodo"
          data-help-id="reservaHistorico.periodo"
          aria-label="Período fechado"
          className="input py-1.5 text-xs max-w-[280px]"
          value={sel?.dataFim || ''}
          onChange={e => onSelFim(e.target.value)}
        >
          {groups.map(g => (
            <option key={g.dataFim} value={g.dataFim}>{iniLabel(g.dataInicio)} → {fmtDate(g.dataFim)}</option>
          ))}
        </select>
      </div>
      {sel?.antigo && (
        <p className="text-xs text-texto-3">Fechamento feito antes da virada assistida: os rendimentos deste período estão somados na coluna Ajuste, e o Saldo Atualizado é o valor que passou para o período seguinte.</p>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 760 }} data-guia="reservas:historico.tabela">
            <thead>
              <tr className="border-b border-borda">
                <th className="text-left px-4 py-2 text-xs text-texto-2 font-medium">Função</th>
                <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Saldo Inicial</th>
                <th className="text-right px-4 py-2 text-xs text-receita font-medium w-28">Entradas (+)</th>
                <th className="text-right px-4 py-2 text-xs text-despesa font-medium w-28">Saídas (−)</th>
                <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-24">Ajuste</th>
                <th className="text-right px-4 py-2 text-xs text-receita font-medium w-28">Rendimentos</th>
                <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-28">Saldo Final</th>
                {sel?.antigo && <th className="text-right px-4 py-2 text-xs text-receita font-medium w-32">Saldo Atualizado</th>}
              </tr>
            </thead>
            <tbody>
              {(sel?.snaps || []).map(s => (
                <tr key={s.id} className="border-b border-borda/50">
                  <td className="px-4 py-2 text-xs text-texto-1">
                    {s.function_name}
                    {semVinculo?.has(s.function_id) && <ProfileBadge account={contaDaFuncao.get(s.function_id)} className="ml-1.5 align-middle" />}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-texto-2">{fmt(s.saldo_inicial)}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-receita">{s.entradas !== 0 ? fmt(s.entradas) : <span className="text-texto-3">0,00</span>}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-despesa">{s.saidas !== 0 ? fmt(s.saidas) : <span className="text-texto-3">0,00</span>}</td>
                  <td className={`px-4 py-2 text-right text-xs font-semibold ${ajCor(s.ajuste)}`}>{sinal(s.ajuste)}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-receita">
                    {s.rendimentos === null ? <span className="text-texto-3" title="Fechamento antigo: rendimentos somados no Ajuste">—</span> : sinal(s.rendimentos)}
                  </td>
                  <td className={`px-4 py-2 text-right text-xs font-bold ${s.saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(s.saldo)}</td>
                  {sel?.antigo && <td className={`px-4 py-2 text-right text-xs font-bold ${Number(s.saldo_atualizado) < 0 ? 'text-despesa' : 'text-receita'}`}>{fmt(Number(s.saldo_atualizado) || 0)}</td>}
                </tr>
              ))}
              {t && (
                <tr className="border-t border-borda-forte bg-surface-2/20">
                  <td className="px-4 py-2 text-xs font-semibold text-texto-3">Total</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-texto-2">{fmt(t.saldoInicial)}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-receita">{fmt(t.entradas)}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-despesa">{fmt(t.saidas)}</td>
                  <td className={`px-4 py-2 text-right text-xs font-semibold ${ajCor(t.ajuste)}`}>{sinal(t.ajuste)}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-receita">{sel.antigo ? <span className="text-texto-3">—</span> : sinal(t.rendimentos)}</td>
                  <td className={`px-4 py-2 text-right text-xs font-semibold ${t.saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(t.saldo)}</td>
                  {sel.antigo && <td className={`px-4 py-2 text-right text-xs font-bold ${t.atualizado < 0 ? 'text-despesa' : 'text-receita'}`}>{fmt(t.atualizado)}</td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Aviso de recálculo de virada (lançamento retroativo em mês fechado) ─────────────────────────
// Recálculos feitos antes da regra do estorno (api/_guardaVirada.js) ainda aparecem aqui: o servidor
// registra antes/depois em reserve_virada_recalculos. Aqui o usuário vê o que mudou e dá ciência.
const CAMPO_RECALCULO = {
  saldo_inicial: 'Saldo Inicial', entradas: 'Entradas', saidas: 'Saídas', ajuste: 'Ajuste',
  rendimentos: 'Rendimentos', saldo: 'Saldo Final', saldo_atualizado: 'Saldo Final',
}
function AvisoRecalculo({ itens, functions, onCiente, onRefazer }) {
  const [aberto, setAberto] = useState(false)
  const [refazendo, setRefazendo] = useState(false)
  const [erro, setErro] = useState('')
  const nome = (id) => functions.find(f => f.id === id)?.name || '(função removida)'
  // Recálculo que falhou (pendência): o lançamento foi gravado, as viradas fechadas não.
  const pendente = itens.some(r => r.campo === 'recalculo_pendente')
  // Uma linha por (virada, função, campo, tabela): snapshot = mês fechado; período = saldo inicial seguinte.
  const linhas = itens.filter(r => r.campo !== 'recalculo_pendente' && !(r.tabela === 'reserve_period_snapshots' && r.campo === 'saldo_atualizado'))
  const refazer = async () => {
    setRefazendo(true)
    setErro('')
    try { await onRefazer() } catch (err) { setErro(err?.dados?.error || err?.message || 'Não foi possível refazer o recálculo.') } finally { setRefazendo(false) }
  }
  return (
    <div className="card border border-aviso/40 bg-aviso/5 py-2.5 px-3 text-xs space-y-1.5" role="status" data-testid="aviso-recalculo">
      {pendente && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="recalculo-pendente">
          <AlertTriangle size={13} className="text-perigo shrink-0" />
          <span className="text-texto-1">Uma alteração mexeu num mês já fechado e o recálculo das viradas não pôde ser concluído. O que foi gravado está salvo; as viradas fechadas ainda precisam ser recalculadas.</span>
          <button type="button" className="btn-primary text-xs py-1 ml-auto" disabled={refazendo} onClick={refazer}>{refazendo ? 'Recalculando…' : 'Refazer recálculo'}</button>
          {erro && <span className="text-perigo w-full">{erro}</span>}
        </div>
      )}
      {linhas.length > 0 && (
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle size={13} className="text-aviso shrink-0" />
        <span className="text-texto-1">Lançamentos com data em mês já fechado mudaram {linhas.length} valor(es) de viradas anteriores. As viradas foram recalculadas, sem criar registros novos.</span>
        <button type="button" className="underline text-texto-2" onClick={() => setAberto(a => !a)}>{aberto ? 'ocultar' : 'ver o que mudou'}</button>
        <button type="button" className="btn-secondary text-xs py-1 ml-auto" onClick={onCiente}>Entendi</button>
      </div>
      )}
      {aberto && linhas.length > 0 && (
        <ul className="space-y-0.5 pl-5">
          {linhas.map(r => (
            <li key={r.id} className="text-texto-2">
              {r.tabela === 'reserve_periods' ? `Saldo inicial após ${fmtDate(r.data_corte)}` : `Fechamento até ${fmtDate(r.data_corte)} · ${CAMPO_RECALCULO[r.campo] || r.campo}`} — {nome(r.function_id)}: {fmt(Number(r.antes) || 0)} → {fmt(Number(r.depois) || 0)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Main Panel ──────────────────────────────────────────────────────────────
export default function ReservasPanel() {
  const {
    profileAccounts: accounts, profileTransactions: transactions, categories, profileSchedules: schedules,
    scheduleReservaFuncoes, getFinancialPeriod, getOccurrencesProjecao: getNextOccurrences, reorderReserveFunctions,
    // Histórico no banco (fonte da verdade): períodos de saldo inicial + ajustes + snapshots.
    reservePeriods, reserveAdjustments, reserveSnapshots, addReservePeriod,
    addReserveAdjustment, updateReserveAdjustment, deleteReserveAdjustment,
    recarregarHistoricoReservas, reserveHistoryLoaded, dbStatus, syncing, filaPendentes, pode,
    accounts: todasContas = [], profiles, activeProfileId,
    transactions: todosLancamentos = [], schedules: todosAgendamentos = [],
  } = useApp()
  const { functions, accountBalances, addFunction, updateFunction, deleteFunction, setAccountBalance } = useReservas()
  const [tab, setTab] = useState('contas')
  const [showForm, setShowForm] = useState(false)
  const [editFn, setEditFn] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Período selecionado na aba Histórico. Vive aqui porque o link "Ver período" do Razão
  // Diário troca de aba E de período na mesma ação.
  const [histFim, setHistFim] = useState(null)

  const _now = new Date()
  const todayStr = localDateStr(_now)
  // Mês de referência do ajuste LEGADO (ajuste_override JSONB): só para a observação exibida.
  const currentMonthKey = todayStr.slice(0, 7)
  // Período financeiro do cabeçalho: a aba Contas Reserva usa o intervalo; o Fluxo Futuro, o mês
  // dele (período aberto = mínimo do "De" do seletor de período).
  const period = getFinancialPeriod()
  const periodStart = isoLocal(period.start)
  const periodEnd = isoLocal(period.end)

  // ── Virada de saldo assistida (src/lib/viradaReserva.js, api/reserve-virada.js) ───────────────
  // Ao ENTRAR em Reservas (uma vez por entrada), com os dados carregados e conectado, pergunta se
  // há mês financeiro encerrado sem virada. Só para quem pode editar Reservas e com a opção ligada
  // (Configurações). "Agora não" não grava nada: a pergunta volta na próxima entrada.
  const podeVirar = pode('reservas', 'editar')
  const [viradaStatus, setViradaStatus] = useState(null)
  const [viradaModal, setViradaModal] = useState(null)   // null | { manual }
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [undoErro, setUndoErro] = useState('')
  const perguntouRef = useRef(false)

  const carregarStatusVirada = useCallback(async () => {
    try {
      const st = await fetchViradaReservaStatus(todayStr)
      setViradaStatus(st)
      return st
    } catch { return null }
  }, [todayStr])

  const prontoParaPerguntar = dbStatus === 'connected' && reserveHistoryLoaded
  useEffect(() => {
    if (!prontoParaPerguntar || perguntouRef.current) return
    perguntouRef.current = true
    carregarStatusVirada().then(st => {
      if (podeVirar && st?.disponivel && st.perguntar && !st.restrito && st.pendentes?.length) setViradaModal({ manual: false })
    })
  }, [prontoParaPerguntar, podeVirar, carregarStatusVirada])

  // Bloqueios que só a tela conhece (o servidor confere os de data, trava e permissão).
  const bloqueiosTela = useMemo(() => {
    const b = []
    if (!reserveHistoryLoaded) b.push({ codigo: 'dados_nao_carregados', texto: 'Os dados das reservas ainda estão carregando. Aguarde e tente de novo.' })
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (dbStatus !== 'connected' || offline) b.push({ codigo: 'sem_conexao', texto: 'Sem conexão com o servidor. A virada só pode ser feita conectado.' })
    if (syncing || (filaPendentes?.length || 0) > 0) b.push({ codigo: 'sincronizacao_pendente', texto: 'Há alterações ainda não enviadas ao servidor. Aguarde a sincronização terminar para a virada considerar tudo.' })
    return b
  }, [reserveHistoryLoaded, dbStatus, syncing, filaPendentes])

  const aposVirada = useCallback(async () => {
    try { await recarregarHistoricoReservas() } catch { /* segue: o status abaixo ainda atualiza */ }
    await carregarStatusVirada()
  }, [recarregarHistoricoReservas, carregarStatusVirada])

  const abrirViradaManual = async () => {
    await carregarStatusVirada()
    setViradaModal({ manual: true })
  }

  // Desfazer a virada assistida mais recente (no servidor: tira snapshots e períodos dela).
  const desfazerVirada = async () => {
    setUndoErro('')
    try {
      await viradaReservaAcao({ acao: 'desfazer', hoje: todayStr })
      setConfirmUndo(false)
      await aposVirada()
    } catch (err) {
      setUndoErro(err?.dados?.error || err?.message || 'Não foi possível desfazer.')
    }
  }

  const refazerRecalculo = async () => {
    await viradaReservaAcao({ acao: 'recalcular' })
    await aposVirada()
  }

  // "Entendi" dá ciência das mudanças; a pendência de recálculo só sai com "Refazer recálculo".
  const marcarRecalculosVistos = async () => {
    const ids = (viradaStatus?.recalculos || []).filter(r => r.campo !== 'recalculo_pendente').map(r => r.id)
    try { await viradaReservaAcao({ acao: 'ciente', ids }) } catch { /* tenta de novo na próxima entrada */ }
    await aposVirada()
  }

  // Saldo = Saldo Inicial + Entradas − Saídas + Ajuste + Rendimentos, até HOJE — fórmula única
  // (src/lib/saldoReserva.js), a mesma da virada, do Razão e do rateio de rendimentos.
  const computeSaldo = (f) => f.saldo ?? 0

  // Período ativo de cada função = registro de data_inicio MAIS RECENTE (título do Saldo Inicial).
  const activePeriodByFn = useMemo(() => activePeriodByFunction(reservePeriods), [reservePeriods])

  // Ajustes agrupados por função (todos; o filtro por período é aplicado no cálculo).
  const adjustmentsByFn = useMemo(() => {
    const m = {}
    for (const a of (reserveAdjustments || [])) {
      ;(m[a.function_id] = m[a.function_id] || []).push(a)
    }
    return m
  }, [reserveAdjustments])

  const reservaIdx = useMemo(
    () => indexarReserva({ periods: reservePeriods, adjustments: reserveAdjustments, transactions }),
    [reservePeriods, reserveAdjustments, transactions],
  )
  // Função "Sem vínculo" (conta sem perfil): o saldo é o dinheiro da conta dela, igual em qualquer
  // filtro — calculado com TODOS os lançamentos e agendamentos, não só os do perfil do topo. O filtro
  // só decide quais funções aparecem. Funções com perfil seguem com os dados do perfil. Em "Tudo" as
  // duas fontes são a mesma.
  const semVinculoIds = useMemo(
    () => funcoesReservaNoPerfil(functions, todasContas, profiles, null).semVinculo,
    [functions, todasContas, profiles],
  )
  const reservaIdxTodos = useMemo(
    () => (activeProfileId ? indexarReserva({ periods: reservePeriods, adjustments: reserveAdjustments, transactions: todosLancamentos }) : reservaIdx),
    [activeProfileId, reservePeriods, reserveAdjustments, todosLancamentos, reservaIdx],
  )
  const agendamentosSemVinculo = activeProfileId ? todosAgendamentos : schedules

  // Funções EFETIVAS no dia de hoje: tudo do início do período vigente até hoje (nada futuro).
  // Durante o mês as colunas acumulam; depois da virada recomeçam no período novo.
  const effectiveFunctions = useMemo(() => functions.map(f => {
    const s = saldoDaFuncao(f, todayStr, semVinculoIds.has(f.id) ? reservaIdxTodos : reservaIdx)
    const adjs = (adjustmentsByFn[f.id] || []).filter(a => !ehAjusteDeRendimento(a))
    const semRegistros = (adjustmentsByFn[f.id] || []).length === 0
    return {
      ...f,
      saldoInicial: s.saldoInicial,
      entradas: s.entradas,
      saidas: s.saidas,
      ajuste: s.ajuste,
      ajusteObs: semRegistros ? (f.ajusteOverride?.[currentMonthKey]?.observacao || '') : '',
      rendimentos: s.rendimentos,
      saldo: s.saldo,
      periodoInicio: s.inicio,
      hasPeriod: !!activePeriodByFn[f.id],
      hasAdjustments: adjs.length > 0,
    }
  }), [functions, reservaIdx, reservaIdxTodos, semVinculoIds, todayStr, currentMonthKey, activePeriodByFn, adjustmentsByFn])

  // Intervalo do modal "Origem" (Entradas/Saídas): início do período vigente até hoje.
  const autoBoundsOf = useMemo(() => {
    const ini = Object.fromEntries(effectiveFunctions.map(f => [f.id, f.periodoInicio]))
    return (fnId) => ({ start: ini[fnId] || '0001-01-01', end: todayStr })
  }, [effectiveFunctions, todayStr])

  // Saldo Atualizado = Saldo (29/10): a diferença para a conta é o "Saldo a distribuir".
  // Saldo Futuro, Fluxo Futuro e Investimentos usam este valor.
  const saldosAtualizados = useMemo(
    () => Object.fromEntries(effectiveFunctions.map(f => [f.id, computeSaldo(f)])),
    [effectiveFunctions],
  )

  // Movimentos FUTUROS por função — mesma lógica/janela do Fluxo Futuro. { [fid]: { liquido,
  // deps, ress, totalDeps, totalRess } }. Alimenta as colunas Mov. Futuros / Saldo Futuro e o modal.
  // Contas de todos os perfis (como o Fluxo): a conta "Sem vínculo" não está nas do perfil do topo.
  // "Sem vínculo" com todos os agendamentos (ver semVinculoIds).
  const movFuturosByFn = useMemo(() => {
    const vinc = effectiveFunctions.filter(f => f.accountId)
    return {
      ...futureMovimentosByFunction(vinc.filter(f => !semVinculoIds.has(f.id)), todasContas, schedules, scheduleReservaFuncoes, getNextOccurrences),
      ...futureMovimentosByFunction(vinc.filter(f => semVinculoIds.has(f.id)), todasContas, agendamentosSemVinculo, scheduleReservaFuncoes, getNextOccurrences),
    }
  }, [effectiveFunctions, semVinculoIds, todasContas, schedules, agendamentosSemVinculo, scheduleReservaFuncoes, getNextOccurrences])

  // Extrato da função (Fluxo Futuro): movimentos realizados com os mesmos filtros do saldo — a
  // função "Sem vínculo" com todos os lançamentos, como no saldo dela.
  const realizadosDe = useCallback(
    (f, desde) => realizadosDaFuncao(f, desde, todayStr, semVinculoIds.has(f.id) ? reservaIdxTodos : reservaIdx),
    [todayStr, semVinculoIds, reservaIdxTodos, reservaIdx],
  )

  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit')
  // Resumo e Fluxo Futuro: funções do perfil do topo (lib/fluxoReservaTotais). Contas de TODOS os
  // perfis, porque a conta "Sem vínculo" não está nas contas do perfil e a função dela aparece em
  // todos — em "Tudo" é a mesma lista de contas de antes.
  const contasDoFiltro = useMemo(() => todasContas.filter(a => a.type !== 'credit'), [todasContas])
  const filtroPerfil = useMemo(
    () => funcoesReservaNoPerfil(effectiveFunctions, todasContas, profiles, activeProfileId),
    [effectiveFunctions, todasContas, profiles, activeProfileId],
  )
  const reservaAccounts = useMemo(() => accounts.filter(a => a.isReserva), [accounts])
  // "Último fechamento": último dia do período fechado mais recente (data_fim do snapshot).
  const lastFechamento = useMemo(() => ultimoCorteDe(reserveSnapshots), [reserveSnapshots])

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-borda overflow-x-auto scrollbar-none" data-guia="reservas.abas">
        {[
          { id: 'contas', label: 'Contas Reserva' },
          { id: 'resumo', label: 'Resumo' },
          { id: 'fluxo', label: 'Fluxo Futuro' },
          { id: 'razao', label: 'Razão Diário' },
          { id: 'historico', label: 'Histórico' },
        ].map(t => (
          <button
            key={t.id}
            data-guia={t.id === 'resumo' ? 'reservas.aba-resumo' : undefined}
            onClick={() => setTab(t.id)}
            className={`px-3 sm:px-4 pb-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'border-primary text-primary-fg'
                : 'border-transparent text-texto-3 hover:text-texto-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'contas' && (
        <ContasReservaTab
          reservaAccounts={reservaAccounts}
          transactions={transactions}
          categories={categories}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      )}

      {tab === 'resumo' && viradaStatus?.recalculos?.length > 0 && (
        <AvisoRecalculo itens={viradaStatus.recalculos} functions={functions} onCiente={marcarRecalculosVistos} onRefazer={refazerRecalculo} />
      )}

      {tab === 'resumo' && <AvisosCaixaReserva />}

      {tab === 'resumo' && (
        <ResumoTab
          functions={filtroPerfil.funcoes}
          semVinculo={filtroPerfil.semVinculo}
          accounts={contasDoFiltro}
          categories={categories}
          accountBalances={accountBalances}
          adjustmentsByFn={adjustmentsByFn}
          activePeriodByFn={activePeriodByFn}
          saldosAtualizados={saldosAtualizados}
          movFuturosByFn={movFuturosByFn}
          computeSaldo={computeSaldo}
          todayStr={todayStr}
          autoBoundsOf={autoBoundsOf}
          lastFechamento={lastFechamento}
          canUndo={!!viradaStatus?.podeDesfazer}
          onAdd={() => { setEditFn(null); setShowForm(true) }}
          onEdit={f => { setEditFn(f); setShowForm(true) }}
          onDelete={f => setConfirmDelete(f)}
          onUpdateFunction={updateFunction}
          onSetAccountBalance={setAccountBalance}
          onAddPeriod={addReservePeriod}
          onAddAdjustment={addReserveAdjustment}
          onUpdateAdjustment={updateReserveAdjustment}
          onDeleteAdjustment={deleteReserveAdjustment}
          onVirar={abrirViradaManual}
          onUndo={() => { setUndoErro(''); setConfirmUndo(true) }}
          onReorder={reorderReserveFunctions}
        />
      )}

      {tab === 'fluxo' && (
        <FluxoTab
          functions={filtroPerfil.funcoes}
          semVinculo={filtroPerfil.semVinculo}
          accounts={contasDoFiltro}
          categories={categories}
          saldosAtualizados={saldosAtualizados}
          schedules={schedules}
          schedulesSemVinculo={agendamentosSemVinculo}
          scheduleReservaFuncoes={scheduleReservaFuncoes}
          getNextOccurrences={getNextOccurrences}
          periodoAberto={mesDaData(period.start)}
          realizadosDe={realizadosDe}
          hoje={todayStr}
        />
      )}

      {tab === 'razao' && (
        <RazaoDiarioTab
          functions={filtroPerfil.funcoes}
          semVinculo={filtroPerfil.semVinculo}
          contas={todasContas}
          perfilAtivoId={activeProfileId}
          snapshots={reserveSnapshots}
          onVerPeriodo={dataFim => { setHistFim(dataFim); setTab('historico') }}
        />
      )}

      {tab === 'historico' && (
        <HistoricoTab
          snapshots={reserveSnapshots}
          funcoes={filtroPerfil.funcoes}
          semVinculo={filtroPerfil.semVinculo}
          contas={todasContas}
          perfilAtivoId={activeProfileId}
          selFim={histFim}
          onSelFim={setHistFim}
        />
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditFn(null) }}
        title={editFn ? 'Editar Função de Reserva' : 'Nova Função de Reserva'}
      >
        <FunctionForm
          initial={editFn}
          accounts={nonCreditAccounts}
          categories={categories}
          transactions={transactions}
          schedules={schedules}
          onSubmit={data => {
            if (editFn) updateFunction(editFn.id, data)
            else addFunction(data)
            setShowForm(false)
            setEditFn(null)
          }}
          onClose={() => { setShowForm(false); setEditFn(null) }}
        />
      </Modal>

      {viradaModal && (
        <ViradaAssistidaModal
          status={viradaStatus}
          bloqueiosTela={bloqueiosTela}
          hoje={todayStr}
          manual={viradaModal.manual}
          onVirou={aposVirada}
          onAgoraNao={() => setViradaModal(null)}
          onFechar={() => setViradaModal(null)}
        />
      )}

      <ConfirmDialog
        open={confirmUndo}
        onClose={() => setConfirmUndo(false)}
        onConfirm={desfazerVirada}
        title="Desfazer Virada"
        message={`${viradaStatus?.ultimaVirada ? `Desfazer a virada de ${rotuloMes({ inicio: viradaStatus.ultimaVirada.data_inicio, fim: viradaStatus.ultimaVirada.data_corte })}? ` : ''}O período volta a ficar aberto: o fechamento sai do Histórico e os saldos iniciais criados por ela são removidos. O Saldo das funções não muda.${undoErro ? ` — ${undoErro}` : ''}`}
        danger
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteFunction(confirmDelete.id); setConfirmDelete(null) }}
        title="Excluir Função de Reserva"
        message={`Excluir a função "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        danger
      />
    </div>
  )
}
