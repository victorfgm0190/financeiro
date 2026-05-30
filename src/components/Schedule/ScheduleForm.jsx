import { useState, useRef } from 'react'
import { Info, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today } from '../shared/utils'
import CategorySelect from '../shared/CategorySelect'
import AccountOptions from '../shared/AccountOptions'

const FREQUENCIES = [
  { value: 'once', label: 'Única' },
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'quadrimestral', label: 'Quadrimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
]

const TIPS = {
  description: 'Nome ou identificação do lançamento recorrente. Ex: Aluguel, Salário, Parcela do carro.',
  transactionType: 'Define se é uma entrada de dinheiro (Receita) ou uma saída (Despesa).',
  account: 'Conta que será debitada ou creditada a cada ocorrência deste agendamento.',
  amount: 'Valor padrão por ocorrência. Cada data na prévia pode ter um valor diferente — clique para editar.',
  category: 'Classifica o tipo de gasto ou receita para relatórios e controle de orçamento.',
  payee: 'Pessoa ou empresa beneficiária do pagamento. Ex: Locadora, Empresa, Fornecedor.',
  frequency: 'Intervalo de repetição entre ocorrências: diário, semanal, mensal, anual etc.',
  startDate: 'Data da primeira ocorrência. As seguintes são calculadas automaticamente conforme a frequência.',
  occurrence: 'Contínua: repete indefinidamente. Parcelada: encerra após número fixo de vezes.',
  installments: 'Total de vezes que este lançamento se repetirá antes de ser encerrado automaticamente.',
  remindDaysBefore: 'Exibe um alerta no painel X dias antes do vencimento para que você não se esqueça.',
  autoRegister: 'Registra o lançamento automaticamente na data agendada, sem precisar confirmar manualmente.',
  gerencial: 'Define como o dinheiro se move ao efetivar: G=débito direto; 1=reserva em poupança; 2..N=resgate de conta específica; D=só registra (já debitado).',
}

function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  const [rect, setRect] = useState(null)
  const ref = useRef(null)

  const handleEnter = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect())
    setShow(true)
  }

  return (
    <>
      <span
        ref={ref}
        className="ml-1.5 inline-flex items-center cursor-help"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        <Info size={12} className="text-gray-600 hover:text-gray-400 transition-colors" />
      </span>
      {show && rect && (
        <div
          style={{ position: 'fixed', left: rect.right + 8, top: rect.top - 6, zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 w-52 leading-snug shadow-2xl pointer-events-none"
        >
          {text}
        </div>
      )}
    </>
  )
}

function LabelTip({ children, tip, required }) {
  return (
    <label className="label">
      <span className="inline-flex items-center">
        {children}{required && ' *'}<Tooltip text={tip} />
      </span>
    </label>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-[#0F6E56]' : 'bg-gray-700'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function OccEditModal({ originalDate, override, isSkipped, defaultAmount, onSave, onClose }) {
  const [date, setDate] = useState(override?.date || originalDate)
  const [amount, setAmount] = useState(String(override?.amount ?? defaultAmount))
  const [skip, setSkip] = useState(isSkipped || false)
  const fmtD = (d) => d.split('-').reverse().join('/')
  const stopEnter = (e) => { if (e.key === 'Enter') e.preventDefault() }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-64 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-200">Ocorrência de {fmtD(originalDate)}</p>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 p-0.5 rounded transition-colors">
            <X size={14} />
          </button>
        </div>

        <label className="flex items-center gap-2.5 mb-3.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skip}
            onChange={e => setSkip(e.target.checked)}
            className="w-4 h-4 rounded accent-[#0F6E56] cursor-pointer"
          />
          <span className="text-sm text-gray-300">Pular esta ocorrência</span>
        </label>

        {!skip && (
          <div className="space-y-2.5">
            <div>
              <label className="label">Nova data</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={e => setDate(e.target.value)}
                onKeyDown={stopEnter}
              />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={stopEnter}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary flex-1 text-xs py-1.5"
            onClick={() => onSave({
              skip,
              date: skip ? originalDate : date,
              amount: skip ? defaultAmount : Number(amount),
            })}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScheduleForm({ initial, onClose }) {
  const { accounts, accountGroups, categories, payees, gerencialGroups, addSchedule, updateSchedule, getNextOccurrences } = useApp()

  const sortedGerGrupos = [...gerencialGroups].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  })
  const grpD = gerencialGroups.find(g => g.number === 'D')

  const [form, setForm] = useState({
    description: initial?.description || '',
    transactionType: initial?.transactionType || 'expense',
    accountId: initial?.accountId || accounts[0]?.id || '',
    toAccountId: initial?.toAccountId || '',
    amount: initial?.amount ?? '',
    categoryId: initial?.categoryId || '',
    payee: initial?.payee || '',
    costCenter: initial?.costCenter || '',
    frequency: initial?.frequency || 'monthly',
    startDate: initial?.startDate || today(),
    occurrenceType: initial?.occurrenceType || 'continuous',
    installments: initial?.installments ?? 12,
    remindDaysBefore: initial?.remindDaysBefore ?? 3,
    autoRegister: initial?.autoRegister ?? true,
    grupoGerencial: initial?.grupoGerencial || null,
    skipped: initial?.skipped || [],
    overrides: initial?.overrides || {},
  })

  const [editingOcc, setEditingOcc] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedAccount = accounts.find(a => a.id === form.accountId)
  const relevantCategories = categories.filter(c => c.type === 'both' || c.type === form.transactionType)

  const previewSchedule = {
    ...form,
    amount: Number(form.amount) || 0,
    registered: [],
    skipped: [],
  }
  const preview = form.startDate && form.frequency ? getNextOccurrences(previewSchedule, 12) : []

  const handleSaveOccurrence = (changes) => {
    setForm(f => {
      const newSkipped = changes.skip
        ? [...f.skipped.filter(d => d !== editingOcc), editingOcc]
        : f.skipped.filter(d => d !== editingOcc)
      const newOverrides = changes.skip
        ? Object.fromEntries(Object.entries(f.overrides).filter(([k]) => k !== editingOcc))
        : { ...f.overrides, [editingOcc]: { date: changes.date, amount: changes.amount } }
      return { ...f, skipped: newSkipped, overrides: newOverrides }
    })
    setEditingOcc(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.description || !form.amount || !form.accountId) return
    if (form.transactionType === 'transfer' && !form.toAccountId) return
    const data = {
      ...form,
      amount: Number(form.amount),
      accountType: selectedAccount?.type,
      installments: Number(form.installments),
      remindDaysBefore: Number(form.remindDaysBefore) || 0,
    }
    if (initial) {
      updateSchedule(initial.id, data)
    } else {
      addSchedule(data)
    }
    onClose()
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">

        {/* Movimentação */}
        <div className="col-span-2">
          <LabelTip tip={TIPS.transactionType}>Movimentação</LabelTip>
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {['expense', 'income', 'transfer'].map(t => (
              <button
                type="button"
                key={t}
                onClick={() => set('transactionType', t)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  form.transactionType === t
                    ? t === 'income' ? 'bg-emerald-600 text-white'
                    : t === 'transfer' ? 'bg-blue-600 text-white'
                    : 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {t === 'income' ? 'Receita' : t === 'transfer' ? 'Transferência' : 'Despesa'}
              </button>
            ))}
          </div>
        </div>

        {/* Descrição */}
        <div className="col-span-2">
          <LabelTip tip={TIPS.description} required>Descrição</LabelTip>
          <input
            className="input"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Ex: Aluguel, Salário..."
            required
          />
        </div>

        {/* Conta */}
        <div>
          <LabelTip tip={TIPS.account} required>{form.transactionType === 'transfer' ? 'Conta Origem' : 'Conta'}</LabelTip>
          <select className="input" value={form.accountId} onChange={e => set('accountId', e.target.value)} required>
            <AccountOptions accounts={accounts} accountGroups={accountGroups} />
          </select>
        </div>

        {/* Valor */}
        <div>
          <LabelTip tip={TIPS.amount} required>Valor (R$)</LabelTip>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="0,00"
            required
          />
        </div>

        {/* Conta Destino (apenas para transferências) */}
        {form.transactionType === 'transfer' && (
          <div className="col-span-2">
            <LabelTip tip="Conta que receberá a transferência" required>Conta Destino</LabelTip>
            <select className="input" value={form.toAccountId} onChange={e => set('toAccountId', e.target.value)} required>
              <option value="">Selecione a conta destino...</option>
              <AccountOptions accounts={accounts.filter(a => a.id !== form.accountId)} accountGroups={accountGroups} />
            </select>
          </div>
        )}

        {/* Categoria */}
        {form.transactionType !== 'transfer' && (
          <div>
            <LabelTip tip={TIPS.category}>Categoria</LabelTip>
            <CategorySelect
              categories={categories}
              type={form.transactionType}
              value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}
            />
          </div>
        )}

        {/* Favorecido */}
        {form.transactionType !== 'transfer' && (
          <div>
            <LabelTip tip={TIPS.payee}>Favorecido</LabelTip>
            <input
              className="input"
              value={form.payee}
              onChange={e => set('payee', e.target.value)}
              placeholder="Nome..."
              list="sch-payees"
            />
            <datalist id="sch-payees">{payees.map(p => <option key={p} value={p} />)}</datalist>
          </div>
        )}

        {/* Frequência */}
        <div>
          <LabelTip tip={TIPS.frequency}>Frequência</LabelTip>
          <select className="input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {/* Data de Início */}
        <div>
          <LabelTip tip={TIPS.startDate} required>Data de Início</LabelTip>
          <input
            className="input"
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            required
          />
        </div>

        {/* Ocorrência */}
        <div className={form.occurrenceType === 'installment' ? '' : 'col-span-2'}>
          <LabelTip tip={TIPS.occurrence}>Ocorrência</LabelTip>
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {[['continuous', 'Contínua'], ['installment', 'Parcelada']].map(([v, l]) => (
              <button
                type="button"
                key={v}
                onClick={() => set('occurrenceType', v)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  form.occurrenceType === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {form.occurrenceType === 'installment' && (
          <div>
            <LabelTip tip={TIPS.installments}>Nº de Parcelas</LabelTip>
            <input
              className="input"
              type="number"
              min="1"
              max="360"
              value={form.installments}
              onChange={e => set('installments', e.target.value)}
            />
          </div>
        )}

        {/* Automações */}
        <div className="col-span-2 bg-gray-800/40 rounded-xl p-3.5 space-y-3">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Automações</p>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-300 inline-flex items-center">
              Lembrar com Antecedência<Tooltip text={TIPS.remindDaysBefore} />
            </span>
            <div className="flex items-center gap-2">
              {form.remindDaysBefore > 0 && (
                <>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={form.remindDaysBefore}
                    onChange={e => set('remindDaysBefore', Math.max(1, Number(e.target.value)))}
                    className="w-14 input text-center text-xs py-1"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">dias antes</span>
                </>
              )}
              <Toggle
                value={form.remindDaysBefore > 0}
                onChange={v => set('remindDaysBefore', v ? 3 : 0)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-300 inline-flex items-center">
              Registrar Automático<Tooltip text={TIPS.autoRegister} />
            </span>
            <Toggle value={form.autoRegister} onChange={v => set('autoRegister', v)} />
          </div>
        </div>

        {/* Classificação Gerencial */}
        {form.transactionType === 'expense' && (
          <div className="col-span-2 bg-gray-800/40 rounded-xl p-3.5 space-y-2">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider flex items-center">
              Classificação Gerencial <Tooltip text={TIPS.gerencial} />
            </p>
            <select
              className="input"
              value={form.grupoGerencial || ''}
              onChange={e => set('grupoGerencial', e.target.value || null)}
            >
              <option value="">G — Gasto Normal (débito direto)</option>
              {sortedGerGrupos.filter(g => g.number !== 'D').map(g => (
                <option key={g.id} value={g.id}>
                  {g.number === 1 ? '1' : g.alias} — {g.name}
                  {g.number === 1 ? ' (reserva)' : ' (controle gerencial)'}
                </option>
              ))}
              {grpD && <option value={grpD.id}>D — Despesa já debitada</option>}
            </select>
            {form.grupoGerencial && (() => {
              const g = gerencialGroups.find(x => x.id === form.grupoGerencial)
              if (!g) return null
              if (g.number === 'D') return (
                <p className="text-xs text-gray-500 leading-snug">Apenas registra o lançamento, sem movimentar saldo.</p>
              )
              if (g.number === 1) return (
                <p className="text-xs text-emerald-500/70 leading-snug">
                  Ao efetivar, transferirá para a conta de reserva do grupo.
                </p>
              )
              const contaR = accounts.find(a => a.id === g.defaultAccountId)
              return (
                <p className="text-xs text-orange-500/70 leading-snug">
                  Ao efetivar, resgatará automaticamente{contaR ? ` de "${contaR.name}"` : ''} para a conta principal.
                </p>
              )
            })()}
          </div>
        )}

        {/* Prévia interativa */}
        {preview.length > 0 && (
          <div className="col-span-2">
            <label className="label">
              Prévia das próximas ocorrências
              <span className="ml-1.5 text-gray-600 text-[10px] normal-case font-normal">— clique para editar</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {preview.map((date, i) => {
                const override = form.overrides[date]
                const isSkipped = form.skipped.includes(date)
                const displayDate = (override?.date || date).split('-').reverse().join('/')
                const hasCustomAmount = override && !isSkipped && override.amount !== (Number(form.amount) || 0)

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setEditingOcc(date)}
                    title="Clique para editar esta ocorrência"
                    className={`text-center p-2 rounded-lg text-xs transition-all cursor-pointer ${
                      isSkipped
                        ? 'bg-gray-800/40 text-gray-600 ring-1 ring-gray-800'
                        : override
                        ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                        : i === 0
                        ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                        : 'bg-gray-800 text-gray-400'
                    } hover:ring-1 hover:ring-gray-500`}
                  >
                    <span className={isSkipped ? 'line-through opacity-40' : ''}>{displayDate}</span>
                    {isSkipped && (
                      <span className="block text-[9px] text-gray-600 mt-0.5">Pulado</span>
                    )}
                    {hasCustomAmount && (
                      <span className="block text-[9px] text-blue-500 mt-0.5">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(override.amount)}
                      </span>
                    )}
                    {override && !isSkipped && !hasCustomAmount && override.date !== date && (
                      <span className="block text-[9px] text-blue-500 mt-0.5">Editado</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="col-span-2 flex gap-3 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar Agendamento'}</button>
        </div>
      </form>

      {editingOcc && (
        <OccEditModal
          originalDate={editingOcc}
          override={form.overrides[editingOcc]}
          isSkipped={form.skipped.includes(editingOcc)}
          defaultAmount={Number(form.amount) || 0}
          onSave={handleSaveOccurrence}
          onClose={() => setEditingOcc(null)}
        />
      )}
    </>
  )
}
