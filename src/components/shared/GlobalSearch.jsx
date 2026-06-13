import { useState, useMemo } from 'react'
import { Search, ArrowRight, Loader2 } from 'lucide-react'
import Modal from './Modal'
import DateInput from './DateInput'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from './utils'
import { searchEntries } from '../../lib/db'
import TransactionForm from '../Transactions/TransactionForm'
import ScheduleForm from '../Schedule/ScheduleForm'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Aceita "100", "100,50", "1.234,56" ou "100.50".
function parseValor(s) {
  if (s === null || s === undefined || s === '') return null
  let str = String(s).trim().replace(/\s/g, '')
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(str)
  return Number.isNaN(n) ? null : n
}

const STATUS_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pago', label: 'Pago / Registrado' },
  { id: 'naopago', label: 'Pendente' },
]

export default function GlobalSearch({ open, onClose }) {
  const {
    accounts: allAccounts, profileTransactions: transactions, profileSchedules: schedules,
    categories, gerencialGroups = [], getNextOccurrences, activeProfileId,
  } = useApp()

  const [value, setValue] = useState('')
  const [text, setText] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('todos')
  const [results, setResults] = useState(null) // null = ainda não buscou
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [editTx, setEditTx] = useState(null)
  const [editSchedule, setEditSchedule] = useState(null)

  const accById = useMemo(() => new Map(allAccounts.map(a => [a.id, a])), [allAccounts])
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const gerById = useMemo(() => new Map(gerencialGroups.map(g => [g.id, g])), [gerencialGroups])
  const accName = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }
  const catLabel = (id) => { const c = catById.get(id); return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : null }

  // Filtro client-side (fallback quando o endpoint /api/search não responde).
  const clientFilter = () => {
    const v = parseValor(value)
    const q = text.trim().toLowerCase()
    const matchValue = (amt) => v == null || Math.abs(Math.abs(Number(amt)) - v) <= 0.01
    const matchText = (d, p) => !q || `${d || ''} ${p || ''}`.toLowerCase().includes(q)
    const txItems = transactions.filter(t =>
      matchValue(t.amount) && matchText(t.description, t.payee) &&
      (!from || (t.date && t.date >= from)) && (!to || (t.date && t.date <= to))
    )
    const scItems = schedules.filter(s =>
      matchValue(s.amount) && matchText(s.description, s.payee) &&
      (!to || (s.startDate && s.startDate <= to))
    )
    return { txItems, scItems }
  }

  const runSearch = async (e) => {
    e?.preventDefault()
    const v = parseValor(value)
    if (v == null && !text.trim()) {
      setError('Informe um valor ou um texto (descrição/favorecido) para buscar.')
      setResults(null)
      return
    }
    setError('')
    setLoading(true)
    let txItems, scItems
    try {
      const { transactions: txRows, schedules: scRows } = await searchEntries({
        value: v, text: text.trim(), from: from || null, to: to || null, profileId: activeProfileId || null,
      })
      // Usa os objetos vivos em memória (para edição consistente); o endpoint define o conjunto.
      const txIds = new Set((txRows || []).map(r => r.id))
      const scIds = new Set((scRows || []).map(r => r.id))
      txItems = transactions.filter(t => txIds.has(t.id))
      scItems = schedules.filter(s => scIds.has(s.id))
    } catch {
      // Endpoint indisponível (ex.: ambiente sem deploy) → busca local em memória.
      ({ txItems, scItems } = clientFilter())
    }
    setResults(buildResults(txItems, scItems))
    setLoading(false)
  }

  const scheduleStatus = (s) => {
    const next = getNextOccurrences(s, 1)[0] || null
    const registered = (s.registered || []).length
    const tdy = todayStr()
    if (next && next < tdy) return { label: 'Atrasado', cls: 'bg-despesa/20 text-despesa', next, registered }
    if (next) return { label: `Próxima ${fmtDate(next)}`, cls: 'bg-receita/15 text-receita', next, registered }
    return { label: registered > 0 ? 'Concluído' : 'Sem ocorrências', cls: 'bg-gray-600/30 text-gray-300', next: null, registered }
  }

  const buildResults = (txItems, scItems) => {
    const out = []
    for (const t of txItems) {
      const paid = !!t.reconciled
      if (status === 'pago' && !paid) continue
      if (status === 'naopago' && paid) continue
      out.push({
        kind: 'tx', id: t.id, obj: t,
        sortDate: t.date || '',
        type: t.type,
        date: t.date,
        dateCartao: t.accountType === 'credit' ? (t.dateCartao || null) : null,
        conta: t.type === 'transfer' ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : accName(t.accountId),
        amount: t.amount,
        desc: t.description || '',
        payee: t.payee || '',
        categoria: catLabel(t.categoryId),
        gerencial: (t.type === 'expense' && t.accountType === 'credit' && t.grupoGerencial) ? (gerById.get(t.grupoGerencial)?.name || null) : null,
        statusLabel: paid ? 'Pago' : 'Não pago',
        statusCls: paid ? 'bg-receita/15 text-receita' : 'bg-gray-600/30 text-gray-400',
      })
    }
    for (const s of scItems) {
      const st = scheduleStatus(s)
      if (status === 'pago' && st.registered === 0) continue
      if (status === 'naopago' && !st.next) continue
      out.push({
        kind: 'sched', id: s.id, obj: s,
        sortDate: st.next || s.startDate || '',
        type: s.transactionType,
        date: st.next || s.startDate,
        dateCartao: null,
        conta: s.transactionType === 'transfer' ? `${accName(s.accountId)} → ${accName(s.toAccountId)}` : (s.accountId ? accName(s.accountId) : '—'),
        amount: s.amount,
        desc: s.description || '',
        payee: s.payee || '',
        categoria: catLabel(s.categoryId),
        gerencial: null,
        statusLabel: st.label,
        statusCls: st.cls,
      })
    }
    out.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''))
    return out.slice(0, 50)
  }

  const amountColor = (type) =>
    type === 'income' ? 'text-receita' : type === 'expense' ? 'text-despesa' : 'text-gray-300'

  const handleClickResult = (r) => {
    if (r.kind === 'tx') setEditTx(r.obj)
    else setEditSchedule(r.obj)
  }

  const reset = () => {
    setValue(''); setText(''); setFrom(''); setTo(''); setStatus('todos'); setResults(null); setError('')
  }

  return (
    <>
      <Modal open={open} onClose={() => { reset(); onClose() }} title="Busca Global" size="lg">
        <form onSubmit={runSearch} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Valor</label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="Ex: 1500 ou 1.234,56"
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Descrição / Favorecido</label>
              <input
                className="input"
                placeholder="Buscar no texto..."
                value={text}
                onChange={e => setText(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Data de</label>
              <DateInput className="input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Data até</label>
              <DateInput className="input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1">
              {STATUS_OPTIONS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setStatus(o.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    status === o.id ? 'bg-[#0F6E56] text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>

          {error && <p className="text-xs text-despesa">{error}</p>}
        </form>

        {/* Resultados */}
        {results !== null && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">
              {results.length === 0 ? 'Nenhum resultado encontrado.' : `${results.length} resultado${results.length > 1 ? 's' : ''}${results.length === 50 ? ' (máx.)' : ''}`}
            </p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto overscroll-contain">
              {results.map(r => (
                <button
                  key={`${r.kind}_${r.id}`}
                  type="button"
                  onClick={() => handleClickResult(r)}
                  className="w-full text-left card p-3 hover:bg-gray-800/60 transition-colors flex items-start gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${r.kind === 'tx' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {r.kind === 'tx' ? 'Lançamento' : 'Agendamento'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.statusCls}`}>{r.statusLabel}</span>
                      <span className="text-xs text-gray-500">
                        {r.date ? fmtDate(r.date) : '—'}
                        {r.dateCartao && <span className="text-gray-600"> · cartão {fmtDate(r.dateCartao)}</span>}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200 truncate mt-1">
                      {r.desc || r.payee || '(sem descrição)'}
                      {r.payee && r.desc && <span className="text-gray-500"> · {r.payee}</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {r.conta}
                      {r.categoria && <span> · {r.categoria}</span>}
                      {r.gerencial && <span className="text-purple-400"> · {r.gerencial}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${amountColor(r.type)}`}>{fmt(r.amount)}</p>
                    <ArrowRight size={14} className="text-gray-600 group-hover:text-gray-300 ml-auto mt-1 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Editores reaproveitados */}
      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="Editar Lançamento">
        {editTx && <TransactionForm initial={editTx} onClose={() => setEditTx(null)} />}
      </Modal>
      <Modal open={!!editSchedule} onClose={() => setEditSchedule(null)} title="Editar Agendamento" size="lg">
        {editSchedule && <ScheduleForm initial={editSchedule} onClose={() => setEditSchedule(null)} />}
      </Modal>
    </>
  )
}
