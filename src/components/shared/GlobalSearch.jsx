import { useState, useMemo } from 'react'
import { Search, ArrowRight, Loader2 } from 'lucide-react'
import Modal from './Modal'
import DateInput from './DateInput'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from './utils'
import { searchEntries } from '../../lib/db'
import { getEffectiveStatus, STATUS } from '../../lib/statusEfetivo'
import { itensVisiveisBusca, selosReservaPorPai, ehSombraAutomatica } from '../../lib/buscaGlobal'
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
  { id: 'pago', label: 'Registrado' },
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
  // Conjunto encontrado pela busca (null = ainda não buscou). O filtro de status é aplicado
  // na renderização, então Todos/Registrado/Pendente refiltram na hora, sem nova busca.
  const [found, setFound] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [editTx, setEditTx] = useState(null)
  const [editSchedule, setEditSchedule] = useState(null)

  const accById = useMemo(() => new Map(allAccounts.map(a => [a.id, a])), [allAccounts])
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const gerById = useMemo(() => new Map(gerencialGroups.map(g => [g.id, g])), [gerencialGroups])
  const txById = useMemo(() => new Map(transactions.map(t => [t.id, t])), [transactions])
  const selosPorPai = useMemo(() => selosReservaPorPai(transactions), [transactions])
  const accName = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }
  const catLabel = (id) => { const c = catById.get(id); return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : null }

  // Filtro client-side (fallback quando o endpoint /api/search não responde).
  const clientFilter = () => {
    const v = parseValor(value)
    const q = text.trim().toLowerCase()
    const matchValue = (amt) => v == null || Math.abs(Math.abs(Number(amt)) - v) <= 0.01
    const matchText = (d, p) => !q || `${d || ''} ${p || ''}`.toLowerCase().includes(q)
    const txItems = transactions.filter(t =>
      !ehSombraAutomatica(t) && matchValue(t.amount) && matchText(t.description, t.payee) &&
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
      setFound(null)
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
    setFound({ txIds: txItems.map(t => t.id), scIds: scItems.map(s => s.id) })
    setLoading(false)
  }

  const scheduleStatus = (s) => {
    const next = getNextOccurrences(s, 1)[0] || null
    const registered = (s.registered || []).length
    const tdy = todayStr()
    if (next && next < tdy) return { label: 'Atrasado', cls: 'bg-despesa/20 text-despesa', next, registered }
    if (next) return { label: `Próxima ${fmtDate(next)}`, cls: 'bg-receita/15 text-receita', next, registered }
    return { label: registered > 0 ? 'Concluído' : 'Sem ocorrências', cls: 'bg-surface-2 text-texto-2', next: null, registered }
  }

  const buildResults = (txItems, scItems) => {
    const out = []
    const hoje = todayStr()
    const sts = new Map(scItems.map(s => [s.id, scheduleStatus(s)]))
    const filtrados = itensVisiveisBusca({
      txs: txItems, schedules: scItems, filtro: status, txById, hoje, temProxima: s => !!sts.get(s.id).next,
    })
    for (const t of filtrados.txs) {
      const paid = getEffectiveStatus(t, txById, hoje) === STATUS.REGISTRADO
      out.push({
        kind: 'tx', id: t.id, obj: t,
        sortDate: t.date || '',
        type: t.type,
        date: t.date,
        dateCartao: t.accountType === 'credit' ? (t.dateCartao || null) : null,
        conta: t.type === 'transfer' ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : accName(t.accountId),
        selos: selosPorPai.get(t.id) || [],
        amount: t.amount,
        desc: t.description || '',
        payee: t.payee || '',
        categoria: catLabel(t.categoryId),
        gerencial: (t.type === 'expense' && t.accountType === 'credit' && t.grupoGerencial) ? (gerById.get(t.grupoGerencial)?.name || null) : null,
        statusLabel: paid ? 'Registrado' : 'Pendente',
        statusCls: paid ? 'bg-receita/15 text-receita' : 'bg-surface-2 text-texto-2',
      })
    }
    for (const s of filtrados.schedules) {
      const st = sts.get(s.id)
      // Pendente = tem próxima ocorrência a executar; senão (só ocorrências já
      // registradas) = Registrado. Mantém a paleta azul/cinza (sem verde/vermelho).
      const pendente = !!st.next
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
        statusLabel: pendente ? 'Pendente' : 'Registrado',
        statusCls: pendente ? 'bg-surface-2 text-texto-2' : 'bg-receita/15 text-receita',
      })
    }
    out.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''))
    return out.slice(0, 50)
  }

  const amountColor = (type) =>
    type === 'income' ? 'text-receita' : type === 'expense' ? 'text-despesa' : 'text-texto-2'

  const handleClickResult = (r) => {
    if (r.kind === 'tx') setEditTx(r.obj)
    else setEditSchedule(r.obj)
  }

  const renderItem = (r) => (
    <button
      key={`${r.kind}_${r.id}`}
      type="button"
      onClick={() => handleClickResult(r)}
      className="w-full text-left card p-3 hover:bg-surface-hover/60 transition-colors flex items-start gap-3 group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${r.kind === 'tx' ? 'bg-surface-2 text-texto-2' : 'bg-surface-2 text-texto-2'}`}>
            {r.kind === 'tx' ? 'Lançamento' : 'Agendamento'}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.statusCls}`}>{r.statusLabel}</span>
          {(r.selos || []).map(selo => (
            <span key={selo} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-reserva">{selo}</span>
          ))}
          <span className="text-xs text-texto-3">
            {r.date ? fmtDate(r.date) : '—'}
            {r.dateCartao && <span className="text-texto-3"> · cartão {fmtDate(r.dateCartao)}</span>}
          </span>
        </div>
        <p className="text-sm text-texto-1 truncate mt-1">
          {r.desc || r.payee || '(sem descrição)'}
          {r.payee && r.desc && <span className="text-texto-3"> · {r.payee}</span>}
        </p>
        <p className="text-xs text-texto-3 truncate mt-0.5">
          {r.conta}
          {r.categoria && <span> · {r.categoria}</span>}
          {r.gerencial && <span className="text-reserva"> · {r.gerencial}</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${amountColor(r.type)}`}>{fmt(r.amount)}</p>
        <ArrowRight size={14} className="text-texto-3 group-hover:text-texto-2 ml-auto mt-1 transition-colors" />
      </div>
    </button>
  )

  const reset = () => {
    setValue(''); setText(''); setFrom(''); setTo(''); setStatus('todos'); setFound(null); setError('')
  }

  // Objetos vivos em memória (edições refletem na hora) + filtro de status atual.
  const results = useMemo(() => {
    if (!found) return null
    const txIds = new Set(found.txIds), scIds = new Set(found.scIds)
    return buildResults(transactions.filter(t => txIds.has(t.id)), schedules.filter(s => scIds.has(s.id)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, status, transactions, schedules, txById, selosPorPai, accById, catById, gerById])

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
            <div className="flex gap-1 bg-surface-2/60 rounded-lg p-1">
              {STATUS_OPTIONS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setStatus(o.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    status === o.id ? 'bg-primary text-white' : 'text-texto-2 hover:text-texto-1'
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

        {/* Resultados — combinados, ordenados por data, separados por seção. */}
        {results !== null && (() => {
          const txResults = results.filter(r => r.kind === 'tx')
          const schedResults = results.filter(r => r.kind === 'sched')
          return (
            <div className="mt-4">
              {results.length === 0 ? (
                <p className="text-xs text-texto-3 mb-2">Nenhum resultado encontrado.</p>
              ) : (
                <>
                  {results.length === 50 && (
                    <p className="text-[11px] text-texto-3 mb-2">Mostrando os 50 resultados mais recentes.</p>
                  )}
                  <div className="space-y-4 max-h-[55vh] overflow-y-auto overscroll-contain">
                    {txResults.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-texto-2 mb-1.5 sticky top-0 bg-surface py-1 z-10">
                          Lançamentos ({txResults.length})
                        </p>
                        <div className="space-y-1.5">{txResults.map(renderItem)}</div>
                      </div>
                    )}
                    {schedResults.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-texto-2 mb-1.5 sticky top-0 bg-surface py-1 z-10">
                          Agendamentos ({schedResults.length})
                        </p>
                        <div className="space-y-1.5">{schedResults.map(renderItem)}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })()}
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
