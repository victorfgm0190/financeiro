import { parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { temTodosPerfis } from '../src/lib/permissoes.js'
import {
  ErroVirada, statusVirada, previaVirada, confirmarVirada, desfazerVirada, marcarRecalculosVistos, refazerRecalculo,
  ajustarPendencia, reabrirPendencia, refazerRendimentosNoBanco,
} from './_viradaReservaServidor.js'

// Virada de saldo assistida das Reservas (src/lib/viradaReserva.js).
//   GET  ?hoje=YYYY-MM-DD           → status: pendências, pergunta ligada?, última virada, recálculos
//   POST { acao: 'previa', fim }      → recalcula o Razão do período no banco e devolve a prévia
//   POST { acao: 'confirmar', fim, chave, decisoes } → grava UM mês (transação, trava, idempotente)
//   POST { acao: 'pendencia_ajustar', id, functionId, valor, observacao } → Ajuste no período aberto
//   POST { acao: 'pendencia_reabrir', id } → desfaz do fechamento mais recente até o mês do lançamento
//   POST { acao: 'rendimentos_refazer', desde } → refaz o rateio dos rendimentos a partir da data
//   POST { acao: 'desfazer' }         → desfaz a virada assistida mais recente
//   POST { acao: 'ciente', ids }      → marca avisos de recálculo como vistos
//   POST { acao: 'recalcular' }       → refaz o recálculo que ficou pendente (falha anterior)
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
      if (restrito && st.disponivel) return res.json({ ...st, pendentes: [], pendenciasFechado: [], perguntar: false, podeDesfazer: false, restrito: true })
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
    if (acao === 'confirmar') return res.json(await confirmarVirada({ fim: body.fim, chave: body.chave || null, decisoes: body.decisoes || null, hoje: body.hoje, usuario }))
    if (acao === 'desfazer') return res.json(await desfazerVirada({ usuario, hoje: body.hoje }))
    if (acao === 'pendencia_ajustar') return res.json(await ajustarPendencia({ id: body.id, functionId: body.functionId, valor: body.valor, observacao: body.observacao, usuario, hoje: body.hoje }))
    if (acao === 'pendencia_reabrir') return res.json(await reabrirPendencia({ id: body.id, usuario, hoje: body.hoje }))
    if (acao === 'rendimentos_refazer') return res.json(await refazerRendimentosNoBanco({ desde: body.desde, hoje: body.hoje }))
    if (acao === 'recalcular') return res.json({ ok: true, mudancas: (await refazerRecalculo()).length })
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
