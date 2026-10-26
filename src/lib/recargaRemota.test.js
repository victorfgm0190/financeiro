// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { podeRecarregar, haModalAberto, campoEmEdicao, criarJanela, textoAtualizadoHa, textoNovidades } from './recargaRemota'

afterEach(() => { document.body.innerHTML = '' })

describe('podeRecarregar', () => {
  it('libera sem modal, sem foco em campo e sem fila', () => {
    expect(podeRecarregar()).toBe(true)
  })

  it('adia com alteração pendente ou envio em andamento', () => {
    expect(podeRecarregar({ pendentes: 1 })).toBe(false)
    expect(podeRecarregar({ enviando: true })).toBe(false)
  })

  it.each([
    ['Modal compartilhado', '<div data-modal-painel=""></div>'],
    ['BottomSheet/TelaCheia', '<div role="dialog" aria-modal="true"></div>'],
    ['overlay avulso', '<div class="fixed inset-0 z-[999]"></div>'],
  ])('adia com %s aberto', (_, html) => {
    document.body.innerHTML = html
    expect(haModalAberto()).toBe(true)
    expect(podeRecarregar()).toBe(false)
  })

  it('barra inferior fixa (inset-x-0) não conta como modal', () => {
    document.body.innerHTML = '<nav class="fixed bottom-0 inset-x-0"></nav>'
    expect(haModalAberto()).toBe(false)
  })

  it('campo de texto com foco adia; botão e checkbox não', () => {
    document.body.innerHTML = '<input id="t" type="text"><textarea id="a"></textarea><input id="c" type="checkbox"><button id="b">x</button>'
    for (const [id, esperado] of [['t', true], ['a', true], ['c', false], ['b', false]]) {
      document.getElementById(id).focus()
      expect(campoEmEdicao()).toBe(esperado)
    }
  })
})

describe('criarJanela', () => {
  it('deixa passar uma chamada a cada 2 s (focus + visibilitychange juntos)', () => {
    let t = 1000
    const passa = criarJanela(2000, () => t)
    expect(passa()).toBe(true)
    t += 50
    expect(passa()).toBe(false)
    t += 2000
    expect(passa()).toBe(true)
  })
})

describe('textos', () => {
  it('Atualizado agora / há N min / há N h', () => {
    const agora = 10 * 3600000
    expect(textoAtualizadoHa(null, agora)).toBe(null)
    expect(textoAtualizadoHa(agora - 20000, agora)).toBe('Atualizado agora')
    expect(textoAtualizadoHa(agora - 5 * 60000, agora)).toBe('Atualizado há 5 min')
    expect(textoAtualizadoHa(agora - 125 * 60000, agora)).toBe('Atualizado há 2 h')
  })

  it('aviso de novidades no singular e plural; nada sem novidade', () => {
    expect(textoNovidades(0)).toBe(null)
    expect(textoNovidades(1)).toBe('Dados atualizados: 1 alteração recebida')
    expect(textoNovidades(3)).toBe('Dados atualizados: 3 alterações recebidas')
  })
})
