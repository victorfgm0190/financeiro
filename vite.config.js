import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import process from 'node:process'
import { scriptNavegadorSemSuporte } from './src/lib/ambienteNavegador.js'

// Hash curto do commit (rodapé do menu lateral). Vercel expõe VERCEL_GIT_COMMIT_SHA; local, git.
const commitCurto = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'dev' }
})()

// Testes de tela (projeto 'telas' do Vitest); o resto, fora de api/, é lógica.
const PASTAS_DE_TELA = ['src/components', 'src/pages', 'src/mobile']

export default defineConfig({
  // Vitest em três projetos (comandos em docs/testes.md):
  //   npm run test:logica → 'logica' + 'api'    npm run test:telas → 'telas'    npm test → os dois em sequência
  // - logica: tudo fora de api/ e das telas (src/lib, hooks, context, help, scripts…). Limite padrão (5 s).
  // - api: sobe um Postgres em WASM (PGlite), às vezes um por teste. Roda DEPOIS da lógica (groupOrder),
  //   com poucos workers e limites maiores; sozinho, o teste mais lento leva ~12 s.
  // - telas: src/components, src/pages, src/mobile (jsdom + React). Montar uma tela grande leva 1–4 s
  //   sozinho; com todos os núcleos ocupados passava dos 5 s (falso alarme). Limite de 15 s e workers
  //   limitados só aqui.
  test: {
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'logica', sequence: { groupOrder: 0 }, maxWorkers: 6,
          exclude: [...configDefaults.exclude, 'api/**', ...PASTAS_DE_TELA.map(p => `${p}/**`)],
        },
      },
      {
        extends: true,
        test: {
          name: 'api', include: ['api/**/*.test.js'], sequence: { groupOrder: 1 },
          maxWorkers: 4, testTimeout: 30_000, hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'telas', include: PASTAS_DE_TELA.map(p => `${p}/**/*.test.{js,jsx}`), sequence: { groupOrder: 2 },
          maxWorkers: 4, testTimeout: 15_000,
        },
      },
    ],
  },
  define: { 'import.meta.env.VITE_APP_COMMIT': JSON.stringify(commitCurto) },
  plugins: [
    // Navegador sem o mínimo (Internet Explorer ou muito antigo): um <script> comum, o primeiro do
    // <head>, troca a página pela mensagem com Edge/Chrome antes de o app carregar. O texto vem de
    // src/lib/ambienteNavegador.js (fonte única, com testes) no lugar do marcador do index.html.
    {
      name: 'finup-navegador-sem-suporte',
      transformIndexHtml: (html) => html.replace('<!-- finup:navegador-sem-suporte -->', `<script>${scriptNavegadorSemSuporte()}</script>`),
    },
    react(),
    tailwindcss(),
    VitePWA({
      // Atualização automática: o SW novo assume na hora (skipWaiting + clientsClaim) e o
      // registerSW de src/main.jsx recarrega a página quando ele toma o controle — a versão nova
      // vale já no carregamento seguinte ao deploy, sem servir os assets antigos do precache.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.{png,svg}'],
      manifest: {
        name: 'Finup',
        short_name: 'Finup',
        description: 'Gestão financeira pessoal',
        lang: 'pt-BR',
        // Cor da marca (= fundo do símbolo em public/brand/finup-logo.svg): splash do Android e barra
        // antes de a página carregar. Com a página aberta, a barra acompanha o tema efetivo via
        // <meta name="theme-color"> (index.html + useTheme).
        theme_color: '#0F6E56',
        background_color: '#0F6E56',
        display: 'standalone',
        orientation: 'portrait',
        // RELATIVOS de propósito: instalar a partir de <sigla>.finup.app.br abre aquele ambiente (o
        // www abre o www). id '/' = o mesmo que o navegador já calculava pelo start_url, então o app
        // já instalado continua sendo o mesmo.
        id: '/',
        start_url: '/',
        scope: '/',
        // Gerados por scripts/gerar-icones.mjs a partir da logo oficial (só o símbolo).
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // O bundle principal passou de 2 MiB, que é o teto PADRÃO do workbox para precache — e
        // o vite-plugin-pwa trata isso como ERRO de build, não como aviso: `npm run build`
        // passava a falhar com PLUGIN_ERROR por causa de alguns KB a mais.
        //
        // Elevar o teto MANTÉM o comportamento que o app já tinha (o bundle vinha sendo
        // precacheado inteiro, a 2.08 MiB); o padrão é que passou a excluí-lo. Sem isso o app
        // deixaria de abrir offline — que é o motivo de existir o service worker aqui.
        //
        // A saída de verdade é code splitting (o próprio build avisa). Enquanto isso não é
        // feito, este teto evita que o build quebre a cada poucos KB de código novo.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 08/11: 4 MiB estourou com o help de campo (bundle ~4,2 MB)
      },
    }),
  ],
})
