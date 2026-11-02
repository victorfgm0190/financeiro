// Assistente IA — CONSULTA DE AGENDAMENTO 🟢 ("quantas parcelas faltam do X?", "quando termina?",
// "qual a próxima parcela?", "quanto falta pagar?", "situação do agendamento X"). PURO.
//
// A IA só interpreta a pergunta (descrição/favorecido citados). TODO número sai daqui, com as MESMAS
// funções do Editar Agendamento — nada de cálculo novo de parcelas:
//   • "x de N"         → resumoRegistradas (o "Ver ocorrências registradas (5 de 8)")
//   • parcelas a vencer → computeOccurrences (o motor; a prévia da tela usa getNextOccurrences = ele)
//   • data/valor        → occEfetiva (exceção da ocorrência: data e valor reais de cada uma)
//   • nº da parcela     → getNumeroParcela (o selo "6/8" das telas)
//   • última paga       → historicoOcorrencias (a tabela do "Ver ocorrências registradas")
// "Até a data" é gravado como parcelado (FimRepeticao: installment + nº de ocorrências), então cai
// na mesma conta. Somente leitura: nada aqui grava.
// Imports com .js: o backend (api/assistente.js) usa ehPerguntaDeAgendamento.
import { normalizarTermo } from './texto.js'
import { computeOccurrences } from '../occurrences.js'
import { occEfetiva } from '../fluxoCaixa.js'
import { getNumeroParcela } from '../numeroParcela.js'
import { resumoRegistradas, historicoOcorrencias, STATUS_OCORRENCIA } from '../ocorrenciasRegistradas.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtMoeda = (v) => moeda.format(Number(v) || 0).replace(/\s/g, ' ')
export const fmtData = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '')

// ─── Intenção: a pergunta é sobre a situação de um agendamento? ─────────────────────────────────
// Tem prioridade sobre a busca genérica e sobre a baixa (o backend troca a ferramenta). Exige forma
// de PERGUNTA: "paguei a última parcela do carro" é baixa, não consulta.
const PERGUNTAS = [
  /\bquant[ao]s?\s+(\w+\s+)?(parcelas?|prestac\w*|mensalidades?|vezes)\b/, // quantas parcelas / quantas ainda parcelas
  /\bquant[ao]s?\s+(ja\s+|ainda\s+)?(paguei|pagamos|foram\s+pag\w*|recebi|faltam|falta|restam|resta)\b/,
  /\b(faltam|falta|faltando|restam|resta)\s+(quant\w*|pagar|receber|quitar)\b/,
  /\bquanto\s+(ainda\s+)?(falta|devo|resta)\b/,
  /\bquando\s+(\w+\s+)?(termina|acaba|encerra|finaliza|quita)\b/,
  /\b(qual|quando)\b.*\b(proxim[ao]|ultim[ao])\s+(parcela|prestac\w*|ocorrencia|vencimento)\b/,
  /\b(valor|saldo|total)\s+(restante|devedor|que\s+falta)\b/,
  /\bsituacao\s+d[oa]s?\b/,
  /\b(esta|ja\s+foi|foi|ja\s+esta)\s+quitad[oa]\b/,
  /\bparcelas?\s+(estao\s+)?(faltando|restantes?|pendentes?|em\s+aberto)\b/,
]
// Assuntos de outras consultas (fatura, saldo, orçamento): ficam com a ferramenta delas.
const OUTROS_ASSUNTOS = /\b(fatura|saldo principal|orcamento|envelope|limite do cartao)\b/

export function ehPerguntaDeAgendamento(texto) {
  const t = normalizarTermo(texto)
  if (!t || OUTROS_ASSUNTOS.test(t)) return false
  return PERGUNTAS.some(re => re.test(t))
}

// Backend (api/assistente.js): pergunta sobre a situação de um agendamento (parcelas, vencimento, dívida, valor restante) tem
// PRIORIDADE: se o modelo escolheu uma destas, vira consultar_agendamento (só leitura; o app localiza
// e calcula). Decidido pelo texto (ehPerguntaDeAgendamento), não pelo palpite do modelo.
export function consultaDeAgendamento(ferramenta, input, textoPedido, podeVer) {
  if (!podeVer || !ehPerguntaDeAgendamento(textoPedido)) return null
  const i = input || {}
  if (ferramenta === 'buscar_lancamentos') return { descricao: i.texto ?? null, favorecido: null }
  if (ferramenta === 'baixar_agendamento') return { descricao: i.descricao ?? null, favorecido: i.favorecido ?? null }
  if (ferramenta === 'abrir_tela' && i.destino === 'tela_agendamentos') return { descricao: i.filtro ?? null, favorecido: null }
  if (ferramenta === 'perguntar') return { descricao: null, favorecido: null }
  return null
}

// Pergunta sobre PARCELAS (desempate: um parcelado vence um recorrente de nome igual).
export const perguntaDeParcelas = (texto) => /\b(parcel\w*|prestac\w*|faltam|restam)\b/.test(normalizarTermo(texto))

// ─── Localizar o agendamento (descrição + favorecido, tolerante a erro de transcrição) ─────────
// Palavras que não identificam o agendamento (da pergunta, não do nome).
const VAZIAS = new Set(`a o as os e de da do das dos em no na nos nas um uma uns umas com sem para pra pro por que
  qual quais quando quanto quanta quantos quantas ja ainda falta faltam faltando resta restam restante restantes
  parcela parcelas prestacao prestacoes mensalidade mensalidades vez vezes paguei pagamos pago paga pagas pagou pagar
  receber recebi recebido foram foi esta estao sao ser tem ha divida dividas devo chamada chamado chamar nome
  agendamento agendamentos conta contas situacao proxima proximo ultima ultimo termina acaba encerra finaliza quita
  quitado quitada quitar valor total saldo devedor me meu minha meus minhas eu ele ela sr sra dr dra vence vencimento
  vencem venc do dia mes ate quantia pendente pendentes aberto aberta sobre favor`.split(/\s+/).filter(Boolean))

export function palavras(s) {
  return normalizarTermo(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !VAZIAS.has(w))
}

// Distância de edição (curta: nomes de agendamento).
function distancia(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length
  let ant = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    ant = cur
  }
  return ant[n]
}

// Semelhança entre duas palavras (0..1): igual; prefixo (≥ 3 letras); 1 letra trocada (≥ 4);
// 2 letras (≥ 7). Palavra de 2 letras ("tv") só igual.
export function semelhanca(a, b) {
  if (a === b) return 1
  const menor = Math.min(a.length, b.length)
  if (menor >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85
  if (menor >= 4) {
    const d = distancia(a, b)
    if (d <= 1) return 0.75
    if (menor >= 7 && d <= 2) return 0.7
  }
  return 0
}

// Quanto das palavras do ALVO (descrição ou favorecido) o pedido cobre (0..1).
function cobertura(alvo, consulta) {
  if (!alvo.length || !consulta.length) return 0
  let soma = 0
  for (const w of alvo) soma += Math.max(...consulta.map(q => semelhanca(w, q)))
  return soma / alvo.length
}

export const LIMIAR = 0.5 // pontuação mínima para entrar na lista
export const MARGEM = 0.3 // dentro da margem do melhor = empate → o usuário escolhe

// Pontua cada agendamento: 2 × cobertura da descrição + cobertura do favorecido + quanto do que o
// usuário disse foi encontrado nele (uma palavra só basta para uma descrição longa) + 0,5 se a pergunta
// é de parcelas e ele é parcelado. → { escolhido, candidatos: [{ schedule, pontos }] }.
// `escolhido` só quando um se destaca; empate → null (a tela pergunta, nunca escolhe sozinha).
export function procurarAgendamentos(schedules, { descricao = null, favorecido = null, texto = '' } = {}) {
  const consulta = [...new Set([...palavras(descricao), ...palavras(favorecido), ...palavras(texto)])]
  if (!consulta.length) return { escolhido: null, candidatos: [], consulta }
  const deParcelas = perguntaDeParcelas(`${texto} ${descricao || ''}`)
  const lista = []
  for (const s of schedules || []) {
    if (!s?.id) continue
    const pd = palavras(s.description)
    const pf = palavras(s.payee)
    const desc = cobertura(pd, consulta)
    const fav = cobertura(pf, consulta)
    if (desc === 0 && fav === 0) continue
    const dito = cobertura(consulta, [...pd, ...pf])
    const parcelado = s.occurrenceType === 'installment' && (s.frequency || 'once') !== 'once'
    const pontos = r2(2 * desc + fav + dito + (deParcelas && parcelado ? 0.5 : 0))
    if (pontos >= LIMIAR) lista.push({ schedule: s, pontos })
  }
  lista.sort((a, b) => b.pontos - a.pontos || String(a.schedule.description).localeCompare(String(b.schedule.description)))
  const melhor = lista[0]?.pontos ?? 0
  const empatados = lista.filter(c => melhor - c.pontos < MARGEM)
  return { escolhido: empatados.length === 1 ? empatados[0].schedule : null, candidatos: lista.slice(0, 6), consulta }
}

// ─── Resumo do agendamento (os números do card) ─────────────────────────────────────────────────
// tipo: 'parcelado' | 'unico' | 'recorrente'. Valores de cada ocorrência = o efetivo (exceções
// somadas uma a uma). `recorrentesAMostrar`: quantas próximas de um sem fim aparecem.
export function resumoAgendamento(schedule, { hoje, transactions = [], recorrentesAMostrar = 3 } = {}) {
  const s = schedule
  const freq = s.frequency || 'once'
  const tipo = freq === 'once' ? 'unico' : s.occurrenceType === 'installment' ? 'parcelado' : 'recorrente'
  const reg = resumoRegistradas(s, transactions)
  const total = tipo === 'parcelado' ? (Number(s.installments) || 0) : tipo === 'unico' ? 1 : null
  const quantas = tipo === 'recorrente' ? recorrentesAMostrar : Math.max(total, 1)
  const proximas = computeOccurrences(s, quantas).map(base => {
    const ef = occEfetiva(s, base)
    const p = tipo === 'parcelado' ? getNumeroParcela(s, base) : null
    const data = String(ef.date || base).slice(0, 10)
    return { base, data, valor: r2(ef.amount), numero: p?.numero ?? null, total: p?.total ?? null, atrasada: !!hoje && data < hoje }
  })
  const finito = tipo !== 'recorrente'
  // Última já consumida com pagamento/baixa (a tabela do "Ver ocorrências registradas").
  const hist = historicoOcorrencias(s, transactions).linhas
    .filter(l => l.status === STATUS_OCORRENCIA.PAGA || l.status === STATUS_OCORRENCIA.BAIXADA)
  const ult = hist.length ? hist[hist.length - 1] : null
  return {
    id: s.id, descricao: s.description || '', favorecido: s.payee || '', tipo, frequencia: freq,
    receita: s.transactionType === 'income',
    pagas: reg.registradas, puladas: reg.puladas, total,
    restantes: finito ? proximas.length : null,
    proximas,
    totalRestante: finito ? r2(proximas.reduce((acc, p) => acc + p.valor, 0)) : null,
    ultimaParcela: finito && proximas.length ? proximas[proximas.length - 1] : null,
    ultimaPaga: ult ? { data: ult.pagoEm || ult.dataRegistro, valor: ult.valorPago ?? ult.valorOriginal, numero: ult.parcela } : null,
    quitado: finito && proximas.length === 0,
    atrasadas: proximas.filter(p => p.atrasada).length,
  }
}

const FREQ = {
  daily: 'diário', weekly: 'semanal', biweekly: 'quinzenal', monthly: 'mensal', bimonthly: 'bimestral',
  quarterly: 'trimestral', quadrimestral: 'quadrimestral', semiannual: 'semestral', annual: 'anual',
}
export const rotuloFrequencia = (f) => FREQ[f] || f

// "a, b e c"
const lista = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`)
const MAX_DATAS_NO_TEXTO = 6

// A resposta em texto, montada do resumo (a IA não redige números).
export function textoDoResumo(r) {
  const nome = r.descricao || 'Este agendamento'
  const atraso = r.atrasadas ? ` (${r.atrasadas} em atraso)` : ''
  if (r.tipo === 'recorrente') {
    const p = r.proximas[0]
    return `${nome} é recorrente (${rotuloFrequencia(r.frequencia)}) e não tem número final de parcelas.`
      + (p ? ` Próxima ocorrência: ${fmtData(p.data)}, ${fmtMoeda(p.valor)}${p.atrasada ? ' (em atraso)' : ''}.` : ' Não há próxima ocorrência pendente.')
  }
  if (r.quitado) {
    const ult = r.ultimaPaga ? ` Última paga: ${fmtData(r.ultimaPaga.data)} (${fmtMoeda(r.ultimaPaga.valor)}).` : ''
    if (r.tipo === 'unico') return `${nome} já foi ${r.receita ? 'recebido' : 'pago'}: não há parcelas pendentes.${ult}`
    return `${nome} está quitado: não há parcelas pendentes (${r.pagas} de ${r.total} ${r.receita ? 'recebidas' : 'pagas'}${r.puladas ? `, ${r.puladas} pulada${r.puladas > 1 ? 's' : ''}` : ''}).${ult}`
  }
  if (r.tipo === 'unico') {
    const p = r.proximas[0]
    return `${nome} é um pagamento único de ${fmtMoeda(p.valor)}, ${p.atrasada ? 'venceu' : 'vence'} em ${fmtData(p.data)}.`
  }
  const datas = r.proximas.slice(0, MAX_DATAS_NO_TEXTO).map(p => fmtData(p.data))
  const mais = r.proximas.length > MAX_DATAS_NO_TEXTO ? `${datas.join(', ')}… (até ${fmtData(r.ultimaParcela.data)})` : lista(datas)
  const verbo = r.restantes === 1 ? 'Falta' : 'Faltam'
  return `${verbo} ${r.restantes} de ${r.total} parcelas de ${nome}${atraso}: ${mais}. Total restante: ${fmtMoeda(r.totalRestante)}.`
}
