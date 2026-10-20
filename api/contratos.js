import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { contasPermitidas } from './_permissoesApi.js'
import {
  normalizarContrato, normalizarItem, normalizarEvento, exigirModulo, perfisDoUsuario, contratoVisivel,
  inserirEvento, substituirItens, hojeIso, comNumeros, CAMPOS_CONTRATO,
} from './_contratos.js'

// CONTRATOS (módulo opcional do plano). As parcelas são agendamentos com contrato_id — gravados pelo
// app no /api/sync como qualquer agendamento; esta rota cuida só da ficha.
//   GET                          → { contratos: [...] } (com `excluidas`: parcelas excluídas à mão)
//   GET ?id=x                    → { contrato, itens, eventos }
//   POST { contrato, itens }     → cria + itens + evento 'criacao', numa transação
//   PUT  { id, contrato, evento? } → altera os campos enviados (+ evento, mesma transação)
//   DELETE ?id=x                 → exclui (409 se alguma parcela gerada já foi paga)

const SQL_LISTA = `SELECT c.*,
    COALESCE((SELECT json_agg(e.detalhes->>'parcela_id') FROM contrato_eventos e
               WHERE e.contrato_id = c.id AND e.tipo = 'edicao_parcela' AND e.detalhes->>'acao' = 'exclusao'), '[]'::json) AS excluidas
  FROM contratos c`

// Conta do contrato: tem de ser conta (cartão fica de fora na 1ª versão) e, com perfis restritos,
// de um perfil permitido. Devolve a mensagem de erro ou null.
async function conferirConta(q, contaId, perfis) {
  if (!contaId) return null
  const [c] = await q('SELECT id FROM contas WHERE id = $1', [contaId])
  if (!c) return 'Conta inválida (cartão de crédito não é aceito em contrato)'
  if (perfis && !(await contasPermitidas(q, perfis)).has(contaId)) return 'Conta de um perfil sem acesso'
  return null
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  const perfis = perfisDoUsuario(req.user)
  try {
    if (req.method === 'GET') {
      const id = queryParam(req, 'id')
      if (id) {
        const c = await contratoVisivel(query, id, req.user)
        if (!c) return res.status(404).json({ error: 'Contrato não encontrado' })
        const [itens, eventos] = await Promise.all([
          query('SELECT * FROM contrato_itens WHERE contrato_id = $1 ORDER BY grupo, descricao', [id]),
          query('SELECT * FROM contrato_eventos WHERE contrato_id = $1 ORDER BY data_evento DESC, created_at DESC', [id]),
        ])
        return res.json({ contrato: comNumeros(c), itens: itens.map(comNumeros), eventos: eventos.map(comNumeros) })
      }
      const rows = perfis
        ? await query(`${SQL_LISTA} WHERE c.perfil_id = ANY($1) ORDER BY c.created_at DESC`, [perfis])
        : await query(`${SQL_LISTA} ORDER BY c.created_at DESC`)
      return res.json({ contratos: rows.map(comNumeros) })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const { erro, dados } = normalizarContrato(body?.contrato)
      if (erro) return res.status(400).json({ error: erro })
      if (perfis && !perfis.includes(dados.perfil_id)) return res.status(403).json({ error: 'Perfil sem acesso' })
      const itens = []
      for (const it of Array.isArray(body?.itens) ? body.itens.slice(0, 50) : []) {
        const r = normalizarItem(it)
        if (r.erro) return res.status(400).json({ error: r.erro })
        itens.push(r.item)
      }
      const erroConta = await conferirConta(query, dados.conta_id, perfis)
      if (erroConta) return res.status(400).json({ error: erroConta })
      const cols = Object.keys(dados)
      const r = await withTransaction(async (q) => {
        const [c] = await q(
          `INSERT INTO contratos (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
          cols.map(k => dados[k]),
        )
        const its = await substituirItens(q, c.id, itens)
        const ev = await inserirEvento(q, c.id, {
          tipo: 'criacao', data_evento: hojeIso(), indice: c.indice_reajuste, percentual: null,
          valor_anterior: null, valor_novo: c.valor_base, detalhes: { data_inicio: c.data_inicio, data_fim: c.data_fim },
        })
        return { contrato: c, itens: its, eventos: [ev] }
      })
      return res.json({ ok: true, contrato: comNumeros({ ...r.contrato, excluidas: [] }), itens: r.itens.map(comNumeros), eventos: r.eventos.map(comNumeros) })
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const atual = await contratoVisivel(query, body?.id, req.user)
      if (!atual) return res.status(404).json({ error: 'Contrato não encontrado' })
      const { erro, dados } = normalizarContrato(body?.contrato || {}, { parcial: true })
      if (erro) return res.status(400).json({ error: erro })
      const fim = 'data_fim' in dados ? dados.data_fim : atual.data_fim
      const ini = 'data_inicio' in dados ? dados.data_inicio : atual.data_inicio
      if (fim && fim < ini) return res.status(400).json({ error: 'data_fim: antes do início' })
      if ('perfil_id' in dados && perfis && !perfis.includes(dados.perfil_id)) return res.status(403).json({ error: 'Perfil sem acesso' })
      if ('conta_id' in dados && dados.conta_id !== atual.conta_id) {
        const erroConta = await conferirConta(query, dados.conta_id, perfis)
        if (erroConta) return res.status(400).json({ error: erroConta })
      }
      let evento = null
      if (body?.evento) {
        const r = normalizarEvento(body.evento)
        if (r.erro) return res.status(400).json({ error: r.erro })
        evento = r.evento
      }
      // Colunas = chaves de CAMPOS_CONTRATO (lista fixa do código, nunca do body).
      const cols = Object.keys(dados).filter(k => k in CAMPOS_CONTRATO)
      const r = await withTransaction(async (q) => {
        const [c] = cols.length
          ? await q(
            `UPDATE contratos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
            [atual.id, ...cols.map(k => dados[k])],
          )
          : [atual]
        const ev = evento ? await inserirEvento(q, atual.id, evento) : null
        return { contrato: c, evento: ev }
      })
      return res.json({ ok: true, contrato: comNumeros(r.contrato), evento: comNumeros(r.evento) })
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      const atual = await contratoVisivel(query, id, req.user)
      if (!atual) return res.status(404).json({ error: 'Contrato não encontrado' })
      const [pagas] = await query(
        "SELECT count(*)::int AS n FROM agendamentos WHERE id LIKE $1 AND jsonb_array_length(COALESCE(registered, '[]'::jsonb)) > 0",
        [`ctr\\_${id.replace(/[\\%_]/g, '\\$&')}\\_%`],
      )
      if (pagas?.n > 0) return res.status(409).json({ error: 'Contrato com parcela paga não pode ser excluído — use Rescindir' })
      await query('DELETE FROM contratos WHERE id = $1', [id])
      return res.json({ ok: true, excluido: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/contratos]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
