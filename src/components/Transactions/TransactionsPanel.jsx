import { useState, useMemo } from 'react'
import {
  Plus, ArrowLeft, CreditCard, Wallet,
  ChevronRight, Edit2, Trash2, ArrowUpCircle, Undo2, CheckSquare,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useRegisterFab } from '../../context/FabContext'
import { faturaDoCartao } from '../../lib/fatura'
import { fmt, fmtSinal, fmtDate, groupedAccountOptions, accountPriority, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros, accountsForView, computeReconciledTotals } from '../shared/utils'
import { ORIGIN } from '../../lib/origins'
import { useIsMobile } from '../../hooks/useIsMobile'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import EstornoLancamentoDialog from '../Contratos/EstornoLancamentoDialog'
import Toast from '../shared/Toast'
import TxMobileItem from '../shared/TxMobileItem'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import ReconciliarModal from '../shared/ReconciliarModal'
import BulkEditModal from '../shared/BulkEditModal'
import DuplicateButton from '../shared/DuplicateButton'
import ReconciledTotals from '../shared/ReconciledTotals'
import ReconcileBadge from '../shared/ReconcileBadge'
import TransactionForm from './TransactionForm'
import ExtratoContaPanel from '../Accounts/ExtratoContaPanel'
import SeloParcela from '../shared/SeloParcela'
import { criarSeloParcela } from '../../lib/numeroParcela'

// ─── Credit fatura helpers ──────────────────────────────────────────────────

// Mesma convenção de computeFaturaRef: dia <= closingDay → fatura do mês corrente;
// dia > closingDay → fatura do mês seguinte (a fatura do mês M fecha no dia F de M).
// Fonte única (lib/fatura): mesmo fechamento padrão do resto do app.
const getBillKey = (date, card) => faturaDoCartao(date, card)

// Usa o faturaMonthYear explícito (importação/gerencial) quando presente.
function txBillKey(tx, card) {
  return tx.faturaMonthYear || getBillKey(tx.date, card)
}

function getBillLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return `${m}/${y}`
}

// ─── Account picker (step 1 of new-tx modal) ───────────────────────────────

function AccountPickerButton({ a, onSelect }) {
  const { creditUsage } = useApp()
  return (
    <button
      onClick={() => onSelect(a)}
      className="w-full flex items-center justify-between p-3 bg-surface-2 hover:bg-surface-hover rounded-xl transition-colors text-left group mb-1"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface-hover group-hover:bg-surface-hover flex items-center justify-center transition-colors shrink-0">
          {a.type === 'credit'
            ? <CreditCard size={14} className="text-texto-2" />
            : <Wallet size={14} className="text-texto-2" />}
        </div>
        <div>
          <p className="text-sm text-texto-1 font-medium">{a.apelido || a.name}</p>
          <p className="text-xs text-texto-3">{a.type === 'credit' ? 'Cartão de Crédito' : 'Conta Bancária'}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold shrink-0 ml-2 ${a.type === 'credit' ? 'text-texto-1' : (a.balance || 0) >= 0 ? 'text-receita' : 'text-despesa'}`}>
        {a.type === 'credit' ? fmt(creditUsage(a.id)) : fmt(a.balance || 0)}
      </span>
    </button>
  )
}

function AccountPicker({ accounts, accountGroups, onSelect }) {
  const [showAll, setShowAll] = useState(false)
  const top = accounts.filter(a => accountPriority(a) === 0)
  const mid = accounts.filter(a => accountPriority(a) === 1)
  const rest = accounts.filter(a => accountPriority(a) === 2)
  const visible = showAll ? [...top, ...mid, ...rest] : [...top, ...mid]

  return (
    <div className="space-y-1">
      <p className="text-sm text-texto-2 mb-3">Selecione a conta para o lançamento:</p>
      {visible.map(a => <AccountPickerButton key={a.id} a={a} onSelect={onSelect} />)}
      {!showAll && rest.length > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-xs text-texto-3 hover:text-texto-2 py-2 border border-dashed border-borda-forte hover:border-borda-forte rounded-xl transition-colors"
        >
          Ver todas — {rest.length} conta{rest.length !== 1 ? 's' : ''} oculta{rest.length !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

// ─── Fatura detail view ─────────────────────────────────────────────────────

function FaturaView({ card, billKey, onBack, onNewTx }) {
  const { profileTransactions: transactions, schedules, categories, profileAccounts: accounts, deleteTransaction, deleteSchedule, findLinkedResgate, setReconciled, temHistorico, pode } = useApp()
  // Selo "x/N" dos lançamentos gerados por agendamento parcelado (data_ocorrencia gravada).
  const seloDe = useMemo(() => criarSeloParcela(schedules), [schedules])
  // Nível de acesso (lançamentos): novo/duplicar/estornar = incluir; reconciliar = editar; excluir = excluir.
  const podeIncluir = pode('lancamentos', 'incluir')
  const podeEditar = pode('lancamentos', 'editar')
  const podeExcluir = pode('lancamentos', 'excluir')
  const [filtros, setFiltros] = useState(EMPTY_LANC_FILTROS)
  const [showReconciliar, setShowReconciliar] = useState(false)
  const [bulkEditTxs, setBulkEditTxs] = useState(null)
  const [editTx, setEditTx] = useState(null)
  // Reconciliar em lote: só no computador.
  const isMobile = useIsMobile()
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmEstorno, setConfirmEstorno] = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Duplicar: abre o form em modo NOVO (sem id) com os dados originais e a data escolhida.
  // Mantém account_id do cartão e grupo gerencial; descarta vínculos de automação/série e a
  // fatura/dateCartao. NÃO salva sozinho. Parcelados: só a parcela clicada.
  const handleDuplicate = (tx, newDate) => {
    // eslint-disable-next-line no-unused-vars
    const { id, createdAt, scheduleId, origin, gerencialScheduleId, reservaAuto, parentTxId, installmentNum, installmentTotal, installmentKey, faturaMonthYear, dateCartao, dataOcorrencia, ...rest } = tx
    setEditTx({ ...rest, date: newDate || tx.date, origin: ORIGIN.DUPLICADO })
    setShowEdit(true)
  }


  const label = getBillLabel(billKey)
  const txs = useMemo(() =>
    transactions
      .filter(tx => tx.accountId === card.id && tx.type === 'expense' && txBillKey(tx, card) === billKey)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, card, billKey]
  )
  const total = txs.reduce((s, t) => s + t.amount, 0)

  // Filtros em tempo real — afetam só a exibição; o total da fatura segue completo.
  const displayTxs = useMemo(
    () => hasLancFiltros(filtros) ? txs.filter(tx => matchLancFiltros(tx, filtros, accounts)) : txs,
    [txs, filtros, accounts]
  )
  const billPending = useMemo(
    () => txs.filter(tx => !tx.reconciled).sort((a, b) => a.date.localeCompare(b.date)),
    [txs]
  )
  const reconciledTotals = useMemo(() => computeReconciledTotals(displayTxs), [displayTxs])

  return (
    <div className="space-y-4">
      {/* Breadcrumb — fixo no topo ao rolar apenas no desktop (md+); no mobile rola normal */}
      <div className="flex items-center gap-2 flex-wrap md:sticky md:top-0 md:z-20 md:bg-page md:py-2 md:-my-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-texto-2 hover:text-texto-1 transition-colors"
        >
          <ArrowLeft size={14} /> Lançamentos
        </button>
        <ChevronRight size={12} className="text-texto-3" />
        <span className="text-sm text-texto-2">{card.apelido || card.name}</span>
        <ChevronRight size={12} className="text-texto-3" />
        <span className="text-sm text-texto-1">Fatura {label}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-base font-bold text-despesa">{fmt(total)}</span>
          {txs.length > 0 && !isMobile && podeEditar && (
            <button
              onClick={() => setShowReconciliar(true)}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
              title="Reconciliar transações da fatura"
            >
              <CheckSquare size={12} /> Reconciliar
            </button>
          )}
          {podeIncluir && (
            <button
              onClick={onNewTx}
              className="btn-primary hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus size={12} /> Novo
            </button>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-texto-2 uppercase">Fatura</p>
          <p className="text-xl font-bold text-despesa mt-1">{fmt(total)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-texto-2 uppercase">Lançamentos</p>
          <p className="text-xl font-bold text-texto-1 mt-1">{txs.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {txs.length > 0 && (
          <LancamentoFiltros
            filtros={filtros}
            setFiltros={setFiltros}
            fields={['data', 'historico', 'favorecido', 'de', 'para', 'categoria', 'valor']}
            categories={categories}
          />
        )}
        {txs.length === 0 ? (
          <div className="text-center py-10">
            <ArrowUpCircle size={28} className="text-texto-3 mx-auto mb-2" />
            <p className="text-texto-3 text-sm">Nenhum lançamento nesta fatura</p>
            {podeIncluir && <button onClick={onNewTx} className="btn-primary mt-3 text-xs">Adicionar lançamento</button>}
          </div>
        ) : (
          <>
            {/* Totalizador Conciliados/Pendentes (lançamentos visíveis) */}
            {(reconciledTotals.conciliado > 0 || reconciledTotals.pendente > 0) && (
              <div className="border-b border-borda bg-surface/40 px-4 py-2.5 flex items-center text-xs">
                <ReconciledTotals
                  conciliado={reconciledTotals.conciliado}
                  pendente={reconciledTotals.pendente}
                  className="ml-auto"
                />
              </div>
            )}

            {/* Mobile: cards estilo app bancário */}
            <div className="md:hidden">
              {displayTxs.length === 0 ? (
                <p className="text-center py-8 text-texto-3 text-xs">Nenhum lançamento corresponde aos filtros</p>
              ) : displayTxs.map(tx => (
                <TxMobileItem
                  key={tx.id}
                  type="expense"
                  title={tx.payee || tx.description || 'Despesa'}
                  subtitle={[tx.payee ? tx.description : null, seloDe(tx)].filter(Boolean).join(' · ') || null}
                  dateLabel={fmtDate(tx.date)}
                  amount={tx.amount}
                  dimmed={!tx.reconciled}
                  onClick={() => { setEditTx(tx); setShowEdit(true) }}
                />
              ))}
            </div>
            {/* Desktop: tabela */}
            <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda">
                  <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Data</th>
                  <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Categoria</th>
                  <th className="text-right px-4 py-3 text-xs text-texto-2 font-medium">Valor</th>
                  <th className="px-4 py-3 w-16"></th>
                  <th className="px-2 py-3 text-center text-xs text-texto-2 font-medium w-10" title="Reconciliado">R</th>
                </tr>
              </thead>
              <tbody>
                {displayTxs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-texto-3 text-xs">
                      Nenhum lançamento corresponde aos filtros
                    </td>
                  </tr>
                )}
                {displayTxs.map(tx => {
                  const cat = categories.find(c => c.id === tx.categoryId)
                  return (
                    <tr key={tx.id} className="border-b border-borda/50 hover:bg-surface-hover/30 transition-colors">
                      <td className="px-4 py-3 text-texto-2 text-xs whitespace-nowrap">{fmtDate(tx.date)}</td>
                      <td className="px-4 py-3">
                        <p className="text-texto-1 text-sm">{tx.description}{seloDe(tx) && <span className="ml-1.5 align-middle"><SeloParcela rotulo={seloDe(tx)} /></span>}{temHistorico('lancamento', tx.id) && <span className="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-primary-fg/80 align-middle" title="Tem histórico de alterações" />}</p>
                        {tx.payee && <p className="text-xs text-texto-3">{tx.payee}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {cat && <span className="text-xs bg-surface-2 px-2 py-1 rounded-full text-texto-2">{cat.icon} {cat.name}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-despesa whitespace-nowrap text-sm">
                        {fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {podeIncluir && (
                            <button
                              onClick={() => setConfirmEstorno(tx)}
                              title="Estornar lançamento"
                              className="p-1.5 text-texto-3 hover:text-despesa hover:bg-despesa/10 rounded transition-colors"
                            >
                              <Undo2 size={11} />
                            </button>
                          )}
                          <button
                            onClick={() => { setEditTx(tx); setShowEdit(true) }}
                            title={podeEditar ? 'Editar' : 'Ver'}
                            className="p-1.5 text-texto-3 hover:text-texto-2 hover:bg-surface-hover rounded transition-colors"
                          >
                            <Edit2 size={11} />
                          </button>
                          {podeIncluir && (
                            <DuplicateButton
                              onConfirm={(date) => handleDuplicate(tx, date)}
                              sourceTx={tx}
                              iconSize={11}
                              className="p-1.5 text-texto-3 hover:text-primary-fg hover:bg-primary/10 rounded transition-colors"
                            />
                          )}
                          {podeExcluir && (
                            <button
                              onClick={() => setConfirmDelete(tx)}
                              aria-label="Excluir"
                              className="p-1.5 text-texto-3 hover:text-perigo hover:bg-perigo-bg rounded transition-colors"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <div className="inline-flex justify-center">
                          {podeEditar ? (
                            <ReconcileBadge
                              reconciled={tx.reconciled}
                              onClick={() => setReconciled([tx.id], !tx.reconciled)}
                            />
                          ) : (
                            <span className={`text-xs ${tx.reconciled ? 'text-primary-fg' : 'text-texto-3'}`} title={tx.reconciled ? 'Reconciliado' : 'Não reconciliado'}>{tx.reconciled ? '✓' : '—'}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borda-forte bg-surface/30">
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-texto-2">Total da Fatura</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-despesa">{fmt(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            </div>
            {/* Total da fatura — mobile */}
            <div className="md:hidden flex items-center justify-between px-4 py-3 border-t-2 border-borda-forte bg-surface/30">
              <span className="text-sm font-bold text-texto-2">Total da Fatura</span>
              <span className="text-sm font-bold text-despesa">{fmt(total)}</span>
            </div>
          </>
        )}
      </div>

      {showReconciliar && (
        <ReconciliarModal
          items={billPending}
          onApply={setReconciled}
          onClose={() => setShowReconciliar(false)}
          onAlterar={(txs) => { setShowReconciliar(false); setBulkEditTxs(txs) }}
        />
      )}

      {bulkEditTxs && (
        <BulkEditModal
          txs={bulkEditTxs}
          onClose={() => setBulkEditTxs(null)}
          onApplied={(n) => showToast(`${n} ${n === 1 ? 'lançamento alterado' : 'lançamentos alterados'}`)}
        />
      )}

      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditTx(null) }} title={editTx?.id ? 'Editar Lançamento' : 'Duplicar Lançamento'}>
        <TransactionForm initial={editTx} onClose={() => { setShowEdit(false); setEditTx(null) }} />
      </Modal>
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          const r = confirmDelete && findLinkedResgate(confirmDelete.id)
          deleteTransaction(confirmDelete.id)
          if (r) deleteSchedule(r.id)
        }}
        title="Excluir Lançamento"
        message={(() => {
          const r = confirmDelete && findLinkedResgate(confirmDelete.id)
          if (!r) return `Excluir "${confirmDelete?.description}"?`
          return (
            <>
              ⚠️ Este lançamento possui um agendamento de resgate vinculado:<br /><br />
              <span className="text-texto-1 font-medium">{r.description} — {fmt(r.amount)} — {fmtDate(r.startDate)}</span><br /><br />
              Ambos serão excluídos. Deseja continuar?
            </>
          )
        })()}
        confirmLabel={confirmDelete && findLinkedResgate(confirmDelete.id) ? 'Excluir ambos' : undefined}
        danger
      />
      {confirmEstorno && (
        <EstornoLancamentoDialog tx={confirmEstorno} onClose={() => setConfirmEstorno(null)} onFeito={showToast} />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

// ─── Account extrato view ───────────────────────────────────────────────────

function AccountView({ account, onBack, onNewTx, onEditTx }) {
  const { pode } = useApp()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-texto-2 hover:text-texto-1 transition-colors"
        >
          <ArrowLeft size={14} /> Lançamentos
        </button>
        <ChevronRight size={12} className="text-texto-3" />
        <span className="text-sm text-texto-1">{account.apelido || account.name}</span>
      </div>
      <ExtratoContaPanel account={account} onEdit={onEditTx} onNewTx={pode('lancamentos', 'incluir') ? onNewTx : undefined} />
    </div>
  )
}

// ─── Accounts list view ─────────────────────────────────────────────────────

function AccountsList({ bankAccounts, creditCards, cardFaturas, onSelectAccount, onSelectFatura, onNewTx }) {
  const { creditUsage, pode } = useApp()
  const podeIncluir = pode('lancamentos', 'incluir')
  return (
    <div className="space-y-6">
      {/* Contas bancárias */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-texto-2">Contas</h2>
          {podeIncluir && (
            <button onClick={() => onNewTx()} className="btn-primary hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Plus size={12} /> Novo
            </button>
          )}
        </div>
        {bankAccounts.length === 0 ? (
          <div className="card text-center py-10">
            <Wallet size={32} className="text-texto-3 mx-auto mb-3" />
            <p className="text-texto-3 text-sm">Nenhuma conta cadastrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bankAccounts.map(a => (
              <button
                key={a.id}
                onClick={() => onSelectAccount(a)}
                className="card text-left hover:bg-surface-hover/60 transition-colors group border border-transparent hover:border-borda-forte"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 group-hover:bg-surface-hover flex items-center justify-center transition-colors shrink-0">
                      <Wallet size={14} className="text-texto-2" />
                    </div>
                    <p className="text-sm font-medium text-texto-1 group-hover:text-texto-1 transition-colors truncate">
                      {a.apelido || a.name}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-texto-3 group-hover:text-texto-2 transition-colors shrink-0 ml-2" />
                </div>
                <p className={`text-2xl font-bold ${(a.balance || 0) >= 0 ? 'text-receita' : 'text-despesa'}`}>
                  {fmtSinal(a.balance || 0)}
                </p>
                <p className="text-xs text-texto-3 mt-0.5">Saldo atual</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cartões de crédito */}
      {creditCards.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
            <CreditCard size={14} className="text-texto-3" />
            Cartões de Crédito
          </h2>
          <div className="space-y-3">
            {creditCards.map(card => {
              const faturas = cardFaturas[card.id] || []
              return (
                <div key={card.id} className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-borda flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-texto-2 shrink-0" />
                      <span className="text-sm font-semibold text-texto-1">{card.apelido || card.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-texto-3">
                        Dívida: <span className="text-texto-1 font-semibold">{fmt(creditUsage(card.id))}</span>
                      </span>
                      {podeIncluir && (
                        <button
                          onClick={() => onNewTx(card)}
                          className="p-1.5 text-texto-3 hover:text-texto-2 hover:bg-surface-hover rounded transition-colors"
                          title="Novo lançamento no cartão"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {faturas.length === 0 ? (
                    <p className="text-center py-6 text-texto-3 text-xs">Nenhum lançamento no cartão</p>
                  ) : (
                    <div>
                      {faturas.map(fat => (
                        <button
                          key={fat.key}
                          onClick={() => onSelectFatura(card, fat.key)}
                          className="w-full flex items-center justify-between px-4 py-3 border-b border-borda/40 last:border-0 hover:bg-surface-hover/30 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs text-texto-3 uppercase tracking-wide shrink-0">Fatura</span>
                            <span className="text-sm font-semibold text-texto-1">{fat.label}</span>
                            <span className="text-xs text-texto-3 shrink-0">{fat.count} lançamento{fat.count !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-sm font-bold text-despesa">{fmt(fat.total)}</span>
                            <ChevronRight size={12} className="text-texto-3 group-hover:text-texto-2 transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root panel ─────────────────────────────────────────────────────────────

export default function TransactionsPanel() {
  const { profileAccounts, accountGroups, pode } = useApp()
  const podeIncluirTx = pode('lancamentos', 'incluir')
  const accounts = profileAccounts
  const isMobile = useIsMobile()

  // view: null | { type: 'account', account } | { type: 'fatura', card, billKey }
  const [view, setView] = useState(null)

  // new-tx modal: step 'pick' (account picker) or 'form' (TransactionForm)
  const [showModal, setShowModal] = useState(false)
  const [modalStep, setModalStep] = useState('pick')
  const [modalAccount, setModalAccount] = useState(null)
  const [editTx, setEditTx] = useState(null)

  const bankAccounts = useMemo(
    () => accountsForView(accounts.filter(a => a.type !== 'credit'), isMobile).sort((a, b) => accountPriority(a) - accountPriority(b)),
    [accounts, isMobile]
  )
  const creditCards = useMemo(
    () => accountsForView(accounts.filter(a => a.type === 'credit'), isMobile).sort((a, b) => (a.appPriority ? 0 : 1) - (b.appPriority ? 0 : 1)),
    [accounts, isMobile]
  )

  const { profileTransactions: transactions } = useApp()

  const cardFaturas = useMemo(() => {
    const result = {}
    creditCards.forEach(card => {
      const groups = {}
      transactions
        .filter(tx => tx.accountId === card.id && tx.type === 'expense')
        .forEach(tx => {
          const key = txBillKey(tx, card)
          if (!groups[key]) groups[key] = { key, label: getBillLabel(key), count: 0, total: 0 }
          groups[key].count++
          groups[key].total += tx.amount
        })
      result[card.id] = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
    })
    return result
  }, [creditCards, transactions])

  const openNewTx = (account = null) => {
    setEditTx(null)
    if (account) {
      setModalAccount(account)
      setModalStep('form')
    } else {
      setModalAccount(null)
      setModalStep(accounts.length > 1 ? 'pick' : 'form')
    }
    setShowModal(true)
  }

  const openEditTx = (tx) => {
    setEditTx(tx)
    setModalAccount(null)
    setModalStep('form')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditTx(null)
    setModalAccount(null)
    setModalStep('pick')
  }

  // FAB mobile: abre o novo lançamento já no contexto da view atual
  // (conta em extrato, cartão em fatura) ou no seletor de conta na lista.
  useRegisterFab(podeIncluirTx ? () => {
    if (view?.type === 'account') openNewTx(view.account)
    else if (view?.type === 'fatura') openNewTx(view.card)
    else openNewTx()
  } : null, [view, accounts.length, podeIncluirTx])

  // Account extrato view
  if (view?.type === 'account') {
    return (
      <>
        <AccountView
          account={view.account}
          onBack={() => setView(null)}
          onNewTx={() => openNewTx(view.account)}
          onEditTx={openEditTx}
        />
        <Modal open={showModal} onClose={closeModal} title={editTx?.id ? 'Editar Lançamento' : 'Novo Lançamento'}>
          <TransactionForm
            initial={editTx || { accountId: modalAccount?.id }}
            onClose={closeModal}
          />
        </Modal>
      </>
    )
  }

  // Credit fatura view
  if (view?.type === 'fatura') {
    return (
      <>
        <FaturaView
          card={view.card}
          billKey={view.billKey}
          onBack={() => setView(null)}
          onNewTx={() => openNewTx(view.card)}
        />
        <Modal open={showModal} onClose={closeModal} title="Novo Lançamento">
          <TransactionForm
            initial={editTx || { accountId: modalAccount?.id, type: 'expense' }}
            onClose={closeModal}
          />
        </Modal>
      </>
    )
  }

  // Accounts list
  return (
    <>
      <AccountsList
        bankAccounts={bankAccounts}
        creditCards={creditCards}
        cardFaturas={cardFaturas}
        onSelectAccount={a => setView({ type: 'account', account: a })}
        onSelectFatura={(card, billKey) => setView({ type: 'fatura', card, billKey })}
        onNewTx={openNewTx}
      />
      <Modal
        open={showModal}
        onClose={closeModal}
        title={modalStep === 'pick' ? 'Qual conta?' : 'Novo Lançamento'}
      >
        {modalStep === 'pick' ? (
          <AccountPicker
            accounts={accounts}
            accountGroups={accountGroups}
            onSelect={a => { setModalAccount(a); setModalStep('form') }}
          />
        ) : (
          <TransactionForm
            initial={{ accountId: modalAccount?.id }}
            onClose={closeModal}
          />
        )}
      </Modal>
    </>
  )
}
