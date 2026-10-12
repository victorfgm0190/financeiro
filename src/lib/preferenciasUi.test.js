import { describe, it, expect } from 'vitest'
import { lerPreferencias, gravarPreferencias } from './preferenciasUi'

describe('preferências de interface (mobile_home_cards)', () => {
  it('lê vazio, formato antigo (array) e formato novo', () => {
    expect(lerPreferencias(null)).toEqual({ cards: null, despesasModo: 'cheio' })
    expect(lerPreferencias([{ id: 'a', on: false }])).toEqual({ cards: [{ id: 'a', on: false }], despesasModo: 'cheio' })
    expect(lerPreferencias({ cards: [], despesasModo: 'liquido' })).toEqual({ cards: [], despesasModo: 'liquido' })
    expect(lerPreferencias({ despesasModo: 'xyz' }).despesasModo).toBe('cheio')
  })

  it('gravar preserva o que não mudou', () => {
    const antigo = [{ id: 'a', on: true }]
    expect(gravarPreferencias(antigo, { despesasModo: 'liquido' })).toEqual({ cards: antigo, despesasModo: 'liquido' })
    expect(gravarPreferencias({ cards: antigo, despesasModo: 'liquido' }, { cards: [] })).toEqual({ cards: [], despesasModo: 'liquido' })
  })
})
