import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import process from 'node:process'
import { _definirFabricaDePool } from './_conexao.js'
import { montarAmbiente, prepararChamadas, chamar, USUARIOS as U } from './_testes/ambientePerfis.js'

// Auditoria 11/2026, item 1 (P0): POST /api/historico grava lançamentos/agendamentos INTEIROS. Só
// aceita registros dos perfis permitidos (conferidos pelo que está GRAVADO no banco) e exige o
// módulo de cada tabela — não basta "editar" em qualquer módulo. Recusa = 403 e nada gravado.

const historico = (await import('./historico.js')).default
let amb
beforeAll(async () => { amb = await montarAmbiente() }, 180_000)
let env
beforeEach(() => { env = { ...process.env }; prepararChamadas(amb) })
afterEach(() => { process.env = env; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const lanc = (id, conta, extra = {}) => ({ id, type: 'expense', amount: 99, date: '2026-10-05', account_id: conta, description: 'Editado', category_id: 'c1', ...extra })
const ag = (id, conta) => ({ id, description: 'Editado', transaction_type: 'expense', amount: 99, frequency: 'monthly', start_date: '2026-10-01', account_id: conta })
const linhaH = (entidade, id) => ({ entidade, entidade_id: id, escopo: 'parcela', campo: 'amount', valor_anterior: 1, valor_novo: 99 })
const post = (quem, body) => chamar(amb, historico, quem, { url: '/api/historico', body: { lote_id: 'L', ...body } })
const valor = async (tabela, id) => Number((await amb.q(`SELECT amount FROM ${tabela} WHERE id = $1`, [id]))[0]?.amount)
const nHist = async () => (await amb.q('SELECT count(*)::int n FROM historico_alteracoes'))[0].n

describe('POST /api/historico — perfis permitidos (registro gravado no banco)', () => {
  it('lançamento de outro perfil → 403, nada gravado (nem o histórico)', async () => {
    const antes = await nHist()
    const r = await post(U.restrito, { lancamentos: [lanc('l_b', 'conta_b')], historico: [linhaH('lancamento', 'l_b')] })
    expect(r.statusCode).toBe(403)
    expect(await valor('lancamentos', 'l_b')).toBe(20)
    expect(await nHist()).toBe(antes)
  })

  it('o navegador não escolhe o dono: trazer o lançamento de outro perfil para a própria conta → 403', async () => {
    const r = await post(U.restrito, { lancamentos: [lanc('l_b', 'conta_a')] })
    expect(r.statusCode).toBe(403)
    expect((await amb.q("SELECT account_id FROM lancamentos WHERE id = 'l_b'"))[0].account_id).toBe('conta_b')
  })

  it('criar lançamento novo em conta de outro perfil → 403', async () => {
    const r = await post(U.restrito, { lancamentos: [lanc('l_novo_b', 'conta_b')] })
    expect(r.statusCode).toBe(403)
    expect(await amb.q("SELECT id FROM lancamentos WHERE id = 'l_novo_b'")).toEqual([])
  })

  it('agendamento de outro perfil → 403', async () => {
    const r = await post(U.restrito, { agendamentos: [ag('ag_b', 'conta_b')] })
    expect(r.statusCode).toBe(403)
    expect(await valor('agendamentos', 'ag_b')).toBe(1)
  })

  it('mistura (um permitido + um não) → 403 e NENHUM é gravado', async () => {
    const r = await post(U.restrito, { lancamentos: [lanc('l_a', 'conta_a'), lanc('l_b', 'conta_b')] })
    expect(r.statusCode).toBe(403)
    expect(await valor('lancamentos', 'l_a')).toBe(10)
    expect(await valor('lancamentos', 'l_b')).toBe(20)
  })

  it('só linha de histórico apontando para registro de outro perfil → 403', async () => {
    const antes = await nHist()
    const r = await post(U.restrito, { historico: [linhaH('agendamento', 'ag_b')] })
    expect(r.statusCode).toBe(403)
    expect(await nHist()).toBe(antes)
  })

  it('registro do próprio perfil → 200, grava a linha e o histórico', async () => {
    const antes = await nHist()
    const r = await post(U.restrito, { lancamentos: [lanc('l_a', 'conta_a', { amount: 11 })], historico: [linhaH('lancamento', 'l_a')] })
    expect(r.statusCode).toBe(200)
    expect(await valor('lancamentos', 'l_a')).toBe(11)
    expect(await nHist()).toBe(antes + 1)
  })

  it('admin com todos os perfis grava em qualquer perfil', async () => {
    const r = await post(U.admin, { lancamentos: [lanc('l_b', 'conta_b', { amount: 21 })], agendamentos: [ag('ag_b', 'conta_b')] })
    expect(r.statusCode).toBe(200)
    expect(await valor('lancamentos', 'l_b')).toBe(21)
  })
})

describe('POST /api/historico — permissão do módulo de cada tabela', () => {
  it('"editar" só em Orçamento não grava lançamento nem agendamento → 403', async () => {
    expect((await post(U.soOrcamento, { lancamentos: [lanc('l_a', 'conta_a', { amount: 55 })] })).statusCode).toBe(403)
    expect((await post(U.soOrcamento, { agendamentos: [ag('ag_a', 'conta_a')] })).statusCode).toBe(403)
    expect((await post(U.soOrcamento, { historico: [linhaH('lancamento', 'l_a')] })).statusCode).toBe(403)
    expect(await valor('lancamentos', 'l_a')).not.toBe(55)
  })

  it('quem só edita Agendamentos grava agendamento, mas não lançamento', async () => {
    expect((await post(U.soAgendamentos, { agendamentos: [ag('ag_a', 'conta_a')], historico: [linhaH('agendamento', 'ag_a')] })).statusCode).toBe(200)
    expect((await post(U.soAgendamentos, { lancamentos: [lanc('l_a', 'conta_a', { amount: 66 })] })).statusCode).toBe(403)
    expect((await post(U.soAgendamentos, { historico: [linhaH('lancamento', 'l_a')] })).statusCode).toBe(403)
    expect(await valor('lancamentos', 'l_a')).not.toBe(66)
  })

  it('Consulta (só ver) → 403 já na rota', async () => {
    expect((await post(U.consulta, { lancamentos: [lanc('l_a', 'conta_a')] })).statusCode).toBe(403)
  })
})
