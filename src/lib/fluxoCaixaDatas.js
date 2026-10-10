// Datas PROVISÓRIAS no relatório Fluxo de Caixa: simulação de tela (nada é gravado) e o
// "Aplicar no agendamento", que grava a data num agendamento real.

const round2 = n => Math.round(n * 100) / 100

// Linhas da tela a partir das linhas de computeFluxoCaixa, aplicando as datas provisórias
// (Map _key → 'YYYY-MM-DD') e as linhas desmarcadas (Set de _key).
//  • A linha com data provisória passa a ser ordenada e acumulada pela data nova.
//  • Data nova FORA de [start, end] → a linha sai da tela e do cálculo e vai para `foraDoPeriodo`
//    (para o aviso do cabeçalho permitir restaurar).
//  • Registrada (`real`) nunca recebe data provisória nem sai do cálculo.
// O acumulador parte de `saldoBase` (saldo anterior c/ agendamentos, como na lib).
export function montarLinhasSimuladas(rows, { datas = new Map(), excluidas = new Set(), start, end, saldoBase = 0 }) {
  const noPeriodo = []
  const foraDoPeriodo = []
  rows.forEach((r, ordem) => {
    const nova = !r.real ? datas.get(r._key) : undefined
    const linha = nova && nova !== r.date
      ? { ...r, date: nova, _dataOriginal: r.date, _ordem: ordem }
      : { ...r, _ordem: ordem }
    if (linha._dataOriginal && (linha.date < start || linha.date > end)) foraDoPeriodo.push(linha)
    else noPeriodo.push(linha)
  })
  // Mesmo critério da lib (data; Registrada antes das projeções no mesmo dia) e, no empate, a
  // ordem original — sem data provisória a tela fica idêntica à de antes.
  noPeriodo.sort((a, b) =>
    a.date.localeCompare(b.date) || (a.real === b.real ? 0 : a.real ? -1 : 1) || a._ordem - b._ordem)

  let bal = saldoBase
  let entrada = 0
  let saida = 0
  const rowsView = noPeriodo.map(r => {
    const ativa = r.real || !excluidas.has(r._key)
    if (!ativa) return { ...r, ativa, saldo: null }
    entrada = round2(entrada + r.entrada)
    saida = round2(saida + r.saida)
    bal = round2(bal + r.entrada - r.saida)
    return { ...r, ativa, saldo: bal }
  })
  return { rowsView, foraDoPeriodo, totalEntrada: entrada, totalSaida: saida, saldoFinal: bal }
}

// Agendamentos que o motor de faturas (reconcileFaturaState / recalcularAgendamentosFatura)
// gera e regera: mudar a data deles por fora seria desfeito ou brigaria com o motor.
export function agendamentoGeridoPeloMotor(s) {
  if (!s) return false
  if (String(s.id || '').startsWith('fsch_')) return true
  if (s.tipo === 'pagamento_fatura' || s.tipo === 'gerencial_devolucao') return true
  if (s.tipo === 'resgate_reserva' && (s.cardId || s.overrides?._gerencial?.cardId)) return true
  if (s.overrides?._gerencialKey) return true
  return false
}

const ehChaveData = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k)

// 'YYYY-MM-DD' → 'dd/mm/aaaa' (direto da string, sem Date/fuso).
const ddmmaaaa = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

// Remove a exceção de DATA da ocorrência `orig` em `overrides`, preservando a de valor (que
// passa para a chave `novaChave`, quando informada). Devolve um objeto novo.
function moverExcecao(overrides, orig, novaChave) {
  const ov = { ...(overrides || {}) }
  const atual = ov[orig]
  delete ov[orig]
  if (atual && typeof atual === 'object') {
    // eslint-disable-next-line no-unused-vars
    const { date: _d, ...resto } = atual
    if (Object.keys(resto).length > 0) ov[novaChave || orig] = resto
  }
  return ov
}

// Diagnóstico de "Aplicar no agendamento" para a ocorrência `orig` (data ORIGINAL, a chave da
// ocorrência) movida para `nova`. `primeiraPendente` = primeira ocorrência pendente da série.
// Devolve { bloqueio } quando não pode aplicar, senão as opções possíveis e os avisos.
export function opcoesAplicarData(s, orig, nova, primeiraPendente) {
  if (agendamentoGeridoPeloMotor(s)) {
    return { bloqueio: 'Agendamento de fatura de cartão / gerencial: a data é definida pelo motor de faturas (vencimento do cartão). Alterá-la aqui seria desfeito no próximo recálculo — não foi aplicada.' }
  }
  const once = (s.frequency || 'once') === 'once'
  if (once) return { once: true, serie: { ok: false }, avisos: [] }

  const feitas = [...(s.registered || []), ...(s.skipped || [])]
  const ultimaFeita = feitas.reduce((m, d) => (d > m ? d : m), '')
  let serie = { ok: true }
  if (orig !== primeiraPendente) {
    // As ocorrências pendentes anteriores são compromissos reais: mover a âncora da série para cá
    // as faria sumir do fluxo. Fica desabilitado; o texto orienta o caminho certo.
    serie = { ok: false, motivo: `Para mover só esta data, use 'Só esta ocorrência'. Para mover a série, aplique a partir da primeira ocorrência pendente (${ddmmaaaa(primeiraPendente)}).` }
  } else if (ultimaFeita && nova <= ultimaFeita) {
    serie = { ok: false, motivo: `A nova data não pode ser igual ou anterior a uma ocorrência já registrada/pulada (${ultimaFeita}).` }
  }
  const avisos = []
  if (serie.ok) {
    const excecoes = Object.keys(s.overrides || {}).filter(k => ehChaveData(k) && k > orig)
    if (excecoes.length > 0) {
      avisos.push(`A série tem ${excecoes.length} exceção(ões) em ocorrências seguintes (${excecoes.join(', ')}). Elas são guardadas pela data original e deixam de casar com a série movida.`)
    }
  }
  return { once: false, serie, avisos }
}

// Patch a gravar no agendamento. modo: 'unica' (agendamento "Uma vez"), 'ocorrencia' (só esta
// ocorrência de um recorrente — exceção em overrides[orig].date, mecanismo já existente e
// respeitado por occEfetiva) ou 'serie' (esta e as próximas — move startDate e nextOccurrence
// juntos: computeOccurrences ancora em nextOccurrence || startDate).
export function patchAplicarData(s, orig, nova, modo) {
  if (modo === 'unica' || modo === 'serie') {
    return {
      startDate: nova,
      nextOccurrence: nova,
      overrides: moverExcecao(s.overrides, orig, nova),
    }
  }
  // 'ocorrencia'
  const ov = { ...(s.overrides || {}) }
  const atual = (ov[orig] && typeof ov[orig] === 'object') ? ov[orig] : {}
  if (nova === orig) {
    // eslint-disable-next-line no-unused-vars
    const { date: _d, ...resto } = atual
    if (Object.keys(resto).length > 0) ov[orig] = resto
    else delete ov[orig]
  } else {
    ov[orig] = { ...atual, date: nova }
  }
  return { overrides: ov }
}

// ── Datas provisórias PERSISTIDAS (fluxo_datas_provisorias) ─────────────────────────────────
// Só o relatório Fluxo de Caixa as usa: aqui viram uma exceção de data em CÓPIAS dos
// agendamentos (overrides[dataOriginal].date), que o relatório passa ao computeFluxoCaixa. Assim a
// ocorrência entra/sai do período e do saldo anterior exatamente como uma exceção real faria,
// sem mudar a lib nem os números de quem chama com os agendamentos reais (Painel/KPIs).

export const chaveDataProvisoria = (scheduleId, dataOriginal) => `${scheduleId}|${dataOriginal}`

// Devolve { schedules (cópias com a data provisória), porChave: Map chave → registro }.
export function aplicarDatasNosAgendamentos(schedules, datas) {
  const porChave = new Map((datas || []).map(d => [chaveDataProvisoria(d.schedule_id, d.data_original), d]))
  if (porChave.size === 0) return { schedules, porChave }
  const porSchedule = new Map()
  for (const d of datas) {
    if (!porSchedule.has(d.schedule_id)) porSchedule.set(d.schedule_id, [])
    porSchedule.get(d.schedule_id).push(d)
  }
  const out = schedules.map(s => {
    const doSched = porSchedule.get(s.id)
    if (!doSched) return s
    const overrides = { ...(s.overrides || {}) }
    for (const d of doSched) {
      const atual = (overrides[d.data_original] && typeof overrides[d.data_original] === 'object') ? overrides[d.data_original] : {}
      overrides[d.data_original] = { ...atual, date: d.data_provisoria }
    }
    return { ...s, overrides }
  })
  return { schedules: out, porChave }
}

// Marca as linhas que vieram de uma data provisória persistida: _dataOriginal = data REAL da
// ocorrência (com a exceção real, se houver), _dpId / _dpDesde = registro e quando foi criado.
// Provisória igual à real não é marcada (não há o que mostrar nem restaurar).
export function anotarLinhasProvisorias(rows, porChave, realById, occEfetivaFn) {
  if (!porChave || porChave.size === 0) return rows
  return rows.map(r => {
    if (!r._scheduleId || !r._origDate) return r
    const d = porChave.get(chaveDataProvisoria(r._scheduleId, r._origDate))
    if (!d) return r
    const real = realById.get(r._scheduleId)
    const dataReal = real ? occEfetivaFn(real, r._origDate).date : r._origDate
    if (dataReal === r.date) return r
    return { ...r, _dataOriginal: dataReal, _dpId: d.id, _dpDesde: d.created_at || null }
  })
}
