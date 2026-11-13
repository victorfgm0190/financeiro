// "HÁ UMA ATUALIZAÇÃO DO FINUP" — computador: janelinha no canto inferior direito; celular: faixa
// acima da barra de baixo. Estado e service worker em src/lib/atualizacao.js.
//   Atualizar agora: 1) envia TODAS as alterações pendentes e espera (sem rede ou erro → não atualiza
//   e explica; nada se perde); 2) SKIP_WAITING; 3) recarrega.
//   Mais tarde: volta em 4 h (ou na próxima abertura). Obrigatória: sem "Mais tarde", com o motivo.
// Espera: formulário/janela aberta ou campo em edição, tour/guia/jornada. Um aviso de cada vez
// (src/lib/filaDeAvisos.js — este passa na frente dos outros).
// TRABALHO EM ANDAMENTO (lib/trabalhoEmAndamento — importação em revisão, conciliação, formulário
// alterado…): o aviso diz o que seria perdido e oferece "Atualizar depois" (principal) e "Atualizar
// mesmo assim" (com confirmação). Vale também para a versão obrigatória: nunca derruba trabalho em
// andamento. Quando a tarefa termina (Confirmar / Cancelar), o aviso volta: "Pronto! Agora você pode
// atualizar o Finup."
import { useEffect, useState, useSyncExternalStore } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { getSessao } from '../../lib/api'
import { haModalAberto, campoEmEdicao } from '../../lib/recargaRemota'
import { linhasDoAviso, paraRecursos } from '../../lib/novidades'
import { useRecursosLiberados } from '../../hooks/useStatusSugestoesIa'
import { assinarAtualizacao, estadoAtualizacao, atualizacaoParaAvisar, adiarAtualizacao, aplicarAtualizacao, textoSemRede, textoErroEnvio } from '../../lib/atualizacao'
import { assinarBoasVindas, estadoBoasVindas } from '../../lib/boasVindasApi'
import { useTourAtivo } from '../BoasVindas/tourEstado'
import { usePassoJornadaAtivo } from '../BoasVindas/jornadaEstado'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useVezDoAviso } from '../../hooks/useVezDoAviso'
import { useTrabalhosEmAndamento } from '../../hooks/useTrabalhoEmAndamento'
import { fraseDosTrabalhos, permitirSaida } from '../../lib/trabalhoEmAndamento'

// A tela está ocupada (formulário/janela aberta ou campo sendo digitado)? Conferido de tempos em tempos.
export const INTERVALO_TELA_OCUPADA_MS = 1500
function useTelaOcupada(ativo, intervalo) {
  const [ocupada, setOcupada] = useState(() => haModalAberto() || campoEmEdicao())
  useEffect(() => {
    if (!ativo) return
    const ver = () => setOcupada(haModalAberto() || campoEmEdicao())
    ver()
    const t = setInterval(ver, intervalo)
    return () => clearInterval(t)
  }, [ativo, intervalo])
  return ocupada
}

function useBoasVindasAberto() {
  const [aberto, setAberto] = useState(() => !!estadoBoasVindas()?.tourAberto)
  useEffect(() => assinarBoasVindas(e => setAberto(!!e?.tourAberto)), [])
  return aberto
}

export default function AvisoAtualizacao({ intervalo = INTERVALO_TELA_OCUPADA_MS }) {
  const estado = useSyncExternalStore(assinarAtualizacao, estadoAtualizacao, estadoAtualizacao)
  const [agora, setAgora] = useState(() => Date.now())
  const { enviarAgora } = useApp()
  const isMobile = useIsMobile()
  const tour = useTourAtivo()
  const passo = usePassoJornadaAtivo()
  const boasVindas = useBoasVindasAberto()
  const [etapa, setEtapa] = useState(null) // null | 'enviando' | 'atualizando'
  const [erro, setErro] = useState('')
  const trabalhos = useTrabalhosEmAndamento()
  const { recursos } = useRecursosLiberados()
  const comTrabalho = trabalhos.length > 0
  const [adiadoPorTrabalho, setAdiadoPorTrabalho] = useState(false) // "Atualizar depois": até a tarefa terminar
  const [teveTrabalho, setTeveTrabalho] = useState(false)           // para dizer "Pronto!" quando terminar
  const [confirmando, setConfirmando] = useState(false)             // "Atualizar mesmo assim" → confirmação
  // Tarefa terminou: o aviso volta sozinho ("Pronto!"). Ajuste durante o render (sem efeito).
  const [comTrabalhoAntes, setComTrabalhoAntes] = useState(comTrabalho)
  if (comTrabalho && estado.pronta && !teveTrabalho) setTeveTrabalho(true)
  if (comTrabalhoAntes !== comTrabalho) {
    setComTrabalhoAntes(comTrabalho)
    if (!comTrabalho) { setAdiadoPorTrabalho(false); setConfirmando(false) }
  }

  const quer = atualizacaoParaAvisar(estado, agora)
  useVezDoAviso('atualizacao', quer)
  const ocupada = useTelaOcupada(quer && !etapa, intervalo)

  // "Mais tarde" adiado: acorda quando o prazo acabar.
  useEffect(() => {
    if (!estado.pronta || quer) return
    const falta = Math.max(1000, estado.adiadaAte - Date.now())
    const t = setTimeout(() => setAgora(Date.now()), Math.min(falta, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [estado.pronta, estado.adiadaAte, quer])

  // Durante o envio a tela pode "ocupar" (o próprio botão tem foco): o aviso continua.
  const esperando = !etapa && (ocupada || !!tour || !!passo || boasVindas)
  if (!quer || esperando || (comTrabalho && adiadoPorTrabalho)) return null

  const admin = getSessao()?.nivel === 'admin'
  // Novidade de recurso contratado só entra para quem tem o recurso liberado.
  const linhas = linhasDoAviso(paraRecursos(estado.novas, recursos), { admin })
  const obrigatoria = estado.obrigatoria
  const titulo = estado.outraJanela ? 'O Finup foi atualizado' : obrigatoria ? 'Atualização necessária do Finup' : 'Há uma atualização do Finup'

  const atualizar = async () => {
    setErro('')
    // "Atualizar mesmo assim" (já confirmado): a recarga não pergunta de novo no navegador.
    if (comTrabalho) permitirSaida()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setErro(textoSemRede); return }
    setEtapa('enviando')
    let r
    try { r = await enviarAgora() } catch (e) { r = { ok: false, erro: e?.message } }
    if (!r?.ok) {
      setEtapa(null)
      setErro(typeof navigator !== 'undefined' && navigator.onLine === false ? textoSemRede : textoErroEnvio(r?.erro))
      return
    }
    setEtapa('atualizando')
    await aplicarAtualizacao()
  }

  const ocupado = !!etapa
  const classe = isMobile
    ? 'fixed z-40 left-3 right-3 bottom-20 card shadow-2xl border border-primary/50 p-3 space-y-2'
    : 'fixed z-40 right-4 bottom-4 w-[22rem] max-w-[calc(100vw-2rem)] card shadow-2xl border border-primary/50 p-3 space-y-2'

  return (
    <div role="alertdialog" aria-labelledby="aviso-atualizacao-titulo" data-testid="aviso-atualizacao"
      data-help-id="atualizacao.aviso" data-formato={isMobile ? 'faixa' : 'janela'} data-obrigatoria={obrigatoria ? 'sim' : undefined}
      className={classe}>
      <div className="flex items-start gap-2">
        {obrigatoria ? <AlertTriangle size={16} className="text-aviso shrink-0 mt-0.5" aria-hidden="true" /> : <RefreshCw size={16} className="text-primary-fg shrink-0 mt-0.5" aria-hidden="true" />}
        <div className="flex-1 min-w-0">
          <p id="aviso-atualizacao-titulo" className="text-sm font-medium text-texto-1">{titulo}</p>
          {obrigatoria && <p className="text-xs text-texto-2 mt-0.5">{estado.motivo}</p>}
          {comTrabalho ? (
            <p className="text-xs text-texto-1 mt-1" data-testid="aviso-atualizacao-trabalho">
              Você está no meio de {fraseDosTrabalhos(trabalhos)}. Se atualizar agora, o que não foi confirmado será perdido. Termine (Confirmar ou Cancelar) e atualize depois.
            </p>
          ) : teveTrabalho ? (
            <p className="text-xs text-texto-1 mt-0.5 font-medium" data-testid="aviso-atualizacao-pronto">Pronto! Agora você pode atualizar o Finup.</p>
          ) : !obrigatoria && <p className="text-xs text-texto-2 mt-0.5">Deseja atualizar agora?</p>}
        </div>
      </div>
      {linhas.length > 0 && !estado.outraJanela && (
        <ul className="list-disc pl-5 space-y-0.5 text-xs text-texto-2" data-testid="aviso-atualizacao-novidades">
          {linhas.map(l => <li key={l}>{l}</li>)}
        </ul>
      )}
      {erro && <p role="alert" className="text-xs text-texto-1 bg-aviso/10 border border-aviso/40 rounded-lg px-2 py-1.5">{erro}</p>}
      {etapa === 'enviando' && <p className="text-xs text-texto-2" role="status">Enviando suas alterações antes de atualizar…</p>}
      {etapa === 'atualizando' && <p className="text-xs text-texto-2" role="status">Atualizando…</p>}
      {comTrabalho && confirmando && (
        <p role="alert" className="text-xs text-texto-1 bg-aviso/10 border border-aviso/40 rounded-lg px-2 py-1.5" data-testid="aviso-atualizacao-confirmar">
          Tem certeza? Você vai perder o que não foi confirmado ({fraseDosTrabalhos(trabalhos)}).
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 justify-end">
        {comTrabalho ? (
          confirmando ? (
            <>
              <button type="button" className="btn-secondary text-xs py-1.5" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</button>
              <button type="button" className="btn-secondary text-xs py-1.5 !text-perigo" disabled={ocupado} onClick={atualizar}>Sim, atualizar mesmo assim</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary text-xs py-1.5" disabled={ocupado} onClick={() => setConfirmando(true)}>Atualizar mesmo assim</button>
              <button type="button" className="btn-primary text-xs py-1.5" disabled={ocupado} onClick={() => setAdiadoPorTrabalho(true)}>Atualizar depois</button>
            </>
          )
        ) : (
          <>
            {!obrigatoria && (
              <button type="button" className="btn-secondary text-xs py-1.5" disabled={ocupado} onClick={() => adiarAtualizacao()}>Mais tarde</button>
            )}
            <button type="button" className="btn-primary text-xs py-1.5 inline-flex items-center gap-1.5" disabled={ocupado} onClick={atualizar}>
              <RefreshCw size={13} aria-hidden="true" /> {estado.outraJanela ? 'Recarregar agora' : 'Atualizar agora'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
