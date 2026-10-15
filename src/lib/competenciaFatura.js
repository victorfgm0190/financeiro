// Plausibilidade da competência (fatura YYYY-MM) de um gasto de cartão.
//
// Bug de 15/10/2026: a fatura "fatura-fechada-final 5060-outubro2026" foi gravada como 2024-10. O
// select "Mês de Referência" lista 24 meses para trás, e a escolha do usuário vence o mês do
// cabeçalho do arquivo — "Outubro" virou o primeiro outubro da lista. Nada barrava uma competência
// a quase dois anos da data da compra.
//
// Import com extensão .js: o módulo também é carregado pelo Node ESM (api/integridade.js).

export const LIMITE_MESES_COMPETENCIA = 12

const YM_RE = /^\d{4}-\d{2}$/

export const ymDeData = (d) => {
  const s = String(d || '').slice(0, 7)
  return YM_RE.test(s) ? s : null
}

// b − a, em meses.
export function mesesEntreYM(a, b) {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

// Distância (em meses, com sinal: fatura − compra) entre a fatura e a data da compra. Com a data
// ORIGINAL da compra (dateCartao), a parcela N começa N−1 faturas antes — desconta-se isso. Sem
// ela, a `date` da parcela já foi deslocada para perto da fatura e é comparada direto.
// Retorna null quando falta a fatura ou a data.
export function distanciaCompetencia({ faturaMY, dateCartao, date, installmentNum }) {
  if (!YM_RE.test(faturaMY || '')) return null
  const compra = ymDeData(dateCartao)
  if (compra) {
    const n = Number(installmentNum) > 1 ? Number(installmentNum) - 1 : 0
    return mesesEntreYM(compra, faturaMY) - n
  }
  const data = ymDeData(date)
  return data ? mesesEntreYM(data, faturaMY) : null
}

export function competenciaPlausivel(args, limite = LIMITE_MESES_COMPETENCIA) {
  const d = distanciaCompetencia(args)
  return d == null || Math.abs(d) <= limite
}

const rotulo = (ym) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`

// Linhas cuja competência está fora do intervalo plausível. `linhas` no formato da importação
// ({ faturaMonthYear, _dateCartao|dateCartao, date, _installment?.num|installmentNum, description }).
export function competenciasImplausiveis(linhas, limite = LIMITE_MESES_COMPETENCIA) {
  const out = []
  for (const r of linhas || []) {
    const args = {
      faturaMY: r.faturaMonthYear,
      dateCartao: r._dateCartao || r.dateCartao,
      date: r.date,
      installmentNum: r._installment?.num ?? r.installmentNum,
    }
    const d = distanciaCompetencia(args)
    if (d != null && Math.abs(d) > limite) out.push({ linha: r, distancia: d })
  }
  return out
}

// Mensagem de bloqueio (null quando está tudo plausível).
export function mensagemCompetenciaImplausivel(problemas, limite = LIMITE_MESES_COMPETENCIA) {
  if (!problemas.length) return null
  const ex = problemas.slice(0, 3).map(({ linha, distancia }) =>
    `"${linha.description || ''}" (compra ${String(linha._dateCartao || linha.dateCartao || linha.date || '').slice(0, 10)} → fatura ${rotulo(linha.faturaMonthYear)}, ${Math.abs(distancia)} meses)`)
  const mais = problemas.length > 3 ? ` e mais ${problemas.length - 3}` : ''
  return `Competência implausível: ${problemas.length} lançamento(s) a mais de ${limite} meses da data da compra — ${ex.join('; ')}${mais}. Confira o Mês de Referência.`
}

// Mês escolhido × mês do cabeçalho do arquivo (Itaú). null quando batem ou não há cabeçalho.
export function divergenciaMesArquivo(referencia, mesArquivo) {
  if (!YM_RE.test(referencia || '') || !YM_RE.test(mesArquivo || '') || referencia === mesArquivo) return null
  return `O arquivo é da fatura ${rotulo(mesArquivo)}, mas o Mês de Referência selecionado é ${rotulo(referencia)}.`
}
