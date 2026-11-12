import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import process from 'node:process'
import { _definirFabricaDePool } from './_conexao.js'
import { montarAmbiente, prepararChamadas, chamar, USUARIOS as U } from './_testes/ambientePerfis.js'
import { responderErro, protegerRespostasDeErro, mensagemParaLog, MENSAGEM_GENERICA } from './_erro.js'
import { fail } from './_bem.js'
import { ErroHttp } from './_usuarios.js'

const ajustes = (await import('./reserve-adjustments.js')).default
const regras = (await import('./contrato-regras.js')).default

// Auditoria 11/2026, item 5 (P1): o navegador nunca recebe a mensagem crua do Postgres (nem de
// outra falha interna). Recebe uma frase genérica (ou a tradução da lista branca) + código de
// referência; o detalhe vai só para o log, sem o valor entre aspas.

function resFalso() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}
const erroPg = (code, message, extra = {}) => Object.assign(new Error(message), { code, severity: 'ERROR', ...extra })

let log
beforeEach(() => { log = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('responderErro', () => {
  it('erro do banco → frase genérica + referência; nada da mensagem crua vai ao navegador', () => {
    const res = resFalso()
    responderErro(res, erroPg('42703', 'column "valor_secreto" of relation "lancamentos" does not exist', { table: 'lancamentos', column: 'valor_secreto' }), 'api/x')
    expect(res.statusCode).toBe(500)
    expect(res.body.ref).toMatch(/^ERR-[0-9A-F]{6}$/)
    expect(res.body.error).toBe(`${MENSAGEM_GENERICA} (código ${res.body.ref})`)
    expect(JSON.stringify(res.body)).not.toMatch(/lancamentos|valor_secreto|column/)
    // O log tem a referência e o detalhe técnico.
    const linha = log.mock.calls.flat().join(' ')
    expect(linha).toContain(res.body.ref)
    expect(linha).toContain('code=42703')
    expect(linha).toContain('table=lancamentos')
  })
  it('lista branca de SQLSTATE: tradução em português, ainda com referência', () => {
    const res = resFalso()
    responderErro(res, erroPg('23505', 'duplicate key value violates unique constraint "contas_pkey"', { detail: 'Key (id)=(acc_1) already exists.' }), 'api/x')
    expect(res.body.error).toBe(`Já existe um registro com esses dados. (código ${res.body.ref})`)
    expect(res.body.ref).toBeTruthy()
    expect(JSON.stringify(res.body)).not.toContain('contas_pkey')
  })
  it('o log não leva o valor entre aspas (pode ser dado financeiro) nem o detail do Postgres', () => {
    expect(mensagemParaLog('invalid input syntax for type numeric: "1234,56"')).toBe('invalid input syntax for type numeric: "…"')
    responderErro(resFalso(), erroPg('23505', 'duplicate key value violates unique constraint "x"', { detail: 'Key (valor)=(98765) already exists.' }), 'api/x')
    expect(log.mock.calls.flat().join(' ')).not.toContain('98765')
  })
  it('erro de negócio (4xx escrito por nós) passa como está', () => {
    const res = resFalso()
    responderErro(res, new ErroHttp(403, 'Sem permissão para esta conta'), 'api/x')
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Sem permissão para esta conta' })
  })
  it('5xx do próprio erro (serviço externo) mantém o status, com a mensagem genérica', () => {
    const res = resFalso()
    responderErro(res, Object.assign(new Error('O serviço recusou: chave sk-123 inválida'), { status: 502 }), 'api/x')
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toContain(MENSAGEM_GENERICA)
  })
  it('campos extras (ex.: codigoBanco do sync) continuam', () => {
    const res = resFalso()
    responderErro(res, erroPg('23502', 'null value in column "amount"', { column: 'amount' }), 'api/sync', { extra: { codigoBanco: '23502', coluna: 'amount' } })
    expect(res.body).toMatchObject({ codigoBanco: '23502', coluna: 'amount', error: expect.stringContaining('Falta um campo obrigatório.') })
  })
})

describe('rede de segurança (comAmbiente) e patrimônio (fail)', () => {
  it('resposta 500 com mensagem crua é trocada; 4xx e 503 escritos por nós passam', () => {
    const r1 = protegerRespostasDeErro(resFalso(), 'api/x')
    r1.status(500).json({ error: 'relation "pendencias_integridade" does not exist', code: '42P01' })
    expect(r1.body.error).toBe(`${MENSAGEM_GENERICA} (código ${r1.body.ref})`)
    expect(JSON.stringify(r1.body)).not.toContain('pendencias_integridade')
    const r2 = protegerRespostasDeErro(resFalso(), 'api/x')
    r2.status(409).json({ error: 'Pendência não está mais pendente' })
    expect(r2.body.error).toBe('Pendência não está mais pendente')
    const r3 = protegerRespostasDeErro(resFalso(), 'api/x')
    r3.status(503).json({ error: 'Assistente indisponível: a chave da IA não está configurada.' })
    expect(r3.body.error).toContain('Assistente indisponível')
  })
  it('bem/financiamento/consórcio: fail(500) não repassa a mensagem do banco', () => {
    const res = resFalso()
    fail(res, 500, 'invalid input syntax for type uuid: "abc"')
    expect(res.body).toMatchObject({ success: false, error: expect.stringContaining(MENSAGEM_GENERICA) })
    expect(res.body.ref).toBeTruthy()
    const r4 = resFalso()
    fail(r4, 400, 'Informe a data')
    expect(r4.body).toEqual({ success: false, error: 'Informe a data' })
  })
})

describe('numa rota de verdade (PGlite)', () => {
  let amb
  let env
  beforeAll(async () => { amb = await montarAmbiente() }, 180_000)
  beforeEach(() => { env = { ...process.env }; prepararChamadas(amb); log = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { process.env = env })
  afterAll(() => { _definirFabricaDePool(null) })

  it('data inválida no ajuste da reserva: o navegador recebe a tradução, não o texto do Postgres', async () => {
    const r = await chamar(amb, ajustes, U.admin, { url: '/api/reserve-adjustments', body: { id: 'aj_x', function_id: 'rf_a', data: 'trinta de fevereiro', valor: 1 } })
    expect(r.statusCode).toBe(500)
    expect(r.body.ref).toMatch(/^ERR-/)
    expect(r.body.error).not.toMatch(/syntax|type date|trinta|reserve_adjustments/)
  })
  it('tabela ainda não criada: frase com "não existe" (o app segue sem o recurso), sem o nome da tabela', async () => {
    await amb.central.query(`UPDATE ambientes SET modulos = '{"contratos": true}'::jsonb WHERE sigla = 'vm'`)
    await amb.q('ALTER TABLE contrato_regras_itens RENAME TO contrato_regras_itens_off')
    try {
      const r = await chamar(amb, regras, U.admin, { method: 'GET', url: '/api/contrato-regras' })
      expect(r.statusCode).toBe(500)
      expect(r.body.error).toContain('não existe')
      expect(r.body.error).not.toContain('contrato_regras_itens')
    } finally {
      await amb.q('ALTER TABLE contrato_regras_itens_off RENAME TO contrato_regras_itens')
    }
  })
})
