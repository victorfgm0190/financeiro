// Recorrência com parcelamento em cada ocorrência (seguro anual de R$ 2.800 pago em 12x, todo ano).
// Funções PURAS, sem React e sem I/O. Usado pelo motor de ocorrências, por occEfetiva/occCampos e
// pelas telas. Agendamento sem parcelamento (parcelasPorOcorrencia 1/vazio) nunca passa por aqui.
//
// Modelo:
//   • `amount` = VALOR TOTAL da ocorrência; `parcelasPorOcorrencia` = N;
//   • `installments` (occurrenceType 'installment') continua contando OCORRÊNCIAS, não parcelas;
//   • cada parcela é uma data: a chave em registered/skipped/overrides/data_ocorrencia é a data real
//     da parcela, como em qualquer agendamento. N é limitado aos meses do período da frequência
//     (Anual ≤ 12, Semestral ≤ 6…), então duas parcelas da mesma série nunca caem no mesmo mês;
//   • a série sai sempre de `startDate`: next_occurrence é só "a próxima pendente". As datas são
//     calculadas desde o início, sem encadear, para o dia 31 não virar 28 para sempre;
//   • exceção por ocorrência ("só neste ano"): overrides._parcelamento[dataDaOcorrência] =
//     { total, n, valores? }. `valores` guarda a divisão quando já há parcela paga (as pagas ficam
//     como foram; as pendentes dividem o resto).
//
// "Única em N parcelas" é gravada como Anual + 1 ocorrência: assim todos os trechos que tratam
// frequency 'once' como "uma baixa encerra tudo" continuam valendo só para o que é uma baixa só.
import { addMonths, format } from 'date-fns'

// Meses do período das frequências parceláveis. Mensal, semanal etc. ficam de fora: não há o que
// dividir dentro do período.
export const MESES_DO_PERIODO = { bimonthly: 2, quarterly: 3, quadrimestral: 4, semiannual: 6, annual: 12 }

// Teto só de sanidade da "Única" (não repete, então não há cruzamento).
export const MAX_PARCELAS_UNICA = 360

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const dataBase = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00')
const fmt = (d) => format(d, 'yyyy-MM-dd')
const excecoes = (s) => s?.overrides?._parcelamento || null

export const permiteParcelamento = (frequency) => frequency === 'once' || !!MESES_DO_PERIODO[frequency]

// Máximo de parcelas por ocorrência para a frequência. Frequência que não parcela → 1.
export function maxParcelas(frequency) {
  if (frequency === 'once') return MAX_PARCELAS_UNICA
  return MESES_DO_PERIODO[frequency] || 1
}

const NOME_PERIODO = { bimonthly: 'bimestre', quarterly: 'trimestre', quadrimestral: 'quadrimestre', semiannual: 'semestre', annual: 'ano' }

// Mensagem do campo quando N passa do máximo. null = dentro do limite.
export function erroLimiteParcelas(frequency, n) {
  const max = maxParcelas(frequency)
  if (!(Number(n) > max)) return null
  if (frequency === 'once') return `O máximo é ${max} parcelas.`
  return `Com esta frequência, cada ocorrência pode ter no máximo ${max} parcelas mensais: mais do que isso cruzaria com as parcelas da ocorrência seguinte (uma por ${NOME_PERIODO[frequency]}).`
}

// Agendamento com a recorrência parcelada: N > 1, ou alguma ocorrência com exceção própria (a série
// pode ter voltado a N = 1 a partir de um ano, e os anos anteriores continuam parcelados).
export function ehParcelado(s) {
  if (!s || !MESES_DO_PERIODO[s.frequency]) return false
  if (Number(s.parcelasPorOcorrencia) > 1) return true
  const ex = excecoes(s)
  return !!ex && Object.keys(ex).length > 0
}

// "Única em N parcelas": gravada como Anual + 1 ocorrência (ver o topo do arquivo).
export const ehUnicaParcelada = (s) => ehParcelado(s) && s.occurrenceType === 'installment' && Number(s.installments) === 1

// O que o FORMULÁRIO mostra na frequência ('once' quando é a Única parcelada).
export const frequenciaExibida = (s) => (ehUnicaParcelada(s) ? 'once' : (s?.frequency || 'once'))

// O que vai para o banco: Única com N > 1 → Anual + 1 ocorrência. O resto fica como está.
export function normalizarUnica(s) {
  if (s?.frequency !== 'once' || !(Number(s.parcelasPorOcorrencia) > 1)) return s
  return { ...s, frequency: 'annual', occurrenceType: 'installment', installments: 1 }
}

// Divide o total: parcela = total ÷ N truncado em 2 casas; a diferença de centavos vai na 1ª. A soma
// é exatamente o total (2.800 em 12x → 233,37 + 11 × 233,33).
export function dividirTotal(total, n) {
  const qtd = Math.max(1, Math.floor(Number(n) || 1))
  const cents = Math.round((Number(total) || 0) * 100)
  const base = Math.floor(cents / qtd)
  return Array.from({ length: qtd }, (_, i) => (i === 0 ? cents - base * (qtd - 1) : base) / 100)
}

// Texto abaixo do campo Valor: "12x de R$ 233,33 (1ª parcela R$ 233,37)".
export function textoDivisao(total, n, fmtMoeda) {
  const [primeira, demais] = dividirTotal(total, n)
  if (primeira === demais) return `${n}x de ${fmtMoeda(demais)}`
  return `${n}x de ${fmtMoeda(demais)} (1ª parcela ${fmtMoeda(primeira)})`
}

const periodoDe = (s) => (ehUnicaParcelada(s) ? Infinity : MESES_DO_PERIODO[s.frequency])
const limiteOcorrencias = (s) => (s.occurrenceType === 'installment' ? (Number(s.installments) || 1) : Infinity)
const dataNoMes = (s, m) => fmt(addMonths(dataBase(s.startDate), m))

// Data (chave) da ocorrência `i` da série.
const dataDaOcorrenciaI = (s, i) => dataNoMes(s, i === 0 ? 0 : i * periodoDe(s))

// Total e nº de parcelas de uma ocorrência: exceção dela ou o da série.
export function dadosDaOcorrencia(s, dataOcorrencia) {
  const ex = excecoes(s)?.[dataOcorrencia]
  const n = Math.max(1, Number(ex?.n ?? s.parcelasPorOcorrencia) || 1)
  const total = r2(ex?.total ?? s.amount)
  const valores = Array.isArray(ex?.valores) && ex.valores.length === n ? ex.valores.map(r2) : dividirTotal(total, n)
  return { total, n, valores }
}

// Parcelas de TODAS as ocorrências, em ordem de data, até `limite` itens (ou até passar de `ate`).
// Sem fim → para no limite. Cada item: { data, ocorrencia, indiceOcorrencia, numero, total, valor }.
export function parcelasDaSerie(s, { limite = Infinity, ate = null, aceitar = null } = {}) {
  const out = []
  if (!ehParcelado(s) || !s.startDate) return out
  const maxOcc = limiteOcorrencias(s)
  for (let i = 0; i < maxOcc; i++) {
    const ocorrencia = dataDaOcorrenciaI(s, i)
    if (ate && ocorrencia > ate) break
    const { n, valores, total } = dadosDaOcorrencia(s, ocorrencia)
    const inicioMes = i === 0 ? 0 : i * periodoDe(s)
    for (let k = 1; k <= n; k++) {
      const data = dataNoMes(s, inicioMes + k - 1)
      if (ate && data > ate) break
      if (aceitar && !aceitar(data)) continue
      out.push({ data, ocorrencia, indiceOcorrencia: i, numero: k, total: n, valorTotal: total, valor: valores[k - 1] })
      if (out.length >= limite) return out
    }
  }
  return out
}

const mesesEntre = (de, ate) => {
  const a = dataBase(de)
  const b = dataBase(ate)
  return (b.getFullYear() * 12 + b.getMonth()) - (a.getFullYear() * 12 + a.getMonth())
}

// De uma chave (data da parcela) para a parcela. null quando a data não é parcela desta série.
export function parcelaDaData(s, data) {
  if (!ehParcelado(s) || !s.startDate || !data) return null
  const chave = String(data).slice(0, 10)
  const m = mesesEntre(s.startDate, chave)
  if (m < 0) return null
  const periodo = periodoDe(s)
  const i = periodo === Infinity ? 0 : Math.floor(m / periodo)
  if (i >= limiteOcorrencias(s)) return null
  const ocorrencia = dataDaOcorrenciaI(s, i)
  const numero = (periodo === Infinity ? m : m % periodo) + 1
  const { n, valores, total } = dadosDaOcorrencia(s, ocorrencia)
  if (numero > n || dataNoMes(s, m) !== chave) return null
  return { data: chave, ocorrencia, indiceOcorrencia: i, numero, total: n, valorTotal: total, valor: valores[numero - 1] }
}

// A chave de volta: parcela `numero` da ocorrência `dataOcorrencia`. null se não existir.
export function dataDaParcela(s, dataOcorrencia, numero) {
  if (!ehParcelado(s) || !s.startDate) return null
  const data = dataNoMes(s, mesesEntre(s.startDate, dataOcorrencia) + Number(numero) - 1)
  const p = parcelaDaData(s, data)
  return p && p.ocorrencia === String(dataOcorrencia).slice(0, 10) && p.numero === Number(numero) ? data : null
}

// Valor base de uma chave do agendamento (sem exceção por parcela). Não parcelado → o amount.
export function valorBaseDaChave(s, data) {
  if (!ehParcelado(s)) return s?.amount
  const p = parcelaDaData(s, data)
  return p ? p.valor : s.amount
}

// "3/12 · ocorr. 2027". Na Única, sem o ano: não há outra ocorrência para diferenciar.
export function rotuloDaParcela(s, data) {
  const p = parcelaDaData(s, data)
  if (!p) return null
  return ehUnicaParcelada(s) ? `${p.numero}/${p.total}` : `${p.numero}/${p.total} · ocorr. ${p.ocorrencia.slice(0, 4)}`
}

// Agrupa chaves por ocorrência, para a prévia. [{ ocorrencia, ano, total, n, parcelas: [{…}] }]
export function agruparPorOcorrencia(s, datas = []) {
  const grupos = new Map()
  for (const d of datas) {
    const p = parcelaDaData(s, d)
    if (!p) continue
    if (!grupos.has(p.ocorrencia)) {
      grupos.set(p.ocorrencia, { ocorrencia: p.ocorrencia, ano: p.ocorrencia.slice(0, 4), total: p.valorTotal, n: p.total, parcelas: [] })
    }
    grupos.get(p.ocorrencia).parcelas.push(p)
  }
  return [...grupos.values()]
}

// Primeira parcela pendente da série (a ocorrência dela é a que os formulários editam). null = acabou.
export function proximaParcela(s) {
  const feitas = consumidas(s)
  return parcelasDaSerie(s, { limite: 1, aceitar: d => !feitas.has(d) })[0] || null
}

// Valor da PRÓXIMA parcela pendente (para comparar com um lançamento ou mostrar numa lista). Não
// parcelado → o amount, como sempre. Sem pendentes → o amount.
export function valorDeReferencia(s) {
  if (!ehParcelado(s)) return s?.amount
  const p = proximaParcela(s)
  if (!p) return s.amount
  const ov = s.overrides?.[p.data]
  return ov?.amount != null ? Number(ov.amount) : p.valor
}

// ── Edição do total / do N ─────────────────────────────────────────────────────────────────────

// Efetivações de provisão: a parcela efetivada virou um agendamento à parte e fica em `efetivacoes`,
// não em `registered`. Para o parcelamento, as duas contam como paga. Map(chave → valor real).
const efetivadasDe = (s) => new Map((s?.efetivacoes || []).filter(e => e?.ocorrencia).map(e => [e.ocorrencia, Number(e.valor)]))
const consumidas = (s) => new Set([...(s.registered || []), ...(s.skipped || []), ...efetivadasDe(s).keys()])
// Valor pago de uma parcela (já paga): o efetivado, o realizado na baixa ou o previsto dela.
const valorPago = (s, p) => {
  const efetivado = efetivadasDe(s).get(p.data)
  if (efetivado != null) return r2(efetivado)
  const realizado = s.registeredMeta?.[p.data]?.valor_realizado
  return realizado != null ? r2(realizado) : valorDaParcela(s, p)
}
const estaPaga = (s, data) => (s.registered || []).includes(data) || efetivadasDe(s).has(data)
// Valor efetivo de uma parcela (exceção "só esta parcela" ou o valor base).
const valorDaParcela = (s, p) => {
  const ov = s.overrides?.[p.data]
  return ov?.amount != null ? r2(ov.amount) : p.valor
}

// Situação de uma ocorrência: o que já foi pago, a maior parcela paga, a maior consumida (paga ou
// pulada) e as chaves dela.
export function situacaoDaOcorrencia(s, dataOcorrencia) {
  const { n } = dadosDaOcorrencia(s, dataOcorrencia)
  const pul = new Set(s.skipped || [])
  let pago = 0, nPagas = 0, maiorPaga = 0, maiorConsumida = 0
  const chaves = []
  for (let k = 1; k <= n; k++) {
    const data = dataDaParcela(s, dataOcorrencia, k)
    if (!data) continue
    chaves.push(data)
    if (estaPaga(s, data)) {
      pago = r2(pago + valorPago(s, parcelaDaData(s, data)))
      nPagas++
      maiorPaga = k
      maiorConsumida = k
    } else if (pul.has(data)) {
      maiorConsumida = k
    }
  }
  return { pago, nPagas, maiorPaga, maiorConsumida, chaves }
}

// Motivo que impede mudar total/N desta ocorrência. null = pode. Regra: novo total − já pago, dividido
// entre as pendentes; N não pode ficar abaixo das parcelas já pagas.
export function erroEdicaoOcorrencia(s, dataOcorrencia, { total, n }) {
  const limite = erroLimiteParcelas(frequenciaExibida(s), n)
  if (limite) return limite
  const { pago, nPagas, maiorPaga, chaves } = situacaoDaOcorrencia(s, dataOcorrencia)
  if (n < maiorPaga) {
    return `Esta ocorrência já tem ${nPagas} parcela${nPagas !== 1 ? 's' : ''} paga${nPagas !== 1 ? 's' : ''} (até a ${maiorPaga}ª): o nº de parcelas não pode ser menor que ${maiorPaga}.`
  }
  if (nPagas > 0 && r2(total) < pago) {
    return `Já foram pagos ${pago.toFixed(2).replace('.', ',')} nesta ocorrência: o novo total não pode ser menor que isso.`
  }
  // Pendentes depois da mudança: as N menos as pagas e as puladas que continuam dentro das N.
  const feitas = consumidas(s)
  const consumidasDentro = chaves.filter((d, i) => i < n && feitas.has(d)).length
  if (nPagas > 0 && n === consumidasDentro && r2(total) !== pago) {
    return `Todas as ${n} parcelas já foram pagas ou puladas: não há parcela pendente para receber a diferença.`
  }
  return null
}

// Valores das N parcelas com o novo total: as pagas ficam como foram, as puladas ficam zeradas e as
// pendentes dividem o resto (diferença de centavos na 1ª pendente).
function valoresRecalculados(s, dataOcorrencia, { total, n }) {
  const pul = new Set(s.skipped || [])
  const antes = dadosDaOcorrencia(s, dataOcorrencia)
  const valores = new Array(n).fill(0)
  const pendentes = []
  let pago = 0
  for (let k = 1; k <= n; k++) {
    const data = k <= antes.n ? dataDaParcela(s, dataOcorrencia, k) : null
    if (data && estaPaga(s, data)) {
      valores[k - 1] = valorPago(s, parcelaDaData(s, data))
      pago = r2(pago + valores[k - 1])
    } else if (data && pul.has(data)) {
      valores[k - 1] = 0
    } else {
      pendentes.push(k)
    }
  }
  const divisao = dividirTotal(r2(total - pago), Math.max(1, pendentes.length))
  pendentes.forEach((k, i) => { valores[k - 1] = divisao[i] })
  return valores
}

// Tira exceções e pulos que ficaram sem parcela (N diminuiu) e os valores "só esta parcela" das
// pendentes (o recálculo manda neles). A data própria de uma parcela continua.
function limparPendentesDaOcorrencia(s, chaves, chavesNovas) {
  const novas = new Set(chavesNovas)
  const overrides = { ...s.overrides }
  for (const d of chaves) {
    if (estaPaga(s, d) || !overrides[d]) continue
    if (!novas.has(d)) { delete overrides[d]; continue }
    const resto = { ...overrides[d] }
    delete resto.amount
    if (Object.keys(resto).length) overrides[d] = resto
    else delete overrides[d]
  }
  return { ...s, overrides, skipped: (s.skipped || []).filter(d => !chaves.includes(d) || novas.has(d)) }
}

export const ESCOPO_OCORRENCIA = { SO_ESTA: 'parcela', PROXIMAS: 'proximas' }

// Aplica novo total/N a partir da ocorrência `dataOcorrencia`.
//   SO_ESTA : só esta ocorrência muda (exceção em overrides._parcelamento).
//   PROXIMAS: esta e as seguintes seguem o novo total/N (valor base do agendamento); as anteriores
//             ficam congeladas como estavam.
// Efetivadas nunca mudam. Devolve o agendamento novo (ou lança Error com a mensagem para a tela).
export function planoParcelamento(schedule, { dataOcorrencia, total, n, escopo }) {
  const novoTotal = r2(total)
  const novoN = Math.max(1, Number(n) || 1)
  const motivo = erroEdicaoOcorrencia(schedule, dataOcorrencia, { total: novoTotal, n: novoN })
  if (motivo) throw new Error(motivo)
  const baseEx = { ...(excecoes(schedule) || {}) }
  let s = { ...schedule, overrides: { ...(schedule.overrides || {}) } }
  // A chave de cada parcela sai da mesma âncora: o que muda é só quantas parcelas e quanto cada uma.
  const aplicar = (acc, occ, entrada) => {
    const chavesAntes = situacaoDaOcorrencia(acc, occ).chaves
    const ex = { ...(acc.overrides._parcelamento || {}) }
    if (entrada) ex[occ] = entrada
    else delete ex[occ]
    const prox = { ...acc, overrides: { ...acc.overrides, _parcelamento: ex } }
    if (!Object.keys(ex).length) delete prox.overrides._parcelamento
    return limparPendentesDaOcorrencia(prox, chavesAntes, situacaoDaOcorrencia(prox, occ).chaves)
  }

  if (escopo === ESCOPO_OCORRENCIA.SO_ESTA) {
    const consumiu = situacaoDaOcorrencia(s, dataOcorrencia).maiorConsumida > 0
    const entrada = { total: novoTotal, n: novoN }
    if (consumiu) entrada.valores = valoresRecalculados(s, dataOcorrencia, entrada)
    return aplicar(s, dataOcorrencia, entrada)
  }

  // Congela as ocorrências anteriores à editada com o que valia antes (a base vai mudar).
  const anteriores = []
  for (let i = 0; ; i++) {
    const occ = dataDaOcorrenciaI(s, i)
    if (occ >= dataOcorrencia) break
    anteriores.push(occ)
  }
  for (const occ of anteriores) {
    const atual = dadosDaOcorrencia(s, occ)
    baseEx[occ] = baseEx[occ] || { total: atual.total, n: atual.n }
  }
  // A editada: com parcela consumida precisa da exceção com os valores; sem, segue a série.
  const consumiu = situacaoDaOcorrencia(s, dataOcorrencia).maiorConsumida > 0
  const entradaEditada = consumiu
    ? { total: novoTotal, n: novoN, valores: valoresRecalculados(s, dataOcorrencia, { total: novoTotal, n: novoN }) }
    : null
  // Seguintes com exceção própria: voltam à série, salvo se tiverem parcela consumida.
  const chavesPorOcc = new Map()
  for (const occ of Object.keys(baseEx)) {
    if (occ > dataOcorrencia) chavesPorOcc.set(occ, situacaoDaOcorrencia(s, occ))
  }
  const chavesEditada = situacaoDaOcorrencia(s, dataOcorrencia).chaves
  for (const [occ, sit] of chavesPorOcc) if (sit.maiorConsumida === 0) delete baseEx[occ]
  if (entradaEditada) baseEx[dataOcorrencia] = entradaEditada
  else delete baseEx[dataOcorrencia]
  s = { ...s, amount: novoTotal, parcelasPorOcorrencia: novoN, overrides: { ...s.overrides, _parcelamento: baseEx } }
  if (!Object.keys(baseEx).length) delete s.overrides._parcelamento
  s = limparPendentesDaOcorrencia(s, chavesEditada, situacaoDaOcorrencia(s, dataOcorrencia).chaves)
  for (const [occ, sit] of chavesPorOcc) s = limparPendentesDaOcorrencia(s, sit.chaves, situacaoDaOcorrencia(s, occ).chaves)
  return s
}

// Há ocorrência depois desta? Decide se a pergunta "só neste ano / este e os próximos" faz sentido.
export function temOcorrenciaDepois(s, dataOcorrencia) {
  if (ehUnicaParcelada(s)) return false
  const m = mesesEntre(s.startDate, dataOcorrencia)
  const periodo = MESES_DO_PERIODO[s.frequency]
  if (!periodo) return false
  return Math.floor(m / periodo) + 1 < limiteOcorrencias(s)
}

// Algo já foi baixado ou pulado? Enquanto não, a série inteira pode mudar de data.
export const temConsumo = (s) => (consumidas(s).size + (s?.efetivacoes?.length || 0)) > 0

// Série que recomeça (outro início/frequência, sem nenhuma baixa): as exceções e pulos por data ficam
// sem parcela correspondente.
export function semExcecoesDeData(s) {
  const { _parcelamento: _x, ...resto } = s.overrides || {} // eslint-disable-line no-unused-vars
  const overrides = Object.fromEntries(Object.entries(resto).filter(([k]) => !/^\d{4}-\d{2}-\d{2}$/.test(k)))
  return { ...s, overrides, skipped: [] }
}

// Série comum sem baixas que passa a ser parcelada: nasce na próxima data e sem as exceções antigas.
export function comoNovaParcelada(dados, serie, ancora) {
  const inicio = dados.startDate === serie.startDate && ancora ? ancora : dados.startDate
  return { ...semExcecoesDeData({ ...dados, overrides: {} }), startDate: inicio, nextOccurrence: inicio }
}

// O que uma edição de total/N significa para a série: o que mudou (para o histórico), a ocorrência
// alvo, o motivo de recusa e se precisa perguntar "só nesta / nesta e nas próximas".
export function edicaoDoParcelamento(serie, { total, n }) {
  const prox = proximaParcela(serie)
  const nAntes = prox?.total ?? (Number(serie.parcelasPorOcorrencia) || 1)
  const totalAntes = prox?.valorTotal ?? r2(serie.amount)
  const mudancas = [
    ...(r2(total) !== totalAntes ? [{ campo: 'valorTotalOcorrencia', de: totalAntes, para: r2(total) }] : []),
    ...(Number(n) !== nAntes ? [{ campo: 'parcelasPorOcorrencia', de: nAntes, para: Number(n) }] : []),
  ]
  const ocorrencia = prox?.ocorrencia || null
  if (!mudancas.length) return { mudancas, ocorrencia, erro: null, perguntar: false }
  if (!ocorrencia) return { mudancas, ocorrencia, erro: 'Esta série não tem parcela pendente para recalcular.', perguntar: false }
  const erro = erroEdicaoOcorrencia(serie, ocorrencia, { total, n })
  return { mudancas, ocorrencia, erro, perguntar: !erro && temOcorrenciaDepois(serie, ocorrencia) }
}

// Aplica a edição: `base` = a série com os campos novos, mas ainda com o total/N antigos.
//   • sem nenhuma baixa e com outro início/frequência → recomeça a série;
//   • senão, se total ou N mudaram → planoParcelamento no escopo escolhido.
// Devolve { schedule, recomeco, escopo } com o escopo realmente usado.
export function aplicarEdicaoParcelamento(base, serie, { total, n, escopo = null, inicio, frequencia, edicao }) {
  const recomeco = !temConsumo(serie) && (inicio !== serie.startDate || frequencia !== serie.frequency)
  if (recomeco) {
    return {
      schedule: semExcecoesDeData({ ...base, startDate: inicio, frequency: frequencia, amount: r2(total), parcelasPorOcorrencia: Number(n), nextOccurrence: inicio }),
      recomeco, escopo: ESCOPO_OCORRENCIA.PROXIMAS,
    }
  }
  const esc = escopo === ESCOPO_OCORRENCIA.SO_ESTA ? ESCOPO_OCORRENCIA.SO_ESTA : ESCOPO_OCORRENCIA.PROXIMAS
  const schedule = edicao.mudancas.length
    ? planoParcelamento(base, { dataOcorrencia: edicao.ocorrencia, total, n, escopo: esc })
    : base
  return { schedule, recomeco, escopo: esc }
}

// Soma real de uma ocorrência: pagas pelo valor pago, puladas zeradas e as demais pelo valor efetivo.
export function somaDaOcorrencia(s, dataOcorrencia) {
  const { n } = dadosDaOcorrencia(s, dataOcorrencia)
  const pul = new Set(s.skipped || [])
  let soma = 0
  for (let k = 1; k <= n; k++) {
    const data = dataDaParcela(s, dataOcorrencia, k)
    if (!data) continue
    const p = parcelaDaData(s, data)
    if (estaPaga(s, data)) soma += Math.round(valorPago(s, p) * 100)
    else if (!pul.has(data)) soma += Math.round(valorDaParcela(s, p) * 100)
  }
  return soma / 100
}

// Aviso da prévia quando a soma da ocorrência deixou de bater com o total. null = bate.
export function avisoSomaOcorrencia(s, dataOcorrencia, fmtMoeda) {
  const { total } = dadosDaOcorrencia(s, dataOcorrencia)
  const soma = somaDaOcorrencia(s, dataOcorrencia)
  if (Math.abs(soma - total) < 0.005) return null
  return `A soma desta ocorrência (${fmtMoeda(soma)}) está diferente do total (${fmtMoeda(total)})`
}

export const MSG_DATA_BLOQUEADA = 'Esta série parcelada já tem parcela baixada: as baixas estão ligadas às datas atuais. Para mudar um vencimento, edite só a parcela na prévia abaixo.'
