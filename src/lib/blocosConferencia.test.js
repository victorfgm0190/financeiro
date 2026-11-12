// Tela nova da conferência da Importar Fatura: blocos, perguntas, lado a lado e frases. Dados fictícios.
import { describe, it, expect } from 'vitest'
import {
  blocoDaLinha, montarBlocos, resumoDosBlocos, perguntasDeDecisao, camposLadoALado, fraseSim, fraseNao,
  parJaNoFinup, origemDoLancamento, respostaDaLinha, ROTULO,
} from './blocosConferencia.js'
import { contarRevisaoFatura } from './contagemRevisaoFatura.js'

const linha = (id, extra = {}) => ({ _id: id, description: `LOJA ${id}`, amount: 10, type: 'expense', selected: true, date: '2026-11-03', _dateCartao: '2026-11-03', faturaMonthYear: '2026-11', ...extra })
const tx = (id, extra = {}) => ({ id, description: `Loja ${id}`, amount: 10, type: 'expense', date: '2026-11-03', faturaMonthYear: '2026-11', reconciled: false, origin: 'manual', ...extra })

const ROWS = [
  linha('novo'),
  linha('novo2', { amount: 20 }),
  linha('ja', { selected: false, _isDuplicate: true, _dbTx: tx('t1'), _jaLancado: { tx: tx('t1'), origem: 'regra_nova' } }),
  linha('conc', { selected: false, _isDuplicate: true, _dbTx: tx('t2', { reconciled: true }) }),
  linha('colisao', { selected: false, _collisionTx: tx('t3', { installmentNum: 2, installmentTotal: 5 }), _installment: { num: 2, total: 5 } }),
  linha('pergunta', { selected: false, _jaLancadoOpcoes: [tx('t4'), tx('t5', { amount: 10 })] }),
  linha('dup', { selected: false, _dupLevel: 'possivel', _dupTx: tx('t6', { installmentNum: 4, installmentTotal: 4 }), _installment: { num: 3, total: 4 } }),
  linha('rec', { selected: false, amount: 44.9, _recorrentePergunta: { scheduleId: 'sch_1', descricao: 'Streaming', valorAgendado: 39.9, ocorrencia: '2026-11-05', fatura: '2026-11' } }),
  linha('fora', { selected: false }),
  linha('gerada', { _generated: true }),
]

describe('blocos — cada linha em um só, coerente com a contagem única', () => {
  it('distribui as linhas', () => {
    const b = montarBlocos(ROWS, { itensAguardando: [{ tx: tx('p'), valor: -30 }], arquivo: 100, projetado: 90 })
    expect(b.novos.map(r => r._id)).toEqual(['novo', 'novo2'])
    expect(b.jaNoFinup.map(r => r._id)).toEqual(['ja', 'colisao'])
    expect(b.jaConciliados.map(r => r._id)).toEqual(['conc'])
    expect(b.decisao.map(r => r._id)).toEqual(['pergunta', 'dup', 'rec'])
    expect(b.naoEntram.map(r => r._id)).toEqual(['fora'])
    expect(b.aguardando).toHaveLength(1)
  })
  it('os totais batem com a contagem única (novos = importar; decisão = decisão; já = conciliados)', () => {
    const doArquivo = ROWS.filter(r => !r._generated)
    const c = contarRevisaoFatura(doArquivo)
    const res = resumoDosBlocos(montarBlocos(doArquivo, null))
    expect(res.novos).toEqual(c.importar)
    expect(res.decisao).toEqual(c.decisao)
    expect(res.ja).toEqual(c.conciliados)
    expect(res.naoEntram).toEqual(c.desmarcados)
    expect(res.novos.qtd + res.ja.qtd + res.decisao.qtd + res.naoEntram.qtd).toBe(c.total)
  })
  it('resumo: total do arquivo × o que fica na fatura vêm da projeção', () => {
    const res = resumoDosBlocos(montarBlocos(ROWS, { itensAguardando: [{ valor: -30 }] }), { arquivo: 100, projetado: 130 })
    expect(res).toMatchObject({ arquivo: 100, ficaNaFatura: 130, aguardando: { qtd: 1, valor: 30 } })
  })
  it('linha decidida sai de "Pedem sua decisão"', () => {
    expect(blocoDaLinha({ ...ROWS[5], _jaLancadoEscolha: 'novo', selected: true })).toBe('novos')
  })
})

describe('perguntas "É este?"', () => {
  const perguntas = perguntasDeDecisao(ROWS)
  it('uma por linha que pede decisão, com todos os candidatos', () => {
    expect(perguntas.map(p => [p.id, p.tipo, p.candidatos.length])).toEqual([['pergunta', 'candidatos', 2], ['dup', 'duplicata', 1], ['rec', 'recorrente', 1]])
    expect(perguntas[0].titulo).toBe(ROTULO.pergunta)
    expect(perguntas[2].titulo).toBe('É este agendamento?')
  })
  it('lado a lado realça só o que difere', () => {
    const p = perguntas[1]
    const campos = camposLadoALado(p.row, p.candidatos[0], { mostrarGrupo: false })
    const dif = Object.fromEntries(campos.map(c => [c.campo, c.difere]))
    expect(dif).toMatchObject({ parcela: true, valor: false, fatura: false, origem: false })
    expect(campos.find(c => c.campo === 'parcela')).toMatchObject({ fatura: '3/4', finup: '4/4' })
    expect(campos.some(c => c.campo === 'grupo')).toBe(false)
  })
  it('recorrente: valor agendado × valor do cartão, com a data da ocorrência', () => {
    const p = perguntas[2]
    const campos = camposLadoALado(p.row, p.candidatos[0], { schedules: [{ id: 'sch_1', categoryId: 'c1' }], categorias: [{ id: 'c1', name: 'Assinaturas' }] })
    const valor = campos.find(c => c.campo === 'valor')
    expect(valor.difere).toBe(true)
    expect(valor.finup).toMatch(/39,90 \(agendado\)/)
    expect(campos.find(c => c.campo === 'categoria').finup).toBe('Assinaturas')
    expect(campos.find(c => c.campo === 'dataFinup').finup).toBe('05/11/2026')
  })
  it('frases do que acontece ao confirmar', () => {
    expect(fraseSim(perguntas[1], perguntas[1].candidatos[0])).toMatch(/parcela 3\/4.*conciliado/)
    expect(fraseSim(perguntas[2], perguntas[2].candidatos[0])).toMatch(/baixada pelo valor do cartão.*44,90.*39,90.*classificação do agendamento/)
    expect(fraseSim(perguntas[0], { tx: tx('x', { estimado: true, amount: 9 }) })).toMatch(/valor real/)
    expect(fraseNao(perguntas[1])).toMatch(/lançamento novo.*parcela 3\/4/)
    expect(fraseNao(perguntas[2])).toMatch(/não é baixado/)
  })
})

describe('itens recolhidos', () => {
  it('"Já estão no Finup": "Não é este" só onde a regra deixa', () => {
    expect(parJaNoFinup(ROWS[2]).acao).toBe('novo')
    expect(parJaNoFinup(ROWS[4]).acao).toBeNull()
    expect(parJaNoFinup({ ...ROWS[5], _jaLancadoEscolha: 't4' }).acao).toBe('rever')
    expect(parJaNoFinup(linha('x', { _isDuplicate: true, _jaLancado: { tx: tx('t'), origem: 'ja_existe' } })).acao).toBeNull()
  })
  it('origem em palavras do usuário', () => {
    expect(origemDoLancamento(tx('a'))).toBe('Lançado por você')
    expect(origemDoLancamento(tx('a', { _pre: true }))).toBe('Pré-lançamento do Assistente')
    expect(origemDoLancamento(tx('a', { origin: 'agendamento' }))).toBe('Do agendamento')
    expect(origemDoLancamento(tx('a', { installmentNum: 3, installmentTotal: 5 }))).toBe('Parcela prevista de compra parcelada')
    expect(origemDoLancamento(tx('a', { origin: 'importacao_fatura' }))).toBe('Importado de uma fatura')
  })
  it('resposta dada fica visível em Novos', () => {
    expect(respostaDaLinha({ ...ROWS[5], _jaLancadoEscolha: 'novo', selected: true })).toBe('Você disse que é outra compra')
    expect(respostaDaLinha(linha('r', { _recorrente: { escolha: 'sim' } }))).toBe('É o agendamento')
    expect(respostaDaLinha(ROWS[0])).toBeNull()
  })
  it('nenhum termo técnico nos rótulos', () => {
    const textos = [...Object.values(ROTULO), ...perguntasDeDecisao(ROWS).map(p => p.explicacao)].join(' ')
    expect(textos).not.toMatch(/colis|série|proje|No banco|duplicata/i)
  })
})
