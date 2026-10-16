import { query } from './_db.js'

// HISTÓRICO DE ALTERAÇÕES feitas pelo USUÁRIO em agendamentos e lançamentos (edição individual,
// em série ou em massa). Uma linha por campo e por item; `lote_id` agrupa as linhas de uma mesma
// edição. Gravado SEMPRE na mesma transação da alteração. O motor (recálculo de fatura,
// reconciliação), o sync e qualquer automação NÃO gravam aqui — só os endpoints de edição do
// usuário chamam inserirHistorico. `origem` diz de onde veio a ação do usuário: null = edição
// comum; 'revisao_automatica' = correção disparada no "Revisar Movimentos Automáticos".

export const ENTIDADES = ['agendamento', 'lancamento']
export const ESCOPOS = ['parcela', 'proximas', 'serie']
export const ORIGENS = ['revisao_automatica']

export const DDL_HISTORICO = [
  `CREATE TABLE IF NOT EXISTS historico_alteracoes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    entidade TEXT NOT NULL CHECK (entidade IN ('agendamento', 'lancamento')),
    entidade_id TEXT NOT NULL,
    ocorrencia_data TEXT,
    serie_key TEXT,
    lote_id TEXT NOT NULL,
    escopo TEXT NOT NULL CHECK (escopo IN ('parcela', 'proximas', 'serie')),
    campo TEXT NOT NULL,
    valor_anterior JSONB,
    valor_novo JSONB,
    motivo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_historico_entidade ON historico_alteracoes (entidade, entidade_id)',
  'CREATE INDEX IF NOT EXISTS idx_historico_serie ON historico_alteracoes (serie_key)',
  'CREATE INDEX IF NOT EXISTS idx_historico_lote ON historico_alteracoes (lote_id)',
  'ALTER TABLE historico_alteracoes ADD COLUMN IF NOT EXISTS origem TEXT',
]

let pronto = false
export async function ensureHistoricoSchema(q = query) {
  const cache = q === query
  if (cache && pronto) return
  for (const sql of DDL_HISTORICO) await q(sql)
  if (cache) pronto = true
}

// Valida/normaliza uma linha vinda do app. Devolve { erro } ou { linha }.
export function normalizarLinhaHistorico(l, { loteId, motivo } = {}) {
  const entidade = String(l?.entidade || '')
  const escopo = String(l?.escopo || 'parcela')
  const campo = String(l?.campo || '').trim()
  const entidadeId = String(l?.entidade_id || '').trim()
  const lote = String(l?.lote_id || loteId || '').trim()
  if (!ENTIDADES.includes(entidade)) return { erro: `entidade inválida: ${entidade}` }
  if (!ESCOPOS.includes(escopo)) return { erro: `escopo inválido: ${escopo}` }
  if (!campo) return { erro: 'campo é obrigatório' }
  if (!entidadeId) return { erro: 'entidade_id é obrigatório' }
  if (!lote) return { erro: 'lote_id é obrigatório' }
  const origem = l?.origem == null || l.origem === '' ? null : String(l.origem)
  if (origem && !ORIGENS.includes(origem)) return { erro: `origem inválida: ${origem}` }
  const m = l?.motivo ?? motivo
  return {
    linha: {
      entidade, entidade_id: entidadeId,
      ocorrencia_data: l?.ocorrencia_data ? String(l.ocorrencia_data) : null,
      serie_key: l?.serie_key ? String(l.serie_key) : null,
      lote_id: lote, escopo, campo,
      valor_anterior: l?.valor_anterior === undefined ? null : l.valor_anterior,
      valor_novo: l?.valor_novo === undefined ? null : l.valor_novo,
      motivo: m ? String(m).trim().slice(0, 500) || null : null,
      origem,
    },
  }
}

const COLS = ['entidade', 'entidade_id', 'ocorrencia_data', 'serie_key', 'lote_id', 'escopo', 'campo', 'valor_anterior', 'valor_novo', 'motivo', 'origem']

// INSERT das linhas (já normalizadas) com o `q` da transação de quem chama. Devolve quantas.
export async function inserirHistorico(q, linhas) {
  if (!linhas?.length) return 0
  const params = []
  const values = linhas.map(l => {
    const ph = COLS.map(c => {
      params.push(c === 'valor_anterior' || c === 'valor_novo' ? JSON.stringify(l[c] ?? null) : l[c])
      return c === 'valor_anterior' || c === 'valor_novo' ? `$${params.length}::jsonb` : `$${params.length}`
    })
    return `(${ph.join(', ')})`
  })
  await q(`INSERT INTO historico_alteracoes (${COLS.join(', ')}) VALUES ${values.join(', ')}`, params)
  return linhas.length
}

export const SQL_HISTORICO_COLS = 'id, entidade, entidade_id, ocorrencia_data, serie_key, lote_id, escopo, campo, valor_anterior, valor_novo, motivo, origem, created_at'
