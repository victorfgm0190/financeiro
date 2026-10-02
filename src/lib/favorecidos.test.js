import { describe, it, expect } from 'vitest'
import {
  contarUsos, nomesFaltando, listaFavorecidos, criterioExato, criterioComecaCom, selecionarAlvos,
  aplicarRenomeacao, favorecidoPorAlias, favorecidoDaImportacao, baseDoFavorecido, padroesDeAlias,
} from './favorecidos'

const estado = () => ({
  payees: ['Yelumseg', 'Posto Shell', 'Sem Uso Ltda'],
  transactions: [
    { id: 't1', payee: 'Yelumseg Parc2', description: 'Yelumseg Parc2' },
    { id: 't2', payee: 'Yelumseg Parc3', description: 'Yelumseg Parc3' },
    { id: 't3', payee: ' Yelumseg ', description: 'Yelumseg 8/12' },
    { id: 't4', payee: 'Posto Shell', description: 'POSTO SHELL 123' },
    { id: 't5', payee: '', description: 'Sem favorecido' },
  ],
  schedules: [{ id: 's1', payee: 'Yelumseg Parc3', description: 'Yelumseg SEGURO CARRO' }],
  classificationRules: [{ id: 'r1', contains: 'Yelumseg Parc2', payee: 'Yelumseg Parc2' }],
  favorecidoAliases: [],
})
const fonte = (d) => ({ transactions: d.transactions, schedules: d.schedules, rules: d.classificationRules })

describe('uso e sincronização do cadastro', () => {
  it('conta usos por nome com TRIM, sem vazios', () => {
    const u = contarUsos(fonte(estado()))
    expect(u.get('Yelumseg')).toMatchObject({ lancamentos: 1, total: 1 })
    expect(u.get('Yelumseg Parc2')).toMatchObject({ lancamentos: 1, agendamentos: 0, regras: 1, total: 2 })
    expect(u.get('Yelumseg Parc3')).toMatchObject({ lancamentos: 1, agendamentos: 1, total: 2 })
    expect(u.has('')).toBe(false)
  })

  it('nomes em uso fora do cadastro, do mais usado para o menos, sem juntar parecidos', () => {
    const d = estado()
    expect(nomesFaltando(d.payees, contarUsos(fonte(d))).map(f => [f.nome, f.usos]))
      .toEqual([['Yelumseg Parc2', 2], ['Yelumseg Parc3', 2]])
  })

  it('lista = cadastro ∪ em uso, marcando sem uso e fora do cadastro', () => {
    const d = estado()
    const l = listaFavorecidos(d.payees, contarUsos(fonte(d)))
    expect(l.find(f => f.nome === 'Sem Uso Ltda')).toMatchObject({ noCadastro: true, usos: { total: 0 } })
    expect(l.find(f => f.nome === 'Yelumseg Parc2')).toMatchObject({ noCadastro: false })
  })
})

describe('critérios de seleção', () => {
  it('"começa com" usa a base sem sufixo de parcela e não pega prefixo no meio da palavra', () => {
    const c = criterioComecaCom('Yelumseg Parc7')
    expect(baseDoFavorecido('Yelumseg Parc7')).toBe('Yelumseg')
    expect(['Yelumseg', 'Yelumseg Parc2', 'yelumseg 8/12', 'Yelumsegx', 'Outro Yelumseg'].map(c))
      .toEqual([true, true, true, false, false])
  })

  it('separa os alvos por tabela', () => {
    const a = selecionarAlvos(fonte(estado()), criterioExato(['Yelumseg Parc3']))
    expect(a.lancamentos.map(x => x.id)).toEqual(['t2'])
    expect(a.agendamentos.map(x => x.id)).toEqual(['s1'])
    expect(a.regras).toEqual([])
  })
})

describe('aplicarRenomeacao (mesclar)', () => {
  it('troca o favorecido nas 3 tabelas, mantém a descrição, ajusta o cadastro e grava o alias', () => {
    const d = estado()
    const a = selecionarAlvos(fonte(d), criterioComecaCom('Yelumseg Parc7'))
    const ids = { lancamentos: a.lancamentos.map(x => x.id), agendamentos: a.agendamentos.map(x => x.id), regras: a.regras.map(x => x.id) }
    const n = aplicarRenomeacao(d, { para: 'Yelumseg', ids, nomesAntigos: ['Yelumseg Parc7'], alias: true })

    expect(n.transactions.filter(t => ['t1', 't2', 't3'].includes(t.id)).map(t => t.payee)).toEqual(['Yelumseg', 'Yelumseg', 'Yelumseg'])
    expect(n.transactions.find(t => t.id === 't1').description).toBe('Yelumseg Parc2')
    expect(n.schedules[0].payee).toBe('Yelumseg')
    expect(n.classificationRules[0].payee).toBe('Yelumseg')
    expect(n.transactions.find(t => t.id === 't4').payee).toBe('Posto Shell')
    // O nome sem uso que já existia (Sem Uso Ltda) não é tocado; o novo está no cadastro.
    expect(n.payees).toEqual(['Yelumseg', 'Posto Shell', 'Sem Uso Ltda'])
    expect(n.favorecidoAliases.map(x => [x.padrao, x.favorecido])).toEqual([['Yelumseg', 'Yelumseg']])
  })

  it('remove do cadastro os nomes antigos que ficaram sem uso, e só eles', () => {
    const d = { ...estado(), payees: ['Yelumseg Parc2', 'Yelumseg Parc3', 'Posto Shell'] }
    const n = aplicarRenomeacao(d, {
      para: 'Yelumseg', ids: { lancamentos: ['t2'], agendamentos: [], regras: [] }, nomesAntigos: ['Yelumseg Parc3'],
    })
    // Parc3 ainda é usado pelo agendamento s1 → fica; o novo entra.
    expect(n.payees).toEqual(['Yelumseg Parc2', 'Yelumseg Parc3', 'Posto Shell', 'Yelumseg'])
    const n2 = aplicarRenomeacao(n, {
      para: 'Yelumseg', ids: { lancamentos: [], agendamentos: ['s1'], regras: [] }, nomesAntigos: ['Yelumseg Parc3'],
    })
    expect(n2.payees).toEqual(['Yelumseg Parc2', 'Posto Shell', 'Yelumseg'])
    expect(n2.favorecidoAliases).toEqual([])
  })

  it('alias repetido atualiza o existente', () => {
    const d = { ...estado(), favorecidoAliases: [{ id: 'a1', padrao: 'YELUMSEG', favorecido: 'Velho' }] }
    const n = aplicarRenomeacao(d, { para: 'Yelumseg Seguros', ids: { lancamentos: ['t1'] }, nomesAntigos: ['Yelumseg Parc2'], alias: true })
    expect(n.favorecidoAliases.find(a => a.id === 'a1').favorecido).toBe('Yelumseg Seguros')
    expect(padroesDeAlias(['Yelumseg Parc2', 'Yelumseg Parc3', 'Yelumseg 8/12'])).toEqual(['Yelumseg'])
  })
})

describe('favorecido na importação', () => {
  const aliases = [{ padrao: 'Yelumseg', favorecido: 'Yelumseg Seguros' }, { padrao: 'Posto', favorecido: 'Posto Genérico' }, { padrao: 'Posto Shell', favorecido: 'Shell' }]

  it('alias casa a base inteira ou o começo por palavra; vence o mais longo', () => {
    expect(favorecidoPorAlias('Yelumseg Parc7', aliases)).toBe('Yelumseg Seguros')
    expect(favorecidoPorAlias('POSTO SHELL 123', aliases)).toBe('Shell')
    expect(favorecidoPorAlias('Postos Ipiranga', aliases)).toBeNull()
  })

  it('prioridade: regra > alias > série > arquivo > descrição base', () => {
    expect(favorecidoDaImportacao({ descricao: 'Yelumseg Parc7', regra: 'Regra', aliases, serie: 'Serie', arquivo: 'Arq' })).toBe('Regra')
    expect(favorecidoDaImportacao({ descricao: 'Yelumseg Parc7', aliases, serie: 'Serie', arquivo: 'Arq' })).toBe('Yelumseg Seguros')
    expect(favorecidoDaImportacao({ descricao: 'Loja X Parc7', aliases, serie: 'Serie', arquivo: 'Arq' })).toBe('Serie')
    expect(favorecidoDaImportacao({ descricao: 'Loja X Parc7', aliases, arquivo: 'Arq' })).toBe('Arq')
    expect(favorecidoDaImportacao({ descricao: 'Loja X Parc7', aliases })).toBe('Loja X')
    expect(favorecidoDaImportacao({ descricao: 'Loja X 3/10', aliases: [] })).toBe('Loja X')
  })
})
