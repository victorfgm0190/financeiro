import { useMemo, useState } from 'react'
import { Loader2, Plus, Building2 } from 'lucide-react'
import { atualizarFavorecido } from '../../lib/bemApi'
import { contasFavorecidasElegiveis, sugestoesFavorecido, textoFavorecido } from './bemUtils'

// Troca o FAVORECIDO do financiamento — quem recebe as parcelas. Vale para o financiamento
// INTEIRO: o endpoint reaplica o mesmo favorecido nos agendamentos de TODAS as parcelas na
// mesma transação.
//
// São dois campos porque são duas coisas, e o backend grava as duas:
//   • `financing.banco` — o TEXTO, que vira o `payee` das N parcelas e é o que a aba Parcelas
//     e a tela de Agendamentos exibem. É ele o favorecido, na prática.
//   • `financing.banco_favorecido_id` — o vínculo opcional com uma conta do app, que o backend
//     usa para reescrever a descrição da conta "Contas a Pagar - Fin. <bem>".
// Escolher a conta preenche o texto com o nome dela (o mesmo default do PATCH), mas o texto
// continua editável: quem quer "Safra" com a conta "BANCO SAFRA" vinculada pode ter os dois.
//
// O texto é obrigatório pela mesma razão da criação: um financiamento cujas parcelas ficam sem
// favorecido só é descoberto lá na frente, na tela de Contas a Pagar. Para tirar o vínculo
// contábil sem apagar o favorecido, basta escolher "Nenhuma conta vinculada" e manter o texto.
//
// O banco novo é criado pelo PRÓPRIO endpoint (e espelhado aqui pelo id que ele devolve): criar
// do lado do React e só então mandar o id esbarraria no sync debounced, e o PATCH não acharia a
// conta ainda.

export default function EditarFavorecidoModal({
  financiamento, contas, favorecidos = [], onCancel, onSuccess, onErro,
}) {
  const [modo, setModo] = useState('existente') // 'existente' | 'novo'
  const [contaId, setContaId] = useState(financiamento.banco_favorecido_id || '')
  const [texto, setTexto] = useState(textoFavorecido(financiamento) || '')
  // Texto digitado à mão não é sobrescrito ao trocar a conta — o default só vale enquanto o
  // usuário não disse o contrário.
  const [textoManual, setTextoManual] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [tipoNovo, setTipoNovo] = useState('checking')
  const [loading, setLoading] = useState(false)

  const elegiveis = useMemo(() => contasFavorecidasElegiveis(contas, {
    contaDividaId: financiamento.conta_divida_id,
    bemId: financiamento.bem_id,
  }), [contas, financiamento.conta_divida_id, financiamento.bem_id])

  const sugestoes = useMemo(
    () => sugestoesFavorecido(favorecidos, elegiveis),
    [favorecidos, elegiveis],
  )

  const atualNome = textoFavorecido(financiamento)
  const contaVinculada = financiamento.banco_favorecido_nome

  const escolherConta = (id) => {
    setContaId(id)
    const conta = elegiveis.find(c => c.id === id)
    if (conta && !textoManual) setTexto(conta.name)
  }

  const textoVazio = !texto.trim()
  const podeEnviar = !loading && (modo === 'novo' ? nomeNovo.trim().length > 0 : !textoVazio)

  const enviar = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    try {
      const payload = modo === 'novo'
        ? { novo_banco: { nome: nomeNovo.trim(), tipo: tipoNovo } }
        : { banco: texto.trim(), banco_favorecido_id: contaId || null }
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
          {atualNome || 'Nenhum favorecido definido'}
        </p>
        {contaVinculada && contaVinculada !== atualNome && (
          <p className="text-xs text-gray-600 mt-0.5">Conta vinculada: {contaVinculada}</p>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {[
          { id: 'existente', label: 'Favorecido existente' },
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
        <div className="space-y-3">
          <div>
            <label className="label">Favorecido *</label>
            <input
              className="input" list="favorecidos-financiamento" autoFocus
              value={texto}
              onChange={e => { setTexto(e.target.value); setTextoManual(true) }}
              placeholder="Ex: Safra"
            />
            <datalist id="favorecidos-financiamento">
              {sugestoes.map(f => <option key={f} value={f} />)}
            </datalist>
            {textoVazio
              ? <p className="text-xs text-red-400 mt-1">Favorecido é obrigatório.</p>
              : (
                <p className="text-xs text-gray-500 mt-1">
                  Quem recebe as parcelas. Vale para as {financiamento.num_parcelas || 'N'} parcelas
                  do financiamento, inclusive as já pagas.
                </p>
              )}
          </div>
          <div>
            {/* Rotulado como CONTA, não como "Banco favorecido": com o campo Favorecido logo
                acima, dois rótulos quase iguais faziam este select parecer uma segunda forma de
                dizer a mesma coisa — e a diferença (um é texto exibido, o outro é vínculo
                contábil) desaparecia. */}
            <label className="label">Conta vinculada</label>
            <select className="input" value={contaId} onChange={e => escolherConta(e.target.value)}>
              <option value="">Nenhuma conta vinculada</option>
              {elegiveis.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              Opcional — o vínculo contábil, usado na descrição da conta de dívida. Escolher uma
              conta preenche o Favorecido com o nome dela; o que as parcelas exibem é sempre o
              texto acima.
            </p>
          </div>
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
