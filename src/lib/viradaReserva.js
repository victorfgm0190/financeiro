// ── Virada de saldo das reservas — motor puro ───────────────────────────────────────────────────
// O mesmo código monta a prévia na tela e grava/confere no servidor (api/_viradaReservaServidor.js).
//
// Regras:
//   • A virada fecha UM mês financeiro (mesFinanceiro.js) por vez, em ordem cronológica.
//   • Saldo Final de cada função = fórmula única (saldoReserva.js) com tudo até o último dia do mês;
//     nada posterior ao corte entra. Ele vira o Saldo Inicial do período que abre no dia seguinte.
//   • Rendimento REAL (receita sem função na conta de reserva) ainda sem rateio é rateado na virada,
//     só entre funções positivas (rendimentoReserva.js). Nenhuma positiva: fica "a distribuir".
//   • Diferença entre a soma das funções e o saldo da conta sem explicação por rendimento: a virada PARA
//     e o usuário escolhe Ajuste (função e observação) ou "a distribuir". Nunca vai para Rendimentos.
//   • Gravação em período já virado exige estornar a virada (api/_guardaVirada.js): as funções daqui dizem
//     o que a gravação mexe em período fechado e se o estorno é possível.
//   • O saldo da conta no corte vem dos lançamentos gravados (saldos.js) — nunca do "Saldo Real"
//     digitado no navegador.

import { indexarReserva, saldoDaFuncao, reserveMovOf, round2, somaSaldos, ehAjusteDeRendimento } from './saldoReserva.js'
import { saldosDaConta, efeitoNaConta } from './saldos.js'
import { computeOccurrences } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { mesesPendentes, mesFinanceiroDe, somarDias, dataBR, rotuloMes } from './mesFinanceiro.js'
import { rateioDoRendimento, inicioMaisRecente, dataFechadaNaFuncao } from './rendimentoReserva.js'

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

// Rateios que a virada do mês grava: rendimentos reais do mês ainda sem rateio, em ordem de data.
export function rateiosDaVirada({ mes, functions = [], periods = [], adjustments = [], transactions = [] }) {
  const contas = new Set(functions.map(f => f.accountId).filter(Boolean))
  const jaRateados = new Set(adjustments.filter(ehAjusteDeRendimento).map(a => a.lancamento_id))
  const novos = []
  const rendimentos = transactions
    .filter(t => t.type === 'income' && !t.reservaFuncaoId && !t.reservaAuto && contas.has(t.accountId)
      && t.date >= mes.inicio && t.date <= mes.fim && !jaRateados.has(t.id))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
  for (const tx of rendimentos) {
    novos.push(...rateioDoRendimento(tx, { functions, periods, adjustments: [...adjustments, ...novos], transactions }))
  }
  return novos
}

// A diferença `x` (já sem o que tem caminho próprio) em relação ao que o usuário aceitou deixar "a
// distribuir" na virada anterior: o que couber no aceito não para de novo; o que passar, para.
function restoSemDecisao(x, aceito) {
  if (Math.abs(x) <= TOLERANCIA) return 0
  const mesmoSinal = Math.sign(x) === Math.sign(aceito)
  if (mesmoSinal && Math.abs(x) <= Math.abs(aceito) + TOLERANCIA) return 0
  return round2(mesmoSinal ? x - aceito : x)
}

// Prévia de UM mês: por conta e função, avisos, o que a diferença de cada conta explica e totais.
// `mes` = { inicio, fim }. Funções sem conta aparecem à parte. `aceitos`: { [conta]: valor } deixado "a
// distribuir" na virada anterior.
export function montarPrevia({ mes, functions = [], periods = [], adjustments: gravados = [], transactions = [], accounts = [], schedules = [], aceitos = {} }) {
  const rateios = rateiosDaVirada({ mes, functions, periods, adjustments: gravados, transactions })
  const adjustments = rateios.length ? [...gravados, ...rateios] : gravados
  const fnDoRateio = new Map(functions.map(f => [f.id, f.accountId]))
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
    // O que a diferença tem de explicado por caminho próprio; o `resto` é o que faz a virada parar.
    const rendimentoARatear = round2(rateios.filter(a => fnDoRateio.get(a.function_id) === accId).reduce((s, a) => s + (Number(a.valor) || 0), 0))
    const rendimentoSemBase = round2(soltos.filter(s => s.tipo === 'receita_sem_rateio').reduce((s, x) => s + x.valor, 0))
    const lancamentosSemFuncao = round2(soltos.filter(s => s.tipo === 'sem_funcao').reduce((s, x) => s + x.valor, 0))
    const aceitoAntes = round2(aceitos[accId])
    const semCaminho = diferenca == null ? 0 : round2(diferenca - rendimentoSemBase)
    const resto = restoSemDecisao(semCaminho, aceitoAntes)
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
      rendimentoARatear,
      rendimentoSemBase,
      lancamentosSemFuncao,
      aceitoAntes,
      resto,
      aDistribuir: diferenca == null ? 0 : round2(diferenca),
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
  if (semRateio.length) avisos.push({ codigo: 'receita_sem_rateio', itens: semRateio, texto: `${semRateio.length} rendimento(s) sem função com saldo positivo para receber: o valor fica a distribuir.` })
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
    rateios,
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
//   mes_anterior_aberto → há mês anterior pendente (fecha um por vez, em ordem);
//   antes_do_inicio     → ambiente sem virada: mês anterior ao mês em que a 1ª função foi criada.
// `inicioUso` = data de criação da primeira função de reserva (só vale enquanto não houver virada).
export function bloqueiosDeData({ mes, ultimoCorte, hoje, cfg, inicioUso = null }) {
  if (!mes?.fim || !/^\d{4}-\d{2}-\d{2}$/.test(mes.fim)) return [{ codigo: 'mes_invalido', texto: 'Mês da virada inválido.' }]
  if (ultimoCorte && mes.fim <= ultimoCorte) {
    return [{ codigo: 'mes_ja_fechado', texto: `O período até ${dataBR(mes.fim)} já foi fechado (último fechamento em ${dataBR(ultimoCorte)}).` }]
  }
  if (!ultimoCorte && inicioUso && mes.fim < mesFinanceiroDe(inicioUso, cfg).inicio) {
    return [{ codigo: 'antes_do_inicio', texto: `As reservas começaram a ser usadas em ${dataBR(inicioUso)}: não há virada para meses anteriores a ${rotuloMes(mesFinanceiroDe(inicioUso, cfg))}.` }]
  }
  if (mes.fim >= hoje) {
    return [{ codigo: 'mes_nao_encerrado', texto: `O mês que termina em ${dataBR(mes.fim)} ainda não acabou. A virada fica disponível a partir de ${dataBR(somarDias(mes.fim, 1))}.` }]
  }
  const pend = mesesPendentes({ ultimoCorte, hoje, cfg, inicioUso })
  const primeiro = pend[0]
  if (!primeiro) return [{ codigo: 'mes_ja_fechado', texto: 'Não há virada pendente.' }]
  if (primeiro.fim !== mes.fim || (mes.inicio && primeiro.inicio !== mes.inicio)) {
    return [{ codigo: 'mes_anterior_aberto', texto: `Feche antes o mês ${rotuloMes(primeiro)}: as viradas são feitas uma por vez, em ordem.` }]
  }
  return []
}

// Decisões da virada para as contas com diferença não explicada. Sem decisão válida para alguma conta,
// `faltam` traz a conta e a virada não pode ser gravada. decisoes: { [conta]: { tipo: 'a_distribuir' } |
// { tipo: 'ajuste', functionId, observacao } }. O ajuste nunca tem lancamento_id: não vai para Rendimentos.
export function conferirDecisoes(previa, decisoes) {
  const faltam = []
  const ajustes = []
  for (const c of previa.contas) {
    if (Math.abs(c.resto) <= TOLERANCIA) continue
    const d = decisoes?.[c.accountId]
    if (d?.tipo === 'a_distribuir') continue
    const obs = String(d?.observacao || '').trim()
    if (d?.tipo === 'ajuste' && obs && c.funcoes.some(f => f.functionId === d.functionId)) {
      ajustes.push({ accountId: c.accountId, function_id: d.functionId, valor: c.resto, observacao: obs })
      continue
    }
    faltam.push({ accountId: c.accountId, nome: c.nome, resto: c.resto })
  }
  return { faltam, ajustes }
}

// ── Lançamento em período já fechado ────────────────────────────────────────────────────────────
// Efeito do lançamento nas reservas, por função (ou só na conta, sem função).
function efeitosDoLancamento(tx, fnById, contasReserva) {
  if (!tx || tx.reservaAuto || !tx.date) return []
  const out = []
  const fn = tx.reservaFuncaoId ? fnById.get(tx.reservaFuncaoId) : null
  let contaDaFuncao = null
  if (fn?.accountId) {
    const m = reserveMovOf(tx, fn.accountId)
    if (m.entrada || m.saida) {
      out.push({ function_id: fn.id, account_id: fn.accountId, entrada: m.entrada, saida: m.saida })
      contaDaFuncao = fn.accountId
    }
  }
  for (const acc of contasReserva) {
    if (acc === contaDaFuncao) continue
    const e = efeitoNaConta(tx, acc)
    if (e) out.push({ function_id: null, account_id: acc, entrada: Math.max(e, 0), saida: Math.max(-e, 0) })
  }
  return out
}

// O que uma mudança num lançamento mexe em período fechado: o efeito depois − o de antes, por função e
// conta. Só a diferença: reenviar a mesma linha não gera nada; editar só a categoria também não.
// `corte` = último dia fechado do ambiente; cada função fecha antes do início do período mais recente.
export function efeitoEmPeriodoFechado({ antes = null, depois = null, functions = [], periods = [], corte = null }) {
  const fnById = new Map(functions.map(f => [f.id, f]))
  const contasReserva = [...new Set(functions.map(f => f.accountId).filter(Boolean))]
  const fechado = (ef, data) => {
    if (ef.function_id) {
      const inicio = inicioMaisRecente(periods, ef.function_id)
      return !!inicio && data < inicio
    }
    return !!corte && data <= corte
  }
  const somar = (mapa, tx, sinal) => {
    for (const ef of efeitosDoLancamento(tx, fnById, contasReserva)) {
      if (!fechado(ef, tx.date)) continue
      const chave = `${ef.function_id || ''}|${ef.account_id}`
      const atual = mapa.get(chave) || { function_id: ef.function_id, account_id: ef.account_id, entrada: 0, saida: 0 }
      atual.entrada = round2(atual.entrada + sinal * ef.entrada)
      atual.saida = round2(atual.saida + sinal * ef.saida)
      mapa.set(chave, atual)
    }
  }
  const mapa = new Map()
  somar(mapa, antes, -1)
  somar(mapa, depois, 1)
  const base = depois || antes
  const motivo = !antes ? 'novo' : !depois ? 'excluido' : 'editado'
  return [...mapa.values()]
    .map(p => ({ ...p, valor: round2(p.entrada - p.saida) }))
    .filter(p => Math.abs(p.entrada) > TOLERANCIA || Math.abs(p.saida) > TOLERANCIA)
    .map(p => ({ ...p, lancamento_id: base?.id, data: base?.date, descricao: base?.description || '', motivo }))
}

// Estornar só pode desfazer do fechamento mais recente para trás, até o mês da data, e só se todos esses
// fechamentos forem da virada assistida e o saldo inicial da função não tiver sido informado depois.
export function reabertura(p, { viradas = [], snapshots = [], periods = [] }) {
  const data = dia(p.data)
  const cortes = [...new Set(snapshots.map(s => dia(s.data_fim)).filter(Boolean))].filter(c => c >= data).sort().reverse()
  const assistidas = new Set(viradas.map(v => dia(v.data_corte)))
  const antigo = cortes.find(c => !assistidas.has(c))
  if (antigo) return { pode: false, cortes: [], motivo: `O fechamento de ${dataBR(antigo)} foi feito antes da virada assistida e não pode ser desfeito.` }
  const fixo = p.function_id
    ? periods.find(x => x.function_id === p.function_id && !x.virada_id && dia(x.data_inicio) > data)
    : null
  if (fixo) return { pode: false, cortes: [], motivo: `A data é anterior ao saldo inicial informado em ${dataBR(dia(fixo.data_inicio))}: não há virada para estornar.` }
  if (!cortes.length) return { pode: false, cortes: [], motivo: 'Não há virada para estornar nesta data.' }
  return { pode: true, cortes, motivo: null }
}

// Lista agrupada por conta e mês (importação e sincronização podem trazer muitos de uma vez).
export function agruparItensVirada(itens) {
  const grupos = new Map()
  for (const p of [...(itens || [])].sort((a, b) => dia(a.data).localeCompare(dia(b.data)))) {
    const mes = dia(p.data).slice(0, 7)
    const chave = `${p.account_id || ''}|${mes}`
    if (!grupos.has(chave)) grupos.set(chave, { chave, accountId: p.account_id || null, mes, itens: [], total: 0 })
    const g = grupos.get(chave)
    g.itens.push(p)
    g.total = round2(g.total + (Number(p.valor) || 0))
  }
  return [...grupos.values()]
}

// Compara duas fotos do que está em período fechado (fotoDoFechado, no servidor) e diz o que a gravação
// mexeu lá. antes/depois: { lancamentos, ajustes, periodos, funcoes } em Map por id, com as linhas já no
// formato do motor. ctx: { functions, periods, corte }.
export function diferencasNoFechado(antes, depois, { functions = [], periods = [], corte = null }) {
  const itens = []
  const ids = (a, b) => new Set([...a.keys(), ...b.keys()])
  for (const id of ids(antes.lancamentos, depois.lancamentos)) {
    itens.push(...efeitoEmPeriodoFechado({ antes: antes.lancamentos.get(id) || null, depois: depois.lancamentos.get(id) || null, functions, periods, corte }))
  }
  const fnById = new Map(functions.map(f => [f.id, f]))
  const ajusteFechado = (a) => !!a && (dataFechadaNaFuncao(periods, a.function_id, a.data) || (!!corte && dia(a.data) <= corte))
  for (const id of ids(antes.ajustes, depois.ajustes)) {
    const a = antes.ajustes.get(id) || null
    const d = depois.ajustes.get(id) || null
    const vA = ajusteFechado(a) ? Number(a.valor) || 0 : 0
    const vD = ajusteFechado(d) ? Number(d.valor) || 0 : 0
    const mudouLugar = ajusteFechado(a) && ajusteFechado(d) && (dia(a.data) !== dia(d.data) || a.function_id !== d.function_id)
    if (Math.abs(vD - vA) <= TOLERANCIA && !mudouLugar) continue
    const r = d || a
    itens.push({ function_id: r.function_id, account_id: fnById.get(r.function_id)?.accountId || null, data: dia(r.data), valor: round2(vD - vA), descricao: r.observacao || 'Ajuste', tipo: 'ajuste' })
  }
  const periodoFechado = (p) => !!p && !!corte && dia(p.data_inicio) <= corte
  for (const id of ids(antes.periodos, depois.periodos)) {
    const a = antes.periodos.get(id) || null
    const d = depois.periodos.get(id) || null
    if (!periodoFechado(a) && !periodoFechado(d)) continue
    if (a && d && dia(a.data_inicio) === dia(d.data_inicio) && Math.abs(Number(a.saldo_inicial) - Number(d.saldo_inicial)) <= TOLERANCIA) continue
    const r = d || a
    itens.push({ function_id: r.function_id, account_id: fnById.get(r.function_id)?.accountId || null, data: dia(r.data_inicio), valor: round2((Number(d?.saldo_inicial) || 0) - (Number(a?.saldo_inicial) || 0)), descricao: 'Saldo inicial', tipo: 'saldo_inicial' })
  }
  // Saldo inicial na ficha da função vale antes do primeiro período: mexe em tudo o que já fechou.
  for (const [id, a] of antes.funcoes) {
    const d = depois.funcoes.get(id)
    if (!d || Math.abs((Number(a.saldoInicial) || 0) - (Number(d.saldoInicial) || 0)) <= TOLERANCIA) continue
    if (!inicioMaisRecente(periods, id)) continue
    itens.push({ function_id: id, account_id: d.accountId || null, data: '0001-01-01', valor: round2((Number(d.saldoInicial) || 0) - (Number(a.saldoInicial) || 0)), descricao: `Saldo inicial de ${d.name || 'função'}`, tipo: 'saldo_inicial' })
  }
  return itens
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
      explicadoNoMes: c.explicadoNoMes, semExplicacao: c.semExplicacao, aDistribuir: c.aDistribuir,
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
