const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Datas do backend chegam como 'YYYY-MM-DD'. new Date(iso) interpretaria como UTC e voltaria
// um dia no fuso do Brasil — daí formatar direto da string.
export function fmtData(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return `${d}/${MESES[Number(m) - 1] || '?'}/${y}`
}

export const hojeIso = () => new Date().toISOString().slice(0, 10)

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Espelha calcularRateio de api/_bem.js: principal primeiro, juros com a sobra, resto vira desvio.
// Usado só para o preview em tempo real — o valor gravado é sempre o que o backend calcula.
export function calcularRateio(valorPago, principalProvisioned, jurosProvisioned) {
  const pago = round2(Number(valorPago) || 0)
  const principalPrev = round2(Number(principalProvisioned) || 0)
  const jurosPrev = round2(Number(jurosProvisioned) || 0)

  if (pago >= principalPrev) {
    const sobra = round2(pago - principalPrev)
    const jurosPago = Math.min(sobra, jurosPrev)
    return {
      principalPago: principalPrev,
      jurosPago: round2(jurosPago),
      desvioJuros: round2(jurosPrev - jurosPago),
    }
  }
  return { principalPago: pago, jurosPago: 0, desvioJuros: jurosPrev }
}

// Status visual da parcela: 'paid' e 'partial' vêm do backend; 'vencida' é derivado da data.
export function statusParcela(parcela) {
  if (parcela.status === 'paid') return 'paga'
  if (parcela.data_vencimento && parcela.data_vencimento < hojeIso()) return 'vencida'
  if (parcela.status === 'partial') return 'parcial'
  return 'aberta'
}

// Monta as edições a aplicar (via updateTransaction) nas transferências escolhidas ao registrar
// uma entrada à vista. Campo vazio é OMITIDO — o modal não pode sobrescrever com "nada" o
// favorecido ou a categoria que o lançamento já tinha. Transferência sem nenhuma mudança
// efetiva não entra na lista, para não disparar update inútil.
//
// A categoria o backend já grava no lançamento (registrar-entrada faz
// `category_id = COALESCE($3, category_id)`); espelhá-la aqui é o que impede o sync
// diferencial — que compara contra o estado React — de reenviar a categoria antiga depois.
export function montarAjustesEntrada({ transacoes, escolhidas, favorecido }) {
  const payee = (favorecido || '').trim()
  return transacoes
    .filter(t => t.id in escolhidas)
    .map(t => {
      const mudancas = {}
      if (payee) mudancas.payee = payee
      if (escolhidas[t.id]) mudancas.categoryId = escolhidas[t.id]
      return { id: t.id, mudancas }
    })
    .filter(a => Object.keys(a.mudancas).length > 0)
}

export const ESTILO_STATUS = {
  paga: { label: 'PAGO', texto: 'text-receita', fundo: 'bg-emerald-500/10', borda: 'border-emerald-500/20' },
  parcial: { label: 'PARCIAL', texto: 'text-amber-400', fundo: 'bg-amber-500/10', borda: 'border-amber-500/20' },
  vencida: { label: 'VENCIDA', texto: 'text-despesa', fundo: 'bg-red-500/10', borda: 'border-red-500/20' },
  aberta: { label: 'ABERTA', texto: 'text-gray-400', fundo: 'bg-gray-800/60', borda: 'border-gray-800' },
}
