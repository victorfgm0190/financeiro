import { describe, it, expect } from 'vitest'
import { avisosDaConta, diasDoCaixa, somarDiasIso, DIAS_CAIXA_PADRAO } from './avisoCaixaReserva.js'

const fn = (id, saldo) => ({ id, name: id.toUpperCase(), saldo })
const prev = (tipo, date, amount, label = 'IPVA') => ({ tipo, date, amount, label })

describe('aviso de caixa da reserva', () => {
  it('sem negativas e caixa suficiente: sem aviso', () => {
    const r = avisosDaConta({ saldoConta: 1000, funcoes: [fn('a', 600), fn('b', 400)], previsoes: { a: [prev('resgate', '2026-12-01', 300)], b: [prev('provisao', '2026-12-05', 100)] } })
    expect(r.temAviso).toBe(false)
    expect(r.negativas).toEqual([])
    expect(r.falta).toBeNull()
  })
  it('com negativa: aviso 1 com o valor e a lista', () => {
    const r = avisosDaConta({ saldoConta: 600, funcoes: [fn('a', 800), fn('b', -150.5), fn('c', -49.5)] })
    expect(r.somaNegativas).toBe(200)
    expect(r.negativas.map(n => n.nome)).toEqual(['B', 'C'])
    expect(r.textoNegativas.replace(/\s/g, ' ')).toBe('Funções negativas somam R$ 200,00: as demais funções têm R$ 200,00 a mais do que existe na conta.')
    expect(r.textoFalta).toBeNull()
  })
  it('saída futura maior que o caixa: aviso 2 com a data certa e o que falta', () => {
    const previsoes = { a: [prev('resgate', '2026-12-20', 300, 'Seguro'), prev('resgate', '2027-01-10', 900, 'IPVA')] }
    const r = avisosDaConta({ saldoConta: 1000, funcoes: [fn('a', 1000)], previsoes })
    expect(r.falta).toEqual({ data: '2027-01-10', saida: 'IPVA', faltam: 200 })
    expect(r.textoFalta.replace(/\s/g, ' ')).toBe('Em 10/01 a conta não terá dinheiro para IPVA, faltam R$ 200,00.')
  })
  it('entrada prevista antes ou no mesmo dia cobre a saída', () => {
    const f = [fn('a', 100)]
    expect(avisosDaConta({ saldoConta: 100, funcoes: f, previsoes: { a: [prev('resgate', '2026-12-10', 300), prev('deposito', '2026-12-10', 500)] } }).falta).toBeNull()
    expect(avisosDaConta({ saldoConta: 100, funcoes: f, previsoes: { a: [prev('deposito', '2026-12-01', 500), prev('resgate', '2026-12-10', 300)] } }).falta).toBeNull()
    expect(avisosDaConta({ saldoConta: 100, funcoes: f, previsoes: { a: [prev('resgate', '2026-12-10', 300), prev('deposito', '2026-12-11', 500)] } }).falta.data).toBe('2026-12-10')
  })
  it('saída de função negativa fica fora; entrada para ela conta', () => {
    const previsoes = { n: [prev('resgate', '2026-12-10', 5000), prev('deposito', '2026-12-05', 100)], a: [prev('resgate', '2026-12-15', 150)] }
    const r = avisosDaConta({ saldoConta: 100, funcoes: [fn('a', 300), fn('n', -200)], previsoes })
    expect(r.falta).toBeNull()
  })
  it('a marca de dispensa muda quando a situação muda', () => {
    const a = avisosDaConta({ saldoConta: 100, funcoes: [fn('a', -10)] }).assinatura
    expect(avisosDaConta({ saldoConta: 999, funcoes: [fn('a', -10)] }).assinatura).toBe(a)
    expect(avisosDaConta({ saldoConta: 100, funcoes: [fn('a', -20)] }).assinatura).not.toBe(a)
  })
})

describe('janela', () => {
  it('N vem de Configurações, com 60 de padrão', () => {
    expect(DIAS_CAIXA_PADRAO).toBe(60)
    expect(diasDoCaixa({})).toBe(60)
    expect(diasDoCaixa({ reservaDiasCaixa: 90 })).toBe(90)
    expect(diasDoCaixa({ reservaDiasCaixa: 0 })).toBe(60)
    expect(diasDoCaixa({ reservaDiasCaixa: 'x' })).toBe(60)
  })
  it('soma dias na virada do mês e do ano', () => {
    expect(somarDiasIso('2026-12-20', 60)).toBe('2027-02-18')
  })
})
