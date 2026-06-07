import { useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank,
  ArrowDownCircle, ArrowUpCircle, CreditCard, AlertTriangle, Calendar, ChevronRight, X,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { computeFaturaRef } from '../../lib/fatura'
import Modal from '../shared/Modal'

const PIE_COLORS = ['#6366f1', '#f97316', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899']

const PERIOD_OPTS = [
  { value: 'current', label: 'Mês atual' },
  { value: 'prev', label: 'Mês anterior' },
  { value: '3m', label: 'Últimos 3m' },
]

function Delta({ abs, pct, goodWhenPositive = true }) {
  if (abs === null || abs === undefined) return null
  const isGood = goodWhenPositive ? abs >= 0 : abs <= 0
  const color = isGood ? 'text-emerald-400' : 'text-orange-600'
  const Icon = abs >= 0 ? TrendingUp : TrendingDown
  return (
    <div className={`flex items-center gap-1 mt-1.5 text-xs ${color}`}>
      <Icon size={11} />
      {pct !== null && <span>{abs >= 0 ? '+' : ''}{pct.toFixed(0)}%</span>}
      <span className="text-gray-700">·</span>
      <span>{abs >= 0 ? '+' : ''}{fmt(Math.abs(abs))}</span>
      <span className="text-gray-600 ml-0.5">vs mês ant.</span>
    </div>
  )
}

function KpiCard({ icon: Icon, iconColor, label, value, valueColor, deltaAbs, deltaPct, goodWhenPositive }) {
  return (
    <div className="card">
      <div className={`flex items-center gap-2 mb-2 ${iconColor}`}>
        <Icon size={15} />
        <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor}`}>{fmt(value)}</p>
      <Delta abs={deltaAbs} pct={deltaPct} goodWhenPositive={goodWhenPositive} />
    </div>
  )
}

export default function DashboardPanel({ setActivePage, onShowPosicao }) {
  const { profileAccounts, profileReportTransactions, profileSchedules: schedules, categories, getFinancialPeriod, getNextOccurrences } = useApp()
  const accounts = profileAccounts
  // Transferências entre perfis viram receita/despesa na visão do perfil ativo (KPIs/gráficos).
  const transactions = profileReportTransactions

  const period = getFinancialPeriod()
  const periodStr = {
    start: period.start.toISOString().split('T')[0],
    end: period.end.toISOString().split('T')[0],
  }

  // Current period (lançamentos investAuto são invisíveis nos relatórios/totais)
  const periodTxs = transactions.filter(tx => tx.date >= periodStr.start && tx.date <= periodStr.end && tx.origin !== 'investAuto')
  const income = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expense

  // Previous period (same duration, shifted back)
  const prevStart = subMonths(period.start, 1).toISOString().split('T')[0]
  const prevEnd = subMonths(period.end, 1).toISOString().split('T')[0]
  const prevTxs = transactions.filter(tx => tx.date >= prevStart && tx.date <= prevEnd && tx.origin !== 'investAuto')
  const prevIncome = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const prevBalance = prevIncome - prevExpense

  const mkDelta = (cur, prev) => ({
    abs: cur - prev,
    pct: prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null,
  })

  const totalAssets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)
  const totalDebt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + (a.creditDebt || 0), 0)
  const saldoPrincipal = accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)

  // Budget progress (expense as % of income)
  const budgetPct = income > 0 ? Math.min((expense / income) * 100, 120) : 0
  const budgetColor = budgetPct < 70 ? '#2563EB' : budgetPct < 90 ? '#f59e0b' : '#EA580C'
  const budgetLabel = budgetPct < 70 ? 'Saudável' : budgetPct < 90 ? 'Atenção' : 'Acima do limite'

  // 6-month chart
  const last6Months = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i)
      const start = startOfMonth(d).toISOString().split('T')[0]
      const end = endOfMonth(d).toISOString().split('T')[0]
      const label = format(d, "MMM'/'yy", { locale: ptBR })
      const inc = transactions.filter(tx => tx.type === 'income' && tx.origin !== 'investAuto' && tx.date >= start && tx.date <= end).reduce((s, t) => s + t.amount, 0)
      const exp = transactions.filter(tx => tx.type === 'expense' && tx.date >= start && tx.date <= end).reduce((s, t) => s + t.amount, 0)
      return { label, income: inc, expense: exp }
    })
  }, [transactions])

  // Upcoming & overdue schedules (next 7 days + overdue)
  const upcomingSchedules = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const items = []
    schedules.forEach(s => {
      const nexts = getNextOccurrences(s, 2)
      nexts.forEach(date => {
        if (date <= in7) items.push({ schedule: s, date })
      })
    })
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
  }, [schedules, getNextOccurrences])

  // Credit card alerts
  const creditAlerts = useMemo(() => {
    const today = new Date()
    return accounts.filter(a => a.type === 'credit' && a.active !== false).filter(a => {
      let due = new Date(today.getFullYear(), today.getMonth(), a.dueDay || 10)
      if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, a.dueDay || 10)
      return differenceInDays(due, today) <= 5
    })
  }, [accounts])

  const topExpenses = useMemo(() => {
    const catTotals = {}
    periodTxs.filter(t => t.type === 'expense' && t.categoryId).forEach(t => {
      catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount
    })
    return Object.entries(catTotals)
      .map(([id, amt]) => ({ cat: categories.find(c => c.id === id), amt }))
      .filter(e => e.cat)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 5)
  }, [periodTxs, categories])

  // ── Saldo Projetado + Final ──────────────────────────────────────────────────
  const saldoProjetado = useMemo(() => {
    const principalIds = new Set(
      accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id)
    )
    if (principalIds.size === 0) return null

    const todayStr = new Date().toISOString().split('T')[0]
    let pendingIncome = 0
    let pendingExpense = 0
    let pendingCount = 0

    for (const schedule of schedules) {
      const fromPrincipal = principalIds.has(schedule.accountId)
      const toPrincipal = principalIds.has(schedule.toAccountId)
      if (!fromPrincipal && !toPrincipal) continue

      const nexts = getNextOccurrences(schedule, 35)
        .filter(date => date > todayStr && date <= periodStr.end)
      if (nexts.length === 0) continue

      for (const _date of nexts) {
        if (schedule.transactionType === 'income' && fromPrincipal) {
          pendingIncome += schedule.amount
          pendingCount++
        } else if (schedule.transactionType === 'expense' && fromPrincipal) {
          pendingExpense += schedule.amount
          pendingCount++
        } else if (schedule.transactionType === 'transfer') {
          if (fromPrincipal && !toPrincipal) {
            pendingExpense += schedule.amount
            pendingCount++
          } else if (!fromPrincipal && toPrincipal) {
            pendingIncome += schedule.amount
            pendingCount++
          }
        }
      }
    }

    // Future registered transactions (date > today, ≤ end of period) — used for saldoFinal
    let futureDelta = 0
    for (const tx of transactions) {
      if (tx.date <= todayStr || tx.date > periodStr.end) continue
      const fromPrincipal = principalIds.has(tx.accountId)
      const toPrincipal = principalIds.has(tx.toAccountId)
      if (!fromPrincipal && !toPrincipal) continue
      if (tx.type === 'income' && fromPrincipal) futureDelta += tx.amount
      else if (tx.type === 'expense' && fromPrincipal) futureDelta -= tx.amount
      else if (tx.type === 'transfer') {
        if (fromPrincipal && !toPrincipal) futureDelta -= tx.amount
        else if (!fromPrincipal && toPrincipal) futureDelta += tx.amount
      }
    }

    const projetado = saldoPrincipal + pendingIncome - pendingExpense
    return {
      projetado,
      final: projetado + futureDelta,
      pendingIncome,
      pendingExpense,
      pendingCount,
      futureDelta,
    }
  }, [accounts, schedules, transactions, getNextOccurrences, periodStr.end, saldoPrincipal])

  const today = new Date().toISOString().split('T')[0]

  // Last tx date per fluxo account (single pass, both sides of transfers)
  const lastTxByFluxoAccount = useMemo(() => {
    const fluxoIds = new Set(
      accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id)
    )
    if (fluxoIds.size === 0) return {}
    const result = {}
    for (const tx of transactions) {
      if (tx.reservaAuto) continue
      if (fluxoIds.has(tx.accountId) && (!result[tx.accountId] || tx.date > result[tx.accountId])) {
        result[tx.accountId] = tx.date
      }
      if (tx.toAccountId && fluxoIds.has(tx.toAccountId) && (!result[tx.toAccountId] || tx.date > result[tx.toAccountId])) {
        result[tx.toAccountId] = tx.date
      }
    }
    return result
  }, [accounts, transactions])

  // Last expense date per credit card within current fatura period
  const lastCreditTxByCard = useMemo(() => {
    const result = {}
    const now = new Date()
    for (const card of accounts.filter(a => a.type === 'credit')) {
      const closingDay = card.closingDay || 14
      const currentRef = computeFaturaRef(now, closingDay)
      let maxDate = null
      for (const tx of transactions) {
        if (tx.accountId !== card.id || tx.type !== 'expense' || tx.reservaAuto) continue
        if (computeFaturaRef(new Date(tx.date + 'T00:00:00'), closingDay) === currentRef) {
          if (!maxDate || tx.date > maxDate) maxDate = tx.date
        }
      }
      result[card.id] = maxDate
    }
    return result
  }, [accounts, transactions])

  // ── P17: Pie chart state ─────────────────────────────────────────────────
  const [pieFilter, setPieFilter] = useState('current')
  const [catModal, setCatModal] = useState(null) // { name, cat, txs, value, color }

  const pieRange = useMemo(() => {
    const now = new Date()
    if (pieFilter === 'prev') {
      const d = subMonths(now, 1)
      return { start: startOfMonth(d).toISOString().split('T')[0], end: endOfMonth(d).toISOString().split('T')[0] }
    }
    if (pieFilter === '3m') {
      return { start: startOfMonth(subMonths(now, 2)).toISOString().split('T')[0], end: endOfMonth(now).toISOString().split('T')[0] }
    }
    return { start: periodStr.start, end: periodStr.end }
  }, [pieFilter, periodStr])

  const topCatData = useMemo(() => {
    const totals = {}
    const txMap = {}
    transactions
      .filter(tx => tx.type === 'expense' && tx.date >= pieRange.start && tx.date <= pieRange.end && tx.categoryId)
      .forEach(tx => {
        totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount
        ;(txMap[tx.categoryId] = txMap[tx.categoryId] || []).push(tx)
      })
    const total = Object.values(totals).reduce((s, v) => s + v, 0)
    return Object.entries(totals)
      .map(([id, value]) => {
        const cat = categories.find(c => c.id === id)
        return { id, cat, name: cat ? `${cat.icon} ${cat.name}` : id, value, pct: total > 0 ? (value / total) * 100 : 0, txs: txMap[id] || [] }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [transactions, categories, pieRange])

  return (
    <div className="space-y-4">
      {/* Credit card alert banner */}
      {creditAlerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Fatura(s) próximas do vencimento</p>
            <p className="text-xs text-amber-500 mt-0.5">
              {creditAlerts.map(a => `${a.name} (vence dia ${a.dueDay})`).join(' · ')}
            </p>
          </div>
          <button onClick={() => setActivePage('alerts')} className="ml-auto text-xs text-amber-400 hover:text-amber-300 shrink-0">Ver alertas</button>
        </div>
      )}

      {/* Saldo Principal hero */}
      <button
        onClick={onShowPosicao}
        className="w-full card text-left hover:bg-gray-800/60 transition-colors group border border-transparent hover:border-emerald-900/50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(15,110,86,0.15)' }}>
              <Wallet size={14} style={{ color: '#0F6E56' }} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">Saldo Principal</p>
              <p className="text-xs text-gray-600 mt-0.5">Contas de fluxo de caixa · clique para ver posição</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-600 group-hover:text-emerald-600 transition-colors shrink-0" />
        </div>
        <p className={`text-3xl font-extrabold mt-3 tracking-tight ${saldoPrincipal >= 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
          {fmt(saldoPrincipal)}
        </p>
        {saldoProjetado && (
          <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-2.5 flex-wrap">
            <span>Projetado <span className={`font-semibold ${saldoProjetado.projetado >= 0 ? 'text-teal-400' : 'text-red-400'}`}>{fmt(saldoProjetado.projetado)}</span></span>
            <span className="text-gray-700">·</span>
            <span>Final <span className={`font-semibold ${saldoProjetado.final >= 0 ? 'text-purple-400' : 'text-red-400'}`}>{fmt(saldoProjetado.final)}</span></span>
          </p>
        )}
      </button>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          iconColor="text-blue-600"
          label="Receitas do Mês"
          value={income}
          valueColor="text-blue-600"
          deltaAbs={mkDelta(income, prevIncome).abs}
          deltaPct={mkDelta(income, prevIncome).pct}
          goodWhenPositive={true}
        />
        <KpiCard
          icon={TrendingDown}
          iconColor="text-orange-600"
          label="Despesas do Mês"
          value={expense}
          valueColor="text-orange-600"
          deltaAbs={mkDelta(expense, prevExpense).abs}
          deltaPct={mkDelta(expense, prevExpense).pct}
          goodWhenPositive={false}
        />
        <KpiCard
          icon={Wallet}
          iconColor="text-gray-400"
          label="Saldo do Mês"
          value={balance}
          valueColor={balance >= 0 ? 'text-blue-600' : 'text-orange-600'}
          deltaAbs={mkDelta(balance, prevBalance).abs}
          deltaPct={mkDelta(balance, prevBalance).pct}
          goodWhenPositive={true}
        />
        <KpiCard
          icon={PiggyBank}
          iconColor="text-gray-500"
          label="Saldo Total"
          value={totalAssets}
          valueColor="text-gray-300"
        />

        {/* Projetado + Final — largura total, abaixo dos 4 KPI cards */}
        {saldoProjetado && (
          <div className="col-span-2 lg:col-span-4 card flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={15} className="text-teal-500 shrink-0" />
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  Projeção até {format(parseISO(periodStr.end), 'dd/MM')}
                </span>
              </div>
              <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 leading-relaxed">
                <span>Principal <span className="text-gray-300 font-medium">{fmt(saldoPrincipal)}</span></span>
                {saldoProjetado.pendingIncome > 0 && (
                  <span className="flex items-center gap-1 text-blue-400">
                    <ArrowDownCircle size={10} className="shrink-0" />
                    +{fmt(saldoProjetado.pendingIncome)}
                  </span>
                )}
                {saldoProjetado.pendingExpense > 0 && (
                  <span className="flex items-center gap-1 text-orange-400">
                    <ArrowUpCircle size={10} className="shrink-0" />
                    −{fmt(saldoProjetado.pendingExpense)}
                  </span>
                )}
                {saldoProjetado.futureDelta !== 0 && (
                  <span className={`flex items-center gap-1 ${saldoProjetado.futureDelta > 0 ? 'text-indigo-400' : 'text-amber-400'}`}>
                    {saldoProjetado.futureDelta > 0 ? '+' : ''}{fmt(saldoProjetado.futureDelta)} lançamentos futuros
                  </span>
                )}
                {saldoProjetado.pendingCount > 0
                  ? <span className="text-gray-600">· {saldoProjetado.pendingCount} agendamento{saldoProjetado.pendingCount !== 1 ? 's' : ''} pendente{saldoProjetado.pendingCount !== 1 ? 's' : ''}</span>
                  : <span className="text-gray-600">· nenhum agendamento pendente no período</span>
                }
              </p>
            </div>
            <div className="shrink-0 text-right space-y-1.5">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Projetado</p>
                <p className={`text-xl font-bold ${saldoProjetado.projetado >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                  {fmt(saldoProjetado.projetado)}
                </p>
              </div>
              {Math.abs(saldoProjetado.final - saldoProjetado.projetado) >= 0.005 && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Final</p>
                  <p className={`text-base font-bold ${saldoProjetado.final >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                    {fmt(saldoProjetado.final)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Budget progress bar */}
      {income > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Uso da Receita — Mês Atual</h3>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: budgetColor, backgroundColor: `${budgetColor}20` }}>
              {budgetLabel}
            </span>
          </div>
          <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(budgetPct, 100)}%`, backgroundColor: budgetColor }}
            />
            {budgetPct > 100 && (
              <div className="absolute inset-y-0 right-0 w-1 bg-red-500 animate-pulse" />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-500 flex-wrap gap-2">
            <span className="flex items-center gap-1">
              <ArrowDownCircle size={11} className="text-blue-600" />
              Receitas: <span className="text-blue-600 font-medium ml-1">{fmt(income)}</span>
            </span>
            <span className="flex items-center gap-1">
              <ArrowUpCircle size={11} className="text-orange-600" />
              Despesas: <span className="text-orange-600 font-medium ml-1">{fmt(expense)}</span>
            </span>
            <span className="text-gray-400">
              {budgetPct.toFixed(0)}% usado
              {income - expense > 0 && <span className="ml-2 text-emerald-400">· disponível: {fmt(income - expense)}</span>}
            </span>
          </div>
        </div>
      )}

      {/* 6-month chart + upcoming schedules */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Receitas vs Despesas — últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last6Months} barGap={3} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={v => fmt(v)}
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="income" name="Receitas" fill="#2563EB" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Despesas" fill="#EA580C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming 7 days */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            Próximos Vencimentos
          </h3>
          {upcomingSchedules.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">Nenhum vencimento nos próximos 7 dias</p>
          ) : (
            <div className="space-y-2">
              {upcomingSchedules.map(({ schedule, date }, i) => {
                const isOverdue = date < today
                const daysLeft = differenceInDays(parseISO(date), parseISO(today))
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 ${
                      isOverdue ? 'bg-red-500/10 border border-red-500/20' : 'bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {schedule.transactionType === 'income'
                        ? <ArrowDownCircle size={13} className="text-blue-600 shrink-0" />
                        : <ArrowUpCircle size={13} className="text-orange-600 shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-xs text-gray-200 font-medium truncate">{schedule.description}</p>
                        <p className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                          {isOverdue
                            ? `${Math.abs(daysLeft)}d em atraso`
                            : daysLeft === 0 ? 'Hoje' : `em ${daysLeft}d · ${fmtDate(date)}`}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${schedule.transactionType === 'income' ? 'text-blue-600' : 'text-orange-600'}`}>
                      {fmt(schedule.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Maiores Despesas (pizza) + ranking de categorias */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Left: pizza interativa */}
        <div className="card">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-gray-300 shrink-0">Maiores Despesas</h3>
            <div className="flex gap-1 shrink-0">
              {PERIOD_OPTS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setPieFilter(o.value)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${pieFilter === o.value ? 'bg-gray-700 text-gray-200' : 'text-gray-600 hover:text-gray-400'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {topCatData.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-10">Sem despesas no período</p>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={topCatData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(d, i) => setCatModal({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] })}
                    style={{ cursor: 'pointer' }}
                  >
                    {topCatData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={v => fmt(v)}
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="space-y-1 mt-1">
                {topCatData.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => setCatModal({ ...item, color: PIE_COLORS[i % PIE_COLORS.length] })}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-800/60 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-gray-300 truncate group-hover:text-white transition-colors">{item.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 ml-2 tabular-nums">
                      {item.pct.toFixed(0)}% — {fmt(item.value)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: ranking de categorias com barra */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Ranking por Categoria</h3>
          {topExpenses.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Sem despesas no período atual</p>
          ) : (
            <div className="space-y-2.5">
              {topExpenses.map(({ cat, amt }) => {
                const pct = expense > 0 ? (amt / expense) * 100 : 0
                return (
                  <div key={cat.id}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-300">{cat.icon} {cat.name}</span>
                      <span className="text-gray-400">{fmt(amt)} <span className="text-gray-600">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: cat.color || '#EA580C' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Category drill-down modal */}
      {catModal && (
        <Modal open={!!catModal} onClose={() => setCatModal(null)} title={catModal.name} size="md">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-800">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Total da categoria</span>
              <span className="text-lg font-bold" style={{ color: catModal.color }}>{fmt(catModal.value)}</span>
            </div>
            <div className="space-y-0 max-h-80 overflow-y-auto">
              {[...catModal.txs]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-gray-800/50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{tx.description || catModal.name}</p>
                      <p className="text-xs text-gray-500">{fmtDate(tx.date)}{tx.payee ? ` · ${tx.payee}` : ''}</p>
                    </div>
                    <span className="text-sm font-semibold text-orange-600 shrink-0 ml-3">{fmt(tx.amount)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </Modal>
      )}

      {/* Accounts grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Contas</h3>
          {totalDebt > 0 && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <CreditCard size={11} className="text-purple-400" />
              Dívida cartão: <span className="text-red-400 font-medium ml-1">{fmt(totalDebt)}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accounts.map(a => {
            // Last activity label for credit cards (current fatura)
            let lastActivityNode = null
            if (a.type === 'credit') {
              const d = lastCreditTxByCard[a.id]
              lastActivityNode = (
                <p className="text-xs text-gray-500 mt-1.5 leading-tight">
                  {d ? `Último lançamento: ${fmtDate(d)}` : 'Sem lançamentos neste mês'}
                </p>
              )
            } else if (a.fluxoCaixaPrincipal) {
              const d = lastTxByFluxoAccount[a.id]
              if (!d) {
                lastActivityNode = <p className="text-xs text-gray-500 mt-1.5 leading-tight">Sem movimentações</p>
              } else {
                const diff = differenceInDays(parseISO(today), parseISO(d))
                const label = diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : `Último: ${fmtDate(d)}`
                const cls = diff > 30 ? 'text-yellow-400' : 'text-gray-500'
                lastActivityNode = <p className={`text-xs mt-1.5 leading-tight ${cls}`}>{diff > 30 ? 'Há mais de 30 dias' : label}</p>
              }
            }

            return (
              <div key={a.id} className="bg-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400 truncate">{a.apelido || a.name}</p>
                  {a.isMain && <span className="text-yellow-400 text-xs shrink-0 ml-1">★</span>}
                </div>
                <p className={`text-sm font-bold ${a.type === 'credit' ? 'text-purple-400' : (a.balance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {a.type === 'credit' ? fmt(a.creditDebt || 0) : fmt(a.balance || 0)}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{a.type === 'credit' ? 'Dívida' : 'Saldo'}</p>
                {lastActivityNode}
              </div>
            )
          })}
          {accounts.length === 0 && (
            <div className="col-span-4 text-center py-4">
              <p className="text-xs text-gray-500">Nenhuma conta cadastrada</p>
              <button onClick={() => setActivePage('accounts')} className="btn-primary mt-2 text-xs">Criar conta</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
