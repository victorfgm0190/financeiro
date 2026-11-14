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
import { faturaEstaFechada } from './faturasFechadas.js'
import { valorCompativel, mesmaLoja, chaveEstavel, parearUmPraUm } from './casamentoValor.js'

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
    if (!valorCompativel(row, t, tolerancia)) continue
    const diff = diffValor(t, row)
    if (diff < menorDiff || (diff === menorDiff && melhor && chaveEstavel(t) < chaveEstavel(melhor))) { melhor = t; menorDiff = diff }
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

// "Só no sistema" (Conciliar Fatura): pode excluir? Só à vista NÃO conciliado de fatura FECHADA
// (decisão de 12/11/2026). Nunca conciliado, nunca parcela (de série ou não), nunca fatura aberta.
export function podeExcluirSoNoSistema(t, { aberta }) {
  if (!t || t.reconciled || aberta) return false
  return !ehParcelaDeSerie(t)
}

// A fatura ainda está ABERTA? Não depende só do cabeçalho do arquivo (o CSV não tem): o cabeçalho do
// Itaú, quando diz, manda; fatura marcada como fechada pelo usuário está fechada; senão vale o
// calendário do cartão — a fatura MM/AAAA fecha no dia de fechamento do mês MM (calcFatura: compra
// até o dia de fechamento cai na fatura do próprio mês), então está aberta até esse dia, inclusive.
// fatura 'AAAA-MM'; hoje 'AAAA-MM-DD'.
export function faturaEstaAberta({ cabecalhoAberta = null, fatura, closingDay = 14, hoje, fechadaPeloUsuario = false }) {
  if (fechadaPeloUsuario) return false
  if (cabecalhoAberta === true || cabecalhoAberta === false) return cabecalhoAberta
  if (!/^\d{4}-\d{2}$/.test(String(fatura || '')) || !hoje) return false
  const [y, m] = fatura.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const fechamento = `${fatura}-${String(Math.min(Number(closingDay) || 14, ultimo)).padStart(2, '0')}`
  return String(hoje).slice(0, 10) <= fechamento
}

// Da linha: o _installment resolvido na carga (coluna Parcelamento, série inferida ou override
// manual) e, sem ele, o "ParcN" do texto.
export function numeroParcelaDaLinha(r) {
  if (r._installment?.num != null) return Number(r._installment.num)
  return detectParcela(r.description || '')?.num ?? null
}

export const similaridadeBase = (a, b) => descSimilarity(stripParcelaSuffix(a), stripParcelaSuffix(b))

// Série da linha já conhecida no cartão (ImportPanel: âncora da série inferida ou serie_id da série
// gravada com a mesma chave). Linha de série NOVA não tem — o serie_id dela ainda não existe no banco.
export const serieDaLinha = (r) => r._serieExistente || r._serieAnchor?.serieId || null
export const mesmaSerie = (r, t) => !!serieDaLinha(r) && t.serieId === serieDaLinha(r)
export const outraSerie = (r, t) => !!serieDaLinha(r) && !!t.serieId && t.serieId !== serieDaLinha(r)

// Parcela (num/total, total > 1) da linha e do lançamento; null = à vista. Iguais = as duas à vista,
// ou mesmo número E mesmo total.
const parcelaLinha = (r) => {
  const total = Number(r._installment?.total) || null
  return total > 1 ? { num: Number(r._installment.num), total } : null
}
const parcelaTx = (t) => {
  const total = totalParcelasDoTx(t)
  return total > 1 ? { num: numeroParcelaDoTx(t), total } : null
}
export function parcelaIgual(r, t) {
  const a = parcelaLinha(r), b = parcelaTx(t)
  if (!a && !b) return true
  return !!(a && b && a.num === b.num && a.total === b.total)
}
// Base da descrição na chave da parcela (sem número, total, centavos nem fatura).
const baseDaChave = (k) => (k ? k.split('|')[1] : null)

const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86_400_000))
// Data da compra: a do cartão; sem ela, a do lançamento. Sem data de um dos lados, não desqualifica.
const dataCompraLinha = (r) => r._dateCartao || r.date || null
const dataCompraTx = (t) => (t.dateCartao ? String(t.dateCartao).slice(0, 10) : t.date || null)
const ateDias = (r, t, n) => {
  const a = dataCompraLinha(r), b = dataCompraTx(t)
  return !a || !b || diasEntre(a, b) <= n
}
export const JANELA_DIAS_MESMO = 3

// Decisão 1:1 a partir das listas { t, n: 'auto'|'perguntar' } de cada linha. Só há casamento
// automático quando TODAS as linhas que disputam um lançamento têm exatamente o mesmo conjunto de
// candidatos automáticos (compras gêmeas): k linhas × m lançamentos, k ≥ m → pares pelo mais próximo,
// as k − m que sobram são novas (o arquivo tem mais compras iguais que o Finup). k < m (mais de um
// candidato igual para a mesma linha), listas que se cruzam ou candidato 'perguntar' → 'escolher'.
export function paresUmPraUm(linhas, porLinha, distancia = () => 0) {
  const disputa = new Map()
  for (const lista of porLinha.values()) for (const { t } of lista) disputa.set(t.id, (disputa.get(t.id) || 0) + 1)
  const chave = (lista) => lista.map(x => x.t.id).sort().join('|')
  const soAuto = (lista) => lista.length > 0 && lista.every(x => x.n === 'auto')
  const out = new Map()
  for (const r of linhas) {
    if (out.has(r._id)) continue
    const lista = porLinha.get(r._id) || []
    const candidatos = lista.map(x => x.t)
    if (!lista.length) { out.set(r._id, { status: 'nova', candidatos: [] }); continue }
    const k = chave(lista)
    const grupo = soAuto(lista) ? linhas.filter(o => soAuto(porLinha.get(o._id) || []) && chave(porLinha.get(o._id)) === k) : []
    const fechado = grupo.length > 0 && candidatos.every(t => disputa.get(t.id) === grupo.length)
    if (!fechado || grupo.length < candidatos.length) { out.set(r._id, { status: 'escolher', candidatos }); continue }
    // Pares pelo mais próximo: mesma loja primeiro, depois a menor distância; empate pela chave
    // estável (nunca pela ordem do arquivo).
    const livresTx = [...candidatos]
    const livresLinhas = [...grupo]
    const antes = (a, b) => {
      if (a.loja !== b.loja) return a.loja < b.loja
      if (a.d !== b.d) return a.d < b.d
      const la = chaveEstavel(a.l), lb = chaveEstavel(b.l)
      return la !== lb ? la < lb : chaveEstavel(a.t) < chaveEstavel(b.t)
    }
    while (livresTx.length) {
      let melhor = null
      for (const l of livresLinhas) for (const t of livresTx) {
        const cand = { l, t, d: distancia(l, t), loja: mesmaLoja(l, t) ? 0 : 1 }
        if (!melhor || antes(cand, melhor)) melhor = cand
      }
      out.set(melhor.l._id, { status: 'casada', candidatos: [melhor.t], tx: melhor.t })
      livresTx.splice(livresTx.indexOf(melhor.t), 1)
      livresLinhas.splice(livresLinhas.indexOf(melhor.l), 1)
    }
    for (const l of livresLinhas) out.set(l._id, { status: 'nova', candidatos: [] })
  }
  return out
}

const dataCartaoDoTx = (t) => t.dateCartao || null
const dataCartaoDaLinha = (r) => r._dateCartao || null
// As duas datas do cartão conhecidas e diferentes: são duas compras distintas.
const datasConflitam = (r, t) => !!dataCartaoDaLinha(r) && !!dataCartaoDoTx(t) && dataCartaoDaLinha(r) !== dataCartaoDoTx(t)
const mesmaData = (r, t) => !!dataCartaoDaLinha(r) && dataCartaoDaLinha(r) === dataCartaoDoTx(t)
// Mesma descrição: sem acento, minúscula, espaços únicos (nada de "parecida").
const textoNormalizado = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const mesmaDescricao = (r, t) => !!textoNormalizado(r.description) && textoNormalizado(r.description) === textoNormalizado(t.description)

// Compara uma linha com um lançamento da MESMA fatura. 'existe' = mesmo tipo + valor ±0,01 +
// base parecida + mesmo nº de parcela (e sem datas de compra diferentes); 'possivel' = mesmo tipo
// + valor ±0,01, mas descrição, parcela ou data diferente. null = não é o mesmo lançamento.
export function compararNaFatura(r, t) {
  if (tipoDe(r) !== tipoDe(t)) return null
  if (!valorCompativel(r, t)) return null
  const sim = similaridadeBase(r.description, t.description)
  const numIgual = numeroParcelaDaLinha(r) === numeroParcelaDoTx(t)
  if (sim >= SIM_MESMA_BASE && numIgual && !datasConflitam(r, t)) return 'existe'
  // Valor igual sem nenhuma semelhança de descrição é coincidência (dois fornecedores de R$ 10,00),
  // não duplicata — marcar como possível desmarcaria uma compra legítima.
  if (sim >= SIM_POSSIVEL) return 'possivel'
  return null
}

// Casa as linhas do arquivo com o que já está gravado no cartão (Etapa 6a). Devolve cópias anotadas:
//   _collisionTx  lançamento que a confirmação ATUALIZA ("No banco ↻"): parcela de mesma chave ou
//                 da série inferida, na mesma fatura e com o mesmo valor — ou a escolha "É o
//                 mesmo" do usuário (_mesmoQueId) sobre uma possível duplicata.
//   _dupLevel     'certeza' (Já existe, nunca importa) | 'possivel' (desmarcada por padrão).
//   _dbTx         lançamento do banco que representa a linha (colisão ou já existe).
//   _dupTx        o candidato da possível duplicata, exibido ao lado da linha.
//   _tambemEm     [{ fatura, tx }] — o mesmo lançamento gravado em OUTRA fatura: só aviso.
// Casamento 1:1: um lançamento do banco representa no máximo uma linha.
// Regras (ver docs/importar-fatura-casamento.md):
//   • em SILÊNCIO (o mesmo exato, conciliado ou não): FITID; parcela de mesma chave/série com mesmo
//     n/total, mesma fatura e valor ±0,01; conciliado da mesma fatura com mesmo valor, mesma parcela e
//     mesma data do cartão (reimportação); não conciliado com descrição-base parecida, mesma parcela,
//     valor ±0,01 e compra até 3 dias, sem outro candidato igual;
//   • PERGUNTA ("Possível duplicata"), só contra NÃO conciliado de fatura aberta: parcela de mesma
//     chave/série com centavos (até ±0,50); mesma série e mesmo valor com outro número de parcela
//     ("Aramis 4/4" no Finup × 3/4 no extrato — "É a mesma" corrige o número).
//   O resto fica para lib/casamentoFatura e lib/importacaoCorrespondencias.
export function resolverLinhasRevisao(rows, { accountId, transactions, closingDay = 14, forcedDupSelect = new Set(), parcelasPorChave = null, faturasFechadas = null }) {
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

  const marcarColisao = (r, tx, mesmo = false, ajustarValor = false) => {
    usados.add(tx.id)
    resolvida.add(r._id)
    Object.assign(r, {
      // Previsão da MESMA parcela (mesma série, mesmo n/total, mesma fatura) com centavos de diferença:
      // a confirmação grava o valor do arquivo (decisão de 12/11/2026 — não é "parecido").
      _ajustarValor: ajustarValor,
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

  // Pode virar PERGUNTA: só não conciliado e de fatura aberta. Conciliado nunca é candidato a escolha.
  const podePerguntar = (t) => !t.reconciled && !faturaEstaFechada(faturasFechadas, accountId, faturaDe(t))
  const naFaturaDe = (r) => (t) => t && faturaDe(t) === r.faturaMonthYear

  // 1. Colisão de parcela, restrita à fatura da linha: mesma chave, série inferida (âncora) ou o
  //    serie_id da série já gravada — sempre com o mesmo n/total. ±0,01 → "No banco ↻" em silêncio
  //    (conciliado ou não: é a reimportação); até ±0,50, NÃO conciliada e de fatura aberta → é a
  //    previsão da mesma parcela com centavos: "No banco ↻" que ajusta o valor (nunca pergunta).
  for (const r of out) {
    if (resolvida.has(r._id) || tipoDe(r) !== 'expense' || !r._installment) continue
    const naFatura = naFaturaDe(r)
    let tx = matchParcelaExistente(indice, r, accountId, usados)
    if (!naFatura(tx)) tx = null
    if (!tx && r._serieAnchor?.accountId === accountId) {
      const daSerie = findParcelaDaSerie(r._serieAnchor, r._installment.num, r.amount, transactions, usados)
      if (naFatura(daSerie)) tx = daSerie
    }
    if (!tx && serieDaLinha(r)) {
      tx = doCartao
        .filter(t => !usados.has(t.id) && tipoDe(t) === 'expense' && mesmaSerie(r, t) && naFatura(t)
          && parcelaIgual(r, t) && valorCompativel(r, t, TOL_ARREDONDAMENTO))
        .sort((a, b) => diffValor(a, r) - diffValor(b, r) || (chaveEstavel(a) < chaveEstavel(b) ? -1 : 1))[0] || null
    }
    if (!tx) continue
    // VALE O VALOR DA FATURA DO BANCO (14/11/2026): casada por tolerância, a parcela assume o valor
    // do arquivo — também conciliada ou de fatura fechada/paga (a prévia destaca esses casos).
    marcarColisao(r, tx, false, diffValor(r, tx) > 0.005)
  }

  // 2. Já existe, em silêncio. Primeiro os CONCILIADOS (reimportação da mesma fatura): mesmo tipo,
  //    valor ±0,01, mesma parcela e mesma data do cartão — 1:1 na ordem do arquivo. Depois os NÃO
  //    conciliados com descrição-base parecida, mesma parcela, valor ±0,01 e compra até 3 dias (parcela
  //    N > 1 casa pela série/base, sem data); havendo mais de um candidato igual, não decide aqui
  //    (lib/casamentoFatura pergunta).
  const candidatos = (r) => (porFatura.get(r.faturaMonthYear) || []).filter(t => !usados.has(t.id))
  const resolverExiste = (r, tx) => {
    usados.add(tx.id)
    resolvida.add(r._id)
    Object.assign(r, { _isDuplicate: true, _dupLevel: 'certeza', _dbTx: tx, selected: false })
  }
  const linhasLivres = () => out.filter(r => !resolvida.has(r._id) && !r._generated)
  // Data do conciliado: a do cartão; sem ela (gravado antes de existir a coluna), a do lançamento.
  // Parcela (total > 1) não precisa de data: a projeção conciliada pelo "Já existe" fica sem data
  // do cartão, e mesmo n/total + valor + fatura já é o mesmo exato.
  const mesmaDataConciliado = (r, t) => mesmaData(r, t) || (!dataCartaoDoTx(t) && !!dataCompraLinha(r) && dataCompraLinha(r) === String(t.date || '').slice(0, 10))
  // Pareamento GLOBAL (não na ordem do arquivo): todos os pares possíveis, ordenados por mesma loja,
  // diferença de valor e força da data; cada linha e cada conciliado entram em um par só.
  //   nível 0: mesma parcela e mesma data do cartão; 1: parcela (total > 1) sem data comparável;
  //   2: linha SEM número de parcela legível × conciliado com parcela, com a MESMA descrição
  //      (normalizada) e a mesma data do cartão — o conciliado foi gravado com o texto desta linha.
  const paresConciliados = []
  for (const r of linhasLivres()) {
    for (const t of candidatos(r)) {
      if (!t.reconciled || tipoDe(t) !== tipoDe(r) || !valorCompativel(r, t)) continue
      let nivel = null
      if (parcelaIgual(r, t) && mesmaDataConciliado(r, t)) nivel = 0
      else if (parcelaIgual(r, t) && parcelaLinha(r)) nivel = 1
      else if (!parcelaLinha(r) && !parcelaIgual(r, t) && mesmaData(r, t) && mesmaDescricao(r, t)) nivel = 2
      if (nivel == null) continue
      paresConciliados.push({ linha: r, tx: t, ordem: [mesmaLoja(r, t) ? 0 : 1, Math.round(diffValor(r, t) * 100), nivel] })
    }
  }
  for (const [id, tx] of parearUmPraUm(paresConciliados)) resolverExiste(out.find(r => r._id === id), tx)
  const livres2 = linhasLivres()
  const listas = new Map()
  for (const r of livres2) {
    const pr = parcelaLinha(r)
    listas.set(r._id, candidatos(r).filter(t => !t.reconciled && tipoDe(t) === tipoDe(r) && valorCompativel(r, t)
      && parcelaIgual(r, t) && !outraSerie(r, t) && similaridadeBase(r.description, t.description) >= SIM_MESMA_BASE
      && (pr && pr.num > 1 ? true : ateDias(r, t, JANELA_DIAS_MESMO)))
      .map(t => ({ t, n: 'auto' })))
  }
  const distancia = (r, t) => {
    const a = dataCompraLinha(r), b = dataCompraTx(t)
    return a && b ? diasEntre(a, b) : 0
  }
  for (const [id, v] of paresUmPraUm(livres2, listas, distancia)) {
    if (v.status !== 'casada') continue
    resolverExiste(out.find(r => r._id === id), v.tx)
  }

  // 3. Possível duplicata (pergunta), só contra NÃO conciliado de fatura aberta, na fatura da linha:
  //    a MESMA SÉRIE com o mesmo valor (±0,01) e outro número de parcela ("Aramis 4/4" × 3/4). Valor
  //    diferente nunca é proposto (decisão de 12/11/2026).
  for (const r of out) {
    if (resolvida.has(r._id) || r._generated) continue
    let tx = null
    const pr = parcelaLinha(r)
    if (pr) {
      const baseLinha = baseDaChave(keyOfImportRow(r, accountId))
      tx = candidatos(r)
        .filter(t => podePerguntar(t) && tipoDe(t) === 'expense' && tipoDe(r) === 'expense' && valorCompativel(r, t))
        .filter(t => {
          const pt = parcelaTx(t)
          if (!pt || pt.total !== pr.total || pt.num === pr.num) return false
          return mesmaSerie(r, t) || (!outraSerie(r, t) && !!baseLinha && baseDaChave(keyOfExistingTx(t)) === baseLinha)
        })
        .sort((a, b) => Math.abs(parcelaTx(a).num - pr.num) - Math.abs(parcelaTx(b).num - pr.num) || (chaveEstavel(a) < chaveEstavel(b) ? -1 : 1))[0] || null
    }
    if (!tx) continue
    usados.add(tx.id)
    resolvida.add(r._id)
    Object.assign(r, { _dupLevel: 'possivel', _dupTx: tx, selected: forcedDupSelect.has(r._id) })
  }

  // 4. O mesmo lançamento em OUTRA fatura, NÃO conciliado e de fatura aberta: vira pergunta em
  // lib/importacaoCorrespondencias ("é o mesmo, lançado na fatura errada?"). Parcela: mesmo número;
  // à vista: mesma data de compra (uma assinatura mensal repete valor e descrição todo mês).
  for (const r of out) {
    if (resolvida.has(r._id) || r._generated) continue
    const num = numeroParcelaDaLinha(r)
    const iguais = doCartao.filter(t => {
      const f = faturaDe(t)
      if (!f || f === r.faturaMonthYear) return false
      // Conciliado (ou de fatura fechada) nunca é proposto; só o que ainda pode ser o mesmo lançamento
      // gravado na fatura errada.
      if (!podePerguntar(t) || usados.has(t.id)) return false
      if (tipoDe(t) !== tipoDe(r) || !valorCompativel(r, t)) return false
      if (similaridadeBase(r.description, t.description) < SIM_MESMA_BASE) return false
      return num != null ? numeroParcelaDoTx(t) === num : mesmaData(r, t)
    })
    r._tambemEm = iguais.map(t => ({ fatura: faturaDe(t), tx: t })).sort((a, b) => a.fatura.localeCompare(b.fatura))
  }
  for (const r of out) {
    if (r._generated || !(r._collisionTx || (r._isDuplicate && r._dbTx))) continue
    r._ajusteValor = ajusteDeValorDaLinha(r, r._dbTx)
  }
  return out
}

// VALE O VALOR DA FATURA DO BANCO: linha do arquivo casada com um lançamento gravado (colisão "No
// banco ↻" ou "já existe") com valor diferente → o lançamento passa a ter o valor do arquivo. Só
// aquele lançamento (as outras parcelas e o agendamento não mudam). → null | { de, para, diferenca,
// conciliado }. `conciliado` = já conferido antes: ajusta mesmo assim, mas a prévia destaca.
export function ajusteDeValorDaLinha(row, tx) {
  if (!row || !tx || tipoDe(row) !== tipoDe(tx)) return null
  const de = r2(tx.amount)
  const para = r2(row.amount)
  if (Math.abs(para - de) <= 0.005) return null
  return { de, para, diferenca: r2(para - de), conciliado: !!tx.reconciled }
}

// Motivo gravado no histórico de alterações.
export const motivoAjusteValor = (a, fmt = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`) =>
  `Ajustado ao valor da fatura do banco (${fmt(a.de)} → ${fmt(a.para)})`

// Resumo da prévia: "N lançamentos ajustados ao valor do banco (diferença total R$ Z)".
export function resumoAjustesDeValor(rows) {
  const lista = (rows || []).filter(r => r._ajusteValor && !r._ajusteIgnorado)
  return { qtd: lista.length, diferenca: r2(lista.reduce((s, r) => s + r._ajusteValor.diferenca, 0)), linhas: lista }
}

// Campos que a confirmação grava no lançamento do banco quando a linha colide com ele (UPDATE em
// vez de INSERT). `amount` só entra no ajuste de centavos da previsão (_ajustarValor).
export function patchColisao(row, tx, { saveDate, faturaRef, serieId }) {
  return {
    // Vale o valor da fatura do banco: diferente do gravado → o do arquivo (ajusteDeValorDaLinha).
    ...(ajusteDeValorDaLinha(row, tx) ? { amount: r2(row.amount) } : {}),
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

// O que a confirmação GRAVARIA numa colisão ("No banco ↻"). Lançamento CONCILIADO reconhecido numa
// reimportação nunca é alterado: nada a gravar (nem pré-marcado) — diferenças reais aparecem só como
// informação (diferencasDoConciliado).
export function mudancasDaColisao(row, tx, patch) {
  if (!tx) return []
  return camposAlteradosColisao(patchAplicavel(row, tx, patch), tx, tx.reconciled ? null : row)
}

// Campos que a colisão GRAVA de fato. Lançamento CONCILIADO só muda quando o valor do arquivo é
// outro: aí recebe o que vem do BANCO — valor, data do cartão e fatura (a referência da fatura só se
// a fatura mudar). Nada de descrição, categoria, grupo ou data de sistema (o Finup guarda o que o
// usuário escreveu e a regra de data das parcelas); sem diferença de valor, nada.
const CAMPOS_DO_BANCO = ['amount', 'dateCartao', 'faturaMonthYear']
export function patchAplicavel(row, tx, patch) {
  if (!tx?.reconciled) return patch
  if (!ajusteDeValorDaLinha(row, tx)) return {}
  const out = Object.fromEntries(CAMPOS_DO_BANCO.filter(k => k in patch).map(k => [k, patch[k]]))
  if ('faturaMonthYear' in out && out.faturaMonthYear !== tx.faturaMonthYear && 'faturaRef' in patch) out.faturaRef = patch.faturaRef
  return out
}

// Diferenças REAIS entre a linha do arquivo e um lançamento conciliado: valor e data do cartão.
// Descrição não conta (decisão de 12/11/2026: o Finup guarda o nome que o usuário escreveu); data de
// sistema, parcela e classificação também não (são do Finup, não do banco).
// → [{ campo: 'valor' | 'dataCartao', banco, arquivo }]
export function diferencasDoConciliado(row, tx) {
  if (!tx?.reconciled) return []
  const out = []
  if (Math.abs((Number(row.amount) || 0) - (Number(tx.amount) || 0)) > 0.005) out.push({ campo: 'valor', banco: Number(tx.amount), arquivo: Number(row.amount) })
  const dcLinha = row._dateCartao || null, dcTx = tx.dateCartao || null
  if (dcLinha && dcTx && dcLinha !== dcTx) out.push({ campo: 'dataCartao', banco: dcTx, arquivo: dcLinha })
  return out
}

// Texto do resumo final da importação de fatura. `r` = { novos, existiam, atualizados, conciliados? }
// ou, na reedição, { salvos }.
export function textoResumoImportacao(r) {
  const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
  const conc = r.conciliados > 0 ? ` · ${pl(r.conciliados, 'lançamento marcado como conciliado', 'lançamentos marcados como conciliados')}` : ''
  if (r.salvos != null) return `${pl(r.salvos, 'lançamento salvo', 'lançamentos salvos')}${conc || '.'}`
  const fmtV = (v) => `R$ ${Math.abs(v).toFixed(2).replace('.', ',')}`
  const aj = r.ajustados > 0
    ? ` · ${pl(r.ajustados, 'lançamento ajustado', 'lançamentos ajustados')} ao valor do banco (diferença total ${r.ajusteDiferenca < 0 ? '−' : ''}${fmtV(r.ajusteDiferenca || 0)})${r.resgatesAcompanharam > 0 ? ` · ${pl(r.resgatesAcompanharam, 'resgate acompanhou', 'resgates acompanharam')}` : ''}`
    : ''
  if (r.novos === 0 && r.atualizados === 0) return `Nenhum lançamento novo — a fatura já estava no banco.${aj}${conc}`
  return `${pl(r.novos, 'novo importado', 'novos importados')} · ${pl(r.existiam, 'já existia', 'já existiam')} · ${pl(r.atualizados, 'atualizado', 'atualizados')}${aj}${conc}`
}

// Lançamentos JÁ gravados que bateram com uma linha do arquivo: "já existe" e colisões ("No banco ↻",
// atualizadas ou não). Foram conferidos contra o cartão, então a confirmação os marca como
// conciliados. Possível duplicata não entra — o usuário não confirmou que é o mesmo.
export function idsNoBancoConferidos(rows) {
  return [...new Set((rows || [])
    .filter(r => !r._generated && (r._isDuplicate || r._collisionTx) && r._dbTx?.id)
    // Linha de IOF agrupado (lib/casamentoFatura): confere TODOS os IOFs estimados do grupo.
    .flatMap(r => (r._jaLancado?.grupo ? r._jaLancado.grupo.map(t => t.id) : [r._dbTx.id])))]
}

// Reedição de uma importação: as linhas são os próprios lançamentos gravados por ela. Vieram do
// arquivo os que têm data do cartão ou estão na fatura da importação; as parcelas futuras que ela
// projetou (sem data do cartão, em outra fatura) não. Linha desmarcada não entra.
export function idsReedicaoConferidos(rows, transactions, mesAno) {
  const byId = new Map((transactions || []).map(t => [t.id, t]))
  return (rows || [])
    .filter(r => r.selected && !r._generated)
    .map(r => byId.get(r._id))
    .filter(t => t && (t.dateCartao || (mesAno && t.faturaMonthYear === mesAno)))
    .map(t => t.id)
}

// Linhas que a confirmação INSERE: selecionadas, sem "já existe" e sem colisão (que vira UPDATE).
export function linhasAImportar(rows) {
  return (rows || []).filter(r => r.selected && !r._isDuplicate && !r._collisionTx)
}

// Pede escolha do usuário e, sem ela, NÃO é gravada (nem importa, nem concilia):
//   • "Para escolher" (candidatos do cartão, sem escolha);
//   • possível duplicata ainda desmarcada (nem "importar mesmo assim", nem "é o mesmo");
//   • cobrança recorrente com valor diferente do agendado, ainda sem resposta.
export function precisaDecisao(r) {
  if (r._jaLancadoOpcoes && !r._jaLancadoEscolha) return true
  // Cobrança recorrente com valor diferente do agendado (lib/recorrenteParecido): "É este agendamento?".
  if (r._recorrentePergunta && !r._recorrenteEscolha) return true
  return r._dupLevel === 'possivel' && !r.selected && !r._mesmoConfirmado && !r._collisionTx
}

// Lançamento do banco que representa a linha na fatura: o da colisão / já existe. Linha sem decisão
// não é representada por ninguém — ela não será gravada e o candidato fica como está.
function representanteNoBanco(r) {
  return r._dbTx || null
}

// Total do ARQUIVO × total PROJETADO da fatura `fatura` depois da confirmação.
//   arquivo   = soma de todas as linhas (estornos negativos).
//   projetado = o que já está gravado na fatura + as linhas que serão inseridas nela.
// A diferença é explicada item a item (soma exata): linha do arquivo que não entra, lançamento
// gravado sem linha no arquivo e par linha × banco com valores diferentes. Linha ainda SEM DECISÃO
// vira item 'sem_decisao' — não conta como explicada (lib/contagemRevisaoFatura).
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
    if (precisaDecisao(r)) {
      itens.push({ tipo: 'sem_decisao', linha: r, valor: r2(v), motivo: 'ainda sem decisão — não será importada' })
      continue
    }
    const tx = representanteNoBanco(r)
    if (tx && faturaDoLancamento(tx, closingDay) === fatura) {
      representados.add(tx.id)
      const d = r2(v - valorComSinal(tx))
      // Ajuste ao valor do banco que a confirmação vai gravar: o projetado já é o do arquivo.
      if (Math.abs(d) > 0.005 && r._ajusteValor && !r._ajusteIgnorado) { projetado += d; continue }
      if (Math.abs(d) > 0.005) {
        itens.push({
          tipo: 'valor_diferente', linha: r, tx, valor: d,
          motivo: r._ajustarValor && !tx.reconciled
            ? `previsão ajustada de ${fmtValor(tx.amount)} para ${fmtValor(r.amount)}`
            : `no banco ${fmtValor(tx.amount)} × arquivo ${fmtValor(r.amount)}`,
        })
      }
      continue
    }
    itens.push({
      tipo: 'linha_fora', linha: r, valor: r2(v),
      motivo: 'não entra (desmarcada)',
    })
  }
  for (const t of naFatura) {
    if (representados.has(t.id)) continue
    if (aguardandoLancamentoDoBanco(t, { aberta })) {
      itens.push({ tipo: 'aguardando_banco', tx: t, valor: r2(-valorComSinal(t)), motivo: 'parcela prevista que o banco ainda não lançou nesta fatura aberta' })
      continue
    }
    itens.push({ tipo: 'so_no_banco', tx: t, valor: r2(-valorComSinal(t)), motivo: 'está no Finup e não veio no arquivo' })
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

// Conferência pós-importação (arquivo × o que está gravado no banco). Em fatura ABERTA, as parcelas
// "aguardando o banco" (projeção da série sem linha no arquivo) estão gravadas mas o arquivo ainda
// não as traz: arquivo + aguardando = banco → confere. `aguardando` = { qtd, total } (total com o
// sinal de valorComSinal, o mesmo de arquivo.total e banco.total). diff = banco − esperado.
export function avaliarConferencia(arquivo, banco, aguardando = null, tolerancia = 0.01) {
  const ag = aguardando?.qtd ? { qtd: aguardando.qtd, total: r2(aguardando.total) } : { qtd: 0, total: 0 }
  const esperado = r2((Number(arquivo?.total) || 0) + ag.total)
  // Resposta sem total numérico (erro / incompleta) nunca confere.
  const diff = banco && Number.isFinite(Number(banco.total)) ? r2(Number(banco.total) - esperado) : null
  return {
    aguardando: ag, esperado, qtdEsperada: (arquivo?.qtd || 0) + ag.qtd, diff,
    ok: diff != null && Math.abs(diff) <= tolerancia,
  }
}

function fmtFatura(my) {
  if (!my) return '—'
  const [y, m] = my.split('-')
  return `${m}/${y}`
}
const fmtValor = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export { fmtFatura }
