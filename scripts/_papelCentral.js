// PAPEL PRÓPRIO DO BANCO CENTRAL (R7, Fase 3 — scripts/db-usuario-ambiente.js). O central não guarda a
// própria senha: a URL do finup_central_app vai para a linha CENTRAL_APP_DATABASE_URL do .env.local,
// de onde o Victor copia para a CENTRAL_DATABASE_URL da Vercel. Nada aqui imprime o valor.

export const NOME_ENV_CENTRAL_APP = 'CENTRAL_APP_DATABASE_URL'

const reLinha = (nome) => new RegExp(`^[ \\t]*${nome}[ \\t]*=.*$`, 'm')
const reLinhas = (nome) => new RegExp(`^[ \\t]*${nome}[ \\t]*=.*(\\r?\\n|$)`, 'gm')

// Valor da variável `nome` no texto de um .env (null se não houver).
export function lerLinhaEnv(texto, nome) {
  const m = String(texto).match(reLinha(nome))
  return m ? m[0].slice(m[0].indexOf('=') + 1).trim() : null
}

// Texto sem as linhas da variável `nome` (o resto fica intacto).
export const removerLinhaEnv = (texto, nome) => String(texto).replace(reLinhas(nome), '')

// Texto com `nome=valor` numa linha própria no fim (sem aspas, sem espaço), trocando a anterior se
// houver. Mantém o fim de linha do arquivo (\r\n ou \n).
export function definirLinhaEnv(texto, nome, valor) {
  if (/[\s"'#]/.test(String(valor))) throw new Error(`valor de ${nome} com espaço, aspas ou #`)
  const eol = String(texto).includes('\r\n') ? '\r\n' : '\n'
  let base = removerLinhaEnv(texto, nome)
  if (base && !base.endsWith('\n')) base += eol
  return `${base}${nome}=${valor}${eol}`
}

// URL do papel no central: a do admin (mesmo host, database e parâmetros de TLS) com outro usuário e senha.
export function urlDoPapel(urlAdminDoBanco, papel, senha) {
  const u = new URL(urlAdminDoBanco)
  u.username = papel
  u.password = senha
  return u.toString()
}

// Opções separadas do pg (host, port, database, user, password) a partir de uma URL — com
// connectionString o pg ignora o `database` passado à parte, e o verificar troca de banco.
export function opcoesDaUrl(url) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  }
}
