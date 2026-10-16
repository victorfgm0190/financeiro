import { describe, it, expect } from 'vitest'
import { getEffectiveStatus, paiDaSombra, STATUS } from './statusEfetivo'

// Caso real (25/09/2026, 212,50): despesa MONJARO no Itaú + transferência Pharma → Itaú
// registrada (o resgate) + par de sombras "Resgate Reserva: Pharma" sem conta.
const despesa = { id: 'tx_desp', type: 'expense', accountId: 'itau', amount: 212.5, date: '2026-09-25', reconciled: true }
const transf = { id: 'tx_trf', type: 'transfer', accountId: 'pharma', toAccountId: 'itau', amount: 212.5, date: '2026-09-25', reconciled: true }
const sombraR = { id: 'tx_rsg_1_x_r', type: 'income', accountId: null, amount: 212.5, date: '2026-09-25', reservaAuto: true, reconciled: false, parentTxId: 'tx_trf' }
const sombraD = { ...sombraR, id: 'tx_rsg_1_x_d', type: 'expense' }
const mapa = (txs) => new Map(txs.map(t => [t.id, t]))
const HOJE = '2026-10-16'

describe('getEffectiveStatus', () => {
  it('transferência manual da reserva registrada → as sombras do resgate ficam Registrado', () => {
    const m = mapa([despesa, transf, sombraR, sombraD])
    expect(getEffectiveStatus(sombraR, m, HOJE)).toBe(STATUS.REGISTRADO)
    expect(getEffectiveStatus(sombraD, m, HOJE)).toBe(STATUS.REGISTRADO)
    expect(paiDaSombra(sombraR, m)).toBe(transf)
  })

  it('nenhum lançamento do caso fica Pendente', () => {
    const txs = [despesa, transf, sombraR, sombraD]
    const m = mapa(txs)
    expect(txs.filter(t => getEffectiveStatus(t, m, HOJE) === STATUS.PENDENTE)).toEqual([])
  })

  it('sombra herda o Pendente da transferência de origem não conciliada', () => {
    const m = mapa([{ ...transf, reconciled: false }, sombraR])
    expect(getEffectiveStatus(sombraR, m, HOJE)).toBe(STATUS.PENDENTE)
  })

  it('sombra legado sem parentTxId: Registrado se a data já chegou, Pendente se futura', () => {
    const legado = { id: 'tx_res_old', type: 'expense', accountId: null, reservaAuto: true, reconciled: false, date: '2026-01-15' }
    expect(getEffectiveStatus(legado, new Map(), HOJE)).toBe(STATUS.REGISTRADO)
    expect(getEffectiveStatus({ ...legado, date: '2026-12-01' }, new Map(), HOJE)).toBe(STATUS.PENDENTE)
  })

  it('lançamento comum segue o próprio reconciled', () => {
    expect(getEffectiveStatus(despesa, new Map(), HOJE)).toBe(STATUS.REGISTRADO)
    expect(getEffectiveStatus({ ...despesa, reconciled: false }, new Map(), HOJE)).toBe(STATUS.PENDENTE)
  })
})
