import { formatarMoedaBR } from './valorBR.js'
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

// Batimento com a administradora. Parcelas no Finup = pago por lançamentos ÷ parcela média por cota (um
// lançamento pode pagar várias parcelas, então contar lançamentos erraria) + as parcelas das baixas sem
// movimento em conta, que dizem quantas quitam. Crédito avulso entra no valor, mas não quita parcela.
function parcelasPeloValor(cotas, pagoAcumulado, baixas) {
  const t = totaisDasCotas(cotas)
  const parcelaPorCota = cotas.length ? t.parcelaMensal / cotas.length : 0
  const valorBaixas = baixas.reduce((s, b) => s + (Number(b.valor) || 0), 0)
  return parcelaPorCota > 0 ? Math.round((pagoAcumulado - valorBaixas) / parcelaPorCota) : 0
}
const parcelasDasBaixas = (baixas) => baixas.reduce((s, b) => s + (Number(b.quantidade_parcelas) || 0), 0)

export function batimento(cotas, pagoAcumulado, baixas = []) {
  const t = totaisDasCotas(cotas)
  const parcelasFinup = parcelasPeloValor(cotas, pagoAcumulado, baixas) + parcelasDasBaixas(baixas)
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

// ─── Prazo e encerramento por cota ───────────────────────────────────────────────────────────────
// A baixa com cota informada é da cota. O pagamento não é ligado a uma cota, então o resto do batimento é
// dividido entre elas: na proporção das parcelas informadas pela administradora que ainda faltam na cota
// ou, sem esse dado, por igual. A soma fecha com o batimento (maior resto, com empate para a primeira cota).
export function parcelasFinupPorCota(cotas = [], pagoAcumulado = 0, baixas = []) {
  const proprias = cotas.map(c => parcelasDasBaixas(baixas.filter(b => b.cota_numero === c.numero)))
  const total = batimento(cotas, pagoAcumulado, baixas).parcelasFinup - proprias.reduce((s, n) => s + n, 0)
  const informadas = cotas.map((c, i) => Math.max(0, (Number(c.parcelas_pagas_informadas) || 0) - proprias[i]))
  const temInformadas = cotas.every(c => c.parcelas_pagas_informadas != null) && informadas.some(n => n > 0)
  const pesos = temInformadas ? informadas : cotas.map(() => 1)
  const somaPesos = pesos.reduce((s, p) => s + p, 0)
  const exatas = pesos.map(p => (somaPesos > 0 ? (total * p) / somaPesos : 0))
  const parcelas = exatas.map(Math.floor)
  let sobra = total - parcelas.reduce((s, p) => s + p, 0)
  const porResto = exatas.map((v, i) => ({ i, resto: v - Math.floor(v) })).sort((a, b) => b.resto - a.resto || a.i - b.i)
  for (let n = 0; sobra > 0 && n < porResto.length; n++, sobra--) parcelas[porResto[n].i] += 1
  return parcelas.map((p, i) => p + proprias[i])
}

// Pagas, prazo e restantes de uma cota. Restantes usa as pagas no Finup; informadas fica para comparar.
export function prazoDaCota(cota, pagasFinup) {
  const prazo = cota.prazo_meses == null || cota.prazo_meses === '' ? null : Number(cota.prazo_meses)
  const informadas = cota.parcelas_pagas_informadas == null ? null : Number(cota.parcelas_pagas_informadas)
  return {
    pagas: pagasFinup,
    prazo,
    restantes: prazo == null ? null : Math.max(0, prazo - pagasFinup),
    informadas,
    restantesInformadas: prazo == null || informadas == null ? null : Math.max(0, prazo - informadas),
    diverge: informadas != null && informadas !== pagasFinup,
  }
}

// Soma meses a uma data 'YYYY-MM-DD'. Dia que não existe no mês final vira o último dia do mês.
export function somarMeses(iso, meses) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  const indice = a * 12 + (m - 1) + Number(meses)
  const ano = Math.floor(indice / 12)
  const mes = indice % 12
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimoDia)).padStart(2, '0')}`
}

// Data informada vale. Sem ela: adesão + prazo, marcada como estimada. Sem adesão: a data de referência
// do histórico de abertura + o que restava do prazo. Sem base: null.
export function encerramentoDaCota(cota) {
  const informada = cota.previsao_encerramento || cota.data_ultima_parcela
  if (informada) return { data: informada, estimado: false }
  if (cota.data_adesao && Number(cota.prazo_meses) > 0) {
    return { data: somarMeses(cota.data_adesao, Number(cota.prazo_meses)), estimado: true }
  }
  if (cota.abertura_data && Number(cota.prazo_meses) > 0) {
    return { data: somarMeses(cota.abertura_data, Number(cota.prazo_meses) - (Number(cota.abertura_parcelas) || 0)), estimado: true }
  }
  return { data: null, estimado: false }
}

// ─── Agendamentos ────────────────────────────────────────────────────────────────────────────────
// Os agendamentos do consórcio são as transferências cujo destino é o bem.
export const agendamentosDoBem = (schedules, bemId) =>
  (schedules || []).filter(s => s.transactionType === 'transfer' && s.toAccountId === bemId)

const CAMPOS_RESTAURAR = ['amount', 'overrides', 'occurrenceType', 'installments', 'nextOccurrence']
export function fotoDosAgendamentos(schedules) {
  return schedules.map(s => ({ id: s.id, ...Object.fromEntries(CAMPOS_RESTAURAR.map(c => [c, s[c] ?? null])) }))
}

// ─── Venda por cota ───────────────────────────────
// Custo de cada cota: o pago atribuído a ela (pago próprio, por terceiro, abertura e créditos). A baixa com cota
// informada é da cota; o resto do pago é dividido entre as cotas ativas na proporção das parcelas, como no
// batimento. Cota já vendida fica com o custo que saiu do bem, e esse valor não entra de novo na divisão.
const vendidaDe = (c) => !!c.vendida_em
export function custoEstimadoPorCota(cotas = [], pagoAcumulado = 0, baixas = []) {
  const saida = cotas.map(c => (vendidaDe(c) ? r2(c.vendida_custo) : 0))
  const ativas = cotas.map((c, i) => ({ c, i })).filter(x => !vendidaDe(x.c))
  if (!ativas.length) return saida
  const jaSaiu = cotas.reduce((s, c) => s + (vendidaDe(c) ? Number(c.vendida_custo) || 0 : 0), 0)
  const total = Math.max(0, (Number(pagoAcumulado) || 0) - jaSaiu)
  const daCota = (c) => baixas.filter(b => b.cota_numero === c.numero)
  const proprio = ativas.map(x => daCota(x.c).reduce((s, b) => s + (Number(b.valor) || 0), 0))
  const resto = Math.max(0, total - proprio.reduce((s, v) => s + v, 0))
  // Parcelas informadas pela administradora quando todas têm; senão, todas com o mesmo número de parcelas.
  const informadas = ativas.map(x => Math.max(0, (Number(x.c.parcelas_pagas_informadas) || 0) - parcelasDasBaixas(daCota(x.c))))
  const usarInformadas = ativas.every(x => x.c.parcelas_pagas_informadas != null) && informadas.some(n => n > 0)
  const pesos = ativas.map((x, n) => parcelaDaCota(x.c) * (usarInformadas ? informadas[n] : 1))
  const somaPesos = pesos.reduce((s, p) => s + p, 0)
  ativas.forEach((x, n) => { saida[x.i] = r2(proprio[n] + resto * (somaPesos > 0 ? pesos[n] / somaPesos : 1 / ativas.length)) })
  // Centavos do arredondamento ficam na última ativa: a soma fecha com o pago.
  const ultima = ativas[ativas.length - 1].i
  const soma = ativas.reduce((s, x) => s + saida[x.i], 0)
  saida[ultima] = Math.max(0, r2(saida[ultima] + total - soma))
  return saida
}

export const avisoCustoAcimaDoSaldo = (saldo) => `O custo não pode passar do saldo do bem (R$ ${formatarMoedaBR(saldo)})`

// O que a venda de uma cota muda nos agendamentos. Por cota (a descrição cita a cota, ou há um agendamento por
// cota ativa, com o valor da parcela dela): encerra o da cota. Cobrindo várias: reduz na proporção da cota vendida,
// a partir do mês seguinte à venda. Era a última cota: encerra tudo. Só agendamentos com parcela pendente.
const mesSeguinte = (iso) => {
  const [a, m] = String(iso).split('-').map(Number)
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
}
const citaACota = (s, numero) => new RegExp(`cota\\s*(n[º°o.]*\\s*)?${String(numero).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\D|$)`, 'i').test(s.description || '')
export function planoVendaDaCota(schedules, cotas, numero, data, getOcorrencias) {
  const cota = (cotas || []).find(c => c.numero === numero)
  if (!cota) return []
  const ativas = cotas.filter(c => !vendidaDe(c))
  const pendentes = (schedules || []).filter(s => getOcorrencias(s).length > 0)
  const encerrar = (lista) => planoEncerrar(lista).map(p => {
    const s = lista.find(x => x.id === p.id)
    return { ...p, descricao: s.description || 'Agendamento', acao: 'encerrar', de: Number(s.amount), para: 0 }
  })
  if (ativas.length <= 1) return encerrar(pendentes)
  const citados = pendentes.filter(s => citaACota(s, numero))
  if (citados.length) return encerrar(citados)
  const parcela = parcelaDaCota(cota)
  const umPorCota = pendentes.length === ativas.length
    && ativas.every(c => pendentes.some(s => Math.abs(Number(s.amount) - parcelaDaCota(c)) < 0.01))
  if (umPorCota) return encerrar([pendentes.find(s => Math.abs(Number(s.amount) - parcela) < 0.01)])
  const total = ativas.reduce((s, c) => s + parcelaDaCota(c), 0)
  const fator = total > 0 ? 1 - parcela / total : 1
  const aPartirDe = mesSeguinte(data)
  return pendentes.map(s => {
    const para = r2(Number(s.amount) * fator)
    const [p] = planoNovaParcela([s], { valor: para, data: aPartirDe }, getOcorrencias)
    return { ...p, descricao: s.description || 'Agendamento', acao: 'reduzir', de: Number(s.amount), para, aPartirDe }
  })
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
          const resto = { ...overrides[occ] }
          delete resto.amount
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
