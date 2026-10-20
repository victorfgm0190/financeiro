// Número da parcela ("x/N") de uma ocorrência de agendamento PARCELADO — função PURA, só exibição.
// Fonte única para todas as telas (lista de Agendamentos, linhas expandidas, calendário/celular,
// prévia do Editar Agendamento). Não mexe no motor de ocorrências: segue a MESMA contagem de
// computeOccurrences — consumidas (registradas OU puladas) antes da âncora (next_occurrence ou
// Data de Início) + posição na série a partir da âncora. Puladas consomem a posição.
// Agendamento sem nº de parcelas (contínuo) ou 'Uma vez' → null (sem contador).
import { datasDaSerie, diaVencimentoDe } from './occurrences.js'

const dia = (d) => String(d || '').slice(0, 10)

export function getNumeroParcela(schedule, dataOcorrencia) {
  const s = schedule
  const total = Number(s?.installments) || 0
  if (!s || s.occurrenceType !== 'installment' || (s.frequency || 'once') === 'once' || total < 1) return null
  const data = dia(dataOcorrencia)
  if (!data) return null
  const consumidas = [...new Set([...(s.registered || []), ...(s.skipped || [])].map(dia))].sort()
  const ancora = dia(s.nextOccurrence || s.startDate)
  if (ancora) {
    const iSerie = datasDaSerie(ancora, s.frequency, total, diaVencimentoDe(s)).indexOf(data)
    if (iSerie >= 0) return { numero: consumidas.filter(d => d < ancora).length + iSerie + 1, total }
  }
  // Fora da série a partir da âncora (consumida antes dela, ou data efetiva): posição cronológica
  // entre as consumidas — a mesma numeração do "Ver ocorrências registradas".
  const iConsumida = consumidas.indexOf(data)
  const numero = iConsumida >= 0 ? iConsumida + 1 : consumidas.filter(d => d < data).length + 1
  return { numero, total }
}

// "2/4" ou null.
export function rotuloParcela(schedule, dataOcorrencia) {
  const p = getNumeroParcela(schedule, dataOcorrencia)
  return p ? `${p.numero}/${p.total}` : null
}

// Selo "x/N" de um LANÇAMENTO gerado por agendamento: só com data_ocorrencia gravada (a data-BASE
// da ocorrência baixada). O agendamento vem do schedule_id ou, no "Vincular a lançamento existente"
// (que não grava schedule_id), do registered_meta que aponta o lançamento. Agendamento não
// parcelado → null. Devolve uma função (tx) → "2/4" | null, montada uma vez por lista.
export function criarSeloParcela(schedules = []) {
  const porId = new Map()
  const porMeta = new Map()
  for (const s of schedules || []) {
    porId.set(s.id, s)
    for (const m of Object.values(s.registeredMeta || {})) if (m?.lancamento_id) porMeta.set(m.lancamento_id, s)
  }
  return (tx) => {
    if (!tx?.dataOcorrencia) return null
    const s = (tx.scheduleId && porId.get(tx.scheduleId)) || porMeta.get(tx.id)
    return s ? rotuloParcela(s, tx.dataOcorrencia) : null
  }
}
