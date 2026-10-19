import process from 'node:process'
import crypto from 'node:crypto'

// SENHA DO USUÁRIO POSTGRES DE CADA AMBIENTE, cifrada para morar no central (ambientes.db_senha_cifrada).
// AES-256-GCM com a chave FINUP_DB_KEY (32 bytes em base64, variável da Vercel — nunca no banco nem
// no git). O texto é amarrado ao ambiente (AAD = "<ambiente.id>|<database_name>"): copiar a cifra
// de um ambiente para outro não decifra. Formato: v1.<iv>.<tag>.<cifra>, tudo base64url.
// Nada aqui loga ou devolve a senha em mensagem de erro.

const VERSAO = 'v1'

export class ErroCifra extends Error {
  constructor(message) {
    super(message)
    this.name = 'ErroCifra'
  }
}

export function chaveDoBanco(env = process.env) {
  const bruta = env.FINUP_DB_KEY
  if (!bruta) throw new ErroCifra('FINUP_DB_KEY não configurada')
  const chave = Buffer.from(String(bruta).trim(), 'base64')
  if (chave.length !== 32) throw new ErroCifra('FINUP_DB_KEY inválida (precisa de 32 bytes em base64)')
  return chave
}

export const aadDoAmbiente = (ambienteId, databaseName) => `${ambienteId}|${databaseName}`

export function cifrarSenha(senha, aad, env = process.env) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chaveDoBanco(env), iv)
  c.setAAD(Buffer.from(aad, 'utf8'))
  const cifra = Buffer.concat([c.update(String(senha), 'utf8'), c.final()])
  return [VERSAO, iv, c.getAuthTag(), cifra].map(x => (typeof x === 'string' ? x : x.toString('base64url'))).join('.')
}

export function decifrarSenha(texto, aad, env = process.env) {
  const partes = String(texto || '').split('.')
  if (partes.length !== 4 || partes[0] !== VERSAO) throw new ErroCifra('Senha cifrada em formato desconhecido')
  const [, iv, tag, cifra] = partes.map(p => Buffer.from(p, 'base64url'))
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chaveDoBanco(env), iv)
    d.setAAD(Buffer.from(aad, 'utf8'))
    d.setAuthTag(tag)
    return Buffer.concat([d.update(cifra), d.final()]).toString('utf8')
  } catch (err) {
    if (err instanceof ErroCifra) throw err
    throw new ErroCifra('Não foi possível decifrar a senha do banco (chave ou ambiente não conferem)')
  }
}
