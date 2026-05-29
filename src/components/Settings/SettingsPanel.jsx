import { useState } from 'react'
import { Save, Trash2, Plus, Download, Upload, AlertTriangle, Edit2, Check, X, Lock, ArrowUp, ArrowDown, RotateCcw, User, Building2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { DEFAULT_ACCOUNT_GROUPS } from '../../context/AppContext'
import ConfirmDialog from '../shared/ConfirmDialog'
import CategorySelect from '../shared/CategorySelect'

const PROFILE_COLORS = ['#6366f1', '#0F6E56', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#f59e0b']

function maskDoc(raw, type) {
  const d = raw.replace(/\D/g, '')
  if (type === 'pf') {
    return d.slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export default function SettingsPanel() {
  const {
    settings, updateSettings,
    categories, addCategory, deleteCategory,
    classificationRules, addRule, deleteRule,
    costCenters, addCostCenter,
    gerencialGroups, addGerencialGroup, updateGerencialGroup, deleteGerencialGroup,
    accountGroups, addAccountGroup, updateAccountGroup, deleteAccountGroup,
    moveAccountGroup, reorderAccountGroups,
    profiles, addProfile, updateProfile, deleteProfile,
    accounts,
    data,
  } = useApp()

  const [startDay, setStartDay] = useState(settings.financialMonthStartDay || 1)
  const [saved, setSaved] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', type: 'expense', color: '#6366f1', icon: '📌' })
  const [newRule, setNewRule] = useState({ contains: '', categoryId: '', payee: '' })
  const [newCC, setNewCC] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  // Account groups (conta) management state
  const [agDragId, setAgDragId] = useState(null)
  const [agDragOverId, setAgDragOverId] = useState(null)
  const [agEditId, setAgEditId] = useState(null)
  const [agEditName, setAgEditName] = useState('')
  const [agConfirmDeleteId, setAgConfirmDeleteId] = useState(null)
  const [agNewName, setAgNewName] = useState('')
  const [agNewType, setAgNewType] = useState('financeiro')

  const sortedAccountGroups = [...(accountGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const handleAgDragStart = (e, id) => {
    setAgDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleAgDragOver = (e, id) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== agDragId) setAgDragOverId(id)
  }
  const handleAgDrop = (e, targetId) => {
    e.preventDefault()
    if (!agDragId || agDragId === targetId) { setAgDragId(null); setAgDragOverId(null); return }
    const from = sortedAccountGroups.findIndex(g => g.id === agDragId)
    const to = sortedAccountGroups.findIndex(g => g.id === targetId)
    const reordered = [...sortedAccountGroups]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    reorderAccountGroups(reordered.map(g => g.id))
    setAgDragId(null)
    setAgDragOverId(null)
  }
  const handleAgDragEnd = () => { setAgDragId(null); setAgDragOverId(null) }

  const handleAgRestoreOrder = () => {
    const defaultMap = new Map(DEFAULT_ACCOUNT_GROUPS.map((g, i) => [g.id, i]))
    const sorted = [...(accountGroups || [])].sort((a, b) => {
      const aO = defaultMap.has(a.id) ? defaultMap.get(a.id) : 100 + (a.order ?? 0)
      const bO = defaultMap.has(b.id) ? defaultMap.get(b.id) : 100 + (b.order ?? 0)
      return aO - bO
    })
    reorderAccountGroups(sorted.map(g => g.id))
  }

  // Profile form state
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState(null)
  const [profileConfirmDelete, setProfileConfirmDelete] = useState(null)
  const [profileForm, setProfileForm] = useState({ name: '', type: 'pf', document: '', color: PROFILE_COLORS[0], isDefault: false })
  const setProfileField = (k, v) => setProfileForm(f => ({ ...f, [k]: v }))

  const openProfileEdit = (p) => {
    setEditingProfile(p)
    setProfileForm({ name: p.name, type: p.type, document: p.document || '', color: p.color || PROFILE_COLORS[0], isDefault: !!p.isDefault })
    setShowProfileForm(true)
  }
  const closeProfileForm = () => { setShowProfileForm(false); setEditingProfile(null); setProfileForm({ name: '', type: 'pf', document: '', color: PROFILE_COLORS[0], isDefault: false }) }
  const handleProfileSubmit = (e) => {
    e.preventDefault()
    if (!profileForm.name.trim()) return
    const payload = { ...profileForm, document: profileForm.document.replace(/\D/g, '') }
    if (editingProfile) updateProfile(editingProfile.id, payload)
    else addProfile(payload)
    closeProfileForm()
  }

  // Gerencial group form state
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null)
  const [groupForm, setGroupForm] = useState({ name: '', alias: '', defaultAccountId: '' })

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
    a.download = `finup_backup_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        JSON.parse(ev.target.result)
        localStorage.setItem('finapp_data', ev.target.result)
        window.location.reload()
      } catch {
        alert('Arquivo inválido')
      }
    }
    reader.readAsText(file)
  }

  const openGroupEdit = (group) => {
    setEditingGroup(group)
    setGroupForm({ name: group.name, alias: group.alias, defaultAccountId: group.defaultAccountId || '' })
    setShowGroupForm(true)
  }

  const handleGroupSubmit = (e) => {
    e.preventDefault()
    if (!groupForm.name.trim() || !groupForm.alias.trim()) return
    const payload = {
      name: groupForm.name,
      alias: groupForm.alias.slice(0, 4),
      defaultAccountId: groupForm.defaultAccountId || null,
    }
    if (editingGroup) {
      updateGerencialGroup(editingGroup.id, payload)
    } else {
      addGerencialGroup(payload)
    }
    setShowGroupForm(false)
    setEditingGroup(null)
    setGroupForm({ name: '', alias: '', defaultAccountId: '' })
  }

  const cancelGroupForm = () => {
    setShowGroupForm(false)
    setEditingGroup(null)
    setGroupForm({ name: '', alias: '', defaultAccountId: '' })
  }

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both')
  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit')

  // Compute next group number for display in "new group" button
  const nextGroupNumber = (() => {
    const nums = gerencialGroups.filter(g => typeof g.number === 'number').map(g => g.number)
    return nums.length > 0 ? Math.max(...nums) + 1 : 2
  })()

  return (
    <div className="space-y-6">
      {/* Mês Financeiro */}
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

      {/* Perfis CPF / CNPJ */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Perfis CPF / CNPJ</h2>
          <button className="btn-primary text-xs py-1.5 flex items-center gap-1.5" onClick={() => { setEditingProfile(null); setShowProfileForm(true) }}>
            <Plus size={12} /> Novo Perfil
          </button>
        </div>

        {profiles.length === 0 && !showProfileForm && (
          <p className="text-xs text-gray-600 italic">Nenhum perfil cadastrado. Adicione um perfil para ativar o filtro na barra superior.</p>
        )}

        <div className="space-y-2 mb-3">
          {profiles.map(p => {
            const Icon = p.type === 'pf' ? User : Building2
            const rawDoc = p.document || ''
            const fmtDoc = rawDoc ? maskDoc(rawDoc, p.type) : '—'
            return (
              <div key={p.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: p.color }}>
                  <Icon size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200 font-medium truncate">{p.name}</span>
                    {p.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0F6E56]/20 text-[#0F6E56] font-medium shrink-0">Principal</span>}
                  </div>
                  <p className="text-xs text-gray-500">{p.type === 'pf' ? 'CPF' : 'CNPJ'}: {fmtDoc}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button className="p-1 text-gray-500 hover:text-gray-300 transition-colors" onClick={() => openProfileEdit(p)}><Edit2 size={13} /></button>
                  <button className="p-1 text-gray-500 hover:text-red-400 transition-colors" onClick={() => setProfileConfirmDelete(p.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            )
          })}
        </div>

        {showProfileForm && (
          <form onSubmit={handleProfileSubmit} className="border-t border-gray-700 pt-4 space-y-3">
            <p className="text-xs font-medium text-gray-400">{editingProfile ? 'Editar perfil' : 'Novo perfil'}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Tipo</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-700">
                  {[['pf', 'Pessoa Física'], ['pj', 'Pessoa Jurídica']].map(([v, l]) => (
                    <button type="button" key={v} onClick={() => setProfileField('type', v)}
                      className={`flex-1 py-1.5 text-xs font-medium transition-colors ${profileForm.type === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Nome / Razão Social *</label>
                <input className="input" value={profileForm.name} onChange={e => setProfileField('name', e.target.value)} placeholder="Nome completo..." required />
              </div>
            </div>

            <div>
              <label className="label">{profileForm.type === 'pf' ? 'CPF' : 'CNPJ'}</label>
              <input
                className="input"
                value={maskDoc(profileForm.document, profileForm.type)}
                onChange={e => setProfileField('document', e.target.value.replace(/\D/g, ''))}
                placeholder={profileForm.type === 'pf' ? '000.000.000-00' : '00.000.000/0001-00'}
                maxLength={profileForm.type === 'pf' ? 14 : 18}
              />
            </div>

            <div>
              <label className="label">Cor de identificação</label>
              <div className="flex gap-2 flex-wrap">
                {PROFILE_COLORS.map(c => (
                  <button type="button" key={c} onClick={() => setProfileField('color', c)}
                    className={`w-7 h-7 rounded-full transition-all ${profileForm.color === c ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={profileForm.isDefault} onChange={e => setProfileField('isDefault', e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Perfil principal</span>
            </label>

            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={closeProfileForm}>Cancelar</button>
              <button type="submit" className="btn-primary flex-1 text-xs py-1.5">{editingProfile ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </form>
        )}

        {profileConfirmDelete && (
          <ConfirmDialog
            message="Excluir este perfil? O vínculo das contas associadas será removido."
            onConfirm={() => { deleteProfile(profileConfirmDelete); setProfileConfirmDelete(null) }}
            onCancel={() => setProfileConfirmDelete(null)}
          />
        )}
      </div>

      {/* Categorias */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Categorias ({categories.length})</h2>
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                <span className="text-sm text-gray-200">{cat.icon} {cat.name}</span>
                <span className="badge bg-gray-700 text-gray-400 text-xs">
                  {cat.type === 'income' ? 'Receita' : cat.type === 'expense' ? 'Despesa' : 'Ambos'}
                </span>
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

      {/* Regras de Classificação */}
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
                  Contém <span className="text-[#0F6E56] font-medium">"{rule.contains}"</span>
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
          <CategorySelect
            categories={categories}
            value={newRule.categoryId}
            onChange={e => setNewRule(f => ({ ...f, categoryId: e.target.value }))}
            placeholder="Categoria..."
          />
          <button type="submit" className="btn-secondary flex items-center gap-1"><Plus size={13} /> Adicionar</button>
        </form>
      </div>

      {/* Centros de Custo */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Centros de Custo</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {costCenters.map(cc => (
            <span key={cc} className="badge bg-gray-800 text-gray-300 px-3 py-1 text-xs">{cc}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="Novo centro de custo..." value={newCC} onChange={e => setNewCC(e.target.value)} />
          <button
            className="btn-secondary flex items-center gap-1"
            onClick={() => { if (newCC.trim()) { addCostCenter(newCC.trim()); setNewCC('') } }}
          >
            <Plus size={13} /> Adicionar
          </button>
        </div>
      </div>

      {/* Grupos de Contas */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-300">Grupos de Contas</h2>
            <p className="text-xs text-gray-500 mt-0.5">Arraste ⠿ ou use ↑↓ para definir a ordem exibida em todos os seletores</p>
          </div>
          <button
            className="btn-secondary flex items-center gap-1.5 text-xs"
            onClick={handleAgRestoreOrder}
            title="Restaurar ordem padrão"
          >
            <RotateCcw size={12} /> Padrão
          </button>
        </div>

        <div className="space-y-1 mb-4" onDragOver={e => e.preventDefault()}>
          {sortedAccountGroups.map((g, i) => (
            <div
              key={g.id}
              draggable
              onDragStart={e => handleAgDragStart(e, g.id)}
              onDragOver={e => handleAgDragOver(e, g.id)}
              onDrop={e => handleAgDrop(e, g.id)}
              onDragEnd={handleAgDragEnd}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all border ${
                agDragId === g.id ? 'opacity-40 border-transparent bg-gray-800' :
                agDragOverId === g.id ? 'border-[#0F6E56] bg-[#0F6E56]/10' :
                'border-transparent bg-gray-800 hover:bg-gray-750'
              }`}
            >
              {/* Drag handle */}
              <span
                className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-base leading-none shrink-0"
                title="Arrastar para reordenar"
              >⠿</span>

              {/* Type badge */}
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                g.type === 'financeiro' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {g.type === 'financeiro' ? 'Fin.' : 'Pat.'}
              </span>

              {/* Name (inline edit) */}
              {agEditId === g.id ? (
                <>
                  <input
                    className="input flex-1 py-1 text-sm"
                    value={agEditName}
                    onChange={e => setAgEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { updateAccountGroup(g.id, { name: agEditName }); setAgEditId(null) }
                      if (e.key === 'Escape') setAgEditId(null)
                    }}
                    autoFocus
                  />
                  <button className="btn-primary text-xs py-1 px-2" onClick={() => { updateAccountGroup(g.id, { name: agEditName }); setAgEditId(null) }}>
                    <Check size={11} />
                  </button>
                  <button className="btn-secondary text-xs py-1 px-2" onClick={() => setAgEditId(null)}>
                    <X size={11} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-200 min-w-0 truncate">{g.name}</span>
                  {g.behavior && (
                    <span className="text-xs text-gray-600 shrink-0 italic">
                      {g.behavior === 'divida' ? 'dívidas' : 'empréstimos'}
                    </span>
                  )}
                  {/* ↑↓ reorder */}
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={() => moveAccountGroup(g.id, 'up')}
                      disabled={i === 0}
                      className="p-1 rounded hover:bg-gray-700 disabled:opacity-25 text-gray-400 transition-colors"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      onClick={() => moveAccountGroup(g.id, 'down')}
                      disabled={i === sortedAccountGroups.length - 1}
                      className="p-1 rounded hover:bg-gray-700 disabled:opacity-25 text-gray-400 transition-colors"
                    >
                      <ArrowDown size={11} />
                    </button>
                  </div>
                  {/* Edit */}
                  <button
                    onClick={() => { setAgEditId(g.id); setAgEditName(g.name) }}
                    className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
                  >
                    <Edit2 size={11} />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => setAgConfirmDeleteId(g.id)}
                    className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new group */}
        <div className="flex gap-2 pt-2 border-t border-gray-700">
          <select
            className="input w-36 text-sm"
            value={agNewType}
            onChange={e => setAgNewType(e.target.value)}
          >
            <option value="financeiro">Financeiro</option>
            <option value="patrimonial">Patrimonial</option>
          </select>
          <input
            className="input flex-1 text-sm"
            value={agNewName}
            onChange={e => setAgNewName(e.target.value)}
            placeholder="Nome do novo grupo..."
            onKeyDown={e => {
              if (e.key === 'Enter' && agNewName.trim()) {
                addAccountGroup({ name: agNewName.trim(), type: agNewType })
                setAgNewName('')
              }
            }}
          />
          <button
            className="btn-primary px-3"
            onClick={() => {
              if (!agNewName.trim()) return
              addAccountGroup({ name: agNewName.trim(), type: agNewType })
              setAgNewName('')
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        {agConfirmDeleteId && (
          <ConfirmDialog
            open
            onClose={() => setAgConfirmDeleteId(null)}
            onConfirm={() => { deleteAccountGroup(agConfirmDeleteId); setAgConfirmDeleteId(null) }}
            title="Excluir Grupo"
            message="As contas deste grupo ficarão sem grupo atribuído. Continuar?"
            danger
          />
        )}
      </div>

      {/* Controle Gerencial de Cartão */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-300">Controle Gerencial de Cartão</h2>
            <p className="text-xs text-gray-500 mt-0.5">Grupos usados para classificação gerencial das contas</p>
          </div>
          {!showGroupForm && (
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => { setEditingGroup(null); setGroupForm({ name: '', alias: '', defaultAccountId: '' }); setShowGroupForm(true) }}
            >
              <Plus size={14} /> Grupo {nextGroupNumber}
            </button>
          )}
        </div>

        {/* Formulário inline de criação/edição */}
        {showGroupForm && (
          <form onSubmit={handleGroupSubmit} className="mb-4 p-4 bg-gray-800 rounded-xl border border-gray-700 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {editingGroup ? `Editar Grupo ${editingGroup.number}` : `Novo Grupo ${nextGroupNumber}`}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Nome do Grupo *</label>
                <input
                  className="input"
                  value={groupForm.name}
                  onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Contas Anuais"
                  required
                />
              </div>
              <div>
                <label className="label">Apelido *</label>
                <input
                  className="input"
                  value={groupForm.alias}
                  onChange={e => setGroupForm(f => ({ ...f, alias: e.target.value.slice(0, 4) }))}
                  placeholder="Ex: CA"
                  maxLength={4}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Conta de Resgate Padrão</label>
              <select
                className="input"
                value={groupForm.defaultAccountId}
                onChange={e => setGroupForm(f => ({ ...f, defaultAccountId: e.target.value }))}
              >
                <option value="">Nenhuma</option>
                {nonCreditAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.apelido ? ` (${a.apelido})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary flex items-center gap-1" onClick={cancelGroupForm}>
                <X size={13} /> Cancelar
              </button>
              <button type="submit" className="btn-primary flex items-center gap-1">
                <Check size={13} /> {editingGroup ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </form>
        )}

        {/* Lista de grupos */}
        <div className="space-y-2">
          {gerencialGroups.map(group => (
            <div
              key={group.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${group.fixed ? 'bg-gray-800/50' : 'bg-gray-800'}`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-700 text-xs font-bold text-gray-300">
                  {group.number}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{group.name}</span>
                    <span className="badge bg-gray-700 text-gray-400 text-xs">{group.alias}</span>
                    {group.fixed && (
                      <span className="badge bg-gray-700/50 text-gray-600 text-xs flex items-center gap-1">
                        <Lock size={9} /> fixo
                      </span>
                    )}
                  </div>
                  {group.defaultAccountId && (() => {
                    const acc = accounts.find(a => a.id === group.defaultAccountId)
                    return acc ? (
                      <p className="text-xs text-gray-500 mt-0.5">Resgate: {acc.name}{acc.apelido ? ` (${acc.apelido})` : ''}</p>
                    ) : null
                  })()}
                </div>
              </div>
              {!group.fixed && (
                <div className="flex gap-1">
                  <button
                    onClick={() => openGroupEdit(group)}
                    className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteGroup(group)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Backup */}
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

      {/* Zona de Perigo */}
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

      <ConfirmDialog
        open={!!confirmDeleteGroup}
        onClose={() => setConfirmDeleteGroup(null)}
        onConfirm={() => deleteGerencialGroup(confirmDeleteGroup.id)}
        title="Excluir Grupo Gerencial"
        message={`Excluir o grupo "${confirmDeleteGroup?.name}"?`}
        danger
      />

      {/* Identidade — visível apenas no mobile (sidebar já mostra no desktop) */}
      <div className="md:hidden border-t border-gray-800 pt-4 text-center space-y-0.5">
        <p className="text-xs text-gray-600 font-medium">Gislaine &amp; Victor Moreira</p>
        <p className="text-xs text-gray-700 italic">Transformando conhecimento em resultados.</p>
      </div>
    </div>
  )
}
