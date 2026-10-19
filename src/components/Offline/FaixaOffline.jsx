import { useState } from 'react'
import { CloudOff, Smartphone, AlertTriangle, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { ehIphoneSemInstalar } from '../../lib/offlineUi'

// Faixas do topo: sem internet, falha ao guardar no aparelho e iPhone no Safari sem o app instalado.
export default function FaixaOffline() {
  const { dbStatus, erroArmazenamento } = useApp()
  const [safariFechado, setSafariFechado] = useState(() => {
    try { return sessionStorage.getItem('finup_aviso_safari') === '1' } catch { return false }
  })
  const safari = ehIphoneSemInstalar() && !safariFechado
  if (dbStatus !== 'local' && !erroArmazenamento && !safari) return null

  return (
    <div className="space-y-2 mb-3">
      {dbStatus === 'local' && (
        <Faixa icone={CloudOff}>
          Sem internet — suas alterações ficam no aparelho e serão enviadas quando a conexão voltar.
        </Faixa>
      )}
      {erroArmazenamento && (
        <Faixa icone={AlertTriangle} perigo>
          Não foi possível guardar no aparelho{erroArmazenamento === 'quota' ? ' (armazenamento cheio)' : ''}. Não feche o app até as alterações serem enviadas.
        </Faixa>
      )}
      {safari && (
        <Faixa icone={Smartphone} onFechar={() => { setSafariFechado(true); try { sessionStorage.setItem('finup_aviso_safari', '1') } catch { /* sem storage */ } }}>
          Você está no Safari, não no app instalado: o iPhone pode apagar os dados guardados após alguns dias sem uso.
          {' '}<a href="/instalar" className="underline">Instale o Finup</a> (Compartilhar → Adicionar à Tela de Início).
        </Faixa>
      )}
    </div>
  )
}

function Faixa({ icone: Icone, perigo = false, onFechar, children }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${perigo ? 'bg-perigo-bg text-perigo' : 'bg-aviso/10 text-aviso'}`} role="status">
      <Icone size={14} className="shrink-0 mt-0.5" />
      <span className="flex-1">{children}</span>
      {onFechar && (
        <button type="button" onClick={onFechar} aria-label="Fechar aviso" className="shrink-0 opacity-70 hover:opacity-100"><X size={14} /></button>
      )}
    </div>
  )
}
