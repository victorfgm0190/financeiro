// Importar Fatura — o que sobra DEPOIS de resolverLinhasRevisao e aplicarJaLancados (Etapa 6a). Só
// nas linhas que eles deixaram como novas; o que a lógica anterior decidiu (FITID, colisão de parcela,
// "Já existe", possível duplicata, "Já lançado", pré-lançamento) fica como está.
//
// Candidatos: lançamentos NÃO conciliados do MESMO cartão e do mesmo tipo, na fatura da linha ou nas
// vizinhas (anterior e seguinte), todas abertas; um lançamento só casa com uma linha.
// Regras de candidato (12/11/2026): nunca conciliado, nunca de outra série, nunca com valor diferente.
// PERGUNTA ("Para escolher" — nada é marcado sozinho):
//   • nome forte (lib/matchLancamento.similaridade ≥ 0,6, sem cidade e sem palavras genéricas, ou o
//     apelido aprendido), mesma parcela (as duas à vista, ou mesmo n/total), MESMO valor (±0,01) e
//     compra até 5 dias (parcela N > 1 não compara a data);
//   • à vista com o mesmo valor (±0,01) e a compra entre 4 e 7 dias, ou até 7 dias em outra fatura;
//   • o mesmo lançamento NÃO conciliado em outra fatura aberta (lib/revisaoImportacao, _tambemEm):
//     "é o mesmo, lançado na fatura errada?" — escolhido, vai para a fatura do arquivo.
// NOVO DIRETO: o resto. "Parecido" só pelo nome deixou de existir.
// AVISO no novo (não muda o que é gravado): lançamento não conciliado da mesma loja (nome forte), MESMO
// valor e MESMA parcela, na mesma fatura ou vizinha, que não virou pergunta → r._avisoParecido.
// Escolher um candidato grava pelo caminho "Já lançado" (lib/casamentoFatura gravarJaLancados): o
// existente recebe valor/data/descrição/fatura da fatura e é conciliado. Nunca exclui nada. PURO.
import { simNomes, apelidoLeva, somarMes, SIMILARIDADE_MINIMA } from './matchLancamento.js'
import { favorecidoSugerido } from './casamentoFatura.js'
import { faturaDoLancamento } from './scheduleBaixa.js'
import { faturaEstaFechada } from './faturasFechadas.js'
import { numeroParcelaDoTx, totalParcelasDoTx, outraSerie } from './revisaoImportacao.js'

export const TOL_NOME_FORTE = 0.05
export const JANELA_DIAS_NOME_FORTE = 5
export const JANELA_DIAS_MESMO_VALOR = 7
export const MAX_OPCOES = 3

const livre = (r) => !r._generated && !r._isDuplicate && !r._collisionTx && !r._dupLevel && !r._jaLancado && !r._preId
  && !r._jaLancadoOpcoes

const centavos = (v) => Math.round(Math.abs(Number(v) || 0) * 100)
const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86_400_000))
const parcelaDaLinha = (r) => (Number(r._installment?.total) > 1 ? { num: Number(r._installment.num), total: Number(r._installment.total) } : null)
const parcelaDoTx = (t) => {
  const total = totalParcelasDoTx(t)
  return total > 1 ? { num: numeroParcelaDoTx(t), total } : null
}
const mesmaParcela = (a, b) => (!a && !b) || !!(a && b && a.num === b.num && a.total === b.total)

// Métricas de um candidato `t` para a linha `r` (sem decidir nada).
function medir(r, t, { nomes, apelidos, closingDay }) {
  const simNome = apelidoLeva(nomes, t, apelidos) ? 1 : simNomes(nomes, t)
  const vr = centavos(r.amount), vt = centavos(t.amount)
  const diff = Math.abs(vr - vt)
  const dataLinha = r._dateCartao || r.date || null
  const dataTx = t.dateCartao ? String(t.dateCartao).slice(0, 10) : t.date || null
  const dias = dataLinha && dataTx ? diasEntre(dataLinha, dataTx) : null
  const pr = parcelaDaLinha(r), pt = parcelaDoTx(t)
  return {
    tx: t, simNome, nomeForte: simNome >= SIMILARIDADE_MINIMA, diff, dias, pr, pt,
    valorIgual: diff <= 1, valor5: diff <= Math.round(vt * TOL_NOME_FORTE),
    mesmaParcela: mesmaParcela(pr, pt), fatura: faturaDoLancamento(t, closingDay),
    dataDiverge: !!(dataLinha && dataTx && dataLinha !== dataTx && !((pr?.num || 0) > 1)),
  }
}

// → { perguntar: [m], aviso: m|null } para uma linha livre.
export function classificarLinhaLivre(r, { transactions = [], cartao, apelidos = [], faturasFechadas = null, usados = new Set() }) {
  const closingDay = cartao.closingDay || 14
  const ref = r.faturaMonthYear || faturaDoLancamento({ date: r._dateCartao || r.date }, closingDay)
  const faturas = new Set([somarMes(ref, -1), ref, somarMes(ref, 1)].filter(f => !faturaEstaFechada(faturasFechadas, cartao.id, f)))
  const nomes = [r.payee && r.payee !== r.description ? r.payee : '', r.description].filter(Boolean)
  const tipo = r.type || 'expense'
  const ms = []
  for (const t of transactions) {
    if (t.accountId !== cartao.id || (t.type || 'expense') !== tipo || t.isEspelho || t.reservaAuto || t.reconciled) continue
    if (usados.has(t.id)) continue
    const m = medir(r, t, { nomes, apelidos, closingDay })
    if (!faturas.has(m.fatura)) continue
    ms.push(m)
  }
  const aVistaOuP1 = (m) => !m.pr || m.pr.num === 1
  // Valor diferente (±5%) não é mais proposto: só o mesmo valor, a mesma parcela e nunca outra série.
  const perguntaNome = (m) => m.nomeForte && m.mesmaParcela && m.valorIgual && !outraSerie(r, m.tx)
    && ((m.pr?.num || 0) > 1 || m.dias == null || m.dias <= JANELA_DIAS_NOME_FORTE)
  const perguntaValor = (m) => m.valorIgual && m.mesmaParcela && aVistaOuP1(m) && m.dias != null
    && m.dias <= JANELA_DIAS_MESMO_VALOR && (m.dias >= 4 || m.fatura !== ref)
  const score = (m) => (m.valorIgual ? 40 : 0) + m.simNome * 20 + (m.fatura === ref ? 5 : 0) - (m.dias ?? 0) * 0.5 - m.diff / 100
  const perguntar = ms.filter(m => perguntaNome(m) || perguntaValor(m)).sort((a, b) => score(b) - score(a)).slice(0, MAX_OPCOES)
  const aviso = perguntar.length ? null
    : ms.filter(m => m.nomeForte && m.valorIgual && m.mesmaParcela && !outraSerie(r, m.tx)).sort((a, b) => score(b) - score(a))[0] || null
  return { perguntar, aviso }
}

// O mesmo lançamento NÃO conciliado gravado em OUTRA fatura (r._tambemEm, já filtrado pela regra em
// lib/revisaoImportacao) vira opção da pergunta, com as mesmas métricas.
export function opcoesTambemEm(r, { cartao, apelidos = [], usados = new Set() }) {
  const closingDay = cartao.closingDay || 14
  const nomes = [r.payee && r.payee !== r.description ? r.payee : '', r.description].filter(Boolean)
  return (r._tambemEm || []).map(o => o.tx)
    .filter(t => t && !t.reconciled && !usados.has(t.id) && !outraSerie(r, t))
    .map(t => medir(r, t, { nomes, apelidos, closingDay }))
}

export function aplicarCorrespondencias(rows, { transactions = [], accounts = [], accountId, apelidos = [], faturasFechadas = null }) {
  const out = rows.map(r => ({ ...r }))
  const cartao = accounts.find(a => a.id === accountId)
  if (!cartao) return out
  const closingDay = cartao.closingDay || 14
  const usados = new Set()
  for (const r of out) {
    for (const t of [r._dbTx, r._collisionTx, r._dupTx, r._jaLancado?.tx, ...(r._jaLancado?.grupo || [])]) if (t?.id) usados.add(t.id)
  }

  const vincular = (r, m) => {
    const tx = m.tx
    usados.add(tx.id)
    const sugerido = favorecidoSugerido(r.description, apelidos)
    const faturaTx = faturaDoLancamento(tx, closingDay)
    const parcelaSeguinte = Number(tx.installmentNum) > 1
    Object.assign(r, { _isDuplicate: true, _dupLevel: 'certeza', _dbTx: tx, selected: false })
    r._jaLancado = {
      tx, origem: 'match', sugerido,
      // A fatura manda: favorecido diferente → o da fatura (o usuário ainda pode manter o atual).
      favModoPadrao: sugerido.nome && sugerido.nome !== (tx.payee || '') ? 'sugerido' : 'manter',
      divergente: {
        valor: m.valorIgual ? null : { de: Number(tx.amount), para: Number(r.amount) },
        data: m.dataDiverge ? { de: tx.dateCartao ? String(tx.dateCartao).slice(0, 10) : tx.date, para: r._dateCartao || r.date } : null,
      },
      // Descrição da fatura no lugar da do Assistente/manual; parcela de série importada mantém a sua.
      atualizarDescricao: tx.origin !== 'importacao_fatura' && !parcelaSeguinte && (tx.description || '') !== (r.description || ''),
      // Casou numa fatura vizinha: o existente passa para a fatura do arquivo.
      fatura: r.faturaMonthYear && faturaTx !== r.faturaMonthYear ? { de: faturaTx, para: r.faturaMonthYear } : null,
    }
  }

  for (const r of out) {
    if (!livre(r)) continue
    const classificado = classificarLinhaLivre(r, { transactions, cartao, apelidos, faturasFechadas, usados })
    // "Também em outra fatura" (não conciliado): pergunta, não aviso solto (decisão de 12/11/2026).
    const tambem = opcoesTambemEm(r, { cartao, apelidos, usados })
    const perguntar = [...classificado.perguntar, ...tambem.filter(m => !classificado.perguntar.some(p => p.tx.id === m.tx.id))].slice(0, MAX_OPCOES)
    const aviso = perguntar.length ? null : classificado.aviso
    if (tambem.length) r._tambemEm = []
    const escolha = r._jaLancadoEscolha
    if (escolha === 'novo') {
      if (perguntar.length) r._jaLancadoOpcoes = perguntar.map(m => m.tx)
      if (aviso) r._avisoParecido = { tx: aviso.tx, fatura: aviso.fatura }
      continue
    }
    const escolhido = escolha ? perguntar.find(m => m.tx.id === escolha) : null
    if (escolhido) { vincular(r, escolhido); continue }
    if (perguntar.length) {
      Object.assign(r, { _jaLancadoOpcoes: perguntar.map(m => m.tx), _parecido: false, selected: false })
      continue
    }
    if (aviso) r._avisoParecido = { tx: aviso.tx, fatura: aviso.fatura }
  }
  return out
}

// Resumo do topo da revisão: "N novos · N já existem · N com valor diferente · N parecidos".
export function resumoRevisao(rows) {
  const c = { novos: 0, jaExistem: 0, valorDiferente: 0, parecidos: 0 }
  for (const r of rows || []) {
    if (r._generated) continue
    const d = r._jaLancado?.divergente
    if (r._jaLancado?.origem === 'pre') { if (r.selected) c.novos++ }
    else if (d && (d.valor || d.data)) c.valorDiferente++
    else if (r._isDuplicate || r._collisionTx || r._jaLancado) c.jaExistem++
    else if ((r._jaLancadoOpcoes && !r._jaLancadoEscolha) || (r._dupLevel === 'possivel' && !r.selected)) c.parecidos++
    else if (r.selected) c.novos++
  }
  return c
}
