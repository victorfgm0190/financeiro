import { describe, it, expect } from 'vitest'
import {
  camposHerdadosNoPagamento, camposHerdadosParcelaFilha, camposHerdadosProjecao,
  txToScheduleInitial, agendamentoDaEfetivacao, novoIdAgendamento,
} from './herancaCampos'

const SCH = { id: 'sch_1', tipoDocumentoId: 't_bol', costCenter: 'Casa', grupoGerencial: 'grp_1', categoryId: 'cat_x' }

describe('PayModal (baixa de agendamento)', () => {
  it('pagamento herda tipo de documento e centro de custo; não mexe no grupo (o modal tem o select)', () => {
    expect(camposHerdadosNoPagamento(SCH)).toEqual({ tipoDocumentoId: 't_bol', costCenter: 'Casa' })
  })
  it('recebimento herda também o grupo gerencial', () => {
    expect(camposHerdadosNoPagamento(SCH, {}, { incluirGrupo: true }))
      .toEqual({ tipoDocumentoId: 't_bol', costCenter: 'Casa', grupoGerencial: 'grp_1' })
  })
  it('valor do modal vence o do agendamento (inclusive vazio = removido)', () => {
    expect(camposHerdadosNoPagamento(SCH, { tipoDocumentoId: 't_nf', costCenter: '' }, { incluirGrupo: true }))
      .toEqual({ tipoDocumentoId: 't_nf', costCenter: null, grupoGerencial: 'grp_1' })
    expect(camposHerdadosNoPagamento(SCH, { grupoGerencial: 'grp_D' }, { incluirGrupo: true }).grupoGerencial).toBe('grp_D')
  })
  it('agendamento sem os campos → null', () => {
    expect(camposHerdadosNoPagamento({ id: 'x' }, {}, { incluirGrupo: true }))
      .toEqual({ tipoDocumentoId: null, costCenter: null, grupoGerencial: null })
  })
})

describe('parcelas 2..N (criarParcelasGerencial)', () => {
  it('herdam o tipo de documento (e os demais campos) da parcela 1', () => {
    const base = { categoryId: 'cat_x', payee: 'Loja', costCenter: 'Casa', notes: 'obs', reservaFuncaoId: 'rf', tipoDocumentoId: 't_nf' }
    expect(camposHerdadosParcelaFilha(base)).toEqual(base)
    expect(camposHerdadosParcelaFilha({}).tipoDocumentoId).toBeNull()
  })
})

describe('projeções da importação de fatura', () => {
  it('herdam centro de custo, observações e tipo da linha base', () => {
    expect(camposHerdadosProjecao({ costCenter: 'Casa', notes: 'n', tipoDocumentoId: 't_cc' }))
      .toEqual({ costCenter: 'Casa', notes: 'n', tipoDocumentoId: 't_cc' })
  })
  it('sem nada na linha, vêm da irmã já gravada da série', () => {
    expect(camposHerdadosProjecao({ _serieAnchor: { costCenter: 'Obra', notes: 'x', tipoDocumentoId: 't_bol' } }))
      .toEqual({ costCenter: 'Obra', notes: 'x', tipoDocumentoId: 't_bol' })
    expect(camposHerdadosProjecao({})).toEqual({ costCenter: null, notes: null, tipoDocumentoId: null })
  })
})

describe('Duplicar → Criar Agendamento', () => {
  it('mantém o tipo de documento', () => {
    const tx = { id: 'tx_1', type: 'expense', amount: 50, accountId: 'a', categoryId: 'c', payee: 'P', costCenter: 'Casa', tipoDocumentoId: 't_bol', installmentNum: 2, parentTxId: 'p' }
    const ini = txToScheduleInitial(tx)
    expect(ini).toMatchObject({ transactionType: 'expense', tipoDocumentoId: 't_bol', costCenter: 'Casa' })
    expect(ini).not.toHaveProperty('id')
    expect(ini).not.toHaveProperty('installmentNum')
  })
})

describe('efetivação de provisão recorrente', () => {
  it('o agendamento criado herda tipo, centro de custo e grupo da provisão', () => {
    const prov = { description: 'Luz', transactionType: 'expense', accountId: 'a', categoryId: 'c', payee: 'Copel', costCenter: 'Casa', grupoGerencial: 'grp_D', tipoDocumentoId: 't_bol', reservaFuncaoId: 'rf' }
    const s = agendamentoDaEfetivacao(prov, { id: 'sch_n', valor: 123.4, date: '2026-10-15', occurrenceDate: '2026-10-10' })
    expect(s).toMatchObject({ id: 'sch_n', amount: 123.4, startDate: '2026-10-10', frequency: 'once', tipoDocumentoId: 't_bol', costCenter: 'Casa', grupoGerencial: 'grp_D', reservaFuncaoId: null, isProvisao: false })
  })
})

describe('"Repetir"', () => {
  it('gera id de agendamento antes do lançamento (únicos)', () => {
    const a = novoIdAgendamento(); const b = novoIdAgendamento()
    expect(a).toMatch(/^sch_\d+_/)
    expect(a).not.toBe(b)
  })
})
