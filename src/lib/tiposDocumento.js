// Tipos de documento: regras PURAS de exibição, filtro e formulário. Nada aqui grava no banco.
//
// resolverTipoDocumento(item, tipos) decide o que a coluna "Doc." mostra:
//   1. tipoDocumentoId preenchido → o tipo gravado (vence qualquer fallback, inclusive o CC);
//   2. agendamento/lançamento de fatura de cartão → "Fatura de Cartão" (o tipo sistema CC);
//   3. evento sintético de envelope → ENV;
//   4. resgate de reserva → RES;
//   5. senão → null ("—").
// Os fallbacks NUNCA são gravados: um registro antigo continua NULL no banco.

export const SIGLA_MAX = 4
export const NATUREZAS = [
  { id: 'pagar', label: 'A pagar' },
  { id: 'receber', label: 'A receber' },
  { id: 'ambos', label: 'Ambos' },
]
// Valor especial do filtro multi-select / da ação em massa.
export const SEM_TIPO = '__sem_tipo'

const FALLBACK_CC = { id: null, sigla: 'CC', nome: 'Fatura de Cartão', cor: '#8b5cf6' }
const FALLBACK_ENV = { id: 'ENV', sigla: 'ENV', nome: 'Envelope (projeção do restante do ciclo)', cor: '#64748b' }
const FALLBACK_RES = { id: 'RES', sigla: 'RES', nome: 'Resgate de reserva', cor: '#14b8a6' }

const idDoItem = (item) => item?.tipoDocumentoId ?? item?.tipo_documento_id ?? null

// Fatura de cartão: agendamento de pagamento de fatura, lançamento gerado por ele, pagamento de
// cartão, ou linha que o chamador já marcou (_faturaCartao).
export function ehFaturaCartao(item) {
  if (!item) return false
  if (item._faturaCartao) return true
  if (item.tipo === 'pagamento_fatura') return true
  // Legado "Pagamento Fatura" (sem tipo; _gerencialKey terminando em _payment) — mesma regra de
  // seriesKeyOf em agendamentosGrupos.js.
  if (!item.tipo && String(item.overrides?._gerencialKey || '').endsWith('_payment')) return true
  if (item.type === 'credit_payment') return true
  return false
}
export function ehEnvelope(item) {
  return !!item?._envelope
}
export function ehResgateReserva(item) {
  if (!item) return false
  if (item._resgate) return true
  if (item.tipo === 'resgate_reserva') return true
  return typeof item._key === 'string' && item._key.includes('_resg_')
}

// Itens que não são registros do banco (envelope projetado, resgate previsto 'sch:<id>@<data>'):
// não recebem tipo, nem individualmente nem em massa.
export function ehSintetico(item) {
  if (!item) return true
  if (item._envelope || item._sintetico) return true
  const id = String(item.id ?? '')
  return !id || id.startsWith('sch:') || id.startsWith('env_')
}

// Tipo sistema "Fatura de Cartão" do cadastro (sigla CC), para o fallback usar a cor/nome de lá.
function tipoCartao(tipos) {
  return (tipos || []).find(t => t.sistema && t.sigla === 'CC')
    || (tipos || []).find(t => t.sigla === 'CC')
    || null
}

// → { id, sigla, nome, cor, fallback: boolean } | null
export function resolverTipoDocumento(item, tipos = []) {
  if (!item) return null
  const id = idDoItem(item)
  if (id) {
    const t = (tipos || []).find(x => x.id === id)
    // Id gravado mas o tipo sumiu do cadastro (excluído em outra aba): mostra "?" em vez de "—",
    // para não parecer que o registro está sem tipo.
    return t ? { ...t, fallback: false } : { id, sigla: '?', nome: 'Tipo removido do cadastro', cor: null, fallback: false }
  }
  if (ehFaturaCartao(item)) {
    const cc = tipoCartao(tipos)
    return cc ? { ...cc, fallback: true } : { ...FALLBACK_CC, fallback: true }
  }
  if (ehEnvelope(item)) return { ...FALLBACK_ENV, fallback: true }
  if (ehResgateReserva(item)) return { ...FALLBACK_RES, fallback: true }
  return null
}

// Chave do filtro: o id do tipo resolvido (CC do fallback casa com o id do tipo sistema), 'ENV',
// 'RES' ou SEM_TIPO.
export function chaveFiltroTipo(item, tipos = []) {
  const r = resolverTipoDocumento(item, tipos)
  if (!r) return SEM_TIPO
  return r.id || 'CC'
}

// Filtro multi-select: Set vazio = sem filtro.
export function filtrarPorTipoDocumento(itens, selecionados, tipos = []) {
  if (!selecionados || selecionados.size === 0) return itens
  return (itens || []).filter(it => selecionados.has(chaveFiltroTipo(it, tipos)))
}

// Ordem de exibição do cadastro.
export const ordenarTipos = (lista) => (lista || []).slice()
  .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome)))

// Natureza do formulário a partir do tipo da movimentação.
export function naturezaDoMovimento(tipoMov) {
  if (tipoMov === 'expense') return 'pagar'
  if (tipoMov === 'income') return 'receber'
  return null // transferência: todos
}

// Opções do select: ativos compatíveis com a natureza (despesa → pagar/ambos; receita →
// receber/ambos). O tipo JÁ gravado no registro entra sempre (mesmo inativo ou de outra natureza),
// para a edição nunca "perder" o valor só por abrir o formulário.
export function opcoesTipoDocumento(tipos, natureza, valorAtual = null) {
  const lista = (tipos || [])
    .filter(t => t.ativo !== false && (!natureza || t.natureza === 'ambos' || t.natureza === natureza))
  if (valorAtual && !lista.some(t => t.id === valorAtual)) {
    const atual = (tipos || []).find(t => t.id === valorAtual)
    if (atual) lista.push(atual)
  }
  return ordenarTipos(lista)
}

// Obrigatoriedade: só na CRIAÇÃO manual de despesa/receita. Edição (inclusive de registro antigo
// sem tipo) pode salvar vazio sem bloquear as outras alterações.
export function tipoDocumentoObrigatorio({ criando, tipoMov }) {
  return !!criando && (tipoMov === 'expense' || tipoMov === 'income')
}

// Sigla: maiúsculas, sem espaços, até 4.
export const normalizarSigla = (s) => String(s || '').replace(/\s+/g, '').toUpperCase().slice(0, SIGLA_MAX)

// Reordenação local (setas): devolve a lista de ids com `id` movido uma posição.
export function moverTipo(ids, id, direcao) {
  const i = ids.indexOf(id)
  const j = direcao === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = ids.slice()
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
// Arrastar: `id` passa a ocupar a posição de `alvoId`.
export function soltarTipo(ids, id, alvoId) {
  if (id === alvoId || !ids.includes(id) || !ids.includes(alvoId)) return ids
  const out = ids.filter(x => x !== id)
  out.splice(ids.indexOf(alvoId), 0, id)
  return out
}

// Linha do Fluxo de Caixa (computeFluxoCaixa / linhasFuturas) → o item que resolverTipoDocumento
// entende: o agendamento de origem, o lançamento (pagamento de cartão = transferência para conta
// de crédito → _faturaCartao), o envelope ou o resgate previsto. Provisório → null ("—").
export function itemDaLinhaFluxo(r, { txPorId, agPorId, contaPorId } = {}) {
  if (!r) return null
  if (r._envelope) return { _envelope: true }
  if ((typeof r._key === 'string' && r._key.includes('_resg_')) || r._etapaAPrevista) return { _resgate: true }
  if (r._scheduleId) return agPorId?.get(r._scheduleId) || null
  if (r.real || r._lancamento) {
    const tx = txPorId?.get(r._key)
    if (!tx) return null
    const destino = contaPorId?.get(tx.toAccountId)
    return { ...tx, _faturaCartao: tx.type === 'transfer' && destino?.type === 'credit' }
  }
  return null
}
