import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { bancoDoArquivo } from './_testes/bancoTeste.js'
import { extratoDoBem, resumoDoBem } from '../src/lib/extratoBem.js'
import { batimento, encerramentoDaCota, parcelasFinupPorCota, prazoDaCota } from '../src/lib/consorcio.js'
import { criarRegraDemonstrativo, totaisDoDemonstrativo } from '../src/lib/regraDemonstrativo.js'

// Baixa de parcelas sem movimento em conta, num Postgres de verdade (PGlite), pelas rotas reais.
const estado = vi.hoisted(() => ({ db: null, user: null }))
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
vi.mock('./_auth.js', () => ({ requireAuth: (req) => { req.user = estado.user; return true } }))
vi.mock('./_ambiente.js', () => ({ comAmbiente: (h) => h }))
vi.mock('./_bem.js', async (original) => ({ ...(await original()), ensureBemSchema: async () => {} }))

const { default: baixas } = await import('./bem/baixas.js')
const { default: consorcio } = await import('./consorcio.js')
const { default: extrato } = await import('./bem/extrato.js')
const { default: criarFinanciamento } = await import('./financiamento/criar.js')

const migracao = (nome) => readFileSync(new URL(`../supabase/migrations/${nome}`, import.meta.url), 'utf-8')
const q = async (sql, p = []) => (await estado.db.query(sql, p)).rows
const admin = { id: 'u1', nivel: 'admin', perfis: 'todos' }
const resposta = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} })
const chamar = async (h, method, { body, url = '/x', user = admin } = {}) => {
  estado.user = user
  const res = resposta()
  await h({ method, body, url, headers: {}, query: {} }, res)
  return res
}
const saldo = async (id) => Number((await q(`SELECT balance FROM contas WHERE id = $1`, [id]))[0].balance)
const lerExtrato = async (bemId, user = admin) => (await chamar(extrato, 'GET', { url: `/api/bem/extrato?bem_id=${bemId}`, user })).body

const cota250 = {
  numero: '10', valor_carta: 200000, prazo_meses: 250, percentual_parcela: 100, valor_parcela_cheia: 800,
  data_adesao: '2020-01-10', abertura_parcelas: 150, abertura_valor: 120000, abertura_data: '2026-11-01',
}
const cadastrar = (bem_id = 'cons', cotas = [cota250]) => chamar(consorcio, 'PUT', { body: { bem_id, cotas } })
const agendar = (id, bem = 'cons') => q(
  `INSERT INTO agendamentos (id, description, transaction_type, account_id, to_account_id, amount, registered) VALUES ($1, 'Parcela', 'transfer', 'itau', $2, 800, '[]')`, [id, bem],
)

beforeEach(async () => {
  const db = await bancoDoArquivo(async (b) => {
    await b.exec(`
      CREATE TABLE contas (id TEXT PRIMARY KEY, name TEXT, type TEXT, balance NUMERIC DEFAULT 0, initial_balance NUMERIC, descricao TEXT, profile_id TEXT, tipo_bem TEXT,
        valor_nota_fiscal NUMERIC, valor_pago_manual NUMERIC, patrimonio_use_method TEXT, categoria_prestacao_id TEXT, categoria_taxa_finan_id TEXT, foi_vendido BOOLEAN DEFAULT FALSE,
        is_reserva BOOLEAN, conta_aplicacao BOOLEAN, is_investimento BOOLEAN, investment_category_id TEXT, vinculo_tipo TEXT, patrimonio_category_id TEXT, conta_corrente_principal BOOLEAN);
      CREATE TABLE lancamentos (id TEXT PRIMARY KEY, type TEXT, account_id TEXT, to_account_id TEXT, amount NUMERIC, date TEXT, description TEXT, category_id TEXT, payee TEXT, bem_id TEXT,
        origin TEXT, account_type TEXT, reconciled BOOLEAN, reserva_auto BOOLEAN, reserva_funcao_id TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE reserve_functions (id TEXT PRIMARY KEY, account_id TEXT);
      CREATE TABLE bem_movimentacoes (id TEXT PRIMARY KEY, bem_id TEXT, tipo TEXT, valor NUMERIC, descricao TEXT, data TEXT, lancamento_id TEXT, bem_origem_id TEXT);
      CREATE TABLE agendamentos (id TEXT PRIMARY KEY, description TEXT, transaction_type TEXT, account_id TEXT, to_account_id TEXT, amount NUMERIC, category_id TEXT, frequency TEXT, start_date TEXT,
        next_occurrence DATE, occurrence_type TEXT, installments INT, auto_register BOOLEAN, confirmado BOOLEAN, tipo TEXT, financing_installment_id TEXT, registered JSONB, skipped JSONB, overrides JSONB,
        principal_value NUMERIC, juros_value NUMERIC, tipo_componente TEXT, payee TEXT);
      CREATE TABLE lancamento_rateios (id TEXT PRIMARY KEY, lancamento_id TEXT, categoria_id TEXT, valor NUMERIC, descricao TEXT);
      CREATE TABLE financing (id TEXT PRIMARY KEY, bem_id TEXT, valor_principal NUMERIC, juros_totais NUMERIC, valor_total NUMERIC, num_parcelas INT, valor_parcela NUMERIC, principal_por_parcela NUMERIC,
        juros_por_parcela NUMERIC, banco TEXT, status TEXT, conta_divida_id TEXT, conta_origem_id TEXT, data_primeira_parcela TEXT, banco_favorecido_id TEXT);
      CREATE TABLE financing_installments (id TEXT PRIMARY KEY, financing_id TEXT, numero_parcela INT, principal_provisioned NUMERIC, juros_provisioned NUMERIC, total_provisioned NUMERIC,
        principal_pago NUMERIC, juros_pago NUMERIC, total_pago NUMERIC, desvio_juros NUMERIC, data_vencimento TEXT, data_pagamento TEXT, status TEXT, saldo_restante NUMERIC, desconto_antecipacao NUMERIC DEFAULT 0, schedule_id TEXT);
      INSERT INTO contas (id, name, type, balance, profile_id, tipo_bem) VALUES
        ('itau', 'Itaú', 'checking', 1000, 'P1', NULL), ('cons', 'Consórcio', 'asset', 0, 'P1', 'consorcio'), ('outro', 'Outro bem', 'asset', 0, 'P2', 'consorcio');
      INSERT INTO contas (id, name, type, balance, profile_id, tipo_bem, categoria_prestacao_id, categoria_taxa_finan_id) VALUES ('carro', 'Carro', 'asset', 0, 'P1', 'bem_imobilizado', 'cat_p', 'cat_j');
    `)
  })
  estado.db = db
  await db.exec(migracao('2026-11-06_consorcio.sql'))
  await db.exec(migracao('2026-11-06b_consorcio_adesao_por_cota.sql'))
  await db.exec(migracao('2026-11-06c_consorcio_encerramento_cota.sql'))
  await db.exec(migracao('2026-11-06d_bem_baixas.sql'))
}, 30000)

describe('Histórico de abertura', () => {
  it('250 parcelas com 150 informadas: 150/250, 100 restantes, encerramento; nenhum lançamento nem saldo de conta', async () => {
    expect((await cadastrar()).statusCode).toBe(200)
    expect(await saldo('cons')).toBe(120000)
    expect(await saldo('itau')).toBe(1000)
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
    expect(await q(`SELECT 1 FROM agendamentos`)).toHaveLength(0)

    const e = await lerExtrato('cons')
    const bem = e.bens[0]
    const resumo = resumoDoBem(bem, extratoDoBem(bem, e), e.parcelas, e.cotas)
    expect(resumo).toMatchObject({ pagoSemJuros: 120000, abertura: 120000, proprios: 0, custoProprioLiquido: 120000 })
    const { consorcio: c } = (await chamar(consorcio, 'GET', { url: '/api/consorcio?bem_id=cons' })).body
    expect(c.cotas[0]).toMatchObject({ abertura_parcelas: 150, abertura_valor: 120000, abertura_data: '2026-11-01' })
    const pagas = parcelasFinupPorCota(c.cotas, resumo.pagoSemJuros, e.baixas)
    expect(pagas).toEqual([150])
    expect(prazoDaCota(c.cotas[0], pagas[0])).toMatchObject({ pagas: 150, prazo: 250, restantes: 100 })
    expect(encerramentoDaCota(c.cotas[0])).toEqual({ data: '2040-11-10', estimado: true })
    expect(batimento(c.cotas, resumo.pagoSemJuros, e.baixas).parcelasFinup).toBe(150)
  })

  it('editar ajusta o bem pela diferença, e tirar a abertura devolve o saldo; sem data ou valor, recusa', async () => {
    await cadastrar()
    await cadastrar('cons', [{ ...cota250, abertura_valor: 100000 }])
    expect(await saldo('cons')).toBe(100000)
    await cadastrar('cons', [{ ...cota250, abertura_parcelas: '', abertura_valor: '', abertura_data: '' }])
    expect(await saldo('cons')).toBe(0)
    expect((await cadastrar('cons', [{ ...cota250, abertura_data: '' }])).statusCode).toBe(400)
    expect((await cadastrar('cons', [{ ...cota250, abertura_parcelas: 300 }])).statusCode).toBe(400)
    expect(await saldo('cons')).toBe(0)
  })

  it('cota removida do cadastro leva a abertura junto', async () => {
    await cadastrar('cons', [cota250, { ...cota250, numero: '11', abertura_valor: 5000 }])
    expect(await saldo('cons')).toBe(125000)
    await cadastrar('cons', [cota250])
    expect(await saldo('cons')).toBe(120000)
  })
})

describe('Marcar como paga', () => {
  const marcar = (extra) => chamar(baixas, 'POST', { body: { acao: 'registrar', bem_id: 'cons', data: '2026-11-10', valor: 800, ...extra } })
  const semAbertura = { ...cota250, abertura_parcelas: '', abertura_valor: '', abertura_data: '' }
  beforeEach(async () => {
    await cadastrar('cons', [semAbertura])
    await agendar('s1')
  })
  const demonstrativo = async () => {
    const tx = (await q(`SELECT * FROM lancamentos`)).map(t => ({ id: t.id, type: t.type, accountId: t.account_id, amount: Number(t.amount), date: t.date, categoryId: t.category_id }))
    return totaisDoDemonstrativo(tx, { start: '2026-11-01', end: '2026-11-30' }, criarRegraDemonstrativo([], []), 'cheio')
  }

  it('por terceiro sem receita: sai do A pagar, conta no bem, sem lançamento', async () => {
    const r = await marcar({ tipo: 'terceiro', favorecido: 'Fernando', schedule_id: 's1', ocorrencia: '2026-11-10' })
    expect(r.statusCode).toBe(200)
    expect(r.body.efeitos).toMatchObject({ agendamento: { id: 's1', ocorrencia: '2026-11-10' }, bem: { id: 'cons', saldo: 800 } })
    expect(r.body.efeitos.lancamento).toBeUndefined()
    expect((await q(`SELECT registered FROM agendamentos WHERE id = 's1'`))[0].registered).toEqual(['2026-11-10'])
    expect(await saldo('itau')).toBe(1000)
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
    expect(await demonstrativo()).toEqual({ receita: 0, despesa: 0 })
    const e = await lerExtrato('cons')
    const resumo = resumoDoBem(e.bens[0], extratoDoBem(e.bens[0], e), [], e.cotas)
    expect(resumo).toMatchObject({ terceiros: 800, custoProprioLiquido: 0, pagoSemJuros: 800 })
    expect(batimento((await chamar(consorcio, 'GET', { url: '/api/consorcio?bem_id=cons' })).body.consorcio.cotas, resumo.pagoSemJuros, e.baixas).parcelasFinup).toBe(1)
  })

  it('por terceiro com receita: só a receita aparece no Demonstrativo, e o valor conta uma vez', async () => {
    const r = await marcar({ tipo: 'terceiro', favorecido: 'Fernando', schedule_id: 's1', ocorrencia: '2026-11-10', gerar_receita: true, categoria_id: 'cat_b' })
    expect(r.body.efeitos.lancamento).toMatchObject({ type: 'income', accountId: 'cons', amount: 800, categoryId: 'cat_b', payee: 'Fernando', bemPapel: 'terceiro' })
    expect(await saldo('cons')).toBe(800)
    expect(await saldo('itau')).toBe(1000)
    expect(await demonstrativo()).toEqual({ receita: 800, despesa: 0 })
    const e = await lerExtrato('cons')
    const linhas = extratoDoBem(e.bens[0], e)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ classe: 'terceiro', selo: 'Paga por terceiro', valor: 800 })
    const cotas = (await chamar(consorcio, 'GET', { url: '/api/consorcio?bem_id=cons' })).body.consorcio.cotas
    expect(batimento(cotas, resumoDoBem(e.bens[0], linhas, [], e.cotas).pagoSemJuros, e.baixas).parcelasFinup).toBe(1)
  })

  it('por conta não controlada: entra no custo próprio, sem lançamento', async () => {
    await marcar({ tipo: 'conta_externa', schedule_id: 's1', ocorrencia: '2026-11-10', valor: 790 })
    const e = await lerExtrato('cons')
    expect(resumoDoBem(e.bens[0], extratoDoBem(e.bens[0], e), [], e.cotas)).toMatchObject({ foraDoFinup: 790, custoProprioLiquido: 790, pagoSemJuros: 790 })
    expect(await saldo('itau')).toBe(1000)
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
  })

  it('por crédito: quita a parcela sem entrar no custo próprio; crédito avulso abate valor e não quita', async () => {
    await marcar({ tipo: 'credito', schedule_id: 's1', ocorrencia: '2026-11-10' })
    await marcar({ tipo: 'credito', valor: 2.07, data: '2026-05-15', cota_numero: '10' })
    expect(await saldo('cons')).toBe(802.07)
    const e = await lerExtrato('cons')
    const resumo = resumoDoBem(e.bens[0], extratoDoBem(e.bens[0], e), [], e.cotas)
    expect(resumo).toMatchObject({ creditos: 802.07, custoProprioLiquido: 0 })
    const cotas = (await chamar(consorcio, 'GET', { url: '/api/consorcio?bem_id=cons' })).body.consorcio.cotas
    expect(batimento(cotas, resumo.pagoSemJuros, e.baixas).parcelasFinup).toBe(1)
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
  })

  it('exige motivo, favorecido, categoria e não baixa a mesma parcela duas vezes', async () => {
    expect((await marcar({ tipo: 'x' })).statusCode).toBe(400)
    expect((await marcar({ tipo: 'terceiro', schedule_id: 's1', ocorrencia: '2026-11-10' })).statusCode).toBe(400)
    expect((await marcar({ tipo: 'terceiro', favorecido: 'F', gerar_receita: true, schedule_id: 's1', ocorrencia: '2026-11-10' })).statusCode).toBe(400)
    await marcar({ tipo: 'conta_externa', schedule_id: 's1', ocorrencia: '2026-11-10' })
    expect((await marcar({ tipo: 'conta_externa', schedule_id: 's1', ocorrencia: '2026-11-10' })).statusCode).toBe(409)
    expect(await saldo('cons')).toBe(800)
  })

  it('estorno: a parcela volta a pendente, os totais voltam e a receita é apagada', async () => {
    const r = await marcar({ tipo: 'terceiro', favorecido: 'Fernando', schedule_id: 's1', ocorrencia: '2026-11-10', gerar_receita: true, categoria_id: 'cat_b' })
    const e = await chamar(baixas, 'POST', { body: { acao: 'estornar', baixa_id: r.body.baixa_id } })
    expect(e.statusCode).toBe(200)
    expect(e.body.efeitos).toMatchObject({ agendamento: { id: 's1', ocorrencia: '2026-11-10' }, lancamento_removido: r.body.efeitos.lancamento.id, bem: { saldo: 0 } })
    expect((await q(`SELECT registered FROM agendamentos WHERE id = 's1'`))[0].registered).toEqual([])
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
    expect(await saldo('cons')).toBe(0)
    const ext = await lerExtrato('cons')
    expect(ext.baixas).toEqual([])
    expect((await chamar(baixas, 'POST', { body: { acao: 'estornar', baixa_id: r.body.baixa_id } })).statusCode).toBe(404)
    expect((await marcar({ tipo: 'conta_externa', schedule_id: 's1', ocorrencia: '2026-11-10' })).statusCode).toBe(200)
  })
})

describe('Permissões: segue o perfil do bem', () => {
  const restrito = { id: 'u2', nivel: 'operador', perfis: ['P2'] }
  it('usuário de outro perfil não vê nem grava', async () => {
    await cadastrar()
    await agendar('s1')
    const r = await chamar(baixas, 'POST', { user: restrito, body: { acao: 'registrar', bem_id: 'cons', tipo: 'credito', valor: 10, data: '2026-11-10' } })
    expect(r.statusCode).toBe(403)
    expect(await saldo('cons')).toBe(120000)
    expect((await lerExtrato('cons', restrito)).baixas).toEqual([])
    expect((await lerExtrato('cons', restrito)).bens).toEqual([])
    const [{ id }] = await q(`SELECT id FROM bem_baixas`)
    expect((await chamar(baixas, 'POST', { user: restrito, body: { acao: 'estornar', baixa_id: id } })).statusCode).toBe(403)
    expect((await chamar(consorcio, 'PUT', { user: restrito, body: { bem_id: 'cons', cotas: [cota250] } })).statusCode).toBe(403)
    expect((await lerExtrato('cons')).baixas).toHaveLength(1)
  })
  it('consulta não grava', async () => {
    const r = await chamar(baixas, 'POST', { user: { id: 'u3', nivel: 'consulta', perfis: 'todos' }, body: { acao: 'registrar', bem_id: 'cons', tipo: 'credito', valor: 10, data: '2026-11-10' } })
    expect(r.statusCode).toBe(403)
  })
})

describe('Financiamento', () => {
  const criar = (extra = {}) => chamar(criarFinanciamento, 'POST', {
    body: { bem_id: 'carro', valor_principal: 10000, num_parcelas: 10, valor_parcela: 1200, banco: 'Banco', data_primeira_parcela: '2026-01-10', conta_origem_id: 'itau', ...extra },
  })

  it('abertura na criação: parcelas pagas, sem agendamento nem lançamento; dívida e bem acompanham; estorno reabre', async () => {
    const r = await criar({ abertura: { parcelas: 4, valor: 4700, data: '2026-05-01' } })
    expect(r.statusCode).toBe(200)
    expect(r.body.financiamento.agendamentos_criados).toBe(6)
    const contaDivida = r.body.conta_divida.id
    expect(r.body.conta_divida.balance).toBe(-6000)
    expect(await saldo(contaDivida)).toBe(-6000)
    expect(await saldo('carro')).toBe(4700)
    expect(await saldo('itau')).toBe(1000)
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
    expect(await q(`SELECT 1 FROM agendamentos`)).toHaveLength(6)
    const parcelas = await q(`SELECT status, baixa_tipo, schedule_id FROM financing_installments ORDER BY numero_parcela`)
    expect(parcelas.filter(p => p.status === 'paid' && p.baixa_tipo === 'abertura' && !p.schedule_id)).toHaveLength(4)

    const e = await lerExtrato('carro')
    expect(resumoDoBem(e.bens[0], extratoDoBem(e.bens[0], e), e.parcelas, e.cotas)).toMatchObject({ abertura: 4700, pagoSemJuros: 4700, faltaPagar: 7200 })

    const [{ id }] = await q(`SELECT id FROM bem_baixas`)
    const est = await chamar(baixas, 'POST', { body: { acao: 'estornar', baixa_id: id } })
    expect(est.body.efeitos).toMatchObject({ agendamentos_criados: 4, bem: { saldo: 0 }, divida: { saldo: -10000 } })
    expect(await q(`SELECT 1 FROM agendamentos`)).toHaveLength(10)
    expect(await q(`SELECT 1 FROM financing_installments WHERE status = 'open' AND schedule_id IS NOT NULL`)).toHaveLength(10)
  })

  it('marcar parcela: quita, tira da dívida e do A pagar, sem mexer em conta; estorno volta tudo', async () => {
    const r = await criar()
    const divida = r.body.conta_divida.id
    const [p] = await q(`SELECT * FROM financing_installments ORDER BY numero_parcela LIMIT 1`)
    const m = await chamar(baixas, 'POST', { body: { acao: 'registrar', bem_id: 'carro', tipo: 'conta_externa', valor: 1150, data: '2026-01-12', parcela_id: p.id } })
    expect(m.statusCode).toBe(200)
    expect(m.body.efeitos).toMatchObject({ agendamento: { id: p.schedule_id, ocorrencia: '2026-01-10' }, divida: { saldo: -9000 }, bem: { saldo: 1150 } })
    expect((await q(`SELECT status, baixa_tipo, total_pago FROM financing_installments WHERE id = $1`, [p.id]))[0]).toMatchObject({ status: 'paid', baixa_tipo: 'conta_externa' })
    expect(await saldo('itau')).toBe(1000)
    expect(await q(`SELECT 1 FROM lancamentos`)).toHaveLength(0)
    expect((await chamar(baixas, 'POST', { body: { acao: 'registrar', bem_id: 'carro', tipo: 'conta_externa', valor: 1150, data: '2026-01-12', parcela_id: p.id } })).statusCode).toBe(409)

    const est = await chamar(baixas, 'POST', { body: { acao: 'estornar', baixa_id: m.body.baixa_id } })
    expect(est.body.efeitos).toMatchObject({ divida: { saldo: -10000 }, bem: { saldo: 0 } })
    expect((await q(`SELECT status, baixa_tipo, total_pago FROM financing_installments WHERE id = $1`, [p.id]))[0]).toMatchObject({ status: 'open', baixa_tipo: null })
    expect((await q(`SELECT registered FROM agendamentos WHERE id = $1`, [p.schedule_id]))[0].registered).toEqual([])
    expect(await saldo(divida)).toBe(-10000)
  })

  it('não aceita parcela de outro bem nem abertura além do prazo', async () => {
    const r = await criar()
    const [p] = await q(`SELECT id FROM financing_installments LIMIT 1`)
    expect((await chamar(baixas, 'POST', { body: { acao: 'registrar', bem_id: 'cons', tipo: 'credito', valor: 1, data: '2026-01-12', parcela_id: p.id } })).statusCode).toBe(404)
    expect((await chamar(baixas, 'POST', { body: { acao: 'abertura', financing_id: r.body.financiamento.id, parcelas: 11, valor: 100, data: '2026-01-12' } })).statusCode).toBe(400)
  })
})
