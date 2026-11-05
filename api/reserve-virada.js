import { parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { temTodosPerfis } from '../src/lib/permissoes.js'
import {
  ErroVirada, statusVirada, previaVirada, confirmarVirada, desfazerVirada, marcarRecalculosVistos,
} from './_viradaReservaServidor.js'

// Virada de saldo assistida das Reservas (src/lib/viradaReserva.js).
//   GET  ?hoje=YYYY-MM-DD           → status: pendências, pergunta ligada?, última virada, recálculos
//   POST { acao: 'previa', fim }      → recalcula o Razão do período no banco e devolve a prévia
//   POST { acao: 'confirmar', fim, chave } → grava UM mês (transação, trava, idempotente pela chave)
//   POST { acao: 'desfazer' }         → desfaz a virada assistida mais recente
//   POST { acao: 'ciente', ids }      → marca avisos de recálculo como vistos
// Gravar exige reservas/editar (regraDaRota). A virada fecha TODAS as funções do ambiente: usuário
// restrito a alguns perfis não faz virada (veria/fecharia só parte).

function qp(req, key) {
  if (req.query?.[key] != null) return req.query[key]
  try { return new URL(req.url, 'http://x').searchParams.get(key) } catch { return null }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  const restrito = !temTodosPerfis(req.user?.perfis)
  try {
    if (req.method === 'GET') {
      const st = await statusVirada({ hoje: qp(req, 'hoje') })
      if (restrito && st.disponivel) return res.json({ ...st, pendentes: [], perguntar: false, podeDesfazer: false, restrito: true })
      return res.json(st)
    }
    if (req.method !== 'POST') return res.status(405).end()
    const body = await parseBody(req)
    const acao = body?.acao
    if (acao === 'ciente') return res.json({ ok: true, vistos: await marcarRecalculosVistos(body.ids) })
    if (restrito) {
      return res.status(403).json({ error: 'A virada fecha todas as funções de reserva do ambiente; seu acesso é limitado a alguns perfis.', codigo: 'perfis_restritos' })
    }
    const usuario = req.user?.username || req.user?.sub || null
    if (acao === 'previa') return res.json(await previaVirada({ fim: body.fim, hoje: body.hoje }))
    if (acao === 'confirmar') return res.json(await confirmarVirada({ fim: body.fim, chave: body.chave || null, hoje: body.hoje, usuario }))
    if (acao === 'desfazer') return res.json(await desfazerVirada({ usuario, hoje: body.hoje }))
    return res.status(400).json({ error: 'Ação desconhecida.' })
  } catch (err) {
    if (err instanceof ErroVirada) return res.status(err.status).json({ error: err.message, codigo: err.codigo, ...err.extra })
    // Duas sessões ao mesmo tempo: o índice único segura a segunda.
    if (err?.code === '23505') return res.status(409).json({ error: 'Este mês acabou de ser fechado por outra sessão. Recarregue a tela de Reservas.', codigo: 'mes_ja_fechado' })
    console.error('[api/reserve-virada]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
