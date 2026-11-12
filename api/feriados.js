import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { FERIADOS_AUTOMATICOS } from '../src/lib/feriados.js'
import { responderErro } from './_erro.js'

// CADASTRO DE FERIADOS (Configurações → Cadastros → Feriados), por cliente (banco do ambiente).
// Os nacionais/opcionais são gerados pelo app; aqui só o que o usuário mudou ou acrescentou.
//   GET                                  → { feriados }
//   POST { chave, ativo }                → liga/desliga um automático (upsert pela chave)
//   POST { nome, abrangencia, data | dia_mes, ativo } → feriado do usuário
//   PUT  { id, ... }                     → altera nome/abrangência/data/dia_mes/ativo
//   DELETE ?id=x                         → exclui um feriado do usuário (automático só desliga)
// Permissão: módulo Cadastros (src/lib/permissoes.js, ROTAS).

const ABRANGENCIAS = ['estadual', 'municipal']
const COLS = 'id, chave, nome, abrangencia, data, dia_mes, ativo'
const DATA = /^\d{4}-\d{2}-\d{2}$/
const DIA_MES = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const tabelaAusente = (err) => err?.code === '42P01'

// → { erro } | { dados }
export function normalizarFeriado(b, { parcial = false } = {}) {
  const dados = {}
  if (!parcial || 'nome' in b) {
    const nome = String(b?.nome || '').trim().slice(0, 120)
    if (!nome) return { erro: 'nome: obrigatório' }
    dados.nome = nome
  }
  if (!parcial || 'abrangencia' in b) {
    const a = b?.abrangencia || 'municipal'
    if (!ABRANGENCIAS.includes(a)) return { erro: 'abrangencia: estadual ou municipal' }
    dados.abrangencia = a
  }
  if (!parcial || 'data' in b || 'dia_mes' in b) {
    const data = b?.data ? String(b.data) : null
    const diaMes = b?.dia_mes ? String(b.dia_mes) : null
    if (data && !DATA.test(data)) return { erro: 'data: use AAAA-MM-DD' }
    if (diaMes && !DIA_MES.test(diaMes)) return { erro: 'dia_mes: use MM-DD' }
    if (!data && !diaMes) return { erro: 'Informe a data (ou o dia e mês, para todo ano).' }
    dados.data = diaMes ? null : data
    dados.dia_mes = diaMes
  }
  if (!parcial || 'ativo' in b) dados.ativo = b?.ativo !== false
  return { dados }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      try {
        return res.json({ feriados: await query(`SELECT ${COLS} FROM feriados ORDER BY COALESCE(data, dia_mes), nome`) })
      } catch (err) {
        if (tabelaAusente(err)) return res.json({ feriados: [], semTabela: true })
        throw err
      }
    }
    if (req.method === 'POST') {
      const b = await parseBody(req)
      if (b?.chave) {
        const auto = FERIADOS_AUTOMATICOS.find(f => f.chave === b.chave)
        if (!auto) return res.status(400).json({ error: 'Feriado automático desconhecido.' })
        const [row] = await query(
          `INSERT INTO feriados (chave, nome, abrangencia, ativo) VALUES ($1, $2, $3, $4)
             ON CONFLICT (chave) DO UPDATE SET ativo = EXCLUDED.ativo RETURNING ${COLS}`,
          [auto.chave, auto.nome, auto.abrangencia, b.ativo !== false],
        )
        return res.json({ ok: true, feriado: row })
      }
      const { erro, dados } = normalizarFeriado(b)
      if (erro) return res.status(400).json({ error: erro })
      const [row] = await query(
        `INSERT INTO feriados (nome, abrangencia, data, dia_mes, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
        [dados.nome, dados.abrangencia, dados.data, dados.dia_mes, dados.ativo],
      )
      return res.json({ ok: true, feriado: row })
    }
    if (req.method === 'PUT') {
      const b = await parseBody(req)
      const [atual] = await query(`SELECT ${COLS} FROM feriados WHERE id = $1`, [String(b?.id || '')])
      if (!atual) return res.status(404).json({ error: 'Feriado não encontrado' })
      // Automático: só liga/desliga.
      const { erro, dados } = atual.chave ? { dados: { ativo: b?.ativo !== false } } : normalizarFeriado(b, { parcial: true })
      if (erro) return res.status(400).json({ error: erro })
      const cols = Object.keys(dados)
      if (!cols.length) return res.status(400).json({ error: 'Nada para alterar' })
      const [row] = await query(
        `UPDATE feriados SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING ${COLS}`,
        [atual.id, ...cols.map(k => dados[k])],
      )
      return res.json({ ok: true, feriado: row })
    }
    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id')
      const [atual] = await query('SELECT id, chave FROM feriados WHERE id = $1', [String(id || '')])
      if (!atual) return res.status(404).json({ error: 'Feriado não encontrado' })
      if (atual.chave) return res.status(409).json({ error: 'Feriado nacional não se exclui: desligue-o.' })
      await query('DELETE FROM feriados WHERE id = $1', [atual.id])
      return res.json({ ok: true, id: atual.id })
    }
    return res.status(405).end()
  } catch (err) {
    if (tabelaAusente(err)) return res.status(409).json({ error: 'O cadastro de feriados ainda não foi criado neste ambiente (migração 2026-11-04b).' })
    responderErro(res, err, 'api/feriados')
  }
}

export default comAmbiente(handler)
