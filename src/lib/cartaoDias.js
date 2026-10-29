// Dia de fechamento e de vencimento do cartão de crédito: OBRIGATÓRIOS ao cadastrar/editar (sem
// valor padrão silencioso). Cartões antigos sem o dia seguem calculando a fatura com o
// FECHAMENTO_PADRAO (lib/fatura), com aviso em Editar Conta.

export const diaValido = (v) => {
  if (v === '' || v == null) return false
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31
}

// Mensagem de erro do formulário (null = ok).
export function erroDiasCartao({ closingDay, dueDay }) {
  const faltam = [!diaValido(closingDay) && 'fechamento', !diaValido(dueDay) && 'vencimento'].filter(Boolean)
  return faltam.length ? `Informe o dia de ${faltam.join(' e o de ')} do cartão (1 a 31).` : null
}

// Cartão gravado sem algum dos dias (aviso em Editar Conta).
export const cartaoSemDias = (a) => a?.type === 'credit' && (!diaValido(a.closingDay) || !diaValido(a.dueDay))
