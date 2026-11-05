// ── Virada de saldo das reservas — motor puro ───────────────────────────────────────────────────
// O mesmo código monta a prévia na tela e grava/confere no servidor (api/_viradaReservaServidor.js).
//
// Regras (pedido de 06/11/2026):
//   • A virada fecha UM mês financeiro (mesFinanceiro.js) por vez, em ordem cronológica.
//   • Saldo Final de cada função = fórmula única (saldoReserva.js) com tudo até o último dia do mês;
//     nada posterior ao corte entra. Ele vira o Saldo Inicial do período que abre no dia seguinte.
//   • A virada não rateia nada: rendimentos já foram rateados no dia de cada um; a diferença entre a
//     soma das funções e o saldo da conta só é mostrada e registrada (Distribuir continua manual).
//   • O saldo da conta no corte vem dos lançamentos gravados (saldos.js) — nunca do "Saldo Real"
//     digitado no navegador.

import { indexarReserva, saldoDaFuncao, reserveMovOf, round2, somaSaldos, ehAjusteDeRendimento } from './saldoReserva.js'
import { saldosDaConta, efeitoNaConta } from './saldos.js'
import { computeOccurrences } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { mesesPendentes, somarDias, dataBR, rotuloMes } from './mesFinanceiro.js'

export const TOLERANCIA = 0.005
const fmtValor = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (v) => (v ? String(v).slice(0, 10) : '')

// Último dia já fechado = data_fim do snapshot mais recente (virada assistida ou antiga).
export function ultimoCorteDe(snapshots) {
  let max = null
  for (const s of snapshots || []) {
    const d = dia(s.data_fim)
    if (d && (!max || d > max)) max = d
  }
  return max
}

// Linhas por função no corte `fim`.
function linhasNoCorte(functions, fim, idx) {
  return (functions || []).map((f, i) => {
    const s = saldoDaFuncao(f, fim, idx)
    return {
      functionId: f.id,
      nome: f.name || '',
      accountId: f.accountId || null,
      ordem: f.ordem ?? i,
      inicio: s.inicio,
      periodoId: s.periodoId,
      saldoInicial: s.saldoInicial,
      entradas: s.entradas,
      saidas: s.saidas,
      ajuste: s.ajuste,
      rendimentos: s.rendimentos,
      saldoFinal: s.saldo,
    }
  })
}

// Lançamentos do mês que mexem no saldo da conta de reserva mas não em função nenhuma:
//   • receita sem função já rateada como rendimento → explicada (não entra na lista);
//   • receita sem função e sem rateio → 'receita_sem_rateio';
//   • qualquer outro (transferência sem função, despesa debitada na conta, função de outra conta) → 'sem_funcao'.
function lancamentosSoltos(accId, mes, transactions, fnById, rateados) {
  const out = []
  for (const tx of transactions || []) {
    if (!tx.date || tx.date < mes.inicio || tx.date > mes.fim) continue
    const efeito = efeitoNaConta(tx, accId)
    if (!efeito) continue
    const fn = tx.reservaFuncaoId ? fnById.get(tx.reservaFuncaoId) : null
    if (fn && fn.accountId === accId) {
      const m = reserveMovOf(tx, accId)
      if (m.entrada || m.saida) continue
    }
    if (tx.type === 'income' && !tx.reservaFuncaoId) {
      if (rateados.has(tx.id)) continue
      out.push({ id: tx.id, date: tx.date, description: tx.description || '', valor: round2(efeito), tipo: 'receita_sem_rateio' })
      continue
    }
    out.push({ id: tx.id, date: tx.date, description: tx.description || '', valor: round2(efeito), tipo: 'sem_funcao' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Ocorrências PENDENTES com data efetiva dentro do mês, de agendamentos que mexem nas reservas
// (transferência de/para conta de reserva, vínculo com função ou provisão com função).
function agendamentosVencidos(mes, schedules, contasReserva) {
  const out = []
  for (const s of schedules || []) {
    if (s.isProvisao && s.provisaoEfetivada) continue
    const tocaReserva = !!s.reservaFuncaoId || contasReserva.has(s.accountId) || contasReserva.has(s.toAccountId)
    if (!tocaReserva) continue
    for (const base of computeOccurrences(s, 400)) {
      if (base > mes.fim) break
      const ef = occEfetiva(s, base)
      if (ef.date < mes.inicio || ef.date > mes.fim) continue
      out.push({ scheduleId: s.id, description: s.description || '', date: ef.date, valor: round2(ef.amount) })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Prévia de UM mês: por conta e função, avisos (não bloqueiam) e totais.
// `mes` = { inicio, fim }. Funções sem conta aparecem à parte.
export function montarPrevia({ mes, functions = [], periods = [], adjustments = [], transactions = [], accounts = [], schedules = [] }) {
  const idx = indexarReserva({ periods, adjustments, transactions })
  const linhas = linhasNoCorte(functions, mes.fim, idx)
  const accById = new Map((accounts || []).map(a => [a.id, a]))
  const fnById = new Map((functions || []).map(f => [f.id, f]))
  const rateados = new Set((adjustments || []).filter(ehAjusteDeRendimento).map(a => a.lancamento_id))
  // Saldo de ABERTURA de cada função no mês (o fechamento anterior) — para separar a diferença
  // que já vinha de antes da que surgiu neste mês. Período que abre no mês (virada anterior ou
  // saldo inicial informado): o saldo inicial dele; senão, o saldo na véspera.
  const vespera = somarDias(mes.inicio, -1)
  const abertura = new Map(linhas.map(l => {
    const fn = functions.find(f => f.id === l.functionId)
    return [l.functionId, l.inicio >= mes.inicio ? l.saldoInicial : saldoDaFuncao(fn, vespera, idx).saldo]
  }))

  const contaIds = [...new Set(linhas.map(l => l.accountId).filter(Boolean))]
  const contasReserva = new Set(contaIds)
  const contas = contaIds.map(accId => {
    const acc = accById.get(accId)
    const fns = linhas.filter(l => l.accountId === accId).sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome))
    const somaFuncoes = somaSaldos(fns.map(l => l.saldoFinal))
    const saldoConta = acc ? saldosDaConta(accId, acc.initialBalance, transactions, mes.fim).balance : null
    const diferenca = saldoConta == null ? null : round2(saldoConta - somaFuncoes)
    const somaAntes = somaSaldos(fns.map(l => abertura.get(l.functionId)))
    const contaAntes = acc ? saldosDaConta(accId, acc.initialBalance, transactions, vespera).balance : null
    const diferencaAnterior = contaAntes == null ? null : round2(contaAntes - somaAntes)
    const soltos = lancamentosSoltos(accId, mes, transactions, fnById, rateados)
    const explicadoNoMes = round2(soltos.reduce((s, x) => s + x.valor, 0))
    const variacaoNoMes = diferenca == null || diferencaAnterior == null ? null : round2(diferenca - diferencaAnterior)
    return {
      accountId: accId,
      nome: acc ? (acc.apelido || acc.name || '') : '(conta não encontrada)',
      funcoes: fns,
      somaFuncoes,
      saldoConta,
      diferenca,
      diferencaAnterior,
      variacaoNoMes,
      rendimentosMes: round2(fns.reduce((s, l) => s + rendimentosNoMes(idx, l.functionId, mes), 0)),
      soltos,
      explicadoNoMes,
      semExplicacao: variacaoNoMes == null ? null : round2(variacaoNoMes - explicadoNoMes),
    }
  })
  const semConta = linhas.filter(l => !l.accountId)
  const vencidos = agendamentosVencidos(mes, schedules, contasReserva)

  const avisos = []
  for (const c of contas) {
    if (c.diferenca != null && Math.abs(c.diferenca) > TOLERANCIA) {
      avisos.push({
        codigo: 'diferenca', accountId: c.accountId,
        texto: `${c.nome}: a soma das funções (${fmtValor(c.somaFuncoes)}) difere do saldo da conta em ${dataBR(mes.fim)} (${fmtValor(c.saldoConta)}) em ${fmtValor(c.diferenca)}.`,
      })
    }
  }
  const soltos = contas.flatMap(c => c.soltos.map(s => ({ ...s, conta: c.nome })))
  const semFuncao = soltos.filter(s => s.tipo === 'sem_funcao')
  const semRateio = soltos.filter(s => s.tipo === 'receita_sem_rateio')
  if (semFuncao.length) avisos.push({ codigo: 'sem_funcao', itens: semFuncao, texto: `${semFuncao.length} lançamento(s) da conta de reserva no mês não entram em nenhuma função.` })
  if (semRateio.length) avisos.push({ codigo: 'receita_sem_rateio', itens: semRateio, texto: `${semRateio.length} receita(s) na conta de reserva sem função e sem rateio de rendimento.` })
  const negativas = linhas.filter(l => l.saldoFinal < -TOLERANCIA)
  if (negativas.length) avisos.push({ codigo: 'negativa', itens: negativas.map(l => ({ functionId: l.functionId, nome: l.nome, saldo: round2(l.saldoFinal) })), texto: `${negativas.length} função(ões) com saldo negativo no fim do mês.` })
  if (vencidos.length) avisos.push({ codigo: 'vencidos', itens: vencidos, texto: `${vencidos.length} agendamento(s) das reservas venceram no mês e continuam pendentes.` })
  if (semConta.length) avisos.push({ codigo: 'sem_conta', itens: semConta.map(l => ({ functionId: l.functionId, nome: l.nome })), texto: `${semConta.length} função(ões) sem conta vinculada.` })

  return {
    mes: { inicio: mes.inicio, fim: mes.fim, rotulo: rotuloMes(mes) },
    contas,
    semConta,
    linhas,
    avisos,
    totais: {
      somaFuncoes: somaSaldos(linhas.map(l => l.saldoFinal)),
      saldoContas: round2(contas.reduce((s, c) => s + (c.saldoConta || 0), 0)),
      rendimentosMes: round2(contas.reduce((s, c) => s + c.rendimentosMes, 0)),
    },
  }
}

function rendimentosNoMes(idx, fid, mes) {
  let t = 0
  for (const a of idx.ajustes.get(fid) || []) {
    if (ehAjusteDeRendimento(a) && a.data >= mes.inicio && a.data <= mes.fim) t += Number(a.valor) || 0
  }
  return t
}

// Bloqueios que dependem só das datas (os de conexão/sincronização/trava ficam com quem chama).
//   mes_nao_encerrado   → o mês ainda não terminou;
//   mes_ja_fechado      → já existe virada até esse dia;
//   mes_anterior_aberto → há mês anterior pendente (fecha um por vez, em ordem).
export function bloqueiosDeData({ mes, ultimoCorte, hoje, cfg }) {
  if (!mes?.fim || !/^\d{4}-\d{2}-\d{2}$/.test(mes.fim)) return [{ codigo: 'mes_invalido', texto: 'Mês da virada inválido.' }]
  if (ultimoCorte && mes.fim <= ultimoCorte) {
    return [{ codigo: 'mes_ja_fechado', texto: `O período até ${dataBR(mes.fim)} já foi fechado (último fechamento em ${dataBR(ultimoCorte)}).` }]
  }
  if (mes.fim >= hoje) {
    return [{ codigo: 'mes_nao_encerrado', texto: `O mês que termina em ${dataBR(mes.fim)} ainda não acabou. A virada fica disponível a partir de ${dataBR(somarDias(mes.fim, 1))}.` }]
  }
  const pend = mesesPendentes({ ultimoCorte, hoje, cfg })
  const primeiro = pend[0]
  if (!primeiro) return [{ codigo: 'mes_ja_fechado', texto: 'Não há virada pendente.' }]
  if (primeiro.fim !== mes.fim || (mes.inicio && primeiro.inicio !== mes.inicio)) {
    return [{ codigo: 'mes_anterior_aberto', texto: `Feche antes o mês ${rotuloMes(primeiro)}: as viradas são feitas uma por vez, em ordem.` }]
  }
  return []
}

// Registros que a virada grava (snapshot do mês fechado + período novo por função).
// `novoId` gera os ids (o servidor passa crypto.randomUUID).
export function registrosDaVirada({ previa, viradaId, novoId }) {
  const fim = previa.mes.fim
  const abre = somarDias(fim, 1)
  const snapshots = []
  const periodos = []
  for (const l of previa.linhas) {
    snapshots.push({
      id: novoId(),
      virada_id: viradaId,
      periodo_id: l.periodoId ?? 'legacy',
      data_inicio: l.inicio,
      data_fim: fim,
      function_id: l.functionId,
      function_name: l.nome,
      saldo_inicial: l.saldoInicial,
      entradas: l.entradas,
      saidas: l.saidas,
      ajuste: l.ajuste,
      rendimentos: l.rendimentos,
      saldo: l.saldoFinal,
      saldo_atualizado: l.saldoFinal,
    })
    periodos.push({ id: novoId(), virada_id: viradaId, function_id: l.functionId, data_inicio: abre, saldo_inicial: l.saldoFinal })
  }
  return { snapshots, periodos }
}

// Resumo guardado com a virada (por conta: soma, saldo da conta, diferença, rendimentos do mês e
// diferença sem explicação) — o registro da diferença por conta e mês.
export function resumoDaVirada(previa) {
  return {
    mes: previa.mes,
    totais: previa.totais,
    contas: previa.contas.map(c => ({
      accountId: c.accountId, nome: c.nome, somaFuncoes: c.somaFuncoes, saldoConta: c.saldoConta,
      diferenca: c.diferenca, diferencaAnterior: c.diferencaAnterior, rendimentosMes: c.rendimentosMes,
      explicadoNoMes: c.explicadoNoMes, semExplicacao: c.semExplicacao,
    })),
    avisos: previa.avisos.map(a => a.codigo),
  }
}

// Leitura de snapshot (antigos têm rendimentos NULL e o ajuste somado com os rendimentos).
export function lerSnapshot(s) {
  const temRend = s.rendimentos !== null && s.rendimentos !== undefined
  return {
    ...s,
    saldo_inicial: Number(s.saldo_inicial) || 0,
    entradas: Number(s.entradas) || 0,
    saidas: Number(s.saidas) || 0,
    ajuste: Number(s.ajuste) || 0,
    rendimentos: temRend ? Number(s.rendimentos) || 0 : null,
    ajusteIncluiRendimentos: !temRend,
    saldo: Number(s.saldo) || 0,
  }
}

const CAMPOS_SNAPSHOT = [
  ['saldo_inicial', 'saldoInicial'], ['entradas', 'entradas'], ['saidas', 'saidas'],
  ['ajuste', 'ajuste'], ['rendimentos', 'rendimentos'], ['saldo', 'saldoFinal'],
]

// Recalcula as viradas ASSISTIDAS já feitas (em ordem) com os dados atuais. Devolve as mudanças —
// snapshots e períodos que precisam ser regravados — sem criar registro novo. A virada antiga (sem
// virada_id, anterior à assistida) não é recalculada: o saldo inicial dela foi definido à mão.
// `viradas` = reserve_viradas ativas; snapshots/periods com virada_id.
export function recalcularViradas({ viradas = [], snapshots = [], periods = [], functions = [], adjustments = [], transactions = [] }) {
  const ordem = [...viradas].sort((a, b) => dia(a.data_corte).localeCompare(dia(b.data_corte)))
  const pers = (periods || []).map(p => ({ ...p, data_inicio: dia(p.data_inicio) }))
  const mudancas = []
  for (const v of ordem) {
    const fim = dia(v.data_corte)
    const idx = indexarReserva({ periods: pers, adjustments, transactions })
    const fnById = new Map(functions.map(f => [f.id, f]))
    for (const snap of snapshots.filter(s => s.virada_id === v.id)) {
      const fn = fnById.get(snap.function_id)
      if (!fn) continue
      const s = saldoDaFuncao(fn, fim, idx)
      const novo = { saldoInicial: s.saldoInicial, entradas: s.entradas, saidas: s.saidas, ajuste: s.ajuste, rendimentos: s.rendimentos, saldoFinal: s.saldo }
      for (const [col, chave] of CAMPOS_SNAPSHOT) {
        const antes = Number(snap[col]) || 0
        if (Math.abs(antes - novo[chave]) > TOLERANCIA) {
          mudancas.push({ tabela: 'reserve_period_snapshots', id: snap.id, viradaId: v.id, dataCorte: fim, functionId: fn.id, campo: col, antes, depois: novo[chave] })
        }
      }
      if (Math.abs((Number(snap.saldo_atualizado) || 0) - novo.saldoFinal) > TOLERANCIA) {
        mudancas.push({ tabela: 'reserve_period_snapshots', id: snap.id, viradaId: v.id, dataCorte: fim, functionId: fn.id, campo: 'saldo_atualizado', antes: Number(snap.saldo_atualizado) || 0, depois: novo.saldoFinal })
      }
      const per = pers.find(p => p.virada_id === v.id && p.function_id === fn.id)
      if (per && Math.abs((Number(per.saldo_inicial) || 0) - novo.saldoFinal) > TOLERANCIA) {
        mudancas.push({ tabela: 'reserve_periods', id: per.id, viradaId: v.id, dataCorte: fim, functionId: fn.id, campo: 'saldo_inicial', antes: Number(per.saldo_inicial) || 0, depois: novo.saldoFinal })
        per.saldo_inicial = novo.saldoFinal  // as viradas seguintes partem do valor corrigido
      }
    }
  }
  return mudancas
}

// Histórico: um grupo por fechamento (data_fim), mais recente primeiro. Rótulo de início = a menor
// data REAL do grupo: função sem período anterior acumula "desde o começo" (data_inicio 0001-01-01,
// valor correto no snapshot), mas não pode transformar o mês inteiro em "(início)". Só um fechamento
// em que nenhuma função tinha período (o primeiro de todos) fica como "(início)".
export function agruparFechamentos(snapshots) {
  const porFim = {}
  for (const s of snapshots || []) (porFim[s.data_fim] = porFim[s.data_fim] || []).push(lerSnapshot(s))
  return Object.entries(porFim)
    .map(([dataFim, snaps]) => {
      const reais = snaps.map(s => dia(s.data_inicio)).filter(d => d && d !== '0001-01-01').sort()
      return {
        dataFim,
        dataInicio: reais[0] || '0001-01-01',
        antigo: snaps.some(s => s.ajusteIncluiRendimentos),
        snaps: [...snaps].sort((a, b) => (a.function_name || '').localeCompare(b.function_name || '', 'pt-BR')),
      }
    })
    .sort((a, b) => b.dataFim.localeCompare(a.dataFim))
}
