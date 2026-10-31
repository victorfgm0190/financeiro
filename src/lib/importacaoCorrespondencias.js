// Importar Fatura — correspondência com o que já está no cartão por lib/matchLancamento (nome
// normalizado + apelidos, nº da parcela, valor igual ou ±5%, faturas vizinhas abertas). Roda DEPOIS
// de resolverLinhasRevisao e aplicarJaLancados, só nas linhas que eles deixaram como novas: o que a
// lógica antiga já decidiu (FITID, colisão de parcela, "Já existe", possível duplicata, "Já lançado",
// pré-lançamento) fica como está.
//
// Estados da linha (gravação pelo caminho "Já lançado" — lib/casamentoFatura gravarJaLancados):
//   Já existe                → forte e mesmo valor: não importa; o existente é conciliado.
//   Já existe — valor dif.   → forte com valor ou data divergente: o existente é atualizado (só esta
//                              parcela; historico_alteracoes) e conciliado.
//   Parecido                 → só o nome parecido: nada marcado; o usuário vincula ou importa.
//   Novo                     → importa.
// Nos dois "Já existe", favorecido/descrição do existente passam a ser os da fatura (o original fica
// no histórico). Nunca exclui nada. PURO.
import { buscarCorrespondencias } from './matchLancamento.js'
import { favorecidoSugerido } from './casamentoFatura.js'
import { faturaDoLancamento } from './scheduleBaixa.js'

const livre = (r) => !r._generated && !r._isDuplicate && !r._collisionTx && !r._dupLevel && !r._jaLancado && !r._preId
  && !(r._jaLancadoOpcoes && !r._parecido)

// Dois fortes praticamente empatados (ex.: duas compras iguais pendentes): o usuário escolhe.
const EMPATE = 2

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
    const novo = {
      accountId, type: r.type || 'expense', amount: Number(r.amount), date: r._dateCartao || r.date,
      payee: r.payee && r.payee !== r.description ? r.payee : '', description: r.description,
      faturaMonthYear: r.faturaMonthYear,
      parcela: r._installment?.num ? { num: Number(r._installment.num), total: r._installment.total ? Number(r._installment.total) : null } : null,
    }
    const { fortes, fracos } = buscarCorrespondencias(novo, { transactions, accounts, apelidos, faturasFechadas }, {
      excluirIds: usados, conciliadosSoNaFatura: true, fracosSoPendentes: true,
    })
    const todos = [...fortes, ...fracos]
    if (!todos.length) continue
    const escolha = r._jaLancadoEscolha
    if (escolha === 'novo') {
      Object.assign(r, { _jaLancadoOpcoes: todos.map(m => m.tx), _parecido: !fortes.length })
      continue
    }
    const escolhido = escolha ? todos.find(m => m.tx.id === escolha) : null
    if (escolhido) { vincular(r, escolhido); continue }
    if (fortes.length) {
      const empate = fortes.length > 1 && fortes[0].score - fortes[1].score < EMPATE
      if (!empate) { vincular(r, fortes[0]); continue }
      Object.assign(r, { _jaLancadoOpcoes: fortes.map(m => m.tx), _parecido: false, selected: false })
      continue
    }
    Object.assign(r, { _jaLancadoOpcoes: fracos.map(m => m.tx), _parecido: true, selected: false })
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
