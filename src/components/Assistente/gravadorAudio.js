// Microfone do Assistente — CAMADA 2 (plano B universal): quando o navegador não tem reconhecimento
// de voz (Firefox, Safari sem Ditado, alguns Chromium, app instalado no iPhone) ou ele falha, o áudio
// é gravado (getUserMedia + MediaRecorder) e transcrito no servidor (/api/transcrever-audio). O
// áudio não é guardado em lugar nenhum. Aqui: escolha do formato, mensagens de erro e a chamada.
import { authHeaders } from '../../lib/api.js'

export const MAX_GRAVACAO_SEG = 120
export const AVISO_FIM_SEG = 15 // aviso visual nos últimos segundos
export const BITRATE_AUDIO = 32000
export const MENSAGEM_SEM_TRANSCRICAO = 'Seu navegador não transcreve áudio. Use o Chrome ou digite a mensagem.'

// Formato aceito pelo navegador, na ordem: webm/opus (Chrome, Firefox, Edge), mp4 (Safari, iPhone), ogg.
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']
export function escolherFormatoAudio(Recorder = globalThis.MediaRecorder) {
  if (!Recorder) return null
  if (typeof Recorder.isTypeSupported !== 'function') return ''
  return FORMATOS.find(f => { try { return Recorder.isTypeSupported(f) } catch { return false } }) ?? ''
}

export const podeGravar = (nav = globalThis.navigator, Recorder = globalThis.MediaRecorder) =>
  !!(nav?.mediaDevices?.getUserMedia && Recorder)

export function plataforma(ua = globalThis.navigator?.userAgent || '', nav = globalThis.navigator) {
  if (/iP(hone|ad|od)/.test(ua) || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Mac OS X|Macintosh/.test(ua)) return 'mac'
  if (/Windows/.test(ua)) return 'windows'
  return 'outro'
}

// Erro do getUserMedia / MediaRecorder → mensagem clara em português (nunca falha silenciosa).
export function mensagemErroMicrofone(err, { so = plataforma() } = {}) {
  const nome = err?.name || ''
  if (nome === 'NotAllowedError' || nome === 'PermissionDeniedError' || nome === 'SecurityError') {
    const base = 'Permita o microfone para o Finup no navegador.'
    if (so === 'mac') return `${base} Se já permitiu, verifique em Ajustes do Sistema → Privacidade e Segurança → Microfone se o navegador está liberado.`
    if (so === 'windows') return `${base} Se já permitiu, verifique em Configurações → Privacidade → Microfone se o navegador está liberado.`
    if (so === 'ios') return `${base} No iPhone: Ajustes → Safari → Microfone (ou Ajustes → Privacidade → Microfone).`
    return base
  }
  if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError' || nome === 'OverconstrainedError') return 'Nenhum microfone encontrado neste aparelho.'
  if (nome === 'NotReadableError' || nome === 'TrackStartError' || nome === 'AbortError') return 'O microfone está em uso por outro app.'
  return `Não consegui usar o microfone${nome ? ` (${nome})` : ''}. Tente de novo ou digite a mensagem.`
}

// A transcrição no servidor está ligada (há chave configurada)? Consultado uma vez por sessão.
let disponivel = null
let consultando = null
export const transcricaoDisponivelAgora = () => disponivel
export function carregarDisponibilidadeTranscricao(fetchFn = globalThis.fetch) {
  if (disponivel !== null) return Promise.resolve(disponivel)
  if (!consultando) {
    consultando = fetchFn('/api/transcrever-audio', { cache: 'no-store', headers: { ...authHeaders() } })
      .then(r => (r.ok ? r.json() : { disponivel: false }))
      .then(j => { disponivel = !!j.disponivel; return disponivel })
      .catch(() => null) // sem conexão: não sabe — tenta na hora de gravar
      .finally(() => { consultando = null })
  }
  return consultando
}
export function _reiniciarTranscricao() { disponivel = null; consultando = null }

const paraBase64 = (blob) => new Promise((ok, falha) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''))
  r.onerror = () => falha(new Error('Não consegui ler o áudio gravado.'))
  r.readAsDataURL(blob)
})

// Envia o áudio e devolve o texto. Erro do servidor → a mensagem real dele.
export async function transcreverAudio(blob, { mimeType, duracaoSeg }, fetchFn = globalThis.fetch) {
  const res = await fetchFn('/api/transcrever-audio', {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ audioBase64: await paraBase64(blob), mimeType: mimeType || blob.type || 'audio/webm', duracaoSeg }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (json.codigo === 'sem_transcricao') disponivel = false
    throw new Error(json.error || `Não consegui transcrever o áudio (erro ${res.status}).`)
  }
  return String(json.texto || '').trim()
}
