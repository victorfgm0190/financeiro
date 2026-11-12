// Importar Fatura — tela nova da conferência (Etapa 6b, 12/11/2026): em que BLOCO cada linha da fatura
// aparece, as perguntas "É este?", a comparação lado a lado e as frases do que acontece ao confirmar.
//
// Só APRESENTAÇÃO: o casamento e o que é gravado continuam em lib/revisaoImportacao,
// lib/casamentoFatura, lib/importacaoCorrespondencias e lib/recorrenteParecido. Cada linha cai em UM
// bloco, coerente com a contagem única (lib/contagemRevisaoFatura): novos = linhasAImportar;
// pedem decisão = precisaDecisao; já no Finup + já conciliados antes = conciliados; não entram =
// desmarcadas. "Aguardando o banco" não são linhas do arquivo: são parcelas previstas no Finup que o
// banco ainda não lançou (projetarTotalFatura). PURO.
import { situacaoLinha, SITUACAO } from './contagemRevisaoFatura.js'
import { precisaDecisao, valorComSinal, numeroParcelaDoTx, totalParcelasDoTx, diferencasDoConciliado } from './revisaoImportacao.js'
import { faturaDoLancamento } from './scheduleBaixa.js'

export const BLOCOS = [
  { id: 'decisao', titulo: 'Pedem sua decisão' },
  { id: 'novos', titulo: 'Novos' },
  { id: 'jaNoFinup', titulo: 'Juntados agora (ficam conciliados)' },
  { id: 'jaConciliados', titulo: 'Já conciliados antes' },
  { id: 'naoEntram', titulo: 'Não entram' },
  { id: 'aguardando', titulo: 'Aguardando o banco' },
]

// Os rótulos de situação que a tela usa (no lugar dos 17 de antes).
export const ROTULO = {
  novo: 'Novo',
  ja: 'Já está no Finup',
  conciliadoAntes: 'Já conciliado antes',
  pergunta: 'É este?',
  perguntaAgendamento: 'É este agendamento?',
  naoEntra: 'Não entra',
  aguardando: 'Aguardando o banco',
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmtValor = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const fmtFat = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '—')

// Lançamento do Finup que representa a linha (o casado / o da mesma parcela / o candidato único).
export function lancamentoDoFinup(r) {
  return r?._jaLancado?.tx || r?._collisionTx || r?._dbTx || r?._dupTx || null
}

export function blocoDaLinha(r) {
  if (precisaDecisao(r)) return 'decisao'
  const s = situacaoLinha(r)
  if (s === SITUACAO.IMPORTAR) return 'novos'
  if (s === SITUACAO.CONCILIADO) return lancamentoDoFinup(r)?.reconciled ? 'jaConciliados' : 'jaNoFinup'
  return 'naoEntram'
}

// → { decisao, novos, jaNoFinup, jaConciliados, naoEntram: [linhas], aguardando: [itens da projeção] }
// Linhas geradas (parcelas futuras) não são do arquivo: ficam fora.
export function montarBlocos(rows, projecao = null) {
  const b = { decisao: [], novos: [], jaNoFinup: [], jaConciliados: [], naoEntram: [], aguardando: projecao?.itensAguardando || [] }
  for (const r of rows || []) {
    if (r._generated) continue
    b[blocoDaLinha(r)].push(r)
  }
  return b
}

const soma = (linhas) => ({ qtd: linhas.length, valor: r2(linhas.reduce((s, r) => s + valorComSinal(r), 0)) })

// Os três números do topo + total do arquivo × o que fica na fatura depois de confirmar.
export function resumoDosBlocos(blocos, projecao = null) {
  const ja = [...blocos.jaNoFinup, ...blocos.jaConciliados]
  const todas = [...blocos.decisao, ...blocos.novos, ...ja, ...blocos.naoEntram]
  return {
    novos: soma(blocos.novos),
    // "Já estão no Finup" (total) = conciliados antes + juntados agora.
    ja: { ...soma(ja), conciliadosAntes: blocos.jaConciliados.length, juntadosAgora: blocos.jaNoFinup.length },
    decisao: soma(blocos.decisao),
    naoEntram: soma(blocos.naoEntram),
    aguardando: { qtd: blocos.aguardando.length, valor: r2(-blocos.aguardando.reduce((s, i) => s + (Number(i.valor) || 0), 0)) },
    arquivo: projecao ? projecao.arquivo : soma(todas).valor,
    ficaNaFatura: projecao ? projecao.projetado : null,
  }
}

// De onde veio o lançamento do Finup, em palavras do usuário.
export function origemDoLancamento(tx) {
  if (!tx) return '—'
  if (tx._pre) return 'Pré-lançamento do Assistente'
  const o = tx.origin || ''
  if (o === 'agendamento' || o === 'agendamento_auto' || tx.scheduleId) return 'Do agendamento'
  const n = numeroParcelaDoTx(tx)
  if ((n && n > 1) || o === 'parcela' || o === 'parcela_gerada') return tx.reconciled ? 'Parcela de compra parcelada' : 'Parcela prevista de compra parcelada'
  if (/^(importacao_|reconciliacao_fatura)/.test(o)) return 'Importado de uma fatura'
  if (tx.estimado) return 'Compra em dólar estimada'
  return 'Lançado por você'
}

// ── Perguntas ─────────────────────────────────────────────────────────────────────────────────────
// Uma pergunta por linha que pede decisão:
//   { id, row, tipo: 'candidatos' | 'duplicata' | 'recorrente', titulo, explicacao, candidatos }
//   candidato = { id, tx } (lançamento do Finup) | { id, agendamento } (info de _recorrentePergunta)
export function perguntasDeDecisao(rows) {
  const out = []
  for (const r of rows || []) {
    if (r._generated || !precisaDecisao(r)) continue
    if (r._recorrentePergunta) {
      out.push({
        id: r._id, row: r, tipo: 'recorrente', titulo: ROTULO.perguntaAgendamento,
        explicacao: 'A cobrança parece ser de um agendamento seu, mas o valor é diferente do agendado.',
        candidatos: [{ id: r._recorrentePergunta.scheduleId, agendamento: r._recorrentePergunta }],
      })
    } else if (r._jaLancadoOpcoes) {
      out.push({
        id: r._id, row: r, tipo: 'candidatos', titulo: ROTULO.pergunta,
        explicacao: r._jaLancadoOpcoes.length > 1
          ? 'Esta linha da fatura pode ser um destes lançamentos que já estão no Finup.'
          : 'Esta linha da fatura pode ser um lançamento que já está no Finup.',
        candidatos: r._jaLancadoOpcoes.map(tx => ({ id: tx.id, tx })),
      })
    } else {
      const tx = r._dupTx || r._collisionTx
      out.push({
        id: r._id, row: r, tipo: 'duplicata', titulo: ROTULO.pergunta,
        explicacao: 'Esta linha da fatura pode ser uma parcela que já está no Finup.',
        candidatos: tx ? [{ id: tx.id, tx }] : [],
      })
    }
  }
  return out
}

const nomeCategoria = (categorias, id) => {
  const c = id && (categorias || []).find(x => x.id === id)
  return c ? `${c.icon ? `${c.icon} ` : ''}${c.name}` : '—'
}
const nomeGrupo = (grupos, id) => {
  const g = id && (grupos || []).find(x => x.id === id)
  return g ? `${g.number != null ? `${g.number} · ` : ''}${g.name}` : '—'
}
const parcelaDaLinha = (r) => (r._installment ? `${r._installment.num}/${r._installment.total}` : 'à vista')
const parcelaDoTx = (tx) => {
  const n = numeroParcelaDoTx(tx)
  if (!n) return 'à vista'
  const t = totalParcelasDoTx(tx)
  return t ? `${n}/${t}` : String(n)
}
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Comparação lado a lado: [{ campo, rotulo, fatura, finup, difere }].
//   ctx: { categorias, grupos, mostrarGrupo, closingDay, schedules }
export function camposLadoALado(row, candidato, ctx = {}) {
  const { categorias = [], grupos = [], mostrarGrupo = true, closingDay = 14, schedules = [] } = ctx
  const linha = {
    dataCartao: fmtData(row._dateCartao || row.date),
    dataFinup: fmtData(row.date),
    descricao: row.description || '—',
    valor: fmtValor(row.amount),
    parcela: parcelaDaLinha(row),
    categoria: nomeCategoria(categorias, row.categoryId),
    grupo: nomeGrupo(grupos, row.grupoGerencial),
    fatura: fmtFat(row.faturaMonthYear),
    origem: 'Arquivo do banco',
  }
  let outro
  let difValor
  if (candidato?.agendamento) {
    const a = candidato.agendamento
    const s = (schedules || []).find(x => x.id === a.scheduleId) || {}
    outro = {
      dataCartao: '—',
      dataFinup: fmtData(a.ocorrencia),
      descricao: a.descricao || s.description || '—',
      valor: `${fmtValor(a.valorAgendado)} (agendado)`,
      parcela: '—',
      categoria: nomeCategoria(categorias, s.categoryId),
      grupo: nomeGrupo(grupos, s.grupoGerencial),
      fatura: fmtFat(a.fatura),
      origem: 'Agendamento recorrente',
    }
    difValor = Math.abs(r2(a.valorAgendado) - r2(row.amount)) > 0.005
  } else {
    const tx = candidato?.tx || {}
    outro = {
      dataCartao: fmtData(tx.dateCartao),
      dataFinup: fmtData(tx.date),
      descricao: tx.description || '—',
      valor: tx.estimado ? `${fmtValor(tx.amount)} (estimado)` : fmtValor(tx.amount),
      parcela: parcelaDoTx(tx),
      categoria: nomeCategoria(categorias, tx.categoryId),
      grupo: nomeGrupo(grupos, tx.grupoGerencial),
      fatura: fmtFat(tx.faturaMonthYear || faturaDoLancamento(tx, closingDay)),
      origem: origemDoLancamento(tx),
    }
    difValor = Math.abs(r2(tx.amount) - r2(row.amount)) > 0.005
  }
  const CAMPOS = [
    ['dataCartao', 'Data do cartão'], ['dataFinup', 'Data no Finup'], ['descricao', 'Descrição'], ['valor', 'Valor'],
    ['parcela', 'Parcela'], ['categoria', 'Categoria'], ...(mostrarGrupo ? [['grupo', 'Grupo']] : []), ['fatura', 'Fatura'],
    ['origem', 'Origem'],
  ]
  return CAMPOS.map(([campo, rotulo]) => {
    let difere
    if (campo === 'valor') difere = difValor
    else if (campo === 'origem') difere = false
    else if (outro[campo] === '—' || linha[campo] === '—') difere = false
    else difere = norm(linha[campo]) !== norm(outro[campo])
    return { campo, rotulo, fatura: linha[campo], finup: outro[campo], difere }
  })
}

// O que acontece ao responder "Sim, é este".
export function fraseSim(pergunta, candidato) {
  const row = pergunta.row
  if (pergunta.tipo === 'recorrente') {
    const a = candidato.agendamento
    return `A ocorrência de ${fmtData(a.ocorrencia)} do agendamento é baixada pelo valor do cartão (${fmtValor(row.amount)}; agendado ${fmtValor(a.valorAgendado)}) e o lançamento entra com a classificação do agendamento.`
  }
  const tx = candidato.tx || {}
  if (pergunta.tipo === 'duplicata') {
    return `Nada novo é criado: o lançamento do Finup passa a mostrar a descrição e a parcela ${parcelaDaLinha(row)} da fatura e fica conciliado.`
  }
  if (tx._pre) return 'O pré-lançamento do Assistente é gravado com o valor da fatura, fica conciliado e sai da lista.'
  if (tx.estimado) return `Nada novo é criado: fica o valor real ${fmtValor(row.amount)} no lugar do estimado ${fmtValor(tx.amount)}, e o lançamento fica conciliado.`
  const mudaValor = Math.abs(r2(tx.amount) - r2(row.amount)) > 0.005
  return `Nada novo é criado: o lançamento do Finup fica conciliado com esta linha${mudaValor ? ` e passa a valer ${fmtValor(row.amount)}` : ''}.`
}

// O que acontece ao responder "Não, é outro".
export function fraseNao(pergunta) {
  const row = pergunta.row
  const parcela = row._installment ? `, parcela ${parcelaDaLinha(row)}` : ''
  if (pergunta.tipo === 'recorrente') return `A linha entra como lançamento novo (${fmtValor(row.amount)}) e o agendamento não é baixado.`
  return `A linha entra como lançamento novo (${fmtValor(row.amount)}${parcela}); o do Finup fica como está.`
}

// ── Itens dos blocos recolhidos ──────────────────────────────────────────────────────────────────
// "Juntados agora (ficam conciliados)": com o que a linha foi juntada e se dá para dizer "Não é este".
//   acao: 'novo' (importa como novo) | 'rever' (volta a ser pergunta) | null (não se aplica: mesma
//   parcela da mesma compra, ou o mesmo lançamento da fatura importado antes)
export function parJaNoFinup(r) {
  const tx = lancamentoDoFinup(r)
  let acao = null
  if (r._jaLancadoOpcoes || r._mesmoConfirmado) acao = 'rever'
  else if (r._jaLancado && r._jaLancado.origem !== 'ja_existe' && r._jaLancado.origem !== 'pre') acao = 'novo'
  return { tx, origem: origemDoLancamento(tx), acao }
}

// "Já conciliados antes": diferenças reais (valor e data do cartão — a descrição não conta).
export function itemJaConciliado(r) {
  const tx = lancamentoDoFinup(r)
  return { tx, diferencas: tx ? diferencasDoConciliado(r, tx) : [] }
}

// Linha de "Novos" que veio de uma resposta sua ("é outra compra" / agendamento): dá para rever.
export function respostaDaLinha(r) {
  if (r._recorrente) return r._recorrente.escolha === 'sim' ? 'É o agendamento' : 'Não é o agendamento'
  if (r._jaLancadoOpcoes && r._jaLancadoEscolha === 'novo') return 'Você disse que é outra compra'
  if (r._dupLevel === 'possivel' && r.selected && !r._collisionTx && !r._mesmoConfirmado) return 'Você disse que é outra compra'
  return null
}
