// Importar Fatura — "JÁ LANÇADO": casa a linha do arquivo com um lançamento do cartão feito ANTES
// da importação (manual ou pelo Assistente IA) ou com um pré-lançamento pendente do Assistente,
// sem depender da descrição (o banco escreve "IFD*DJM EMPREENDIMENTO"; o usuário, "iFood").
//
// Roda DEPOIS dos passos atuais de resolverLinhasRevisao (FITID, colisão de parcela, "Já existe",
// que continuam valendo para a reimportação da mesma fatura) e só sobre as linhas que eles não
// resolveram. Candidatos: lançamentos NÃO conciliados do MESMO cartão (account_id do cartão — a
// maioria tem card_id NULL) e da MESMA fatura + pré-lançamentos pendentes desse cartão.
// Critério: mesmo tipo, valor ±R$ 0,01 e data da compra ±3 dias. Parcela: por PARCELA — valor da
// parcela, número/total e fatura (a data de uma parcela N > 1 é a do dia financeiro, não da compra).
// Resultado por linha: 1 candidato (que não é o único de outra linha) → 'casada'; mais de um, ou
// disputado por duas linhas → 'escolher' (nunca casa sozinho); nenhum → 'nova'.
// PURO: sem React, sem I/O (usado pela tela e pelo preview somente leitura). Imports com .js.
// ESTIMADOS (compra em moeda estrangeira e o IOF dela — src/lib/cambio.js): o valor em R$ só fecha
// na fatura, então o critério é outro — compra: estabelecimento parecido, data ±5 dias e valor ±15%
// (ou o mesmo valor na moeda, se a linha trouxer); IOF: linha de IOF, data ±5 dias e valor ±20%, ou a
// SOMA dos IOFs estimados da fatura quando o banco agrupa numa linha só. Ao casar, o lançamento
// recebe o valor real e deixa de ser estimado (a compra grava o spread real do cartão).
import { faturaDoLancamento } from './scheduleBaixa.js'
import { numeroParcelaDoTx, totalParcelasDoTx } from './revisaoImportacao.js'
import { ehIof, ajusteDaCompraEstimada } from './cambio.js'
import { normalizarTermo } from './assistente/texto.js'

export const TOL_VALOR_JA_LANCADO = 0.01
export const JANELA_DIAS_JA_LANCADO = 3
export const JANELA_DIAS_ESTIMADO = 5
export const TOL_COMPRA_ESTIMADA = 0.15
export const TOL_IOF_ESTIMADO = 0.20

const tipoDe = (x) => x.type || 'expense'
const centavos = (v) => Math.round((Number(v) || 0) * 100)
const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86_400_000))

// Parcela da linha (num/total) — só conta como parcela quando total > 1.
const parcelaDaLinha = (r) => {
  const num = r._installment?.num != null ? Number(r._installment.num) : null
  const total = r._installment?.total != null ? Number(r._installment.total) : null
  return total > 1 ? { num, total } : null
}
const parcelaDoTx = (t) => {
  const num = numeroParcelaDoTx(t)
  const total = totalParcelasDoTx(t)
  return total > 1 ? { num, total } : null
}

// Data da compra: a do cartão quando gravada; senão a do lançamento.
const dataCompraDaLinha = (r) => r._dateCartao || r.date
const dataCompraDoTx = (t) => (t.dateCartao ? String(t.dateCartao).slice(0, 10) : t.date)

// Pré-lançamento pendente do Assistente → candidato no formato de lançamento (id 'pre:<id>').
export function candidatoDoPre(pre, closingDay = 14) {
  const p = pre?.payload || {}
  if (!p.conta_id || !(Number(p.valor) > 0) || !p.data) return null
  const tipo = p.tipo === 'receita' ? 'income' : p.tipo === 'transferencia' ? null : 'expense'
  if (!tipo) return null
  const t = {
    id: `pre:${pre.id}`, preId: pre.id, _pre: true, accountId: p.conta_id, type: tipo, amount: Number(p.valor),
    date: p.data, description: p.descricao || '', payee: p.favorecido_id || p.favorecido_novo || '',
    categoryId: p.categoria_id || '', costCenter: p.centro_custo_id || '', sugestao: p,
  }
  t.faturaMonthYear = faturaDoLancamento(t, closingDay)
  return t
}

// Candidatos de um cartão numa fatura: não conciliados, despesa/receita do cartão, sem espelho.
export function candidatosJaLancado({ transactions, preLancamentos = [], accountId, closingDay = 14, usados = new Set() }) {
  const doCartao = (transactions || []).filter(t =>
    t.accountId === accountId && (t.type === 'expense' || t.type === 'income')
    && !t.reconciled && !t.isEspelho && !usados.has(t.id))
  const pres = (preLancamentos || [])
    .filter(p => p.status === 'pendente')
    .map(p => candidatoDoPre(p, closingDay))
    .filter(t => t && t.accountId === accountId)
  return [...doCartao, ...pres]
}

// Estabelecimento parecido: alguma palavra (4+ letras) de um lado aparece no outro
// ("VERCEL INC." × "Vercel *Pro"; o banco corta e junta nomes, então basta uma palavra forte).
const palavrasFortes = (s) => normalizarTermo(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 4)
export function estabelecimentoParecido(descricaoLinha, t) {
  const daLinha = palavrasFortes(descricaoLinha)
  const doTx = palavrasFortes(`${t.payee || ''} ${t.description || ''}`)
  return daLinha.some(w => doTx.some(x => x.startsWith(w) || w.startsWith(x)))
}
const dentroDe = (real, estimado, pct) => Math.abs(Number(real) - Number(estimado)) <= Math.max(0.05, Number(estimado) * pct) + 1e-9
const iofEstimado = (t) => t.estimado && (!!t.compraIofId || ehIof(t))

// Lançamento ESTIMADO `t` pode ser a linha `r`? (a fatura pode diferir: a data real da compra pode
// cair do outro lado do fechamento — a janela de dias é que manda.)
export function casaEstimado(r, t) {
  if (tipoDe(r) !== 'expense' || tipoDe(t) !== 'expense' || parcelaDaLinha(r)) return false
  if (diasEntre(dataCompraDaLinha(r), dataCompraDoTx(t)) > JANELA_DIAS_ESTIMADO) return false
  if (iofEstimado(t)) return ehIof(r) && dentroDe(r.amount, t.amount, TOL_IOF_ESTIMADO)
  if (ehIof(r)) return false
  if (!estabelecimentoParecido(r.description, t)) return false
  if (Number(r._valorOriginal) > 0 && Number(t.valorOriginal) > 0) return Math.round(r._valorOriginal * 100) === Math.round(t.valorOriginal * 100)
  return dentroDe(r.amount, t.amount, TOL_COMPRA_ESTIMADA)
}

// O lançamento `t` pode ser a linha `r`?
export function casaComLinha(r, t, closingDay = 14) {
  if (t.estimado) return casaEstimado(r, t)
  if (tipoDe(r) !== tipoDe(t)) return false
  if (Math.abs(centavos(r.amount) - centavos(t.amount)) > TOL_VALOR_JA_LANCADO * 100) return false
  if (faturaDoLancamento(t, closingDay) !== r.faturaMonthYear) return false
  const pr = parcelaDaLinha(r)
  const pt = parcelaDoTx(t)
  if (pr || pt) {
    if (!pr || !pt || pr.num !== pt.num || pr.total !== pt.total) return false
    // Parcela N > 1: data é a do dia financeiro — casa por número/valor/fatura.
    if (pr.num > 1) return true
  }
  return diasEntre(dataCompraDaLinha(r), dataCompraDoTx(t)) <= JANELA_DIAS_JA_LANCADO
}

// linhas: as ainda não resolvidas (cada uma com _id, type, amount, faturaMonthYear, date/_dateCartao,
// _installment). → Map(_id → { status: 'casada'|'escolher'|'nova', candidatos: [tx] , tx? }).
export function casarJaLancados(linhas, candidatos, { closingDay = 14 } = {}) {
  const porLinha = new Map()
  for (const r of linhas) {
    const lista = candidatos.filter(t => casaComLinha(r, t, closingDay))
      .sort((a, b) => diasEntre(dataCompraDaLinha(r), dataCompraDoTx(a)) - diasEntre(dataCompraDaLinha(r), dataCompraDoTx(b)))
    porLinha.set(r._id, lista)
  }
  // Um candidato disputado por duas linhas (ex.: duas compras iguais no mesmo dia) nunca é
  // atribuído sozinho: as duas linhas vão para "escolher".
  const disputa = new Map()
  for (const lista of porLinha.values()) for (const t of lista) disputa.set(t.id, (disputa.get(t.id) || 0) + 1)
  const out = new Map()
  for (const [id, lista] of porLinha) {
    if (!lista.length) out.set(id, { status: 'nova', candidatos: [] })
    else if (lista.length === 1 && disputa.get(lista[0].id) === 1) out.set(id, { status: 'casada', candidatos: lista, tx: lista[0] })
    else out.set(id, { status: 'escolher', candidatos: lista })
  }
  return out
}

export function contarJaLancados(resultado) {
  const c = { casada: 0, escolher: 0, nova: 0 }
  for (const v of resultado.values()) c[v.status]++
  return c
}

// ─── Criação: lançamento NOVO parecido com um que já existe ─────────────────────────────────────
// Prévia do Assistente, efetivação de pré-lançamento e formulário manual. Mesmos critérios do
// "Já lançado": mesma conta/cartão (account_id — conta as parcelas com card_id NULL), mesmo tipo,
// valor ±R$ 0,01, data ±3 dias (compra ou lançamento, a mais próxima), parcela por parcela —
// mas contra QUALQUER lançamento (conciliado ou não) e os pré-lançamentos pendentes. A fatura só
// entra na parcela N > 1 (sem data comparável); conta corrente não tem fatura.
// novo: { type, accountId, amount (da parcela), date, dateCartao?, installmentNum?, installmentTotal?,
// faturaMonthYear? }. → candidatos (lançamentos e pré 'pre:<id>'), do mais próximo ao mais longe.
export const MAX_PARECIDOS = 5
export function parecidosNaCriacao(novo, { transactions = [], preLancamentos = [], closingDay = 14, ignorarIds = [] } = {}) {
  if (!novo?.accountId || (novo.type !== 'expense' && novo.type !== 'income') || !(Number(novo.amount) > 0) || !novo.date) return []
  const ignorar = new Set(ignorarIds)
  const datas = (x) => [x.date, x.dateCartao].filter(Boolean).map(d => String(d).slice(0, 10))
  const distancia = (t) => Math.min(...datas(novo).flatMap(a => datas(t).map(b => diasEntre(a, b))))
  const pn = parcelaDoTx(novo)
  const casa = (t) => {
    if (tipoDe(t) !== novo.type) return false
    if (Math.abs(centavos(t.amount) - centavos(novo.amount)) > TOL_VALOR_JA_LANCADO * 100) return false
    const pt = parcelaDoTx(t)
    if (pn || pt) {
      if (!pn || !pt || pn.num !== pt.num || pn.total !== pt.total) return false
      if (pn.num > 1) return !novo.faturaMonthYear || faturaDoLancamento(t, closingDay) === novo.faturaMonthYear
    }
    return distancia(t) <= JANELA_DIAS_JA_LANCADO
  }
  const existentes = transactions.filter(t => t.accountId === novo.accountId && (t.type === 'expense' || t.type === 'income') && !t.isEspelho)
  const pres = preLancamentos.filter(p => p.status === 'pendente').map(p => candidatoDoPre(p, closingDay))
    .filter(t => t && t.accountId === novo.accountId)
  return [...existentes, ...pres]
    .filter(t => !ignorar.has(t.id) && !(t._pre && ignorar.has(t.preId)) && casa(t))
    .sort((a, b) => distancia(a) - distancia(b))
    .slice(0, MAX_PARECIDOS)
}

// ─── Ativação na tela (ImportPanel) ─────────────────────────────────────────────────────────────

// Termo do apelido 'descricao_fatura': a descrição do banco sem números (terminal, códigos, datas,
// "Parc3"), sem pontuação, minúscula e sem acento. "IFD*DJM EMPREENDIMENTO 4541" → "ifd djm empreendimento".
export function termoDescricaoFatura(descricao) {
  return String(descricao || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bparc\w*/g, ' ').replace(/[0-9]+/g, ' ').replace(/[^a-z ]+/g, ' ')
    .split(' ').filter(w => w.length >= 2).join(' ').slice(0, 120)
}

// Favorecido sugerido pela descrição da fatura: o apelido aprendido; sem ele, a própria descrição
// (como o banco escreve, sem números de terminal). apelidos: linhas de ia_apelidos.
export function favorecidoSugerido(descricao, apelidos = []) {
  const termo = termoDescricaoFatura(descricao)
  const ap = termo && apelidos.find(a => a.tipo === 'descricao_fatura' && a.termo === termo)
  if (ap) return { nome: ap.ref_id, aprendido: true }
  const limpo = String(descricao || '').replace(/\s+\d[\d/.-]*\s*$/, '').replace(/\s+/g, ' ').trim()
  return { nome: limpo, aprendido: false }
}

// Favorecido final da linha "Já lançado": manter | sugerido | outro (escolha em _favModo/_favOutro).
export function favorecidoDaLinha(r) {
  const j = r._jaLancado
  if (!j) return null
  const modo = r._favModo || j.favModoPadrao
  if (modo === 'outro') return (r._favOutro || '').trim() || j.tx.payee || ''
  if (modo === 'sugerido') return j.sugerido.nome || j.tx.payee || ''
  return j.tx.payee || ''
}

// Anota as linhas já resolvidas por resolverLinhasRevisao:
//   • "Já existe" contra lançamento NÃO conciliado feito fora da importação (manual/Assistente) →
//     também "Já lançado" (passa a receber valor/data da fatura e o favorecido escolhido);
//   • linhas novas → casarJaLancados: 'casada' com lançamento → _isDuplicate (não grava nova, não roda
//     gerencial, é conciliada como o "Já existe") + _jaLancado; 'casada' com PRÉ-lançamento → a linha
//     é importada pelo fluxo normal com a classificação do pré (_preId); 'escolher' → fica de fora até
//     o usuário escolher (_jaLancadoEscolha = id do lançamento | 'novo').
// Nunca muda o que a lógica atual já decidiu como FITID, colisão de parcela ou possível duplicata.
export function aplicarJaLancados(rows, { transactions, preLancamentos = [], accountId, closingDay = 14, apelidos = [] }) {
  const usados = new Set()
  for (const r of rows) for (const t of [r._dbTx, r._collisionTx, r._dupTx]) if (t?.id) usados.add(t.id)
  const marcar = (r, tx, origem) => {
    const sugerido = favorecidoSugerido(r.description, apelidos)
    const favModoPadrao = tx.payee ? (sugerido.aprendido && sugerido.nome !== tx.payee ? 'sugerido' : 'manter') : 'sugerido'
    r._jaLancado = { tx, origem, sugerido, favModoPadrao }
  }
  const out = rows.map(r => ({ ...r }))
  for (const r of out) {
    const t = r._dbTx
    if (r._dupLevel === 'certeza' && !r._collisionTx && t && !t.reconciled && t.origin !== 'importacao_fatura' && !r.fitid) marcar(r, t, 'ja_existe')
  }
  const livres = out.filter(r => !r._generated && !r._isDuplicate && !r._collisionTx && !r._dupLevel)
  if (!livres.length) return out
  const cands = candidatosJaLancado({ transactions, preLancamentos, accountId, closingDay, usados })
  const res = casarJaLancados(livres, cands, { closingDay })
  for (const r of livres) {
    const v = res.get(r._id)
    if (!v || v.status === 'nova') continue
    let tx = v.status === 'casada' ? v.tx : null
    if (v.status === 'escolher') {
      const e = r._jaLancadoEscolha
      if (e === 'novo') { r._jaLancadoOpcoes = v.candidatos; continue }
      tx = v.candidatos.find(c => c.id === e) || null
      if (!tx) { Object.assign(r, { _jaLancadoOpcoes: v.candidatos, selected: false }); continue }
    }
    if (r._jaLancadoEscolha === 'novo') { r._jaLancadoOpcoes = v.candidatos; continue }
    if (tx._pre) {
      const p = tx.sugestao || {}
      Object.assign(r, {
        categoryId: r._catEdit ? r.categoryId : (p.categoria_id || r.categoryId),
        payee: p.favorecido_id || p.favorecido_novo || r.payee,
        costCenter: p.centro_custo_id || r.costCenter,
        _preId: tx.preId,
      })
      marcar(r, tx, 'pre')
    } else {
      Object.assign(r, { _isDuplicate: true, _dupLevel: 'certeza', _dbTx: tx, selected: false })
      marcar(r, tx, 'regra_nova')
    }
    if (v.status === 'escolher') r._jaLancadoOpcoes = v.candidatos
  }
  agruparIofs(out, livres, cands, closingDay)
  return out
}

// Linha de IOF que não casou sozinha: o banco pode AGRUPAR os IOFs do período numa linha só. Soma
// dos IOFs estimados do cartão ainda livres, da mesma fatura (ou a ±5 dias da linha), dentro de ±20%
// → casa com todos (_jaLancado.grupo); o valor real é repartido na gravação (patchesJaLancado).
function agruparIofs(out, livres, cands, closingDay = 14) {
  const tomados = new Set(out.flatMap(r => [r._jaLancado?.tx?.id, ...(r._jaLancado?.grupo || []).map(t => t.id)]).filter(Boolean))
  for (const r of livres) {
    if (r._jaLancado || r._jaLancadoOpcoes || r._jaLancadoEscolha === 'novo' || !ehIof(r) || tipoDe(r) !== 'expense') continue
    const iofs = cands.filter(t => !t._pre && iofEstimado(t) && !tomados.has(t.id)
      && (faturaDoLancamento(t, closingDay) === r.faturaMonthYear || diasEntre(dataCompraDaLinha(r), dataCompraDoTx(t)) <= JANELA_DIAS_ESTIMADO))
    if (iofs.length < 2) continue
    const soma = iofs.reduce((s, t) => s + Number(t.amount), 0)
    if (!dentroDe(r.amount, soma, TOL_IOF_ESTIMADO)) continue
    Object.assign(r, { _isDuplicate: true, _dupLevel: 'certeza', _dbTx: iofs[0], selected: false })
    r._jaLancado = { tx: iofs[0], grupo: iofs, origem: 'regra_nova', sugerido: { nome: '', aprendido: false }, favModoPadrao: 'manter' }
    for (const t of iofs) tomados.add(t.id)
  }
}

// Contador do topo: "X já lançados · Y novos · Z para escolher".
export function resumoJaLancados(rows) {
  let ja = 0, novos = 0, escolher = 0
  for (const r of rows || []) {
    if (r._generated) continue
    if (r._jaLancado) ja++
    else if (r._jaLancadoOpcoes && !r._jaLancadoEscolha) escolher++
    else if (r.selected && !r._isDuplicate && !r._collisionTx) novos++
  }
  return { ja, novos, escolher }
}

// UPDATE do lançamento existente: valor e data vêm da fatura; categoria, grupo gerencial, centro de
// custo, descrição e origin ficam como estão. → { changes, mudancas } (mudancas p/ o histórico).
export function patchJaLancado(r, tx, { saveDate, payee }) {
  const base = patchJaLancadoSimples(r, tx, { saveDate, payee })
  if (!tx.estimado) return base
  // Estimado confirmado pela fatura: deixa de ser estimado (compra: + spread real) e vai para a
  // fatura da linha.
  const aj = iofEstimado(tx) ? { estimado: false } : ajusteDaCompraEstimada(tx, r.amount)
  delete aj.amount
  const changes = { ...base.changes, ...aj }
  if (r.faturaMonthYear && r.faturaMonthYear !== tx.faturaMonthYear) changes.faturaMonthYear = r.faturaMonthYear
  return { changes, mudancas: [...base.mudancas, { campo: 'estimado', de: true, para: false }] }
}

// Gravação da linha "Já lançado" → [{ tx, changes, mudancas }]. Grupo de IOFs: o valor real da linha
// repartido na proporção dos estimados (o último leva os centavos).
export function patchesJaLancado(r, { saveDate, payee }) {
  const j = r._jaLancado
  if (!j?.grupo) return [{ tx: j.tx, ...patchJaLancado(r, j.tx, { saveDate, payee }) }]
  const soma = j.grupo.reduce((s, t) => s + Number(t.amount), 0)
  let resto = Math.round(Number(r.amount) * 100)
  return j.grupo.map((t, i) => {
    const cent = i === j.grupo.length - 1 ? resto : Math.round(Number(r.amount) * 100 * Number(t.amount) / soma)
    resto -= cent
    return { tx: t, ...patchJaLancado({ ...r, amount: cent / 100 }, t, { saveDate: t.date, payee: t.payee }) }
  })
}

function patchJaLancadoSimples(r, tx, { saveDate, payee }) {
  const novo = {
    amount: Math.round((Number(r.amount) || 0) * 100) / 100,
    date: saveDate || tx.date,
    dateCartao: r._dateCartao || tx.dateCartao || null,
    payee: payee || tx.payee || '',
  }
  const changes = {}
  const mudancas = []
  for (const campo of ['amount', 'date', 'dateCartao', 'payee']) {
    const de = tx[campo] ?? null
    const para = novo[campo] ?? null
    const igual = campo === 'amount' ? Math.round(Number(de) * 100) === Math.round(Number(para) * 100)
      : campo === 'payee' ? (de || '') === (para || '')
        : String(de || '').slice(0, 10) === String(para || '').slice(0, 10)
    if (igual) continue
    changes[campo] = para
    if (campo !== 'dateCartao') mudancas.push({ campo, de, para })
  }
  return { changes, mudancas }
}
