// "VALOR PAGO" × "DESPESA REAL" nos relatórios por categoria (P2: o lançamento tem o valor que saiu
// da conta; a conta fica na composição). Em Despesa real o lançamento de contrato é desdobrado:
//   aluguel    → base − bonificação (e ajustes) na categoria dele; créditos abatidos (negativos)
//                na linha "Créditos com o proprietário";
//   condomínio → itens do inquilino na categoria dele; itens do proprietário (positivos) na linha
//                "Créditos com o proprietário".
// Crédito gerado e abatido no período se anulam; a soma das partes é sempre o valor pago.

export const CREDITO_PROPRIETARIO_ID = '__credito_proprietario'
export const CATEGORIA_CREDITO_PROPRIETARIO = {
  id: CREDITO_PROPRIETARIO_ID, name: 'Créditos com o proprietário', icon: '', type: 'expense', color: '#9AA3B5',
}
export const MODOS_VALOR = [
  { value: 'real', label: 'Despesa real', title: 'Aluguel sem os créditos do proprietário; condomínio só com os itens do inquilino' },
  { value: 'pago', label: 'Valor pago', title: 'O valor que saiu da conta, como no extrato' },
]
export const MODO_VALOR_PADRAO = 'real'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const doProprietario = (i) => i.tipo === 'credito' || i.responsavel === 'proprietario'

// Repasse de administradora aberto pela composição (relatórios em "visão por composição"): as partes
// sem categoria (saldo anterior, diferença, dedução sem categoria) vão para esta linha.
export const ADMINISTRADORA_ID = '__administradora'
export const CATEGORIA_ADMINISTRADORA = {
  id: ADMINISTRADORA_ID, name: 'Administradora (saldo e sem categoria)', icon: '', type: 'both', color: '#9AA3B5',
}
export const categoriaEspecial = (id) => (id === CREDITO_PROPRIETARIO_ID ? CATEGORIA_CREDITO_PROPRIETARIO : id === ADMINISTRADORA_ID ? CATEGORIA_ADMINISTRADORA : null)

// Partes do recebimento (lib/contratos/saldoRepasse.js composicaoDoRecebimento) → lançamentos.
export function lancamentosDoRepasse(tx, partes) {
  return (partes || []).filter(p => Math.abs(Number(p.valor) || 0) > 0.004).map((p, k) => ({
    ...tx, id: `${tx.id}:rep${k}`, type: p.valor >= 0 ? 'income' : 'expense', amount: r2(Math.abs(p.valor)),
    categoryId: p.categoria_id || (p.tipo === 'aluguel' ? tx.categoryId : ADMINISTRADORA_ID), description: p.descricao || tx.description,
    // Filtro por categoria dos relatórios: a parte segue a categoria do lançamento de origem.
    _composicaoDe: tx.id, _categoriaFiltro: tx.categoryId,
  }))
}

export function partesDaComposicao(tx) {
  // Repasse de administradora: linha única por padrão (só abre na "visão por composição").
  if (tx?.composicao?.tipo === 'repasse') return null
  const itens = tx?.composicao?.itens
  if (!tx?.contratoId || !Array.isArray(itens) || !itens.length) return null
  const proprio = r2(itens.filter(i => !doProprietario(i)).reduce((a, i) => a + Number(i.valor), 0))
  const credito = r2(Number(tx.amount) - proprio)
  if (Math.abs(credito) < 0.005) return null
  return [
    { ...tx, id: `${tx.id}:real`, amount: proprio, _composicaoDe: tx.id },
    { ...tx, id: `${tx.id}:cred`, amount: credito, categoryId: CREDITO_PROPRIETARIO_ID, _composicaoDe: tx.id },
  ]
}

// Lista de lançamentos no modo escolhido ('pago' devolve a mesma lista). abrirRepasse (tx → partes
// | null): "visão por composição" dos repasses de administradora; sem ela, o repasse é linha única.
export function lancamentosNoModo(transactions, modo = MODO_VALOR_PADRAO, { abrirRepasse = null } = {}) {
  if (modo !== 'real' && !abrirRepasse) return transactions
  const out = []
  for (const tx of transactions || []) {
    const rep = abrirRepasse ? abrirRepasse(tx) : null
    if (rep) { out.push(...lancamentosDoRepasse(tx, rep)); continue }
    const partes = modo === 'real' ? partesDaComposicao(tx) : null
    if (partes) out.push(...partes)
    else out.push(tx)
  }
  return out
}
