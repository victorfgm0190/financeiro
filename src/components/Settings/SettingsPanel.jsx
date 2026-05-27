import { useState } from 'react'
import { Save, Trash2, Plus, Download, Upload, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import ConfirmDialog from '../shared/ConfirmDialog'

export default function SettingsPanel() {
  const {
    settings, updateSettings,
    categories, addCategory, deleteCategory,
    classificationRules, addRule, deleteRule,
    costCenters, addCostCenter,
    data,
  } = useApp()

  const [startDay, setStartDay] = useState(settings.financialMonthStartDay || 1)
  const [saved, setSaved] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', type: 'expense', color: '#6366f1', icon: '📌' })
  const [newRule, setNewRule] = useState({ contains: '', categoryId: '', payee: '' })
  const [newCC, setNewCC] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const handleSaveSettings = () => {
    updateSettings({ financialMonthStartDay: Number(startDay) })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAddCategory = (e) => {
    e.preventDefault()
    if (!newCategory.name.trim()) return
    addCategory(newCategory)
    setNewCategory({ name: '', type: 'expense', color: '#6366f1', icon: '📌' })
  }

  const handleAddRule = (e) => {
    e.preventDefault()
    if (!newRule.contains || !newRule.categoryId) return
    addRule(newRule)
    setNewRule({ contains: '', categoryId: '', payee: '' })
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finapp_backup_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result)
        localStorage.setItem('finapp_data', ev.target.result)
        window.location.reload()
      } catch {
        alert('Arquivo inválido')
      }
    }
    reader.readAsText(file)
  }

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both')

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Mês Financeiro</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="label">Dia de Início do Mês Financeiro</label>
            <input
              className="input"
              type="number"
              min="1"
              max="28"
              value={startDay}
              onChange={e => setStartDay(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Ex: dia 5 = período vai do dia 5 ao dia 4 do mês seguinte
            </p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={handleSaveSettings}>
            <Save size={14} /> {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Categorias ({categories.length})</h2>
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                <span className="text-sm text-gray-200">{cat.icon} {cat.name}</span>
                <span className="badge bg-gray-700 text-gray-400 text-xs">{cat.type === 'income' ? 'Receita' : cat.type === 'expense' ? 'Despesa' : 'Ambos'}</span>
              </div>
              <button onClick={() => deleteCategory(cat.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors rounded">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddCategory} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input className="input col-span-2 sm:col-span-1" placeholder="Nome" value={newCategory.name} onChange={e => setNewCategory(f => ({ ...f, name: e.target.value }))} />
          <select className="input" value={newCategory.type} onChange={e => setNewCategory(f => ({ ...f, type: e.target.value }))}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
            <option value="both">Ambos</option>
          </select>
          <input className="input" placeholder="Emoji" value={newCategory.icon} onChange={e => setNewCategory(f => ({ ...f, icon: e.target.value }))} maxLength={2} />
          <button type="submit" className="btn-secondary flex items-center gap-1"><Plus size={13} /> Adicionar</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Regras de Classificação ({classificationRules.length})</h2>
        <div className="space-y-2 mb-4">
          {classificationRules.length === 0 && (
            <p className="text-xs text-gray-500">Nenhuma regra. Regras são criadas automaticamente ao classificar importações.</p>
          )}
          {classificationRules.map(rule => {
            const cat = categories.find(c => c.id === rule.categoryId)
            return (
              <div key={rule.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-300">
                  Contém <span className="text-indigo-400 font-medium">"{rule.contains}"</span>
                  {' → '}
                  <span className="text-gray-200">{cat ? `${cat.icon} ${cat.name}` : rule.categoryId}</span>
                  {rule.payee && <span className="text-gray-500 text-xs ml-1">({rule.payee})</span>}
                </span>
                <button onClick={() => deleteRule(rule.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors rounded">
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
        <form onSubmit={handleAddRule} className="grid grid-cols-3 gap-2">
          <input className="input" placeholder="Contém texto..." value={newRule.contains} onChange={e => setNewRule(f => ({ ...f, contains: e.target.value }))} />
          <select className="input" value={newRule.categoryId} onChange={e => setNewRule(f => ({ ...f, categoryId: e.target.value }))}>
            <option value="">Categoria...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button type="submit" className="btn-secondary flex items-center gap-1"><Plus size={13} /> Adicionar</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Centros de Custo</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {costCenters.map(cc => (
            <span key={cc} className="badge bg-gray-800 text-gray-300 px-3 py-1 text-xs">{cc}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="Novo centro de custo..." value={newCC} onChange={e => setNewCC(e.target.value)} />
          <button className="btn-secondary flex items-center gap-1" onClick={() => { if (newCC.trim()) { addCostCenter(newCC.trim()); setNewCC('') } }}>
            <Plus size={13} /> Adicionar
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Backup de Dados</h2>
        <div className="flex gap-3">
          <button className="btn-secondary flex items-center gap-2" onClick={handleExport}>
            <Download size={14} /> Exportar Backup
          </button>
          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload size={14} /> Importar Backup
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-2">Os dados são armazenados localmente no seu navegador (localStorage).</p>
      </div>

      <div className="card border border-red-900/40">
        <h2 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
          <AlertTriangle size={14} /> Zona de Perigo
        </h2>
        <p className="text-xs text-gray-500 mb-3">Apagar todos os dados do aplicativo. Esta ação é irreversível.</p>
        <button className="btn-danger" onClick={() => setConfirmReset(true)}>Apagar Todos os Dados</button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { localStorage.removeItem('finapp_data'); window.location.reload() }}
        title="Apagar Todos os Dados"
        message="Tem certeza? Todos os dados (contas, lançamentos, agendamentos) serão apagados permanentemente."
        danger
      />
    </div>
  )
}
