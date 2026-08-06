import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { criarBem } from '../../lib/bemApi'

// Liga uma conta patrimonial (type='asset') já existente ao módulo de bem: grava o valor da
// nota fiscal e as 4 categorias. POST /api/bem/criar aceita conta_id e converte no lugar.

function SelectCategoria({ label, valor, onChange, categorias }) {
  const porGrupo = useMemo(() => {
    const grupos = {}
    for (const c of categorias) {
      const g = c.group || 'Sem grupo'
      ;(grupos[g] ||= []).push(c)
    }
    return grupos
  }, [categorias])

  return (
    <div>
      <label className="label">{label} *</label>
      <select className="input" value={valor} onChange={e => onChange(e.target.value)} required>
        <option value="">Selecione...</option>
        {Object.entries(porGrupo).map(([grupo, itens]) => (
          <optgroup key={grupo} label={grupo}>
            {itens.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

export default function ParametrizarBemModal({ conta, categorias, onCancel, onSuccess, onErro }) {
  const [form, setForm] = useState({
    valor_nota_fiscal: String(conta.acquisitionValue ?? conta.balance ?? ''),
    descricao: '',
    categoria_perda_bem_id: '',
    categoria_ganho_bem_id: '',
    categoria_prestacao_id: '',
    categoria_taxa_finan_id: '',
  })
  const [loading, setLoading] = useState(false)

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const despesas = useMemo(() => categorias.filter(c => c.type === 'expense'), [categorias])
  const receitas = useMemo(() => categorias.filter(c => c.type === 'income'), [categorias])

  const podeEnviar = Number(form.valor_nota_fiscal) > 0
    && form.categoria_perda_bem_id && form.categoria_ganho_bem_id
    && form.categoria_prestacao_id && form.categoria_taxa_finan_id
    && !loading

  const enviar = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    try {
      const resposta = await criarBem({
        conta_id: conta.id,
        nome: conta.name,
        valor_nota_fiscal: Number(form.valor_nota_fiscal),
        descricao: form.descricao || null,
        categoria_perda_bem_id: form.categoria_perda_bem_id,
        categoria_ganho_bem_id: form.categoria_ganho_bem_id,
        categoria_prestacao_id: form.categoria_prestacao_id,
        categoria_taxa_finan_id: form.categoria_taxa_finan_id,
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
      <p className="text-xs text-gray-500">
        Define a nota fiscal e as categorias que o módulo usa para lançar prestação, juros e
        perda/ganho na venda. O valor da nota fiscal é imutável depois de gravado.
      </p>

      <div>
        <label className="label">Valor da Nota Fiscal (R$) *</label>
        <input
          className="input" type="number" step="0.01" min="0.01" required autoFocus
          value={form.valor_nota_fiscal}
          onChange={e => set('valor_nota_fiscal', e.target.value)}
        />
      </div>

      <div>
        <label className="label">Descrição</label>
        <input
          className="input" type="text"
          value={form.descricao}
          onChange={e => set('descricao', e.target.value)}
          placeholder="Ex: Veículo adquirido em agosto/2026"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectCategoria
          label="Perda de Venda de Bem" categorias={despesas}
          valor={form.categoria_perda_bem_id} onChange={v => set('categoria_perda_bem_id', v)}
        />
        <SelectCategoria
          label="Ganho de Venda de Bem" categorias={receitas}
          valor={form.categoria_ganho_bem_id} onChange={v => set('categoria_ganho_bem_id', v)}
        />
        <SelectCategoria
          label="Prestação (Principal)" categorias={despesas}
          valor={form.categoria_prestacao_id} onChange={v => set('categoria_prestacao_id', v)}
        />
        <SelectCategoria
          label="Taxa de Financiamento (Juros)" categorias={despesas}
          valor={form.categoria_taxa_finan_id} onChange={v => set('categoria_taxa_finan_id', v)}
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={!podeEnviar}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          Salvar
        </button>
      </div>
    </form>
  )
}
