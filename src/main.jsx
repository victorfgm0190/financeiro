import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { capturarPedidoDeInstalacao } from './lib/instalacao'
import { iniciarServiceWorker, simularSePedido } from './lib/atualizacao'

// O Chrome oferece a instalação (PWA) antes da página montar: guarda o pedido para a /instalar.
if (!window.__finupSemSuporte) capturarPedidoDeInstalacao()

const iniciar = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Navegador sem o mínimo (Internet Explorer ou muito antigo): o <script> do index.html já trocou a
// página pela mensagem com Edge/Chrome (src/lib/ambienteNavegador.js) — o app não monta.
if (window.__finupSemSuporte) {
  // nada a fazer
} else if (import.meta.env.DEV) {
  // Modo dev sem banco (src/dev/modoDev.js): instala ANTES do React montar, para bloquear /api e
  // servir dados fictícios desde o primeiro render. Só existe em desenvolvimento — o Vite remove
  // este ramo e o módulo do build de produção.
  import('./dev/modoDev.js')
    .then(m => m.instalarModoDev())
    .catch(err => console.error('[modo dev]', err))
    .finally(iniciar)
  // Help de campo: campo sem data-help-id / id sem conteúdo → aviso no console (npm run help:check).
  import('./help/avisoDev.js').then(m => m.instalarAvisoHelpDev()).catch(() => {})
} else {
  iniciar()
  // Service worker em modo 'prompt': versão nova fica em espera e vira o aviso "Há uma atualização"
  // (src/lib/atualizacao.js) — nunca recarrega sozinho no meio do uso.
  import('virtual:pwa-register')
    .then(({ registerSW }) => iniciarServiceWorker(registerSW))
    .catch(err => console.error('[pwa]', err))
}
// Teste no teste1 (e em dev): ?simular-atualizacao mostra o aviso sem precisar de um deploy novo.
if (!window.__finupSemSuporte) simularSePedido()
