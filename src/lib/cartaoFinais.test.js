import { describe, it, expect } from 'vitest'
import { lerFinais, finalCitado, cartoesComFinal, chaveSubconta, subcontaDoCartao, ehSubcontaGerencialApp } from './cartaoFinais'

describe('finais do cartão', () => {
  it('lê a lista (4 dígitos, sem repetir) e aponta os inválidos', () => {
    expect(lerFinais('4541, 1234 / 4541')).toEqual({ finais: ['4541', '1234'], invalidos: [] })
    expect(lerFinais('45 12345')).toEqual({ finais: [], invalidos: ['45', '12345'] })
    expect(lerFinais('')).toEqual({ finais: [], invalidos: [] })
  })
  it('acha "final 4541" no SMS e o cartão com esse final', () => {
    const sms = 'Compra aprovada no seu PERSON BLACK PONTOS final 4541 - SKINA DA CARNE LTDA valor RS 350,08'
    expect(finalCitado(sms)).toBe('4541')
    expect(finalCitado('gastei 4541 reais')).toBeNull()
    const contas = [{ id: 'a', type: 'credit', cartaoFinais: ['4541'] }, { id: 'b', type: 'credit', cartaoFinais: [] }, { id: 'c', type: 'credit', cartaoFinais: ['4541'], active: false }]
    expect(cartoesComFinal(contas, '4541').map(c => c.id)).toEqual(['a'])
  })
})

describe('vínculo cartão → subconta (pelo nome, como o motor)', () => {
  const card = { id: 'c', type: 'credit', name: 'Cartao Itau Personalite', apelido: 'Itaupers' }
  const contas = [card, { id: 'g', name: 'Ger. Itaupers', type: 'gerencial', isGerencial: true }]
  it('chave = apelido (ou 6 letras do nome) e subconta "Ger. <chave>"', () => {
    expect(chaveSubconta(card)).toBe('Itaupers')
    expect(chaveSubconta({ name: 'Nubank Roxinho' })).toBe('Nubank')
    expect(subcontaDoCartao(contas, card)?.id).toBe('g')
    expect(subcontaDoCartao(contas, { ...card, apelido: 'ITP' })).toBeNull()
  })
  it('subconta gerencial pela marcação; renomeada continua sendo', () => {
    expect(ehSubcontaGerencialApp({ name: 'Reserva Azul', type: 'gerencial' })).toBe(true)
    expect(ehSubcontaGerencialApp({ name: 'Caixinha', type: 'checking', isGerencial: true })).toBe(true)
    expect(ehSubcontaGerencialApp({ name: 'Dinheiro Ger', type: 'cash' })).toBe(false)
  })
})
