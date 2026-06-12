import { useState, useMemo, useEffect, Fragment } from 'react'
import { Download, RefreshCw, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, aplicacaoAccountIds, countsAsReportExpense, countsAsReportIncome } from '../shared/utils'
import DateInput from '../shared/DateInput'

// ─── Helpers ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 1,  label: 'Mensal' },
  { value: 2,  label: 'Bimestral' },
  { value: 3,  label: 'Trimestral' },
  { value: 4,  label: 'Quadrimestral' },
  { value: 6,  label: 'Semestral' },
  { value: 12, label: 'Anual' },
]

function getRange(startDay, months) {
  const now = new Date()
  let startDate
  if (now.getDate() >= startDay) {
    startDate = new Date(now.getFullYear(), now.getMonth(), startDay)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, startDay)
  }
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + months, startDay - 1)
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0],
  }
}

function buildReport(transactions, categories, from, to, accountIds, categoryIds, aplicSet, reservaSet) {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))

  const inRange = transactions.filter(tx =>
    (countsAsReportExpense(tx, aplicSet) || countsAsReportIncome(tx)) &&
    tx.date >= from && tx.date <= to &&
    (accountIds.length === 0 || accountIds.includes(tx.accountId)) &&
    (categoryIds.length === 0 || categoryIds.includes(tx.categoryId)) &&
    !(reservaSet && (reservaSet.has(tx.accountId) || reservaSet.has(tx.toAccountId)))
  )

  function buildSection(txList) {
    const groups = {}
    txList.forEach(tx => {
      const cat = catMap[tx.categoryId]
      const groupKey = cat?.group || cat?.id || '__none__'
      const groupName = cat?.group || cat?.name || 'Sem Categoria'
      const subcatKey = cat?.id || '__none__'
      const subcatName = cat?.name || 'Sem Categoria'
      const isFlat = !cat?.group // top-level category or uncategorised

      if (!groups[groupKey]) groups[groupKey] = { name: groupName, subcats: {}, total: 0, isFlat }
      groups[groupKey].total += tx.amount

      if (!groups[groupKey].subcats[subcatKey]) groups[groupKey].subcats[subcatKey] = { id: subcatKey, name: subcatName, txs: [], total: 0 }
      groups[groupKey].subcats[subcatKey].total += tx.amount
      groups[groupKey].subcats[subcatKey].txs.push(tx)
    })

    return Object.values(groups)
      .sort((a, b) => b.total - a.total)
      .map(g => ({
        ...g,
        subcats: Object.values(g.subcats)
          .sort((a, b) => b.total - a.total)
          .map(s => ({ ...s, txs: [...s.txs].sort((a, b) => b.date.localeCompare(a.date)) })),
      }))
  }

  const expenseTxs = inRange.filter(t => countsAsReportExpense(t, aplicSet))
  const incomeTxs = inRange.filter(t => t.type === 'income')
  return {
    expenses: buildSection(expenseTxs),
    income: buildSection(incomeTxs),
    totalExpense: expenseTxs.reduce((s, t) => s + t.amount, 0),
    totalIncome: incomeTxs.reduce((s, t) => s + t.amount, 0),
  }
}

function exportCSV(report, showTx, from, to) {
  const sep = ';'
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['Seção', 'Grupo', 'Subcategoria', 'Data', 'Descrição', 'Favorecido', 'Valor'].map(q).join(sep)]

  const addSection = (groups, tipo) => {
    groups.forEach(g => {
      g.subcats.forEach(s => {
        if (showTx) {
          s.txs.forEach(tx => rows.push([tipo, g.name, g.isFlat ? '' : s.name, tx.date, tx.description || '', tx.payee || '', tx.amount.toFixed(2)].map(q).join(sep)))
        } else {
          rows.push([tipo, g.name, g.isFlat ? '' : s.name, '', '', '', s.total.toFixed(2)].map(q).join(sep))
        }
      })
    })
  }

  addSection(report.expenses, 'Despesa')
  addSection(report.income, 'Receita')
  rows.push(['RESULTADO', '', '', '', '', '', (report.totalIncome - report.totalExpense).toFixed(2)].map(q).join(sep))

  const csv = '﻿' + rows.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `demonstrativo_${from}_${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Multi-select panel ──────────────────────────────────────────────────────

function MultiSelectPanel({ label, items, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  const all = () => onChange(items.map(i => i.id))
  const none = () => onChange([])

  const q = query.trim().toLowerCase()
  const hasGroups = items.some(i => i.group)
  // Filtro por digitação: casa nome do item ou nome do grupo.
  const visible = items.filter(i =>
    !q || i.label.toLowerCase().includes(q) || (i.group || '').toLowerCase().includes(q)
  )

  // Quando há grupos, organiza em seções (ordenadas pt-BR, "Sem grupo" por último).
  const sections = useMemo(() => {
    if (!hasGroups) return [['', visible]]
    const map = {}
    const UNG = '​Sem grupo' // sentinela para ordenar por último
    for (const it of visible) { const g = it.group || UNG; (map[g] ||= []).push(it) }
    return Object.keys(map)
      .sort((a, b) => { if (a === UNG) return 1; if (b === UNG) return -1; return a.localeCompare(b, 'pt-BR') })
      .map(g => [g === UNG ? 'Sem grupo' : g, map[g]])
  }, [visible, hasGroups])

  const renderItem = (item) => (
    <label key={item.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-gray-800 rounded-lg cursor-pointer">
      <input
        type="checkbox"
        checked={selected.includes(item.id)}
        onChange={() => toggle(item.id)}
        className="accent-[#0F6E56] w-3.5 h-3.5 shrink-0"
      />
      <span className="text-xs text-gray-300 truncate">{item.label}</span>
    </label>
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="input flex items-center justify-between gap-2 w-full text-left"
      >
        <span className="text-xs truncate">
          {selected.length === 0 ? 'Nenhum' : selected.length === items.length ? 'Todos' : `${selected.length} selecionados`}
        </span>
        {open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-gray-700 rounded-xl shadow-xl max-h-52 flex flex-col">
          <div className="flex gap-2 px-3 py-2 border-b border-gray-800 shrink-0 items-center">
            <button type="button" onClick={all} className="text-xs text-blue-400 hover:text-blue-300">Todos</button>
            <span className="text-gray-700">·</span>
            <button type="button" onClick={none} className="text-xs text-gray-500 hover:text-gray-300">Nenhum</button>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="ml-auto bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 placeholder:text-gray-600 outline-none w-24"
            />
          </div>
          <div className="overflow-y-auto flex-1 px-1 py-1">
            {sections.map(([groupName, groupItems]) => (
              <div key={groupName || '_'}>
                {groupName && (
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wider font-medium">{groupName}</div>
                )}
                {groupItems.map(renderItem)}
              </div>
            ))}
            {visible.length === 0 && (
              <p className="px-2 py-3 text-xs text-gray-600 text-center">Nada encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Report rows ─────────────────────────────────────────────────────────────

function SectionHeader({ label, total, isExpense }) {
  return (
    <tr className="bg-gray-800/60 border-y border-gray-700">
      <td className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${isExpense ? 'text-orange-500' : 'text-blue-500'}`} colSpan={2}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right text-sm font-bold ${isExpense ? 'text-orange-500' : 'text-blue-500'}`}>
        {fmt(total)}
      </td>
    </tr>
  )
}

function GroupRow({ name, total }) {
  return (
    <tr className="border-b border-gray-800/40">
      <td className="pl-6 pr-3 py-2 text-sm font-semibold text-gray-200" colSpan={2}>{name}</td>
      <td className="px-4 py-2 text-right text-sm font-semibold text-gray-200">{fmt(total)}</td>
    </tr>
  )
}

function SubcatRow({ name, total }) {
  return (
    <tr className="border-b border-gray-800/30">
      <td className="pl-12 pr-3 py-1.5 text-xs text-gray-400" colSpan={2}>{name}</td>
      <td className="px-4 py-1.5 text-right text-xs text-gray-400">{fmt(total)}</td>
    </tr>
  )
}

function TxRow({ tx, indent }) {
  return (
    <tr className="border-b border-gray-800/20 hover:bg-gray-800/20 transition-colors">
      <td className="py-1 pr-3 text-xs text-gray-600 whitespace-nowrap" style={{ paddingLeft: indent }}>
        {fmtDate(tx.date)}
      </td>
      <td className="px-2 py-1 text-xs text-gray-500 truncate max-w-0" style={{ maxWidth: 260 }}>
        {tx.description || '—'}{tx.payee ? ` · ${tx.payee}` : ''}
      </td>
      <td className="px-4 py-1 text-right text-xs text-gray-600">{fmt(tx.amount)}</td>
    </tr>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DemonstrativoFinanceiro() {
  const { profileReportTransactions: transactions, categories, profileAccounts: accounts, settings } = useApp()
  const startDay = settings?.financialMonthStartDay || 1
  const aplicSet = useMemo(() => aplicacaoAccountIds(accounts), [accounts])
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const [hideReserva, setHideReserva] = useState(false)

  // ── Filter draft state ────────────────────────────────────────────────────
  const [months, setMonths] = useState(1)
  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft] = useState('')
  const [showTxDraft, setShowTxDraft] = useState(false)
  const [selectedCatsDraft, setSelectedCatsDraft] = useState([])
  const [selectedAccsDraft, setSelectedAccsDraft] = useState([])

  // ── Applied filters (report computed from these) ──────────────────────────
  const [applied, setApplied] = useState(null)

  // ── Item lists for multi-selects ──────────────────────────────────────────
  const catItems = useMemo(() =>
    categories.map(c => ({ id: c.id, label: `${c.icon || ''} ${c.name}`.trim(), group: c.group || null }))
  , [categories])

  const accItems = useMemo(() =>
    accounts.map(a => ({ id: a.id, label: a.apelido || a.name }))
  , [accounts])

  // ── Default initialisation ────────────────────────────────────────────────
  useEffect(() => {
    const range = getRange(startDay, 1)
    // Default accounts: fluxoCaixaPrincipal or credit cards
    const defaultAccs = accounts
      .filter(a => a.fluxoCaixaPrincipal || a.type === 'credit')
      .map(a => a.id)
    const accsToUse = defaultAccs.length > 0 ? defaultAccs : accounts.map(a => a.id)

    // Default categories: those with transactions in range on default accounts
    const activeCats = [...new Set(
      transactions
        .filter(tx => (countsAsReportExpense(tx, aplicSet) || countsAsReportIncome(tx)) && tx.date >= range.start && tx.date <= range.end && accsToUse.includes(tx.accountId) && tx.categoryId)
        .map(tx => tx.categoryId)
    )]
    const catsToUse = activeCats.length > 0 ? activeCats : categories.map(c => c.id)

    setFromDraft(range.start)
    setToDraft(range.end)
    setSelectedAccsDraft(accsToUse)
    setSelectedCatsDraft(catsToUse)
    setApplied({ from: range.start, to: range.end, cats: catsToUse, accs: accsToUse, showTx: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Period button click ───────────────────────────────────────────────────
  const handlePeriod = (m) => {
    setMonths(m)
    const range = getRange(startDay, m)
    setFromDraft(range.start)
    setToDraft(range.end)
  }

  // ── Apply filters ─────────────────────────────────────────────────────────
  const handleAtualizar = () => {
    setApplied({ from: fromDraft, to: toDraft, cats: selectedCatsDraft, accs: selectedAccsDraft, showTx: showTxDraft })
  }

  // ── Report data ───────────────────────────────────────────────────────────
  const report = useMemo(() => {
    if (!applied) return null
    return buildReport(transactions, categories, applied.from, applied.to, applied.accs, applied.cats, aplicSet, hideReserva ? reservaSet : null)
  }, [applied, transactions, categories, aplicSet, hideReserva, reservaSet])

  const isDirty = applied && (fromDraft !== applied.from || toDraft !== applied.to || showTxDraft !== applied.showTx || JSON.stringify([...selectedCatsDraft].sort()) !== JSON.stringify([...applied.cats].sort()) || JSON.stringify([...selectedAccsDraft].sort()) !== JSON.stringify([...applied.accs].sort()))

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <FileSpreadsheet size={14} className="text-gray-400" />
            Demonstrativo Financeiro
          </h3>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
              <div
                onClick={() => setHideReserva(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${hideReserva ? 'bg-[#0F6E56]' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${hideReserva ? 'left-4' : 'left-0.5'}`} />
              </div>
              Ocultar movimentos de reserva
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
              <div
                onClick={() => setShowTxDraft(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${showTxDraft ? 'bg-[#0F6E56]' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showTxDraft ? 'left-4' : 'left-0.5'}`} />
              </div>
              Exibir lançamentos
            </label>
          </div>
        </div>

        {/* Period quick-select */}
        <div>
          <label className="label">Período</label>
          <div className="flex gap-1.5 flex-wrap">
            {PERIOD_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => handlePeriod(o.value)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${months === o.value ? 'bg-gray-700 text-gray-100 font-medium' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Data Inicial</label>
            <DateInput className="input" value={fromDraft} onChange={e => setFromDraft(e.target.value)} />
          </div>
          <div>
            <label className="label">Data Final</label>
            <DateInput className="input" value={toDraft} onChange={e => setToDraft(e.target.value)} />
          </div>
        </div>

        {/* Category and account multi-selects */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Categorias ({selectedCatsDraft.length}/{catItems.length})</label>
            <MultiSelectPanel
              label="Categorias"
              items={catItems}
              selected={selectedCatsDraft}
              onChange={setSelectedCatsDraft}
            />
          </div>
          <div>
            <label className="label">Contas ({selectedAccsDraft.length}/{accItems.length})</label>
            <MultiSelectPanel
              label="Contas"
              items={accItems}
              selected={selectedAccsDraft}
              onChange={setSelectedAccsDraft}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleAtualizar}
            className={`btn-primary flex items-center gap-2 ${isDirty ? 'ring-2 ring-[#0F6E56]/50' : ''}`}
          >
            <RefreshCw size={13} /> Atualizar
          </button>
          {report && (
            <button
              onClick={() => exportCSV(report, applied.showTx, applied.from, applied.to)}
              className="btn-secondary flex items-center gap-2"
            >
              <Download size={13} /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Report table */}
      {report && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 420 }}>
              <thead>
                <tr className="border-b border-gray-700 bg-surface/60">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium w-28">Data</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Descrição</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {/* ── DESPESAS ─────────────────────────────────────────── */}
                {report.expenses.length > 0 && (
                  <>
                    <SectionHeader label="Despesas" total={report.totalExpense} isExpense={true} />
                    {report.expenses.map((group, gi) => (
                      <Fragment key={gi}>
                        <GroupRow name={group.name} total={group.total} />
                        {group.subcats.map((sub, si) => (
                          <Fragment key={si}>
                            {!group.isFlat && <SubcatRow name={sub.name} total={sub.total} />}
                            {applied.showTx && sub.txs.map(tx => (
                              <TxRow key={tx.id} tx={tx} indent={group.isFlat ? 48 : 80} />
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </>
                )}

                {/* ── RECEITAS ─────────────────────────────────────────── */}
                {report.income.length > 0 && (
                  <>
                    <SectionHeader label="Receitas" total={report.totalIncome} isExpense={false} />
                    {report.income.map((group, gi) => (
                      <Fragment key={gi}>
                        <GroupRow name={group.name} total={group.total} />
                        {group.subcats.map((sub, si) => (
                          <Fragment key={si}>
                            {!group.isFlat && <SubcatRow name={sub.name} total={sub.total} />}
                            {applied.showTx && sub.txs.map(tx => (
                              <TxRow key={tx.id} tx={tx} indent={group.isFlat ? 48 : 80} />
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </>
                )}

                {/* ── RESULTADO ────────────────────────────────────────── */}
                {(report.expenses.length > 0 || report.income.length > 0) && (() => {
                  const result = report.totalIncome - report.totalExpense
                  return (
                    <tr className="border-t-2 border-gray-600 bg-gray-800/40">
                      <td className="px-4 py-3 text-sm font-bold text-gray-100" colSpan={2}>
                        RESULTADO  <span className="text-xs font-normal text-gray-500 ml-2">Receitas − Despesas</span>
                      </td>
                      <td className={`px-4 py-3 text-right text-lg font-extrabold ${result >= 0 ? 'text-blue-400' : 'text-orange-500'}`}>
                        {result >= 0 ? '+' : ''}{fmt(result)}
                      </td>
                    </tr>
                  )
                })()}

                {report.expenses.length === 0 && report.income.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-12 text-gray-500 text-sm">
                      Nenhum lançamento encontrado no período com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

