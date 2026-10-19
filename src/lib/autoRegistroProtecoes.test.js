import { describe, it, expect } from 'vitest'
import { tocaCartao, buscarPossivelDuplicado, mapaPossiveisDuplicados, palavrasSignificativas } from './autoRegistro.js'

// Proteções do registro automático: nunca em cartão de crédito e nunca quando já existe um
// lançamento parecido (aí a ocorrência fica pendente como "possível duplicado — confira").

const contas = [
  { id: 'acc_itau', type: 'checking' },
  { id: 'acc_bb', type: 'checking' },
  { id: 'card_itau', type: 'credit' },
]
const mattos = (extra = {}) => ({
  id: 'sch_mattos', description: 'MATTOS ADMINISTRACAO', payee: null, accountId: 'acc_itau', toAccountId: null,
  transactionType: 'expense', amount: 3278.44, frequency: 'monthly', startDate: '2026-09-19',
  registered: ['2026-09-19'], skipped: [], overrides: {}, autoRegister: true, ...extra,
})
const occ = { occurrenceDate: '2026-10-19', date: '2026-10-19', amount: 3278.44 }
const tx = (extra = {}) => ({
  id: 'tx_1', type: 'expense', accountId: 'acc_itau', amount: 3278.44, date: '2026-10-18',
  description: 'PAGTO MATTOS ADM', origin: 'manual', ...extra,
})
const achou = (t, s = mattos(), o = occ, ctx) => buscarPossivelDuplicado(s, o, [t], ctx)?.id ?? null

describe('nunca em cartão de crédito', () => {
  it('conta de origem cartão', () => {
    expect(tocaCartao({ accountId: 'card_itau' }, contas)).toBe(true)
    expect(tocaCartao({ accountId: 'x', accountType: 'credit' }, contas)).toBe(true)
  })
  it('transferência com cartão no destino (pagamento de fatura)', () => {
    expect(tocaCartao({ accountId: 'acc_itau', toAccountId: 'card_itau' }, contas)).toBe(true)
  })
  it('contas comuns seguem automáticas', () => {
    expect(tocaCartao({ accountId: 'acc_itau', toAccountId: 'acc_bb' }, contas)).toBe(false)
  })
  it('o mapa de duplicados nem olha agendamento de cartão', () => {
    const s = mattos({ accountId: 'card_itau', accountType: 'credit' })
    const m = mapaPossiveisDuplicados({ schedules: [s], transactions: [tx({ accountId: 'card_itau' })], accounts: contas, hojeStr: '2026-10-19' })
    expect(m.size).toBe(0)
  })
})

describe('possível duplicado: cada critério', () => {
  it('mesma conta, mesmo valor, ±5 dias e palavra em comum → achou', () => {
    expect(achou(tx())).toBe('tx_1')
  })
  it('conta diferente → não', () => {
    expect(achou(tx({ accountId: 'acc_bb' }))).toBeNull()
  })
  it('em transferência vale qualquer ponta', () => {
    const s = mattos({ transactionType: 'transfer', toAccountId: 'acc_bb' })
    expect(achou(tx({ accountId: 'acc_bb' }), s)).toBe('tx_1')
  })
  it('valor diferente (mais de R$ 0,01) → não; sinal não importa', () => {
    expect(achou(tx({ amount: 3278.46 }))).toBeNull()
    expect(achou(tx({ amount: -3278.44 }))).toBe('tx_1')
  })
  it('janela de ±5 dias, pela data ou pela data do cartão', () => {
    expect(achou(tx({ date: '2026-10-14' }))).toBe('tx_1')
    expect(achou(tx({ date: '2026-10-13' }))).toBeNull()
    expect(achou(tx({ date: '2026-10-25' }))).toBeNull()
    expect(achou(tx({ date: '2026-10-01', dateCartao: '2026-10-20' }))).toBe('tx_1')
  })
  it('descrição sem palavra em comum, lançamento manual → não', () => {
    expect(achou(tx({ description: 'COSMETICOS GI - JENNIFER' }))).toBeNull()
  })
  it('descrição diferente mas importado (extrato, fatura, Dindin, importação padrão) → achou', () => {
    for (const origin of ['importacao_padrao', 'importacao_fatura', 'importacao_dindin', 'reconciliacao_fatura']) {
      expect(achou(tx({ description: 'PIX ENVIADO 123', origin }))).toBe('tx_1')
    }
  })
  it('já ligado a um agendamento (schedule_id ou baixa vinculada) → não conta', () => {
    expect(achou(tx({ scheduleId: 'sch_outro' }))).toBeNull()
    expect(achou(tx(), mattos(), occ, { vinculados: new Set(['tx_1']) })).toBeNull()
  })
  it('sombra automática de reserva → não conta', () => {
    expect(achou(tx({ reservaAuto: true }))).toBeNull()
  })
  it('entre vários, o mais perto da data', () => {
    const r = buscarPossivelDuplicado(mattos(), occ, [tx({ id: 'longe', date: '2026-10-15' }), tx({ id: 'perto', date: '2026-10-20' })])
    expect(r.id).toBe('perto')
  })
  it('palavras: sem acento, mais de 3 letras, sem as só de números', () => {
    expect([...palavrasSignificativas('Pix para BB 2026 Condomínio')]).toEqual(['para', 'condominio'])
  })
})

describe('mapa dos possíveis duplicados (selo em Agendamentos e aviso em Alertas)', () => {
  it('ocorrência vencida com lançamento parecido entra no mapa; sem parecido, não', () => {
    const outro = mattos({ id: 'sch_bb', description: 'PIX PARA BB', accountId: 'acc_bb', amount: 150 })
    const m = mapaPossiveisDuplicados({ schedules: [mattos(), outro], transactions: [tx()], accounts: contas, hojeStr: '2026-10-19' })
    expect([...m.keys()]).toEqual(['sch_mattos'])
    expect(m.get('sch_mattos').get('2026-10-19')).toBe('tx_1')
  })
  it('agendamento sem "Registrar automático" fica fora', () => {
    const m = mapaPossiveisDuplicados({ schedules: [mattos({ autoRegister: false })], transactions: [tx()], accounts: contas, hojeStr: '2026-10-19' })
    expect(m.size).toBe(0)
  })
  it('depois de vincular (baixa aponta o lançamento), sai do mapa', () => {
    const vinculado = mattos({ registered: ['2026-09-19', '2026-10-19'], registeredMeta: { '2026-10-19': { lancamento_id: 'tx_1' } } })
    const m = mapaPossiveisDuplicados({ schedules: [vinculado], transactions: [tx()], accounts: contas, hojeStr: '2026-10-19' })
    expect(m.size).toBe(0)
  })
})
