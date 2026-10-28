import { useCallback, useEffect, useRef, useState } from 'react'

// Microfone do Assistente: SpeechRecognition (pt-BR, transcrição ao vivo) + retorno visual e sonoro.
//   • bipe curto ao iniciar (agudo) e ao parar (grave) — OscillatorNode, ~120 ms, volume baixo;
//   • barras de equalizador pelo volume da voz (getUserMedia + AnalyserNode), paradas no silêncio;
//   • iPhone/iPad (ou getUserMedia falhou): sem analisador, `pulso` = animação enquanto ouve —
//     no Safari do iOS, abrir o microfone pelo getUserMedia junto com o reconhecimento derruba um
//     dos dois;
//   • para sozinho após ~2 s de silêncio (4 s de tolerância antes da primeira fala);
//   • ao terminar, para as tracks (libera o microfone) e fecha o AudioContext.
// onTexto(final, provisorio): texto final acumulado nesta gravação e o trecho ainda provisório.

const Reconhecimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null
const ehIOS = () => typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const BARRAS = 5
const SILENCIO_MS = 2000
const ESPERA_INICIAL_MS = 4000
const LIMIAR_VOZ = 0.12
const ZEROS = Array(BARRAS).fill(0)

function bipe(ctx, freq) {
  if (!ctx) return
  try {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(0.06, t + 0.015)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(ganho).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.13)
  } catch { /* sem áudio: segue sem bipe */ }
}

export function useMicrofone({ onTexto, onErro }) {
  const [ouvindo, setOuvindo] = useState(false)
  const [niveis, setNiveis] = useState(ZEROS)
  const [pulso, setPulso] = useState(false)
  const r = useRef({}) // rec, ctx, stream, raf, timer, ativo
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
    if (comBipe) bipe(s.ctx, 440)
    const ctx = s.ctx
    s.ctx = null
    setTimeout(() => { try { ctx?.close() } catch { /* fechado */ } }, 200)
    setOuvindo(false)
    setNiveis(ZEROS)
    setPulso(false)
  }, [])

  const armarSilencio = useCallback((ms = SILENCIO_MS) => {
    const s = r.current
    clearTimeout(s.timer)
    s.timer = setTimeout(() => encerrar(), ms)
  }, [encerrar])

  // Analisador de volume → barras. Silêncio (abaixo do limiar) = barras paradas em zero.
  const ligarAnalisador = useCallback(async () => {
    const s = r.current
    if (ehIOS() || !navigator.mediaDevices?.getUserMedia || !s.ctx) { setPulso(true); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!s.ativo) { stream.getTracks().forEach(t => t.stop()); return }
      s.stream = stream
      const analisador = s.ctx.createAnalyser()
      analisador.fftSize = 64
      s.ctx.createMediaStreamSource(stream).connect(analisador)
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
    } catch {
      setPulso(true)
    }
  }, [armarSilencio])

  const iniciar = useCallback(() => {
    if (!Reconhecimento) { cb.current.onErro?.('Este navegador não reconhece voz. Digite o pedido.'); return }
    if (r.current.ativo) return
    const s = r.current
    s.ativo = true
    s.ctx = AudioCtx ? new AudioCtx() : null
    s.ctx?.resume?.()
    bipe(s.ctx, 880)

    const rec = new Reconhecimento()
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e) => {
      let final = ''
      let provisorio = ''
      for (const res of e.results) {
        if (res.isFinal) final += res[0]?.transcript || ''
        else provisorio += res[0]?.transcript || ''
      }
      cb.current.onTexto?.(final.trim(), provisorio.trim())
      armarSilencio()
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') cb.current.onErro?.('Permita o uso do microfone para falar com o assistente.')
      else if (e.error === 'audio-capture' && s.stream) {
        // Reconhecimento e analisador brigando pelo microfone: fica só o reconhecimento, com pulso.
        s.stream.getTracks().forEach(t => t.stop())
        s.stream = null
        cancelAnimationFrame(s.raf)
        setNiveis(ZEROS)
        setPulso(true)
        return
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') cb.current.onErro?.('Não consegui ouvir. Tente de novo.')
      encerrar()
    }
    rec.onend = () => encerrar()
    s.rec = rec
    setOuvindo(true)
    try {
      rec.start()
    } catch {
      encerrar(false)
      cb.current.onErro?.('Não consegui abrir o microfone.')
      return
    }
    armarSilencio(ESPERA_INICIAL_MS)
    ligarAnalisador()
  }, [armarSilencio, encerrar, ligarAnalisador])

  // Sai da tela gravando → libera o microfone sem bipe.
  useEffect(() => () => encerrar(false), [encerrar])

  return { ouvindo, niveis, pulso, iniciar, parar: encerrar, suportado: !!Reconhecimento }
}
