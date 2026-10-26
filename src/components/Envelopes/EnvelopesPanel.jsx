import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Package, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { gastoEnvelopes, currentCompetencia, resumoEnvelope, totaisEnvelopes } from '../../lib/envelopes'
import { dueDateInMonth } from '../../lib/fatura'
import { filtrarCategoriasPorPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import Modal from '../shared/Modal'
import AccountOptions from '../shared/AccountOptions'
import { TotaisEnvelopes, EnvelopeLinha, MenuEnvelope, EnvelopeDetalhe } from './EnvelopeResumo'
import InputMoeda from '../shared/InputMoeda'

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
  const { activeProfileId, categoryGroupOrder, pode } = useApp()
  const podeSalvar = pode('envelopes', initial ? 'editar' : 'incluir')
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
          <InputMoeda
            min="0"
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
        {podeSalvar && (
        <button className="btn-primary" onClick={() => onSave({ name: name.trim(), limitAmount: Number(limitAmount), dueDay: Number(dueDay), categoryIds, accountId: accountId || null })} disabled={!valid}>
          Salvar
        </button>
        )}
      </div>
      {!podeSalvar && <p className="text-xs text-texto-3 text-right">Somente leitura — seu nível de acesso não permite gravar.</p>}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function EnvelopesPanel() {
  const { envelopes, addEnvelope, updateEnvelope, deleteEnvelope, profileTransactions: transactions, categories, profileAccounts: accounts, accountGroups, settings, pode } = useApp()
  const podeIncluir = pode('envelopes', 'incluir')
  const podeEditar = pode('envelopes', 'editar')
  const podeExcluir = pode('envelopes', 'excluir')
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

  // Linhas de exibição (gasto de gastoEnvelopes; parcelado/à vista só reparte esse gasto).
  // A grade mantém a ordem de cadastro; os totais somam todos os envelopes.
  const resumos = useMemo(() => envelopeData.map(resumoEnvelope), [envelopeData])
  const totais = totaisEnvelopes(resumos)
  const detail = resumos.find(r => r.env.id === detailId)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-texto-1">Envelopes</h1>
          <p className="text-xs text-texto-3 mt-0.5">Controle de gastos por categoria com limite mensal</p>
        </div>
        {podeIncluir && (
          <button className="btn-primary flex items-center gap-1.5 text-sm whitespace-nowrap shrink-0" onClick={openNew} aria-label="Novo envelope">
            <Plus size={14} /> Novo<span className="hidden sm:inline"> Envelope</span>
          </button>
        )}
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

      {/* Totais (faixa única; cabe em 390px) */}
      {envelopes.length > 0 && <TotaisEnvelopes totais={totais} />}

      {/* Empty state */}
      {envelopes.length === 0 && (
        <div className="card text-center py-14">
          <Package size={44} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-2 font-semibold">Nenhum envelope cadastrado</p>
          <p className="text-texto-3 text-sm mt-1 max-w-xs mx-auto">
            Crie envelopes para controlar seus gastos mensais por categoria — mercado, combustível, lazer, etc.
          </p>
          {podeIncluir && <button className="btn-primary mt-5" onClick={openNew}>Criar primeiro envelope</button>}
        </div>
      )}

      {/* Cards grid */}
      {envelopes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {resumos.map(r => (
            <div key={r.env.id} className="card hover:bg-surface-hover/40 transition-colors">
              <EnvelopeLinha
                r={r}
                onAbrir={() => setDetailId(r.env.id)}
                menu={(
                  <MenuEnvelope
                    nome={r.env.name}
                    onEditar={podeEditar ? () => openEdit(r.env) : null}
                    onExcluir={podeExcluir ? () => { if (window.confirm(`Excluir envelope "${r.env.name}"?`)) deleteEnvelope(r.env.id) } : null}
                  />
                )}
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
          <EnvelopeDetalhe r={detail} compLabel={compLabel} />
        </Modal>
      )}
    </div>
  )
}
