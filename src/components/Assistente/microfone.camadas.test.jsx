// @vitest-environment jsdom
// Microfone em duas camadas: sem reconhecimento de voz no navegador (o jsdom não tem — como o
// Firefox), o áudio é gravado e transcrito no servidor. Microfone e gravador simulados.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMicrofone, _reiniciarMicrofone, mensagemErroVoz } from './useMicrofone'
import { escolherFormatoAudio, mensagemErroMicrofone, plataforma, _reiniciarTranscricao, MENSAGEM_SEM_TRANSCRICAO } from './gravadorAudio'
import { configTranscricao, validarAudio, transcrever, mimeBase } from '../../../api/transcrever-audio.js'

describe('formato e mensagens', () => {
  it('formato pela ordem: webm/opus; Safari/iPhone → mp4', () => {
    expect(escolherFormatoAudio({ isTypeSupported: () => true })).toBe('audio/webm;codecs=opus')
    expect(escolherFormatoAudio({ isTypeSupported: (t) => t === 'audio/mp4' })).toBe('audio/mp4')
    expect(escolherFormatoAudio(null)).toBeNull()
  })
  it('permissão negada com o caminho do sistema; sem microfone; microfone ocupado', () => {
    expect(mensagemErroMicrofone({ name: 'NotAllowedError' }, { so: 'mac' })).toMatch(/Permita o microfone para o Finup no navegador\. Se já permitiu, verifique em Ajustes do Sistema → Privacidade e Segurança → Microfone/)
    expect(mensagemErroMicrofone({ name: 'NotAllowedError' }, { so: 'windows' })).toMatch(/Configurações → Privacidade → Microfone/)
    expect(mensagemErroMicrofone({ name: 'NotFoundError' })).toBe('Nenhum microfone encontrado neste aparelho.')
    expect(mensagemErroMicrofone({ name: 'NotReadableError' })).toBe('O microfone está em uso por outro app.')
  })
  it('Safari no Mac sem Ditado: explica onde ligar', () => {
    expect(mensagemErroVoz('service-not-allowed', { ios: false, instalado: false, so: 'mac' })).toMatch(/Ditado/)
    expect(plataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605', { maxTouchPoints: 0 })).toBe('mac')
  })
})

describe('API /api/transcrever-audio', () => {
  it('sem chave: desligada; provedor e modelo por variável', () => {
    expect(configTranscricao({}).disponivel).toBe(false)
    expect(configTranscricao({ TRANSCRICAO_API_KEY: 'k' })).toMatchObject({ disponivel: true, provedor: 'openai', modelo: 'gpt-4o-mini-transcribe', url: 'https://api.openai.com/v1' })
    expect(configTranscricao({ TRANSCRICAO_API_KEY: 'k', TRANSCRICAO_PROVEDOR: 'groq' })).toMatchObject({ provedor: 'groq', modelo: 'whisper-large-v3-turbo', url: 'https://api.groq.com/openai/v1' })
  })
  it('valida formato e tamanho (2 minutos)', () => {
    expect(mimeBase('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(validarAudio('QUJD', 'audio/webm;codecs=opus', 10)).toBeNull()
    expect(validarAudio('QUJD', 'audio/mp4', 10)).toBeNull()
    expect(validarAudio('QUJD', 'video/mp4', 10)).toMatchObject({ status: 400 })
    expect(validarAudio('QUJD', 'audio/webm', 200)).toMatchObject({ status: 413 })
    expect(validarAudio('', 'audio/webm', 1)).toMatchObject({ status: 400 })
  })
  it('chama o provedor em português e repassa a mensagem real do erro', async () => {
    const chamadas = []
    const ok = async (url, opts) => { chamadas.push({ url, opts }); return { ok: true, json: async () => ({ text: ' gastei cinquenta no mercado ', usage: { input_tokens: 40, output_tokens: 8 } }) } }
    const cfg = configTranscricao({ TRANSCRICAO_API_KEY: 'k' })
    const r = await transcrever({ buffer: new Uint8Array([1, 2, 3]), mime: 'audio/webm;codecs=opus' }, cfg, ok)
    expect(r.texto).toBe('gastei cinquenta no mercado')
    expect(chamadas[0].url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(chamadas[0].opts.headers.Authorization).toBe('Bearer k')
    expect(chamadas[0].opts.body.get('language')).toBe('pt')
    expect(chamadas[0].opts.body.get('model')).toBe('gpt-4o-mini-transcribe')
    const recusa = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Incorrect API key provided' } }) })
    await expect(transcrever({ buffer: new Uint8Array([1]), mime: 'audio/mp4' }, cfg, recusa)).rejects.toThrow(/O serviço de transcrição recusou o áudio: Incorrect API key/)
  })
})

// ── Camada 2 de ponta a ponta (navegador sem reconhecimento de voz) ─────────────────────────────
class GravadorFalso {
  static isTypeSupported = (t) => t === 'audio/webm;codecs=opus'
  constructor(stream, opts) { this.stream = stream; this.mimeType = opts.mimeType; this.state = 'inactive'; GravadorFalso.ultimo = this; GravadorFalso.opts = opts }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.() }
}
const trilha = () => ({ stop: vi.fn() })
let stream
beforeEach(() => {
  _reiniciarMicrofone(); _reiniciarTranscricao()
  stream = { tracks: [trilha()], getTracks() { return this.tracks } }
  vi.stubGlobal('MediaRecorder', GravadorFalso)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } })
})
afterEach(() => { vi.unstubAllGlobals() })

const servidor = (transcricao = { ok: true, status: 200, corpo: { texto: 'paguei 80 de luz' } }, disponivel = true) => vi.fn(async (url, opts = {}) => {
  if (!opts.method) return { ok: true, status: 200, json: async () => ({ disponivel }) }
  return { ok: transcricao.ok, status: transcricao.status, json: async () => transcricao.corpo }
})

describe('camada 2: grava e transcreve', () => {
  it('sem Web Speech: grava (webm/opus, ~32 kbps), envia e o texto entra no campo; microfone liberado', async () => {
    const f = servidor(); vi.stubGlobal('fetch', f)
    const onTexto = vi.fn(); const onErro = vi.fn()
    const { result } = renderHook(() => useMicrofone({ onTexto, onErro }))
    await waitFor(() => expect(result.current.suportado).toBe(true))
    act(() => result.current.iniciar())
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    await waitFor(() => expect(result.current.modo).toBe('gravacao'))
    await waitFor(() => expect(GravadorFalso.ultimo?.state).toBe('recording'))
    expect(GravadorFalso.opts).toMatchObject({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 })
    act(() => result.current.parar())
    await waitFor(() => expect(onTexto).toHaveBeenCalledWith('paguei 80 de luz', ''))
    const envio = f.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(envio[1].body)).toMatchObject({ mimeType: 'audio/webm;codecs=opus' })
    expect(stream.tracks[0].stop).toHaveBeenCalled()
    expect(result.current.ouvindo).toBe(false)
    expect(onErro).not.toHaveBeenCalled()
  })
  it('erro do servidor de transcrição: mostra a mensagem real', async () => {
    vi.stubGlobal('fetch', servidor({ ok: false, status: 502, corpo: { error: 'O serviço de transcrição recusou o áudio: cota esgotada' } }))
    const onErro = vi.fn()
    const { result } = renderHook(() => useMicrofone({ onTexto: vi.fn(), onErro }))
    await waitFor(() => expect(result.current.suportado).toBe(true))
    act(() => result.current.iniciar())
    await waitFor(() => expect(GravadorFalso.ultimo?.state).toBe('recording'))
    act(() => result.current.parar())
    await waitFor(() => expect(onErro).toHaveBeenCalledWith('O serviço de transcrição recusou o áudio: cota esgotada'))
  })
  it('permissão negada: mensagem clara, nada fica gravando', async () => {
    vi.stubGlobal('fetch', servidor())
    navigator.mediaDevices.getUserMedia = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }) })
    const onErro = vi.fn()
    const { result } = renderHook(() => useMicrofone({ onTexto: vi.fn(), onErro }))
    await waitFor(() => expect(result.current.suportado).toBe(true))
    act(() => result.current.iniciar())
    await waitFor(() => expect(onErro).toHaveBeenCalledWith(expect.stringMatching(/^Permita o microfone para o Finup no navegador/)))
    expect(result.current.ouvindo).toBe(false)
  })
  it('sem chave de transcrição e sem Web Speech: "Seu navegador não transcreve áudio…", sem gravar', async () => {
    vi.stubGlobal('fetch', servidor(undefined, false))
    const onErro = vi.fn()
    const { result } = renderHook(() => useMicrofone({ onTexto: vi.fn(), onErro }))
    await waitFor(() => expect(result.current.suportado).toBe(false))
    act(() => result.current.iniciar())
    expect(onErro).toHaveBeenCalledWith(MENSAGEM_SEM_TRANSCRICAO)
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })
})
