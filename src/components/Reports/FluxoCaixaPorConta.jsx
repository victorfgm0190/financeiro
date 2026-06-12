import { useMemo, useState } from 'react'
import { format, addDays } from 'date-fns'
import { Wallet, ArrowDownCircle, ArrowUpCircle, Calendar } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import DateInput from '../shared/DateInput'

const round2 = n => Math.round(n * 100) / 100
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

const VISOES = [
  { id: 'conta',      label: 'Por Conta' },
  { id: 'grupo',      label: 'Por Grupo' },
  { id: 'principais', label: 'Contas Principais' },
]

export default function FluxoCaixaPorConta() {
  const { profileAccounts: accounts, profileTransactions: transactions, profileSchedules: schedules, accountGroups, getNextOccurrences } = useApp()

  const [visao, setVisao] = useState('conta')
  const [accountId, setAccountId] = useState(() => accounts[0]?.id || '')
  const [groupId, setGroupId] = useState('')
  const [start, setStart] = useState(() => todayStr())
  const [end, setEnd] = useState(() => format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [includeSchedules, setIncludeSchedules] = useState(true)
  const [hideReserva, setHideReserva] = useState(false)

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const accName = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }

  const groups = useMemo(
    () => [...accountGroups].filter(g => !g.inibido).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountGroups],
  )

  const selectedAccounts = useMemo(() => {
    if (visao === 'conta')      return accounts.filter(a => a.id === accountId)
    if (visao === 'grupo')      return accounts.filter(a => a.accountGroupId === groupId)
    return accounts.filter(a => a.isMain) // 'principais'
  }, [visao, accountId, groupId, accounts])

  const accountIds = useMemo(() => new Set(selectedAccounts.map(a => a.id)), [selectedAccounts])
  const currentBalance = useMemo(() => selectedAccounts.reduce((s, a) => s + (a.balance || 0), 0), [selectedAccounts])

  const rows = useMemo(() => {
    if (accountIds.size === 0 || !start || !end || start > end) return []
    const out = []
    const tdy = todayStr()
    // Movimento que toca uma conta de reserva (origem ou destino) — ocultado quando ligado.
    const tocaReserva = (from, to) => hideReserva && (reservaSet.has(from) || reservaSet.has(to))

    // Entrada (depósito) / saída (pagamento) de um movimento em relação ao conjunto selecionado.
    // Transferências internas (ambos os lados no conjunto) são neutralizadas.
    const classify = (type, fromAcc, toAcc, amount) => {
      const fromIn = accountIds.has(fromAcc)
      const toIn = accountIds.has(toAcc)
      if (!fromIn && !toIn) return null
      if (type === 'transfer' && fromIn && toIn) return null
      if (type === 'income'  && fromIn) return { entrada: amount, saida: 0 }
      if (type === 'expense' && fromIn) return { entrada: 0, saida: amount }
      if (type === 'transfer') {
        if (toIn && !fromIn) return { entrada: amount, saida: 0 }
        if (fromIn && !toIn) return { entrada: 0, saida: amount }
      }
      return null
    }

    // Passadas e presentes: lançamentos reais dentro do período → "Registrada".
    transactions.forEach(tx => {
      if (tx.date < start || tx.date > end) return
      if (tocaReserva(tx.accountId, tx.toAccountId)) return
      const m = classify(tx.type, tx.accountId, tx.toAccountId, tx.amount)
      if (!m) return
      out.push({
        date: tx.date, description: tx.description || '(sem descrição)', type: tx.type,
        fromAccountId: tx.accountId, toAccountId: tx.toAccountId,
        entrada: m.entrada, saida: m.saida, status: 'Registrada', real: true, _key: tx.id,
      })
    })

    // Futuras: ocorrências pendentes de agendamentos (data > hoje) dentro do período.
    if (includeSchedules) {
      schedules.forEach(s => {
        if (!accountIds.has(s.accountId) && !accountIds.has(s.toAccountId)) return
        if (tocaReserva(s.accountId, s.toAccountId)) return
        getNextOccurrences(s, 400).forEach(date => {
          if (date <= tdy || date < start || date > end) return
          const m = classify(s.transactionType, s.accountId, s.toAccountId, s.amount)
          if (!m) return
          out.push({
            date, description: s.description || '(agendamento)', type: s.transactionType,
            fromAccountId: s.accountId, toAccountId: s.toAccountId,
            entrada: m.entrada, saida: m.saida,
            status: m.entrada > 0 ? 'A receber' : 'A pagar', real: false, _key: s.id + '_' + date,
          })
        })
      })
    }

    out.sort((a, b) => a.date.localeCompare(b.date) || (a.real === b.real ? 0 : a.real ? -1 : 1))
    // Só os movimentos FUTUROS (agendamentos) alteram o saldo acumulado — os lançamentos
    // reais já estão refletidos no saldo atual das contas, então não são somados de novo.
    let bal = currentBalance
    out.forEach(r => {
      if (!r.real) bal = round2(bal + r.entrada - r.saida)
      r.saldo = bal
    })
    return out
  }, [transactions, schedules, accountIds, start, end, includeSchedules, currentBalance, getNextOccurrences, hideReserva, reservaSet])

  const totalEntrada = round2(rows.reduce((s, r) => s + r.entrada, 0))
  const totalSaida = round2(rows.reduce((s, r) => s + r.saida, 0))
  const saldoFinal = rows.length ? rows[rows.length - 1].saldo : currentBalance

  const movimentacao = (r) => {
    if (r.type === 'transfer') return `${accName(r.fromAccountId)} → ${accName(r.toAccountId)}`
    if (r.entrada > 0) return `→ ${accName(r.fromAccountId)}`   // entrada na conta
    return `${accName(r.fromAccountId)} →`                       // saída da conta
  }

  const statusBadge = (status) => {
    if (status === 'Registrada') return 'bg-gray-600/30 text-gray-300'
    if (status === 'A receber')  return 'bg-receita/20 text-receita'
    return 'bg-despesa/20 text-despesa' // A pagar
  }

  const noSelection = accountIds.size === 0

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="card space-y-3">
        {/* Visão (toggle) */}
        <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1 w-full sm:w-auto">
          {VISOES.map(v => (
            <button
              key={v.id}
              onClick={() => setVisao(v.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                visao === v.id ? 'bg-[#0F6E56] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {visao === 'conta' && (
            <div className="lg:col-span-2">
              <label className="label">Conta</label>
              <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Selecione...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
              </select>
            </div>
          )}
          {visao === 'grupo' && (
            <div className="lg:col-span-2">
              <label className="label">Grupo de Contas</label>
              <select className="input" value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">Selecione...</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {visao === 'principais' && (
            <div className="lg:col-span-2 flex items-end">
              <p className="text-xs text-gray-500">
                Soma automática das contas marcadas com estrela (principais):{' '}
                <span className="text-gray-300">{selectedAccounts.length} conta{selectedAccounts.length !== 1 ? 's' : ''}</span>
              </p>
            </div>
          )}
          <div>
            <label className="label">Data inicial</label>
            <DateInput className="input" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Data final</label>
            <DateInput className="input" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-5 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={includeSchedules} onChange={e => setIncludeSchedules(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Incluir agendamentos (transações futuras)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={hideReserva} onChange={e => setHideReserva(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Ocultar movimentos de reserva</span>
            </label>
          </div>
          {!noSelection && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Wallet size={13} /> Saldo atual: <span className="font-semibold text-gray-200">{fmt(currentBalance)}</span>
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      {!noSelection && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card">
            <div className="flex items-center gap-2 mb-1 text-blue-600"><ArrowDownCircle size={14} /><p className="text-xs text-gray-400 uppercase tracking-wide">Entradas</p></div>
            <p className="text-xl font-bold text-blue-600">{fmt(totalEntrada)}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1 text-orange-600"><ArrowUpCircle size={14} /><p className="text-xs text-gray-400 uppercase tracking-wide">Saídas</p></div>
            <p className="text-xl font-bold text-orange-600">{fmt(totalSaida)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Saldo Projetado</p>
            <p className={`text-xl font-bold mt-1 ${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(saldoFinal)}</p>
          </div>
        </div>
      )}

      {!noSelection && (
        <p className="text-xs text-gray-600 leading-relaxed">
          O <span className="text-gray-400">saldo</span> acumula apenas os movimentos futuros (agendamentos) a partir do saldo atual —
          os lançamentos já <span className="text-gray-400">Registrados</span> aparecem como referência e não alteram o acumulado, pois já estão refletidos no saldo atual.
        </p>
      )}

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-300">Movimentações</h2>
          <span className="text-xs text-gray-500 ml-auto">{rows.length} linha{rows.length !== 1 ? 's' : ''}</span>
        </div>

        {noSelection ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            {visao === 'principais' ? 'Nenhuma conta marcada como principal (estrela).' : 'Selecione uma conta/grupo para ver o fluxo.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium w-24">Data</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Movimentação</th>
                  <th className="text-right px-3 py-2.5 text-xs text-orange-600 font-medium w-28">Pagamento</th>
                  <th className="text-right px-3 py-2.5 text-xs text-blue-600 font-medium w-28">Depósito</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium w-28">Saldo</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Saldo inicial */}
                <tr className="border-b border-gray-800/50 bg-gray-800/20">
                  <td className="px-3 py-2 text-xs text-gray-500">Hoje</td>
                  <td className="px-3 py-2 text-xs text-gray-400 italic" colSpan={4}>Saldo atual</td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${currentBalance >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(currentBalance)}</td>
                  <td className="px-3 py-2" />
                </tr>
                {rows.map(r => (
                  <tr key={r._key} className={`border-b border-gray-800/40 ${r.real ? 'hover:bg-gray-800/20' : 'bg-indigo-500/5 hover:bg-indigo-500/10'}`}>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-200 max-w-xs truncate" title={r.description}>{r.description}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{movimentacao(r)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-orange-600 whitespace-nowrap">{r.saida > 0 ? fmt(r.saida) : ''}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600 whitespace-nowrap">{r.entrada > 0 ? fmt(r.entrada) : ''}</td>
                    <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap ${r.real ? 'text-gray-600' : (r.saldo >= 0 ? 'text-gray-300' : 'text-orange-600')}`} title={r.real ? 'Já refletido no saldo atual' : undefined}>{fmt(r.saldo)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-500 text-sm">Nenhuma movimentação no período.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-700 bg-gray-800/20">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-gray-400">Total</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-orange-600">{fmt(totalSaida)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-600">{fmt(totalEntrada)}</td>
                    <td className={`px-3 py-2.5 text-right text-xs font-bold ${saldoFinal >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(saldoFinal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
