import { query } from '../_db.js'
import { requireAuth } from '../_auth.js'
import { ensureBemSchema, fail, explicarErro } from '../_bem.js'

// /api/bem/migrate — dispara e confere o schema do módulo de bem imobilizado.
//
//   GET  → só inspeciona (read-only): diz o que existe e o que falta.
//   POST → roda ensureBemSchema({ force: true }) e devolve a mesma inspeção depois.
//
// Existe porque o DDL do módulo mora só em api/_bem.js: supabase/schema.sql não tem nada
// dele, e até a primeira chamada a um endpoint de bem o banco não tem as colunas. Quando
// essa primeira chamada falha (schema parcial de uma execução interrompida), todo endpoint
// de bem devolve 500 e não há como forçar a correção — este endpoint é essa saída.
//
// `force` é essencial: sem ele um instance quente com o cache já resolvido devolveria
// sucesso sem reexecutar nada.

const COLUNAS_ESPERADAS = {
  contas: [
    'valor_nota_fiscal', 'tipo_bem', 'descricao', 'foi_vendido', 'data_venda',
    'bem_destino_id', 'categoria_perda_bem_id', 'categoria_ganho_bem_id',
    'categoria_prestacao_id', 'categoria_taxa_finan_id',
  ],
  lancamentos: ['bem_id'],
  agendamentos: ['financing_installment_id'],
}

const TABELAS_ESPERADAS = ['financing', 'financing_installments', 'bem_movimentacoes']

// Colunas que precisam ser TEXT porque guardam ids no formato do app ('cat_...', 'acc_...').
// Uma delas como uuid é o que produz "invalid input syntax for type uuid" ao parametrizar um
// bem — o DDL sozinho não denuncia isso, porque ADD COLUMN IF NOT EXISTS não retipa.
const COLUNAS_TEXT_OBRIGATORIO = new Set([
  'contas.bem_destino_id',
  'contas.categoria_perda_bem_id', 'contas.categoria_ganho_bem_id',
  'contas.categoria_prestacao_id', 'contas.categoria_taxa_finan_id',
  'lancamentos.bem_id', 'agendamentos.financing_installment_id',
])

async function inspecionar() {
  const alvos = Object.entries(COLUNAS_ESPERADAS)
  const rows = await query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1)`,
    [alvos.map(([t]) => t)],
  )
  const presentes = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))
  const tipoDe = new Map(rows.map(r => [`${r.table_name}.${r.column_name}`, r.data_type]))

  const colunas = {}
  let faltando = []
  for (const [tabela, cols] of alvos) {
    const ausentes = cols.filter(c => !presentes.has(`${tabela}.${c}`))
    colunas[tabela] = {
      total: cols.length,
      presentes: cols.length - ausentes.length,
      faltando: ausentes,
      tipos: Object.fromEntries(
        cols.filter(c => presentes.has(`${tabela}.${c}`))
          .map(c => [c, tipoDe.get(`${tabela}.${c}`)]),
      ),
    }
    faltando = faltando.concat(ausentes.map(c => `${tabela}.${c}`))
  }

  // Tipo errado é tão fatal quanto coluna ausente, e bem menos óbvio: reportamos junto.
  const tipoErrado = [...COLUNAS_TEXT_OBRIGATORIO]
    .filter(k => presentes.has(k) && tipoDe.get(k) !== 'text')
    .map(k => `${k} é ${tipoDe.get(k)}, esperado text`)

  const tabRows = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = ANY($1)`,
    [TABELAS_ESPERADAS],
  )
  const tabPresentes = new Set(tabRows.map(t => t.table_name))
  const tabelasFaltando = TABELAS_ESPERADAS.filter(t => !tabPresentes.has(t))

  return {
    ok: faltando.length === 0 && tabelasFaltando.length === 0 && tipoErrado.length === 0,
    colunas,
    tabelas: { esperadas: TABELAS_ESPERADAS, faltando: tabelasFaltando },
    tipoErrado,
    faltando: faltando.concat(tabelasFaltando.map(t => `tabela ${t}`)),
  }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET' && req.method !== 'POST') {
    return fail(res, 405, 'Método não permitido')
  }

  try {
    if (req.method === 'GET') {
      return res.json({ success: true, migrado: false, ...(await inspecionar()) })
    }

    await ensureBemSchema({ force: true })
    const depois = await inspecionar()
    return res.json({
      success: true,
      migrado: true,
      // ok=false aqui significa que o DDL rodou sem erro mas o schema ainda não bate —
      // sinal de que o problema não é a migração e sim permissão/objeto divergente.
      ...depois,
    })
  } catch (err) {
    console.error('[api/bem/migrate]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
