import { useState } from 'react'
import { Plus, Star, Trash2, Edit2, CreditCard, Landmark, PiggyBank, DollarSign, FileText } from 'lucide-react'
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
}

const ACCOUNT_LABELS = {
  checking: 'Conta Corrente',
  savings: 'Poupança',
  credit: 'Cartão de Crédito',
  cash: 'Dinheiro',
}

const TYPE_COLORS = {
  checking: 'from-blue-600 to-blue-800',
  savings: 'from-emerald-600 to-emerald-800',
  credit: 'from-purple-600 to-purple-800',
  cash: 'from-amber-600 to-amber-800',
}

export default function AccountsPanel() {
  const { accounts, deleteAccount, setMainAccount } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [extratoAccount, setExtratoAccount] = useState(null)

  const totalAssets = accounts
    .filter(a => a.type !== 'credit')
    .reduce((sum, a) => sum + (a.balance || 0), 0)

  const totalCredit = accounts
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + (a.creditDebt || 0), 0)

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
        <h2 className="text-sm font-semibold text-gray-300">Minhas Contas ({accounts.length})</h2>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setEditAccount(null); setShowForm(true) }}>
          <Plus size={14} /> Nova Conta
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map(account => {
          const Icon = ACCOUNT_ICONS[account.type] || Landmark
          const gradient = TYPE_COLORS[account.type] || 'from-gray-600 to-gray-800'
          return (
            <div key={account.id} className={`relative rounded-xl bg-gradient-to-br ${gradient} p-5 text-white shadow-lg`}>
              {account.isMain && (
                <span className="absolute top-3 right-12 text-yellow-300"><Star size={14} fill="currentColor" /></span>
              )}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={16} className="opacity-80" />
                    <span className="text-xs opacity-70">{ACCOUNT_LABELS[account.type]}</span>
                  </div>
                  <h3 className="font-semibold">{account.name}</h3>
                  {(account.apelido || account.fluxoCaixaPrincipal || account.contaCorrentePrincipal || account.contaAplicacao) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {account.apelido && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-white/10 text-white/60">
                          {account.apelido}
                        </span>
                      )}
                      {account.fluxoCaixaPrincipal && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500/30 text-blue-200">
                          FC
                        </span>
                      )}
                      {account.contaCorrentePrincipal && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-500/30 text-emerald-200">
                          CC Princ.
                        </span>
                      )}
                      {account.contaAplicacao && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-amber-500/30 text-amber-200">
                          Aplic.
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditAccount(account); setShowForm(true) }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(account)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {account.type === 'credit' ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs opacity-70">Fatura do Mês</p>
                    <p className="text-xl font-bold">{fmt(account.creditMonthBill || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Dívida Total</p>
                    <p className="text-sm font-medium">{fmt(account.creditDebt || 0)}</p>
                  </div>
                  <div className="flex gap-3 text-xs opacity-70 mt-1">
                    <span>Fecha dia {account.closingDay}</span>
                    <span>Vence dia {account.dueDay}</span>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Limite</p>
                    <p className="text-sm">{fmt(account.creditLimit || 0)}</p>
                    {account.creditLimit > 0 && (
                      <div className="mt-1 h-1 bg-white/20 rounded-full">
                        <div
                          className="h-1 bg-white rounded-full"
                          style={{ width: `${Math.min(100, ((account.creditDebt || 0) / account.creditLimit) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs opacity-70 mb-1">Saldo</p>
                  <p className="text-2xl font-bold">{fmt(account.balance || 0)}</p>
                  <button
                    onClick={() => setExtratoAccount(account)}
                    className="mt-2 text-xs flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <FileText size={11} /> Ver Extrato
                  </button>
                </div>
              )}

              <button
                onClick={() => setMainAccount(account.id)}
                className={`mt-3 text-xs flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity ${account.isMain ? 'opacity-100' : ''}`}
              >
                <Star size={11} fill={account.isMain ? 'currentColor' : 'none'} />
                {account.isMain ? 'Conta principal' : 'Definir como principal'}
              </button>
            </div>
          )
        })}

        {accounts.length === 0 && (
          <div className="col-span-3 card text-center py-12">
            <Landmark size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma conta cadastrada</p>
            <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Adicionar primeira conta</button>
          </div>
        )}
      </div>

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

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteAccount(confirmDelete.id)}
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
    </div>
  )
}
