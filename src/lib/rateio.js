// Rateio por categorias — UM lançamento (uma movimentação, um valor total) dividido em linhas
// { categoriaId, valor, descricao }. Tabela lancamento_rateios (lancamento_id guarda o id de
// lançamento OU de agendamento). O saldo da conta e a fatura usam sempre o TOTAL; relatórios,
// totais por categoria e filtros usam as linhas. Lançamento sem rateio = como sempre. PURO.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Reescala as linhas para um novo total, mantendo as proporções (o último leva os centavos).
export function escalarRateios(rateios, total) {
  const soma = Math.round(rateios.reduce((s, r) => s + (Number(r.valor) || 0), 0) * 100) / 100
  const alvo = Math.round((Number(total) || 0) * 100) / 100
  if (rateios.length === 0 || soma === 0 || soma === alvo) return rateios
  let acumulado = 0
  return rateios.map((r, i) => {
    const valor = i === rateios.length - 1
      ? Math.round((alvo - acumulado) * 100) / 100
      : Math.round((Number(r.valor) || 0) * alvo / soma * 100) / 100
    acumulado = Math.round((acumulado + valor) * 100) / 100
    return { ...r, valor }
  })
}
export const TOLERANCIA = 0.005

// Soma × total: { atribuido, restante, ok, motivo }. ok = cada linha com categoria e valor > 0 e a
// soma igual ao total (±0,005). Uma linha só não é rateio (vira lançamento comum).
export function validarRateio(linhas = [], total = 0) {
  const validas = linhas.filter(l => l.categoriaId && Number(l.valor) > 0)
  const atribuido = r2(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0))
  const restante = r2(Number(total) - atribuido)
  let motivo = null
  if (validas.length !== linhas.length) motivo = 'Cada linha precisa de categoria e valor.'
  else if (Math.abs(restante) > TOLERANCIA) motivo = restante > 0 ? 'Ainda há valor a distribuir.' : 'As linhas passam do total.'
  return { atribuido, restante, ok: !motivo, motivo }
}

// "Completar com o restante": a linha `idx` recebe o que falta para fechar o total.
export function completarComRestante(linhas, total, idx = linhas.length - 1) {
  const outros = r2(linhas.reduce((s, l, i) => (i === idx ? s : s + (Number(l.valor) || 0)), 0))
  return linhas.map((l, i) => (i === idx ? { ...l, valor: r2(Number(total) - outros) } : l))
}

// Linhas a gravar: com categoria e valor; uma linha só → não é rateio (devolve { comum: categoria }).
export function normalizarRateio(linhas = []) {
  const validas = linhas.filter(l => l.categoriaId && Number(l.valor) > 0)
    .map(l => ({ categoriaId: l.categoriaId, valor: r2(l.valor), descricao: (l.descricao || '').trim() }))
  if (validas.length === 1) return { linhas: [], comum: validas[0].categoriaId }
  return { linhas: validas, comum: null }
}

// Categoria "principal" gravada no lançamento rateado: a da maior linha (quem ainda lê só
// categoryId — efeitos automáticos, regras — não fica com uma categoria velha).
export const categoriaPrincipal = (linhas = []) => (linhas.length ? [...linhas].sort((a, b) => Number(b.valor) - Number(a.valor))[0].categoriaId : null)

// Linhas efetivas de um lançamento para relatórios: as do rateio limitadas ao total (soma acima do
// total é reescalada — nunca infla; soma abaixo deixa a sobra na categoria principal, legado).
// Sem rateio: uma linha com a categoria e o valor do lançamento.
export function linhasDoLancamento(tx, rateios) {
  const total = r2(tx.amount)
  if (!rateios?.length || (tx.type !== 'income' && tx.type !== 'expense')) return [{ categoriaId: tx.categoryId || null, valor: total }]
  const soma = r2(rateios.reduce((s, r) => s + (Number(r.valor) || 0), 0))
  const base = soma > total + TOLERANCIA ? escalarRateios(rateios, total) : rateios
  const out = base.map(r => ({ categoriaId: r.categoriaId, valor: r2(r.valor), descricao: r.descricao || '', ...(r.grupoGerencial ? { grupoGerencial: r.grupoGerencial } : {}) }))
  const sobra = r2(total - out.reduce((s, r) => s + r.valor, 0))
  if (sobra > TOLERANCIA) out.push({ categoriaId: tx.categoryId || null, valor: sobra, sobra: true })
  return out
}

// Parte do lançamento numa categoria (filtro por categoria): soma das linhas dela.
export const parteDaCategoria = (tx, rateios, categoriaId) => r2(linhasDoLancamento(tx, rateios)
  .filter(l => l.categoriaId === categoriaId).reduce((s, l) => s + l.valor, 0))

export const temCategoria = (tx, rateios, categoriaId) => linhasDoLancamento(tx, rateios).some(l => l.categoriaId === categoriaId)

// Rótulo para listas/exportações: "Rateado (2)" e o detalhe "Mercado R$ 100,00 + Lazer R$ 100,00".
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
export function rotuloCategoria(tx, rateios, categories = []) {
  const nome = (id) => categories.find(c => c.id === id)?.name || 'Sem categoria'
  if (!rateios?.length) return { curto: tx.categoryId ? nome(tx.categoryId) : '', detalhe: '', rateado: false }
  const linhas = linhasDoLancamento(tx, rateios)
  return {
    curto: `Rateado (${linhas.length})`,
    detalhe: linhas.map(l => `${nome(l.categoriaId)} ${brl(l.valor)}`).join(' + '),
    rateado: true,
  }
}

// Texto de uma célula de exportação: o nome da categoria ou "Rateado (2): A R$ x + B R$ y".
export function categoriaParaExportar(tx, rateios, categories = []) {
  const r = rotuloCategoria(tx, rateios, categories)
  return r.rateado ? `${r.curto}: ${r.detalhe}` : r.curto
}

// Rateio de cada parcela de uma compra parcelada: as linhas foram digitadas sobre o TOTAL da compra;
// cada parcela recebe as mesmas proporções sobre o próprio valor (antes cada parcela levava o total).
export const rateioDaParcela = (linhas, valorParcela) => escalarRateios(linhas, valorParcela)

// Baixa com valor diferente do previsto: 'proporcional' (todas as linhas na mesma proporção) ou
// 'linha' (a diferença inteira numa linha escolhida, que não pode ficar ≤ 0).
export function ajustarRateio(linhas, novoTotal, { modo = 'proporcional', idx = 0 } = {}) {
  if (!linhas?.length) return linhas
  if (modo === 'proporcional') return escalarRateios(linhas, novoTotal)
  const soma = r2(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0))
  const dif = r2(Number(novoTotal) - soma)
  const out = linhas.map((l, i) => (i === idx ? { ...l, valor: r2(Number(l.valor) + dif) } : l))
  return out[idx].valor > 0 ? out : escalarRateios(linhas, novoTotal)
}

// Linha do Fluxo de Caixa (lib/fluxoCaixa): lançamento real (`_key` = id) ou ocorrência projetada
// (`_scheduleId`) — o rateio é do lançamento ou do agendamento. → rótulo da categoria.
export function rotuloCategoriaFluxo(r, rateiosPorId, categories = []) {
  const rateios = rateiosPorId?.get(r.real ? r._key : r._scheduleId)
  const tx = { type: r.entrada > 0 ? 'income' : 'expense', amount: r.entrada > 0 ? r.entrada : r.saida, categoryId: r.categoryId }
  const rot = rotuloCategoria(tx, rateios, categories)
  return rot.rateado ? `${rot.curto}: ${rot.detalhe}` : rot.curto
}

// ── Rateio de agendamento por OCORRÊNCIA ("Só esta"): overrides[data].rateio; senão o da série. ──
const linhasDe = (lista) => (lista || []).map(r => ({ categoriaId: r.categoriaId, valor: Number(r.valor) || 0, descricao: r.descricao || '' }))
export function rateioDaOcorrencia(schedule, data, rateiosDaSerie = []) {
  const ov = data ? schedule?.overrides?.[String(data).slice(0, 10)] : null
  if (ov && Array.isArray(ov.rateio)) return linhasDe(ov.rateio)
  return linhasDe(rateiosDaSerie)
}

// Linhas que um lançamento AUTOMÁTICO (espelho de empréstimo, aporte automático) deve olhar: as do
// rateio informado junto com o lançamento (tx._rateio) ou a categoria do lançamento inteira.
export const linhasParaAutomaticos = (tx) => linhasDoLancamento(
  { type: tx.type, amount: Number(tx.amount) || 0, categoryId: tx.categoryId }, tx._rateio?.length ? tx._rateio : null)

// Quanto do lançamento cai num conjunto de categorias (envelope): a soma das linhas dessas categorias.
export function valorNasCategorias(tx, rateios, categoryIds = []) {
  const set = new Set(categoryIds || [])
  return r2(linhasDoLancamento(tx, rateios).filter(l => set.has(l.categoriaId)).reduce((s, l) => s + l.valor, 0))
}

// Varredura: lançamentos criados/ligados por BAIXA de agendamento rateado (meta lancamento_id ou
// scheduleId + data da ocorrência) que ficaram SEM rateio. → [{ tx, schedule, data, linhas }] com as
// linhas já ajustadas ao valor do lançamento (proporcional). Não altera nada.
export function baixasSemRateio({ schedules = [], transactions = [], rateiosPorId = new Map() }) {
  const txById = new Map(transactions.map(t => [t.id, t]))
  const out = []
  const vistos = new Set()
  for (const s of schedules) {
    const daSerie = rateiosPorId.get(s.id) || []
    for (const [data, meta] of Object.entries(s.registeredMeta || {})) {
      const tx = meta?.lancamento_id ? txById.get(meta.lancamento_id) : null
      if (!tx || vistos.has(tx.id) || (tx.type !== 'expense' && tx.type !== 'income')) continue
      if ((rateiosPorId.get(tx.id) || []).length) continue
      const base = rateioDaOcorrencia(s, data, daSerie)
      if (base.length < 2) continue
      vistos.add(tx.id)
      out.push({ tx, schedule: s, data, linhas: ajustarRateio(base, Number(tx.amount) || 0, { modo: 'proporcional' }) })
    }
  }
  return out.sort((a, b) => String(b.tx.date).localeCompare(String(a.tx.date)))
}

// Rateio que o lançamento `tx` herda ao baixar a ocorrência `data` do agendamento `schedule`
// (importação, conciliação, vínculo, já no cartão…). [] quando não herda: o lançamento já tem rateio
// próprio (manual, Assistente, linha da importação), é transferência, ou o agendamento não é rateado.
export function rateioHerdado({ tx, schedule, data, rateiosPorId = new Map() }) {
  if (!tx || !schedule || (tx.type !== 'expense' && tx.type !== 'income')) return []
  // Parcela de financiamento: o endpoint já desdobrou em dois lançamentos (principal e juros), cada
  // um na sua categoria. Herdar o rateio do agendamento dividiria o principal de novo entre os dois.
  if (tx.origin === 'pagamento_divida') return []
  if ((rateiosPorId.get(tx.id) || []).length) return []
  const base = rateioDaOcorrencia(schedule, data, rateiosPorId.get(schedule.id) || [])
  if (base.length < 2) return []
  return ajustarRateio(base, Number(tx.amount) || 0, { modo: 'proporcional' })
}

// Quanto de um lançamento desconta de um ENVELOPE: sem rateio, o valor inteiro se a categoria é do
// envelope (exatamente a regra de antes); com rateio, só as linhas das categorias do envelope.
// Usado pelos quatro cálculos de saldo/projeção e pela tela Envelopes.
export function parteDoEnvelope(tx, rateios, categoryIds) {
  const linhas = rateios?.get?.(tx.id)
  if (!linhas?.length) return categoryIds?.includes(tx.categoryId) ? tx.amount : 0
  return valorNasCategorias(tx, linhas, categoryIds)
}

// Quanto do lançamento vai para cada GRUPO GERENCIAL: linha com grupo próprio → o dela; sem → o do
// lançamento. Sem rateio (ou nenhuma linha com grupo), o lançamento inteiro no grupo dele — o de hoje.
//   → Map(grupoId → valor). Lançamento sem grupo e linha sem grupo não entram.
export function partesPorGrupo(tx, rateios) {
  const m = new Map()
  const soma = (g, v) => { if (g && v) m.set(g, r2((m.get(g) || 0) + v)) }
  if (!rateios?.some?.(r => r.grupoGerencial)) { soma(tx.grupoGerencial, r2(tx.amount)); return m }
  for (const l of linhasDoLancamento(tx, rateios)) soma(l.grupoGerencial || tx.grupoGerencial, l.valor)
  return m
}

// Situação do rateio frente ao total do lançamento → { estado: 'ok' | 'falta' | 'passa', diferenca }
// (diferenca sempre ≥ 0). Usada no campo Categoria ("Rateado (1) · faltam R$ 50,00") e no modal.
export function situacaoRateio(total, soma) {
  const d = r2((Number(total) || 0) - (Number(soma) || 0))
  if (Math.abs(d) <= TOLERANCIA) return { estado: 'ok', diferenca: 0 }
  return d > 0 ? { estado: 'falta', diferenca: d } : { estado: 'passa', diferenca: -d }
}
// Classe de texto de cada estado: verde da marca (fecha), âmbar (falta), vermelho (passa). Sempre
// acompanhada de texto/ícone — cor sozinha nunca é a informação (acessibilidade, ver index.css).
export const COR_SITUACAO_RATEIO = { ok: 'text-primary-fg', falta: 'text-aviso', passa: 'text-perigo' }
