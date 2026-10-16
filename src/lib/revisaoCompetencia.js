// Correção das pendências de COMPETÊNCIA do "Revisar Movimentos Automáticos" (cartão).
//
// As regras (integridade/regras.js) só apontam; aqui sai o PLANO de correção de cada item, puro e
// testável, que a tela mostra como prévia e depois executa com as ações normais do app
// (deleteTransaction / updateTransaction). Nada aqui grava.
//
//  COMPETENCIA_IMPLAUSIVEL (gasto real numa fatura implausível):
//    · existe o MESMO gasto numa fatura plausível → "excluir_duplicata" (leva junto a etapa A dele);
//    · não existe → "mover" para a fatura calculada pela data da compra.
//  GER_RESERVA_FATURA_INCOERENTE / GER_RESERVA_DUPLICADA_ENTRE_FATURAS (Reserva Gerencial = etapa A):
//    · o gasto de origem já vai ser excluído/movido → "coberta" (resolve junto);
//    · senão → "excluir_reserva": remove só a transferência gerencial. O gasto NUNCA é apagado aqui;
//      o reconciliador recria a reserva certa para ele, na fatura certa, se faltar.
//
// Import com extensão .js: também carregado pelo Node ESM (scripts de conferência).
import { faturaDoGasto, faturaDoDia, addMesesYM, ymParaRef, refParaYM, rb } from './integridade/regras.js'
import { competenciaPlausivel } from './competenciaFatura.js'
import { detectInstallment } from './installments.js'

export const ORIGEM_REVISAO = 'revisao_automatica'

export const REGRA_GASTO = 'COMPETENCIA_IMPLAUSIVEL'
export const REGRAS_RESERVA = ['GER_RESERVA_FATURA_INCOERENTE', 'GER_RESERVA_DUPLICADA_ENTRE_FATURAS']

const normDesc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const dia = (s) => String(s || '').slice(0, 10)
// Nº da parcela: coluna installment_num ou o "N/M" da descrição (mesma leitura da regra).
const numParcela = (tx) => Number(tx.installmentNum ?? detectInstallment(tx.description || '')?.num) || null

// Gasto plausível? (mesma medida da regra COMPETENCIA_IMPLAUSIVEL)
function plausivel(tx, fatura) {
  return competenciaPlausivel({ faturaMY: fatura, dateCartao: tx.dateCartao, date: tx.date, installmentNum: numParcela(tx) })
}

// Fatura certa pela data da compra: a fatura do dia da compra (fechamento do cartão) e, na parcela
// N de uma compra com data original, N−1 faturas depois. `conferir` = parcela: a data original nem
// sempre é a da compra (ex.: anuidade), então a sugestão pede um olhar antes de aplicar.
export function faturaCorretaDoGasto(tx, card) {
  const n = numParcela(tx) > 1 ? numParcela(tx) : 1
  if (tx.dateCartao) {
    const base = faturaDoDia(card, tx.dateCartao)
    if (!base) return null
    return { fatura: n > 1 ? addMesesYM(base, n - 1) : base, conferir: n > 1 }
  }
  const f = faturaDoDia(card, tx.date)
  return f ? { fatura: f, conferir: n > 1 } : null
}

// O mesmo gasto (cartão, descrição, valor, data da compra e parcela) numa fatura plausível
// diferente da do gasto suspeito. `usados` evita casar dois suspeitos com o mesmo equivalente.
export function acharEquivalente(tx, card, transactions, usados = new Set()) {
  const fSuspeito = faturaDoGasto(tx, card)
  const desc = normDesc(tx.description)
  const valor = rb(tx.amount)
  const parcela = numParcela(tx)
  const cands = transactions.filter(o => {
    if (o.id === tx.id || usados.has(o.id) || o.type !== 'expense') return false
    if ((o.cardId || o.accountId) !== card.id) return false
    if (normDesc(o.description) !== desc || rb(o.amount) !== valor) return false
    if (numParcela(o) !== parcela) return false
    const mesmaData = tx.dateCartao && o.dateCartao ? dia(tx.dateCartao) === dia(o.dateCartao) : dia(tx.date) === dia(o.date)
    if (!mesmaData) return false
    const f = faturaDoGasto(o, card)
    return f && f !== fSuspeito && plausivel(o, f)
  })
  if (!cands.length) return null
  // Preferência: o da fatura certa pela data da compra; depois o mais antigo.
  const certa = faturaCorretaDoGasto(tx, card)?.fatura
  cands.sort((a, b) =>
    (faturaDoGasto(b, card) === certa) - (faturaDoGasto(a, card) === certa) ||
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)))
  return cands[0]
}

const etapasDoGasto = (gastoId, transactions) => transactions.filter(t =>
  t.type === 'transfer' && (t.id === `tx_gerA_${gastoId}` || t.sourceExpenseId === gastoId))

// divergencias: saída de executarRegras(REGRAS_COMPETENCIA) já filtrada para o cartão/subconta.
// Devolve { itens, resumo }. Cada item: { chave, regra, origemId, tipo, descricao, valor, fatura,
//   excluir: [ids que somem], mover: { id, de, para } | null, equivalente, cobertaPor, aviso }.
export function planejarCorrecoesCompetencia({ divergencias, transactions, card }) {
  const txById = new Map((transactions || []).map(t => [t.id, t]))
  const usados = new Set()
  const planoGasto = new Map() // gastoId → item
  const itens = []

  // 1º os gastos (definem se a reserva fica coberta).
  for (const d of divergencias || []) {
    if (d.regra !== REGRA_GASTO) continue
    const tx = txById.get(d.origem_id)
    if (!tx) continue
    const fatura = faturaDoGasto(tx, card)
    const base = { chave: `${d.regra}|${d.origem_id}`, regra: d.regra, origemId: tx.id, descricao: tx.description || '', detalhe: d.descricao, valor: rb(tx.amount), data: dia(tx.dateCartao || tx.date), fatura }
    const etapas = etapasDoGasto(tx.id, transactions).map(t => t.id)
    const eq = acharEquivalente(tx, card, transactions, usados)
    let item
    if (eq) {
      usados.add(eq.id)
      item = { ...base, tipo: 'excluir_duplicata', excluir: [tx.id, ...etapas], mover: null, equivalente: { id: eq.id, fatura: faturaDoGasto(eq, card) } }
    } else {
      const certa = faturaCorretaDoGasto(tx, card)
      if (certa && certa.fatura !== fatura && plausivel(tx, certa.fatura)) {
        item = { ...base, tipo: 'mover', excluir: [], mover: { id: tx.id, de: fatura, para: certa.fatura }, equivalente: null,
          aviso: certa.conferir ? 'Parcela: confira se a fatura sugerida é a certa antes de aplicar.' : null }
      } else {
        item = { ...base, tipo: 'sem_sugestao', excluir: [], mover: null, equivalente: null, aviso: 'Sem fatura segura para sugerir — corrija manualmente.' }
      }
    }
    planoGasto.set(tx.id, item)
    itens.push(item)
  }

  // 2º as reservas (uma por etapa A, mesmo que apareça nas duas regras).
  const reservaVista = new Map()
  for (const d of divergencias || []) {
    if (!REGRAS_RESERVA.includes(d.regra)) continue
    const et = txById.get(d.origem_id)
    if (!et) continue
    if (reservaVista.has(et.id)) { const r = reservaVista.get(et.id); r.regras.push(d.regra); r.detalhes.push(d.descricao); continue }
    const gastoId = et.sourceExpenseId || (String(et.id).startsWith('tx_gerA_') ? String(et.id).slice(8) : null)
    const pg = gastoId ? planoGasto.get(gastoId) : null
    const coberta = pg && (pg.tipo === 'excluir_duplicata' || pg.tipo === 'mover')
    const gastoTx = gastoId ? txById.get(gastoId) : null
    const item = {
      chave: `RESERVA|${et.id}`, regra: d.regra, regras: [d.regra], origemId: et.id, gastoId,
      descricao: et.description || '', detalhe: d.descricao, detalhes: [d.descricao], valor: rb(et.amount), data: dia(et.date),
      fatura: refParaYM(et.faturaRef) || null,
      // Fatura do gasto de origem: a dos agendamentos de resgate/devolução que mudam sem a reserva.
      faturaGasto: gastoTx ? faturaDoGasto(gastoTx, card) : null,
      tipo: coberta ? 'coberta' : 'excluir_reserva',
      excluir: coberta ? [] : [et.id], mover: null, equivalente: null,
      cobertaPor: coberta ? pg.chave : null,
    }
    reservaVista.set(et.id, item)
    itens.push(item)
  }

  return { itens, resumo: resumirPlano(itens, txById) }
}

// Totais da prévia: o que some (gastos e reservas, sem repetir) e o que muda de fatura.
export function resumirPlano(itens, txById) {
  const excluidos = new Map()
  const movidos = []
  for (const it of itens) {
    for (const id of it.excluir || []) if (!excluidos.has(id)) excluidos.set(id, txById.get(id))
    if (it.mover) movidos.push({ ...it.mover, tx: txById.get(it.mover.id) })
  }
  const lista = [...excluidos.values()].filter(Boolean)
  const ehGasto = (t) => t.type === 'expense'
  return {
    excluidos: lista,
    movidos,
    qtdGastosExcluidos: lista.filter(ehGasto).length,
    qtdReservasExcluidas: lista.filter(t => !ehGasto(t)).length,
    totalGastosExcluidos: rb(lista.filter(ehGasto).reduce((s, t) => s + (Number(t.amount) || 0), 0)),
    totalReservasExcluidas: rb(lista.filter(t => !ehGasto(t)).reduce((s, t) => s + (Number(t.amount) || 0), 0)),
    totalMovido: rb(movidos.reduce((s, m) => s + (Number(m.tx?.amount) || 0), 0)),
  }
}

// Ações executáveis de uma lista de itens: ids a excluir com deleteTransaction (só o "primário":
// a etapa A de um gasto excluído sai na cascata do próprio deleteTransaction) e as mudanças de fatura.
export function acoesDoPlano(itens) {
  const excluir = []
  const mover = []
  const vistos = new Set()
  for (const it of itens) {
    if (it.tipo === 'excluir_duplicata' || it.tipo === 'excluir_reserva') {
      const id = it.excluir[0]
      if (id && !vistos.has(id)) { vistos.add(id); excluir.push(id) }
    } else if (it.tipo === 'mover' && it.mover) mover.push(it.mover)
  }
  return { excluir, mover }
}

// Linhas de historico_alteracoes (origem revisao_automatica) de uma execução. Exclusão: campo
// 'exclusao' com a foto do lançamento; mudança de fatura: campo 'faturaMonthYear'.
export function linhasHistoricoRevisao(itens, txById, { loteId }) {
  const linhas = []
  const vistos = new Set()
  const foto = (t) => ({
    id: t.id, type: t.type, description: t.description || '', amount: rb(t.amount), date: dia(t.date),
    dateCartao: t.dateCartao ? dia(t.dateCartao) : null, accountId: t.accountId || null,
    toAccountId: t.toAccountId || null, faturaMonthYear: t.faturaMonthYear || null, faturaRef: t.faturaRef || null,
  })
  for (const it of itens) {
    const motivoBase = it.tipo === 'excluir_duplicata'
      ? `Revisão automática: duplicata de ${it.equivalente.id} (fatura ${ymParaRef(it.equivalente.fatura)}) em fatura implausível ${ymParaRef(it.fatura)}`
      : it.tipo === 'excluir_reserva'
        ? `Revisão automática: reserva gerencial ${(it.regras || [it.regra]).includes('GER_RESERVA_DUPLICADA_ENTRE_FATURAS') ? 'duplicada entre faturas' : 'com fatura incoerente'}`
        : it.tipo === 'mover' ? `Revisão automática: gasto em fatura implausível ${ymParaRef(it.mover.de)} → ${ymParaRef(it.mover.para)}` : null
    if (!motivoBase) continue
    for (const id of it.excluir || []) {
      if (vistos.has(id)) continue
      const t = txById.get(id)
      if (!t) continue
      vistos.add(id)
      const motivo = id === it.origemId ? motivoBase : `${motivoBase} — etapa A do gasto ${it.origemId}`
      linhas.push({ entidade: 'lancamento', entidade_id: id, escopo: 'parcela', lote_id: loteId, campo: 'exclusao', valor_anterior: foto(t), valor_novo: null, motivo, origem: ORIGEM_REVISAO })
    }
    if (it.mover) {
      linhas.push({ entidade: 'lancamento', entidade_id: it.mover.id, escopo: 'parcela', lote_id: loteId, campo: 'faturaMonthYear', valor_anterior: it.mover.de, valor_novo: it.mover.para, motivo: motivoBase, origem: ORIGEM_REVISAO })
    }
  }
  return linhas
}
