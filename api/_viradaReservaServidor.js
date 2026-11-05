import { randomUUID } from 'node:crypto'
import { query, withTransaction } from './_db.js'
import {
  montarPrevia, bloqueiosDeData, registrosDaVirada, resumoDaVirada, recalcularViradas, ultimoCorteDe,
} from '../src/lib/viradaReserva.js'
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
  const pendentes = n > 0 ? mesesPendentes({ ultimoCorte, hoje, cfg: configDoMes(cfg) }) : []
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
function mesPedido(fim, ultimoCorte, hoje, cfg) {
  const pend = mesesPendentes({ ultimoCorte, hoje, cfg })
  return pend.find(m => m.fim === fim) || { inicio: ultimoCorte ? somarDias(ultimoCorte, 1) : null, fim }
}

// ── Prévia: recalcula o razão do período a partir do banco e monta a prévia ──────────────────────
export async function previaVirada({ fim, hoje: hojeTela }) {
  if (!(await temViradaAssistida())) throw new ErroVirada(409, 'banco_desatualizado', 'O banco deste ambiente ainda não tem a atualização da virada assistida. Avise o suporte.')
  const hoje = hojeDaVirada(hojeTela)
  const dados = await carregarDadosReserva(query)
  const cfg = configDoMes(dados.cfg)
  const ultimoCorte = ultimoCorteDe(dados.snapshots)
  const mes = mesPedido(fim, ultimoCorte, hoje, cfg)
  const bloqueios = bloqueiosDeData({ mes, ultimoCorte, hoje, cfg })
  if (!dados.functions.length) bloqueios.push({ codigo: 'sem_funcoes', texto: 'Não há funções de reserva cadastradas.' })
  if (bloqueios.length) return { hoje, mes, bloqueios, previa: null }
  // Razão Diário do período recalculado com o banco — é a base de conferência da prévia.
  try { await gravarRazao(query, dados, { hoje, desde: mes.inicio }) } catch (err) { console.error('[virada] razão:', codigoDoErro(err)) }
  return { hoje, mes, bloqueios, previa: montarPrevia({ mes, ...dados }) }
}

// ── Confirmar: grava UM mês, atômico e idempotente ──────────────────────────────────────────────
export async function confirmarVirada({ fim, chave = null, hoje: hojeTela, usuario = null }) {
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
    const dados = await carregarDadosReserva(q)
    const cfg = configDoMes(dados.cfg)
    const ultimoCorte = ultimoCorteDe(dados.snapshots)
    const mes = mesPedido(fim, ultimoCorte, hoje, cfg)
    const bloqueios = bloqueiosDeData({ mes, ultimoCorte, hoje, cfg })
    if (!dados.functions.length) bloqueios.push({ codigo: 'sem_funcoes', texto: 'Não há funções de reserva cadastradas.' })
    if (bloqueios.length) {
      const status = bloqueios[0].codigo === 'mes_ja_fechado' ? 409 : 422
      throw new ErroVirada(status, bloqueios[0].codigo, bloqueios[0].texto, { bloqueios })
    }
    const previa = montarPrevia({ mes, ...dados })
    const resumo = resumoDaVirada(previa)
    const viradaId = randomUUID()
    await q(
      `INSERT INTO reserve_viradas (id, data_inicio, data_corte, status, chave, resumo, criado_por)
            VALUES ($1, $2, $3, 'ativa', $4, $5::jsonb, $6)`,
      [viradaId, mes.inicio, mes.fim, chave, JSON.stringify(resumo), usuario],
    )
    const { snapshots, periodos } = registrosDaVirada({ previa, viradaId, novoId: randomUUID })
    for (const s of snapshots) {
      await q(
        `INSERT INTO reserve_period_snapshots (id, periodo_id, virada_id, data_inicio, data_fim, function_id, function_name,
                saldo_inicial, entradas, saidas, ajuste, rendimentos, saldo, saldo_atualizado)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [s.id, s.periodo_id, s.virada_id, s.data_inicio, s.data_fim, s.function_id, s.function_name,
          s.saldo_inicial, s.entradas, s.saidas, s.ajuste, s.rendimentos, s.saldo, s.saldo_atualizado],
      )
    }
    for (const p of periodos) {
      await q(
        'INSERT INTO reserve_periods (id, function_id, virada_id, data_inicio, saldo_inicial) VALUES ($1, $2, $3, $4, $5)',
        [p.id, p.function_id, p.virada_id, p.data_inicio, p.saldo_inicial],
      )
    }
    return { repetida: false, virada: { id: viradaId, data_inicio: mes.inicio, data_corte: mes.fim }, resumo, criados: { snapshots: snapshots.length, periodos: periodos.length }, dados }
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

// ── Desfazer: só a virada mais recente, sem deixar snapshot nem período para trás ─────────────────
export async function desfazerVirada({ usuario = null, hoje: hojeTela } = {}) {
  if (!(await temViradaAssistida())) throw new ErroVirada(409, 'banco_desatualizado', 'O banco deste ambiente ainda não tem a atualização da virada assistida.')
  const hoje = hojeDaVirada(hojeTela)
  const r = await withTransaction(async (q) => {
    const [trava] = await q('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [TRAVA])
    if (!trava?.ok) throw new ErroVirada(409, 'virada_em_execucao', 'Outra sessão está mexendo na virada agora. Aguarde alguns segundos e tente de novo.')
    const [{ corte }] = await q("SELECT to_char(MAX(data_fim), 'YYYY-MM-DD') AS corte FROM reserve_period_snapshots")
    const [v] = await q(
      `SELECT id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, to_char(data_corte, 'YYYY-MM-DD') AS data_corte
         FROM reserve_viradas WHERE status = 'ativa' ORDER BY data_corte DESC LIMIT 1`)
    if (!v) throw new ErroVirada(422, 'nada_para_desfazer', 'Não há virada assistida para desfazer.')
    if (v.data_corte !== corte) throw new ErroVirada(422, 'virada_antiga', `O último fechamento (${dataBR(corte)}) foi feito antes da virada assistida e não pode ser desfeito por aqui.`)
    // Prévia do que sai (SELECT antes do DELETE).
    const snaps = await q('SELECT id FROM reserve_period_snapshots WHERE virada_id = $1', [v.id])
    const pers = await q('SELECT id FROM reserve_periods WHERE virada_id = $1', [v.id])
    await q('DELETE FROM reserve_period_snapshots WHERE virada_id = $1', [v.id])
    await q('DELETE FROM reserve_periods WHERE virada_id = $1', [v.id])
    await q("UPDATE reserve_viradas SET status = 'desfeita', desfeita_em = now(), desfeita_por = $2 WHERE id = $1", [v.id, usuario])
    return { virada: v, removidos: { snapshots: snaps.length, periodos: pers.length } }
  })
  try { await recalcularRazaoNoBanco({ hoje, desde: somarDias(r.virada.data_corte, 1) }) } catch (err) { console.error('[virada] razão após desfazer:', codigoDoErro(err)) }
  return r
}

export async function marcarRecalculosVistos(ids) {
  if (!Array.isArray(ids) || !ids.length) return 0
  const r = await query('UPDATE reserve_virada_recalculos SET visto_em = now() WHERE id = ANY($1) AND visto_em IS NULL RETURNING id', [ids])
  return r.length
}

// ── Recálculo por mudança retroativa ────────────────────────────────────────────────────────────
// Última data coberta por virada ASSISTIDA ativa (null = nenhuma). Banco SEM a migração → null, sem
// erro (comportamento de antes). Com a migração, uma falha na leitura PROPAGA: quem chama decide
// (registra pendência) — engolir aqui escondia a falha como "nada a recalcular".
export async function corteAssistido(q = query) {
  if (!(await temViradaAssistida(q))) return null
  const [r] = await q("SELECT to_char(MAX(data_corte), 'YYYY-MM-DD') AS corte FROM reserve_viradas WHERE status = 'ativa'")
  return r?.corte || null
}

const CAMPOS_RECALCULO = {
  reserve_period_snapshots: new Set(['saldo_inicial', 'entradas', 'saidas', 'ajuste', 'rendimentos', 'saldo', 'saldo_atualizado']),
  reserve_periods: new Set(['saldo_inicial']),
}

// Recalcula as viradas assistidas com os dados atuais e regrava só o que mudou (snapshots e saldos
// iniciais dos períodos seguintes), registrando antes/depois em reserve_virada_recalculos.
export async function recalcularViradasNoBanco(motivo) {
  if (!(await corteAssistido())) return []
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

// Mudança em lançamentos que cai em mês fechado pela virada assistida? Compara com o gravado
// (chamar ANTES de gravar): linha nova, apagada ou com data/valor/tipo/contas/função diferente, com
// a data antiga ou a nova até o corte.
const CAMPOS_LANC = ['date', 'amount', 'type', 'account_id', 'to_account_id', 'reserva_funcao_id']
export async function lancamentosAfetamViradas(q, { upsert = [], del = [] } = {}) {
  const corte = await corteAssistido(q)
  if (!corte) return false
  const ids = [...new Set([...(upsert || []).map(r => r?.id), ...(del || [])].filter(Boolean))]
  const atuais = ids.length
    ? await q('SELECT id, date, amount, type, account_id, to_account_id, reserva_funcao_id FROM lancamentos WHERE id = ANY($1)', [ids])
    : []
  const porId = new Map(atuais.map(r => [r.id, r]))
  const ate = (d) => !!d && String(d).slice(0, 10) <= corte
  for (const id of del || []) if (ate(porId.get(id)?.date)) return true
  for (const r of upsert || []) {
    if (!r?.id) continue
    const antes = porId.get(r.id)
    if (!antes) { if (ate(r.date)) return true; continue }
    const mudou = CAMPOS_LANC.some(c => c in r && String(r[c] ?? '') !== String(antes[c] ?? '') && !(c === 'amount' && Number(r[c]) === Number(antes[c])))
    if (mudou && (ate(antes.date) || ate(r.date))) return true
  }
  return false
}

// ── Ganchos de recálculo (sync, ajustes, saldo inicial) ─────────────────────────────────────────
// Uso: `const prep = await prepararRecalculo(() => <verifica se afeta mês fechado>)` ANTES de gravar;
// depois de gravar, `const r = await concluirRecalculo(prep, motivo)`. O dado do usuário é gravado
// sempre — a verificação/recálculo nunca derruba a gravação. Mas falha não é silenciosa:
//   • log só com o código do erro (nada de valores, datas ou descrições);
//   • pendência em reserve_virada_recalculos (campo 'recalculo_pendente'), mostrada em Reservas
//     com o botão "Refazer recálculo";
//   • a resposta leva `viradaRecalculoPendente: true` (a tela avisa).
// Banco sem a migração: corteAssistido devolve null sem erro → nada a fazer, nada a avisar.
const codigoDoErro = (err) => err?.code || err?.name || 'erro'

export const CAMPO_PENDENTE = 'recalculo_pendente'

export async function registrarPendenciaRecalculo(motivo) {
  try {
    await query(
      'INSERT INTO reserve_virada_recalculos (campo, motivo) VALUES ($1, $2)',
      [CAMPO_PENDENTE, `Recálculo das viradas precisa ser refeito (${motivo || 'mudança em mês fechado'}).`],
    )
    return true
  } catch (err) {
    console.error('[virada] pendência de recálculo não registrada:', codigoDoErro(err))
    return false
  }
}

export async function prepararRecalculo(verificar) {
  try {
    return { afetou: !!(await verificar()), falhou: false }
  } catch (err) {
    console.error('[virada] verificação de mês fechado falhou:', codigoDoErro(err))
    return { afetou: false, falhou: true }
  }
}

// { mudancas, pendente } — pendente = o recálculo não foi feito e precisa ser refeito.
export async function concluirRecalculo(prep, motivo) {
  if (prep?.falhou) {
    await registrarPendenciaRecalculo(motivo)
    return { mudancas: [], pendente: true }
  }
  if (!prep?.afetou) return { mudancas: [], pendente: false }
  try {
    return { mudancas: await recalcularViradasNoBanco(motivo), pendente: false }
  } catch (err) {
    console.error('[virada] recálculo falhou:', codigoDoErro(err))
    await registrarPendenciaRecalculo(motivo)
    return { mudancas: [], pendente: true }
  }
}

// Campos da resposta da API para o resultado do gancho.
export const respostaRecalculo = (r) => ({
  ...(r?.mudancas?.length ? { viradaRecalculada: r.mudancas.length } : {}),
  ...(r?.pendente ? { viradaRecalculoPendente: true } : {}),
})

// "Refazer recálculo" (tela de Reservas): recalcula tudo e, dando certo, dá baixa nas pendências.
export async function refazerRecalculo() {
  const mudancas = await recalcularViradasNoBanco('recálculo refeito pelo usuário')
  await query('UPDATE reserve_virada_recalculos SET visto_em = now() WHERE campo = $1 AND visto_em IS NULL', [CAMPO_PENDENTE])
  return mudancas
}
