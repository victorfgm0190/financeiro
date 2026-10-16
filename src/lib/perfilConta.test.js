import { describe, it, expect } from 'vitest'
import { nomeCurtoPerfil, perfilDaConta } from './perfilConta'

const perfis = [
  { id: 'pf', name: 'VICTOR FRANCISCO GOMES MOREIRA', type: 'pf' },
  { id: 'pj', name: ' Lumen Tech ', type: 'pj' },
]

describe('nomeCurtoPerfil', () => {
  it('PF mostra o primeiro nome; PJ o nome inteiro sem espaços nas pontas', () => {
    expect(nomeCurtoPerfil(perfis[0])).toBe('VICTOR')
    expect(nomeCurtoPerfil(perfis[1])).toBe('Lumen Tech')
  })
  it('nome vazio cai em "Perfil"', () => {
    expect(nomeCurtoPerfil({ name: '  ', type: 'pf' })).toBe('Perfil')
  })
})

describe('perfilDaConta', () => {
  it('conta com perfil devolve o perfil e o nome curto', () => {
    const r = perfilDaConta({ profileId: 'pj' }, perfis)
    expect(r.perfil.id).toBe('pj')
    expect(r.rotulo).toBe('Lumen Tech')
    expect(r.nomeCompleto).toBe('Lumen Tech')
  })
  it('sem profileId, ou com perfil inexistente, é "Sem vínculo"', () => {
    expect(perfilDaConta({ profileId: null }, perfis)).toMatchObject({ perfil: null, rotulo: 'Sem vínculo' })
    expect(perfilDaConta({ profileId: 'apagado' }, perfis)).toMatchObject({ perfil: null, rotulo: 'Sem vínculo' })
    expect(perfilDaConta({ profileId: 'pf' }, null)).toMatchObject({ perfil: null })
  })
})
