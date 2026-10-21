// Estorno de lançamento que pagou parcela de CONTRATO — funções puras.
// Contrato rescindido ou encerrado: reabrir a parcela criaria uma pendência solta, então o app
// pergunta. "Sim" = volta a pendente (a ficha avisa); "Não" = a ocorrência fica cancelada (pulada).
import { ocorrenciasDoLancamento } from '../scheduleBaixa.js'

export const STATUS_SEM_PARCELA_NOVA = new Set(['rescindido', 'encerrado'])

// → null (não é de contrato) | { contrato, schedule, ocorrencia, perguntar }. Rodar ANTES do estorno
// (depois dele a baixa já saiu do agendamento e a ocorrência não é mais achada).
export function analisarEstorno(tx, schedules, contratoPorId) {
  if (!tx) return null
  const lista = schedules || []
  const s = lista.find(x => x.id === tx.scheduleId && x.contratoId)
    || lista.find(x => x.contratoId && ocorrenciasDoLancamento(x, tx).length)
    || null
  const contratoId = s?.contratoId || tx.contratoId
  if (!contratoId) return null
  const contrato = contratoPorId(contratoId) || null
  const ocorrencia = s
    ? ocorrenciasDoLancamento(s, tx)[0] || ((s.frequency || 'once') === 'once' && (s.registered || []).length ? s.startDate : null)
    : null
  return {
    contrato, schedule: s, ocorrencia,
    perguntar: !!contrato && STATUS_SEM_PARCELA_NOVA.has(contrato.status) && !!s && !!ocorrencia,
  }
}

// "Não reabrir": a ocorrência estornada fica pulada — não vira pendência nem volta na regeneração.
export function cancelarOcorrencia(s, data) {
  return { ...s, skipped: [...new Set([...(s.skipped || []), data])] }
}

// Parcelas pendentes num contrato que não está ativo (reabertas por estorno): aviso da ficha.
export const pendentesForaDaVigencia = (contrato, linhas) =>
  contrato && contrato.status !== 'ativo' ? linhas.filter(l => !l.paga) : []
