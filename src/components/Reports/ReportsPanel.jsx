import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

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
  const { transactions, categories } = useApp()
  const [selectedMonth, setSelectedMonth] = useState(0)

  const last6Months = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const start = startOfMonth(d).toISOString().split('T')[0]
      const end = endOfMonth(d).toISOString().split('T')[0]
      const label = format(d, 'MMM/yy', { locale: ptBR })
      const income = transactions
        .filter(tx => tx.type === 'income' && tx.date >= start && tx.date <= end)
        .reduce((s, t) => s + t.amount, 0)
      const expense = transactions
        .filter(tx => tx.type === 'expense' && tx.date >= start && tx.date <= end)
        .reduce((s, t) => s + t.amount, 0)
      months.push({ label, start, end, income, expense, balance: income - expense })
    }
    return months
  }, [transactions])

  const currentMonthData = last6Months[5 - selectedMonth] || last6Months[last6Months.length - 1]

  const categoryData = useMemo(() => {
    if (!currentMonthData) return []
    const totals = {}
    transactions
      .filter(tx => tx.type === 'expense' && tx.date >= currentMonthData.start && tx.date <= currentMonthData.end && tx.categoryId)
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
  }, [transactions, categories, currentMonthData])

  const totalIncome = last6Months.reduce((s, m) => s + m.income, 0) / 6
  const totalExpense = last6Months.reduce((s, m) => s + m.expense, 0) / 6

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Média Receitas (6m)</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{fmt(totalIncome)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Média Despesas (6m)</p>
          <p className="text-xl font-bold text-red-400 mt-1">{fmt(totalExpense)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Média Saldo (6m)</p>
          <p className={`text-xl font-bold mt-1 ${totalIncome - totalExpense >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
            <Bar dataKey="income" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
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
