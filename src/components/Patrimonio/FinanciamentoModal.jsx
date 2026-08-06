import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import DateInput from '../shared/DateInput'
import { criarFinanciamento } from '../../lib/bemApi'
import { hojeIso, round2 } from './bemUtils'

const BANCOS = ['Safra', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa', 'BV', 'Votorantim']

export default function FinanciamentoModal({ bem, contasCorrentes, onCancel, onSuccess, onErro }) {
  const restante = Math.max(0, round2((bem.valor_nota_fiscal || 0) - (bem.saldo || 0)))
  const [form, setForm] = useState({
    valor_principal: String(restante || ''),
    num_parcelas: '60',
    valor_parcela: '',
    banco: '',
    data_primeira_parcela: hojeIso(),
    conta_origem_id: contasCorrentes.find(c => c.contaCorrentePrincipal)?.id
      || contasCorrentes.find(c => c.isMain)?.id
      || contasCorrentes[0]?.id
      || '',
  })
  const [loading, setLoading] = useState(false)

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const preview = useMemo(() => {
    const principal = Number(form.valor_principal)
    const n = Number(form.num_parcelas)
    const parcela = Number(form.valor_parcela)
    if (!(principal > 0) || !Number.isInteger(n) || n < 1 || !(parcela > 0)) return null

    const valorTotal = round2(parcela * n)
    const jurosTotais = round2(valorTotal - principal)
    return {
      valorTotal,
      jurosTotais,
      principalPorParcela: round2(principal / n),
      jurosPorParcela: round2(jurosTotais / n),
      invalido: jurosTotais < 0,
    }
  }, [form.valor_principal, form.num_parcelas, form.valor_parcela])

  const podeEnviar = preview && !preview.invalido && form.data_primeira_parcela && !loading

  const enviar = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    try {
      const resposta = await criarFinanciamento({
        bem_id: bem.id,
        valor_principal: Number(form.valor_principal),
        num_parcelas: Number(form.num_parcelas),
        valor_parcela: Number(form.valor_parcela),
        banco: form.banco || null,
        data_primeira_parcela: form.data_primeira_parcela,
        conta_origem_id: form.conta_origem_id || null,
      })
      onSuccess(resposta)
    } catch (err) {
      onErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="p-3 bg-gray-800/60 rounded-lg text-xs text-gray-400 space-y-1">
        <div className="flex justify-between"><span>Bem</span><span className="text-gray-200">{bem.nome}</span></div>
        <div className="flex justify-between"><span>Valor da nota fiscal</span><span className="text-gray-200">{fmt(bem.valor_nota_fiscal)}</span></div>
        <div className="flex justify-between"><span>Saldo atual (entrada já paga)</span><span className="text-gray-200">{fmt(bem.saldo)}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Valor a Financiar (R$) *</label>
          <input
            className="input" type="number" step="0.01" min="0.01" required autoFocus
            value={form.valor_principal}
            onChange={e => set('valor_principal', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Número de Parcelas *</label>
          <input
            className="input" type="number" step="1" min="1" max="600" required
            value={form.num_parcelas}
            onChange={e => set('num_parcelas', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Valor da Parcela (R$) *</label>
          <input
            className="input" type="number" step="0.01" min="0.01" required
            value={form.valor_parcela}
            onChange={e => set('valor_parcela', e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div>
          <label className="label">Banco</label>
          <input
            className="input" list="bancos-financiamento"
            value={form.banco}
            onChange={e => set('banco', e.target.value)}
            placeholder="Ex: Safra"
          />
          <datalist id="bancos-financiamento">
            {BANCOS.map(b => <option key={b} value={b} />)}
          </datalist>
        </div>
        <div>
          <label className="label">1ª Parcela vence em *</label>
          <DateInput
            className="input" required
            value={form.data_primeira_parcela}
            onChange={e => set('data_primeira_parcela', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Conta que paga as parcelas</label>
          <select
            className="input"
            value={form.conta_origem_id}
            onChange={e => set('conta_origem_id', e.target.value)}
          >
            {contasCorrentes.length === 0 && <option value="">Nenhuma conta corrente</option>}
            {contasCorrentes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {preview && (
        <div className={`p-3 rounded-lg text-xs space-y-1 border ${preview.invalido ? 'bg-red-950/40 border-red-800' : 'bg-gray-800/60 border-gray-800'}`}>
          <p className="text-gray-400 font-medium mb-1.5">Prévia</p>
          <div className="flex justify-between"><span className="text-gray-500">Juros Totais</span><span className={preview.invalido ? 'text-despesa' : 'text-gray-200'}>{fmt(preview.jurosTotais)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Valor Total</span><span className="text-gray-200">{fmt(preview.valorTotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Principal / Parcela</span><span className="text-gray-200">{fmt(preview.principalPorParcela)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Juros / Parcela</span><span className="text-gray-200">{fmt(preview.jurosPorParcela)}</span></div>
          {preview.invalido && (
            <p className="text-despesa pt-1">
              O total das parcelas é menor que o valor financiado — revise o valor da parcela.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-gray-600">
        Serão criadas {form.num_parcelas || 0} parcelas e {form.num_parcelas || 0} agendamentos de
        transferência para a conta de dívida, um por vencimento.
      </p>

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={!podeEnviar}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          Criar Financiamento
        </button>
      </div>
    </form>
  )
}
