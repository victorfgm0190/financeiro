import { useState, useRef } from 'react'
import { Save, Trash2, Plus, Download, Upload, AlertTriangle, Edit2, Check, X, Lock, ArrowUp, ArrowDown, RotateCcw, User, Building2, ShieldCheck, Clock, EyeOff, Eye, RefreshCw, Anchor, Calculator } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { DEFAULT_ACCOUNT_GROUPS } from '../../context/AppContext'
import { STORAGE_KEY } from '../../lib/storage'
import { fmt } from '../shared/utils'
import { triggerBackupDownload, getLastBackupTs } from '../../hooks/useAutoBackup'
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
    categories, addCategory, updateCategory, deleteCategory,
    classificationRules, addRule, deleteRule,
    gerencialRules, addGerencialRule, deleteGerencialRule, moveGerencialRule,
    costCenters, addCostCenter,
    gerencialGroups, addGerencialGroup, updateGerencialGroup, deleteGerencialGroup,
    accountGroups, addAccountGroup, updateAccountGroup, deleteAccountGroup,
    moveAccountGroup, reorderAccountGroups,
    profiles, addProfile, updateProfile, deleteProfile,
    accounts,
    transactions,
    recalcularSaldo,
    saveBalanceSnapshot,
    restoreBalanceSnapshot,
    corrigirDadosGerencial,
    data,
  } = useApp()

  const aplicAccounts = accounts.filter(a => a.contaAplicacao)
  const [startDay, setStartDay] = useState(settings.financialMonthStartDay || 1)
  const [monthMode, setMonthMode] = useState(settings.financialMonthMode || 'custom')
  const [saved, setSaved] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', type: 'expense', color: '#6366f1', icon: '📌' })
  const [newRule, setNewRule] = useState({ contains: '', categoryId: '', payee: '' })
  const [newGRule, setNewGRule] = useState({ contains: '', isParcelado: 'any', minAmount: '', maxAmount: '', grupoGerencialId: '' })
  const [newCC, setNewCC] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [recalcStatus, setRecalcStatus] = useState({ running: false, total: 0, done: 0, totalBalance: 0, totalProjected: 0 })
  const [corrigirStatus, setCorrigirStatus] = useState(null)

  const handleRecalcAll = async () => {
    const eligible = accounts.filter(a =>
      a.type !== 'credit' && a.type !== 'asset' && a.type !== 'liability'
    )
    if (eligible.length === 0) return
    saveBalanceSnapshot(eligible.map(a => a.id), 'Recalcular todos os saldos')
    const today = new Date().toISOString().slice(0, 10)
    const rb = v => Math.round(v * 100) / 100
    let totalBalance = 0
    let totalProjected = 0
    setRecalcStatus({ running: true, total: eligible.length, done: 0, totalBalance: 0, totalProjected: 0 })
    for (let i = 0; i < eligible.length; i++) {
      const acc = eligible[i]
      await new Promise(r => setTimeout(r, 40))
      recalcularSaldo(acc.id)
      const initBal = rb(acc.initialBalance ?? 0)
      let bal = initBal
      let proj = initBal
      transactions.forEach(tx => {
        if (tx.type === 'income' && tx.accountId === acc.id) {
          proj = rb(proj + tx.amount)
          if (tx.date <= today) bal = rb(bal + tx.amount)
        } else if (tx.type === 'expense' && tx.accountId === acc.id && tx.accountType !== 'credit') {
          proj = rb(proj - tx.amount)
          if (tx.date <= today) bal = rb(bal - tx.amount)
        } else if (tx.type === 'transfer') {
          if (tx.accountId === acc.id) {
            proj = rb(proj - tx.amount)
            if (tx.date <= today) bal = rb(bal - tx.amount)
          } else if (tx.toAccountId === acc.id) {
            proj = rb(proj + tx.amount)
            if (tx.date <= today) bal = rb(bal + tx.amount)
          }
        } else if (tx.type === 'credit_payment' && tx.fromAccountId === acc.id) {
          proj = rb(proj - tx.amount)
          if (tx.date <= today) bal = rb(bal - tx.amount)
        }
      })
      totalBalance = rb(totalBalance + bal)
      totalProjected = rb(totalProjected + proj)
      setRecalcStatus({ running: i < eligible.length - 1, total: eligible.length, done: i + 1, totalBalance, totalProjected })
    }
  }

  // Account groups (conta) management state
  const [agDragId, setAgDragId] = useState(null)
  const [agDragOverId, setAgDragOverId] = useState(null)
  const [agEditId, setAgEditId] = useState(null)
  const [agEditName, setAgEditName] = useState('')
  const [agEditAnchorId, setAgEditAnchorId] = useState('')
  const [agConfirmDeleteId, setAgConfirmDeleteId] = useState(null)
  const [agNewName, setAgNewName] = useState('')
  const [agNewType, setAgNewType] = useState('financeiro')

  // Balance adjustment by group state
  const today = new Date().toISOString().slice(0, 10)
  const rbLocal = v => Math.round(v * 100) / 100
  const [ajusteGrupoId, setAjusteGrupoId] = useState('')
  const [ajusteData, setAjusteData] = useState(today)
  const [ajusteExpected, setAjusteExpected] = useState('')
  const [ajusteResult, setAjusteResult] = useState(null)
  const [ajusteDone, setAjusteDone] = useState(false)

  const calcAjusteGrupo = () => {
    setAjusteResult(null)
    setAjusteDone(false)
    const group = (accountGroups || []).find(g => g.id === ajusteGrupoId)
    if (!group) return
    const groupAccounts = accounts.filter(a => a.accountGroupId === ajusteGrupoId && a.type !== 'credit' && a.type !== 'asset' && a.type !== 'liability')
    let calculatedBalance = 0
    groupAccounts.forEach(acc => {
      let bal = rbLocal(acc.initialBalance ?? 0)
      transactions.forEach(tx => {
        if (tx.date > ajusteData) return
        if (tx.type === 'income' && tx.accountId === acc.id) bal = rbLocal(bal + tx.amount)
        else if (tx.type === 'expense' && tx.accountId === acc.id && tx.accountType !== 'credit') bal = rbLocal(bal - tx.amount)
        else if (tx.type === 'transfer') {
          if (tx.accountId === acc.id) bal = rbLocal(bal - tx.amount)
          else if (tx.toAccountId === acc.id) bal = rbLocal(bal + tx.amount)
        } else if (tx.type === 'credit_payment' && tx.fromAccountId === acc.id) bal = rbLocal(bal - tx.amount)
      })
      calculatedBalance = rbLocal(calculatedBalance + bal)
    })
    const expected = parseFloat(String(ajusteExpected).replace(',', '.'))
    if (isNaN(expected)) return
    const difference = rbLocal(expected - calculatedBalance)
    const anchorAccount = group.anchorAccountId ? accounts.find(a => a.id === group.anchorAccountId) : null
    const newInitialBalance = anchorAccount != null ? rbLocal((anchorAccount.initialBalance ?? 0) + difference) : null
    setAjusteResult({ calculatedBalance, expected, difference, anchorAccount, newInitialBalance, groupAccounts, group })
  }

  const handleAjusteConfirm = async () => {
    if (!ajusteResult?.anchorAccount) return
    saveBalanceSnapshot([ajusteResult.anchorAccount.id], 'Ajuste de saldo por grupo')
    recalcularSaldo(ajusteResult.anchorAccount.id, ajusteResult.newInitialBalance)
    for (const acc of ajusteResult.groupAccounts) {
      if (acc.id !== ajusteResult.anchorAccount.id) {
        await new Promise(r => setTimeout(r, 30))
        recalcularSaldo(acc.id)
      }
    }
    setAjusteDone(true)
    setAjusteResult(null)
  }

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
    updateSettings({ financialMonthStartDay: Number(startDay), financialMonthMode: monthMode })
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

  const importInputRef = useRef(null)
  const [pendingImport, setPendingImport] = useState(null) // { parsed, fileName }
  const [confirmImport, setConfirmImport] = useState(false)

  const handleExport = () => triggerBackupDownload(data)

  const handleImportFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (!parsed.accounts || !parsed.transactions) {
          alert('Este arquivo não parece ser um backup válido do Finup.')
          return
        }
        setPendingImport({ parsed, fileName: file.name })
        setConfirmImport(true)
      } catch {
        alert('Arquivo inválido — não é um JSON válido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImportConfirm = () => {
    if (!pendingImport) return
    const { _exportedAt, _app, ...cleanData } = pendingImport.parsed
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData))
    window.location.reload()
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
      {/* Período Financeiro */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Período Financeiro</h2>
        <p className="text-xs text-gray-500 mb-4">Como receitas e despesas são agrupadas no Dashboard e relatórios.</p>

        <div className="space-y-2.5 mb-4">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="finMode"
              className="mt-0.5 accent-[#0F6E56] cursor-pointer shrink-0"
              checked={monthMode === 'calendar'}
              onChange={() => setMonthMode('calendar')}
            />
            <span className="text-sm text-gray-200">
              Mês corrido
              <span className="block text-xs text-gray-500">Período sempre do dia 01 ao último dia do mês calendário (ignora o dia de início).</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="finMode"
              className="mt-0.5 accent-[#0F6E56] cursor-pointer shrink-0"
              checked={monthMode === 'custom'}
              onChange={() => setMonthMode('custom')}
            />
            <span className="text-sm text-gray-200">
              Mês personalizado
              <span className="block text-xs text-gray-500">Período começa no dia de início abaixo (ex.: dia 15 → 15/05 a 14/06 = “Maio”).</span>
            </span>
          </label>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="label">Dia de Início do Mês Financeiro</label>
            <input
              className={`input ${monthMode === 'calendar' ? 'opacity-50 cursor-not-allowed' : ''}`}
              type="number"
              min="1"
              max="28"
              value={startDay}
              onChange={e => setStartDay(e.target.value)}
              disabled={monthMode === 'calendar'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {monthMode === 'calendar'
                ? 'Sem efeito no modo “Mês corrido”.'
                : 'Ex: dia 5 = período vai do dia 5 ao dia 4 do mês seguinte'}
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
            <div key={cat.id} className="flex items-center justify-between gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                <span className="text-sm text-gray-200 truncate">{cat.icon} {cat.name}</span>
                <span className="badge bg-gray-700 text-gray-400 text-xs shrink-0">
                  {cat.type === 'income' ? 'Receita' : cat.type === 'expense' ? 'Despesa' : 'Ambos'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {aplicAccounts.length > 0 && cat.type !== 'income' && (
                  <select
                    className="input w-auto text-xs py-1 max-w-[150px]"
                    title="Conta de Investimento — despesas de cartão nesta categoria geram um aporte automático nesta conta"
                    value={cat.investmentAccountId || ''}
                    onChange={e => updateCategory(cat.id, { investmentAccountId: e.target.value || null })}
                  >
                    <option value="">Sem investimento</option>
                    {aplicAccounts.map(a => (
                      <option key={a.id} value={a.id}>🐷 {a.apelido || a.name}</option>
                    ))}
                  </select>
                )}
                <button onClick={() => deleteCategory(cat.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors rounded">
                  <Trash2 size={12} />
                </button>
              </div>
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

      {/* Regras de Grupo Gerencial */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Regras de Grupo Gerencial ({gerencialRules.length})</h2>
        <p className="text-xs text-gray-500 mb-4">Testadas em ordem — a primeira que bater é aplicada na importação de fatura.</p>
        <div className="space-y-2 mb-4">
          {gerencialRules.length === 0 && (
            <p className="text-xs text-gray-500">Nenhuma regra cadastrada.</p>
          )}
          {[...gerencialRules].sort((a, b) => a.order - b.order).map((rule, idx, arr) => {
            const grupo = gerencialGroups.find(g => g.id === rule.grupoGerencialId)
            const labelParc = rule.isParcelado === 'yes' ? 'parcelado' : rule.isParcelado === 'no' ? 'à vista' : null
            const labelVal = (rule.minAmount != null || rule.maxAmount != null)
              ? [rule.minAmount != null ? `min R$${rule.minAmount}` : null, rule.maxAmount != null ? `max R$${rule.maxAmount}` : null].filter(Boolean).join(', ')
              : null
            return (
              <div key={rule.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-500 w-5 text-center shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-300">
                    Contém <span className="text-[#0F6E56] font-medium">"{rule.contains}"</span>
                    {labelParc && <span className="text-gray-500 ml-1">· {labelParc}</span>}
                    {labelVal && <span className="text-gray-500 ml-1">· {labelVal}</span>}
                    {' → '}
                    <span className="text-gray-200">{grupo ? `${grupo.number} · ${grupo.name}` : rule.grupoGerencialId}</span>
                  </span>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => moveGerencialRule(rule.id, 'up')} disabled={idx === 0} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-500 transition-colors">
                    <ArrowUp size={12} />
                  </button>
                  <button onClick={() => moveGerencialRule(rule.id, 'down')} disabled={idx === arr.length - 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-500 transition-colors">
                    <ArrowDown size={12} />
                  </button>
                  <button onClick={() => deleteGerencialRule(rule.id)} className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Form — nova regra */}
        <form
          onSubmit={e => {
            e.preventDefault()
            if (!newGRule.contains.trim() || !newGRule.grupoGerencialId) return
            addGerencialRule({
              contains: newGRule.contains.trim(),
              isParcelado: newGRule.isParcelado,
              minAmount: newGRule.minAmount !== '' ? Number(newGRule.minAmount) : null,
              maxAmount: newGRule.maxAmount !== '' ? Number(newGRule.maxAmount) : null,
              grupoGerencialId: newGRule.grupoGerencialId,
            })
            setNewGRule({ contains: '', isParcelado: 'any', minAmount: '', maxAmount: '', grupoGerencialId: '' })
          }}
          className="space-y-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              className="input text-sm"
              placeholder="Palavra-chave *"
              value={newGRule.contains}
              onChange={e => setNewGRule(f => ({ ...f, contains: e.target.value }))}
              required
            />
            <select
              className="input text-sm"
              value={newGRule.isParcelado}
              onChange={e => setNewGRule(f => ({ ...f, isParcelado: e.target.value }))}
            >
              <option value="any">Qualquer</option>
              <option value="yes">Parcelado</option>
              <option value="no">À Vista</option>
            </select>
            <input
              className="input text-sm"
              type="number"
              step="0.01"
              min="0"
              placeholder="Valor mín (R$)"
              value={newGRule.minAmount}
              onChange={e => setNewGRule(f => ({ ...f, minAmount: e.target.value }))}
            />
            <input
              className="input text-sm"
              type="number"
              step="0.01"
              min="0"
              placeholder="Valor máx (R$)"
              value={newGRule.maxAmount}
              onChange={e => setNewGRule(f => ({ ...f, maxAmount: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <select
              className="input text-sm flex-1"
              value={newGRule.grupoGerencialId}
              onChange={e => setNewGRule(f => ({ ...f, grupoGerencialId: e.target.value }))}
              required
            >
              <option value="">Grupo Gerencial *</option>
              {[...gerencialGroups].sort((a, b) => {
                if (a.number === 'D') return 1
                if (b.number === 'D') return -1
                return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
              }).map(g => (
                <option key={g.id} value={g.id}>{g.number} · {g.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-secondary flex items-center gap-1 shrink-0">
              <Plus size={13} /> Adicionar
            </button>
          </div>
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

              {/* Name + anchor (inline edit) */}
              {agEditId === g.id ? (
                <>
                  <input
                    className="input flex-1 py-1 text-sm min-w-0"
                    value={agEditName}
                    onChange={e => setAgEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setAgEditId(null)
                    }}
                    autoFocus
                  />
                  <select
                    className="input py-1 text-xs w-36 shrink-0"
                    value={agEditAnchorId}
                    onChange={e => setAgEditAnchorId(e.target.value)}
                    title="Conta âncora para ajuste de saldo"
                  >
                    <option value="">— Âncora —</option>
                    {accounts.filter(a => a.accountGroupId === g.id && a.type !== 'credit' && a.type !== 'asset' && a.type !== 'liability').map(a => (
                      <option key={a.id} value={a.id}>{a.apelido || a.name}</option>
                    ))}
                  </select>
                  <button className="btn-primary text-xs py-1 px-2 shrink-0" onClick={() => { updateAccountGroup(g.id, { name: agEditName, anchorAccountId: agEditAnchorId || null }); setAgEditId(null) }}>
                    <Check size={11} />
                  </button>
                  <button className="btn-secondary text-xs py-1 px-2 shrink-0" onClick={() => setAgEditId(null)}>
                    <X size={11} />
                  </button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm min-w-0 truncate ${g.inibido ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{g.name}</span>
                  {g.anchorAccountId && !g.inibido && (
                    <span className="flex items-center gap-0.5 text-xs text-gray-500 shrink-0" title={`Âncora: ${accounts.find(a => a.id === g.anchorAccountId)?.apelido || accounts.find(a => a.id === g.anchorAccountId)?.name || '?'}`}>
                      <Anchor size={10} />
                    </span>
                  )}
                  {g.behavior && !g.inibido && (
                    <span className="text-xs text-gray-600 shrink-0 italic">
                      {g.behavior === 'divida' ? 'dívidas' : 'empréstimos'}
                    </span>
                  )}
                  {g.inibido && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-500 shrink-0 font-medium">
                      Inibido
                    </span>
                  )}
                  {!g.inibido && (
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
                  )}
                  {/* Inibir / Reativar */}
                  {g.inibido ? (
                    <button
                      onClick={() => updateAccountGroup(g.id, { inibido: false })}
                      title="Reativar grupo"
                      className="p-1 rounded hover:bg-gray-700 text-emerald-600 hover:text-emerald-400 transition-colors shrink-0"
                    >
                      <Eye size={11} />
                    </button>
                  ) : (
                    <button
                      onClick={() => updateAccountGroup(g.id, { inibido: true })}
                      title="Inibir grupo (ocultar do app)"
                      className="p-1 rounded hover:bg-gray-700 text-gray-600 hover:text-amber-400 transition-colors shrink-0"
                    >
                      <EyeOff size={11} />
                    </button>
                  )}
                  {!g.inibido && (
                    <>
                      {/* Edit */}
                      <button
                        onClick={() => { setAgEditId(g.id); setAgEditName(g.name); setAgEditAnchorId(g.anchorAccountId || '') }}
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
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-gray-300">Backup de Dados</h2>
        </div>

        {/* Status */}
        {(() => {
          const ts = getLastBackupTs()
          return ts ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800/60 rounded-lg px-3 py-2">
              <Clock size={12} className="text-emerald-500 shrink-0" />
              <span>
                Último backup baixado:{' '}
                <span className="text-gray-300">
                  {new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-500/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="shrink-0" />
              <span>Nenhum backup baixado ainda. Recomendamos exportar regularmente.</span>
            </div>
          )
        })()}

        {/* Counts */}
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {[
            ['Contas', data.accounts?.length ?? 0],
            ['Lançamentos', data.transactions?.length ?? 0],
            ['Agendamentos', data.schedules?.length ?? 0],
          ].map(([label, count]) => (
            <div key={label} className="bg-gray-800 rounded-lg py-2 px-1">
              <p className="text-gray-200 font-bold text-base">{count}</p>
              <p className="text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button className="btn-primary flex items-center justify-center gap-2 flex-1" onClick={handleExport}>
            <Download size={14} /> Exportar backup completo
          </button>
          <label className="btn-secondary flex items-center justify-center gap-2 flex-1 cursor-pointer">
            <Upload size={14} /> Importar backup
            <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFileChange} />
          </label>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Os dados são salvos automaticamente no navegador a cada alteração.
          O backup periódico (a cada 24h com o app aberto) é baixado automaticamente para a pasta Downloads.
          Download ao fechar a aba não é suportado pelos navegadores — use o botão acima antes de sair.
        </p>
      </div>

      {/* Manutenção */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
          <RefreshCw size={14} className="text-gray-500" /> Manutenção
        </h2>
        <p className="text-xs text-gray-500 mb-4">Ferramentas para corrigir inconsistências nos dados.</p>

        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm text-gray-200 font-medium">Recalcular todos os saldos</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Recalcula o saldo atual de cada conta a partir do saldo inicial e dos lançamentos até hoje.
              Útil para corrigir inconsistências causadas por importações ou edições manuais.
            </p>
          </div>

          {recalcStatus.running && (
            <div className="space-y-1.5">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${recalcStatus.total > 0 ? Math.round((recalcStatus.done / recalcStatus.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">Recalculando... {recalcStatus.done} / {recalcStatus.total} contas</p>
            </div>
          )}

          {recalcStatus.done > 0 && !recalcStatus.running && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check size={13} />
                <span>{recalcStatus.done} conta{recalcStatus.done !== 1 ? 's' : ''} recalculada{recalcStatus.done !== 1 ? 's' : ''} com sucesso.</span>
              </div>
              <div className="text-xs text-gray-400 pl-5 space-y-0.5">
                <p>Saldo atual total: <span className="text-white/80 font-medium">{fmt(recalcStatus.totalBalance)}</span></p>
                {Math.abs(recalcStatus.totalProjected - recalcStatus.totalBalance) >= 0.005 && (
                  <p>Saldo projetado total: <span className="text-sky-300 font-medium">{fmt(recalcStatus.totalProjected)}</span></p>
                )}
              </div>
            </div>
          )}

          <button
            className="btn-secondary flex items-center gap-2"
            onClick={handleRecalcAll}
            disabled={recalcStatus.running}
          >
            <RefreshCw size={13} className={recalcStatus.running ? 'animate-spin' : ''} />
            {recalcStatus.running ? 'Recalculando...' : 'Recalcular todos os saldos'}
          </button>

          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 mb-2">
              Corrige transferências e agendamentos gerenciais do Grupo G: elimina provisões imediatas erradas de parcelados e reconstrói agendamentos com datas corretas.
            </p>
            {corrigirStatus === 'done' && (
              <p className="text-xs text-green-400 mb-2">Dados gerenciais corrigidos com sucesso.</p>
            )}
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => { corrigirDadosGerencial(); setCorrigirStatus('done') }}
            >
              <RefreshCw size={13} />
              Corrigir Dados Gerenciais
            </button>
          </div>

          <div className="border-t border-gray-800 pt-4 space-y-3">
            <div>
              <p className="text-sm text-gray-200 font-medium flex items-center gap-1.5">
                <Calculator size={13} className="text-gray-500" /> Ajuste de Saldo por Grupo
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Corrige o saldo inicial da conta âncora do grupo para que o saldo calculado bata com o saldo real informado.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="label">Grupo de contas</label>
                <select
                  className="input text-sm"
                  value={ajusteGrupoId}
                  onChange={e => { setAjusteGrupoId(e.target.value); setAjusteResult(null); setAjusteDone(false) }}
                >
                  <option value="">Selecione um grupo...</option>
                  {(accountGroups || []).filter(g => !g.inibido).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {ajusteGrupoId && !(accountGroups || []).find(g => g.id === ajusteGrupoId)?.anchorAccountId && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Este grupo não tem conta âncora definida. Configure em Configurações → Grupos de Contas antes de prosseguir.
                </p>
              )}

              {ajusteGrupoId && (accountGroups || []).find(g => g.id === ajusteGrupoId)?.anchorAccountId && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Data de referência</label>
                      <input
                        type="date"
                        className="input text-sm"
                        value={ajusteData}
                        onChange={e => { setAjusteData(e.target.value); setAjusteResult(null); setAjusteDone(false) }}
                      />
                    </div>
                    <div>
                      <label className="label">Saldo esperado (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input text-sm"
                        value={ajusteExpected}
                        onChange={e => { setAjusteExpected(e.target.value); setAjusteResult(null); setAjusteDone(false) }}
                        placeholder="Ex: -1234,56"
                      />
                    </div>
                  </div>

                  <button
                    className="btn-secondary flex items-center gap-2 self-start"
                    onClick={calcAjusteGrupo}
                    disabled={!ajusteExpected}
                  >
                    <Calculator size={13} /> Calcular diferença
                  </button>
                </>
              )}
            </div>

            {ajusteResult && (
              <div className="bg-gray-900 rounded-lg p-3 space-y-1.5 text-xs">
                <p className="font-medium text-gray-300 mb-2">Resumo do ajuste</p>
                <div className="flex justify-between">
                  <span className="text-gray-500">Saldo calculado pelo sistema</span>
                  <span className="text-gray-200">{fmt(ajusteResult.calculatedBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Saldo informado</span>
                  <span className="text-gray-200">{fmt(ajusteResult.expected)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1">
                  <span className="text-gray-500">Diferença</span>
                  <span className={ajusteResult.difference === 0 ? 'text-gray-400' : ajusteResult.difference > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {ajusteResult.difference > 0 ? '+' : ''}{fmt(ajusteResult.difference)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Conta âncora</span>
                  <span className="text-gray-200">{ajusteResult.anchorAccount?.apelido || ajusteResult.anchorAccount?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Novo saldo inicial da âncora</span>
                  <span className={ajusteResult.newInitialBalance < 0 ? 'text-red-300' : 'text-sky-300'}>{fmt(ajusteResult.newInitialBalance)}</span>
                </div>
                {ajusteResult.difference === 0 ? (
                  <p className="text-gray-500 italic text-xs pt-1">Nenhum ajuste necessário — saldos já coincidem.</p>
                ) : (
                  <button
                    className="btn-primary flex items-center gap-2 mt-2 w-full justify-center"
                    onClick={handleAjusteConfirm}
                  >
                    <Check size={13} /> Confirmar ajuste
                  </button>
                )}
              </div>
            )}

            {ajusteDone && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <Check size={12} /> Saldo inicial ajustado e contas recalculadas com sucesso.
              </p>
            )}
          </div>

          {data.settings?.lastBalanceSnapshot && (
            <div className="border-t border-gray-700 pt-4 space-y-2">
              <div>
                <p className="text-sm text-gray-200 font-medium flex items-center gap-1.5">
                  <RotateCcw size={13} className="text-amber-400" /> Desfazer último ajuste de saldo
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.settings.lastBalanceSnapshot.reason} · {data.settings.lastBalanceSnapshot.date}
                  {' · '}{data.settings.lastBalanceSnapshot.accounts?.length} conta{data.settings.lastBalanceSnapshot.accounts?.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                className="btn-secondary flex items-center gap-2 text-amber-400 border-amber-900/40 hover:bg-amber-900/20"
                onClick={restoreBalanceSnapshot}
              >
                <RotateCcw size={13} /> Restaurar saldo anterior
              </button>
            </div>
          )}
        </div>
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
        onConfirm={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload() }}
        title="Apagar Todos os Dados"
        message="Tem certeza? Todos os dados (contas, lançamentos, agendamentos) serão apagados permanentemente."
        danger
      />

      <ConfirmDialog
        open={confirmImport}
        onClose={() => { setConfirmImport(false); setPendingImport(null) }}
        onConfirm={handleImportConfirm}
        title="Restaurar Backup"
        message={`Importar "${pendingImport?.fileName}"? Todos os dados atuais (${data.accounts?.length ?? 0} contas, ${data.transactions?.length ?? 0} lançamentos) serão substituídos pelo backup. Esta ação não pode ser desfeita.`}
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
