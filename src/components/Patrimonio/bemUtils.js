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

// Transferências que o modal de entrada à vista pode oferecer para um bem: as que CREDITARAM a
// conta dele (`toAccountId === contaId`).
//
// O recorte por `toAccountId` é o mesmo que a correção do endpoint assumiu — essas transferências
// já somaram ao saldo do bem quando foram criadas, então registrar a entrada apenas as vincula,
// sem mexer no saldo. Oferecer uma transferência que creditou OUTRA conta quebraria essa premissa:
// o saldo do bem ficaria menor que a entrada declarada.
//
// As já vinculadas (`bemId` preenchido) CONTINUAM na lista, marcadas com um selo e desmarcadas
// por padrão: reprocessá-las é como se completa o favorecido/categoria de uma entrada registrada
// antes desses campos existirem. Escondê-las tornava esse conserto impossível pela UI.
export function transferenciasElegiveisEntrada(transacoes, contaId) {
  return (transacoes || []).filter(
    t => t.type === 'transfer' && t.toAccountId === contaId,
  )
}

// Monta as edições a aplicar (via updateTransaction) nas transferências escolhidas ao registrar
// uma entrada à vista.
//
// REGRA: preenche apenas o que está EM BRANCO no lançamento. O que já foi classificado à mão
// nunca é sobrescrito — registrar a entrada de um bem não é motivo para reescrever a categoria
// ou o favorecido que alguém escolheu antes. Campo vazio no modal também é omitido (não apaga o
// que existe), e transferência sem nenhuma mudança efetiva sai da lista.
//
// Este espelho tem que casar EXATAMENTE com o `COALESCE(category_id, $3)` do endpoint: se aqui a
// categoria nova entrasse por cima de uma existente, o sync diferencial — que compara contra o
// estado React — reenviaria ela por cima da que o banco preservou.
//
// `bemId` marca a transferência como vinculada. O backend grava isso em lancamentos.bem_id, mas
// o estado React não recarrega sozinho — sem espelhar, o selo "Já vinculada" só apareceria
// depois de um reload.
export function montarAjustesEntrada({ transacoes, escolhidas, favorecido, bemId = null }) {
  const payee = (favorecido || '').trim()
  return transacoes
    .filter(t => t.id in escolhidas)
    .map(t => {
      const mudancas = {}
      if (payee && !t.payee) mudancas.payee = payee
      if (escolhidas[t.id] && !t.categoryId) mudancas.categoryId = escolhidas[t.id]
      // Só quando o vínculo muda de fato — reprocessar uma transferência já deste bem não
      // precisa gerar update.
      if (bemId && t.bemId !== bemId) mudancas.bemId = bemId
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
