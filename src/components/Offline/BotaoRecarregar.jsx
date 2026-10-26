import { RefreshCw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import AtualizadoHa from './AtualizadoHa'

// Desktop: 🔄 discreto no cabeçalho — envia a fila e recarrega do banco (mesmo caminho do puxar).
export default function BotaoRecarregar() {
  const { recarregarDados, recarregando, dbStatus } = useApp()
  if (dbStatus !== 'connected') return null
  return (
    <div className="hidden md:flex items-center gap-1">
      <AtualizadoHa className="text-[11px] text-texto-3 whitespace-nowrap" />
      <button
        type="button"
        onClick={() => recarregarDados()}
        disabled={recarregando}
        title={recarregando ? 'Atualizando…' : 'Atualizar dados'}
        aria-label="Atualizar dados"
        className="shrink-0 p-2 rounded-lg text-texto-3 hover:text-texto-1 hover:bg-surface-hover transition-colors disabled:opacity-60"
      >
        <RefreshCw size={16} className={recarregando ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
