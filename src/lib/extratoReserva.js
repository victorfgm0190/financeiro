// Extrato da função de reserva (Reservas › Fluxo Futuro): a linha do tempo de uma função — ou de
// todas juntas (TOTAL GERAL) — como um fluxo de caixa. Puro, sem React.
//
// REGRA DE OURO: o saldo no fim de cada mês do extrato é o MESMO da grade do Fluxo Futuro.
//   • Fonte: os realizados vêm dos mesmos lançamentos/ajustes de saldoDaFuncao (src/lib/saldoReserva.js)
//     e os previstos das mesmas ocorrências que a grade soma (computeScheduledByFunction, que chama
//     previsoesDasFuncoes), com o mesmo índice de mês da janela (winIndexOf).
//   • Conta: igual à da grade — o índice 0 da janela é o "saldo de hoje"; do índice 1 em diante,
//     saldo = round2(saldo anterior + Dep − Res − Prov), com Dep/Res/Prov somados com round2 na ordem
//     das ocorrências. As linhas mostram o saldo corrente; a faixa do mês usa essa conta.
//
// Estrutura das seções (uma faixa de subtotal no fim de cada uma):
//   • Se o período começa no índice 0 ou 1 da janela (mês do período aberto ou mês de hoje): seção
//     'hoje' com os movimentos REALIZADOS desde o início do período (ou da reserva, o que vier depois)
//     até hoje; o saldo dela é o saldo de hoje (a coluna do índice 0 da grade, quando aparece).
//   • Uma seção por mês do período a partir do índice 1, com os movimentos PREVISTOS daquele mês.
//   • Período começando depois (índice ≥ 2): sem realizados; o saldo inicial é o da grade no fim
//     do mês anterior ao "De".
import { reserveMovOf, periodoVigente, ehAjusteDeRendimento, INICIO_SEM_PERIODO } from './saldoReserva.js'
import { somarMeses } from './fluxoPeriodo.js'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const semMenosZero = (n) => round2(n) || 0

export const TIPO_PREVISTO = { deposito: 'Depósito', resgate: 'Resgate', provisao: 'Resgate provisório' }

// Movimentos REALIZADOS da função de `desde` até `ate` (inclusive), com os MESMOS filtros de
// saldoDaFuncao(fn, ate): período vigente em `ate`, lançamentos classificados por reserveMovOf,
// ajustes e rendimentos (ou o ajuste_override legado). Devolve { corte, itens } — `corte` = a data a
// partir da qual os itens contam (o início do período da reserva, se for depois de `desde`).
export function realizadosDaFuncao(fn, desde, ate, idx) {
  const per = periodoVigente(idx.periodos.get(fn.id), ate)
  const inicio = per ? per.data_inicio : INICIO_SEM_PERIODO
  const corte = desde > inicio ? desde : inicio
  const conta = fn.accountId || null
  const itens = []
  for (const tx of idx.lancamentos.get(fn.id) || []) {
    if (tx.date < corte || tx.date > ate) continue
    const m = reserveMovOf(tx, conta)
    if (!m.entrada && !m.saida) continue
    const tipo = tx.type === 'income' ? 'Receita' : m.entrada ? 'Depósito' : 'Resgate'
    itens.push({ date: tx.date, label: tx.description || tipo, tipo, entrada: round2(m.entrada), saida: round2(m.saida) })
  }
  const ajs = idx.ajustes.get(fn.id) || []
  if (ajs.length > 0) {
    for (const a of ajs) {
      if (a.data < corte || a.data > ate) continue
      const v = round2(a.valor)
      if (!v) continue
      const rend = ehAjusteDeRendimento(a)
      itens.push({
        date: a.data, label: a.observacao || (rend ? 'Rendimento' : 'Ajuste'), tipo: rend ? 'Rendimento' : 'Ajuste',
        entrada: v > 0 ? v : 0, saida: v < 0 ? -v : 0,
      })
    }
  } else if (fn.ajusteOverride && typeof fn.ajusteOverride === 'object') {
    for (const [mes, item] of Object.entries(fn.ajusteOverride)) {
      const d = `${mes}-01`
      if (!/^\d{4}-\d{2}-01$/.test(d) || d < corte || d > ate) continue
      const v = round2(item?.valor)
      if (!v) continue
      itens.push({ date: d, label: item?.observacao || 'Ajuste', tipo: 'Ajuste', entrada: v > 0 ? v : 0, saida: v < 0 ? -v : 0 })
    }
  }
  itens.sort((a, b) => a.date.localeCompare(b.date))
  return { corte, itens }
}

// Extrato de UMA função.
//   meses:   meses exibidos [{ idx (índice na janela), year, month0, label }], em ordem (idx = ini…n−1)
//   saldoHoje: o mesmo valor do "Total Investido" (saldosAtualizados) — ponto de partida da grade
//   realizados: { corte, itens } de realizadosDaFuncao(fn, <1º dia do mês de `ini`>, hoje, idx)
//   previstos: ocorrências da janela [{ date, label, amount, tipo: 'deposito'|'resgate'|'provisao', idx }]
//              na ORDEM em que a grade as soma
export function extratoDaFuncao({ id, nome, saldoHoje, realizados, previstos, meses }) {
  const ini = meses[0]?.idx ?? 1
  const secoes = []
  let saldoInicial
  let dataInicial
  const prev = (previstos || []).filter(p => p.idx >= 1)
  // Soma da grade num índice da janela (mesma ordem e mesmo round2 de computeScheduledByFunction).
  const somaMes = (i) => {
    let dep = 0, res = 0, prov = 0
    for (const p of prev) {
      if (p.idx !== i) continue
      if (p.tipo === 'deposito') dep = round2(dep + p.amount)
      else if (p.tipo === 'resgate') res = round2(res + p.amount)
      else prov = round2(prov + p.amount)
    }
    return { dep, res, prov }
  }
  const linhaPrevista = (p) => ({
    date: p.date, label: p.label, tipo: TIPO_PREVISTO[p.tipo] || p.tipo, previsto: true, provisorio: p.tipo === 'provisao',
    entrada: p.tipo === 'deposito' ? p.amount : 0, saida: p.tipo === 'deposito' ? 0 : p.amount,
    resgateScheduleId: p.resgateScheduleId, functionId: id, funcao: nome,
  })

  let saldoMes = Number(saldoHoje) || 0
  if (ini <= 1) {
    const itens = (realizados?.itens || []).map(it => ({ ...it, previsto: false, functionId: id, funcao: nome }))
    const liquido = itens.reduce((s, it) => s + it.entrada - it.saida, 0)
    saldoInicial = round2(saldoMes - liquido)
    dataInicial = realizados?.corte
    secoes.push({
      chave: 'hoje', idx: 0, itens,
      entradas: round2(itens.reduce((s, it) => s + it.entrada, 0)),
      saidas: round2(itens.reduce((s, it) => s + it.saida, 0)),
      saldoFim: saldoMes,
    })
  } else {
    for (let i = 1; i < ini; i++) {
      const { dep, res, prov } = somaMes(i)
      saldoMes = round2(saldoMes + dep - res - prov)
    }
    saldoInicial = saldoMes
    dataInicial = null
  }
  for (const m of meses) {
    if (m.idx < 1) continue
    const { dep, res, prov } = somaMes(m.idx)
    saldoMes = round2(saldoMes + dep - res - prov)
    const itens = prev.filter(p => p.idx === m.idx).map(linhaPrevista)
    secoes.push({ chave: m.idx, idx: m.idx, itens, entradas: dep, saidas: round2(res + prov), saldoFim: saldoMes })
  }
  return correr({ saldoInicial, dataInicial, secoes })
}

// Junta extratos de várias funções (TOTAL GERAL): as seções têm as mesmas chaves (dependem só do
// período). Itens em ordem de data dentro da seção; o saldo do fim da seção é a SOMA dos saldos das
// funções — a mesma soma do rodapé TOTAL GERAL da grade (totaisFluxoFuturo).
export function juntarExtratos(extratos) {
  if (!extratos.length) return correr({ saldoInicial: 0, dataInicial: null, secoes: [] })
  const base = extratos[0]
  const secoes = base.secoes.map((s, k) => {
    const todas = extratos.map(e => e.secoes[k])
    const itens = todas.flatMap(x => x.itens).map((it, ordem) => ({ it, ordem }))
      .sort((a, b) => a.it.date.localeCompare(b.it.date) || a.ordem - b.ordem).map(x => x.it)
    return {
      chave: s.chave, idx: s.idx, itens,
      entradas: semMenosZero(todas.reduce((t, x) => t + x.entradas, 0)),
      saidas: semMenosZero(todas.reduce((t, x) => t + x.saidas, 0)),
      saldoFim: semMenosZero(todas.reduce((t, x) => t + (Number(x.saldoFim) || 0), 0)),
    }
  })
  const datas = extratos.map(e => e.dataInicial).filter(Boolean).sort()
  return correr({
    saldoInicial: semMenosZero(extratos.reduce((t, e) => t + e.saldoInicial, 0)),
    dataInicial: datas[0] || null,
    secoes,
  })
}

// Saldo corrente linha a linha, totais do período e o primeiro ponto negativo.
function correr({ saldoInicial, dataInicial, secoes }) {
  let saldo = saldoInicial
  let negativoEm = saldoInicial < 0 ? (dataInicial || '') : null
  const out = secoes.map(s => {
    const itens = s.itens.map(it => {
      saldo = round2(saldo + it.entrada - it.saida)
      const neg = saldo < 0
      if (neg && negativoEm === null) negativoEm = it.date
      return { ...it, saldo, neg }
    })
    saldo = s.saldoFim
    return { ...s, itens, neg: round2(s.saldoFim) < 0 }
  })
  // Sem linha negativa mas com fim de mês negativo (arredondamento): aponta o mês.
  let negativoSecao = null
  if (negativoEm === null) {
    const s = out.find(x => x.neg)
    if (s) { negativoSecao = s.chave; negativoEm = s.itens[s.itens.length - 1]?.date || null }
  }
  return {
    saldoInicial, dataInicial, secoes: out,
    entradas: semMenosZero(out.reduce((t, s) => t + s.entradas, 0)),
    saidas: semMenosZero(out.reduce((t, s) => t + s.saidas, 0)),
    saldoFinal: out.length ? out[out.length - 1].saldoFim : saldoInicial,
    negativoEm, negativoSecao,
  }
}

// Atalhos do período do extrato, contados do mês do período aberto (`atual`, como no Fluxo Futuro).
export const atalhosExtrato = (atual) => [
  { id: 'mes', rotulo: 'Este mês', de: atual, ate: atual },
  { id: '3m', rotulo: 'Próximos 3 meses', de: atual, ate: somarMeses(atual, 2) },
  { id: '12m', rotulo: 'Próximos 12 meses', de: atual, ate: somarMeses(atual, 11) },
]
