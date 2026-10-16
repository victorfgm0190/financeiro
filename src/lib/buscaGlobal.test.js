import { describe, it, expect } from 'vitest'
import { itensVisiveisBusca, selosReservaPorPai } from './buscaGlobal'

// Caso real (25/09/2026, 212,50): despesa MONJARO no Itaú + transferência Pharma → Itaú + par de
// sombras "Resgate Reserva: Pharma" + 2 agendamentos com próxima ocorrência (25/10 e 25/11).
const despesa = { id: 'tx_1790345182912_46yl4zlwcgx', type: 'expense', accountId: 'itau', amount: 212.5, date: '2026-09-25', reconciled: true }
const transf = { id: 'tx_1790345346523_q1odc6tw8uo', type: 'transfer', accountId: 'pharma', toAccountId: 'itau', amount: 212.5, date: '2026-09-25', reconciled: true }
const sombraR = { id: 'tx_rsg_1790345346523_8d439oaw8ce_r', type: 'income', accountId: null, amount: 212.5, date: '2026-09-25', reservaAuto: true, reconciled: false, parentTxId: transf.id }
const sombraD = { ...sombraR, id: 'tx_rsg_1790345346523_8d439oaw8ce_d', type: 'expense' }
const agTrf = { id: 'sch_1790345092916', registered: ['2026-09-25'], _next: '2026-10-25' }
const agDesp = { id: 'sch_1788812861635', registered: ['2026-09-25'], _next: '2026-11-25' }
const txs = [despesa, transf, sombraR, sombraD]
const base = { txs, schedules: [agTrf, agDesp], txById: new Map(txs.map(t => [t.id, t])), hoje: '2026-10-16', temProxima: s => !!s._next }
const contar = (filtro) => {
  const r = itensVisiveisBusca({ ...base, filtro })
  return [r.txs.length, r.schedules.length]
}

describe('itensVisiveisBusca — caso real', () => {
  it('Todos = 2 lançamentos + 2 agendamentos', () => expect(contar('todos')).toEqual([2, 2]))
  it('Registrado = 2 lançamentos + 0 agendamentos', () => expect(contar('pago')).toEqual([2, 0]))
  it('Pendente = 0 lançamentos + 2 agendamentos', () => expect(contar('naopago')).toEqual([0, 2]))

  it('as sombras não aparecem como itens; ficam a despesa e a transferência', () => {
    expect(itensVisiveisBusca({ ...base, filtro: 'todos' }).txs.map(t => t.id)).toEqual([despesa.id, transf.id])
  })

  it('sombra legado sem parentTxId (tx_res_) também é ocultada', () => {
    const legado = { id: 'tx_res_1780254690316_dcaxdon5zv9', type: 'expense', accountId: null, reservaAuto: true, reconciled: false, date: '2026-01-15' }
    expect(itensVisiveisBusca({ ...base, txs: [legado], filtro: 'todos' }).txs).toEqual([])
  })
})

describe('selosReservaPorPai', () => {
  it('a transferência de origem ganha "Resgate de reserva" (uma vez, apesar do par _r/_d)', () => {
    const m = selosReservaPorPai(txs)
    expect(m.get(transf.id)).toEqual(['Resgate de reserva'])
    expect(m.has(despesa.id)).toBe(false)
  })

  it('depósito (tx_res_) → "Depósito em reserva"; legado sem pai não gera selo', () => {
    const dep = { id: 'tx_res_9_x', reservaAuto: true, parentTxId: 'tx_trf_dep' }
    const legado = { id: 'tx_res_8_y', reservaAuto: true }
    const m = selosReservaPorPai([dep, legado])
    expect(m.get('tx_trf_dep')).toEqual(['Depósito em reserva'])
    expect(m.size).toBe(1)
  })
})
