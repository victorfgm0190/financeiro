// Revisão da importação de fatura de cartão: decide, linha a linha, o que já está gravado no
// banco ("No banco ↻", "Já existe", "Possível duplicata", "Também em MM/AAAA") e projeta o total
// que a fatura terá depois da confirmação.
//
// PRINCÍPIO: um lançamento do arquivo só é o mesmo de um gravado quando os dois estão na MESMA
// fatura do MESMO cartão e têm o MESMO valor (±R$ 0,01). A descrição só desempata — sozinha nunca
// basta. Antes, "Yelumseg Parc3" de R$ 74,29 (10/2026) casava pela série com a projeção
// "Yelumseg Parc1 3/5" de 11/2026, e "Aramis 3/4" virava duplicata de "Aramis 4/4" sem que a tela
// dissesse com qual registro.
//
// O número da parcela é comparado À PARTE da descrição: no Itaú o "Parc3" faz parte do texto e o
// número real vem da coluna Parcelamento (que o parser converte em "N/Total"). A base da
// descrição é comparada sem nenhum dos dois sufixos.
import { installmentKey, detectInstallment, detectParcela } from './installments.js'
import { assignInstallmentOccurrences, findParcelaDaSerie } from './parcelas.js'
import { descSimilarity, stripParcelaSuffix } from './conciliacaoMatch.js'
import { faturaDoLancamento } from './scheduleBaixa.js'

export const TOL_MESMO_VALOR = 0.01
// Arredondamento de parcela entre extratos (R$ 100,00 em 3× vira 33,34/33,33/33,33 no banco e o
// extrato pode trazer 33,37/33,30/33,33): com a chave de parcela igual, essa faixa ainda aparece
// como possível duplicata — nunca como "já existe".
export const TOL_ARREDONDAMENTO = 0.50
const SIM_MESMA_BASE = 0.7
const SIM_POSSIVEL = 0.4

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const tipoDe = (x) => x.type || 'expense'
// Em centavos: 20,91 − 20,90 dá 0,0100000000000016 em ponto flutuante e estourava a tolerância.
const diffValor = (a, b) => r2(Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)))
export const valorComSinal = (x) => (tipoDe(x) === 'income' ? -1 : 1) * (Number(x.amount) || 0)

// installment_key de um lançamento GRAVADO (num/total gravados; cai p/ detecção quando faltarem).
// null quando não é parcela reconhecível.
export function keyOfExistingTx(tx) {
  const det = detectInstallment(tx.description || '')
  const num = tx.installmentNum ?? det?.num
  const total = tx.installmentTotal ?? det?.total
  if (num == null || total == null) return null
  return installmentKey({
    accountId: tx.accountId, description: tx.description,
    installmentNum: num, installmentTotal: total,
    amount: tx.amount, faturaMonthYear: tx.faturaMonthYear, date: tx.date,
    installmentOccurrence: tx.installmentOccurrence,
  })
}
// installment_key PROSPECTIVA de uma linha de importação (o que txToRow gravaria no insert).
export function keyOfImportRow(row, accountId) {
  if (!row._installment) return null
  return installmentKey({
    accountId, description: row.description,
    installmentNum: row._installment.num, installmentTotal: row._installment.total,
    amount: row.amount, faturaMonthYear: row.faturaMonthYear, date: row.date,
    installmentOccurrence: row._installmentOccurrence,
  })
}

// Chave de COLISÃO = installment_key SEM o componente de centavos
// (accountId | base | num/total | serie_inicio).
//
// A installment_key persistida é exata de propósito: ela sustenta o índice UNIQUE
// uq_lancamentos_installment e o remapeamento de id do upsert (api/_db.js). Arredondá-la
// criaria colisão falsa entre parcelas legitimamente distintas. Por isso a tolerância de
// valor mora no casamento da importação — não na chave.
export function collisionKeyFromFull(fullKey) {
  if (!fullKey) return null
  const parts = fullKey.split('|')
  if (parts.length < 5) return null
  return `${parts[0]}|${parts[1]}|${parts[2]}|${parts[4]}`
}

// Índice das parcelas gravadas do cartão pela chave de colisão (todas as candidatas por chave).
export function indexarParcelasDoCartao(transactions, accountId) {
  const m = new Map()
  if (!accountId) return m
  for (const t of transactions || []) {
    if (t.accountId !== accountId || t.type !== 'expense' || t.accountType !== 'credit') continue
    const k = collisionKeyFromFull(keyOfExistingTx(t))
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(t)
  }
  return m
}

// Parcela gravada com a mesma chave de colisão e valor dentro da tolerância; havendo mais de uma,
// vence a de menor diferença. `usados` = lançamentos já casados por outra linha (1:1 — sem isso
// duas gêmeas casavam com a mesma parcela salva e a segunda sumia).
export function matchParcelaExistente(index, row, accountId, usados, tolerancia = TOL_ARREDONDAMENTO) {
  // O índice só tem despesas. Um estorno com sufixo de parcela casaria com a parcela que estorna.
  if (tipoDe(row) !== 'expense') return null
  const k = collisionKeyFromFull(keyOfImportRow(row, accountId))
  const candidatas = k ? index.get(k) : null
  if (!candidatas?.length) return null
  let melhor = null
  let menorDiff = Infinity
  for (const t of candidatas) {
    if (usados?.has(t.id)) continue
    const diff = diffValor(t, row)
    if (diff <= tolerancia && diff < menorDiff) { melhor = t; menorDiff = diff }
  }
  return melhor
}

// Número da parcela: o gravado (installment_num) ou o da descrição ("N/Total" ou "ParcN").
export function numeroParcelaDoTx(t) {
  if (t.installmentNum != null && t.installmentNum !== '') return Number(t.installmentNum)
  return detectParcela(t.description || '')?.num ?? null
}
export function totalParcelasDoTx(t) {
  if (t.installmentTotal != null && t.installmentTotal !== '') return Number(t.installmentTotal)
  return detectParcela(t.description || '')?.total ?? null
}
// Parcela de série (parcelado no cartão): total > 1, nº > 1 ou ligada a uma série gravada.
export function ehParcelaDeSerie(t) {
  return (totalParcelasDoTx(t) || 0) > 1 || (numeroParcelaDoTx(t) || 0) > 1 || !!t?.serieId
}

// Fatura ABERTA (valor parcial): parcela de série gravada na fatura e sem linha no arquivo é a
// parcela prevista que o banco ainda não lançou — não é divergência, e nunca pode ser apagada,
// sugerida para exclusão nem empurrada por causa disso (conciliação, confirmação, nada).
export function aguardandoLancamentoDoBanco(t, { aberta }) {
  return !!aberta && ehParcelaDeSerie(t)
}

// Da linha: o _installment resolvido na carga (coluna Parcelamento, série inferida ou override
// manual) e, sem ele, o "ParcN" do texto.
export function numeroParcelaDaLinha(r) {
  if (r._installment?.num != null) return Number(r._installment.num)
  return detectParcela(r.description || '')?.num ?? null
}

export const similaridadeBase = (a, b) => descSimilarity(stripParcelaSuffix(a), stripParcelaSuffix(b))

const dataCartaoDoTx = (t) => t.dateCartao || null
const dataCartaoDaLinha = (r) => r._dateCartao || null
// As duas datas do cartão conhecidas e diferentes: são duas compras distintas.
const datasConflitam = (r, t) => !!dataCartaoDaLinha(r) && !!dataCartaoDoTx(t) && dataCartaoDaLinha(r) !== dataCartaoDoTx(t)
const mesmaData = (r, t) => !!dataCartaoDaLinha(r) && dataCartaoDaLinha(r) === dataCartaoDoTx(t)

// Compara uma linha com um lançamento da MESMA fatura. 'existe' = mesmo tipo + valor ±0,01 +
// base parecida + mesmo nº de parcela (e sem datas de compra diferentes); 'possivel' = mesmo tipo
// + valor ±0,01, mas descrição, parcela ou data diferente. null = não é o mesmo lançamento.
export function compararNaFatura(r, t) {
  if (tipoDe(r) !== tipoDe(t)) return null
  if (diffValor(r, t) > TOL_MESMO_VALOR) return null
  const sim = similaridadeBase(r.description, t.description)
  const numIgual = numeroParcelaDaLinha(r) === numeroParcelaDoTx(t)
  if (sim >= SIM_MESMA_BASE && numIgual && !datasConflitam(r, t)) return 'existe'
  // Valor igual sem nenhuma semelhança de descrição é coincidência (dois fornecedores de R$ 10,00),
  // não duplicata — marcar como possível desmarcaria uma compra legítima.
  if (sim >= SIM_POSSIVEL) return 'possivel'
  return null
}

// Casa as linhas do arquivo com o que já está gravado no cartão. Devolve cópias anotadas:
//   _collisionTx  lançamento que a confirmação ATUALIZA ("No banco ↻"): parcela de mesma chave ou
//                 da série inferida, na mesma fatura e com o mesmo valor — ou a escolha "É o
//                 mesmo" do usuário (_mesmoQueId) sobre uma possível duplicata.
//   _dupLevel     'certeza' (Já existe, nunca importa) | 'possivel' (desmarcada por padrão).
//   _dbTx         lançamento do banco que representa a linha (colisão ou já existe).
//   _dupTx        o candidato da possível duplicata, exibido ao lado da linha.
//   _tambemEm     [{ fatura, tx }] — o mesmo lançamento gravado em OUTRA fatura: só aviso.
// Casamento 1:1: um lançamento do banco representa no máximo uma linha.
export function resolverLinhasRevisao(rows, { accountId, transactions, closingDay = 14, forcedDupSelect = new Set(), parcelasPorChave = null }) {
  const comOcorrencia = assignInstallmentOccurrences(rows, accountId)
  const doCartao = (transactions || []).filter(t =>
    t.accountId === accountId && (t.type === 'expense' || t.type === 'income') && !t.isEspelho)
  const faturaDe = (t) => faturaDoLancamento(t, closingDay)
  const porFatura = new Map()
  for (const t of doCartao) {
    const f = faturaDe(t)
    if (!f) continue
    if (!porFatura.has(f)) porFatura.set(f, [])
    porFatura.get(f).push(t)
  }
  const byId = new Map(doCartao.map(t => [t.id, t]))
  const indice = parcelasPorChave || indexarParcelasDoCartao(transactions, accountId)
  const usados = new Set()
  const out = comOcorrencia.map(row => ({
    ...row, accountId,
    _isDuplicate: false, _collisionTx: null, _dbTx: null, _dupLevel: null, _dupTx: null,
    _mesmoConfirmado: false, _tambemEm: [],
  }))
  const resolvida = new Set()

  const marcarColisao = (r, tx, mesmo = false) => {
    usados.add(tx.id)
    resolvida.add(r._id)
    Object.assign(r, {
      categoryId: r._catEdit ? r.categoryId : (tx.categoryId || r.categoryId),
      grupoGerencial: r._gerEdit ? r.grupoGerencial : (tx.grupoGerencial || r.grupoGerencial),
      _reservaFuncaoId: r._gerEdit ? r._reservaFuncaoId : (tx.reservaFuncaoId || null),
      _collisionTx: tx, _dbTx: tx, _mesmoConfirmado: mesmo, selected: false,
    })
  }

  // 0. "É o mesmo" confirmado pelo usuário — reserva o lançamento antes de qualquer outro casamento.
  for (const r of out) {
    if (!r._mesmoQueId) continue
    const tx = byId.get(r._mesmoQueId)
    if (tx && !usados.has(tx.id)) marcarColisao(r, tx, true)
  }

  // 0b. OFX: o mesmo FITID (identificador do banco) já gravado neste cartão é o mesmo lançamento.
  const porFitid = new Map(doCartao.filter(t => t.fitid).map(t => [t.fitid, t]))
  for (const r of out) {
    if (resolvida.has(r._id) || !r.fitid) continue
    const tx = porFitid.get(r.fitid)
    if (!tx || usados.has(tx.id)) continue
    usados.add(tx.id)
    resolvida.add(r._id)
    Object.assign(r, { _isDuplicate: true, _dupLevel: 'certeza', _dbTx: tx, selected: false })
  }

  // 1. Colisão de parcela (mesma chave ou série inferida), restrita à fatura da linha.
  const pendentesPossivel = new Map() // linha → candidato de arredondamento (chave igual, valor ≠)
  for (const r of out) {
    if (resolvida.has(r._id) || tipoDe(r) !== 'expense' || !r._installment) continue
    const naFatura = (t) => t && faturaDe(t) === r.faturaMonthYear
    let tx = matchParcelaExistente(indice, r, accountId, usados)
    if (!naFatura(tx)) tx = null
    if (!tx && r._serieAnchor?.accountId === accountId) {
      const daSerie = findParcelaDaSerie(r._serieAnchor, r._installment.num, r.amount, transactions, usados)
      if (naFatura(daSerie)) tx = daSerie
    }
    if (!tx) continue
    if (diffValor(tx, r) <= TOL_MESMO_VALOR) marcarColisao(r, tx)
    else pendentesPossivel.set(r._id, tx)
  }

  // 2. Já existe: mesma fatura, valor e base, mesmo nº de parcela. Primeiro os pares com a mesma
  // data de compra, depois os demais — assim duas compras iguais em dias diferentes não trocam de par.
  const candidatos = (r) => (porFatura.get(r.faturaMonthYear) || []).filter(t => !usados.has(t.id))
  for (const exigeData of [true, false]) {
    for (const r of out) {
      if (resolvida.has(r._id) || r._generated) continue
      const tx = candidatos(r).find(t => (!exigeData || mesmaData(r, t)) && compararNaFatura(r, t) === 'existe')
      if (!tx) continue
      usados.add(tx.id)
      resolvida.add(r._id)
      Object.assign(r, { _isDuplicate: true, _dupLevel: 'certeza', _dbTx: tx, selected: false })
    }
  }

  // 3. Possível duplicata: mesma fatura e valor, descrição/parcela/data diferente (ou a parcela de
  // mesma chave com centavos de diferença). Desmarcada por padrão; o usuário força ou confirma.
  for (const r of out) {
    if (resolvida.has(r._id) || r._generated) continue
    const arred = pendentesPossivel.get(r._id)
    const tx = (arred && !usados.has(arred.id)) ? arred
      : candidatos(r)
        .filter(t => compararNaFatura(r, t) === 'possivel')
        .sort((a, b) => similaridadeBase(r.description, b.description) - similaridadeBase(r.description, a.description))[0]
    if (!tx) continue
    usados.add(tx.id)
    resolvida.add(r._id)
    Object.assign(r, { _dupLevel: 'possivel', _dupTx: tx, selected: forcedDupSelect.has(r._id) })
  }

  // 4. O mesmo lançamento em OUTRA fatura: não é duplicata, só aviso. Parcela: mesmo número;
  // à vista: mesma data de compra (uma assinatura mensal repete valor e descrição todo mês).
  for (const r of out) {
    if (resolvida.has(r._id) || r._generated) continue
    const num = numeroParcelaDaLinha(r)
    const iguais = doCartao.filter(t => {
      const f = faturaDe(t)
      if (!f || f === r.faturaMonthYear) return false
      if (tipoDe(t) !== tipoDe(r) || diffValor(r, t) > TOL_MESMO_VALOR) return false
      if (similaridadeBase(r.description, t.description) < SIM_MESMA_BASE) return false
      return num != null ? numeroParcelaDoTx(t) === num : mesmaData(r, t)
    })
    r._tambemEm = iguais.map(t => ({ fatura: faturaDe(t), tx: t })).sort((a, b) => a.fatura.localeCompare(b.fatura))
  }
  return out
}

// Campos que a confirmação grava no lançamento do banco quando a linha colide com ele (UPDATE em
// vez de INSERT). `amount` fica de fora de propósito: o valor do banco é o confirmado.
export function patchColisao(row, tx, { saveDate, faturaRef, serieId }) {
  return {
    date: saveDate,
    dateCartao: row._dateCartao || tx.dateCartao || null,
    // Regra A: a descrição real é a do extrato (a gerada antes podia ser "Parc2 11/12").
    description: row.description || tx.description,
    // "É o mesmo": a série manual podia estar com a numeração adiantada (Aramis 4/4 × 3/4 do
    // extrato) — a parcela do arquivo prevalece. Na colisão por chave os números já são iguais.
    installmentNum: row._installment?.num ?? tx.installmentNum ?? null,
    installmentTotal: row._installment?.total ?? tx.installmentTotal ?? null,
    serieId: serieId || tx.serieId || null,
    categoryId: row.categoryId || null,
    grupoGerencial: row.grupoGerencial || null,
    faturaMonthYear: row.faturaMonthYear || null,
    faturaRef: faturaRef ?? null,
    reservaFuncaoId: row._reservaFuncaoId || null,
  }
}

// Campos do patch que MUDAM o lançamento do banco ('' / null / undefined contam como vazio e
// números comparam por valor). Lista vazia = o banco já está igual ao arquivo → nada a gravar.
// Rateio novo na linha também conta como mudança.
export function camposAlteradosColisao(patch, tx, row = null) {
  const vazio = (v) => v == null || v === ''
  const igual = (a, b) => (vazio(a) && vazio(b))
    || (typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : a === b)
  const out = Object.keys(patch).filter(k => !igual(patch[k], tx[k]))
  if (row?._rateios?.length > 0) out.push('rateios')
  return out
}

// Texto do resumo final da importação de fatura. `r` = { novos, existiam, atualizados } ou, na
// reedição, { salvos }.
export function textoResumoImportacao(r) {
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
  if (r.salvos != null) return `${pl(r.salvos, 'lançamento salvo', 'lançamentos salvos')}.`
  if (r.novos === 0 && r.atualizados === 0) return 'Nenhum lançamento novo — a fatura já estava no banco.'
  return `${pl(r.novos, 'novo importado', 'novos importados')} · ${pl(r.existiam, 'já existia', 'já existiam')} · ${pl(r.atualizados, 'atualizado', 'atualizados')}`
}

// Linhas que a confirmação INSERE: selecionadas, sem "já existe" e sem colisão (que vira UPDATE).
export function linhasAImportar(rows) {
  return (rows || []).filter(r => r.selected && !r._isDuplicate && !r._collisionTx)
}

// Lançamento do banco que representa a linha na fatura: o da colisão / já existe, ou o candidato
// da possível duplicata enquanto ela não for importada como nova.
function representanteNoBanco(r) {
  if (r._dbTx) return r._dbTx
  if (r._dupTx && !r.selected) return r._dupTx
  return null
}

// Total do ARQUIVO × total PROJETADO da fatura `fatura` depois da confirmação.
//   arquivo   = soma de todas as linhas (estornos negativos).
//   projetado = o que já está gravado na fatura + as linhas que serão inseridas nela.
// A diferença é explicada item a item (soma exata): linha do arquivo que não entra, lançamento
// gravado sem linha no arquivo e par linha × banco com valores diferentes.
// `aberta` (fatura aberta, valor parcial): parcela de série sem linha no arquivo vira
// 'aguardando_banco' (informativo) e sai da divergência — arquivo + aguardando = projetado.
export function projetarTotalFatura(resolvedRows, { fatura, accountId, transactions, closingDay = 14, aberta = false }) {
  const linhas = (resolvedRows || []).filter(r => !r._generated)
  const naFatura = (transactions || []).filter(t =>
    t.accountId === accountId && (t.type === 'expense' || t.type === 'income') && !t.isEspelho
    && faturaDoLancamento(t, closingDay) === fatura)
  const novas = new Set(linhasAImportar(linhas).map(r => r._id))
  const arquivo = r2(linhas.reduce((s, r) => s + valorComSinal(r), 0))
  let projetado = naFatura.reduce((s, t) => s + valorComSinal(t), 0)
  const representados = new Set()
  const itens = []
  for (const r of linhas) {
    const v = valorComSinal(r)
    if (novas.has(r._id)) {
      if (r.faturaMonthYear === fatura) { projetado += v; continue }
      itens.push({ tipo: 'outra_fatura', linha: r, valor: r2(v), motivo: `vai para a fatura ${fmtFatura(r.faturaMonthYear)}` })
      continue
    }
    const tx = representanteNoBanco(r)
    if (tx && faturaDoLancamento(tx, closingDay) === fatura) {
      representados.add(tx.id)
      const d = r2(v - valorComSinal(tx))
      if (Math.abs(d) > 0.005) itens.push({ tipo: 'valor_diferente', linha: r, tx, valor: d, motivo: `no banco ${fmtValor(tx.amount)} × arquivo ${fmtValor(r.amount)}` })
      continue
    }
    itens.push({
      tipo: 'linha_fora', linha: r, valor: r2(v),
      motivo: r._dupLevel === 'possivel' ? 'possível duplicata importada como nova' : 'linha desmarcada — não será importada',
    })
  }
  for (const t of naFatura) {
    if (representados.has(t.id)) continue
    if (aguardandoLancamentoDoBanco(t, { aberta })) {
      itens.push({ tipo: 'aguardando_banco', tx: t, valor: r2(-valorComSinal(t)), motivo: 'parcela prevista que o banco ainda não lançou nesta fatura aberta' })
      continue
    }
    itens.push({ tipo: 'so_no_banco', tx: t, valor: r2(-valorComSinal(t)), motivo: 'gravado na fatura, sem linha correspondente no arquivo' })
  }
  projetado = r2(projetado)
  const itensAguardando = itens.filter(i => i.tipo === 'aguardando_banco')
  const itensDivergencia = itens.filter(i => i.tipo !== 'aguardando_banco')
  const aguardando = r2(-itensAguardando.reduce((s, i) => s + i.valor, 0))
  return {
    arquivo, projetado, diferenca: r2(arquivo - projetado), itens,
    aguardando, itensAguardando, itensDivergencia, diferencaReal: r2(arquivo + aguardando - projetado),
  }
}

function fmtFatura(my) {
  if (!my) return '—'
  const [y, m] = my.split('-')
  return `${m}/${y}`
}
const fmtValor = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export { fmtFatura }
