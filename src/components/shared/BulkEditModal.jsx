import { useState, useMemo } from 'react'
import { X, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import DateInput from './DateInput'
import SearchableSelect from './SearchableSelect'
import { fmt, fmtDate } from './utils'
import { useApp } from '../../context/AppContext'

// Paleta acessível (sem verde/vermelho): receita=azul, despesa=laranja, transferência=cinza.
const TYPE_META = {
  income:   { label: 'Receita',       Icon: ArrowDownCircle, color: 'text-blue-600',   bg: 'bg-blue-500/10' },
  expense:  { label: 'Despesa',       Icon: ArrowUpCircle,   color: 'text-orange-600', bg: 'bg-orange-500/10' },
  transfer: { label: 'Transferência', Icon: ArrowLeftRight,  color: 'text-gray-400',   bg: 'bg-gray-700/50' },
}
const metaOf = (t) => TYPE_META[t] || TYPE_META.expense

function buildCatOpts(categories, type) {
  return categories
    .filter(c => !type || c.type === type || c.type === 'both')
    .map(c => ({ id: c.id, label: `${c.icon ? c.icon + ' ' : ''}${c.name}`, group: c.group || null }))
}

// Edição em lote de Data e/ou Categoria dos lançamentos selecionados.
// `txs`: array de lançamentos selecionados. onApplied(count) é chamado após gravar.
export default function BulkEditModal({ txs, onClose, onApplied }) {
  const { categories, bulkUpdateTransactions } = useApp()

  const [items, setItems] = useState(() => txs || [])
  const [stage, setStage] = useState('review') // review | edit | confirm | blocked
  const [date, setDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState('')

  const removeItem = (id) => setItems(prev => prev.filter(t => t.id !== id))

  const stats = useMemo(() => {
    const count = items.length
    const total = items.reduce((s, t) => s + (t.amount || 0), 0)
    const despesas = items.filter(t => t.type === 'expense').length
    const receitas = items.filter(t => t.type === 'income').length
    const transferencias = items.filter(t => t.type === 'transfer').length
    return { count, total, despesas, receitas, transferencias }
  }, [items])

  const hasExpense = stats.despesas > 0
  const hasIncome = stats.receitas > 0
  const hasTransfer = stats.transferencias > 0
  const distinctTypes = (hasExpense ? 1 : 0) + (hasIncome ? 1 : 0) + (hasTransfer ? 1 : 0)

  const catType = hasExpense && !hasIncome ? 'expense' : hasIncome && !hasExpense ? 'income' : null
  const catOpts = useMemo(() => buildCatOpts(categories, catType), [categories, catType])

  const dateFilled = !!date
  const catFilled = !!categoryId

  const blockedCategory = catFilled && hasTransfer
  const dateWarn = dateFilled && distinctTypes > 1
  const catWarn = catFilled && hasIncome && hasExpense

  const apply = () => {
    bulkUpdateTransactions(items.map(t => t.id), {
      date: dateFilled ? date : undefined,
      categoryId: catFilled ? categoryId : undefined,
    })
    onApplied?.(items.length)
    onClose()
  }

  const handleProsseguir = () => {
    if (items.length === 0) return
    setStage('edit')
  }

  const handleConfirmEdit = () => {
    setError('')
    if (!dateFilled && !catFilled) {
      setError('Preencha Data e/ou Categoria para alterar.')
      return
    }
    if (blockedCategory) { setStage('blocked'); return }
    if (dateWarn || catWarn) { setStage('confirm'); return }
    apply()
  }

  const dateAlertText = stats.transferencias > 0
    ? `A nova data será aplicada a todos os ${stats.count} registros selecionados, incluindo ${stats.transferencias} ${stats.transferencias === 1 ? 'Transferência' : 'Transferências'}. Deseja continuar?`
    : `A nova data será aplicada a todos os ${stats.count} registros selecionados, de tipos diferentes (Receitas e Despesas). Deseja continuar?`

  const modalSize = stage === 'review' ? 'lg' : 'md'
  const title = stage === 'review' ? 'Alterar Selecionados'
    : stage === 'edit' ? 'Alterar Data / Categoria'
    : stage === 'blocked' ? 'Alteração não permitida'
    : 'Confirmar alteração'

  return (
    <Modal open onClose={onClose} title={title} size={modalSize}>
      {/* ── Resumo (sempre visível no topo) ── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card py-2.5 px-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Registros</p>
          <p className="text-lg font-bold text-gray-100">{stats.count}</p>
        </div>
        <div className="card py-2.5 px-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Valor total</p>
          <p className="text-lg font-bold text-gray-100">{fmt(stats.total)}</p>
        </div>
        <div className="card py-2.5 px-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Por tipo</p>
          <p className="text-xs text-gray-300 mt-1 leading-tight">
            <span className="text-orange-600 font-semibold">{stats.despesas}</span> Desp ·{' '}
            <span className="text-blue-600 font-semibold">{stats.receitas}</span> Rec ·{' '}
            <span className="text-gray-400 font-semibold">{stats.transferencias}</span> Transf
          </p>
        </div>
      </div>

      {/* ── STAGE: review ── */}
      {stage === 'review' && (
        <>
          {items.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">Nenhum registro na seleção.</p>
          ) : (
            <div className="space-y-1 max-h-[45vh] overflow-y-auto overscroll-contain mb-4">
              {items.map(t => {
                const m = metaOf(t.type)
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-800/40">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.bg}`}>
                      <m.Icon size={14} className={m.color} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 truncate">{t.description || t.payee || m.label}</p>
                      <p className="text-xs text-gray-500">{fmtDate(t.date)}{t.payee && t.description ? ` · ${t.payee}` : ''}</p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${m.color}`}>{fmt(t.amount)}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(t.id)}
                      title="Remover da seleção"
                      className="p-1 rounded text-gray-600 hover:text-gray-200 hover:bg-gray-700 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn-primary flex-1" onClick={handleProsseguir} disabled={items.length === 0}>Prosseguir</button>
          </div>
        </>
      )}

      {/* ── STAGE: edit ── */}
      {stage === 'edit' && (
        <>
          <div className="space-y-4 mb-4">
            <p className="text-xs text-gray-500">Preencha apenas o que deseja alterar. Campos vazios são ignorados.</p>
            <div>
              <label className="label">Data</label>
              <DateInput className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Categoria</label>
              <SearchableSelect
                options={catOpts}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Selecione uma categoria..."
              />
              {hasTransfer && (
                <p className="text-xs text-amber-400 mt-1.5 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  A seleção contém Transferências — não é possível alterar Categoria com tipos diferentes.
                </p>
              )}
            </div>
          </div>
          {error && <p className="text-xs text-amber-400 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setStage('review')}>Voltar</button>
            <button className="btn-primary flex-1" onClick={handleConfirmEdit}>Confirmar</button>
          </div>
        </>
      )}

      {/* ── STAGE: blocked (categoria em tipos mistos) ── */}
      {stage === 'blocked' && (
        <>
          <div className="card border border-amber-500/30 bg-amber-500/5 flex items-start gap-3 mb-4">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200 leading-relaxed">
              Não é possível alterar Categoria para registros de tipos diferentes. Remova as Transferências
              (ou Receitas) da seleção e tente novamente.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn-primary flex-1" onClick={() => setStage('edit')}>Voltar</button>
          </div>
        </>
      )}

      {/* ── STAGE: confirm (alertas que não bloqueiam) ── */}
      {stage === 'confirm' && (
        <>
          <div className="space-y-3 mb-4">
            {dateWarn && (
              <div className="card border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200 leading-relaxed">{dateAlertText}</p>
              </div>
            )}
            {catWarn && (
              <div className="card border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200 leading-relaxed">
                  A categoria será aplicada a Despesas e Receitas ({stats.despesas} + {stats.receitas}). Deseja continuar?
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button className="btn-secondary flex-1" onClick={() => setStage('edit')}>Voltar</button>
            <button className="btn-primary flex-1" onClick={apply}>Confirmar</button>
          </div>
        </>
      )}
    </Modal>
  )
}
