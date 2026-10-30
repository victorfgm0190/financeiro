import { query, parseBody } from '../_db.js'
import { centralQuery } from '../_central.js'
import { requireAuth } from '../_auth.js'
import { comAmbiente } from '../_ambiente.js'
import { rodarNoAmbiente } from '../_conexao.js'
import { ensurePlataformaSchema, ehAdminPlataforma, queryParam } from '../_plataforma.js'
import { consumoDoBanco, listarPrecos, validarPreco, salvarPreco, DATA_RE } from '../_consumoIa.js'
import { buscarPtax } from '../../src/lib/ptax.js'
import { AMBIENTE_PRINCIPAL } from '../../src/lib/ambienteHost.js'
import { hojeSP } from '../../src/lib/hoje.js'

// CONSUMO DE IA — só o administrador da plataforma, no ambiente principal (mesma trava do
// /api/clientes e da Análise do Cliente).
//   GET ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD[&ambiente=<sigla>]
//       → { ambientes, grupos, falhas, precos, semTabelaPrecos, ptax }
//         grupos = ia_uso de CADA ambiente, somado por dia × ferramenta × modelo (api/_consumoIa.js);
//         ptax = PTAX venda de hoje (src/lib/ptax.js, a mesma do /api/cotacao) para o R$.
//   POST ?acao=preco { modelo, vigencia, entrada, saida, cache_leitura, cache_criacao } (US$/milhão; vazio = sem preço)
//   POST ?acao=excluir-preco { id }
const MAX_DIAS = 400
const cachePtax = new Map()

async function lerConsumo(req, res) {
  const inicio = String(queryParam(req, 'inicio') || '')
  const fim = String(queryParam(req, 'fim') || '')
  const sigla = String(queryParam(req, 'ambiente') || '').trim().toLowerCase()
  if (!DATA_RE.test(inicio) || !DATA_RE.test(fim) || inicio > fim) return res.status(400).json({ error: 'Período inválido.' })
  if ((Date.parse(fim) - Date.parse(inicio)) / 864e5 > MAX_DIAS) return res.status(400).json({ error: 'Período longo demais (máximo de 400 dias).' })

  const ambs = await centralQuery(`SELECT a.id, a.sigla, a.nome, a.database_name, a.status, a.cliente_id,
                                          COALESCE(NULLIF(c.empresa, ''), c.nome) AS cliente
                                     FROM ambientes a LEFT JOIN plataforma_clientes c ON c.id = a.cliente_id
                                    WHERE a.database_name IS NOT NULL ORDER BY a.sigla`)
  const ambientes = ambs.map(a => ({ sigla: a.sigla, nome: a.cliente || a.nome || a.sigla, status: a.status }))
  const alvo = sigla ? ambs.filter(a => a.sigla === sigla) : ambs
  const grupos = [], falhas = []
  // Um ambiente fora do ar não derruba os outros: vai para `falhas`.
  await Promise.all(alvo.map(async (amb) => {
    try {
      grupos.push(...await rodarNoAmbiente(amb, () => consumoDoBanco(query, { inicio, fim, ambiente: amb.sigla })))
    } catch (err) {
      console.error(`[consumo-ia] ${amb.sigla}:`, err.message)
      falhas.push({ sigla: amb.sigla, erro: 'Não foi possível ler o banco deste ambiente.' })
    }
  }))
  const { precos, semTabela } = await listarPrecos(centralQuery)
  let ptax = null
  try {
    ptax = await buscarPtax(hojeSP(), { cache: cachePtax, fetchFn: (url) => fetch(url, { signal: AbortSignal.timeout(8000) }) })
  } catch (err) {
    console.error('[consumo-ia] PTAX:', err.message)
  }
  return res.json({ ambientes, grupos, falhas, precos, semTabelaPrecos: semTabela, ptax })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (!ehAdminPlataforma(req.user) || req.ambiente?.sigla !== AMBIENTE_PRINCIPAL) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma' })
  }
  try {
    await ensurePlataformaSchema()
    if (req.method === 'GET') return await lerConsumo(req, res)
    const acao = queryParam(req, 'acao')
    const body = await parseBody(req)
    if (req.method === 'POST' && acao === 'preco') {
      const v = validarPreco(body)
      if (v.erro) return res.status(400).json({ error: v.erro })
      return res.json({ ok: true, id: await salvarPreco(centralQuery, v.dados) })
    }
    if (req.method === 'POST' && acao === 'excluir-preco') {
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      await centralQuery('DELETE FROM ia_precos WHERE id = $1', [String(body.id)])
      return res.json({ ok: true })
    }
    return res.status(405).json({ error: 'Método não permitido' })
  } catch (err) {
    if (err?.code === '42P01') return res.status(409).json({ error: 'Central sem a migração 2026-10-30_ia_precos (rode scripts/migrar-central.js).' })
    console.error('[consumo-ia]', err.message)
    return res.status(500).json({ error: 'Falha ao consultar o consumo de IA' })
  }
}

export default comAmbiente(handler)
