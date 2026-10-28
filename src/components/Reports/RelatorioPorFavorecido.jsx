import { useState, useMemo, useEffect, Fragment } from 'react'
import { Download, RefreshCw, ChevronDown, ChevronRight, Search, Users } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, accountsForView } from '../shared/utils'
import { isInvestAutoOrigin } from '../../lib/origins'
import { useIsMobile } from '../../hooks/useIsMobile'
import DateInput from '../shared/DateInput'
import { isoLocal } from '../../lib/hoje'

// ─── Shared helpers (same pattern as DemonstrativoFinanceiro) ────────────────

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
  const startDate = now.getDate() >= startDay
    ? new Date(now.getFullYear(), now.getMonth(), startDay)
    : new Date(now.getFullYear(), now.getMonth() - 1, startDay)
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + months, startDay - 1)
  return {
    start: isoLocal(startDate),
    end: isoLocal(endDate),
  }
}

function MultiSelectPanel({ items, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="input flex items-center justify-between gap-2 w-full text-left"
      >
        <span className="text-xs truncate">
          {selected.length === 0 ? 'Nenhum' : selected.length === items.length ? 'Todas' : `${selected.length} selecionadas`}
        </span>
        {open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-borda-forte rounded-xl shadow-xl max-h-52 flex flex-col">
          <div className="flex gap-2 px-3 py-2 border-b border-borda shrink-0">
            <button type="button" onClick={() => onChange(items.map(i => i.id))} className="text-xs text-primary-fg hover:text-texto-1">Todas</button>
            <span className="text-texto-3">·</span>
            <button type="button" onClick={() => onChange([])} className="text-xs text-texto-3 hover:text-texto-2">Nenhuma</button>
          </div>
          <div className="overflow-y-auto flex-1 px-1 py-1">
            {items.map(item => (
              <label key={item.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-surface-hover rounded-lg cursor-pointer">
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="accent-primary w-3.5 h-3.5 shrink-0" />
                <span className="text-xs text-texto-2 truncate">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function doExport(filtered, totals, accounts, categories, applied, analytic) {
  const sep = ';'
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = []

  if (analytic) {
    rows.push(['Favorecido', 'Data', 'Descrição', 'Conta', 'Categoria', 'Tipo', 'Valor'].map(q).join(sep))
    filtered.forEach(d => {
      ;[...d.txs].sort((a, b) => b.date.localeCompare(a.date)).forEach(tx => {
        const acc = accounts.find(a => a.id === tx.accountId)
        const cat = categories.find(c => c.id === tx.categoryId)
        rows.push([
          d.payee, tx.date, tx.description || '', acc?.apelido || acc?.name || '',
          cat?.name || '', tx.type === 'income' ? 'Receita' : 'Despesa', tx.amount.toFixed(2),
        ].map(q).join(sep))
      })
    })
  } else {
    rows.push(['Favorecido', 'Total Pago', 'Total Recebido', 'Saldo', 'Qtd'].map(q).join(sep))
    filtered.forEach(d => {
      rows.push([d.payee, d.pago.toFixed(2), d.recebido.toFixed(2), (d.recebido - d.pago).toFixed(2), d.txs.length].map(q).join(sep))
    })
    rows.push(['TOTAL', totals.pago.toFixed(2), totals.recebido.toFixed(2), (totals.recebido - totals.pago).toFixed(2), totals.qtd].map(q).join(sep))
  }

  const csv = '﻿' + rows.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `favorecidos_${analytic ? 'analitico' : 'sintetico'}_${applied.from}_${applied.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function RelatorioPorFavorecido() {
  const { profileTransactions: transactions, categories, profileAccounts: accounts, settings } = useApp()
  const isMobile = useIsMobile()
  const startDay = settings?.financialMonthStartDay || 1

  const [months, setMonths] = useState(1)
  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft] = useState('')
  const [selectedAccsDraft, setSelectedAccsDraft] = useState([])
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState(null)
  const [expanded, setExpanded] = useState({})

  const accItems = useMemo(() => accountsForView(accounts, isMobile).map(a => ({ id: a.id, label: a.apelido || a.name })), [accounts, isMobile])

  // Default init
  useEffect(() => {
    const range = getRange(startDay, 1)
    const defaultAccs = accounts.filter(a => a.fluxoCaixaPrincipal || a.type === 'credit').map(a => a.id)
    const accsToUse = defaultAccs.length > 0 ? defaultAccs : accounts.map(a => a.id)
    setFromDraft(range.start)
    setToDraft(range.end)
    setSelectedAccsDraft(accsToUse)
    setApplied({ from: range.start, to: range.end, accs: accsToUse })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePeriod = (m) => {
    setMonths(m)
    const range = getRange(startDay, m)
    setFromDraft(range.start)
    setToDraft(range.end)
  }

  const handleAtualizar = () => setApplied({ from: fromDraft, to: toDraft, accs: selectedAccsDraft })

  const isDirty = applied && (
    fromDraft !== applied.from || toDraft !== applied.to ||
    JSON.stringify([...selectedAccsDraft].sort()) !== JSON.stringify([...applied.accs].sort())
  )

  // Build report data from applied filters
  const reportData = useMemo(() => {
    if (!applied) return []
    const inRange = transactions.filter(tx =>
      (tx.type === 'expense' || tx.type === 'income') &&
      !isInvestAutoOrigin(tx) &&
      tx.date >= applied.from && tx.date <= applied.to &&
      (applied.accs.length === 0 || applied.accs.includes(tx.accountId))
    )
    const byPayee = {}
    inRange.forEach(tx => {
      const key = tx.payee?.trim() || '__none__'
      const label = tx.payee?.trim() || '(Sem favorecido)'
      if (!byPayee[key]) byPayee[key] = { payee: label, pago: 0, recebido: 0, txs: [] }
      if (tx.type === 'expense') byPayee[key].pago = Math.round((byPayee[key].pago + tx.amount) * 100) / 100
      else byPayee[key].recebido = Math.round((byPayee[key].recebido + tx.amount) * 100) / 100
      byPayee[key].txs.push(tx)
    })
    return Object.values(byPayee)
      .sort((a, b) => (b.pago + b.recebido) - (a.pago + a.recebido))
  }, [applied, transactions])

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return reportData
    const q = search.toLowerCase()
    return reportData.filter(d => d.payee.toLowerCase().includes(q))
  }, [reportData, search])

  const totals = useMemo(() => ({
    pago: Math.round(filtered.reduce((s, d) => s + d.pago, 0) * 100) / 100,
    recebido: Math.round(filtered.reduce((s, d) => s + d.recebido, 0) * 100) / 100,
    qtd: filtered.reduce((s, d) => s + d.txs.length, 0),
  }), [filtered])

  const toggleExpand = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
          <Users size={14} className="text-texto-2" />
          Relatório por Favorecido
        </h3>

        <div>
          <label className="label">Período</label>
          <div className="flex gap-1.5 flex-wrap">
            {PERIOD_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => handlePeriod(o.value)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${months === o.value ? 'bg-surface-hover text-texto-1 font-medium' : 'text-texto-3 hover:text-texto-2 hover:bg-surface-hover'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Data Inicial</label>
            <DateInput className="input" value={fromDraft} onChange={e => setFromDraft(e.target.value)} />
          </div>
          <div>
            <label className="label">Data Final</label>
            <DateInput className="input" value={toDraft} onChange={e => setToDraft(e.target.value)} />
          </div>
          <div>
            <label className="label">Contas ({selectedAccsDraft.length}/{accItems.length})</label>
            <MultiSelectPanel items={accItems} selected={selectedAccsDraft} onChange={setSelectedAccsDraft} />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={handleAtualizar}
            className={`btn-primary flex items-center gap-2 ${isDirty ? 'ring-2 ring-primary/50' : ''}`}
          >
            <RefreshCw size={13} /> Atualizar
          </button>
          {filtered.length > 0 && (
            <>
              <button onClick={() => doExport(filtered, totals, accounts, categories, applied, false)} className="btn-secondary flex items-center gap-2 text-xs">
                <Download size={12} /> CSV Sintético
              </button>
              <button onClick={() => doExport(filtered, totals, accounts, categories, applied, true)} className="btn-secondary flex items-center gap-2 text-xs">
                <Download size={12} /> CSV Analítico
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      {reportData.length > 0 && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3 pointer-events-none" />
          <input
            className="input pl-9"
            placeholder="Buscar favorecido..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Report table */}
      {filtered.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 520 }}>
              <thead>
                <tr className="border-b border-borda-forte bg-surface/60">
                  <th className="text-left px-4 py-2.5 text-xs text-texto-3 font-medium">Favorecido</th>
                  <th className="text-right px-4 py-2.5 text-xs text-despesa font-medium whitespace-nowrap">Total Pago</th>
                  <th className="text-right px-4 py-2.5 text-xs text-receita font-medium whitespace-nowrap">Total Recebido</th>
                  <th className="text-right px-4 py-2.5 text-xs text-texto-3 font-medium whitespace-nowrap">Saldo</th>
                  <th className="text-right px-4 py-2.5 text-xs text-texto-3 font-medium whitespace-nowrap">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const saldo = Math.round((d.recebido - d.pago) * 100) / 100
                  const isOpen = !!expanded[d.payee]
                  return (
                    <Fragment key={d.payee}>
                      {/* Synthetic row */}
                      <tr
                        className={`border-b border-borda/50 hover:bg-surface-hover/30 transition-colors cursor-pointer ${isOpen ? 'bg-surface-2/20' : ''}`}
                        onClick={() => toggleExpand(d.payee)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isOpen
                              ? <ChevronDown size={13} className="text-texto-2 shrink-0" />
                              : <ChevronRight size={13} className="text-texto-3 shrink-0" />}
                            <span className="text-texto-1 font-medium">{d.payee}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {d.pago > 0
                            ? <span className="text-despesa font-semibold">{fmt(d.pago)}</span>
                            : <span className="text-texto-3 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {d.recebido > 0
                            ? <span className="text-receita font-semibold">{fmt(d.recebido)}</span>
                            : <span className="text-texto-3 text-xs">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${saldo >= 0 ? 'text-receita' : 'text-despesa'}`}>
                          {saldo >= 0 ? '+' : ''}{fmt(saldo)}
                        </td>
                        <td className="px-4 py-3 text-right text-texto-3 text-xs">{d.txs.length}</td>
                      </tr>

                      {/* Analytic rows (expanded) */}
                      {isOpen && (
                        <tr className="border-b border-borda">
                          <td colSpan={5} className="p-0 bg-surface/50">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-borda/60">
                                  <th className="text-left pl-10 pr-3 py-1.5 text-texto-3 font-medium whitespace-nowrap">Data</th>
                                  <th className="text-left px-3 py-1.5 text-texto-3 font-medium">Descrição</th>
                                  <th className="text-left px-3 py-1.5 text-texto-3 font-medium hidden md:table-cell whitespace-nowrap">Conta</th>
                                  <th className="text-left px-3 py-1.5 text-texto-3 font-medium hidden md:table-cell whitespace-nowrap">Categoria</th>
                                  <th className="text-right px-4 py-1.5 text-texto-3 font-medium whitespace-nowrap">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...d.txs]
                                  .sort((a, b) => b.date.localeCompare(a.date))
                                  .map(tx => {
                                    const acc = accounts.find(a => a.id === tx.accountId)
                                    const cat = categories.find(c => c.id === tx.categoryId)
                                    return (
                                      <tr key={tx.id} className="border-b border-borda/30 hover:bg-surface-hover/20 transition-colors">
                                        <td className="pl-10 pr-3 py-2 text-texto-3 whitespace-nowrap">{fmtDate(tx.date)}</td>
                                        <td className="px-3 py-2 text-texto-2 max-w-[200px] truncate">{tx.description || '—'}</td>
                                        <td className="px-3 py-2 text-texto-3 hidden md:table-cell whitespace-nowrap">
                                          {acc?.apelido || acc?.name || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-texto-3 hidden md:table-cell">
                                          {cat ? `${cat.icon || ''} ${cat.name}`.trim() : '—'}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-receita' : 'text-despesa'}`}>
                                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                {/* Subtotal row */}
                                <tr className="border-t border-borda-forte/60 bg-surface-2/30">
                                  <td colSpan={4} className="pl-10 pr-3 py-2 text-texto-3 font-semibold">
                                    Subtotal · {d.txs.length} lançamento{d.txs.length !== 1 ? 's' : ''}
                                  </td>
                                  <td className={`px-4 py-2 text-right font-bold ${saldo >= 0 ? 'text-receita' : 'text-despesa'}`}>
                                    {saldo >= 0 ? '+' : ''}{fmt(saldo)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borda-forte bg-surface-2/40">
                  <td className="px-4 py-3 text-sm font-bold text-texto-1">
                    Total Geral <span className="text-xs font-normal text-texto-3 ml-1">({filtered.length} favorecidos)</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-despesa">{fmt(totals.pago)}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-receita">{fmt(totals.recebido)}</td>
                  <td className={`px-4 py-3 text-right text-sm font-bold ${totals.recebido - totals.pago >= 0 ? 'text-receita' : 'text-despesa'}`}>
                    {totals.recebido - totals.pago >= 0 ? '+' : ''}{fmt(Math.round((totals.recebido - totals.pago) * 100) / 100)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-texto-3">{totals.qtd}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {applied && filtered.length === 0 && (
        <div className="card text-center py-10">
          <Users size={32} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-3 text-sm">
            {search.trim() ? `Nenhum favorecido encontrado para "${search}".` : 'Nenhum lançamento com favorecido no período selecionado.'}
          </p>
        </div>
      )}
    </div>
  )
}
