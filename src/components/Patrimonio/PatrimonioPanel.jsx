import { useMemo, useState } from 'react'
import { format, subMonths, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Home, Car, AlertTriangle, TrendingUp, Landmark, RefreshCw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import Modal from '../shared/Modal'

function UpdateValueModal({ account, onClose }) {
  const { updateAccountValue } = useApp()
  const [newValue, setNewValue] = useState(String(account.balance ?? ''))
  const [note, setNote] = useState('')
  const lastEntry = (account.valueHistory || []).slice(-1)[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newValue === '') return
    updateAccountValue(account.id, Number(newValue), note)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {lastEntry && (
        <div className="p-3 bg-gray-800 rounded-lg text-xs text-gray-400">
          Último valor: <span className="text-gray-200 font-medium">{fmt(lastEntry.value)}</span> em {lastEntry.date}
          {lastEntry.note && <span className="ml-1 italic">— {lastEntry.note}</span>}
        </div>
      )}
      <div>
        <label className="label">Novo Valor (R$) *</label>
        <input
          className="input"
          type="number"
          step="0.01"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="0,00"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label">Observação</label>
        <input
          className="input"
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ex: Avaliação de mercado, tabela FIPE..."
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">Atualizar</button>
      </div>
    </form>
  )
}

function ValueHistoryList({ account }) {
  const history = [...(account.valueHistory || [])].sort((a, b) => b.date.localeCompare(a.date))
  if (history.length === 0) return <p className="text-xs text-gray-600 py-2">Sem histórico de atualizações.</p>
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {history.map((h, i) => (
        <div key={h.id || i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800 last:border-0">
          <span className="text-gray-500">{h.date}</span>
          <span className="text-gray-200 font-medium">{fmt(h.value)}</span>
          {h.note && <span className="text-gray-600 italic truncate max-w-[120px]">{h.note}</span>}
        </div>
      ))}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="text-receita font-bold">{fmt(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

export default function PatrimonioPanel() {
  const { profileAccounts: accounts, accountGroups } = useApp()
  const [updateValueAccount, setUpdateValueAccount] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(null)

  // Categorize accounts by group behavior / type
  const categorized = useMemo(() => {
    const bens = []
    const dividas = []
    const emprestimos = []
    const investimentos = []
    const contas = []
    const cartoes = []

    for (const a of accounts) {
      const group = accountGroups.find(g => g.id === a.accountGroupId)
      if (group?.type === 'patrimonial') {
        if (group.behavior === 'divida') dividas.push(a)
        else if (group.behavior === 'emprestimo') emprestimos.push(a)
        else bens.push(a)
      } else if (a.type === 'asset') {
        bens.push(a)
      } else if (a.type === 'liability') {
        dividas.push(a)
      } else if (a.type === 'credit') {
        cartoes.push(a)
      } else {
        const gName = (group?.name || '').toLowerCase()
        if (gName.includes('invest') || gName.includes('aplic')) investimentos.push(a)
        else if (['checking', 'savings', 'cash'].includes(a.type)) contas.push(a)
      }
    }
    return { bens, dividas, emprestimos, investimentos, contas, cartoes }
  }, [accounts, accountGroups])

  const totals = useMemo(() => {
    const bens = categorized.bens.reduce((s, a) => s + (a.balance || 0), 0)
    const dividas = categorized.dividas.reduce((s, a) => s + (a.balance || 0), 0)
    const emprestimos = categorized.emprestimos.reduce((s, a) => s + (a.balance || 0), 0)
    const investimentos = categorized.investimentos.reduce((s, a) => s + (a.balance || 0), 0)
    const contas = categorized.contas.reduce((s, a) => s + (a.balance || 0), 0)
    const cartao = categorized.cartoes.reduce((s, a) => s + (a.creditDebt || 0), 0)
    const pl = bens + investimentos + contas - dividas - emprestimos - cartao
    return { bens, dividas, emprestimos, investimentos, contas, cartao, pl }
  }, [categorized])

  // Monthly PL evolution (last 6 months)
  const chartData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const refDate = subMonths(today, 5 - i)
      const monthEnd = format(endOfMonth(refDate), 'yyyy-MM-dd')
      const label = format(refDate, 'MMM/yy', { locale: ptBR })

      // Asset values at this month-end: use last valueHistory entry <= monthEnd, fallback to current
      const bensVal = categorized.bens.reduce((s, a) => {
        const hist = (a.valueHistory || [])
          .filter(h => h.date <= monthEnd)
          .sort((x, y) => x.date.localeCompare(y.date))
        return s + (hist.length > 0 ? hist[hist.length - 1].value : (a.balance || 0))
      }, 0)

      // Financial accounts: use current (no history tracked)
      const finVal = categorized.investimentos.reduce((s, a) => s + (a.balance || 0), 0)
        + categorized.contas.reduce((s, a) => s + (a.balance || 0), 0)
      const debts = totals.dividas + totals.emprestimos + totals.cartao

      return { label, pl: bensVal + finVal - debts }
    })
  }, [categorized, totals])

  const hasHistory = categorized.bens.some(a => (a.valueHistory || []).length > 0)

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Bens</p>
          <p className="text-lg font-bold text-teal-400 mt-1">{fmt(totals.bens)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Investimentos</p>
          <p className="text-lg font-bold text-blue-400 mt-1">{fmt(totals.investimentos)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Contas</p>
          <p className="text-lg font-bold text-receita mt-1">{fmt(totals.contas)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Dívidas</p>
          <p className="text-lg font-bold text-despesa mt-1">{fmt(totals.dividas)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cartão</p>
          <p className="text-lg font-bold text-orange-400 mt-1">{fmt(totals.cartao)}</p>
        </div>
        <div className="card border border-[#0F6E56]/30 bg-[#0F6E56]/5">
          <p className="text-xs text-[#0F6E56] uppercase tracking-wide font-semibold">Patrimônio Líquido</p>
          <p className={`text-lg font-bold mt-1 ${totals.pl >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmt(totals.pl)}</p>
        </div>
      </div>

      {/* Evolution Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Evolução do Patrimônio Líquido</h2>
          {!hasHistory && (
            <span className="text-xs text-gray-600 italic">Atualize valores de bens para ver a evolução real</span>
          )}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="plGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => {
                  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`
                  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
                  return String(v)
                }}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="pl"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#plGrad)"
                dot={{ fill: '#10b981', r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bens Patrimoniais */}
      {categorized.bens.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Home size={14} className="text-teal-400" /> Bens e Ativos
          </h2>
          <div className="space-y-2">
            {categorized.bens.map(a => {
              const gain = a.acquisitionValue != null ? a.balance - a.acquisitionValue : null
              const pct = a.acquisitionValue ? ((a.balance - a.acquisitionValue) / a.acquisitionValue) * 100 : null
              const isExpanded = expandedHistory === a.id
              return (
                <div key={a.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-200 text-sm">{a.name}</p>
                      {a.bank && <p className="text-xs text-gray-600">{a.bank}</p>}
                      {a.acquisitionValue != null && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Aquisição: {fmt(a.acquisitionValue)}
                          {a.acquisitionDate && ` em ${a.acquisitionDate}`}
                          {gain !== null && (
                            <span className={`ml-2 font-medium ${gain >= 0 ? 'text-receita' : 'text-despesa'}`}>
                              {gain >= 0 ? '+' : ''}{fmt(gain)} ({pct?.toFixed(1)}%)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-teal-400">{fmt(a.balance || 0)}</p>
                        {(a.valueHistory || []).length > 0 && (
                          <button
                            onClick={() => setExpandedHistory(isExpanded ? null : a.id)}
                            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                          >
                            {isExpanded ? 'Ocultar' : `${a.valueHistory.length} atualiz.`}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setUpdateValueAccount(a)}
                        className="p-2 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 transition-colors"
                        title="Atualizar valor"
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <ValueHistoryList account={a} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dívidas e Passivos */}
      {(categorized.dividas.length > 0 || categorized.emprestimos.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" /> Dívidas e Passivos
          </h2>
          <div className="space-y-2">
            {[...categorized.dividas, ...categorized.emprestimos].map(a => {
              const group = accountGroups.find(g => g.id === a.accountGroupId)
              return (
                <div key={a.id} className="card border border-red-500/10">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-200 text-sm">{a.name}</p>
                      {group && <p className="text-xs text-gray-600">{group.name}</p>}
                      {a.acquisitionValue != null && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Valor original: {fmt(a.acquisitionValue)}
                          {a.acquisitionDate && ` em ${a.acquisitionDate}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-bold text-despesa">{fmt(a.balance || 0)}</p>
                      <p className="text-xs text-gray-600">Saldo devedor</p>
                    </div>
                  </div>
                  {a.acquisitionValue > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-red-500 rounded-full"
                          style={{ width: `${Math.min(100, (a.balance / a.acquisitionValue) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 text-right">
                        {((a.balance / a.acquisitionValue) * 100).toFixed(1)}% restante
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumo financeiro */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-blue-400" /> Resumo Patrimonial
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-gray-800">
            <span className="text-gray-400">(+) Bens e Ativos</span>
            <span className="text-teal-400 font-medium">{fmt(totals.bens)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-800">
            <span className="text-gray-400">(+) Investimentos</span>
            <span className="text-blue-400 font-medium">{fmt(totals.investimentos)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-800">
            <span className="text-gray-400">(+) Contas Financeiras</span>
            <span className="text-receita font-medium">{fmt(totals.contas)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-800">
            <span className="text-gray-400">(−) Dívidas e Passivos</span>
            <span className="text-despesa font-medium">{fmt(totals.dividas + totals.emprestimos)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-gray-800">
            <span className="text-gray-400">(−) Dívida Cartão de Crédito</span>
            <span className="text-orange-400 font-medium">{fmt(totals.cartao)}</span>
          </div>
          <div className="flex justify-between py-2 font-semibold">
            <span className="text-gray-200">= Patrimônio Líquido</span>
            <span className={totals.pl >= 0 ? 'text-receita' : 'text-despesa'}>{fmt(totals.pl)}</span>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {categorized.bens.length === 0 && categorized.dividas.length === 0 && categorized.emprestimos.length === 0 && (
        <div className="card text-center py-12">
          <Landmark size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhuma conta patrimonial cadastrada</p>
          <p className="text-gray-600 text-xs mt-1">Adicione contas nos grupos Imóveis, Veículos, Dívidas ou Empréstimos em Contas.</p>
        </div>
      )}

      <Modal
        open={!!updateValueAccount}
        onClose={() => setUpdateValueAccount(null)}
        title={`Atualizar Valor — ${updateValueAccount?.name || ''}`}
        size="sm"
      >
        {updateValueAccount && (
          <UpdateValueModal account={updateValueAccount} onClose={() => setUpdateValueAccount(null)} />
        )}
      </Modal>
    </div>
  )
}
