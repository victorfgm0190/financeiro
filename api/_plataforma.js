import process from 'node:process'
import { centralQuery } from './_central.js'
import { registroPorBanco, nomeDatabaseCentral } from './_conexao.js'
import { normUser, ErroHttp } from './_usuarios.js'
import {
  STATUS_CLIENTE, documentoValido, normalizarDocumento, normalizarTelefone, problemaTelefone, normalizarSigla, problemaSigla, candidatasSigla,
} from '../src/lib/plataforma.js'

// CLIENTES DA PLATAFORMA (fase de teste, aprovação manual): pedidos do formulário público e o
// Controle de Clientes do administrador da plataforma. Nada aqui cria usuário nem dá acesso aos
// dados deste banco — o ambiente de cada cliente (sigla.finup.app.br + banco próprio) é a Etapa 2.
//
// ETAPA 2: as tabelas plataforma_* moram no banco CENTRAL da plataforma (api/_central.js), fora
// dos bancos dos ambientes. Por isso nenhuma delas referencia tabelas do app. (As cópias antigas no
// neondb ficam até o Victor conferir e apagar.)

export const DDL_PLATAFORMA = `
  CREATE TABLE IF NOT EXISTS plataforma_clientes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    tipo_pessoa TEXT NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF', 'PJ')),
    documento TEXT,
    empresa TEXT,
    sigla TEXT CHECK (sigla = lower(sigla)),
    origem TEXT NOT NULL DEFAULT 'formulario' CHECK (origem IN ('formulario', 'manual')),
    como_conheceu TEXT,
    status TEXT NOT NULL DEFAULT 'pedido'
      CHECK (status IN ('pedido', 'aprovado', 'ativo', 'suspenso', 'cancelado', 'recusado')),
    plano TEXT,
    valor_mensal NUMERIC(12, 2),
    dia_vencimento INT CHECK (dia_vencimento BETWEEN 1 AND 31),
    limite_usuarios INT CHECK (limite_usuarios >= 1),
    observacoes TEXT,
    aceite_termos_em TIMESTAMPTZ,
    aceite_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_plataforma_clientes_sigla ON plataforma_clientes (sigla);
  CREATE INDEX IF NOT EXISTS idx_plataforma_clientes_email ON plataforma_clientes (lower(email));
  CREATE INDEX IF NOT EXISTS idx_plataforma_clientes_status ON plataforma_clientes (status);

  CREATE TABLE IF NOT EXISTS plataforma_historico (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    cliente_id TEXT NOT NULL REFERENCES plataforma_clientes(id) ON DELETE CASCADE,
    evento TEXT NOT NULL,
    detalhe TEXT,
    autor TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_plataforma_historico_cliente ON plataforma_historico (cliente_id, created_at);

  -- Envios do formulário público por IP (limite por hora). Linhas com mais de 1 dia são apagadas.
  CREATE TABLE IF NOT EXISTS plataforma_cadastro_envios (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ip TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_plataforma_cadastro_envios_ip ON plataforma_cadastro_envios (ip, created_at);
`

// As tabelas moram no banco CENTRAL (api/_central.js). "Já rodei" por database.
const pronto = registroPorBanco()
export async function ensurePlataformaSchema(q = centralQuery) {
  const chave = `central:${nomeDatabaseCentral()}`
  if (pronto.jaRodou(chave)) return
  await q(DDL_PLATAFORMA)
  pronto.marcar(chave)
}
// Testes: cada banco novo precisa do DDL de novo.
export const _resetSchemaPronto = () => pronto.limpar()

// ─── Administrador da plataforma ────────────────────────────────────────────────────────────────
// PLATAFORMA_ADMIN (Vercel) = username de quem controla os clientes. NÃO é o nível 'admin' comum:
// um admin de organização sem esse username recebe 403. Sem a variável, ninguém entra.
export function ehAdminPlataforma(user, env = process.env) {
  const alvo = normUser(env.PLATAFORMA_ADMIN)
  return !!alvo && normUser(user?.username) === alvo
}

// ─── Validação ──────────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function texto(v, max) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

function inteiro(v, nome, min, max) {
  if (v === '' || v == null) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroHttp(400, `${nome} inválido`)
  return n
}

function dinheiro(v) {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new ErroHttp(400, 'Valor mensal inválido')
  return Math.round(n * 100) / 100
}

// Body → colunas do cliente validadas. `parcial` (edição): só valida o que veio no body, mas
// tipo_pessoa/documento/empresa sempre conferem juntos com o estado `atual`.
export function validarCliente(body = {}, { parcial = false, atual = null, exigirDocumento = true } = {}) {
  const tem = (k) => !parcial || k in body
  const out = {}

  if (tem('nome')) {
    out.nome = texto(body.nome, 150)
    if (!out.nome) throw new ErroHttp(400, 'Informe o nome')
  }
  if (tem('email')) {
    out.email = texto(body.email, 200)?.toLowerCase() ?? null
    if (!out.email) throw new ErroHttp(400, 'Informe o e-mail')
    if (!EMAIL_RE.test(out.email)) throw new ErroHttp(400, 'E-mail inválido')
  }
  // Telefone: obrigatório no pedido público; celular, ou fixo com `nao_whatsapp: true`.
  if (tem('telefone')) {
    out.telefone = normalizarTelefone(body.telefone) || null
    if (!out.telefone && exigirDocumento) throw new ErroHttp(400, 'Informe o telefone/WhatsApp')
    const problema = out.telefone && problemaTelefone(out.telefone, { naoWhatsApp: body.nao_whatsapp === true })
    if (problema) throw new ErroHttp(400, problema)
  }
  if (tem('tipo_pessoa') || tem('documento') || tem('empresa')) {
    const tipo = 'tipo_pessoa' in body ? body.tipo_pessoa : (atual?.tipo_pessoa ?? 'PF')
    if (!['PF', 'PJ'].includes(tipo)) throw new ErroHttp(400, 'Tipo de pessoa inválido')
    const doc = normalizarDocumento(tipo, 'documento' in body ? body.documento : atual?.documento) || null
    if (doc ? !documentoValido(tipo, doc) : exigirDocumento) throw new ErroHttp(400, tipo === 'PJ' ? 'CNPJ inválido' : 'CPF inválido')
    const empresa = texto('empresa' in body ? body.empresa : atual?.empresa, 150)
    if (tipo === 'PJ' && !empresa && exigirDocumento) throw new ErroHttp(400, 'Informe a empresa')
    Object.assign(out, { tipo_pessoa: tipo, documento: doc, empresa: tipo === 'PJ' ? empresa : null })
  }
  if (tem('sigla')) {
    const sigla = normalizarSigla(body.sigla) || null
    if (sigla || !parcial) {
      const problema = problemaSigla(sigla)
      if (problema) throw new ErroHttp(400, problema)
    }
    out.sigla = sigla
  }
  if (tem('como_conheceu')) out.como_conheceu = texto(body.como_conheceu, 300)
  if ('plano' in body) out.plano = texto(body.plano, 60)
  if ('valor_mensal' in body) out.valor_mensal = dinheiro(body.valor_mensal)
  if ('dia_vencimento' in body) out.dia_vencimento = inteiro(body.dia_vencimento, 'Dia de vencimento', 1, 31)
  if ('limite_usuarios' in body) out.limite_usuarios = inteiro(body.limite_usuarios, 'Limite de usuários', 1, 10000)
  if ('observacoes' in body) out.observacoes = texto(body.observacoes, 5000)
  return out
}

// ─── Sigla no banco ─────────────────────────────────────────────────────────────────────────────

// Ocupada = de outro cliente OU de um ambiente já existente (que não seja o do próprio cliente).
// Os dois no banco central.
export async function siglaOcupada(q, sigla, idAtual = null) {
  const [r] = await q(
    `SELECT 1 FROM plataforma_clientes WHERE sigla = $1 AND id IS DISTINCT FROM $2
     UNION ALL SELECT 1 FROM ambientes WHERE sigla = $1 AND cliente_id IS DISTINCT FROM $2 LIMIT 1`,
    [sigla, idAtual])
  return !!r
}

export async function sugerirSiglaLivre(q, nome) {
  const candidatas = candidatasSigla(nome)
  if (!candidatas.length) return null
  const ocupadas = new Set((await q(
    'SELECT sigla FROM plataforma_clientes WHERE sigla = ANY($1) UNION SELECT sigla FROM ambientes WHERE sigla = ANY($1)',
    [candidatas])).map(r => r.sigla))
  return candidatas.find(s => !ocupadas.has(s)) || null
}

// { disponivel, motivo?, sugestao? } — usado pelo endpoint público e pelo formulário.
// `idAtual`: cliente em edição — a própria sigla não conta como ocupada.
export async function checarSigla(q, siglaBruta, nome = '', idAtual = null) {
  const sigla = normalizarSigla(siglaBruta)
  const problema = problemaSigla(sigla)
  if (!problema && !(await siglaOcupada(q, sigla, idAtual))) return { sigla, disponivel: true }
  const sugestao = nome ? await sugerirSiglaLivre(q, nome) : null
  return { sigla, disponivel: false, motivo: problema || 'Essa sigla já está em uso', sugestao }
}

// ─── Leitura e histórico ────────────────────────────────────────────────────────────────────────

export async function registrarHistorico(q, clienteId, evento, detalhe = null, autor = null) {
  await q('INSERT INTO plataforma_historico (cliente_id, evento, detalhe, autor) VALUES ($1, $2, $3, $4)',
    [clienteId, evento, detalhe, autor])
}

export async function buscarCliente(q, id, { travar = false } = {}) {
  const [c] = await q(`SELECT * FROM plataforma_clientes WHERE id = $1${travar ? ' FOR UPDATE' : ''}`, [String(id)])
  return c ? { ...c, valor_mensal: c.valor_mensal == null ? null : Number(c.valor_mensal) } : null
}

export const statusValido = (s) => STATUS_CLIENTE.includes(s)

// IP de quem chamou (Vercel: x-real-ip / primeiro do x-forwarded-for).
export function ipDoReq(req) {
  const h = req.headers || {}
  const fwd = String(h['x-forwarded-for'] || '').split(',')[0].trim()
  return String(h['x-real-ip'] || fwd || req.socket?.remoteAddress || 'desconhecido').slice(0, 64)
}

export function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}
