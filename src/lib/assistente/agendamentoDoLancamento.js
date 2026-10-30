// Assistente IA — antes de CRIAR um lançamento (texto, SMS, foto), procura AGENDAMENTO PENDENTE
// que ele esteja pagando. Achou → a prévia oferece dar baixa nele (PreviaBaixa / PayModal, o fluxo
// normal do Pagar) em vez de criar um lançamento solto. PURO.
//
// Bate quando TUDO vale:
//   • mesmo tipo (despesa/receita); fora provisões, transferências e pagamento de fatura;
//   • valor: ±R$ 0,05; recorrente de valor VARIÁVEL (valor projetado, ou já pago com valor
//     diferente do agendado) → ±10% do valor da ocorrência;
//   • nome parecido: as palavras de um lado (favorecido ou descrição) contidas no texto do outro,
//     sem acento/maiúsculas ("CONTA VIVO" × "Conta Vivo");
//   • a PRÓXIMA ocorrência pendente (a que o Pagar baixaria) com data efetiva a até ±7 dias da
//     data do lançamento (atrasadas inclusive);
//   • mesma conta, OU lançamento de cartão e agendamento sem cartão definido (débito automático
//     no cartão de um agendamento cadastrado na conta corrente ou sem conta).
// Saída no formato dos candidatos de baixa (api/_iaBaixa.js): { schedule_id, ocorrencia, data,
// valor, descricao, favorecido, conta_id, tipo, atrasado }, o mais parecido primeiro.
import { normalizarTermo } from './texto.js'
import { occEfetiva } from '../fluxoCaixa.js'

export const JANELA_DIAS_AGENDAMENTO = 7
export const TOLERANCIA_VALOR = 0.05
export const TOLERANCIA_VARIAVEL = 0.10

const r2 = (n) => Math.round(n * 100) / 100
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000)

const IGNORAR = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'e', 'em', 'no', 'na', 'sr', 'sra', 'dr', 'dra'])
const palavras = (s) => normalizarTermo(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 2 && !IGNORAR.has(w))

// Todas as palavras de algum texto de um lado aparecem no outro (e ao menos uma tem 3+ letras).
function contidas(textos, alvo) {
  const naAlvo = new Set(alvo)
  return textos.some(t => {
    const ws = palavras(t)
    return ws.some(w => w.length >= 3) && ws.every(w => naAlvo.has(w))
  })
}
export function nomesParecidos(lanc, schedule) {
  const doLanc = [lanc.payee, lanc.description].filter(Boolean)
  const doAgend = [schedule.payee, schedule.description].filter(Boolean)
  return contidas(doLanc, doAgend.flatMap(palavras)) || contidas(doAgend, doLanc.flatMap(palavras))
}

// Valor variável: projetado, ou algum pagamento ligado com valor diferente do agendado.
export function valorVariavel(schedule, transactions = []) {
  if ((schedule.occurrenceType || 'continuous') === 'installment') return false
  if (schedule.valorStatus === 'projetado') return true
  return transactions.some(t => t.scheduleId === schedule.id && Math.abs((Number(t.amount) || 0) - schedule.amount) > TOLERANCIA_VALOR)
}

// lanc: { type: 'expense' | 'income', amount, date, accountId, payee, description }.
export function agendamentosDoLancamento(lanc, { schedules = [], accounts = [], transactions = [], getNextOccurrences }) {
  const valor = Number(lanc?.amount)
  if (!(valor > 0) || !lanc.date || !lanc.accountId) return []
  if (lanc.type !== 'expense' && lanc.type !== 'income') return []
  const tipoDe = (id) => accounts.find(a => a.id === id)?.type
  const lancNoCartao = tipoDe(lanc.accountId) === 'credit'
  const out = []
  for (const s of schedules) {
    if (s.transactionType !== lanc.type || s.isProvisao || s.tipo === 'pagamento_fatura') continue
    const mesmaConta = s.accountId === lanc.accountId
    if (!mesmaConta && !(lancNoCartao && tipoDe(s.accountId) !== 'credit')) continue
    if (!nomesParecidos(lanc, s)) continue
    const base = getNextOccurrences(s, 1)[0]
    if (!base) continue
    const e = occEfetiva(s, base)
    const dias = diasEntre(lanc.date, e.date)
    if (Math.abs(dias) > JANELA_DIAS_AGENDAMENTO) continue
    const dif = Math.abs((Number(e.amount) || 0) - valor)
    const tolerancia = valorVariavel(s, transactions) ? Math.max(TOLERANCIA_VALOR, (Number(e.amount) || 0) * TOLERANCIA_VARIAVEL) : TOLERANCIA_VALOR
    if (dif > tolerancia + 1e-9) continue
    out.push({
      schedule_id: s.id, ocorrencia: base, data: e.date, valor: r2(Number(e.amount) || 0),
      descricao: s.description, favorecido: s.payee, conta_id: s.accountId || null,
      tipo: s.transactionType === 'income' ? 'receita' : 'despesa',
      atrasado: e.date < lanc.date,
      ordem: [mesmaConta ? 0 : 1, dif, Math.abs(dias)],
    })
  }
  const cmp = (a, b) => a.ordem[0] - b.ordem[0] || a.ordem[1] - b.ordem[1] || a.ordem[2] - b.ordem[2]
  return out.sort(cmp).map(c => { delete c.ordem; return c })
}

// Critério para a PreviaBaixa: baixa com a conta, a data e o valor do lançamento (SMS/foto/texto).
export const criterioDoLancamento = (lanc) => ({
  valor_informado: Number(lanc.amount), valor_exato: true, data_pagamento: lanc.date, conta_id: lanc.accountId,
  tipo: lanc.type === 'income' ? 'receita' : 'despesa', favorecido: lanc.payee || null, descricao: lanc.description || null,
})
