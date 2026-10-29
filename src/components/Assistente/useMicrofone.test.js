import { describe, it, expect } from 'vitest'
import { mensagemErroVoz, mensagemSemSuporte } from './useMicrofone'

describe('mensagens do microfone', () => {
  it('cada erro do reconhecimento tem mensagem em português', () => {
    for (const c of ['not-allowed', 'service-not-allowed', 'no-speech', 'audio-capture', 'network', 'aborted', 'language-not-supported']) {
      expect(mensagemErroVoz(c, { ios: true, instalado: false })).toMatch(/[a-zçãé]/)
    }
    expect(mensagemErroVoz('xyz')).toContain('xyz')
  })
  it('iPhone: permissão e Ditado; app instalado orienta o teclado', () => {
    expect(mensagemErroVoz('not-allowed', { ios: true })).toContain('Ajustes')
    expect(mensagemErroVoz('service-not-allowed', { ios: true, instalado: false })).toContain('Ditado')
    expect(mensagemErroVoz('service-not-allowed', { ios: true, instalado: true })).toContain('microfone do teclado')
    expect(mensagemSemSuporte({ instalado: true })).toContain('microfone do teclado')
  })
})
