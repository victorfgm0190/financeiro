import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import {
  Plus, Edit2, Trash2, RotateCcw, CheckCircle, AlertTriangle, Layers,
  ArrowDownCircle, ArrowUpCircle, PiggyBank, ChevronLeft, ChevronRight, FileSpreadsheet, GripVertical, MessageSquare,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, accountsForView } from '../shared/utils'
import { fetchReserveFunctionTransactions } from '../../lib/db'
import { useIsMobile } from '../../hooks/useIsMobile'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Salva uma matriz (array de arrays) como .xlsx
function exportSheet(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reservas')
  XLSX.writeFile(wb, filename)
}

function mmYYYY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`
}

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
  const color = value !== 0 ? (tipo === 'entradas' ? 'text-blue-600' : 'text-orange-600') : 'text-gray-500'
  return (
    <button
      onClick={onClick}
      title="Ver lançamentos que compõem este valor"
      className={`text-right text-xs font-semibold hover:underline cursor-pointer ${color}`}
    >
      {value !== 0 ? fmt(value) : <span className="text-gray-700">0,00</span>}
    </button>
  )
}

// ── Function Form (modal) ───────────────────────────────────────────────────
// Toggle inline discreto "Despesa" por função: define se as movimentações da função
// contam como despesa nos relatórios/dashboard. Clique alterna e salva via onToggle.
function DespesaToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={on
        ? 'Conta como despesa no Dashboard/Relatórios — clique para ignorar'
        : 'Ignorada nos totais de despesa — clique para contar como despesa'}
      className={`shrink-0 text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded transition-colors ${
        on
          ? 'bg-orange-500/20 text-orange-500 hover:bg-orange-500/30'
          : 'bg-gray-700/50 text-gray-500 hover:bg-gray-600/60'
      }`}
    >
      Despesa
    </button>
  )
}

function FunctionForm({ initial, accounts, categories = [], transactions = [], schedules = [], onSubmit, onClose }) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    name: initial?.name || '',
    accountId: initial?.accountId || '',
    saldoInicial: initial?.saldoInicial ?? 0,
    despesaAnual: initial?.despesaAnual ?? 0,
    depositoMensal: initial?.depositoMensal ?? 0,
    mesVencimento: initial?.mesVencimento ?? '',
    categoryId: initial?.categoryId || '',
    exibirComoDespesa: initial?.exibirComoDespesa ?? false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Categorias de despesa (inclui 'both'), ordenadas por nome — mesma base do TransactionForm.
  const categoryOpts = [...categories]
    .filter(c => c.type === 'expense' || c.type === 'both')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))

  // Sugestões dos lançamentos reais + agendamentos pendentes vinculados (reservaFuncaoId).
  // Só para funções EXISTENTES com conta vinculada (transfers precisam da conta p/ classificar).
  //   SAÍDA  = transfer saindo da conta (accountId === conta)
  //   ENTRADA = transfer entrando (toAccountId === conta) OU receita na conta (income)
  // Agendamentos: transactionType/frequency; o modelo não tem campo 'status' — todo agendamento
  // vinculado conta como pendente. enough=false (< 2 meses e sem agendamento, ou sem conta).
  const suggestions = useMemo(() => {
    const fnId = initial?.id
    const accId = initial?.accountId
    if (!fnId) return null
    const now = new Date()
    const cutoff = localDateStr(new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()))
    const today = localDateStr(now)

    // ── Lançamentos efetivados (últimos 12 meses) ──
    let entradasTx = 0, saidasTx = 0
    const saidasByMonth = {}
    const monthsSeen = new Set()
    for (const tx of (transactions || [])) {
      if (tx.reservaFuncaoId !== fnId) continue
      if (tx.date < cutoff || tx.date > today) continue
      monthsSeen.add(tx.date.slice(0, 7))
      if (tx.type === 'transfer' && tx.accountId === accId) {
        saidasTx += tx.amount
        const mo = Number(tx.date.slice(5, 7))
        saidasByMonth[mo] = (saidasByMonth[mo] || 0) + tx.amount
      } else if (tx.type === 'transfer' && tx.toAccountId === accId) {
        entradasTx += tx.amount
      } else if (tx.type === 'income' && tx.accountId === accId) {
        entradasTx += tx.amount
      }
    }

    // ── Agendamentos pendentes vinculados (transactionType/frequency) ──
    const linked = (schedules || []).filter(s => s.reservaFuncaoId === fnId && s.transactionType && s.status !== 'paid')
    const perYear = { daily: 365, weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }
    const isEntradaS = (s) => (s.transactionType === 'transfer' && s.toAccountId === accId) || (s.transactionType === 'income' && s.accountId === accId)
    const isSaidaS = (s) => s.transactionType === 'transfer' && s.accountId === accId
    const monthOf = (d) => {
      if (!d) return null
      if (d instanceof Date) return d.getMonth() + 1
      return Number(String(d).slice(5, 7)) || null
    }

    let entradaMensalRecorrente = 0  // Σ equivalente mensal das entradas recorrentes
    let entradaSchedOnce = 0         // Σ entradas 'once'
    let despesaAnualSched = 0        // Σ saídas recorrentes projetadas p/ 12 meses
    let mesAnualSched = null         // mês da próxima saída anual agendada

    for (const s of linked) {
      const freq = s.frequency
      const recorrente = freq && freq !== 'once'
      if (isEntradaS(s)) {
        // Recorrente → valor mensal equivalente (amount × ocorrências/ano ÷ 12); monthly = amount.
        if (recorrente) entradaMensalRecorrente += (s.amount * (perYear[freq] || 12)) / 12
        else entradaSchedOnce += s.amount
      } else if (isSaidaS(s)) {
        // Recorrente → projeção anual (monthly ×12, annual ×1, outros × estimativa de ocorrências/ano).
        if (recorrente) despesaAnualSched += s.amount * (perYear[freq] || 1)
        if (freq === 'annual') mesAnualSched = monthOf(s.nextOccurrence || s.startDate) || mesAnualSched
      } else if (s.isProvisao && s.transactionType === 'expense') {
        // Provisão de despesa vinculada (não é transferência): despesa futura estimada.
        // annual/once → amount; monthly → ×12; demais frequências → × ocorrências/ano.
        if (freq === 'monthly') despesaAnualSched += s.amount * 12
        else if (freq === 'annual' || freq === 'once' || !freq) despesaAnualSched += s.amount
        else despesaAnualSched += s.amount * (perYear[freq] || 1)
      }
    }

    // a) Depósito Mensal = maior entre: (recorrentes já mensais) e ((lançamentos + 'once')/12).
    const depAbordagemA = Math.round(entradaMensalRecorrente * 100) / 100
    const depAbordagemB = Math.round(((entradasTx + entradaSchedOnce) / 12) * 100) / 100
    const depositoMensal = Math.max(depAbordagemA, depAbordagemB)

    // b) Despesa Anual = saídas de lançamentos (12m) + saídas recorrentes agendadas projetadas.
    const despesaAnual = Math.round((saidasTx + despesaAnualSched) * 100) / 100

    // c) Mês de Vencimento: maior volume de saídas nos lançamentos; havendo saída ANUAL agendada,
    //    prevalece o mês da próxima ocorrência. Empate/sem dado → null.
    let mesVencimento = null
    const porMes = Object.entries(saidasByMonth).sort((a, b) => b[1] - a[1])
    if (porMes.length === 1 || (porMes.length > 1 && porMes[0][1] > porMes[1][1])) {
      mesVencimento = Number(porMes[0][0])
    }
    if (mesAnualSched) mesVencimento = mesAnualSched

    return {
      enough: !!accId && (monthsSeen.size >= 2 || linked.length > 0),
      despesaAnual,
      depositoMensal,
      mesVencimento,
    }
  }, [transactions, schedules, initial])

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({
      ...form,
      accountId: form.accountId || null,
      saldoInicial: Number(form.saldoInicial) || 0,
      despesaAnual: Number(form.despesaAnual) || 0,
      depositoMensal: Number(form.depositoMensal) || 0,
      mesVencimento: form.mesVencimento !== '' ? Number(form.mesVencimento) : null,
      categoryId: form.categoryId || null,
      exibirComoDespesa: !!form.exibirComoDespesa,
    }) }} className="space-y-4">
      <div>
        <label className="label">Nome da Função *</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Ex: IPVA, Seguro Residencial..." />
      </div>
      <div>
        <label className="label">Conta Vinculada</label>
        <select className="input" value={form.accountId} onChange={e => set('accountId', e.target.value)}>
          <option value="">— Sem conta —</option>
          {accountsForView(accounts.filter(a => a.active !== false), isMobile).map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Saldo Inicial (R$)</label>
        <input className="input" type="number" step="0.01" value={form.saldoInicial} onChange={e => set('saldoInicial', e.target.value)} placeholder="0,00 (aceita negativo)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Despesa Anual (R$)</label>
          <input className="input" type="number" step="0.01" value={form.despesaAnual} onChange={e => set('despesaAnual', e.target.value)} placeholder="0,00" />
          {suggestions && (suggestions.enough
            ? <p className="text-xs text-gray-600 mt-1">Calculado dos lançamentos: {fmt(suggestions.despesaAnual)}
                <button type="button" onClick={() => set('despesaAnual', suggestions.despesaAnual)} className="text-blue-600 hover:underline ml-1.5 font-medium">Usar valor calculado</button>
              </p>
            : <p className="text-xs text-gray-600 mt-1">Dados insuficientes para calcular</p>
          )}
        </div>
        <div>
          <label className="label">Depósito Mensal (R$)</label>
          <input className="input" type="number" step="0.01" value={form.depositoMensal} onChange={e => set('depositoMensal', e.target.value)} placeholder="0,00" />
          {suggestions && (suggestions.enough
            ? <p className="text-xs text-gray-600 mt-1">Calculado dos lançamentos: {fmt(suggestions.depositoMensal)} / mês
                <button type="button" onClick={() => set('depositoMensal', suggestions.depositoMensal)} className="text-blue-600 hover:underline ml-1.5 font-medium">Usar valor calculado</button>
              </p>
            : <p className="text-xs text-gray-600 mt-1">Dados insuficientes para calcular</p>
          )}
        </div>
      </div>
      <div>
        <label className="label">Mês de Vencimento da Despesa</label>
        <select className="input" value={form.mesVencimento} onChange={e => set('mesVencimento', e.target.value)}>
          <option value="">Rateio mensal (÷ 12)</option>
          {MONTH_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <p className="text-xs text-gray-600 mt-1">Quando não definido, a despesa anual é dividida em 12 parcelas mensais</p>
        {suggestions && suggestions.enough && suggestions.mesVencimento && (
          <p className="text-xs text-gray-600 mt-1">Maior volume em: {MONTH_LABELS[suggestions.mesVencimento - 1]}
            <button type="button" onClick={() => set('mesVencimento', suggestions.mesVencimento)} className="text-blue-600 hover:underline ml-1.5 font-medium">Usar valor calculado</button>
          </p>
        )}
      </div>
      <div>
        <label className="label">Categoria da Despesa</label>
        <select className="input" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
          <option value="">Sem categoria vinculada</option>
          {categoryOpts.map(c => <option key={c.id} value={c.id}>{`${c.icon || ''} ${c.name}`.trim()}</option>)}
        </select>
        <p className="text-xs text-gray-600 mt-1">As sombras de reserva (depósitos e resgates) herdam esta categoria no Demonstrativo</p>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-[#0F6E56]"
            checked={!!form.exibirComoDespesa}
            onChange={e => set('exibirComoDespesa', e.target.checked)}
          />
          <span className="text-sm text-gray-200">Contar como despesa</span>
        </label>
        <p className="text-xs text-gray-600 mt-1">
          Marcado: as transferências desta função (depósitos e resgates) entram nos totais de
          despesa do Dashboard e Relatórios. Desmarcado: são ignoradas (ex.: poupança/receita).
        </p>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar'}</button>
      </div>
    </form>
  )
}

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
        <PiggyBank size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Nenhuma conta marcada como reserva</p>
        <p className="text-xs text-gray-600 mt-1">Ative "É conta de reserva" no cadastro de uma conta para ela aparecer aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo do topo — valor com fonte responsiva (clamp) p/ nunca cortar no mobile.
          grid-cols-3 garante 3 cards de largura igual; min-w-0 evita que o número estoure a célula. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="card min-w-0 py-3 px-2 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mb-1">Total Reservado</p>
          <p className={`font-bold tabular-nums whitespace-nowrap text-[clamp(0.72rem,3.6vw,1.25rem)] ${totalSaldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{fmt(totalSaldo)}</p>
        </div>
        <div className="card min-w-0 py-3 px-2 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mb-1">Depósitos no Mês</p>
          <p className="font-bold tabular-nums whitespace-nowrap text-[clamp(0.72rem,3.6vw,1.25rem)] text-receita">{totalEntradas > 0 ? fmt(totalEntradas) : <span className="text-gray-700">—</span>}</p>
        </div>
        <div className="card min-w-0 py-3 px-2 sm:px-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mb-1">Resgates no Mês</p>
          <p className="font-bold tabular-nums whitespace-nowrap text-[clamp(0.72rem,3.6vw,1.25rem)] text-orange-400">{totalSaidas > 0 ? fmt(totalSaidas) : <span className="text-gray-700">—</span>}</p>
        </div>
      </div>

      {/* Lista de contas reserva */}
      <div className="space-y-3">
        {reservaData.map(({ acc, cat, entradas, saidas }) => (
          <div key={acc.id} className="card">
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm font-semibold text-gray-200 break-words min-w-0">{acc.apelido || acc.name}</span>
                  {acc.reservaType === 'especifica' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 shrink-0">
                      {cat ? `${cat.icon} ${cat.name}` : 'Específica'}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 shrink-0">
                      🏦 Geral
                    </span>
                  )}
                </div>
                <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs">
                  {entradas > 0
                    ? <span className="flex items-center gap-1 text-receita whitespace-nowrap"><ArrowDownCircle size={11} className="shrink-0" /> +{fmt(entradas)}</span>
                    : <span className="text-gray-700">Sem depósitos no mês</span>
                  }
                  {saidas > 0 && (
                    <span className="flex items-center gap-1 text-orange-400 whitespace-nowrap"><ArrowUpCircle size={11} className="shrink-0" /> −{fmt(saidas)}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end text-right shrink-0">
                <p className={`font-bold tabular-nums whitespace-nowrap text-[clamp(0.85rem,4vw,1.25rem)] ${(acc.balance || 0) >= 0 ? 'text-gray-100' : 'text-orange-400'}`}>
                  {fmt(acc.balance || 0)}
                </p>
                <button
                  onClick={() => setExtratoAcc(acc)}
                  className="text-xs text-gray-600 hover:text-indigo-400 transition-colors mt-0.5 whitespace-nowrap"
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
            <div className="flex items-center justify-between py-2 border-b border-gray-800">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Saldo atual</span>
              <span className={`text-lg font-bold ${(extratoAcc.balance || 0) >= 0 ? 'text-gray-100' : 'text-orange-400'}`}>
                {fmt(extratoAcc.balance || 0)}
              </span>
            </div>
            {extratoData.txsExtrato.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">Nenhuma movimentação registrada</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-0">
                {extratoData.txsExtrato.map(tx => {
                  const isEntrada = tx.toAccountId === extratoAcc.id
                  const d = tx.date
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-gray-800/50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {isEntrada
                          ? <ArrowDownCircle size={13} className="text-receita shrink-0" />
                          : <ArrowUpCircle size={13} className="text-orange-400 shrink-0" />
                        }
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{tx.description || (isEntrada ? 'Depósito' : 'Resgate')}</p>
                          <p className="text-xs text-gray-500">{d.slice(8)}/{d.slice(5,7)}/{d.slice(0,4)}</p>
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
        className="text-gray-500 hover:text-gray-300 transition-colors"
      >
        <MessageSquare size={11} />
      </button>
      {open && (
        <span className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-48 max-w-[60vw] rounded-lg border border-gray-700 bg-surface px-2.5 py-2 text-[11px] font-normal normal-case leading-snug text-left text-gray-200 shadow-xl whitespace-pre-wrap">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Tab 1: Resumo ───────────────────────────────────────────────────────────
function ResumoTab({ functions, accounts, categories = [], accountBalances, adjustmentsByFn = {}, activePeriodByFn = {}, saldosAtualizados, computeSaldo, todayStr, autoBoundsOf, lastFechamento, canUndo, onAdd, onEdit, onDelete, onUpdateFunction, onSetAccountBalance, onAddPeriod, onAddAdjustment, onUpdateAdjustment, onDeleteAdjustment, onVirar, onUndo, onReorder }) {
  const byOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.name.localeCompare(b.name)
  // Nome da categoria vinculada à função (quando categoryId preenchido).
  const catNameOf = (id) => categories.find(c => c.id === id)?.name
  // Função cujo modal de histórico de ajustes está aberto (Parte 6).
  const [adjFn, setAdjFn] = useState(null)
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
  const ajusteColor = (v) => v > 0 ? 'text-blue-600' : v < 0 ? 'text-orange-600' : 'text-gray-600'
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

  const grandTotal = Object.values(saldosAtualizados).reduce((s, v) => s + v, 0)

  const [dragId, setDragId] = useState(null)
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
    const rows = [['Função', 'Conta', 'Saldo Inicial', 'Entradas', 'Saídas', 'Saldo', 'Saldo Atualizado']]
    groups.forEach(g => g.fns.forEach(f => {
      rows.push([
        f.name,
        g.account ? (g.account.apelido || g.account.name) : 'Sem conta',
        f.saldoInicial, f.entradas, f.saidas, computeSaldo(f), saldosAtualizados[f.id] ?? computeSaldo(f),
      ])
    }))
    exportSheet(rows, `reservas-resumo-${mmYYYY()}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* KPI + actions — no mobile os botões ocupam uma linha própria (w-full) em vez de
          depender de ml-auto, que empurrava "Total reservado:" para fora da borda esquerda. */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Total reservado:</span>
          <span className={`text-lg font-bold ${grandTotal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(grandTotal)}</span>
        </div>
        {lastFechamento && (
          <span className="text-xs text-gray-600 hidden sm:inline">Último fechamento: {fmtDate(lastFechamento)}</span>
        )}
        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto flex-wrap justify-end">
          {functions.length > 0 && (
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
            </button>
          )}
          {canUndo && (
            <button onClick={onUndo} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <RotateCcw size={12} /> <span className="hidden sm:inline">Desfazer Virada</span><span className="sm:hidden">Desfazer</span>
            </button>
          )}
          <button onClick={onVirar} className="btn-primary flex items-center gap-1.5 text-xs py-1.5 bg-emerald-700 hover:bg-emerald-600">
            <CheckCircle size={12} /> <span className="hidden sm:inline">Virar Saldo</span><span className="sm:hidden">Virar</span>
          </button>
          <button onClick={onAdd} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus size={12} /> <span className="hidden sm:inline">Nova Função</span><span className="sm:hidden">Nova</span>
          </button>
        </div>
      </div>

      {functions.length === 0 && (
        <div className="card text-center py-12">
          <Layers size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma função de reserva cadastrada</p>
          <button className="btn-primary mt-4" onClick={onAdd}>Cadastrar Função</button>
        </div>
      )}

      {groups.map(({ accountId, account, fns }) => {
        const totalSaldo = fns.reduce((s, f) => s + computeSaldo(f), 0)
        const totalAtualizado = fns.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0)
        const saldoReal = accountId !== null
          ? (accountBalances[accountId] !== undefined ? accountBalances[accountId] : (account?.balance || 0))
          : null
        const diff = saldoReal !== null ? Math.round((saldoReal - totalSaldo) * 100) / 100 : null
        const accLabel = account ? (account.apelido || account.name) : null

        return (
          <div key={accountId || '__none__'}>
            {/* ── Mobile card layout (hidden md+) ── */}
            <div className="md:hidden space-y-2">
              {/* Group header */}
              <div className="flex items-center gap-3 px-1">
                {accLabel
                  ? <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{accLabel}</span>
                  : <span className="text-xs font-semibold text-gray-500 italic uppercase tracking-wide">Sem conta vinculada</span>
                }
                <div className="flex-1 h-px bg-gray-800" />
                <span className={`text-xs font-bold ${totalAtualizado < 0 ? 'text-despesa' : 'text-receita'}`}>
                  {fmt(totalAtualizado)}
                </span>
              </div>

              {/* Saldo Real input on mobile (for linked accounts) */}
              {accountId && (
                <div className="card py-2 px-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 shrink-0">Saldo real da conta:</span>
                  {/* input + diferença ficam juntos: em telas estreitas quebram como bloco abaixo do label */}
                  <div className="flex items-center gap-2 flex-1 min-w-[8rem]">
                    <input
                      className="input flex-1 min-w-0 text-xs py-1 text-right"
                      type="number"
                      step="0.01"
                      value={saldoReal ?? ''}
                      onChange={e => onSetAccountBalance(accountId, e.target.value)}
                    />
                    {diff !== null && diff !== 0 && (
                      <span className={`text-xs font-medium shrink-0 ${diff >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {diff > 0 ? '+' : ''}{fmt(diff)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {fns.map(f => {
                const saldo = computeSaldo(f)
                const atualizado = saldosAtualizados[f.id] ?? saldo
                return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(f.id) }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleDropOn(f) }}
                    className={`card py-3 px-3 space-y-2 ${dragId === f.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-gray-200 inline-flex items-center gap-1.5 min-w-0">
                        <GripVertical size={12} className="text-gray-700 cursor-grab shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <DespesaToggle on={!!f.exibirComoDespesa} onToggle={() => onUpdateFunction(f.id, { exibirComoDespesa: !f.exibirComoDespesa })} />
                        {/* Categoria só aparece quando difere do nome da função (evita "IPVA … IPVA" duplicado) */}
                        {catNameOf(f.categoryId) && catNameOf(f.categoryId) !== f.name && <span className="text-xs text-gray-400 truncate">{catNameOf(f.categoryId)}</span>}
                      </span>
                      {accLabel && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">{account.apelido || account.name.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className={`text-lg font-bold ${atualizado < 0 ? 'text-despesa' : 'text-receita'}`}>
                      {fmt(atualizado)}
                    </div>
                    <div className="h-px bg-gray-800" />
                    {/* Duas linhas no mobile: (1) Entradas + Saídas  (2) Ajuste à esq., botões à dir.
                        Garante que os botões editar/excluir nunca saiam da tela e que os selos
                        AUTO/MANUAL não sejam truncados. */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-500 shrink-0">Saldo inicial:</span>
                        <SaldoInicialCell f={f} todayStr={todayStr} activePeriod={activePeriodByFn[f.id]} onAddPeriod={onAddPeriod} />
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-gray-500 shrink-0">Entradas:</span>
                          <MovValue value={f.entradas} tipo="entradas" onClick={() => openOrigem(f, 'entradas')} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-gray-500 shrink-0">Saídas:</span>
                          <MovValue value={f.saidas} tipo="saidas" onClick={() => openOrigem(f, 'saidas')} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-gray-500 shrink-0">Ajuste:</span>
                          <button
                            onClick={() => setAdjFn(f)}
                            className={`inline-flex items-center gap-1 font-semibold hover:underline ${ajusteColor(f.ajuste)}`}
                            title="Ver histórico de ajustes"
                          >
                            {f.ajuste !== 0 ? (f.ajuste > 0 ? '+' : '') + fmt(f.ajuste) : <span className="text-gray-700">0,00</span>}
                          </button>
                          <button onClick={() => setAdjFn(f)} title="Adicionar ajuste" className="text-gray-500 hover:text-blue-600 shrink-0"><Plus size={12} /></button>
                          {f.ajusteObs && <ObsIndicator text={f.ajusteObs} />}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => onEdit(f)} className="p-1.5 rounded hover:bg-gray-700 text-gray-600 hover:text-gray-300 transition-colors">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => onDelete(f)} className="p-1.5 rounded hover:bg-gray-700 text-gray-600 hover:text-orange-400 transition-colors">
                            <Trash2 size={12} />
                          </button>
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
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/30 flex items-center gap-4 flex-wrap">
                {account ? (
                  <>
                    <span className="text-sm font-semibold text-gray-200">{account.apelido || account.name}</span>
                    <span className="text-xs text-gray-600">{fns.length} {fns.length === 1 ? 'função' : 'funções'}</span>
                    <span className="text-xs text-gray-500">
                      Σ saldos: <span className="text-gray-300 font-medium">{fmt(totalSaldo)}</span>
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-xs text-gray-500 shrink-0">Saldo Real:</label>
                      <input
                        className="input w-32 text-xs py-1 text-right"
                        type="number"
                        step="0.01"
                        value={saldoReal ?? ''}
                        onChange={e => onSetAccountBalance(accountId, e.target.value)}
                      />
                      {diff !== null && diff !== 0 && (
                        <span className={`text-xs font-medium shrink-0 ${diff >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-gray-500 italic">Sem conta vinculada</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 700 }}>
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Despesa Anual</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium w-28">Saldo Inicial</th>
                      <th className="text-right px-4 py-2 text-xs text-blue-600 font-medium w-28">Entradas (+)</th>
                      <th className="text-right px-4 py-2 text-xs text-orange-600 font-medium w-28">Saídas (−)</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium w-24">Ajuste</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium w-28">Saldo</th>
                      <th className="text-right px-4 py-2 text-xs text-receita font-medium w-32">Saldo Atualizado</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {fns.map(f => {
                      const saldo = computeSaldo(f)
                      const atualizado = saldosAtualizados[f.id] ?? saldo
                      return (
                        <tr
                          key={f.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(f.id) }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); handleDropOn(f) }}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${dragId === f.id ? 'opacity-40' : ''}`}
                        >
                          <td className="px-4 py-2 text-xs text-gray-200">
                            <span className="inline-flex items-center gap-1.5">
                              <GripVertical size={11} className="text-gray-700 cursor-grab shrink-0" />
                              {f.name}
                              <DespesaToggle on={!!f.exibirComoDespesa} onToggle={() => onUpdateFunction(f.id, { exibirComoDespesa: !f.exibirComoDespesa })} />
                              {catNameOf(f.categoryId) && <span className="text-xs text-gray-400">{catNameOf(f.categoryId)}</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-gray-400">
                            <SaldoInicialCell f={f} todayStr={todayStr} activePeriod={activePeriodByFn[f.id]} onAddPeriod={onAddPeriod} align="right" />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <MovValue value={f.entradas} tipo="entradas" onClick={() => openOrigem(f, 'entradas')} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <MovValue value={f.saidas} tipo="saidas" onClick={() => openOrigem(f, 'saidas')} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="inline-flex items-center justify-end gap-1">
                              <button
                                onClick={() => setAdjFn(f)}
                                title="Ver histórico de ajustes"
                                className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer ${ajusteColor(f.ajuste)}`}
                              >
                                {f.ajuste !== 0 ? (f.ajuste > 0 ? '+' : '') + fmt(f.ajuste) : <span className="text-gray-700">0,00</span>}
                              </button>
                              <button onClick={() => setAdjFn(f)} title="Adicionar ajuste" className="text-gray-500 hover:text-blue-600 shrink-0"><Plus size={11} /></button>
                              {f.ajusteObs && <ObsIndicator text={f.ajusteObs} />}
                            </span>
                          </td>
                          <td className={`px-4 py-2 text-right text-xs font-semibold ${saldo < 0 ? 'text-orange-600' : 'text-gray-200'}`}>
                            {fmt(saldo)}
                          </td>
                          <td className={`px-4 py-2 text-right text-xs font-bold ${atualizado < 0 ? 'text-despesa' : 'text-receita'}`}>
                            {fmt(atualizado)}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              <button onClick={() => onEdit(f)} className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-gray-300 transition-colors">
                                <Edit2 size={11} />
                              </button>
                              <button onClick={() => onDelete(f)} className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-orange-400 transition-colors">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Totals row */}
                    <tr className="border-t border-gray-700 bg-gray-800/20">
                      <td className="px-4 py-2 text-xs font-semibold text-gray-500">Total</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-400">
                        {fmt(fns.reduce((s, f) => s + f.saldoInicial, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-blue-600">
                        {fmt(fns.reduce((s, f) => s + f.entradas, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-orange-600">
                        {fmt(fns.reduce((s, f) => s + f.saidas, 0))}
                      </td>
                      {(() => { const ta = fns.reduce((s, f) => s + (f.ajuste || 0), 0); return (
                        <td className={`px-4 py-2 text-right text-xs font-semibold ${ajusteColor(ta)}`}>
                          {ta !== 0 ? (ta > 0 ? '+' : '') + fmt(ta) : <span className="text-gray-700">0,00</span>}
                        </td>
                      ) })()}
                      <td className={`px-4 py-2 text-right text-xs font-semibold ${totalSaldo < 0 ? 'text-orange-600' : 'text-gray-200'}`}>
                        {fmt(totalSaldo)}
                      </td>
                      <td className={`px-4 py-2 text-right text-xs font-bold ${totalAtualizado < 0 ? 'text-despesa' : 'text-receita'}`}>
                        {fmt(totalAtualizado)}
                      </td>
                      <td />
                    </tr>
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
          adjustments={adjustmentsByFn[adjFn.id] || []}
          activePeriod={activePeriodByFn[adjFn.id]}
          todayStr={todayStr}
          onAdd={onAddAdjustment}
          onUpdate={onUpdateAdjustment}
          onDelete={onDeleteAdjustment}
          onClose={() => setAdjFn(null)}
        />
      )}

      {origem && (
        <OrigemModal origem={origem} onClose={() => setOrigem(null)} />
      )}
    </div>
  )
}

// Modal "Origem": lançamentos que compõem o valor AUTO (Entradas ou Saídas) de uma função.
function OrigemModal({ origem, onClose }) {
  const { fn, tipo, loading, error, items } = origem
  // Direção vem do endpoint (classificada pelo account_id da função): só transferências
  // entrando/saindo da conta da reserva. Despesa de cartão é 'neutro' e não aparece aqui.
  const alvo = tipo === 'entradas' ? 'entrada' : 'saida'
  const filtered = (items || []).filter(t => t.direcao === alvo)
  const contaLabel = (t) => t.type === 'transfer'
    ? `${t.conta_nome || '—'} → ${t.conta_destino_nome || '—'}`
    : (t.conta_nome || '—')

  const titulo = `${tipo === 'entradas' ? 'Entradas' : 'Saídas'} — ${fn?.name || ''}`
  return (
    <Modal open onClose={onClose} title={titulo} size="lg">
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500 py-6 text-center">Carregando…</p>
        ) : error ? (
          <p className="text-sm text-orange-500 py-6 text-center">Erro ao buscar os lançamentos.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">Nenhum lançamento encontrado neste período</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-3 py-2 text-xs text-gray-400 font-medium">Data</th>
                  <th className="px-3 py-2 text-xs text-gray-400 font-medium">Descrição</th>
                  <th className="px-3 py-2 text-xs text-gray-400 font-medium">Conta</th>
                  <th className="px-3 py-2 text-xs text-gray-400 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-gray-800/40">
                    <td className="px-3 py-2 text-xs text-gray-300 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 text-xs text-gray-300 max-w-xs truncate" title={t.description}>{t.description || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 truncate">{contaLabel(t)}</td>
                    <td className={`px-3 py-2 text-xs text-right whitespace-nowrap font-medium ${tipo === 'entradas' ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(t.amount)}</td>
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

  return (
    <span ref={ref} className={`relative inline-flex items-center gap-1 group ${align === 'right' ? 'justify-end w-full' : ''}`}>
      <button
        onClick={openPopover}
        title={activePeriod ? `Período desde ${fmtDate(activePeriod.data_inicio)} — clique para definir um novo` : 'Definir saldo inicial com data de referência'}
        className="inline-flex items-center gap-1 text-xs font-semibold hover:underline cursor-pointer text-gray-300"
      >
        {fmt(f.saldoInicial ?? 0)}
        <Edit2 size={10} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
      {open && (
        <div className={`absolute z-40 top-full mt-1 w-56 rounded-lg border border-gray-700 bg-surface p-3 shadow-xl text-left space-y-2.5 normal-case ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div>
            <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">📅 Data de referência</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="input w-full text-xs py-1" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">💰 Valor</label>
            <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00 (aceita negativo)" className="input w-full text-xs py-1 text-right" />
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
  const valorColor = (v) => v > 0 ? 'text-blue-600' : v < 0 ? 'text-orange-600' : 'text-gray-500'
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
      <div className="space-y-4">
        {activePeriod && (
          <p className="text-xs text-gray-500">
            Período ativo desde <span className="text-gray-300">{fmtDate(activePeriod.data_inicio)}</span> — o total considera os ajustes a partir desta data.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-700/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-3 py-2 text-xs text-gray-400 font-medium">Data</th>
                <th className="px-3 py-2 text-xs text-gray-400 font-medium text-right">Valor</th>
                <th className="px-3 py-2 text-xs text-gray-400 font-medium">Observação</th>
                <th className="px-3 py-2 text-xs text-gray-400 font-medium text-right w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500 text-sm">Nenhum ajuste registrado</td></tr>
              )}
              {sorted.map(a => {
                const editing = editId === a.id
                const fora = !inPeriod(a)
                return (
                  <tr key={a.id} className={`border-b border-gray-800/40 ${fora ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 text-xs text-gray-300 whitespace-nowrap">
                      {fmtDate(a.data)}
                      {fora && <span className="ml-1 text-[9px] uppercase text-gray-600" title="Fora do período ativo — não entra no total">(fora)</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing
                        ? <input type="number" step="0.01" value={editValor} onChange={e => setEditValor(e.target.value)} className="input w-24 text-xs py-1 text-right" />
                        : <span className={`text-xs font-semibold ${valorColor(Number(a.valor))}`}>{fmtSigned(Number(a.valor) || 0)}</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-300">
                      {editing
                        ? <input type="text" value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="Observação" className="input w-full text-xs py-1" />
                        : <span className="truncate" title={a.observacao || ''}>{a.observacao || <span className="text-gray-600">—</span>}</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {editing ? (
                          <>
                            <button onClick={saveEdit} disabled={busy} className="text-xs text-blue-600 hover:underline px-1">Salvar</button>
                            <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline px-1">✕</button>
                          </>
                        ) : confirmDelId === a.id ? (
                          <>
                            <span className="text-[10px] text-gray-400">Excluir?</span>
                            <button onClick={() => confirmDelete(a.id)} disabled={busy} className="text-xs text-orange-500 hover:underline px-1">Sim</button>
                            <button onClick={() => setConfirmDelId(null)} className="text-xs text-gray-500 hover:underline px-1">Não</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(a)} title="Editar" className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-200"><Edit2 size={12} /></button>
                            <button onClick={() => setConfirmDelId(a.id)} title="Excluir" className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-orange-400"><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-700 bg-gray-800/20">
                <td className="px-3 py-2 text-xs font-semibold text-gray-400">TOTAL</td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${valorColor(total)}`}>{total !== 0 ? fmtSigned(total) : <span className="text-gray-600">0,00</span>}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Novo ajuste */}
        <div className="rounded-lg border border-gray-700/60 p-3 space-y-2.5">
          <p className="text-xs font-semibold text-gray-300">+ Novo Ajuste</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">📅 Data</label>
              <input type="date" value={newData} onChange={e => setNewData(e.target.value)} className="input w-full text-xs py-1" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">💰 Valor (±)</label>
              <input type="number" step="0.01" value={newValor} onChange={e => setNewValor(e.target.value)} placeholder="0,00" className="input w-full text-xs py-1 text-right" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">📝 Observação</label>
              <input type="text" value={newObs} onChange={e => setNewObs(e.target.value)} placeholder="Opcional" className="input w-full text-xs py-1" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleAdd} disabled={busy || !newValor} className="btn-primary text-xs py-1.5 px-4">Salvar</button>
          </div>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Cada ajuste entra no saldo (Saldo Inicial + Entradas − Saídas + Ajuste). Aceita valores negativos
          (ex.: -50). Positivos em azul, negativos em laranja.
        </p>
      </div>
    </Modal>
  )
}

// ── Modal "Virar Saldo" com data de início (Parte 7) ────────────────────────
function VirarSaldoModal({ defaultDate, onConfirm, onClose }) {
  const [data, setData] = useState(defaultDate)
  const [saving, setSaving] = useState(false)
  const confirm = async () => {
    if (!data) return
    setSaving(true)
    try { await onConfirm(data) } finally { setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title="Virar Saldo" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-300">Informe a data de início do novo período:</p>
        <div>
          <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">📅 Data de início</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)} className="input w-full text-sm" />
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          O Saldo Atualizado de cada função vira o Saldo Inicial de um novo período a partir desta data.
          Nada é sobrescrito — o histórico anterior é preservado.
        </p>
        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn-primary flex-1 bg-emerald-700 hover:bg-emerald-600" onClick={confirm} disabled={saving}>
            {saving ? 'Virando…' : 'Confirmar Virada'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tab 2: Fluxo Futuro ─────────────────────────────────────────────────────
function FluxoTab({ functions, accounts, categories, saldosAtualizados, schedules, scheduleReservaFuncoes, getNextOccurrences }) {
  const linked = functions.filter(f => f.accountId)
  const round2 = (n) => Math.round(n * 100) / 100

  // Janela deslizante de 12 meses a partir do mês ANTERIOR ao atual.
  const windowMonths = useMemo(() => {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      return { year: d.getFullYear(), month0: d.getMonth(), label: MONTH_LABELS[d.getMonth()], isYearStart: d.getMonth() === 0 && i > 0 }
    })
  }, [])

  const winStart = `${windowMonths[0].year}-${String(windowMonths[0].month0 + 1).padStart(2, '0')}-01`
  const lastWm = windowMonths[11]
  const winEndDate = new Date(lastWm.year, lastWm.month0 + 1, 0)
  const winEnd = `${winEndDate.getFullYear()}-${String(winEndDate.getMonth() + 1).padStart(2, '0')}-${String(winEndDate.getDate()).padStart(2, '0')}`
  const winIndexOf = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return (d.getFullYear() - windowMonths[0].year) * 12 + (d.getMonth() - windowMonths[0].month0)
  }

  // Dep/Res por função/mês a partir dos AGENDAMENTOS reais (não dos campos de planejamento).
  // Resgates com detalhamento (schedule_reserva_funcoes) projetam UMA saída por função
  // (valor da linha); os demais usam o campo único reservaFuncaoId + schedule.amount.
  const scheduledByFunction = useMemo(() => {
    const accById = new Map(accounts.map(a => [a.id, a]))
    // schedule_id → [{ reservaFuncaoId, valor }] (detalhamento por função do resgate)
    const detBySchedule = new Map()
    for (const srf of (scheduleReservaFuncoes || [])) {
      if (!detBySchedule.has(srf.scheduleId)) detBySchedule.set(srf.scheduleId, [])
      detBySchedule.get(srf.scheduleId).push(srf)
    }
    // Entram no fluxo agendamentos de transferência com detalhamento OU com função única.
    const transfers = (schedules || []).filter(s =>
      s.transactionType === 'transfer' && (s.reservaFuncaoId || detBySchedule.has(s.id))
    )
    // Provisões de despesa ainda não efetivadas, vinculadas a uma função de reserva. Projetam
    // uma SAÍDA provisória ("Resgate futuro (provisão)") — adicional ao resgate real. Quando a
    // provisão é efetivada vira o resgate real (transfer) e deixa de entrar aqui.
    const provisoes = (schedules || []).filter(s =>
      s.isProvisao && !s.provisaoEfetivada && s.transactionType === 'expense' && s.reservaFuncaoId
    )
    const result = {}
    for (const f of linked) {
      const deps = new Array(12).fill(0)
      const ress = new Array(12).fill(0)
      const provs = new Array(12).fill(0)
      for (const p of provisoes) {
        if (p.reservaFuncaoId !== f.id) continue
        const amt = Number(p.amount) || 0
        if (!amt) continue
        // Projeta APENAS a próxima ocorrência ainda não efetivada (primeira após
        // provisao_efetivada_until, ou a próxima se until null) — não a janela inteira.
        // Ocorrências já efetivadas viram resgate real (transfer) e entram em `ress`.
        const occs = getNextOccurrences(p, 24)
        const until = p.provisaoEfetivadaUntil || null
        const proxima = until ? occs.find(dd => dd > until) : occs[0]
        if (!proxima || proxima < winStart || proxima > winEnd) continue
        const idx = winIndexOf(proxima)
        if (idx < 0 || idx > 11) continue
        provs[idx] = round2(provs[idx] + amt)
      }
      for (const s of transfers) {
        const isDep = !!accById.get(s.toAccountId)?.isReserva
        const isRes = !isDep && !!accById.get(s.accountId)?.isReserva
        if (!isDep && !isRes) continue
        // Valor atribuível a ESTA função neste agendamento:
        //  - com detalhamento → soma das linhas desta função (ignora o reservaFuncaoId único)
        //  - sem detalhamento → schedule.amount quando a função única é esta
        const det = detBySchedule.get(s.id)
        let amt = 0
        if (det && det.length > 0) {
          amt = det.reduce((sum, srf) => srf.reservaFuncaoId === f.id ? round2(sum + (Number(srf.valor) || 0)) : sum, 0)
        } else if (s.reservaFuncaoId === f.id) {
          amt = s.amount || 0
        }
        if (!amt) continue
        for (const dateStr of getNextOccurrences(s, 140)) {
          if (dateStr < winStart || dateStr > winEnd) continue
          const idx = winIndexOf(dateStr)
          if (idx < 0 || idx > 11) continue
          if (isDep) deps[idx] = round2(deps[idx] + amt)
          else ress[idx] = round2(ress[idx] + amt)
        }
      }
      result[f.id] = { deps, ress, provs }
    }
    return result
  }, [linked, accounts, schedules, scheduleReservaFuncoes, getNextOccurrences, winStart, winEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const projections = useMemo(() => {
    return linked.map(f => {
      const account = accounts.find(a => a.id === f.accountId)
      const start = saldosAtualizados[f.id] ?? round2(f.saldoInicial + f.entradas - f.saidas)
      const schd = scheduledByFunction[f.id] || { deps: new Array(12).fill(0), ress: new Array(12).fill(0), provs: new Array(12).fill(0) }
      let bal = start
      const monthly = windowMonths.map((wm, i) => {
        const dep = schd.deps[i]
        const res = schd.ress[i]
        const prov = schd.provs[i]
        // mês anterior (i=0) é a referência do saldo atual; projeção começa no mês corrente.
        // Provisões contam como saída adicional (resgate provisório).
        if (i > 0) bal = round2(bal + dep - res - prov)
        return { dep, res, prov, saldo: bal, neg: bal < 0, ...wm }
      })
      const hasAlert = monthly.some(d => d.neg)
      return { f, account, monthly, hasAlert }
    })
  }, [linked, accounts, saldosAtualizados, scheduledByFunction, windowMonths])

  const totalInvested = linked.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0)
  const hasProvisao = projections.some(p => p.monthly.some(m => m.prov > 0))
  const [mobilePage, setMobilePage] = useState(0)

  const yy = (y) => String(y).slice(2)
  const rangeLabel = `${windowMonths[0].label}/${yy(windowMonths[0].year)} – ${lastWm.label}/${yy(lastWm.year)}`

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
    const header = ['Função', 'Conta', 'Categoria', 'Conta Reserva', 'Total Investido']
    windowMonths.forEach(wm => {
      const lbl = `${wm.label}/${yy(wm.year)}`
      header.push(`${lbl} Dep`, `${lbl} Res`, `${lbl} Saldo`)
    })
    const rows = [header]
    projections.forEach(({ f, account, monthly }) => {
      const row = [f.name, account ? (account.apelido || account.name) : '', catOf(account), contaReservaOf(account), saldosAtualizados[f.id] || 0]
      monthly.forEach(d => row.push(d.dep, d.res, d.saldo))
      rows.push(row)
    })
    exportSheet(rows, `reservas-fluxo-${mmYYYY()}.xlsx`)
  }

  if (linked.length === 0) {
    return (
      <div className="card text-center py-12">
        <Layers size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Nenhuma função vinculada a uma conta.</p>
        <p className="text-xs text-gray-600 mt-1">Edite as funções na aba Resumo para vincular uma conta.</p>
      </div>
    )
  }

  const alertCount = projections.filter(p => p.hasAlert).length
  const visibleMonths = [mobilePage, mobilePage + 1, mobilePage + 2]

  return (
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="card py-2.5 px-4 flex items-center gap-4 flex-wrap">
        <Layers size={13} className="text-gray-400" />
        <span className="text-xs text-gray-500">Total investido:</span>
        <span className={`text-sm font-bold ${totalInvested >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(totalInvested)}</span>
        {alertCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-orange-600 ml-2">
            <AlertTriangle size={12} /> {alertCount} {alertCount === 1 ? 'função ficará negativa' : 'funções ficarão negativas'}
          </span>
        )}
        {hasProvisao && (
          <span className="text-xs text-orange-400/70 italic ml-2" title="Resgates projetados a partir de provisões de despesa ainda não efetivadas">
            ~ resgate provisório (provisão)
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-600">{rangeLabel}</span>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1">
            <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
          </button>
        </div>
      </div>

      {/* ── Mobile layout (hidden md+) ── */}
      <div className="md:hidden space-y-3">
        {/* Month navigator */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setMobilePage(p => Math.max(0, p - 1))}
            disabled={mobilePage === 0}
            className="p-1.5 rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-gray-400 font-medium">
            {visibleMonths.map(mi => `${windowMonths[mi].label}/${yy(windowMonths[mi].year)}`).join(' · ')}
          </span>
          <button
            onClick={() => setMobilePage(p => Math.min(9, p + 1))}
            disabled={mobilePage >= 9}
            className="p-1.5 rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Cards per function */}
        {projections.map(({ f, account, monthly, hasAlert }) => (
          <div key={f.id} className={`card p-0 overflow-hidden ${hasAlert ? 'border border-orange-500/30' : ''}`}>
            {/* Card header */}
            <div className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2">
              {hasAlert && <AlertTriangle size={11} className="text-orange-600 shrink-0" />}
              <span className="text-sm font-medium text-gray-200 flex-1 truncate">{f.name}</span>
              {account && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">
                  {account.apelido || account.name.slice(0, 8)}
                </span>
              )}
              <span className={`text-xs font-semibold shrink-0 ${(saldosAtualizados[f.id] || 0) < 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                {fmt(saldosAtualizados[f.id] || 0)}
              </span>
            </div>

            {/* 3 month columns */}
            <div className="grid grid-cols-3 divide-x divide-gray-800">
              {visibleMonths.map(mi => {
                const d = monthly[mi]
                return (
                  <div key={mi} className={`px-2 py-2.5 ${d.neg ? 'bg-orange-500/10' : ''} ${d.isYearStart ? 'border-l-2 border-l-emerald-700' : ''}`}>
                    <p className="text-[10px] text-gray-500 font-semibold uppercase mb-1.5">
                      {d.label}{d.isYearStart || mi === 0 ? ` ${yy(d.year)}` : ''}
                    </p>
                    <p className={`text-xs ${d.dep > 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                      ↓ {d.dep > 0 ? fmt(d.dep) : '—'}
                    </p>
                    <p className={`text-xs ${d.res > 0 ? 'text-orange-600' : 'text-gray-700'}`}>
                      ↑ {d.res > 0 ? fmt(d.res) : '—'}
                    </p>
                    {d.prov > 0 && (
                      <p className="text-[11px] italic text-orange-400/70" title="Resgate futuro (provisão) — estimativa">
                        ↑ ~{fmt(d.prov)}
                      </p>
                    )}
                    <p className={`text-xs font-semibold mt-1 ${d.neg ? 'text-orange-400' : d.saldo === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                      {fmt(d.saldo)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop layout (hidden below md) ── */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
            <thead>
              <tr className="border-b border-gray-800 bg-surface">
                <th className="text-left px-3 py-2.5 text-gray-400 font-medium whitespace-nowrap" style={{ minWidth: 160 }}>Função</th>
                <th className="text-left px-3 py-2.5 text-gray-400 font-medium" style={{ minWidth: 80 }}>Conta</th>
                <th className="text-right px-3 py-2.5 text-gray-400 font-medium" style={{ minWidth: 100 }}>Total Investido</th>
                {windowMonths.map((wm, i) => (
                  <th
                    key={i}
                    colSpan={3}
                    className={`text-center px-1 py-2 font-medium whitespace-nowrap ${wm.isYearStart ? 'border-l-2 border-l-emerald-700 text-emerald-300' : 'border-l border-gray-800 text-gray-400'}`}
                    style={{ minWidth: 190 }}
                  >
                    {wm.label}{wm.isYearStart || i === 0 ? ` ${wm.year}` : ''}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-700 bg-surface/80">
                <th /><th /><th />
                {windowMonths.map((wm, i) => (
                  <Fragment key={i}>
                    <th className={`text-right px-2 py-1.5 text-blue-600/70 font-medium whitespace-nowrap ${wm.isYearStart ? 'border-l-2 border-l-emerald-700' : 'border-l border-gray-800'}`} style={{ minWidth: 62 }}>Dep</th>
                    <th className="text-right px-2 py-1.5 text-orange-600/70 font-medium whitespace-nowrap" style={{ minWidth: 62 }}>Res</th>
                    <th className="text-right px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap" style={{ minWidth: 66 }}>Saldo</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {projections.map(({ f, account, monthly, hasAlert }) => (
                <tr key={f.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${hasAlert ? 'bg-orange-500/5' : ''}`}>
                  <td className="px-3 py-2 text-gray-200 whitespace-nowrap">
                    {hasAlert && <AlertTriangle size={10} className="inline text-orange-600 mr-1" />}
                    {f.name}
                  </td>
                  <td className="px-3 py-2">
                    {account
                      ? <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{account.apelido || account.name.slice(0, 8)}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${(saldosAtualizados[f.id] || 0) < 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                    {fmt(saldosAtualizados[f.id] || 0)}
                  </td>
                  {monthly.map((d, mi) => (
                    <Fragment key={mi}>
                      <td className={`px-2 py-2 text-right ${d.isYearStart ? 'border-l-2 border-l-emerald-700' : 'border-l border-gray-800'} ${d.dep > 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                        {d.dep > 0 ? fmt(d.dep) : '—'}
                      </td>
                      <td className={`px-2 py-2 text-right ${d.res > 0 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {d.res > 0 ? fmt(d.res) : '—'}
                        {d.prov > 0 && (
                          <span className="block text-[10px] italic text-orange-400/70" title="Resgate futuro (provisão) — estimativa">
                            ~{fmt(d.prov)}
                          </span>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold ${d.neg ? 'text-orange-400 bg-orange-500/15' : d.saldo === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                        {fmt(d.saldo)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ──────────────────────────────────────────────────────────────
export default function ReservasPanel() {
  const {
    profileAccounts: accounts, profileTransactions: transactions, categories, profileSchedules: schedules,
    scheduleReservaFuncoes, getFinancialPeriod, getNextOccurrences, reorderReserveFunctions,
    // Histórico no banco (fonte da verdade): períodos de saldo inicial + ajustes.
    reservePeriods, reserveAdjustments, addReservePeriod, deleteReservePeriod,
    addReserveAdjustment, updateReserveAdjustment, deleteReserveAdjustment,
  } = useApp()
  const { functions, accountBalances, addFunction, updateFunction, deleteFunction, setAccountBalance } = useReservas()
  const [tab, setTab] = useState('contas')
  const [showForm, setShowForm] = useState(false)
  const [editFn, setEditFn] = useState(null)
  const [virarModal, setVirarModal] = useState(false)  // modal "Virar Saldo" (pede data de início)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // ids dos períodos criados na última virada (undo em sessão — o banco é a fonte da verdade,
  // não há mais snapshot em localStorage). Vazio → botão "Desfazer" oculto.
  const [lastViradaIds, setLastViradaIds] = useState([])

  // Saldo = Saldo Inicial + Entradas − Saídas + Ajuste (ajuste do período, pode ser ±).
  const computeSaldo = (f) => Math.round((f.saldoInicial + f.entradas - f.saidas + (f.ajuste || 0)) * 100) / 100

  const period = getFinancialPeriod()
  const periodStart = period.start.toISOString().split('T')[0]
  const periodEnd = period.end.toISOString().split('T')[0]
  // Mês de referência do ajuste LEGADO = mês-CALENDÁRIO atual (YYYY-MM) — usado só no fallback
  // do ajuste_override JSONB para funções sem registros em reserve_adjustments.
  const _now = new Date()
  const currentMonthKey = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`
  const todayStr = localDateStr(_now)
  const tomorrowStr = localDateStr(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1))

  // Período ativo de cada função = registro de data_inicio mais recente com data_inicio <= hoje
  // (uma virada com data futura só passa a valer na sua data). functionId → período ({..., data_inicio, saldo_inicial}).
  const activePeriodByFn = useMemo(() => {
    const m = {}
    for (const p of (reservePeriods || [])) {
      if (!p.data_inicio || p.data_inicio > todayStr) continue
      const cur = m[p.function_id]
      if (!cur || p.data_inicio > cur.data_inicio) m[p.function_id] = p
    }
    return m
  }, [reservePeriods, todayStr])

  // Ajustes agrupados por função (todos; o filtro por período ativo é aplicado no cálculo).
  const adjustmentsByFn = useMemo(() => {
    const m = {}
    for (const a of (reserveAdjustments || [])) {
      ;(m[a.function_id] = m[a.function_id] || []).push(a)
    }
    return m
  }, [reserveAdjustments])

  // Data inicial do cálculo AUTO de Entradas/Saídas por função: início do período ativo
  // (acumula do data_inicio até hoje) ou, SEM período, todos os lançamentos (sem corte de
  // data, de 0001-01-01 até hoje) — até que a primeira virada de saldo crie um período.
  const autoBoundsOf = useMemo(() => {
    return (fnId) => {
      const ap = activePeriodByFn[fnId]
      return ap ? { start: ap.data_inicio, end: todayStr } : { start: '0001-01-01', end: todayStr }
    }
  }, [activePeriodByFn, todayStr])

  // Etapa 2: entradas/saídas calculadas a partir dos lançamentos vinculados a cada função
  // (reservaFuncaoId). Filtro por função: com período ativo → date >= data_inicio (até hoje);
  // sem período → ciclo financeiro atual.
  //   • receita vinculada → entrada | despesa vinculada → saída
  //   • transferência → entrada se ENTRA na conta da função (depósito);
  //     saída se SAI da conta da função (resgate). Despesa (cartão) não é movimento de reserva.
  const computedMovs = useMemo(() => {
    const m = {}
    const reservaAccOf = {} // functionId → conta de reserva da própria função
    const boundsOf = {}     // functionId → { start, end }
    functions.forEach(f => {
      m[f.id] = { entradas: 0, saidas: 0 }
      reservaAccOf[f.id] = f.accountId || null
      boundsOf[f.id] = autoBoundsOf(f.id)
    })
    transactions.forEach(tx => {
      const slot = tx.reservaFuncaoId && m[tx.reservaFuncaoId]
      if (!slot) return
      const b = boundsOf[tx.reservaFuncaoId]
      if (tx.date < b.start || tx.date > b.end) return
      // Entrada: receita NA conta da reserva, ou transferência ENTRANDO nela.
      // Saída: transferência SAINDO da conta da reserva (resgate). Despesa de cartão é só
      // provisão/justificativa — NÃO é movimento de reserva, não entra em entradas/saídas.
      const reservaAccId = reservaAccOf[tx.reservaFuncaoId]
      if (tx.type === 'income' && tx.accountId === reservaAccId) slot.entradas += tx.amount
      else if (tx.type === 'transfer') {
        if (tx.toAccountId === reservaAccId) slot.entradas += tx.amount
        else if (tx.accountId === reservaAccId) slot.saidas += tx.amount
      }
    })
    Object.values(m).forEach(s => {
      s.entradas = Math.round(s.entradas * 100) / 100
      s.saidas = Math.round(s.saidas * 100) / 100
    })
    return m
  }, [functions, transactions, autoBoundsOf])

  // Funções EFETIVAS: saldo inicial vem do período ativo (fallback f.saldoInicial legado);
  // entradas/saídas do cálculo AUTO ou override manual; ajuste da soma dos reserve_adjustments
  // do período ativo (fallback ajuste_override JSONB do mês atual). Tudo a jusante usa estes valores.
  const effectiveFunctions = useMemo(() => functions.map(f => {
    const comp = computedMovs[f.id] || { entradas: 0, saidas: 0 }
    const ap = activePeriodByFn[f.id]
    const saldoInicial = ap ? (Number(ap.saldo_inicial) || 0) : (Number(f.saldoInicial) || 0)

    // Ajuste: soma dos adjustments (dentro do período ativo, se houver). Sem nenhum adjustment
    // para a função → fallback no ajuste_override legado do mês atual.
    const adjs = adjustmentsByFn[f.id]
    let ajuste, ajusteObs
    if (adjs && adjs.length > 0) {
      const start = ap ? ap.data_inicio : null
      ajuste = Math.round(adjs.reduce((s, a) => (!start || a.data >= start) ? s + (Number(a.valor) || 0) : s, 0) * 100) / 100
      ajusteObs = ''  // observações vivem na lista/modal de ajustes
    } else {
      ajuste = Number(f.ajusteOverride?.[currentMonthKey]?.valor) || 0
      ajusteObs = f.ajusteOverride?.[currentMonthKey]?.observacao || ''
    }

    return {
      ...f,
      saldoInicial,
      // Entradas/Saídas SEMPRE do cálculo AUTO (lançamentos). Os overrides manuais foram
      // removidos da UI; as colunas entradas_override/saidas_override seguem no banco, ignoradas aqui.
      entradas: comp.entradas,
      saidas: comp.saidas,
      ajuste,
      ajusteObs,
      hasPeriod: !!ap,
      hasAdjustments: !!(adjs && adjs.length > 0),
    }
  }), [functions, computedMovs, currentMonthKey, activePeriodByFn, adjustmentsByFn])

  const saldosAtualizados = useMemo(() => {
    const result = {}
    const byAccount = {}
    effectiveFunctions.forEach(f => {
      if (!f.accountId) return
      ;(byAccount[f.accountId] = byAccount[f.accountId] || []).push(f)
    })
    Object.entries(byAccount).forEach(([accId, fns]) => {
      const account = accounts.find(a => a.id === accId)
      const totalSaldo = fns.reduce((s, f) => s + computeSaldo(f), 0)
      const saldoReal = accountBalances[accId] !== undefined
        ? accountBalances[accId]
        : (account?.balance || 0)
      fns.forEach(f => {
        const saldo = computeSaldo(f)
        result[f.id] = totalSaldo === 0 ? 0 : Math.round(saldo * (saldoReal / totalSaldo) * 100) / 100
      })
    })
    effectiveFunctions.filter(f => !f.accountId).forEach(f => { result[f.id] = computeSaldo(f) })
    return result
  }, [effectiveFunctions, accounts, accountBalances])

  // Virar Saldo: para cada função, cria um NOVO período iniciando na data escolhida, com
  // saldo_inicial = Saldo Atualizado atual. Não sobrescreve reserve_functions nem grava em
  // localStorage — o banco é a fonte da verdade. Guarda os ids criados para o "Desfazer".
  const handleVirar = async (dataInicio) => {
    const criados = []
    try {
      for (const f of effectiveFunctions) {
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        await addReservePeriod({
          id,
          function_id: f.id,
          data_inicio: dataInicio,
          saldo_inicial: saldosAtualizados[f.id] ?? computeSaldo(f),
        })
        criados.push(id)
      }
      setLastViradaIds(criados)
    } finally {
      setVirarModal(false)
    }
  }

  // Desfazer a última virada: remove os períodos criados nela (sessão atual).
  const handleUndoVirada = async () => {
    for (const id of lastViradaIds) {
      try { await deleteReservePeriod(id) } catch { /* segue removendo os demais */ }
    }
    setLastViradaIds([])
  }

  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit')
  const reservaAccounts = useMemo(() => accounts.filter(a => a.isReserva), [accounts])
  // "Último fechamento": data_inicio mais recente registrada entre todos os períodos.
  const lastFechamento = useMemo(() => {
    let max = null
    for (const p of (reservePeriods || [])) {
      if (p.data_inicio && (!max || p.data_inicio > max)) max = p.data_inicio
    }
    return max
  }, [reservePeriods])

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800 overflow-x-auto scrollbar-none">
        {[
          { id: 'contas', label: 'Contas Reserva' },
          { id: 'resumo', label: 'Resumo' },
          { id: 'fluxo', label: 'Fluxo Futuro' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 sm:px-4 pb-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'border-[#0F6E56] text-[#0F6E56]'
                : 'border-transparent text-gray-500 hover:text-gray-300'
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

      {tab === 'resumo' && (
        <ResumoTab
          functions={effectiveFunctions}
          accounts={nonCreditAccounts}
          categories={categories}
          accountBalances={accountBalances}
          adjustmentsByFn={adjustmentsByFn}
          activePeriodByFn={activePeriodByFn}
          saldosAtualizados={saldosAtualizados}
          computeSaldo={computeSaldo}
          todayStr={todayStr}
          autoBoundsOf={autoBoundsOf}
          lastFechamento={lastFechamento}
          canUndo={lastViradaIds.length > 0}
          onAdd={() => { setEditFn(null); setShowForm(true) }}
          onEdit={f => { setEditFn(f); setShowForm(true) }}
          onDelete={f => setConfirmDelete(f)}
          onUpdateFunction={updateFunction}
          onSetAccountBalance={setAccountBalance}
          onAddPeriod={addReservePeriod}
          onAddAdjustment={addReserveAdjustment}
          onUpdateAdjustment={updateReserveAdjustment}
          onDeleteAdjustment={deleteReserveAdjustment}
          onVirar={() => setVirarModal(true)}
          onUndo={handleUndoVirada}
          onReorder={reorderReserveFunctions}
        />
      )}

      {tab === 'fluxo' && (
        <FluxoTab
          functions={effectiveFunctions}
          accounts={nonCreditAccounts}
          categories={categories}
          saldosAtualizados={saldosAtualizados}
          schedules={schedules}
          scheduleReservaFuncoes={scheduleReservaFuncoes}
          getNextOccurrences={getNextOccurrences}
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

      {virarModal && (
        <VirarSaldoModal
          defaultDate={tomorrowStr}
          onConfirm={handleVirar}
          onClose={() => setVirarModal(false)}
        />
      )}

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
