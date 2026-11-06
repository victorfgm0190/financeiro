// Ganho/perda de venda de bem segue o perfil do bem em todas as visões filtradas por perfil, calculado
// pelo vínculo (bem_id), sem alterar dados. Sem perfil no bem: fora dos perfis, só em "Tudo".
import { describe, it, expect } from 'vitest'
import { bemDonoDoLancamento, lancamentoNasContas } from './origins.js'
import { filtrarPerfilDemonstrativo, regraDosConjuntos, despesaPorCategoria } from './regraDemonstrativo.js'
import { linhaPermitida, recortarLeitura } from '../../api/_permissoesApi.js'

const perda = { id: 'p', type: 'expense', amount: 100, date: '2026-08-07', categoryId: 'cat_perda', origin: 'patrimonio_auto', accountId: null, toAccountId: null, bemId: 'bem_a' }
const ganho = { ...perda, id: 'g', type: 'income', categoryId: 'cat_ganho', bemId: 'bem_b' }
const semBem = { ...perda, id: 's', bemId: null }
const comum = { id: 'c', type: 'expense', amount: 10, date: '2026-08-07', categoryId: 'cat_x', accountId: 'conta_a', toAccountId: null, origin: 'manual' }
const PERFIL_A = new Set(['conta_a', 'bem_a'])
const PERFIL_B = new Set(['conta_b', 'bem_b'])

describe('dono do lançamento', () => {
  it('só ganho/perda de venda de bem, sem conta e com bem ligado', () => {
    expect(bemDonoDoLancamento(perda)).toBe('bem_a')
    expect(bemDonoDoLancamento(semBem)).toBeNull()
    expect(bemDonoDoLancamento({ ...perda, origin: 'manual' })).toBeNull()
    expect(bemDonoDoLancamento({ ...perda, accountId: 'conta_b' })).toBeNull()
  })
  it('entra só no perfil do bem; sem bem, em nenhum perfil; lançamento comum segue pela conta', () => {
    expect(lancamentoNasContas(perda, PERFIL_A)).toBe(true)
    expect(lancamentoNasContas(perda, PERFIL_B)).toBe(false)
    expect(lancamentoNasContas(semBem, PERFIL_A)).toBe(false)
    expect(lancamentoNasContas(comum, PERFIL_A)).toBe(true)
    expect(lancamentoNasContas(comum, PERFIL_B)).toBe(false)
  })
  it('uma conta qualquer com bem_id continua pela conta, não pelo bem', () => {
    const comConta = { ...perda, accountId: 'conta_b' }
    expect(lancamentoNasContas(comConta, PERFIL_B)).toBe(true)
    expect(lancamentoNasContas(comConta, PERFIL_A)).toBe(false)
  })
})

describe('Demonstrativo', () => {
  const txs = [perda, ganho, semBem, comum]
  it('com perfil: perda e ganho no perfil do bem; "Tudo": todos', () => {
    expect(filtrarPerfilDemonstrativo(txs, [], PERFIL_A).map(t => t.id)).toEqual(['p', 'c'])
    expect(filtrarPerfilDemonstrativo(txs, [], PERFIL_B).map(t => t.id)).toEqual(['g'])
    expect(filtrarPerfilDemonstrativo(txs, [], null).map(t => t.id)).toEqual(['p', 'g', 's', 'c'])
  })
  it('a perda soma na categoria dela dentro do perfil do bem', () => {
    const regra = regraDosConjuntos({ reserveFunctions: [], aplicSet: new Set(), reservaSet: new Set(), reservaDespesaFuncSet: new Set() })
    const doPerfil = filtrarPerfilDemonstrativo(txs, [], PERFIL_A)
    const r = despesaPorCategoria(doPerfil, { start: '2026-08-01', end: '2026-08-31' }, regra)
    expect(r.cat_perda).toBe(100)
  })
})

describe('usuário restrito a alguns perfis (servidor)', () => {
  const linha = { id: 'p', origin: 'patrimonio_auto', account_id: null, to_account_id: null, bem_id: 'bem_a', reserva_funcao_id: null }
  it('vê só se o bem é de um perfil permitido', () => {
    expect(linhaPermitida('lancamentos', linha, PERFIL_A)).toBe(true)
    expect(linhaPermitida('lancamentos', linha, PERFIL_B)).toBe(false)
    expect(linhaPermitida('lancamentos', { ...linha, bem_id: null }, PERFIL_A)).toBe(false)
    expect(linhaPermitida('lancamentos', { ...linha, origin: 'manual' }, PERFIL_A)).toBe(false)
  })
  it('recorte da leitura usa a mesma regra', () => {
    const ctx = { contas: PERFIL_B, funcoes: new Set(), perfis: ['b'] }
    expect(recortarLeitura('lancamentos', [linha, { ...linha, id: 'g', bem_id: 'bem_b' }], ctx).map(r => r.id)).toEqual(['g'])
  })
})
