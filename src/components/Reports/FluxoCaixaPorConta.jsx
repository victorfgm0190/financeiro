import { useMemo, useState, useRef, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { Wallet, ArrowDownCircle, ArrowUpCircle, Calendar, ChevronDown } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, accountsForView } from '../shared/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import DateInput from '../shared/DateInput'

const round2 = n => Math.round(n * 100) / 100
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

// Ciclos de um envelope (dueDay D: período de D+1 de um mês até D do mês seguinte)
// que se SOBREPÕEM ao intervalo [start, end] — sobreposição quando
// ciclo.from <= end E ciclo.to >= start. Retorna [{ from, to }] em 'yyyy-MM-dd'.
function envelopeCyclesOverlapping(dueDay, start, end) {
  const startD = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  const cycles = []
  // Itera o mês de término do ciclo, de um mês antes do início a um mês após o fim.
  let cur = new Date(startD.getFullYear(), startD.getMonth() - 1, 1)
  const stop = new Date(endD.getFullYear(), endD.getMonth() + 2, 1)
  while (cur < stop) {
    const y = cur.getFullYear(), mo = cur.getMonth()
    const to = new Date(y, mo, dueDay)          // fim do ciclo: dia dueDay
    const from = new Date(y, mo - 1, dueDay + 1) // início: dia dueDay+1 do mês anterior
    if (from <= endD && to >= startD) {
      cycles.push({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') })
    }
    cur = new Date(y, mo + 1, 1)
  }
  return cycles
}

const VISOES = [
  { id: 'conta',      label: 'Por Conta' },
  { id: 'grupo',      label: 'Por Grupo' },
  { id: 'principais', label: 'Contas Principais' },
]

export default function FluxoCaixaPorConta() {
  const { profileAccounts: accounts, profileTransactions: transactions, profileSchedules: schedules, accountGroups, envelopes, getNextOccurrences } = useApp()

  const [visao, setVisao] = useState('conta')
  // Visão "Por Conta" permite selecionar múltiplas contas (fluxo combinado).
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => accounts[0]?.id ? [accounts[0].id] : [])
  const [contaDropOpen, setContaDropOpen] = useState(false)
  const [groupId, setGroupId] = useState('')
  const [start, setStart] = useState(() => todayStr())
  const [end, setEnd] = useState(() => format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [includeSchedules, setIncludeSchedules] = useState(true)
  const [hideReserva, setHideReserva] = useState(false)
  const [hidePatrimonio, setHidePatrimonio] = useState(false)

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const isMobile = useIsMobile()
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const patrimonioSet = useMemo(() => new Set(accounts.filter(a => a.vinculoTipo === 'patrimonio').map(a => a.id)), [accounts])
  const accName = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }

  const groups = useMemo(
    () => [...accountGroups].filter(g => !g.inibido).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountGroups],
  )

  const selectedAccounts = useMemo(() => {
    if (visao === 'conta')      return accounts.filter(a => selectedAccountIds.includes(a.id))
    if (visao === 'grupo')      return accounts.filter(a => a.accountGroupId === groupId)
    // 'principais': contas do Fluxo de Caixa Principal (badge FC), não-cartão — mesmo
    // conjunto usado no Saldo Principal do Dashboard / Posição Financeira.
    return accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')
  }, [visao, selectedAccountIds, groupId, accounts])

  const accountIds = useMemo(() => new Set(selectedAccounts.map(a => a.id)), [selectedAccounts])
  const currentBalance = useMemo(() => selectedAccounts.reduce((s, a) => s + (a.balance || 0), 0), [selectedAccounts])

  const { rows, saldoAnterior } = useMemo(() => {
    if (accountIds.size === 0 || !start || !end || start > end) return { rows: [], saldoAnterior: currentBalance }
    const out = []
    // Movimento que toca uma conta de reserva (origem ou destino) — ocultado quando ligado.
    const tocaReserva = (from, to) => hideReserva && (reservaSet.has(from) || reservaSet.has(to))
    // Idem para contas com vínculo Patrimônio.
    const tocaPatrimonio = (from, to) => hidePatrimonio && (patrimonioSet.has(from) || patrimonioSet.has(to))
    const oculto = (from, to) => tocaReserva(from, to) || tocaPatrimonio(from, to)

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
      if (oculto(tx.accountId, tx.toAccountId)) return
      const m = classify(tx.type, tx.accountId, tx.toAccountId, tx.amount)
      if (!m) return
      out.push({
        date: tx.date, description: tx.description || '(sem descrição)', type: tx.type,
        fromAccountId: tx.accountId, toAccountId: tx.toAccountId,
        entrada: m.entrada, saida: m.saida, status: 'Registrada', real: true, _key: tx.id,
      })
    })

    // Projetadas: ocorrências de agendamentos ainda NÃO registradas dentro do período.
    // Inclui pendentes em atraso (data <= hoje) — getNextOccurrences já exclui as datas
    // registradas/puladas, então não há duplicidade com os lançamentos reais acima. Uma
    // transferência entra aqui sempre que ao menos um lado pertence ao conjunto (mesma
    // regra do classify usada pelas transações registradas: origem no conjunto → saída,
    // destino no conjunto → entrada — ex.: FC → Reserva aparece como saída).
    if (includeSchedules) {
      schedules.forEach(s => {
        if (!accountIds.has(s.accountId) && !accountIds.has(s.toAccountId)) return
        if (oculto(s.accountId, s.toAccountId)) return
        getNextOccurrences(s, 400).forEach(date => {
          if (date < start || date > end) return
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

      // Envelopes: uma linha "Projetado" por CICLO de envelope que se sobrepõe ao
      // período [start, end] — não só o ciclo atual. Para cada ciclo, o valor é o
      // restante (limite − gasto naquele ciclo), datado no fim do ciclo (vencimento).
      const isEnvExpense = (tx) =>
        tx.type === 'expense' && !tx.reservaAuto &&
        tx.origin !== 'reservaAuto' && tx.origin !== 'patrimonioAuto' && tx.origin !== 'investAuto'

      ;(envelopes || []).forEach(env => {
        if (!env.accountId || !accountIds.has(env.accountId)) return
        if (oculto(env.accountId, null)) return
        for (const cyc of envelopeCyclesOverlapping(env.dueDay || 1, start, end)) {
          let spent = 0
          for (const tx of transactions) {
            if (!isEnvExpense(tx)) continue
            if (!env.categoryIds?.includes(tx.categoryId)) continue
            if (!tx.date || tx.date < cyc.from || tx.date > cyc.to) continue
            spent += tx.amount
          }
          const restante = round2(Math.max(0, (env.limitAmount || 0) - spent))
          if (restante <= 0) continue
          out.push({
            date: cyc.to, description: `Envelope: ${env.name || '(envelope)'}`, type: 'expense',
            fromAccountId: env.accountId, toAccountId: null,
            entrada: 0, saida: restante,
            status: 'Projetado', real: false, _key: 'env_' + env.id + '_' + cyc.to,
          })
        }
      })
    }

    out.sort((a, b) => a.date.localeCompare(b.date) || (a.real === b.real ? 0 : a.real ? -1 : 1))

    // Saldo anterior = saldo no dia imediatamente anterior à data inicial. O saldo atual
    // das contas reflete TODAS as transações reais (inclusive as do período e posteriores);
    // subtraímos o efeito líquido das transações reais com date >= start para obter a base
    // correta do período. (Movimentos ocultos seguem a mesma regra dos exibidos.)
    let efeitoDesdeStart = 0
    transactions.forEach(tx => {
      if (tx.date < start) return
      if (oculto(tx.accountId, tx.toAccountId)) return
      const m = classify(tx.type, tx.accountId, tx.toAccountId, tx.amount)
      if (!m) return
      efeitoDesdeStart = round2(efeitoDesdeStart + m.entrada - m.saida)
    })
    const saldoAnterior = round2(currentBalance - efeitoDesdeStart)

    // A partir do saldo anterior, acumula TODOS os movimentos do período (registrados e
    // projetados), em ordem cronológica.
    let bal = saldoAnterior
    out.forEach(r => {
      bal = round2(bal + r.entrada - r.saida)
      r.saldo = bal
    })
    return { rows: out, saldoAnterior }
  }, [transactions, schedules, accountIds, start, end, includeSchedules, currentBalance, getNextOccurrences, hideReserva, reservaSet, hidePatrimonio, patrimonioSet, envelopes])

  const totalEntrada = round2(rows.reduce((s, r) => s + r.entrada, 0))
  const totalSaida = round2(rows.reduce((s, r) => s + r.saida, 0))
  const saldoFinal = rows.length ? rows[rows.length - 1].saldo : saldoAnterior
  // Dia imediatamente anterior à data inicial (rótulo do saldo base).
  const prevDayStr = start ? format(addDays(new Date(start + 'T00:00:00'), -1), 'yyyy-MM-dd') : ''

  const movimentacao = (r) => {
    if (r.type === 'transfer') return `${accName(r.fromAccountId)} → ${accName(r.toAccountId)}`
    if (r.entrada > 0) return `→ ${accName(r.fromAccountId)}`   // entrada na conta
    return `${accName(r.fromAccountId)} →`                       // saída da conta
  }

  const statusBadge = (status) => {
    if (status === 'Registrada') return 'bg-gray-600/30 text-gray-300'
    if (status === 'A receber')  return 'bg-receita/20 text-receita'
    if (status === 'Projetado')  return 'bg-indigo-500/20 text-indigo-400'
    return 'bg-despesa/20 text-despesa' // A pagar
  }

  const noSelection = accountIds.size === 0

  // Multi-select de contas (visão "Por Conta")
  const contaDropRef = useRef(null)
  useEffect(() => {
    if (!contaDropOpen) return
    const onDoc = (e) => { if (contaDropRef.current && !contaDropRef.current.contains(e.target)) setContaDropOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [contaDropOpen])
  const pickableAccounts = accountsForView(accounts, isMobile)
  const toggleAccount = (id) => setSelectedAccountIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const contaLabel = selectedAccountIds.length === 0
    ? 'Selecione...'
    : selectedAccountIds.length === 1
      ? accName(selectedAccountIds[0])
      : `${selectedAccountIds.length} contas selecionadas`

  return (
    <div className="space-y-4">
      {/* Filtros — fixos no topo ao rolar apenas no desktop (md+) */}
      <div className="card space-y-3 md:sticky md:top-0 md:z-20">
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
            <div className="lg:col-span-2 relative" ref={contaDropRef}>
              <label className="label">Contas</label>
              <button
                type="button"
                onClick={() => setContaDropOpen(o => !o)}
                className={`input flex items-center justify-between gap-2 text-left w-full ${selectedAccountIds.length === 0 ? 'text-gray-500' : ''}`}
              >
                <span className="truncate min-w-0">{contaLabel}</span>
                <ChevronDown size={14} className={`text-gray-500 shrink-0 transition-transform ${contaDropOpen ? 'rotate-180' : ''}`} />
              </button>
              {contaDropOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-gray-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto overscroll-contain">
                  <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800 sticky top-0 bg-surface">
                    <button type="button" onClick={() => setSelectedAccountIds(pickableAccounts.map(a => a.id))} className="text-xs text-[#0F6E56] hover:underline">Todas</button>
                    <span className="text-gray-700">·</span>
                    <button type="button" onClick={() => setSelectedAccountIds([])} className="text-xs text-gray-500 hover:text-gray-300">Nenhuma</button>
                  </div>
                  {pickableAccounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-[#0F6E56] w-3.5 h-3.5 shrink-0"
                        checked={selectedAccountIds.includes(a.id)}
                        onChange={() => toggleAccount(a.id)}
                      />
                      <span className="text-sm text-gray-300 truncate">{a.apelido || a.name}</span>
                    </label>
                  ))}
                  {pickableAccounts.length === 0 && (
                    <p className="text-xs text-gray-600 px-3 py-3 text-center">Nenhuma conta</p>
                  )}
                </div>
              )}
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
                Soma automática das contas do Fluxo de Caixa Principal (FC):{' '}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={hidePatrimonio} onChange={e => setHidePatrimonio(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Ocultar movimentos de patrimônio</span>
            </label>
          </div>
          {!noSelection && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Wallet size={13} /> Saldo anterior: <span className="font-semibold text-gray-200">{fmt(saldoAnterior)}</span>
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
          O <span className="text-gray-400">saldo</span> parte do <span className="text-gray-400">saldo anterior</span> (dia imediatamente anterior à data inicial)
          e acumula todos os movimentos do período — tanto os já <span className="text-gray-400">Registrados</span> quanto os projetados (agendamentos/envelopes).
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
            {visao === 'principais' ? 'Nenhuma conta marcada como Fluxo de Caixa Principal (FC).' : 'Selecione uma conta/grupo para ver o fluxo.'}
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
                {/* Saldo anterior (dia imediatamente anterior à data inicial) */}
                <tr className="border-b border-gray-800/50 bg-gray-800/20">
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{prevDayStr ? fmtDate(prevDayStr) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-400 italic" colSpan={4}>Saldo anterior</td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${saldoAnterior >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(saldoAnterior)}</td>
                  <td className="px-3 py-2" />
                </tr>
                {rows.map(r => (
                  <tr key={r._key} className={`border-b border-gray-800/40 ${r.real ? 'hover:bg-gray-800/20' : 'bg-indigo-500/5 hover:bg-indigo-500/10'}`}>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-200 max-w-xs truncate" title={r.description}>{r.description}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{movimentacao(r)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-orange-600 whitespace-nowrap">{r.saida > 0 ? fmt(r.saida) : ''}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600 whitespace-nowrap">{r.entrada > 0 ? fmt(r.entrada) : ''}</td>
                    <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap ${r.saldo >= 0 ? 'text-gray-300' : 'text-orange-600'}`}>{fmt(r.saldo)}</td>
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
