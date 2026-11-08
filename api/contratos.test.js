import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { bancoDoArquivo } from './_testes/bancoTeste.js'
import { normalizarContrato } from './_contratos.js'
import { lerSerieSgs, comAcumulado12m, urlSgs, indiceAtual } from './indices.js'
import { regraDaRota, pode } from '../src/lib/permissoes.js'
import { KIT_REGRAS_ITENS } from './_kitBasico.js'

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
const { default: regras } = await import('./contrato-regras.js')
const { default: creditos } = await import('./contrato-creditos.js')
const { default: competencias } = await import('./contrato-competencias.js')

const MIGRACAO = readFileSync(new URL('../supabase/migrations/2026-10-20b_contratos.sql', import.meta.url), 'utf-8')
const MIGRACAO_E2 = readFileSync(new URL('../supabase/migrations/2026-10-21_contratos_creditos.sql', import.meta.url), 'utf-8')
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
  estado.db = await bancoDoArquivo(async (b) => {
    await b.exec(`
      CREATE TABLE contas (id TEXT PRIMARY KEY, profile_id TEXT);
      CREATE TABLE cartoes (id TEXT PRIMARY KEY);
      CREATE TABLE agendamentos (id TEXT PRIMARY KEY, registered JSONB DEFAULT '[]'::jsonb);
      CREATE TABLE lancamentos (id TEXT PRIMARY KEY);
      CREATE TABLE reserve_functions (id TEXT PRIMARY KEY, account_id TEXT);
      INSERT INTO contas VALUES ('cc1', 'pf'), ('cc2', 'pj');
      INSERT INTO cartoes VALUES ('card1');
    `)
  })
  estado.modulos = { contratos: true }
  await estado.db.exec(MIGRACAO)
  await estado.db.exec(MIGRACAO_E2)
  for (const [padrao, tipo] of KIT_REGRAS_ITENS) {
    await estado.db.query(`INSERT INTO contrato_regras_itens (padrao, tipo_match, responsavel) VALUES ($1, $2, 'proprietario')`, [padrao, tipo])
  }
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
    const objeto = await chamar(contratos, 'POST', { body: { contrato: { ...CONTRATO, categoria_id: { target: { value: 'x' } } } } })
    expect(objeto.statusCode).toBe(400)
    expect(objeto.body.error).toMatch(/categoria_id: deve ser texto/)
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

describe('/api/contrato-regras e /api/contrato-creditos (Entrega 2)', () => {
  it('seed das regras globais e regra do contrato', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    const g = await chamar(regras, 'GET', { url: '/api/contrato-regras' })
    expect(g.body.regras.filter(r => !r.contrato_id).map(r => r.padrao).sort()).toEqual(
      ['chamada de capital', 'fundo de obras', 'fundo de reserva', 'fundo trabalhista', 'obra', 'taxa extra'])
    const nova = await chamar(regras, 'POST', { url: '/api/contrato-regras', body: { contrato_id: body.contrato.id, padrao: 'Espaço Gourmet', tipo_match: 'comeca_com', responsavel: 'inquilino' } })
    expect(nova.body.regra).toMatchObject({ contrato_id: body.contrato.id, responsavel: 'inquilino' })
    expect((await chamar(regras, 'POST', { url: '/api/contrato-regras', body: { padrao: 'x', responsavel: 'vizinho' } })).statusCode).toBe(400)
    const doContrato = await chamar(regras, 'GET', { url: `/api/contrato-regras?contrato_id=${body.contrato.id}` })
    expect(doContrato.body.regras).toHaveLength(7)
  })

  it('crédito: cria aberto, compensa, entra no total da lista e exclui', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    const id = body.contrato.id
    const c = await chamar(creditos, 'POST', { url: '/api/contrato-creditos', body: {
      contrato_id: id, origem_lancamento_id: 'tx_c', descricao: 'Condomínio 05/12', valor: 104.85, data_origem: '2026-12-05',
      itens: [{ desc: 'Fundo de Reserva', valor: 79.10 }, { desc: 'Fundo Trabalhista', valor: 25.75 }],
    } })
    expect(c.body.credito).toMatchObject({ status: 'aberto', valor: 104.85 })
    expect((await chamar(contratos, 'GET')).body.contratos[0].creditos_abertos).toBe(104.85)
    const comp = await chamar(creditos, 'PUT', { url: '/api/contrato-creditos', body: { id: c.body.credito.id, status: 'compensado', compensado_em_lancamento_id: 'tx_a', data_compensacao: '2026-12-15' } })
    expect(comp.body.credito).toMatchObject({ status: 'compensado', compensado_em_lancamento_id: 'tx_a', valor: 104.85 })
    expect((await chamar(contratos, 'GET')).body.contratos[0].creditos_abertos).toBe(0)
    expect((await chamar(creditos, 'POST', { url: '/api/contrato-creditos', body: { contrato_id: id, valor: -1, itens: [] } })).statusCode).toBe(400)
    await chamar(creditos, 'DELETE', { url: `/api/contrato-creditos?id=${c.body.credito.id}` })
    expect((await chamar(creditos, 'GET', { url: `/api/contrato-creditos?contrato_id=${id}` })).body.creditos).toEqual([])
  })

  it('crédito PREVISTO em banco sem a migração 2026-11-04 → 409 com motivo claro, nada gravado; com a migração, grava', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    const id = body.contrato.id
    const previsto = { contrato_id: id, origem_agendamento_id: 'ctr_x_condominio_202612', descricao: 'Condomínio 10/12 (previsto)', valor: 90, data_origem: '2026-12-10', status: 'previsto', itens: [{ desc: 'Fundo de reserva', valor: 90 }] }
    const r = await chamar(creditos, 'POST', { url: '/api/contrato-creditos', body: previsto })
    expect(r.statusCode).toBe(409)
    expect(r.body).toMatchObject({ codigo: 'banco_desatualizado' })
    expect(r.body.error).toMatch(/ainda não tem a atualização para crédito previsto.*Nada foi gravado/)
    expect((await chamar(creditos, 'GET', { url: `/api/contrato-creditos?contrato_id=${id}` })).body.creditos).toEqual([])
    await estado.db.exec(readFileSync(new URL('../supabase/migrations/2026-11-04_contratos_credito_previsto.sql', import.meta.url), 'utf-8'))
    const ok = await chamar(creditos, 'POST', { url: '/api/contrato-creditos', body: previsto })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.credito).toMatchObject({ status: 'previsto', valor: 90 })
  })

  it('encargos na parcela (2026-11-05): sem a migração → 409 e nada muda; com ela, grava e a lista traz `encargos`', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO, itens: [{ descricao: 'IPTU', grupo: 'iptu', valor_previsto: 120 }] } })
    const id = body.contrato.id
    const seguro = { descricao: 'Seguro incêndio', na_parcela: true, sinal: 'encargo', valor_previsto: 49.06, parcelas_total: 36, parcela_inicio: 2 }
    const sem = await chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: id, itens: [{ descricao: 'IPTU', grupo: 'iptu', valor_previsto: 120 }, seguro] } })
    expect(sem.statusCode).toBe(409)
    expect(sem.body).toMatchObject({ codigo: 'banco_desatualizado' })
    expect((await chamar(itens, 'GET', { url: `/api/contrato-itens?contrato_id=${id}` })).body.itens.map(i => i.descricao)).toEqual(['IPTU'])
    await estado.db.exec(readFileSync(new URL('../supabase/migrations/2026-11-05_contratos_encargos.sql', import.meta.url), 'utf-8'))
    expect((await chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: id, itens: [{ ...seguro, parcelas_total: 0 }] } })).statusCode).toBe(400)
    expect((await chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: id, itens: [{ ...seguro, sinal: 'x' }] } })).statusCode).toBe(400)
    const ok = await chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: id, itens: [{ descricao: 'IPTU', grupo: 'iptu', valor_previsto: 120 }, { ...seguro, parcela_inicio: -5 }] } })
    expect(ok.statusCode).toBe(200)
    const lista = (await chamar(contratos, 'GET')).body.contratos.find(c => c.id === id)
    expect(lista.encargos).toEqual([{ id: expect.any(String), descricao: 'Seguro incêndio', sinal: 'encargo', valor: 49.06, parcelas_total: 36, parcela_inicio: -5, ativo: true }])
  })

  it('perfil sem acesso não vê o crédito', async () => {
    const { body } = await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })
    await chamar(creditos, 'POST', { url: '/api/contrato-creditos', body: { contrato_id: body.contrato.id, valor: 10, itens: [] } })
    const restrito = { id: 'u2', nivel: 'operador', perfis: ['pj'] }
    expect((await chamar(creditos, 'GET', { url: '/api/contrato-creditos', user: restrito })).body.creditos).toEqual([])
  })
})

describe('migração 2026-11-03: contrato genérico, meses sem cobrança e destino do crédito', () => {
  const MIGRACAO_GEN = readFileSync(new URL('../supabase/migrations/2026-11-03_contratos_generico.sql', import.meta.url), 'utf-8')

  it('antes da migração o cadastro continua funcionando (campos novos ficam de fora)', async () => {
    const r = await chamar(contratos, 'POST', { body: { contrato: { ...CONTRATO, meses_sem_cobranca: ['2026-09'] } } })
    expect(r.statusCode).toBe(200)
    expect(r.body.contrato.meses_sem_cobranca).toBeUndefined()
  })

  it('contrato que já existia fica na regra antiga; os novos nascem com "mês seguinte"; idempotente', async () => {
    const antigo = (await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })).body.contrato
    await estado.db.exec(MIGRACAO_GEN)
    await estado.db.exec(MIGRACAO_GEN)
    const [{ credito_abatimento: regraAntigo, meses_sem_cobranca: mesesAntigo }] = (await estado.db.query('SELECT * FROM contratos WHERE id = $1', [antigo.id])).rows
    expect(regraAntigo).toBe('proximo_pendente')
    expect(mesesAntigo).toEqual([])

    const novo = await chamar(contratos, 'POST', { body: { contrato: {
      ...CONTRATO, modalidade: 'assinatura', meses_sem_cobranca: ['2026-09', '2026-01', '2026-09'],
    } } })
    expect(novo.statusCode).toBe(200)
    expect(novo.body.contrato).toMatchObject({ modalidade: 'assinatura', meses_sem_cobranca: ['2026-01', '2026-09'], credito_abatimento: 'mes_seguinte' })

    const id = novo.body.contrato.id
    const put = await chamar(contratos, 'PUT', { body: { id, contrato: { credito_abatimento: 'proximo_pendente', meses_sem_cobranca: [] } } })
    expect(put.body.contrato).toMatchObject({ credito_abatimento: 'proximo_pendente', meses_sem_cobranca: [] })
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { meses_sem_cobranca: ['2026-13'] } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { credito_abatimento: 'qualquer' } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { modalidade: 'seguro' } } })).body.contrato.modalidade).toBe('seguro')

    const c = await chamar(creditos, 'POST', { url: '/api/contrato-creditos', body: {
      contrato_id: id, descricao: 'Reembolso', valor: 50, data_origem: '2026-11-03', itens: [{ desc: 'Reembolso', valor: 50 }],
      destino_agendamento_id: `ctr_${id}_aluguel_202612`,
    } })
    expect(c.body.credito).toMatchObject({ destino_agendamento_id: `ctr_${id}_aluguel_202612`, status: 'aberto' })
    const troca = await chamar(creditos, 'PUT', { url: '/api/contrato-creditos', body: { id: c.body.credito.id, destino_agendamento_id: null } })
    expect(troca.body.credito.destino_agendamento_id).toBeNull()
  })
})

describe('migração 2026-11-07b: contrato a receber por administradora (modo repasse)', () => {
  const MIGRACAO_REP = readFileSync(new URL('../supabase/migrations/2026-11-07b_contratos_repasse.sql', import.meta.url), 'utf-8')
  // Dados fictícios.
  const REPASSE = {
    ...CONTRATO, tipo: 'receber', favorecido: 'Administradora Exemplo', bonificacao_valor: 0, bonificacao_meses: 0,
    modo_repasse: true, contraparte_nome: 'Inquilino Exemplo', contraparte_documento: '000.000.000-00', bem_id: 'bem-x',
    dia_repasse: 12, repasse_meses_depois: 1, valor_primeiro_mes: 2100, saldo_inicial_adm: -150.5, saldo_inicial_competencia: '2026-01',
  }

  it('sem a migração: contrato com repasse → 409 e nada gravado; contrato comum continua gravando', async () => {
    const r = await chamar(contratos, 'POST', { body: { contrato: REPASSE } })
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('banco_desatualizado')
    expect((await estado.db.query('SELECT count(*)::int AS n FROM contratos')).rows[0].n).toBe(0)
    expect((await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })).statusCode).toBe(200)
  })

  it('com a migração (idempotente): grava e devolve os campos; contrato existente fica sem repasse', async () => {
    const antigo = (await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })).body.contrato
    await estado.db.exec(MIGRACAO_REP)
    await estado.db.exec(MIGRACAO_REP)
    const [velho] = (await estado.db.query('SELECT modo_repasse, repasse_meses_depois FROM contratos WHERE id = $1', [antigo.id])).rows
    expect(velho).toEqual({ modo_repasse: false, repasse_meses_depois: 1 })

    const r = await chamar(contratos, 'POST', { body: { contrato: REPASSE } })
    expect(r.statusCode).toBe(200)
    expect(r.body.contrato).toMatchObject({
      modo_repasse: true, contraparte_nome: 'Inquilino Exemplo', bem_id: 'bem-x', dia_repasse: 12, repasse_meses_depois: 1,
      valor_primeiro_mes: 2100, saldo_inicial_adm: -150.5, saldo_inicial_competencia: '2026-01',
    })
    const id = r.body.contrato.id
    // Repasse só em contrato a receber.
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { tipo: 'pagar' } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id: antigo.id, contrato: { modo_repasse: true } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { repasse_meses_depois: 4 } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { saldo_inicial_competencia: '2026-13' } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { dia_repasse: 5 } } })).body.contrato.dia_repasse).toBe(5)
  })

  it('validação: repasse exige contrato a receber e dia do repasse; saldo inicial pede a competência', () => {
    expect(normalizarContrato({ ...REPASSE, tipo: 'pagar' }).erro).toMatch(/modo_repasse/)
    expect(normalizarContrato({ ...REPASSE, dia_repasse: null }).erro).toMatch(/dia_repasse/)
    expect(normalizarContrato({ ...REPASSE, saldo_inicial_competencia: null }).erro).toMatch(/saldo_inicial_competencia/)
    expect(normalizarContrato({ ...CONTRATO }).dados).toMatchObject({ modo_repasse: false, repasse_meses_depois: 1, bem_id: null })
  })
})

describe('migração 2026-11-07c: composição do repasse e taxas da administradora', () => {
  const MIG_B = readFileSync(new URL('../supabase/migrations/2026-11-07b_contratos_repasse.sql', import.meta.url), 'utf-8')
  const MIG_C = readFileSync(new URL('../supabase/migrations/2026-11-07c_contratos_composicao_repasse.sql', import.meta.url), 'utf-8')
  // Dados fictícios.
  const REPASSE = {
    ...CONTRATO, tipo: 'receber', favorecido: 'Administradora Exemplo', bonificacao_valor: 0, bonificacao_meses: 0,
    modo_repasse: true, dia_repasse: 10, taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm',
  }
  const TAXA_UNICA = { descricao: 'Intermediação', tipo_repasse: 'taxa_unica', valor_previsto: 2200, valores_parcelas: [470, 865, 865], vigencia_inicio: '2026-02' }
  const TARIFA = { descricao: 'Tarifa bancária', tipo_repasse: 'tarifa_fixa', valor_previsto: 3, vigencia_inicio: '2026-06' }
  const COMP = {
    competencia: '2026-02', status: 'aberta', itens: [
      { chave: 'adm', tipo: 'taxa_adm', origem: 'auto', informado: true, valor: -11.67, valor_calculado: -58.67, dedutivel_ir: true },
      { chave: 'm:1', tipo: 'despesa', natureza: 'consumo', descricao: 'Água', valor: -96.73, origem: 'manual' },
      { chave: 'm:2', tipo: 'benfeitoria', descricao: 'Reparo', valor: -4799.49, origem: 'manual', somar_ao_bem: true },
    ],
  }

  it('sem a 07c: taxa da administradora e composição → 409; lista sem os campos novos', async () => {
    await estado.db.exec(MIG_B)
    const { body } = await chamar(contratos, 'POST', { body: { contrato: { ...REPASSE, taxa_adm_pct: null, categoria_taxa_adm_id: null } } })
    const id = body.contrato.id
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { taxa_adm_pct: 10 } } })).statusCode).toBe(409)
    expect((await chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: id, itens: [TARIFA] } })).statusCode).toBe(409)
    expect((await chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, ...COMP } })).statusCode).toBe(409)
    expect((await chamar(competencias, 'GET', { url: `/api/contrato-competencias?contrato_id=${id}` })).body.competencias).toEqual([])
    const lista = (await chamar(contratos, 'GET')).body.contratos[0]
    expect(lista.itens_repasse).toBeUndefined()
    expect(lista.competencias).toBeUndefined()
  })

  it('com a 07c (idempotente): taxas e competências gravam e vêm junto com o contrato', async () => {
    await estado.db.exec(MIG_B)
    await estado.db.exec(MIG_C)
    await estado.db.exec(MIG_C)
    const r = await chamar(contratos, 'POST', { body: { contrato: REPASSE, itens: [TAXA_UNICA, TARIFA] } })
    expect(r.statusCode).toBe(200)
    expect(r.body.contrato).toMatchObject({ taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm' })
    const id = r.body.contrato.id
    const ok = await chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, ...COMP } })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.competencia.itens[2]).toMatchObject({ tipo: 'benfeitoria', somar_ao_bem: true, valor: -4799.49 })
    // Gravar de novo a mesma competência substitui (uma linha por competência).
    await chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, ...COMP, status: 'fechada' } })
    const c = (await chamar(contratos, 'GET')).body.contratos.find(x => x.id === id)
    expect(c.competencias).toHaveLength(1)
    expect(c.competencias[0]).toMatchObject({ competencia: '2026-02', status: 'fechada' })
    expect(c.itens_repasse.map(t => [t.tipo_repasse, t.valor, t.valores_parcelas, t.vigencia_inicio])).toEqual([
      ['taxa_unica', 2200, [470, 865, 865], '2026-02'], ['tarifa_fixa', 3, null, '2026-06'],
    ])
    // Voltar ao padrão do contrato.
    await chamar(competencias, 'DELETE', { url: `/api/contrato-competencias?contrato_id=${id}&competencia=2026-02` })
    expect((await chamar(contratos, 'GET')).body.contratos.find(x => x.id === id).competencias).toEqual([])
  })

  it('validação: competência, tipos, taxa sem início ou sem parcelas; composição só no modo repasse', async () => {
    await estado.db.exec(MIG_B)
    await estado.db.exec(MIG_C)
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    const put = (b) => chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, ...b } })
    expect((await put({ ...COMP, competencia: '2026-13' })).statusCode).toBe(400)
    expect((await put({ ...COMP, itens: [{ tipo: 'qualquer', valor: 1 }] })).statusCode).toBe(400)
    expect((await put({ ...COMP, itens: [{ tipo: 'aluguel', valor: 1, origem: 'manual' }] })).statusCode).toBe(400)
    const salvarItens = (its) => chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: id, itens: its } })
    expect((await salvarItens([{ ...TARIFA, vigencia_inicio: null }])).statusCode).toBe(400)
    expect((await salvarItens([{ ...TAXA_UNICA, valores_parcelas: [] }])).statusCode).toBe(400)
    expect((await salvarItens([{ ...TARIFA, vigencia_fim: '2026-01' }])).statusCode).toBe(400)
    // Soma das parcelas ≠ total: grava (o aviso é na tela).
    expect((await salvarItens([{ ...TAXA_UNICA, valores_parcelas: [470, 865] }])).statusCode).toBe(200)
    const pagar = (await chamar(contratos, 'POST', { body: { contrato: CONTRATO } })).body.contrato.id
    expect((await chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: pagar, ...COMP } })).statusCode).toBe(400)
    expect(regraDaRota('/api/contrato-competencias', 'PUT')).toEqual({ modulo: 'contratos', acao: 'editar' })
  })

  it('regravar as taxas mantém o id (o taxa_id das competências continua valendo); id de outro contrato não é reaproveitado', async () => {
    await estado.db.exec(MIG_B)
    await estado.db.exec(MIG_C)
    const r = await chamar(contratos, 'POST', { body: { contrato: REPASSE, itens: [TAXA_UNICA, TARIFA] } })
    const id = r.body.contrato.id
    const [tu, tf] = r.body.itens
    const salvarItens = (cid, its) => chamar(itens, 'PUT', { url: '/api/contrato-itens', body: { contrato_id: cid, itens: its } })
    const de1 = await salvarItens(id, [{ ...TAXA_UNICA, id: tu.id, valores_parcelas: [2200] }, { ...TARIFA, id: tf.id }, { ...TARIFA, descricao: 'Nova' }])
    expect(de1.statusCode).toBe(200)
    expect(de1.body.itens.map(i => i.id).slice(0, 2)).toEqual([tu.id, tf.id])
    expect(de1.body.itens[0].valores_parcelas).toEqual([2200])
    expect(de1.body.itens[2].id).not.toBe(tu.id)
    const outro = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    const de2 = await salvarItens(outro, [{ ...TAXA_UNICA, id: tu.id }])
    expect(de2.body.itens[0].id).not.toBe(tu.id)
  })
})

describe('migração 2026-11-07d: benfeitoria no custo do bem e reajuste do repasse', () => {
  const ler = (n) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf-8')
  const preparar = async () => {
    await estado.db.exec(`ALTER TABLE contas ADD COLUMN type TEXT; ALTER TABLE contas ADD COLUMN balance NUMERIC DEFAULT 0;
      INSERT INTO contas (id, profile_id, type, balance) VALUES ('bem-x', 'pf', 'asset', 100000), ('bem-y', 'pf', 'asset', 0);
      CREATE TABLE IF NOT EXISTS financing_installments (id TEXT PRIMARY KEY);`)
    for (const n of ['2026-11-06d_bem_baixas.sql', '2026-11-07b_contratos_repasse.sql', '2026-11-07c_contratos_composicao_repasse.sql', '2026-11-07d_contratos_benfeitoria_reajuste.sql', '2026-11-07d_contratos_benfeitoria_reajuste.sql']) {
      await estado.db.exec(ler(n))
    }
  }
  // Dados fictícios.
  const REPASSE = {
    ...CONTRATO, tipo: 'receber', objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo', bonificacao_valor: 0, bonificacao_meses: 0,
    modo_repasse: true, dia_repasse: 10, bem_id: 'bem-x', contraparte_nome: 'Inquilino Exemplo',
  }
  const benf = (valor, extra = {}) => ({ chave: 'm:b1', tipo: 'benfeitoria', descricao: 'Reparo', valor: -valor, origem: 'manual', somar_ao_bem: true, ...extra })
  const put = (id, itens, comp = '2026-03') => chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, competencia: comp, itens } })
  const linhasBem = async () => (await estado.db.query("SELECT bem_id, tipo, valor::float AS valor, descricao, origem_ref FROM bem_baixas ORDER BY origem_ref")).rows
  const saldo = async (id) => (await estado.db.query('SELECT balance::float AS b FROM contas WHERE id = $1', [id])).rows[0].b

  it('marcada e com bem: um movimento no bem, sem lançamento; editar atualiza; desmarcar remove; nunca duplica', async () => {
    await preparar()
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    const r = await put(id, [benf(4799.49)])
    expect(r.statusCode).toBe(200)
    expect(r.body.bens).toEqual([{ id: 'bem-x', saldo: 104799.49 }])
    expect(await linhasBem()).toEqual([{
      bem_id: 'bem-x', tipo: 'benfeitoria', valor: 4799.49, origem_ref: `ctr:${id}:2026-03:m:b1`,
      descricao: 'Benfeitoria — contrato Imóvel Exemplo, competência 03/2026 · Reparo',
    }])
    await put(id, [benf(4799.49)])
    expect(await linhasBem()).toHaveLength(1)
    await put(id, [benf(5000)])
    expect(await saldo('bem-x')).toBe(105000)
    expect((await linhasBem())[0].valor).toBe(5000)
    await put(id, [benf(5000, { somar_ao_bem: false })])
    expect(await linhasBem()).toEqual([])
    expect(await saldo('bem-x')).toBe(100000)
    expect((await estado.db.query('SELECT count(*)::int AS n FROM lancamentos')).rows[0].n).toBe(0)
  })

  it('excluir o item, voltar ao padrão e trocar o bem do contrato mexem no movimento', async () => {
    await preparar()
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    await put(id, [benf(1000), { ...benf(200), chave: 'm:b2' }])
    expect(await saldo('bem-x')).toBe(101200)
    await put(id, [benf(1000)])
    expect(await saldo('bem-x')).toBe(101000)
    const troca = await chamar(contratos, 'PUT', { body: { id, contrato: { bem_id: 'bem-y' } } })
    expect(troca.body.bens).toEqual(expect.arrayContaining([{ id: 'bem-x', saldo: 100000 }, { id: 'bem-y', saldo: 1000 }]))
    expect((await linhasBem()).map(l => l.bem_id)).toEqual(['bem-y'])
    const del = await chamar(competencias, 'DELETE', { url: `/api/contrato-competencias?contrato_id=${id}&competencia=2026-03` })
    expect(del.body.bens).toEqual([{ id: 'bem-y', saldo: 0 }])
    expect(await linhasBem()).toEqual([])
  })

  it('sem bem ligado a marcação só fica guardada; contrato excluído leva as benfeitorias', async () => {
    await preparar()
    const semBem = (await chamar(contratos, 'POST', { body: { contrato: { ...REPASSE, bem_id: null } } })).body.contrato.id
    const r = await put(semBem, [benf(300)])
    expect(r.body.competencia.itens[0]).toMatchObject({ somar_ao_bem: true })
    expect(await linhasBem()).toEqual([])
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    await put(id, [benf(300)])
    expect(await saldo('bem-x')).toBe(100300)
    const ex = await chamar(contratos, 'DELETE', { url: `/api/contratos?id=${id}` })
    expect(ex.body.bens).toEqual([{ id: 'bem-x', saldo: 100000 }])
    expect(await linhasBem()).toEqual([])
  })

  it('reajuste confirmado no contrato (bases_confirmadas) e ajuste ligado ao lançamento', async () => {
    await preparar()
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    const ok = await chamar(contratos, 'PUT', { body: { id, contrato: { bases_confirmadas: { 1: 2310 } } } })
    expect(ok.body.contrato.bases_confirmadas).toEqual({ 1: 2310 })
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { bases_confirmadas: { 0: 1 } } } })).statusCode).toBe(400)
    const aj = await chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: {
      contrato_id: id, competencia: '2026-06', status: 'fechada', repasse_lancamento_id: 'tx_1',
      itens: [{ chave: 'aj:tx_1', tipo: 'ajuste', descricao: 'Ajuste do repasse', valor: -10.65, origem: 'manual', lancamento_id: 'tx_1' }],
    } })
    expect(aj.body.competencia).toMatchObject({ status: 'fechada', repasse_lancamento_id: 'tx_1' })
    expect(aj.body.competencia.itens[0].lancamento_id).toBe('tx_1')
  })
})

describe('migração 2026-11-07e: rendimentos (informe da administradora e pagamento do inquilino)', () => {
  const ler = (n) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf-8')
  const preparar = async ({ comE = true } = {}) => {
    await estado.db.exec('CREATE TABLE IF NOT EXISTS financing_installments (id TEXT PRIMARY KEY);')
    const lista = ['2026-11-06d_bem_baixas.sql', '2026-11-07b_contratos_repasse.sql', '2026-11-07c_contratos_composicao_repasse.sql', '2026-11-07d_contratos_benfeitoria_reajuste.sql']
    if (comE) lista.push('2026-11-07e_contratos_rendimentos.sql', '2026-11-07e_contratos_rendimentos.sql')
    for (const n of lista) await estado.db.exec(ler(n))
  }
  // Dados fictícios.
  const REPASSE = {
    ...CONTRATO, tipo: 'receber', objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo', bonificacao_valor: 0, bonificacao_meses: 0,
    modo_repasse: true, dia_repasse: 10,
  }
  const comp = (extra = {}) => ({ competencia: '2026-03', status: 'aberta', itens: [], ...extra })
  const put = (id, b) => chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, ...b } })

  it('informe por ano grava no contrato; ano ou valor inválido → 400', async () => {
    await preparar()
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    const ok = await chamar(contratos, 'PUT', { body: { id, contrato: { informes_adm: { 2026: { rendimentos: 16000, deducoes: '' } } } } })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.contrato.informes_adm).toEqual({ 2026: { rendimentos: 16000, deducoes: null } })
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { informes_adm: { 26: { rendimentos: 1 } } } } })).statusCode).toBe(400)
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { informes_adm: { 2026: { rendimentos: 'x' } } } } })).statusCode).toBe(400)
  })

  it('data do pagamento do inquilino: grava, vem na lista e fica quando o corpo não a traz', async () => {
    await preparar()
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    expect((await put(id, comp({ data_pagamento_inquilino: '2026-03-07' }))).body.competencia.data_pagamento_inquilino).toBe('2026-03-07')
    // Fechar o bloco no registro do repasse não manda a data: a gravada fica.
    expect((await put(id, comp({ status: 'fechada' }))).body.competencia.data_pagamento_inquilino).toBe('2026-03-07')
    const c = (await chamar(contratos, 'GET')).body.contratos.find(x => x.id === id)
    expect(c.competencias[0]).toMatchObject({ status: 'fechada', data_pagamento_inquilino: '2026-03-07' })
    expect((await put(id, comp({ data_pagamento_inquilino: null }))).body.competencia.data_pagamento_inquilino).toBeNull()
    expect((await put(id, comp({ data_pagamento_inquilino: '07/03/2026' }))).statusCode).toBe(400)
  })

  it('sem a 07e: informe e data → 409; o resto da composição grava; recurso contratoRepasse desligado', async () => {
    await preparar({ comE: false })
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    expect((await chamar(contratos, 'PUT', { body: { id, contrato: { informes_adm: { 2026: { rendimentos: 1 } } } } })).statusCode).toBe(409)
    expect((await put(id, comp({ data_pagamento_inquilino: '2026-03-07' }))).statusCode).toBe(409)
    expect((await put(id, comp())).statusCode).toBe(200)
    expect((await chamar(contratos, 'GET')).body.contratos[0].competencias[0].data_pagamento_inquilino).toBeUndefined()
  })
})

describe('migração 2026-11-07f: conferência do extrato da administradora', () => {
  const ler = (n) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf-8')
  const preparar = async ({ comF = true } = {}) => {
    await estado.db.exec('CREATE TABLE IF NOT EXISTS financing_installments (id TEXT PRIMARY KEY);')
    const lista = ['2026-11-06d_bem_baixas.sql', '2026-11-07b_contratos_repasse.sql', '2026-11-07c_contratos_composicao_repasse.sql',
      '2026-11-07d_contratos_benfeitoria_reajuste.sql', '2026-11-07e_contratos_rendimentos.sql']
    if (comF) lista.push('2026-11-07f_contratos_conferencia_extrato.sql', '2026-11-07f_contratos_conferencia_extrato.sql')
    for (const n of lista) await estado.db.exec(ler(n))
  }
  // Dados fictícios.
  const REPASSE = {
    ...CONTRATO, tipo: 'receber', objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo', bonificacao_valor: 0, bonificacao_meses: 0,
    modo_repasse: true, dia_repasse: 10,
  }
  const CONF = { conferido_em: '2026-11-07', origem: 'ia', periodo: '02/2026', saldo_anterior_extrato: -10, saldo_anterior_finup: '-10.004', total_extrato: null, repasse: 0 }
  const itens = [
    { chave: 'aluguel', tipo: 'aluguel', descricao: 'Aluguel', valor: 586.67, origem: 'auto' },
    { chave: 'taxa_unica:tu', tipo: 'taxa_unica', descricao: 'Intermediação', valor: -470, origem: 'auto', taxa_id: 'tu' },
  ]
  const put = (id, b) => chamar(competencias, 'PUT', { url: '/api/contrato-competencias', body: { contrato_id: id, competencia: '2026-02', status: 'fechada', itens, ...b } })

  it('grava a conferência e o taxa_id; fica quando o corpo não a traz; vem na lista; null desfaz', async () => {
    await preparar()
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    const r = await put(id, { conferencia: CONF })
    expect(r.statusCode).toBe(200)
    expect(r.body.competencia.conferencia).toEqual({ ...CONF, saldo_anterior_finup: -10 })
    expect(r.body.competencia.itens[1]).toMatchObject({ tipo: 'taxa_unica', taxa_id: 'tu' })
    // Fechar o bloco no registro do repasse não manda a conferência: a gravada fica.
    expect((await put(id, { repasse_lancamento_id: 'tx1' })).body.competencia.conferencia).toMatchObject({ origem: 'ia', repasse: 0 })
    const c = (await chamar(contratos, 'GET')).body.contratos.find(x => x.id === id)
    expect(c.competencias[0].conferencia).toMatchObject({ periodo: '02/2026' })
    expect((await put(id, { conferencia: null })).body.competencia.conferencia).toBeNull()
    expect((await put(id, { conferencia: { origem: 'ia' } })).statusCode).toBe(400)
    expect((await put(id, { conferencia: { ...CONF, repasse: 'x' } })).statusCode).toBe(400)
  })

  it('sem a 07f: conferência → 409; o resto grava', async () => {
    await preparar({ comF: false })
    const id = (await chamar(contratos, 'POST', { body: { contrato: REPASSE } })).body.contrato.id
    expect((await put(id, { conferencia: CONF })).statusCode).toBe(409)
    expect((await put(id, {})).statusCode).toBe(200)
  })
})
