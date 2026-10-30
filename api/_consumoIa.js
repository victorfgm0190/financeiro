// CONSUMO DE IA (Clientes Finup → aba "Consumo de IA"): leitura AGREGADA do ia_uso de um ambiente e
// os preços (ia_precos, no central). Só COUNT/SUM por dia × ferramenta × modelo — nenhuma linha de
// uso, usuário ou pedido sai do banco. As colunas de consumo (modelo, duracao_ms, stop_reason,
// tokens_cache_*) são lidas por to_jsonb: banco sem a migração 2026-10-30_ia_uso_consumo ainda
// responde (vazias). O custo é calculado no app (src/lib/consumoIa.js).

export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// $1..$2 = período 'AAAA-MM-DD' no fuso de São Paulo (inclusive).
export const SQL_CONSUMO = `
  WITH u AS (SELECT created_at, ferramenta, tokens_entrada, tokens_saida, to_jsonb(ia_uso) AS j FROM ia_uso
              WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
                AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
  SELECT to_char((created_at AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia,
         COALESCE(ferramenta, '?') AS ferramenta,
         j->>'modelo' AS modelo,
         COUNT(*)::int AS chamadas,
         COALESCE(SUM(tokens_entrada), 0)::bigint AS entrada,
         COALESCE(SUM((j->>'tokens_cache_leitura')::bigint), 0)::bigint AS leitura,
         COALESCE(SUM((j->>'tokens_cache_criacao')::bigint), 0)::bigint AS criacao,
         COALESCE(SUM(tokens_saida), 0)::bigint AS saida,
         COUNT(*) FILTER (WHERE (j->>'com_imagem')::boolean)::int AS imagens,
         COALESCE(SUM((j->>'duracao_ms')::bigint), 0)::bigint AS duracao_soma,
         COUNT(j->>'duracao_ms')::int AS duracao_n,
         COUNT(*) FILTER (WHERE j->>'stop_reason' = 'max_tokens')::int AS cortadas
    FROM u
   GROUP BY 1, 2, 3
   ORDER BY 1, 2, 3`

// Grupos do ambiente → formato de src/lib/consumoIa.js. Ambiente que nunca usou a IA (sem ia_uso) → [].
export async function consumoDoBanco(q, { inicio, fim, ambiente }) {
  const [t] = await q("SELECT to_regclass('ia_uso') IS NOT NULL AS existe")
  if (!t?.existe) return []
  const linhas = await q(SQL_CONSUMO, [inicio, fim])
  return linhas.map(r => ({
    ambiente, dia: r.dia, ferramenta: r.ferramenta, modelo: r.modelo || null,
    chamadas: Number(r.chamadas), entrada: Number(r.entrada), leitura: Number(r.leitura), criacao: Number(r.criacao),
    saida: Number(r.saida), imagens: Number(r.imagens), duracaoSoma: Number(r.duracao_soma), duracaoN: Number(r.duracao_n),
    cortadas: Number(r.cortadas),
  }))
}

const SQL_PRECOS = `SELECT id, modelo, to_char(vigencia, 'YYYY-MM-DD') AS vigencia,
  entrada::float AS entrada, saida::float AS saida, cache_leitura::float AS cache_leitura, cache_criacao::float AS cache_criacao
  FROM ia_precos ORDER BY modelo, vigencia DESC`

// Preços do central. Sem a tabela (migração central 2026-10-30_ia_precos pendente) → { precos: [], semTabela }.
export async function listarPrecos(q) {
  try {
    return { precos: await q(SQL_PRECOS), semTabela: false }
  } catch (err) {
    if (err?.code === '42P01') return { precos: [], semTabela: true }
    throw err
  }
}

const valorPreco = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

// Corpo do POST de preço → { erro } ou { dados }.
export function validarPreco(body) {
  const modelo = String(body?.modelo || '').trim()
  const vigencia = String(body?.vigencia || '').trim()
  if (!modelo || modelo.length > 100) return { erro: 'Informe o modelo.' }
  if (!DATA_RE.test(vigencia)) return { erro: 'Informe a data de vigência.' }
  const dados = { modelo, vigencia }
  for (const k of ['entrada', 'saida', 'cache_leitura', 'cache_criacao']) {
    const v = valorPreco(body?.[k])
    if (v === undefined) return { erro: 'Preço inválido: use um número (US$ por milhão de tokens) ou deixe vazio.' }
    dados[k] = v
  }
  return { dados }
}

// Grava (cria ou atualiza pela chave modelo + vigência).
export async function salvarPreco(q, d) {
  const [r] = await q(`INSERT INTO ia_precos (modelo, vigencia, entrada, saida, cache_leitura, cache_criacao)
                       VALUES ($1, $2, $3, $4, $5, $6)
                       ON CONFLICT (modelo, vigencia) DO UPDATE SET entrada = EXCLUDED.entrada, saida = EXCLUDED.saida,
                         cache_leitura = EXCLUDED.cache_leitura, cache_criacao = EXCLUDED.cache_criacao, updated_at = now()
                       RETURNING id`, [d.modelo, d.vigencia, d.entrada, d.saida, d.cache_leitura, d.cache_criacao])
  return r.id
}
