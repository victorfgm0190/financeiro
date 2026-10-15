import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Vitest: o 1º `new PGlite()` de cada arquivo (Postgres em WASM) leva vários segundos quando os
  // arquivos rodam em paralelo — o padrão de 10s estourava no beforeEach de forma intermitente.
  test: { hookTimeout: 30_000 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Finup',
        short_name: 'Finup',
        description: 'Gestão financeira pessoal',
        lang: 'pt-BR',
        // = --color-page do tema escuro (padrão). O manifest é estático; a barra acompanha o
        // tema efetivo via <meta name="theme-color"> (index.html + useTheme).
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
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
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
})
