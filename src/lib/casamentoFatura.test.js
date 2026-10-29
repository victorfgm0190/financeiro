import { describe, it, expect } from 'vitest'
import { casarJaLancados, candidatosJaLancado, candidatoDoPre, contarJaLancados } from './casamentoFatura'
import { resolverLinhasRevisao } from './revisaoImportacao'

const CARD = 'acc_itaupers'
const tx = (o) => ({ accountId: CARD, accountType: 'credit', type: 'expense', reconciled: false, faturaMonthYear: '2026-11', ...o })
const linha = (o) => ({ type: 'expense', faturaMonthYear: '2026-11', selected: true, ...o })

// Caso real (Itaupers, fatura 11/2026): lançados à mão antes da importação.
const AUTO = tx({ id: 'auto', amount: 396.63, date: '2026-10-28', description: 'Compra AUTO SA', categoryId: 'cat_tra_com', grupoGerencial: 'grp_1', origin: 'manual' })
const IFOOD = tx({ id: 'ifood', amount: 57.07, date: '2026-10-28', description: 'iFood', payee: 'Ifd*djm Empreendimento', grupoGerencial: 'grp_1', origin: 'manual' })
// A etapa A que a classificação gerencial 1 já criou (transferência, fica fora dos candidatos).
const ETAPA_A = { id: 'tx_gerA_ifood', type: 'transfer', accountId: 'acc_principal', cardId: CARD, amount: 57.07, date: '2026-10-28', origin: 'etapa_a' }

describe('casamento "Já lançado"', () => {
  it('caso real: iFood com texto do banco diferente casa sozinho; a lógica atual o trataria como novo', () => {
    const rows = [linha({ _id: 'L2', description: 'IFD*DJM EMPREENDIMENTO', amount: 57.07, date: '2026-10-28', _dateCartao: '2026-10-28' })]
    const atual = resolverLinhasRevisao(rows, { accountId: CARD, transactions: [AUTO, IFOOD, ETAPA_A], closingDay: 13 })
    expect(atual[0]._isDuplicate || atual[0]._collisionTx || atual[0]._dupLevel).toBeFalsy() // hoje: linha NOVA (duplicaria)
    const r = casarJaLancados(atual, candidatosJaLancado({ transactions: [AUTO, IFOOD, ETAPA_A], accountId: CARD, closingDay: 13 }), { closingDay: 13 })
    expect(r.get('L2')).toMatchObject({ status: 'casada', tx: IFOOD })
  })
  it('casamento simples: valor ±0,01 e data da compra até ±3 dias', () => {
    const cand = candidatosJaLancado({ transactions: [AUTO], accountId: CARD })
    expect(casarJaLancados([linha({ _id: 'a', amount: 396.62, date: '2026-10-25' })], cand).get('a').status).toBe('casada')
    expect(casarJaLancados([linha({ _id: 'b', amount: 396.63, date: '2026-10-24' })], cand).get('b').status).toBe('nova')
    expect(casarJaLancados([linha({ _id: 'c', amount: 396.65, date: '2026-10-28' })], cand).get('c').status).toBe('nova')
    expect(casarJaLancados([linha({ _id: 'd', amount: 396.63, date: '2026-10-28', faturaMonthYear: '2026-12' })], cand).get('d').status).toBe('nova')
  })
  it('só candidatos não conciliados, do mesmo cartão, sem transferências nem espelhos', () => {
    const outros = [
      tx({ id: 'conc', amount: 10, date: '2026-10-20', reconciled: true }),
      tx({ id: 'outroCartao', amount: 10, date: '2026-10-20', accountId: 'acc_azul' }),
      tx({ id: 'esp', amount: 10, date: '2026-10-20', isEspelho: true }),
      ETAPA_A,
    ]
    expect(candidatosJaLancado({ transactions: outros, accountId: CARD })).toEqual([])
  })
  it('dois candidatos iguais → não casa sozinho: "escolher"', () => {
    const dois = [tx({ id: 'x1', amount: 30, date: '2026-10-20' }), tx({ id: 'x2', amount: 30, date: '2026-10-21' })]
    const r = casarJaLancados([linha({ _id: 'L', amount: 30, date: '2026-10-20' })], candidatosJaLancado({ transactions: dois, accountId: CARD }))
    expect(r.get('L').status).toBe('escolher')
    expect(r.get('L').candidatos.map(t => t.id)).toEqual(['x1', 'x2'])
  })
  it('duas linhas disputando o mesmo lançamento → as duas para escolher', () => {
    const r = casarJaLancados(
      [linha({ _id: 'A', amount: 30, date: '2026-10-20' }), linha({ _id: 'B', amount: 30, date: '2026-10-21' })],
      candidatosJaLancado({ transactions: [tx({ id: 'x1', amount: 30, date: '2026-10-20' })], accountId: CARD }))
    expect(contarJaLancados(r)).toEqual({ casada: 0, escolher: 2, nova: 0 })
  })
  it('parcelado casa por PARCELA (valor da parcela, número/total e fatura), não pelo total', () => {
    const parcelas = [
      tx({ id: 'p3', amount: 100, date: '2026-10-15', description: 'Notebook 3/10', installmentNum: 3, installmentTotal: 10 }),
      tx({ id: 'p4', amount: 100, date: '2026-10-15', description: 'Notebook 4/10', installmentNum: 4, installmentTotal: 10, faturaMonthYear: '2026-12' }),
      tx({ id: 'avista', amount: 1000, date: '2026-10-15', description: 'Notebook' }),
    ]
    const cand = candidatosJaLancado({ transactions: parcelas, accountId: CARD })
    const r = casarJaLancados([
      linha({ _id: 'P3', description: 'MAGAZINE LUIZA 03/10', amount: 100, date: '2026-08-02', _installment: { num: 3, total: 10 } }),
      linha({ _id: 'P5', description: 'MAGAZINE LUIZA 05/10', amount: 100, date: '2026-08-02', _installment: { num: 5, total: 10 } }),
      linha({ _id: 'TOT', description: 'MAGAZINE LUIZA', amount: 1000, date: '2026-10-15' }),
    ], cand)
    expect(r.get('P3')).toMatchObject({ status: 'casada', tx: parcelas[0] })
    expect(r.get('P5').status).toBe('nova')
    expect(r.get('TOT')).toMatchObject({ status: 'casada', tx: parcelas[2] })
  })
  it('pré-lançamento pendente do Assistente é candidato; efetivado/descartado não', () => {
    const pre = (status) => ({ id: `pre-${status}`, tipo: 'lancamento', status, payload: { tipo: 'despesa', valor: 57.07, data: '2026-10-28', conta_id: CARD, descricao: 'iFood', categoria_id: 'cat_laz' } })
    const cand = candidatosJaLancado({ transactions: [], preLancamentos: [pre('pendente'), pre('efetivado'), pre('descartado')], accountId: CARD, closingDay: 13 })
    expect(cand.map(c => c.id)).toEqual(['pre:pre-pendente'])
    const r = casarJaLancados([linha({ _id: 'L', amount: 57.07, date: '2026-10-28' })], cand, { closingDay: 13 })
    expect(r.get('L')).toMatchObject({ status: 'casada', tx: { preId: 'pre-pendente', _pre: true } })
    expect(candidatoDoPre({ id: 'x', payload: { tipo: 'transferencia', valor: 10, data: '2026-10-01', conta_id: CARD } })).toBeNull()
  })
})
