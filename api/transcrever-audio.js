import process from 'node:process'
import { parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { ensureIaSchema, registrarUso } from './_ia.js'

// TRANSCRIÇÃO DE ÁUDIO do Assistente — "plano B" do microfone: navegador sem reconhecimento de voz
// (Firefox, Safari sem Ditado, alguns Chromium) grava o áudio e manda para cá. O texto volta para o
// campo do Assistente igual ao ditado. O áudio NÃO é gravado em lugar nenhum.
//   GET                                                → { disponivel }  (há chave configurada?)
//   POST { audioBase64, mimeType, duracaoSeg }         → { texto }
//
// Provedor por variável de ambiente (fácil trocar — todos usam a API compatível com a da OpenAI):
//   TRANSCRICAO_API_KEY   chave do provedor (sem ela, a transcrição fica desligada)
//   TRANSCRICAO_PROVEDOR  'openai' (padrão) | 'groq'
//   TRANSCRICAO_MODELO    opcional (padrão: gpt-4o-mini-transcribe na OpenAI, whisper-large-v3-turbo no Groq)
//   TRANSCRICAO_URL       opcional (endereço base de outro provedor compatível)
export const PROVEDORES = {
  openai: { url: 'https://api.openai.com/v1', modelo: 'gpt-4o-mini-transcribe' },
  groq: { url: 'https://api.groq.com/openai/v1', modelo: 'whisper-large-v3-turbo' },
}
// 2 min a ~32 kbps ≈ 0,5 MB; o limite do corpo da Vercel é ~4,5 MB (base64 cresce ~33%).
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024
export const MAX_AUDIO_SEG = 125
const MIMES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'])
const EXTENSAO = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' }

export function configTranscricao(env = process.env) {
  const chave = env.TRANSCRICAO_API_KEY || ''
  const nome = (env.TRANSCRICAO_PROVEDOR || 'openai').toLowerCase()
  const base = PROVEDORES[nome] || PROVEDORES.openai
  return {
    disponivel: !!chave, chave, provedor: PROVEDORES[nome] ? nome : 'openai',
    url: (env.TRANSCRICAO_URL || base.url).replace(/\/+$/, ''), modelo: env.TRANSCRICAO_MODELO || base.modelo,
  }
}

// "audio/webm;codecs=opus" → "audio/webm"
export const mimeBase = (m) => String(m || '').split(';')[0].trim().toLowerCase()

// → { erro, status } ou null.
export function validarAudio(base64, mime, duracaoSeg) {
  if (!base64) return { status: 400, erro: 'Nenhum áudio recebido.' }
  if (!MIMES.has(mimeBase(mime))) return { status: 400, erro: 'Formato de áudio não aceito.' }
  if (Math.floor(base64.length * 3 / 4) > MAX_AUDIO_BYTES) return { status: 413, erro: 'Áudio muito longo (máximo 2 minutos).' }
  if (Number(duracaoSeg) > MAX_AUDIO_SEG) return { status: 413, erro: 'Áudio muito longo (máximo 2 minutos).' }
  return null
}

// Chama o provedor (POST multipart /audio/transcriptions). → { texto, usage }
export async function transcrever({ buffer, mime }, cfg, fetchFn = fetch) {
  const form = new FormData()
  const tipo = mimeBase(mime)
  form.append('file', new Blob([buffer], { type: tipo }), `audio.${EXTENSAO[tipo] || 'webm'}`)
  form.append('model', cfg.modelo)
  form.append('language', 'pt')
  form.append('response_format', 'json')
  const res = await fetchFn(`${cfg.url}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.chave}` }, body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const motivo = json?.error?.message || json?.message || `erro ${res.status}`
    throw Object.assign(new Error(`O serviço de transcrição recusou o áudio: ${motivo}`), { status: 502 })
  }
  return { texto: String(json.text || '').trim(), usage: json.usage || null }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  const cfg = configTranscricao()
  if (req.method === 'GET') return res.json({ disponivel: cfg.disponivel })
  if (req.method !== 'POST') return res.status(405).end()
  if (!cfg.disponivel) return res.status(503).json({ error: 'Seu navegador não transcreve áudio. Use o Chrome ou digite a mensagem.', codigo: 'sem_transcricao' })
  try {
    const body = await parseBody(req)
    const base64 = typeof body?.audioBase64 === 'string' ? body.audioBase64.replace(/^data:[^,]*,/, '') : ''
    const recusa = validarAudio(base64, body?.mimeType, body?.duracaoSeg)
    if (recusa) return res.status(recusa.status).json({ error: recusa.erro })
    const inicio = Date.now()
    const { texto, usage } = await transcrever({ buffer: Buffer.from(base64, 'base64'), mime: body.mimeType }, cfg)
    // Consumo de IA: ferramenta própria; duracao_ms = DURAÇÃO DO ÁUDIO (é por ela que a transcrição é
    // cobrada). Tokens quando o provedor informa (gpt-4o-*-transcribe informa). Nunca o áudio nem o texto.
    try {
      await ensureIaSchema()
      await registrarUso({
        ambiente: req.ambiente?.sigla, ferramenta: 'transcricao_audio', usuario: req.user?.id, modelo: cfg.modelo,
        usage: { input_tokens: usage?.input_tokens || 0, output_tokens: usage?.output_tokens || 0 },
        duracaoMs: Math.round((Number(body.duracaoSeg) || 0) * 1000) || (Date.now() - inicio),
      })
    } catch (err) { console.warn('[api/transcrever-audio] uso não registrado:', err.message) }
    if (!texto) return res.status(422).json({ error: 'Não entendi o áudio. Fale mais perto do microfone ou digite a mensagem.' })
    return res.json({ texto })
  } catch (err) {
    console.error('[api/transcrever-audio]', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
