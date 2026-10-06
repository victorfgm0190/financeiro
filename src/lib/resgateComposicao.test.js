import { describe, it, expect } from 'vitest'
import { composicaoResgate, ehResgateDeCartao, itemSaidaFluxo, itemAbreComposicao, parteDaFuncao } from './resgateComposicao'
import { computeOccurrences } from './occurrences'

const getOcc = (s, n) => computeOccurrences(s, n)

const resgate = (over = {}) => ({
  id: 'sch_res_itau_202610', tipo: 'resgate_reserva', transactionType: 'transfer',
  description: 'Resgate Reserva Itaupers - Fatura 10/2026', accountId: 'acc_reserva',
  toAccountId: 'acc_corrente', amount: 300, frequency: 'once', startDate: '2026-10-25',
  sourceExpenseIds: ['tx_a', 'tx_b', 'sch:sch_anuidade@2026-10-20'], ...over,
})

const transactions = [
  { id: 'tx_b', date: '2026-10-12', description: 'Mercado', categoryId: 'cat_merc', amount: 120 },
  { id: 'tx_a', date: '2026-10-03', description: 'Farmácia', categoryId: 'cat_saude', amount: 80 },
  { id: 'tx_fora', date: '2026-10-05', description: 'Não faz parte', amount: 999 },
]

const anuidade = {
  id: 'sch_anuidade', description: 'Anuidade', transactionType: 'expense', accountId: 'card_itau',
  categoryId: 'cat_tarifa', amount: 100, frequency: 'once', startDate: '2026-10-20', registered: [], skipped: [],
}

describe('linha de resgate no Fluxo Futuro', () => {
  it('resgate de cartão é clicável (pelo tipo, não pela descrição)', () => {
    const it_ = itemSaidaFluxo(resgate(), '2026-10-25', 300, 'fn_receita')
    expect(it_).toEqual({
      date: '2026-10-25', label: 'Resgate Reserva Itaupers - Fatura 10/2026', amount: 300,
      resgateScheduleId: 'sch_res_itau_202610', functionId: 'fn_receita',
    })
    expect(itemAbreComposicao(it_)).toBe(true)
  })

  it('transferência comum não é clicável, mesmo com "Resgate" na descrição', () => {
    const comum = { id: 'sch_t', transactionType: 'transfer', description: 'Resgate Reserva manual', amount: 50 }
    expect(ehResgateDeCartao(comum)).toBe(false)
    const it_ = itemSaidaFluxo(comum, '2026-10-10', 50)
    expect(it_.resgateScheduleId).toBeUndefined()
    expect(itemAbreComposicao(it_)).toBe(false)
  })

  it('provisão / item sem schedule não é clicável', () => {
    expect(itemAbreComposicao({ date: '2026-10-01', label: 'Resgate (provisão)', amount: 10 })).toBe(false)
    expect(itemAbreComposicao(null)).toBe(false)
  })
})

describe('composicaoResgate', () => {
  it('realizados + previstos somam o amount do resgate', () => {
    const r = composicaoResgate(resgate(), transactions, [anuidade], getOcc)
    expect(r.gastos.map(g => g.key)).toEqual(['tx_a', 'tx_b', 'sch:sch_anuidade@2026-10-20'])
    expect(r.gastos.map(g => g.previsto)).toEqual([false, false, true])
    expect(r.total).toBe(300)
    expect(r.diferenca).toBe(0)
    expect(r.fecha).toBe(true)
    expect(r.qtdPrevistos).toBe(1)
    expect(r.semFontes).toBe(false)
  })

  it('aponta a diferença quando a soma não fecha', () => {
    const r = composicaoResgate(resgate({ amount: 310 }), transactions, [anuidade], getOcc)
    expect(r.fecha).toBe(false)
    expect(r.diferenca).toBe(-10)
  })

  it('soma em centavos sem erro de ponto flutuante', () => {
    const txs = [
      { id: 'x1', date: '2026-10-01', amount: 0.1 },
      { id: 'x2', date: '2026-10-02', amount: 0.2 },
    ]
    const r = composicaoResgate(resgate({ amount: 0.3, sourceExpenseIds: ['x1', 'x2'] }), txs, [], getOcc)
    expect(r.total).toBe(0.3)
    expect(r.fecha).toBe(true)
  })

  it('resgate sem sourceExpenseIds (antigo/manual) → semFontes', () => {
    const r = composicaoResgate(resgate({ sourceExpenseIds: undefined }), transactions, [], getOcc)
    expect(r.semFontes).toBe(true)
    expect(r.gastos).toEqual([])
    expect(r.fecha).toBe(false)
  })

  it('previsto de agendamento apagado continua na lista como órfão', () => {
    const r = composicaoResgate(resgate(), transactions, [], getOcc)
    const orfao = r.gastos.find(g => g.previsto)
    expect(orfao.orfao).toBe(true)
    expect(orfao.description).toBe('(agendamento removido)')
  })
})

// Detalhamento como o motor grava: 1 linha por gasto, com o reserva_funcao_id do próprio gasto.
const srf = (sourceLancamentoId, reservaFuncaoId, valor) => ({
  id: `srf_sch_res_itau_202610_${sourceLancamentoId}`, scheduleId: 'sch_res_itau_202610',
  reservaFuncaoId, valor, sourceLancamentoId, sourceIds: [sourceLancamentoId],
})
const det = [
  srf('tx_a', 'fn_receita', 80),
  srf('tx_b', 'fn_academia', 120),
  srf('sch:sch_anuidade@2026-10-20', 'fn_receita', 100),
]

describe('rateio por função (parteDaFuncao)', () => {
  it('parte da função = soma das linhas dela, com os gastos dela', () => {
    const p = parteDaFuncao(resgate(), det, 'fn_receita')
    expect(p.valor).toBe(180)
    expect([...p.fonteIds].sort()).toEqual(['sch:sch_anuidade@2026-10-20', 'tx_a'])
  })

  it('soma das partes de todas as funções = amount total', () => {
    const funcoes = [...new Set(det.map(d => d.reservaFuncaoId))]
    const soma = funcoes.reduce((t, f) => t + parteDaFuncao(resgate(), det, f).valor, 0)
    expect(soma).toBe(resgate().amount)
  })

  it('gasto sem função (reserva_funcao_id null) não cai em função nenhuma', () => {
    const detComNull = [...det.slice(0, 2), srf('sch:sch_anuidade@2026-10-20', null, 100)]
    expect(parteDaFuncao(resgate(), detComNull, 'fn_receita').valor).toBe(80)
    expect(parteDaFuncao(resgate(), detComNull, 'fn_academia').valor).toBe(120)
    // Fica de fora do Fluxo Futuro: as partes somam menos que o amount.
    expect(80 + 120).toBeLessThan(resgate().amount)
    // Mas aparece na visão "fatura inteira".
    const r = composicaoResgate(resgate(), transactions, [anuidade], getOcc)
    expect(r.gastos).toHaveLength(3)
  })

  it('sem detalhamento: o agendamento inteiro vai para schedule.reservaFuncaoId', () => {
    const s = resgate({ reservaFuncaoId: 'fn_receita' })
    expect(parteDaFuncao(s, [], 'fn_receita')).toEqual({ valor: 300, fonteIds: null })
    expect(parteDaFuncao(s, [], 'fn_academia').valor).toBe(0)
  })
})

describe('composicaoResgate recortada pela função (Fluxo Futuro)', () => {
  const recorte = { functionId: 'fn_receita', det, valor: 180 }

  it('mostra só os gastos da função e fecha com o valor da linha', () => {
    const r = composicaoResgate(resgate(), transactions, [anuidade], getOcc, recorte)
    expect(r.gastos.map(g => g.key)).toEqual(['tx_a', 'sch:sch_anuidade@2026-10-20'])
    expect(r.total).toBe(180)
    expect(r.amountResgate).toBe(180)
    expect(r.fecha).toBe(true)
  })

  it('sem recorte (toggle "Ver fatura inteira") mostra tudo e compara com o amount total', () => {
    const r = composicaoResgate(resgate(), transactions, [anuidade], getOcc, null)
    expect(r.gastos).toHaveLength(3)
    expect(r.amountResgate).toBe(300)
    expect(r.fecha).toBe(true)
  })

  it('valor da linha divergente da soma recortada aparece como diferença', () => {
    const r = composicaoResgate(resgate(), transactions, [anuidade], getOcc, { ...recorte, valor: 200 })
    expect(r.fecha).toBe(false)
    expect(r.diferenca).toBe(-20)
  })

  it('resgate sem fontes continua semFontes mesmo recortado', () => {
    const r = composicaoResgate(resgate({ sourceExpenseIds: [] }), transactions, [], getOcc, recorte)
    expect(r.semFontes).toBe(true)
  })
})
