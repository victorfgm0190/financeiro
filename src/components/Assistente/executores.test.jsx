import { describe, it, expect } from 'vitest'
import { EXECUTORES } from './executores'
import { ACOES } from '../../lib/assistente/acoes'

describe('executores do Assistente', () => {
  it('toda ação com ferramenta tem executor; 🔴 não tem (vai pelo abrir_tela)', () => {
    for (const a of ACOES) {
      if (a.nivel === 'critica') expect(EXECUTORES[a.id], a.id).toBeUndefined()
      else expect(typeof EXECUTORES[a.id], a.id).toBe('function')
    }
  })
  it('nenhum executor sobra sem ação no registro', () => {
    const ids = new Set(ACOES.map(a => a.id))
    for (const id of Object.keys(EXECUTORES)) expect(ids.has(id), id).toBe(true)
  })
})
