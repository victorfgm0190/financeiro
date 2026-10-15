import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import SearchableSelect from './SearchableSelect'
import { filtrarCategoriasPorPerfil } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import { isTransferenciaEntrePerfis } from '../../lib/transferenciaPerfis'

// No perfil de onde o dinheiro SAI é despesa, no que ENTRA é receita.
// Só ordena (seções do SearchableSelect) — a lista de categorias e o que se grava não mudam.
const SECOES_SAIDA = [{ key: 'expense', label: 'DESPESAS (saída)' }, { key: 'income', label: 'RECEITAS (entrada)' }]
const SECOES_ENTRADA = [SECOES_SAIDA[1], SECOES_SAIDA[0]]
function buildCatOptsPorSentido(categories, sentido) {
  const primeiro = sentido === 'saida' ? 'expense' : 'income'
  return categories.map(c => ({
    id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null,
    // 'both' (despesa e receita) fica no bloco do sentido.
    section: c.type === 'both' ? primeiro : (c.type === 'income' ? 'income' : 'expense'),
  }))
}

// Bloco "Transferência entre perfis": categoria da movimentação na visão do CNPJ e na do CPF.
// Só renderiza quando origem e destino são de perfis diferentes (isTransferenciaEntrePerfis);
// quem usa decide limpar os campos quando o bloco some.
export default function TransferenciaPerfisCategorias({ fromAccount, toAccount, categoriaCnpjId, categoriaCpfId, onChangeCnpj, onChangeCpf }) {
  const { categories, profiles, categoryGroupOrder } = useApp()
  const visivel = isTransferenciaEntrePerfis(fromAccount, toAccount)
  const fromProfileId = fromAccount?.profileId || null
  const toProfileId = toAccount?.profileId || null
  // Sentido de cada visão (perfil 'pj' = CNPJ, mesma regra dos Relatórios). Origem PJ → o CNPJ é
  // a saída; senão o CNPJ é o destino (entrada). O CPF é sempre o lado oposto.
  const fromIsPj = (profiles || []).find(p => p.id === fromProfileId)?.type === 'pj'
  const toIsPj = (profiles || []).find(p => p.id === toProfileId)?.type === 'pj'
  const sentidoCnpj = fromIsPj || !toIsPj ? 'saida' : 'entrada'
  const sentidoCpf = sentidoCnpj === 'saida' ? 'entrada' : 'saida'
  // Cada dropdown filtra pelo SEU perfil (independe do chip do topo).
  const perfilCnpjId = sentidoCnpj === 'saida' ? fromProfileId : toProfileId
  const perfilCpfId = sentidoCnpj === 'saida' ? toProfileId : fromProfileId
  const catOptsCnpj = useMemo(
    () => buildCatOptsPorSentido(ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilCnpjId, [categoriaCnpjId]), categoryGroupOrder), sentidoCnpj),
    [categories, perfilCnpjId, categoriaCnpjId, sentidoCnpj, categoryGroupOrder]
  )
  const catOptsCpf = useMemo(
    () => buildCatOptsPorSentido(ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilCpfId, [categoriaCpfId]), categoryGroupOrder), sentidoCpf),
    [categories, perfilCpfId, categoriaCpfId, sentidoCpf, categoryGroupOrder]
  )

  if (!visivel) return null
  return (
    <div className="p-3 bg-surface-2 border border-borda-forte rounded-lg space-y-3">
      <p className="text-xs font-medium text-texto-2 flex items-center gap-1.5">
        🔁 Transferência entre perfis — categorize a movimentação em cada visão (opcional)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Categoria no CNPJ</label>
          <SearchableSelect
            options={catOptsCnpj}
            preserveGroupOrder
            sections={sentidoCnpj === 'saida' ? SECOES_SAIDA : SECOES_ENTRADA}
            value={categoriaCnpjId}
            onChange={onChangeCnpj}
            placeholder="Sem categoria"
            ungroupedLast
            ungroupedLabel="Sem grupo"
          />
        </div>
        <div>
          <label className="label">Categoria no CPF</label>
          <SearchableSelect
            options={catOptsCpf}
            preserveGroupOrder
            sections={sentidoCpf === 'saida' ? SECOES_SAIDA : SECOES_ENTRADA}
            value={categoriaCpfId}
            onChange={onChangeCpf}
            placeholder="Sem categoria"
            ungroupedLast
            ungroupedLabel="Sem grupo"
          />
        </div>
      </div>
      <p className="text-xs text-texto-3 leading-relaxed">
        Opcional — usado em Relatórios e KPIs quando um perfil está selecionado: a saída
        do perfil entra como despesa e a entrada como receita, na categoria da respectiva visão.
      </p>
    </div>
  )
}
