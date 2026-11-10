import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import SearchableSelect from './SearchableSelect'
import ProfileBadge from './ProfileBadge'
import { filtrarCategoriasPorPerfil } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import { isTransferenciaEntrePerfis } from '../../lib/transferenciaPerfis'
import { perfilDaConta } from '../../lib/perfilConta'

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

// Rótulo de um lado: "Categoria em <perfil> (CPF|CNPJ)", com o selo do perfil.
function RotuloLado({ conta, profiles, testid }) {
  const { perfil, nomeCompleto } = perfilDaConta(conta, profiles)
  const tipo = perfil?.type === 'pj' ? 'CNPJ' : 'CPF'
  return (
    <label className="label flex flex-wrap items-center gap-1.5" data-testid={testid}>
      <span>Categoria em {nomeCompleto} ({tipo})</span>
      <ProfileBadge account={conta} />
    </label>
  )
}

// Bloco "Transferência entre perfis": a categoria da movimentação no perfil da conta de ORIGEM
// (esquerda — saída) e no perfil da conta de DESTINO (direita — entrada). Cada lado lista só as
// categorias do seu perfil. Grava por lado (categoria_origem_id / categoria_destino_id — regra em
// src/lib/transferenciaPerfis.js). Só aparece quando origem e destino são de perfis diferentes;
// quem usa decide limpar os campos quando o bloco some.
export default function TransferenciaPerfisCategorias({ fromAccount, toAccount, categoriaOrigemId, categoriaDestinoId, onChangeOrigem, onChangeDestino }) {
  const { categories, profiles, categoryGroupOrder } = useApp()
  const visivel = isTransferenciaEntrePerfis(fromAccount, toAccount)
  const perfilOrigemId = fromAccount?.profileId || null
  const perfilDestinoId = toAccount?.profileId || null
  const catOptsOrigem = useMemo(
    () => buildCatOptsPorSentido(ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilOrigemId, [categoriaOrigemId]), categoryGroupOrder), 'saida'),
    [categories, perfilOrigemId, categoriaOrigemId, categoryGroupOrder]
  )
  const catOptsDestino = useMemo(
    () => buildCatOptsPorSentido(ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilDestinoId, [categoriaDestinoId]), categoryGroupOrder), 'entrada'),
    [categories, perfilDestinoId, categoriaDestinoId, categoryGroupOrder]
  )

  if (!visivel) return null
  return (
    <div className="p-3 bg-surface-2 border border-borda-forte rounded-lg space-y-3" data-testid="transferencia-perfis">
      <p className="text-xs font-medium text-texto-2 flex items-center gap-1.5">
        🔁 Transferência entre perfis — categorize a movimentação em cada perfil (opcional)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div data-testid="lado-origem">
          <RotuloLado conta={fromAccount} profiles={profiles} testid="rotulo-origem" />
          <SearchableSelect
            options={catOptsOrigem}
            preserveGroupOrder
            sections={SECOES_SAIDA}
            value={categoriaOrigemId}
            onChange={onChangeOrigem}
            placeholder="Sem categoria"
            ungroupedLast
            ungroupedLabel="Sem grupo"
          />
        </div>
        <div data-testid="lado-destino">
          <RotuloLado conta={toAccount} profiles={profiles} testid="rotulo-destino" />
          <SearchableSelect
            options={catOptsDestino}
            preserveGroupOrder
            sections={SECOES_ENTRADA}
            value={categoriaDestinoId}
            onChange={onChangeDestino}
            placeholder="Sem categoria"
            ungroupedLast
            ungroupedLabel="Sem grupo"
          />
        </div>
      </div>
      <p className="text-xs text-texto-3 leading-relaxed">
        Opcional — usado em Relatórios e KPIs quando um perfil está selecionado: no perfil de origem
        a transferência entra como despesa, e no perfil de destino como receita, na categoria de cada um.
      </p>
    </div>
  )
}
