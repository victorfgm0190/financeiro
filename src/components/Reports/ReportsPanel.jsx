import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CreditCard, ArrowLeft, ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, Users, Wallet } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, aplicacaoAccountIds, countsAsReportExpense, countsAsReportIncome } from '../shared/utils'
import RelatorioFatura from '../CreditCard/RelatorioFatura'
import DemonstrativoFinanceiro from './DemonstrativoFinanceiro'
import RelatorioPorFavorecido from './RelatorioPorFavorecido'
import FluxoCaixaPorConta from './FluxoCaixaPorConta'

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#84cc16']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

export default function ReportsPanel() {
  const { profileReportTransactions: transactions, categories, profileAccounts: accounts } = useApp()
  const aplicSet = useMemo(() => aplicacaoAccountIds(accounts), [accounts])
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
        .filter(tx => countsAsReportIncome(tx) && tx.date >= start && tx.date <= end)
        .reduce((s, t) => s + t.amount, 0)
      const expense = transactions
        .filter(tx => countsAsReportExpense(tx, aplicSet) && tx.date >= start && tx.date <= end)
        .reduce((s, t) => s + t.amount, 0)
      months.push({ label, start, end, income, expense, balance: income - expense })
    }
    return months
  }, [transactions, aplicSet])

  const currentMonthData = last6Months[5 - selectedMonth] || last6Months[last6Months.length - 1]

  const categoryData = useMemo(() => {
    if (!currentMonthData) return []
    const totals = {}
    transactions
      .filter(tx => countsAsReportExpense(tx, aplicSet) && tx.date >= currentMonthData.start && tx.date <= currentMonthData.end && tx.categoryId)
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
  }, [transactions, categories, currentMonthData, aplicSet])

  const totalIncome = last6Months.reduce((s, m) => s + m.income, 0) / 6
  const totalExpense = last6Months.reduce((s, m) => s + m.expense, 0) / 6

  if (showRelatorioFatura) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors" onClick={() => setShowRelatorioFatura(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioFatura />
      </div>
    )
  }

  if (showDemonstrativo) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors" onClick={() => setShowDemonstrativo(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <DemonstrativoFinanceiro />
      </div>
    )
  }

  if (showFavorecido) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors" onClick={() => setShowFavorecido(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioPorFavorecido />
      </div>
    )
  }

  if (showFluxoConta) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors" onClick={() => setShowFluxoConta(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <FluxoCaixaPorConta />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        className="w-full card flex items-center gap-3 text-left hover:bg-gray-800 transition-colors group"
        onClick={() => setShowDemonstrativo(true)}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(99,102,241,0.15)' }}>
          <FileSpreadsheet size={16} style={{ color: '#818cf8' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Demonstrativo Financeiro</p>
          <p className="text-xs text-gray-500 mt-0.5">Relatório hierárquico por categoria com filtros de período e exportação CSV</p>
        </div>
        <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-lg">›</span>
      </button>

      <button
        className="w-full card flex items-center gap-3 text-left hover:bg-gray-800 transition-colors group"
        onClick={() => setShowFavorecido(true)}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}>
          <Users size={16} style={{ color: '#60a5fa' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Relatório por Favorecido</p>
          <p className="text-xs text-gray-500 mt-0.5">Análise sintética e analítica por favorecido com exportação CSV</p>
        </div>
        <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-lg">›</span>
      </button>

      <button
        className="w-full card flex items-center gap-3 text-left hover:bg-gray-800 transition-colors group"
        onClick={() => setShowFluxoConta(true)}
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
          <Wallet size={16} style={{ color: '#22c55e' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Fluxo de Caixa por Conta</p>
          <p className="text-xs text-gray-500 mt-0.5">Movimentações e saldo acumulado por conta, grupo ou contas principais — com agendamentos futuros</p>
        </div>
        <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-lg">›</span>
      </button>

      {hasCredit && (
        <button
          className="w-full card flex items-center gap-3 text-left hover:bg-gray-800 transition-colors group"
          onClick={() => setShowRelatorioFatura(true)}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(15,110,86,0.15)' }}>
            <CreditCard size={16} style={{ color: '#0F6E56' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Relatório de Fatura</p>
            <p className="text-xs text-gray-500 mt-0.5">Análise gerencial de faturas do cartão de crédito com exportação CSV</p>
          </div>
          <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-lg">›</span>
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-blue-600">
            <ArrowDownCircle size={14} />
            <p className="text-xs text-gray-400 uppercase tracking-wide">Média Receitas (6m)</p>
          </div>
          <p className="text-xl font-bold text-blue-600">{fmt(totalIncome)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-orange-600">
            <ArrowUpCircle size={14} />
            <p className="text-xs text-gray-400 uppercase tracking-wide">Média Despesas (6m)</p>
          </div>
          <p className="text-xl font-bold text-orange-600">{fmt(totalExpense)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Média Saldo (6m)</p>
          <p className={`text-xl font-bold mt-1 ${totalIncome - totalExpense >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            {fmt(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Evolução dos Últimos 6 Meses</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={last6Months} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            <Bar dataKey="income" name="Receitas" fill="#2563EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="#EA580C" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">Despesas por Categoria</h2>
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
            <p className="text-gray-500 text-sm text-center py-8">Sem dados de despesas neste período</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${percent > 5 ? name : ''}`} labelLine={false}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Ranking de Despesas</h2>
          {categoryData.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Sem dados neste período</p>
          ) : (
            <div className="space-y-2">
              {categoryData.map((item, i) => {
                const total = categoryData.reduce((s, c) => s + c.value, 0)
                const pct = total > 0 ? (item.value / total) * 100 : 0
                return (
                  <div key={item.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300">{item.name}</span>
                      <span className="text-gray-400">{fmt(item.value)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
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
