// GUIA DA TELA — quando o TOUR de uma tela abre sozinho e o painel "Ver todas as funções".
//   • o tour abre sozinho na PRIMEIRA visita de cada tela/subtela com guia (até a pessoa concluir,
//     pular ou marcar "Não mostrar mais" — gravado no banco, guia_telas_ocultas);
//   • sair no meio trocando de tela não marca nada: abre de novo na próxima visita;
//   • nunca por cima das boas-vindas nem de outro tour; espera fechar;
//   • só depois de carregar o estado do banco (falhou → não abre sozinho; o "?" continua funcionando);
//   • interruptor geral desligado (guiasLigados false): nada abre sozinho e o "?" some.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ajudaDaTela } from '../../lib/ajudaTelas'
import { assinarBoasVindas, carregarBoasVindas, estadoBoasVindas, reativarGuia } from '../../lib/boasVindasApi'
import { useApp } from '../../context/AppContext'
import { iniciarTour, encerrarTourDaTela, tourAtivo, tourAutomaticoSuprimido, useTourAtivo } from './tourEstado'
import { telaConcluidaNaJornada } from '../../lib/onboardingSteps'

// Espera a tela desenhar antes de montar os passos do tour.
export const ESPERA_TOUR_MS = 700

export function useEstadoBoasVindas() {
  const [e, setE] = useState(estadoBoasVindas)
  useEffect(() => assinarBoasVindas(setE), [])
  return e
}

// `tela`: o guia desta tela (ou da subtela aberta). `primeiraTela` (opcional): um tour relacionado que
// pode ser aberto pelo menu (ex.: o geral de Configurações dentro de uma seção). Ele NÃO abre sozinho
// junto: só o tour da seção aberta; o geral abre sozinho na tela inicial de Configurações.
export function useGuiaTela(tela, { primeiraTela = null } = {}) {
  const { dbStatus } = useApp()
  const estado = useEstadoBoasVindas()
  const tour = useTourAtivo()
  const [lista, setLista] = useState(null) // tela cujo painel "Ver todas as funções" está aberto
  const temGuia = !!ajudaDaTela(tela)
  const ligados = estado ? estado.guiasLigados !== false : true
  const ocultas = estado?.guiasOcultos || []
  const oculto = ocultas.includes(tela)

  useEffect(() => { if (dbStatus === 'connected') carregarBoasVindas() }, [dbStatus])

  // Qual tour abriria sozinho agora: só o desta tela (ou subtela).
  const pronto = !!estado && ligados && !!estado.tourVistoEm && !estado.tourAberto && !tour
  // Tela já vista pela jornada ("Entendi"): não abre de novo sozinha.
  const pendente = (t) => !ocultas.includes(t) && !telaConcluidaNaJornada(t, estado?.progresso)
  const alvoAuto = pronto && temGuia && pendente(tela) ? tela : null
  const iniciado = useRef(null)
  useEffect(() => {
    if (!alvoAuto || iniciado.current === alvoAuto) return
    const t = setTimeout(() => {
      if (tourAtivo() || tourAutomaticoSuprimido()) return
      iniciado.current = alvoAuto
      iniciarTour(alvoAuto)
    }, ESPERA_TOUR_MS)
    return () => clearTimeout(t)
  }, [alvoAuto])
  // Trocou de tela: o tour desta (se aberto no meio) fecha sem marcar e volta na próxima visita.
  useEffect(() => () => {
    iniciado.current = null
    encerrarTourDaTela(tela)
    if (primeiraTela) encerrarTourDaTela(primeiraTela)
  }, [tela, primeiraTela])

  const abrirTour = useCallback((t = tela, opcoes) => { setLista(null); iniciarTour(t, opcoes) }, [tela])
  const abrirLista = useCallback(() => setLista(tela), [tela])
  const fecharLista = useCallback(() => setLista(null), [])
  const voltarAMostrar = useCallback(() => reativarGuia(tela), [tela])

  return { ligados, oculto, temGuia, listaAberta: lista === tela && temGuia, abrirTour, abrirLista, fecharLista, voltarAMostrar }
}
