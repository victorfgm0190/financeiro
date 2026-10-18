import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { capturarPedidoDeInstalacao } from './lib/instalacao'

// O Chrome oferece a instalação (PWA) antes da página montar: guarda o pedido para a /instalar.
capturarPedidoDeInstalacao()

const iniciar = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  // Modo dev sem banco (src/dev/modoDev.js): instala ANTES do React montar, para bloquear /api e
  // servir dados fictícios desde o primeiro render. Só existe em desenvolvimento — o Vite remove
  // este ramo e o módulo do build de produção.
  import('./dev/modoDev.js')
    .then(m => m.instalarModoDev())
    .catch(err => console.error('[modo dev]', err))
    .finally(iniciar)
} else {
  iniciar()
  // Service worker em autoUpdate: registra já no load e, quando um SW novo assume, recarrega a
  // página uma vez (versão nova sem assets antigos). Checa atualização a cada hora no app aberto.
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update(), 60 * 60 * 1000) },
    }))
    .catch(err => console.error('[pwa]', err))
}
