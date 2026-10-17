import { query } from './_db.js'
import { registroPorBanco } from './_conexao.js'

// TIPOS DE DOCUMENTO (Boleto, NF, Fatura de Cartão…) e o vínculo opcional deles com agendamentos
// e lançamentos (coluna tipo_documento_id TEXT NULL, sem FK: o sync manda a tabela inteira e uma FK
// derrubaria o upsert por causa de um id que o banco já não tem). Registros antigos ficam NULL —
// nada é preenchido automaticamente; o "CC" da fatura de cartão é só fallback de EXIBIÇÃO no front.

export const NATUREZAS = ['pagar', 'receber', 'ambos']
export const SIGLA_MAX = 4

export const DDL_TIPOS_DOCUMENTO = `CREATE TABLE IF NOT EXISTS tipos_documento (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL,
    sigla TEXT NOT NULL CHECK (char_length(sigla) BETWEEN 1 AND ${SIGLA_MAX}),
    natureza TEXT NOT NULL DEFAULT 'ambos' CHECK (natureza IN ('pagar', 'receber', 'ambos')),
    cor TEXT,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    sistema BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`

// [nome, sigla, natureza, cor, sistema] — na ordem de exibição.
export const SEED_TIPOS_DOCUMENTO = [
  ['Fatura', 'FAT', 'ambos', '#6366f1', false],
  ['Fatura de Cartão', 'CC', 'pagar', '#8b5cf6', true],
  ['Boleto', 'BOL', 'pagar', '#f59e0b', false],
  ['Nota Fiscal', 'NF', 'ambos', '#0ea5e9', false],
  ['Recibo', 'REC', 'ambos', '#14b8a6', false],
  ['Duplicata', 'DUP', 'ambos', '#a855f7', false],
  ['Guia de Imposto', 'GUIA', 'pagar', '#ef4444', false],
  ['Contrato', 'CTR', 'ambos', '#64748b', false],
  ['PIX/Transferência', 'PIX', 'ambos', '#10b981', false],
  ['Débito Automático', 'DA', 'pagar', '#f97316', false],
  ['Outros', 'OUT', 'ambos', '#9ca3af', false],
]

// Seed numa instrução só e só com a tabela VAZIA: rodar de novo (ou em dois cold starts ao mesmo
// tempo) não duplica, e o que o usuário apagou/renomeou não volta.
export function sqlSeedTiposDocumento() {
  const params = []
  const values = SEED_TIPOS_DOCUMENTO.map(([nome, sigla, natureza, cor, sistema], i) => {
    const b = params.length
    params.push(nome, sigla, natureza, cor, sistema, i + 1)
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::boolean, $${b + 6}::integer)`
  })
  return {
    sql: `INSERT INTO tipos_documento (nome, sigla, natureza, cor, sistema, ordem)
      SELECT * FROM (VALUES ${values.join(', ')}) AS v(nome, sigla, natureza, cor, sistema, ordem)
      WHERE NOT EXISTS (SELECT 1 FROM tipos_documento)`,
    params,
  }
}

// Tabelas que ganham a coluna. Os nomes são CONFIRMADOS no information_schema antes do ALTER:
// tabela ausente vira erro explícito, em vez de um ALTER que cria nada e um sync que falha depois.
export const TABELAS_COM_TIPO = ['agendamentos', 'lancamentos']
export const SQL_TABELAS_EXISTENTES = `SELECT DISTINCT table_name FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = ANY($1) AND column_name = 'id'`

// Idempotente; roda uma vez por cold start EM CADA BANCO ("já rodei" por database).
const pronto = registroPorBanco()
// `q` = query (pool) ou o q de uma transação.
export async function ensureTiposDocumentoSchema(q = query) {
  const cache = q === query // só o pool memoriza; um q de teste/transação sempre executa
  if (cache && pronto.jaRodou()) return
  await q(DDL_TIPOS_DOCUMENTO)
  const { sql, params } = sqlSeedTiposDocumento()
  await q(sql, params)
  const existentes = new Set((await q(SQL_TABELAS_EXISTENTES, [TABELAS_COM_TIPO])).map(r => r.table_name))
  const faltando = TABELAS_COM_TIPO.filter(t => !existentes.has(t))
  if (faltando.length) throw new Error(`tipos_documento: tabela(s) não encontrada(s): ${faltando.join(', ')}`)
  for (const t of TABELAS_COM_TIPO) {
    await q(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS tipo_documento_id TEXT`)
    await q(`CREATE INDEX IF NOT EXISTS idx_${t}_tipo_documento ON ${t} (tipo_documento_id)`)
  }
  if (cache) pronto.marcar()
}

// Valida/normaliza o corpo de POST/PUT. Devolve { erro } ou { dados: { nome, sigla, natureza, cor, ativo, ordem } }.
export function normalizarTipoBody(body) {
  const nome = String(body?.nome || '').trim()
  const sigla = String(body?.sigla || '').trim().toUpperCase()
  const natureza = String(body?.natureza || 'ambos')
  if (!nome) return { erro: 'nome é obrigatório' }
  if (!sigla) return { erro: 'sigla é obrigatória' }
  if (sigla.length > SIGLA_MAX) return { erro: `sigla deve ter até ${SIGLA_MAX} caracteres` }
  if (!NATUREZAS.includes(natureza)) return { erro: "natureza deve ser 'pagar', 'receber' ou 'ambos'" }
  const cor = String(body?.cor || '').trim() || null
  const ordem = body?.ordem == null || body.ordem === '' ? null : Number(body.ordem)
  return { dados: { nome, sigla, natureza, cor, ativo: body?.ativo == null ? true : !!body.ativo, ordem } }
}

// Atualização em massa do tipo nos agendamentos — numa transação (o UPDATE é um comando só, mas o
// BEGIN/COMMIT do withTransaction garante tudo-ou-nada se a lista crescer para mais de um comando).
// Devolve também o valor ANTERIOR de cada um (para o histórico de alterações).
export const SQL_TIPO_EM_MASSA_AGENDAMENTOS = `WITH antes AS (
    SELECT id, tipo_documento_id AS antes FROM agendamentos WHERE id = ANY($1) FOR UPDATE
  )
  UPDATE agendamentos a SET tipo_documento_id = $2 FROM antes WHERE a.id = antes.id
  RETURNING a.id, antes.antes`

// Usos de um tipo (decide entre excluir de fato e só inativar).
export const SQL_USOS_TIPO = `SELECT
    (SELECT COUNT(*) FROM agendamentos WHERE tipo_documento_id = $1)::int AS agendamentos,
    (SELECT COUNT(*) FROM lancamentos WHERE tipo_documento_id = $1)::int AS lancamentos`
