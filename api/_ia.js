import { query } from './_db.js'
import { registroPorBanco } from './_conexao.js'
import { contextoPerfis } from './_permissoesApi.js'

// ASSISTENTE IA (etapa 1): o que o /api/assistente, o /api/ia-pre-lancamentos e o /api/ia-apelidos
// compartilham — DDL viva das tabelas ia_*, contexto de cadastros que vai para o modelo, validação
// dos ids que o modelo devolve e registro de consumo. Nada aqui grava lançamento, agendamento ou
// saldo: o app grava pelo mesmo fluxo do lançamento manual (AppContext), depois da prévia.
//
// Favorecido e centro de custo não têm id no banco: o "id" deles é o NOME (favorecidos.name e
// configuracoes.cost_centers). Categoria: caminho = category_group › name.

// DDL viva (a cópia em supabase/schema.sql é documentação; clientes novos recebem a migração
// supabase/migrations/2026-10-28_ia_assistente.sql). Roda uma vez por cold start, POR BANCO.
const schemaPronto = registroPorBanco()
export async function ensureIaSchema() {
  if (schemaPronto.jaRodou()) return
  await query(`CREATE TABLE IF NOT EXISTS ia_pre_lancamentos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo TEXT NOT NULL CHECK (tipo IN ('lancamento', 'agendamento')),
    payload JSONB NOT NULL,
    texto_original TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'efetivado', 'descartado')),
    lancamento_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS ia_apelidos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo TEXT NOT NULL CHECK (tipo IN ('categoria', 'conta', 'favorecido', 'descricao_fatura')),
    termo TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    usos INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, termo)
  )`)
  await query(`CREATE TABLE IF NOT EXISTS ia_uso (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ambiente TEXT,
    ferramenta TEXT,
    tokens_entrada INTEGER NOT NULL DEFAULT 0,
    tokens_saida INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  schemaPronto.marcar()
}

// Termo de apelido: minúsculo, sem acento, espaços simples. "Combustível " → "combustivel".
export function normalizarTermo(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120)
}

export const TIPOS_APELIDO = ['categoria', 'conta', 'favorecido', 'descricao_fatura']

// Hoje em America/Sao_Paulo (YYYY-MM-DD).
export const hojeSaoPaulo = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const somaDias = (ymd, dias) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Categoria visível para os perfis do usuário? perfil_ids vazio/NULL = todos (src/lib/categoriasPerfil.js).
const categoriaDosPerfis = (perfilIds, perfis) =>
  !perfis || !Array.isArray(perfilIds) || perfilIds.length === 0 || perfilIds.some(p => perfis.includes(p))

// Cadastros do ambiente, já recortados pelos perfis permitidos do usuário.
// → { contas, categorias, favorecidos, centros, apelidos, maisUsados, idx }
export async function montarContexto(user, q = query) {
  const ctxPerfis = await contextoPerfis(q, user)
  const perfis = ctxPerfis?.perfis || null

  const contasRows = await q(
    `SELECT id, name, apelido, type, bank, profile_id FROM contas
      WHERE COALESCE(active, true) = true ORDER BY "order" NULLS LAST, name`)
  const contas = contasRows.filter(c => !ctxPerfis || ctxPerfis.contas.has(c.id))

  const catRows = await q('SELECT id, name, type, category_group, perfil_ids FROM categorias ORDER BY category_group NULLS LAST, name')
  const categorias = catRows
    .filter(c => categoriaDosPerfis(c.perfil_ids, perfis))
    .map(c => ({ id: c.id, tipo: c.type, caminho: c.category_group ? `${c.category_group} › ${c.name}` : c.name }))

  const favorecidos = (await q('SELECT name FROM favorecidos ORDER BY name LIMIT 2000')).map(r => r.name).filter(Boolean)

  const [cfg] = await q('SELECT cost_centers FROM configuracoes WHERE id = 1')
  const centros = Array.isArray(cfg?.cost_centers) ? cfg.cost_centers.filter(x => typeof x === 'string' && x.trim()) : []

  const idx = {
    contas: new Map(contas.map(c => [c.id, c])),
    categorias: new Map(categorias.map(c => [c.id, c])),
    favorecidos: new Map(favorecidos.map(n => [normalizarTermo(n), n])),
    centros: new Map(centros.map(n => [normalizarTermo(n), n])),
  }

  // Apelidos aprendidos: só os que ainda apontam para um cadastro existente e visível
  // (renomeado/excluído → ignorado, nunca vira valor inválido).
  const apRows = await q('SELECT tipo, termo, ref_id, usos FROM ia_apelidos ORDER BY usos DESC, updated_at DESC LIMIT 400')
  const apelidos = apRows.map(a => ({ ...a, ref_id: refValido(a.tipo, a.ref_id, idx) })).filter(a => a.ref_id)

  // Mais usados nos últimos 90 dias (top 30 de cada), só entre os cadastros visíveis.
  const desde = somaDias(hojeSaoPaulo(), -90)
  const top = async (col) => (await q(
    `SELECT ${col} AS ref, COUNT(*)::int AS n FROM lancamentos
      WHERE date >= $1 AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col} ORDER BY n DESC LIMIT 60`, [desde]))
  const maisUsados = {
    categorias: (await top('category_id')).filter(r => idx.categorias.has(r.ref)).slice(0, 30).map(r => r.ref),
    contas: (await top('account_id')).filter(r => idx.contas.has(r.ref)).slice(0, 30).map(r => r.ref),
    favorecidos: (await top('payee')).map(r => idx.favorecidos.get(normalizarTermo(r.ref))).filter(Boolean).slice(0, 30),
  }

  return { contas, categorias, favorecidos, centros, apelidos, maisUsados, idx }
}

// ref_id de um apelido ainda válido? Devolve o valor canônico (nome exato do favorecido) ou null.
function refValido(tipo, ref, idx) {
  if (tipo === 'categoria') return idx.categorias.has(ref) ? ref : null
  if (tipo === 'conta') return idx.contas.has(ref) ? ref : null
  if (tipo === 'favorecido') return idx.favorecidos.get(normalizarTermo(ref)) || null
  return null // descricao_fatura: etapa 2 (Importar Fatura)
}

const TIPO_CONTA = { checking: 'conta corrente', savings: 'poupança', credit: 'cartão de crédito', investment: 'investimento', cash: 'dinheiro', asset: 'bem', liability: 'dívida' }

// Bloco de cadastros (texto estável → prompt caching). Sem data nem nada que mude a cada pedido.
export function textoCadastros(ctx) {
  const linhas = []
  linhas.push('## CONTAS (id | nome | apelido | tipo | banco)')
  for (const c of ctx.contas) linhas.push(`${c.id} | ${c.name} | ${c.apelido || '-'} | ${TIPO_CONTA[c.type] || c.type} | ${c.bank || '-'}`)
  linhas.push('', '## CATEGORIAS (id | caminho | tipo: expense=despesa, income=receita, both=ambos)')
  for (const c of ctx.categorias) linhas.push(`${c.id} | ${c.caminho} | ${c.tipo}`)
  linhas.push('', '## FAVORECIDOS (o id é o próprio nome)')
  linhas.push(ctx.favorecidos.join(' ; ') || '(nenhum)')
  linhas.push('', '## CENTROS DE CUSTO (o id é o próprio nome)')
  linhas.push(ctx.centros.join(' ; ') || '(nenhum)')
  linhas.push('', '## APELIDOS APRENDIDOS (tipo | termo | id) — têm prioridade sobre o seu palpite')
  for (const a of ctx.apelidos) linhas.push(`${a.tipo} | ${a.termo} | ${a.ref_id}`)
  if (!ctx.apelidos.length) linhas.push('(nenhum)')
  linhas.push('', '## MAIS USADOS NOS ÚLTIMOS 90 DIAS (do mais para o menos usado)')
  linhas.push(`categorias: ${ctx.maisUsados.categorias.join(', ') || '-'}`)
  linhas.push(`contas: ${ctx.maisUsados.contas.join(', ') || '-'}`)
  linhas.push(`favorecidos: ${ctx.maisUsados.favorecidos.join(' ; ') || '-'}`)
  return linhas.join('\n')
}

export const INSTRUCOES = `Você é o assistente de lançamentos do Finup, um app brasileiro de controle financeiro.
O usuário descreve em português (texto, voz transcrita ou foto de comprovante/boleto) algo que quer registrar ou consultar.
Responda SEMPRE chamando exatamente UMA ferramenta, sem texto fora dela:
- registrar_lancamento: despesa, receita ou transferência que já aconteceu ("gastei", "paguei", "recebi", "lance").
- criar_agendamento: algo a pagar/receber no futuro ou recorrente. "Contas a pagar" e "contas a receber" = agendamento.
- consultar_saldo: o usuário quer saber o saldo de uma conta. Você NÃO sabe saldos: só indique a conta.
- perguntar: falta algo essencial (ex.: o valor) ou há ambiguidade real (ex.: duas contas Itaú). Dê de 2 a 6 opções curtas; quando forem contas/categorias, use os nomes do cadastro.

Regras:
1. Use SÓ ids que existem nos cadastros abaixo. Favorecido e centro de custo: o id é o nome exato da lista.
2. Os APELIDOS APRENDIDOS têm prioridade sobre o seu palpite: se o termo do apelido aparece no pedido, use o id dele.
3. Entenda sinônimos e variações (ex.: "combustível", "abastecer", "posto" → categoria de Gasolina/Combustível; "mercado" → Supermercado). Na dúvida entre categorias parecidas, prefira a mais usada nos últimos 90 dias.
4. Data padrão = a data de hoje informada no pedido. "Ontem", "dia 5" etc. são relativos a ela. Formato YYYY-MM-DD.
5. Se não tiver certeza de um campo, deixe null e dê confiança baixa (< 0.5). Não invente.
6. Favorecido que não existe no cadastro: deixe favorecido_id null e coloque o nome em favorecido_novo.
7. Em "termos", copie o trecho EXATO do pedido que levou a cada escolha (ex.: categoria: "combustível").
8. Descrição: curta e clara (ex.: "Combustível", "Conta de luz"), sem o valor.
9. Valor sempre positivo, em reais (ponto como separador decimal no JSON).
10. Não dê conselho financeiro nem de investimento e não responda assuntos fora de lançamentos/saldos. Se pedirem, use perguntar explicando que você só registra lançamentos, agendamentos e consulta saldos.`

const NUM_CONF = { type: 'number', minimum: 0, maximum: 1 }
const CAMPOS_BASE = {
  tipo: { type: 'string', enum: ['despesa', 'receita', 'transferencia'] },
  valor: { type: ['number', 'null'], description: 'Valor em reais, positivo' },
  data: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  conta_id: { type: ['string', 'null'] },
  conta_destino_id: { type: ['string', 'null'], description: 'Só em transferência' },
  categoria_id: { type: ['string', 'null'] },
  centro_custo_id: { type: ['string', 'null'], description: 'Nome do centro de custo' },
  favorecido_id: { type: ['string', 'null'], description: 'Nome exato de um favorecido existente' },
  favorecido_novo: { type: ['string', 'null'], description: 'Nome de favorecido que ainda não existe' },
  descricao: { type: ['string', 'null'] },
  confianca: {
    type: 'object',
    description: 'Confiança de 0 a 1 em cada campo',
    properties: { valor: NUM_CONF, data: NUM_CONF, conta: NUM_CONF, conta_destino: NUM_CONF, categoria: NUM_CONF, favorecido: NUM_CONF, centro_custo: NUM_CONF, descricao: NUM_CONF },
  },
  termos: {
    type: 'object',
    description: 'Trecho do pedido que levou a cada escolha',
    properties: { categoria: { type: ['string', 'null'] }, conta: { type: ['string', 'null'] }, favorecido: { type: ['string', 'null'] } },
  },
}
export const RECORRENCIAS = ['once', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']

export const FERRAMENTAS = [
  {
    name: 'registrar_lancamento',
    description: 'Prepara um lançamento (despesa, receita ou transferência) para o usuário revisar. Não grava nada.',
    input_schema: { type: 'object', properties: CAMPOS_BASE, required: ['tipo', 'valor', 'data', 'conta_id', 'categoria_id', 'descricao', 'confianca', 'termos'] },
  },
  {
    name: 'criar_agendamento',
    description: 'Prepara um agendamento (conta a pagar/receber, recorrente ou única) para o usuário revisar. Não grava nada.',
    input_schema: {
      type: 'object',
      properties: {
        ...CAMPOS_BASE,
        vencimento: { type: ['string', 'null'], description: 'Primeiro vencimento, YYYY-MM-DD' },
        recorrencia: { type: 'string', enum: RECORRENCIAS, description: 'once = única' },
        parcelas: { type: ['integer', 'null'], description: 'Número de parcelas, se for parcelado; null = contínuo' },
      },
      required: ['tipo', 'valor', 'vencimento', 'recorrencia', 'conta_id', 'categoria_id', 'descricao', 'confianca', 'termos'],
    },
  },
  {
    name: 'consultar_saldo',
    description: 'O usuário quer ver o saldo de uma conta. O app calcula o saldo; você só indica a conta.',
    input_schema: { type: 'object', properties: { conta_id: { type: ['string', 'null'] } }, required: ['conta_id'] },
  },
  {
    name: 'perguntar',
    description: 'Pergunta ao usuário quando falta algo essencial ou há ambiguidade.',
    input_schema: {
      type: 'object',
      properties: { pergunta: { type: 'string' }, opcoes: { type: 'array', items: { type: 'string' }, maxItems: 6 } },
      required: ['pergunta', 'opcoes'],
    },
  },
]

const DATA = /^\d{4}-\d{2}-\d{2}$/
const txt = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const conf = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0)
const TIPO_CAT = { despesa: 'expense', receita: 'income' }

// Apelido cujo termo é exatamente o trecho que o modelo citou → vence o palpite.
function porApelido(ctx, tipo, termo) {
  const t = normalizarTermo(termo)
  if (!t) return null
  return ctx.apelidos.find(a => a.tipo === tipo && a.termo === t)?.ref_id || null
}

// Valida a saída do modelo: id que não existe (ou não é visível ao usuário) vira null com confiança 0.
export function validarParametros(ferramenta, input, ctx, hoje = hojeSaoPaulo()) {
  const p = input && typeof input === 'object' ? input : {}
  if (ferramenta === 'perguntar') {
    const opcoes = Array.isArray(p.opcoes) ? p.opcoes.map(o => txt(o, 80)).filter(Boolean).slice(0, 6) : []
    return { pergunta: txt(p.pergunta, 300) || 'Pode detalhar o que você quer registrar?', opcoes }
  }
  if (ferramenta === 'consultar_saldo') {
    return { conta_id: ctx.idx.contas.has(p.conta_id) ? p.conta_id : null }
  }

  const termos = {
    categoria: txt(p.termos?.categoria, 60), conta: txt(p.termos?.conta, 60), favorecido: txt(p.termos?.favorecido, 60),
  }
  const c = p.confianca || {}
  const confianca = {
    valor: conf(c.valor), data: conf(c.data), conta: conf(c.conta), conta_destino: conf(c.conta_destino),
    categoria: conf(c.categoria), favorecido: conf(c.favorecido), centro_custo: conf(c.centro_custo), descricao: conf(c.descricao),
  }
  const tipo = ['despesa', 'receita', 'transferencia'].includes(p.tipo) ? p.tipo : 'despesa'
  const zera = (chave) => { confianca[chave] = 0; return null }

  const valor = Number(p.valor) > 0 ? Math.round(Number(p.valor) * 100) / 100 : zera('valor')
  const data = DATA.test(String(p.data || '')) ? p.data : hoje

  let contaId = porApelido(ctx, 'conta', termos.conta) || p.conta_id
  if (!ctx.idx.contas.has(contaId)) contaId = zera('conta')
  let destinoId = tipo === 'transferencia' ? p.conta_destino_id : null
  if (destinoId && (!ctx.idx.contas.has(destinoId) || destinoId === contaId)) destinoId = zera('conta_destino')

  let categoriaId = tipo === 'transferencia' ? null : (porApelido(ctx, 'categoria', termos.categoria) || p.categoria_id)
  const cat = categoriaId ? ctx.idx.categorias.get(categoriaId) : null
  if (categoriaId && (!cat || (cat.tipo !== 'both' && cat.tipo !== TIPO_CAT[tipo]))) categoriaId = zera('categoria')

  const favApelido = porApelido(ctx, 'favorecido', termos.favorecido)
  let favorecido = favApelido || (p.favorecido_id ? ctx.idx.favorecidos.get(normalizarTermo(p.favorecido_id)) || null : null)
  let favorecidoNovo = null
  if (!favorecido && p.favorecido_id) confianca.favorecido = 0
  const novo = txt(p.favorecido_novo, 80)
  if (!favorecido && novo) {
    const existente = ctx.idx.favorecidos.get(normalizarTermo(novo))
    if (existente) favorecido = existente
    else favorecidoNovo = novo
  }

  const centro = p.centro_custo_id ? ctx.idx.centros.get(normalizarTermo(p.centro_custo_id)) || zera('centro_custo') : null

  const out = {
    tipo, valor, data, conta_id: contaId || null, conta_destino_id: destinoId || null, categoria_id: categoriaId || null,
    centro_custo_id: centro, favorecido_id: favorecido, favorecido_novo: favorecidoNovo,
    descricao: txt(p.descricao, 120), confianca, termos,
  }
  if (ferramenta === 'criar_agendamento') {
    out.vencimento = DATA.test(String(p.vencimento || '')) ? p.vencimento : data
    out.recorrencia = RECORRENCIAS.includes(p.recorrencia) ? p.recorrencia : 'once'
    out.parcelas = Number.isInteger(p.parcelas) && p.parcelas > 1 && p.parcelas <= 360 ? p.parcelas : null
  }
  return out
}

// Consumo da chamada (ia_uso). Falha aqui não derruba a resposta.
export async function registrarUso({ ambiente, ferramenta, usage }, q = query) {
  const entrada = (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0)
  try {
    await q('INSERT INTO ia_uso (ambiente, ferramenta, tokens_entrada, tokens_saida) VALUES ($1, $2, $3, $4)',
      [ambiente || null, ferramenta || null, entrada, usage?.output_tokens || 0])
  } catch (err) {
    console.error('[ia] uso não registrado:', err.message)
  }
}
