import { describe, it, expect } from 'vitest'
import { executarRegras } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { planejarAjuste, aplicarAjustes, verificarPendencias, podeAjustar } from './ajustes'
import { montarProvisaoGerencial } from '../provisaoGerencial'
import { saldosDaConta } from '../saldos'
import { OPC, CONTAS, GRUPOS, gasto, etapaA, devolucao, fixtureBug } from './fixtures'

const JIM = 'tx_1789736376094_z41mpw3eroa'
const FARM = 'tx_1789736376094_kvw8u5eevwc'

// Pendências como a varredura as grava (status pendente), a partir da fixture.
function pendenciasDe(dados, regra) {
  const tabela = aplicarPlano([], planejarVarredura([], executarRegras(dados, OPC), {}), 't0')
  return tabela.filter(p => p.regra === regra)
}
const etapasDo = (d, gastoId) => d.transactions.filter(t => t.type === 'transfer' && t.sourceExpenseId === gastoId)

describe('Ajuste de GER_ETAPA_A_FALTANDO', () => {
  const dados = fixtureBug()
  const pend = pendenciasDe(dados, 'GER_ETAPA_A_FALTANDO')

  it('só pendência auto + pendente tem botão', () => {
    expect(pend.every(podeAjustar)).toBe(true)
    expect(podeAjustar({ ...pend[0], status: 'ignorada' })).toBe(false)
    expect(podeAjustar({ ...pend[0], severidade: 'aprovar' })).toBe(false)
    expect(podeAjustar({ ...pend[0], regra: 'GER_ETAPA_A_ORFA' })).toBe(false)
  })

  it('o preview descreve exatamente a transferência a criar', () => {
    const plano = planejarAjuste(dados, pend.find(p => p.origem_id === FARM), OPC)
    expect(plano.ok).toBe(true)
    expect(plano.texto).toBe(
      'Criar transferência R$ 41,94 — Conta Corrente (acc_cc) → Ger. Itaupers (acc_ger_itaupers), ' +
      `fatura 10/2026, data 2026-09-01, id tx_gerA_${FARM}`)
  })

  it('cria exatamente 1 etapa A por gasto, sem mexer em saldo', () => {
    const r = aplicarAjustes(dados, pend, OPC)
    expect(r.aplicados.map(a => a.txId).sort()).toEqual([`tx_gerA_${FARM}`, `tx_gerA_${JIM}`])
    expect(etapasDo(r.nd, JIM)).toHaveLength(1)
    expect(etapasDo(r.nd, FARM)).toHaveLength(1)
    const et = r.nd.transactions.find(t => t.id === `tx_gerA_${JIM}`)
    expect(et).toMatchObject({
      type: 'transfer', accountId: 'acc_cc', toAccountId: 'acc_ger_itaupers', amount: 316.68,
      faturaRef: '10/2026', cardId: 'acc_itaupers', sourceExpenseId: JIM, origin: 'etapa_a',
      description: 'Reserva Gerencial - Jim.com* 60278703 3/3',
    })
    expect(r.nd.accounts).toBe(dados.accounts) // saldo fica para o recalcularSaldo
    expect(r.contasAfetadas.sort()).toEqual(['acc_cc', 'acc_ger_itaupers'])
  })

  it('segundo clique não cria outra', () => {
    const r1 = aplicarAjustes(dados, pend, OPC)
    const r2 = aplicarAjustes(r1.nd, pend, OPC)
    expect(r2.aplicados).toEqual([])
    expect(r2.ignorados.map(i => i.motivo)).toEqual([
      expect.stringContaining('já tem etapa A'), expect.stringContaining('já tem etapa A'),
    ])
    expect(r2.nd.transactions).toHaveLength(r1.nd.transactions.length)
    // e o mesmo ajuste aplicado 2× na mesma lista também não duplica
    const r3 = aplicarAjustes(dados, [...pend, ...pend], OPC)
    expect(r3.aplicados).toHaveLength(2)
  })

  it('pendência vira resolvida (varredura do item + plano)', () => {
    const r = aplicarAjustes(dados, pend, OPC)
    const v = verificarPendencias(r.nd, pend, OPC)
    expect(v.every(x => x.resolvida)).toBe(true)
    // a varredura completa seguinte também não vê mais a divergência
    const tabela = aplicarPlano([], planejarVarredura([], executarRegras(dados, OPC), {}), 't0')
    const t2 = aplicarPlano(tabela, planejarVarredura(tabela, executarRegras(r.nd, OPC), {}), 't1')
    expect(t2.filter(p => p.regra === 'GER_ETAPA_A_FALTANDO').map(p => p.status)).toEqual(['resolvida', 'resolvida'])
  })

  it('fixture de 30/09 termina com subconta = total G (R$ 5.701,32) e a fatura fecha', () => {
    const r = aplicarAjustes(dados, pend, OPC)
    const { balance } = saldosDaConta('acc_ger_itaupers', 0, r.nd.transactions, '2026-12-31')
    expect(balance).toBe(5701.32)
    const restantes = new Set(executarRegras(r.nd, OPC).map(d => d.regra))
    expect(restantes.has('GER_FECHAMENTO_FATURA')).toBe(false)
    expect(restantes.has('GER_SALDO_SUBCONTA')).toBe(false)
  })

  it('sem ajuste possível, a pendência continua com o motivo', () => {
    const semGrupo = { ...dados, gerencialGroups: GRUPOS.filter(g => g.number !== 1) }
    const plano = planejarAjuste(semGrupo, pend[0], OPC)
    expect(plano.ok).toBe(false)
    const v = verificarPendencias(dados, pend, OPC)
    expect(v.every(x => !x.resolvida && x.motivo)).toBe(true)
  })
})

describe('Ajuste de GER_ETAPA_A_VALOR', () => {
  it('alinha valor e fatura da etapa A existente (mesmo id, inclusive tx_ger_ antigo)', () => {
    const g = gasto('tx_v', 'Restaurante', 120, '2026-09')
    const et = etapaA(g, { id: 'tx_ger_1780000000000_z', origin: 'gerencial_auto', amount: 100, faturaRef: '08/2026' })
    const dados = { accounts: CONTAS, gerencialGroups: GRUPOS, transactions: [g, et], schedules: [devolucao('2026-09', [g])] }
    const pend = pendenciasDe(dados, 'GER_ETAPA_A_VALOR')
    expect(pend).toHaveLength(1)
    const plano = planejarAjuste(dados, pend[0], OPC)
    expect(plano.texto).toBe('Atualizar transferência tx_ger_1780000000000_z: R$ 100,00 (fatura 08/2026) → R$ 120,00 (fatura 09/2026) — Conta Corrente (acc_cc) → Ger. Itaupers (acc_ger_itaupers)')
    const r = aplicarAjustes(dados, pend, OPC)
    expect(etapasDo(r.nd, 'tx_v')).toEqual([expect.objectContaining({ id: 'tx_ger_1780000000000_z', amount: 120, faturaRef: '09/2026' })])
    expect(verificarPendencias(r.nd, pend, OPC)[0].resolvida).toBe(true)
    expect(aplicarAjustes(r.nd, pend, OPC).aplicados).toEqual([])
  })
})

describe('Núcleo compartilhado com o "Executar Gerenciais"', () => {
  it('parcela 2..N: data no dia financeiro do mês anterior à fatura; à vista: data do gasto', () => {
    const d = { accounts: CONTAS, gerencialGroups: GRUPOS, settings: { financialMonthStartDay: 15 } }
    const parc = gasto('tx_p', 'Curso 3/3', 90, '2026-10', { installmentNum: 3, installmentTotal: 3, date: '2026-09-15' })
    const avista = gasto('tx_av', 'Livro', 40, '2026-10', { date: '2026-09-20' })
    expect(montarProvisaoGerencial(d, parc, { id: 'x', origin: 'gerencial_auto' }).tx.date).toBe('2026-09-15')
    expect(montarProvisaoGerencial(d, avista, { id: 'y', origin: 'gerencial_auto' }).tx.date).toBe('2026-09-20')
  })
})
