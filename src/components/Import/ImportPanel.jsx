import { useState, useRef, useMemo } from 'react'
import { Upload, FileText, Check, AlertCircle, Wand2, Save } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        resolve(rows)
      } catch (err) { reject(err) }
    }
    reader.readAsArrayBuffer(file)
  })
}

function detectColumns(rows) {
  const header = rows[0] || []
  const lower = header.map(h => String(h).toLowerCase())
  const find = (...keys) => {
    for (const k of keys) {
      const i = lower.findIndex(h => h.includes(k))
      if (i !== -1) return i
    }
    return -1
  }
  return {
    date: find('data', 'date'),
    description: find('descrição', 'descricao', 'description', 'histórico', 'historico', 'lançamento'),
    amount: find('valor', 'amount', 'value', 'montante'),
    type: find('tipo', 'type', 'natureza'),
  }
}

function normalizeDate(val) {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val)
  const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  const match2 = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match2) return s.slice(0, 10)
  return s
}

function normalizeAmount(val) {
  if (typeof val === 'number') return Math.abs(val)
  const s = String(val).replace(/[R$\s]/g, '').replace('.', '').replace(',', '.')
  return Math.abs(parseFloat(s) || 0)
}

export default function ImportPanel() {
  const {
    accounts, categories, classificationRules,
    gerencialGroups, processarLancamentoGerencial,
    addTransaction, addRule, classifyByRules, learnClassification,
  } = useApp()

  const [rows, setRows] = useState([])
  const [cols, setCols] = useState({})
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id || '')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const defaultGrupoId = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
  const selectedAccountObj = accounts.find(a => a.id === selectedAccount)
  const isSelectedCredit = selectedAccountObj?.type === 'credit'

  const sortedGrupos = useMemo(() => [...gerencialGroups].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  }), [gerencialGroups])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setDone(false)
    try {
      const rawRows = await parseFile(file)
      if (rawRows.length < 2) { setError('Arquivo vazio ou sem dados'); return }
      const detectedCols = detectColumns(rawRows)
      setCols(detectedCols)

      const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== ''))
      const parsed = dataRows.map((row, i) => {
        const desc = String(row[detectedCols.description] || '').trim()
        const amount = normalizeAmount(row[detectedCols.amount])
        const date = normalizeDate(row[detectedCols.date])
        const classified = classifyByRules(desc)
        return {
          _id: i,
          date,
          description: desc,
          amount,
          categoryId: classified?.categoryId || '',
          payee: classified?.payee || '',
          type: 'expense',
          selected: amount > 0,
          grupoGerencial: defaultGrupoId,
        }
      }).filter(r => r.amount > 0 && r.date)

      setRows(parsed)
    } catch (err) {
      setError('Erro ao ler arquivo: ' + err.message)
    }
  }

  const updateRow = (id, changes) => {
    setRows(prev => prev.map(r => r._id === id ? { ...r, ...changes } : r))
  }

  const handleImport = () => {
    const acc = accounts.find(a => a.id === selectedAccount)
    const selected = rows.filter(r => r.selected)
    selected.forEach(row => {
      addTransaction({
        type: 'expense',
        accountId: selectedAccount,
        accountType: acc?.type,
        amount: row.amount,
        date: row.date,
        description: row.description,
        categoryId: row.categoryId,
        payee: row.payee,
        grupoGerencial: isSelectedCredit ? row.grupoGerencial : null,
      })
      if (row.categoryId) learnClassification(row.description, row.categoryId, row.payee)

      // Para cartão de crédito, processa automação gerencial (sem prompt de resgate no batch)
      if (isSelectedCredit && row.grupoGerencial) {
        processarLancamentoGerencial(
          { accountId: selectedAccount, amount: row.amount, date: row.date },
          row.grupoGerencial
        )
      }
    })
    setDone(true)
    setRows([])
  }

  const autoClassify = () => {
    setRows(prev => prev.map(row => {
      if (row.categoryId) return row
      const classified = classifyByRules(row.description)
      return classified ? { ...row, ...classified } : row
    }))
  }

  const selected = rows.filter(r => r.selected)

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Importar Fatura CSV / Excel</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Conta de Destino</label>
            <select className="input" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
              <option value="">Selecione a conta...</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type === 'credit' ? 'Cartão' : 'Conta'})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Arquivo (CSV ou Excel)</label>
            <div
              className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:border-[#0F6E56] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={20} className="text-gray-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500">Clique para selecionar</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {done && (
          <div className="mt-3 flex items-center gap-2 text-emerald-400 text-sm">
            <Check size={14} /> Importação concluída com sucesso!
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {rows.length} transações · {selected.length} selecionadas · Total: {fmt(selected.reduce((s, r) => s + r.amount, 0))}
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary flex items-center gap-2" onClick={autoClassify}>
                <Wand2 size={13} /> Classificar Auto
              </button>
              <button className="btn-primary flex items-center gap-2" onClick={handleImport} disabled={selected.length === 0 || !selectedAccount}>
                <Save size={13} /> Importar {selected.length} itens
              </button>
            </div>
          </div>

          <div className="card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={rows.every(r => r.selected)}
                      onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))}
                      className="accent-[#0F6E56]"
                    />
                  </th>
                  <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Data</th>
                  <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Descrição</th>
                  <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Categoria</th>
                  <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium hidden md:table-cell">Favorecido</th>
                  {isSelectedCredit && (
                    <th className="text-left px-3 py-3 text-xs text-gray-400 font-medium">Ger.</th>
                  )}
                  <th className="text-right px-3 py-3 text-xs text-gray-400 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row._id} className={`border-b border-gray-800/50 ${!row.selected ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={e => updateRow(row._id, { selected: e.target.checked })}
                        className="accent-[#0F6E56]"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">
                      {row.date?.split('-').reverse().join('/')}
                    </td>
                    <td className="px-3 py-2 text-gray-200 max-w-xs">
                      <input
                        className="bg-transparent w-full text-sm focus:outline-none focus:bg-gray-800 rounded px-1 -mx-1"
                        value={row.description}
                        onChange={e => updateRow(row._id, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-36"
                        value={row.categoryId}
                        onChange={e => {
                          updateRow(row._id, { categoryId: e.target.value })
                          if (e.target.value) learnClassification(row.description, e.target.value, row.payee)
                        }}
                      >
                        <option value="">Sem categoria</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <input
                        className="bg-transparent w-28 text-xs text-gray-400 focus:outline-none focus:bg-gray-800 rounded px-1 -mx-1"
                        value={row.payee}
                        onChange={e => updateRow(row._id, { payee: e.target.value })}
                        placeholder="Favorecido"
                      />
                    </td>
                    {isSelectedCredit && (
                      <td className="px-3 py-2">
                        <select
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-28"
                          value={row.grupoGerencial}
                          onChange={e => updateRow(row._id, { grupoGerencial: e.target.value })}
                        >
                          {sortedGrupos.map(g => (
                            <option key={g.id} value={g.id}>{g.number} · {g.name}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-red-400 font-medium whitespace-nowrap">
                      {fmt(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">
          Regras de Classificação ({classificationRules.length})
        </h3>
        {classificationRules.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma regra. O sistema aprende ao classificar transações manualmente.</p>
        ) : (
          <div className="space-y-2">
            {classificationRules.map(rule => {
              const cat = categories.find(c => c.id === rule.categoryId)
              return (
                <div key={rule.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 text-sm">
                  <FileText size={12} className="text-gray-500 shrink-0" />
                  <span className="text-gray-300">
                    Contém <span className="text-[#0F6E56] font-medium">"{rule.contains}"</span>
                  </span>
                  <span className="text-gray-500">→</span>
                  <span className="text-gray-300">{cat ? `${cat.icon} ${cat.name}` : rule.categoryId}</span>
                  {rule.payee && <span className="text-gray-500 text-xs">({rule.payee})</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
