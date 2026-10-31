// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { authHeaders, entrarAutorAssistente, AUTH_TOKEN_KEY } from './api'

describe('autor das requisições (histórico)', () => {
  it('prévia do Assistente aberta → header X-Finup-Autor: assistente; fechada → sem header', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'tok')
    expect(authHeaders()['X-Finup-Autor']).toBeUndefined()
    const sair1 = entrarAutorAssistente()
    const sair2 = entrarAutorAssistente()
    expect(authHeaders()['X-Finup-Autor']).toBe('assistente')
    sair1()
    expect(authHeaders()['X-Finup-Autor']).toBe('assistente') // outra prévia ainda aberta
    sair2()
    expect(authHeaders()).toEqual({ Authorization: 'Bearer tok' })
  })
})
