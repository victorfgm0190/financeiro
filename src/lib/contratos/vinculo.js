// VÍNCULO de agendamentos já existentes a um contrato — funções puras.
// Busca: favorecido igual/semelhante (sem acento, sem maiúsculas, abreviações como "imob." =
// "imobiliaria", casamento por prefixo de palavra) OU descrição com "aluguel"/"condominio";
// recorrente, valor ±20% e dia de vencimento próximo pesam a favor. Cada candidato traz os motivos.
import { computeOccurrences } from '../occurrences.js'
import { agendamentoDoMotor } from '../camposSerie.js'
import { ymDe, diaDe } from './datas.js'
import { r2 } from './parcelas.js'

const ABREVIACOES = {
  imob: 'imobiliaria', imobil: 'imobiliaria', adm: 'administradora', admin: 'administradora',
  administ: 'administradora', cond: 'condominio', condom: 'condominio', ed: 'edificio', edif: 'edificio',
  res: 'residencial', resid: 'residencial', emp: 'empreendimentos', empr: 'empreendimentos', cia: 'companhia',
}
const IGNORAR = new Set(['ltda', 'me', 'epp', 'sa', 'eireli', 'de', 'da', 'do', 'das', 'dos', 'e'])

export function tokensNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(Boolean).map(t => ABREVIACOES[t] || t).filter(t => !IGNORAR.has(t))
}

export const normalizarNome = (s) => tokensNome(s).join(' ')

const casaPalavra = (x, y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))

// 1 = mesmo nome; casamento parcial pela média entre "quanto do menor" e "quanto do maior" casou.
export function similaridadeNome(a, b) {
  const ta = tokensNome(a), tb = tokensNome(b)
  if (!ta.length || !tb.length) return 0
  if (ta.join(' ') === tb.join(' ')) return 1
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const usados = new Set()
  let casadas = 0
  for (const x of menor) {
    const i = maior.findIndex((y, j) => !usados.has(j) && casaPalavra(x, y))
    if (i >= 0) { usados.add(i); casadas++ }
  }
  return (casadas / menor.length + casadas / maior.length) / 2
}

const SEMELHANTE = 0.6

// Candidatos ao vínculo, por pontuação. → [{ schedule, score, motivos, papel, pagas, pendentes, proxima }]
export function candidatosVinculo(contrato, schedules) {
  const tipoTx = contrato.tipo === 'receber' ? 'income' : 'expense'
  const diaAluguel = Number(contrato.dia_vencimento) || diaDe(contrato.data_inicio)
  const diaCond = Number(contrato.dia_vencimento_condominio) || diaAluguel
  const out = []
  for (const s of schedules || []) {
    if (s.contratoId || agendamentoDoMotor(s) || s.isProvisao || s.financingInstallmentId) continue
    if (s.transactionType !== tipoTx) continue
    const motivos = []
    let score = 0
    let papel = null
    const simF = similaridadeNome(s.payee, contrato.favorecido)
    const simC = contrato.favorecido_condominio ? similaridadeNome(s.payee, contrato.favorecido_condominio) : 0
    if (simC >= SEMELHANTE && simC > simF) {
      score += simC >= 0.99 ? 50 : 35
      motivos.push(simC >= 0.99 ? 'favorecido do condomínio igual' : 'favorecido do condomínio semelhante')
      papel = 'condominio'
    } else if (simF >= SEMELHANTE) {
      score += simF >= 0.99 ? 50 : 35
      motivos.push(simF >= 0.99 ? 'favorecido igual' : 'favorecido semelhante')
      papel = 'aluguel'
    }
    const desc = ` ${normalizarNome(s.description)} `
    if (desc.includes(' aluguel ')) {
      score += 25
      motivos.push('descrição com "aluguel"')
      papel = papel || 'aluguel'
    }
    if (desc.includes(' condominio ')) {
      score += 25
      motivos.push('descrição com "condomínio"')
      if (papel !== 'condominio' && simF < 0.99) papel = 'condominio'
    }
    if (!score) continue

    const recorrente = (s.frequency || 'once') !== 'once'
    if (recorrente) { score += 10; motivos.push('recorrente') }
    const ref = papel === 'condominio' ? Number(contrato.valor_condominio_previsto) : Number(contrato.valor_base)
    const refs = papel === 'condominio' ? [ref] : [ref, ref - (Number(contrato.bonificacao_valor) || 0)]
    if (refs.some(v => v > 0 && Math.abs(Number(s.amount) - v) / v <= 0.2)) { score += 10; motivos.push('valor próximo (±20%)') }
    const proxima = computeOccurrences(s, 1)[0] || null
    const diaRef = papel === 'condominio' ? diaCond : diaAluguel
    const diaS = diaDe(proxima || s.startDate)
    if (diaS && diaRef && Math.abs(diaS - diaRef) <= 3) { score += 5; motivos.push('vencimento em dia próximo') }

    const pagas = (s.registered || []).length
    const consumidas = pagas + (s.skipped || []).length
    const pendentes = !recorrente ? (pagas ? 0 : 1)
      : s.occurrenceType === 'installment' ? Math.max(0, (Number(s.installments) || 0) - consumidas) : null
    out.push({ schedule: s, score, motivos, papel: papel || 'aluguel', pagas, pendentes, proxima })
  }
  return out.sort((a, b) => b.score - a.score)
}

// Vínculo de uma série ao contrato (decisão D2): o histórico fica como está; as pendentes deixam de
// existir na série e o contrato passa a gerar os meses seguintes.
//   'once'                       → só ganha contratoId/papel (cobre o mês dela);
//   recorrente com consumidas    → vira parcelada com total = consumidas (cobre esses meses);
//   recorrente sem nada consumido→ vira a parcela única da próxima ocorrência (cobre esse mês).
// → { changes, cobertas: ['AAAA-MM'], antes }
export function planoVinculo(serie, papel, contratoId) {
  const base = { contratoId, contratoPapel: papel }
  const antes = {
    frequency: serie.frequency, startDate: serie.startDate, occurrenceType: serie.occurrenceType,
    installments: serie.installments ?? null, nextOccurrence: serie.nextOccurrence ?? null,
  }
  if ((serie.frequency || 'once') === 'once') {
    return { changes: base, cobertas: [ymDe(serie.startDate)], antes }
  }
  const consumidas = [...(serie.registered || []), ...(serie.skipped || [])]
  if (consumidas.length) {
    return {
      changes: { ...base, occurrenceType: 'installment', installments: consumidas.length },
      cobertas: [...new Set(consumidas.map(ymDe))],
      antes,
    }
  }
  const proxima = computeOccurrences(serie, 1)[0] || serie.startDate
  return {
    changes: {
      ...base, frequency: 'once', startDate: proxima, nextOccurrence: null, occurrenceType: 'continuous', installments: null,
      valorStatus: 'confirmado',
      composicao: { itens: [{ tipo: 'mantido', desc: 'Valor da série vinculada', valor: r2(serie.amount) }], total: r2(serie.amount), manual: true },
    },
    cobertas: [ymDe(proxima)],
    antes,
  }
}

// Desvínculo: só tira o contrato da série (nada é apagado nem desfeito).
export const planoDesvinculo = () => ({ contratoId: null, contratoPapel: null })
