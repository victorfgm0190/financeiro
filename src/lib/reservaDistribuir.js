// "Saldo a distribuir" da conta de reserva = saldo real − Σ saldos das funções (pode ser negativo).
// A distribuição grava AJUSTES nas funções (reserve_adjustments): não move dinheiro entre contas
// e não conta em nenhum total. Nada obriga a distribuir; parcial é permitido.

const r2 = (n) => Math.round(n * 100) / 100

export const OBS_DISTRIBUICAO = 'Distribuição do saldo a distribuir'

export const saldoADistribuir = (saldoReal, saldos) => r2((Number(saldoReal) || 0) - saldos.reduce((s, v) => s + (Number(v) || 0), 0))

// Rateio proporcional ao saldo exibido, só entre funções com saldo POSITIVO; centavos na maior.
// fns: [{ id, saldo }] → { [id]: valor } (somando exatamente `total`). Sem base positiva → {}.
export function ratearProporcional(fns, total) {
  const base = fns.filter(f => f.saldo > 0).sort((a, b) => b.saldo - a.saldo)
  const soma = base.reduce((s, f) => s + f.saldo, 0)
  const cents = Math.round(total * 100)
  if (!base.length || !cents) return {}
  const out = {}
  let usado = 0
  for (const f of base) {
    const v = Math.trunc(cents * f.saldo / soma)
    out[f.id] = v
    usado += v
  }
  out[base[0].id] += cents - usado
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0).map(([id, v]) => [id, v / 100]))
}

// Erro que impede confirmar (null = ok). fns: [{ id, nome, saldo }]; valores: { [id]: número }.
//   • a soma tem o MESMO sinal do saldo a distribuir e não passa dele (parcial pode);
//   • nenhuma função fica negativa por causa da distribuição.
export function erroDistribuicao(fns, valores, aDistribuir) {
  const itens = fns.map(f => ({ ...f, v: r2(Number(valores[f.id]) || 0) })).filter(f => f.v !== 0)
  if (!itens.length) return 'Informe quanto distribuir em ao menos uma função.'
  const soma = r2(itens.reduce((s, f) => s + f.v, 0))
  if (!aDistribuir) return 'Não há saldo a distribuir nesta conta.'
  if (Math.sign(soma) !== Math.sign(aDistribuir) || Math.abs(soma) > Math.abs(aDistribuir) + 0.001) {
    return `A soma (${soma.toFixed(2).replace('.', ',')}) precisa estar entre 0 e o saldo a distribuir (${aDistribuir.toFixed(2).replace('.', ',')}).`
  }
  const negativa = itens.find(f => r2(f.saldo + f.v) < 0 && f.v < 0)
  if (negativa) return `${negativa.nome} ficaria negativa.`
  return null
}
