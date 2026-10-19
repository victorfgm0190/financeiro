import { describe, it, expect } from 'vitest'
import {
  casaAgendamento, agendamentoQueManda, aplicarAgendamentoNaLinha, divergenciasDaEdicao,
  diferencasLancamentoAgendamento, patchLancamentoDoAgendamento, mudancasNoAgendamento,
} from './agendamentoManda'

const CARTAO = 'acc_itaupers'
const anthropic = {
  id: 'sch_anthropic', description: 'Anthropic* Claude Sub', transactionType: 'expense', frequency: 'monthly',
  accountId: CARTAO, amount: 582.66, payee: 'Anthropic', grupoGerencial: 'grp_pharma', reservaFuncaoId: 'rf_ia',
  categoryId: 'cat_laz_ssa', tipoDocumentoId: null,
}
const linha = { _id: 1, type: 'expense', accountId: CARTAO, amount: 583.04, description: 'Anthropic* Claude Sub', payee: 'Anthropic', grupoGerencial: 'grp_1', categoryId: 'cat_outros', _suggestedCategory: true }

describe('agendamentoQueManda', () => {
  it('casa a cobrança da Anthropic (valor ±0,50, mesmo cartão)', () => {
    expect(agendamentoQueManda(linha, [anthropic])?.id).toBe('sch_anthropic')
  })
  it('não casa agendamento de outra conta, do motor (tipo) nem de ocorrência única', () => {
    expect(agendamentoQueManda(linha, [{ ...anthropic, accountId: 'acc_outro' }])).toBeNull()
    expect(agendamentoQueManda(linha, [{ ...anthropic, tipo: 'pagamento_fatura' }])).toBeNull()
    expect(agendamentoQueManda(linha, [{ ...anthropic, frequency: 'once' }])).toBeNull()
  })
  it('respeita o "Não perguntar mais" e a tolerância de valor', () => {
    expect(agendamentoQueManda(linha, [anthropic], { excecoes: ['anthropic'] })).toBeNull()
    expect(agendamentoQueManda({ ...linha, amount: 590 }, [anthropic])).toBeNull()
  })
  it('sem favorecido, casa pela 1ª palavra significativa da descrição', () => {
    expect(casaAgendamento({ ...linha, payee: '' }, anthropic)).toBe(true)
    expect(casaAgendamento({ ...linha, payee: '', description: 'Outra coisa' }, anthropic)).toBe(false)
  })
})

describe('aplicarAgendamentoNaLinha', () => {
  it('a linha entra com grupo, função, categoria e favorecido do agendamento (3 · PharmaLog)', () => {
    const r = aplicarAgendamentoNaLinha(linha, anthropic)
    expect(r.grupoGerencial).toBe('grp_pharma')
    expect(r._reservaFuncaoId).toBe('rf_ia')
    expect(r.categoryId).toBe('cat_laz_ssa')
    expect(r.payee).toBe('Anthropic')
    expect(r._suggestedCategory).toBe(false)
    expect(r._doAgendamento).toEqual({ scheduleId: 'sch_anthropic', descricao: 'Anthropic* Claude Sub', campos: ['grupoGerencial', '_reservaFuncaoId', 'categoryId', 'payee'] })
  })
  it('campo vazio no agendamento não apaga o da linha', () => {
    const r = aplicarAgendamentoNaLinha({ ...linha, tipoDocumentoId: 'td_nf' }, anthropic)
    expect(r.tipoDocumentoId).toBe('td_nf')
  })
})

describe('divergências e atualização do agendamento', () => {
  it('trocar o grupo na revisão diverge do agendamento; repetir o valor dele não', () => {
    expect(divergenciasDaEdicao(anthropic, { grupoGerencial: 'grp_1', _reservaFuncaoId: null })).toEqual([
      { campo: 'grupoGerencial', rotulo: 'Grupo gerencial', de: 'grp_pharma', para: 'grp_1' },
      { campo: 'reservaFuncaoId', rotulo: 'Função de reserva', de: 'rf_ia', para: null },
    ])
    expect(divergenciasDaEdicao(anthropic, { categoryId: 'cat_laz_ssa' })).toEqual([])
  })
  it('mudancasNoAgendamento gera o patch e o histórico (de → para)', () => {
    const { changes, mudancas } = mudancasNoAgendamento(anthropic, [{ campo: 'categoryId', para: 'cat_x' }])
    expect(changes).toEqual({ categoryId: 'cat_x' })
    expect(mudancas).toEqual([{ campo: 'categoryId', de: 'cat_laz_ssa', para: 'cat_x' }])
  })
  it('Novo Lançamento: diferenças só nos campos que o agendamento tem', () => {
    const tx = { grupoGerencial: 'grp_1', reservaFuncaoId: null, categoryId: 'cat_laz_ssa', payee: 'Anthropic', tipoDocumentoId: 'td_nf' }
    expect(diferencasLancamentoAgendamento(tx, anthropic).map(d => d.campo)).toEqual(['grupoGerencial', 'reservaFuncaoId'])
    expect(patchLancamentoDoAgendamento(anthropic)).toEqual({ grupoGerencial: 'grp_pharma', reservaFuncaoId: 'rf_ia', categoryId: 'cat_laz_ssa', payee: 'Anthropic' })
  })
})
