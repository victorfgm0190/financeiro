// Sugestões do Assistente na Importar Fatura (Etapa 6c): formato e validação, o que vai para a IA,
// aceitar / desfazer e o aprendizado só no Confirmar. Dados fictícios.
import { describe, it, expect } from 'vitest'
import {
  validarSugestao, itensParaIa, sugestoesValidas, aceitarSugestaoNovo, desfazerSugestaoNovo, regrasDaConfirmacao,
  candidatosPermitidos, MAX_ITENS_IA,
} from './sugestaoAssistente.js'
import { perguntasDeDecisao } from './blocosConferencia.js'

const tx = (id, x = {}) => ({ id, type: 'expense', amount: 87.3, description: `Loja ${id}`, date: '2026-11-03', reconciled: false, origin: 'manual', ...x })
const linha = (id, x = {}) => ({ _id: id, type: 'expense', selected: true, description: `LOJA ${id}`, amount: 10, date: '2026-11-03', faturaMonthYear: '2026-11', categoryId: '', grupoGerencial: 'grp_D', payee: '', ...x })
const CATEGORIAS = [
  { id: 'c_mercado', type: 'expense', perfilIds: [] }, { id: 'c_assin', type: 'expense', perfilIds: [] },
  { id: 'c_estorno', type: 'income', perfilIds: [] }, { id: 'c_empresa', type: 'expense', perfilIds: ['prf_empresa'] },
]

describe('validarSugestao (formato da Etapa 6c)', () => {
  const ok = { linhaId: 'l1', decisao: 'mesmo', candidatoId: 't1', confianca: 'alta', motivo: 'Mesma loja e mesmo valor.' }
  it('aceita só candidato da lista e categoria / grupo / favorecido das listas', () => {
    expect(validarSugestao(ok, { linhaId: 'l1', candidatosIds: ['t1'] })).toMatchObject({ decisao: 'mesmo', candidatoId: 't1' })
    expect(validarSugestao(ok, { linhaId: 'l1', candidatosIds: ['t2'] })).toBeNull()
    expect(validarSugestao(ok, { linhaId: 'l2', candidatosIds: ['t1'] })).toBeNull()
    const novo = { linhaId: 'l1', decisao: null, categoriaId: 'c1', grupoId: 'g1', favorecido: 'Loja Alfa', confianca: 'media', motivo: 'Como antes.' }
    expect(validarSugestao(novo, { linhaId: 'l1', categoriasIds: ['c1'], gruposIds: ['g1'], favorecidos: ['Loja Alfa'] })).toMatchObject({ categoriaId: 'c1', grupoId: 'g1', favorecido: 'Loja Alfa' })
    expect(validarSugestao(novo, { linhaId: 'l1', categoriasIds: ['c2'], gruposIds: ['g1'], favorecidos: ['Loja Alfa'] })).toBeNull()
    expect(validarSugestao(novo, { linhaId: 'l1', categoriasIds: ['c1'], gruposIds: null, favorecidos: ['Loja Alfa'] })).toBeNull()
    expect(validarSugestao(novo, { linhaId: 'l1', categoriasIds: ['c1'], gruposIds: ['g1'], favorecidos: ['Outro'] })).toBeNull()
    expect(validarSugestao({ ...ok, confianca: 'total' }, { linhaId: 'l1', candidatosIds: ['t1'] })).toBeNull()
    expect(validarSugestao({ ...ok, motivo: '' }, { linhaId: 'l1', candidatosIds: ['t1'] })).toBeNull()
    expect(validarSugestao(null, { linhaId: 'l1' })).toBeNull()
  })
  it('motivo limitado a 140 caracteres', () => {
    expect(validarSugestao({ ...ok, motivo: 'x'.repeat(300) }, { linhaId: 'l1', candidatosIds: ['t1'] }).motivo).toHaveLength(140)
  })
})

describe('o que vai para a IA', () => {
  const pergunta = linha('p1', { selected: false, amount: 87.3, _jaLancadoOpcoes: [tx('t1'), tx('t2', { reconciled: true })] })
  const rows = [
    pergunta,
    linha('n1', { amount: 20 }), linha('n2', { amount: 300 }),
    linha('n3', { categoryId: 'c_mercado' }), // regra/histórico já classificou
    linha('n4', { _doAgendamento: { scheduleId: 's' } }), // o agendamento manda
    linha('n5', { _jaLancado: { origem: 'pre', tx: tx('pre') } }), // pré-lançamento do Assistente
  ]
  const perguntas = perguntasDeDecisao(rows)
  it('perguntas primeiro (sem candidato conciliado), depois só os Novos sem resposta, do maior valor para o menor', () => {
    const itens = itensParaIa({ perguntas, novos: rows.slice(1) })
    expect(itens.map(i => [i.linhaId, i.tipo])).toEqual([['p1', 'pergunta'], ['n2', 'novo'], ['n1', 'novo']])
    expect(itens[0].candidatos.map(c => c.id)).toEqual(['t1'])
    expect(candidatosPermitidos(perguntas[0]).map(c => c.id)).toEqual(['t1'])
  })
  it('no máximo 40 itens; nada pendente → nada a pedir', () => {
    const muitos = Array.from({ length: 60 }, (_, i) => linha(`m${i}`, { amount: i + 1 }))
    expect(itensParaIa({ novos: muitos })).toHaveLength(MAX_ITENS_IA)
    expect(itensParaIa({ perguntas: [], novos: [linha('x', { categoryId: 'c_mercado' })] })).toEqual([])
  })
})

describe('validação na tela', () => {
  const pergunta = linha('p1', { selected: false, amount: 87.3, _jaLancadoOpcoes: [tx('t1'), tx('t2', { reconciled: true })] })
  const novo = linha('n1')
  const estorno = linha('e1', { type: 'income' })
  const perguntas = perguntasDeDecisao([pergunta])
  const ctx = { perguntas, linhas: [novo, estorno], categorias: CATEGORIAS, perfilId: 'prf_pessoal', gruposIds: ['grp_lazer'], favorecidos: ['Loja Alfa'] }
  it('descarta candidato conciliado, categoria de outro tipo ou perfil, grupo e favorecido fora das listas', () => {
    const { porLinha, descartadas } = sugestoesValidas([
      { linhaId: 'p1', decisao: 'mesmo', candidatoId: 't2', confianca: 'alta', motivo: 'conciliado' },
      { linhaId: 'n1', categoriaId: 'c_empresa', confianca: 'alta', motivo: 'outro perfil' },
      { linhaId: 'e1', categoriaId: 'c_mercado', confianca: 'alta', motivo: 'despesa num estorno' },
      { linhaId: 'n1', categoriaId: 'c_assin', favorecido: 'Inventado', confianca: 'alta', motivo: 'favorecido inventado' },
    ], ctx)
    expect(porLinha).toEqual({})
    expect(descartadas).toBe(4)
  })
  it('sugestões válidas por linha', () => {
    const { porLinha } = sugestoesValidas([
      { linhaId: 'p1', decisao: 'mesmo', candidatoId: 't1', confianca: 'alta', motivo: 'mesma loja' },
      { linhaId: 'n1', categoriaId: 'c_assin', grupoId: 'grp_lazer', favorecido: 'Loja Alfa', confianca: 'media', motivo: 'assinatura' },
      { linhaId: 'e1', categoriaId: 'c_estorno', confianca: 'baixa', motivo: 'estorno' },
    ], ctx)
    expect(Object.keys(porLinha).sort()).toEqual(['e1', 'n1', 'p1'])
  })
  it('controle gerencial desligado: grupo sugerido é descartado', () => {
    const { porLinha } = sugestoesValidas([{ linhaId: 'n1', categoriaId: 'c_assin', grupoId: 'grp_lazer', confianca: 'media', motivo: 'x' }], { ...ctx, gruposIds: null })
    expect(porLinha).toEqual({})
  })
})

describe('aceitar e desfazer só mexem na tela; o aprendizado é SÓ no Confirmar', () => {
  const sug = { linhaId: 'n1', categoriaId: 'c_assin', grupoId: 'grp_lazer', favorecido: 'Streaming Exemplo', confianca: 'media', motivo: 'x' }
  it('aceitar preenche a linha e guarda o que havia antes; desfazer volta ao que estava', () => {
    const r = linha('n1', { categoryId: '', grupoGerencial: 'grp_D', payee: 'STREAMING' })
    const aceita = { ...r, ...aceitarSugestaoNovo(r, sug) }
    expect(aceita).toMatchObject({ categoryId: 'c_assin', grupoGerencial: 'grp_lazer', payee: 'Streaming Exemplo' })
    const volta = { ...aceita, ...desfazerSugestaoNovo(aceita) }
    expect(volta).toMatchObject({ categoryId: '', grupoGerencial: 'grp_D', payee: 'STREAMING', _iaAceita: null })
  })
  it('aceitar e cancelar: nenhuma regra (só as linhas GRAVADAS no Confirmar geram regra)', () => {
    const r = linha('n1')
    const aceita = { ...r, ...aceitarSugestaoNovo(r, sug) }
    expect(aceita._iaAceita).toBeTruthy()
    // Cancelar = nenhuma linha gravada → nenhuma regra.
    expect(regrasDaConfirmacao([])).toEqual([])
    // Linha sem sugestão aceita não vira regra por aqui.
    expect(regrasDaConfirmacao([linha('x', { categoryId: 'c_mercado' })])).toEqual([])
  })
  it('aceitar, trocar a categoria e confirmar: a regra fica com a categoria TROCADA', () => {
    const r = linha('n1', { description: 'STREAMING EXEMPLO' })
    const aceita = { ...r, ...aceitarSugestaoNovo(r, sug) }
    const trocada = { ...aceita, categoryId: 'c_mercado' }
    expect(regrasDaConfirmacao([trocada])).toEqual([{
      description: 'STREAMING EXEMPLO', categoryId: 'c_mercado', payee: 'Streaming Exemplo',
      opcoes: { dayOfMonth: null, amountApprox: null, grupoGerencial: 'grp_lazer', reservaFuncaoId: null },
    }])
  })
})

describe('"Aceitar N sugestões" só leva confiança alta e média', () => {
  it('baixa fica de fora do lote (conferir uma a uma)', async () => {
    const { aceitaEmLote } = await import('./sugestaoAssistente.js')
    expect(['alta', 'media', 'baixa'].map(c => aceitaEmLote({ confianca: c }))).toEqual([true, true, false])
    expect(aceitaEmLote(null)).toBe(false)
  })
})

describe('escolha MANUAL de categoria aprende só no Confirmar', () => {
  it('trocar à mão e cancelar: nenhuma regra (a troca só marca a linha)', async () => {
    const { marcaEscolhaManual } = await import('./sugestaoAssistente.js')
    const r = { ...linha('m1'), categoryId: 'c_mercado', ...marcaEscolhaManual() }
    expect(r._aprender).toBe('manual')
    expect(regrasDaConfirmacao([])).toEqual([]) // cancelar = nada gravado
  })
  it('trocar à mão e confirmar: regra criada, do jeito de sempre (dia e valor da compra)', async () => {
    const { marcaEscolhaManual } = await import('./sugestaoAssistente.js')
    const r = { ...linha('m1', { description: 'PADARIA EXEMPLO', amount: 18.5, date: '2026-11-07' }), categoryId: 'c_mercado', ...marcaEscolhaManual() }
    expect(regrasDaConfirmacao([r])).toEqual([{ description: 'PADARIA EXEMPLO', categoryId: 'c_mercado', payee: '',
      opcoes: { dayOfMonth: 7, amountApprox: 18.5, grupoGerencial: 'grp_D', reservaFuncaoId: null } }])
  })
  it('trocar duas vezes e confirmar: vale a última; sugestão aceita e depois troca manual = manual', async () => {
    const { marcaEscolhaManual } = await import('./sugestaoAssistente.js')
    let r = { ...linha('m1'), categoryId: 'c_mercado', ...marcaEscolhaManual() }
    r = { ...r, categoryId: 'c_assin', ...marcaEscolhaManual() }
    expect(regrasDaConfirmacao([r]).map(x => x.categoryId)).toEqual(['c_assin'])
    const sug = { linhaId: 'n1', categoriaId: 'c_assin', confianca: 'alta', motivo: 'x' }
    let s = { ...linha('n1'), ...aceitarSugestaoNovo(linha('n1'), sug) }
    expect(s._aprender).toBe('ia')
    s = { ...s, categoryId: 'c_mercado', ...marcaEscolhaManual() }
    expect(regrasDaConfirmacao([s])).toEqual([expect.objectContaining({ categoryId: 'c_mercado', opcoes: expect.objectContaining({ amountApprox: 10 }) })])
  })
  it('linha sem marca (Preencher em Lote, Cat → Ger, Classificar Auto) não gera regra por aqui', () => {
    expect(regrasDaConfirmacao([linha('x', { categoryId: 'c_mercado', _catEdit: true })])).toEqual([])
  })
  it('desfazer a sugestão aceita tira a marca de aprender', () => {
    const sug = { linhaId: 'n1', categoriaId: 'c_assin', confianca: 'alta', motivo: 'x' }
    const aceita = { ...linha('n1'), ...aceitarSugestaoNovo(linha('n1'), sug) }
    const volta = { ...aceita, ...desfazerSugestaoNovo(aceita) }
    expect(volta._aprender).toBeNull()
    expect(regrasDaConfirmacao([volta])).toEqual([])
  })
})
