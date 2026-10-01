import { describe, it, expect } from 'vitest'
import { executarRegras } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { OPC, GRUPOS, CONTAS, gasto, etapaA } from './fixtures'

// PARCELA_NUMERO_INCOERENTE — "parcela de origem ausente". Caso de 01/10/2026: "M6 Comercio -Ct On
// 4/4" e "Aramis 4/4" na fatura 10/2026 do Itaupers, favorecido "… 1/4" herdado da linha geradora.
// A 1/4 (07/2026) sumiu (limpeza de duplicatas / outra descrição), mas a série 3/4 (09) → 4/4 (10)
// está coerente: mesmo valor, mesma base, faturas consecutivas, etapas A corretas.

const REGRA = { ...OPC, regras: ['PARCELA_NUMERO_INCOERENTE'] }
const porRegraIncoerente = (divs) => divs.filter(d => d.regra === 'PARCELA_NUMERO_INCOERENTE')
// A 4/4 foi gerada pela importação e herdou o favorecido "… 1/4"; as anteriores vieram do extrato
// com o próprio número no favorecido.
const parcela = (id, base, n, valor, fmy) => gasto(id, `${base} ${n}/4`, valor, fmy, {
  installmentNum: n, installmentTotal: 4, payee: `${base} ${n === 4 ? 1 : n}/4`,
})
const dados = (txs, extra = {}) => {
  const gastos = txs.filter(t => t.type === 'expense')
  return {
    transactions: [...txs, ...gastos.map(g => etapaA(g))],
    schedules: [], accounts: CONTAS, gerencialGroups: GRUPOS, ...extra,
  }
}

const m6 = (nums) => nums.map(([n, fmy]) => parcela(`tx_m6_${n}`, 'M6 Comercio -Ct On', n, 189.75, fmy))
const aramis = (nums) => nums.map(([n, fmy]) => parcela(`tx_aramis_${n}`, 'Aramis', n, 224.5, fmy))

describe('PARCELA_NUMERO_INCOERENTE — origem ausente com série coerente', () => {
  it('M6 e Aramis 4/4: a 1/4 sumiu, mas 2/4 → 3/4 → 4/4 em faturas consecutivas → sem pendência', () => {
    const d = dados([
      ...m6([[2, '2026-08'], [3, '2026-09'], [4, '2026-10']]),
      ...aramis([[2, '2026-08'], [3, '2026-09'], [4, '2026-10']]),
    ])
    expect(executarRegras(d, REGRA)).toEqual([])
  })

  it('3/4 de fatura fechada serve de referência para a 4/4 aberta', () => {
    const d = dados(m6([[3, '2026-09'], [4, '2026-10']]), { faturasFechadas: { 'acc_itaupers_2026-09': true } })
    expect(executarRegras(d, REGRA)).toEqual([])
  })

  it('buraco real perto da parcela avaliada (4/4 sem 3/4) continua gerando pendência', () => {
    const r = executarRegras(dados(m6([[2, '2026-08'], [4, '2026-10']])), REGRA)
    expect(r.map(x => [x.origem_id, x.encontrado.motivos])).toEqual([['tx_m6_4', ['parcela_de_origem_ausente']]])
  })

  it('a anterior com OUTRO valor não conta como série coerente', () => {
    const d = dados([parcela('tx_m6_3', 'M6 Comercio -Ct On', 3, 150, '2026-09'), ...m6([[4, '2026-10']])])
    expect(executarRegras(d, REGRA).map(x => x.origem_id)).toEqual(['tx_m6_4'])
  })

  it('favorecido com número MAIOR que o exibido ou total diferente continua incoerente', () => {
    const maior = gasto('tx_x', 'Loja Z 2/4', 50, '2026-10', { installmentNum: 2, installmentTotal: 4, payee: 'Loja Z 3/4' })
    const total = gasto('tx_y', 'Loja W 2/4', 60, '2026-10', { installmentNum: 2, installmentTotal: 4, payee: 'Loja W 1/5' })
    const anteriores = [
      gasto('tx_x1', 'Loja Z 1/4', 50, '2026-09', { installmentNum: 1, installmentTotal: 4 }),
      gasto('tx_y1', 'Loja W 1/4', 60, '2026-09', { installmentNum: 1, installmentTotal: 4 }),
    ]
    const r = executarRegras(dados([maior, total, ...anteriores]), REGRA)
    expect(r.map(x => [x.origem_id, x.encontrado.motivos])).toEqual([
      ['tx_x', ['descricao_original']], ['tx_y', ['descricao_original']],
    ])
  })

  it('a próxima varredura leva as duas pendências atuais para Resolvidas (resolvida_por = varredura)', () => {
    const atual = (id, desc) => ({
      id: `PARCELA_NUMERO_INCOERENTE|${id}`, regra: 'PARCELA_NUMERO_INCOERENTE', severidade: 'aprovar',
      origem_id: id, conta_id: 'acc_itaupers', fatura_ref: '10/2026', descricao: desc,
      status: 'pendente', resolvida_por: null,
    })
    const existentes = [atual('tx_m6_4', 'M6 Comercio -Ct On 4/4'), atual('tx_aramis_4', 'Aramis 4/4')]
    const d = dados([
      ...m6([[2, '2026-08'], [3, '2026-09'], [4, '2026-10']]),
      ...aramis([[2, '2026-08'], [3, '2026-09'], [4, '2026-10']]),
    ])
    const plano = planejarVarredura(existentes, executarRegras(d, OPC), {})
    const t = aplicarPlano(existentes, plano, 't')
    expect(porRegraIncoerente(executarRegras(d, OPC))).toEqual([])
    // A varredura completa também grava pendências de outras regras (ex.: a 1/4 que falta na série).
    expect(t.filter(p => p.regra === 'PARCELA_NUMERO_INCOERENTE').map(p => [p.origem_id, p.status, p.resolvida_por])).toEqual([
      ['tx_m6_4', 'resolvida', 'varredura'],
      ['tx_aramis_4', 'resolvida', 'varredura'],
    ])
  })
})
