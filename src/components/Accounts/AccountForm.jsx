import { useState } from 'react'
import { Info, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const TYPES = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'credit', label: 'Cartão de Crédito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'asset', label: 'Bem / Ativo' },
  { value: 'liability', label: 'Dívida / Passivo' },
]

function Tooltip({ text }) {
  return (
    <span className="relative group/tip ml-1 inline-flex items-center">
      <Info size={12} className="text-gray-500 cursor-help" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2.5 py-2 invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-all pointer-events-none z-30 shadow-xl leading-relaxed">
        {text}
      </span>
    </span>
  )
}

function Toggle({ checked, onChange, label, tooltip }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <div className="relative shrink-0">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <span className="text-sm text-gray-300 select-none">{label}</span>
      {tooltip && <Tooltip text={tooltip} />}
    </label>
  )
}

export default function AccountForm({ initial, onClose }) {
  const { accounts, accountGroups = [], activeAccountGroups = [], profiles = [], categories = [], addAccount, updateAccount } = useApp()
  const [form, setForm] = useState({
    name: initial?.name || '',
    apelido: initial?.apelido || '',
    type: initial?.type || 'checking',
    balance: initial?.balance ?? '',
    bank: initial?.bank || '',
    creditLimit: initial?.creditLimit ?? '',
    closingDay: initial?.closingDay ?? 1,
    dueDay: initial?.dueDay ?? 10,
    isMain: initial?.isMain || false,
    fluxoCaixaPrincipal: initial?.fluxoCaixaPrincipal || false,
    contaCorrentePrincipal: initial?.contaCorrentePrincipal || false,
    contaAplicacao: initial?.contaAplicacao || false,
    grupoGerencial: initial?.grupoGerencial || null,
    accountGroupId: initial?.accountGroupId || null,
    profileId: initial?.profileId || null,
    acquisitionValue: initial?.acquisitionValue ?? '',
    acquisitionDate: initial?.acquisitionDate || '',
    isReserva: initial?.isReserva || false,
    reservaType: initial?.reservaType || 'geral',
    reservaCategoryId: initial?.reservaCategoryId || null,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const isCredit = form.type === 'credit'
  const isChecking = form.type === 'checking'
  const isPatrimonial = form.type === 'asset' || form.type === 'liability'
  const sortedGroups = [...activeAccountGroups].sort((a, b) => a.order - b.order)

  const conflictAccount = isChecking && form.contaCorrentePrincipal
    ? accounts.find(a => a.type === 'checking' && a.id !== initial?.id && a.contaCorrentePrincipal)
    : null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return

    if (form.contaCorrentePrincipal && isChecking) {
      accounts
        .filter(a => a.type === 'checking' && a.id !== initial?.id && a.contaCorrentePrincipal)
        .forEach(a => updateAccount(a.id, { contaCorrentePrincipal: false }))
    }

    const payload = {
      name: form.name,
      apelido: form.apelido.slice(0, 8),
      type: form.type,
      bank: form.bank,
      balance: isCredit ? (initial?.balance || 0) : Number(form.balance),
      creditLimit: Number(form.creditLimit),
      closingDay: Number(form.closingDay),
      dueDay: Number(form.dueDay),
      isMain: form.isMain,
      fluxoCaixaPrincipal: isPatrimonial ? false : form.fluxoCaixaPrincipal,
      contaCorrentePrincipal: isChecking ? form.contaCorrentePrincipal : false,
      contaAplicacao: !isCredit && !isPatrimonial ? form.contaAplicacao : false,
      grupoGerencial: form.grupoGerencial,
      accountGroupId: form.accountGroupId || null,
      profileId: form.profileId || null,
      acquisitionValue: isPatrimonial && form.acquisitionValue !== '' ? Number(form.acquisitionValue) : null,
      acquisitionDate: isPatrimonial ? form.acquisitionDate || null : null,
      valueHistory: initial?.valueHistory || [],
      isReserva: !isCredit && !isPatrimonial ? form.isReserva : false,
      reservaType: form.isReserva && !isCredit && !isPatrimonial ? form.reservaType : null,
      reservaCategoryId: form.isReserva && form.reservaType === 'especifica' && !isCredit && !isPatrimonial ? form.reservaCategoryId : null,
    }

    if (initial) {
      updateAccount(initial.id, payload)
    } else {
      addAccount({ ...payload, creditDebt: 0, creditMonthBill: 0 })
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Tipo de Conta</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(t => (
            <label
              key={t.value}
              className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                form.type === t.value
                  ? 'border-[#0F6E56] bg-[#0F6E56]/10 text-[#0F6E56]'
                  : 'border-gray-700 bg-gray-800 text-gray-300'
              }`}
            >
              <input
                type="radio"
                name="type"
                value={t.value}
                checked={form.type === t.value}
                onChange={e => set('type', e.target.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label">Nome da Conta *</label>
          <input
            className="input"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Ex: Nubank, Itaú..."
            required
          />
        </div>
        <div>
          <label className="label flex items-center gap-1">
            Apelido
            <Tooltip text="Nome curto usado no extrato gerencial (máx. 8 caracteres)" />
          </label>
          <input
            className="input"
            value={form.apelido}
            onChange={e => set('apelido', e.target.value.slice(0, 8))}
            placeholder="Ex: NUgi"
            maxLength={8}
          />
          <p className="text-xs text-gray-600 mt-0.5 text-right">{form.apelido.length}/8</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Banco / Instituição</label>
          <input
            className="input"
            value={form.bank}
            onChange={e => set('bank', e.target.value)}
            placeholder="Nome do banco"
          />
        </div>
        <div>
          <label className="label">Grupo</label>
          <select className="input" value={form.accountGroupId || ''} onChange={e => set('accountGroupId', e.target.value || null)}>
            <option value="">Sem grupo</option>
            {sortedGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {profiles.length > 0 && (
        <div>
          <label className="label">Vínculo (CPF / CNPJ)</label>
          <select className="input" value={form.profileId || ''} onChange={e => set('profileId', e.target.value || null)}>
            <option value="">Sem vínculo</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.type === 'pf' ? 'CPF' : 'CNPJ'} {p.document || '—'}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isCredit && !isPatrimonial && (
        <div>
          <label className="label">Saldo Atual (R$)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.balance}
            onChange={e => set('balance', e.target.value)}
            placeholder="0,00"
          />
        </div>
      )}

      {isPatrimonial && (
        <>
          <div>
            <label className="label">{form.type === 'asset' ? 'Valor Atual (R$)' : 'Saldo Devedor (R$)'}</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.balance}
              onChange={e => set('balance', e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor de Aquisição (R$)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.acquisitionValue}
                onChange={e => set('acquisitionValue', e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="label">Data de Aquisição</label>
              <input
                className="input"
                type="date"
                value={form.acquisitionDate}
                onChange={e => set('acquisitionDate', e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {isCredit && (
        <>
          <div>
            <label className="label">Limite do Cartão (R$)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.creditLimit}
              onChange={e => set('creditLimit', e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dia de Fechamento</label>
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                value={form.closingDay}
                onChange={e => set('closingDay', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Dia de Vencimento</label>
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={e => set('dueDay', e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {!isPatrimonial && (
      <div className="space-y-3 pt-1 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wide pt-1">Classificação</p>

        <Toggle
          checked={form.isMain}
          onChange={e => set('isMain', e.target.checked)}
          label="Conta principal"
        />

        <Toggle
          checked={form.fluxoCaixaPrincipal}
          onChange={e => set('fluxoCaixaPrincipal', e.target.checked)}
          label="Fluxo de Caixa Principal"
          tooltip="Esta conta aparece no painel de Fluxo de Caixa geral"
        />

        {!isCredit && (
          <Toggle
            checked={form.contaAplicacao}
            onChange={e => set('contaAplicacao', e.target.checked)}
            label="Conta de Aplicação Financeira"
            tooltip="Ativa a netização de transferências opostas na mesma data (resgate + aplicação → saldo líquido)"
          />
        )}

        {isChecking && (
          <>
            <Toggle
              checked={form.contaCorrentePrincipal}
              onChange={e => set('contaCorrentePrincipal', e.target.checked)}
              label="Conta Corrente Principal"
              tooltip="Esta conta é usada no controle gerencial do cartão de crédito"
            />
            {conflictAccount && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  A conta <strong className="text-amber-200">"{conflictAccount.name}"</strong> já é a Conta Corrente Principal.
                  Ao salvar, ela será substituída por esta conta.
                </p>
              </div>
            )}
          </>
        )}

        {!isCredit && (
          <>
            <Toggle
              checked={form.isReserva}
              onChange={e => {
                set('isReserva', e.target.checked)
                if (!e.target.checked) { set('reservaType', 'geral'); set('reservaCategoryId', null) }
              }}
              label="É conta de reserva"
              tooltip="Identifica esta conta como reserva orçamentária para controle de gastos futuros"
            />
            {form.isReserva && (
              <div className="ml-11 space-y-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                <div>
                  <label className="label">Tipo de reserva</label>
                  <select
                    className="input"
                    value={form.reservaType}
                    onChange={e => { set('reservaType', e.target.value); if (e.target.value !== 'especifica') set('reservaCategoryId', null) }}
                  >
                    <option value="geral">Geral (sem categoria fixa)</option>
                    <option value="especifica">Específica (vinculada a uma categoria)</option>
                  </select>
                </div>
                {form.reservaType === 'especifica' ? (
                  <div>
                    <label className="label">Categoria vinculada</label>
                    <select
                      className="input"
                      value={form.reservaCategoryId || ''}
                      onChange={e => set('reservaCategoryId', e.target.value || null)}
                    >
                      <option value="">Selecione uma categoria...</option>
                      {categories
                        .filter(c => c.type === 'expense' || c.type === 'both')
                        .map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)
                      }
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Esta conta usará a categoria <span className="text-gray-300 font-medium">🏦 Reservas Gerais</span> automaticamente em lançamentos de reserva.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar Conta'}</button>
      </div>
    </form>
  )
}
