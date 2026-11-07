import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { exigirModulo, contratoVisivel, normalizarCompetencia, colunasDe, MSG_SEM_COMPOSICAO } from './_contratos.js'
import { sincronizarBenfeitorias, bensDoMapa } from './_benfeitoriasContrato.js'

// COMPOSIÇÃO DO REPASSE por competência (contrato a receber por administradora) — tabela
// contrato_competencias, a ÚNICA fonte da verdade da composição (a cópia no agendamento é só para
// exibir). Fora do /api/sync, como as demais tabelas do módulo.
//   GET ?contrato_id=x                                         → { competencias }
//   PUT { contrato_id, competencia, itens, status, observacao, repasse_lancamento_id, data_pagamento_inquilino? }
//     (data_pagamento_inquilino / conferencia ausentes = mantém o gravado; migrações 2026-11-07e e 07f)
//                                                   → grava (cria ou substitui) → { competencia, bens }
//   DELETE ?contrato_id=x&competencia=AAAA-MM       → volta ao padrão do contrato → { bens }
// Benfeitoria com "somar ao custo do bem" (e bem ligado ao contrato) vira movimento no bem na MESMA
// transação (api/_benfeitoriasContrato.js); `bens` = [{ id, saldo }] que mudaram, para o app copiar.

const linhaNumerica = (r) => r && ({ ...r, itens: Array.isArray(r.itens) ? r.itens : [] })
const semTabela = async () => !(await query("SELECT to_regclass('contrato_competencias') IS NOT NULL AS t"))[0]?.t

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  try {
    if (await semTabela()) {
      if (req.method === 'GET') return res.json({ competencias: [] })
      return res.status(409).json({ error: MSG_SEM_COMPOSICAO, codigo: 'banco_desatualizado' })
    }
    if (req.method === 'GET') {
      const id = queryParam(req, 'contrato_id')
      if (!(await contratoVisivel(query, id, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      const rows = await query('SELECT * FROM contrato_competencias WHERE contrato_id = $1 ORDER BY competencia', [id])
      return res.json({ competencias: rows.map(linhaNumerica) })
    }
    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const c = await contratoVisivel(query, body?.contrato_id, req.user)
      if (!c) return res.status(404).json({ error: 'Contrato não encontrado' })
      if (!c.modo_repasse) return res.status(400).json({ error: 'Composição do repasse só em contrato a receber por administradora' })
      const { erro, dados, temDataPagamento, temConferencia } = normalizarCompetencia(body)
      if (erro) return res.status(400).json({ error: erro })
      const cols = await colunasDe(query, 'contrato_competencias')
      // Colunas de migrações posteriores (07e data do pagamento, 07f conferência do extrato): campo
      // ausente no corpo = mantém o gravado; banco sem a coluna recusa só quando vem valor.
      const pedidos = [
        { col: 'data_pagamento_inquilino', valor: dados.data_pagamento_inquilino, tem: temDataPagamento },
        { col: 'conferencia', valor: dados.conferencia == null ? null : JSON.stringify(dados.conferencia), tem: temConferencia },
      ]
      if (pedidos.some(o => !cols.has(o.col) && o.valor != null)) return res.status(409).json({ error: MSG_SEM_COMPOSICAO, codigo: 'banco_desatualizado' })
      const opcionais = pedidos.filter(o => cols.has(o.col))
      const r = await withTransaction(async (q) => {
        const params = [c.id, dados.competencia, JSON.stringify(dados.itens), dados.status, dados.observacao, dados.repasse_lancamento_id]
        const insCols = ['contrato_id', 'competencia', 'itens', 'status', 'observacao', 'repasse_lancamento_id']
        const insVals = params.map((_, i) => `$${i + 1}`)
        const sets = []
        for (const o of opcionais) {
          params.push(o.valor, o.tem)
          const pv = params.length - 1
          insCols.push(o.col)
          insVals.push(`$${pv}`)
          sets.push(`${o.col} = CASE WHEN $${pv + 1} THEN EXCLUDED.${o.col} ELSE contrato_competencias.${o.col} END,`)
        }
        const [row] = await q(
          `INSERT INTO contrato_competencias (${insCols.join(', ')})
           VALUES (${insVals.join(', ')})
           ON CONFLICT (contrato_id, competencia)
           DO UPDATE SET itens = EXCLUDED.itens, status = EXCLUDED.status, observacao = EXCLUDED.observacao,
             repasse_lancamento_id = EXCLUDED.repasse_lancamento_id, ${sets.join(' ')}
             updated_at = now()
           RETURNING *`,
          params,
        )
        const tocados = await sincronizarBenfeitorias(q, c, dados.competencia, dados.itens)
        return { row, bens: bensDoMapa(tocados) }
      })
      return res.json({ ok: true, competencia: linhaNumerica(r.row), bens: r.bens })
    }
    if (req.method === 'DELETE') {
      const id = queryParam(req, 'contrato_id')
      const comp = queryParam(req, 'competencia')
      const c = await contratoVisivel(query, id, req.user)
      if (!c) return res.status(404).json({ error: 'Contrato não encontrado' })
      const bens = await withTransaction(async (q) => {
        await q('DELETE FROM contrato_competencias WHERE contrato_id = $1 AND competencia = $2', [id, String(comp || '')])
        return bensDoMapa(await sincronizarBenfeitorias(q, c, String(comp || ''), []))
      })
      return res.json({ ok: true, bens })
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/contrato-competencias]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
