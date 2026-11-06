// Regras do tipo de bem Consórcio. PURO: quem chama lê os dados e grava o resultado.
// Antes da contemplação o bem é o DIREITO à carta: entra no PL pelo pago acumulado, e o saldo devedor
// informado pela administradora é compromisso, não dívida (não subtrai do PL).

export const SITUACOES = [
  { id: 'ativa', rotulo: 'Ativa' },
  { id: 'contemplada', rotulo: 'Contemplada' },
  { id: 'vendida', rotulo: 'Vendida' },
  { id: 'quitada', rotulo: 'Quitada' },
]
export const rotuloSituacao = (id) => SITUACOES.find(s => s.id === id)?.rotulo || id

export const MESES_CENARIOS = [12, 24, 30, 36, 48, 60]

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const parcelaDaCota = (c) => r2((Number(c.valor_parcela_cheia) || 0) * (Number(c.percentual_parcela) || 0) / 100)

export function totaisDasCotas(cotas = []) {
  const soma = (f) => r2(cotas.reduce((s, c) => s + (Number(f(c)) || 0), 0))
  const informadas = cotas.filter(c => c.parcelas_pagas_informadas != null)
  return {
    carta: soma(c => c.valor_carta),
    saldoDevedor: soma(c => c.saldo_devedor_informado),
    parcelaMensal: soma(parcelaDaCota),
    parcelasInformadas: informadas.length ? soma(c => c.parcelas_pagas_informadas) : null,
    valorPagoInformado: cotas.some(c => c.valor_pago_informado != null) ? soma(c => c.valor_pago_informado) : null,
    meiaParcela: cotas.some(c => Number(c.percentual_parcela) < 100),
  }
}

// Batimento com a administradora. Parcelas no Finup = pago acumulado ÷ parcela média por cota: um
// lançamento pode pagar várias parcelas, então contar lançamentos erraria.
export function batimento(cotas, pagoAcumulado) {
  const t = totaisDasCotas(cotas)
  const parcelaPorCota = cotas.length ? t.parcelaMensal / cotas.length : 0
  const parcelasFinup = parcelaPorCota > 0 ? Math.round(pagoAcumulado / parcelaPorCota) : 0
  const difParcelas = t.parcelasInformadas == null ? null : parcelasFinup - t.parcelasInformadas
  const difValor = t.valorPagoInformado == null ? null : r2(pagoAcumulado - t.valorPagoInformado)
  return {
    parcelasFinup,
    parcelasInformadas: t.parcelasInformadas,
    difParcelas,
    pagoFinup: r2(pagoAcumulado),
    valorPagoInformado: t.valorPagoInformado,
    difValor,
    diverge: (difParcelas != null && difParcelas !== 0) || (difValor != null && Math.abs(difValor) >= 0.01),
  }
}

// ─── Agendamentos ────────────────────────────────────────────────────────────────────────────────
// Os agendamentos do consórcio são as transferências cujo destino é o bem.
export const agendamentosDoBem = (schedules, bemId) =>
  (schedules || []).filter(s => s.transactionType === 'transfer' && s.toAccountId === bemId)

const CAMPOS_RESTAURAR = ['amount', 'overrides', 'occurrenceType', 'installments', 'nextOccurrence']
export function fotoDosAgendamentos(schedules) {
  return schedules.map(s => ({ id: s.id, ...Object.fromEntries(CAMPOS_RESTAURAR.map(c => [c, s[c] ?? null])) }))
}

// Nova parcela a partir de uma data: o valor-base muda, e o que está pendente antes da data fica com o
// valor antigo. getOcorrencias(schedule) → datas pendentes. Ocorrências já baixadas não mudam.
export function planoNovaParcela(schedules, { valor, data }, getOcorrencias) {
  return schedules.map(s => {
    const overrides = { ...(s.overrides || {}) }
    for (const occ of getOcorrencias(s)) {
      if (occ >= data) {
        // Valor próprio da ocorrência daria prioridade ao antigo: a nova parcela substitui.
        if (overrides[occ]?.amount != null) {
          const { amount: _amount, ...resto } = overrides[occ]
          if (Object.keys(resto).length) overrides[occ] = resto
          else delete overrides[occ]
        }
      } else if (overrides[occ]?.amount == null) {
        overrides[occ] = { ...(overrides[occ] || {}), amount: Number(s.amount) }
      }
    }
    return { id: s.id, mudancas: { amount: Number(valor), overrides } }
  })
}

// Encerrar: nenhuma ocorrência pendente, sem apagar o agendamento (os lançamentos seguem ligados a ele
// e o estorno consegue restaurar). Vira um parcelado com o que já foi consumido.
export function planoEncerrar(schedules) {
  return schedules.map(s => ({
    id: s.id,
    mudancas: {
      occurrenceType: 'installment',
      installments: (s.registered || []).length + (s.skipped || []).length,
      nextOccurrence: null,
    },
  }))
}

// ─── Simulador de saída ──────────────────────────────────────────────────────────────────────────
// Taxa mensal que zera o fluxo (TIR). fluxo[t] = valor no mês t; negativo = saída. null se não houver.
export function taxaInterna(fluxo) {
  const vpl = (i) => fluxo.reduce((s, v, t) => s + v / (1 + i) ** t, 0)
  let baixo = -0.99
  let alto = 10
  if (vpl(baixo) * vpl(alto) > 0) return null
  for (let n = 0; n < 200; n++) {
    const meio = (baixo + alto) / 2
    if (vpl(baixo) * vpl(meio) <= 0) alto = meio
    else baixo = meio
  }
  return (baixo + alto) / 2
}

export const taxaAnual = (mensal) => (1 + mensal) ** 12 - 1
export const taxaMensal = (anual) => (1 + anual) ** (1 / 12) - 1

// historico = por mês, desde o primeiro pagamento: [{ total, proprio }] (proprio já sem terceiros e sem
// devoluções). Depois do histórico, cada mês paga parcelaMensal com recursos próprios. O valor recebido
// entra no mês da contemplação, depois da última parcela paga.
//   mesContemplacao: nº de meses contados do primeiro pagamento. agioPct: % sobre o valor da carta.
export function simularSaida({ historico = [], parcelaMensal = 0, mesContemplacao, agioPct = 0, valorCarta = 0, cdiAnualPct = 0 }) {
  const n = Math.max(0, Math.round(Number(mesContemplacao) || 0))
  const meses = Array.from({ length: n }, (_, i) => historico[i] || { total: parcelaMensal, proprio: parcelaMensal })
  const investido = r2(meses.reduce((s, m) => s + m.total, 0))
  const proprio = r2(meses.reduce((s, m) => s + m.proprio, 0))
  const recebido = r2((Number(valorCarta) || 0) * (Number(agioPct) || 0) / 100)
  const lucro = r2(recebido - proprio)
  const fluxo = [...meses.map(m => -m.proprio), recebido]
  const mensal = proprio > 0 ? taxaInterna(fluxo) : null
  const cdiMensal = taxaMensal((Number(cdiAnualPct) || 0) / 100)
  // Quanto o mesmo dinheiro teria virado no CDI até o mês da saída.
  const noCdi = r2(meses.reduce((s, m, t) => s + m.proprio * (1 + cdiMensal) ** (n - t), 0))
  return {
    meses: n,
    investido,
    proprio,
    recebido,
    lucro,
    retornoPct: proprio > 0 ? (lucro / proprio) * 100 : null,
    taxaMensalPct: mensal == null ? null : mensal * 100,
    taxaAnualPct: mensal == null ? null : taxaAnual(mensal) * 100,
    cdiMensalPct: cdiMensal * 100,
    noCdi,
    ganhoSobreCdi: r2(recebido - noCdi),
  }
}

export function cenariosDeSaida(base) {
  return MESES_CENARIOS.map(mesContemplacao => simularSaida({ ...base, mesContemplacao }))
}
