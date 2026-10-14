import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Package, Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal } from '../shared/utils'
import { gastoEnvelopes, currentCompetencia } from '../../lib/envelopes'
import { dueDateInMonth } from '../../lib/fatura'
import { filtrarCategoriasPorPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import Modal from '../shared/Modal'
import AccountOptions from '../shared/AccountOptions'

// ── Period logic ──────────────────────────────────────────────────────────────
// period runs from (dueDay+1) of one month to (dueDay) of the next
//
// O FIM do ciclo usa dueDateInMonth (clampa ao último dia do mês): o formulário limita o dueDay
// a 28, mas um valor legado maior faria new Date() rolar silenciosamente para o mês seguinte.
// O INÍCIO (dueDay + 1) segue sem clamp de propósito — ali o rollover É a semântica correta:
// o dia seguinte ao 28/02 é 01/03, e clampar produziria 28/02, sobrepondo o ciclo anterior.
export function getEnvelopePeriod(dueDay) {
  const today = new Date()
  const day = today.getDate()
  let from, to
  if (day <= dueDay) {
    from = new Date(today.getFullYear(), today.getMonth() - 1, dueDay + 1)
    to   = dueDateInMonth(today.getFullYear(), today.getMonth(),     dueDay)
  } else {
    from = new Date(today.getFullYear(), today.getMonth(),     dueDay + 1)
    to   = dueDateInMonth(today.getFullYear(), today.getMonth() + 1, dueDay)
  }
  return {
    from: format(from, 'yyyy-MM-dd'),
    to:   format(to,   'yyyy-MM-dd'),
  }
}

// ── EnvelopeForm ──────────────────────────────────────────────────────────────
function EnvelopeForm({ initial, onSave, onCancel, categories, accounts, accountGroups }) {
  const [name,        setName]        = useState(initial?.name        ?? '')
  const [limitAmount, setLimitAmount] = useState(initial?.limitAmount ?? '')
  const [dueDay,      setDueDay]      = useState(initial?.dueDay      ?? 13)
  const [categoryIds, setCategoryIds] = useState(initial?.categoryIds ?? [])
  const [accountId,   setAccountId]   = useState(initial?.accountId   ?? '')

  const valid = name.trim() && Number(limitAmount) > 0 && Number(dueDay) >= 1 && Number(dueDay) <= 28

  function toggleCat(id) {
    setCategoryIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  // Categorias por perfil: o da conta do envelope (se tiver perfil), senão o chip do topo; as já
  // vinculadas ao envelope continuam na lista.
  const { activeProfileId, categoryGroupOrder } = useApp()
  const perfilCategorias = perfilParaCategorias(accounts, accountId, activeProfileId)
  const expCats     = filtrarCategoriasPorPerfil(categories.filter(c => c.type === 'expense' || c.type === 'both'), perfilCategorias, categoryIds)
  const nonCreditAc = accounts.filter(a => a.type !== 'credit')

  // Categorias agrupadas para exibição, na ordem salva em Configurações → Categorias
  // (ordenarCategorias já põe "Sem grupo" ao final).
  const UNGROUPED = 'Sem grupo'
  const grouped = useMemo(() => {
    const map = {}
    ordenarCategorias(expCats, categoryGroupOrder).forEach(cat => {
      const g = cat.group || UNGROUPED
      if (!map[g]) map[g] = []
      map[g].push(cat)
    })
    return Object.keys(map).map(g => [g, map[g]])
  }, [expCats, categoryGroupOrder])

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Nome do Envelope</label>
        <input className="input" placeholder="ex: Mercado" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Limite Mensal (R$)</label>
          <input
            className="input" type="number" min="0" step="0.01"
            placeholder="0,00" value={limitAmount}
            onChange={e => setLimitAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Dia de Vencimento (1–28)</label>
          <input
            className="input" type="number" min="1" max="28"
            value={dueDay} onChange={e => setDueDay(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Conta Vinculada</label>
        <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <AccountOptions
            accounts={nonCreditAc}
            accountGroups={accountGroups}
            placeholder="Nenhuma"
            labelFn={a => a.apelido || a.name}
          />
        </select>
      </div>

      <div>
        <label className="label">Categorias Vinculadas ({categoryIds.length} selecionada{categoryIds.length !== 1 ? 's' : ''})</label>
        <div className="max-h-52 overflow-y-auto border border-borda-forte rounded-lg divide-y divide-borda/50">
          {grouped.map(([group, cats]) => (
            <div key={group}>
              <p className="px-3 py-1.5 text-xs text-texto-3 font-semibold uppercase tracking-wide bg-surface-2/40">{group}</p>
              {cats.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(cat.id)}
                    onChange={() => toggleCat(cat.id)}
                    className="accent-primary shrink-0"
                  />
                  <span className="text-sm text-texto-2">{cat.icon} {cat.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" onClick={() => onSave({ name: name.trim(), limitAmount: Number(limitAmount), dueDay: Number(dueDay), categoryIds, accountId: accountId || null })} disabled={!valid}>
          Salvar
        </button>
      </div>
    </div>
  )
}

// ── EnvelopeCard ──────────────────────────────────────────────────────────────
function EnvelopeCard({ envelope, spent, onClick }) {
  const pct      = envelope.limitAmount > 0 ? (spent / envelope.limitAmount) * 100 : 0
  const remaining = envelope.limitAmount - spent
  const barWidth = Math.min(pct, 100)
  const barColor = pct <= 80 ? 'bg-primary' : pct <= 100 ? 'bg-aviso' : 'bg-perigo' // status (decisão 11)
  const nCats = envelope.categoryIds?.length || 0

  return (
    <button className="text-left w-full" onClick={onClick}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-texto-1 truncate">{envelope.name}</p>
          <p className="text-xs mt-0.5 text-texto-3">{nCats} categoria{nCats !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-texto-3">Limite</p>
          <p className="text-sm font-bold text-texto-2">{fmt(envelope.limitAmount)}</p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-texto-2">Gasto: <span className="text-texto-1 font-medium">{fmt(spent)}</span></span>
          <span className="text-texto-2">
            Saldo:{' '}
            <span className={`font-medium ${remaining >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {remaining >= 0 ? fmt(remaining) : `−${fmtSinal(-remaining)}`}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-texto-3">
        <span>{pct.toFixed(0)}% utilizado</span>
        <span className="text-texto-3 group-hover:text-texto-3 transition-colors">Ver lançamentos ›</span>
      </div>
    </button>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ data, compLabel, categories, accounts }) {
  const { env, txs, spent } = data
  const remaining = env.limitAmount - spent
  const account   = accounts.find(a => a.id === env.accountId)

  const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xs text-texto-3 uppercase tracking-wide mb-1">Limite</p>
          <p className="text-base font-bold text-texto-1">{fmt(env.limitAmount)}</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs text-texto-3 uppercase tracking-wide mb-1">Gasto</p>
          <p className="text-base font-bold text-despesa">{fmt(spent)}</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xs text-texto-3 uppercase tracking-wide mb-1">Restante</p>
          <p className={`text-base font-bold ${remaining >= 0 ? 'text-receita' : 'text-despesa'}`}>
            {fmt(Math.abs(remaining))}
          </p>
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-texto-3 flex flex-wrap gap-x-4 gap-y-1">
        <span>Competência: <span className="text-texto-2">{compLabel}</span></span>
        {account && <span>Conta: {account.apelido || account.name}</span>}
      </div>

      {/* Transactions */}
      {sortedTxs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-texto-3 text-sm">Nenhum lançamento neste período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda">
                <th className="text-left py-2 px-1 text-xs text-texto-2 font-medium w-24">Data</th>
                <th className="text-left py-2 px-1 text-xs text-texto-2 font-medium">Descrição</th>
                <th className="text-left py-2 px-1 text-xs text-texto-2 font-medium hidden sm:table-cell">Categoria</th>
                <th className="text-right py-2 px-1 text-xs text-texto-2 font-medium w-28">Valor</th>
              </tr>
            </thead>
            <tbody>
              {sortedTxs.map(tx => {
                const cat = categories.find(c => c.id === tx.categoryId)
                const d = tx.date
                return (
                  <tr key={tx.id} className="border-b border-borda/40 hover:bg-surface-hover/20">
                    <td className="py-2.5 px-1 text-xs text-texto-2 whitespace-nowrap">
                      {d.slice(8)}/{d.slice(5,7)}/{d.slice(0,4)}
                    </td>
                    <td className="py-2.5 px-1 text-xs text-texto-2 max-w-xs truncate">{tx.description}</td>
                    <td className="py-2.5 px-1 text-xs text-texto-2 hidden sm:table-cell">
                      {cat ? `${cat.icon} ${cat.name}` : '—'}
                    </td>
                    <td className="py-2.5 px-1 text-xs font-semibold text-despesa text-right whitespace-nowrap">
                      {fmt(tx.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-borda-forte">
                <td colSpan={2} className="py-2.5 px-1 text-xs text-texto-2 font-semibold">Total</td>
                <td className="hidden sm:table-cell" />
                <td className="py-2.5 px-1 text-xs font-bold text-despesa text-right">{fmt(spent)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function EnvelopesPanel() {
  const { envelopes, addEnvelope, updateEnvelope, deleteEnvelope, profileTransactions: transactions, categories, profileAccounts: accounts, accountGroups, settings } = useApp()
  const [showForm,  setShowForm]  = useState(false)
  const [editEnv,   setEditEnv]   = useState(null)
  const [detailId,  setDetailId]  = useState(null)

  const startDay = settings.financialMonthStartDay || 1
  // Offset (em meses) a partir da competência atual — assim o padrão acompanha o
  // financialMonthStartDay mesmo que as configurações carreguem após o 1º render.
  const [monthOffset, setMonthOffset] = useState(0)
  const comp = useMemo(() => {
    const base = currentCompetencia(startDay)
    const d = new Date(base.year, base.month0 + monthOffset, 1)
    return { year: d.getFullYear(), month0: d.getMonth() }
  }, [startDay, monthOffset])
  const compKey = comp.year * 12 + comp.month0
  const compLabel = useMemo(() => {
    const s = format(new Date(comp.year, comp.month0, 1), "MMMM 'de' yyyy", { locale: ptBR })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [comp])
  // Intervalo do mês financeiro da competência (mesmo critério de competenciaKeyOf):
  // de startDay do mês até (startDay − 1) do mês seguinte.
  const compRange = useMemo(() => {
    const start = new Date(comp.year, comp.month0, startDay)
    const end = new Date(comp.year, comp.month0 + 1, startDay - 1)
    return `${format(start, 'dd/MM/yyyy')} – ${format(end, 'dd/MM/yyyy')}`
  }, [comp, startDay])
  const shiftComp = (delta) => setMonthOffset(o => o + delta)

  const envelopeData = useMemo(
    () => gastoEnvelopes(envelopes, transactions, compKey, startDay),
    [envelopes, transactions, compKey, startDay]
  )

  function handleSave(data) {
    if (editEnv) updateEnvelope(editEnv.id, data)
    else         addEnvelope(data)
    setShowForm(false)
    setEditEnv(null)
  }

  function openEdit(env) {
    setEditEnv(env)
    setShowForm(true)
  }

  function openNew() {
    setEditEnv(null)
    setShowForm(true)
  }

  const detail = envelopeData.find(d => d.env.id === detailId)

  // summary KPIs
  const totalLimit   = envelopes.reduce((s, e) => s + e.limitAmount, 0)
  const totalSpent   = envelopeData.reduce((s, d) => s + d.spent, 0)
  const totalRemain  = totalLimit - totalSpent

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-texto-1">Envelopes</h1>
          <p className="text-xs text-texto-3 mt-0.5">Controle de gastos por categoria com limite mensal</p>
        </div>
        <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={openNew}>
          <Plus size={14} /> Novo Envelope
        </button>
      </div>

      {/* Competência selector */}
      {envelopes.length > 0 && (
        <div className="card flex items-center justify-between py-2.5">
          <button onClick={() => shiftComp(-1)} className="p-1.5 rounded-md hover:bg-surface-hover text-texto-2 hover:text-texto-1 transition-colors" title="Competência anterior">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-[10px] text-texto-3 uppercase tracking-wide">Competência</p>
            <p className="text-sm font-semibold text-texto-1">{compLabel}</p>
            <p className="text-xs text-texto-2">{compRange}</p>
          </div>
          <button onClick={() => shiftComp(1)} className="p-1.5 rounded-md hover:bg-surface-hover text-texto-2 hover:text-texto-1 transition-colors" title="Próxima competência">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Summary KPIs (only when there are envelopes) */}
      {envelopes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card">
            <p className="text-xs text-texto-2 uppercase tracking-wide">Total Limite</p>
            <p className="text-xl font-bold text-texto-1 mt-1">{fmt(totalLimit)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-texto-2 uppercase tracking-wide">Total Gasto</p>
            <p className="text-xl font-bold text-despesa mt-1">{fmt(totalSpent)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-texto-2 uppercase tracking-wide">Total Saldo</p>
            <p className={`text-xl font-bold mt-1 ${totalRemain >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {totalRemain >= 0 ? fmt(totalRemain) : `−${fmtSinal(-totalRemain)}`}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {envelopes.length === 0 && (
        <div className="card text-center py-14">
          <Package size={44} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-2 font-semibold">Nenhum envelope cadastrado</p>
          <p className="text-texto-3 text-sm mt-1 max-w-xs mx-auto">
            Crie envelopes para controlar seus gastos mensais por categoria — mercado, combustível, lazer, etc.
          </p>
          <button className="btn-primary mt-5" onClick={openNew}>Criar primeiro envelope</button>
        </div>
      )}

      {/* Cards grid */}
      {envelopes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {envelopeData.map(({ env, spent }) => (
            <div key={env.id} className="card group hover:bg-surface-hover/80 transition-colors">
              {/* action buttons — linha própria no topo, acima do nome e do Limite */}
              <div className="flex justify-end gap-1.5 mb-1.5">
                <button
                  className="btn-amber w-7 h-7 p-0 justify-center"
                  onClick={e => { e.stopPropagation(); openEdit(env) }}
                  title="Editar envelope"
                  aria-label="Editar"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  className="btn-amber w-7 h-7 p-0 justify-center hover:text-perigo hover:border-perigo/50 hover:bg-perigo-bg"
                  onClick={e => {
                    e.stopPropagation()
                    if (window.confirm(`Excluir envelope "${env.name}"?`)) deleteEnvelope(env.id)
                  }}
                  title="Excluir envelope"
                  aria-label="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <EnvelopeCard
                envelope={env}
                spent={spent}
                onClick={() => setDetailId(env.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditEnv(null) }}
        title={editEnv ? 'Editar Envelope' : 'Novo Envelope'}
      >
        <EnvelopeForm
          initial={editEnv}
          categories={categories}
          accounts={accounts}
          accountGroups={accountGroups}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditEnv(null) }}
        />
      </Modal>

      {/* Detail modal */}
      {detail && (
        <Modal
          open={!!detailId}
          onClose={() => setDetailId(null)}
          title={`${detail.env.name} — ${compLabel}`}
          size="lg"
        >
          <DetailModal
            data={detail}
            compLabel={compLabel}
            categories={categories}
            accounts={accounts}
          />
        </Modal>
      )}
    </div>
  )
}
