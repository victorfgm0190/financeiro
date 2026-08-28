import { useMemo, useState } from 'react'
import { Loader2, Plus, Building2 } from 'lucide-react'
import { atualizarFavorecido } from '../../lib/bemApi'

// Escolhe o BANCO FAVORECIDO do financiamento — quem recebe as parcelas. Grava
// `financing.banco_favorecido_id` e, junto, o texto `financing.banco` que a UI exibe; o backend
// reescreve a descrição da conta "Contas a Pagar - Fin. <bem>" com o mesmo nome, que é como o
// vínculo fica visível no Patrimônio.
//
// O banco novo é criado pelo PRÓPRIO endpoint (e espelhado aqui pelo id que ele devolve): criar
// do lado do React e só então mandar o id esbarraria no sync debounced, e o PATCH não acharia a
// conta ainda.

// Contas que podem receber uma parcela. Bem e dívida ficam de fora (não recebem de ninguém),
// assim como as contas gerenciais, que são espelho contábil e não banco.
const TIPOS_ELEGIVEIS = ['checking', 'savings', 'credit']

export default function EditarFavorecidoModal({
  financiamento, contas, onCancel, onSuccess, onErro,
}) {
  const [modo, setModo] = useState('existente') // 'existente' | 'novo'
  const [contaId, setContaId] = useState(financiamento.banco_favorecido_id || '')
  const [nomeNovo, setNomeNovo] = useState('')
  const [tipoNovo, setTipoNovo] = useState('checking')
  const [loading, setLoading] = useState(false)

  const elegiveis = useMemo(() => contas
    .filter(c => TIPOS_ELEGIVEIS.includes(c.type) && !c.isGerencial)
    .filter(c => c.id !== financiamento.conta_divida_id && c.id !== financiamento.bem_id)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  [contas, financiamento.conta_divida_id, financiamento.bem_id])

  const podeEnviar = !loading && (modo === 'novo' ? nomeNovo.trim().length > 0 : true)

  const enviar = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    try {
      const payload = modo === 'novo'
        ? { novo_banco: { nome: nomeNovo.trim(), tipo: tipoNovo } }
        : { banco_favorecido_id: contaId || null }
      onSuccess(await atualizarFavorecido(financiamento.id, payload))
    } catch (err) {
      onErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2.5">
        <p className="text-xs text-gray-500">Favorecido atual</p>
        <p className="text-sm text-gray-200 flex items-center gap-1.5 mt-0.5">
          <Building2 size={13} className="text-gray-500 shrink-0" />
          {financiamento.banco_favorecido_nome || financiamento.banco || 'Nenhum banco vinculado'}
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {[
          { id: 'existente', label: 'Banco existente' },
          { id: 'novo', label: 'Criar novo banco' },
        ].map(t => (
          <button
            key={t.id} type="button" onClick={() => setModo(t.id)}
            className={`px-3 py-2 text-xs border-b-2 -mb-px transition-colors ${
              modo === t.id
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {modo === 'existente' ? (
        <div>
          <label className="label">Banco favorecido</label>
          <select className="input" value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Sem banco vinculado</option>
            {elegiveis.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {elegiveis.length === 0 && (
            <p className="text-xs text-gray-600 mt-1">
              Nenhuma conta elegível — use “Criar novo banco”.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Nome do banco *</label>
            <input
              className="input" type="text" autoFocus value={nomeNovo}
              onChange={e => setNomeNovo(e.target.value)} placeholder="Ex: BANCO SAFRA"
            />
            <p className="text-xs text-gray-600 mt-1">
              Se já existir uma conta com este nome, ela é reaproveitada em vez de duplicada.
            </p>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={tipoNovo} onChange={e => setTipoNovo(e.target.value)}>
              <option value="checking">Conta Corrente</option>
              <option value="savings">Poupança</option>
              <option value="credit">Cartão de Crédito</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={!podeEnviar}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Salvar
        </button>
      </div>
    </form>
  )
}
