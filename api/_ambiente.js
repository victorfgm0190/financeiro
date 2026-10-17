import process from 'node:process'
import { verifyToken } from './_auth.js'
import { buscarAmbientePorSigla, ambienteAtivo } from './_central.js'
import { rodarNoAmbiente } from './_conexao.js'
import { ambienteDoHost, AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'

// AMBIENTE DA REQUISIÇÃO. Toda rota protegida exporta `export default comAmbiente(handler)`:
//   1) token válido (senão 401);
//   2) o ambiente do token tem de ser o do ENDEREÇO: no www (e no vercel.app/localhost, que usam
//      AMBIENTE_PADRAO) só vale token do ambiente principal; em <sigla>.finup.app.br só token
//      daquela sigla. Diferente → 401;
//   3) ambiente existe no central e está 'ativo' (suspenso/cancelado/provisionando → 403);
//   4) o handler roda dentro do contexto do ambiente (query() & cia. usam o banco dele).
// O api/_db.test.js (teste "todas as rotas") falha se uma rota nova esquecer o wrapper.

export const ERRO_AMBIENTE_INDISPONIVEL = 'Ambiente indisponível'

export function hostDoReq(req) {
  const h = req.headers || {}
  return String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim()
}

export const ambienteDoReq = (req, env = process.env) => ambienteDoHost(hostDoReq(req), env.AMBIENTE_PADRAO)

// Sigla do ambiente do token. Token anterior aos ambientes (sem amb) só existia no ambiente
// principal: vale como ele até expirar (12 h).
export const siglaDoToken = (p) => (p?.amb ? String(p.amb_sigla || '').toLowerCase() || null : AMBIENTE_PRINCIPAL)

// Campos do ambiente no payload do JWT.
export const comAmbienteNoPayload = (payload, amb) => ({ ...payload, amb: amb.id, amb_sigla: amb.sigla })

export function comAmbiente(handler) {
  const envolvido = async function rotaComAmbiente(req, res) {
    const payload = verifyToken(req)
    if (!payload) return res.status(401).json({ error: 'Unauthorized' })
    const doEndereco = ambienteDoReq(req)
    const sigla = siglaDoToken(payload)
    if (!doEndereco.sigla || sigla !== doEndereco.sigla) return res.status(401).json({ error: 'Unauthorized' })

    let amb
    try {
      amb = await buscarAmbientePorSigla(sigla)
    } catch (err) {
      console.error('[ambiente] falha ao consultar o central:', err.message)
      return res.status(500).json({ error: 'Falha ao identificar o ambiente' })
    }
    if (!amb || (payload.amb && payload.amb !== amb.id)) return res.status(401).json({ error: 'Unauthorized' })
    if (!ambienteAtivo(amb)) return res.status(403).json({ error: ERRO_AMBIENTE_INDISPONIVEL })

    req.ambiente = amb
    return rodarNoAmbiente(amb, () => handler(req, res))
  }
  envolvido.comAmbiente = true
  return envolvido
}
