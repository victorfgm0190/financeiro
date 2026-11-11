// Configurações → Geral → Usar como aplicativo: o estado deste computador (instalado / não instalado /
// navegador sem instalação), o mesmo botão e a mesma explicação do aviso, e "Mostrar o aviso de novo"
// para quem escolheu "Não mostrar mais". Vale para este aparelho (src/lib/avisoAplicativo.js).
import { useState, useSyncExternalStore } from 'react'
import { AppWindow, CheckCircle2 } from 'lucide-react'
import { ExplicacaoUsarComoApp } from '../Layout/UsarComoApp'
import { useAmbienteNavegador } from '../../hooks/useAmbienteNavegador'
import { useIsMobile } from '../../hooks/useIsMobile'
import { podeFazerBackup } from '../../hooks/useBackupLocal'
import { lerAvisoApp, aoMudarAvisoApp, reativarAvisoApp, rotuloSituacaoApp, textoResultadoInstalacao } from '../../lib/avisoAplicativo'

const lerNunca = () => !!lerAvisoApp().nunca

export default function UsarComoAppPanel() {
  const isMobile = useIsMobile()
  const { situacao, instalar } = useAmbienteNavegador()
  const nunca = useSyncExternalStore(aoMudarAvisoApp, lerNunca, () => false)
  const [resultado, setResultado] = useState('')
  const [reativado, setReativado] = useState(false)

  return (
    <div className="card space-y-3" data-help-id="aplicativo.usar">
      <h2 className="text-sm font-semibold text-texto-1 flex items-center gap-2"><AppWindow size={14} /> Usar como aplicativo</h2>
      {isMobile ? (
        <p className="text-xs text-texto-2">
          No celular, o Finup é instalado pela tela de início. Veja o passo a passo em{' '}
          <a href="/instalar" className="text-primary-fg underline underline-offset-2">Instalar no celular</a>.
        </p>
      ) : (
        <>
          <p data-guia="settings:app-computador.situacao" data-testid="usar-como-app-situacao"
            className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${situacao.instalado ? 'text-texto-1 bg-primary/10 border border-primary/30' : 'text-texto-2 bg-surface-2/60'}`}>
            {situacao.instalado && <CheckCircle2 size={13} className="text-receita shrink-0" />}
            {rotuloSituacaoApp(situacao)}
          </p>
          <ExplicacaoUsarComoApp situacao={situacao} comBackup={podeFazerBackup()} resultado={resultado}
            onInstalar={async () => setResultado(textoResultadoInstalacao(await instalar()))} />
          {nunca && !situacao.instalado && (
            <div className="border-t border-borda pt-3 space-y-1">
              <p className="text-xs text-texto-3">Você escolheu não ver mais o aviso “Use o Finup como aplicativo” neste computador.</p>
              <button type="button" data-guia="settings:app-computador.reativar" className="btn-secondary text-xs py-1"
                onClick={() => { reativarAvisoApp(); setReativado(true) }}>Mostrar o aviso de novo</button>
            </div>
          )}
          {reativado && !nunca && <p className="text-xs text-texto-2" role="status">Pronto: o aviso volta a aparecer neste computador.</p>}
        </>
      )}
    </div>
  )
}
