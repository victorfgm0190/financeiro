import { useState } from 'react'
import {
  Plus, Star, Trash2, Edit2, CreditCard, Landmark, PiggyBank,
  DollarSign, FileText, ArrowUp, ArrowDown, Settings, Building2,
  ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import AccountForm from './AccountForm'
import ExtratoContaPanel from './ExtratoContaPanel'

const ACCOUNT_ICONS = {
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
  cash: DollarSign,
  asset: Building2,
  liability: Landmark,
}

const ACCOUNT_LABELS = {
  checking: 'Conta Corrente',
  savings: 'Poupança',
  credit: 'Cartão de Crédito',
  cash: 'Dinheiro',
  asset: 'Bem / Ativo',
  liability: 'Dívida / Passivo',
}

const TYPE_COLORS = {
  checking: 'from-blue-600 to-blue-800',
  savings: 'from-emerald-600 to-emerald-800',
  credit: 'from-purple-600 to-purple-800',
  cash: 'from-amber-600 to-amber-800',
  asset: 'from-teal-600 to-teal-800',
  liability: 'from-rose-700 to-rose-900',
}

function UpdateValueModal({ account, onClose }) {
  const { updateAccountValue } = useApp()
  const [newValue, setNewValue] = useState(String(account.balance ?? ''))
  const [note, setNote] = useState('')

  const lastEntry = (account.valueHistory || []).slice(-1)[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newValue === '') return
    updateAccountValue(account.id, Number(newValue), note)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {lastEntry && (
        <div className="p-3 bg-gray-800 rounded-lg text-xs text-gray-400">
          Último valor: <span className="text-gray-200 font-medium">{fmt(lastEntry.value)}</span> em {lastEntry.date}
          {lastEntry.note && <span className="ml-1 italic">— {lastEntry.note}</span>}
        </div>
      )}
      <div>
        <label className="label">Novo Valor (R$) *</label>
        <input
          className="input"
          type="number"
          step="0.01"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="0,00"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label">Observação</label>
        <input
          className="input"
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ex: Avaliação de mercado, atualização FIPE..."
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">Atualizar Valor</button>
      </div>
    </form>
  )
}

function GroupManager({ groups }) {
  const { addAccountGroup, updateAccountGroup, deleteAccountGroup, moveAccountGroup } = useApp()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('financeiro')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const sorted = [...groups].sort((a, b) => a.order - b.order)

  const handleAdd = () => {
    if (!newName.trim()) return
    addAccountGroup({ name: newName.trim(), type: newType })
    setNewName('')
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {sorted.map((g, i) => (
          <div key={g.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-800">
            {editId === g.id ? (
              <>
                <input
                  className="input flex-1 py-1.5 text-sm"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { updateAccountGroup(g.id, { name: editName }); setEditId(null) }
                    if (e.key === 'Escape') setEditId(null)
                  }}
                  autoFocus
                />
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => { updateAccountGroup(g.id, { name: editName }); setEditId(null) }}>Salvar</button>
                <button className="btn-secondary text-xs py-1.5 px-2" onClick={() => setEditId(null)}>✕</button>
              </>
            ) : (
              <>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${g.type === 'financeiro' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {g.type === 'financeiro' ? 'Fin.' : 'Pat.'}
                </span>
                <span className="flex-1 text-sm text-gray-200">{g.name}</span>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveAccountGroup(g.id, 'up')} disabled={i === 0} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 transition-colors">
                    <ArrowUp size={12} />
                  </button>
                  <button onClick={() => moveAccountGroup(g.id, 'down')} disabled={i === sorted.length - 1} className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 transition-colors">
                    <ArrowDown size={12} />
                  </button>
                  <button onClick={() => { setEditId(g.id); setEditName(g.name) }} className="p-1 rounded hover:bg-gray-700 text-gray-400 transition-colors">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(g.id)} className="p-1 rounded hover:bg-gray-700 text-red-400 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Nenhum grupo cadastrado</p>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-700">
        <select className="input w-36 text-sm" value={newType} onChange={e => setNewType(e.target.value)}>
          <option value="financeiro">Financeiro</option>
          <option value="patrimonial">Patrimonial</option>
        </select>
        <input
          className="input flex-1 text-sm"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nome do novo grupo..."
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn-primary px-3" onClick={handleAdd}>
          <Plus size={14} />
        </button>
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => { deleteAccountGroup(confirmDeleteId); setConfirmDeleteId(null) }}
          title="Excluir Grupo"
          message="As contas deste grupo ficarão sem grupo atribuído. Continuar?"
          danger
        />
      )}
    </div>
  )
}

function AccountCard({ account, siblings, onEdit, onDelete, onExtrato, onUpdateValue }) {
  const { setMainAccount, moveAccount } = useApp()
  const Icon = ACCOUNT_ICONS[account.type] || Landmark
  const gradient = TYPE_COLORS[account.type] || 'from-gray-600 to-gray-800'
  const idx = siblings.findIndex(a => a.id === account.id)
  const isAsset = account.type === 'asset'

  return (
    <div className={`relative rounded-xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg`}>
      {account.isMain && (
        <span className="absolute top-3 right-10 text-yellow-300"><Star size={13} fill="currentColor" /></span>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={13} className="opacity-80 shrink-0" />
            <span className="text-xs opacity-70">{ACCOUNT_LABELS[account.type] || account.type}</span>
          </div>
          <h3 className="font-semibold text-sm truncate">{account.name}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {account.apelido && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-white/10 text-white/60">{account.apelido}</span>
            )}
            {account.fluxoCaixaPrincipal && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500/30 text-blue-200">FC</span>
            )}
            {account.contaCorrentePrincipal && (
              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-500/30 text-emerald-200">CC</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0 ml-2">
          <div className="flex gap-1">
            <button onClick={() => onEdit(account)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <Edit2 size={11} />
            </button>
            <button onClick={() => onDelete(account)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <Trash2 size={11} />
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={() => moveAccount(account.id, 'up')} disabled={idx === 0} className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors">
              <ArrowUp size={10} />
            </button>
            <button onClick={() => moveAccount(account.id, 'down')} disabled={idx === siblings.length - 1} className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors">
              <ArrowDown size={10} />
            </button>
          </div>
        </div>
      </div>

      {account.type === 'credit' ? (
        <div>
          <p className="text-xs opacity-70">Fatura do Mês</p>
          <p className="text-lg font-bold">{fmt(account.creditMonthBill || 0)}</p>
          <div className="flex gap-3 text-xs opacity-60 mt-1">
            <span>Fecha dia {account.closingDay}</span>
            <span>Vence dia {account.dueDay}</span>
          </div>
          {account.creditLimit > 0 && (
            <div className="mt-2">
              <div className="h-1 bg-white/20 rounded-full">
                <div
                  className="h-1 bg-white rounded-full"
                  style={{ width: `${Math.min(100, ((account.creditDebt || 0) / account.creditLimit) * 100)}%` }}
                />
              </div>
              <p className="text-xs opacity-50 mt-0.5">Limite: {fmt(account.creditLimit)}</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs opacity-70 mb-0.5">{account.type === 'liability' ? 'Saldo Devedor' : 'Valor Atual'}</p>
          <p className="text-xl font-bold">{fmt(account.balance || 0)}</p>
          {account.acquisitionValue != null && (
            <p className="text-xs opacity-50 mt-0.5">
              Aquisição: {fmt(account.acquisitionValue)}
              {account.balance && account.acquisitionValue
                ? ` (${account.balance >= account.acquisitionValue ? '+' : ''}${fmt(account.balance - account.acquisitionValue)})`
                : ''}
            </p>
          )}
          {isAsset && (
            <button onClick={() => onUpdateValue(account)} className="mt-1.5 text-xs flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
              <RefreshCw size={10} /> Atualizar Valor
            </button>
          )}
          {!isAsset && account.type !== 'liability' && (
            <button onClick={() => onExtrato(account)} className="mt-1.5 text-xs flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
              <FileText size={10} /> Ver Extrato
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setMainAccount(account.id)}
        className={`mt-2.5 text-xs flex items-center gap-1 transition-opacity ${account.isMain ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
      >
        <Star size={10} fill={account.isMain ? 'currentColor' : 'none'} />
        {account.isMain ? 'Conta principal' : 'Definir como principal'}
      </button>
    </div>
  )
}

function GroupSection({ group, accounts, onEdit, onDelete, onExtrato, onUpdateValue }) {
  const [collapsed, setCollapsed] = useState(false)
  const typeBadge = group.type === 'financeiro'
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">Financeiro</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Patrimonial</span>

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {collapsed
          ? <ChevronRight size={14} className="text-gray-500 shrink-0" />
          : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
        <span className="font-medium text-sm text-gray-200">{group.name}</span>
        {typeBadge}
        <span className="text-xs text-gray-600 ml-auto">{accounts.length} conta{accounts.length !== 1 ? 's' : ''}</span>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-2 border-l border-gray-800">
          {accounts.map(a => (
            <AccountCard
              key={a.id}
              account={a}
              siblings={accounts}
              onEdit={onEdit}
              onDelete={onDelete}
              onExtrato={onExtrato}
              onUpdateValue={onUpdateValue}
            />
          ))}
          {accounts.length === 0 && (
            <p className="text-gray-600 text-sm py-2 col-span-3">Nenhuma conta neste grupo</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function AccountsPanel() {
  const { accounts, accountGroups = [], deleteAccount } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [extratoAccount, setExtratoAccount] = useState(null)
  const [showGroupManager, setShowGroupManager] = useState(false)
  const [updateValueAccount, setUpdateValueAccount] = useState(null)

  const totalAssets = accounts
    .filter(a => a.type !== 'credit' && a.type !== 'liability')
    .reduce((sum, a) => sum + (a.balance || 0), 0)
  const totalCredit = accounts
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + (a.creditDebt || 0), 0)

  const sortedGroups = [...accountGroups].sort((a, b) => a.order - b.order)
  const financialGroups = sortedGroups.filter(g => g.type === 'financeiro')
  const patrimonialGroups = sortedGroups.filter(g => g.type === 'patrimonial')

  const getGroupAccounts = (groupId) =>
    accounts.filter(a => a.accountGroupId === groupId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const ungrouped = accounts.filter(a => !a.accountGroupId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const handleEdit = (account) => { setEditAccount(account); setShowForm(true) }
  const handleDelete = (account) => setConfirmDelete(account)
  const handleExtrato = (account) => setExtratoAccount(account)
  const handleUpdateValue = (account) => setUpdateValueAccount(account)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total em Contas</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{fmt(totalAssets)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Dívida Cartão</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{fmt(totalCredit)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Patrimônio Líquido</p>
          <p className={`text-2xl font-bold mt-1 ${totalAssets - totalCredit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt(totalAssets - totalCredit)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Contas ({accounts.length})</h2>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setShowGroupManager(true)}>
            <Settings size={13} /> Grupos
          </button>
          <button className="btn-primary flex items-center gap-1.5" onClick={() => { setEditAccount(null); setShowForm(true) }}>
            <Plus size={14} /> Nova Conta
          </button>
        </div>
      </div>

      {accounts.length === 0 && sortedGroups.length === 0 ? (
        <div className="card text-center py-12">
          <Landmark size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma conta cadastrada</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Adicionar primeira conta</button>
        </div>
      ) : (
        <div className="space-y-8">
          {financialGroups.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-800 pb-1.5">Financeiro</p>
              <div className="space-y-5">
                {financialGroups.map(g => (
                  <GroupSection
                    key={g.id}
                    group={g}
                    accounts={getGroupAccounts(g.id)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onExtrato={handleExtrato}
                    onUpdateValue={handleUpdateValue}
                  />
                ))}
              </div>
            </div>
          )}

          {patrimonialGroups.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-800 pb-1.5">Patrimonial</p>
              <div className="space-y-5">
                {patrimonialGroups.map(g => (
                  <GroupSection
                    key={g.id}
                    group={g}
                    accounts={getGroupAccounts(g.id)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onExtrato={handleExtrato}
                    onUpdateValue={handleUpdateValue}
                  />
                ))}
              </div>
            </div>
          )}

          {ungrouped.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600 uppercase tracking-wider border-b border-gray-800 pb-1.5">Sem Grupo</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ungrouped.map(a => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    siblings={ungrouped}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onExtrato={handleExtrato}
                    onUpdateValue={handleUpdateValue}
                  />
                ))}
              </div>
            </div>
          )}

          {accounts.length === 0 && (
            <div className="card text-center py-8">
              <Landmark size={28} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma conta cadastrada</p>
              <button className="btn-primary mt-3" onClick={() => { setEditAccount(null); setShowForm(true) }}>Adicionar primeira conta</button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditAccount(null) }}
        title={editAccount ? 'Editar Conta' : 'Nova Conta'}
      >
        <AccountForm
          initial={editAccount}
          onClose={() => { setShowForm(false); setEditAccount(null) }}
        />
      </Modal>

      <Modal
        open={showGroupManager}
        onClose={() => setShowGroupManager(false)}
        title="Gerenciar Grupos de Contas"
      >
        <GroupManager groups={accountGroups} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteAccount(confirmDelete.id); setConfirmDelete(null) }}
        title="Excluir Conta"
        message={`Tem certeza que deseja excluir a conta "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        danger
      />

      <Modal
        open={!!extratoAccount}
        onClose={() => setExtratoAccount(null)}
        title={`Extrato — ${extratoAccount?.name || ''}`}
        size="xl"
      >
        {extratoAccount && <ExtratoContaPanel account={extratoAccount} />}
      </Modal>

      <Modal
        open={!!updateValueAccount}
        onClose={() => setUpdateValueAccount(null)}
        title={`Atualizar Valor — ${updateValueAccount?.name || ''}`}
        size="sm"
      >
        {updateValueAccount && (
          <UpdateValueModal account={updateValueAccount} onClose={() => setUpdateValueAccount(null)} />
        )}
      </Modal>
    </div>
  )
}
