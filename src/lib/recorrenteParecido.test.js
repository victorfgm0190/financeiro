// Cobrança recorrente com valor diferente do agendado em mais de R$ 0,50 (decisão 6 da Etapa 6b).
// Dados fictícios.
import { describe, it, expect } from 'vitest'
import {
  agendamentoRecorrenteParecido, aplicarRecorrentesParecidos, respostaRecorrente,
  desfazerRespostaRecorrente, baixaDoRecorrenteConfirmado,
} from './recorrenteParecido.js'
import { precisaDecisao, linhasAImportar } from './revisaoImportacao.js'
import { contarRevisaoFatura } from './contagemRevisaoFatura.js'

const CARD = 'acc_cartao'
const assinatura = (extra = {}) => ({
  id: 'sch_streaming', description: 'Streaming Exemplo', payee: 'Streaming Exemplo', transactionType: 'expense',
  accountId: CARD, accountType: 'credit', amount: 39.9, frequency: 'monthly', occurrenceType: 'continuous',
  startDate: '2026-06-05', nextOccurrence: '2026-11-05', registered: ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'],
  skipped: [], registeredMeta: {}, overrides: {}, categoryId: 'cat_assinaturas', grupoGerencial: 'grp_lazer', ...extra,
})
const linha = (extra = {}) => ({
  _id: 'l1', description: 'STREAMING EXEMPLO', payee: 'Streaming Exemplo', amount: 44.9, type: 'expense',
  date: '2026-11-05', _dateCartao: '2026-11-05', faturaMonthYear: '2026-11', selected: true,
  categoryId: 'cat_outros', grupoGerencial: 'grp_D', ...extra,
})
const ctx = (schedules = [assinatura()]) => ({ schedules, accountId: CARD, closingDay: 13 })

describe('agendamentoRecorrenteParecido', () => {
  it('reconhece pelo favorecido com diferença acima de R$ 0,50 e até ±50%', () => {
    const tx = { ...linha(), accountId: CARD }
    expect(agendamentoRecorrenteParecido(tx, [assinatura()])?.id).toBe('sch_streaming')
  })
  it('não reconhece: diferença até R$ 0,50 (caminho de sempre), acima de 50%, outro favorecido, outra conta, agendamento único', () => {
    const tx = (amount, extra = {}) => ({ ...linha({ amount }), accountId: CARD, ...extra })
    expect(agendamentoRecorrenteParecido(tx(40.3), [assinatura()])).toBeNull()
    expect(agendamentoRecorrenteParecido(tx(60), [assinatura()])).toBeNull()
    expect(agendamentoRecorrenteParecido(tx(44.9, { payee: 'Outra Loja', description: 'OUTRA LOJA' }), [assinatura()])).toBeNull()
    expect(agendamentoRecorrenteParecido(tx(44.9), [assinatura({ accountId: 'acc_outro' })])).toBeNull()
    expect(agendamentoRecorrenteParecido(tx(44.9), [assinatura({ frequency: 'once' })])).toBeNull()
    expect(agendamentoRecorrenteParecido(tx(44.9), [assinatura({ tipo: 'pagamento_fatura' })])).toBeNull()
  })
  it('respeita o "Não perguntar mais" (exceções por favorecido)', () => {
    expect(agendamentoRecorrenteParecido({ ...linha(), accountId: CARD }, [assinatura()], { excecoes: ['streaming exemplo'] })).toBeNull()
  })
})

describe('aplicarRecorrentesParecidos — sempre pergunta', () => {
  it('linha nova com agendamento parecido vira pergunta, desmarcada, e pede decisão', () => {
    const [r] = aplicarRecorrentesParecidos([linha()], ctx())
    expect(r._recorrentePergunta).toMatchObject({ scheduleId: 'sch_streaming', valorAgendado: 39.9, ocorrencia: '2026-11-05', fatura: '2026-11' })
    expect(r.selected).toBe(false)
    expect(precisaDecisao(r)).toBe(true)
    expect(contarRevisaoFatura([r]).decisao.qtd).toBe(1)
  })
  it('SEM confirmação nada é importado nem baixado', () => {
    const rows = aplicarRecorrentesParecidos([linha()], ctx())
    expect(linhasAImportar(rows)).toHaveLength(0)
    expect(baixaDoRecorrenteConfirmado(rows[0], [assinatura()])).toBeNull()
  })
  it('linhas que já casaram com o Finup, geradas, estornos ou dentro de R$ 0,50 não viram pergunta', () => {
    const base = [
      linha({ _id: 'a', _isDuplicate: true }), linha({ _id: 'b', _collisionTx: { id: 'x' } }),
      linha({ _id: 'c', _jaLancadoOpcoes: [{ id: 'x' }] }), linha({ _id: 'd', _generated: true }),
      linha({ _id: 'e', type: 'income' }), linha({ _id: 'f', amount: 40.2 }),
    ]
    const out = aplicarRecorrentesParecidos(base, ctx())
    expect(out.every(r => !r._recorrentePergunta)).toBe(true)
  })
  it('sem ocorrência pendente na fatura da linha, não pergunta', () => {
    const s = assinatura({ registered: [...assinatura().registered, '2026-11-05'], nextOccurrence: '2026-12-05' })
    const [r] = aplicarRecorrentesParecidos([linha()], ctx([s]))
    expect(r._recorrentePergunta).toBeUndefined()
  })
})

describe('respostas', () => {
  it('"Sim": a linha volta a ser importada com a classificação do agendamento e a baixa é a do agendamento', () => {
    const [pergunta] = aplicarRecorrentesParecidos([linha()], ctx())
    const patch = respostaRecorrente(pergunta, assinatura(), true)
    expect(patch).toMatchObject({ _recorrenteEscolha: 'sch_streaming', selected: true, categoryId: 'cat_assinaturas', grupoGerencial: 'grp_lazer' })
    expect(patch._recorrenteAntes).toMatchObject({ categoryId: 'cat_outros', grupoGerencial: 'grp_D' })
    const [r] = aplicarRecorrentesParecidos([{ ...linha(), ...patch }], ctx())
    expect(r._recorrente).toMatchObject({ escolha: 'sim', scheduleId: 'sch_streaming' })
    expect(precisaDecisao(r)).toBe(false)
    expect(linhasAImportar([r])).toHaveLength(1)
    expect(baixaDoRecorrenteConfirmado(r, [assinatura()])?.id).toBe('sch_streaming')
  })
  it('"Sim" mas a linha foi desmarcada depois: nada é baixado', () => {
    const [r] = aplicarRecorrentesParecidos([{ ...linha(), ...respostaRecorrente(linha(), assinatura(), true) }], ctx())
    expect(baixaDoRecorrenteConfirmado({ ...r, selected: false }, [assinatura()])).toBeNull()
  })
  it('"Não": entra como nova, sem baixa e sem a classificação do agendamento', () => {
    const patch = respostaRecorrente(linha(), assinatura(), false)
    const [r] = aplicarRecorrentesParecidos([{ ...linha(), ...patch }], ctx())
    expect(r._recorrente.escolha).toBe('nao')
    expect(r.categoryId).toBe('cat_outros')
    expect(linhasAImportar([r])).toHaveLength(1)
    expect(baixaDoRecorrenteConfirmado(r, [assinatura()])).toBeNull()
  })
  it('"Rever" volta a ser pergunta com a classificação de antes', () => {
    const comSim = { ...linha(), ...respostaRecorrente(linha(), assinatura(), true) }
    const desfeita = { ...comSim, ...desfazerRespostaRecorrente(comSim) }
    expect(desfeita).toMatchObject({ categoryId: 'cat_outros', grupoGerencial: 'grp_D', _recorrenteEscolha: null, _doAgendamento: null })
    const [r] = aplicarRecorrentesParecidos([desfeita], ctx())
    expect(precisaDecisao(r)).toBe(true)
  })
})
