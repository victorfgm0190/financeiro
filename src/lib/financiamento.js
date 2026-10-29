// Rateio de um pagamento de parcela de financiamento entre principal e juros.
//
// Espelha `calcularRateio` de api/_bem.js: o principal é quitado PRIMEIRO, os juros ficam com a
// sobra, e o que faltar de juros vira desvio. Serve só para o preview em tempo real — o valor
// gravado é sempre o que o backend calcula.
//
// Mora em src/lib/ e não em components/Patrimonio/ pelo mesmo motivo de patrimonio.js: dois
// painéis precisam dela (o modal de pagar do Patrimônio e o de Contas a Pagar), e um componente
// de Agendamentos importando de components/Patrimonio/ seria dependência cruzada entre painéis.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

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
  // Pagamento abaixo do principal é legítimo: a parcela fica 'partial' e o backend recalcula o
  // rateio sobre o acumulado no próximo aporte. Tudo vai para o principal, nada para juros.
  return { principalPago: pago, jurosPago: 0, desvioJuros: jurosPrev }
}

// ─── Quitação com desconto por antecipação ───────────────────────────────────────────────────
// Pagou o PRINCIPAL inteiro e o banco cobrou juros menores (pagamento antes do vencimento):
// marcado como quitação, a parcela fica PAGA e a diferença dos juros vira "Desconto por
// antecipação" (informativo) — nunca juros em falta nem saldo restante. Sem a marcação (ou com
// principal faltando) vale o rateio de sempre: parcial com o que falta em aberto.
// acumulado: total pago na parcela (anteriores + este). → { principalPago, jurosPago,
// desvioJuros, desconto, status: 'paid'|'partial', saldoRestante }
export function rateioComQuitacao(acumulado, principalProvisioned, jurosProvisioned, { quitar = false } = {}) {
  const r = calcularRateio(acumulado, principalProvisioned, jurosProvisioned)
  const totalPrev = round2((Number(principalProvisioned) || 0) + (Number(jurosProvisioned) || 0))
  const totalPago = round2(r.principalPago + r.jurosPago)
  const principalCompleto = r.principalPago >= round2(Number(principalProvisioned) || 0)
  if (totalPago >= totalPrev) return { ...r, desconto: 0, status: 'paid', saldoRestante: 0 }
  if (quitar && principalCompleto) {
    return { ...r, desvioJuros: 0, desconto: round2(totalPrev - totalPago), status: 'paid', saldoRestante: 0 }
  }
  return { ...r, desconto: 0, status: 'partial', saldoRestante: round2(totalPrev - totalPago) }
}

// "Quitar com desconto" vem marcado quando o pagamento é ANTES do vencimento (datas YYYY-MM-DD).
export const quitarPorPadrao = (dataPagamento, vencimento) =>
  !!dataPagamento && !!vencimento && String(dataPagamento).slice(0, 10) < String(vencimento).slice(0, 10)

// O pagamento pode virar quitação com desconto? (abaixo do total, mas cobre o principal)
export function podeQuitarComDesconto(acumulado, principalProvisioned, jurosProvisioned) {
  const r = calcularRateio(acumulado, principalProvisioned, jurosProvisioned)
  const totalPrev = round2((Number(principalProvisioned) || 0) + (Number(jurosProvisioned) || 0))
  return r.principalPago >= round2(Number(principalProvisioned) || 0) && round2(r.principalPago + r.jurosPago) < totalPrev
}

// ─── Saldo devedor e resumo do financiamento ─────────────────────────────────────────────────
// Conta de dívida de financiamento (criada por /api/financiamento/criar: id 'acc_divida_…').
export const ehContaDeFinanciamento = (a) => a?.type === 'liability' && String(a.id || '').startsWith('acc_divida')

// Saldo devedor do PRINCIPAL = principal previsto − principal já amortizado (é o que a conta de
// dívida guarda em balance, com sinal negativo). Parcelas: as do GET /api/financiamento/[id].
// → { saldoPrincipal, totalAPagar, quitadas, total, valorPago, principalAmortizado, jurosPagos,
//     desconto, proxima }
export function resumoFinanciamento(parcelas = []) {
  const soma = (f) => round2(parcelas.reduce((s, p) => s + (Number(f(p)) || 0), 0))
  const abertas = parcelas.filter(p => p.status !== 'paid')
  return {
    saldoPrincipal: soma(p => (p.principal_provisioned || 0) - (p.principal_pago || 0)),
    totalAPagar: round2(abertas.reduce((s, p) => s + Math.max(0, (p.total_provisioned || 0) - (p.total_pago || 0)), 0)),
    quitadas: parcelas.length - abertas.length,
    total: parcelas.length,
    valorPago: soma(p => p.total_pago),
    principalAmortizado: soma(p => p.principal_pago),
    jurosPagos: soma(p => p.juros_pago),
    desconto: soma(p => p.desconto_antecipacao),
    proxima: [...abertas].sort((a, b) => (a.numero || 0) - (b.numero || 0))[0] || null,
  }
}
