// Importar Fatura — cobrança RECORRENTE com valor diferente do agendado em mais de R$ 0,50
// (decisão 6 da Etapa 6b, 12/11/2026). Ex.: assinatura reajustada de R$ 39,90 para R$ 44,90.
//
// Até ±R$ 0,05 a baixa é automática (lib/scheduleBaixa) e de R$ 0,05 a R$ 0,50 vira pendência no
// Resumo da Importação (lib/agendamentoManda + findMatchingSchedule). Acima de R$ 0,50 o agendamento
// não era reconhecido. Agora: mesmo favorecido/loja (casaFavorecido), mesma conta, recorrente do
// usuário, diferença até ±50% do valor agendado e uma ocorrência pendente NA fatura da linha →
// a linha vira a pergunta "É este agendamento?". SEMPRE pergunta: sem resposta, a linha fica de fora
// (precisaDecisao) e nada é baixado.
//   • "Sim": a linha recebe a classificação do agendamento e, ao confirmar, a ocorrência é baixada
//     pelo valor do CARTÃO (baixarCobrancaRecorrente, o mesmo caminho do "Resolver" do Resumo);
//   • "Não": a linha entra como lançamento novo, sem baixar nada.
// PURO: nada aqui grava.
import { valorDeReferencia } from './parcelasOcorrencia.js'
import { casaAgendamento, casaFavorecido, camposDoAgendamentoParaLinha, aplicarAgendamentoNaLinha } from './agendamentoManda.js'
import { ocorrenciaDaCobranca } from './scheduleBaixa.js'

export const DIFERENCA_MINIMA = 0.50 // até aqui, o caminho de sempre (baixa automática / Resumo)
export const DIFERENCA_MAXIMA_PCT = 0.50 // ±50% do valor agendado

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const ehRecorrenteDoUsuario = (s) => !s.tipo && s.frequency && s.frequency !== 'once'

// Agendamento recorrente da mesma conta e do mesmo favorecido/loja com valor diferente em MAIS de
// R$ 0,50 e até ±50%. O de menor diferença; null se nenhum.
export function agendamentoRecorrenteParecido(tx, schedules, { excecoes = [] } = {}) {
  if (!tx?.accountId) return null
  const txPayee = (tx.payee || '').toLowerCase().trim()
  if (txPayee && excecoes.includes(txPayee)) return null
  const valor = Number(tx.amount) || 0
  let melhor = null
  for (const s of schedules || []) {
    if (!ehRecorrenteDoUsuario(s) || s.accountId !== tx.accountId) continue
    if ((s.transactionType || 'expense') !== (tx.type || 'expense')) continue
    if (!casaFavorecido(tx, s)) continue
    const ref = Number(valorDeReferencia(s)) || 0
    const dif = Math.abs(ref - valor)
    if (dif <= DIFERENCA_MINIMA || ref <= 0 || dif > ref * DIFERENCA_MAXIMA_PCT) continue
    if (!melhor || dif < melhor.dif) melhor = { s, dif }
  }
  return melhor?.s || null
}

// Linha que pode virar a pergunta: compra nova (nada do Finup casou), de despesa, do arquivo.
function elegivel(r) {
  return !r._generated && (r.type || 'expense') === 'expense'
    && !r._isDuplicate && !r._collisionTx && !r._jaLancado && !r._jaLancadoOpcoes && !r._dupLevel
}

// Aplica a pergunta nas linhas (depois de resolverLinhasRevisao / aplicarJaLancados /
// aplicarCorrespondencias). A resposta fica na linha: `_recorrenteEscolha` = id do agendamento
// ("Sim") ou 'nao'. → linhas com:
//   _recorrentePergunta: { scheduleId, descricao, valorAgendado, ocorrencia, fatura }  (sem resposta;
//                        selected = false → fica de fora, ver precisaDecisao)
//   _recorrente:         { ...o mesmo, escolha: 'sim' | 'nao' }                     (respondida)
export function aplicarRecorrentesParecidos(rows, { schedules = [], accountId, closingDay = 14, excecoes = [] } = {}) {
  const daConta = (schedules || []).filter(s => ehRecorrenteDoUsuario(s) && s.accountId === accountId)
  if (!daConta.length) return rows
  return (rows || []).map(r => {
    if (!elegivel(r)) return r
    const tx = { ...r, accountId, type: r.type || 'expense' }
    // Casa com algum agendamento até ±R$ 0,50: segue o caminho de sempre.
    if (!r._recorrenteEscolha && daConta.some(s => casaAgendamento(tx, s))) return r
    const s = agendamentoRecorrenteParecido(tx, daConta, { excecoes })
    if (!s) return r
    const occ = ocorrenciaDaCobranca(s, { faturaMonthYear: r.faturaMonthYear, date: r.date }, closingDay)
    if (!occ || (r.faturaMonthYear && occ.fatura && occ.fatura !== r.faturaMonthYear)) return r
    const info = {
      scheduleId: s.id, descricao: s.description || '', valorAgendado: r2(occ.amount || valorDeReferencia(s)),
      ocorrencia: occ.date, fatura: occ.fatura || r.faturaMonthYear || null,
    }
    if (r._recorrenteEscolha === s.id) return { ...r, _recorrente: { ...info, escolha: 'sim' } }
    if (r._recorrenteEscolha === 'nao') return { ...r, _recorrente: { ...info, escolha: 'nao' } }
    return { ...r, selected: false, _recorrentePergunta: info }
  })
}

// Patch da linha para a resposta. "Sim": classificação do agendamento (grupo, função, categoria,
// favorecido, tipo de documento) e a linha volta a ser importada; o que havia antes fica em
// `_recorrenteAntes` para "Rever". "Não": só entra como nova.
export function respostaRecorrente(row, schedule, sim) {
  if (!sim) return { _recorrenteEscolha: 'nao', selected: true }
  const campos = camposDoAgendamentoParaLinha(schedule)
  const comAgendamento = aplicarAgendamentoNaLinha(row, schedule)
  const antes = {}
  for (const k of Object.keys(campos)) antes[k] = row[k] ?? null
  const patch = { _recorrenteEscolha: schedule.id, _recorrenteAntes: antes, selected: true }
  for (const k of [...Object.keys(campos), '_doAgendamento', '_suggestedCategory', '_suggestedReserva']) {
    if (k in comAgendamento) patch[k] = comAgendamento[k]
  }
  return patch
}

// Desfaz a resposta: a linha volta a ser pergunta, com a classificação de antes.
export function desfazerRespostaRecorrente(row) {
  if (!row._recorrenteAntes) return { _recorrenteEscolha: null }
  return { ...row._recorrenteAntes, _doAgendamento: null, _recorrenteEscolha: null, _recorrenteAntes: null }
}

// Agendamento a baixar na confirmação: SÓ com "Sim" e a linha marcada para importar. null em
// qualquer outro caso (sem resposta, "Não", desmarcada) — nada é baixado.
export function baixaDoRecorrenteConfirmado(row, schedules) {
  if (!row?.selected || row._recorrente?.escolha !== 'sim') return null
  return (schedules || []).find(s => s.id === row._recorrente.scheduleId) || null
}
