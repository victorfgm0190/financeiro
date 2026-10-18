import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import Instalar from './Instalar'
import { detectarAparelho } from '../lib/instalacao'

// Página /instalar (pública) — renderizada sem navegador, com o aparelho informado.
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadComoMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}
const html = (props) => renderToString(<Instalar endereco="teste1.finup.app.br" instalado={false} {...props} />)
// Título do 1º cartão (o do aparelho, marcado "este aparelho").
const primeiro = (h) => h.match(/<h2[^>]*>.*?<\/svg>\s*(?:<!-- -->)?\s*([^<]+)/)?.[1].trim()

describe('detectarAparelho', () => {
  it('iPhone (Safari ou não), iPad que se diz Mac, Android e computador', () => {
    expect(detectarAparelho(UA.iphoneSafari)).toEqual({ tipo: 'iphone', safari: true })
    expect(detectarAparelho(UA.iphoneChrome)).toEqual({ tipo: 'iphone', safari: false })
    expect(detectarAparelho(UA.ipadComoMac, { maxTouchPoints: 5 })).toEqual({ tipo: 'iphone', safari: true })
    expect(detectarAparelho(UA.ipadComoMac, { maxTouchPoints: 0 })).toEqual({ tipo: 'computador' })
    expect(detectarAparelho(UA.android)).toEqual({ tipo: 'android', chrome: true })
    expect(detectarAparelho(UA.windows)).toEqual({ tipo: 'computador' })
  })
})

describe('página /instalar', () => {
  it('abre sem login: é rota pública do App (fora do PrivateRoute)', () => {
    const app = readFileSync(fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf-8')
    const bloco = app.slice(app.indexOf('const PAGINAS_PUBLICAS = {'), app.indexOf('export default function App'))
    expect(bloco).toContain("'/instalar': () => <Instalar />")
    // a página pública é decidida ANTES do PrivateRoute (que mostraria o Login)
    const corpo = app.slice(app.indexOf('export default function App'))
    expect(corpo.indexOf('if (publica) return publica()')).toBeLessThan(corpo.indexOf('<PrivateRoute>'))
    // e a própria página não lê token nem chama a API
    const pagina = readFileSync(fileURLToPath(new URL('./Instalar.jsx', import.meta.url)), 'utf-8')
    expect(pagina).not.toMatch(/auth_token|getToken|getSessao|fetch\(/)
  })

  it('mostra primeiro o passo a passo do aparelho certo, com os outros abaixo', () => {
    const iphone = html({ aparelho: detectarAparelho(UA.iphoneSafari) })
    expect(primeiro(iphone)).toBe('iPhone')
    expect(iphone).toContain('Adicionar à Tela de Início')
    expect(iphone).toContain('Outros aparelhos')
    expect(iphone).toContain('Android')
    expect(iphone).not.toContain('só o <strong>Safari</strong> instala') // já está no Safari
    expect(primeiro(html({ aparelho: detectarAparelho(UA.android) }))).toBe('Android')
    expect(primeiro(html({ aparelho: detectarAparelho(UA.windows) }))).toBe('Computador')
  })

  it('iPhone fora do Safari: avisa que precisa ser o Safari e oferece copiar o endereço', () => {
    const h = html({ aparelho: detectarAparelho(UA.iphoneChrome) })
    expect(h).toContain('só o <strong>Safari</strong> instala o Finup')
    expect(h).toContain('Copiar https://teste1.finup.app.br')
  })

  it('já instalado (standalone): "O Finup já está instalado neste aparelho"', () => {
    const h = html({ aparelho: detectarAparelho(UA.android), instalado: true })
    expect(h).toContain('O Finup já está instalado neste aparelho.')
    expect(h).not.toContain('Outros aparelhos')
  })

  it('usa o endereço do ambiente (não o www)', () => {
    const h = html({ aparelho: detectarAparelho(UA.android) })
    expect(h).toContain('teste1.finup.app.br')
    expect(h).not.toContain('www.finup.app.br')
  })
})
