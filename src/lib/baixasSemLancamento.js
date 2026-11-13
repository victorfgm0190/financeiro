// Baixas SEM lançamento: ocorrência marcada como paga (registered) sem nenhum lançamento casado —
// nem o do agendamento (Pagar), nem o apontado em registered_meta. Fonte: o mesmo casamento do
// "Ver ocorrências registradas" (historicoOcorrencias). Ficam de fora:
//   • baixas de importação/cartão (já no cartão, importada, coberta por parcela): o dinheiro está lá;
//   • agendamentos automáticos (motor da fatura, devolução gerencial, contrato): baixam sem
//     lançamento por desenho;
//   • as marcadas "pago fora do Finup" (registered_meta.tipo = 'pago_fora'): revisadas pelo usuário.
// Nada é gravado aqui: a decisão de cada baixa vive em registered_meta (sem tabela à parte).
import { historicoOcorrencias, STATUS_OCORRENCIA as ST } from './ocorrenciasRegistradas.js'
import { agendamentoDoMotor } from './camposSerie.js'
import { candidatosDaOcorrencia } from './vinculo.js'
import { TIPO_BAIXA } from './scheduleBaixa.js'

export const ehAgendamentoAutomatico = (s) =>
  !!s && (agendamentoDoMotor(s) || !!s.contratoId || String(s.id || '').startsWith('ctr_'))

export const metaPagoFora = (hoje) => ({ tipo: TIPO_BAIXA.PAGO_FORA, lancamento_id: null, import_id: null, marcado_em: hoje || null })

export const textoAlertaBaixas = (n) =>
  `${n} ${n === 1 ? 'parcela baixada' : 'parcelas baixadas'} sem lançamento`

const linhaDaBaixa = (l) => ({ data: l.dataRegistro, vencimento: l.vencimento, parcela: l.parcela, total: l.total, valor: l.valorOriginal })

// Baixas sem lançamento de UM agendamento (sem as "pago fora do Finup").
export function baixasSemLancamento(schedule, transactions = []) {
  if (!schedule || !(schedule.registered || []).length) return []
  return historicoOcorrencias(schedule, transactions).linhas
    .filter(l => l.status === ST.BAIXADA && l.semLancamento && !l.pagoFora)
    .map(linhaDaBaixa)
}

// Map(scheduleId → baixas sem lançamento) dos agendamentos do usuário. Barato para a lista: só passa
// pelo histórico a série com alguma data registrada sem lançamento vivo no meta, e com os lançamentos
// dela (os do scheduleId + os citados no meta) em vez da lista inteira.
export function mapaBaixasSemLancamento(schedules = [], transactions = []) {
  const out = new Map()
  const porId = new Map()
  const porAgendamento = new Map()
  for (const t of transactions || []) {
    porId.set(t.id, t)
    if (t.scheduleId) {
      if (!porAgendamento.has(t.scheduleId)) porAgendamento.set(t.scheduleId, [])
      porAgendamento.get(t.scheduleId).push(t)
    }
  }
  for (const s of schedules || []) {
    if (!(s.registered || []).length || ehAgendamentoAutomatico(s)) continue
    const meta = s.registeredMeta || {}
    const suspeita = (s.registered || []).some(d => {
      const m = meta[d]
      if (m?.tipo === TIPO_BAIXA.PAGO_FORA || ['ja_no_cartao', 'importado', 'coberta_parcela'].includes(m?.tipo)) return false
      return !(m?.lancamento_id && porId.has(m.lancamento_id))
    })
    if (!suspeita) continue
    const doMeta = Object.values(meta).map(m => m?.lancamento_id && porId.get(m.lancamento_id)).filter(Boolean)
    const txs = [...new Set([...(porAgendamento.get(s.id) || []), ...doMeta])]
    const lista = baixasSemLancamento(s, txs)
    if (lista.length) out.set(s.id, lista)
  }
  return out
}

// Visão "Baixas sem lançamento": uma linha por baixa, com o lançamento solto que parece ser o
// pagamento (melhor candidato do Vincular com o mesmo valor, ±R$ 0,05), quando houver.
// `todos`: TODOS os agendamentos (o vínculo de outro perfil também prende o lançamento).
export function revisaoBaixasSemLancamento(schedules = [], transactions = [], { rateios = null, todos = schedules } = {}) {
  const mapa = mapaBaixasSemLancamento(schedules, transactions)
  const porId = new Map((schedules || []).map(s => [s.id, s]))
  const linhas = []
  for (const [id, baixas] of mapa) {
    const s = porId.get(id)
    for (const b of baixas) {
      const cand = candidatosDaOcorrencia(s, b.data, { transactions, schedules: todos, rateios })
        .find(c => Math.abs(c.diferenca) <= 0.05)
      linhas.push({ key: `${id}|${b.data}`, schedule: s, ...b, candidato: cand ? cand.tx : null })
    }
  }
  return linhas.sort((a, b) => b.data.localeCompare(a.data) || String(a.schedule.description || '').localeCompare(String(b.schedule.description || '')))
}
