import { describe, it, expect } from 'vitest'
import * as espree from 'espree'
import {
  rodandoInstalado, suportaInstalar, safariDoMac, situacaoDoNavegador,
  navegadorSemSuporte, scriptNavegadorSemSuporte, paginaNavegadorSemSuporte, LINK_EDGE, LINK_CHROME,
} from './ambienteNavegador.js'

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
}

// Janela fictícia: `modos` = display-modes que casam; `instala` = tem beforeinstallprompt; `pasta` = showDirectoryPicker.
function janela({ ua = UA.chrome, modos = [], instala = false, pasta = false, standalone, toque = 0 } = {}) {
  const w = {
    navigator: { userAgent: ua, maxTouchPoints: toque, ...(standalone === undefined ? {} : { standalone }) },
    matchMedia: (q) => ({ matches: modos.some(m => q === `(display-mode: ${m})`) }),
  }
  if (instala) w.onbeforeinstallprompt = null
  if (pasta) w.showDirectoryPicker = () => {}
  return w
}

describe('rodando instalado (por recurso)', () => {
  it('janela própria: standalone, window-controls-overlay ou navigator.standalone do Mac', () => {
    expect(rodandoInstalado(janela({ modos: ['standalone'] }))).toBe(true)
    expect(rodandoInstalado(janela({ modos: ['window-controls-overlay'] }))).toBe(true)
    expect(rodandoInstalado(janela({ ua: UA.safariMac, standalone: true }))).toBe(true)
  })
  it('aba comum: não', () => {
    expect(rodandoInstalado(janela())).toBe(false)
    expect(rodandoInstalado(janela({ ua: UA.safariMac, standalone: false }))).toBe(false)
    expect(rodandoInstalado(null)).toBe(false)
    expect(rodandoInstalado({ navigator: {}, matchMedia: () => { throw new Error('x') } })).toBe(false)
  })
})

describe('situação do navegador', () => {
  it('instalado vale mais que tudo', () => {
    const s = situacaoDoNavegador(janela({ modos: ['standalone'], instala: true, pasta: true }), { pedido: {} })
    expect(s).toMatchObject({ modo: 'instalado', instalado: true, podeInstalarAgora: false, gravaEmPasta: true })
  })
  it('instalável: o navegador ofereceu (evento guardado) → botão', () => {
    const s = situacaoDoNavegador(janela({ instala: true, pasta: true }), { pedido: { prompt() {} } })
    expect(s).toMatchObject({ modo: 'instalavel', podeInstalarAgora: true, suportaInstalar: true, gravaEmPasta: true })
  })
  it('instala, mas ainda não ofereceu (ou já instalado e aberto numa aba) → pelo menu', () => {
    expect(situacaoDoNavegador(janela({ instala: true, pasta: true })).modo).toBe('pelo-menu')
  })
  it('sem instalação e sem pasta (ex.: Firefox) → recomenda Edge/Chrome', () => {
    const s = situacaoDoNavegador(janela({ ua: UA.firefox }))
    expect(s).toMatchObject({ modo: 'sem-instalacao', suportaInstalar: false, gravaEmPasta: false, safariMac: false })
  })
  it('Safari do Mac → Adicionar ao Dock (decidido pela falta do recurso + Safari no Mac)', () => {
    expect(situacaoDoNavegador(janela({ ua: UA.safariMac })).modo).toBe('safari-mac')
    // Mesmo nome, mas com o recurso de instalar: vale o recurso.
    expect(safariDoMac(janela({ ua: UA.safariMac, instala: true }))).toBe(false)
    // iPad que se apresenta como Mac (toque): não é o Safari do Mac.
    expect(safariDoMac(janela({ ua: UA.safariMac, toque: 5 }))).toBe(false)
  })
  it('o nome do navegador sozinho não decide: Chrome sem o recurso não é "instalável"', () => {
    expect(suportaInstalar(janela({ ua: UA.chrome }))).toBe(false)
    expect(situacaoDoNavegador(janela({ ua: UA.chrome })).modo).toBe('sem-instalacao')
  })
})

// Janela para o teste do navegador sem suporte (só o que a função olha).
function navegador({ ie = false, promise = true, fetch = true, modulos = true, css = true, colorMix = true } = {}) {
  const doc = {
    ...(ie ? { documentMode: 11 } : {}),
    createElement: () => (modulos ? { noModule: false } : {}),
  }
  return {
    document: doc,
    Promise: promise ? Promise : undefined,
    fetch: fetch ? () => {} : undefined,
    CSS: css ? { supports: (p, v) => (v.startsWith('color-mix') ? colorMix : true) } : undefined,
  }
}

describe('navegador sem suporte mínimo', () => {
  it('Internet Explorer', () => expect(navegadorSemSuporte(navegador({ ie: true }))).toBe(true))
  it('muito antigo: sem Promise/fetch, sem módulos ou sem as cores modernas do visual', () => {
    expect(navegadorSemSuporte(navegador({ promise: false }))).toBe(true)
    expect(navegadorSemSuporte(navegador({ fetch: false }))).toBe(true)
    expect(navegadorSemSuporte(navegador({ modulos: false }))).toBe(true)
    expect(navegadorSemSuporte(navegador({ css: false }))).toBe(true)
    expect(navegadorSemSuporte(navegador({ colorMix: false }))).toBe(true)
  })
  it('navegador atual: abre normalmente', () => expect(navegadorSemSuporte(navegador())).toBe(false))
  it('erro inesperado na checagem: deixa o app tentar abrir', () => {
    expect(navegadorSemSuporte({ get document() { throw new Error('x') } })).toBe(false)
  })

  it('o script do index.html é ES5 puro (o Internet Explorer precisa ler)', () => {
    const s = scriptNavegadorSemSuporte()
    expect(() => espree.parse(s, { ecmaVersion: 5 })).not.toThrow()
  })

  // Roda o script como o navegador rodaria: só `window` e `document` globais.
  const rodar = (w) => {
    const body = { innerHTML: '<div id="root"></div>', style: {} }
    w.document = { ...w.document, readyState: 'complete', body, addEventListener: () => {} }
    new Function('window', 'document', scriptNavegadorSemSuporte())(w, w.document)
    return body
  }
  it('no IE: troca a página pela mensagem com Edge e Chrome e marca para o app não montar', () => {
    const w = navegador({ ie: true })
    const body = rodar(w)
    expect(w.__finupSemSuporte).toBe(true)
    expect(body.innerHTML).toContain('Este navegador não é compatível com o Finup')
    expect(body.innerHTML).toContain(LINK_EDGE)
    expect(body.innerHTML).toContain(LINK_CHROME)
  })
  it('num navegador atual: não mexe em nada', () => {
    const w = navegador()
    const body = rodar(w)
    expect(w.__finupSemSuporte).toBeUndefined()
    expect(body.innerHTML).toBe('<div id="root"></div>')
  })
  it('a página indica Edge (já vem no Windows) e Chrome, com os links oficiais', () => {
    const p = paginaNavegadorSemSuporte()
    expect(p).toContain('Microsoft Edge (já vem no Windows)')
    expect(LINK_EDGE).toMatch(/^https:\/\/www\.microsoft\.com\//)
    expect(LINK_CHROME).toMatch(/^https:\/\/www\.google\.com\//)
  })
})
