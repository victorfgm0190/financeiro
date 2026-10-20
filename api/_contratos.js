import { pode, temTodosPerfis } from '../src/lib/permissoes.js'

// MÓDULO DE CONTRATOS — validação e guardas comuns às rotas api/contrato*.js. As tabelas do módulo
// ficam FORA do /api/sync genérico: só estas rotas as leem e gravam, campo a campo (lista branca).

const DATA = /^\d{4}-\d{2}-\d{2}$/
const texto = (max) => (v) => {
  if (v == null || v === '') return { v: null }
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
// Link do anexo vira href na ficha: só http(s), nunca javascript: e afins.
const link = (v) => {
  if (v == null || v === '') return { v: null }
  const s = String(v).trim().slice(0, 1000)
  return /^https?:\/\/\S+$/i.test(s) ? { v: s } : { erro: 'link deve começar com http:// ou https://' }
}

export const CAMPOS_CONTRATO = {
  perfil_id: texto(80),
  tipo: umDe(['pagar', 'receber'], { obrigatorio: true }),
  modalidade: umDe(['aluguel', 'servico', 'outro'], { obrigatorio: true }),
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
}
const PADROES = { modalidade: 'aluguel', periodicidade: 'mensal', indice_reajuste: 'IPCA', status: 'ativo' }

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
  return { dados }
}

export function normalizarItem(it) {
  const descricao = String(it?.descricao || '').trim().slice(0, 200)
  if (!descricao) return { erro: 'item sem descrição' }
  const grupo = umDe(['condominio', 'iptu', 'seguro', 'outro'])(it.grupo || 'outro')
  const resp = umDe(['inquilino', 'proprietario'])(it.responsavel || 'inquilino')
  const valor = numero()(it.valor_previsto)
  if (grupo.erro || resp.erro || valor.erro) return { erro: `item "${descricao}": ${grupo.erro || resp.erro || valor.erro}` }
  return {
    item: {
      descricao, grupo: grupo.v, responsavel: resp.v, valor_previsto: valor.v,
      categoria_id: texto(80)(it.categoria_id).v, ativo: it.ativo !== false,
    },
  }
}

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
  await q('DELETE FROM contrato_itens WHERE contrato_id = $1', [contratoId])
  const out = []
  for (const it of itens) {
    const [row] = await q(
      `INSERT INTO contrato_itens (contrato_id, descricao, grupo, responsavel, valor_previsto, categoria_id, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [contratoId, it.descricao, it.grupo, it.responsavel, it.valor_previsto, it.categoria_id, it.ativo],
    )
    out.push(row)
  }
  return out
}

// Hoje no fuso do Brasil (a Vercel roda em UTC: depois das 21h já seria amanhã).
export const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

// NUMERIC chega do pg como texto: as linhas saem com número de verdade.
const NUMERICOS = ['valor_base', 'percentual_fixo', 'bonificacao_valor', 'valor_condominio_previsto', 'valor_previsto', 'percentual', 'valor_anterior', 'valor_novo']
export function comNumeros(row) {
  if (!row) return row
  const out = { ...row }
  for (const k of NUMERICOS) if (k in out && out[k] != null) out[k] = Number(out[k])
  return out
}
