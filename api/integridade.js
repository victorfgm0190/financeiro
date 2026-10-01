import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { executarRegras, hojeSP, addMesesYM } from '../src/lib/integridade/regras.js'
import { planejarVarredura, POR_FATURA_FECHADA } from '../src/lib/integridade/motor.js'
import { dadosDeLinhas } from '../src/lib/integridade/dbRows.js'

// Motor de Integridade — pendências de dados (ver src/lib/integridade/regras.js).
//   GET                         → lista (filtros: status, regra, conta_id, fatura_ref); ?resumo=1 → só contagens
//   POST action=varrer          → roda as regras e grava as divergências { desde?: 'YYYY-MM' | 'todas' }
//                                 Faturas fechadas (configuracoes.faturas_fechadas) não são avaliadas;
//                                 as pendências delas viram 'ignorada' (resolvida_por = 'fatura_fechada').
//   POST action=ignorar|reabrir → { id } muda o status (resolvida_por = 'usuario')
//   POST action=resolver        → { id, ajuste } fecha após ajuste verificado no app (resolvida_por = 'motor')
//   POST action=aceitar_saldo   → { id, motivo } GER_SALDO_SUBCONTA: grava um marco em
//                                 marcos_saldo_gerencial e resolve a pendência (resolvida_por = 'marco').
//                                 NÃO cria lançamento e NÃO altera saldo.
// Este endpoint SÓ detecta: não cria, altera nem apaga nada em lancamentos/agendamentos/contas.

let schemaPronto = false
async function ensureSchema() {
  if (schemaPronto) return
  await query(`CREATE TABLE IF NOT EXISTS pendencias_integridade (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    regra         TEXT NOT NULL,
    severidade    TEXT NOT NULL CHECK (severidade IN ('auto','aprovar')),
    origem_id     TEXT NOT NULL,
    conta_id      TEXT,
    fatura_ref    TEXT,
    descricao     TEXT,
    esperado      JSONB,
    encontrado    JSONB,
    status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','resolvida','ignorada')),
    detectada_em  TIMESTAMPTZ DEFAULT now(),
    verificada_em TIMESTAMPTZ DEFAULT now(),
    resolvida_em  TIMESTAMPTZ,
    resolvida_por TEXT,
    UNIQUE (regra, origem_id)
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_pendencias_integridade_status ON pendencias_integridade (status)`)
  schemaPronto = true
}

function param(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

const COLS = ['regra', 'severidade', 'origem_id', 'conta_id', 'fatura_ref', 'descricao', 'esperado', 'encontrado']
const CHUNK = 400

// Um único upsert cobre nova / mantida / reaberta / ignorada: a pendência resolvida que reaparece
// volta a pendente (detectada_em nova); a ignorada continua ignorada — exceto a ignorada por
// fatura fechada: as regras não geram divergência de fatura fechada, então se ela voltou a fatura
// foi reaberta e a pendência volta a valer.
const REABRE = `(pendencias_integridade.status = 'resolvida' OR
  (pendencias_integridade.status = 'ignorada' AND pendencias_integridade.resolvida_por = '${POR_FATURA_FECHADA}'))`
async function gravar(q, linhas) {
  for (let i = 0; i < linhas.length; i += CHUNK) {
    const lote = linhas.slice(i, i + CHUNK)
    let n = 1
    const values = lote.map(() => `(${COLS.map(() => `$${n++}`).join(', ')}, now())`).join(', ')
    const params = lote.flatMap(d => COLS.map(c =>
      (c === 'esperado' || c === 'encontrado') ? (d[c] == null ? null : JSON.stringify(d[c])) : (d[c] ?? null)))
    await q(
      `INSERT INTO pendencias_integridade (${COLS.join(', ')}, verificada_em) VALUES ${values}
       ON CONFLICT (regra, origem_id) DO UPDATE SET
         severidade    = EXCLUDED.severidade,
         conta_id      = EXCLUDED.conta_id,
         fatura_ref    = EXCLUDED.fatura_ref,
         descricao     = EXCLUDED.descricao,
         esperado      = EXCLUDED.esperado,
         encontrado    = EXCLUDED.encontrado,
         verificada_em = now(),
         detectada_em  = CASE WHEN ${REABRE} THEN now() ELSE pendencias_integridade.detectada_em END,
         resolvida_em  = CASE WHEN ${REABRE} THEN NULL ELSE pendencias_integridade.resolvida_em END,
         resolvida_por = CASE WHEN ${REABRE} THEN NULL ELSE pendencias_integridade.resolvida_por END,
         status        = CASE WHEN ${REABRE} THEN 'pendente' ELSE pendencias_integridade.status END`,
      params,
    )
  }
}

// marcos_saldo_gerencial é criada à mão no Neon (DDL em supabase/schema.sql). Enquanto não existir,
// a varredura segue sem marcos.
const TABELA_INEXISTENTE = '42P01'
async function carregarMarcos() {
  try {
    return await query('SELECT * FROM marcos_saldo_gerencial')
  } catch (err) {
    if (err.code === TABELA_INEXISTENTE) return []
    throw err
  }
}

async function carregarDados() {
  const [lancamentos, contas, agendamentos, grupos, [cfg], marcos] = await Promise.all([
    query('SELECT * FROM lancamentos'),
    query('SELECT * FROM contas'),
    query('SELECT * FROM agendamentos'),
    query('SELECT * FROM reservas_funcoes'),
    query('SELECT faturas_fechadas FROM configuracoes WHERE id = 1'),
    carregarMarcos(),
  ])
  // Mesmo dado do botão "Fechar Fatura" (settings.faturasFechadas no app).
  const faturasFechadas = cfg?.faturas_fechadas || {}
  return { ...dadosDeLinhas({ lancamentos, contas, agendamentos, grupos, marcos }), faturasFechadas }
}

// "Aceitar saldo atual como correto": recalcula a regra AGORA (não confia no valor da varredura
// anterior), grava o marco com o saldo e a diferença aceita e resolve a pendência. Só registro —
// nenhuma transferência é criada para cobrir a diferença.
async function aceitarSaldo(body) {
  const motivo = String(body?.motivo || '').trim()
  if (!body?.id) return { status: 400, json: { error: 'id é obrigatório' } }
  if (!motivo) return { status: 400, json: { error: 'motivo é obrigatório' } }
  const [p] = await query('SELECT * FROM pendencias_integridade WHERE id = $1', [body.id])
  if (!p) return { status: 404, json: { error: 'Pendência não encontrada' } }
  if (p.regra !== 'GER_SALDO_SUBCONTA') return { status: 400, json: { error: 'Só pendências GER_SALDO_SUBCONTA aceitam marco de saldo' } }
  if (p.status !== 'pendente') return { status: 409, json: { error: 'Pendência não está mais pendente' } }

  const hoje = hojeSP()
  const dados = await carregarDados()
  const [div] = executarRegras(dados, { hoje, desde: null, regras: ['GER_SALDO_SUBCONTA'] })
    .filter(d => d.origem_id === p.origem_id)
  if (!div) return { status: 409, json: { error: 'O saldo já bate com o esperado — rode "Varrer agora" para resolver a pendência.' } }

  const saldo = div.encontrado.saldo
  const diferencaAceita = Math.round((saldo - div.esperado.faturas_abertas) * 100) / 100
  try {
    return await withTransaction(async (q) => {
      const [marco] = await q(
        `INSERT INTO marcos_saldo_gerencial (conta_id, data, saldo, diferenca_aceita, motivo, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [p.origem_id, hoje, saldo, diferencaAceita, motivo, 'usuario'],
      )
      const ajuste = {
        acao: 'marco', marco_id: marco.id, saldo, esperado: div.esperado.saldo,
        diferenca: div.encontrado.diferenca, diferenca_aceita: diferencaAceita, motivo,
        em: new Date().toISOString(), por: 'usuario',
      }
      const [row] = await q(
        `UPDATE pendencias_integridade
            SET status = 'resolvida', resolvida_em = now(), resolvida_por = 'marco',
                encontrado = COALESCE(encontrado, '{}'::jsonb) || jsonb_build_object('ajuste', $2::jsonb)
          WHERE id = $1 AND status = 'pendente' RETURNING *`,
        [p.id, JSON.stringify(ajuste)],
      )
      return { status: 200, json: { ok: true, marco, pendencia: row } }
    })
  } catch (err) {
    if (err.code === TABELA_INEXISTENTE) {
      return { status: 500, json: { error: 'A tabela marcos_saldo_gerencial não existe — rode o CREATE TABLE de supabase/schema.sql no Neon.' } }
    }
    throw err
  }
}

async function varrer(body) {
  const hoje = hojeSP()
  // A janela de 3 meses é só limite de segurança de desempenho: o histórico sai da avaliação pelo
  // filtro de faturas fechadas.
  const desde = body?.desde === 'todas' ? null
    : (/^\d{4}-\d{2}$/.test(body?.desde || '') ? body.desde : addMesesYM(hoje.slice(0, 7), -3))

  const dados = await carregarDados()
  const { faturasFechadas } = dados
  const divergencias = executarRegras(dados, { hoje, desde })

  return withTransaction(async (q) => {
    const existentes = await q('SELECT id, regra, origem_id, conta_id, fatura_ref, status, resolvida_por FROM pendencias_integridade')
    const plano = planejarVarredura(existentes, divergencias, { desde }, { faturasFechadas })
    await gravar(q, plano.gravar)
    if (plano.resolver.length) {
      await q(
        `UPDATE pendencias_integridade
            SET status = 'resolvida', resolvida_em = now(), resolvida_por = 'varredura'
          WHERE id = ANY($1)
            AND (status = 'pendente' OR (status = 'ignorada' AND resolvida_por = $2))`,
        [plano.resolver, POR_FATURA_FECHADA],
      )
    }
    if (plano.arquivar.length) {
      await q(
        `UPDATE pendencias_integridade
            SET status = 'ignorada', resolvida_em = now(), resolvida_por = $2
          WHERE id = ANY($1) AND status = 'pendente'`,
        [plano.arquivar, POR_FATURA_FECHADA],
      )
    }
    const porRegra = {}
    for (const d of divergencias) porRegra[d.regra] = (porRegra[d.regra] || 0) + 1
    return {
      hoje, desde,
      novas: plano.resumo.novas + plano.resumo.reabertas,
      mantidas: plano.resumo.mantidas,
      resolvidas: plano.resumo.resolvidas,
      ignoradas: plano.resumo.ignoradas,
      arquivadas: plano.resumo.arquivadas,
      total_divergencias: divergencias.length,
      por_regra: porRegra,
    }
  })
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  try {
    await ensureSchema()

    if (req.method === 'GET') {
      if (param(req, 'resumo')) {
        const rows = await query(
          `SELECT status, regra, severidade, COUNT(*)::int AS qtd
             FROM pendencias_integridade GROUP BY status, regra, severidade`,
        )
        const pendentes = rows.filter(r => r.status === 'pendente').reduce((s, r) => s + r.qtd, 0)
        return res.json({ pendentes, grupos: rows })
      }
      const filtros = []
      const params = []
      for (const campo of ['status', 'regra', 'conta_id', 'fatura_ref']) {
        const v = param(req, campo)
        if (v) { params.push(v); filtros.push(`${campo} = $${params.length}`) }
      }
      const rows = await query(
        `SELECT * FROM pendencias_integridade
          ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
          ORDER BY regra, fatura_ref NULLS FIRST, origem_id`,
        params,
      )
      return res.json({ pendencias: rows })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const action = param(req, 'action') || body?.action
      if (action === 'varrer') return res.json({ ok: true, ...(await varrer(body)) })
      if (action === 'aceitar_saldo') {
        const r = await aceitarSaldo(body)
        return res.status(r.status).json(r.json)
      }
      if (action === 'ignorar' || action === 'reabrir') {
        if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
        const [row] = action === 'ignorar'
          ? await query(
            `UPDATE pendencias_integridade
                SET status = 'ignorada', resolvida_em = now(), resolvida_por = 'usuario'
              WHERE id = $1 RETURNING *`, [body.id])
          : await query(
            `UPDATE pendencias_integridade
                SET status = 'pendente', resolvida_em = NULL, resolvida_por = 'usuario'
              WHERE id = $1 RETURNING *`, [body.id])
        if (!row) return res.status(404).json({ error: 'Pendência não encontrada' })
        return res.json({ ok: true, pendencia: row })
      }
      // Ajuste feito pelo app (aba Integridade): a regra do item foi rodada de novo sobre o estado
      // ajustado e a divergência sumiu. Grava o log do ajuste em encontrado.ajuste. Só fecha o que
      // ainda está pendente — nunca reabre nem sobrescreve uma ignorada.
      if (action === 'resolver') {
        if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
        const ajuste = { ...(body.ajuste || {}), em: new Date().toISOString(), por: 'motor' }
        const [row] = await query(
          `UPDATE pendencias_integridade
              SET status = 'resolvida', resolvida_em = now(), resolvida_por = 'motor',
                  encontrado = COALESCE(encontrado, '{}'::jsonb) || jsonb_build_object('ajuste', $2::jsonb)
            WHERE id = $1 AND status = 'pendente' RETURNING *`,
          [body.id, JSON.stringify(ajuste)],
        )
        if (!row) return res.status(409).json({ error: 'Pendência não está mais pendente' })
        return res.json({ ok: true, pendencia: row })
      }
      return res.status(400).json({ error: `action inválida: ${action}` })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/integridade]', err.message)
    res.status(500).json({ error: err.message })
  }
}
