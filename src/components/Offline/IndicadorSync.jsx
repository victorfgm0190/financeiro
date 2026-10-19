import { useState } from 'react'
import { CheckCircle2, CloudOff, Send } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { textoIndicador } from '../../lib/offlineUi'
import PainelPendencias from './PainelPendencias'

// "N alterações aguardando envio" / "Tudo sincronizado" / "Sem internet". Clicar abre o painel.
// `faixa`: versão do celular (largura toda, só aparece quando há algo a dizer).
export default function IndicadorSync({ faixa = false }) {
  const { filaPendentes, dbStatus } = useApp()
  const [aberto, setAberto] = useState(false)
  const online = dbStatus !== 'local'
  const pendentes = filaPendentes.length
  if (dbStatus === 'connecting' && !pendentes) return null
  // Celular: só com pendência (o "Sem internet" já está na faixa do topo).
  if (faixa && !pendentes) return null
  const texto = textoIndicador({ online, pendentes })
  const Icone = !online ? CloudOff : pendentes ? Send : CheckCircle2
  const cor = !online || pendentes ? 'text-aviso' : 'text-texto-3'

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={faixa
          ? `w-full flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs font-medium bg-aviso/10 ${cor}`
          : `flex items-center gap-1.5 text-[11px] ${cor} hover:text-texto-1 min-h-[24px]`}
        title="Ver sincronização"
      >
        <Icone size={faixa ? 14 : 12} className="shrink-0" />
        <span className="truncate">{texto}</span>
      </button>
      <PainelPendencias open={aberto} onClose={() => setAberto(false)} />
    </>
  )
}
