import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { normalizarLayout } from './import-layouts.js'

// /api/import-layouts num Postgres de verdade (PGlite): modelos por usuário, upsert por
// (usuário, tipo, assinatura), um usuário não vê nem apaga o modelo do outro.
const estado = vi.hoisted(() => ({ db: null, user: 'u1' }))
vi.mock('./_db.js', () => ({
  query: async (sql, params = []) => (await estado.db.query(sql, params)).rows,
  parseBody: async (req) => req.body || {},
}))
vi.mock('./_auth.js', () => ({ requireAuth: (req) => { req.user = { id: estado.user }; return true } }))
vi.mock('./_ambiente.js', () => ({ comAmbiente: (h) => h }))
vi.mock('./_conexao.js', () => ({ registroPorBanco: () => ({ jaRodou: () => false, marcar() {} }) }))

const { default: handler } = await import('./import-layouts.js')
const resposta = () => ({ statusCode: 200, body: undefined, headers: {}, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader(k, v) { this.headers[k] = v } })
const chamar = async (method, { body, url = '/api/import-layouts', user = 'u1' } = {}) => {
  estado.user = user
  const res = resposta()
  await handler({ method, body, url, headers: {} }, res)
  return res
}
const MODELO = { nome: 'Bradesco cartão', banco: 'Bradesco', tipo: 'cartao', assinatura: 'data|historico|valor', mapeamento: { linhaCabecalho: 0, colData: 0, colDescricao: 1, colValor: 2, formatoData: 'dmy', decimal: ',', sinalDespesa: 'negativo', ignorar: ['saldo'] } }

// PGlite inicializa na 1ª consulta: aqui (hookTimeout 30 s), não dentro do teste (5 s com a suíte em paralelo).
beforeEach(async () => { estado.db = new PGlite(); await estado.db.query('SELECT 1') })

describe('/api/import-layouts', () => {
  it('cria a tabela, grava e lista só os do usuário', async () => {
    const r = await chamar('POST', { body: MODELO })
    expect(r.statusCode).toBe(200)
    expect(typeof r.body.layout.id).toBe('string')
    await chamar('POST', { body: { ...MODELO, nome: 'do outro' }, user: 'u2' })
    const l = await chamar('GET')
    expect(l.body.layouts.map(x => x.nome)).toEqual(['Bradesco cartão'])
  })
  it('upsert pela assinatura: salvar de novo atualiza, não duplica', async () => {
    await chamar('POST', { body: MODELO })
    await chamar('POST', { body: { ...MODELO, nome: 'Bradesco (novo nome)' } })
    const l = await chamar('GET')
    expect(l.body.layouts).toHaveLength(1)
    expect(l.body.layouts[0].nome).toBe('Bradesco (novo nome)')
  })
  it('apagar: só o próprio', async () => {
    const { body } = await chamar('POST', { body: MODELO })
    const outro = await chamar('DELETE', { url: `/api/import-layouts?id=${body.layout.id}`, user: 'u2' })
    expect(outro.body.apagados).toBe(0)
    const meu = await chamar('DELETE', { url: `/api/import-layouts?id=${body.layout.id}` })
    expect(meu.body.apagados).toBe(1)
  })
  it('valida o mapeamento', () => {
    expect(normalizarLayout({ ...MODELO, tipo: 'x' }).erro).toMatch(/Tipo/)
    expect(normalizarLayout({ ...MODELO, mapeamento: { colData: 0 } }).erro).toMatch(/incompleto/)
    expect(normalizarLayout({ ...MODELO, mapeamento: { colData: 0, colDescricao: 1, colDebito: 2, colCredito: 3 } }).layout.mapeamento.colValor).toBeNull()
  })
})
