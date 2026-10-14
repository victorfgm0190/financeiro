import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CreditCard, ArrowLeft, ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, Users, Wallet } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal, aplicacaoAccountIds, countsAsReportExpense, countsAsReportIncome, reservaDespesaFuncIds } from '../shared/utils'
import RelatorioFatura from '../CreditCard/RelatorioFatura'
import DemonstrativoFinanceiro from './DemonstrativoFinanceiro'
import RelatorioPorFavorecido from './RelatorioPorFavorecido'
import FluxoCaixaPorConta from './FluxoCaixaPorConta'
import { useThemeColors } from '../../hooks/useTheme'
import { useIsMobile } from '../../hooks/useIsMobile'
import { corSerie, estiloTooltip } from '../../lib/chartPalette'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-borda-forte rounded-lg p-3 text-xs shadow-xl">
      <p className="text-texto-2 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

export default function ReportsPanel() {
  const { profileReportTransactions: transactions, categories, profileAccounts: accounts, reserveFunctions } = useApp()
  const cor = useThemeColors()
  const isMobile = useIsMobile()
  const aplicSet = useMemo(() => aplicacaoAccountIds(accounts), [accounts])
  // Depósitos em reserva de funções "exibir como despesa" contam como despesa nos relatórios.
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const reservaDespesaFuncSet = useMemo(() => reservaDespesaFuncIds(reserveFunctions), [reserveFunctions])
  const [selectedMonth, setSelectedMonth] = useState(0)
  const [showRelatorioFatura, setShowRelatorioFatura] = useState(false)
  const [showDemonstrativo, setShowDemonstrativo] = useState(false)
  const [showFavorecido, setShowFavorecido] = useState(false)
  const [showFluxoConta, setShowFluxoConta] = useState(false)

  const hasCredit = accounts.some(a => a.type === 'credit')

  const last6Months = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const start = startOfMonth(d).toISOString().split('T')[0]
      const end = endOfMonth(d).toISOString().split('T')[0]
      const label = format(d, 'MMM/yy', { locale: ptBR })
      const income = transactions
        .filter(tx => countsAsReportIncome(tx, reservaDespesaFuncSet, reservaSet) && tx.date >= start && tx.date <= end)
        .reduce((s, t) => s + t.amount, 0)
      const expense = transactions
        .filter(tx => countsAsReportExpense(tx, aplicSet, reservaDespesaFuncSet, reservaSet) && tx.date >= start && tx.date <= end)
        .reduce((s, t) => s + t.amount, 0)
      months.push({ label, start, end, income, expense, balance: income - expense })
    }
    return months
  }, [transactions, aplicSet, reservaDespesaFuncSet, reservaSet])

  const currentMonthData = last6Months[5 - selectedMonth] || last6Months[last6Months.length - 1]

  const categoryData = useMemo(() => {
    if (!currentMonthData) return []
    const totals = {}
    transactions
      .filter(tx => countsAsReportExpense(tx, aplicSet, reservaDespesaFuncSet, reservaSet) && tx.date >= currentMonthData.start && tx.date <= currentMonthData.end && tx.categoryId)
      .forEach(tx => {
        totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount
      })
    return Object.entries(totals)
      .map(([id, value]) => {
        const cat = categories.find(c => c.id === id)
        return { name: cat ? `${cat.icon} ${cat.name}` : id, value }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [transactions, categories, currentMonthData, aplicSet, reservaDespesaFuncSet, reservaSet])

  const totalIncome = last6Months.reduce((s, m) => s + m.income, 0) / 6
  const totalExpense = last6Months.reduce((s, m) => s + m.expense, 0) / 6

  if (showRelatorioFatura) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowRelatorioFatura(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioFatura />
      </div>
    )
  }

  if (showDemonstrativo) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowDemonstrativo(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <DemonstrativoFinanceiro />
      </div>
    )
  }

  if (showFavorecido) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowFavorecido(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioPorFavorecido />
      </div>
    )
  }

  if (showFluxoConta) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowFluxoConta(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <FluxoCaixaPorConta />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        className="w-full card flex items-center gap-3 text-left hover:bg-surface-hover transition-colors group"
        onClick={() => setShowDemonstrativo(true)}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/15">
          <FileSpreadsheet size={16} className="text-primary-fg" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-texto-1 group-hover:text-texto-1 transition-colors">Demonstrativo Financeiro</p>
          <p className="text-xs text-texto-3 mt-0.5">Relatório hierárquico por categoria com filtros de período e exportação CSV</p>
        </div>
        <span className="text-texto-3 group-hover:text-texto-2 transition-colors text-lg">›</span>
      </button>

      <button
        className="w-full card flex items-center gap-3 text-left hover:bg-surface-hover transition-colors group"
        onClick={() => setShowFavorecido(true)}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/15">
          <Users size={16} className="text-primary-fg" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-texto-1 group-hover:text-texto-1 transition-colors">Relatório por Favorecido</p>
          <p className="text-xs text-texto-3 mt-0.5">Análise sintética e analítica por favorecido com exportação CSV</p>
        </div>
        <span className="text-texto-3 group-hover:text-texto-2 transition-colors text-lg">›</span>
      </button>

      <button
        className="w-full card flex items-center gap-3 text-left hover:bg-surface-hover transition-colors group"
        onClick={() => setShowFluxoConta(true)}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/15">
          <Wallet size={16} className="text-primary-fg" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-texto-1 group-hover:text-texto-1 transition-colors">Fluxo de Caixa por Conta</p>
          <p className="text-xs text-texto-3 mt-0.5">Movimentações e saldo acumulado por conta, grupo ou contas principais — com agendamentos futuros</p>
        </div>
        <span className="text-texto-3 group-hover:text-texto-2 transition-colors text-lg">›</span>
      </button>

      {hasCredit && (
        <button
          className="w-full card flex items-center gap-3 text-left hover:bg-surface-hover transition-colors group"
          onClick={() => setShowRelatorioFatura(true)}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/15">
            <CreditCard size={16} className="text-primary-fg" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-texto-1 group-hover:text-texto-1 transition-colors">Relatório de Fatura</p>
            <p className="text-xs text-texto-3 mt-0.5">Análise gerencial de faturas do cartão de crédito com exportação CSV</p>
          </div>
          <span className="text-texto-3 group-hover:text-texto-2 transition-colors text-lg">›</span>
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-receita">
            <ArrowDownCircle size={14} />
            <p className="text-xs text-texto-2 uppercase tracking-wide">Média Receitas (6m)</p>
          </div>
          <p className="text-xl font-bold text-receita">{fmt(totalIncome)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-despesa">
            <ArrowUpCircle size={14} />
            <p className="text-xs text-texto-2 uppercase tracking-wide">Média Despesas (6m)</p>
          </div>
          <p className="text-xl font-bold text-despesa">{fmt(totalExpense)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-texto-2 uppercase tracking-wide">Média Saldo (6m)</p>
          <p className={`text-xl font-bold mt-1 ${totalIncome - totalExpense >= 0 ? 'text-receita' : 'text-despesa'}`}>
            {fmtSinal(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-texto-2 mb-4">Evolução dos Últimos 6 Meses</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={last6Months} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={cor.chartGrade} />
            <XAxis dataKey="label" tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: cor.surface2 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: cor.texto2 }} />
            <Bar dataKey="income" name="Receitas" fill={cor.receita} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill={cor.despesa} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-texto-2">Despesas por Categoria</h2>
            <select
              className="input w-auto text-xs py-1.5"
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
            >
              {last6Months.map((m, i) => (
                <option key={m.label} value={5 - i}>{m.label}</option>
              ))}
            </select>
          </div>
          {categoryData.length === 0 ? (
            <p className="text-texto-3 text-sm text-center py-8">Sem dados de despesas neste período</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent, x, y, textAnchor }) => (percent > 0.05
                  ? <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill={cor.texto2} fontSize={11}>{isMobile ? '' : `${name} `}{(percent * 100).toFixed(0)}%</text>
                  : null)} labelLine={false}>
                  {categoryData.map((_, i) => <Cell key={i} fill={corSerie(cor.tema, i)} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} {...estiloTooltip(cor)} itemStyle={{ color: cor.texto1 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-texto-2 mb-4">Ranking de Despesas</h2>
          {categoryData.length === 0 ? (
            <p className="text-texto-3 text-sm text-center py-8">Sem dados neste período</p>
          ) : (
            <div className="space-y-2">
              {categoryData.map((item, i) => {
                const total = categoryData.reduce((s, c) => s + c.value, 0)
                const pct = total > 0 ? (item.value / total) * 100 : 0
                return (
                  <div key={item.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-texto-2">{item.name}</span>
                      <span className="text-texto-2">{fmt(item.value)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: corSerie(cor.tema, i) }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
