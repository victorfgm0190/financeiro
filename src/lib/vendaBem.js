// Venda simples de um bem: as contas, sem banco. Usada na prévia da tela e na gravação (api/bem/[id]/vender.js).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// O que o bem vale nos livros: o saldo; bem sem movimentação no app tem saldo 0 e só existe pelo valor
// digitado (nota fiscal ou valor pago, conforme o método escolhido no bem).
export function saldoContabilDoBem({ balance, patrimonio_use_method: metodo, valor_nota_fiscal: nf, valor_pago_manual: pago }) {
  const saldo = r2(balance)
  if (saldo !== 0) return saldo
  const digitado = metodo === 'nota_fiscal' ? nf : pago
  return digitado == null ? 0 : r2(digitado)
}

// Ganho (+) ou perda (−) = valor recebido − custos − saldo contábil. Quitar a dívida com a venda soma a
// quitação ao saldo do bem, como qualquer pagamento de parcela.
export function resultadoDaVenda({ valor, custos = 0, saldoContabil, quitacao = 0 }) {
  return r2(r2(valor) - r2(custos) - r2(saldoContabil) - r2(quitacao))
}
