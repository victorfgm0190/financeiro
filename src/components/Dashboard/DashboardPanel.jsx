import { BannerPerfisSemContaCentral } from '../shared/ContaCentralAvisos'
import AvisoPreLancamentos from '../Assistente/AvisoPreLancamentos'
import { useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank,
  ArrowDownCircle, ArrowUpCircle, CreditCard, AlertTriangle, Calendar, ChevronRight, X,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal, fmtDate, accountsForView, isResgateReservaSombra } from '../shared/utils'
import { saldoTotalContas } from '../../lib/saldoTotal'
import { criarClassificadores, totaisDoPeriodo, periodoStr } from '../../lib/receitasDespesas'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useThemeColors } from '../../hooks/useTheme'
import { estiloTooltip } from '../../lib/chartPalette'
import { computeFaturaRef } from '../../lib/fatura'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { hojeStr } from '../../lib/saldos'
import { isInvestAutoOrigin } from '../../lib/origins'
import Modal from '../shared/Modal'
import { CardEnvelopesMes } from '../Envelopes/EnvelopeResumo'
import TopFavorecidos from './TopFavorecidos'
import { PizzaDespesas, RankingDespesas, Segmentado } from './DespesasCategoria'
import { useModoDespesas } from '../../hooks/useDespesasPorCategoria'
import { periodoDoFiltro, PERIOD_OPTS, MODO_OPTS } from '../../lib/despesasPorCategoria'
import { isoLocal } from '../../lib/hoje'

// Placeholder shimmer dos valores enquanto a API ainda não respondeu (dbStatus === 'connecting').
// Evita o flicker de pintar o cache do localStorage e depois sobrescrever com os dados frescos.
const SkeletonVal = ({ wide }) => (
  <span className={`skeleton ${wide ? 'w-32' : 'w-24'} h-7 block`} />
)

function Delta({ abs, pct, goodWhenPositive = true, loading = false }) {
  if (abs === null || abs === undefined) return null
  if (loading) return <div className="mt-1.5"><SkeletonVal /></div>
  const isGood = goodWhenPositive ? abs >= 0 : abs <= 0
  const color = isGood ? 'text-receita' : 'text-despesa'
  const Icon = abs >= 0 ? TrendingUp : TrendingDown
  return (
    <div className={`flex items-center gap-1 mt-1.5 text-xs ${color}`}>
      <Icon size={11} />
      {pct !== null && <span>{abs >= 0 ? '+' : ''}{pct.toFixed(0)}%</span>}
      <span className="text-texto-3">·</span>
      <span>{abs >= 0 ? '+' : ''}{fmt(Math.abs(abs))}</span>
      <span className="text-texto-3 ml-0.5">vs mês ant.</span>
    </div>
  )
}

function KpiCard({ icon: Icon, iconColor, label, value, valueColor, deltaAbs, deltaPct, goodWhenPositive, onClick, loading }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      className={`card ${clickable ? 'cursor-pointer hover:bg-surface-hover/60 transition-colors' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className={`flex items-center gap-2 mb-2 ${iconColor}`}>
        <Icon size={15} />
        <span className="text-xs uppercase tracking-wide text-texto-2">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor}`}>
        {loading ? <SkeletonVal wide /> : fmtSinal(value)}
      </p>
      <Delta abs={deltaAbs} pct={deltaPct} goodWhenPositive={goodWhenPositive} loading={loading} />
    </div>
  )
}

export default function DashboardPanel({ setActivePage, saldosPrincipais, onShowPosicao }) {
  const { profileAccounts, profileReportTransactions, profileSchedules: schedules, categories, reserveFunctions, getFinancialPeriod, getOccurrencesProjecao: getNextOccurrences, getSaldoPrincipal, etapaAPrevistas, dbStatus, creditUsage, pode } = useApp()
  const accounts = profileAccounts
  // Enquanto a API não respondeu, os valores exibidos vêm do cache local (sessão anterior) e
  // serão sobrescritos — mostra skeleton nos números para evitar o flicker visível.
  const loading = dbStatus === 'connecting'
  const isMobile = useIsMobile()
  const cor = useThemeColors()
  // Transferências entre perfis viram receita/despesa na visão do perfil ativo (KPIs/gráficos).
  const transactions = profileReportTransactions

  // Classificação receita/despesa (mesma função do card do Início mobile).
  const { isReservaGerSombra, isExpenseTx, isIncomeTx } = useMemo(
    () => criarClassificadores(reserveFunctions, accounts), [reserveFunctions, accounts]
  )

  const period = getFinancialPeriod()
  const periodStr = periodoStr(period)

  // Current period (lançamentos investAuto são invisíveis nos relatórios/totais)
  const { periodTxs, income, expense } = totaisDoPeriodo(transactions, periodStr, { isIncomeTx, isExpenseTx })
  // Lançamentos exatos dos KPIs Receitas/Despesas do Mês (drill-down e Top 5 Favorecidos).
  const incomeTxs = periodTxs.filter(isIncomeTx)
  const expenseTxs = periodTxs.filter(isExpenseTx)
  // Reservas do período (funções sem categoria): líquido = utilizadas (resgate _r) − feitas (depósito).
  const reservasFeitas = periodTxs.filter(t => isReservaGerSombra(t) && t.type === 'expense' && !isResgateReservaSombra(t))
  const reservasUtilizadas = periodTxs.filter(t => isReservaGerSombra(t) && t.type === 'income' && isResgateReservaSombra(t))
  const reservaLiquido = reservasUtilizadas.reduce((s, t) => s + t.amount, 0) - reservasFeitas.reduce((s, t) => s + t.amount, 0)
  const balance = income - expense

  // Maps p/ rótulos no drill-down de receitas/despesas do mês.
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const accLabel = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }
  const catLabel = (id) => { const c = catById.get(id); return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : 'Sem categoria' }

  // Previous period (same duration, shifted back)
  const prevStart = isoLocal(subMonths(period.start, 1))
  const prevEnd = isoLocal(subMonths(period.end, 1))
  const prevTxs = transactions.filter(tx => tx.date >= prevStart && tx.date <= prevEnd && !isInvestAutoOrigin(tx))
  const prevIncome = prevTxs.filter(isIncomeTx).reduce((s, t) => s + t.amount, 0)
  const prevExpense = prevTxs.filter(isExpenseTx).reduce((s, t) => s + t.amount, 0)
  const prevBalance = prevIncome - prevExpense

  const mkDelta = (cur, prev) => ({
    abs: cur - prev,
    pct: prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null,
  })

  const totalAssets = saldoTotalContas(accounts)
  const totalDebt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + creditUsage(a.id), 0)
  // Saldo Principal do ciclo (mesmos valores de saldosPrincipais do App; fallback ao
  // somatório de balance caso a prop não venha). Mantém o painel consistente com sidebar/header.
  const saldoPrincipal = saldosPrincipais
    ? saldosPrincipais.saldoAtual
    : accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)

  // Valor "Projetado" reutilizado do modal "Como chegamos aqui"
  // (getSaldoPrincipal().projetado.total), que já desconta os envelopes restantes.
  const projetadoModal = useMemo(() => getSaldoPrincipal()?.projetado?.total ?? null, [getSaldoPrincipal])
  // Valor "Final Ciclo" reutilizado do mesmo modal (getSaldoPrincipal().finalCiclo.total).
  const finalCicloModal = useMemo(() => getSaldoPrincipal()?.finalCiclo?.total ?? null, [getSaldoPrincipal])

  // Saldos do ciclo exibidos no card abaixo do Principal (Final Ciclo · Projetado · Atual Cal.
  // · Final Cal.). Atual Cal./Final Cal. sempre visíveis no modo custom — mesmo quando coincidem
  // com os valores do ciclo (sem ocultar duplicados).
  const cicloRows = (() => {
    const s = saldosPrincipais
    if (!s) return []
    const rows = [
      { label: 'Final Ciclo', val: finalCicloModal },
      { label: 'Projetado', val: projetadoModal },
    ]
    if (s.mode === 'custom') {
      rows.push({ label: 'Atual Cal.', val: s.saldoAtualCalendario })
      rows.push({ label: 'Final Cal.', val: s.saldoFinalCalendario })
    }
    return rows.filter(r => r.val != null)
  })()

  // Budget progress (expense as % of income)
  const budgetPct = income > 0 ? Math.min((expense / income) * 100, 120) : 0
  // Status (decisão 11 do tema): ok = primary-fg + ✓ · atenção = aviso + ⚠ · acima = perigo + ⚠
  const budgetCls = budgetPct < 70
    ? { badge: 'text-primary-fg bg-primary/15', barra: 'bg-primary' }
    : budgetPct < 90
      ? { badge: 'text-aviso bg-aviso/15', barra: 'bg-aviso' }
      : { badge: 'text-perigo bg-perigo-bg', barra: 'bg-perigo' }
  const budgetLabel = budgetPct < 70 ? '✓ Saudável' : budgetPct < 90 ? '⚠ Atenção' : '⚠ Acima do limite'

  // 6-month chart
  const last6Months = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i)
      const start = isoLocal(startOfMonth(d))
      const end = isoLocal(endOfMonth(d))
      const label = format(d, "MMM'/'yy", { locale: ptBR })
      const inc = transactions.filter(tx => isIncomeTx(tx) && !isInvestAutoOrigin(tx) && tx.date >= start && tx.date <= end).reduce((s, t) => s + t.amount, 0)
      const exp = transactions.filter(tx => isExpenseTx(tx) && tx.date >= start && tx.date <= end).reduce((s, t) => s + t.amount, 0)
      return { label, income: inc, expense: exp }
    })
  }, [transactions, isExpenseTx, isIncomeTx])

  // Upcoming & overdue schedules (next 7 days + overdue)
  const upcomingSchedules = useMemo(() => {
    const today = hojeStr()
    const in7 = hojeStr(new Date(Date.now() + 7 * 86400000))
    const items = []
    schedules.forEach(s => {
      // Data e valor EFETIVOS (override da ocorrência): a movida aparece no dia novo.
      getNextOccurrences(s, 2).forEach(base => {
        const { date, amount } = occEfetiva(s, base)
        if (date <= in7) items.push({ schedule: s, date, amount })
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

  // ── Saldo Projetado + Final ──────────────────────────────────────────────────
  const saldoProjetado = useMemo(() => {
    const principalIds = new Set(
      accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id)
    )
    if (principalIds.size === 0) return null

    const todayStr = hojeStr()
    let pendingIncome = 0
    let pendingExpense = 0
    let pendingCount = 0

    for (const schedule of schedules) {
      const fromPrincipal = principalIds.has(schedule.accountId)
      const toPrincipal = principalIds.has(schedule.toAccountId)
      if (!fromPrincipal && !toPrincipal) continue

      // Data e valor EFETIVOS da ocorrência (override): a janela do período usa a data em que
      // ela realmente cai, não a data-base.
      const nexts = getNextOccurrences(schedule, 35)
        .map(base => occEfetiva(schedule, base))
        .filter(ef => ef.date > todayStr && ef.date <= periodStr.end)
      if (nexts.length === 0) continue

      for (const ef of nexts) {
        const occAmount = Number(ef.amount) || 0
        if (schedule.transactionType === 'income' && fromPrincipal) {
          pendingIncome += occAmount
          pendingCount++
        } else if (schedule.transactionType === 'expense' && fromPrincipal) {
          pendingExpense += occAmount
          pendingCount++
        } else if (schedule.transactionType === 'transfer') {
          if (fromPrincipal && !toPrincipal) {
            pendingExpense += occAmount
            pendingCount++
          } else if (!fromPrincipal && toPrincipal) {
            pendingIncome += occAmount
            pendingCount++
          }
        }
      }
    }

    // Etapa A prevista do Grupo G — a mesma que getSaldoPrincipal soma no Projetado.
    for (const p of etapaAPrevistas || []) {
      if (p.date <= todayStr || p.date > periodStr.end) continue
      const fromPrincipal = principalIds.has(p.fromAccountId)
      const toPrincipal = principalIds.has(p.toAccountId)
      if (fromPrincipal === toPrincipal) continue
      if (fromPrincipal) pendingExpense += p.amount
      else pendingIncome += p.amount
      pendingCount++
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
  }, [accounts, schedules, transactions, getNextOccurrences, periodStr.end, saldoPrincipal, etapaAPrevistas])

  const today = hojeStr()

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

  // ── P17: Maiores Despesas / Ranking ───────────────────────────────────────
  // Período (meses financeiros) e modo Cheio/Líquido compartilhados pela pizza e pelo ranking;
  // "Ver todas" é de cada bloco. Valores, % e a lista do clique vêm de despesasPorCategoria (src/lib).
  const [pieFilter, setPieFilter] = useState('current')
  const [modoDespesas, setModoDespesas] = useModoDespesas()
  const pieRange = useMemo(() => periodoDoFiltro(pieFilter, getFinancialPeriod), [pieFilter, getFinancialPeriod])
  const [pizzaTodas, setPizzaTodas] = useState(false)
  const [rankingTodas, setRankingTodas] = useState(false)
  const [txModal, setTxModal] = useState(null) // { title, total, color, txs } — receitas/despesas do mês

  return (
    <div className="space-y-4">
      <BannerPerfisSemContaCentral />
      <AvisoPreLancamentos />
      {/* Credit card alert banner */}
      {creditAlerts.length > 0 && (
        <div className="bg-aviso/10 border border-aviso/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-aviso shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-aviso">Fatura(s) próximas do vencimento</p>
            <p className="text-xs text-texto-2 mt-0.5">
              {creditAlerts.map(a => `${a.name} (vence dia ${a.dueDay})`).join(' · ')}
            </p>
          </div>
          <button onClick={() => setActivePage('alerts')} className="ml-auto text-xs text-primary-fg hover:text-texto-1 shrink-0">Ver alertas</button>
        </div>
      )}

      {/* Saldo Principal hero */}
      <button
        onClick={onShowPosicao}
        className="w-full card text-left hover:bg-surface-hover/60 transition-colors group border border-transparent hover:border-primary/40"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/15">
              <Wallet size={14} className="text-primary-fg" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-texto-2 font-medium">Saldo Principal</p>
              <p className={`text-xs mt-0.5 ${saldosPrincipais?.semContasFC ? 'text-aviso' : 'text-texto-3'}`}>
                {saldosPrincipais?.semContasFC
                  ? 'Nenhuma conta marcada como Somar no Saldo Principal (FC) neste perfil'
                  : 'Contas de fluxo de caixa · clique para ver posição'}
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-texto-3 group-hover:text-primary-fg transition-colors shrink-0" />
        </div>
        {/* Principal em destaque */}
        <p className="text-[11px] uppercase tracking-wide text-texto-3 mt-3">Principal</p>
        {loading ? (
          <SkeletonVal wide />
        ) : (
          <p className={`text-3xl font-extrabold tracking-tight ${saldoPrincipal >= 0 ? 'text-receita' : 'text-despesa'}`}>
            {fmtSinal(saldoPrincipal)}
          </p>
        )}

        {/* Valores do ciclo (Final Ciclo · Projetado · Atual Cal. · Final Cal.) */}
        {cicloRows.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
            {cicloRows.map(r => (
              <div key={r.label}>
                <p className="text-[11px] uppercase tracking-wide text-texto-3">{r.label}</p>
                {loading ? (
                  <SkeletonVal wide />
                ) : (
                  <p className={`text-xl font-extrabold tracking-tight ${r.val >= 0 ? 'text-receita' : 'text-despesa'}`}>
                    {fmtSinal(r.val)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </button>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          iconColor="text-receita"
          label="Receitas do Mês"
          value={income}
          valueColor="text-receita"
          loading={loading}
          deltaAbs={mkDelta(income, prevIncome).abs}
          deltaPct={mkDelta(income, prevIncome).pct}
          goodWhenPositive={true}
          onClick={() => setTxModal({
            title: 'Receitas do Mês',
            total: income,
            color: 'text-receita',
            txs: incomeTxs,
          })}
        />
        <KpiCard
          icon={TrendingDown}
          iconColor="text-despesa"
          label="Despesas do Mês"
          value={expense}
          valueColor="text-despesa"
          loading={loading}
          deltaAbs={mkDelta(expense, prevExpense).abs}
          deltaPct={mkDelta(expense, prevExpense).pct}
          goodWhenPositive={false}
          onClick={() => setTxModal({
            title: 'Despesas do Mês',
            total: expense,
            color: 'text-despesa',
            txs: expenseTxs,
          })}
        />
        <KpiCard
          icon={PiggyBank}
          iconColor={reservaLiquido >= 0 ? 'text-receita' : 'text-despesa'}
          label="Movimento de reservas no ciclo"
          value={reservaLiquido}
          valueColor={reservaLiquido >= 0 ? 'text-receita' : 'text-despesa'}
          loading={loading}
          onClick={() => setTxModal({
            title: 'Reservas',
            total: reservaLiquido,
            color: reservaLiquido >= 0 ? 'text-receita' : 'text-despesa',
            // Líquido = utilizadas (resgates, +) − feitas (depósitos, −).
            txs: [...reservasUtilizadas, ...reservasFeitas],
            mixed: true,
          })}
        />
        <KpiCard
          icon={Wallet}
          iconColor="text-texto-2"
          label="Saldo do Mês"
          value={balance}
          valueColor={balance >= 0 ? 'text-receita' : 'text-despesa'}
          loading={loading}
          deltaAbs={mkDelta(balance, prevBalance).abs}
          deltaPct={mkDelta(balance, prevBalance).pct}
          goodWhenPositive={true}
          onClick={() => setTxModal({
            title: 'Saldo do Mês',
            total: balance,
            color: balance >= 0 ? 'text-receita' : 'text-despesa',
            // Saldo = receitas (+) − despesas (−) do período.
            txs: [...incomeTxs, ...expenseTxs],
            mixed: true,
          })}
        />
        <KpiCard
          icon={PiggyBank}
          iconColor="text-texto-3"
          label="Saldo Total"
          value={totalAssets}
          valueColor="text-texto-1"
          loading={loading}
        />

        {/* Projetado + Final — largura total, abaixo dos 4 KPI cards */}
        {saldoProjetado && (
          <div className="col-span-2 lg:col-span-4 card flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={15} className="text-primary-fg shrink-0" />
                <span className="text-xs uppercase tracking-wide text-texto-2">
                  Projeção até {format(parseISO(periodStr.end), 'dd/MM')}
                </span>
              </div>
              <p className="text-xs text-texto-3 flex flex-wrap items-center gap-x-3 gap-y-1 leading-relaxed">
                <span>Principal <span className="text-texto-2 font-medium">{fmtSinal(saldoPrincipal)}</span></span>
                {saldoProjetado.pendingIncome > 0 && (
                  <span className="flex items-center gap-1 text-receita">
                    <ArrowDownCircle size={10} className="shrink-0" />
                    +{fmt(saldoProjetado.pendingIncome)}
                  </span>
                )}
                {saldoProjetado.pendingExpense > 0 && (
                  <span className="flex items-center gap-1 text-despesa">
                    <ArrowUpCircle size={10} className="shrink-0" />
                    −{fmt(saldoProjetado.pendingExpense)}
                  </span>
                )}
                {saldoProjetado.futureDelta !== 0 && (
                  <span className={`flex items-center gap-1 ${saldoProjetado.futureDelta > 0 ? 'text-receita' : 'text-despesa'}`}>
                    {saldoProjetado.futureDelta > 0 ? '+' : ''}{fmtSinal(saldoProjetado.futureDelta)} lançamentos futuros
                  </span>
                )}
                {saldoProjetado.pendingCount > 0
                  ? <span className="text-texto-3">· {saldoProjetado.pendingCount} agendamento{saldoProjetado.pendingCount !== 1 ? 's' : ''} pendente{saldoProjetado.pendingCount !== 1 ? 's' : ''}</span>
                  : <span className="text-texto-3">· nenhum agendamento pendente no período</span>
                }
              </p>
            </div>
            <div className="shrink-0 text-right space-y-1.5">
              <div>
                <p className="text-xs text-texto-3 mb-0.5">Projetado</p>
                {loading ? (
                  <SkeletonVal wide />
                ) : (
                  <p className={`text-xl font-bold ${projetadoModal >= 0 ? 'text-receita' : 'text-despesa'}`}>
                    {fmtSinal(projetadoModal)}
                  </p>
                )}
              </div>
              {Math.abs(saldoProjetado.final - saldoProjetado.projetado) >= 0.005 && (
                <div>
                  <p className="text-xs text-texto-3 mb-0.5">Final</p>
                  {loading ? (
                    <SkeletonVal />
                  ) : (
                    <p className={`text-base font-bold ${saldoProjetado.final >= 0 ? 'text-receita' : 'text-despesa'}`}>
                      {fmtSinal(saldoProjetado.final)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Envelopes do mês (competência atual, perfil ativo) — some sem envelopes cadastrados */}
      <CardEnvelopesMes onVerEnvelopes={setActivePage ? () => setActivePage('envelopes') : null} />

      {/* Budget progress bar */}
      {income > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-texto-2">Uso da Receita — Mês Atual</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${budgetCls.badge}`}>
              {budgetLabel}
            </span>
          </div>
          <div className="relative h-3 bg-surface-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${budgetCls.barra}`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
            {budgetPct > 100 && (
              <div className="absolute inset-y-0 right-0 w-1 bg-perigo animate-pulse" />
            )}
          </div>
          <div className="flex justify-between text-xs text-texto-3 flex-wrap gap-2">
            <span className="flex items-center gap-1">
              <ArrowDownCircle size={11} className="text-receita" />
              Receitas: <span className="text-receita font-medium ml-1">{fmt(income)}</span>
            </span>
            <span className="flex items-center gap-1">
              <ArrowUpCircle size={11} className="text-despesa" />
              Despesas: <span className="text-despesa font-medium ml-1">{fmt(expense)}</span>
            </span>
            <span className="text-texto-2">
              {budgetPct.toFixed(0)}% usado
              {income - expense > 0 && <span className="ml-2 text-receita">· disponível: {fmt(income - expense)}</span>}
            </span>
          </div>
        </div>
      )}

      {/* 6-month chart + upcoming schedules */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-texto-2 mb-3">Receitas vs Despesas — últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last6Months} barGap={3} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={cor.chartGrade} />
              <XAxis dataKey="label" tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={v => fmt(v)}
                {...estiloTooltip(cor)}
                cursor={{ fill: cor.surface2 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: cor.texto2 }} />
              <Bar dataKey="income" name="Receitas" fill={cor.receita} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Despesas" fill={cor.despesa} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming 7 days */}
        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-texto-2" />
            Próximos Vencimentos
          </h3>
          {upcomingSchedules.length === 0 ? (
            <p className="text-xs text-texto-3 text-center py-6">Nenhum vencimento nos próximos 7 dias</p>
          ) : (
            <div className="space-y-2">
              {upcomingSchedules.map(({ schedule, date, amount }, i) => {
                const isOverdue = date < today
                const daysLeft = differenceInDays(parseISO(date), parseISO(today))
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 ${
                      isOverdue ? 'bg-perigo-bg border border-perigo/30' : 'bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {schedule.transactionType === 'income'
                        ? <ArrowDownCircle size={13} className="text-receita shrink-0" />
                        : <ArrowUpCircle size={13} className="text-despesa shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-xs text-texto-1 font-medium truncate">{schedule.description}</p>
                        <p className={`text-xs ${isOverdue ? 'text-perigo' : 'text-texto-3'}`}>
                          {isOverdue
                            ? `⚠ ${Math.abs(daysLeft)}d em atraso`
                            : daysLeft === 0 ? 'Hoje' : `em ${daysLeft}d · ${fmtDate(date)}`}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${schedule.transactionType === 'income' ? 'text-receita' : 'text-despesa'}`}>
                      {schedule.transactionType === 'income' ? '+' : '−'}{fmt(amount)}
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
            <h3 className="text-sm font-semibold text-texto-2 shrink-0">Maiores Despesas</h3>
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <Segmentado opcoes={MODO_OPTS} valor={modoDespesas} onChange={setModoDespesas} rotulo="Regra do valor" />
              <Segmentado opcoes={PERIOD_OPTS} valor={pieFilter} onChange={setPieFilter} rotulo="Período" />
            </div>
          </div>

          <PizzaDespesas periodo={pieRange} modo={modoDespesas} todas={pizzaTodas} onAlternarTodas={() => setPizzaTodas(t => !t)} />
        </div>

        {/* Right: ranking de categorias com barra (mesmo período e modo da pizza) */}
        <div className="card">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-texto-2 shrink-0">Ranking por Categoria</h3>
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <Segmentado opcoes={MODO_OPTS} valor={modoDespesas} onChange={setModoDespesas} rotulo="Regra do valor" />
              <Segmentado opcoes={PERIOD_OPTS} valor={pieFilter} onChange={setPieFilter} rotulo="Período" />
            </div>
          </div>
          <RankingDespesas periodo={pieRange} modo={modoDespesas} todas={rankingTodas} onAlternarTodas={() => setRankingTodas(t => !t)} />
        </div>
      </div>

      {/* Top 5 Favorecidos — mesmos lançamentos dos KPIs Receitas/Despesas do Mês */}
      <TopFavorecidos receitas={incomeTxs} despesas={expenseTxs} onAbrirLancamentos={setTxModal} />

      {/* Receitas/Despesas do mês drill-down modal */}
      {txModal && (
        <Modal open={!!txModal} onClose={() => setTxModal(null)} title={txModal.title} size="md">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-borda">
              <span className="text-xs text-texto-3 uppercase tracking-wide">
                Total · {txModal.txs.length} lançamento{txModal.txs.length !== 1 ? 's' : ''}
              </span>
              <span className={`text-lg font-bold ${txModal.color}`}>{fmtSinal(txModal.total)}</span>
            </div>
            {txModal.mixed && txModal.txs.length > 0 && (() => {
              const ent = txModal.txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
              const sai = txModal.txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
              return (
                <div className="flex items-center gap-4 text-xs -mt-1">
                  <span className="text-texto-3">Entradas <span className="text-receita font-medium">+{fmt(ent)}</span></span>
                  <span className="text-texto-3">Saídas <span className="text-despesa font-medium">−{fmt(sai)}</span></span>
                </div>
              )
            })()}
            {txModal.txs.length === 0 ? (
              <p className="text-xs text-texto-3 text-center py-6">Nenhum lançamento no período.</p>
            ) : (
              <div className="space-y-0 max-h-96 overflow-y-auto overscroll-contain">
                {[...txModal.txs]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(tx => (
                    <div key={tx.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-borda/50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm text-texto-1 truncate">{tx.description || tx.payee || catLabel(tx.categoryId)}</p>
                        <p className="text-xs text-texto-3 truncate">
                          {fmtDate(tx.date)}
                          {tx.payee && tx.description ? ` · ${tx.payee}` : ''}
                          {` · ${catLabel(tx.categoryId)}`}
                          {` · ${accLabel(tx.accountId)}`}
                        </p>
                      </div>
                      {(() => {
                        const isInc = tx.type === 'income'
                        const rowColor = txModal.mixed ? (isInc ? 'text-receita' : 'text-despesa') : txModal.color
                        const sign = txModal.mixed ? (isInc ? '+' : '−') : ''
                        return <span className={`text-sm font-semibold shrink-0 ${rowColor}`}>{sign}{fmt(tx.amount)}</span>
                      })()}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Accounts grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-texto-2">Contas</h3>
          {totalDebt > 0 && (
            <span className="text-xs text-texto-3 flex items-center gap-1">
              <CreditCard size={11} className="text-texto-3" />
              Dívida cartão: <span className="text-texto-1 font-medium ml-1">{fmt(totalDebt)}</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accountsForView(accounts, isMobile).map(a => {
            // Last activity label for credit cards (current fatura)
            let lastActivityNode = null
            if (a.type === 'credit') {
              const d = lastCreditTxByCard[a.id]
              lastActivityNode = (
                <p className="text-xs text-texto-3 mt-1.5 leading-tight">
                  {d ? `Último lançamento: ${fmtDate(d)}` : 'Sem lançamentos neste mês'}
                </p>
              )
            } else if (a.fluxoCaixaPrincipal) {
              const d = lastTxByFluxoAccount[a.id]
              if (!d) {
                lastActivityNode = <p className="text-xs text-texto-3 mt-1.5 leading-tight">Sem movimentações</p>
              } else {
                const diff = differenceInDays(parseISO(today), parseISO(d))
                const label = diff === 0 ? 'Hoje' : diff === 1 ? 'Ontem' : `Último: ${fmtDate(d)}`
                const cls = diff > 30 ? 'text-aviso' : 'text-texto-3'
                lastActivityNode = <p className={`text-xs mt-1.5 leading-tight ${cls}`}>{diff > 30 ? '⚠ Há mais de 30 dias' : label}</p>
              }
            }

            return (
              <div key={a.id} className="bg-surface-2 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-texto-2 truncate">{a.apelido || a.name}</p>
                  {a.isMain && <span className="text-ambar text-xs shrink-0 ml-1">★</span>}
                </div>
                <p className={`text-sm font-bold ${a.type === 'credit' ? 'text-texto-1' : (a.balance || 0) >= 0 ? 'text-receita' : 'text-despesa'}`}>
                  {a.type === 'credit' ? fmt(creditUsage(a.id)) : fmtSinal(a.balance || 0)}
                </p>
                <p className="text-xs text-texto-3 mt-0.5">{a.type === 'credit' ? 'Dívida' : 'Saldo'}</p>
                {lastActivityNode}
              </div>
            )
          })}
          {accounts.length === 0 && (
            <div className="col-span-4 text-center py-4">
              <p className="text-xs text-texto-3">Nenhuma conta cadastrada</p>
              {pode('contas', 'incluir') && <button onClick={() => setActivePage('accounts')} className="btn-primary mt-2 text-xs">Criar conta</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
