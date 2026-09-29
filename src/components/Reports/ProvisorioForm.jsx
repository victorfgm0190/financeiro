import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today } from '../shared/utils'
import AccountOptions from '../shared/AccountOptions'
import SearchableSelect from '../shared/SearchableSelect'
import DateInput from '../shared/DateInput'

// Formulário do lançamento PROVISÓRIO do Fluxo de Caixa por Conta: uma entrada/saída de
// simulação gravada em fluxo_provisorios (tabela à parte — não é agendamento nem lançamento).
// Com `initial`, abre em modo edição. `onSalvar` recebe o payload em snake_case, já validado,
// no formato que /api/fluxo-provisorios espera.
export default function ProvisorioForm({ initial, contaPadrao, onSalvar, onClose }) {
  const { profileAccounts: accounts, accountGroups, categories } = useApp()

  const [form, setForm] = useState({
    date: initial?.date || today(),
    description: initial?.description || '',
    amount: initial?.amount ?? '',
    type: initial?.type || 'saida',
    account_id: initial?.account_id || contaPadrao || '',
    category_id: initial?.category_id || '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Categoria é opcional e segue o tipo escolhido ('both' serve aos dois).
  const catOpts = useMemo(() => {
    const alvo = form.type === 'entrada' ? 'income' : 'expense'
    return (categories || [])
      .filter(c => c.type === alvo || c.type === 'both')
      .map(c => ({ id: c.id, label: `${c.icon || ''} ${c.name}`.trim(), group: c.group || null }))
  }, [categories, form.type])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (salvando) return
    const amount = Number(form.amount)
    if (!form.description.trim() || !form.date || !form.account_id) return
    if (!Number.isFinite(amount) || amount <= 0) { setErro('Informe um valor maior que zero.'); return }
    setErro('')
    setSalvando(true)
    try {
      await onSalvar({
        ...(initial?.id ? { id: initial.id } : {}),
        date: form.date,
        description: form.description.trim(),
        amount,
        type: form.type,
        account_id: form.account_id,
        category_id: form.category_id || null,
      })
      onClose()
    } catch (err) {
      setErro(err.message || 'Falha ao gravar o provisório.')
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
        <Info size={14} className="text-purple-400 shrink-0 mt-0.5" />
        <p className="text-xs text-purple-300/90 leading-snug">
          Um provisório é uma simulação: entra no saldo acumulado, nos totais e no Saldo
          Projetado <strong>deste relatório</strong> e em mais nada — não vira agendamento, não
          mexe no saldo da conta e não aparece em nenhuma outra tela. Dá para efetivá-lo depois.
        </p>
      </div>

      <div>
        <label className="label">Descrição *</label>
        <input
          className="input"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ex: Venda do carro, bônus previsto..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Data *</label>
          <DateInput className="input" value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
        <div>
          <label className="label">Valor (R$) *</label>
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo *</label>
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {[['entrada', 'Entrada'], ['saida', 'Saída']].map(([v, l]) => (
              <button
                type="button"
                key={v}
                onClick={() => setForm(f => ({ ...f, type: v, category_id: '' }))}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  form.type === v
                    ? (v === 'entrada' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white')
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Conta *</label>
          <select className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)} required>
            <AccountOptions
              accounts={accounts}
              accountGroups={accountGroups}
              labelFn={a => a.apelido || a.name}
            />
          </select>
        </div>
      </div>

      <div>
        <label className="label">Categoria (opcional)</label>
        <SearchableSelect
          options={catOpts}
          value={form.category_id}
          onChange={id => set('category_id', id || '')}
          placeholder="Sem categoria"
          ungroupedLast
          ungroupedLabel="Sem grupo"
        />
      </div>

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      <div className="flex gap-3 justify-end pt-1">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? 'Salvando...' : initial?.id ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </form>
  )
}
