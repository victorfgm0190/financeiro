import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { normalizarContrato } from './_contratos.js'
import { lerSerieSgs, comAcumulado12m, urlSgs, indiceAtual } from './indices.js'
import { regraDaRota, pode } from '../src/lib/permissoes.js'

// /api/contratos, /api/contrato-itens e /api/contrato-eventos num Postgres de verdade (PGlite), com a
// migração do módulo. Plano do ambiente, perfis permitidos, lista branca de campos, conta ≠ cartão.
const estado = vi.hoisted(() => ({ db: null, user: null, modulos: { contratos: true } }))
vi.mock('./_db.js', () => ({
  query: async (sql, params = []) => (await estado.db.query(sql, params)).rows,
  parseBody: async (req) => req.body || {},
  withTransaction: async (fn) => {
    await estado.db.query('BEGIN')
    try {
      const r = await fn(async (sql, params = []) => (await estado.db.query(sql, params)).rows)
      await estado.db.query('COMMIT')
      return r
    } catch (err) {
      await estado.db.query('ROLLBACK')
      throw err
    }
  },
}))
vi.mock('./_auth.js', () => ({
  requireAuth: (req) => { req.user = { ...estado.user, modulos: estado.modulos }; return true },
}))
vi.mock('./_ambiente.js', () => ({ comAmbiente: (h) => h }))

const { default: contratos } = await import('./contratos.js')
const { default: itens } = await import('./contrato-itens.js')
const { default: eventos } = await import('./contrato-eventos.js')

const MIGRACAO = readFileSync(new URL('../supabase/migrations/2026-10-20b_contratos.sql', import.meta.url), 'utf-8')
const resposta = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} })
const chamar = async (h, method, { body, url = '/api/contratos', user } = {}) => {
  estado.user = user || { id: 'u1', nivel: 'admin', perfis: 'todos' }
  const res = resposta()
  await h({ method, body, url, headers: {}, ambiente: { modulos: estado.modulos } }, res)
  return res
}
const CONTRATO = {
  perfil_id: 'pf', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto 302', favorecido: 'Imob Silva',
  data_inicio: '2026-01-10', data_fim: '2028-06-30', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 10,
  indice_reajuste: 'IPCA', bonificacao_valor: 200, bonificacao_meses: 3, conta_id: 'cc1', status: 'ativo', categoria_id: 'cat-alug',
}

beforeEach(async () => {
  estado.db = new PGlite()
  estado.modulos = { contratos: true }
  await estado.db.exec(`
    CREATE TABLE contas (id TEXT PRIMARY KEY, profile_id TEXT);
    CREATE TABLE cartoes (id TEXT PRIMARY KEY);
    CREATE TABLE agendamentos (id TEXT PRIMARY KEY, registered JSONB DEFAULT '[]'::jsonb);
    CREATE TABLE lancamentos (id TEXT PRIMARY KEY);
    CREATE TABLE reserve_functions (id TEXT PRIMARY KEY, account_id TEXT);
    INSERT INTO contas VALUES ('cc1', 'pf'), ('cc2', 'pj');
    INSERT INTO cartoes VALUES ('card1');
  `)
  await estado.db.exec(MIGRACAO)
})

describe('/api/contratos', () => {
  it('cria com itens e evento de criação; lista com números de verdade', async () => {
    const r = await chamar(contratos, 'POST', { body: { contrato: CONTRATO, itens: [{ descricao: 'IPTU', grupo: 'iptu', responsavel: 'inquilino', valor_previsto: 120 }] } })
    expect(r.statusCode).toBe(200)
    expect(r.body.contrato).toMatchObject({ objeto: 'Apto 302', valor_base: 3900, status: 'ativo', excluidas: [] })
    expect(r.body.itens[0]).toMatchObject({ descricao: 'IPTU', valor_previsto: 120 })
    expect(r.body.eventos[0].tipo).toBe('criacao')
    const l = await chamar(contratos, 'GET')
    expect(l.body.contratos).toHaveLength(1)
    expect(l.body.contratos[0].valor_base).toBe(3900)
  })

  it('recusa cartão, link perigoso e campo inválido', async () => {
    expect((await chamar(contratos, 'POST', { body: { contrato: { ...CONTRATO, conta_id: 'card1' } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'POST', { body: { contrato: { ...CONTRATO, link_anexo: 'javascript:alert(1)' } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'POST', { body: { contrato: { ...CONTRATO, tipo: 'x' } } })).statusCode).toBe(400)
  })

  it('PUT altera só os campos enviados (lista branca) e grava o evento na mesma transação', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    const r = await chamar(contratos, 'PUT', {
      body: { id: body.contrato.id, contrato: { valor_base: 4000, 'id; DROP TABLE contratos': 1 }, evento: { tipo: 'aditivo', data_evento: '2026-10-20', valor_anterior: 3900, valor_novo: 4000 } },
    })
    expect(r.statusCode).toBe(200)
    expect(r.body.contrato).toMatchObject({ valor_base: 4000, objeto: 'Apto 302' })
    const ev = await chamar(eventos, 'GET', { url: `/api/contrato-eventos?contrato_id=${body.contrato.id}` })
    expect(ev.body.eventos.map(e => e.tipo).sort()).toEqual(['aditivo', 'criacao'])
  })

  it('parcela excluída à mão aparece em `excluidas`', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    await chamar(eventos, 'POST', { url: '/api/contrato-eventos', body: { contrato_id: body.contrato.id, tipo: 'edicao_parcela', data_evento: '2026-10-20', detalhes: { acao: 'exclusao', parcela_id: 'ctr_x_aluguel_202611' } } })
    const l = await chamar(contratos, 'GET')
    expect(l.body.contratos[0].excluidas).toEqual(['ctr_x_aluguel_202611'])
  })

  it('perfis permitidos: não vê nem cria contrato de outro perfil', async () => {
    await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    const restrito = { id: 'u2', nivel: 'operador', perfis: ['pj'] }
    expect((await chamar(contratos, 'GET', { user: restrito })).body.contratos).toEqual([])
    expect((await chamar(contratos, 'POST', { body: { contrato: CONTRATO }, user: restrito })).statusCode).toBe(403)
    const ok = await chamar(contratos, 'POST', { body: { contrato: { ...CONTRATO, perfil_id: 'pj', conta_id: 'cc2' } }, user: restrito })
    expect(ok.statusCode).toBe(200)
  })

  it('módulo desligado no plano → 403, mesmo para admin', async () => {
    estado.modulos = {}
    const r = await chamar(contratos, 'GET')
    expect(r.statusCode).toBe(403)
    expect(r.body.error).toMatch(/não habilitado/)
  })

  it('DELETE: bloqueado com parcela paga', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    const id = body.contrato.id
    await estado.db.query(`INSERT INTO agendamentos (id, registered) VALUES ($1, '["2026-01-10"]'::jsonb)`, [`ctr_${id}_aluguel_202601`])
    expect((await chamar(contratos, 'DELETE', { url: `/api/contratos?id=${id}` })).statusCode).toBe(409)
    await estado.db.query('DELETE FROM agendamentos')
    expect((await chamar(contratos, 'DELETE', { url: `/api/contratos?id=${id}` })).body.excluido).toBe(true)
  })

  it('itens: substitui a lista', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO, itens: [{ descricao: 'IPTU' }] } })
    const r = await chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: body.contrato.id, itens: [{ descricao: 'Seguro incêndio', grupo: 'seguro' }] } })
    expect(r.body.itens.map(i => i.descricao)).toEqual(['Seguro incêndio'])
  })
})

describe('validação e regras', () => {
  it('normalizarContrato: bonificação exige meses; categorias obrigatórias na criação', () => {
    const b = { tipo: 'pagar', data_inicio: '2026-01-01', categoria_id: 'c' }
    expect(normalizarContrato({ ...b, bonificacao_valor: 200 }).erro).toMatch(/bonificacao_meses/)
    expect(normalizarContrato({ ...b, bonificacao_valor: 200, bonificacao_meses: 3 }).erro).toBeUndefined()
    expect(normalizarContrato({ tipo: 'pagar', data_inicio: '2026-01-01' }).erro).toMatch(/categoria_id/)
    expect(normalizarContrato({ ...b, tem_condominio: true }).erro).toMatch(/categoria_condominio_id/)
    expect(normalizarContrato({ valor_base: 10 }, { parcial: true }).erro).toBeUndefined()
  })
  it('normalizarContrato: padrões e datas', () => {
    const { dados } = normalizarContrato({ tipo: 'pagar', data_inicio: '2026-01-01', categoria_id: 'c' })
    expect(dados).toMatchObject({ modalidade: 'aluguel', periodicidade: 'mensal', indice_reajuste: 'IPCA', status: 'ativo', aviso_previo_dias: 30 })
    expect(normalizarContrato({ tipo: 'pagar', data_inicio: '2026-01-01', data_fim: '2025-01-01', categoria_id: 'c' }).erro).toMatch(/antes do início/)
    expect(normalizarContrato({ tipo: 'pagar', data_inicio: '2026-01-01', indice_reajuste: 'FIXO', categoria_id: 'c' }).erro).toMatch(/percentual_fixo/)
  })
  it('rotas no mapa de permissões; módulo de plano bloqueia sem o plano', () => {
    expect(regraDaRota('/api/contratos', 'POST')).toEqual({ modulo: 'contratos', acao: 'incluir' })
    expect(regraDaRota('/api/contrato-itens', 'PUT')).toEqual({ modulo: 'contratos', acao: 'editar' })
    expect(regraDaRota('/api/indices', 'GET')).toBeNull()
    expect(pode({ nivel: 'admin' }, 'contratos')).toBe(false)
    expect(pode({ nivel: 'admin', modulos: { contratos: true } }, 'contratos')).toBe(true)
    expect(pode({ nivel: 'consulta', modulos: { contratos: true } }, 'contratos', 'editar')).toBe(false)
  })
  it('índices: série do SGS e acumulado de 12 meses', () => {
    const serie = lerSerieSgs(Array.from({ length: 13 }, (_, i) => ({ data: `01/${String((i % 12) + 1).padStart(2, '0')}/${2025 + Math.floor(i / 12)}`, valor: '0.5' })))
    expect(serie[0].competencia).toBe('2025-01')
    const ac = comAcumulado12m(serie)
    expect(ac[10].acumulado_12m).toBeNull()
    expect(ac[11].acumulado_12m).toBeCloseTo(6.1678, 3)
  })
  it('índices: consulta por intervalo de datas (nunca "ultimos/N") e {"erro":{}} é erro', () => {
    const u = urlSgs('IPCA', new Date(Date.UTC(2026, 9, 20)))
    expect(u).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/04/2024&dataFinal=20/10/2026')
    expect(u).not.toMatch(/ultimos/)
    expect(() => lerSerieSgs({ erro: {} })).toThrow(/resposta inesperada/)
  })
  it('índices: grava o cache e devolve o acumulado; BC com erro e sem cache → aviso com o motivo', async () => {
    const serie = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 3 + i, 1))
      return { data: `01/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`, valor: '0.4' }
    })
    const erro = await indiceAtual('IGPM', { fetcher: async () => ({ ok: true, json: async () => ({ erro: {} }) }) })
    expect(erro).toMatchObject({ acumulado_12m: null, fonte: null })
    expect(erro.aviso).toMatch(/resposta inesperada/)
    const ok = await indiceAtual('IPCA', { fetcher: async () => ({ ok: true, json: async () => serie }) })
    expect(ok).toMatchObject({ indice: 'IPCA', competencia: '2026-09', fonte: 'bcb' })
    expect(ok.acumulado_12m).toBeCloseTo(4.9070, 3)
    const cache = await indiceAtual('IPCA', { fetcher: async () => { throw new Error('não devia chamar') } })
    expect(cache.fonte).toBe('cache')
  })
})
