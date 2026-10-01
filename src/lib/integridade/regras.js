// Motor de Integridade — regras DECLARATIVAS do estado correto dos dados.
//
// Cada regra é { codigo, descricao, lado, severidade, verificar(dados|ctx) → divergencias[] }, pura:
// recebe transactions/accounts/schedules/gerencialGroups no formato do app (camelCase) e devolve a
// lista de divergências. Roda igual no backend (api/integridade.js, a partir das linhas do banco via
// dbRows.js) e no frontend (estado do AppContext).
//
// O comportamento de cada grupo vem de reservas_funcoes.number, NUNCA do nome: number 1 → G (etapa A),
// número ≥ 2 → numerado (resgate_reserva pela default_account_id), "D"/sem grupo → nenhum efeito.
// Um grupo novo criado em Configurações entra sozinho numa dessas três classes.
//
// Regra de ouro (bug de 30/09/2026): a etapa A é verificada POR GASTO — source_expense_id / id
// tx_gerA_<gasto> / parent_tx_id do tx_ger_ antigo. Nunca pela série de parcelas, installment_key ou
// descrição: a etapa A de uma parcela irmã NÃO cobre esta.
//
// Todas as imports com extensão .js: este módulo é carregado pelo Node ESM das funções da Vercel.

import { detectInstallment, normalizeInstallmentBase } from '../installments.js'
import { isAutomacaoOrigin, isGerencialAutoOrigin, isParcelaGeradaOrigin, ORIGIN } from '../origins.js'
import { isResgatePago, isResgatePagoParaGasto } from '../resgates.js'
import { previstosDaFatura, faturasDoAgendamento, ehGastoPrevistoDeCartao } from '../gerencialPrevistos.js'
import { computeOccurrences } from '../occurrences.js'
import { computeFaturaRef } from '../fatura.js'
import { faturaToDate } from '../parcelas.js'
import { faturaEstaFechada } from '../faturasFechadas.js'

// ─── Utilitários ────────────────────────────────────────────────────────────

export const rb = (v) => Math.round((Number(v) || 0) * 100) / 100
// Diferença em centavos — abaixo de meio centavo é arredondamento, não divergência.
const difere = (a, b) => Math.abs(rb(a) - rb(b)) > 0.005

// "Hoje" no fuso do usuário: a função da Vercel roda em UTC e, entre 21h e 0h, o dia UTC já virou.
export const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function addMesesYM(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, (m - 1) + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export const ymParaRef = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : null)
export const refParaYM = (ref) => {
  const m = /^(\d{2})\/(\d{4})$/.exec(String(ref || ''))
  return m ? `${m[2]}-${m[1]}` : null
}

// Fatura (YYYY-MM) de um gasto de cartão. Mesma precedência do motor (faturaMesAnoOf): a fatura
// gravada vence; sem ela, dia da compra × dia de fechamento. fatura_ref cobre linhas que só têm
// o formato MM/AAAA.
export function faturaDoGasto(tx, card) {
  if (/^\d{4}-\d{2}$/.test(tx?.faturaMonthYear || '')) return tx.faturaMonthYear
  const porRef = refParaYM(tx?.faturaRef)
  if (porRef) return porRef
  return faturaDoDia(card, tx?.date)
}
export function faturaDoDia(card, dia) {
  if (!dia) return null
  const ref = computeFaturaRef(new Date(String(dia).slice(0, 10) + 'T00:00:00'), card?.closingDay || 14)
  return refParaYM(ref)
}

// Dia em que a fatura F ABRE: dia seguinte ao fechamento da fatura anterior (closingDay de F-1).
// É o marco a partir do qual a cadeia de uma parcela dessa fatura precisa estar completa.
export function aberturaFatura(ym, card) {
  const [y, m] = ym.split('-').map(Number)
  const c = card?.closingDay || 14
  const diasMesAnterior = new Date(y, m - 1, 0).getDate()
  if (c + 1 > diasMesAnterior) return `${ym}-01`
  const prev = addMesesYM(ym, -1)
  return `${prev}-${String(c + 1).padStart(2, '0')}`
}

// Classe de comportamento de um grupo gerencial: 'G' | 'NUM' | 'D'. Só `number` decide.
export function classeDoGrupo(g) {
  if (!g) return null
  let n = g.number
  if (typeof n === 'string' && /^\s*\d+\s*$/.test(n)) n = Number(n)
  if (n === 1) return 'G'
  if (typeof n === 'number' && Number.isFinite(n) && n >= 2) return 'NUM'
  return 'D'
}

const apelidoDoCartao = (card) => card?.apelido || card?.name?.slice(0, 6) || 'CC'
const ehSubcontaGer = (a) => !!a && a.type !== 'credit' && (a.type === 'gerencial' || a.isGerencial || /^Ger\. /.test(a.name || ''))

// Projeção de parcela 2..N ainda não confirmada — mesmo sinal do motor (isProjecaoParcela).
export const ehProjecao = (tx) =>
  (Number(tx.installmentNum) > 1 || tx.parentTxId != null || isParcelaGeradaOrigin(tx)) &&
  !tx.dateCartao && tx.origin !== ORIGIN.MANUAL

// Parcela de um lançamento: colunas installment_num/total quando existem (manual sem marcador na
// descrição), senão o "N/M" da descrição. `numOriginal` vem da descrição ORIGINAL do banco, que a
// importação grava em `payee` (favorecido = descrição do extrato quando nenhuma regra de
// classificação define outro) — é a linha cinza sob a descrição na lista da fatura. Só vale quando a
// base de lá é a mesma do lançamento (ou vazia): um favorecido "limpo" (ex.: "Jim.com") não vira parcela.
//
// Atenção: parcelas FUTURAS geradas na importação herdam o payee da linha que as gerou
// (ImportPanel, futureParcelas) — um "3/3" gerado a partir de um "1/3" carrega payee "…1/3".
export function infoParcela(tx) {
  const det = detectInstallment(tx.description || '')
  const num = tx.installmentNum ?? det?.num ?? null
  const total = tx.installmentTotal ?? det?.total ?? null
  if (num == null || total == null) return null
  const base = normalizeInstallmentBase(det ? det.base : tx.description)
  const orig = detectInstallment(tx.payee || '')
  const origValida = !!orig && (!orig.base || normalizeInstallmentBase(orig.base) === base)
  return {
    num: Number(num), total: Number(total), base,
    numDescricao: det?.num ?? null, totalDescricao: det?.total ?? null,
    numOriginal: origValida ? orig.num : null, totalOriginal: origValida ? orig.total : null,
    // Número REAL para duplicata: o do favorecido, exceto quando ele é menor com o mesmo total —
    // aí é o payee herdado da linha geradora, não sinal de outra compra.
    numReal: origValida && !(orig.num < Number(num) && orig.total === Number(total)) ? orig.num : Number(num),
  }
}

// ─── Contexto (índices montados uma vez por varredura) ───────────────────────

const CTX = Symbol('ctxIntegridade')

// opcoes.hoje: 'YYYY-MM-DD' (default: hoje em São Paulo).
// opcoes.desde: 'YYYY-MM' — faturas anteriores ficam fora (default: 3 meses antes do mês de hoje;
// null = todas). É só limite de segurança de desempenho: quem tira o histórico da avaliação é o
// filtro de faturas FECHADAS. Regras sem fatura (configuração, saldo da subconta) sempre rodam.
//
// Faturas fechadas (botão "Fechar Fatura" — dados.faturasFechadas, ou settings.faturasFechadas do
// estado do app; critério em lib/faturasFechadas) NÃO são avaliadas: nenhuma regra gera pendência
// para gasto, etapa A, resgate ou agendamento delas. Para GER_SALDO_SUBCONTA fatura fechada conta
// como liquidada (fora do esperado). Regras de série/parcela usam as parcelas de faturas fechadas só
// como REFERÊNCIA para avaliar as abertas — nunca geram pendência sobre a parcela fechada.
//
// dados.marcosSaldo: marcos de saldo aceitos por subconta Ger. (tabela marcos_saldo_gerencial) —
// ver GER_SALDO_SUBCONTA.
export function montarContexto(dados, opcoes = {}) {
  if (dados?.[CTX]) return dados
  const hoje = opcoes.hoje || hojeSP()
  const desde = opcoes.desde === undefined ? addMesesYM(hoje.slice(0, 7), -3) : opcoes.desde
  const faturasFechadas = dados?.faturasFechadas || dados?.settings?.faturasFechadas || {}
  const marcosSaldo = dados?.marcosSaldo || []
  const transactions = dados?.transactions || []
  const accounts = dados?.accounts || []
  const schedules = dados?.schedules || []
  const gerencialGroups = dados?.gerencialGroups || []

  const grupos = new Map(gerencialGroups.map(g => [g.id, g]))
  const contas = new Map(accounts.map(a => [a.id, a]))
  const cartoes = new Map(accounts.filter(a => a.type === 'credit').map(a => [a.id, a]))
  const txById = new Map(transactions.map(t => [t.id, t]))
  const subcontaIds = new Set(accounts.filter(ehSubcontaGer).map(a => a.id))
  const subcontaDoCartao = (card) => accounts.find(a => a.name === `Ger. ${apelidoDoCartao(card)}`) || null
  const contaPrincipal = accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
    || accounts.find(a => a.isMain && a.type !== 'credit')
    || accounts.find(a => a.type === 'checking') || null

  const classeDoTx = (tx) => {
    if (!tx?.grupoGerencial) return 'D'
    const g = grupos.get(tx.grupoGerencial)
    return g ? classeDoGrupo(g) : 'INEXISTENTE'
  }

  // Gastos de cartão: despesa num cartão, fora de automação/espelho.
  const gastos = []
  for (const tx of transactions) {
    if (tx.type !== 'expense' || isAutomacaoOrigin(tx) || tx.isEspelho) continue
    const card = cartoes.get(tx.cardId) || cartoes.get(tx.accountId)
    if (!card) continue
    const fatura = faturaDoGasto(tx, card)
    if (!fatura) continue
    gastos.push({ tx, card, fatura, classe: classeDoTx(tx), grupo: grupos.get(tx.grupoGerencial) || null })
  }
  const gastoById = new Map(gastos.map(g => [g.tx.id, g]))

  // Etapas A: transferência para uma subconta Ger. com vínculo a um gasto. Ajustes de troca de
  // grupo (tx_ajg_/ajuste_grupo) também entram na subconta, mas são neutralização — não etapa A.
  const etapas = []
  for (const tx of transactions) {
    if (tx.type !== 'transfer' || !subcontaIds.has(tx.toAccountId)) continue
    if (tx.origin === ORIGIN.AJUSTE_GRUPO || String(tx.id).startsWith('tx_ajg_')) continue
    const idStr = String(tx.id)
    const pareceEtapa = idStr.startsWith('tx_gerA_') || idStr.startsWith('tx_ger_') ||
      tx.origin === ORIGIN.ETAPA_A || isGerencialAutoOrigin(tx) || !!tx.sourceExpenseId ||
      /^Reserva Gerencial\b/.test(tx.description || '')
    if (!pareceEtapa) continue
    const gastoId = tx.sourceExpenseId ||
      (idStr.startsWith('tx_gerA_') ? idStr.slice(8) : null) ||
      (isGerencialAutoOrigin(tx) ? tx.parentTxId : null) || null
    etapas.push({ tx, gastoId })
  }
  const etapasPorGasto = new Map()
  for (const e of etapas) {
    if (!e.gastoId) continue
    if (!etapasPorGasto.has(e.gastoId)) etapasPorGasto.set(e.gastoId, [])
    etapasPorGasto.get(e.gastoId).push(e)
  }

  const noEscopo = (ym) => !desde || (!!ym && ym >= desde)
  const faturaAberta = (ym, card) => aberturaFatura(ym, card) <= hoje
  const fechada = (cardId, ym) => faturaEstaFechada(faturasFechadas, cardId, ym)
  // Avaliável = dentro da janela e não fechada.
  const avalia = (cardId, ym) => noEscopo(ym) && !fechada(cardId, ym)

  // Gastos por cartão+fatura.
  const gastosPorFatura = new Map()
  for (const g of gastos) {
    const k = `${g.card.id}|${g.fatura}`
    if (!gastosPorFatura.has(k)) gastosPorFatura.set(k, [])
    gastosPorFatura.get(k).push(g)
  }

  // Fatura ABERTA (não fechada) mais antiga do cartão, entre as que têm gasto e a fatura de hoje.
  // Se todas estiverem fechadas, a primeira depois delas que não esteja.
  const faturaAbertaMaisAntiga = (card) => {
    const faturas = new Set([faturaDoDia(card, hoje)])
    for (const g of gastos) if (g.card.id === card.id) faturas.add(g.fatura)
    const ord = [...faturas].filter(Boolean).sort()
    const aberta = ord.find(ym => !fechada(card.id, ym))
    if (aberta) return aberta
    let ym = addMesesYM(ord[ord.length - 1], 1)
    while (fechada(card.id, ym)) ym = addMesesYM(ym, 1)
    return ym
  }

  const ctx = {
    [CTX]: true, hoje, desde, transactions, accounts, schedules, gerencialGroups,
    grupos, contas, cartoes, txById, subcontaIds, subcontaDoCartao, contaPrincipal, classeDoTx,
    gastos, gastoById, etapas, etapasPorGasto, gastosPorFatura, noEscopo, faturaAberta,
    faturasFechadas, fechada, avalia, faturaAbertaMaisAntiga, marcosSaldo,
  }
  return ctx
}

// ─── Descrição legível ──────────────────────────────────────────────────────

const brl = (v) => `${rb(v) < 0 ? '-' : ''}R$ ${Math.abs(rb(v)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const nomeConta = (ctx, id) => { const a = ctx.contas.get(id); return a ? (a.apelido || a.name) : id }
const resumoGasto = (g) => ({
  id: g.tx.id, descricao: g.tx.description || '', valor: rb(g.tx.amount),
  data: g.tx.date || null, data_cartao: g.tx.dateCartao || null, fatura: ymParaRef(g.fatura),
  projecao: ehProjecao(g.tx),
})
const resumoEtapa = (e) => ({
  id: e.tx.id, valor: rb(e.tx.amount), fatura_ref: e.tx.faturaRef || null, data: e.tx.date || null,
  gasto_id: e.gastoId,
})
const ordenarIds = (arr) => [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)))

function divergencia(regra, campos) {
  return {
    regra: regra.codigo,
    severidade: campos.severidade || regra.severidade,
    origem_id: String(campos.origem_id),
    conta_id: campos.conta_id ?? null,
    fatura_ref: campos.fatura_ref ?? null,
    descricao: campos.descricao,
    esperado: campos.esperado ?? null,
    encontrado: campos.encontrado ?? null,
  }
}

// ─── Séries de parcelas ─────────────────────────────────────────────────────

// Parcela pelo favorecido quando a descrição não traz "N/M" (ex.: descrição limpa "Amazon
// Marketplace", favorecido "Amazon Marketplace 1/6"). Só vale se a base do favorecido for a própria
// descrição — um favorecido de OUTRA loja não transforma o lançamento em parcela.
export function infoParcelaOuFavorecido(tx) {
  const p = infoParcela(tx)
  if (p) return p
  const orig = detectInstallment(tx.payee || '')
  if (!orig) return null
  const base = normalizeInstallmentBase(tx.description)
  if (!base || normalizeInstallmentBase(orig.base) !== base) return null
  return {
    num: orig.num, total: orig.total, base, numDescricao: null, totalDescricao: null,
    numOriginal: orig.num, totalOriginal: orig.total, numReal: orig.num, viaFavorecido: true,
  }
}

const centavos = (tx) => Math.round((Number(tx.amount) || 0) * 100)
const mesesEntre = (a, b) => {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}
// Identidade da installment_key sem o número: cartão | base | total | centavos | início da série
// (fatura − (num − 1)) | ocorrência (gêmeas legítimas).
function chaveInicioDe(g, p) {
  const occ = Number(g.tx.installmentOccurrence) > 1 ? `#${g.tx.installmentOccurrence}` : ''
  return `${g.card.id}|${p.base}|${p.total}|${centavos(g.tx)}|${addMesesYM(g.fatura, -(p.num - 1))}${occ}`
}
function moda(lista) {
  const n = new Map()
  for (const x of lista) n.set(x, (n.get(x) || 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

// ─── Numeração pela posição nas faturas ─────────────────────────────────────
//
// Família = mesmo cartão + base + total + valor. Dentro dela, CADEIA = parcelas em faturas
// consecutivas (uma por fatura), cortada em salto de mês, fatura com duas parcelas da família (gêmeas
// ou duplicata — outras regras) ou número que DESCE (nova compra). Cadeia mais longa que o total
// não tem numeração válida e fica para as outras regras (ex.: 1/3, 2/3, 2/3, 3/3 é repetição real).
// Numeração candidata: cada parcela como âncora (num da âncora ± meses até ela), válida se todas as
// parcelas ficam em 1..M. Custo = parcelas cujo número muda. Custo mínimo 0 → cadeia coerente.
// Custo > 0 → a numeração está errada (ex.: 1/3, 3/3, 3/3 em 08/09/10 → 1/3, 2/3, 3/3).
// Uma única numeração de custo mínimo → 'auto'; empate → 'aprovar' com as opções (a de âncora mais
// recente primeiro). Casos reais (Itaupers, 01/10/2026): Farmácias São João e Jim.com 3x (setembro
// "3/3" é a 2/3), M6 e Aramis 4x (agosto "1/4" é a 2/4).
function cadeiasDoContexto(ctx) {
  if (ctx.cadeias) return ctx.cadeias
  const familias = new Map()
  for (const g of ctx.gastos) {
    const p = infoParcelaOuFavorecido(g.tx)
    if (!p) continue
    const k = `${g.card.id}|${p.base}|${p.total}|${centavos(g.tx)}`
    if (!familias.has(k)) familias.set(k, [])
    familias.get(k).push({ ...g, p })
  }
  const cadeias = []
  const avaliar = (itens) => {
    if (itens.length < 2) return
    const total = itens[0].p.total
    const porInicio = new Map()
    for (const a of itens) {
      const nums = itens.map(i => a.p.num + mesesEntre(a.fatura, i.fatura))
      if (nums.some(n => n < 1 || n > total)) continue
      const custo = itens.filter((i, j) => i.p.num !== nums[j]).length
      const cur = porInicio.get(nums[0])
      if (!cur) porInicio.set(nums[0], { nums, custo, ancora: a })
      else if (a.fatura > cur.ancora.fatura) cur.ancora = a
    }
    const opcoes = [...porInicio.values()].sort((x, y) => x.custo - y.custo || y.ancora.fatura.localeCompare(x.ancora.fatura))
    if (!opcoes.length || opcoes[0].custo === 0) return
    const automatica = opcoes.filter(o => o.custo === opcoes[0].custo).length === 1
    const [card, base, , cents] = [itens[0].card.id, itens[0].p.base, total, centavos(itens[0].tx)]
    cadeias.push({
      chave: `cadeia:${card}|${base}|${total}|${cents}|${itens[0].fatura}`,
      itens, total, opcoes, automatica,
    })
  }
  for (const itens of familias.values()) {
    const porFatura = new Map()
    for (const i of itens) {
      if (!porFatura.has(i.fatura)) porFatura.set(i.fatura, [])
      porFatura.get(i.fatura).push(i)
    }
    let atual = []
    const fechar = () => { avaliar(atual); atual = [] }
    for (const f of [...porFatura.keys()].sort()) {
      const doMes = porFatura.get(f)
      if (doMes.length > 1) { fechar(); continue }
      const it = doMes[0]
      const ant = atual[atual.length - 1]
      if (ant && (mesesEntre(ant.fatura, f) !== 1 || it.p.num < ant.p.num)) fechar()
      atual.push(it)
    }
    fechar()
  }
  ctx.cadeias = { cadeias, porTx: new Map(cadeias.flatMap(c => c.itens.map(i => [i.tx.id, c]))) }
  return ctx.cadeias
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const mesPorExtenso = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`

// Opções de renumeração de uma cadeia: [{ id, rotulo, recomendada, custo, parcelas: [{ id, fatura,
// de, para }] }]. A primeira é a de menor custo (e âncora mais recente).
export function opcoesDeRenumeracao(cadeia) {
  return cadeia.opcoes.map((o, idx) => ({
    id: `inicio:${o.nums[0]}`,
    recomendada: idx === 0,
    custo: o.custo,
    ancora: { id: o.ancora.tx.id, fatura: ymParaRef(o.ancora.fatura), parcela: `${o.ancora.p.num}/${cadeia.total}` },
    rotulo: `${o.nums.map(n => `${n}/${cadeia.total}`).join(', ')} (âncora: ${o.ancora.p.num}/${cadeia.total} em ${mesPorExtenso(o.ancora.fatura)}; ${o.custo} parcela(s) renumerada(s))`,
    parcelas: cadeia.itens.map((i, j) => ({
      id: i.tx.id, fatura: ymParaRef(i.fatura), descricao: i.tx.description || '',
      de: `${i.p.num}/${cadeia.total}`, para: `${o.nums[j]}/${cadeia.total}`, num: o.nums[j], serie_id: i.tx.serieId || null,
    })),
  }))
}
export const cadeiaDoTx = (ctx, txId) => cadeiasDoContexto(ctx).porTx.get(txId) || null
export const cadeiaPorChave = (ctx, chave) => cadeiasDoContexto(ctx).cadeias.find(c => c.chave === chave) || null

// Problema real da cadeia, em palavras: "duas parcelas 3/3 e sem 2/3", "1/4 fora da sequência e sem 2/4".
function problemaDaCadeia(cadeia) {
  const t = cadeia.total
  const certa = cadeia.opcoes[0].nums
  const qtd = new Map()
  for (const i of cadeia.itens) qtd.set(i.p.num, (qtd.get(i.p.num) || 0) + 1)
  const extenso = (n) => (n === 2 ? 'duas' : n === 3 ? 'três' : String(n))
  const partes = []
  for (const [n, c] of [...qtd].sort((a, b) => a[0] - b[0])) if (c > 1) partes.push(`${extenso(c)} parcelas ${n}/${t}`)
  const fora = [...qtd.keys()].filter(n => qtd.get(n) === 1 && !certa.includes(n)).sort((a, b) => a - b)
  if (fora.length) partes.push(`${fora.map(n => `${n}/${t}`).join(', ')} fora da sequência`)
  const sem = certa.filter(n => !qtd.has(n))
  if (sem.length) partes.push(`sem ${sem.map(n => `${n}/${t}`).join(', ')}`)
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : (partes[0] || 'numeração fora da sequência')
}

// Séries de parcelas, montadas UMA vez por contexto e usadas por todas as regras de série.
//
// O elo de uma compra é lancamentos.serie_id — installment_key traz o "N/M" e identifica a PARCELA,
// não a compra. Primeiro agrupa por serie_id. Depois, cada lançamento parcelado SEM serie_id é
// casado com as séries candidatas: mesmo cartão + base + valor + total, com a posição pela fatura
// (fatura − início da série + 1) caindo num BURACO da série. Com exatamente uma candidata ele é
// anexado em memória nessa posição (só para avaliação — o banco só muda pelo "Corrigir" do
// PARCELA_SEM_VINCULO); se a posição já está ocupada pelo MESMO número, é anexado como possível
// duplicata. Sem candidata, cai no agrupamento legado pela identidade da installment_key.
// Parcelas de uma cadeia com numeração errada ficam de fora: a pendência delas é uma só
// (SERIE_NUMERACAO_INCOERENTE); repetida/incompleta/sem vínculo seriam a mesma causa repetida.
function seriesDoContexto(ctx) {
  if (ctx.series) return ctx.series
  const naCadeia = cadeiasDoContexto(ctx).porTx
  const compras = new Map()
  const soltos = []
  for (const g of ctx.gastos) {
    if (naCadeia.has(g.tx.id)) continue
    if (g.tx.serieId) {
      const p = infoParcela(g.tx)
      if (!p) continue
      const chave = `serie:${g.tx.serieId}`
      if (!compras.has(chave)) compras.set(chave, { chave, serieId: g.tx.serieId, porSerieId: true, itens: [] })
      compras.get(chave).itens.push({ ...g, p, chaveInicio: chaveInicioDe(g, p) })
    } else {
      const p = infoParcelaOuFavorecido(g.tx)
      if (p) soltos.push({ ...g, p })
    }
  }
  const series = [...compras.values()]
  for (const c of series) {
    const ref = c.itens[0]
    Object.assign(c, {
      cardId: ref.card.id, base: ref.p.base, total: ref.p.total, cents: centavos(ref.tx),
      inicio: moda(c.itens.map(i => addMesesYM(i.fatura, -(i.p.num - 1)))),
      nums: new Set(c.itens.map(i => i.p.num)),
    })
  }

  const vinculos = new Map()
  for (const u of soltos) {
    const candidatas = []
    const duplicataDe = []
    for (const c of series) {
      if (c.cardId !== u.card.id || c.base !== u.p.base || c.total !== u.p.total || c.cents !== centavos(u.tx)) continue
      const k = mesesEntre(c.inicio, u.fatura) + 1
      if (k < 1 || k > c.total) continue
      if (!c.nums.has(k)) candidatas.push({ compra: c, k, conflito: k !== u.p.num })
      else if (k === u.p.num) duplicataDe.push(c)
    }
    vinculos.set(u.tx.id, { item: u, candidatas, duplicataDe })
    const alvo = candidatas.length === 1 ? candidatas[0]
      : (!candidatas.length && duplicataDe.length === 1 ? { compra: duplicataDe[0], k: u.p.num } : null)
    if (alvo) {
      const p = { ...u.p, num: alvo.k }
      alvo.compra.itens.push({ ...u, p, chaveInicio: chaveInicioDe(u, p), anexado: true })
    } else if (!u.p.viaFavorecido) {
      const chaveInicio = chaveInicioDe(u, u.p)
      const chave = `compra:${chaveInicio}`
      if (!compras.has(chave)) compras.set(chave, { chave, porSerieId: false, itens: [] })
      compras.get(chave).itens.push({ ...u, chaveInicio })
    }
  }
  ctx.series = { compras: [...compras.values()], vinculos }
  return ctx.series
}

const comprasParceladas = (ctx) => seriesDoContexto(ctx).compras

// Opções de religação de um lançamento sem serie_id (para a pendência e para o "Corrigir").
//   posição: o número pela fatura (encaixa no buraco com fatura coerente com as irmãs);
//   descrição: o número do "N/M" da descrição, quando ele diverge da posição e também é buraco.
export function opcoesDeVinculo(ctx, txId) {
  const v = seriesDoContexto(ctx).vinculos.get(txId)
  if (!v) return null
  const { item: u, candidatas } = v
  // A posição pela fatura vem SEMPRE antes e, com uma única série, é a recomendada: a fatura é
  // gravada pela importação, o "N/M" da descrição é o que costuma vir errado (caso Aramis).
  const posicoes = candidatas.map(c => ({
    id: `posicao:${c.compra.serieId}`, por: 'posicao', serie_id: c.compra.serieId, num: c.k, total: c.compra.total,
    recomendada: candidatas.length === 1,
    rotulo: `Religar como ${c.k}/${c.compra.total} (pela posição na fatura ${ymParaRef(u.fatura)}) — série ${c.compra.serieId}`,
  }))
  const descricoes = candidatas
    .filter(c => c.conflito && !c.compra.nums.has(u.p.num))
    .map(c => ({
      id: `descricao:${c.compra.serieId}`, por: 'descricao', serie_id: c.compra.serieId, num: u.p.num, total: c.compra.total,
      recomendada: false,
      rotulo: `Manter como ${u.p.num}/${c.compra.total} (número da descrição) e religar à série ${c.compra.serieId}`,
    }))
  const opcoes = [...posicoes, ...descricoes]
  const automatica = candidatas.length === 1 && !candidatas[0].conflito
  return { ...v, opcoes, automatica }
}

// ─── Regras ─────────────────────────────────────────────────────────────────

const GER_ETAPA_A_FALTANDO = {
  codigo: 'GER_ETAPA_A_FALTANDO', lado: 'falta', severidade: 'auto',
  descricao: 'Gasto do Grupo G sem a etapa A (Conta Principal → Ger.) na fatura já aberta',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const g of ctx.gastos) {
      if (g.classe !== 'G' || !ctx.avalia(g.card.id, g.fatura) || !ctx.faturaAberta(g.fatura, g.card)) continue
      if ((ctx.etapasPorGasto.get(g.tx.id) || []).length > 0) continue
      const p = infoParcela(g.tx)
      // Só informativo: irmãs da mesma descrição/valor que TÊM etapa A. É exatamente o que NÃO pode
      // contar como cobertura — a lista existe para o usuário ver por que o gasto "parecia" coberto.
      const base = p ? p.base : normalizeInstallmentBase(g.tx.description)
      const irmas = ctx.gastos.filter(o => o.tx.id !== g.tx.id && o.card.id === g.card.id &&
        rb(o.tx.amount) === rb(g.tx.amount) &&
        normalizeInstallmentBase((infoParcela(o.tx)?.base) ?? o.tx.description) === base &&
        (ctx.etapasPorGasto.get(o.tx.id) || []).length > 0)
      const sub = ctx.subcontaDoCartao(g.card)
      out.push(divergencia(this, {
        origem_id: g.tx.id, conta_id: g.card.id, fatura_ref: ymParaRef(g.fatura),
        descricao: `${g.tx.description || '(sem descrição)'} — ${brl(g.tx.amount)} na fatura ${ymParaRef(g.fatura)} do ${nomeConta(ctx, g.card.id)} não tem etapa A${ehProjecao(g.tx) ? ' (parcela projetada, ainda não importada)' : ''}`,
        esperado: {
          etapa_a_id: `tx_gerA_${g.tx.id}`, valor: rb(g.tx.amount), fatura_ref: ymParaRef(g.fatura),
          de: ctx.contaPrincipal?.id || null, para: sub?.id || null, para_nome: sub?.name || `Ger. ${apelidoDoCartao(g.card)}`,
        },
        encontrado: {
          etapas_a: [], gasto: resumoGasto(g), parcela: p ? `${p.num}/${p.total}` : null,
          projecao: ehProjecao(g.tx),
          irmas_com_etapa_a: ordenarIds(irmas.map(resumoGasto)),
        },
      }))
    }
    return out
  },
}

const GER_ETAPA_A_VALOR = {
  codigo: 'GER_ETAPA_A_VALOR', lado: 'divergência', severidade: 'auto',
  descricao: 'Etapa A com valor ou fatura diferente do gasto',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const g of ctx.gastos) {
      if (g.classe !== 'G' || !ctx.avalia(g.card.id, g.fatura)) continue
      const ets = ctx.etapasPorGasto.get(g.tx.id) || []
      if (ets.length !== 1) continue
      const e = ets[0]
      const campos = []
      if (difere(e.tx.amount, g.tx.amount)) campos.push('valor')
      if (e.tx.faturaRef && refParaYM(e.tx.faturaRef) !== g.fatura) campos.push('fatura_ref')
      if (!campos.length) continue
      out.push(divergencia(this, {
        origem_id: g.tx.id, conta_id: g.card.id, fatura_ref: ymParaRef(g.fatura),
        descricao: `Etapa A de "${g.tx.description || ''}" diverge do gasto (${campos.join(' e ')}): ${brl(e.tx.amount)} em ${e.tx.faturaRef || '—'} × ${brl(g.tx.amount)} em ${ymParaRef(g.fatura)}`,
        esperado: { valor: rb(g.tx.amount), fatura_ref: ymParaRef(g.fatura) },
        encontrado: { campos, etapa_a: resumoEtapa(e), gasto: resumoGasto(g) },
      }))
    }
    return out
  },
}

const GER_ETAPA_A_ORFA = {
  codigo: 'GER_ETAPA_A_ORFA', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Etapa A sem gasto de cartão de origem (source_expense_id inexistente ou não é despesa de cartão)',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const e of ctx.etapas) {
      const ym = refParaYM(e.tx.faturaRef) || String(e.tx.date || '').slice(0, 7)
      if (!ctx.noEscopo(ym) || ctx.fechada(e.tx.cardId, ym)) continue
      if (e.gastoId && ctx.gastoById.has(e.gastoId)) continue
      const alvo = e.gastoId ? ctx.txById.get(e.gastoId) : null
      const motivo = !e.gastoId ? 'sem vínculo' : !alvo ? 'gasto não existe' : 'origem não é despesa de cartão'
      out.push(divergencia(this, {
        origem_id: e.tx.id, conta_id: e.tx.cardId || null, fatura_ref: e.tx.faturaRef || ymParaRef(ym),
        descricao: `Etapa A "${e.tx.description || e.tx.id}" de ${brl(e.tx.amount)} está órfã (${motivo})`,
        esperado: { gasto_id: e.gastoId, existe: true, tipo: 'expense de cartão' },
        encontrado: { motivo, etapa_a: resumoEtapa(e), origem: alvo ? { id: alvo.id, type: alvo.type, account_id: alvo.accountId } : null },
      }))
    }
    return out
  },
}

const GER_ETAPA_A_DUPLICADA = {
  codigo: 'GER_ETAPA_A_DUPLICADA', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Mais de uma etapa A para o mesmo gasto',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const g of ctx.gastos) {
      if (!ctx.avalia(g.card.id, g.fatura)) continue
      const ets = ctx.etapasPorGasto.get(g.tx.id) || []
      if (ets.length < 2) continue
      const soma = ets.reduce((s, e) => s + (Number(e.tx.amount) || 0), 0)
      out.push(divergencia(this, {
        origem_id: g.tx.id, conta_id: g.card.id, fatura_ref: ymParaRef(g.fatura),
        descricao: `"${g.tx.description || ''}" (${brl(g.tx.amount)}) tem ${ets.length} etapas A somando ${brl(soma)}`,
        esperado: { quantidade: 1, valor: rb(g.tx.amount) },
        encontrado: { quantidade: ets.length, soma: rb(soma), etapas_a: ordenarIds(ets.map(resumoEtapa)), gasto: resumoGasto(g) },
      }))
    }
    return out
  },
}

const PARCELA_DUPLICADA = {
  codigo: 'PARCELA_DUPLICADA', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Mesma parcela da mesma compra lançada mais de uma vez',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const compra of comprasParceladas(ctx)) {
      // Mesmo número exibido E mesmo número REAL (descrição original do banco). Se a original diz
      // outra parcela (ex.: 1/3 × 3/3 exibido), é compra nova — não é duplicata.
      const grupos = new Map()
      for (const it of compra.itens) {
        const k = `${it.chaveInicio}|${it.p.num}|${it.p.numReal}`
        if (!grupos.has(k)) grupos.set(k, [])
        grupos.get(k).push(it)
      }
      for (const itens of grupos.values()) {
        if (itens.length < 2) continue
        // O "original" é o de fatura fechada (referência) e, depois, o confirmado (tem data do
        // extrato) mais antigo; os demais são a sobra. Sobra em fatura fechada não vira pendência.
        const fech = (i) => (ctx.fechada(i.card.id, i.fatura) ? 1 : 0)
        const ord = [...itens].sort((a, b) =>
          fech(b) - fech(a) ||
          (b.tx.dateCartao ? 1 : 0) - (a.tx.dateCartao ? 1 : 0) ||
          String(a.tx.createdAt || '').localeCompare(String(b.tx.createdAt || '')) ||
          String(a.tx.id).localeCompare(String(b.tx.id)))
        const [original, ...sobras] = ord
        for (const s of sobras) {
          if (!ctx.avalia(s.card.id, s.fatura)) continue
          out.push(divergencia(this, {
            origem_id: s.tx.id, conta_id: s.card.id, fatura_ref: ymParaRef(s.fatura),
            descricao: `Parcela ${s.p.num}/${s.p.total} de "${s.tx.description || ''}" (${brl(s.tx.amount)}) está duplicada na fatura ${ymParaRef(s.fatura)}`,
            esperado: { parcela: `${s.p.num}/${s.p.total}`, quantidade: 1, manter: original.tx.id },
            encontrado: {
              parcela: `${s.p.num}/${s.p.total}`, quantidade: itens.length,
              faturas: [...new Set(itens.map(i => ymParaRef(i.fatura)))].sort(),
              ids: itens.map(i => i.tx.id).sort(), duplicata: resumoGasto(s), original: resumoGasto(original),
            },
          }))
        }
      }
    }
    return out
  },
}

const PARCELA_FATURA_INCOERENTE = {
  codigo: 'PARCELA_FATURA_INCOERENTE', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Parcela N numa fatura anterior ou igual à da parcela N-1 da mesma compra',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const compra of comprasParceladas(ctx)) {
      // Sem serie_id a identidade já amarra número à fatura — só a série explícita pode incoerir.
      if (!compra.porSerieId) continue
      const porNum = new Map()
      for (const it of compra.itens) if (!porNum.has(it.p.num)) porNum.set(it.p.num, it)
      for (const it of compra.itens) {
        const ant = porNum.get(it.p.num - 1)
        if (!ant || it.fatura > ant.fatura || !ctx.avalia(it.card.id, it.fatura)) continue
        out.push(divergencia(this, {
          origem_id: it.tx.id, conta_id: it.card.id, fatura_ref: ymParaRef(it.fatura),
          descricao: `Parcela ${it.p.num}/${it.p.total} de "${it.tx.description || ''}" está na fatura ${ymParaRef(it.fatura)}, que não vem depois da ${ymParaRef(ant.fatura)} da parcela ${ant.p.num}`,
          esperado: { fatura_ref: ymParaRef(addMesesYM(ant.fatura, 1)) },
          encontrado: { fatura_ref: ymParaRef(it.fatura), parcela: resumoGasto(it), parcela_anterior: resumoGasto(ant) },
        }))
      }
    }
    return out
  },
}

// Descrição original (payee) com OUTRO número de parcela. Um número original MENOR que o exibido é o
// caso normal de parcela gerada (herdou o payee da linha que a gerou): só é incoerente se essa parcela
// de origem não existir na mesma compra E a série tiver buraco logo antes da parcela avaliada — foi
// o que aconteceu com o Jim.com (3/3 com payee 1/3, sem 1/3 nem 2/3 na série). Se a parcela anterior
// imediata (N-1) existe na mesma compra (mesma base, mesmo valor, fatura imediatamente anterior — a
// identidade chaveInicio garante os três), a série é coerente e a origem sumida é só histórico
// (limpeza de duplicatas, descrição diferente): não é pendência. Original maior que o exibido, ou
// total diferente, é sempre incoerente.
const PARCELA_NUMERO_INCOERENTE = {
  codigo: 'PARCELA_NUMERO_INCOERENTE', lado: 'divergência', severidade: 'aprovar',
  descricao: 'Número de parcela exibido diferente do número na descrição original do banco (favorecido) ou das colunas',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const numsPorInicio = new Map()
    for (const compra of comprasParceladas(ctx)) {
      for (const it of compra.itens) {
        if (!numsPorInicio.has(it.chaveInicio)) numsPorInicio.set(it.chaveInicio, new Map())
        numsPorInicio.get(it.chaveInicio).set(it.p.num, it)
      }
    }
    const out = []
    for (const compra of comprasParceladas(ctx)) {
      for (const it of compra.itens) {
        const g = it
        const p = it.p
        if (it.anexado || !ctx.avalia(g.card.id, g.fatura)) continue
        const motivos = []
        if (p.numOriginal != null && (p.numOriginal !== p.num || p.totalOriginal !== p.total)) {
          // Série com serie_id e irmã na mesma posição de início: o elo gravado e a posição nas faturas
          // valem mais que o número do favorecido — herdado da linha geradora ou o próprio número
          // errado que o banco mandou e a renumeração corrigiu (Farmácias: favorecido "3/3" na 2/3).
          const irmaCoerente = compra.porSerieId && compra.itens.some(o => o !== it && !o.anexado && o.chaveInicio === it.chaveInicio)
          if (p.totalOriginal !== p.total) motivos.push('descricao_original')
          else if (irmaCoerente) { /* coerente pela série */ } else if (p.numOriginal > p.num) motivos.push('descricao_original')
          else {
            const serie = numsPorInicio.get(it.chaveInicio)
            if (!serie?.has(p.numOriginal) && !serie?.has(p.num - 1)) {
              // A parcela de origem pode EXISTIR, só sem vínculo com esta série (outra serie_id ou
              // nenhuma): aí o problema não é "não existe".
              const faturaOrigemYM = addMesesYM(g.fatura, p.numOriginal - p.num)
              const existe = ctx.gastos.some(o => o.tx.id !== g.tx.id && o.card.id === g.card.id &&
                o.fatura === faturaOrigemYM && centavos(o.tx) === centavos(g.tx) &&
                infoParcelaOuFavorecido(o.tx)?.base === p.base && infoParcelaOuFavorecido(o.tx)?.num === p.numOriginal)
              motivos.push(existe ? 'parcela_de_origem_fora_da_serie' : 'parcela_de_origem_ausente')
            }
          }
        }
        if (p.numDescricao != null && (p.numDescricao !== p.num || p.totalDescricao !== p.total)) motivos.push('colunas')
        if (!motivos.length) continue
        const real = p.numOriginal != null ? `${p.numOriginal}/${p.totalOriginal}` : `${p.num}/${p.total}`
        const exibido = p.numDescricao != null ? `${p.numDescricao}/${p.totalDescricao}` : `${p.num}/${p.total}`
        const faturaOrigem = p.numOriginal != null ? ymParaRef(addMesesYM(g.fatura, p.numOriginal - p.num)) : null
        const explicacao = motivos.includes('parcela_de_origem_ausente')
          ? `, mas o favorecido diz ${real} e não existe a parcela ${real} (fatura ${faturaOrigem}) de onde ela teria sido gerada`
          : motivos.includes('parcela_de_origem_fora_da_serie')
            ? `, mas o favorecido diz ${real}: a parcela ${real} existe na fatura ${faturaOrigem}, porém fora desta série (sem o mesmo serie_id)`
          : motivos.includes('descricao_original') ? `, mas o favorecido (descrição do banco) diz ${real}`
            : `, mas as colunas dizem ${p.num}/${p.total}`
        out.push(divergencia(this, {
          origem_id: g.tx.id, conta_id: g.card.id, fatura_ref: ymParaRef(g.fatura),
          descricao: `"${g.tx.description || ''}" (${brl(g.tx.amount)}) exibida como ${exibido}${explicacao}`,
          esperado: { parcela: real, favorecido: g.tx.payee || null, fatura_parcela_origem: faturaOrigem },
          encontrado: {
            motivos, parcela_exibida: exibido, colunas: `${p.num}/${p.total}`,
            descricao: g.tx.description || '', gasto: resumoGasto(g), projecao: ehProjecao(g.tx),
          },
        }))
      }
    }
    return out.sort((a, b) => a.origem_id.localeCompare(b.origem_id))
  },
}

// Série com número repetido ou fora da sequência das faturas. Uma pendência por cadeia, com a
// renumeração pela posição (ver cadeiasDoContexto) e a religação de todas na mesma serie_id.
const SERIE_NUMERACAO_INCOERENTE = {
  codigo: 'SERIE_NUMERACAO_INCOERENTE', lado: 'divergência', severidade: 'aprovar',
  descricao: 'Compra parcelada com número repetido ou fora da sequência das faturas — renumerar pela posição',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const c of cadeiasDoContexto(ctx).cadeias) {
      if (!c.itens.some(i => ctx.avalia(i.card.id, i.fatura))) continue
      const opcoes = opcoesDeRenumeracao(c)
      const ref = c.itens[c.itens.length - 1]
      const certa = opcoes[0]
      const mudam = certa.parcelas.filter(x => x.de !== x.para)
      out.push(divergencia(this, {
        severidade: c.automatica ? 'auto' : 'aprovar',
        origem_id: c.chave, conta_id: ref.card.id, fatura_ref: ymParaRef(ref.fatura),
        descricao: `"${ref.p.base}" ${c.total}x de ${brl(ref.tx.amount)}: série com ${problemaDaCadeia(c)} — ` +
          (c.automatica
            ? `pela posição nas faturas ${mudam.map(x => `${x.fatura} é ${x.para}`).join(', ')}`
            : 'mais de uma numeração possível'),
        esperado: { numeracao: certa.parcelas.map(x => x.para), opcoes },
        encontrado: {
          parcelas: c.itens.map(i => ({ id: i.tx.id, fatura: ymParaRef(i.fatura), parcela: `${i.p.num}/${c.total}`, serie_id: i.tx.serieId || null })),
        },
      }))
    }
    return out
  },
}

// Lançamento parcelado ("N/M" na descrição ou no favorecido) sem serie_id. Com uma única série
// candidata e posição pela fatura = número da descrição → 'auto' (religar). Mais de uma candidata ou
// número da descrição ≠ posição → 'aprovar' com as opções. Sem candidata → só informativo.
// Avaliado também em fatura FECHADA quando a série candidata tem parcela em fatura aberta: o
// vínculo perdido é o que faz a série aberta parecer incompleta, e religar não mexe em valor,
// data, fatura nem saldo.
const PARCELA_SEM_VINCULO = {
  codigo: 'PARCELA_SEM_VINCULO', lado: 'falta', severidade: 'aprovar',
  descricao: 'Parcela ("N/M") sem serie_id — sem vínculo com as irmãs da compra',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const txId of seriesDoContexto(ctx).vinculos.keys()) {
      const v = opcoesDeVinculo(ctx, txId)
      const u = v.item
      const serieAberta = v.candidatas.some(c => c.compra.itens.some(i => ctx.avalia(i.card.id, i.fatura)))
      if (!ctx.avalia(u.card.id, u.fatura) && !serieAberta) continue
      const parcela = `${u.p.num}/${u.p.total}`
      const motivo = v.automatica ? null
        : v.candidatas.length > 1 ? 'mais de uma série candidata'
          : v.candidatas.length === 1 ? `a descrição diz ${parcela}, mas pela fatura é a ${v.candidatas[0].k}/${u.p.total}`
            : v.duplicataDe.length ? 'a série já tem essa parcela (possível duplicata)'
              : 'nenhuma série candidata'
      out.push(divergencia(this, {
        severidade: v.automatica ? 'auto' : 'aprovar',
        origem_id: u.tx.id, conta_id: u.card.id, fatura_ref: ymParaRef(u.fatura),
        descricao: `"${u.tx.description || ''}" (${brl(u.tx.amount)}) na fatura ${ymParaRef(u.fatura)} está sem vínculo de série` +
          (v.automatica ? ` — encaixa como ${parcela} da série ${v.candidatas[0].compra.serieId}` : ` — ${motivo}`),
        esperado: { serie_id: v.automatica ? v.candidatas[0].compra.serieId : null, parcela: v.automatica ? parcela : null, opcoes: v.opcoes },
        encontrado: {
          serie_id: null, parcela_descricao: parcela, motivo, gasto: resumoGasto(u),
          via_favorecido: !!u.p.viaFavorecido,
          series: v.candidatas.map(c => ({
            serie_id: c.compra.serieId, posicao: `${c.k}/${c.compra.total}`,
            presentes: [...c.compra.nums].sort((a, b) => a - b).map(n => `${n}/${c.compra.total}`),
          })),
          duplicata_de: v.duplicataDe.map(c => c.serieId),
        },
      }))
    }
    return out
  },
}

const SERIE_PARCELAS_INCOMPLETA = {
  codigo: 'SERIE_PARCELAS_INCOMPLETA', lado: 'falta', severidade: 'aprovar',
  descricao: 'Compra parcelada sem todas as N parcelas no cartão (buraco ou falta)',
  verificar(dados) {
    const ctx = montarContexto(dados)
    // Primeira fatura com dado de cada cartão: parcela esperada ANTES disso é de antes do app
    // acompanhar o cartão, não uma falta.
    const primeiraFatura = new Map()
    for (const g of ctx.gastos) {
      const cur = primeiraFatura.get(g.card.id)
      if (!cur || g.fatura < cur) primeiraFatura.set(g.card.id, g.fatura)
    }
    const out = []
    for (const compra of comprasParceladas(ctx)) {
      const ref = [...compra.itens].sort((a, b) => a.p.num - b.p.num)[0]
      const total = ref.p.total
      const presentes = new Set(compra.itens.map(i => i.p.num))
      const faltando = []
      for (let k = 1; k <= total; k++) {
        if (presentes.has(k)) continue
        const faturaK = addMesesYM(ref.fatura, k - ref.p.num)
        if (faturaK < (primeiraFatura.get(ref.card.id) || faturaK)) continue
        if (!ctx.avalia(ref.card.id, faturaK)) continue
        faltando.push({ parcela: `${k}/${total}`, fatura: ymParaRef(faturaK) })
      }
      if (!faltando.length) continue
      out.push(divergencia(this, {
        origem_id: compra.chave, conta_id: ref.card.id, fatura_ref: faltando[0].fatura,
        descricao: `"${ref.p.base}" em ${total}x de ${brl(ref.tx.amount)}: falta(m) ${faltando.map(f => `${f.parcela} (${f.fatura})`).join(', ')}`,
        esperado: { parcelas: total, faltando },
        encontrado: {
          presentes: [...compra.itens].sort((a, b) => a.p.num - b.p.num)
            .map(i => ({ parcela: `${i.p.num}/${i.p.total}`, fatura: ymParaRef(i.fatura), id: i.tx.id })),
        },
      }))
    }
    return out
  },
}

const SERIE_PARCELAS_REPETIDA = {
  codigo: 'SERIE_PARCELAS_REPETIDA', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Mesmo número de parcela da mesma compra (serie_id) em faturas diferentes',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const compra of comprasParceladas(ctx)) {
      if (!compra.porSerieId) continue
      const porNum = new Map()
      for (const it of compra.itens) {
        if (!porNum.has(it.p.num)) porNum.set(it.p.num, [])
        porNum.get(it.p.num).push(it)
      }
      for (const [num, itens] of porNum) {
        const faturas = [...new Set(itens.map(i => i.fatura))].sort()
        // Faturas fechadas só como referência: a pendência é sobre a(s) aberta(s).
        const abertas = faturas.filter(f => ctx.avalia(itens[0].card.id, f))
        if (faturas.length < 2 || !abertas.length) continue
        const ids = itens.map(i => i.tx.id).sort()
        out.push(divergencia(this, {
          origem_id: `${compra.chave}|${num}`, conta_id: itens[0].card.id, fatura_ref: ymParaRef(abertas[abertas.length - 1]),
          descricao: `Parcela ${num}/${itens[0].p.total} de "${itens[0].p.base}" aparece nas faturas ${faturas.map(ymParaRef).join(', ')}`,
          esperado: { parcela: `${num}/${itens[0].p.total}`, faturas: 1 },
          encontrado: { parcela: `${num}/${itens[0].p.total}`, faturas: faturas.map(ymParaRef), ids },
        }))
      }
    }
    return out
  },
}

const SERIE_GRUPO_DIVERGENTE = {
  codigo: 'SERIE_GRUPO_DIVERGENTE', lado: 'divergência', severidade: 'aprovar',
  descricao: 'Parcelas da mesma compra em grupos gerenciais diferentes',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const compra of comprasParceladas(ctx)) {
      // Parcelas de fatura fechada são referência: diverge se as abertas discordam entre si ou do
      // grupo (único) das fechadas.
      const abertas = compra.itens.filter(i => ctx.avalia(i.card.id, i.fatura))
      if (!abertas.length) continue
      const grupoDe = (i) => i.tx.grupoGerencial || null
      const gruposAbertas = new Set(abertas.map(grupoDe))
      const gruposFechadas = new Set(compra.itens.filter(i => ctx.fechada(i.card.id, i.fatura)).map(grupoDe))
      const divergeDaReferencia = gruposFechadas.size === 1 && [...gruposAbertas].some(g => !gruposFechadas.has(g))
      if (gruposAbertas.size < 2 && !divergeDaReferencia) continue
      const grupos = new Set(compra.itens.map(grupoDe))
      const alias = (id) => { const g = ctx.grupos.get(id); return g ? (g.alias || g.name || String(g.number)) : (id || 'sem grupo') }
      const itens = [...compra.itens].sort((a, b) => a.p.num - b.p.num)
      const ultimaAberta = abertas.reduce((m, i) => (i.fatura > m.fatura ? i : m))
      out.push(divergencia(this, {
        origem_id: compra.chave, conta_id: itens[0].card.id, fatura_ref: ymParaRef(ultimaAberta.fatura),
        descricao: `"${itens[0].p.base}" (${brl(itens[0].tx.amount)}) tem parcelas nos grupos ${[...grupos].map(alias).join(', ')}`,
        esperado: { grupos: 1 },
        encontrado: { parcelas: itens.map(i => ({ parcela: `${i.p.num}/${i.p.total}`, fatura: ymParaRef(i.fatura), grupo: alias(i.tx.grupoGerencial), id: i.tx.id })) },
      }))
    }
    return out
  },
}

// Devolução gerencial (G) da fatura, com o valor efetivo: o do lançamento executado quando houver.
function devolucoesDaFatura(ctx, cardId, ym) {
  return ctx.schedules
    .filter(s => s.tipo === 'gerencial_devolucao' && s.cardId === cardId && s.faturaMesAno === ym)
    .map(s => {
      const exec = ctx.transactions.find(t => t.type === 'transfer' && t.sourceScheduleId === s.id)
      const executada = isResgatePago(s.id, ctx.schedules, ctx.transactions)
      return { s, executada, valor: rb(exec ? exec.amount : s.amount) }
    })
}

const GER_FECHAMENTO_FATURA = {
  codigo: 'GER_FECHAMENTO_FATURA', lado: 'fechamento', severidade: 'aprovar',
  descricao: 'Por cartão + fatura: Σ gastos G = Σ etapas A = devolução gerencial',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    const chaves = new Set()
    for (const g of ctx.gastos) if (g.classe === 'G') chaves.add(`${g.card.id}|${g.fatura}`)
    for (const e of ctx.etapas) {
      const ym = refParaYM(e.tx.faturaRef)
      if (e.tx.cardId && ym && ctx.cartoes.has(e.tx.cardId)) chaves.add(`${e.tx.cardId}|${ym}`)
    }
    for (const chave of [...chaves].sort()) {
      const [cardId, ym] = chave.split('|')
      const card = ctx.cartoes.get(cardId)
      if (!ctx.avalia(cardId, ym) || !ctx.faturaAberta(ym, card)) continue
      const gastosG = (ctx.gastosPorFatura.get(chave) || []).filter(g => g.classe === 'G')
      const idsG = new Set(gastosG.map(g => g.tx.id))
      const etapasF = new Map()
      for (const e of ctx.etapas) {
        if ((e.gastoId && idsG.has(e.gastoId)) || (e.tx.cardId === cardId && refParaYM(e.tx.faturaRef) === ym)) etapasF.set(e.tx.id, e)
      }
      const somaG = rb(gastosG.reduce((s, g) => s + (Number(g.tx.amount) || 0), 0))
      const somaEtapas = rb([...etapasF.values()].reduce((s, e) => s + (Number(e.tx.amount) || 0), 0))
      const devs = devolucoesDaFatura(ctx, cardId, ym)
      const somaDev = rb(devs.reduce((s, d) => s + d.valor, 0))
      const semDevolucao = devs.length === 0
      const divGxA = difere(somaG, somaEtapas)
      const divAxDev = semDevolucao ? somaG > 0 : difere(somaEtapas, somaDev)
      if (!divGxA && !divAxDev) continue
      const semEtapa = gastosG.filter(g => !(ctx.etapasPorGasto.get(g.tx.id) || []).length)
      const partes = [`gastos G ${brl(somaG)}`, `etapas A ${brl(somaEtapas)}`, semDevolucao ? 'sem devolução' : `devolução ${brl(somaDev)}`]
      out.push(divergencia(this, {
        origem_id: chave, conta_id: cardId, fatura_ref: ymParaRef(ym),
        descricao: `Fatura ${ymParaRef(ym)} do ${nomeConta(ctx, cardId)} não fecha: ${partes.join(' × ')} (diferença ${brl(somaG - somaEtapas)})`,
        esperado: { soma_gastos_g: somaG, soma_etapas_a: somaG, devolucao: somaG },
        encontrado: {
          soma_gastos_g: somaG, soma_etapas_a: somaEtapas, devolucao: semDevolucao ? null : somaDev,
          diferenca_g_etapa_a: rb(somaG - somaEtapas),
          diferenca_etapa_a_devolucao: semDevolucao ? null : rb(somaEtapas - somaDev),
          gastos_sem_etapa_a: ordenarIds(semEtapa.map(resumoGasto)),
          devolucoes: devs.map(d => ({ id: d.s.id, valor: d.valor, executada: d.executada })).sort((a, b) => a.id.localeCompare(b.id)),
        },
      }))
    }
    return out
  },
}

// Último marco de saldo da subconta (maior data; empate → criado por último).
export function ultimoMarco(marcos, contaId) {
  let m = null
  for (const x of marcos || []) {
    if (x.contaId !== contaId) continue
    if (!m || x.data > m.data || (x.data === m.data && String(x.criadoEm || '') > String(m.criadoEm || ''))) m = x
  }
  return m
}

// Saldo da subconta derivado das transferências (mesmo cálculo do passo B do Reconciliar Gerenciais).
function saldoDaSubconta(ctx, sub) {
  let saldo = 0
  for (const t of ctx.transactions) {
    if (t.type !== 'transfer') continue
    if (t.toAccountId === sub.id) saldo += Number(t.amount) || 0
    if (t.accountId === sub.id) saldo -= Number(t.amount) || 0
  }
  return rb(saldo)
}

// Esperado das faturas: Σ gastos G provisionados (têm etapa A ou a fatura já abriu) das faturas
// AINDA NÃO LIQUIDADAS. Liquidada = fechada (botão "Fechar Fatura") OU com devolução gerencial já
// executada — nesses dois casos a fatura inteira sai do esperado.
export function esperadoDasFaturas(ctx, card) {
  const porFatura = new Map()
  for (const g of ctx.gastos) {
    if (g.card.id !== card.id || g.classe !== 'G') continue
    const provisionado = (ctx.etapasPorGasto.get(g.tx.id) || []).length > 0 || ctx.faturaAberta(g.fatura, card)
    if (!provisionado) continue
    if (!porFatura.has(g.fatura)) porFatura.set(g.fatura, [])
    porFatura.get(g.fatura).push(g)
  }
  let total = 0
  const detalhe = []
  for (const [ym, gs] of [...porFatura].sort()) {
    if (ctx.fechada(card.id, ym)) continue
    if (devolucoesDaFatura(ctx, card.id, ym).some(d => d.executada)) continue
    const v = rb(gs.reduce((s, g) => s + (Number(g.tx.amount) || 0), 0))
    if (!v) continue
    detalhe.push({ fatura: ymParaRef(ym), valor: v, gastos: gs.length })
    total += v
  }
  return { total: rb(total), detalhe }
}

// Saldo da subconta Ger. × esperado.
//   Sem marco: esperado = Σ gastos G provisionados das faturas abertas e não devolvidas.
//   Com marco (marcos_saldo_gerencial — "Aceitar saldo atual como correto"): o marco guarda o saldo
//   aceito e a diferença aceita (saldo − esperado das faturas naquele momento). Esperado = saldo do
//   marco + o que as faturas abertas movimentaram depois dele = esperado das faturas de agora +
//   diferença aceita. A diferença histórica zera; qualquer diferença NOVA volta a ser pendência.
// Nunca corrige: diferença de saldo não gera transferência automática (só o marco, que é registro).
const GER_SALDO_SUBCONTA = {
  codigo: 'GER_SALDO_SUBCONTA', lado: 'fechamento', severidade: 'aprovar',
  descricao: 'Saldo da subconta Ger.<apelido> = Σ gastos G provisionados das faturas abertas ainda não devolvidas (a partir do último marco de saldo)',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const card of ctx.cartoes.values()) {
      const sub = ctx.subcontaDoCartao(card)
      if (!sub) continue
      const saldo = saldoDaSubconta(ctx, sub)
      const faturas = esperadoDasFaturas(ctx, card)
      const marco = ultimoMarco(ctx.marcosSaldo, sub.id)
      const aceita = marco ? rb(marco.diferencaAceita) : 0
      const esperado = rb(faturas.total + aceita)
      if (!difere(saldo, esperado)) continue
      out.push(divergencia(this, {
        origem_id: sub.id, conta_id: card.id, fatura_ref: ymParaRef(ctx.faturaAbertaMaisAntiga(card)),
        descricao: `Subconta ${sub.name}: saldo ${brl(saldo)} × esperado ${brl(esperado)} (diferença ${brl(saldo - esperado)})`,
        esperado: {
          saldo: esperado, faturas_abertas: faturas.total, por_fatura: faturas.detalhe,
          marco: marco ? { id: marco.id || null, data: marco.data, saldo: rb(marco.saldo), diferenca_aceita: aceita } : null,
        },
        encontrado: { saldo, saldo_gravado: rb(sub.balance), diferenca: rb(saldo - esperado), subconta_id: sub.id, subconta: sub.name },
      }))
    }
    return out
  },
}

// ─── Grupos numerados ───────────────────────────────────────────────────────

// Fontes de cada resgate_reserva (cartão | fatura | conta-origem): gastos numerados + previstos
// (ocorrências pendentes de despesas agendadas no cartão, id 'sch:<agendamento>@<data>').
function fontesNumeradas(ctx) {
  const fontes = new Map() // `${card}|${ym}|${origem}` → [{ id, valor, descricao, grupoId }]
  const push = (card, ym, origem, f) => {
    const k = `${card.id}|${ym}|${origem}`
    if (!fontes.has(k)) fontes.set(k, [])
    fontes.get(k).push(f)
  }
  for (const g of ctx.gastos) {
    if (g.classe !== 'NUM' || !g.grupo?.defaultAccountId) continue
    push(g.card, g.fatura, g.grupo.defaultAccountId, { id: g.tx.id, valor: rb(g.tx.amount), descricao: g.tx.description || '', grupoId: g.grupo.id })
  }
  for (const card of ctx.cartoes.values()) {
    const faturas = new Set()
    for (const s of ctx.schedules) {
      if (!ehGastoPrevistoDeCartao(s, card.id)) continue
      for (const ym of faturasDoAgendamento({ schedule: s, cardId: card.id, getOccurrences: computeOccurrences, faturaDe: (d) => faturaDoDia(card, d) })) faturas.add(ym)
    }
    for (const ym of faturas) {
      if (!ctx.avalia(card.id, ym)) continue
      for (const prev of previstosDaFatura({ schedules: ctx.schedules, cardId: card.id, faturaMesAno: ym, getOccurrences: computeOccurrences, faturaDe: (d) => faturaDoDia(card, d) })) {
        const grupo = ctx.grupos.get(prev.grupoGerencial)
        if (classeDoGrupo(grupo) !== 'NUM' || !grupo.defaultAccountId) continue
        push(card, ym, grupo.defaultAccountId, { id: prev.id, valor: prev.valor, descricao: `Previsto ${prev.date}`, grupoId: grupo.id })
      }
    }
  }
  return fontes
}

function resgatesDe(ctx, card, ym, origem) {
  const venc = faturaToDate(ym, card.dueDay || 10)
  return ctx.schedules.filter(s => s.accountId === origem && (
    (s.tipo === 'resgate_reserva' && s.cardId === card.id && s.faturaMesAno === ym) ||
    // legado: ger_num_{grupo}_{cartão}_{vencimento}
    (!s.tipo && String(s.overrides?._gerencialKey || '').startsWith('ger_num_') &&
      String(s.overrides._gerencialKey).includes(`_${card.id}_`) && s.startDate === venc)
  ))
}

const NUM_RESGATE_FALTANDO = {
  codigo: 'NUM_RESGATE_FALTANDO', lado: 'falta', severidade: 'auto',
  descricao: 'Cartão + fatura com gastos de grupo numerado sem o resgate_reserva da conta-origem',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const [k, fs] of [...fontesNumeradas(ctx)].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [cardId, ym, origem] = k.split('|')
      const card = ctx.cartoes.get(cardId)
      if (!ctx.avalia(cardId, ym) || !ctx.faturaAberta(ym, card)) continue
      const soma = rb(fs.reduce((s, f) => s + f.valor, 0))
      if (!(soma > 0) || resgatesDe(ctx, card, ym, origem).length) continue
      out.push(divergencia(this, {
        origem_id: k, conta_id: cardId, fatura_ref: ymParaRef(ym),
        descricao: `Fatura ${ymParaRef(ym)} do ${nomeConta(ctx, cardId)}: ${fs.length} gasto(s) de ${nomeConta(ctx, origem)} (${brl(soma)}) sem resgate_reserva`,
        esperado: { agendamento_id: `fsch_${cardId}_${ym.replace('-', '')}_resgate_reserva_${origem}`, valor: soma, conta_origem: origem },
        encontrado: { resgates: [], fontes: ordenarIds(fs) },
      }))
    }
    return out
  },
}

const NUM_RESGATE_VALOR = {
  codigo: 'NUM_RESGATE_VALOR', lado: 'divergência', severidade: 'auto',
  descricao: 'Resgate_reserva pendente ≠ Σ gastos realizados + previstos ainda não resgatados da conta-origem na fatura',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const [k, fs] of [...fontesNumeradas(ctx)].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [cardId, ym, origem] = k.split('|')
      const card = ctx.cartoes.get(cardId)
      if (!ctx.avalia(cardId, ym)) continue
      const resgates = resgatesDe(ctx, card, ym, origem)
      if (!resgates.length) continue // NUM_RESGATE_FALTANDO
      const pendentes = resgates.filter(s => !isResgatePago(s.id, ctx.schedules, ctx.transactions))
      const naoResgatadas = fs.filter(f => !isResgatePagoParaGasto(f.id, ctx.schedules, ctx.transactions))
      const esperado = rb(naoResgatadas.reduce((s, f) => s + f.valor, 0))
      const pendente = rb(pendentes.reduce((s, r) => s + (Number(r.amount) || 0), 0))
      if (!difere(esperado, pendente)) continue
      out.push(divergencia(this, {
        origem_id: k, conta_id: cardId, fatura_ref: ymParaRef(ym),
        descricao: `Resgate de ${nomeConta(ctx, origem)} na fatura ${ymParaRef(ym)} do ${nomeConta(ctx, cardId)}: pendente ${brl(pendente)} × esperado ${brl(esperado)}`,
        esperado: { valor: esperado, fontes: ordenarIds(naoResgatadas) },
        encontrado: {
          valor: pendente,
          pendentes: pendentes.map(s => ({ id: s.id, valor: rb(s.amount), fontes: [...(s.sourceExpenseIds || [])].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
          executados: resgates.filter(s => !pendentes.includes(s)).map(s => s.id).sort(),
        },
      }))
    }
    return out
  },
}

const NUM_RESGATE_ORFAO = {
  codigo: 'NUM_RESGATE_ORFAO', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Resgate_reserva pendente de uma origem sem nenhum gasto numerado na fatura',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const fontes = fontesNumeradas(ctx)
    const out = []
    for (const s of ctx.schedules) {
      if (s.tipo !== 'resgate_reserva' || !s.cardId || !s.faturaMesAno || !ctx.avalia(s.cardId, s.faturaMesAno)) continue
      if (isResgatePago(s.id, ctx.schedules, ctx.transactions)) continue
      const fs = fontes.get(`${s.cardId}|${s.faturaMesAno}|${s.accountId}`) || []
      if (fs.some(f => f.valor > 0)) continue
      out.push(divergencia(this, {
        origem_id: s.id, conta_id: s.cardId, fatura_ref: ymParaRef(s.faturaMesAno),
        descricao: `Resgate pendente "${s.description || s.id}" (${brl(s.amount)}) sem gasto de ${nomeConta(ctx, s.accountId)} na fatura ${ymParaRef(s.faturaMesAno)}`,
        esperado: { gastos: '≥ 1' },
        encontrado: { agendamento: { id: s.id, valor: rb(s.amount), conta_origem: s.accountId, fontes: [...(s.sourceExpenseIds || [])].sort() } },
      }))
    }
    return out
  },
}

const NUM_SEM_CONTA_ORIGEM = {
  codigo: 'NUM_SEM_CONTA_ORIGEM', lado: 'configuração', severidade: 'aprovar',
  descricao: 'Grupo numerado sem conta-origem (default_account_id) mas com gastos atribuídos',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const grupo of ctx.gerencialGroups) {
      if (classeDoGrupo(grupo) !== 'NUM' || grupo.defaultAccountId) continue
      const gs = ctx.gastos.filter(g => g.tx.grupoGerencial === grupo.id && ctx.avalia(g.card.id, g.fatura))
      if (!gs.length) continue
      const soma = rb(gs.reduce((s, g) => s + (Number(g.tx.amount) || 0), 0))
      out.push(divergencia(this, {
        origem_id: grupo.id,
        descricao: `Grupo "${grupo.name || grupo.alias || grupo.id}" (número ${grupo.number}) não tem conta-origem e tem ${gs.length} gasto(s) (${brl(soma)})`,
        esperado: { default_account_id: 'configurada' },
        encontrado: { default_account_id: null, gastos: gs.length, soma, exemplos: ordenarIds(gs.map(resumoGasto)).slice(0, 10) },
      }))
    }
    return out
  },
}

function etapaEmGrupoErrado(regra, classes, rotulo) {
  return {
    ...regra,
    verificar(dados) {
      const ctx = montarContexto(dados)
      const out = []
      for (const g of ctx.gastos) {
        if (!classes.has(g.classe) || !ctx.avalia(g.card.id, g.fatura)) continue
        const ets = ctx.etapasPorGasto.get(g.tx.id) || []
        if (!ets.length) continue
        const soma = rb(ets.reduce((s, e) => s + (Number(e.tx.amount) || 0), 0))
        out.push(divergencia(this, {
          origem_id: g.tx.id, conta_id: g.card.id, fatura_ref: ymParaRef(g.fatura),
          descricao: `"${g.tx.description || ''}" (${brl(g.tx.amount)}) é ${rotulo(ctx, g)} mas ainda tem etapa A de ${brl(soma)}`,
          esperado: { etapas_a: 0 },
          encontrado: { etapas_a: ordenarIds(ets.map(resumoEtapa)), grupo: g.tx.grupoGerencial || null, gasto: resumoGasto(g) },
        }))
      }
      return out
    },
  }
}

const NUM_COM_ETAPA_A = etapaEmGrupoErrado({
  codigo: 'NUM_COM_ETAPA_A', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Gasto de grupo numerado que ainda tem etapa A (sobrou de quando era G)',
}, new Set(['NUM']), (ctx, g) => `do grupo ${g.grupo?.alias || g.grupo?.name || g.grupo?.number}`)

const D_COM_ETAPA_A = etapaEmGrupoErrado({
  codigo: 'D_COM_ETAPA_A', lado: 'sobra', severidade: 'aprovar',
  descricao: 'Gasto do grupo D (ou sem grupo) que ainda tem etapa A',
}, new Set(['D']), (ctx, g) => (g.tx.grupoGerencial ? 'do grupo D' : 'sem grupo'))

const GRUPO_INEXISTENTE = {
  codigo: 'GRUPO_INEXISTENTE', lado: 'configuração', severidade: 'aprovar',
  descricao: 'Lançamento com grupo_gerencial que não existe em reservas_funcoes',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const tx of ctx.transactions) {
      if (!tx.grupoGerencial || ctx.grupos.has(tx.grupoGerencial)) continue
      const g = ctx.gastoById.get(tx.id)
      const ym = g ? g.fatura : String(tx.date || '').slice(0, 7)
      if (!ctx.noEscopo(ym) || (g && ctx.fechada(g.card.id, g.fatura))) continue
      out.push(divergencia(this, {
        origem_id: tx.id, conta_id: g?.card.id || tx.accountId || null, fatura_ref: g ? ymParaRef(g.fatura) : null,
        descricao: `"${tx.description || tx.id}" (${brl(tx.amount)}) aponta para o grupo inexistente "${tx.grupoGerencial}"`,
        esperado: { grupo_gerencial: 'um id de reservas_funcoes' },
        encontrado: { grupo_gerencial: tx.grupoGerencial, type: tx.type, data: tx.date || null },
      }))
    }
    return out
  },
}

// Passo "resgate/devolução inclui o gasto" da cadeia, para cada gasto de fatura já aberta.
// G: a devolução gerencial da fatura lista o gasto em source_expense_ids. Numerado: algum
// resgate_reserva da origem na fatura lista o gasto. Projeção de parcela fica de fora (o motor só
// a inclui na devolução depois de importada — a falta da etapa A dela já é pendência própria).
// Quando só existe devolução/resgate EXECUTADO, incluir o gasto mexe em resgate executado →
// severidade 'aprovar'.
const CADEIA_INCOMPLETA = {
  codigo: 'CADEIA_INCOMPLETA', lado: 'falta', severidade: 'auto',
  descricao: 'Gasto de fatura já aberta que não está incluído na devolução/resgate da fatura',
  verificar(dados) {
    const ctx = montarContexto(dados)
    const out = []
    for (const g of ctx.gastos) {
      if (!ctx.avalia(g.card.id, g.fatura) || !ctx.faturaAberta(g.fatura, g.card) || ehProjecao(g.tx)) continue
      let agendas
      let passo
      if (g.classe === 'G') {
        agendas = devolucoesDaFatura(ctx, g.card.id, g.fatura).map(d => ({ s: d.s, executada: d.executada }))
        passo = 'devolução gerencial'
      } else if (g.classe === 'NUM' && g.grupo?.defaultAccountId) {
        agendas = resgatesDe(ctx, g.card, g.fatura, g.grupo.defaultAccountId)
          .map(s => ({ s, executada: isResgatePago(s.id, ctx.schedules, ctx.transactions) }))
        passo = `resgate de ${nomeConta(ctx, g.grupo.defaultAccountId)}`
      } else continue
      // Sem agendamento nenhum: GER_FECHAMENTO_FATURA / NUM_RESGATE_FALTANDO já acusam, por fatura.
      if (!agendas.length) continue
      // Agendamento legado sem rastreabilidade (source_expense_ids vazio) não permite afirmar nada.
      if (agendas.some(a => !(a.s.sourceExpenseIds || []).length)) continue
      if (agendas.some(a => a.s.sourceExpenseIds.includes(g.tx.id))) continue
      const soExecutadas = agendas.every(a => a.executada)
      out.push(divergencia(this, {
        severidade: soExecutadas ? 'aprovar' : 'auto',
        origem_id: g.tx.id, conta_id: g.card.id, fatura_ref: ymParaRef(g.fatura),
        descricao: `"${g.tx.description || ''}" (${brl(g.tx.amount)}) não está na ${passo} da fatura ${ymParaRef(g.fatura)}${soExecutadas ? ' (já executada)' : ''}`,
        esperado: { passo, incluir_gasto: g.tx.id },
        encontrado: { agendamentos: agendas.map(a => ({ id: a.s.id, valor: rb(a.s.amount), executado: a.executada })).sort((a, b) => a.id.localeCompare(b.id)), gasto: resumoGasto(g) },
      }))
    }
    return out
  },
}

export const REGRAS = [
  GER_ETAPA_A_FALTANDO, GER_ETAPA_A_VALOR, GER_ETAPA_A_ORFA, GER_ETAPA_A_DUPLICADA,
  SERIE_NUMERACAO_INCOERENTE, PARCELA_SEM_VINCULO, PARCELA_DUPLICADA, PARCELA_FATURA_INCOERENTE, PARCELA_NUMERO_INCOERENTE,
  SERIE_PARCELAS_INCOMPLETA, SERIE_PARCELAS_REPETIDA, SERIE_GRUPO_DIVERGENTE,
  GER_FECHAMENTO_FATURA, GER_SALDO_SUBCONTA,
  NUM_RESGATE_FALTANDO, NUM_RESGATE_VALOR, NUM_RESGATE_ORFAO, NUM_SEM_CONTA_ORIGEM,
  NUM_COM_ETAPA_A, D_COM_ETAPA_A, GRUPO_INEXISTENTE, CADEIA_INCOMPLETA,
]

export const REGRAS_POR_CODIGO = Object.fromEntries(REGRAS.map(r => [r.codigo, r]))

// Regras avaliadas sempre por inteiro (fora da janela `desde`): a fatura_ref delas é só onde a
// pendência é exibida (a fatura aberta mais antiga), não o recorte avaliado.
export const REGRAS_SEM_JANELA = new Set(['GER_SALDO_SUBCONTA'])

// Roda as regras (todas, ou só `opcoes.regras`) sobre um único contexto. Saída ordenada e sem
// carimbo de tempo: a mesma base produz exatamente a mesma lista (idempotência da varredura).
export function executarRegras(dados, opcoes = {}) {
  const ctx = montarContexto(dados, opcoes)
  const lista = opcoes.regras ? REGRAS.filter(r => opcoes.regras.includes(r.codigo)) : REGRAS
  const out = []
  for (const r of lista) out.push(...r.verificar(ctx))
  const vistos = new Set()
  return out
    .filter(d => { const k = `${d.regra}|${d.origem_id}`; if (vistos.has(k)) return false; vistos.add(k); return true })
    .sort((a, b) => a.regra.localeCompare(b.regra) || a.origem_id.localeCompare(b.origem_id))
}
