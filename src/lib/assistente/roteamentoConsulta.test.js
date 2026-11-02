import { describe, it, expect } from 'vitest'
import { ehPerguntaDeMovimentos, alvoDoTexto, rotearConsulta } from './roteamentoConsulta'

// Nomes FICTÍCIOS.
describe('roteamento das consultas pelo texto', () => {
  it.each([
    ['o que já paguei ao João?', 'pago', 'despesa', 'joao'],
    ['quanto falta pagar ao João Exemplo?', 'em_aberto', 'despesa', 'joao exemplo'],
    ['quanto recebi do Pedro este ano?', 'pago', 'receita', 'pedro'],
    ['o que está vencido da academia?', 'vencido', 'despesa', 'academia'],
    ['o que tenho a pagar pra Maria Clara em dezembro', 'em_aberto', 'despesa', 'maria clara'],
  ])('%s → consultar_movimentos', (t, status, tipo, alvo) => {
    expect(ehPerguntaDeMovimentos(t)).toBe(true)
    expect(alvoDoTexto(t)).toBe(alvo)
    expect(rotearConsulta('buscar_lancamentos', { texto: 'x' }, t)).toEqual({
      ferramenta: 'consultar_movimentos', parametros: { assunto: 'favorecido', status, tipo, favorecido: alvo, descricao: null },
    })
  })
  it('o favorecido que o modelo leu tem prioridade sobre o do texto', () => {
    expect(rotearConsulta('baixar_agendamento', { favorecido: 'João Exemplo' }, 'o que já paguei ao João?').parametros.favorecido).toBe('João Exemplo')
  })
  it('parcelas de UM agendamento continuam em consultar_agendamento', () => {
    expect(rotearConsulta('buscar_lancamentos', { texto: 'carro' }, 'quantas parcelas faltam do carro?')).toEqual({ ferramenta: 'consultar_agendamento', parametros: { descricao: 'carro', favorecido: null } })
    expect(rotearConsulta('buscar_lancamentos', { texto: 'carro' }, 'quanto falta pagar do carro?').ferramenta).toBe('consultar_agendamento')
    expect(rotearConsulta('consultar_agendamento', { descricao: 'carro' }, 'quantas parcelas faltam do carro?')).toBeNull()
  })
  it('pedidos existentes não mudam (lançar, baixa, saldo, busca, vencimentos, fatura)', () => {
    expect(rotearConsulta('registrar_lancamento', {}, 'paguei 50 no mercado')).toBeNull()
    expect(rotearConsulta('baixar_agendamento', { favorecido: 'João' }, 'paguei o aluguel do João, dá baixa')).toBeNull()
    expect(rotearConsulta('baixar_agendamento', { favorecido: 'João' }, 'o João me pagou 200')).toBeNull()
    expect(rotearConsulta('consultar_saldo', {}, 'qual o saldo da conta corrente?')).toBeNull()
    expect(rotearConsulta('buscar_lancamentos', { valor: 87 }, 'acha um lançamento de 87 reais')).toBeNull()
    expect(rotearConsulta('consultar_vencimentos', {}, 'o que vence essa semana?')).toBeNull()
    expect(rotearConsulta('buscar_lancamentos', {}, 'quanto falta pagar da fatura do cartão?')).toBeNull()
  })
  it('sem permissão de ver lançamentos/agendamentos: não troca', () => {
    expect(rotearConsulta('buscar_lancamentos', {}, 'o que já paguei ao João?', (m) => m !== 'lancamentos')).toBeNull()
  })
})
