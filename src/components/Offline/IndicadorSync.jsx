import { useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudOff, Send, RefreshCw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { textoIndicador } from '../../lib/offlineUi'
import PainelPendencias from './PainelPendencias'

// "N alterações aguardando envio" / "Tudo sincronizado" / "Sem internet" / "Servidor sem resposta".
// Clicar abre o painel. Na barra lateral, com pendentes, há o botão "Enviar agora": reconecta se
// preciso, envia e mostra o erro REAL quando não dá.
// `faixa`: versão do celular (largura toda, só aparece quando há algo a dizer).
export default function IndicadorSync({ faixa = false }) {
  const { filaPendentes, filaErros = [], dbStatus, enviarAgora } = useApp()
  const [aberto, setAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(null)
  const online = dbStatus !== 'local'
  const servidor = dbStatus === 'servidor'
  const pendentes = filaPendentes.length
  const erros = filaErros.length
  if (dbStatus === 'connecting' && !pendentes) return null
  // Celular: só com pendência (o "Sem internet" já está na faixa do topo).
  if (faixa && !pendentes) return null
  const texto = textoIndicador({ online, pendentes, erros, servidor })
  const Icone = erros ? AlertTriangle : !online ? CloudOff : servidor ? RefreshCw : pendentes ? Send : CheckCircle2
  const cor = erros ? 'text-perigo' : !online || servidor || pendentes ? 'text-aviso' : 'text-texto-3'
  const podeEnviarAgora = !faixa && pendentes > erros && typeof enviarAgora === 'function'

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    try {
      const r = await enviarAgora()
      if (!r?.ok) setErro(r?.erro || 'Não foi possível enviar')
    } catch (err) {
      setErro(err?.message || String(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={faixa
          ? `w-full flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs font-medium ${erros ? 'bg-perigo-bg' : 'bg-aviso/10'} ${cor}`
          : `flex items-center gap-1.5 text-[11px] ${cor} hover:text-texto-1 min-h-[24px] text-left`}
        title="Ver sincronização"
      >
        <Icone size={faixa ? 14 : 12} className="shrink-0" />
        <span className={faixa ? 'truncate' : ''}>{texto}</span>
      </button>
      {podeEnviarAgora && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="flex items-center gap-1.5 text-[11px] font-medium text-primary-fg hover:underline disabled:opacity-50 min-h-[24px]"
          >
            <Send size={12} className="shrink-0" /> {enviando ? 'Enviando…' : 'Enviar agora'}
          </button>
          {erro && <p role="alert" className="text-[11px] text-perigo break-words">Não enviou: {erro}</p>}
        </div>
      )}
      <PainelPendencias open={aberto} onClose={() => setAberto(false)} />
    </>
  )
}
