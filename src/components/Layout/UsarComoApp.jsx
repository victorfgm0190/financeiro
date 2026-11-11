// "USE O FINUP COMO APLICATIVO" (computador): a explicação (compartilhada com Configurações → Geral →
// Usar como aplicativo) e o aviso discreto que aparece sozinho. Regras de quando aparece em
// src/lib/avisoAplicativo.js; o que o navegador consegue fazer em src/lib/ambienteNavegador.js.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppWindow, Download, X } from 'lucide-react'
import { LINK_EDGE, LINK_CHROME } from '../../lib/ambienteNavegador'
import { detectarAparelho } from '../../lib/instalacao'
import { lerAvisoApp, aoMudarAvisoApp, deveMostrarAvisoApp, registrarAvisoMostrado, naoMostrarMaisAvisoApp, textoResultadoInstalacao, BENEFICIO_APP } from '../../lib/avisoAplicativo'
import { assinarBoasVindas, estadoBoasVindas } from '../../lib/boasVindasApi'
import { useTourAtivo } from '../BoasVindas/tourEstado'
import { usePassoJornadaAtivo } from '../BoasVindas/jornadaEstado'
import { useAtalhos } from '../../context/atalhosHooks'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useAmbienteNavegador } from '../../hooks/useAmbienteNavegador'
import { podeFazerBackup } from '../../hooks/useBackupLocal'

function LinksNavegadores() {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      <a href={LINK_EDGE} target="_blank" rel="noopener noreferrer" className="text-primary-fg underline underline-offset-2">Baixar o Microsoft Edge</a>
      <a href={LINK_CHROME} target="_blank" rel="noopener noreferrer" className="text-primary-fg underline underline-offset-2">Baixar o Google Chrome</a>
    </span>
  )
}

// O que fazer neste navegador. `comBackup`: a pessoa usa o backup ao sair (cita a pasta).
export function ExplicacaoUsarComoApp({ situacao, comBackup = false, onInstalar, resultado }) {
  const semPasta = comBackup && !situacao.gravaEmPasta
  const backupDownloads = 'O backup ao sair vai para a pasta Downloads, e não para a pasta que você escolher.'
  return (
    <div className="space-y-2 text-xs text-texto-2" data-testid="usar-como-app-explicacao" data-modo={situacao.modo}>
      {situacao.modo === 'instalado' && <p>O Finup está aberto como aplicativo neste computador.</p>}
      {situacao.modo === 'instalavel' && (
        <>
          <p>{BENEFICIO_APP}</p>
          <button type="button" data-guia="settings:app-computador.instalar" className="btn-primary text-xs py-1.5 inline-flex items-center gap-1.5" onClick={onInstalar}>
            <Download size={13} /> Instalar o Finup
          </button>
        </>
      )}
      {situacao.modo === 'pelo-menu' && (
        <>
          <p>{BENEFICIO_APP}</p>
          <p>Para instalar, clique no ícone de instalar na barra de endereço ou, no menu do navegador, em “Instalar Finup” (no Edge: Aplicativos → Instalar este site como aplicativo).</p>
          <p>Se o Finup já está instalado neste computador, abra-o pelo ícone dele.</p>
        </>
      )}
      {situacao.modo === 'safari-mac' && (
        <>
          <p>No Safari, use o menu <strong>Arquivo → Adicionar ao Dock</strong> para abrir o Finup na própria janela.</p>
          {semPasta && <p>{backupDownloads} Para guardar o backup numa pasta, use o Google Chrome ou o Microsoft Edge.</p>}
          {semPasta && <LinksNavegadores />}
        </>
      )}
      {situacao.modo === 'sem-instalacao' && (
        <>
          <p>Este navegador não instala o Finup como aplicativo.{semPasta ? ` ${backupDownloads}` : ''}</p>
          <p>Recomendamos o Microsoft Edge (já vem no Windows) ou o Google Chrome.</p>
          <LinksNavegadores />
        </>
      )}
      {resultado && <p className="text-texto-1" role="status">{resultado}</p>}
    </div>
  )
}

const estadoAviso = { assinar: aoMudarAvisoApp, ler: () => JSON.stringify(lerAvisoApp()) }
function usePrefsAviso() {
  return JSON.parse(useSyncExternalStore(estadoAviso.assinar, estadoAviso.ler, () => '{}'))
}
function useBoasVindas() {
  const [e, setE] = useState(estadoBoasVindas)
  useEffect(() => assinarBoasVindas(setE), [])
  return e
}

// Espera a tela assentar antes de aparecer (e nunca junto com algo que abriu ao entrar).
export const ESPERA_AVISO_APP_MS = 5000

export default function AvisoUsarComoApp({ espera = ESPERA_AVISO_APP_MS }) {
  const isMobile = useIsMobile()
  const { situacao, instalar } = useAmbienteNavegador()
  const prefs = usePrefsAviso()
  const bv = useBoasVindas()
  const tour = useTourAtivo()
  const passo = usePassoJornadaAtivo()
  const atalhos = useAtalhos()
  const [visivel, setVisivel] = useState(false)
  const [resultado, setResultado] = useState('')

  const computador = !isMobile && typeof navigator !== 'undefined'
    && detectarAparelho(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints }).tipo === 'computador'
  // Não empilha: nada de aviso enquanto as boas-vindas não foram vistas (ou estão abertas), com tour,
  // tarefa guiada ou passo da jornada em andamento, ou com o aviso dos atalhos na tela.
  const bloqueado = !bv || !!bv.tourAberto || (!bv.tourVistoEm && bv.guiasLigados !== false)
    || !!tour || !!passo || !!atalhos?.avisoMigracao?.length
  const pode = deveMostrarAvisoApp({ prefs, situacao, computador, bloqueado })

  useEffect(() => {
    if (!pode || visivel) return
    const t = setTimeout(() => {
      // Janela aberta (modal, início do mês…): fica para a próxima.
      if (document.querySelector('[role="dialog"]')) return
      registrarAvisoMostrado()
      setVisivel(true)
    }, espera)
    return () => clearTimeout(t)
  }, [pode, visivel, espera])

  // Instalado (appinstalled / janela própria): some e não volta.
  const instalado = situacao.instalado || !!prefs.instaladoEm
  if (!visivel || !computador || instalado || prefs.nunca || bloqueado) return null

  const fechar = () => setVisivel(false)
  const naoMostrar = () => { naoMostrarMaisAvisoApp(); setVisivel(false) }
  const aoInstalar = async () => setResultado(textoResultadoInstalacao(await instalar()))

  return (
    <div role="status" data-testid="aviso-usar-como-app" data-help-id="aplicativo.aviso"
      className="fixed z-30 left-4 bottom-4 w-[22rem] max-w-[calc(100vw-2rem)] card shadow-2xl border border-borda-forte p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AppWindow size={16} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" />
        <p className="flex-1 text-sm font-medium text-texto-1">
          {situacao.modo === 'sem-instalacao' || situacao.modo === 'safari-mac' ? 'Use o Finup num navegador recomendado' : 'Use o Finup como aplicativo'}
        </p>
        <button type="button" aria-label="Fechar o aviso" className="text-texto-3 hover:text-texto-1 p-1 -m-1" onClick={fechar}><X size={14} /></button>
      </div>
      <ExplicacaoUsarComoApp situacao={situacao} comBackup={podeFazerBackup()} onInstalar={aoInstalar} resultado={resultado} />
      <div className="flex flex-wrap gap-1.5 justify-end">
        <button type="button" className="btn-secondary text-xs py-1" onClick={fechar}>Agora não</button>
        <button type="button" className="btn-secondary text-xs py-1" onClick={naoMostrar}>Não mostrar mais</button>
      </div>
    </div>
  )
}
