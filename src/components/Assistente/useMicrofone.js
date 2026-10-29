import { useCallback, useEffect, useRef, useState } from 'react'

// Microfone do Assistente: SpeechRecognition (pt-BR, transcrição ao vivo) + retorno visual e sonoro.
//   • bipe curto ao iniciar (agudo) e ao parar (grave) — OscillatorNode, ~120 ms, volume baixo;
//   • barras de equalizador pelo volume da voz (getUserMedia + AnalyserNode), paradas no silêncio;
//   • iPhone/iPad: SEM getUserMedia (no Safari do iOS ele disputa o microfone com o reconhecimento
//     e derruba um dos dois) — `pulso` = animação enquanto ouve;
//   • para sozinho após ~2 s de silêncio (4 s de tolerância antes da primeira fala);
//   • ao terminar, para as tracks (libera o microfone).
// onTexto(final, provisorio): texto final acumulado nesta gravação e o trecho ainda provisório.
//
// Regras do iOS (Safari e app instalado):
//   • rec.start() e o desbloqueio do áudio rodam DENTRO do toque, sem await antes;
//   • um AudioContext só, criado e resumido no primeiro toque, e desbloqueado com um buffer mudo;
//   • navigator.audioSession = 'play-and-record' (Safari 16.4+): o bipe toca junto com a gravação
//     (sem isso, a sessão de gravação corta o som — e a chave do silencioso cala o Web Audio);
//   • continuous = false: no iOS o modo contínuo encerra sem entregar resultado.
//
// LOG TEMPORÁRIO (teste no iPhone): mensagens "[mic]" no console. Remover depois do teste.
const LOG = true
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

// Erros do reconhecimento em português (onerror.error).
export function mensagemErroVoz(codigo, { ios = ehIOS(), instalado = ehAppInstalado() } = {}) {
  switch (codigo) {
    case 'not-allowed':
      return ios
        ? 'O microfone foi bloqueado. No iPhone: Ajustes › Safari › Microfone (ou Ajustes › Privacidade › Microfone) e permita para o Finup. Ou use o microfone do teclado.'
        : 'O microfone foi bloqueado. Permita o microfone para este site nas configurações do navegador.'
    case 'service-not-allowed':
      return instalado
        ? 'No app instalado o iPhone não liberou o reconhecimento de voz. Use o microfone do teclado 🎤 ou abra o Finup no Safari.'
        : 'O reconhecimento de voz está desligado. No iPhone, ative Ajustes › Geral › Teclado › Ativar Ditado — ou use o microfone do teclado.'
    case 'no-speech': return 'Não ouvi nada. Toque no microfone e fale logo depois do bipe.'
    case 'audio-capture': return 'Não consegui usar o microfone (outro app pode estar usando). Feche-o e tente de novo, ou use o microfone do teclado.'
    case 'network': return 'O reconhecimento de voz precisa de internet. Verifique a conexão.'
    case 'language-not-supported': return 'Este aparelho não reconhece voz em português. Use o microfone do teclado.'
    case 'aborted': return 'A gravação foi interrompida. Toque no microfone para tentar de novo.'
    default: return `Não consegui ouvir (${codigo || 'erro desconhecido'}). Use o microfone do teclado.`
  }
}

export function mensagemSemSuporte({ instalado = ehAppInstalado() } = {}) {
  return instalado
    ? 'Este app instalado não tem reconhecimento de voz. Use o microfone do teclado 🎤 (ou abra o Finup no Safari).'
    : 'Este navegador não reconhece voz. Use o microfone do teclado 🎤.'
}

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

export function useMicrofone({ onTexto, onErro }) {
  const [ouvindo, setOuvindo] = useState(false)
  const [niveis, setNiveis] = useState(ZEROS)
  const [pulso, setPulso] = useState(false)
  const r = useRef({}) // rec, stream, raf, timer, ativo, parouPeloUsuario, teveFala
  const cb = useRef({ onTexto, onErro })
  useEffect(() => { cb.current = { onTexto, onErro } })

  const encerrar = useCallback((comBipe = true) => {
    const s = r.current
    if (!s.ativo) return
    s.ativo = false
    clearTimeout(s.timer)
    cancelAnimationFrame(s.raf)
    try { s.rec?.stop() } catch { /* já parado */ }
    s.stream?.getTracks().forEach(t => t.stop())
    s.stream = null
    if (comBipe) bipe(audioCtx, 440)
    // Devolve a sessão de áudio ao normal depois do bipe.
    setTimeout(() => { try { if (navigator.audioSession) navigator.audioSession.type = 'auto' } catch { /* sem API */ } }, 300)
    log('encerrado')
    setOuvindo(false)
    setNiveis(ZEROS)
    setPulso(false)
  }, [])

  const armarSilencio = useCallback((ms = SILENCIO_MS) => {
    const s = r.current
    clearTimeout(s.timer)
    s.timer = setTimeout(() => { log('silêncio — parando'); s.parouPeloUsuario = true; encerrar() }, ms)
  }, [encerrar])

  // Analisador de volume → barras (fora do iOS). Silêncio (abaixo do limiar) = barras paradas.
  const ligarAnalisador = useCallback(async () => {
    const s = r.current
    if (ehIOS() || !navigator.mediaDevices?.getUserMedia || !audioCtx) { setPulso(true); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!s.ativo) { stream.getTracks().forEach(t => t.stop()); return }
      s.stream = stream
      const analisador = audioCtx.createAnalyser()
      analisador.fftSize = 64
      audioCtx.createMediaStreamSource(stream).connect(analisador)
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
        if (n.some(v => v > 0)) armarSilencio()
        setNiveis(n)
        s.raf = requestAnimationFrame(passo)
      }
      passo()
    } catch (e) {
      log('getUserMedia falhou → pulso', e?.name)
      setPulso(true)
    }
  }, [armarSilencio])

  // Chamar DIRETO no handler do toque (sem await antes): o iOS só libera microfone e som no gesto.
  const iniciar = useCallback(() => {
    log('toque', { suporte: !!Reconhecimento, ios: ehIOS(), instalado: ehAppInstalado(), ua: navigator.userAgent })
    if (!Reconhecimento) { cb.current.onErro?.(mensagemSemSuporte()); return }
    if (r.current.ativo) return
    const s = r.current
    const ios = ehIOS()

    const ctx = audioNoToque()
    bipe(ctx, 880)

    let rec
    try {
      rec = new Reconhecimento()
    } catch (e) {
      log('new SpeechRecognition falhou', e)
      cb.current.onErro?.(mensagemSemSuporte())
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
      s.teveFala = true
      cb.current.onTexto?.(final.trim(), provisorio.trim())
      if (s.ativo) armarSilencio()
    }
    rec.onerror = (e) => {
      log('onerror', e.error, e.message)
      if (e.error === 'audio-capture' && s.stream) {
        // Reconhecimento e analisador brigando pelo microfone: fica só o reconhecimento, com pulso.
        s.stream.getTracks().forEach(t => t.stop())
        s.stream = null
        cancelAnimationFrame(s.raf)
        setNiveis(ZEROS)
        setPulso(true)
        return
      }
      // 'aborted' depois de o próprio usuário (ou o silêncio) parar não é erro.
      if (!(e.error === 'aborted' && s.parouPeloUsuario)) cb.current.onErro?.(mensagemErroVoz(e.error, { ios }))
      encerrar()
    }
    rec.onend = () => {
      log('onend', { teveFala: !!s.teveFala })
      encerrar()
    }
    s.rec = rec
    s.ativo = true
    s.parouPeloUsuario = false
    s.teveFala = false
    setOuvindo(true)
    try {
      rec.start()
      log('rec.start() chamado no toque', { continuous: rec.continuous })
    } catch (e) {
      log('rec.start() falhou', e)
      encerrar(false)
      cb.current.onErro?.(mensagemErroVoz(e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture', { ios }))
      return
    }
    armarSilencio(ESPERA_INICIAL_MS)
    ligarAnalisador()
  }, [armarSilencio, encerrar, ligarAnalisador])

  const parar = useCallback(() => { r.current.parouPeloUsuario = true; encerrar() }, [encerrar])

  // Sai da tela gravando → libera o microfone sem bipe.
  useEffect(() => () => { r.current.parouPeloUsuario = true; encerrar(false) }, [encerrar])

  return { ouvindo, niveis, pulso, iniciar, parar, suportado: !!Reconhecimento }
}
