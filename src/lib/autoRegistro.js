// Ocorrências a registrar — funções PURAS (sem React), extraídas para teste direto.
//
// Regra da ocorrência com data alterada na prévia (overrides[dataOriginal].date):
//   • quem decide se ela venceu é a data EFETIVA (occEfetiva), não a original;
//   • o lançamento é gravado na data efetiva;
//   • `registered` recebe a chave ORIGINAL — é ela que identifica a ocorrência na série
//     (computeOccurrences / skipped / overrides são todos chaveados pela original).
import { computePendingUpTo } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// Ocorrências PENDENTES do agendamento cuja data EFETIVA já chegou (<= hojeStr).
// Devolve [{ occurrenceDate, date, amount }]: occurrenceDate = chave original (vai para
// registered), date/amount = efetivos (vão para o lançamento).
//
// A busca vai além de hoje até a maior chave de override: uma ocorrência de 15/10 antecipada
// para 08/10 tem chave futura e computePendingUpTo(hoje) não a veria. As que foram adiadas para
// depois de hoje ficam de fora mesmo com a chave original já vencida.
export function ocorrenciasVencidas(schedule, hojeStr) {
  const chavesOverride = Object.keys(schedule.overrides || {}).filter(k => DATA_RE.test(k))
  const horizonte = chavesOverride.reduce((max, k) => (k > max ? k : max), hojeStr)
  return computePendingUpTo(schedule, horizonte)
    .map(occurrenceDate => {
      const ef = occEfetiva(schedule, occurrenceDate)
      return { occurrenceDate, date: ef.date, amount: Number(ef.amount) || 0 }
    })
    .filter(o => o.date <= hojeStr)
}

// Execução das transferências do modal de início de mês. registerScheduleOccurrence é a fonte
// ÚNICA: cria a transferência (com scheduleId, valor e data efetivos) e marca a ocorrência em
// registered. O modal chamava também addTransaction com a mesma transferência — saía em dobro,
// e a cópia sem scheduleId nem era estornada junto com a ocorrência.
export function executarTransferenciasInicioMes(list, { getNextOccurrences, registerScheduleOccurrence }) {
  for (const sch of list) {
    const occurrenceDate = getNextOccurrences(sch, 1)[0]
    if (!occurrenceDate) continue
    registerScheduleOccurrence(sch.id, occEfetiva(sch, occurrenceDate).date, occurrenceDate)
  }
}
