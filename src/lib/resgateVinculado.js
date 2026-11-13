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

import { computeOccurrences } from './occurrences.js'
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

// Estrutura do resgate a partir da despesa (pura). `resgate` = o atual (registered/meta/id/desde e
// o que o usuário mexeu nele).
export function derivarResgate(despesa, resgate, ctx) {
  const info = despesaGeraResgate(despesa, ctx)
  if (!info) return null
  const desde = resgate?.overrides?._resgateDesde || null
  const regResgate = new Set(resgate?.registered || [])
  const excluidas = excluidasDoResgate(resgate).filter(k => !regResgate.has(k))
  const ovResgate = resgate?.overrides || {}
  const overrides = {}
  for (const [k, v] of Object.entries(despesa.overrides || {})) {
    if (ehChaveData(k)) continue
    if (k === '_diaVencimento' || k === '_parcelamento') overrides[k] = v
  }
  // Datas e valores por ocorrência: as chaves com exceção na despesa ou no resgate.
  const chaves = new Set([
    ...Object.keys(despesa.overrides || {}).filter(ehChaveData),
    ...Object.keys(ovResgate).filter(ehChaveData),
  ])
  for (const k of chaves) {
    if (regResgate.has(k)) {
      // Efetivada/vinculada: fica como está.
      if (ovResgate[k] !== undefined) overrides[k] = ovResgate[k]
      continue
    }
    const vD = despesa.overrides?.[k]
    const oD = vD && typeof vD === 'object' ? vD : {}
    const dataDespesa = oD.date || k
    const o = {}
    const vR = ovResgate[k]
    const ref = vR && typeof vR === 'object' ? (vR._de || k) : null
    if (vR?.date && vR.date !== ref && ref === dataDespesa) {
      o.date = vR.date // data mudada à mão no resgate, e a despesa não mudou a dela desde então
      o._de = dataDespesa
    } else if (oD.date) {
      o.date = oD.date
      o._de = oD.date
    }
    // Valor ajustado só no resgate (Pagar a despesa por valor diferente → "ajustar"): vale enquanto o
    // valor da despesa naquela ocorrência for o de quando ajustou (`_valorDe`); mudou, vale o da despesa.
    const valorDespesa = Math.round(Number(oD.amount != null ? oD.amount : despesa.amount) * 100) / 100
    if (vR?._valorDe != null && vR.amount != null && Number(vR._valorDe) === valorDespesa) {
      o.amount = vR.amount
      o._valorDe = vR._valorDe
    } else if (oD.amount != null) o.amount = oD.amount
    if (Object.keys(o).length) overrides[k] = o
  }
  if (desde) overrides._resgateDesde = desde
  if (excluidas.length) overrides._resgateExcluidas = [...new Set(excluidas)].sort()
  // Pulos: os da despesa; as baixas da despesa ANTERIORES ao vínculo (a série do resgate consome as
  // mesmas datas e o nº de ocorrências fecha igual; nada de resgate retroativo); ocorrências tiradas
  // do resgate por exceção "só esta" na despesa; as excluídas à mão no resgate. Pagar a despesa NÃO
  // tira a ocorrência do resgate: ela fica pendente até o resgate ser pago ou vinculado.
  const skipped = new Set(despesa.skipped || [])
  for (const d of despesa.registered || []) if (desde && d < desde && !regResgate.has(d)) skipped.add(d)
  for (const k of Object.keys(despesa.overrides || {})) {
    if (ehChaveData(k) && !regResgate.has(k) && chaveForaDoResgate(despesa, k, ctx)) skipped.add(k)
  }
  for (const k of excluidas) skipped.add(k)
  for (const d of regResgate) skipped.delete(d)
  // Âncora da série (nextOccurrence) é a da despesa, que AVANÇA quando ela é paga. O pagamento do
  // resgate é separado: ocorrência paga na despesa e ainda pendente no resgate não pode ficar para
  // trás — a âncora do resgate volta para a mais antiga delas (é uma data da mesma série).
  const pendentesSoNoResgate = (despesa.registered || [])
    .filter(k => (!desde || k >= desde) && !regResgate.has(k) && !skipped.has(k)).sort()
  const ancora = despesa.nextOccurrence && pendentesSoNoResgate[0] && pendentesSoNoResgate[0] < despesa.nextOccurrence
    ? pendentesSoNoResgate[0] : (despesa.nextOccurrence || null)
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
  const dataDespesa = occEfetiva(despesa, chave).date
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
