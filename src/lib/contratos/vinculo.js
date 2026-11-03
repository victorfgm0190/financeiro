// VÍNCULO de agendamentos já existentes a um contrato — funções puras.
// Busca: favorecido igual/semelhante (sem acento, sem maiúsculas, abreviações como "imob." =
// "imobiliaria", casamento por prefixo de palavra) OU, só em contrato de Aluguel, descrição com
// "aluguel"/"condominio"; recorrente, valor ±20% e dia de vencimento próximo pesam a favor. Cada
// candidato traz os motivos.
import { computeOccurrences, advanceByFrequency } from '../occurrences.js'
import { agendamentoDoMotor } from '../camposSerie.js'
import { mapaVinculos } from '../vinculo.js'
import { ymDe, diaDe } from './datas.js'
import { r2 } from './parcelas.js'
import { ehAluguel } from './rotulos.js'

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
// Pontuação a partir da qual o candidato já vem marcado no modal (favorecido igual, ou descrição
// + favorecido semelhante).
export const SCORE_FORTE = 50

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
    let papelFav = null
    const simF = similaridadeNome(s.payee, contrato.favorecido)
    const simC = contrato.favorecido_condominio ? similaridadeNome(s.payee, contrato.favorecido_condominio) : 0
    if (simC >= SEMELHANTE && simC > simF) {
      score += simC >= 0.99 ? 50 : 35
      motivos.push(simC >= 0.99 ? 'favorecido do condomínio igual' : 'favorecido do condomínio semelhante')
      papelFav = 'condominio'
    } else if (simF >= SEMELHANTE) {
      score += simF >= 0.99 ? 50 : 35
      motivos.push(simF >= 0.99 ? 'favorecido igual' : 'favorecido semelhante')
      papelFav = 'aluguel'
    }
    // Palavras de aluguel/condomínio só pontuam em contrato de Aluguel.
    const desc = ` ${normalizarNome(s.description)} `
    const aluguel = ehAluguel(contrato)
    const temAluguel = aluguel && desc.includes(' aluguel ')
    const temCond = aluguel && desc.includes(' condominio ')
    if (temAluguel) { score += 25; motivos.push('descrição com "aluguel"') }
    if (temCond) { score += 25; motivos.push('descrição com "condomínio"') }
    if (!score) continue
    // A descrição decide o papel; só sem ela (ou com as duas palavras) vale o favorecido.
    const papel = temAluguel && !temCond ? 'aluguel' : temCond && !temAluguel ? 'condominio' : papelFav || 'aluguel'

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
    out.push({ schedule: s, score, motivos, papel, pagas, pendentes, proxima })
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
    // A âncora vai para depois da última consumida: a pré-contagem do motor (consumidas antes da
    // âncora) fecha o total e não sobra pendente — nem uma mais antiga que ficou sem pagar.
    const ultima = consumidas.slice().sort().at(-1)
    return {
      changes: {
        ...base, occurrenceType: 'installment', installments: consumidas.length,
        nextOccurrence: advanceByFrequency(ultima, serie.frequency),
      },
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

// ── Vínculo de LANÇAMENTO avulso a uma parcela (C2/C3) ──────────────────────────────────────────
const diasEntre = (a, b) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)

// Lançamento que pode receber o vínculo: mesmo tipo, mesma conta do contrato (ou conta do mesmo
// perfil), sem contrato e sem baixa de agendamento. `contasDoPerfil`: Set de ids de contas do perfil.
export function lancamentoLivre(tx, contrato, { vinculados, contasDoPerfil = null } = {}) {
  const tipoTx = contrato.tipo === 'receber' ? 'income' : 'expense'
  if (!tx || tx.type !== tipoTx || tx.contratoId || tx.scheduleId || tx.toAccountId) return false
  if (tx.isEspelho || tx.reservaAuto || tx.gerencialScheduleId) return false
  if (vinculados?.has(tx.id)) return false
  const mesmaConta = contrato.conta_id && tx.accountId === contrato.conta_id
  const mesmoPerfil = contasDoPerfil ? contasDoPerfil.has(tx.accountId) : false
  return !!(mesmaConta || mesmoPerfil)
}

// Candidatos para "Vincular pagamento" numa linha do contrato, do mais provável ao menos:
// favorecido semelhante, mesma categoria, mesmo valor, data mais próxima, depois o resto.
//   alvo: { papel, vencimento, valor } — a linha; filtro: { texto, de, ate } (busca do modal).
// → [{ tx, score, motivos, dias }]
export function candidatosLancamento(contrato, transactions, schedules, alvo, { contasDoPerfil = null, filtro = {} } = {}) {
  const vinculados = mapaVinculos(schedules || [])
  const papel = alvo?.papel || 'aluguel'
  const fav = papel === 'condominio' ? contrato.favorecido_condominio || contrato.favorecido : contrato.favorecido
  const cat = papel === 'condominio' ? contrato.categoria_condominio_id || contrato.categoria_id : contrato.categoria_id
  const valorAlvo = r2(alvo?.valor)
  const texto = normalizarNome(filtro.texto || '')
  const out = []
  for (const tx of transactions || []) {
    if (!lancamentoLivre(tx, contrato, { vinculados, contasDoPerfil })) continue
    if (filtro.de && tx.date < filtro.de) continue
    if (filtro.ate && tx.date > filtro.ate) continue
    if (texto) {
      const valorTxt = String(r2(tx.amount)).replace('.', ',')
      const alvoTxt = ` ${normalizarNome(`${tx.payee || ''} ${tx.description || ''}`)} ${valorTxt} ${r2(tx.amount)} `
      if (!texto.split(' ').every(t => alvoTxt.includes(t))) continue
    }
    const motivos = []
    let score = 0
    const sim = similaridadeNome(tx.payee, fav)
    if (sim >= SEMELHANTE) { score += sim >= 0.99 ? 40 : 30; motivos.push(sim >= 0.99 ? 'favorecido igual' : 'favorecido semelhante') }
    if (cat && tx.categoryId === cat) { score += 20; motivos.push('mesma categoria') }
    const v = r2(tx.amount)
    if (valorAlvo > 0 && Math.abs(v - valorAlvo) < 0.005) { score += 20; motivos.push('mesmo valor') }
    else if (valorAlvo > 0 && Math.abs(v - valorAlvo) / valorAlvo <= 0.2) { score += 8; motivos.push('valor próximo (±20%)') }
    const dias = alvo?.vencimento ? diasEntre(tx.date, alvo.vencimento) : 9999
    if (dias <= 10) { score += 10; motivos.push(`data a ${dias} dia(s) do vencimento`) }
    else if (dias <= 45) { score += 4; motivos.push(`data a ${dias} dias do vencimento`) }
    out.push({ tx, score, motivos, dias })
  }
  return out.sort((a, b) => b.score - a.score || a.dias - b.dias || String(b.tx.date).localeCompare(String(a.tx.date)))
}

// Linha aberta mais provável para um lançamento (busca ampliada, C3): papel pelo favorecido e a
// competência de vencimento mais próximo da data. linhas: as de linhasDoContrato ainda sem pagamento.
export function linhaProvavel(contrato, tx, linhas) {
  const simC = contrato.favorecido_condominio ? similaridadeNome(tx.payee, contrato.favorecido_condominio) : 0
  const simF = similaridadeNome(tx.payee, contrato.favorecido)
  const papel = simC > simF && simC >= SEMELHANTE ? 'condominio' : 'aluguel'
  const abertas = (linhas || []).filter(l => !l.paga && !l.semCobranca && l.papel === papel)
  return abertas.map(l => ({ l, d: diasEntre(tx.date, l.vencimento) })).sort((a, b) => a.d - b.d)[0]?.l || null
}

// Busca ampliada: lançamentos candidatos ao contrato inteiro (sem linha específica), com motivo.
// Só os que têm algum sinal (favorecido ou categoria), para não listar a conta toda.
export function lancamentosCandidatosContrato(contrato, transactions, schedules, linhas, opts = {}) {
  return candidatosLancamento(contrato, transactions, schedules, { papel: 'aluguel', valor: contrato.valor_base }, opts)
    .concat(contrato.tem_condominio
      ? candidatosLancamento(contrato, transactions, schedules, { papel: 'condominio', valor: contrato.valor_condominio_previsto }, opts)
      : [])
    .filter(c => c.motivos.some(m => m.startsWith('favorecido') || m === 'mesma categoria'))
    .reduce((acc, c) => (acc.some(x => x.tx.id === c.tx.id) ? acc : [...acc, c]), [])
    .map(c => ({ ...c, linha: linhaProvavel(contrato, c.tx, linhas) }))
    .filter(c => c.linha)
}
