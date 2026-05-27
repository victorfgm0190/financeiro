import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts'
import { addDays, addWeeks, addMonths, format, parseISO, startOfWeek, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function CashFlowPanel() {
  const { accounts, transactions, schedules, getNextOccurrences } = useApp()
  const [groupBy, setGroupBy] = useState('day')
  const [filterAccount, setFilterAccount] = useState('fluxo')
  const [horizon, setHorizon] = useState(30)

  const mainAccount = accounts.find(a => a.isMain) || accounts[0]

  const filteredAccounts = useMemo(() => {
    if (filterAccount === 'fluxo') {
      const fluxo = accounts.filter(a => a.type !== 'credit' && a.fluxoCaixaPrincipal)
      return fluxo.length > 0 ? fluxo : accounts.filter(a => a.type !== 'credit')
    }
    if (filterAccount === 'main') return mainAccount ? [mainAccount] : accounts.filter(a => a.type !== 'credit')
    if (filterAccount === 'all') return accounts.filter(a => a.type !== 'credit')
    return accounts.filter(a => a.id === filterAccount)
  }, [filterAccount, accounts, mainAccount])

  const accountIds = filteredAccounts.map(a => a.id)

  const data = useMemo(() => {
    const today = new Date()
    const endDate = addDays(today, horizon)
    const days = []
    for (let d = new Date(today); d <= endDate; d = addDays(d, 1)) {
      days.push(format(d, 'yyyy-MM-dd'))
    }

    const dailyFlow = {}
    days.forEach(d => { dailyFlow[d] = 0 })

    transactions
      .filter(tx => accountIds.includes(tx.accountId) || accountIds.includes(tx.toAccountId))
      .filter(tx => tx.date >= format(today, 'yyyy-MM-dd') && tx.date <= format(endDate, 'yyyy-MM-dd'))
      .forEach(tx => {
        if (!dailyFlow[tx.date] !== undefined) dailyFlow[tx.date] = dailyFlow[tx.date] || 0
        if (tx.type === 'income' && accountIds.includes(tx.accountId)) dailyFlow[tx.date] += tx.amount
        if (tx.type === 'expense' && accountIds.includes(tx.accountId)) dailyFlow[tx.date] -= tx.amount
        if (tx.type === 'transfer') {
          if (accountIds.includes(tx.toAccountId)) dailyFlow[tx.date] = (dailyFlow[tx.date] || 0) + tx.amount
          if (accountIds.includes(tx.accountId)) dailyFlow[tx.date] = (dailyFlow[tx.date] || 0) - tx.amount
        }
      })

    schedules.forEach(schedule => {
      if (!accountIds.includes(schedule.accountId) && !accountIds.includes(schedule.toAccountId)) return
      const nexts = getNextOccurrences(schedule, 365)
      nexts.forEach(date => {
        if (date > format(endDate, 'yyyy-MM-dd')) return
        if (!dailyFlow[date] !== undefined) dailyFlow[date] = dailyFlow[date] || 0
        if (schedule.transactionType === 'income') dailyFlow[date] = (dailyFlow[date] || 0) + schedule.amount
        if (schedule.transactionType === 'expense') dailyFlow[date] = (dailyFlow[date] || 0) - schedule.amount
      })
    })

    let runningBalance = filteredAccounts.reduce((s, a) => s + (a.balance || 0), 0)

    const result = days.map(date => {
      runningBalance += (dailyFlow[date] || 0)
      return { date, balance: runningBalance, flow: dailyFlow[date] || 0 }
    })

    if (groupBy === 'day') {
      return result.map(r => ({
        label: r.date.slice(5).split('-').reverse().join('/'),
        balance: Math.round(r.balance * 100) / 100,
        flow: Math.round(r.flow * 100) / 100,
      }))
    }

    if (groupBy === 'week') {
      const weeks = {}
      result.forEach(r => {
        const wk = format(parseISO(r.date), "dd/MM", { locale: ptBR })
        const weekKey = format(startOfWeek(parseISO(r.date), { locale: ptBR }), 'yyyy-MM-dd')
        if (!weeks[weekKey]) weeks[weekKey] = { label: `Sem. ${wk}`, balance: r.balance, flow: 0 }
        weeks[weekKey].flow += r.flow
        weeks[weekKey].balance = r.balance
      })
      return Object.values(weeks)
    }

    const months = {}
    result.forEach(r => {
      const mk = format(parseISO(r.date), 'MMM/yy', { locale: ptBR })
      if (!months[mk]) months[mk] = { label: mk, balance: r.balance, flow: 0 }
      months[mk].flow += r.flow
      months[mk].balance = r.balance
    })
    return Object.values(months)
  }, [transactions, schedules, filteredAccounts, accountIds, getNextOccurrences, groupBy, horizon])

  const currentBalance = filteredAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const finalBalance = data[data.length - 1]?.balance || currentBalance
  const minBalance = Math.min(...data.map(d => d.balance))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Saldo Atual</p>
          <p className={`text-xl font-bold mt-1 ${currentBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(currentBalance)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Projetado ({horizon}d)</p>
          <p className={`text-xl font-bold mt-1 ${finalBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(finalBalance)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Mínimo Projetado</p>
          <p className={`text-xl font-bold mt-1 ${minBalance >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{fmt(minBalance)}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Fluxo de Caixa Projetado</h2>
          <div className="flex gap-2 flex-wrap">
            <select className="input w-auto text-xs py-1.5" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
              <option value="fluxo">Fluxo de Caixa Principal</option>
              <option value="main">Conta Principal</option>
              <option value="all">Todas as Contas</option>
              {accounts.filter(a => a.type !== 'credit').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="input w-auto text-xs py-1.5" value={String(horizon)} onChange={e => setHorizon(Number(e.target.value))}>
              <option value="30">30 dias</option>
              <option value="60">60 dias</option>
              <option value="90">90 dias</option>
              <option value="180">180 dias</option>
            </select>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {[['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']].map(([v, l]) => (
                <button key={v} onClick={() => setGroupBy(v)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${groupBy === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.floor(data.length / 8)} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="balance" name="Saldo" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="flow" name="Fluxo" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
