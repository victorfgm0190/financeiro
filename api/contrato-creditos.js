import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { normalizarCredito, exigirModulo, contratoVisivel, perfisDoUsuario, comNumeros, colunasDe, valorColuna } from './_contratos.js'

// CRÉDITOS A ABATER ("do proprietário" no aluguel): itens do boleto do condomínio que são do dono,
// ou créditos manuais, abatidos na cobrança principal. Só controle — nunca gera lançamento (o
// abatimento aparece na composição da parcela). destino_agendamento_id: parcela escolhida à mão.
//   GET [?contrato_id=x]       → { creditos } (dos contratos visíveis)
//   POST { contrato_id, ... }  → cria (status 'aberto')
//   PUT  { id, ... }           → altera os campos enviados (compensar / reabrir / corrigir)
//   DELETE ?id=x               → exclui (estorno do pagamento que o gerou)

const COLS = ['origem_lancamento_id', 'origem_agendamento_id', 'itens', 'descricao', 'valor', 'data_origem', 'status',
  'compensado_em_lancamento_id', 'compensado_em_agendamento_id', 'data_compensacao', 'destino_agendamento_id']

// Só as colunas que o banco já tem (destino_agendamento_id chega com a migração 2026-11-03).
const colunasGravaveis = async (dados) => {
  const existem = await colunasDe(query, 'contrato_creditos')
  return COLS.filter(k => k in dados && existem.has(k))
}

async function creditoVisivel(id, user) {
  const [c] = await query('SELECT * FROM contrato_creditos WHERE id = $1', [String(id || '')])
  if (!c || !(await contratoVisivel(query, c.contrato_id, user))) return null
  return c
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  try {
    if (req.method === 'GET') {
      const contratoId = queryParam(req, 'contrato_id')
      if (contratoId) {
        if (!(await contratoVisivel(query, contratoId, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
        const rows = await query('SELECT * FROM contrato_creditos WHERE contrato_id = $1 ORDER BY data_origem, created_at', [contratoId])
        return res.json({ creditos: rows.map(comNumeros) })
      }
      const perfis = perfisDoUsuario(req.user)
      const rows = perfis
        ? await query(`SELECT cr.* FROM contrato_creditos cr JOIN contratos c ON c.id = cr.contrato_id
            WHERE c.perfil_id = ANY($1) ORDER BY cr.data_origem, cr.created_at`, [perfis])
        : await query('SELECT * FROM contrato_creditos ORDER BY data_origem, created_at')
      return res.json({ creditos: rows.map(comNumeros) })
    }
    if (req.method === 'POST') {
      const body = await parseBody(req)
      if (!(await contratoVisivel(query, body?.contrato_id, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      const { erro, dados } = normalizarCredito(body)
      if (erro) return res.status(400).json({ error: erro })
      const cols = await colunasGravaveis(dados)
      const [row] = await query(
        `INSERT INTO contrato_creditos (contrato_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
        [body.contrato_id, ...cols.map(k => valorColuna(k, dados[k]))],
      )
      return res.json({ ok: true, credito: comNumeros(row) })
    }
    if (req.method === 'PUT') {
      const body = await parseBody(req)
      if (!(await creditoVisivel(body?.id, req.user))) return res.status(404).json({ error: 'Crédito não encontrado' })
      const { erro, dados } = normalizarCredito(body, { parcial: true })
      if (erro) return res.status(400).json({ error: erro })
      const cols = await colunasGravaveis(dados)
      if (!cols.length) return res.status(400).json({ error: 'Nada para alterar' })
      const [row] = await query(
        `UPDATE contrato_creditos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
        [body.id, ...cols.map(k => valorColuna(k, dados[k]))],
      )
      return res.json({ ok: true, credito: comNumeros(row) })
    }
    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      if (!(await creditoVisivel(id, req.user))) return res.status(404).json({ error: 'Crédito não encontrado' })
      await query('DELETE FROM contrato_creditos WHERE id = $1', [id])
      return res.json({ ok: true, id })
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/contrato-creditos]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
