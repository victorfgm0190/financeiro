import { query } from './_db.js'
import { contextoPerfis, recortarLeitura } from './_permissoesApi.js'
import { computeOccurrences } from '../src/lib/occurrences.js'
import { occEfetiva } from '../src/lib/fluxoCaixa.js'
import { normalizarTermo, hojeSaoPaulo } from './_ia.js'

// ASSISTENTE IA (etapa 1.1) — exclusão recusada e candidatos de BAIXA de agendamento.

// O assistente NUNCA exclui. Pedido de exclusão é respondido sem chamar o modelo (não depende do
// prompt e não gasta tokens). O prompt também recusa, para os pedidos que escaparem daqui.
const PEDIDO_EXCLUSAO = /\b(exclu\w*|apag\w*|delet\w*|remov\w*|estorn\w*)\b/
export const ehPedidoDeExclusao = (texto) => PEDIDO_EXCLUSAO.test(normalizarTermo(texto))
export const RESPOSTA_EXCLUSAO = {
  pergunta: 'Eu não excluo lançamentos nem agendamentos. Para excluir, abra o item na tela de Lançamentos ou de Agendamentos (ou pela busca 🔍) e decida por lá.',
  opcoes: [],
}

// Agendamentos PENDENTES com a mesma lógica da tela de Agendamentos: a próxima ocorrência não
// registrada/pulada (computeOccurrences — o Pagar age sempre nela) com data e valor efetivos
// (occEfetiva: override da ocorrência). Recorte pelos perfis permitidos. Filtros: favorecido
// parecido (sem acento/maiúsculas, contém/semelhante), valor com folga de 10% e vencimento entre
// −30 e +15 dias de hoje. Até 5, do mais para o menos próximo.
export const FOLGA_VALOR = 0.10
export const JANELA_DIAS = { antes: -30, depois: 15 }

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

// Semelhança 0..1: um contém o outro = 1; senão o maior entre Dice de bigramas e palavra (≥ 3
// letras) em comum (0,8).
export function semelhanca(a, b) {
  const x = normalizarTermo(a)
  const y = normalizarTermo(b)
  if (!x || !y) return 0
  if (x.includes(y) || y.includes(x)) return 1
  const bigramas = (t) => Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2))
  const bx = bigramas(x)
  const resto = bigramas(y)
  const total = bx.length + resto.length
  let comum = 0
  for (const g of bx) {
    const i = resto.indexOf(g)
    if (i >= 0) { comum++; resto.splice(i, 1) }
  }
  const palavrasY = new Set(y.split(' '))
  const palavra = x.split(' ').some(w => w.length >= 3 && palavrasY.has(w)) ? 0.8 : 0
  return Math.max(total ? (2 * comum) / total : 0, palavra)
}

export function filtrarCandidatos(agendamentos, criterio, hoje) {
  const tipoMov = criterio.tipo === 'receita' ? 'income' : criterio.tipo === 'despesa' ? 'expense' : null
  const min = criterio.valor_min || criterio.valor_informado || null
  const max = criterio.valor_max || criterio.valor_informado || min
  const alvo = min && max ? (min + max) / 2 : null
  const termo = criterio.favorecido || criterio.descricao || ''
  const out = []
  for (const s of agendamentos) {
    if (s.transactionType !== 'expense' && s.transactionType !== 'income') continue
    if (tipoMov && s.transactionType !== tipoMov) continue
    const base = computeOccurrences(s, 1)[0]
    if (!base) continue
    const e = occEfetiva(s, base)
    const dias = diasEntre(hoje, e.date)
    if (dias < JANELA_DIAS.antes || dias > JANELA_DIAS.depois) continue
    if (min && (e.amount < min * (1 - FOLGA_VALOR) || e.amount > max * (1 + FOLGA_VALOR))) continue
    const sim = termo ? Math.max(semelhanca(termo, s.payee), semelhanca(termo, s.description) * 0.9) : 1
    if (termo && sim < 0.5) continue
    const distValor = alvo ? Math.abs(e.amount - alvo) / alvo : 0
    out.push({
      schedule_id: s.id, ocorrencia: base, data: e.date, valor: Math.round(e.amount * 100) / 100,
      descricao: s.description, favorecido: s.payee, conta_id: s.accountId || null,
      tipo: s.transactionType === 'income' ? 'receita' : 'despesa',
      score: sim * 2 - distValor - Math.abs(dias) / 60,
    })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5).map(c => { delete c.score; return c })
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
