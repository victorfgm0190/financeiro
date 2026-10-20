// PARCELAS DE CONTRATO — funções puras (sem React, sem I/O).
// O contrato não tem tabela de parcelas: cada parcela é um agendamento 'once' com contratoId +
// contratoPapel, id determinístico ctr_<contrato>_<papel>_<AAAAMM> (dois aparelhos gerando a mesma
// parcela gravam a mesma linha). Contrato = linha da tabela `contratos` (snake_case, como vem da API).
// Parcela paga (registered) nunca muda; reajuste/aditivo/renovação só mexem nas pendentes.
import { ymDe, addMeses, diaNoMes, diaDe } from './datas.js'

export const STATUS_CONTRATO = { ativo: 'Ativo', encerrado: 'Encerrado', rescindido: 'Rescindido', suspenso: 'Suspenso' }
export const PAPEIS = { aluguel: 'Aluguel', condominio: 'Condomínio', iptu: 'IPTU', seguro: 'Seguro', multa: 'Multa' }
export const PASSO_MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12, unica: 0 }
// Contrato sem data de fim: parcelas até 12 meses à frente, estendidas sozinhas (garantirParcelas).
export const HORIZONTE_MESES = 12

export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export const idParcela = (contratoId, papel, ym) => `ctr_${contratoId}_${papel}_${ym.replace('-', '')}`
export const ehParcelaGerada = (s, contratoId) => String(s?.id || '').startsWith(`ctr_${contratoId}_`)
export const parcelaPaga = (s) => (s?.registered || []).length > 0

export function rotuloContrato(c) {
  return c?.objeto || (c?.numero ? `Contrato ${c.numero}` : '') || c?.favorecido || 'Contrato'
}

// Primeira data com o dia de vencimento a partir do início do contrato.
export function primeiroVencimento(dataInicio, dia) {
  const ym = ymDe(dataInicio)
  const v = diaNoMes(ym, dia)
  return v >= dataInicio ? v : diaNoMes(addMeses(ym, 1), dia)
}

// Vencimentos de um papel: { numero, vencimento, competencia }. Com data_fim, a vigência inteira;
// sem ela, até HORIZONTE_MESES depois do mês de `hoje`. Condomínio é sempre mensal.
export function vencimentos(contrato, papel, { hoje } = {}) {
  const diaBase = papel === 'condominio'
    ? (contrato.dia_vencimento_condominio || contrato.dia_vencimento)
    : contrato.dia_vencimento
  const dia = Number(diaBase) || diaDe(contrato.data_inicio) || 1
  const passo = papel === 'condominio' ? 1 : (PASSO_MESES[contrato.periodicidade] ?? 1)
  const v0 = primeiroVencimento(contrato.data_inicio, dia)
  const limite = contrato.data_fim ? null : addMeses(ymDe(hoje), HORIZONTE_MESES)
  const out = []
  for (let n = 0; n < 1200; n++) {
    const venc = diaNoMes(addMeses(ymDe(v0), n * passo), dia)
    if (contrato.data_fim && venc > contrato.data_fim) break
    if (limite && ymDe(venc) > limite) break
    out.push({ numero: n + 1, vencimento: venc, competencia: ymDe(venc) })
    if (!passo) break
  }
  return out
}

// Competências de reajuste: aniversários de 12 em 12 meses desde o início. Com mes_base_reajuste,
// o primeiro é o 1º mês-base a partir de 12 meses depois do início (nunca antes de 1 ano).
export function competenciasReajuste(contrato, ateYm) {
  if (contrato.indice_reajuste === 'NENHUM' || !ateYm) return []
  let primeiro = addMeses(ymDe(contrato.data_inicio), 12)
  const mb = Number(contrato.mes_base_reajuste)
  if (mb >= 1 && mb <= 12) {
    const ano = Number(primeiro.slice(0, 4))
    const cand = `${ano}-${String(mb).padStart(2, '0')}`
    primeiro = cand >= primeiro ? cand : `${ano + 1}-${String(mb).padStart(2, '0')}`
  }
  const out = []
  for (let ym = primeiro; ym <= ateYm && out.length < 100; ym = addMeses(ym, 12)) out.push(ym)
  return out
}

export const cicloDaCompetencia = (contrato, ym) => competenciasReajuste(contrato, ym).length

// Próximo reajuste (AAAA-MM-01) a partir do mês de `hoje`; null sem reajuste ou depois do fim.
export function proximoReajuste(contrato, hoje) {
  if (contrato.indice_reajuste === 'NENHUM') return null
  const ymHoje = ymDe(hoje)
  const lista = competenciasReajuste(contrato, addMeses(ymHoje, 24))
  const ym = lista.find(x => x >= ymHoje)
  if (!ym) return null
  if (contrato.data_fim && `${ym}-01` > contrato.data_fim) return null
  return `${ym}-01`
}

// Taxa do reajuste (fração). Índice sem valor conhecido → null (projeção sem aumento).
export function taxaReajuste(contrato, indices) {
  if (contrato.indice_reajuste === 'NENHUM') return 0
  if (contrato.indice_reajuste === 'FIXO') return (Number(contrato.percentual_fixo) || 0) / 100
  const a = indices?.[contrato.indice_reajuste]?.acumulado_12m
  return a == null ? null : Number(a) / 100
}

// Base (aluguel contratual, sem bonificação) de cada ciclo 0..ultimo. Ciclo confirmado (boleto
// conferido) vale como está; os seguintes projetam a partir do último valor conhecido.
export function basesPorCiclo(contrato, ultimoCiclo, { indices, confirmados = {} } = {}) {
  const taxa = taxaReajuste(contrato, indices) || 0
  const out = [{ base: r2(contrato.valor_base), status: 'confirmado' }]
  for (let k = 1; k <= ultimoCiclo; k++) {
    const prev = out[k - 1].base
    if (confirmados[k] != null) out.push({ base: r2(confirmados[k]), status: 'confirmado' })
    else if (contrato.indice_reajuste === 'NENHUM') out.push({ base: prev, status: 'confirmado' })
    else out.push({ base: r2(prev * (1 + taxa)), status: 'projetado' })
  }
  return out
}

// Ciclos já confirmados nas parcelas existentes do contrato: { ciclo: base }.
export function confirmadosDe(contrato, schedules) {
  const out = {}
  for (const s of schedules || []) {
    if (!ehParcelaGerada(s, contrato.id) || s.contratoPapel !== 'aluguel') continue
    const c = s.composicao
    if (s.valorStatus !== 'confirmado' || !c || c.manual || !(c.ciclo > 0) || c.base == null) continue
    if (out[c.ciclo] == null || parcelaPaga(s)) out[c.ciclo] = Number(c.base)
  }
  return out
}

// Valor digitado à mão: marcado (composicao.manual) ou editado fora do contrato (valor ≠ composição).
export const valorManual = (s) => !!s?.composicao && (!!s.composicao.manual
  || (s.composicao.total != null && r2(s.amount) !== r2(s.composicao.total)))

const somaItens = (itens) => r2(itens.reduce((a, i) => a + (Number(i.valor) || 0), 0))

// Plano das parcelas do contrato (aluguel e condomínio), em ordem de vencimento por papel.
//   apartirDe: competência mínima gerada ('AAAA-MM'); valoresMantidos: { papel: { ym: valor } }
//   (vínculo com "manter valor atual"); valorCondominio: último valor pago (senão o previsto).
export function gerarPlanoParcelas(contrato, { hoje, indices, confirmados = {}, apartirDe = null, valoresMantidos = {}, valorCondominio = null } = {}) {
  const out = []
  const aluguel = vencimentos(contrato, 'aluguel', { hoje })
  const totalAluguel = contrato.data_fim ? aluguel.length : null
  const ultimoCiclo = aluguel.length ? cicloDaCompetencia(contrato, aluguel.at(-1).competencia) : 0
  const bases = basesPorCiclo(contrato, ultimoCiclo, { indices, confirmados })
  const bonifValor = r2(contrato.bonificacao_valor)
  const bonifMeses = Number(contrato.bonificacao_meses) || 0

  const mantida = (papel, ym, comp) => {
    const v = valoresMantidos?.[papel]?.[ym]
    if (v == null) return comp
    return { ...comp, itens: [{ tipo: 'mantido', desc: 'Valor mantido da série', valor: r2(v) }], total: r2(v), manual: true }
  }

  for (const v of aluguel) {
    if (apartirDe && v.competencia < apartirDe) continue
    const ciclo = cicloDaCompetencia(contrato, v.competencia)
    const { base, status } = bases[ciclo]
    const itens = [{ tipo: 'base', desc: 'Aluguel contratual', valor: base }]
    if (bonifValor > 0 && v.numero <= bonifMeses) itens.push({ tipo: 'bonificacao', desc: 'Bonificação', valor: -bonifValor })
    const composicao = mantida('aluguel', v.competencia, {
      ciclo, base, itens, total: somaItens(itens), numero: v.numero, total_parcelas: totalAluguel,
    })
    out.push({
      id: idParcela(contrato.id, 'aluguel', v.competencia), papel: 'aluguel', numero: v.numero, total: totalAluguel,
      competencia: v.competencia, vencimento: v.vencimento, valor: composicao.total,
      valorStatus: composicao.manual ? 'confirmado' : status, composicao,
    })
  }

  if (contrato.tem_condominio) {
    const cond = vencimentos(contrato, 'condominio', { hoje })
    const totalCond = contrato.data_fim ? cond.length : null
    const valor = r2(valorCondominio ?? contrato.valor_condominio_previsto)
    for (const v of cond) {
      if (apartirDe && v.competencia < apartirDe) continue
      const itens = [{ tipo: 'previsto', desc: 'Condomínio previsto', valor }]
      const composicao = mantida('condominio', v.competencia, {
        itens, total: valor, numero: v.numero, total_parcelas: totalCond,
      })
      out.push({
        id: idParcela(contrato.id, 'condominio', v.competencia), papel: 'condominio', numero: v.numero, total: totalCond,
        competencia: v.competencia, vencimento: v.vencimento, valor: composicao.total, valorStatus: 'confirmado', composicao,
      })
    }
  }
  return out
}

// Parcela do plano → agendamento do app (camelCase, como em src/lib/db.js rowToSchedule).
export function agendamentoDaParcela(contrato, p) {
  const condominio = p.papel === 'condominio'
  return {
    id: p.id,
    description: `${PAPEIS[p.papel] || p.papel} · ${rotuloContrato(contrato)}`,
    transactionType: contrato.tipo === 'receber' ? 'income' : 'expense',
    accountId: contrato.conta_id || null,
    toAccountId: null,
    amount: p.valor,
    categoryId: (condominio ? contrato.categoria_condominio_id || contrato.categoria_id : contrato.categoria_id) || '',
    payee: (condominio ? contrato.favorecido_condominio || contrato.favorecido : contrato.favorecido) || '',
    costCenter: contrato.centro_custo || '',
    frequency: 'once',
    startDate: p.vencimento,
    occurrenceType: 'continuous',
    installments: null,
    registered: [],
    registeredMeta: {},
    skipped: [],
    remindDaysBefore: 3,
    // Condomínio pede a composição do boleto no pagamento; nenhuma parcela se paga sozinha.
    autoRegister: false,
    overrides: {},
    confirmado: false,
    nextOccurrence: null,
    tipoDocumentoId: contrato.tipo_documento_id || null,
    contratoId: contrato.id,
    contratoPapel: p.papel,
    valorStatus: p.valorStatus,
    composicao: p.composicao,
    sincronizarAgenda: true,
  }
}

const CAMPOS_COMPARADOS = ['description', 'transactionType', 'accountId', 'amount', 'categoryId', 'payee', 'costCenter', 'startDate', 'tipoDocumentoId', 'valorStatus', 'composicao']
const TEXTOS = new Set(['description', 'categoryId', 'payee', 'costCenter'])
// JSONB volta do Postgres com as chaves reordenadas: compara com as chaves em ordem.
const estavel = (v) => (Array.isArray(v) ? v.map(estavel)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, estavel(v[k])])) : v)
const normCampo = (c, v) => (c === 'amount' ? r2(v) : TEXTOS.has(c) ? v || '' : v ?? null)
const igual = (c, a, b) => JSON.stringify(estavel(normCampo(c, a))) === JSON.stringify(estavel(normCampo(c, b)))

// O que muda numa parcela PENDENTE existente para ficar como o plano. Parcela com valor digitado à
// mão (composicao.manual) mantém valor e composição.
export function diferencasParcela(existente, novo) {
  const out = {}
  for (const c of CAMPOS_COMPARADOS) {
    if (valorManual(existente) && (c === 'amount' || c === 'composicao' || c === 'valorStatus')) continue
    if (!igual(c, existente[c], novo[c])) out[c] = novo[c]
  }
  return out
}

// Meses já cobertos por séries vinculadas (agendamentos com contratoId que NÃO são parcelas
// geradas): { papel: Set('AAAA-MM') }. O contrato não gera parcela nesses meses.
export function cobertasDoContrato(contrato, schedules) {
  const out = {}
  for (const s of schedules || []) {
    if (s.contratoId !== contrato.id || ehParcelaGerada(s, contrato.id)) continue
    const papel = s.contratoPapel || 'aluguel'
    const datas = (s.frequency || 'once') === 'once' ? [s.startDate] : [...(s.registered || []), ...(s.skipped || [])]
    const set = out[papel] || (out[papel] = new Set())
    for (const d of datas) if (d) set.add(ymDe(d))
  }
  return out
}

// Sincroniza as parcelas existentes com o plano → { criar, atualizar: [{ id, antes, changes }], remover }.
//   excluidas: ids de parcelas excluídas à mão (não voltam); cobertas: cobertasDoContrato;
//   soExtender: só cria competências DEPOIS da última existente de cada papel (extensão automática
//   de contrato sem fim) — nunca altera nem remove; apartirDe: remoção só a partir deste mês.
export function planejarSincronizacao(contrato, schedules, plano, { excluidas = [], cobertas = {}, soExtender = false, apartirDe = null } = {}) {
  const doContrato = (schedules || []).filter(s => ehParcelaGerada(s, contrato.id))
  const porId = new Map(doContrato.map(s => [s.id, s]))
  const exc = new Set(excluidas)
  const ultima = {}
  for (const s of doContrato) {
    const ym = ymDe(s.startDate)
    if (!ultima[s.contratoPapel] || ym > ultima[s.contratoPapel]) ultima[s.contratoPapel] = ym
  }
  const criar = [], atualizar = [], remover = []
  const noPlano = new Set()
  for (const p of plano) {
    if (exc.has(p.id) || cobertas[p.papel]?.has(p.competencia)) continue
    noPlano.add(p.id)
    const ex = porId.get(p.id)
    const novo = agendamentoDaParcela(contrato, p)
    if (!ex) {
      if (soExtender && (!ultima[p.papel] || p.competencia <= ultima[p.papel])) continue
      criar.push(novo)
      continue
    }
    if (soExtender || parcelaPaga(ex)) continue
    const changes = diferencasParcela(ex, novo)
    if (Object.keys(changes).length) atualizar.push({ id: ex.id, antes: ex, changes })
  }
  if (!soExtender) {
    for (const s of doContrato) {
      if (noPlano.has(s.id) || parcelaPaga(s)) continue
      if (apartirDe && ymDe(s.startDate) < apartirDe) continue
      remover.push(s)
    }
  }
  return { criar, atualizar, remover }
}

// Primeira competência das parcelas geradas do contrato (onde a geração começou), ou null.
export function inicioDasParcelas(contrato, schedules) {
  const yms = (schedules || []).filter(s => ehParcelaGerada(s, contrato.id)).map(s => ymDe(s.startDate)).sort()
  return yms[0] || null
}

// Parcelas geradas de um papel, por vencimento.
export function parcelasDoPapel(contrato, schedules, papel) {
  return (schedules || [])
    .filter(s => ehParcelaGerada(s, contrato.id) && s.contratoPapel === papel)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
}

// Aluguel vigente: a próxima parcela pendente; sem pendente, a última; sem parcela, o valor-base.
export function valorAtual(contrato, schedules) {
  const lista = parcelasDoPapel(contrato, schedules, 'aluguel')
  const p = lista.find(s => !parcelaPaga(s)) || lista.at(-1)
  return p ? r2(p.amount) : r2(contrato.valor_base)
}

export function proximaParcela(contrato, schedules) {
  return (schedules || [])
    .filter(s => s.contratoId === contrato.id && (s.frequency || 'once') === 'once' && !parcelaPaga(s))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0] || null
}

// "Confirmar reajuste" numa parcela projetada (ou paga com outro valor): novoBase vira a base do
// ciclo dela. escopo 'ciclo' = esta e as seguintes do ciclo (+ reprojeção dos ciclos depois);
// 'so_esta' = só ela. Pagas e de valor manual ficam como estão.
// → { ciclo, baseAnterior, percentual, mudancas: [{ id, antes, changes }] }
export function planoConfirmacaoReajuste(contrato, schedules, parcelaId, novoBase, { escopo = 'ciclo', indices } = {}) {
  const aluguel = parcelasDoPapel(contrato, schedules, 'aluguel')
  const alvo = aluguel.find(s => s.id === parcelaId)
  if (!alvo) return { ciclo: 0, baseAnterior: null, percentual: null, mudancas: [] }
  const k = alvo.composicao?.ciclo ?? 0
  const anterior = k === 0 ? Number(contrato.valor_base) : aluguel.find(s => (s.composicao?.ciclo ?? 0) === k - 1)?.composicao?.base
  const baseAnterior = anterior != null ? r2(anterior) : null
  const taxa = taxaReajuste(contrato, indices) || 0
  const base = r2(novoBase)
  const recompor = (s, b, status) => {
    const outros = (s.composicao?.itens || []).filter(i => i.tipo !== 'base')
    const itens = [{ tipo: 'base', desc: 'Aluguel contratual', valor: b }, ...outros]
    const total = somaItens(itens)
    return { amount: total, valorStatus: status, composicao: { ...s.composicao, base: b, itens, total } }
  }
  const mudancas = []
  for (const s of aluguel) {
    if (parcelaPaga(s) || (valorManual(s) && s.id !== parcelaId)) continue
    const c = s.composicao?.ciclo ?? 0
    if (s.id === parcelaId || (escopo === 'ciclo' && c === k && s.startDate > alvo.startDate)) {
      mudancas.push({ id: s.id, antes: s, changes: recompor(s, base, 'confirmado') })
    } else if (escopo === 'ciclo' && c > k && s.valorStatus === 'projetado') {
      mudancas.push({ id: s.id, antes: s, changes: recompor(s, r2(base * (1 + taxa) ** (c - k)), 'projetado') })
    }
  }
  const percentual = baseAnterior ? Math.round((base / baseAnterior - 1) * 1e6) / 1e4 : null
  return { ciclo: k, baseAnterior, percentual, mudancas }
}
