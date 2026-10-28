import { query } from '../_db.js'
import { centralQuery } from '../_central.js'
import { requireAuth } from '../_auth.js'
import { comAmbiente } from '../_ambiente.js'
import { rodarNoAmbiente } from '../_conexao.js'
import { ensurePlataformaSchema, ehAdminPlataforma, registrarHistorico, queryParam } from '../_plataforma.js'
import { analisarBanco, MES_RE, SIGLA_RE } from '../_analiseCliente.js'
import { AMBIENTE_PRINCIPAL } from '../../src/lib/ambienteHost.js'
import { hojeSP } from '../../src/lib/hoje.js'

// GET /api/admin/analise-cliente?cliente=<sigla>&mes=<AAAA-MM>
// Análise gerencial AGREGADA do banco de um cliente (api/_analiseCliente.js). Só o administrador da
// plataforma, no ambiente principal (mesma trava do /api/clientes); qualquer outro → 403.
// Todo acesso fica em plataforma_historico (evento 'analise_acesso'), antes de consultar o banco.
// Sem `mes` → mês financeiro atual do cliente (o dia de início vem da configuração dele).

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (!ehAdminPlataforma(req.user) || req.ambiente?.sigla !== AMBIENTE_PRINCIPAL) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma' })
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' })

  const sigla = String(queryParam(req, 'cliente') || '').trim().toLowerCase()
  const mes = String(queryParam(req, 'mes') || '').trim() || null
  if (!SIGLA_RE.test(sigla)) return res.status(400).json({ error: 'Cliente inválido' })
  if (mes && !MES_RE.test(mes)) return res.status(400).json({ error: 'Mês inválido (use AAAA-MM)' })

  let amb, cliente
  try {
    await ensurePlataformaSchema()
    ;[amb] = await centralQuery('SELECT id, sigla, nome, database_name, status, cliente_id FROM ambientes WHERE sigla = $1', [sigla])
    if (amb?.cliente_id) [cliente] = await centralQuery('SELECT id, nome, empresa, sigla FROM plataforma_clientes WHERE id = $1', [amb.cliente_id])
  } catch (err) {
    console.error('[analise-cliente] central:', err.message)
    return res.status(500).json({ error: 'Falha ao consultar o cadastro do cliente' })
  }
  // Só ambiente de CLIENTE (o principal não tem cliente_id) e ativo.
  if (!amb || !cliente || sigla === AMBIENTE_PRINCIPAL) return res.status(404).json({ error: 'Cliente não encontrado' })
  if (amb.status !== 'ativo') return res.status(409).json({ error: 'O ambiente deste cliente não está ativo' })

  try {
    await registrarHistorico(centralQuery, cliente.id, 'analise_acesso', mes ? `Mês ${mes}` : 'Mês atual', req.user.username)
  } catch (err) {
    console.error('[analise-cliente] histórico:', err.message)
    return res.status(500).json({ error: 'Falha ao registrar o acesso' })
  }

  try {
    const dados = await rodarNoAmbiente(amb, () => analisarBanco(query, { mes, hoje: hojeSP() }))
    res.json({ cliente: { nome: cliente.empresa || cliente.nome, sigla: amb.sigla }, ...dados })
  } catch (err) {
    console.error('[analise-cliente] banco do cliente:', err.message)
    res.status(502).json({ error: 'Não foi possível conectar ao banco do cliente', codigo: 'banco_cliente' })
  }
}

export default comAmbiente(handler)
