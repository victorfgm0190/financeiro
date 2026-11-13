import process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'
import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { centralQuery } from './_central.js'
import { pode } from '../src/lib/permissoes.js'
import { ensureIaSchema, registrarUso, usoDoDia } from './_ia.js'
import { limitesDoAmbiente, bloqueioDoLimite } from '../src/lib/assistente/limiteIa.js'
import { RECURSO_IA_IMPORTACAO, recursoLiberado } from '../src/lib/recursosCliente.js'
import {
  MODELO_SUGESTAO, FERRAMENTA_SUGESTAO, DEFINICAO_SUGESTAO, INSTRUCOES_SUGESTAO, MAX_ITENS, PRAZO_MS,
  montarPedido, interpretarResposta,
} from './_iaImportacao.js'

// SUGESTÕES DO ASSISTENTE NA IMPORTAR FATURA (Etapa 6c). A IA só SUGERE: nada é gravado aqui além do
// consumo (ia_uso). Ordem das conferências, a CADA chamada:
//   1. recurso liberado para o cliente — ambientes.modulos no CENTRAL, lido na hora (sem o cache do
//      ambiente): tirar a liberação desliga na mesma chamada seguinte;
//   2. opção do cliente ligada (configuracoes.ia_sugestoes_importacao, no banco do ambiente);
//   3. permissão de incluir em Importar Fatura; 4. chave da IA; 5. limite diário do usuário.
// Qualquer recusa responde { indisponivel: true, motivo } e NÃO chama a IA.
//   GET  → { liberado, ligado }   (a tela decide se mostra a opção / se pede sugestões)
//   POST { itens, perfilId, fatura } → { sugestoes } (uma chamada à IA, até 40 itens)
// Falha da IA (fora do ar, prazo de 10 s, sem créditos): { indisponivel: true, motivo: 'ia' } — a tela
// segue como sem o Assistente.

let clientePadrao = null
const anthropicPadrao = () => (clientePadrao ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: PRAZO_MS }))

async function limitesPadrao(ambienteId) {
  try {
    const [row] = await centralQuery('SELECT ia_limite_diario, ia_limite_imagem FROM ambientes WHERE id = $1', [ambienteId])
    return limitesDoAmbiente(row)
  } catch {
    return limitesDoAmbiente(null)
  }
}

export const DEPENDENCIAS = {
  autenticar: (req, res) => requireAuth(req, res),
  q: (sql, p) => query(sql, p),
  central: (sql, p) => centralQuery(sql, p),
  ia: () => anthropicPadrao(),
  temChave: () => !!process.env.ANTHROPIC_API_KEY,
  registrarUso: (dados) => registrarUso(dados),
  usoDoDia: (usuario) => usoDoDia(usuario),
  limites: (ambienteId) => limitesPadrao(ambienteId),
  prepararIa: () => ensureIaSchema(),
}

// Liberação no central, lida agora.
async function liberadoNoCentral(deps, ambienteId) {
  if (!ambienteId) return false
  const [row] = await deps.central('SELECT modulos FROM ambientes WHERE id = $1', [ambienteId])
  return recursoLiberado(row?.modulos, RECURSO_IA_IMPORTACAO)
}

// Opção do cliente + controle gerencial (banco do ambiente). Sem a coluna (migração pendente) → desligada.
async function opcaoDoCliente(deps) {
  try {
    const [row] = await deps.q('SELECT ia_sugestoes_importacao, controle_gerencial FROM configuracoes WHERE id = 1')
    return { ligado: row?.ia_sugestoes_importacao === true, gerencial: row?.controle_gerencial !== false }
  } catch (err) {
    if (err?.code === '42703') return { ligado: false, gerencial: true }
    throw err
  }
}

const recusa = (res, status, motivo) => res.status(status).json({ indisponivel: true, motivo })

export function criarHandler(deps = DEPENDENCIAS) {
  return async function handler(req, res) {
    if (!deps.autenticar(req, res)) return
    res.setHeader('Cache-Control', 'no-store')
    const ambienteId = req.ambiente?.id
    try {
      if (req.method === 'GET') {
        const liberado = await liberadoNoCentral(deps, ambienteId)
        const { ligado } = liberado ? await opcaoDoCliente(deps) : { ligado: false }
        return res.json({ liberado, ligado: liberado && ligado })
      }
      if (req.method !== 'POST') return res.status(405).end()

      if (!(await liberadoNoCentral(deps, ambienteId))) return recusa(res, 403, 'nao_liberado')
      const opcao = await opcaoDoCliente(deps)
      if (!opcao.ligado) return recusa(res, 403, 'desligado')
      if (!pode(req.user, 'importar', 'incluir')) return recusa(res, 403, 'sem_permissao')
      if (!deps.temChave()) return recusa(res, 503, 'ia')

      const body = await parseBody(req)
      const itens = Array.isArray(body?.itens) ? body.itens.slice(0, MAX_ITENS) : []
      if (!itens.length) return res.json({ sugestoes: [], semItens: true })

      await deps.prepararIa()
      const bloqueio = bloqueioDoLimite(await deps.usoDoDia(req.user?.id), await deps.limites(ambienteId), false)
      if (bloqueio) return recusa(res, 429, 'limite')

      const [categorias, grupos, favorecidos] = await Promise.all([
        deps.q('SELECT id, name, type, category_group, perfil_ids FROM categorias'),
        opcao.gerencial ? deps.q('SELECT id, name FROM reservas_funcoes ORDER BY name') : Promise.resolve(null),
        deps.q('SELECT name FROM favorecidos'),
      ])
      const { mensagem, mapas } = montarPedido(
        { itens, perfilId: typeof body?.perfilId === 'string' ? body.perfilId : null, fatura: typeof body?.fatura === 'string' ? body.fatura.slice(0, 7) : null },
        { categorias, grupos, favorecidos },
      )

      const inicio = Date.now()
      let msg
      try {
        msg = await deps.ia().messages.create({
          model: MODELO_SUGESTAO,
          max_tokens: 4000,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: INSTRUCOES_SUGESTAO, cache_control: { type: 'ephemeral' } }],
          tools: [DEFINICAO_SUGESTAO],
          tool_choice: { type: 'tool', name: FERRAMENTA_SUGESTAO },
          messages: [{ role: 'user', content: JSON.stringify(mensagem) }],
        })
      } catch (err) {
        console.error('[api/ia-importacao] IA indisponível:', err?.status || '', err?.name || err?.message)
        return recusa(res, 503, 'ia')
      }
      const duracaoMs = Date.now() - inicio
      await deps.registrarUso({
        ambiente: req.ambiente?.sigla, ferramenta: 'sugestao_importacao', usage: msg.usage, usuario: req.user?.id,
        modelo: msg.model || MODELO_SUGESTAO, duracaoMs, stopReason: msg.stop_reason || null,
      })
      const bloco = (msg.content || []).find(b => b.type === 'tool_use' && b.name === FERRAMENTA_SUGESTAO)
      const { sugestoes, descartados } = interpretarResposta(bloco?.input, mapas)
      if (descartados.length) console.info(`[api/ia-importacao] ${descartados.length} sugestão(ões) descartada(s):`, JSON.stringify(descartados))
      console.info(`[api/ia-importacao] ${itens.length} item(ns), ${sugestoes.length} sugestão(ões), ${msg.usage?.input_tokens ?? '?'}+${msg.usage?.output_tokens ?? '?'} tokens, ${duracaoMs} ms`)
      return res.json({ sugestoes, itens: itens.length, duracaoMs })
    } catch (err) {
      console.error('[api/ia-importacao]', err?.message)
      return recusa(res, 503, 'falha')
    }
  }
}

export default comAmbiente(criarHandler())
