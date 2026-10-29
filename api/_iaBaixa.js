import { query } from './_db.js'
import { contextoPerfis, recortarLeitura } from './_permissoesApi.js'
import { computeOccurrences } from '../src/lib/occurrences.js'
import { occEfetiva } from '../src/lib/fluxoCaixa.js'
import { normalizarTermo, hojeSaoPaulo } from './_ia.js'

// ASSISTENTE IA — exclusão recusada e candidatos de BAIXA de agendamento.

// O assistente NUNCA exclui. Pedido de exclusão é respondido sem chamar o modelo (não depende do
// prompt e não gasta tokens). O prompt também recusa, para os pedidos que escaparem daqui.
// ESTORNO não é exclusão (cria o lançamento inverso): não entra aqui — vira abrir_tela (🔴).
const PEDIDO_EXCLUSAO = /\b(exclu\w*|apag\w*|delet\w*|remov\w*)\b/
export const ehPedidoDeExclusao = (texto) => PEDIDO_EXCLUSAO.test(normalizarTermo(texto))
export const RESPOSTA_EXCLUSAO = {
  pergunta: 'Eu não excluo lançamentos nem agendamentos. Para excluir, abra o item na tela de Lançamentos ou de Agendamentos (ou pela busca 🔍) e decida por lá.',
  opcoes: [],
}

// Valor dito de forma aproximada ("uns 200", "próximo de 200", "mais ou menos", "algo assim")
// nunca filtra: só ordena. O backend confere o texto além do que o modelo marcou em valor_exato.
const VALOR_APROXIMADO = /\b(uns|umas|cerca|perto|proximo|aproximad\w*|mais ou menos|algo assim|por volta|em torno|na faixa|tipo)\b/
export const valorDitoAproximado = (texto) => VALOR_APROXIMADO.test(normalizarTermo(texto))

// Agendamentos PENDENTES com a mesma lógica da tela de Agendamentos: a próxima ocorrência não
// registrada/pulada (computeOccurrences — o Pagar age sempre nela) com data e valor efetivos
// (occEfetiva: override da ocorrência), vencimento entre −30 (atrasados inclusive) e +15 dias.
// Recorte pelos perfis permitidos.
//   • NOME filtra: cada palavra do termo (sem acento/maiúsculas) contida no favorecido OU na
//     descrição ("Carlos" casa "HORARIOS SR CARLOS" e "CARLOS FERREIRA ANDRADE - LUCAS SOUZA").
//   • VALOR só filtra quando exato (valor_exato, faixa de ±R$ 0,05·1% de arredondamento); aproximado
//     ou faixa ("uns 200, 220") só ORDENA, pela distância.
//   • TIPO só prioriza (receita de "me pagou/recebi", despesa de "paguei"); sem tipo, os dois.
// Ordem: tipo pedido primeiro, depois valor mais próximo, depois vencimento mais perto de hoje.
export const JANELA_DIAS = { antes: -30, depois: 15 }
export const MAX_CANDIDATOS = 5
const TOLERANCIA_EXATO = 0.01 // 1%: "de 250" casa 250,00 e 249,90

const dataStr = (v) => (!v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000)

// Linha do banco → campos que o motor de ocorrências lê (mesmos nomes do rowToSchedule do app).
export const agendamentoDaLinha = (r) => ({
  id: r.id, description: r.description || '', transactionType: r.transaction_type, accountId: r.account_id,
  amount: Number(r.amount) || 0, payee: r.payee || '', frequency: r.frequency, startDate: dataStr(r.start_date),
  occurrenceType: r.occurrence_type || 'continuous', installments: r.installments,
  registered: Array.isArray(r.registered) ? r.registered : [], skipped: Array.isArray(r.skipped) ? r.skipped : [],
  overrides: r.overrides || {}, nextOccurrence: dataStr(r.next_occurrence),
})

// Palavras do termo (≥ 2 letras, sem "de/do/da/sr…") todas contidas no texto do agendamento.
const IGNORAR = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'sr', 'sra', 'dr', 'dra', 'e'])
export function casaNome(termo, ...textos) {
  const palavras = normalizarTermo(termo).split(' ').filter(w => w.length >= 2 && !IGNORAR.has(w))
  if (!palavras.length) return false
  const alvo = textos.map(normalizarTermo).join(' ')
  return palavras.every(w => alvo.includes(w))
}

export function filtrarCandidatos(agendamentos, criterio, hoje) {
  const tipoPedido = criterio.tipo === 'receita' ? 'income' : criterio.tipo === 'despesa' ? 'expense' : null
  const exato = criterio.valor_exato && criterio.valor_informado > 0 ? criterio.valor_informado : null
  const min = criterio.valor_min || criterio.valor_informado || null
  const max = criterio.valor_max || criterio.valor_informado || min
  const alvo = min && max ? (min + max) / 2 : null
  const termo = criterio.favorecido || criterio.descricao || ''
  const out = []
  for (const s of agendamentos) {
    if (s.transactionType !== 'expense' && s.transactionType !== 'income') continue
    if (termo && !casaNome(termo, s.payee, s.description)) continue
    const base = computeOccurrences(s, 1)[0]
    if (!base) continue
    const e = occEfetiva(s, base)
    const dias = diasEntre(hoje, e.date)
    if (dias < JANELA_DIAS.antes || dias > JANELA_DIAS.depois) continue
    if (exato && Math.abs(e.amount - exato) > Math.max(0.05, exato * TOLERANCIA_EXATO)) continue
    out.push({
      schedule_id: s.id, ocorrencia: base, data: e.date, valor: Math.round(e.amount * 100) / 100,
      descricao: s.description, favorecido: s.payee, conta_id: s.accountId || null,
      tipo: s.transactionType === 'income' ? 'receita' : 'despesa',
      atrasado: dias < 0,
      ordem: [tipoPedido && s.transactionType !== tipoPedido ? 1 : 0, alvo ? Math.abs(e.amount - alvo) : 0, Math.abs(dias)],
    })
  }
  const cmp = (a, b) => a.ordem[0] - b.ordem[0] || a.ordem[1] - b.ordem[1] || a.ordem[2] - b.ordem[2]
  return out.sort(cmp).slice(0, MAX_CANDIDATOS).map(c => { delete c.ordem; return c })
}

export async function buscarCandidatosBaixa(user, criterio, hoje = hojeSaoPaulo(), q = query) {
  const rows = await q(
    `SELECT id, description, transaction_type, account_id, to_account_id, amount, payee, frequency, start_date,
            occurrence_type, installments, registered, skipped, overrides, next_occurrence, reserva_funcao_id
       FROM agendamentos
      WHERE transaction_type IN ('expense', 'income') AND COALESCE(is_provisao, false) = false`)
  const visiveis = recortarLeitura('agendamentos', rows, await contextoPerfis(q, user))
  return filtrarCandidatos(visiveis.map(agendamentoDaLinha), criterio, hoje)
}
