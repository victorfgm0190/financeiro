// Regras de DATA na edição de uma série que já tem ocorrências consumidas (Editar Agendamento).
// Puras; o formulário pergunta/bloqueia e aplica.
//
//   1. A próxima data (âncora) não pode cair antes nem em cima de uma ocorrência já baixada.
//   2. A Data de Início não pode passar de uma baixa COM lançamento (a baixa ficaria antes da série).
//      Baixas SEM lançamento antes da nova Data de Início (reaproveitar a série para outro ano):
//      o formulário pergunta se desfaz.
//   3. Empurrar a próxima data para frente re-ancora a série: as pendentes que ficam para trás
//      viram puladas (com a confirmação do usuário) — nada some sem ficar registrado.
import { historicoOcorrencias, STATUS_OCORRENCIA as ST } from './ocorrenciasRegistradas.js'
import { FREQ_MENSAIS } from './occurrences.js'

const dia = (d) => String(d || '').slice(0, 10)
export const dataBR = (d) => dia(d).split('-').reverse().join('/')

// Regra 1 → mensagem de erro ou null.
export function erroProximaData(schedule, novaAncora) {
  const regs = (schedule?.registered || []).map(dia).filter(Boolean).sort()
  const ultima = regs[regs.length - 1]
  if (!novaAncora || !ultima || dia(novaAncora) > ultima) return null
  return `A próxima data precisa ser depois da última ocorrência baixada (${dataBR(ultima)}).`
}

// Regra 2 → { comLancamento: [datas], semLancamento: [datas] } das baixas antes da nova Data de Início.
export function baixasAntesDoInicio(schedule, novoInicio, transactions = []) {
  const inicio = dia(novoInicio)
  const out = { comLancamento: [], semLancamento: [] }
  if (!schedule || !inicio || !(schedule.registered || []).some(d => dia(d) < inicio)) return out
  for (const l of historicoOcorrencias(schedule, transactions).linhas) {
    if (!l.dataRegistro || l.dataRegistro >= inicio || l.status === ST.PULADA) continue
    if (l.status === ST.BAIXADA && l.semLancamento) out.semLancamento.push(l.dataRegistro)
    else out.comLancamento.push(l.dataRegistro)
  }
  return out
}

export function erroDataInicio(antes) {
  if (!antes?.comLancamento?.length) return null
  const d = antes.comLancamento[antes.comLancamento.length - 1]
  return `A Data de Início não pode passar da ocorrência já paga de ${dataBR(d)}. Para começar de novo, crie outro agendamento.`
}

export const perguntaDesfazerBaixas = (datas) => (datas.length === 1
  ? `Esta série tem 1 baixa sem lançamento de ${dataBR(datas[0])}. Deseja desfazê-la?`
  : `Esta série tem ${datas.length} baixas sem lançamento (${datas.map(dataBR).join(', ')}). Deseja desfazê-las?`)

// Regra 3: pendentes da série ANTIGA (em ordem) que ficam para trás quando a ocorrência `occDate` é
// empurrada para `novaAncora` re-ancorando a série. Uma delas "vai" para a nova data — a do MESMO
// MÊS em frequência mensal (o mesmo critério do re-chaveamento em planoAgendamento), senão a última
// até a nova data; as anteriores à nova data ficam para trás. Ajuste dentro do período → nenhuma.
export function deixadasParaTras(pendentesAntigas, occDate, novaAncora, frequency = 'monthly') {
  const x = dia(novaAncora)
  if (!x || !occDate || x <= dia(occDate)) return []
  const daqui = (pendentesAntigas || []).map(dia).filter(d => d >= dia(occDate))
  const antes = daqui.filter(d => d <= x)
  const mesmoMes = FREQ_MENSAIS.has(frequency) ? daqui.find(d => d.slice(0, 7) === x.slice(0, 7)) : null
  const vai = mesmoMes || antes[antes.length - 1]
  return antes.filter(d => d !== vai)
}

// Aplica as decisões no agendamento final (depois do plano da edição).
export function aplicarDecisoesDeDatas(schedule, { pular = [], desfazer = [] } = {}) {
  let s = schedule
  if (desfazer.length) {
    const fora = new Set(desfazer)
    const meta = { ...(s.registeredMeta || {}) }
    for (const d of desfazer) delete meta[d]
    s = { ...s, registered: (s.registered || []).filter(d => !fora.has(d)), registeredMeta: meta }
  }
  if (pular.length) s = { ...s, skipped: [...new Set([...(s.skipped || []), ...pular])].sort() }
  return s
}

// Histórico (A2): mudanças na ESTRUTURA da série — Data de Início, frequência e nº de parcelas —,
// que não são campos da regra de séries mas mudam quais ocorrências existem.
export function mudancasDeEstrutura(antes, depois) {
  const out = []
  if (!antes || !depois) return out
  const par = (campo, de, para) => {
    if (para === undefined) return
    if (String(de ?? '') !== String(para ?? '')) out.push({ campo, de: de ?? null, para: para ?? null })
  }
  const recorrente = (antes.frequency || 'once') !== 'once' || (depois.frequency || 'once') !== 'once'
  if (recorrente && depois.startDate !== undefined) par('startDate', dia(antes.startDate) || null, dia(depois.startDate) || null)
  par('frequency', antes.frequency || null, depois.frequency)
  const nParcelas = (x) => (x.occurrenceType === 'installment' ? (Number(x.installments) || null) : null)
  if ('installments' in depois || 'occurrenceType' in depois) par('installments', nParcelas(antes), nParcelas({ ...antes, ...depois }))
  return out
}
