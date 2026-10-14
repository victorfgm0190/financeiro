import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
}
