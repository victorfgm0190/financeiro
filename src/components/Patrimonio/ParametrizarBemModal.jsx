import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { criarBem } from '../../lib/bemApi'
import { criarCategoriasCapital } from '../../lib/db'
import { capitalFaltante, categoriaDeCapital } from '../../lib/kitCategorias'
import { useApp } from '../../context/AppContext'
import { filtrarCategoriasPorPerfil } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import InputMoeda from '../shared/InputMoeda'
import HelpCampo from '../shared/HelpCampo'

// Liga uma conta patrimonial (type='asset') já existente ao módulo de bem: grava o valor da
// nota fiscal e as 4 categorias. POST /api/bem/criar aceita conta_id e converte no lugar.

function SelectCategoria({ label, valor, onChange, categorias, helpId }) {
  const porGrupo = useMemo(() => {
    const grupos = {}
    for (const c of categorias) {
      const g = c.group || 'Sem grupo'
      ;(grupos[g] ||= []).push(c)
    }
    return grupos
  }, [categorias])

  return (
    <div data-help-id={helpId}>
      <label className="label">{label} *<HelpCampo campo={helpId} /></label>
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
    // null = ainda não escolhida: vale a sugestão (categoria de ganho/perda de capital, se houver).
    categoria_perda_bem_id: null,
    categoria_ganho_bem_id: null,
    categoria_prestacao_id: '',
    categoria_taxa_finan_id: '',
  })
  const [loading, setLoading] = useState(false)

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // Categorias por perfil: o da conta do bem (se tiver perfil), senão o chip do topo.
  // Ordem salva em Configurações → Categorias; SelectCategoria agrupa preservando a ordem.
  const { activeProfileId, categoryGroupOrder, addCategory, pode } = useApp()
  const doPerfil = useMemo(
    () => ordenarCategorias(filtrarCategoriasPorPerfil(categorias, conta.profileId || activeProfileId), categoryGroupOrder),
    [categorias, conta.profileId, activeProfileId, categoryGroupOrder]
  )
  const despesas = useMemo(() => doPerfil.filter(c => c.type === 'expense'), [doPerfil])
  const receitas = useMemo(() => doPerfil.filter(c => c.type === 'income'), [doPerfil])

  // Sugestão só entre as que o perfil enxerga; "falta" olha todas, para não duplicar.
  const perdaId = form.categoria_perda_bem_id ?? categoriaDeCapital(despesas, 'perda')?.id ?? ''
  const ganhoId = form.categoria_ganho_bem_id ?? categoriaDeCapital(receitas, 'ganho')?.id ?? ''
  const faltamCapital = capitalFaltante(categorias).length > 0
  const [criando, setCriando] = useState(false)
  // Cria no banco na hora (o cadastro confere se a categoria existe) e mostra aqui, sem sair do cadastro.
  const criarPadrao = async () => {
    setCriando(true)
    try {
      const { criadas } = await criarCategoriasCapital()
      for (const c of criadas || []) addCategory(c)
    } catch (err) {
      onErro(err.message)
    } finally {
      setCriando(false)
    }
  }

  const podeEnviar = Number(form.valor_nota_fiscal) > 0
    && perdaId && ganhoId
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
        categoria_perda_bem_id: perdaId,
        categoria_ganho_bem_id: ganhoId,
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
    <form onSubmit={enviar} className="space-y-4" data-help-form="parametrizarBem">
      <p className="text-xs text-texto-3">
        Define a nota fiscal e as categorias que o módulo usa para lançar prestação, juros e
        perda/ganho na venda. O valor da nota fiscal é imutável depois de gravado.
      </p>

      <div data-help-id="parametrizarBem.notaFiscal">
        <label className="label">Valor da Nota Fiscal (R$) *<HelpCampo campo="parametrizarBem.notaFiscal" /></label>
        <InputMoeda
          min="0.01" required autoFocus
          value={form.valor_nota_fiscal}
          onChange={e => set('valor_nota_fiscal', e.target.value)}
        />
      </div>

      <div data-help-id="parametrizarBem.descricao">
        <label className="label">Descrição<HelpCampo campo="parametrizarBem.descricao" /></label>
        <input
          className="input" type="text"
          value={form.descricao}
          onChange={e => set('descricao', e.target.value)}
          placeholder="Digite a descrição do bem"
        />
      </div>

      {faltamCapital && pode('cadastros', 'incluir') && (
        <button type="button" className="btn-secondary text-xs py-1.5" disabled={criando} onClick={criarPadrao}>
          {criando ? 'Criando…' : 'Criar categorias padrão de ganho/perda'}
        </button>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectCategoria
          label="Perda de Venda de Bem" helpId="parametrizarBem.categoriaPerda" categorias={despesas}
          valor={perdaId} onChange={v => set('categoria_perda_bem_id', v)}
        />
        <SelectCategoria
          label="Ganho de Venda de Bem" helpId="parametrizarBem.categoriaGanho" categorias={receitas}
          valor={ganhoId} onChange={v => set('categoria_ganho_bem_id', v)}
        />
        <SelectCategoria
          label="Prestação (Principal)" helpId="parametrizarBem.categoriaPrestacao" categorias={despesas}
          valor={form.categoria_prestacao_id} onChange={v => set('categoria_prestacao_id', v)}
        />
        <SelectCategoria
          label="Taxa de Financiamento (Juros)" helpId="parametrizarBem.categoriaJuros" categorias={despesas}
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
