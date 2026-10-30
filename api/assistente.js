import process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'
import { parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { pode } from '../src/lib/permissoes.js'
import { acoesDoPedido, definicaoFerramenta } from '../src/lib/assistente/acoes.js'
import {
  ensureIaSchema, montarContexto, textoCadastros, instrucoes, validarParametros, registrarUso, hojeSaoPaulo, usoDoDia,
} from './_ia.js'
import { gerencialCitada, MENSAGEM_CONTA_GERENCIAL } from '../src/lib/assistente/contas.js'
import { blocosDoPedido, trechosDosItens, faltantesDoLote } from '../src/lib/assistente/lote.js'
import { ehPedidoDeExclusao, RESPOSTA_EXCLUSAO, ehPedidoDeEstorno, buscarCandidatosBaixa, valorDitoAproximado } from './_iaBaixa.js'
import { centralQuery } from './_central.js'
import { limitesDoAmbiente, bloqueioDoLimite } from '../src/lib/assistente/limiteIa.js'

// Limites do cliente (central). Sem as colunas (central não migrado) → o padrão.
async function limitesDoCliente(ambienteId) {
  if (!ambienteId) return limitesDoAmbiente(null)
  try {
    const [row] = await centralQuery('SELECT ia_limite_diario, ia_limite_imagem FROM ambientes WHERE id = $1', [ambienteId])
    return limitesDoAmbiente(row)
  } catch (err) {
    if (err?.code !== '42703') console.error('[api/assistente] limites do cliente:', err.message)
    return limitesDoAmbiente(null)
  }
}

// ASSISTENTE IA. POST { texto?, imagemBase64?, mimeType?, respostaPergunta?, pergunta? }
//   → { ferramenta, parametros, candidatos? }. As ferramentas vêm do REGISTRO CENTRAL
//     (src/lib/assistente/acoes.js): núcleo fixo + o grupo do domínio do pedido (pelas palavras),
//     só as que o usuário pode usar (permissoes.js). Mesmo grupo → mesmo prefixo → cache por grupo.
// NUNCA exclui: pedido de exclusão volta como `perguntar` recusando, sem chamar o modelo.
// Estorno (🔴) vira abrir_tela, também sem chamar o modelo.
// NÃO grava lançamento nem agendamento: o app abre a prévia e salva pelo fluxo manual do AppContext.
// Consultas: o app calcula (saldo, fatura, vencimentos, gastos, busca) — a IA só escolhe os filtros.
// Grava só o consumo em ia_uso, no banco do ambiente. A chave fica só no servidor.
// CONTAS (src/lib/assistente/contas.js): gerencial nunca é gravada pela IA — escolhida pelo modelo
// ou citada no pedido de uma ação que grava → abrir_tela na conta, com a explicação. Outras fora
// das sugeríveis só valem se o pedido as citou (o validador zera; a prévia pergunta).

// Ações que gravam (prévia → formulário): a conta gerencial nunca pode chegar nelas.
const GRAVAM = new Set(['registrar_lancamento', 'criar_agendamento', 'baixar_agendamento'])

const MODELO = 'claude-haiku-5-5'
const MAX_TEXTO = 1000
const MAX_IMAGEM_BYTES = 2.2 * 1024 * 1024 // ~2 MB (o app comprime para ~1600 px antes)
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// Resolvedores do backend (campo `resolver` do registro): dados que só o banco tem.
const RESOLVEDORES = {
  candidatosBaixa: async ({ req, parametros, hoje, textoPedido }) => {
    // "uns/próximo de/mais ou menos" no texto: o valor nunca filtra, mesmo que o modelo diga exato.
    if (valorDitoAproximado(textoPedido)) parametros.valor_exato = false
    return { candidatos: await buscarCandidatosBaixa(req.user, parametros, hoje) }
  },
}

let cliente = null
const anthropic = () => (cliente ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 50_000 }))

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
    const perfilAtivo = typeof body?.perfilAtivo === 'string' ? body.perfilAtivo.slice(0, 80) : null

    if (texto.length > MAX_TEXTO) return res.status(400).json({ error: `Texto muito longo (máximo ${MAX_TEXTO} caracteres).` })
    if (!texto && !imagem) return res.status(400).json({ error: 'Escreva, fale ou envie uma foto.' })
    if (imagem) {
      if (!MIMES.has(mime)) return res.status(400).json({ error: 'Formato de imagem não aceito (use JPG, PNG ou WebP).' })
      if (Math.floor(imagem.length * 3 / 4) > MAX_IMAGEM_BYTES) return res.status(413).json({ error: 'Imagem muito grande (máximo ~2 MB).' })
    }

    const textoPedido = `${texto} ${pergunta} ${resposta}`
    if (ehPedidoDeExclusao(`${texto} ${resposta}`)) return res.json({ ferramenta: 'perguntar', parametros: RESPOSTA_EXCLUSAO })
    if (ehPedidoDeEstorno(`${texto} ${resposta}`)) {
      return res.json({ ferramenta: 'abrir_tela', parametros: { destino: 'estornar', filtro: texto.slice(0, 80) || null, cartao_id: null, mes: null } })
    }

    await ensureIaSchema()
    // Limite diário por usuário (configurável por cliente): antes de chamar o modelo.
    const bloqueio = bloqueioDoLimite(await usoDoDia(req.user?.id), await limitesDoCliente(req.ambiente?.id), !!imagem)
    if (bloqueio) return res.status(429).json({ error: bloqueio, codigo: 'limite_ia' })

    const ctx = await montarContexto(req.user, undefined, { perfilAtivo })
    ctx.textoPedido = textoPedido
    ctx.temImagem = !!imagem
    const hoje = hojeSaoPaulo()
    const podeFn = (modulo, acao) => pode(req.user, modulo, acao)
    const acoes = acoesDoPedido(textoPedido, podeFn)
    const disponiveis = new Set(acoes.map(a => a.id))

    const partes = [`Hoje é ${hoje}.`, texto ? `Pedido: ${texto}` : 'Pedido: (veja a imagem)']
    if (resposta) partes.push(`Você perguntou: ${pergunta || '(pergunta anterior)'}`, `Resposta do usuário: ${resposta}`)
    const content = [
      ...(imagem ? [{ type: 'image', source: { type: 'base64', media_type: mime, data: imagem } }] : []),
      { type: 'text', text: partes.join('\n') },
    ]

    const inicio = Date.now()
    const msg = await anthropic().messages.create({
      model: MODELO,
      // Lote: até 10 chamadas enxutas (regra 17). Só se paga o que sai; 1 item custa o mesmo.
      // Tempo: SDK 50 s, função 60 s (vercel.json).
      max_tokens: 12_000,
      output_config: { effort: 'low' },
      tools: acoes.map(a => definicaoFerramenta(a, podeFn, { gerencial: ctx.gerencialLigado })),
      tool_choice: { type: 'auto' },
      // Bloco estável (instruções + cadastros) com cache; a data e o pedido vão na mensagem.
      system: [
        { type: 'text', text: instrucoes(ctx.gerencialLigado) },
        { type: 'text', text: `# CADASTROS DO USUÁRIO\n${textoCadastros(ctx)}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content }],
    })

    // Vários lançamentos/agendamentos no mesmo pedido → lote (src/lib/assistente/lote.js); senão o
    // 1º bloco, como sempre. Um pedido só no limite diário, com ou sem lote.
    const cortada = msg.stop_reason === 'max_tokens'
    const { lote, blocos, total } = blocosDoPedido(msg.content, disponiveis, { cortada })
    const bloco = blocos[0]
    const ferramenta = lote ? 'lote' : bloco ? bloco.name : 'perguntar'
    // Só a marca "teve imagem" — a imagem não é gravada nem logada em lugar nenhum.
    await registrarUso({
      ambiente: req.ambiente?.sigla, ferramenta, usage: msg.usage, comImagem: !!imagem, usuario: req.user?.id,
      modelo: msg.model || MODELO, duracaoMs: Date.now() - inicio, stopReason: msg.stop_reason || null,
    })
    // Só números (sem texto do pedido): tempo e tamanho da resposta, para acompanhar o lote.
    if (lote || cortada) console.info(`[api/assistente] ${ferramenta} ${blocos.length} item(ns), ${msg.usage?.output_tokens} tokens de saída, ${Date.now() - inicio} ms${cortada ? ', CORTADA' : ''}`)

    if (msg.stop_reason === 'refusal') {
      return res.json({ ferramenta: 'perguntar', parametros: { pergunta: 'Não consegui ajudar com esse pedido. Posso registrar, consultar ou abrir a tela certa no Finup.', opcoes: [] } })
    }
    if (!bloco) {
      const t = msg.content.find(b => b.type === 'text')?.text
      return res.json({ ferramenta: 'perguntar', parametros: validarParametros('perguntar', { pergunta: t, opcoes: [] }, ctx, hoje) })
    }
    if (lote) {
      // Cada item pelo validador de sempre, com o trecho do pedido que é dele (parcelas/moeda).
      const valores = blocos.map(b => b.input?.valor)
      const trechos = trechosDosItens(textoPedido, valores)
      const itens = blocos.map((b, i) => ({ ferramenta: b.name, parametros: validarParametros(b.name, b.input, { ...ctx, lote: true, trechoItem: trechos[i] }, hoje) }))
      // Nunca perder em silêncio: resposta cortada ou a IA contou mais movimentos do que leu.
      const faltantes = faltantesDoLote({ texto: texto || textoPedido, valores, total, cortada })
      const comGerencial = blocos.find((b, i) => itens[i].parametros?.conta_gerencial
        || [b.input?.conta_id, b.input?.conta_destino_id].some(id => ctx.idx.contas.get(id)?.papel === 'gerencial'))
      if (!comGerencial && !gerencialCitada(ctx, `${texto} ${resposta}`)) {
        for (const it of itens) delete it.parametros.conta_gerencial
        return res.json({ ferramenta: 'lote', itens, faltantes })
      }
      // Conta gerencial em algum item: mesma resposta do pedido de 1 item (abrir a tela da conta).
      return res.json({
        ferramenta: 'abrir_tela',
        parametros: { destino: 'tela_contas', filtro: null, cartao_id: null, mes: null, motivo: 'conta_gerencial', conta_id: null, mensagem: MENSAGEM_CONTA_GERENCIAL(null) },
      })
    }
    const parametros = validarParametros(ferramenta, bloco.input, ctx, hoje)
    if (GRAVAM.has(ferramenta)) {
      const escolhida = [bloco.input?.conta_id, bloco.input?.conta_destino_id]
        .map(id => ctx.idx.contas.get(id)).find(c => c?.papel === 'gerencial')
      const citada = escolhida ? null : gerencialCitada(ctx, `${texto} ${resposta}`)
      if (parametros?.conta_gerencial || citada) {
        const conta = escolhida || (citada?.id ? citada : null)
        return res.json({
          ferramenta: 'abrir_tela',
          parametros: {
            destino: 'tela_contas', filtro: null, cartao_id: null, mes: null,
            motivo: 'conta_gerencial', conta_id: conta?.id || null, mensagem: MENSAGEM_CONTA_GERENCIAL(conta?.apelido || conta?.name || null),
          },
        })
      }
      delete parametros.conta_gerencial
    }
    const resolver = RESOLVEDORES[acoes.find(a => a.id === ferramenta)?.resolver]
    const extra = resolver ? await resolver({ req, parametros, hoje, textoPedido }) : {}
    return res.json({ ferramenta, parametros, ...extra })
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
