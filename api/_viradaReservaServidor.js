import { randomUUID } from 'node:crypto'
import { query, withTransaction } from './_db.js'
import {
  montarPrevia, bloqueiosDeData, registrosDaVirada, resumoDaVirada, recalcularViradas, ultimoCorteDe,
  conferirDecisoes, diferencasNoFechado, reabertura,
} from '../src/lib/viradaReserva.js'
import { refazerRendimentos } from '../src/lib/rendimentoReserva.js'
import { configDoMes, mesesPendentes, somarDias, dataBR } from '../src/lib/mesFinanceiro.js'
import { buildDailyLedgerRows } from '../src/lib/reserveDailyLedger.js'

// ── Virada de saldo das reservas — lado do servidor ───────────────────────────────────────────────
// Tudo é calculado com os dados GRAVADOS no banco do ambiente (nada do navegador), pelo mesmo motor
// puro da tela (src/lib/viradaReserva.js). A gravação de um mês é UMA transação: trava da virada
// (advisory lock por banco), conferência dos bloqueios, registro em reserve_viradas, snapshots e
// períodos novos. Índices únicos garantem que duas abas/aparelhos não dupliquem nada.

const TRAVA = 'finup_reserve_virada'

export class ErroVirada extends Error {
  constructor(status, codigo, mensagem, extra = {}) {
    super(mensagem)
    this.status = status
    this.codigo = codigo
    this.extra = extra
  }
}

// Data de hoje no fuso do Brasil. A data mandada pela tela vale se estiver a no máximo 1 dia da do
// servidor (fuso do aparelho); fora disso, vale a do servidor.
export function hojeDaVirada(hojeTela) {
  const srv = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  if (typeof hojeTela === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hojeTela)) {
    if (hojeTela >= somarDias(srv, -1) && hojeTela <= somarDias(srv, 1)) return hojeTela
  }
  return srv
}

export async function temViradaAssistida(q = query) {
  const [r] = await q("SELECT to_regclass('reserve_viradas') IS NOT NULL AS tem")
  return !!r?.tem
}

// Dia (fuso de Brasília) em que a PRIMEIRA função de reserva existente foi criada. created_at é
// preenchido pelo banco (DEFAULT now()) e o app nunca o envia nem o sobrescreve. null = sem funções
// ou sem data (aí vale a regra antiga: último mês encerrado).
export async function inicioDoUso(q = query) {
  const [r] = await q("SELECT to_char(MIN(created_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS d FROM reserve_functions")
  return r?.d || null
}

async function lerConfig(q) {
  const [cfg] = await q('SELECT * FROM configuracoes WHERE id = 1')
  return cfg || {}
}

async function lerSnapshots(q) {
  // SELECT * + datas em texto: funciona também no banco ainda sem as colunas novas.
  const rows = await q(
    `SELECT *, to_char(data_inicio, 'YYYY-MM-DD') AS _inicio, to_char(data_fim, 'YYYY-MM-DD') AS _fim
       FROM reserve_period_snapshots`,
  )
  return rows.map(({ _inicio, _fim, ...r }) => ({ ...r, data_inicio: _inicio, data_fim: _fim, virada_id: r.virada_id ?? null, rendimentos: r.rendimentos ?? null }))
}

async function lerViradasAtivas(q) {
  return q(
    `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, to_char(data_corte, 'YYYY-MM-DD') AS data_corte,
            status, chave, resumo, criado_por, created_at
       FROM reserve_viradas WHERE status = 'ativa' ORDER BY data_corte`,
  )
}

// O que ficou "a distribuir" por conta na virada mais recente: o usuário já decidiu sobre esse valor.
function aceitosDe(viradas) {
  const ultima = viradas[viradas.length - 1]
  return Object.fromEntries((ultima?.resumo?.contas || []).map(c => [c.accountId, Number(c.aDistribuir) || 0]))
}

// Linhas do banco → objetos que o motor usa. Aqui, e não em src/lib/db.js: aquele módulo é do
// navegador (importa arquivos que o Node da Vercel não resolve). Datas DATE lidas como texto.
const num = (v) => Number(v) || 0
function normalizarAjusteOverride(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [mes, v] of Object.entries(raw)) out[mes] = { valor: v && typeof v === 'object' ? num(v.valor) : num(v) }
  return out
}
const funcaoDaLinha = (r) => ({
  id: r.id, name: r.name || '', accountId: r.account_id || null, saldoInicial: num(r.saldo_inicial),
  ordem: r.ordem ?? 0, ajusteOverride: normalizarAjusteOverride(r.ajuste_override),
})
const lancamentoDaLinha = (r) => ({
  id: r.id, type: r.type, accountId: r.account_id || null, toAccountId: r.to_account_id || null,
  fromAccountId: r.from_account_id || null, accountType: r.account_type || '', amount: Number(r.amount) || 0,
  date: r.date ? String(r.date).slice(0, 10) : '', description: r.description || '',
  reservaFuncaoId: r.reserva_funcao_id || null, reservaAuto: !!r.reserva_auto,
})
const contaDaLinha = (r) => ({
  id: r.id, name: r.name || '', apelido: r.apelido || '', type: r.type,
  initialBalance: r.initial_balance != null ? Math.round(Number(r.initial_balance) * 100) / 100 : null,
})
const agendamentoDaLinha = (r) => ({
  id: r.id, description: r.description || '', transactionType: r.transaction_type, tipo: r.tipo || null,
  accountId: r.account_id || null, toAccountId: r.to_account_id || null, amount: Number(r.amount) || 0,
  frequency: r.frequency, startDate: r._inicio, nextOccurrence: r._proxima || null,
  occurrenceType: r.occurrence_type || 'continuous', installments: r.installments,
  registered: r.registered || [], skipped: r.skipped || [], overrides: r.overrides || {},
  efetivacoes: Array.isArray(r.efetivacoes) ? r.efetivacoes : [],
  reservaFuncaoId: r.reserva_funcao_id || null, isProvisao: !!r.is_provisao, provisaoEfetivada: !!r.provisao_efetivada,
})

async function lerPeriodos(q) {
  const rows = await q(`SELECT *, to_char(data_inicio, 'YYYY-MM-DD') AS _inicio FROM reserve_periods`)
  return rows.map(({ _inicio, ...r }) => ({ id: r.id, function_id: r.function_id, virada_id: r.virada_id ?? null, data_inicio: _inicio, saldo_inicial: r.saldo_inicial }))
}

// Tudo que a fórmula precisa, lido do banco.
export async function carregarDadosReserva(q) {
  const functions = (await q('SELECT * FROM reserve_functions ORDER BY ordem, name')).map(funcaoDaLinha)
  const periods = await lerPeriodos(q)
  const adjustments = await q(
    `SELECT id, function_id, to_char(data, 'YYYY-MM-DD') AS data, valor, observacao, lancamento_id
       FROM reserve_adjustments`,
  )
  const transactions = (await q('SELECT * FROM lancamentos')).map(lancamentoDaLinha)
  const accounts = (await q('SELECT * FROM contas')).map(contaDaLinha)
  const schedules = (await q(
    `SELECT *, left(start_date::text, 10) AS _inicio, left(next_occurrence::text, 10) AS _proxima FROM agendamentos`,
  )).map(agendamentoDaLinha)
  const snapshots = await lerSnapshots(q)
  const cfg = await lerConfig(q)
  return { functions, periods, adjustments, transactions, accounts, schedules, snapshots, cfg }
}

// ── Razão Diário (calculado aqui, gravado por upsert em (function_id, snapshot_date)) ───────────
const COLS_RAZAO = [
  'function_id', 'snapshot_date', 'account_id', 'periodo_id',
  'entrada_dia', 'saida_dia', 'ajuste_dia',
  'saldo_acumulado', 'saldo_atualizado',
  'saldo_real_conta', 'fator_rateio', 'divergencia', 'divergencia_pct',
]
const CHUNK_RAZAO = 500
const numOuNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

export async function upsertRazao(q, rows) {
  const validas = (rows || []).filter(r => r?.function_id && r?.snapshot_date)
  const updates = COLS_RAZAO.filter(c => c !== 'function_id' && c !== 'snapshot_date').map(c => `${c} = EXCLUDED.${c}`).join(', ')
  for (let off = 0; off < validas.length; off += CHUNK_RAZAO) {
    const chunk = validas.slice(off, off + CHUNK_RAZAO)
    let i = 1
    const values = chunk.map(() => `(${COLS_RAZAO.map(() => `$${i++}`).join(', ')})`).join(', ')
    const params = chunk.flatMap(r => [
      r.function_id, r.snapshot_date, r.account_id ?? null, r.periodo_id ?? null,
      Number(r.entrada_dia) || 0, Number(r.saida_dia) || 0, Number(r.ajuste_dia) || 0,
      Number(r.saldo_acumulado) || 0, Number(r.saldo_atualizado) || 0,
      numOuNull(r.saldo_real_conta), numOuNull(r.fator_rateio), numOuNull(r.divergencia), numOuNull(r.divergencia_pct),
    ])
    await q(
      `INSERT INTO reserve_daily_ledger (${COLS_RAZAO.join(', ')}) VALUES ${values}
       ON CONFLICT (function_id, snapshot_date) DO UPDATE SET ${updates}, updated_at = now()`,
      params,
    )
  }
  return validas.length
}

// Recalcula e grava o razão a partir do banco. `desde` limita as linhas regravadas.
export async function gravarRazao(q, dados, { hoje, desde = null } = {}) {
  const { rows } = buildDailyLedgerRows({ ...dados, today: hoje, desde })
  return upsertRazao(q, rows)
}

export async function recalcularRazaoNoBanco({ hoje, desde = null } = {}) {
  const dados = await carregarDadosReserva(query)
  return gravarRazao(query, dados, { hoje: hojeDaVirada(hoje), desde })
}

// ── Status (pergunta ao entrar em Reservas) ─────────────────────────────────────────────────────
export async function statusVirada({ hoje: hojeTela } = {}) {
  if (!(await temViradaAssistida())) return { disponivel: false }
  const hoje = hojeDaVirada(hojeTela)
  const cfg = await lerConfig(query)
  const [{ n }] = await query('SELECT COUNT(*)::int AS n FROM reserve_functions')
  const [{ corte }] = await query("SELECT to_char(MAX(data_fim), 'YYYY-MM-DD') AS corte FROM reserve_period_snapshots")
  const ultimoCorte = corte || null
  const inicioUso = n > 0 ? await inicioDoUso() : null
  const pendentes = n > 0 ? mesesPendentes({ ultimoCorte, hoje, cfg: configDoMes(cfg), inicioUso }) : []
  const [ultima] = await query(
    `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, to_char(data_corte, 'YYYY-MM-DD') AS data_corte, created_at
       FROM reserve_viradas WHERE status = 'ativa' ORDER BY data_corte DESC LIMIT 1`,
  )
  let podeDesfazer = false
  let motivoDesfazer = null
  if (!ultimoCorte) motivoDesfazer = 'Ainda não há virada para desfazer.'
  else if (!ultima || ultima.data_corte !== ultimoCorte) motivoDesfazer = `O último fechamento (${dataBR(ultimoCorte)}) foi feito antes da virada assistida e não pode ser desfeito por aqui.`
  else podeDesfazer = true
  const recalculos = await query(
    `SELECT id, virada_id, to_char(data_corte, 'YYYY-MM-DD') AS data_corte, function_id, tabela, campo, antes, depois, motivo, created_at
       FROM reserve_virada_recalculos WHERE visto_em IS NULL ORDER BY created_at DESC LIMIT 200`,
  )
  return {
    disponivel: true,
    // Recálculo que falhou e precisa ser refeito (a tela mostra com o botão "Refazer recálculo").
    recalculoPendente: recalculos.some(r => r.campo === CAMPO_PENDENTE),
    hoje,
    perguntar: cfg.reserva_perguntar_virada !== false,
    ultimoCorte,
    pendentes,
    ultimaVirada: ultima || null,
    podeDesfazer,
    motivoDesfazer,
    recalculos,
  }
}

// Mês pendente que termina em `fim` (ou o mês inválido, para os bloqueios explicarem).
function mesPedido(fim, ultimoCorte, hoje, cfg, inicioUso) {
  const pend = mesesPendentes({ ultimoCorte, hoje, cfg, inicioUso })
  return pend.find(m => m.fim === fim) || { inicio: ultimoCorte ? somarDias(ultimoCorte, 1) : null, fim }
}

// ── Prévia: recalcula o razão do período a partir do banco e monta a prévia ──────────────────────
export async function previaVirada({ fim, hoje: hojeTela }) {
  if (!(await temViradaAssistida())) throw new ErroVirada(409, 'banco_desatualizado', 'O banco deste ambiente ainda não tem a atualização da virada assistida. Avise o suporte.')
  const hoje = hojeDaVirada(hojeTela)
  const dados = await carregarDadosReserva(query)
  const cfg = configDoMes(dados.cfg)
  const ultimoCorte = ultimoCorteDe(dados.snapshots)
  const inicioUso = await inicioDoUso(query)
  const mes = mesPedido(fim, ultimoCorte, hoje, cfg, inicioUso)
  const bloqueios = bloqueiosDeData({ mes, ultimoCorte, hoje, cfg, inicioUso })
  if (!dados.functions.length) bloqueios.push({ codigo: 'sem_funcoes', texto: 'Não há funções de reserva cadastradas.' })
  if (bloqueios.length) return { hoje, mes, bloqueios, previa: null }
  // Razão Diário do período recalculado com o banco — é a base de conferência da prévia.
  try { await gravarRazao(query, dados, { hoje, desde: mes.inicio }) } catch (err) { console.error('[virada] razão:', codigoDoErro(err)) }
  const aceitos = aceitosDe(await lerViradasAtivas(query))
  return { hoje, mes, bloqueios, previa: montarPrevia({ mes, ...dados, aceitos }) }
}

// ── Confirmar: grava UM mês, atômico e idempotente ──────────────────────────────────────────────
export async function confirmarVirada({ fim, chave = null, hoje: hojeTela, usuario = null, decisoes = null }) {
  if (!(await temViradaAssistida())) throw new ErroVirada(409, 'banco_desatualizado', 'O banco deste ambiente ainda não tem a atualização da virada assistida. Avise o suporte.')
  const hoje = hojeDaVirada(hojeTela)
  const resultado = await withTransaction(async (q) => {
    const [trava] = await q('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [TRAVA])
    if (!trava?.ok) throw new ErroVirada(409, 'virada_em_execucao', 'Outra sessão está fazendo a virada agora. Aguarde alguns segundos e tente de novo.')
    if (chave) {
      const [feita] = await q(
        `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, to_char(data_corte, 'YYYY-MM-DD') AS data_corte, resumo
           FROM reserve_viradas WHERE chave = $1 AND status = 'ativa' LIMIT 1`, [chave])
      if (feita) return { repetida: true, virada: feita, resumo: feita.resumo }
    }
    return gravarMes(q, { fim, chave, hoje, usuario, decisoes })
  })
  const { dados, ...resp } = resultado
  // Razão a partir do dia seguinte ao corte (períodos novos). Auxiliar: não desfaz a virada se falhar.
  if (dados) {
    try {
      const periods = await lerPeriodos(query)
      await gravarRazao(query, { ...dados, periods }, { hoje, desde: somarDias(fim, 1) })
    } catch (err) { console.error('[virada] razão após virada:', codigoDoErro(err)) }
  }
  return resp
}

// Grava UM mês dentro da transação de quem chama. `refazendo`: virada refeita depois de um estorno. Vale a
// decisão anterior se o valor for o mesmo; sem ela, devolve { parou } em vez de recusar.
async function gravarMes(q, { fim, chave = null, hoje, usuario, decisoes = null, refazendo = false }) {
  const dados = await carregarDadosReserva(q)
  const cfg = configDoMes(dados.cfg)
  const ultimoCorte = ultimoCorteDe(dados.snapshots)
  const inicioUso = await inicioDoUso(q)
  const mes = mesPedido(fim, ultimoCorte, hoje, cfg, inicioUso)
  const bloqueios = bloqueiosDeData({ mes, ultimoCorte, hoje, cfg, inicioUso })
  if (!dados.functions.length) bloqueios.push({ codigo: 'sem_funcoes', texto: 'Não há funções de reserva cadastradas.' })
  if (bloqueios.length) {
    const status = bloqueios[0].codigo === 'mes_ja_fechado' ? 409 : 422
    throw new ErroVirada(status, bloqueios[0].codigo, bloqueios[0].texto, { bloqueios })
  }
  const aceitos = aceitosDe(await lerViradasAtivas(q))
  const inicial = montarPrevia({ mes, ...dados, aceitos })
  // Diferença sem explicação por rendimento: sem a decisão do usuário, nada é gravado.
  const { faltam, ajustes } = conferirDecisoes(inicial, decisoes)
  if (faltam.length) {
    if (refazendo) return { parou: { inicio: mes.inicio, fim: mes.fim, contas: faltam } }
    const nomes = faltam.map(c => c.nome).join(', ')
    throw new ErroVirada(422, 'diferenca_nao_explicada', `A diferença de ${nomes} não é explicada por rendimento. Escolha entre lançar como Ajuste ou deixar a distribuir.`, { contas: faltam })
  }
  // Rateio dos rendimentos reais (entre positivas) e ajustes escolhidos: entram no mês que fecha.
  const novosAjustes = [
    ...inicial.rateios,
    ...ajustes.map(a => ({ id: randomUUID(), function_id: a.function_id, data: mes.fim, valor: a.valor, observacao: a.observacao, lancamento_id: null })),
  ]
  for (const a of novosAjustes) {
    await q(
      `INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao, lancamento_id)
            VALUES ($1, $2, $3, $4, $5, $6)`,
      [a.id, a.function_id, a.data, a.valor, a.observacao, a.lancamento_id ?? null],
    )
  }
  const previa = montarPrevia({ mes, ...dados, adjustments: [...dados.adjustments, ...novosAjustes], aceitos })
  // A decisão fica guardada com o valor: refazer esta virada, com a mesma diferença, não pergunta de novo.
  const decisoesGravadas = Object.fromEntries(inicial.contas
    .filter(c => Math.abs(c.resto) > 0.005 && decisoes?.[c.accountId])
    .map(c => [c.accountId, { ...decisoes[c.accountId], valor: c.resto }]))
  const resumo = { ...resumoDaVirada(previa), criados: { ajustes: novosAjustes.map(a => a.id) }, decisoes: decisoesGravadas }
  const viradaId = randomUUID()
  await q(
    `INSERT INTO reserve_viradas (id, data_inicio, data_corte, status, chave, resumo, criado_por)
          VALUES ($1, $2, $3, 'ativa', $4, $5::jsonb, $6)`,
    [viradaId, mes.inicio, mes.fim, chave, JSON.stringify(resumo), usuario],
  )
  const { snapshots, periodos } = registrosDaVirada({ previa, viradaId, novoId: randomUUID })
  for (const sn of snapshots) {
    await q(
      `INSERT INTO reserve_period_snapshots (id, periodo_id, virada_id, data_inicio, data_fim, function_id, function_name,
              saldo_inicial, entradas, saidas, ajuste, rendimentos, saldo, saldo_atualizado)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [sn.id, sn.periodo_id, sn.virada_id, sn.data_inicio, sn.data_fim, sn.function_id, sn.function_name,
        sn.saldo_inicial, sn.entradas, sn.saidas, sn.ajuste, sn.rendimentos, sn.saldo, sn.saldo_atualizado],
    )
  }
  for (const p of periodos) {
    await q(
      'INSERT INTO reserve_periods (id, function_id, virada_id, data_inicio, saldo_inicial) VALUES ($1, $2, $3, $4, $5)',
      [p.id, p.function_id, p.virada_id, p.data_inicio, p.saldo_inicial],
    )
  }
  return { repetida: false, virada: { id: viradaId, data_inicio: mes.inicio, data_corte: mes.fim }, resumo, criados: { snapshots: snapshots.length, periodos: periodos.length }, dados }
}

// ── Desfazer: só a virada mais recente, sem deixar snapshot nem período para trás ─────────────────
export async function desfazerVirada({ usuario = null, hoje: hojeTela } = {}) {
  if (!(await temViradaAssistida())) throw new ErroVirada(409, 'banco_desatualizado', 'O banco deste ambiente ainda não tem a atualização da virada assistida.')
  const hoje = hojeDaVirada(hojeTela)
  const r = await withTransaction(async (q) => {
    const [trava] = await q('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [TRAVA])
    if (!trava?.ok) throw new ErroVirada(409, 'virada_em_execucao', 'Outra sessão está mexendo na virada agora. Aguarde alguns segundos e tente de novo.')
    return desfazerMaisRecente(q, usuario)
  })
  try { await recalcularRazaoNoBanco({ hoje, desde: somarDias(r.virada.data_corte, 1) }) } catch (err) { console.error('[virada] razão após desfazer:', codigoDoErro(err)) }
  return r
}

// Desfaz a virada mais recente dentro da transação de quem chama, com o que ela mesma criou (rateios e
// ajustes da decisão, guardados no resumo).
async function desfazerMaisRecente(q, usuario) {
  const [{ corte }] = await q("SELECT to_char(MAX(data_fim), 'YYYY-MM-DD') AS corte FROM reserve_period_snapshots")
  const [v] = await q(
    `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, to_char(data_corte, 'YYYY-MM-DD') AS data_corte, resumo
       FROM reserve_viradas WHERE status = 'ativa' ORDER BY data_corte DESC LIMIT 1`)
  if (!v) throw new ErroVirada(422, 'nada_para_desfazer', 'Não há virada assistida para desfazer.')
  if (v.data_corte !== corte) throw new ErroVirada(422, 'virada_antiga', `O último fechamento (${dataBR(corte)}) foi feito antes da virada assistida e não pode ser desfeito por aqui.`)
  // Prévia do que sai (SELECT antes do DELETE).
  const snaps = await q('SELECT id FROM reserve_period_snapshots WHERE virada_id = $1', [v.id])
  const pers = await q('SELECT id FROM reserve_periods WHERE virada_id = $1', [v.id])
  const criados = v.resumo?.criados?.ajustes || []
  const ajustes = criados.length ? await q('SELECT id FROM reserve_adjustments WHERE id = ANY($1)', [criados]) : []
  await q('DELETE FROM reserve_period_snapshots WHERE virada_id = $1', [v.id])
  await q('DELETE FROM reserve_periods WHERE virada_id = $1', [v.id])
  if (ajustes.length) await q('DELETE FROM reserve_adjustments WHERE id = ANY($1)', [ajustes.map(a => a.id)])
  await q("UPDATE reserve_viradas SET status = 'desfeita', desfeita_em = now(), desfeita_por = $2 WHERE id = $1", [v.id, usuario])
  const virada = { id: v.id, data_inicio: v.data_inicio, data_corte: v.data_corte }
  return { virada, decisoes: v.resumo?.decisoes || {}, removidos: { snapshots: snaps.length, periodos: pers.length, ajustes: ajustes.length } }
}

// ── Estorno por gravação em período virado (api/_guardaVirada.js) ───────────────────────────────
// Última data que pode estar fechada: o corte geral ou o início do período mais recente de cada função.
// Foto do que está até essa data e mexe nas reservas: a guarda compara antes e depois da gravação.
// Sem nada fechado → null. `base`: a foto de antes (usa os mesmos limites, contas e períodos).
export async function fotoDoFechado(q, base = null) {
  let ctx = base?.ctx
  if (!ctx) {
    const periods = await lerPeriodos(q)
    const [{ corte }] = await q("SELECT to_char(MAX(data_fim), 'YYYY-MM-DD') AS corte FROM reserve_period_snapshots")
    if (!periods.length && !corte) return null
    const functions = (await q('SELECT * FROM reserve_functions')).map(funcaoDaLinha)
    const limite = [corte, ...periods.map(p => p.data_inicio)].filter(Boolean).sort().pop()
    ctx = { periods, corte: corte || null, functions, limite, contas: [...new Set(functions.map(f => f.accountId).filter(Boolean))] }
  }
  const lancamentos = await q(
    `SELECT * FROM lancamentos
      WHERE left(date::text, 10) <= $1 AND (reserva_funcao_id IS NOT NULL OR account_id = ANY($2) OR to_account_id = ANY($2))`,
    [ctx.limite, ctx.contas],
  )
  const ajustes = await q(
    `SELECT id, function_id, to_char(data, 'YYYY-MM-DD') AS data, valor, observacao FROM reserve_adjustments WHERE to_char(data, 'YYYY-MM-DD') <= $1`,
    [ctx.limite],
  )
  const periodos = (await lerPeriodos(q)).filter(p => !p.virada_id)
  const funcoes = (await q('SELECT * FROM reserve_functions')).map(funcaoDaLinha)
  return {
    ctx,
    lancamentos: new Map(lancamentos.map(r => [r.id, lancamentoDaLinha(r)])),
    ajustes: new Map(ajustes.map(r => [r.id, r])),
    periodos: new Map(periodos.map(r => [r.id, r])),
    funcoes: new Map(funcoes.map(f => [f.id, f])),
  }
}

export const itensEmPeriodoFechado = (antes, depois) => diferencasNoFechado(antes, depois, antes.ctx)

// Quais viradas estornar, ou o motivo de não poder. Vale para o lote inteiro.
export async function analisarEstorno(q, itens) {
  const viradas = await lerViradasAtivas(q)
  const snapshots = await lerSnapshots(q)
  const periods = await lerPeriodos(q)
  const cortes = new Set()
  const itensTela = itens.map(({ function_id, account_id, data, valor, descricao, tipo }) => ({ function_id, account_id, data, valor, descricao, tipo }))
  for (const item of itens) {
    const r = reabertura(item, { viradas, snapshots, periods })
    if (!r.pode) return { bloqueio: `Não é possível gravar em ${item.data === '0001-01-01' ? 'período já fechado' : dataBR(item.data)}. ${r.motivo}`, itens: itensTela }
    for (const c of r.cortes) cortes.add(c)
  }
  const lista = [...cortes].sort().reverse()
  return {
    bloqueio: null,
    itens: itensTela,
    cortes: lista,
    desde: itens.map(i => i.data).sort()[0],
    viradas: lista.map(c => {
      const v = viradas.find(x => x.data_corte === c)
      return { data_inicio: v.data_inicio, data_corte: v.data_corte }
    }),
  }
}

// Da mais recente até a da data, dentro da transação de quem chama. Em ordem cronológica na volta.
export async function estornarViradas(q, cortes, usuario) {
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [TRAVA])
  const feitas = []
  for (let i = 0; i < cortes.length; i++) {
    const r = await desfazerMaisRecente(q, usuario)
    feitas.push({ ...r.virada, decisoes: r.decisoes })
  }
  return feitas.reverse()
}

// Depois de gravar: refaz o rateio dos rendimentos seguintes (o saldo de cada dia mudou) e as viradas, em
// ordem. Se uma parar por diferença sem explicação, as seguintes ficam abertas, para a virada normal.
export async function refazerViradas(q, { estornadas, hoje, usuario, desde }) {
  const dados = await carregarDadosReserva(q)
  const corte = ultimoCorteDe(dados.snapshots)
  const aberto = corte ? somarDias(corte, 1) : null
  const inicio = [desde, aberto].filter(Boolean).sort().pop()
  for (const it of refazerRendimentos({ ...dados, desde: inicio })) {
    await q('DELETE FROM reserve_adjustments WHERE lancamento_id = $1', [it.lancamentoId])
    for (const a of it.novos) {
      await q(
        'INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao, lancamento_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [a.id, a.function_id, a.data, a.valor, a.observacao, a.lancamento_id],
      )
    }
  }
  const refeitas = []
  for (const v of estornadas) {
    const r = await gravarMes(q, { fim: v.data_corte, hoje, usuario, decisoes: v.decisoes, refazendo: true })
    if (r.parou) return { estornadas: estornadas.map(x => x.data_corte), refeitas, parou: r.parou }
    refeitas.push(v.data_corte)
  }
  return { estornadas: estornadas.map(x => x.data_corte), refeitas, parou: null }
}

export async function marcarRecalculosVistos(ids) {
  if (!Array.isArray(ids) || !ids.length) return 0
  const r = await query('UPDATE reserve_virada_recalculos SET visto_em = now() WHERE id = ANY($1) AND visto_em IS NULL RETURNING id', [ids])
  return r.length
}

// ── Recálculo que ficou pendente de antes da regra do estorno (botão "Refazer recálculo") ──────
const CAMPOS_RECALCULO = {
  reserve_period_snapshots: new Set(['saldo_inicial', 'entradas', 'saidas', 'ajuste', 'rendimentos', 'saldo', 'saldo_atualizado']),
  reserve_periods: new Set(['saldo_inicial']),
}

// Recalcula as viradas assistidas com os dados atuais e regrava só o que mudou (snapshots e saldos
// iniciais dos períodos seguintes), registrando antes/depois em reserve_virada_recalculos.
export async function recalcularViradasNoBanco(motivo) {
  if (!(await temViradaAssistida())) return []
  return withTransaction(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [TRAVA])
    const viradas = await lerViradasAtivas(q)
    if (!viradas.length) return []
    const dados = await carregarDadosReserva(q)
    const mudancas = recalcularViradas({ viradas, ...dados })
    for (const m of mudancas) {
      if (!CAMPOS_RECALCULO[m.tabela]?.has(m.campo)) continue
      await q(`UPDATE ${m.tabela} SET ${m.campo} = $1 WHERE id = $2`, [m.depois, m.id])
      await q(
        `INSERT INTO reserve_virada_recalculos (virada_id, data_corte, function_id, tabela, registro_id, campo, antes, depois, motivo)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [m.viradaId, m.dataCorte, m.functionId, m.tabela, m.id, m.campo, m.antes, m.depois, motivo || null],
      )
    }
    return mudancas
  })
}

const codigoDoErro = (err) => err?.code || err?.name || 'erro'

export const CAMPO_PENDENTE = 'recalculo_pendente'

// "Refazer recálculo" (tela de Reservas): recalcula tudo e, dando certo, dá baixa nas pendências.
export async function refazerRecalculo() {
  const mudancas = await recalcularViradasNoBanco('recálculo refeito pelo usuário')
  await query('UPDATE reserve_virada_recalculos SET visto_em = now() WHERE campo = $1 AND visto_em IS NULL', [CAMPO_PENDENTE])
  return mudancas
}
