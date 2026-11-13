// RESGATE LIGADO a um agendamento de despesa de CONTA (não cartão) com classificação gerencial que
// gera resgate (grupo numerado ≠ 1 com conta padrão — Contas Anuais, PharmaLog, Imperium…).
//
// Modelo: o resgate é um agendamento PRÓPRIO (tipo 'resgate_reserva', transferência conta do grupo
// → conta da despesa) com `agendamentoVinculadoId` = id da despesa. Ele NUNCA é editado à mão: a
// estrutura dele (frequência, início, nº de ocorrências, exceções de data/valor, pulos, âncora) é
// sempre RECALCULADA a partir da despesa por `derivarResgate` — as chaves das ocorrências são as
// mesmas da despesa, então pular, mudar data/valor (só esta ou esta e as próximas), encurtar a série
// ou excluir a despesa valem para o resgate sem código por operação.
//
// O PAGAMENTO é separado (regra de 13/11/2026): pagar, efetivar em lote ou registrar
// automaticamente a despesa grava só a despesa; o resgate da mesma ocorrência fica pendente (em
// atraso, se passar a data) até ser pago na linha dele ou vinculado a um resgate já feito. Estornar
// um não mexe no outro. O que já foi efetivado/vinculado no resgate nunca é recalculado.
// Ocorrências anteriores ao vínculo (`overrides._resgateDesde`: agendamento antigo que ganhou o
// resgate ao ser editado) ficam de fora — nada de resgate retroativo.
//
// Nada dobra: o motor do cartão só olha despesas EM CARTÃO (gerencialPrevistos.ehGastoPrevistoDeCartao)
// e resgates COM cardId; este não tem cartão. A despesa não movimenta a reserva (saldoReserva.reserveMovOf
// ignora despesas); só a transferência do resgate conta.

import { computeOccurrences, datasConsumidas } from './occurrences.js'
import { ehParcelado } from './parcelasOcorrencia.js'
import { occEfetiva } from './fluxoCaixa.js'

export const TIPO_RESGATE_VINCULADO = 'resgate_reserva'
export const PREFIXO_TX = 'tx_resgv_'
const ehChaveData = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k)

export const idResgateVinculado = (despesaId) => `sch_resgv_${despesaId}`
export const idTxResgate = (resgateId, chave) => `${PREFIXO_TX}${resgateId}_${chave}`
export const ehTxDeResgateVinculado = (id) => typeof id === 'string' && id.startsWith(PREFIXO_TX)
export const ehResgateVinculado = (s) => !!s?.agendamentoVinculadoId

// Grupo gerencial que gera resgate: numerado (≠ 1) com conta padrão. → { grupo, conta } ou null.
export function grupoComResgate(grupoId, { gerencialGroups = [], accounts = [] } = {}) {
  const grupo = (gerencialGroups || []).find(g => g.id === grupoId)
  if (!grupo || typeof grupo.number !== 'number' || grupo.number === 1 || !grupo.defaultAccountId) return null
  const conta = (accounts || []).find(a => a.id === grupo.defaultAccountId) || null
  return conta ? { grupo, conta } : null
}

// Funções de reserva da conta do grupo, em ordem alfabética (pt-BR, sem diferenciar acento nem
// maiúscula: "ipva" junto de "IPVA", "Óleo" junto de "Oficina").
const ALFABETICA = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
export function opcoesResgatarDe(contaId, reserveFunctions = []) {
  if (!contaId) return []
  return (reserveFunctions || [])
    .filter(f => f.accountId === contaId)
    .sort((a, b) => ALFABETICA.compare(String(a.name || ''), String(b.name || '')) || String(a.id).localeCompare(String(b.id)))
}

const contaEhCartao = (id, accounts) => (accounts || []).find(a => a.id === id)?.type === 'credit'

// A despesa gera resgate ligado? (despesa, em conta que não é cartão, grupo com resgate). → info|null
export function despesaGeraResgate(s, ctx) {
  if (!s || s.transactionType !== 'expense' || !s.accountId || ehResgateVinculado(s) || s.isProvisao) return null
  if (contaEhCartao(s.accountId, ctx.accounts)) return null
  return grupoComResgate(s.grupoGerencial, ctx)
}

// Função escolhida em "Resgatar de" que vale para a conta do grupo (outra conta → nenhuma).
export function funcaoValida(funcaoId, contaId, reserveFunctions = []) {
  if (!funcaoId) return null
  return (reserveFunctions || []).some(f => f.id === funcaoId && f.accountId === contaId) ? funcaoId : null
}

// "Contas Anuais › IPVA" (ou só a conta, sem função).
export function rotuloOrigem(conta, funcaoId, reserveFunctions = []) {
  const nome = conta?.apelido || conta?.name || 'Reserva'
  const f = funcaoId ? (reserveFunctions || []).find(x => x.id === funcaoId) : null
  return f ? `${nome} › ${f.name}` : nome
}

// Ocorrência da despesa fora do resgate por exceção "só esta" (grupo ou conta trocados nela).
function chaveForaDoResgate(despesa, chave, ctx) {
  const ov = despesa.overrides?.[chave]
  if (!ov || typeof ov !== 'object') return false
  if ('grupoGerencial' in ov && ov.grupoGerencial !== despesa.grupoGerencial) return true
  if (ov.accountId && contaEhCartao(ov.accountId, ctx.accounts)) return true
  return false
}

// O que o usuário pode mexer SÓ no resgate (a despesa não muda):
//   • excluir uma ocorrência → overrides._resgateExcluidas (a sincronização não a recria);
//   • mudar a data de uma ocorrência → overrides[k].date, com `_de` = a data da despesa naquele
//     momento. Vale enquanto a despesa mantiver essa data; mudou a da despesa, vale a da despesa;
//   • vincular a um resgate já feito (baixa com o lançamento existente — lib/vinculo).
// Ocorrência do resgate já efetivada ou vinculada nunca é alterada aqui.
export const excluidasDoResgate = (r) => (Array.isArray(r?.overrides?._resgateExcluidas) ? r.overrides._resgateExcluidas : [])

// ── Casamento por POSIÇÃO na série ──────────────────────────────────────────────────────────────
// A despesa e o resgate casam pela ocorrência (1ª, 2ª, 3ª…), não pela data: mudar a série da despesa
// ("esta e as próximas", dia de vencimento, início) troca as datas-chave das ocorrências pendentes
// dela, mas o que já foi pago, vinculado ou excluído no resgate continua sendo daquela ocorrência.
// Posições de um agendamento = ocorrências consumidas (pagas/puladas) + pendentes, em ordem. As
// "cobertas" do resgate (marca técnica, ver abaixo) não são ocorrências.
const JANELA_POSICOES = 120
export function posicoesDaSerie(s) {
  if (!s?.startDate) return []
  const cobertas = new Set(Array.isArray(s.overrides?._resgateCobertas) ? s.overrides._resgateCobertas : [])
  const consumidas = [...new Set(datasConsumidas(s))].filter(k => !cobertas.has(k))
  return [...new Set([...consumidas, ...computeOccurrences(s, JANELA_POSICOES)])].sort()
}

// Chave (data-base) da ocorrência da DESPESA que corresponde à ocorrência `chave` do resgate, e o
// contrário. Sem correspondência → a própria chave.
export function chaveDaDespesa(despesa, resgate, chaveResgate) {
  const i = posicoesDaSerie(resgate).indexOf(chaveResgate)
  return (i >= 0 && posicoesDaSerie(despesa)[i]) || chaveResgate
}
export function chaveDoResgate(despesa, resgate, chaveDespesa) {
  const i = posicoesDaSerie(despesa).indexOf(chaveDespesa)
  return (i >= 0 && posicoesDaSerie(resgate)[i]) || chaveDespesa
}

// Estrutura do resgate a partir da despesa (pura). `resgate` = o atual (registered/meta/id/desde e
// o que o usuário mexeu nele).
//   • Pago/vinculado no resgate: a chave e a data dele NUNCA mudam; ele ocupa a POSIÇÃO que tinha.
//   • Pendente: a data e o valor da despesa na mesma posição (com a data/valor mudados à mão no
//     resgate valendo enquanto a despesa não mudar os dela).
//   • Excluído à mão / pulado na despesa / fora do resgate / antes do vínculo: posição consumida.
// A âncora (nextOccurrence) é a 1ª pendente DO RESGATE (não a da despesa).
export function derivarResgate(despesa, resgate, ctx) {
  const info = despesaGeraResgate(despesa, ctx)
  if (!info) return null
  const desde = resgate?.overrides?._resgateDesde || null
  const D = posicoesDaSerie(despesa)
  const antigas = posicoesDaSerie(resgate) // posições do resgate como estava (antes desta mudança)
  const posAntiga = new Map(antigas.map((k, i) => [k, i]))
  const posDe = (k) => (posAntiga.has(k) ? posAntiga.get(k) : (D.indexOf(k) >= 0 ? D.indexOf(k) : null))
  const registered = resgate?.registered || []
  const regSet = new Set(registered)
  const pagoNaPos = new Map()
  for (const k of [...registered].sort()) {
    const i = posDe(k)
    if (i != null && !pagoNaPos.has(i)) pagoNaPos.set(i, k)
  }
  const exclNaPos = new Set(excluidasDoResgate(resgate).filter(k => !regSet.has(k)).map(posDe).filter(i => i != null && !pagoNaPos.has(i)))
  const ovResgate = resgate?.overrides || {}
  const proprioNaPos = new Map() // exceções do próprio resgate (pendentes) por posição
  for (const [k, v] of Object.entries(ovResgate)) {
    if (!ehChaveData(k) || regSet.has(k) || !v || typeof v !== 'object') continue
    const i = posDe(k)
    if (i != null) proprioNaPos.set(i, v)
  }
  const pulosDespesa = new Set(despesa.skipped || [])
  const status = D.map((dk, i) => {
    if (pagoNaPos.has(i)) return 'pago'
    if (exclNaPos.has(i)) return 'excluida'
    if (pulosDespesa.has(dk) || chaveForaDoResgate(despesa, dk, ctx) || (desde && dk < desde)) return 'pulada'
    return 'pendente'
  })

  // Rótulos (chaves) do resgate por posição. Até a 1ª pendente: a do pago, ou a da despesa. Dali em
  // diante: a série gerada a partir da âncora (= a da despesa, salvo pendente antiga com o dia de
  // vencimento mudado depois — aí a data certa vai na exceção de data).
  const p1 = status.indexOf('pendente') >= 0 ? status.indexOf('pendente') : Math.max(D.length - 1, 0)
  const ancora = D[p1] || null
  const base = {
    frequency: despesa.frequency || 'once', startDate: despesa.startDate, occurrenceType: despesa.occurrenceType || 'continuous',
    installments: despesa.installments ?? 0, parcelasPorOcorrencia: Number(despesa.parcelasPorOcorrencia) || 1,
    overrides: Object.fromEntries(Object.entries(despesa.overrides || {}).filter(([k]) => k === '_diaVencimento' || k === '_parcelamento')),
  }
  const seq = ancora && !ehParcelado(despesa)
    ? computeOccurrences({ ...base, nextOccurrence: ancora, registered: [], skipped: [] }, D.length - p1)
    : []
  const rotulos = D.map((dk, i) => (i < p1 || ehParcelado(despesa) ? (pagoNaPos.get(i) || dk) : (seq[i - p1] || dk)))

  const overrides = { ...base.overrides }
  const skipped = new Set()
  const cobertas = []
  for (let i = 0; i < D.length; i++) {
    const st = status[i]
    const rot = rotulos[i]
    if (st === 'pago') {
      const k = pagoNaPos.get(i)
      if (ovResgate[k] !== undefined) overrides[k] = ovResgate[k]
      // A posição do pago na série gerada tem outra chave: marca como coberta (consumida, sem ser
      // ocorrência), senão viraria um pendente fantasma.
      if (i >= p1 && k !== rot) { skipped.add(rot); cobertas.push(rot) }
      continue
    }
    if (st !== 'pendente') { skipped.add(rot); continue }
    const ef = occEfetiva(despesa, D[i])
    const proprio = proprioNaPos.get(i)
    const o = {}
    if (proprio?.date && proprio._de && proprio.date !== proprio._de && proprio._de === ef.date) {
      o.date = proprio.date // data mudada à mão no resgate, e a despesa não mudou a dela desde então
      o._de = proprio._de
    } else if (ef.date !== rot) {
      o.date = ef.date
      o._de = ef.date
    }
    // Valor ajustado só no resgate (Pagar a despesa por valor diferente → "ajustar"): vale enquanto o
    // valor da despesa naquela ocorrência for o de quando ajustou (`_valorDe`); mudou, vale o da despesa.
    const valorDespesa = Math.round(Number(ef.amount) * 100) / 100
    if (proprio?._valorDe != null && proprio.amount != null && Number(proprio._valorDe) === valorDespesa) {
      o.amount = proprio.amount
      o._valorDe = proprio._valorDe
    } else if (valorDespesa !== Math.round(Number(despesa.amount) * 100) / 100) o.amount = valorDespesa
    if (Object.keys(o).length) overrides[rot] = o
  }
  for (const k of regSet) skipped.delete(k)
  const excluidas = D.map((_, i) => (status[i] === 'excluida' ? rotulos[i] : null)).filter(Boolean)
  if (desde) overrides._resgateDesde = desde
  if (excluidas.length) overrides._resgateExcluidas = [...new Set(excluidas)].sort()
  if (cobertas.length) overrides._resgateCobertas = [...new Set(cobertas)].sort()
  const funcaoId = funcaoValida(despesa.reservaFuncaoId, info.conta.id, ctx.reserveFunctions)
  return {
    ...(resgate || {}),
    id: resgate?.id || idResgateVinculado(despesa.id),
    tipo: TIPO_RESGATE_VINCULADO,
    agendamentoVinculadoId: despesa.id,
    description: `Resgate ${rotuloOrigem(info.conta, funcaoId, ctx.reserveFunctions)} — ${despesa.description || ''}`.trim(),
    transactionType: 'transfer',
    accountId: info.conta.id,
    accountType: info.conta.type || null,
    toAccountId: despesa.accountId,
    amount: Number(despesa.amount) || 0,
    categoryId: '',
    payee: '',
    costCenter: '',
    frequency: despesa.frequency || 'once',
    startDate: despesa.startDate,
    occurrenceType: despesa.occurrenceType || 'continuous',
    installments: despesa.installments ?? 0,
    parcelasPorOcorrencia: Number(despesa.parcelasPorOcorrencia) || 1,
    nextOccurrence: ancora,
    overrides,
    skipped: [...skipped].sort(),
    registered: resgate?.registered || [],
    registeredMeta: resgate?.registeredMeta || {},
    reservaFuncaoId: funcaoId,
    grupoGerencial: null,
    reservaExpenseCategoryId: null,
    isProvisao: false,
    provisaoEfetivada: false,
    autoRegister: false,
    remindDaysBefore: 0,
    sincronizarAgenda: false,
    considerarFluxoPrincipal: typeof despesa.considerarFluxoPrincipal === 'boolean' ? despesa.considerarFluxoPrincipal : null,
    cardId: null,
    faturaRef: null,
    faturaMesAno: null,
    confirmado: false,
  }
}

// Resgate novo para a despesa: cobre só as ocorrências PENDENTES a partir de agora.
export function novoResgateVinculado(despesa, ctx) {
  const primeira = computeOccurrences(despesa, 1)[0]
  if (!primeira) return null
  const base = { id: idResgateVinculado(despesa.id), registered: [], registeredMeta: {}, overrides: { _resgateDesde: primeira } }
  return derivarResgate(despesa, base, ctx)
}

// Campos que importam para saber se o resgate mudou (sem createdAt/updatedAt).
const CAMPOS = ['description', 'accountId', 'accountType', 'toAccountId', 'amount', 'frequency', 'startDate', 'occurrenceType',
  'installments', 'parcelasPorOcorrencia', 'nextOccurrence', 'overrides', 'skipped', 'registered', 'registeredMeta',
  'reservaFuncaoId', 'considerarFluxoPrincipal', 'tipo', 'agendamentoVinculadoId', 'autoRegister', 'sincronizarAgenda', 'transactionType', 'remindDaysBefore']
const assinatura = (s) => JSON.stringify(CAMPOS.map(c => s?.[c] ?? null))
export const mesmoResgate = (a, b) => assinatura(a) === assinatura(b)

// Garante, no estado `d`, que a ESTRUTURA de todo resgate ligado acompanha a sua despesa (pura e
// idempotente: sem nada a fazer, devolve o MESMO `d`). Não cria nem desfaz lançamentos: o pagamento
// do resgate é separado do da despesa.
export function sincronizarResgatesVinculados(d) {
  const resgates = (d.schedules || []).filter(ehResgateVinculado)
  if (!resgates.length) return d
  const ctx = { accounts: d.accounts, gerencialGroups: d.gerencialGroups, reserveFunctions: d.reserveFunctions }
  let schedules = d.schedules
  let mudou = false
  const porId = new Map(schedules.map(s => [s.id, s]))

  for (const r0 of resgates) {
    const despesa = porId.get(r0.agendamentoVinculadoId)
    if (!despesa || !despesaGeraResgate(despesa, ctx)) {
      // Despesa excluída ou que deixou de gerar resgate: o agendamento do resgate sai (o que já foi
      // efetivado continua como lançamento, igual a excluir qualquer agendamento).
      schedules = schedules.filter(s => s.id !== r0.id)
      mudou = true
      continue
    }
    // Só a estrutura acompanha a despesa (data, pulos, valor, exclusão). Pagamento é separado.
    const novo = derivarResgate(despesa, r0, ctx)
    if (!mesmoResgate(novo, r0)) {
      schedules = schedules.map(s => (s.id === r0.id ? novo : s))
      mudou = true
    }
  }
  return mudou ? { ...d, schedules } : d
}

// Resgate inteiro excluído à mão: marca na despesa (a sincronização e o salvar não o recriam).
export const resgateExcluidoNaDespesa = (despesa) => !!despesa?.overrides?._resgateExcluido

// Cria o resgate da despesa se faltar (salvar o agendamento). Devolve `d` igual se não há o que criar.
export function criarResgateSeFaltar(d, despesaId) {
  const despesa = (d.schedules || []).find(s => s.id === despesaId)
  const ctx = { accounts: d.accounts, gerencialGroups: d.gerencialGroups, reserveFunctions: d.reserveFunctions }
  if (!despesa || !despesaGeraResgate(despesa, ctx) || resgateExcluidoNaDespesa(despesa)) return d
  if ((d.schedules || []).some(s => s.agendamentoVinculadoId === despesaId)) return d
  const novo = novoResgateVinculado(despesa, ctx)
  if (!novo) return d
  return { ...d, schedules: [...d.schedules, novo] }
}

// Quantas ocorrências pendentes o resgate terá (para a frase do formulário). null = sem fim.
export function resumoResgates(despesa, { limite = 400 } = {}) {
  const continua = (despesa.frequency || 'once') !== 'once' && despesa.occurrenceType !== 'installment'
  const pend = computeOccurrences(despesa, continua ? 1 : limite)
  return { continua, n: continua ? null : pend.length }
}

// Provisões ABERTAS da mesma função com ocorrência pendente num mês em que a despesa também tem.
export function provisoesNoMesmoMes(despesa, funcaoId, schedules = [], { limite = 36 } = {}) {
  if (!funcaoId) return []
  const meses = new Set(computeOccurrences(despesa, limite).map(k => String(occEfetiva(despesa, k).date).slice(0, 7)))
  if (!meses.size) return []
  const out = []
  for (const p of schedules || []) {
    if (!p.isProvisao || p.provisaoEfetivada || p.reservaFuncaoId !== funcaoId || p.id === despesa.id) continue
    const mes = computeOccurrences(p, limite).map(k => String(occEfetiva(p, k).date).slice(0, 7)).find(m => meses.has(m))
    if (mes) out.push({ provisao: p, mes })
  }
  return out
}

// A despesa tem resgate ligado? (o Pagar não cria o resgate avulso "Resgate <grupo>": dobraria).
export const temResgateLigado = (despesaId, schedules = []) =>
  !!despesaId && (schedules || []).some(s => s.agendamentoVinculadoId === despesaId)

// Agendamento da despesa que o resgate ligado acompanha (ou null).
export const despesaDoResgate = (resgate, schedules = []) =>
  (resgate?.agendamentoVinculadoId && (schedules || []).find(s => s.id === resgate.agendamentoVinculadoId)) || null

// ── Mexer só no resgate ─────────────────────────────────────────────────────────────────────────

// Excluir UMA ocorrência pendente do resgate (a despesa não muda; a sincronização não a recria).
export function excluirOcorrenciaDoResgate(resgate, chave) {
  if (!resgate || !chave || (resgate.registered || []).includes(chave)) return resgate
  const atuais = excluidasDoResgate(resgate)
  if (atuais.includes(chave)) return resgate
  return {
    ...resgate,
    overrides: { ...(resgate.overrides || {}), _resgateExcluidas: [...atuais, chave].sort() },
    skipped: [...new Set([...(resgate.skipped || []), chave])].sort(),
  }
}

// Mudar a data de UMA ocorrência do resgate (exceção de data só dele). `_de` guarda a data da
// despesa naquele momento: se a despesa mudar a dela depois, vale a da despesa.
export function mudarDataDoResgate(resgate, despesa, chave, novaData) {
  if (!resgate || !despesa || !chave || !novaData || (resgate.registered || []).includes(chave)) return resgate
  const dataDespesa = occEfetiva(despesa, chaveDaDespesa(despesa, resgate, chave)).date
  const ov = { ...(resgate.overrides?.[chave] || {}) }
  if (novaData === dataDespesa) { delete ov.date; delete ov._de } else { ov.date = novaData; ov._de = dataDespesa }
  const overrides = { ...(resgate.overrides || {}) }
  if (Object.keys(ov).length) overrides[chave] = ov
  else delete overrides[chave]
  return { ...resgate, overrides }
}

// "Vincular a um resgate já feito": transferências EFETIVADAS da conta da reserva para a conta da
// despesa, sem vínculo, até 15 dias da ocorrência. Ordem: mesmo valor primeiro; depois a mesma
// função; depois a data mais perto. → [{ tx, dias, mesmoValor, mesmaFuncao }]
export const JANELA_RESGATE_FEITO_DIAS = 15
export function candidatosResgateFeito(resgate, chave, { transactions = [], schedules = [], hoje = null } = {}) {
  if (!resgate || !chave) return []
  const ef = occEfetiva(resgate, chave)
  const presos = new Set()
  for (const s of schedules || []) {
    for (const [dt, m] of Object.entries(s.registeredMeta || {})) if (m?.lancamento_id && (s.registered || []).includes(dt)) presos.add(m.lancamento_id)
  }
  const dia = (x) => Date.parse(`${String(x).slice(0, 10)}T12:00:00Z`)
  const out = []
  for (const t of transactions || []) {
    if (t.type !== 'transfer' || t.accountId !== resgate.accountId || t.toAccountId !== resgate.toAccountId) continue
    if (presos.has(t.id) || t.reservaAuto || t.isEspelho) continue
    if (t.scheduleId && (schedules || []).some(s => s.id === t.scheduleId)) continue
    if (hoje && t.date > hoje) continue
    if (resgate.reservaFuncaoId && t.reservaFuncaoId && t.reservaFuncaoId !== resgate.reservaFuncaoId) continue
    const dias = Math.abs(Math.round((dia(t.date) - dia(ef.date)) / 86400000))
    if (dias > JANELA_RESGATE_FEITO_DIAS) continue
    out.push({ tx: t, dias, mesmoValor: Math.abs((Number(t.amount) || 0) - (Number(ef.amount) || 0)) < 0.005, mesmaFuncao: !!resgate.reservaFuncaoId && t.reservaFuncaoId === resgate.reservaFuncaoId })
  }
  return out.sort((a, b) => Number(b.mesmoValor) - Number(a.mesmoValor) || Number(b.mesmaFuncao) - Number(a.mesmaFuncao) || a.dias - b.dias)
}

// Ordem no mesmo dia (o resgate ligado antes da despesa): src/lib/ordemResgate.js.
export { ehDoResgateLigado, resgatePrimeiro } from './ordemResgate.js'
