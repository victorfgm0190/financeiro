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
import { faturaDoLancamento } from './scheduleBaixa.js'
import { numeroParcelaDoTx, totalParcelasDoTx } from './revisaoImportacao.js'

export const TOL_VALOR_JA_LANCADO = 0.01
export const JANELA_DIAS_JA_LANCADO = 3

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

// O lançamento `t` pode ser a linha `r`?
export function casaComLinha(r, t, closingDay = 14) {
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
