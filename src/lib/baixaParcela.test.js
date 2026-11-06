import { describe, it, expect, vi } from 'vitest'
import { espelharBaixaParcela } from './baixaParcela.js'
import { bemDoAgendamento } from './patrimonio.js'
import { comEspelhosAtualizados } from './espelhoReserva.js'
import { rateioHerdado } from './rateio.js'
import { sincronizarEntradasDoBem, apagarEntradasDoBem } from '../../api/_bem.js'
import { montarUpsertSql, CAMPOS_PRESERVADOS_SE_NULO } from '../../api/_db.js'
import { txToRow } from './db.js'

const resposta = (status) => ({
  parcela: { status },
  lancamentos_criados: [
    { id: 'p', valor: 5000, descricao: 'Parcela 1/10', categoria_id: 'cat_prest', data: '2026-11-05' },
    { id: 'j', valor: 1000, descricao: 'Parcela 1/10 - Juros', categoria_id: 'cat_juros', data: '2026-11-05' },
  ],
  saldos_atualizados: { bem: { id: 'bem', saldo_novo: 106000 }, divida: { id: 'div', saldo_novo: -45000 } },
})
const deps = () => ({
  contaOrigemId: 'itau', dataPagamento: '2026-11-05', scheduleId: 'sch', ocorrencia: '2026-11-10',
  addTransaction: vi.fn(), atualizarSaldo: vi.fn(), markScheduleRegistered: vi.fn(),
})

describe('baixa de parcela no estado do app', () => {
  it('debita a conta de origem com os ids do backend e marca a ocorrência', () => {
    const d = deps()
    espelharBaixaParcela(resposta('paid'), d)
    expect(d.addTransaction).toHaveBeenCalledTimes(2)
    expect(d.addTransaction.mock.calls.map(c => [c[0].id, c[0].accountId, c[0].bemId])).toEqual([['p', 'itau', 'bem'], ['j', 'itau', 'bem']])
    expect(d.atualizarSaldo).toHaveBeenCalledWith('bem', 106000)
    expect(d.atualizarSaldo).toHaveBeenCalledWith('div', -45000)
    expect(d.markScheduleRegistered).toHaveBeenCalledWith('sch', '2026-11-10', expect.objectContaining({ lancamento_id: 'p' }))
  })
  it('pagamento parcial não marca: a parcela continua em aberto', () => {
    const d = deps()
    espelharBaixaParcela(resposta('partial'), d)
    expect(d.addTransaction).toHaveBeenCalledTimes(2)
    expect(d.markScheduleRegistered).not.toHaveBeenCalled()
  })
  it('o principal não herda o rateio principal/juros do agendamento', () => {
    const schedule = { id: 'sch', overrides: {} }
    const rateios = [{ categoriaId: 'cat_prest', valor: 5000 }, { categoriaId: 'cat_juros', valor: 1000 }]
    const base = { id: 'p', type: 'expense', amount: 5000 }
    const porId = new Map([['sch', rateios]])
    expect(rateioHerdado({ tx: { ...base, origin: 'pagamento_divida' }, schedule, data: '2026-11-10', rateiosPorId: porId })).toEqual([])
    expect(rateioHerdado({ tx: base, schedule, data: '2026-11-10', rateiosPorId: porId })).toHaveLength(2)
  })
})

describe('vínculo do agendamento com o bem', () => {
  const contas = [{ id: 'bem', tipoBem: 'bem_imobilizado' }, { id: 'itau' }]
  it('só transferência cujo destino é bem parametrizado', () => {
    expect(bemDoAgendamento({ transactionType: 'transfer', toAccountId: 'bem' }, contas)).toBe('bem')
    expect(bemDoAgendamento({ transactionType: 'transfer', toAccountId: 'itau' }, contas)).toBeNull()
    expect(bemDoAgendamento({ transactionType: 'expense', accountId: 'bem' }, contas)).toBeNull()
    expect(bemDoAgendamento(null, contas)).toBeNull()
  })
  it('o sync grava o vínculo, mas NULL nunca o apaga', () => {
    expect(txToRow({ id: 'x', type: 'transfer', amount: 1, bemId: 'bem' }).bem_id).toBe('bem')
    expect(txToRow({ id: 'x', type: 'transfer', amount: 1 }).bem_id).toBeNull()
    const sql = montarUpsertSql('lancamentos', ['id', 'bem_id'], 1, 'id', CAMPOS_PRESERVADOS_SE_NULO)
    expect(sql).toContain('"bem_id" = COALESCE(EXCLUDED."bem_id", "lancamentos"."bem_id")')
  })
})

describe('movimentação do bem acompanha o sync', () => {
  const linha = { id: 't1', type: 'transfer', to_account_id: 'bem', bem_id: 'bem', amount: 341.7, date: '2026-11-05', payee: 'ADM', category_id: 'cat' }
  it('cria a que falta com a data real, uma vez só', async () => {
    const q = vi.fn(async (sql) => (sql.startsWith('SELECT') ? [] : []))
    await sincronizarEntradasDoBem(q, [linha])
    const insert = q.mock.calls.find(c => c[0].includes('INSERT INTO bem_movimentacoes'))
    expect(insert[1]).toEqual(expect.arrayContaining(['bem', 'entrada_venda', '2026-11-05', 'ADM', 341.7, 'cat', 't1']))
    const q2 = vi.fn(async (sql) => (sql.startsWith('SELECT') ? [{ lancamento_id: 't1', valor: '341.70' }] : []))
    await sincronizarEntradasDoBem(q2, [linha])
    expect(q2).toHaveBeenCalledTimes(1)
  })
  it('corrige o valor quando a transferência foi editada', async () => {
    const q = vi.fn(async (sql) => (sql.startsWith('SELECT') ? [{ lancamento_id: 't1', valor: '339.60' }] : []))
    await sincronizarEntradasDoBem(q, [linha])
    expect(q.mock.calls[1][0]).toContain('UPDATE bem_movimentacoes')
    expect(q.mock.calls[1][1]).toEqual(['t1', 341.7])
  })
  it('ignora o que não é entrada do bem e não consulta à toa', async () => {
    const q = vi.fn()
    await sincronizarEntradasDoBem(q, [{ ...linha, bem_id: null }, { ...linha, type: 'expense' }, { ...linha, to_account_id: 'outro' }])
    await apagarEntradasDoBem(q, [])
    expect(q).not.toHaveBeenCalled()
  })
  it('lançamento apagado leva só a movimentação de entrada', async () => {
    const q = vi.fn(async () => [])
    await apagarEntradasDoBem(q, ['t1'])
    expect(q.mock.calls[0][0]).toContain("tipo = 'entrada_venda'")
  })
})

describe('espelhos acompanham a transferência editada', () => {
  const pai = { id: 'p', type: 'transfer', amount: 341.7, date: '2026-07-05', accountId: 'itau', toAccountId: 'bem' }
  const lista = [
    pai,
    { id: 'tx_inv_1', type: 'expense', amount: 341.7, date: '2026-07-05', accountId: null, reservaAuto: true, parentTxId: 'p' },
    { id: 'patr', type: 'expense', amount: 341.7, date: '2026-07-05', accountId: null, origin: 'patrimonio_auto', parentTxId: 'p' },
    { id: 'parcela', type: 'expense', amount: 10, date: '2026-07-05', accountId: 'itau', parentTxId: 'p' },
    { id: 'outro', type: 'expense', amount: 341.7, date: '2026-07-05', accountId: null, reservaAuto: true, parentTxId: 'x' },
  ]
  it('valor e data seguem o pai; o resto não muda', () => {
    const r = comEspelhosAtualizados(lista, pai, { ...pai, amount: 339.6, date: '2026-07-06' })
    const por = Object.fromEntries(r.map(t => [t.id, t]))
    expect([por.tx_inv_1.amount, por.tx_inv_1.date]).toEqual([339.6, '2026-07-06'])
    expect(por.patr.amount).toBe(339.6)
    expect(por.parcela.amount).toBe(10)
    expect(por.outro.amount).toBe(341.7)
  })
  it('editar só a descrição não toca nos espelhos', () => {
    expect(comEspelhosAtualizados(lista, pai, { ...pai, description: 'x' })).toBe(lista)
  })
})
