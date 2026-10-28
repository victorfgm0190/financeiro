import process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'
import { parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import {
  ensureIaSchema, montarContexto, textoCadastros, INSTRUCOES, FERRAMENTAS, validarParametros, registrarUso, hojeSaoPaulo,
} from './_ia.js'
import { ehPedidoDeExclusao, RESPOSTA_EXCLUSAO, buscarCandidatosBaixa } from './_iaBaixa.js'

// ASSISTENTE IA (etapa 1/1.1). POST { texto?, imagemBase64?, mimeType?, respostaPergunta?, pergunta? }
//   → { ferramenta, parametros, candidatos? } — registrar_lancamento | criar_agendamento |
//     baixar_agendamento (+ até 5 candidatos pendentes) | consultar_saldo | perguntar.
// NUNCA exclui: pedido de exclusão volta como `perguntar` recusando, sem chamar o modelo.
// NÃO grava lançamento nem agendamento: o app abre a prévia e salva pelo fluxo manual do AppContext.
// Saldo nunca vem daqui (o app calcula). Grava só o consumo em ia_uso, no banco do ambiente.
// A chave (ANTHROPIC_API_KEY) fica só no servidor: nunca na resposta nem nos logs.

const MODELO = 'claude-haiku-5-5'
const MAX_TEXTO = 1000
const MAX_IMAGEM_BYTES = 2.2 * 1024 * 1024 // ~2 MB (o app comprime para ~1600 px antes)
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const FERRAMENTAS_VALIDAS = new Set(FERRAMENTAS.map(f => f.name))

let cliente = null
const anthropic = () => (cliente ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000 }))

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Assistente indisponível: a chave da IA não está configurada.' })

  try {
    const body = await parseBody(req)
    const texto = typeof body?.texto === 'string' ? body.texto.trim() : ''
    const resposta = typeof body?.respostaPergunta === 'string' ? body.respostaPergunta.trim().slice(0, 300) : ''
    const pergunta = typeof body?.pergunta === 'string' ? body.pergunta.trim().slice(0, 300) : ''
    const imagem = typeof body?.imagemBase64 === 'string' ? body.imagemBase64.replace(/^data:[^,]*,/, '') : ''
    const mime = String(body?.mimeType || 'image/jpeg').toLowerCase()

    if (texto.length > MAX_TEXTO) return res.status(400).json({ error: `Texto muito longo (máximo ${MAX_TEXTO} caracteres).` })
    if (!texto && !imagem) return res.status(400).json({ error: 'Escreva, fale ou envie uma foto.' })
    if (imagem) {
      if (!MIMES.has(mime)) return res.status(400).json({ error: 'Formato de imagem não aceito (use JPG, PNG ou WebP).' })
      if (Math.floor(imagem.length * 3 / 4) > MAX_IMAGEM_BYTES) return res.status(413).json({ error: 'Imagem muito grande (máximo ~2 MB).' })
    }

    if (ehPedidoDeExclusao(`${texto} ${resposta}`)) return res.json({ ferramenta: 'perguntar', parametros: RESPOSTA_EXCLUSAO })

    await ensureIaSchema()
    const ctx = await montarContexto(req.user)
    const hoje = hojeSaoPaulo()

    const partes = [`Hoje é ${hoje}.`, texto ? `Pedido: ${texto}` : 'Pedido: (veja a imagem)']
    if (resposta) partes.push(`Você perguntou: ${pergunta || '(pergunta anterior)'}`, `Resposta do usuário: ${resposta}`)
    const content = [
      ...(imagem ? [{ type: 'image', source: { type: 'base64', media_type: mime, data: imagem } }] : []),
      { type: 'text', text: partes.join('\n') },
    ]

    const msg = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 1536,
      output_config: { effort: 'low' },
      tools: FERRAMENTAS,
      tool_choice: { type: 'auto' },
      // Bloco estável (instruções + cadastros) com cache; a data e o pedido vão na mensagem.
      system: [
        { type: 'text', text: INSTRUCOES },
        { type: 'text', text: `# CADASTROS DO USUÁRIO\n${textoCadastros(ctx)}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content }],
    })

    const bloco = msg.content.find(b => b.type === 'tool_use' && FERRAMENTAS_VALIDAS.has(b.name))
    const ferramenta = bloco ? bloco.name : 'perguntar'
    await registrarUso({ ambiente: req.ambiente?.sigla, ferramenta, usage: msg.usage })

    if (msg.stop_reason === 'refusal') {
      return res.json({ ferramenta: 'perguntar', parametros: { pergunta: 'Não consegui ajudar com esse pedido. Posso registrar lançamentos, agendamentos ou consultar saldos.', opcoes: [] } })
    }
    if (!bloco) {
      const t = msg.content.find(b => b.type === 'text')?.text
      return res.json({ ferramenta: 'perguntar', parametros: validarParametros('perguntar', { pergunta: t, opcoes: [] }, ctx, hoje) })
    }
    const parametros = validarParametros(ferramenta, bloco.input, ctx, hoje)
    if (ferramenta === 'baixar_agendamento') {
      return res.json({ ferramenta, parametros, candidatos: await buscarCandidatosBaixa(req.user, parametros, hoje) })
    }
    return res.json({ ferramenta, parametros })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Muitos pedidos ao assistente agora. Tente de novo em instantes.' })
    if (err instanceof Anthropic.APIError) {
      console.error('[api/assistente] erro da IA:', err.status, err.name)
      return res.status(502).json({ error: 'O assistente não respondeu. Tente de novo.' })
    }
    console.error('[api/assistente]', err.message)
    res.status(500).json({ error: 'Falha no assistente.' })
  }
}

export default comAmbiente(handler)
