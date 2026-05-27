import { useMemo } from 'react'
import { ArrowUpCircle, ArrowDownCircle, Wallet, CreditCard, TrendingUp, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { differenceInDays } from 'date-fns'

export default function DashboardPanel({ setActivePage }) {
  const { accounts, transactions, schedules, categories, budgets, getFinancialPeriod, getNextOccurrences } = useApp()

  const period = getFinancialPeriod()
  const periodStr = {
    start: period.start.toISOString().split('T')[0],
    end: period.end.toISOString().split('T')[0],
  }

  const periodTxs = transactions.filter(tx => tx.date >= periodStr.start && tx.date <= periodStr.end)
  const income = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expense

  const totalAssets = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)
  const totalDebt = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + (a.creditDebt || 0), 0)

  const last3Months = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => {
      const d = subMonths(new Date(), 2 - i)
      const start = startOfMonth(d).toISOString().split('T')[0]
      const end = endOfMonth(d).toISOString().split('T')[0]
      const label = format(d, 'MMM', { locale: ptBR })
      const inc = transactions.filter(tx => tx.type === 'income' && tx.date >= start && tx.date <= end).reduce((s, t) => s + t.amount, 0)
      const exp = transactions.filter(tx => tx.type === 'expense' && tx.date >= start && tx.date <= end).reduce((s, t) => s + t.amount, 0)
      return { label, income: inc, expense: exp }
    })
  }, [transactions])

  const upcomingSchedules = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const upcoming = []
    schedules.forEach(s => {
      const nexts = getNextOccurrences(s, 3)
      nexts.forEach(date => {
        if (date >= today && date <= in7days) upcoming.push({ schedule: s, date })
      })
    })
    return upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [schedules, getNextOccurrences])

  const creditAlerts = useMemo(() => {
    const today = new Date()
    return accounts.filter(a => a.type === 'credit').filter(a => {
      let dueDate = new Date(today.getFullYear(), today.getMonth(), a.dueDay || 10)
      if (dueDate < today) dueDate = new Date(today.getFullYear(), today.getMonth() + 1, a.dueDay || 10)
      return differenceInDays(dueDate, today) <= 5
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

  const recentTxs = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt || ''))
    .slice(0, 5)

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <Wallet size={14} />
            <span className="text-xs uppercase tracking-wide">Em Contas</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">{fmt(totalAssets)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <CreditCard size={14} />
            <span className="text-xs uppercase tracking-wide">Dívida Cartão</span>
          </div>
          <p className="text-xl font-bold text-red-400">{fmt(totalDebt)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <ArrowUpCircle size={14} />
            <span className="text-xs uppercase tracking-wide">Receitas Mês</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">{fmt(income)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2 text-gray-400">
            <ArrowDownCircle size={14} />
            <span className="text-xs uppercase tracking-wide">Despesas Mês</span>
          </div>
          <p className="text-xl font-bold text-red-400">{fmt(expense)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Receitas vs Despesas (últimos 3 meses)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={last3Months} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="income" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Agendamentos (7 dias)</h3>
          {upcomingSchedules.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Nenhum agendamento próximo</p>
          ) : (
            <div className="space-y-2">
              {upcomingSchedules.map(({ schedule, date }, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="text-gray-300 font-medium">{schedule.description}</p>
                    <p className="text-gray-500">{fmtDate(date)}</p>
                  </div>
                  <span className={`font-bold ${schedule.transactionType === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmt(schedule.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Últimos Lançamentos</h3>
          {recentTxs.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Nenhum lançamento registrado</p>
          ) : (
            <div className="space-y-2">
              {recentTxs.map(tx => {
                const cat = categories.find(c => c.id === tx.categoryId)
                return (
                  <div key={tx.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{cat?.icon || (tx.type === 'income' ? '💚' : tx.type === 'transfer' ? '🔄' : '💸')}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-300 font-medium truncate">{tx.description || cat?.name || tx.type}</p>
                        <p className="text-xs text-gray-500">{fmtDate(tx.date)}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'transfer' ? 'text-blue-400' : 'text-red-400'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Top Despesas por Categoria</h3>
          {topExpenses.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Sem despesas no período atual</p>
          ) : (
            <div className="space-y-2">
              {topExpenses.map(({ cat, amt }) => {
                const pct = expense > 0 ? (amt / expense) * 100 : 0
                return (
                  <div key={cat.id}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-300">{cat.icon} {cat.name}</span>
                      <span className="text-gray-400">{fmt(amt)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: cat.color || '#6366f1' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Contas</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accounts.map(a => (
            <div key={a.id} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400 truncate">{a.name}</p>
                {a.isMain && <span className="text-yellow-400 text-xs">★</span>}
              </div>
              <p className={`text-sm font-bold ${a.type === 'credit' ? 'text-purple-400' : (a.balance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {a.type === 'credit' ? fmt(a.creditDebt || 0) : fmt(a.balance || 0)}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{a.type === 'credit' ? 'Dívida' : 'Saldo'}</p>
            </div>
          ))}
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
