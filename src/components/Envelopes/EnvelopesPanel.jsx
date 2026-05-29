import { useState, useMemo } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Package, Plus, Edit2, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import Modal from '../shared/Modal'

// ── Period logic ──────────────────────────────────────────────────────────────
// period runs from (dueDay+1) of one month to (dueDay) of the next
export function getEnvelopePeriod(dueDay) {
  const today = new Date()
  const day = today.getDate()
  let from, to
  if (day <= dueDay) {
    from = new Date(today.getFullYear(), today.getMonth() - 1, dueDay + 1)
    to   = new Date(today.getFullYear(), today.getMonth(),     dueDay)
  } else {
    from = new Date(today.getFullYear(), today.getMonth(),     dueDay + 1)
    to   = new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
  }
  return {
    from: format(from, 'yyyy-MM-dd'),
    to:   format(to,   'yyyy-MM-dd'),
  }
}

// ── EnvelopeForm ──────────────────────────────────────────────────────────────
function EnvelopeForm({ initial, onSave, onCancel, categories, accounts }) {
  const [name,        setName]        = useState(initial?.name        ?? '')
  const [limitAmount, setLimitAmount] = useState(initial?.limitAmount ?? '')
  const [dueDay,      setDueDay]      = useState(initial?.dueDay      ?? 13)
  const [categoryIds, setCategoryIds] = useState(initial?.categoryIds ?? [])
  const [accountId,   setAccountId]   = useState(initial?.accountId   ?? '')

  const valid = name.trim() && Number(limitAmount) > 0 && Number(dueDay) >= 1 && Number(dueDay) <= 28

  function toggleCat(id) {
    setCategoryIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const expCats     = categories.filter(c => c.type === 'expense' || c.type === 'both')
  const nonCreditAc = accounts.filter(a => a.type !== 'credit')

  // group categories for display
  const grouped = useMemo(() => {
    const map = {}
    expCats.forEach(cat => {
      const g = cat.group || '— Sem grupo —'
      if (!map[g]) map[g] = []
      map[g].push(cat)
    })
    return map
  }, [expCats])

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Nome do Envelope</label>
        <input className="input" placeholder="ex: Mercado" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Limite Mensal (R$)</label>
          <input
            className="input" type="number" min="0" step="0.01"
            placeholder="0,00" value={limitAmount}
            onChange={e => setLimitAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Dia de Vencimento (1–28)</label>
          <input
            className="input" type="number" min="1" max="28"
            value={dueDay} onChange={e => setDueDay(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Conta Vinculada</label>
        <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">Nenhuma</option>
          {nonCreditAc.map(a => (
            <option key={a.id} value={a.id}>{a.apelido || a.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Categorias Vinculadas ({categoryIds.length} selecionada{categoryIds.length !== 1 ? 's' : ''})</label>
        <div className="max-h-52 overflow-y-auto border border-gray-700 rounded-lg divide-y divide-gray-800/50">
          {Object.entries(grouped).map(([group, cats]) => (
            <div key={group}>
              <p className="px-3 py-1.5 text-xs text-gray-500 font-semibold uppercase tracking-wide bg-gray-800/40">{group}</p>
              {cats.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(cat.id)}
                    onChange={() => toggleCat(cat.id)}
                    className="accent-indigo-500 shrink-0"
                  />
                  <span className="text-sm text-gray-300">{cat.icon} {cat.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" onClick={() => onSave({ name: name.trim(), limitAmount: Number(limitAmount), dueDay: Number(dueDay), categoryIds, accountId: accountId || null })} disabled={!valid}>
          Salvar
        </button>
      </div>
    </div>
  )
}

// ── EnvelopeCard ──────────────────────────────────────────────────────────────
function EnvelopeCard({ envelope, spent, daysUntilDue, onClick }) {
  const pct      = envelope.limitAmount > 0 ? (spent / envelope.limitAmount) * 100 : 0
  const remaining = envelope.limitAmount - spent
  const barWidth = Math.min(pct, 100)
  const barColor = pct <= 80 ? 'bg-blue-500' : pct <= 100 ? 'bg-orange-500' : 'bg-red-500'

  let dueLabel, dueColor
  if (daysUntilDue < 0)      { dueLabel = 'Em atraso';       dueColor = 'text-red-400' }
  else if (daysUntilDue === 0){ dueLabel = 'Vence hoje';      dueColor = 'text-orange-400' }
  else if (daysUntilDue === 1){ dueLabel = 'Vence amanhã';    dueColor = 'text-orange-400' }
  else                        { dueLabel = `Vence em ${daysUntilDue} dia${daysUntilDue !== 1 ? 's' : ''}`; dueColor = 'text-gray-400' }

  return (
    <button className="card text-left w-full hover:bg-gray-800/80 transition-colors group" onClick={onClick}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-12">
          <p className="text-sm font-semibold text-gray-200 truncate">{envelope.name}</p>
          <p className={`text-xs mt-0.5 ${dueColor}`}>{dueLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500">Limite</p>
          <p className="text-sm font-bold text-gray-300">{fmt(envelope.limitAmount)}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Gasto: <span className="text-gray-200 font-medium">{fmt(spent)}</span></span>
          {remaining >= 0
            ? <span className="text-gray-400">Restante: <span className="text-blue-400 font-medium">{fmt(remaining)}</span></span>
            : <span className="text-red-400 font-medium">Excedido: {fmt(-remaining)}</span>
          }
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{pct.toFixed(0)}% utilizado</span>
        <span className="text-gray-700 group-hover:text-gray-500 transition-colors">Ver lançamentos ›</span>
      </div>
    </button>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ data, categories, accounts, onClose }) {
  const { env, period, txs, spent } = data
  const remaining = env.limitAmount - spent
  const account   = accounts.find(a => a.id === env.accountId)

  const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Limite</p>
          <p className="text-base font-bold text-gray-200">{fmt(env.limitAmount)}</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gasto</p>
          <p className="text-base font-bold text-orange-400">{fmt(spent)}</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Restante</p>
          <p className={`text-base font-bold ${remaining >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {fmt(Math.abs(remaining))}
          </p>
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>Período: {period.from.slice(8).split('-').reverse().join('/')} / {period.from.slice(0,7).split('-').reverse().join('/')} → {period.to.slice(8).split('-').reverse().join('/')} / {period.to.slice(0,7).split('-').reverse().join('/')}</span>
        {account && <span>Conta: {account.apelido || account.name}</span>}
      </div>

      {/* Transactions */}
      {sortedTxs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">Nenhum lançamento neste período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-1 text-xs text-gray-400 font-medium w-24">Data</th>
                <th className="text-left py-2 px-1 text-xs text-gray-400 font-medium">Descrição</th>
                <th className="text-left py-2 px-1 text-xs text-gray-400 font-medium hidden sm:table-cell">Categoria</th>
                <th className="text-right py-2 px-1 text-xs text-gray-400 font-medium w-28">Valor</th>
              </tr>
            </thead>
            <tbody>
              {sortedTxs.map(tx => {
                const cat = categories.find(c => c.id === tx.categoryId)
                const d = tx.date
                return (
                  <tr key={tx.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                    <td className="py-2.5 px-1 text-xs text-gray-400 whitespace-nowrap">
                      {d.slice(8)}/{d.slice(5,7)}/{d.slice(0,4)}
                    </td>
                    <td className="py-2.5 px-1 text-xs text-gray-300 max-w-xs truncate">{tx.description}</td>
                    <td className="py-2.5 px-1 text-xs text-gray-400 hidden sm:table-cell">
                      {cat ? `${cat.icon} ${cat.name}` : '—'}
                    </td>
                    <td className="py-2.5 px-1 text-xs font-semibold text-orange-400 text-right whitespace-nowrap">
                      {fmt(tx.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-700">
                <td colSpan={2} className="py-2.5 px-1 text-xs text-gray-400 font-semibold">Total</td>
                <td className="hidden sm:table-cell" />
                <td className="py-2.5 px-1 text-xs font-bold text-orange-400 text-right">{fmt(spent)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function EnvelopesPanel() {
  const { envelopes, addEnvelope, updateEnvelope, deleteEnvelope, transactions, categories, accounts } = useApp()
  const [showForm,  setShowForm]  = useState(false)
  const [editEnv,   setEditEnv]   = useState(null)
  const [detailId,  setDetailId]  = useState(null)

  const envelopeData = useMemo(() => {
    return envelopes.map(env => {
      const period = getEnvelopePeriod(env.dueDay)
      const txs    = transactions.filter(tx =>
        tx.type === 'expense' &&
        env.categoryIds.includes(tx.categoryId) &&
        tx.date >= period.from &&
        tx.date <= period.to
      )
      const spent       = txs.reduce((s, t) => s + t.amount, 0)
      const daysUntilDue = differenceInDays(parseISO(period.to), new Date())
      return { env, period, txs, spent, daysUntilDue }
    })
  }, [envelopes, transactions])

  function handleSave(data) {
    if (editEnv) updateEnvelope(editEnv.id, data)
    else         addEnvelope(data)
    setShowForm(false)
    setEditEnv(null)
  }

  function openEdit(env) {
    setEditEnv(env)
    setShowForm(true)
  }

  function openNew() {
    setEditEnv(null)
    setShowForm(true)
  }

  const detail = envelopeData.find(d => d.env.id === detailId)

  // summary KPIs
  const totalLimit   = envelopes.reduce((s, e) => s + e.limitAmount, 0)
  const totalSpent   = envelopeData.reduce((s, d) => s + d.spent, 0)
  const totalRemain  = totalLimit - totalSpent

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-100">Envelopes</h1>
          <p className="text-xs text-gray-500 mt-0.5">Controle de gastos por categoria com limite mensal</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={openNew}>
          <Plus size={14} /> Novo Envelope
        </button>
      </div>

      {/* Summary KPIs (only when there are envelopes) */}
      {envelopes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Limite</p>
            <p className="text-xl font-bold text-gray-200 mt-1">{fmt(totalLimit)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Gasto</p>
            <p className="text-xl font-bold text-orange-400 mt-1">{fmt(totalSpent)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Restante</p>
            <p className={`text-xl font-bold mt-1 ${totalRemain >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {fmt(Math.abs(totalRemain))}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {envelopes.length === 0 && (
        <div className="card text-center py-14">
          <Package size={44} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold">Nenhum envelope cadastrado</p>
          <p className="text-gray-600 text-sm mt-1 max-w-xs mx-auto">
            Crie envelopes para controlar seus gastos mensais por categoria — mercado, combustível, lazer, etc.
          </p>
          <button className="btn-primary mt-5" onClick={openNew}>Criar primeiro envelope</button>
        </div>
      )}

      {/* Cards grid */}
      {envelopes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {envelopeData.map(({ env, period, txs, spent, daysUntilDue }) => (
            <div key={env.id} className="relative">
              <EnvelopeCard
                envelope={env}
                spent={spent}
                daysUntilDue={daysUntilDue}
                onClick={() => setDetailId(env.id)}
              />
              {/* action buttons */}
              <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1.5 rounded-md hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                  onClick={e => { e.stopPropagation(); openEdit(env) }}
                  title="Editar envelope"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors"
                  onClick={e => {
                    e.stopPropagation()
                    if (window.confirm(`Excluir envelope "${env.name}"?`)) deleteEnvelope(env.id)
                  }}
                  title="Excluir envelope"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hover trick: make buttons always visible on touch */}
      <style>{`.relative:hover .opacity-0 { opacity: 1 }`}</style>

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditEnv(null) }}
        title={editEnv ? 'Editar Envelope' : 'Novo Envelope'}
      >
        <EnvelopeForm
          initial={editEnv}
          categories={categories}
          accounts={accounts}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditEnv(null) }}
        />
      </Modal>

      {/* Detail modal */}
      {detail && (
        <Modal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          title={`${detail.env.name} — Período atual`}
          size="lg"
        >
          <DetailModal
            data={detail}
            categories={categories}
            accounts={accounts}
            onClose={() => setDetailId(null)}
          />
        </Modal>
      )}
    </div>
  )
}
