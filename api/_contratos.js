import { pode, temTodosPerfis } from '../src/lib/permissoes.js'

// MÓDULO DE CONTRATOS — validação e guardas comuns às rotas api/contrato*.js. As tabelas do módulo
// ficam FORA do /api/sync genérico: só estas rotas as leem e gravam, campo a campo (lista branca).

const DATA = /^\d{4}-\d{2}-\d{2}$/
const texto = (max) => (v) => {
  if (v == null || v === '') return { v: null }
  if (typeof v !== 'string' && typeof v !== 'number') return { erro: 'deve ser texto' }
  const s = String(v).trim().slice(0, max)
  return { v: s || null }
}
const umDe = (lista, { obrigatorio = false } = {}) => (v) => {
  if (v == null || v === '') return obrigatorio ? { erro: 'obrigatório' } : { v: null }
  return lista.includes(v) ? { v } : { erro: `deve ser ${lista.join(', ')}` }
}
const data = ({ obrigatorio = false } = {}) => (v) => {
  if (v == null || v === '') return obrigatorio ? { erro: 'obrigatória' } : { v: null }
  return DATA.test(String(v)) ? { v: String(v) } : { erro: 'data inválida (AAAA-MM-DD)' }
}
const inteiro = (min, max, { padrao = null } = {}) => (v) => {
  if (v == null || v === '') return { v: padrao }
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? { v: n } : { erro: `deve ser inteiro entre ${min} e ${max}` }
}
const numero = ({ min = 0, max = 1e12, padrao = null } = {}) => (v) => {
  if (v == null || v === '') return { v: padrao }
  const n = Math.round(Number(v) * 10000) / 10000
  return Number.isFinite(n) && n >= min && n <= max ? { v: n } : { erro: 'valor inválido' }
}
const booleano = (padrao = false) => (v) => ({ v: v == null ? padrao : v === true || v === 'true' })
// Lista de competências 'AAAA-MM' (meses sem cobrança): sem repetição, em ordem, no máximo 600.
const competencias = (v) => {
  if (v == null || v === '') return { v: [] }
  if (!Array.isArray(v)) return { erro: 'deve ser uma lista de meses AAAA-MM' }
  if (v.length > 600) return { erro: 'no máximo 600 meses' }
  const out = [...new Set(v.map(String))].sort()
  return out.every(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) ? { v: out } : { erro: 'mês inválido (AAAA-MM)' }
}
// Uma competência 'AAAA-MM' (opcional).
const competencia = (v) => {
  if (v == null || v === '') return { v: null }
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v)) ? { v: String(v) } : { erro: 'mês inválido (AAAA-MM)' }
}
// Link do anexo vira href na ficha: só http(s), nunca javascript: e afins.
const link = (v) => {
  if (v == null || v === '') return { v: null }
  const s = String(v).trim().slice(0, 1000)
  return /^https?:\/\/\S+$/i.test(s) ? { v: s } : { erro: 'link deve começar com http:// ou https://' }
}

export const CAMPOS_CONTRATO = {
  perfil_id: texto(80),
  tipo: umDe(['pagar', 'receber'], { obrigatorio: true }),
  modalidade: umDe(['aluguel', 'servico', 'assinatura', 'seguro', 'outro'], { obrigatorio: true }),
  numero: texto(60),
  objeto: texto(200),
  favorecido: texto(200),
  favorecido_condominio: texto(200),
  data_inicio: data({ obrigatorio: true }),
  data_fim: data(),
  renovacao_automatica: booleano(false),
  aviso_previo_dias: inteiro(0, 365, { padrao: 30 }),
  valor_base: numero({ padrao: 0 }),
  periodicidade: umDe(['mensal', 'trimestral', 'semestral', 'anual', 'unica'], { obrigatorio: true }),
  dia_vencimento: inteiro(1, 31),
  dia_vencimento_condominio: inteiro(1, 31),
  categoria_id: texto(80),
  categoria_condominio_id: texto(80),
  conta_id: texto(80),
  centro_custo: texto(120),
  tipo_documento_id: texto(80),
  indice_reajuste: umDe(['IPCA', 'IGPM', 'FIXO', 'NENHUM'], { obrigatorio: true }),
  percentual_fixo: numero({ min: -100, max: 1000 }),
  mes_base_reajuste: inteiro(1, 12),
  proximo_reajuste: data(),
  bonificacao_valor: numero({ padrao: 0 }),
  bonificacao_meses: inteiro(0, 600, { padrao: 0 }),
  tipo_imovel: umDe(['casa', 'apartamento', 'sala', 'galpao', 'outro']),
  tem_condominio: booleano(false),
  valor_condominio_previsto: numero(),
  link_anexo: link,
  status: umDe(['ativo', 'encerrado', 'rescindido', 'suspenso'], { obrigatorio: true }),
  observacao: texto(2000),
  meses_sem_cobranca: competencias,
  credito_abatimento: umDe(['mes_seguinte', 'proximo_pendente'], { obrigatorio: true }),
  // Contrato a receber por administradora (migração 2026-11-07b): ver COLS_REPASSE.
  modo_repasse: booleano(false),
  contraparte_nome: texto(200),
  contraparte_documento: texto(30),
  bem_id: texto(80),
  dia_repasse: inteiro(1, 31),
  repasse_meses_depois: inteiro(0, 3, { padrao: 1 }),
  valor_primeiro_mes: numero(),
  saldo_inicial_adm: numero({ min: -1e12 }),
  saldo_inicial_competencia: competencia,
  // Taxa de administração (migração 2026-11-07c).
  taxa_adm_pct: numero({ min: 0, max: 100 }),
  taxa_adm_base: umDe(['bruto', 'bruto_menos_taxas'], { obrigatorio: true }),
  categoria_taxa_adm_id: texto(80),
}
const PADROES = { modalidade: 'aluguel', periodicidade: 'mensal', indice_reajuste: 'IPCA', status: 'ativo', credito_abatimento: 'mes_seguinte', taxa_adm_base: 'bruto' }

// Colunas do modo repasse (migração 2026-11-07b) e o valor "neutro" de cada uma: num banco sem a
// migração, gravar um valor diferente do neutro é recusado (409) em vez de sumir em silêncio.
export const COLS_REPASSE = {
  modo_repasse: false, contraparte_nome: null, contraparte_documento: null, bem_id: null, dia_repasse: null,
  repasse_meses_depois: 1, valor_primeiro_mes: null, saldo_inicial_adm: null, saldo_inicial_competencia: null,
  taxa_adm_pct: null, taxa_adm_base: 'bruto', categoria_taxa_adm_id: null,
}
export const MSG_SEM_REPASSE = 'O banco deste ambiente ainda não tem a atualização de contrato a receber por administradora. Nada foi gravado — avise o suporte para atualizar o banco.'
// Campos do repasse com valor de verdade que o banco não tem → lista (vazia = pode gravar).
export const repasseSemColuna = (dados, existem) =>
  Object.keys(COLS_REPASSE).filter(k => k in dados && !existem.has(k) && (dados[k] ?? null) !== COLS_REPASSE[k])

// Colunas JSONB: o pg mandaria a lista como array do Postgres; vai como texto JSON.
const JSONB = new Set(['meses_sem_cobranca', 'itens', 'valores_parcelas'])
export const valorColuna = (k, v) => (JSONB.has(k) && v != null ? JSON.stringify(v) : v)

// Colunas que o banco do ambiente já tem (as da migração 2026-11-03 só existem depois de aplicada):
// INSERT/UPDATE gravam só essas — o deploy não quebra o cadastro antes do SQL rodar.
export async function colunasDe(q, tabela) {
  const rows = await q('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [tabela])
  return new Set(rows.map(r => r.column_name))
}

// Body → { erro } | { dados }. parcial = só os campos presentes (PUT).
export function normalizarContrato(body, { parcial = false } = {}) {
  const b = body && typeof body === 'object' ? body : {}
  const dados = {}
  for (const [campo, validar] of Object.entries(CAMPOS_CONTRATO)) {
    if (parcial && !(campo in b)) continue
    const bruto = campo in b ? b[campo] : PADROES[campo]
    const r = validar(bruto)
    if (r.erro) return { erro: `${campo}: ${r.erro}` }
    dados[campo] = r.v
  }
  const fim = 'data_fim' in dados ? dados.data_fim : null
  const ini = 'data_inicio' in dados ? dados.data_inicio : null
  if (fim && ini && fim < ini) return { erro: 'data_fim: antes do início' }
  if (dados.indice_reajuste === 'FIXO' && dados.percentual_fixo == null && !parcial) return { erro: 'percentual_fixo: obrigatório com reajuste FIXO' }
  if ('bonificacao_valor' in dados && dados.bonificacao_valor > 0 && !(dados.bonificacao_meses > 0)) {
    return { erro: 'bonificacao_meses: obrigatório quando há bonificação' }
  }
  if (dados.modo_repasse && 'tipo' in dados && dados.tipo !== 'receber') return { erro: 'modo_repasse: só em contrato a receber' }
  if (dados.saldo_inicial_adm && !parcial && !dados.saldo_inicial_competencia) {
    return { erro: 'saldo_inicial_competencia: obrigatória com saldo inicial' }
  }
  if (!parcial) {
    if (dados.modo_repasse && !dados.dia_repasse) return { erro: 'dia_repasse: obrigatório com administradora' }
    if (!dados.categoria_id) return { erro: 'categoria_id: obrigatória' }
    if (dados.tem_condominio && !dados.categoria_condominio_id) return { erro: 'categoria_condominio_id: obrigatória com condomínio' }
  }
  return { dados }
}

export function normalizarItem(it) {
  const descricao = String(it?.descricao || '').trim().slice(0, 200)
  if (!descricao) return { erro: 'item sem descrição' }
  const grupo = umDe(['condominio', 'iptu', 'seguro', 'outro'])(it.grupo || 'outro')
  const resp = umDe(['inquilino', 'proprietario'])(it.responsavel || 'inquilino')
  const valor = numero()(it.valor_previsto)
  if (grupo.erro || resp.erro || valor.erro) return { erro: `item "${descricao}": ${grupo.erro || resp.erro || valor.erro}` }
  const item = {
    descricao, grupo: grupo.v, responsavel: resp.v, valor_previsto: valor.v,
    categoria_id: texto(80)(it.categoria_id).v, ativo: it.ativo !== false,
  }
  // Taxa da administradora cobrada no repasse (migração 2026-11-07c): tarifa fixa ou taxa única.
  if (it.tipo_repasse) {
    const r = normalizarTaxaRepasse(it, descricao, valor.v)
    if (r.erro) return r
    Object.assign(item, r.campos, { responsavel: 'proprietario' })
    return { item }
  }
  // Encargo/desconto que ENTRA na parcela (migração 2026-11-05): sinal, valor > 0, quantas parcelas
  // dura e em qual parcela do contrato está na 1ª dele (0 ou negativa: começou antes do contrato).
  if (it.na_parcela) {
    const sinal = umDe(['encargo', 'desconto'], { obrigatorio: true })(it.sinal)
    if (sinal.erro) return { erro: `item "${descricao}": sinal ${sinal.erro}` }
    if (!(valor.v > 0)) return { erro: `item "${descricao}": valor maior que zero` }
    const total = Number(it.parcelas_total)
    const inicio = Number(it.parcela_inicio)
    if (!Number.isInteger(total) || total < 1 || total > 1200) return { erro: `item "${descricao}": número de parcelas inválido` }
    if (!Number.isInteger(inicio) || inicio < -1200 || inicio > 1200) return { erro: `item "${descricao}": parcela de início inválida` }
    Object.assign(item, { na_parcela: true, sinal: sinal.v, parcelas_total: total, parcela_inicio: inicio })
  }
  return { item }
}

// Tarifa fixa (valor por competência, de/até) ou taxa única (total em parcelas de valor livre).
function normalizarTaxaRepasse(it, descricao, valor) {
  const tipo = umDe(['tarifa_fixa', 'taxa_unica'], { obrigatorio: true })(it.tipo_repasse)
  if (tipo.erro) return { erro: `item "${descricao}": tipo ${tipo.erro}` }
  if (!(valor > 0)) return { erro: `item "${descricao}": valor maior que zero` }
  const ini = competencia(it.vigencia_inicio)
  const fim = competencia(it.vigencia_fim)
  if (ini.erro || !ini.v) return { erro: `item "${descricao}": informe a competência inicial (AAAA-MM)` }
  if (fim.erro) return { erro: `item "${descricao}": competência final ${fim.erro}` }
  if (fim.v && fim.v < ini.v) return { erro: `item "${descricao}": competência final antes da inicial` }
  let valores = null
  if (tipo.v === 'taxa_unica') {
    const lista = Array.isArray(it.valores_parcelas) ? it.valores_parcelas : []
    if (!lista.length || lista.length > 120) return { erro: `item "${descricao}": informe de 1 a 120 parcelas` }
    valores = lista.map(v => Math.round(Number(v) * 100) / 100)
    if (valores.some(v => !Number.isFinite(v) || v <= 0)) return { erro: `item "${descricao}": parcela com valor inválido` }
  }
  const ded = it.dedutivel_ir == null ? null : it.dedutivel_ir === true || it.dedutivel_ir === 'true'
  return {
    campos: {
      tipo_repasse: tipo.v, valores_parcelas: valores, vigencia_inicio: ini.v,
      vigencia_fim: tipo.v === 'tarifa_fixa' ? fim.v : null, dedutivel_ir: ded,
    },
  }
}

// Colunas das taxas do repasse (só depois da migração 2026-11-07c).
export const COLS_ITEM_REPASSE = ['tipo_repasse', 'valores_parcelas', 'vigencia_inicio', 'vigencia_fim', 'dedutivel_ir']

// Composição de uma competência (contrato_competencias): itens tipados, valor com sinal.
const TIPOS_ITEM_COMP = ['aluguel', 'taxa_adm', 'tarifa', 'taxa_unica', 'despesa', 'benfeitoria', 'ajuste']
const NATUREZAS = ['iptu', 'condominio', 'consumo', 'manutencao', 'outra']
export function normalizarCompetencia(b) {
  const comp = competencia(b?.competencia)
  if (comp.erro || !comp.v) return { erro: 'competencia: obrigatória (AAAA-MM)' }
  const status = umDe(['aberta', 'fechada'], { obrigatorio: true })(b.status || 'aberta')
  if (status.erro) return { erro: `status: ${status.erro}` }
  const lista = Array.isArray(b.itens) ? b.itens : null
  if (!lista) return { erro: 'itens: lista obrigatória' }
  if (lista.length > 100) return { erro: 'itens: no máximo 100' }
  const itens = []
  for (const i of lista) {
    const tipo = umDe(TIPOS_ITEM_COMP, { obrigatorio: true })(i?.tipo)
    if (tipo.erro) return { erro: `item: tipo ${tipo.erro}` }
    const v = Math.round(Number(i.valor) * 100) / 100
    if (!Number.isFinite(v) || Math.abs(v) > 1e12) return { erro: `item "${i.descricao || i.tipo}": valor inválido` }
    const calc = i.valor_calculado == null ? null : Math.round(Number(i.valor_calculado) * 100) / 100
    if (calc != null && !Number.isFinite(calc)) return { erro: `item "${i.descricao || i.tipo}": valor calculado inválido` }
    const origem = i.origem === 'auto' ? 'auto' : 'manual'
    if (origem === 'manual' && !TIPOS_ITEM_COMP.slice(4).includes(tipo.v)) return { erro: `item "${i.descricao || i.tipo}": tipo automático marcado como manual` }
    const item = {
      chave: String(i.chave || '').slice(0, 80) || `m:${itens.length}`, tipo: tipo.v, descricao: String(i.descricao || '').trim().slice(0, 200),
      valor: v, categoria_id: texto(80)(i.categoria_id).v, dedutivel_ir: i.dedutivel_ir === true, origem,
    }
    if (origem === 'auto') Object.assign(item, { informado: i.informado === true, valor_calculado: calc })
    if (tipo.v === 'despesa') item.natureza = NATUREZAS.includes(i.natureza) ? i.natureza : 'outra'
    if (tipo.v === 'benfeitoria') item.somar_ao_bem = i.somar_ao_bem === true
    itens.push(item)
  }
  const obs = texto(2000)(b.observacao)
  return { dados: { competencia: comp.v, status: status.v, itens, observacao: obs.v } }
}
export const MSG_SEM_COMPOSICAO = 'O banco deste ambiente ainda não tem a atualização da composição do repasse. Nada foi gravado — avise o suporte para atualizar o banco.'

// Colunas dos encargos na parcela (só depois da migração 2026-11-05).
export const COLS_ENCARGO = ['na_parcela', 'sinal', 'parcelas_total', 'parcela_inicio']
export const MSG_SEM_ENCARGOS = 'O banco deste ambiente ainda não tem a atualização de encargos e descontos na parcela. Nada foi gravado — avise o suporte para atualizar o banco.'

export const TIPOS_EVENTO = ['criacao', 'reajuste', 'confirmacao_valor', 'aditivo', 'renovacao', 'rescisao', 'suspensao', 'vinculo', 'desvinculo', 'edicao_parcela']

export function normalizarEvento(e) {
  if (!TIPOS_EVENTO.includes(e?.tipo)) return { erro: 'tipo de evento inválido' }
  const d = data({ obrigatorio: true })(e.data_evento)
  if (d.erro) return { erro: `data_evento: ${d.erro}` }
  const pct = numero({ min: -1000, max: 100000 })(e.percentual)
  const va = numero({ min: -1e12 })(e.valor_anterior)
  const vn = numero({ min: -1e12 })(e.valor_novo)
  if (pct.erro || va.erro || vn.erro) return { erro: 'evento com número inválido' }
  const detalhes = e.detalhes && typeof e.detalhes === 'object' ? e.detalhes : {}
  if (JSON.stringify(detalhes).length > 50_000) return { erro: 'detalhes do evento grandes demais' }
  return {
    evento: {
      tipo: e.tipo, data_evento: d.v, indice: texto(20)(e.indice).v,
      percentual: pct.v, valor_anterior: va.v, valor_novo: vn.v, detalhes,
    },
  }
}

// Módulo ligado no plano do ambiente + permissão. GET também passa por aqui (o requireAuth não
// confere leitura). Devolve false depois de responder 403.
export function exigirModulo(req, res, acao = 'ver') {
  if (!pode(req.user, 'contratos', acao)) {
    res.status(403).json({ error: req.ambiente?.modulos?.contratos ? 'Sem permissão para Contratos' : 'Módulo Contratos não habilitado' })
    return false
  }
  return true
}

// Perfis permitidos do usuário: null = todos.
export const perfisDoUsuario = (user) => (temTodosPerfis(user?.perfis) ? null : user.perfis)

// O contrato (id) existe e é de um perfil que o usuário vê? Devolve a linha ou null.
export async function contratoVisivel(q, id, user) {
  const [c] = await q('SELECT * FROM contratos WHERE id = $1', [String(id || '')])
  if (!c) return null
  const perfis = perfisDoUsuario(user)
  if (perfis && !perfis.includes(c.perfil_id)) return null
  return c
}

export async function inserirEvento(q, contratoId, ev) {
  const [row] = await q(
    `INSERT INTO contrato_eventos (contrato_id, tipo, data_evento, indice, percentual, valor_anterior, valor_novo, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [contratoId, ev.tipo, ev.data_evento, ev.indice, ev.percentual, ev.valor_anterior, ev.valor_novo, JSON.stringify(ev.detalhes || {})],
  )
  return row
}

export async function substituirItens(q, contratoId, itens) {
  // Encargo na parcela num banco sem a migração: erro claro ANTES de apagar a lista (nada muda).
  const existem = await colunasDe(q, 'contrato_itens')
  const temEncargo = existem.has('na_parcela')
  const temRepasse = existem.has('tipo_repasse')
  if (!temEncargo && itens.some(it => it.na_parcela)) throw Object.assign(new Error(MSG_SEM_ENCARGOS), { status: 409, codigo: 'banco_desatualizado' })
  if (!temRepasse && itens.some(it => it.tipo_repasse)) throw Object.assign(new Error(MSG_SEM_COMPOSICAO), { status: 409, codigo: 'banco_desatualizado' })
  await q('DELETE FROM contrato_itens WHERE contrato_id = $1', [contratoId])
  const out = []
  for (const it of itens) {
    const cols = ['descricao', 'grupo', 'responsavel', 'valor_previsto', 'categoria_id', 'ativo', ...(temEncargo ? COLS_ENCARGO : []), ...(temRepasse ? COLS_ITEM_REPASSE : [])]
    const [row] = await q(
      `INSERT INTO contrato_itens (contrato_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
      [contratoId, ...cols.map(k => (k === 'na_parcela' ? !!it.na_parcela : valorColuna(k, it[k] ?? null)))],
    )
    out.push(row)
  }
  return out
}

// Hoje no fuso do Brasil (a Vercel roda em UTC: depois das 21h já seria amanhã).
export const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

// NUMERIC chega do pg como texto: as linhas saem com número de verdade.
const NUMERICOS = ['taxa_adm_pct', 'valor_primeiro_mes', 'saldo_inicial_adm', 'valor_base', 'percentual_fixo', 'bonificacao_valor', 'valor_condominio_previsto', 'valor_previsto', 'percentual', 'valor_anterior', 'valor_novo', 'valor', 'creditos_abertos']
export function comNumeros(row) {
  if (!row) return row
  const out = { ...row }
  for (const k of NUMERICOS) if (k in out && out[k] != null) out[k] = Number(out[k])
  return out
}

// ─── Entrega 2: regras de itens do boleto e créditos do proprietário ────────────────────────────

export function normalizarRegra(b) {
  const padrao = String(b?.padrao ?? '').trim().slice(0, 120)
  if (!padrao) return { erro: 'padrao: obrigatório' }
  const tipo = umDe(['comeca_com', 'contem'], { obrigatorio: true })(b.tipo_match || 'contem')
  const resp = umDe(['inquilino', 'proprietario'], { obrigatorio: true })(b.responsavel)
  if (tipo.erro) return { erro: `tipo_match: ${tipo.erro}` }
  if (resp.erro) return { erro: `responsavel: ${resp.erro}` }
  const obs = texto(300)(b.observacao)
  if (obs.erro) return { erro: `observacao: ${obs.erro}` }
  return { regra: { padrao, tipo_match: tipo.v, responsavel: resp.v, observacao: obs.v } }
}

// Itens de origem do crédito: [{ desc, valor }] (os do proprietário no boleto do condomínio).
function itensDoCredito(itens) {
  if (!Array.isArray(itens)) return { erro: 'itens: lista obrigatória' }
  if (itens.length > 100) return { erro: 'itens: no máximo 100' }
  const out = []
  for (const i of itens) {
    const desc = String(i?.desc ?? '').trim().slice(0, 200)
    const v = Math.round(Number(i?.valor) * 100) / 100
    if (!desc || !Number.isFinite(v)) return { erro: 'itens: cada item precisa de desc e valor' }
    out.push({ desc, valor: v })
  }
  return { itens: out }
}

export function normalizarCredito(b, { parcial = false } = {}) {
  const dados = {}
  const campos = {
    origem_lancamento_id: texto(120), origem_agendamento_id: texto(160), descricao: texto(200),
    valor: numero({ min: 0 }), data_origem: data(), status: umDe(['previsto', 'aberto', 'compensado']),
    compensado_em_lancamento_id: texto(120), compensado_em_agendamento_id: texto(160), data_compensacao: data(),
    destino_agendamento_id: texto(160),
  }
  for (const [k, validar] of Object.entries(campos)) {
    if (parcial && !(k in (b || {}))) continue
    const r = validar(b?.[k])
    if (r.erro) return { erro: `${k}: ${r.erro}` }
    dados[k] = r.v
  }
  if (!parcial || 'itens' in (b || {})) {
    const r = itensDoCredito(b?.itens ?? [])
    if (r.erro) return { erro: r.erro }
    dados.itens = r.itens
  }
  if (!parcial && dados.valor == null) return { erro: 'valor: obrigatório' }
  if (!parcial && !dados.status) dados.status = 'aberto'
  return { dados }
}
