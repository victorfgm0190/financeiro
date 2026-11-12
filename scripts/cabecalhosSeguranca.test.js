import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'
import { hashesDosScriptsEmbutidos } from './_cspHashes.js'

// Auditoria 11/2026, item 6 (P1): cabeçalhos de segurança do vercel.json. A CSP libera só os scripts
// do próprio site e os DOIS scripts embutidos do index.html (anti-flash de tema e aviso de navegador
// sem suporte), por hash. Se um deles mudar, este teste falha: atualize os hashes no vercel.json com
// os valores que ele mostra (senão o navegador bloqueia o script e o app abre sem tema/sem o aviso).

const raiz = fileURLToPath(new URL('../', import.meta.url))
const vercel = JSON.parse(readFileSync(raiz + 'vercel.json', 'utf8'))
const regra = (source) => vercel.headers.find(h => h.source === source)
const cabecalho = (source, key) => regra(source)?.headers.find(h => h.key === key)?.value
const GLOBAL = '/(.*)'
const diretivas = () => Object.fromEntries(cabecalho(GLOBAL, 'Content-Security-Policy').split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))

describe('vercel.json: cabeçalhos em todas as rotas', () => {
  it('anti-clickjacking, nosniff e Referrer-Policy', () => {
    expect(cabecalho(GLOBAL, 'X-Frame-Options')).toBe('DENY')
    expect(diretivas()['frame-ancestors']).toEqual(["'none'"])
    expect(cabecalho(GLOBAL, 'X-Content-Type-Options')).toBe('nosniff')
    expect(cabecalho(GLOBAL, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('CSP: só o próprio site (API, service worker, manifesto); blob/data para anexos, áudio e downloads', () => {
    const d = diretivas()
    expect(d['default-src']).toEqual(["'self'"])
    expect(d['connect-src']).toEqual(["'self'"]) // IA, Resend, BCB e Neon só pelo /api
    expect(d['worker-src']).toEqual(["'self'"]) // PWA
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
    expect(d['media-src']).toEqual(expect.arrayContaining(['blob:']))
    expect(d['script-src']).not.toContain("'unsafe-inline'")
    expect(d['script-src']).not.toContain("'unsafe-eval'")
  })

  it('os scripts embutidos do index.html (como o build os gera) estão liberados por hash', async () => {
    const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, raiz + 'vite.config.js')
    const plugin = config.plugins.flat(Infinity).find(p => p?.name === 'finup-navegador-sem-suporte')
    const html = plugin.transformIndexHtml(readFileSync(raiz + 'index.html', 'utf8'))
    const hashes = hashesDosScriptsEmbutidos(html)
    expect(hashes).toHaveLength(2)
    expect(diretivas()['script-src'].filter(v => v.startsWith("'sha256-")).sort()).toEqual([...hashes].sort())
  }, 30_000)

  it('mantém os cabeçalhos que já existiam (cache do versao.json/sw.js/index.html; no-referrer na definição de senha) depois da regra geral', () => {
    for (const s of ['/versao.json', '/sw.js', '/index.html', '/manifest.webmanifest', '/registerSW.js']) {
      expect(cabecalho(s, 'Cache-Control')).toBe('public, max-age=0, must-revalidate')
    }
    expect(cabecalho('/definir-senha', 'Referrer-Policy')).toBe('no-referrer')
    const ordem = vercel.headers.map(h => h.source)
    expect(ordem.indexOf(GLOBAL)).toBeLessThan(ordem.indexOf('/definir-senha'))
  })

  it('Permissions-Policy: microfone só do próprio site (Assistente); localização desligada', () => {
    const p = cabecalho(GLOBAL, 'Permissions-Policy')
    expect(p).toContain('microphone=(self)')
    expect(p).toContain('geolocation=()')
  })
})
