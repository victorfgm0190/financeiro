// Casamento de valores de centavos (correção de 12/11/2026): estornos de centavos do mesmo dia casam
// cada um com a SUA loja, o resultado não depende da ordem e uma linha sem par da mesma loja nunca é
// engolida por outra loja. Dados fictícios.
import { describe, it, expect } from 'vitest'
import { resolverLinhasRevisao, diferencasDoConciliado } from './revisaoImportacao.js'
import { aplicarJaLancados, avaliarJaLancado } from './casamentoFatura.js'
import { aplicarCorrespondencias } from './importacaoCorrespondencias.js'
import { valorCompativel, mesmaLoja, lojaNormalizada } from './casamentoValor.js'
import { parearConciliacao, crossMatchConciliacao } from './conciliacaoMatch.js'

const CARTAO = 'acc_cartao'
const DIA = '2026-10-26'
// Oito estornos de centavos do mesmo dia (lojas fictícias, valores repetidos de propósito).
const ESTORNOS = [
  ['LOJA ALFA            SAO PAULO BR', 0.01], ['FARMACIA BETA        CURITIBA BR', 0.02],
  ['EMPORIO GAMA         LONDRINA BR', 0.03], ['PERFUMARIA DELTA     CAMPINAS BR', 0.04],
  ['GAMES EPSILON        SAO PAULO BR', 0.04], ['MARKETPLACE ZETA     SAO PAULO BR', 0.05],
  ['LIVRARIA ETA         RECIFE BR', 0.02], ['PAPELARIA TETA       NATAL BR', 0.03],
]
const linha = (i, [description, amount], extra = {}) => ({
  _id: `l${i}`, type: 'income', selected: true, description, amount, faturaMonthYear: '2026-11',
  date: DIA, _dateCartao: DIA, ...extra,
})
const conciliado = (i, [description, amount], extra = {}) => ({
  id: `t${i}`, accountId: CARTAO, accountType: 'credit', type: 'income', description, amount,
  date: DIA, dateCartao: DIA, faturaMonthYear: '2026-11', reconciled: true, ...extra,
})
const pipeline = (rows, transactions) => {
  const base = resolverLinhasRevisao(rows, { accountId: CARTAO, transactions, closingDay: 13 })
  const ja = aplicarJaLancados(base, { transactions, accountId: CARTAO, closingDay: 13 })
  return aplicarCorrespondencias(ja, { transactions, accounts: [{ id: CARTAO, closingDay: 13, type: 'credit' }], accountId: CARTAO })
}
const pares = (out) => Object.fromEntries(out.map(r => [r.description.split('  ')[0], (r._dbTx || r._collisionTx || r._jaLancado?.tx)?.description?.split('  ')[0] || null]))
// Embaralhamento determinístico (sem Math.random).
const embaralhar = (arr, semente) => {
  const a = [...arr]
  let s = semente
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

describe('regra de valor e loja', () => {
  it('abaixo de R$ 1,00: só o exato, ou ±0,01 da mesma loja; a partir de R$ 1,00, ±0,01', () => {
    const a = { description: 'MARKETPLACE ZETA   SAO PAULO BR', amount: 0.05 }
    expect(valorCompativel(a, { description: 'Perfumaria Delta', amount: 0.04 })).toBe(false)
    expect(valorCompativel(a, { description: 'Marketplace Zeta', amount: 0.04 })).toBe(true)
    expect(valorCompativel(a, { description: 'Perfumaria Delta', amount: 0.05 })).toBe(true)
    expect(valorCompativel({ description: 'X', amount: 20.91 }, { description: 'Y', amount: 20.9 })).toBe(true)
    expect(valorCompativel({ description: 'X', amount: 20.92 }, { description: 'Y', amount: 20.9 })).toBe(false)
  })
  it('mesma loja: nome sem cidade, pontuação e números; ou o mesmo favorecido', () => {
    expect(lojaNormalizada('MARKETPLACE*ZETA 4541   SAO PAULO BR')).toBe('marketplace zeta')
    expect(mesmaLoja({ description: 'FARMACIA BETA   CURITIBA BR' }, { description: 'Farmácia Beta' })).toBe(true)
    expect(mesmaLoja({ description: 'BETA' }, { description: 'Beta Drogarias' })).toBe(true)
    expect(mesmaLoja({ description: 'LOJA ALFA' }, { description: 'LOJA ALFAMA' })).toBe(false)
    expect(mesmaLoja({ description: 'X', payee: 'Loja Alfa' }, { description: 'Y', payee: 'loja alfa' })).toBe(true)
  })
})

describe('reimportação: oito estornos de centavos do mesmo dia', () => {
  const rows = ESTORNOS.map((e, i) => linha(i, e))
  const banco = ESTORNOS.map((e, i) => conciliado(i, e))
  const esperado = Object.fromEntries(ESTORNOS.map(([d]) => [d.split('  ')[0], d.split('  ')[0]]))

  it('cada um casa com a SUA loja e nenhum mostra diferença falsa', () => {
    const out = pipeline(rows, banco)
    expect(pares(out)).toEqual(esperado)
    expect(out.every(r => r._isDuplicate && diferencasDoConciliado(r, r._dbTx).length === 0)).toBe(true)
  })

  it('embaralhar a ordem das linhas e dos lançamentos dá o mesmo resultado', () => {
    for (const semente of [1, 7, 42, 99, 2026]) {
      const out = pipeline(embaralhar(rows, semente), embaralhar(banco, semente * 3))
      expect(pares(out)).toEqual(esperado)
    }
  })

  it('com um lançamento a mais na fatura (de outra loja, mesmo valor), nada muda', () => {
    const extra = conciliado(99, ['OUTRA LOJA KAPPA      SALVADOR BR', 0.04])
    for (const semente of [3, 11]) {
      const out = pipeline(embaralhar(rows, semente), embaralhar([extra, ...banco], semente))
      expect(pares(out)).toEqual(esperado)
    }
  })

  it('linha de centavos sem par da mesma loja vira NOVA — não é engolida por outra loja', () => {
    // A Loja Alfa (0,01) não está no Finup; sobra um conciliado de outra loja com 0,02.
    const semAlfa = banco.filter(t => !t.description.startsWith('LOJA ALFA'))
    const sobra = conciliado(98, ['OUTRA LOJA KAPPA      SALVADOR BR', 0.02])
    const out = pipeline(rows, [...semAlfa, sobra])
    const alfa = out.find(r => r.description.startsWith('LOJA ALFA'))
    expect(alfa._isDuplicate).toBe(false)
    expect(alfa._collisionTx).toBeNull()
    expect(alfa._jaLancado).toBeFalsy()
    expect(alfa._jaLancadoOpcoes).toBeFalsy()
    expect(alfa.selected).toBe(true)
  })

  it('com candidato NÃO conciliado da mesma loja, a linha casa com ele (nunca com outra loja)', () => {
    const semAlfa = banco.filter(t => !t.description.startsWith('LOJA ALFA'))
    const alfaPendente = conciliado(97, ['Loja Alfa', 0.01], { reconciled: false })
    const outraPendente = conciliado(96, ['Outra Loja Kappa', 0.01], { reconciled: false })
    const out = pipeline(rows, [...semAlfa, outraPendente, alfaPendente])
    const alfa = out.find(r => r.description.startsWith('LOJA ALFA'))
    const tx = alfa._dbTx || alfa._jaLancado?.tx || (alfa._jaLancadoOpcoes?.length === 1 ? alfa._jaLancadoOpcoes[0] : null)
    expect(tx?.id).toBe('t97')
  })

  it('"Já lançado": centavos de outra loja com ±0,01 não é candidato', () => {
    const r = linha(0, ['MARKETPLACE ZETA     SAO PAULO BR', 0.05])
    expect(avaliarJaLancado(r, conciliado(1, ['Perfumaria Delta', 0.04], { reconciled: false }), 13)).toBeNull()
    expect(avaliarJaLancado(r, conciliado(2, ['Marketplace Zeta', 0.04], { reconciled: false }), 13)).toBe('auto')
  })
})

describe('Conciliar Fatura', () => {
  it('pareamento principal: centavos não casam com ±0,50; mesma ordem → mesmo resultado', () => {
    const itens = [{ type: 'income', description: 'TARIFA AJUSTE', amount: 0.4 }, { type: 'income', description: 'TARIFA AJUSTE', amount: 0.1 }]
    const sistema = [{ id: 's1', type: 'income', description: 'TARIFA AJUSTE', amount: 0.1 }]
    const a = parearConciliacao(itens, sistema)
    expect(a.matched.map(m => [m.csv.amount, m.sys.id])).toEqual([[0.1, 's1']])
    expect(a.soItau.map(c => c.amount)).toEqual([0.4])
    const b = parearConciliacao([...itens].reverse(), sistema)
    expect(b.matched.map(m => [m.csv.amount, m.sys.id])).toEqual([[0.1, 's1']])
  })
  it('cruzamento: centavos só com a mesma loja; ordem do arquivo não muda o par', () => {
    const itau = [
      { _id: 'a', type: 'income', description: 'MARKETPLACE ZETA', amount: 0.05 },
      { _id: 'b', type: 'income', description: 'PERFUMARIA DELTA', amount: 0.04 },
    ]
    const sistema = [{ id: 'x', type: 'income', description: 'Perfumaria Delta', amount: 0.04 }]
    for (const ordem of [itau, [...itau].reverse()]) {
      const r = crossMatchConciliacao(ordem, sistema)
      expect(r.soItau.find(i => i._id === 'b')._crossSysId).toBe('x')
      expect(r.soItau.find(i => i._id === 'a')._crossSysId).toBeUndefined()
    }
  })
})
