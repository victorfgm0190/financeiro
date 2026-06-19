import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { addDays, format } from 'date-fns'
import { ArrowDownCircle, ArrowUpCircle, Wallet, AlertTriangle, Calendar } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, accountsForView } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { useIsMobile } from '../../hooks/useIsMobile'
import { getEnvelopePeriod } from '../Envelopes/EnvelopesPanel'

// Modos de seleção de contas — mesmo padrão dos Relatórios (FluxoCaixaPorConta).
const VISOES = [
  { id: 'conta',      label: 'Por Contas' },
  { id: 'grupo',      label: 'Por Grupos' },
  { id: 'principais', label: 'Por Principais' },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function CashFlowPanel({ setActivePage }) {
  const { profileAccounts, profileTransactions, profileSchedules, schedules: allSchedules, getNextOccurrences, envelopes, accountGroups } = useApp()
  const accounts = profileAccounts
  const isMobile = useIsMobile()
  const transactions = profileTransactions
  const schedules = profileSchedules
  // visao: 'conta' (select atual) | 'grupo' (grupo de contas) | 'principais' (FC Principal)
  const [visao, setVisao] = useState('conta')
  const [groupId, setGroupId] = useState('')
  const [filterAccount, setFilterAccount] = useState('fluxo')
  const [horizon, setHorizon] = useState(30)

  const fcAccounts = accounts.filter(a => a.type !== 'credit' && a.fluxoCaixaPrincipal)
  const noFcAccounts = fcAccounts.length === 0

  // Grupos de contas disponíveis (mesma ordem/filtro dos Relatórios).
  const groups = useMemo(
    () => [...(accountGroups || [])].filter(g => !g.inibido).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountGroups],
  )

  // Resolve a lista de contas conforme o modo. O engine (chart/tabela) só recebe os IDs
  // resolvidos — a mudança de modo é só na camada de seleção.
  const filteredAccounts = useMemo(() => {
    if (visao === 'grupo') return accounts.filter(a => a.type !== 'credit' && a.accountGroupId === groupId)
    if (visao === 'principais') return fcAccounts
    if (filterAccount === 'fluxo') return fcAccounts
    if (filterAccount === 'all') return accounts.filter(a => a.type !== 'credit')
    return accounts.filter(a => a.id === filterAccount)
  }, [visao, groupId, filterAccount, accounts, fcAccounts])

  const accountIds = filteredAccounts.map(a => a.id)
  const currentBalance = filteredAccounts.reduce((s, a) => s + (a.balance || 0), 0)

  // Chart data: daily balance projection from today
  const chartData = useMemo(() => {
    if (accountIds.length === 0) return []
    const today = new Date()
    const endDate = addDays(today, horizon)
    const endDateStr = format(endDate, 'yyyy-MM-dd')
    const days = []
    for (let d = new Date(today); d <= endDate; d = addDays(d, 1)) {
      days.push(format(d, 'yyyy-MM-dd'))
    }

    const dailyFlow = {}
    days.forEach(d => { dailyFlow[d] = 0 })

    // Future-dated actual transactions
    const todayStr = format(today, 'yyyy-MM-dd')
    transactions
      .filter(tx => tx.date > todayStr && tx.date <= endDateStr)
      .filter(tx => accountIds.includes(tx.accountId) || accountIds.includes(tx.toAccountId))
      .forEach(tx => {
        if (tx.type === 'income' && accountIds.includes(tx.accountId)) dailyFlow[tx.date] = (dailyFlow[tx.date] || 0) + tx.amount
        if (tx.type === 'expense' && accountIds.includes(tx.accountId)) dailyFlow[tx.date] = (dailyFlow[tx.date] || 0) - tx.amount
        if (tx.type === 'transfer') {
          if (accountIds.includes(tx.toAccountId) && !accountIds.includes(tx.accountId)) dailyFlow[tx.date] = (dailyFlow[tx.date] || 0) + tx.amount
          else if (accountIds.includes(tx.accountId) && !accountIds.includes(tx.toAccountId)) dailyFlow[tx.date] = (dailyFlow[tx.date] || 0) - tx.amount
        }
      })

    // Scheduled future occurrences
    schedules.forEach(s => {
      if (!accountIds.includes(s.accountId) && !accountIds.includes(s.toAccountId)) return
      getNextOccurrences(s, 365).forEach(origDate => {
        // Valor/data EFETIVOS da ocorrência (respeita overrides individuais).
        const { date, amount } = occEfetiva(s, origDate)
        if (date < todayStr || date > endDateStr) return
        if (s.transactionType === 'income' && accountIds.includes(s.accountId)) dailyFlow[date] = (dailyFlow[date] || 0) + amount
        if (s.transactionType === 'expense' && accountIds.includes(s.accountId)) dailyFlow[date] = (dailyFlow[date] || 0) - amount
        if (s.transactionType === 'transfer') {
          if (accountIds.includes(s.toAccountId) && !accountIds.includes(s.accountId)) dailyFlow[date] = (dailyFlow[date] || 0) + amount
          else if (accountIds.includes(s.accountId) && !accountIds.includes(s.toAccountId)) dailyFlow[date] = (dailyFlow[date] || 0) - amount
        }
      })
    })

    // Envelope projected outflow on due date
    envelopes.forEach(env => {
      if (!accountIds.includes(env.accountId)) return
      const period = getEnvelopePeriod(env.dueDay)
      if (period.to < todayStr || period.to > endDateStr) return
      const spent = transactions
        .filter(tx => tx.type === 'expense' && env.categoryIds.includes(tx.categoryId) && tx.date >= period.from && tx.date <= period.to)
        .reduce((s, t) => s + t.amount, 0)
      const remaining = env.limitAmount - spent
      const outflow = remaining > 0 ? remaining : spent
      if (outflow > 0) dailyFlow[period.to] = (dailyFlow[period.to] || 0) - outflow
    })

    let balance = currentBalance
    return days.map(date => ({
      label: date.slice(5).split('-').reverse().join('/'),
      balance: Math.round((balance += (dailyFlow[date] || 0)) * 100) / 100,
    }))
  }, [transactions, schedules, accountIds, currentBalance, getNextOccurrences, horizon])

  // Table rows: scheduled + future-dated actual, with running balance
  const tableRows = useMemo(() => {
    if (accountIds.length === 0) return []
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const endDateStr = format(addDays(new Date(), horizon), 'yyyy-MM-dd')
    const selectedAcc = visao === 'conta' ? accounts.find(a => a.id === filterAccount) : null
    const shouldNetize = selectedAcc?.contaAplicacao === true
    const events = []

    // Future-dated actual transactions
    transactions
      .filter(tx => tx.date > todayStr && tx.date <= endDateStr)
      .filter(tx => accountIds.includes(tx.accountId) || accountIds.includes(tx.toAccountId))
      .forEach(tx => {
        let entrada = 0, saida = 0
        if (tx.type === 'income' && accountIds.includes(tx.accountId)) entrada = tx.amount
        if (tx.type === 'expense' && accountIds.includes(tx.accountId)) saida = tx.amount
        if (tx.type === 'transfer') {
          if (accountIds.includes(tx.toAccountId) && !accountIds.includes(tx.accountId)) entrada = tx.amount
          else if (accountIds.includes(tx.accountId) && !accountIds.includes(tx.toAccountId)) saida = tx.amount
        }
        if (entrada === 0 && saida === 0) return
        events.push({
          date: tx.date, description: tx.description || 'Lançamento', entrada, saida, scheduled: false,
          isTransfer: tx.type === 'transfer', fromAccountId: tx.accountId, toAccountId: tx.toAccountId,
          _key: tx.id,
        })
      })

    // Scheduled future occurrences
    schedules.forEach(s => {
      if (!accountIds.includes(s.accountId) && !accountIds.includes(s.toAccountId)) return
      getNextOccurrences(s, 365).forEach(origDate => {
        // Valor/data EFETIVOS da ocorrência (respeita overrides individuais).
        const { date, amount } = occEfetiva(s, origDate)
        if (date < todayStr || date > endDateStr) return
        let entrada = 0, saida = 0
        if (s.transactionType === 'income' && accountIds.includes(s.accountId)) entrada = amount
        if (s.transactionType === 'expense' && accountIds.includes(s.accountId)) saida = amount
        if (s.transactionType === 'transfer') {
          if (accountIds.includes(s.toAccountId) && !accountIds.includes(s.accountId)) entrada = amount
          else if (accountIds.includes(s.accountId) && !accountIds.includes(s.toAccountId)) saida = amount
        }
        if (entrada === 0 && saida === 0) return
        events.push({
          date, description: s.description, entrada, saida, scheduled: true,
          isTransfer: s.transactionType === 'transfer', fromAccountId: s.accountId, toAccountId: s.toAccountId,
          _key: s.id + '_' + origDate,
        })
      })
    })

    // Envelope projected entries
    envelopes.forEach(env => {
      if (!accountIds.includes(env.accountId)) return
      const period = getEnvelopePeriod(env.dueDay)
      if (period.to < todayStr || period.to > endDateStr) return
      const spent = transactions
        .filter(tx => tx.type === 'expense' && env.categoryIds.includes(tx.categoryId) && tx.date >= period.from && tx.date <= period.to)
        .reduce((s, t) => s + t.amount, 0)
      const remaining = env.limitAmount - spent
      const saida = remaining > 0 ? remaining : spent
      if (saida <= 0) return
      const label = remaining > 0
        ? `Envelope ${env.name} (restante ${fmt(remaining)} de ${fmt(env.limitAmount)})`
        : `Envelope ${env.name} (excedido — gasto ${fmt(spent)})`
      events.push({
        date: period.to, description: label, entrada: 0, saida, scheduled: true,
        isTransfer: false, isEnvelope: true, _key: 'env_' + env.id,
      })
    })

    events.sort((a, b) => a.date.localeCompare(b.date) || (a.scheduled ? 1 : -1))

    let finalEvents = events
    if (shouldNetize) {
      const processed = new Set()
      const netized = []
      events.forEach(ev => {
        if (processed.has(ev._key)) return
        if (ev.isTransfer) {
          const opposing = events.find(o =>
            !processed.has(o._key) && o._key !== ev._key &&
            o.isTransfer && o.date === ev.date &&
            o.fromAccountId === ev.toAccountId && o.toAccountId === ev.fromAccountId
          )
          if (opposing) {
            processed.add(ev._key)
            processed.add(opposing._key)
            const net = Math.round(((ev.entrada - ev.saida) + (opposing.entrada - opposing.saida)) * 100) / 100
            netized.push({
              date: ev.date, description: 'Transf. líquida',
              entrada: net > 0 ? net : 0, saida: net < 0 ? -net : 0,
              scheduled: ev.scheduled && opposing.scheduled, isNetized: true, _key: ev._key + '_net',
            })
            return
          }
        }
        processed.add(ev._key)
        netized.push(ev)
      })
      finalEvents = netized
    }

    let balance = currentBalance
    return finalEvents.map(ev => {
      balance = Math.round((balance + ev.entrada - ev.saida) * 100) / 100
      return { ...ev, saldo: balance }
    })
  }, [transactions, schedules, accounts, accountIds, currentBalance, getNextOccurrences, horizon, filterAccount, visao])

  const finalBalance = chartData[chartData.length - 1]?.balance ?? currentBalance
  const minBalance = chartData.length > 0 ? Math.min(...chartData.map(d => d.balance)) : currentBalance
  const activeAccounts = filteredAccounts
  // Aviso "sem conta FC" aparece quando o modo resolve para FC Principal e não há nenhuma.
  const showFcWarning = noFcAccounts && (visao === 'principais' || (visao === 'conta' && filterAccount === 'fluxo'))

  return (
    <div className="space-y-4">
      {/* FC accounts chips or warning */}
      {showFcWarning ? (
        <div className="card border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">Nenhuma conta marcada como Fluxo de Caixa Principal</p>
            <p className="text-xs text-amber-500 mt-0.5">
              Ative a flag <span className="font-semibold">Fluxo de Caixa Principal</span> em pelo menos uma conta corrente ou poupança.
            </p>
          </div>
          {setActivePage && (
            <button
              onClick={() => setActivePage('accounts')}
              className="text-xs text-amber-400 hover:text-amber-300 shrink-0 font-medium transition-colors"
            >
              Ir para Contas →
            </button>
          )}
        </div>
      ) : (
        <div className="card flex items-center gap-3 flex-wrap py-3">
          <Wallet size={14} className="text-gray-400 shrink-0" />
          <span className="text-xs text-gray-500 uppercase tracking-wide">Contas no fluxo:</span>
          {activeAccounts.map(a => (
            <span key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 text-xs text-gray-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              {a.apelido || a.name}
              <span className="text-gray-500">{fmt(a.balance || 0)}</span>
            </span>
          ))}
          {activeAccounts.length === 0 && (
            <span className="text-xs text-gray-500">Nenhuma conta selecionada</span>
          )}
        </div>
      )}

      {/* KPI cards — fixos no topo ao rolar apenas no desktop (md+) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:sticky md:top-0 md:z-20 md:bg-gray-950 md:py-2 md:-my-2">
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-gray-400">
            <Wallet size={14} />
            <p className="text-xs text-gray-400 uppercase tracking-wide">Saldo Principal</p>
          </div>
          <p className={`text-xl font-bold ${currentBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(currentBalance)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Projetado ({horizon}d)</p>
          <p className={`text-xl font-bold mt-1 ${finalBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(finalBalance)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Mínimo Projetado</p>
          <p className={`text-xl font-bold mt-1 ${minBalance >= 0 ? 'text-amber-400' : 'text-orange-600'}`}>{fmt(minBalance)}</p>
        </div>
      </div>

      {/* Chart + controls */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Projeção de Saldo — dia a dia</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Modo de seleção de contas (Por Contas / Por Grupos / Por Principais) */}
            <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1">
              {VISOES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setVisao(v.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    visao === v.id ? 'bg-[#0F6E56] text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {visao === 'conta' && (
              <select className="input w-auto text-xs py-1.5" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
                <option value="fluxo">FC Principal</option>
                <option value="all">Todas as Contas</option>
                {accountsForView(accounts.filter(a => a.type !== 'credit'), isMobile).map(a => (
                  <option key={a.id} value={a.id}>{a.apelido || a.name}</option>
                ))}
              </select>
            )}
            {visao === 'grupo' && (
              <select className="input w-auto text-xs py-1.5" value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">Selecione o grupo...</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            {visao === 'principais' && (
              <span className="text-xs text-gray-500 px-1 self-center">
                FC Principal: {filteredAccounts.length} conta{filteredAccounts.length !== 1 ? 's' : ''}
              </span>
            )}
            <select className="input w-auto text-xs py-1.5" value={String(horizon)} onChange={e => setHorizon(Number(e.target.value))}>
              <option value="30">30 dias</option>
              <option value="60">60 dias</option>
              <option value="90">90 dias</option>
              <option value="180">180 dias</option>
            </select>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-gray-500 text-sm">Sem dados para projetar</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(1, Math.floor(chartData.length / 8))}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#EA580C" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Line
                type="monotone"
                dataKey="balance"
                name="Saldo"
                stroke="#2563EB"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Projection table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-300">Eventos Projetados</h2>
          <span className="text-xs text-gray-500 ml-auto">{tableRows.length} evento{tableRows.length !== 1 ? 's' : ''}</span>
        </div>

        {tableRows.length === 0 ? (
          <div className="text-center py-10">
            <Calendar size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhum evento agendado nos próximos {horizon} dias</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Starting balance row */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium w-28">Data</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                  <th className="text-right px-4 py-2.5 text-xs text-blue-600 font-medium w-32">
                    <span className="flex items-center justify-end gap-1"><ArrowDownCircle size={11} /> Entrada</span>
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs text-orange-600 font-medium w-32">
                    <span className="flex items-center justify-end gap-1"><ArrowUpCircle size={11} /> Saída</span>
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium w-36">Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {/* Starting balance row */}
                <tr className="border-b border-gray-800/50 bg-gray-800/20">
                  <td className="px-4 py-2 text-xs text-gray-500">Hoje</td>
                  <td className="px-4 py-2 text-xs text-gray-400 italic">Saldo atual</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className={`px-4 py-2 text-right text-xs font-bold ${currentBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                    {fmt(currentBalance)}
                  </td>
                </tr>
                {tableRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-800/50 transition-colors ${
                      row.scheduled
                        ? 'hover:bg-gray-800/20'
                        : 'bg-indigo-500/5 hover:bg-indigo-500/10'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {row.entrada > 0
                          ? <ArrowDownCircle size={12} className="text-blue-600 shrink-0" />
                          : <ArrowUpCircle size={12} className="text-orange-600 shrink-0" />
                        }
                        <span className="text-gray-200 text-xs truncate max-w-xs">{row.description}</span>
                        {!row.scheduled && !row.isNetized && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 shrink-0">lançamento</span>
                        )}
                        {row.isNetized && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-receita/20 text-receita shrink-0">líquido</span>
                        )}
                        {row.isEnvelope && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">envelope</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-blue-600 whitespace-nowrap">
                      {row.entrada > 0 ? fmt(row.entrada) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-orange-600 whitespace-nowrap">
                      {row.saida > 0 ? fmt(row.saida) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-xs font-bold whitespace-nowrap ${row.saldo >= 0 ? 'text-gray-300' : 'text-orange-600'}`}>
                      {fmt(row.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
