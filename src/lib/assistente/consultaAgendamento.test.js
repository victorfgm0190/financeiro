import { describe, it, expect } from 'vitest'
import {
  ehPerguntaDeAgendamento, consultaDeAgendamento, procurarAgendamentos, resumoAgendamento, textoDoResumo, palavras, semelhanca,
} from './consultaAgendamento'
import { resumoRegistradas } from '../ocorrenciasRegistradas'
import { computeOccurrences } from '../occurrences'
import { occEfetiva } from '../fluxoCaixa'
import { rotuloParcela } from '../numeroParcela'

// Dados FICTÍCIOS (nada de cliente real).
const base = { transactionType: 'expense', accountId: 'c1', overrides: {}, registered: [], skipped: [] }
const parcelado = {
  ...base, id: 'tv', description: 'TV SALA', payee: 'João Pedro Exemplo', amount: 150, frequency: 'monthly',
  startDate: '2026-06-20', occurrenceType: 'installment', installments: 8,
  registered: ['2026-06-20', '2026-07-20', '2026-08-20', '2026-09-20', '2026-10-20'], nextOccurrence: '2026-11-20',
}
const aluguel = {
  ...base, id: 'alu', description: 'ALUGUEL SALA', payee: 'João Pedro Exemplo', amount: 900, frequency: 'monthly',
  startDate: '2026-01-05', occurrenceType: 'continuous', installments: 0, nextOccurrence: '2026-11-05',
}
const HOJE = '2026-11-02'

describe('intenção: pergunta sobre agendamento', () => {
  it.each([
    'uma dívida com Fulano chamada TV Sala, quantas parcelas estão faltando?',
    'quantas parcelas faltam da TV sala',
    'quantas já paguei do notebook?',
    'quanto falta pagar do carro?',
    'quando termina o financiamento da moto?',
    'qual a próxima parcela do sofá?',
    'qual é a última parcela da geladeira',
    'qual o valor restante do empréstimo',
    'situação do agendamento academia',
    'o carnê da loja já está quitado?',
    'faltam quantas do curso?',
  ])('sim: %s', (t) => expect(ehPerguntaDeAgendamento(t)).toBe(true))

  it.each([
    'paguei a última parcela do carro',
    'dá baixa no aluguel',
    'lance despesa de 100 de mercado',
    'quanto falta pagar da fatura do Nubank?',
    'acha um lançamento de 87 reais',
    'o que vence essa semana?',
    'qual meu saldo principal?',
  ])('não: %s', (t) => expect(ehPerguntaDeAgendamento(t)).toBe(false))
})

describe('prioridade sobre a busca e a baixa (backend)', () => {
  const pergunta = 'uma dívida com Fulano chamada TV Sala, quantas parcelas estão faltando?'
  it('busca genérica e baixa viram consulta do agendamento', () => {
    expect(consultaDeAgendamento('buscar_lancamentos', { texto: 'papai' }, pergunta, true)).toEqual({ descricao: 'papai', favorecido: null })
    expect(consultaDeAgendamento('baixar_agendamento', { descricao: 'TV Sala', favorecido: 'Fulano' }, pergunta, true)).toEqual({ descricao: 'TV Sala', favorecido: 'Fulano' })
  })
  it('pedidos existentes continuam iguais', () => {
    expect(consultaDeAgendamento('buscar_lancamentos', { texto: 'posto' }, 'acha o lançamento do posto', true)).toBeNull()
    expect(consultaDeAgendamento('baixar_agendamento', { favorecido: 'Fulano' }, 'o Fulano me pagou 200', true)).toBeNull()
    expect(consultaDeAgendamento('registrar_lancamento', {}, 'lance despesa de 100 de mercado', true)).toBeNull()
    expect(consultaDeAgendamento('consultar_saldo', {}, 'qual o saldo do itaú?', true)).toBeNull()
    expect(consultaDeAgendamento('consultar_vencimentos', {}, 'o que vence essa semana?', true)).toBeNull()
  })
  it('sem permissão de ver agendamentos: não troca', () => {
    expect(consultaDeAgendamento('buscar_lancamentos', { texto: 'tv' }, pergunta, false)).toBeNull()
  })
})

describe('localizar o agendamento', () => {
  const lista = [parcelado, aluguel, { ...base, id: 'x', description: 'Academia', payee: 'Studio Fit', frequency: 'monthly', startDate: '2026-01-10', occurrenceType: 'continuous' }]

  it('descrição + favorecido: escolhe o certo mesmo com outro de mesmo favorecido', () => {
    const r = procurarAgendamentos(lista, { descricao: 'TV Sala', favorecido: 'João Pedro Exemplo', texto: 'uma dívida com João Pedro Exemplo chamada TV Sala, quantas parcelas estão faltando?' })
    expect(r.escolhido?.id).toBe('tv')
    expect(r.candidatos[0].schedule.id).toBe('tv')
  })

  it('erro de transcrição ("Escrever sala" por "TV SALA"): o parcelado vence quando a pergunta é de parcelas', () => {
    const r = procurarAgendamentos(lista, { descricao: 'Escrever sala', texto: 'quantas parcelas faltam do Escrever sala' })
    expect(r.escolhido?.id).toBe('tv')
  })

  it('nomes parecidos sem desempate → não escolhe sozinho (a tela pergunta)', () => {
    const r = procurarAgendamentos(lista, { descricao: 'sala', texto: 'qual a situação da sala?' })
    expect(r.escolhido).toBeNull()
    expect(r.candidatos.map(c => c.schedule.id).sort()).toEqual(['alu', 'tv'])
  })

  it('letra trocada e prefixo', () => {
    expect(semelhanca('academya', 'academia')).toBeGreaterThan(0)
    expect(semelhanca('acad', 'academia')).toBeGreaterThan(0)
    expect(semelhanca('tv', 'tu')).toBe(0)
    expect(procurarAgendamentos(lista, { descricao: 'academya' }).escolhido?.id).toBe('x')
  })

  it('descrição longa citada por uma palavra só', () => {
    const cond = { ...base, id: 'cond', description: 'CONDOMÍNIO EDIFÍCIO RESIDENCIAL EXEMPLO - ACORDO DE PARCELAMENTO', payee: 'Administradora Exemplo', frequency: 'monthly', startDate: '2026-01-25', occurrenceType: 'continuous' }
    expect(procurarAgendamentos([...lista, cond], { descricao: 'condomínio', texto: 'quanto falta do condomínio?' }).escolhido?.id).toBe('cond')
  })

  it('nenhum resultado', () => {
    const r = procurarAgendamentos(lista, { descricao: 'piscina' })
    expect(r.escolhido).toBeNull()
    expect(r.candidatos).toEqual([])
  })

  it('palavras da pergunta não contam como nome', () => {
    expect(palavras('quantas parcelas estão faltando da dívida chamada TV Sala?')).toEqual(['tv', 'sala'])
  })
})

describe('resumo — os mesmos números do Editar Agendamento', () => {
  it('parcelado: 5 de 8 pagas, faltam 3 com datas, valores e nº da parcela', () => {
    const r = resumoAgendamento(parcelado, { hoje: HOJE })
    expect(r.tipo).toBe('parcelado')
    // "Ver ocorrências registradas (5 de 8)"
    const tela = resumoRegistradas(parcelado, [])
    expect([r.pagas, r.total]).toEqual([tela.registradas, tela.total])
    // Prévia da tela: getNextOccurrences (= computeOccurrences) + occEfetiva + rotuloParcela
    const telaDatas = computeOccurrences(parcelado, 8)
    expect(r.proximas.map(p => p.base)).toEqual(telaDatas)
    expect(r.proximas.map(p => `${p.numero}/${p.total}`)).toEqual(telaDatas.map(d => rotuloParcela(parcelado, d)))
    expect(r.proximas.map(p => p.data)).toEqual(['2026-11-20', '2026-12-20', '2027-01-20'])
    expect(r.restantes).toBe(3)
    expect(r.totalRestante).toBe(450)
    expect(r.ultimaParcela.data).toBe('2027-01-20')
    expect(textoDoResumo(r)).toBe('Faltam 3 de 8 parcelas de TV SALA: 20/11/2026, 20/12/2026 e 20/01/2027. Total restante: R$ 450,00.')
  })

  it('valores diferentes entre parcelas: soma o valor real de cada ocorrência', () => {
    const s = { ...parcelado, overrides: { '2026-12-20': { amount: 200 }, '2027-01-20': { amount: 175.5, date: '2027-01-22' } } }
    const r = resumoAgendamento(s, { hoje: HOJE })
    expect(r.proximas.map(p => p.valor)).toEqual([150, 200, 175.5])
    expect(r.proximas.map(p => p.valor)).toEqual(computeOccurrences(s, 8).map(d => occEfetiva(s, d).amount))
    expect(r.totalRestante).toBe(525.5)
    expect(r.ultimaParcela.data).toBe('2027-01-22')
  })

  it('pulada consome a posição (como na tela)', () => {
    const s = { ...parcelado, skipped: ['2026-11-20'], nextOccurrence: '2026-12-20' }
    const r = resumoAgendamento(s, { hoje: HOJE })
    expect([r.pagas, r.puladas, r.restantes]).toEqual([5, 1, 2])
    expect(r.proximas.map(p => `${p.numero}/${p.total}`)).toEqual(['7/8', '8/8'])
  })

  it('"até a data" (gravado como N ocorrências): restantes até a data final', () => {
    const s = { ...base, id: 'ate', description: 'Curso', amount: 300, frequency: 'monthly', startDate: '2026-09-10', occurrenceType: 'installment', installments: 6, registered: ['2026-09-10', '2026-10-10'], nextOccurrence: '2026-11-10' }
    const r = resumoAgendamento(s, { hoje: HOJE })
    expect(r.restantes).toBe(4)
    expect(r.ultimaParcela.data).toBe('2027-02-10')
    expect(r.totalRestante).toBe(1200)
  })

  it('sem fim: recorrente, sem número final, mostra a próxima', () => {
    const r = resumoAgendamento(aluguel, { hoje: HOJE })
    expect(r.tipo).toBe('recorrente')
    expect(r.restantes).toBeNull()
    expect(r.totalRestante).toBeNull()
    expect(r.proximas[0]).toMatchObject({ data: '2026-11-05', valor: 900 })
    expect(textoDoResumo(r)).toBe('ALUGUEL SALA é recorrente (mensal) e não tem número final de parcelas. Próxima ocorrência: 05/11/2026, R$ 900,00.')
  })

  it('quitado: nada pendente e a última paga (com o lançamento vinculado)', () => {
    const s = { ...parcelado, installments: 5, nextOccurrence: null }
    // Um lançamento por parcela paga (o último pago um dia depois, com R$ 1 a mais).
    const txs = s.registered.map((d, i) => (i === 4
      ? { id: 't5', scheduleId: 'tv', date: '2026-10-21', amount: 151 }
      : { id: `t${i + 1}`, scheduleId: 'tv', date: d, amount: 150 }))
    const r = resumoAgendamento(s, { hoje: HOJE, transactions: txs })
    expect(r.quitado).toBe(true)
    expect(r.restantes).toBe(0)
    expect(r.ultimaPaga).toEqual({ data: '2026-10-21', valor: 151, numero: 5 })
    expect(textoDoResumo(r)).toBe('TV SALA está quitado: não há parcelas pendentes (5 de 5 pagas). Última paga: 21/10/2026 (R$ 151,00).')
  })

  it('atrasada e único', () => {
    const atrasado = resumoAgendamento({ ...parcelado, nextOccurrence: '2026-10-20', registered: parcelado.registered.slice(0, 4) }, { hoje: HOJE })
    expect(atrasado.atrasadas).toBe(1)
    expect(textoDoResumo(atrasado)).toMatch(/^Faltam 4 de 8 parcelas de TV SALA \(1 em atraso\)/)
    const unico = resumoAgendamento({ ...base, id: 'u', description: 'IPVA', amount: 980, frequency: 'once', startDate: '2026-11-15', occurrenceType: 'continuous' }, { hoje: HOJE })
    expect(unico).toMatchObject({ tipo: 'unico', restantes: 1, totalRestante: 980 })
    expect(textoDoResumo(unico)).toBe('IPVA é um pagamento único de R$ 980,00, vence em 15/11/2026.')
  })
})
