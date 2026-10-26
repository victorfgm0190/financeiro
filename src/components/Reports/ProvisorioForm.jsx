import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today } from '../shared/utils'
import AccountOptions from '../shared/AccountOptions'
import SearchableSelect from '../shared/SearchableSelect'
import DateInput from '../shared/DateInput'
import { filtrarCategoriasPorPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import InputMoeda from '../shared/InputMoeda'

// Formulário do lançamento PROVISÓRIO do Fluxo de Caixa por Conta: uma entrada/saída de
// simulação gravada em fluxo_provisorios (tabela à parte — não é agendamento nem lançamento).
// Com `initial`, abre em modo edição. `onSalvar` recebe o payload em snake_case, já validado,
// no formato que /api/fluxo-provisorios espera. `contas` (opcional) restringe a escolha de conta
// (a tela Fluxo de Caixa Futuro passa só as contas da consulta ativa).
export default function ProvisorioForm({ initial, contaPadrao, contas, onSalvar, onClose }) {
  const { profileAccounts: accounts, accountGroups, categories, activeProfileId, categoryGroupOrder, pode } = useApp()
  const podeSalvar = pode('fluxo', initial?.id ? 'editar' : 'incluir')

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
    // Categorias por perfil: o da conta escolhida, senão o chip do topo; a já gravada fica.
    const perfil = perfilParaCategorias(accounts, form.account_id, activeProfileId)
    return ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfil, [form.category_id]), categoryGroupOrder)
      .filter(c => c.type === alvo || c.type === 'both')
      .map(c => ({ id: c.id, label: `${c.icon || ''} ${c.name}`.trim(), group: c.group || null }))
  }, [categories, form.type, accounts, form.account_id, form.category_id, activeProfileId, categoryGroupOrder])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (salvando || !podeSalvar) return
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
      <div className="flex items-start gap-2 p-3 bg-surface-2 border border-dashed border-borda-forte rounded-lg">
        <Info size={14} className="text-texto-2 shrink-0 mt-0.5" />
        <p className="text-xs text-texto-2 leading-snug">
          Um provisório é uma simulação: entra no saldo acumulado, nos totais e no projetado
          do <strong>Fluxo de Caixa</strong> (relatório e tela Fluxo de Caixa Futuro) e em mais
          nada — não vira agendamento e não mexe no saldo da conta. Dá para efetivá-lo depois.
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
          <InputMoeda
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
          <div className="flex rounded-lg overflow-hidden border border-borda-forte">
            {[['entrada', 'Entrada'], ['saida', 'Saída']].map(([v, l]) => (
              <button
                type="button"
                key={v}
                onClick={() => setForm(f => ({ ...f, type: v, category_id: '' }))}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  form.type === v
                    ? (v === 'entrada' ? 'bg-receita text-page' : 'bg-despesa text-page')
                    : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
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
              accounts={contas || accounts}
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
          preserveGroupOrder
          value={form.category_id}
          onChange={id => set('category_id', id || '')}
          placeholder="Sem categoria"
          ungroupedLast
          ungroupedLabel="Sem grupo"
        />
      </div>

      {erro && <p className="text-xs text-perigo">{erro}</p>}

      <div className="flex gap-3 justify-end pt-1">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
        {podeSalvar && (
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : initial?.id ? 'Salvar' : 'Adicionar'}
          </button>
        )}
      </div>
      {!podeSalvar && <p className="text-xs text-texto-3 text-right">Somente leitura — seu nível de acesso não permite gravar.</p>}
    </form>
  )
}
