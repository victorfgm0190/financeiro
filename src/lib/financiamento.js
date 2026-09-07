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
