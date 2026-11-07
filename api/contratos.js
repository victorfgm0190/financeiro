import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { contasPermitidas } from './_permissoesApi.js'
import {
  normalizarContrato, normalizarItem, normalizarEvento, exigirModulo, perfisDoUsuario, contratoVisivel,
  inserirEvento, substituirItens, hojeIso, comNumeros, CAMPOS_CONTRATO, colunasDe, valorColuna,
  repasseSemColuna, MSG_SEM_REPASSE,
} from './_contratos.js'
import { sincronizarBenfeitoriasDoContrato, removerBenfeitoriasDoContrato, bensDoMapa } from './_benfeitoriasContrato.js'

// CONTRATOS (módulo opcional do plano). As parcelas são agendamentos com contrato_id — gravados pelo
// app no /api/sync como qualquer agendamento; esta rota cuida só da ficha.
//   GET                          → { contratos: [...] } (com `excluidas`: parcelas excluídas à mão)
//   GET ?id=x                    → { contrato, itens, eventos }
//   POST { contrato, itens }     → cria + itens + evento 'criacao', numa transação
//   PUT  { id, contrato, evento? } → altera os campos enviados (+ evento, mesma transação)
//   DELETE ?id=x                 → exclui (409 se alguma parcela gerada já foi paga)

const SQL_EXCLUIDAS = `COALESCE((SELECT json_agg(e.detalhes->>'parcela_id') FROM contrato_eventos e
               WHERE e.contrato_id = c.id AND e.tipo = 'edicao_parcela' AND e.detalhes->>'acao' = 'exclusao'), '[]'::json) AS excluidas`
// Créditos abertos só depois da migração da Entrega 2 (sem a tabela, a lista sai sem a coluna).
const SQL_CREDITOS = `COALESCE((SELECT sum(cr.valor) FROM contrato_creditos cr
               WHERE cr.contrato_id = c.id AND cr.status = 'aberto'), 0) AS creditos_abertos`
// Encargos e descontos que entram na parcela (migração 2026-11-05): vão junto com o contrato, para o
// app calcular as parcelas (lib/contratos/parcelas.js gerarPlanoParcelas).
const SQL_ENCARGOS = `COALESCE((SELECT json_agg(json_build_object('id', i.id, 'descricao', i.descricao, 'sinal', i.sinal,
               'valor', i.valor_previsto, 'parcelas_total', i.parcelas_total, 'parcela_inicio', i.parcela_inicio, 'ativo', i.ativo)
               ORDER BY i.descricao) FROM contrato_itens i WHERE i.contrato_id = c.id AND i.na_parcela), '[]'::json) AS encargos`
// Modo repasse (migração 2026-11-07c): taxas da administradora (tarifa fixa, taxa única) e a composição
// de cada competência (contrato_competencias, fonte da verdade) vão junto com o contrato — o app calcula
// o saldo com a administradora e o valor de cada repasse (lib/contratos/parcelas.js competenciasDoRepasse).
const SQL_ITENS_REPASSE = `COALESCE((SELECT json_agg(json_build_object('id', i.id, 'tipo_repasse', i.tipo_repasse, 'descricao', i.descricao,
               'valor', i.valor_previsto, 'valores_parcelas', i.valores_parcelas, 'vigencia_inicio', i.vigencia_inicio,
               'vigencia_fim', i.vigencia_fim, 'categoria_id', i.categoria_id, 'dedutivel_ir', i.dedutivel_ir, 'ativo', i.ativo)
               ORDER BY i.vigencia_inicio, i.descricao) FROM contrato_itens i WHERE i.contrato_id = c.id AND i.tipo_repasse IS NOT NULL), '[]'::json) AS itens_repasse`
const SQL_COMPETENCIAS = `COALESCE((SELECT json_agg(json_build_object('id', k.id, 'competencia', k.competencia, 'itens', k.itens,
               'status', k.status, 'observacao', k.observacao, 'repasse_lancamento_id', k.repasse_lancamento_id/*PAG*/)
               ORDER BY k.competencia) FROM contrato_competencias k WHERE k.contrato_id = c.id), '[]'::json) AS competencias`
async function sqlLista() {
  const [{ t, e, r, k, p, f } = {}] = await query(`SELECT to_regclass('contrato_creditos') IS NOT NULL AS t,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'contrato_itens' AND column_name = 'na_parcela') AS e,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'contrato_itens' AND column_name = 'tipo_repasse') AS r,
    to_regclass('contrato_competencias') IS NOT NULL AS k,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'contrato_competencias' AND column_name = 'data_pagamento_inquilino') AS p,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'contrato_competencias' AND column_name = 'conferencia') AS f`)
  const extras = `${p ? ", 'data_pagamento_inquilino', k.data_pagamento_inquilino" : ''}${f ? ", 'conferencia', k.conferencia" : ''}`
  return `SELECT c.*, ${SQL_EXCLUIDAS}${t ? `, ${SQL_CREDITOS}` : ''}${e ? `, ${SQL_ENCARGOS}` : ''}${r ? `, ${SQL_ITENS_REPASSE}` : ''}${k ? `, ${SQL_COMPETENCIAS.replace('/*PAG*/', extras)}` : ''} FROM contratos c`
}

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
      const lista = await sqlLista()
      const rows = perfis
        ? await query(`${lista} WHERE c.perfil_id = ANY($1) ORDER BY c.created_at DESC`, [perfis])
        : await query(`${lista} ORDER BY c.created_at DESC`)
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
      const existem = await colunasDe(query, 'contratos')
      if (repasseSemColuna(dados, existem).length) return res.status(409).json({ error: MSG_SEM_REPASSE, codigo: 'banco_desatualizado' })
      const cols = Object.keys(dados).filter(k => existem.has(k))
      const r = await withTransaction(async (q) => {
        const [c] = await q(
          `INSERT INTO contratos (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
          cols.map(k => valorColuna(k, dados[k])),
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
      const existem = await colunasDe(query, 'contratos')
      if (repasseSemColuna(dados, existem).length) return res.status(409).json({ error: MSG_SEM_REPASSE, codigo: 'banco_desatualizado' })
      const tipoFinal = 'tipo' in dados ? dados.tipo : atual.tipo
      const repasseFinal = 'modo_repasse' in dados ? dados.modo_repasse : !!atual.modo_repasse
      if (repasseFinal && tipoFinal !== 'receber') return res.status(400).json({ error: 'modo_repasse: só em contrato a receber' })
      const cols = Object.keys(dados).filter(k => k in CAMPOS_CONTRATO && existem.has(k))
      const r = await withTransaction(async (q) => {
        const [c] = cols.length
          ? await q(
            `UPDATE contratos SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
            [atual.id, ...cols.map(k => valorColuna(k, dados[k]))],
          )
          : [atual]
        const ev = evento ? await inserirEvento(q, atual.id, evento) : null
        // Bem ligado mudou: as benfeitorias marcadas passam para o bem novo (ou saem).
        const bens = 'bem_id' in dados && (dados.bem_id || null) !== (atual.bem_id || null)
          ? bensDoMapa(await sincronizarBenfeitoriasDoContrato(q, c)) : []
        return { contrato: c, evento: ev, bens }
      })
      return res.json({ ok: true, contrato: comNumeros(r.contrato), evento: comNumeros(r.evento), bens: r.bens })
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
      const bens = await withTransaction(async (q) => {
        const tocados = await removerBenfeitoriasDoContrato(q, id)
        await q('DELETE FROM contratos WHERE id = $1', [id])
        return bensDoMapa(tocados)
      })
      return res.json({ ok: true, excluido: true, id, bens })
    }

    return res.status(405).end()
  } catch (err) {
    if (err?.codigo === 'banco_desatualizado') return res.status(409).json({ error: err.message, codigo: err.codigo })
    console.error('[api/contratos]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
