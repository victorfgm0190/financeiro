import { describe, it, expect } from 'vitest'
import { instrucoes, INSTRUCOES, textoCadastros } from './_ia.js'

describe('Assistente — controle gerencial desligado', () => {
  it('instruções sem nenhuma menção a gerencial; ligado continua igual', () => {
    expect(instrucoes(false)).not.toMatch(/gerenc/i)
    expect(instrucoes(true)).toBe(INSTRUCOES)
    expect(INSTRUCOES).toMatch(/gerenciais/)
  })
  it('lista de contas sem as subcontas gerenciais', () => {
    const ctx = {
      contas: [
        { id: 'itaupers', name: 'Itaupers', type: 'credit', papel: 'sugerivel' },
        { id: 'ger', name: 'Ger. Itaupers', type: 'gerencial', papel: 'gerencial' },
      ],
      categorias: [], favorecidos: [], centros: [], apelidos: [], maisUsados: { categorias: [], contas: [], favorecidos: [] },
    }
    expect(textoCadastros({ ...ctx, gerencialLigado: false })).not.toMatch(/gerenc/i)
    expect(textoCadastros({ ...ctx, gerencialLigado: true })).toMatch(/Ger\. Itaupers/)
  })
})
