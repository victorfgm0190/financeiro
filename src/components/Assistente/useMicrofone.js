import { useCallback, useEffect, useRef, useState } from 'react'
import {
  podeGravar, escolherFormatoAudio, mensagemErroMicrofone, transcreverAudio, carregarDisponibilidadeTranscricao,
  transcricaoDisponivelAgora, MENSAGEM_SEM_TRANSCRICAO, MAX_GRAVACAO_SEG, AVISO_FIM_SEG, BITRATE_AUDIO, plataforma,
} from './gravadorAudio'

// Microfone do Assistente em DUAS CAMADAS, com a mesma interface nas duas:
//   1. "fala" — SpeechRecognition do navegador (pt-BR, transcrição ao vivo, gratuita). Chrome/Edge no
//      computador e no Android; Safari no Mac/iPhone só com Siri/Ditado ativado.
//   2. "gravação" — plano B: getUserMedia + MediaRecorder grava (até 2 min) e o servidor transcreve
//      (/api/transcrever-audio). Usada quando o navegador não tem a camada 1 (Firefox, alguns
//      Chromium) ou quando ela falha (serviço bloqueado, sem rede, idioma, nenhum resultado) — aí o
//      PRÓXIMO toque já grava (o Safari só libera o microfone dentro de um toque).
// Nas duas: bipe ao iniciar (agudo) e ao parar (grave); barras pelo volume da voz (AnalyserNode);
// para sozinho após ~2 s de silêncio (4 s de tolerância antes da primeira fala); botão de parar; ao
// terminar, as tracks param (o ícone de microfone do sistema apaga).
// onTexto(final, provisorio): texto final acumulado nesta gravação e o trecho ainda provisório.
//
// Regras do iOS (Safari e app instalado):
//   • rec.start(), getUserMedia e o desbloqueio do áudio rodam DENTRO do toque, sem await antes;
//   • um AudioContext só, criado e resumido no primeiro toque, e desbloqueado com um buffer mudo;
//   • navigator.audioSession = 'play-and-record' (Safari 16.4+): o bipe toca junto com a gravação;
//   • camada 1: SEM getUserMedia (disputa o microfone com o reconhecimento) — `pulso` = animação;
//     continuous = false (o modo contínuo encerra sem entregar resultado).
//
// Log de diagnóstico do microfone ("[mic]" no console) — desligado; ligue só para depurar no aparelho.
const LOG = false
const log = (...a) => { if (LOG) console.log('[mic]', ...a) }

const Reconhecimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null
export const ehIOS = () => typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
export const ehAppInstalado = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true)

export const BARRAS = 5
const SILENCIO_MS = 2000
const ESPERA_INICIAL_MS = 4000
const LIMIAR_VOZ = 0.12
const ZEROS = Array(BARRAS).fill(0)

// Erros da camada 1 que mandam para a camada 2 no próximo toque (o reconhecimento do navegador não
// funciona aqui, mas o microfone pode funcionar).
export const ERROS_QUE_TROCAM_DE_CAMADA = new Set(['not-allowed', 'service-not-allowed', 'network', 'language-not-supported'])

// Erros do reconhecimento em português (onerror.error).
export function mensagemErroVoz(codigo, { ios = ehIOS(), instalado = ehAppInstalado(), so = plataforma() } = {}) {
  switch (codigo) {
    case 'not-allowed':
      return ios
        ? 'O microfone foi bloqueado. No iPhone: Ajustes › Safari › Microfone (ou Ajustes › Privacidade › Microfone) e permita para o Finup. Ou use o microfone do teclado.'
        : mensagemErroMicrofone({ name: 'NotAllowedError' }, { so })
    case 'service-not-allowed':
      if (instalado) return 'No app instalado o iPhone não liberou o reconhecimento de voz. Use o microfone do teclado 🎤 ou abra o Finup no Safari.'
      if (so === 'mac') return 'O reconhecimento de voz do Safari está desligado. Ative em Ajustes do Sistema → Teclado → Ditado (ou Siri), ou use o Chrome.'
      return 'O reconhecimento de voz está desligado. No iPhone, ative Ajustes › Geral › Teclado › Ativar Ditado — ou use o microfone do teclado.'
    case 'no-speech': return 'Não ouvi nada. Toque no microfone e fale logo depois do bipe.'
    case 'audio-capture': return 'Não consegui usar o microfone (outro app pode estar usando). Feche-o e tente de novo, ou use o microfone do teclado.'
    case 'network': return 'O reconhecimento de voz precisa de internet. Verifique a conexão.'
    case 'language-not-supported': return 'Este aparelho não reconhece voz em português. Use o microfone do teclado.'
    case 'aborted': return 'A gravação foi interrompida. Toque no microfone para tentar de novo.'
    default: return `Não consegui ouvir (${codigo || 'erro desconhecido'}). Use o microfone do teclado.`
  }
}

// Sem nenhuma das camadas.
export function mensagemSemSuporte({ instalado = ehAppInstalado(), ios = ehIOS() } = {}) {
  if (ios) {
    return instalado
      ? 'Este app instalado não tem reconhecimento de voz. Use o microfone do teclado 🎤 (ou abra o Finup no Safari).'
      : 'Este navegador não reconhece voz. Use o microfone do teclado 🎤.'
  }
  return MENSAGEM_SEM_TRANSCRICAO
}

export const MENSAGEM_TROCA_DE_CAMADA = 'O reconhecimento de voz deste navegador não funcionou. Toque no microfone de novo: o áudio será gravado e transcrito.'

// Um AudioContext para a sessão inteira (o iOS limita quantos podem existir e só libera o som de
// um contexto resumido dentro de um gesto). Chamar SEMPRE dentro do toque.
let audioCtx = null
function audioNoToque() {
  if (!AudioCtx) return null
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioCtx()
    if (audioCtx.state !== 'running') audioCtx.resume().then(() => log('AudioContext', audioCtx.state)).catch(e => log('resume falhou', e))
    // Desbloqueio do iOS: um buffer mudo tocado no gesto.
    const b = audioCtx.createBuffer(1, 1, 22050)
    const src = audioCtx.createBufferSource()
    src.buffer = b
    src.connect(audioCtx.destination)
    src.start(0)
    log('AudioContext no toque:', audioCtx.state, 'audioSession:', navigator.audioSession?.type || '(sem API)')
    return audioCtx
  } catch (e) {
    log('AudioContext falhou', e)
    return null
  }
}

function bipe(ctx, freq) {
  if (!ctx) return
  try {
    // Pequeno atraso: com o contexto ainda resumindo, currentTime está parado — o som sai junto.
    const t = ctx.currentTime + 0.02
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(0.08, t + 0.015)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(ganho).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.13)
    log('bipe', freq, 'Hz, estado:', ctx.state)
  } catch (e) { log('bipe falhou', e) }
}

// Camada 1 falhou nesta sessão → o próximo toque já grava (camada 2). Vale até recarregar.
let preferirGravacao = false
export function _reiniciarMicrofone() { preferirGravacao = false }

export function useMicrofone({ onTexto, onErro }) {
  const [ouvindo, setOuvindo] = useState(false)
  const [niveis, setNiveis] = useState(ZEROS)
  const [pulso, setPulso] = useState(false)
  const [modo, setModo] = useState(null) // 'fala' | 'gravacao' enquanto ouve
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [restante, setRestante] = useState(null) // segundos, nos últimos AVISO_FIM_SEG da gravação
  const [transcricao, setTranscricao] = useState(transcricaoDisponivelAgora)
  const r = useRef({}) // rec, gravador, stream, fonte, raf, timer, limite, ativo, parouPeloUsuario, teveFala
  const cb = useRef({ onTexto, onErro })
  useEffect(() => { cb.current = { onTexto, onErro } })
  useEffect(() => {
    let vivo = true
    carregarDisponibilidadeTranscricao().then(d => { if (vivo) setTranscricao(d) })
    return () => { vivo = false }
  }, [])

  const encerrar = useCallback((comBipe = true) => {
    const s = r.current
    if (!s.ativo) return
    s.ativo = false
    clearTimeout(s.timer)
    clearInterval(s.limite)
    cancelAnimationFrame(s.raf)
    try { s.rec?.stop() } catch { /* já parado */ }
    // Camada 2: parar o gravador dispara o envio (onstop); as tracks param lá, depois do último pedaço.
    if (s.gravador && s.gravador.state !== 'inactive') {
      try { s.gravador.stop() } catch { s.stream?.getTracks().forEach(t => t.stop()) }
    } else {
      s.stream?.getTracks().forEach(t => t.stop())
      s.stream = null
    }
    try { s.fonte?.disconnect() } catch { /* já desligada */ }
    s.fonte = null
    if (comBipe) bipe(audioCtx, 440)
    // Devolve a sessão de áudio ao normal depois do bipe.
    setTimeout(() => { try { if (navigator.audioSession) navigator.audioSession.type = 'auto' } catch { /* sem API */ } }, 300)
    log('encerrado')
    setOuvindo(false)
    setNiveis(ZEROS)
    setPulso(false)
    setModo(null)
    setRestante(null)
  }, [])

  const armarSilencio = useCallback((ms = SILENCIO_MS) => {
    const s = r.current
    clearTimeout(s.timer)
    s.timer = setTimeout(() => { log('silêncio — parando'); s.parouPeloUsuario = true; encerrar() }, ms)
  }, [encerrar])

  // Barras pelo volume da voz a partir de um stream. Silêncio (abaixo do limiar) = barras paradas.
  const analisar = useCallback((stream) => {
    const s = r.current
    // Sem AudioContext não dá para medir a voz: não descarta a gravação como silêncio.
    if (!audioCtx) { setPulso(true); s.teveFala = true; return }
    const analisador = audioCtx.createAnalyser()
    analisador.fftSize = 64
    s.fonte = audioCtx.createMediaStreamSource(stream)
    s.fonte.connect(analisador)
    const dados = new Uint8Array(analisador.frequencyBinCount)
    const faixa = Math.max(1, Math.floor(dados.length / BARRAS))
    const passo = () => {
      if (!s.ativo) return
      analisador.getByteFrequencyData(dados)
      const n = Array.from({ length: BARRAS }, (_, i) => {
        let soma = 0
        for (let j = i * faixa; j < (i + 1) * faixa; j++) soma += dados[j]
        const v = soma / faixa / 255
        return v < LIMIAR_VOZ ? 0 : Math.min(1, v * 1.6)
      })
      if (n.some(v => v > 0)) { s.teveFala = true; armarSilencio() }
      setNiveis(n)
      s.raf = requestAnimationFrame(passo)
    }
    passo()
  }, [armarSilencio])

  // Camada 1: analisador à parte (fora do iOS).
  const ligarAnalisador = useCallback(async () => {
    const s = r.current
    if (ehIOS() || !navigator.mediaDevices?.getUserMedia || !audioCtx) { setPulso(true); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!s.ativo) { stream.getTracks().forEach(t => t.stop()); return }
      s.stream = stream
      analisar(stream)
    } catch (e) {
      log('getUserMedia falhou → pulso', e?.name)
      setPulso(true)
    }
  }, [analisar])

  // ── Camada 2: grava e transcreve no servidor ──────────────────────────────────────────────────
  const iniciarGravacao = useCallback(() => {
    const s = r.current
    if (!podeGravar()) { cb.current.onErro?.(mensagemSemSuporte()); return }
    if (transcricaoDisponivelAgora() === false) { cb.current.onErro?.(MENSAGEM_SEM_TRANSCRICAO); return }
    const ctx = audioNoToque()
    bipe(ctx, 880)
    s.ativo = true
    s.parouPeloUsuario = false
    s.teveFala = false
    s.rec = null
    setModo('gravacao')
    setOuvindo(true)
    // getUserMedia chamado DENTRO do toque (exigência do Safari/iPhone); o resto vem depois.
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      .then(stream => {
        if (!s.ativo) { stream.getTracks().forEach(t => t.stop()); return }
        s.stream = stream
        const formato = escolherFormatoAudio()
        let gravador
        try {
          gravador = new MediaRecorder(stream, { ...(formato ? { mimeType: formato } : {}), audioBitsPerSecond: BITRATE_AUDIO })
        } catch (e) {
          log('MediaRecorder falhou', e)
          encerrar(false)
          stream.getTracks().forEach(t => t.stop())
          cb.current.onErro?.(mensagemErroMicrofone(e))
          return
        }
        const pedacos = []
        const inicio = Date.now()
        gravador.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data) }
        gravador.onerror = (e) => { log('gravador erro', e?.error); cb.current.onErro?.(mensagemErroMicrofone(e?.error)) }
        gravador.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          if (s.stream === stream) s.stream = null
          const duracaoSeg = Math.round((Date.now() - inicio) / 100) / 10
          if (s.descartar || !s.teveFala || !pedacos.length) {
            if (!s.descartar && !s.teveFala) cb.current.onErro?.(mensagemErroVoz('no-speech'))
            return
          }
          const tipo = gravador.mimeType || formato || pedacos[0].type || 'audio/webm'
          setTranscrevendo(true)
          try {
            const texto = await transcreverAudio(new Blob(pedacos, { type: tipo }), { mimeType: tipo, duracaoSeg })
            if (texto) cb.current.onTexto?.(texto, '')
            else cb.current.onErro?.('Não entendi o áudio. Fale mais perto do microfone ou digite a mensagem.')
          } catch (err) {
            cb.current.onErro?.(err.message)
          } finally {
            setTranscrevendo(false)
          }
        }
        s.gravador = gravador
        gravador.start(250)
        analisar(stream)
        armarSilencio(ESPERA_INICIAL_MS)
        // Limite de 2 min (corpo da requisição na Vercel): aviso nos últimos segundos e parada.
        s.limite = setInterval(() => {
          const falta = MAX_GRAVACAO_SEG - Math.floor((Date.now() - inicio) / 1000)
          if (falta <= 0) { s.parouPeloUsuario = true; encerrar() } else if (falta <= AVISO_FIM_SEG) setRestante(falta)
        }, 500)
      })
      .catch(err => {
        log('getUserMedia (gravação) falhou', err?.name)
        encerrar(false)
        cb.current.onErro?.(mensagemErroMicrofone(err))
      })
  }, [analisar, armarSilencio, encerrar])

  // ── Camada 1: reconhecimento do navegador ─────────────────────────────────────────────────────
  // Chamar DIRETO no handler do toque (sem await antes): o iOS só libera microfone e som no gesto.
  const iniciar = useCallback(() => {
    log('toque', { suporte: !!Reconhecimento, preferirGravacao, ios: ehIOS(), instalado: ehAppInstalado(), ua: navigator.userAgent })
    if (r.current.ativo) return
    r.current.descartar = false
    if (!Reconhecimento || preferirGravacao) { iniciarGravacao(); return }
    const s = r.current
    const ios = ehIOS()
    // Plano B disponível? (para decidir, numa falha, entre trocar de camada e só avisar)
    const temPlanoB = podeGravar() && transcricaoDisponivelAgora() !== false
    const trocarDeCamada = () => { preferirGravacao = true; cb.current.onErro?.(MENSAGEM_TROCA_DE_CAMADA) }

    const ctx = audioNoToque()
    bipe(ctx, 880)

    let rec
    try {
      rec = new Reconhecimento()
    } catch (e) {
      log('new SpeechRecognition falhou', e)
      if (temPlanoB) { preferirGravacao = true; iniciarGravacao() } else cb.current.onErro?.(mensagemSemSuporte())
      return
    }
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = !ios
    rec.maxAlternatives = 1
    rec.onstart = () => log('onstart')
    rec.onaudiostart = () => log('onaudiostart')
    rec.onspeechstart = () => log('onspeechstart')
    rec.onspeechend = () => log('onspeechend')
    rec.onresult = (e) => {
      let final = ''
      let provisorio = ''
      for (const res of e.results) {
        if (res.isFinal) final += res[0]?.transcript || ''
        else provisorio += res[0]?.transcript || ''
      }
      log('onresult', { final, provisorio })
      s.teveResultado = true
      cb.current.onTexto?.(final.trim(), provisorio.trim())
      if (s.ativo) armarSilencio()
    }
    rec.onerror = (e) => {
      log('onerror', e.error, e.message)
      s.teveErro = true
      if (e.error === 'audio-capture' && s.stream) {
        // Reconhecimento e analisador brigando pelo microfone: fica só o reconhecimento, com pulso.
        s.stream.getTracks().forEach(t => t.stop())
        s.stream = null
        cancelAnimationFrame(s.raf)
        setNiveis(ZEROS)
        setPulso(true)
        return
      }
      if (ERROS_QUE_TROCAM_DE_CAMADA.has(e.error) && temPlanoB) trocarDeCamada()
      // 'aborted' depois de o próprio usuário (ou o silêncio) parar não é erro.
      else if (!(e.error === 'aborted' && s.parouPeloUsuario)) cb.current.onErro?.(mensagemErroVoz(e.error, { ios }))
      encerrar()
    }
    rec.onend = () => {
      log('onend', { teveResultado: !!s.teveResultado })
      // Terminou sozinho, sem erro e sem nenhum resultado (ex.: Safari no Mac sem Ditado): falha muda.
      if (s.ativo && !s.teveResultado && !s.teveErro && !s.parouPeloUsuario) {
        if (temPlanoB) trocarDeCamada()
        else cb.current.onErro?.(mensagemErroVoz('no-speech'))
      }
      encerrar()
    }
    s.rec = rec
    s.gravador = null
    s.ativo = true
    s.parouPeloUsuario = false
    s.teveFala = false
    s.teveResultado = false
    s.teveErro = false
    setModo('fala')
    setOuvindo(true)
    try {
      rec.start()
      log('rec.start() chamado no toque', { continuous: rec.continuous })
    } catch (e) {
      log('rec.start() falhou', e)
      encerrar(false)
      if (temPlanoB) trocarDeCamada()
      else cb.current.onErro?.(mensagemErroVoz(e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture', { ios }))
      return
    }
    armarSilencio(ESPERA_INICIAL_MS)
    ligarAnalisador()
  }, [armarSilencio, encerrar, ligarAnalisador, iniciarGravacao])

  const parar = useCallback(() => { r.current.parouPeloUsuario = true; encerrar() }, [encerrar])

  // Sai da tela gravando → libera o microfone sem bipe e sem transcrever.
  useEffect(() => () => { r.current.parouPeloUsuario = true; r.current.descartar = true; encerrar(false) }, [encerrar])

  const suportado = !!Reconhecimento || (podeGravar() && transcricao !== false)
  return { ouvindo, niveis, pulso, modo, transcrevendo, restante, iniciar, parar, suportado }
}
