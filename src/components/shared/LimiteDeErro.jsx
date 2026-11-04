import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Error boundary: um erro de tela dentro de `children` mostra o aviso no lugar daquela parte, em vez
// de derrubar o app inteiro (tela branca). O erro vai para o console com o nome da parte.
//   nome: identifica a parte no console; chaveReinicio: mudou → tenta renderizar de novo.
export default class LimiteDeErro extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null, chave: props.chaveReinicio }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  static getDerivedStateFromProps(props, state) {
    return props.chaveReinicio !== state.chave ? { erro: null, chave: props.chaveReinicio } : null
  }

  componentDidCatch(erro, info) {
    console.error(`[tela] erro em ${this.props.nome || 'parte da tela'}:`, erro, info?.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div role="alert" className="p-4 rounded-lg bg-surface-2/60 text-sm space-y-2">
        <p className="flex items-center gap-2 text-texto-1 font-semibold">
          <AlertTriangle size={16} className="text-aviso" /> Não foi possível abrir esta parte — recarregue.
        </p>
        <p className="text-xs text-texto-3">O restante do app continua funcionando.</p>
        <button type="button" className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5" onClick={() => window.location.reload()}>
          <RefreshCw size={12} /> Recarregar
        </button>
      </div>
    )
  }
}
