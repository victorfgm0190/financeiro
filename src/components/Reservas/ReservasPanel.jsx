import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import {
  Plus, Edit2, Trash2, RotateCcw, CheckCircle, AlertTriangle, Layers,
  ArrowDownCircle, ArrowUpCircle, PiggyBank, ChevronLeft, ChevronRight, FileSpreadsheet, GripVertical,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Salva uma matriz (array de arrays) como .xlsx
function exportSheet(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reservas')
  XLSX.writeFile(wb, filename)
}

function mmYYYY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`
}

// Funções de reserva vivem no estado global (Neon). accountBalances e periods seguem
// locais (overrides de saldo real e histórico de viradas — específicos do dispositivo).
function useReservas() {
  const { reserveFunctions: functions, addReserveFunction, updateReserveFunction, deleteReserveFunction } = useApp()

  const [accountBalances, setAccountBalancesState] = useState(() => {
    try {
      const s = localStorage.getItem('finup_reserve_balances')
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  })
  const [periods, setPeriods] = useState(() => {
    try {
      const s = localStorage.getItem('finup_reserve_periods')
      return s ? JSON.parse(s) : []
    } catch { return [] }
  })

  useEffect(() => { localStorage.setItem('finup_reserve_balances', JSON.stringify(accountBalances)) }, [accountBalances])
  useEffect(() => { localStorage.setItem('finup_reserve_periods', JSON.stringify(periods)) }, [periods])

  const addFunction = (fn) => addReserveFunction(fn)
  const updateFunction = (id, changes) => updateReserveFunction(id, changes)
  const deleteFunction = (id) => deleteReserveFunction(id)

  const setAccountBalance = (accountId, value) => {
    setAccountBalancesState(b => ({ ...b, [accountId]: Number(value) }))
  }

  const virarSaldo = (saldosAtualizados) => {
    const snapshot = functions.map(f => ({
      id: f.id,
      prevSaldoInicial: f.saldoInicial,
      prevEntradas: f.entradas,
      prevSaidas: f.saidas,
      saldoAtualizado: saldosAtualizados[f.id] ?? Math.round((f.saldoInicial + f.entradas - f.saidas) * 100) / 100,
    }))
    setPeriods(ps => [...ps, { closedAt: new Date().toISOString().split('T')[0], snapshot }])
    functions.forEach(f => updateReserveFunction(f.id, {
      saldoInicial: saldosAtualizados[f.id] ?? Math.round((f.saldoInicial + f.entradas - f.saidas) * 100) / 100,
      entradas: 0,
      saidas: 0,
    }))
  }

  const undoVirarSaldo = () => {
    if (periods.length === 0) return
    const last = periods[periods.length - 1]
    last.snapshot.forEach(snap =>
      updateReserveFunction(snap.id, { saldoInicial: snap.prevSaldoInicial, entradas: snap.prevEntradas, saidas: snap.prevSaidas })
    )
    setPeriods(ps => ps.slice(0, -1))
  }

  return { functions, accountBalances, periods, addFunction, updateFunction, deleteFunction, setAccountBalance, virarSaldo, undoVirarSaldo }
}

// ── Inline editable number cell ────────────────────────────────────────────
function InlineEdit({ value, onSave, textClass = 'text-gray-300' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.value = String(value); inputRef.current.select() }
  }, [editing, value])

  const save = () => {
    const n = parseFloat(inputRef.current?.value ?? val)
    if (!isNaN(n)) onSave(Math.round(n * 100) / 100)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-24 bg-gray-800 border border-blue-500/50 rounded px-2 py-0.5 text-xs text-right text-gray-200 focus:outline-none"
        type="number"
        step="0.01"
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-right w-full text-xs font-semibold hover:underline cursor-pointer ${textClass}`}
      title="Clique para editar"
    >
      {value !== 0 ? fmt(value) : <span className="text-gray-700">0,00</span>}
    </button>
  )
}

// ── Function Form (modal) ───────────────────────────────────────────────────
function FunctionForm({ initial, accounts, onSubmit, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    accountId: initial?.accountId || '',
    saldoInicial: initial?.saldoInicial ?? 0,
    despesaAnual: initial?.despesaAnual ?? 0,
    depositoMensal: initial?.depositoMensal ?? 0,
    mesVencimento: initial?.mesVencimento ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({
      ...form,
      accountId: form.accountId || null,
      saldoInicial: Number(form.saldoInicial) || 0,
      despesaAnual: Number(form.despesaAnual) || 0,
      depositoMensal: Number(form.depositoMensal) || 0,
      mesVencimento: form.mesVencimento !== '' ? Number(form.mesVencimento) : null,
    }) }} className="space-y-4">
      <div>
        <label className="label">Nome da Função *</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Ex: IPVA, Seguro Residencial..." />
      </div>
      <div>
        <label className="label">Conta Vinculada</label>
        <select className="input" value={form.accountId} onChange={e => set('accountId', e.target.value)}>
          <option value="">— Sem conta —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Saldo Inicial (R$)</label>
        <input className="input" type="number" step="0.01" value={form.saldoInicial} onChange={e => set('saldoInicial', e.target.value)} placeholder="0,00 (aceita negativo)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Despesa Anual (R$)</label>
          <input className="input" type="number" step="0.01" value={form.despesaAnual} onChange={e => set('despesaAnual', e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="label">Depósito Mensal (R$)</label>
          <input className="input" type="number" step="0.01" value={form.depositoMensal} onChange={e => set('depositoMensal', e.target.value)} placeholder="0,00" />
        </div>
      </div>
      <div>
        <label className="label">Mês de Vencimento da Despesa</label>
        <select className="input" value={form.mesVencimento} onChange={e => set('mesVencimento', e.target.value)}>
          <option value="">Rateio mensal (÷ 12)</option>
          {MONTH_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <p className="text-xs text-gray-600 mt-1">Quando não definido, a despesa anual é dividida em 12 parcelas mensais</p>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar'}</button>
      </div>
    </form>
  )
}

// ── Tab 0: Contas Reserva ───────────────────────────────────────────────────
function ContasReservaTab({ reservaAccounts, transactions, categories, periodStart, periodEnd }) {
  const [extratoAcc, setExtratoAcc] = useState(null)

  const reservaData = useMemo(() => {
    return reservaAccounts.map(acc => {
      const cat = acc.reservaType === 'especifica'
        ? categories.find(c => c.id === acc.reservaCategoryId)
        : null
      const entradas = transactions
        .filter(tx => tx.type === 'transfer' && tx.toAccountId === acc.id && tx.date >= periodStart && tx.date <= periodEnd)
        .reduce((s, t) => s + t.amount, 0)
      const saidas = transactions
        .filter(tx => tx.type === 'transfer' && tx.accountId === acc.id && tx.date >= periodStart && tx.date <= periodEnd)
        .reduce((s, t) => s + t.amount, 0)
      const txsExtrato = transactions
        .filter(tx => tx.type === 'transfer' && (tx.accountId === acc.id || tx.toAccountId === acc.id))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 40)
      return { acc, cat, entradas, saidas, txsExtrato }
    })
  }, [reservaAccounts, transactions, categories, periodStart, periodEnd])

  const totalSaldo = reservaAccounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalEntradas = reservaData.reduce((s, d) => s + d.entradas, 0)
  const totalSaidas = reservaData.reduce((s, d) => s + d.saidas, 0)
  const extratoData = reservaData.find(d => d.acc.id === extratoAcc?.id)

  if (reservaAccounts.length === 0) {
    return (
      <div className="card text-center py-12">
        <PiggyBank size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Nenhuma conta marcada como reserva</p>
        <p className="text-xs text-gray-600 mt-1">Ative "É conta de reserva" no cadastro de uma conta para ela aparecer aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo do topo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Reservado</p>
          <p className={`text-xl font-bold ${totalSaldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{fmt(totalSaldo)}</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Depósitos no Mês</p>
          <p className="text-xl font-bold text-emerald-400">{totalEntradas > 0 ? fmt(totalEntradas) : <span className="text-gray-700">—</span>}</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resgates no Mês</p>
          <p className="text-xl font-bold text-orange-400">{totalSaidas > 0 ? fmt(totalSaidas) : <span className="text-gray-700">—</span>}</p>
        </div>
      </div>

      {/* Lista de contas reserva */}
      <div className="space-y-3">
        {reservaData.map(({ acc, cat, entradas, saidas }) => (
          <div key={acc.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm font-semibold text-gray-200">{acc.apelido || acc.name}</span>
                  {acc.reservaType === 'especifica' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 shrink-0">
                      {cat ? `${cat.icon} ${cat.name}` : 'Específica'}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 shrink-0">
                      🏦 Geral
                    </span>
                  )}
                </div>
                <div className="flex gap-4 flex-wrap text-xs">
                  {entradas > 0
                    ? <span className="flex items-center gap-1 text-emerald-500"><ArrowDownCircle size={11} /> +{fmt(entradas)}</span>
                    : <span className="text-gray-700">Sem depósitos no mês</span>
                  }
                  {saidas > 0 && (
                    <span className="flex items-center gap-1 text-orange-400"><ArrowUpCircle size={11} /> −{fmt(saidas)}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-xl font-bold ${(acc.balance || 0) >= 0 ? 'text-gray-100' : 'text-orange-400'}`}>
                  {fmt(acc.balance || 0)}
                </p>
                <button
                  onClick={() => setExtratoAcc(acc)}
                  className="text-xs text-gray-600 hover:text-indigo-400 transition-colors mt-0.5"
                >
                  Ver Extrato →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal extrato */}
      {extratoAcc && extratoData && (
        <Modal open onClose={() => setExtratoAcc(null)} title={`Extrato — ${extratoAcc.apelido || extratoAcc.name}`} size="md">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-800">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Saldo atual</span>
              <span className={`text-lg font-bold ${(extratoAcc.balance || 0) >= 0 ? 'text-gray-100' : 'text-orange-400'}`}>
                {fmt(extratoAcc.balance || 0)}
              </span>
            </div>
            {extratoData.txsExtrato.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">Nenhuma movimentação registrada</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-0">
                {extratoData.txsExtrato.map(tx => {
                  const isEntrada = tx.toAccountId === extratoAcc.id
                  const d = tx.date
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-gray-800/50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {isEntrada
                          ? <ArrowDownCircle size={13} className="text-emerald-500 shrink-0" />
                          : <ArrowUpCircle size={13} className="text-orange-400 shrink-0" />
                        }
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{tx.description || (isEntrada ? 'Depósito' : 'Resgate')}</p>
                          <p className="text-xs text-gray-500">{d.slice(8)}/{d.slice(5,7)}/{d.slice(0,4)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ml-3 ${isEntrada ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {isEntrada ? '+' : '−'}{fmt(tx.amount)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Tab 1: Resumo ───────────────────────────────────────────────────────────
function ResumoTab({ functions, accounts, accountBalances, periods, saldosAtualizados, computeSaldo, onAdd, onEdit, onDelete, onUpdateFunction, onSetAccountBalance, onVirar, onUndo, onReorder }) {
  const byOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.name.localeCompare(b.name)
  const groups = useMemo(() => {
    const byAccount = {}
    functions.forEach(f => {
      const key = f.accountId || '__none__'
      ;(byAccount[key] = byAccount[key] || []).push(f)
    })
    const result = []
    accounts.forEach(acc => {
      if (byAccount[acc.id]) result.push({ accountId: acc.id, account: acc, fns: [...byAccount[acc.id]].sort(byOrdem) })
    })
    if (byAccount['__none__']) result.push({ accountId: null, account: null, fns: [...byAccount['__none__']].sort(byOrdem) })
    return result
  }, [functions, accounts])

  const grandTotal = Object.values(saldosAtualizados).reduce((s, v) => s + v, 0)
  const lastPeriod = periods[periods.length - 1]

  const [dragId, setDragId] = useState(null)
  const handleDropOn = (targetFn) => {
    const dragged = functions.find(f => f.id === dragId)
    setDragId(null)
    if (!dragged || dragged.id === targetFn.id) return
    if ((dragged.accountId || null) !== (targetFn.accountId || null)) return // reordena dentro do mesmo grupo
    const allFns = groups.flatMap(g => g.fns)
    const arr = [...allFns]
    const from = arr.findIndex(f => f.id === dragged.id)
    const to = arr.findIndex(f => f.id === targetFn.id)
    if (from === -1 || to === -1) return
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    onReorder(arr.map(f => f.id))
  }

  const handleExport = () => {
    const rows = [['Função', 'Conta', 'Saldo Inicial', 'Entradas', 'Saídas', 'Saldo', 'Saldo Atualizado']]
    groups.forEach(g => g.fns.forEach(f => {
      rows.push([
        f.name,
        g.account ? (g.account.apelido || g.account.name) : 'Sem conta',
        f.saldoInicial, f.entradas, f.saidas, computeSaldo(f), saldosAtualizados[f.id] ?? computeSaldo(f),
      ])
    }))
    exportSheet(rows, `reservas-resumo-${mmYYYY()}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* KPI + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Total reservado:</span>
          <span className={`text-lg font-bold ${grandTotal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(grandTotal)}</span>
        </div>
        {lastPeriod && (
          <span className="text-xs text-gray-600 hidden sm:inline">Último fechamento: {lastPeriod.closedAt}</span>
        )}
        <div className="flex gap-2 ml-auto flex-wrap">
          {functions.length > 0 && (
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
            </button>
          )}
          {periods.length > 0 && (
            <button onClick={onUndo} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <RotateCcw size={12} /> <span className="hidden sm:inline">Desfazer Virada</span><span className="sm:hidden">Desfazer</span>
            </button>
          )}
          <button onClick={onVirar} className="btn-primary flex items-center gap-1.5 text-xs py-1.5 bg-emerald-700 hover:bg-emerald-600">
            <CheckCircle size={12} /> <span className="hidden sm:inline">Virar Saldo</span><span className="sm:hidden">Virar</span>
          </button>
          <button onClick={onAdd} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus size={12} /> <span className="hidden sm:inline">Nova Função</span><span className="sm:hidden">Nova</span>
          </button>
        </div>
      </div>

      {functions.length === 0 && (
        <div className="card text-center py-12">
          <Layers size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma função de reserva cadastrada</p>
          <button className="btn-primary mt-4" onClick={onAdd}>Cadastrar Função</button>
        </div>
      )}

      {groups.map(({ accountId, account, fns }) => {
        const totalSaldo = fns.reduce((s, f) => s + computeSaldo(f), 0)
        const totalAtualizado = fns.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0)
        const saldoReal = accountId !== null
          ? (accountBalances[accountId] !== undefined ? accountBalances[accountId] : (account?.balance || 0))
          : null
        const diff = saldoReal !== null ? Math.round((saldoReal - totalSaldo) * 100) / 100 : null
        const accLabel = account ? (account.apelido || account.name) : null

        return (
          <div key={accountId || '__none__'}>
            {/* ── Mobile card layout (hidden md+) ── */}
            <div className="md:hidden space-y-2">
              {/* Group header */}
              <div className="flex items-center gap-3 px-1">
                {accLabel
                  ? <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{accLabel}</span>
                  : <span className="text-xs font-semibold text-gray-500 italic uppercase tracking-wide">Sem conta vinculada</span>
                }
                <div className="flex-1 h-px bg-gray-800" />
                <span className={`text-xs font-bold ${totalAtualizado < 0 ? 'text-orange-600' : 'text-emerald-400'}`}>
                  {fmt(totalAtualizado)}
                </span>
              </div>

              {/* Saldo Real input on mobile (for linked accounts) */}
              {accountId && (
                <div className="card py-2 px-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0">Saldo real da conta:</span>
                  <input
                    className="input flex-1 text-xs py-1 text-right"
                    type="number"
                    step="0.01"
                    value={saldoReal ?? ''}
                    onChange={e => onSetAccountBalance(accountId, e.target.value)}
                  />
                  {diff !== null && diff !== 0 && (
                    <span className={`text-xs font-medium shrink-0 ${diff >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {diff > 0 ? '+' : ''}{fmt(diff)}
                    </span>
                  )}
                </div>
              )}

              {fns.map(f => {
                const saldo = computeSaldo(f)
                const atualizado = saldosAtualizados[f.id] ?? saldo
                return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(f.id) }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleDropOn(f) }}
                    className={`card py-3 px-3 space-y-2 ${dragId === f.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-gray-200 inline-flex items-center gap-1.5">
                        <GripVertical size={12} className="text-gray-700 cursor-grab shrink-0" />
                        {f.name}
                      </span>
                      {accLabel && (
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">{account.apelido || account.name.slice(0, 8)}</span>
                      )}
                    </div>
                    <div className={`text-lg font-bold ${atualizado < 0 ? 'text-orange-600' : 'text-emerald-400'}`}>
                      {fmt(atualizado)}
                    </div>
                    <div className="h-px bg-gray-800" />
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-gray-500">Entradas:</span>
                        <InlineEdit value={f.entradas} onSave={v => onUpdateFunction(f.id, { entradas: v })} textClass="text-blue-600" />
                      </div>
                      <div className="flex items-center gap-1.5 flex-1">
                        <span className="text-gray-500">Saídas:</span>
                        <InlineEdit value={f.saidas} onSave={v => onUpdateFunction(f.id, { saidas: v })} textClass="text-orange-600" />
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => onEdit(f)} className="p-1.5 rounded hover:bg-gray-700 text-gray-600 hover:text-gray-300 transition-colors">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => onDelete(f)} className="p-1.5 rounded hover:bg-gray-700 text-gray-600 hover:text-orange-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Desktop table layout (hidden below md) ── */}
            <div className="hidden md:block card p-0 overflow-hidden">
              {/* Account header */}
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/30 flex items-center gap-4 flex-wrap">
                {account ? (
                  <>
                    <span className="text-sm font-semibold text-gray-200">{account.apelido || account.name}</span>
                    <span className="text-xs text-gray-600">{fns.length} {fns.length === 1 ? 'função' : 'funções'}</span>
                    <span className="text-xs text-gray-500">
                      Σ saldos: <span className="text-gray-300 font-medium">{fmt(totalSaldo)}</span>
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-xs text-gray-500 shrink-0">Saldo Real:</label>
                      <input
                        className="input w-32 text-xs py-1 text-right"
                        type="number"
                        step="0.01"
                        value={saldoReal ?? ''}
                        onChange={e => onSetAccountBalance(accountId, e.target.value)}
                      />
                      {diff !== null && diff !== 0 && (
                        <span className={`text-xs font-medium shrink-0 ${diff >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-gray-500 italic">Sem conta vinculada</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 700 }}>
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Despesa Anual</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium w-28">Saldo Inicial</th>
                      <th className="text-right px-4 py-2 text-xs text-blue-600 font-medium w-28">Entradas (+)</th>
                      <th className="text-right px-4 py-2 text-xs text-orange-600 font-medium w-28">Saídas (−)</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium w-28">Saldo</th>
                      <th className="text-right px-4 py-2 text-xs text-emerald-400 font-medium w-32">Saldo Atualizado</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {fns.map(f => {
                      const saldo = computeSaldo(f)
                      const atualizado = saldosAtualizados[f.id] ?? saldo
                      return (
                        <tr
                          key={f.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(f.id) }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); handleDropOn(f) }}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${dragId === f.id ? 'opacity-40' : ''}`}
                        >
                          <td className="px-4 py-2 text-xs text-gray-200">
                            <span className="inline-flex items-center gap-1.5">
                              <GripVertical size={11} className="text-gray-700 cursor-grab shrink-0" />
                              {f.name}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-gray-400">{fmt(f.saldoInicial)}</td>
                          <td className="px-4 py-2 text-right">
                            <InlineEdit value={f.entradas} onSave={v => onUpdateFunction(f.id, { entradas: v })} textClass="text-blue-600" />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <InlineEdit value={f.saidas} onSave={v => onUpdateFunction(f.id, { saidas: v })} textClass="text-orange-600" />
                          </td>
                          <td className={`px-4 py-2 text-right text-xs font-semibold ${saldo < 0 ? 'text-orange-600' : 'text-gray-200'}`}>
                            {fmt(saldo)}
                          </td>
                          <td className={`px-4 py-2 text-right text-xs font-bold ${atualizado < 0 ? 'text-orange-600' : 'text-emerald-400'}`}>
                            {fmt(atualizado)}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              <button onClick={() => onEdit(f)} className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-gray-300 transition-colors">
                                <Edit2 size={11} />
                              </button>
                              <button onClick={() => onDelete(f)} className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-orange-400 transition-colors">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Totals row */}
                    <tr className="border-t border-gray-700 bg-gray-800/20">
                      <td className="px-4 py-2 text-xs font-semibold text-gray-500">Total</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-400">
                        {fmt(fns.reduce((s, f) => s + f.saldoInicial, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-blue-600">
                        {fmt(fns.reduce((s, f) => s + f.entradas, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-orange-600">
                        {fmt(fns.reduce((s, f) => s + f.saidas, 0))}
                      </td>
                      <td className={`px-4 py-2 text-right text-xs font-semibold ${totalSaldo < 0 ? 'text-orange-600' : 'text-gray-200'}`}>
                        {fmt(totalSaldo)}
                      </td>
                      <td className={`px-4 py-2 text-right text-xs font-bold ${totalAtualizado < 0 ? 'text-orange-600' : 'text-emerald-400'}`}>
                        {fmt(totalAtualizado)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab 2: Fluxo Futuro ─────────────────────────────────────────────────────
function FluxoTab({ functions, accounts, saldosAtualizados, schedules, getNextOccurrences }) {
  const linked = functions.filter(f => f.accountId)
  const round2 = (n) => Math.round(n * 100) / 100

  // Janela deslizante de 12 meses a partir do mês ANTERIOR ao atual.
  const windowMonths = useMemo(() => {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      return { year: d.getFullYear(), month0: d.getMonth(), label: MONTH_LABELS[d.getMonth()], isYearStart: d.getMonth() === 0 && i > 0 }
    })
  }, [])

  const winStart = `${windowMonths[0].year}-${String(windowMonths[0].month0 + 1).padStart(2, '0')}-01`
  const lastWm = windowMonths[11]
  const winEndDate = new Date(lastWm.year, lastWm.month0 + 1, 0)
  const winEnd = `${winEndDate.getFullYear()}-${String(winEndDate.getMonth() + 1).padStart(2, '0')}-${String(winEndDate.getDate()).padStart(2, '0')}`
  const winIndexOf = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return (d.getFullYear() - windowMonths[0].year) * 12 + (d.getMonth() - windowMonths[0].month0)
  }

  // Dep/Res por função/mês a partir dos AGENDAMENTOS reais (não dos campos de planejamento).
  // Apenas agendamentos com reservaFuncaoId entram — sem vínculo de função, ficam fora do fluxo.
  const scheduledByFunction = useMemo(() => {
    const accById = new Map(accounts.map(a => [a.id, a]))
    const transfers = (schedules || []).filter(s => s.transactionType === 'transfer' && s.reservaFuncaoId)
    const result = {}
    for (const f of linked) {
      const deps = new Array(12).fill(0)
      const ress = new Array(12).fill(0)
      for (const s of transfers) {
        if (s.reservaFuncaoId !== f.id) continue
        const isDep = !!accById.get(s.toAccountId)?.isReserva
        const isRes = !isDep && !!accById.get(s.accountId)?.isReserva
        if (!isDep && !isRes) continue
        for (const dateStr of getNextOccurrences(s, 140)) {
          if (dateStr < winStart || dateStr > winEnd) continue
          const idx = winIndexOf(dateStr)
          if (idx < 0 || idx > 11) continue
          if (isDep) deps[idx] = round2(deps[idx] + (s.amount || 0))
          else ress[idx] = round2(ress[idx] + (s.amount || 0))
        }
      }
      result[f.id] = { deps, ress }
    }
    return result
  }, [linked, accounts, schedules, getNextOccurrences, winStart, winEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const projections = useMemo(() => {
    return linked.map(f => {
      const account = accounts.find(a => a.id === f.accountId)
      const start = saldosAtualizados[f.id] ?? round2(f.saldoInicial + f.entradas - f.saidas)
      const schd = scheduledByFunction[f.id] || { deps: new Array(12).fill(0), ress: new Array(12).fill(0) }
      let bal = start
      const monthly = windowMonths.map((wm, i) => {
        const dep = schd.deps[i]
        const res = schd.ress[i]
        // mês anterior (i=0) é a referência do saldo atual; projeção começa no mês corrente
        if (i > 0) bal = round2(bal + dep - res)
        return { dep, res, saldo: bal, neg: bal < 0, ...wm }
      })
      const hasAlert = monthly.some(d => d.neg)
      return { f, account, monthly, hasAlert }
    })
  }, [linked, accounts, saldosAtualizados, scheduledByFunction, windowMonths])

  const totalInvested = linked.reduce((s, f) => s + (saldosAtualizados[f.id] || 0), 0)
  const [mobilePage, setMobilePage] = useState(0)

  const yy = (y) => String(y).slice(2)
  const rangeLabel = `${windowMonths[0].label}/${yy(windowMonths[0].year)} – ${lastWm.label}/${yy(lastWm.year)}`

  const handleExport = () => {
    const header = ['Função', 'Conta', 'Total Investido']
    windowMonths.forEach(wm => {
      const lbl = `${wm.label}/${yy(wm.year)}`
      header.push(`${lbl} Dep`, `${lbl} Res`, `${lbl} Saldo`)
    })
    const rows = [header]
    projections.forEach(({ f, account, monthly }) => {
      const row = [f.name, account ? (account.apelido || account.name) : '', saldosAtualizados[f.id] || 0]
      monthly.forEach(d => row.push(d.dep, d.res, d.saldo))
      rows.push(row)
    })
    exportSheet(rows, `reservas-fluxo-${mmYYYY()}.xlsx`)
  }

  if (linked.length === 0) {
    return (
      <div className="card text-center py-12">
        <Layers size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Nenhuma função vinculada a uma conta.</p>
        <p className="text-xs text-gray-600 mt-1">Edite as funções na aba Resumo para vincular uma conta.</p>
      </div>
    )
  }

  const alertCount = projections.filter(p => p.hasAlert).length
  const visibleMonths = [mobilePage, mobilePage + 1, mobilePage + 2]

  return (
    <div className="space-y-4">
      {/* KPI bar */}
      <div className="card py-2.5 px-4 flex items-center gap-4 flex-wrap">
        <Layers size={13} className="text-gray-400" />
        <span className="text-xs text-gray-500">Total investido:</span>
        <span className={`text-sm font-bold ${totalInvested >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(totalInvested)}</span>
        {alertCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-orange-600 ml-2">
            <AlertTriangle size={12} /> {alertCount} {alertCount === 1 ? 'função ficará negativa' : 'funções ficarão negativas'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-600">{rangeLabel}</span>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1">
            <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
          </button>
        </div>
      </div>

      {/* ── Mobile layout (hidden md+) ── */}
      <div className="md:hidden space-y-3">
        {/* Month navigator */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setMobilePage(p => Math.max(0, p - 1))}
            disabled={mobilePage === 0}
            className="p-1.5 rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-gray-400 font-medium">
            {visibleMonths.map(mi => `${windowMonths[mi].label}/${yy(windowMonths[mi].year)}`).join(' · ')}
          </span>
          <button
            onClick={() => setMobilePage(p => Math.min(9, p + 1))}
            disabled={mobilePage >= 9}
            className="p-1.5 rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Cards per function */}
        {projections.map(({ f, account, monthly, hasAlert }) => (
          <div key={f.id} className={`card p-0 overflow-hidden ${hasAlert ? 'border border-orange-500/30' : ''}`}>
            {/* Card header */}
            <div className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2">
              {hasAlert && <AlertTriangle size={11} className="text-orange-600 shrink-0" />}
              <span className="text-sm font-medium text-gray-200 flex-1 truncate">{f.name}</span>
              {account && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">
                  {account.apelido || account.name.slice(0, 8)}
                </span>
              )}
              <span className={`text-xs font-semibold shrink-0 ${(saldosAtualizados[f.id] || 0) < 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                {fmt(saldosAtualizados[f.id] || 0)}
              </span>
            </div>

            {/* 3 month columns */}
            <div className="grid grid-cols-3 divide-x divide-gray-800">
              {visibleMonths.map(mi => {
                const d = monthly[mi]
                return (
                  <div key={mi} className={`px-2 py-2.5 ${d.neg ? 'bg-orange-500/10' : ''} ${d.isYearStart ? 'border-l-2 border-l-emerald-700' : ''}`}>
                    <p className="text-[10px] text-gray-500 font-semibold uppercase mb-1.5">
                      {d.label}{d.isYearStart || mi === 0 ? ` ${yy(d.year)}` : ''}
                    </p>
                    <p className={`text-xs ${d.dep > 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                      ↓ {d.dep > 0 ? fmt(d.dep) : '—'}
                    </p>
                    <p className={`text-xs ${d.res > 0 ? 'text-orange-600' : 'text-gray-700'}`}>
                      ↑ {d.res > 0 ? fmt(d.res) : '—'}
                    </p>
                    <p className={`text-xs font-semibold mt-1 ${d.neg ? 'text-orange-400' : d.saldo === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                      {fmt(d.saldo)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop layout (hidden below md) ── */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-3 py-2.5 text-gray-400 font-medium whitespace-nowrap" style={{ minWidth: 160 }}>Função</th>
                <th className="text-left px-3 py-2.5 text-gray-400 font-medium" style={{ minWidth: 80 }}>Conta</th>
                <th className="text-right px-3 py-2.5 text-gray-400 font-medium" style={{ minWidth: 100 }}>Total Investido</th>
                {windowMonths.map((wm, i) => (
                  <th
                    key={i}
                    colSpan={3}
                    className={`text-center px-1 py-2 font-medium whitespace-nowrap ${wm.isYearStart ? 'border-l-2 border-l-emerald-700 text-emerald-300' : 'border-l border-gray-800 text-gray-400'}`}
                    style={{ minWidth: 190 }}
                  >
                    {wm.label}{wm.isYearStart || i === 0 ? ` ${wm.year}` : ''}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-700 bg-gray-900/80">
                <th /><th /><th />
                {windowMonths.map((wm, i) => (
                  <Fragment key={i}>
                    <th className={`text-right px-2 py-1.5 text-blue-600/70 font-medium whitespace-nowrap ${wm.isYearStart ? 'border-l-2 border-l-emerald-700' : 'border-l border-gray-800'}`} style={{ minWidth: 62 }}>Dep</th>
                    <th className="text-right px-2 py-1.5 text-orange-600/70 font-medium whitespace-nowrap" style={{ minWidth: 62 }}>Res</th>
                    <th className="text-right px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap" style={{ minWidth: 66 }}>Saldo</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {projections.map(({ f, account, monthly, hasAlert }) => (
                <tr key={f.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${hasAlert ? 'bg-orange-500/5' : ''}`}>
                  <td className="px-3 py-2 text-gray-200 whitespace-nowrap">
                    {hasAlert && <AlertTriangle size={10} className="inline text-orange-600 mr-1" />}
                    {f.name}
                  </td>
                  <td className="px-3 py-2">
                    {account
                      ? <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{account.apelido || account.name.slice(0, 8)}</span>
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${(saldosAtualizados[f.id] || 0) < 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                    {fmt(saldosAtualizados[f.id] || 0)}
                  </td>
                  {monthly.map((d, mi) => (
                    <Fragment key={mi}>
                      <td className={`px-2 py-2 text-right ${d.isYearStart ? 'border-l-2 border-l-emerald-700' : 'border-l border-gray-800'} ${d.dep > 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                        {d.dep > 0 ? fmt(d.dep) : '—'}
                      </td>
                      <td className={`px-2 py-2 text-right ${d.res > 0 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {d.res > 0 ? fmt(d.res) : '—'}
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold ${d.neg ? 'text-orange-400 bg-orange-500/15' : d.saldo === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                        {fmt(d.saldo)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ──────────────────────────────────────────────────────────────
export default function ReservasPanel() {
  const { profileAccounts: accounts, profileTransactions: transactions, categories, profileSchedules: schedules, getFinancialPeriod, getNextOccurrences, reorderReserveFunctions } = useApp()
  const { functions, accountBalances, periods, addFunction, updateFunction, deleteFunction, setAccountBalance, virarSaldo, undoVirarSaldo } = useReservas()
  const [tab, setTab] = useState('contas')
  const [showForm, setShowForm] = useState(false)
  const [editFn, setEditFn] = useState(null)
  const [confirmVirar, setConfirmVirar] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const computeSaldo = (f) => Math.round((f.saldoInicial + f.entradas - f.saidas) * 100) / 100

  const saldosAtualizados = useMemo(() => {
    const result = {}
    const byAccount = {}
    functions.forEach(f => {
      if (!f.accountId) return
      ;(byAccount[f.accountId] = byAccount[f.accountId] || []).push(f)
    })
    Object.entries(byAccount).forEach(([accId, fns]) => {
      const account = accounts.find(a => a.id === accId)
      const totalSaldo = fns.reduce((s, f) => s + computeSaldo(f), 0)
      const saldoReal = accountBalances[accId] !== undefined
        ? accountBalances[accId]
        : (account?.balance || 0)
      fns.forEach(f => {
        const saldo = computeSaldo(f)
        result[f.id] = totalSaldo === 0 ? 0 : Math.round(saldo * (saldoReal / totalSaldo) * 100) / 100
      })
    })
    functions.filter(f => !f.accountId).forEach(f => { result[f.id] = computeSaldo(f) })
    return result
  }, [functions, accounts, accountBalances])

  const handleVirar = () => {
    virarSaldo(saldosAtualizados)
    setConfirmVirar(false)
  }

  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit')
  const reservaAccounts = useMemo(() => accounts.filter(a => a.isReserva), [accounts])
  const lastPeriod = periods[periods.length - 1]

  const period = getFinancialPeriod()
  const periodStart = period.start.toISOString().split('T')[0]
  const periodEnd = period.end.toISOString().split('T')[0]

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800 overflow-x-auto scrollbar-none">
        {[
          { id: 'contas', label: 'Contas Reserva' },
          { id: 'resumo', label: 'Resumo' },
          { id: 'fluxo', label: 'Fluxo Futuro' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 sm:px-4 pb-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'border-[#0F6E56] text-[#0F6E56]'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'contas' && (
        <ContasReservaTab
          reservaAccounts={reservaAccounts}
          transactions={transactions}
          categories={categories}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      )}

      {tab === 'resumo' && (
        <ResumoTab
          functions={functions}
          accounts={nonCreditAccounts}
          accountBalances={accountBalances}
          periods={periods}
          saldosAtualizados={saldosAtualizados}
          computeSaldo={computeSaldo}
          onAdd={() => { setEditFn(null); setShowForm(true) }}
          onEdit={f => { setEditFn(f); setShowForm(true) }}
          onDelete={f => setConfirmDelete(f)}
          onUpdateFunction={updateFunction}
          onSetAccountBalance={setAccountBalance}
          onVirar={() => setConfirmVirar(true)}
          onUndo={() => setConfirmUndo(true)}
          onReorder={reorderReserveFunctions}
        />
      )}

      {tab === 'fluxo' && (
        <FluxoTab
          functions={functions}
          accounts={nonCreditAccounts}
          saldosAtualizados={saldosAtualizados}
          schedules={schedules}
          getNextOccurrences={getNextOccurrences}
        />
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditFn(null) }}
        title={editFn ? 'Editar Função de Reserva' : 'Nova Função de Reserva'}
      >
        <FunctionForm
          initial={editFn}
          accounts={nonCreditAccounts}
          onSubmit={data => {
            if (editFn) updateFunction(editFn.id, data)
            else addFunction(data)
            setShowForm(false)
            setEditFn(null)
          }}
          onClose={() => { setShowForm(false); setEditFn(null) }}
        />
      </Modal>

      <ConfirmDialog
        open={confirmVirar}
        onClose={() => setConfirmVirar(false)}
        onConfirm={handleVirar}
        title="Virar Saldo"
        message="O Saldo Atualizado de cada função se tornará o novo Saldo Inicial, e Entradas/Saídas serão zeradas. Um histórico do período atual será salvo."
      />

      <ConfirmDialog
        open={confirmUndo}
        onClose={() => setConfirmUndo(false)}
        onConfirm={() => { undoVirarSaldo(); setConfirmUndo(false) }}
        title="Desfazer Virada de Saldo"
        message={`Restaurar o período anterior? (fechado em ${lastPeriod?.closedAt || '?'}). Saldos iniciais, entradas e saídas serão restaurados.`}
        danger
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteFunction(confirmDelete.id); setConfirmDelete(null) }}
        title="Excluir Função de Reserva"
        message={`Excluir a função "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        danger
      />
    </div>
  )
}
