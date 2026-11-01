// Vínculo manual — função central (usada pela tela e, depois, pelo Assistente). PURO.
//
// Caso 1: lançamento avulso × ocorrência PENDENTE de agendamento → a ocorrência é baixada pelo
//   MESMO mecanismo da baixa normal (aplicarBaixa: registered + next_occurrence + registered_meta
//   com lancamento_id), sem criar lançamento: o real já conta no saldo e a ocorrência sai das
//   projeções. Valor/data diferentes: `manter` decide o que fica gravado NA OCORRÊNCIA ('lancamento'
//   = os do lançamento real, padrão; 'agendamento' = os previstos). Próximas ocorrências não mudam.
//   Desvincular = desfazerBaixa + limpa a data da ocorrência no lançamento + devolve a exceção que
//   a ocorrência tinha antes (guardada no meta).
// Caso 2: lançamento avulso × parcela existente de série (cartão) → a parcela fica (numeração e
//   série intactas), recebe os campos escolhidos do avulso, as baixas que apontavam o avulso passam
//   a apontar a parcela e o avulso sai (a remoção é do chamador, com confirmação do usuário).
import { aplicarBaixa, desfazerBaixa, faturaDoLancamento } from './scheduleBaixa.js'
import { occEfetiva } from './fluxoCaixa.js'
import { similaridade } from './matchLancamento.js'
import { numeroParcelaDoTx, totalParcelasDoTx } from './revisaoImportacao.js'
import { rateioDaOcorrencia } from './rateio.js'

export const JANELA_VINCULO_DIAS = 15
export const MAX_CANDIDATOS = 20
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const dia = (d) => String(d || '').slice(0, 10)
const distDias = (a, b) => Math.abs(Math.round((new Date(`${dia(a)}T12:00:00Z`) - new Date(`${dia(b)}T12:00:00Z`)) / 86_400_000))
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const tipoDe = (x) => x?.type || x?.transactionType || 'expense'

// Lançamento → [{ scheduleId, data, meta }] das ocorrências que ele baixou (vínculo ou baixa normal).
export function mapaVinculos(schedules = []) {
  const m = new Map()
  for (const s of schedules) {
    const reg = new Set(s.registered || [])
    for (const [data, meta] of Object.entries(s.registeredMeta || {})) {
      if (!meta?.lancamento_id || !reg.has(data)) continue
      if (!m.has(meta.lancamento_id)) m.set(meta.lancamento_id, [])
      m.get(meta.lancamento_id).push({ scheduleId: s.id, data, meta, schedule: s })
    }
  }
  return m
}

// Lançamento livre para vincular: sem baixa apontando para ele, não gerado por agendamento, não sombra.
const livre = (t, vinculados) => !vinculados.has(t.id) && !t.scheduleId && !t.reservaAuto && !t.isEspelho
  && (t.type === 'expense' || t.type === 'income')

// Pontuação de semelhança (0–100): valor 40, data 30, nome 20, categoria 10. Só informativa — a
// ORDEM é a de `ordemVinculo`.
function pontuar({ valorA, valorB, dias, nomesA, nomesB, catA, catB, janela = JANELA_VINCULO_DIAS }) {
  const base = Math.max(1, Math.abs(Number(valorB) || 0) * 0.2)
  const pv = Math.max(0, 1 - Math.abs((Number(valorA) || 0) - (Number(valorB) || 0)) / base)
  const pd = dias == null ? 0 : Math.max(0, 1 - dias / janela)
  let sim = 0
  for (const a of nomesA.filter(Boolean)) for (const b of nomesB.filter(Boolean)) sim = Math.max(sim, similaridade(a, b))
  return Math.round(pv * 40 + pd * 30 + sim * 20 + (catA && catA === catB ? 10 : 0))
}
const casaBusca = (busca, ...textos) => {
  const q = norm(busca).trim()
  return !q || textos.some(t => norm(t).includes(q))
}

// ── Ordem dos candidatos (os dois sentidos e a mesclagem) ────────────────────────────────────────
// 1. mesma categoria (a do item OU de qualquer linha do rateio, dos dois lados);
// 2. valor: exato, depois aproximado (diferença até 10% do valor, mínimo R$ 1);
// 3. favorecido parecido; 4. data mais próxima; desempate leve: mesma conta.
export const TOLERANCIA_VALOR_PROXIMO = 0.1
const MIN_SIM_FAVORECIDO = 0.6
// Categorias de um item: a dele + as das linhas do rateio (lançamento: rateios[id]; ocorrência: o
// rateio da série/da ocorrência).
const categoriasDe = (categoryId, linhas = []) => new Set([categoryId, ...(linhas || []).map(l => l.categoriaId)].filter(Boolean))
const mesmaCategoria = (a, b) => [...a].some(c => b.has(c))
export function nivelValor(a, b) {
  const x = Math.abs(Number(a) || 0), y = Math.abs(Number(b) || 0)
  const dif = Math.abs(x - y)
  if (dif < 0.005) return 2
  return dif <= Math.max(1, Math.max(x, y) * TOLERANCIA_VALOR_PROXIMO) ? 1 : 0
}
function favorecidoParecido(nomesA, nomesB) {
  let sim = 0
  for (const a of nomesA.filter(Boolean)) for (const b of nomesB.filter(Boolean)) sim = Math.max(sim, similaridade(a, b))
  return sim >= MIN_SIM_FAVORECIDO
}
// → { chave: [...], motivos: ['mesma categoria', 'mesmo valor' | 'valor próximo', 'favorecido parecido'] }
function ordemVinculo({ catsA, catsB, valorA, valorB, nomesA, nomesB, dias, mesmaConta }) {
  const cat = mesmaCategoria(catsA, catsB)
  const val = nivelValor(valorA, valorB)
  const fav = favorecidoParecido(nomesA, nomesB)
  const motivos = []
  if (cat) motivos.push('mesma categoria')
  if (val === 2) motivos.push('mesmo valor')
  else if (val === 1) motivos.push('valor próximo')
  if (fav) motivos.push('favorecido parecido')
  return { chave: [cat ? 1 : 0, val, fav ? 1 : 0, -(dias ?? 9999), mesmaConta ? 1 : 0], motivos }
}
const compararOrdem = (a, b) => {
  for (let i = 0; i < a.ordem.length; i++) if (a.ordem[i] !== b.ordem[i]) return b.ordem[i] - a.ordem[i]
  return 0
}

// Ocorrências pendentes (com a 1ª futura) de um agendamento, até `limite`.
const pendentesDe = (s, getNextOccurrences, limite = 36) => (getNextOccurrences?.(s, limite) || [])

// Do LANÇAMENTO: ocorrências pendentes de agendamentos do mesmo sentido (entrada/saída), de QUALQUER
// conta (agendado na conta, pago no cartão), ±15 dias; e, se for de cartão, parcelas de séries do
// mesmo cartão (mesclagem só no mesmo cartão). Com `busca`, qualquer item que case com o texto
// (fora da janela). `rateios`: Map id → linhas (lançamentos e agendamentos). Ordem: ordemVinculo.
export function candidatosDoLancamento(tx, { schedules = [], transactions = [], getNextOccurrences, closingDay = 14, busca = '', rateios = null } = {}) {
  if (!tx) return []
  const out = []
  const tipo = tipoDe(tx)
  const nomesTx = [tx.payee, tx.description]
  const catsTx = categoriasDe(tx.categoryId, rateios?.get?.(tx.id))
  for (const s of schedules) {
    if ((s.transactionType || 'expense') !== tipo || s.transactionType === 'transfer') continue
    const mesmaConta = s.accountId === tx.accountId || s.cardId === tx.accountId
    for (const data of pendentesDe(s, getNextOccurrences)) {
      const ef = occEfetiva(s, data)
      const dias = distDias(tx.date, ef.date)
      const naJanela = dias <= JANELA_VINCULO_DIAS
      if (!naJanela && !(busca && casaBusca(busca, s.description, s.payee))) continue
      if (busca && !casaBusca(busca, s.description, s.payee)) continue
      const nomesS = [s.payee, s.description]
      const o = ordemVinculo({
        catsA: catsTx, catsB: categoriasDe(s.categoryId, rateioDaOcorrencia(s, data, rateios?.get?.(s.id) || [])),
        valorA: tx.amount, valorB: ef.amount, nomesA: nomesTx, nomesB: nomesS, dias, mesmaConta,
      })
      out.push({
        tipo: 'ocorrencia', id: `${s.id}@${data}`, scheduleId: s.id, schedule: s, data, dataEfetiva: ef.date,
        valor: r2(ef.amount), descricao: s.description, favorecido: s.payee, accountId: s.accountId,
        score: pontuar({ valorA: tx.amount, valorB: ef.amount, dias, nomesA: nomesTx, nomesB: nomesS, catA: tx.categoryId, catB: s.categoryId }),
        ordem: o.chave, motivos: o.motivos,
      })
    }
  }
  if (tx.accountType === 'credit') {
    const faturaTx = faturaDoLancamento(tx, closingDay)
    for (const p of transactions) {
      if (p.id === tx.id || p.accountId !== tx.accountId || tipoDe(p) !== tipo) continue
      const total = totalParcelasDoTx(p)
      const num = numeroParcelaDoTx(p)
      if (!(total > 1) || !num) continue
      const fatura = faturaDoLancamento(p, closingDay)
      const meses = Math.abs((Number(fatura.slice(0, 4)) * 12 + Number(fatura.slice(5, 7))) - (Number(faturaTx.slice(0, 4)) * 12 + Number(faturaTx.slice(5, 7))))
      if (meses > 1 && !(busca && casaBusca(busca, p.description, p.payee))) continue
      if (busca && !casaBusca(busca, p.description, p.payee)) continue
      const nomesP = [p.payee, p.description]
      const o = ordemVinculo({
        catsA: catsTx, catsB: categoriasDe(p.categoryId, rateios?.get?.(p.id)), valorA: tx.amount, valorB: p.amount,
        nomesA: nomesTx, nomesB: nomesP, dias: distDias(tx.date, p.date), mesmaConta: true,
      })
      out.push({
        tipo: 'parcela', id: p.id, tx: p, num, total, fatura, valor: r2(p.amount), descricao: p.description,
        favorecido: p.payee, accountId: p.accountId, data: p.date,
        score: pontuar({ valorA: tx.amount, valorB: p.amount, dias: meses * 30 / 2, nomesA: nomesTx, nomesB: nomesP, catA: tx.categoryId, catB: p.categoryId }),
        ordem: o.chave, motivos: o.motivos,
      })
    }
  }
  return out.sort((a, b) => compararOrdem(a, b) || dia(a.data).localeCompare(dia(b.data))).slice(0, MAX_CANDIDATOS)
}

// Da OCORRÊNCIA: lançamentos livres do mesmo sentido, de QUALQUER conta, ±15 dias (ou qualquer um
// com `busca`). Mesma ordem do outro sentido (ordemVinculo).
export function candidatosDaOcorrencia(schedule, data, { transactions = [], schedules = [], busca = '', rateios = null } = {}) {
  if (!schedule || !data) return []
  const vinculados = new Set(mapaVinculos(schedules).keys())
  const ef = occEfetiva(schedule, dia(data))
  const tipo = schedule.transactionType || 'expense'
  const catsS = categoriasDe(schedule.categoryId, rateioDaOcorrencia(schedule, dia(data), rateios?.get?.(schedule.id) || []))
  const nomesS = [schedule.payee, schedule.description]
  return transactions
    .filter(t => livre(t, vinculados) && tipoDe(t) === tipo)
    .map(t => ({ t, dias: distDias(t.date, ef.date) }))
    .filter(({ t, dias }) => (busca ? casaBusca(busca, t.description, t.payee) : dias <= JANELA_VINCULO_DIAS))
    .map(({ t, dias }) => {
      const nomesT = [t.payee, t.description]
      const o = ordemVinculo({
        catsA: categoriasDe(t.categoryId, rateios?.get?.(t.id)), catsB: catsS, valorA: t.amount, valorB: ef.amount,
        nomesA: nomesT, nomesB: nomesS, dias, mesmaConta: t.accountId === schedule.accountId || t.accountId === schedule.cardId,
      })
      return {
        tx: t, diferenca: r2((Number(t.amount) || 0) - (Number(ef.amount) || 0)), dias,
        score: pontuar({ valorA: t.amount, valorB: ef.amount, dias, nomesA: nomesT, nomesB: nomesS, catA: t.categoryId, catB: schedule.categoryId }),
        ordem: o.chave, motivos: o.motivos,
      }
    })
    .sort(compararOrdem)
    .slice(0, MAX_CANDIDATOS)
}

// Diferenças entre o lançamento real e o previsto da ocorrência.
export function divergenciaVinculo(tx, schedule, data) {
  const ef = occEfetiva(schedule, dia(data))
  const valor = Math.abs(r2(tx.amount) - r2(ef.amount)) > 0.004 ? { previsto: r2(ef.amount), real: r2(tx.amount) } : null
  const dt = dia(tx.date) !== dia(ef.date) ? { previsto: dia(ef.date), real: dia(tx.date) } : null
  return { valor, data: dt, diverge: !!(valor || dt) }
}

// Caso 1 → { ok, schedule, tx, historico } | { ok: false, motivo }.
export function planejarVinculo(d, { txId, scheduleId, data, manter = 'lancamento' }) {
  const tx = d.transactions.find(t => t.id === txId)
  const s = d.schedules.find(x => x.id === scheduleId)
  if (!tx || !s) return { ok: false, motivo: 'Lançamento ou agendamento não encontrado.' }
  const occ = dia(data)
  if ((s.registered || []).includes(occ)) return { ok: false, motivo: 'Essa ocorrência já está baixada.' }
  if (mapaVinculos(d.schedules).has(txId)) return { ok: false, motivo: 'Esse lançamento já está vinculado a outra ocorrência.' }
  const div = divergenciaVinculo(tx, s, occ)
  const ovAntes = s.overrides?.[occ]
  const meta = {
    tipo: 'pago', lancamento_id: tx.id, import_id: null, vinculo: 'manual',
    valor_previsto: div.valor ? div.valor.previsto : r2(tx.amount), valor_realizado: r2(tx.amount),
    override_anterior: ovAntes === undefined ? null : ovAntes,
  }
  let base = s
  if (manter === 'lancamento' && div.diverge) {
    const ov = { ...(typeof ovAntes === 'object' && ovAntes ? ovAntes : {}) }
    if (div.valor) ov.amount = r2(tx.amount)
    if (div.data) ov.date = dia(tx.date)
    base = { ...s, overrides: { ...(s.overrides || {}), [occ]: ov } }
  }
  const schedule = aplicarBaixa(base, occ, meta)
  const novoTx = { ...tx, dataOcorrencia: occ }
  const mudancas = [{ campo: 'vinculo', de: null, para: tx.id }]
  if (manter === 'lancamento' && div.valor) mudancas.push({ campo: 'amount', de: div.valor.previsto, para: div.valor.real })
  if (manter === 'lancamento' && div.data) mudancas.push({ campo: 'date', de: div.data.previsto, para: div.data.real })
  const historico = [
    { entidade: 'agendamento', id: s.id, ocorrenciaData: occ, mudancas },
    { entidade: 'lancamento', id: tx.id, mudancas: [{ campo: 'vinculo', de: null, para: `${s.id}@${occ}` }] },
  ]
  return { ok: true, schedule, tx: novoTx, historico, divergencia: div }
}

// Desvincular (caso 1) → { ok, schedule, tx, historico }.
export function planejarDesvinculo(d, { scheduleId, data }) {
  const s = d.schedules.find(x => x.id === scheduleId)
  const occ = dia(data)
  const meta = s?.registeredMeta?.[occ]
  if (!s || !meta?.lancamento_id) return { ok: false, motivo: 'Essa ocorrência não está vinculada a um lançamento.' }
  let schedule = desfazerBaixa(s, occ)
  if (meta.vinculo === 'manual') {
    const overrides = { ...(schedule.overrides || {}) }
    if (meta.override_anterior == null) delete overrides[occ]
    else overrides[occ] = meta.override_anterior
    schedule = { ...schedule, overrides }
  }
  const tx = d.transactions.find(t => t.id === meta.lancamento_id) || null
  const novoTx = tx && tx.dataOcorrencia === occ ? { ...tx, dataOcorrencia: null } : tx
  const historico = [
    { entidade: 'agendamento', id: s.id, ocorrenciaData: occ, mudancas: [{ campo: 'vinculo', de: meta.lancamento_id, para: null }] },
    ...(tx ? [{ entidade: 'lancamento', id: tx.id, mudancas: [{ campo: 'vinculo', de: `${s.id}@${occ}`, para: null }] }] : []),
  ]
  return { ok: true, schedule, tx: novoTx, historico, lancamentoId: meta.lancamento_id }
}

export const CAMPOS_MESCLA = ['amount', 'date', 'description', 'payee', 'categoryId', 'rateio']
export const ROTULO_CAMPO_MESCLA = { amount: 'valor', date: 'data', description: 'descrição', payee: 'favorecido', categoryId: 'categoria', rateio: 'rateio' }

// Caso 2 → { ok, changes, mudancas, schedules (com as baixas re-apontadas), copiarRateio }.
// `campos`: o que vem do avulso para a parcela. A parcela mantém série, número, fatura e id.
export function planejarMesclagem(d, { avulsoId, parcelaId, campos = [] }) {
  const av = d.transactions.find(t => t.id === avulsoId)
  const p = d.transactions.find(t => t.id === parcelaId)
  if (!av || !p) return { ok: false, motivo: 'Lançamento não encontrado.' }
  if (av.id === p.id) return { ok: false, motivo: 'Escolha outra parcela.' }
  if (!(totalParcelasDoTx(p) > 1)) return { ok: false, motivo: 'O alvo não é parcela de uma série.' }
  if (av.accountId !== p.accountId) return { ok: false, motivo: 'A parcela é de outro cartão/conta.' }
  const changes = {}
  const mudancas = []
  for (const campo of campos) {
    if (campo === 'rateio') continue
    const de = p[campo] ?? null
    const para = av[campo] ?? null
    const igual = campo === 'amount' ? r2(de) === r2(para) : String(de ?? '') === String(para ?? '')
    if (igual) continue
    changes[campo] = campo === 'amount' ? r2(para) : para
    mudancas.push({ campo, de, para: changes[campo] })
  }
  if (campos.includes('date') && av.dateCartao && av.dateCartao !== p.dateCartao) changes.dateCartao = av.dateCartao
  if (av.reconciled && !p.reconciled) { changes.reconciled = true; mudancas.push({ campo: 'reconciled', de: false, para: true }) }
  mudancas.push({ campo: 'mesclado_de', de: null, para: av.id })
  const metasMovidas = []
  const schedules = d.schedules.map(s => {
    const metas = Object.entries(s.registeredMeta || {}).filter(([, m]) => m?.lancamento_id === av.id)
    if (!metas.length) return s
    const registeredMeta = { ...s.registeredMeta }
    for (const [data, m] of metas) { registeredMeta[data] = { ...m, lancamento_id: p.id }; metasMovidas.push({ scheduleId: s.id, data }) }
    return { ...s, registeredMeta }
  })
  return {
    ok: true, avulso: av, parcela: p, changes, mudancas, schedules,
    copiarRateio: campos.includes('rateio'),
    rotulo: `${numeroParcelaDoTx(p)}/${totalParcelasDoTx(p)}`,
    metasMovidas,
  }
}

// ── Desfazer mesclagem ───────────────────────────────────────────────────────────────────────────
// Retrato gravado no histórico da parcela (campo 'mesclagem', valor_anterior): tudo para refazer o
// avulso como era e devolver à parcela os valores anteriores.
export function retratoDaMesclagem(plano, { rateiosAvulso = [], rateiosParcela = [] } = {}) {
  const limpar = (o) => JSON.parse(JSON.stringify(o ?? null))
  return {
    versao: 1,
    avulso: limpar(plano.avulso),
    rateiosAvulso: limpar(rateiosAvulso.map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao || '' }))),
    parcelaId: plano.parcela.id,
    parcelaAntes: limpar(Object.fromEntries(Object.keys(plano.changes).map(k => [k, plano.parcela[k] ?? null]))),
    parcelaDepois: limpar(plano.changes),
    rateiosParcelaAntes: plano.copiarRateio ? limpar(rateiosParcela.map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao || '' }))) : null,
    metasMovidas: limpar(plano.metasMovidas || []),
  }
}

const igualCampo = (campo, a, b) => (campo === 'amount' ? r2(a) === r2(b) : String(a ?? '') === String(b ?? ''))

// → { ok, avulso, parcelaChanges, sobrescritos: [{ campo, atual, volta }], rateioParcela, schedules } | { ok: false, motivo }
export function planejarDesfazerMesclagem(d, retrato) {
  if (!retrato?.avulso?.id || !retrato.parcelaId) return { ok: false, motivo: 'Retrato da mesclagem incompleto.' }
  const p = d.transactions.find(t => t.id === retrato.parcelaId)
  if (!p) return { ok: false, motivo: 'A parcela não existe mais.' }
  if (d.transactions.some(t => t.id === retrato.avulso.id)) return { ok: false, motivo: 'O lançamento avulso já existe — a mesclagem já foi desfeita.' }
  // Mudou depois da mesclagem: o valor atual difere do que a mesclagem deixou → será sobrescrito.
  const sobrescritos = Object.entries(retrato.parcelaAntes || {})
    .filter(([campo]) => !igualCampo(campo, p[campo], retrato.parcelaDepois?.[campo]))
    .map(([campo, volta]) => ({ campo, atual: p[campo] ?? null, volta }))
  const parcelaChanges = { ...(retrato.parcelaAntes || {}) }
  const schedules = d.schedules.map(s => {
    const minhas = (retrato.metasMovidas || []).filter(m => m.scheduleId === s.id && s.registeredMeta?.[m.data]?.lancamento_id === p.id)
    if (!minhas.length) return s
    const registeredMeta = { ...s.registeredMeta }
    for (const m of minhas) registeredMeta[m.data] = { ...registeredMeta[m.data], lancamento_id: retrato.avulso.id }
    return { ...s, registeredMeta }
  })
  return { ok: true, avulso: retrato.avulso, parcela: p, parcelaChanges, sobrescritos, rateioParcela: retrato.rateiosParcelaAntes, rateiosAvulso: retrato.rateiosAvulso || [], schedules }
}
