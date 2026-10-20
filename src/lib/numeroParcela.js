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
