import { AsyncLocalStorage } from 'node:async_hooks'

// QUEM está fazendo a requisição, para o histórico de alterações: o usuário do login (do JWT, nunca
// do corpo) e o autor declarado pelo app no header X-Finup-Autor ('assistente' enquanto a prévia do
// Assistente IA está aberta; 'sistema' em rotinas automáticas). Sem header = 'usuario'.
// requireAuth() grava aqui; inserirHistorico() lê — sem precisar passar o req por todas as funções.
export const AUTORES = ['usuario', 'assistente', 'sistema']
const contexto = new AsyncLocalStorage()

export function autorDoHeader(req) {
  const h = req?.headers || {}
  const v = String(h['x-finup-autor'] || h['X-Finup-Autor'] || '').trim().toLowerCase()
  return AUTORES.includes(v) ? v : 'usuario'
}

export function quemDoReq(req) {
  const u = req?.user || {}
  return { usuarioId: u.id ? String(u.id) : null, usuarioNome: u.nome ? String(u.nome) : (u.username ? String(u.username) : null), autor: autorDoHeader(req) }
}

// Vale para o resto da requisição (o handler continua no mesmo contexto assíncrono).
export function definirQuem(req) {
  contexto.enterWith(quemDoReq(req))
}

export const quemAtual = () => contexto.getStore() || null

// Para testes e rotinas: roda fn com um "quem" explícito.
export const comQuem = (quem, fn) => contexto.run(quem, fn)
