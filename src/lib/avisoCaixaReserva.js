// Aviso de caixa da conta de reserva. Só cálculo, para a tela de Reservas e o Painel.
//   1) Funções negativas: gastaram mais do que tinham, então as demais mostram mais do que existe na conta.
//   2) Projeção: saldo real da conta − saídas previstas das funções positivas + entradas previstas, por data.
export const DIAS_CAIXA_PADRAO = 60

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmtBR = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function somarDiasIso(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + dias))
  return dt.toISOString().slice(0, 10)
}

export const diasDoCaixa = (settings) => {
  const n = Number(settings?.reservaDiasCaixa)
  return Number.isInteger(n) && n > 0 ? n : DIAS_CAIXA_PADRAO
}

// funcoes: [{ id, name, saldo }] da conta. previsoes: { [functionId]: previsoesDasFuncoes }, já na janela.
export function avisosDaConta({ saldoConta, funcoes = [], previsoes = {} }) {
  const negativas = funcoes.filter(f => r2(f.saldo) < 0).map(f => ({ id: f.id, nome: f.name, saldo: r2(f.saldo) }))
  const soma = r2(negativas.reduce((s, f) => s - f.saldo, 0))

  // Função negativa não tem dinheiro para sair: o resgate dela já é a falta do aviso 1.
  const eventos = []
  for (const f of funcoes) {
    const positiva = r2(f.saldo) >= 0
    for (const p of previsoes[f.id] || []) {
      if (p.tipo === 'deposito') eventos.push({ date: p.date, valor: p.amount, label: p.label })
      else if (positiva) eventos.push({ date: p.date, valor: -p.amount, label: p.label })
    }
  }
  // No mesmo dia, a entrada conta antes da saída.
  eventos.sort((a, b) => a.date.localeCompare(b.date) || b.valor - a.valor)
  let caixa = r2(saldoConta)
  let falta = null
  for (const e of eventos) {
    caixa = r2(caixa + e.valor)
    if (caixa < 0 && e.valor < 0) {
      falta = { data: e.date, saida: e.label, faltam: r2(-caixa) }
      break
    }
  }
  const textoNegativas = negativas.length
    ? `Funções negativas somam ${fmtBR(soma)}: as demais funções têm ${fmtBR(soma)} a mais do que existe na conta.`
    : null
  const textoFalta = falta
    ? `Em ${diaMes(falta.data)} a conta não terá dinheiro para ${falta.saida}, faltam ${fmtBR(falta.faltam)}.`
    : null
  return {
    negativas,
    somaNegativas: soma,
    falta,
    textoNegativas,
    textoFalta,
    temAviso: !!(textoNegativas || textoFalta),
    // Dispensar vale até a situação mudar: a marca guarda exatamente o que estava sendo avisado.
    assinatura: JSON.stringify([negativas.map(n => [n.id, n.saldo]), falta && [falta.data, falta.saida, falta.faltam]]),
  }
}
