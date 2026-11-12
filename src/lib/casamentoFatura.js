// Importar Fatura — "JÁ LANÇADO": casa a linha do arquivo com um lançamento do cartão feito ANTES
// da importação (manual ou pelo Assistente IA) ou com um pré-lançamento pendente do Assistente,
// sem depender da descrição (o banco escreve "IFD*DJM EMPREENDIMENTO"; o usuário, "iFood").
//
// Roda DEPOIS dos passos atuais de resolverLinhasRevisao (FITID, colisão de parcela, "Já existe",
// que continuam valendo para a reimportação da mesma fatura) e só sobre as linhas que eles não
// resolveram. Candidatos: lançamentos NÃO conciliados do MESMO cartão (account_id do cartão — a
// maioria tem card_id NULL) e da MESMA fatura + pré-lançamentos pendentes desse cartão.
// Critério (Etapa 6a, regras de candidato de 12/11/2026 — avaliarJaLancado): mesmo tipo, mesma fatura
// (aberta), e
//   • à vista ou parcela 1 (mesmo n/total): valor ±R$ 0,01 e data da compra até 3 dias → AUTOMÁTICO;
//   • parcela da MESMA SÉRIE (mesmo n/total) com centavos de diferença (até ±R$ 0,50) → AUTOMÁTICO:
//     é a previsão da mesma parcela e a confirmação grava o valor do arquivo (não é "parecido");
//   • parcela N > 1 com o mesmo valor (±0,01) que não é da série já conhecida da linha → PERGUNTA (a
//     data de uma parcela N > 1 é a do dia financeiro, não da compra);
//   • parcela com valor diferente fora da mesma série → não é candidato (valor diferente nunca é
//     proposto como "é este?");
//   • parcela de OUTRA série conhecida, n/total diferente ou parcela × à vista → não é candidato;
//   • estimado (dólar/IOF) pelas regras de casaEstimado → PERGUNTA.
// Resultado por linha: 1 candidato automático (sem disputa) → 'casada'; compras gêmeas (k linhas com o
// mesmo conjunto de m candidatos automáticos, k ≥ m) → pares 1:1, as que sobram são novas; o resto com
// candidato → 'escolher' (nunca casa sozinho); nenhum → 'nova'.
// PURO: sem React, sem I/O (usado pela tela e pelo preview somente leitura). Imports com .js.
// ESTIMADOS (compra em moeda estrangeira e o IOF dela — src/lib/cambio.js): o valor em R$ só fecha
// na fatura, então o critério é outro — compra: estabelecimento parecido, data ±5 dias e valor ±15%
// (ou o mesmo valor na moeda, se a linha trouxer); IOF: linha de IOF, data ±5 dias e valor ±20%, ou a
// SOMA dos IOFs estimados da fatura quando o banco agrupa numa linha só. Ao casar, o lançamento
// recebe o valor real e deixa de ser estimado (a compra grava o spread real do cartão).
import { faturaDoLancamento } from './scheduleBaixa.js'
import { numeroParcelaDoTx, totalParcelasDoTx, paresUmPraUm, mesmaSerie, outraSerie } from './revisaoImportacao.js'
import { ehIof, ajusteDaCompraEstimada } from './cambio.js'
import { normalizarTermo } from './assistente/texto.js'
import { faturaEstaFechada } from './faturasFechadas.js'
import { nomeSemSufixo, PALAVRAS_GENERICAS } from './nomeEstabelecimento.js'
import { valorCompativel, mesmaLoja, chaveEstavel } from './casamentoValor.js'

export const TOL_VALOR_JA_LANCADO = 0.01
// Parcela com o mesmo n/total e centavos de diferença (arredondamento entre extratos): pergunta.
export const TOL_PARCELA_PERGUNTA = 0.50
export const JANELA_DIAS_JA_LANCADO = 3
export const JANELA_DIAS_ESTIMADO = 5
export const TOL_COMPRA_ESTIMADA = 0.15
export const TOL_IOF_ESTIMADO = 0.20

const tipoDe = (x) => x.type || 'expense'
export { paresUmPraUm as resolverPares, serieDaLinha, mesmaSerie, outraSerie } from './revisaoImportacao.js'
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

// Candidatos de um cartão numa fatura: não conciliados, despesa/receita do cartão, sem espelho, de
// fatura aberta.
export function candidatosJaLancado({ transactions, preLancamentos = [], accountId, closingDay = 14, usados = new Set(), faturasFechadas = null }) {
  const doCartao = (transactions || []).filter(t =>
    t.accountId === accountId && (t.type === 'expense' || t.type === 'income')
    && !t.reconciled && !t.isEspelho && !usados.has(t.id)
    && !faturaEstaFechada(faturasFechadas, accountId, faturaDoLancamento(t, closingDay)))
  const pres = (preLancamentos || [])
    .filter(p => p.status === 'pendente')
    .map(p => candidatoDoPre(p, closingDay))
    .filter(t => t && t.accountId === accountId)
  return [...doCartao, ...pres]
}

// Estabelecimento parecido (só para ESTIMADOS — dólar/IOF): alguma palavra (4+ letras) de um lado
// aparece no outro ("VERCEL INC." × "Vercel *Pro"; o banco corta e junta nomes). Sem a cidade colada
// e sem palavras genéricas (lib/nomeEstabelecimento): "compra", "shop" ou a cidade não bastam.
const palavrasFortes = (s) => normalizarTermo(nomeSemSufixo(s)).replace(/[^a-z0-9 ]/g, ' ').split(' ')
  .filter(w => w.length >= 4 && !PALAVRAS_GENERICAS.has(w))
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

// O lançamento `t` pode ser a linha `r`? → 'auto' (mesmo lançamento, sem perguntar) | 'perguntar' | null.
export function avaliarJaLancado(r, t, closingDay = 14) {
  if (t.estimado) return casaEstimado(r, t) ? 'perguntar' : null
  if (tipoDe(r) !== tipoDe(t)) return null
  if (faturaDoLancamento(t, closingDay) !== r.faturaMonthYear) return null
  const diff = Math.abs(centavos(r.amount) - centavos(t.amount))
  // Valor abaixo de R$ 1,00: só o exato, ou ±0,01 da mesma loja (lib/casamentoValor).
  const exato = valorCompativel(r, t, TOL_VALOR_JA_LANCADO)
  const pr = parcelaDaLinha(r)
  const pt = parcelaDoTx(t)
  if (pr || pt) {
    if (!pr || !pt || pr.num !== pt.num || pr.total !== pt.total) return null
    if (outraSerie(r, t)) return null
    if (diff > TOL_PARCELA_PERGUNTA * 100 || !valorCompativel(r, t, TOL_PARCELA_PERGUNTA)) return null
    // Centavos: só a previsão da MESMA série (ajuste automático do valor); senão não é candidato.
    if (!exato) return mesmaSerie(r, t) ? 'auto' : null
    // Parcela N > 1: a data é a do dia financeiro — sem data comparável, só a série dá certeza.
    if (pr.num > 1) return mesmaSerie(r, t) ? 'auto' : 'perguntar'
  } else if (!exato) return null
  return diasEntre(dataCompraDaLinha(r), dataCompraDoTx(t)) <= JANELA_DIAS_JA_LANCADO ? 'auto' : null
}
export const casaComLinha = (r, t, closingDay = 14) => avaliarJaLancado(r, t, closingDay) != null

// linhas: as ainda não resolvidas (cada uma com _id, type, amount, faturaMonthYear, date/_dateCartao,
// _installment). → Map(_id → { status: 'casada'|'escolher'|'nova', candidatos: [tx] , tx? }).
export function casarJaLancados(linhas, candidatos, { closingDay = 14 } = {}) {
  const porLinha = new Map()
  for (const r of linhas) {
    let lista = candidatos.map(t => ({ t, n: avaliarJaLancado(r, t, closingDay) })).filter(x => x.n)
    // Havendo candidato da MESMA loja, só eles concorrem (antes da diferença de valor ou de data).
    if (lista.some(x => mesmaLoja(r, x.t))) lista = lista.filter(x => mesmaLoja(r, x.t))
    lista.sort((a, b) => diasEntre(dataCompraDaLinha(r), dataCompraDoTx(a.t)) - diasEntre(dataCompraDaLinha(r), dataCompraDoTx(b.t))
      || (chaveEstavel(a.t) < chaveEstavel(b.t) ? -1 : 1))
    porLinha.set(r._id, lista)
  }
  return paresUmPraUm(linhas, porLinha, (r, t) => diasEntre(dataCompraDaLinha(r), dataCompraDoTx(t)))
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
export function aplicarJaLancados(rows, { transactions, preLancamentos = [], accountId, closingDay = 14, apelidos = [], faturasFechadas = null }) {
  const usados = new Set()
  for (const r of rows) for (const t of [r._dbTx, r._collisionTx, r._dupTx]) if (t?.id) usados.add(t.id)
  const marcar = (r, tx, origem) => {
    const sugerido = favorecidoSugerido(r.description, apelidos)
    // Valor diferente casado (centavos da previsão da mesma série; estimado confirmado): a conferência
    // da fatura descreve como ajuste da previsão.
    if (!tx._pre && Math.abs(Math.round(Number(r.amount) * 100) - Math.round(Number(tx.amount) * 100)) > 0) r._ajustarValor = true
    // A fatura manda: favorecido diferente do existente → o da fatura (o atual vai para o histórico).
    const favModoPadrao = sugerido.nome && sugerido.nome !== (tx.payee || '') ? 'sugerido' : 'manter'
    r._jaLancado = { tx, origem, sugerido, favModoPadrao }
  }
  const out = rows.map(r => ({ ...r }))
  for (const r of out) {
    const t = r._dbTx
    if (r._dupLevel === 'certeza' && !r._collisionTx && t && !t.reconciled && t.origin !== 'importacao_fatura' && !r.fitid) marcar(r, t, 'ja_existe')
  }
  const livres = out.filter(r => !r._generated && !r._isDuplicate && !r._collisionTx && !r._dupLevel)
  if (!livres.length) return out
  const cands = candidatosJaLancado({ transactions, preLancamentos, accountId, closingDay, usados, faturasFechadas })
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
  if (!j?.grupo) {
    const p = patchJaLancado(r, j.tx, { saveDate, payee })
    // Casamento por lib/importacaoCorrespondencias: a descrição da fatura e a fatura do arquivo.
    if (j.atualizarDescricao && (r.description || '') !== (j.tx.description || '')) {
      p.changes.description = r.description
      p.mudancas.push({ campo: 'description', de: j.tx.description || null, para: r.description })
    }
    if (j.fatura) {
      p.changes.faturaMonthYear = j.fatura.para
      p.changes.faturaRef = `${j.fatura.para.slice(5, 7)}/${j.fatura.para.slice(0, 4)}`
      p.mudancas.push({ campo: 'faturaMonthYear', de: j.fatura.de, para: j.fatura.para })
    }
    return [{ tx: j.tx, ...p }]
  }
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
