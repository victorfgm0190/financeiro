import { useState, useMemo } from 'react'
import { Download, FileBarChart } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useScrollScope } from '../../hooks/useScrollRestoration'
import { fmt, fmtDate } from '../shared/utils'

// Badge do grupo gerencial — mesmas cores do extrato do cartão (CreditCardPanel):
// G (número 1) = reserva; D = cinza; numerados (2/3/…) = laranja.
function GerBadge({ grupoId, gerencialGroups }) {
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return <span className="text-gray-700 text-xs">—</span>
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
  else if (grupo.number === 'D') cls += ' bg-gray-700/60 text-gray-500'
  else cls += ' bg-orange-500/20 text-orange-600'
  return <span className={cls}>{grupo.alias}</span>
}

// Badge cinza pequeno com o id do lançamento — clique copia o id para a área de transferência
// (mesmo padrão do extrato do cartão).
function CopyIdBadge({ id }) {
  const [copied, setCopied] = useState(false)
  if (!id) return null
  const copy = (e) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Clique para copiar o ID"
      className="inline-block font-mono text-[10px] text-gray-500 hover:text-gray-300 bg-gray-800/60 hover:bg-gray-700/60 px-1 py-0.5 rounded transition-colors"
    >
      {copied ? 'copiado ✓' : id}
    </button>
  )
}

// Fatura do mês M: fecha no dia F de M e vai do dia F+1 de M-1 ao dia F de M.
// dia <= F → mês corrente; dia > F → mês seguinte (label = mês de fechamento).
function getBillPeriod(dateStr, closingDay) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const fm0 = day <= closingDay ? d.getMonth() : d.getMonth() + 1
  const fatura = new Date(d.getFullYear(), fm0, 1)
  const fy = fatura.getFullYear()
  const fmonth = fatura.getMonth()
  const start = new Date(fy, fmonth - 1, closingDay + 1)
  const end = new Date(fy, fmonth, closingDay)
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const f = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  return {
    key: `${fy}-${String(fmonth + 1).padStart(2, '0')}`,
    label: `${months[fmonth]}/${fy}`,
    start: f(start),
    end: f(end),
  }
}

export default function RelatorioFatura({ initialCardId }) {
  const { accounts, transactions, categories, gerencialGroups, reserveFunctions } = useApp()
  useScrollScope('credit:relatorio')

  // Lookup id → nome da função de reserva (reserve_functions já está no contexto).
  const reserveFuncName = useMemo(() => {
    const idx = {}
    for (const f of reserveFunctions || []) idx[f.id] = f.name
    return idx
  }, [reserveFunctions])

  const creditCards = accounts.filter(a => a.type === 'credit')
  const [selectedCardId, setSelectedCardId] = useState(initialCardId || creditCards[0]?.id || '')
  const [selectedBillKey, setSelectedBillKey] = useState('')

  const card = accounts.find(a => a.id === selectedCardId)
  const closingDay = card?.closingDay || 1

  const grp1 = gerencialGroups.find(g => g.number === 1)
  const grpD = gerencialGroups.find(g => g.number === 'D')
  const customGroups = useMemo(() =>
    gerencialGroups
      .filter(g => typeof g.number === 'number' && g.number !== 1)
      .sort((a, b) => a.number - b.number),
    [gerencialGroups]
  )

  // fatura_ref (MM/YYYY) do lançamento: usa o campo gravado; se ausente (lançamentos antigos),
  // deriva de fatura_month_year (YYYY-MM). Vazio quando não há referência.
  const faturaRefOf = (tx) => {
    if (tx.faturaRef) return tx.faturaRef
    if (tx.faturaMonthYear) {
      const [y, m] = tx.faturaMonthYear.split('-')
      return y && m ? `${m}/${y}` : ''
    }
    return ''
  }

  // Grupo gerencial efetivo do lançamento (sem grupo → D). Retorna o objeto do grupo ou null.
  const grupoOf = (tx) => {
    const gid = tx.grupoGerencial || grpD?.id
    return gerencialGroups.find(g => g.id === gid) || null
  }

  // Derive billing periods from card transactions
  const billPeriods = useMemo(() => {
    if (!selectedCardId) return []
    const map = {}
    for (const tx of transactions) {
      if (tx.accountId !== selectedCardId || tx.type !== 'expense' || !tx.date) continue
      const p = getBillPeriod(tx.date, closingDay)
      if (!map[p.key]) map[p.key] = p
    }
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key))
  }, [transactions, selectedCardId, closingDay])

  const selectedBill = billPeriods.find(p => p.key === selectedBillKey) || billPeriods[0] || null

  const billTxs = useMemo(() => {
    if (!selectedBill || !selectedCardId) return []
    return transactions
      .filter(tx =>
        tx.accountId === selectedCardId &&
        tx.type === 'expense' &&
        tx.date >= selectedBill.start &&
        tx.date <= selectedBill.end
      )
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [transactions, selectedCardId, selectedBill])

  const totals = useMemo(() => {
    const t = { total: 0 }
    if (grp1) t[grp1.id] = 0
    if (grpD) t[grpD.id] = 0
    for (const g of customGroups) t[g.id] = 0
    for (const tx of billTxs) {
      t.total += tx.amount
      const gid = tx.grupoGerencial
      if (gid && t[gid] !== undefined) {
        t[gid] += tx.amount
      } else if (grpD) {
        t[grpD.id] += tx.amount
      }
    }
    return t
  }, [billTxs, grp1, grpD, customGroups])

  const handleExportCSV = () => {
    const headers = [
      'Data', 'Descrição', 'Descrição original', 'ID', 'Fatura',
      'Categoria', 'Favorecido', 'Grupo Gerencial', 'Valor',
    ]
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csvRows = billTxs.map(tx => {
      const cat = categories.find(c => c.id === tx.categoryId)
      const grupo = grupoOf(tx)
      return [
        q(tx.date),
        q(tx.description),
        q(tx.notes || ''),
        q(tx.id),
        q(faturaRefOf(tx)),
        q(cat ? `${cat.icon} ${cat.name}` : ''),
        q(tx.payee || ''),
        q(grupo ? grupo.alias : ''),
        q(tx.amount.toFixed(2).replace('.', ',')),
      ].join(';')
    })
    const csv = [headers.join(';'), ...csvRows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fatura_${card?.apelido || card?.name || 'cartao'}_${selectedBill?.label || 'relatorio'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <FileBarChart size={14} style={{ color: '#0F6E56' }} /> Relatório de Fatura
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-36">
            <label className="label">Cartão</label>
            <select
              className="input"
              value={selectedCardId}
              onChange={e => { setSelectedCardId(e.target.value); setSelectedBillKey('') }}
            >
              <option value="">Selecione...</option>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-52">
            <label className="label">Fatura</label>
            <select
              className="input"
              value={selectedBill?.key || ''}
              onChange={e => setSelectedBillKey(e.target.value)}
            >
              <option value="">Selecione a fatura...</option>
              {billPeriods.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label} · {p.start.split('-').reverse().join('/')} – {p.end.split('-').reverse().join('/')}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={handleExportCSV}
            disabled={billTxs.length === 0}
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      {selectedBill && billTxs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Fatura</p>
            <p className="text-xl font-bold text-orange-600">{fmt(totals.total)}</p>
          </div>
          {grp1 && totals[grp1.id] > 0 && (
            <div className="card" style={{ borderColor: 'rgba(16,185,129,0.25)', borderWidth: 1 }}>
              <p className="text-xs text-reserva uppercase tracking-wide mb-1">{grp1.alias} · {grp1.name}</p>
              <p className="text-xl font-bold text-reserva">{fmt(totals[grp1.id])}</p>
              {totals.total > 0 && (
                <p className="text-xs text-reserva mt-0.5">{((totals[grp1.id] / totals.total) * 100).toFixed(0)}%</p>
              )}
            </div>
          )}
          {customGroups.filter(g => totals[g.id] > 0).map(g => (
            <div key={g.id} className="card" style={{ borderColor: 'rgba(234,88,12,0.25)', borderWidth: 1 }}>
              <p className="text-xs text-orange-600 uppercase tracking-wide mb-1">{g.alias} · {g.name}</p>
              <p className="text-xl font-bold text-orange-600">{fmt(totals[g.id])}</p>
              {totals.total > 0 && (
                <p className="text-xs text-orange-800 mt-0.5">{((totals[g.id] / totals.total) * 100).toFixed(0)}%</p>
              )}
            </div>
          ))}
          {grpD && totals[grpD.id] > 0 && (
            <div className="card">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">D · Despesas</p>
              <p className="text-xl font-bold text-gray-300">{fmt(totals[grpD.id])}</p>
              {totals.total > 0 && (
                <p className="text-xs text-gray-600 mt-0.5">{((totals[grpD.id] / totals.total) * 100).toFixed(0)}%</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabela principal */}
      {!selectedCardId || !selectedBill ? (
        <div className="card text-center py-12">
          <FileBarChart size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Selecione um cartão e uma fatura para visualizar o relatório</p>
        </div>
      ) : billTxs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 text-sm">Nenhum lançamento nesta fatura</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium hidden lg:table-cell">ID</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium whitespace-nowrap hidden md:table-cell">Fatura</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Categoria</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium hidden lg:table-cell">Favorecido</th>
                <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Ger.</th>
                <th className="text-right px-3 py-3 text-xs text-gray-400 font-medium whitespace-nowrap">Valor</th>
              </tr>
            </thead>
            <tbody>
              {billTxs.map(tx => {
                const cat = categories.find(c => c.id === tx.categoryId)
                const gid = tx.grupoGerencial
                const isGrp1 = gid === grp1?.id
                const isGrpD = !gid || gid === grpD?.id
                const rowCls = isGrp1
                  ? 'border-b border-gray-800/50 bg-reserva/5 hover:bg-reserva/10 transition-colors'
                  : !isGrpD
                  ? 'border-b border-gray-800/50 bg-orange-500/5 hover:bg-orange-500/10 transition-colors'
                  : 'border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors'
                const faturaRef = faturaRefOf(tx)
                return (
                  <tr key={tx.id} className={rowCls}>
                    <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap text-xs align-top">{fmtDate(tx.date)}</td>
                    <td className="px-3 py-2.5 text-gray-200 max-w-xs align-top">
                      <p className="truncate">{tx.description}</p>
                      {/* Descrição original (Observações) — linha secundária menor em cinza. */}
                      {tx.notes && <p className="text-xs text-gray-500 truncate">{tx.notes}</p>}
                      {/* Em telas pequenas, mostra Favorecido/Fatura aqui, já que as colunas somem. */}
                      {tx.payee && <p className="text-xs text-gray-500 lg:hidden">{tx.payee}</p>}
                      {faturaRef && <p className="text-[10px] text-gray-600 md:hidden">Fatura {faturaRef}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top hidden lg:table-cell">
                      <CopyIdBadge id={tx.id} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-gray-300 whitespace-nowrap hidden md:table-cell">
                      {faturaRef || <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top hidden md:table-cell">
                      {cat && (
                        <span className="text-xs bg-gray-800 px-2 py-1 rounded-full text-gray-300">{cat.icon} {cat.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top hidden lg:table-cell text-xs text-gray-300">
                      {tx.payee || <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <GerBadge grupoId={gid || grpD?.id} gerencialGroups={gerencialGroups} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-orange-600 whitespace-nowrap align-top">{fmt(tx.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-800/60">
                <td className="px-3 py-3 text-xs text-gray-300 font-bold" colSpan={7}>Total · {billTxs.length} lançamento{billTxs.length !== 1 ? 's' : ''}</td>
                <td className="px-3 py-3 text-right font-bold text-orange-600 whitespace-nowrap">{fmt(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
