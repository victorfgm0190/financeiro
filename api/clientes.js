import { parseBody } from './_db.js'
import { centralQuery as query, withCentralTransaction as withTransaction, _limparCacheAmbientes } from './_central.js'
import { requireAuth } from './_auth.js'
import { ErroHttp } from './_usuarios.js'
import {
  ensurePlataformaSchema, ehAdminPlataforma, validarCliente, siglaOcupada, buscarCliente, registrarHistorico,
  checarSigla, queryParam, statusValido,
} from './_plataforma.js'
import { provisionarProximoPasso, estadoProvisionamento, reenviarConvite } from './_provisionar.js'
import { tentativasDoAmbiente, liberarLimiteDoAmbiente } from './_senhaLimite.js'
import { excluirCliente, situacaoExclusaoDoCliente } from './_excluirCliente.js'
import { comAmbiente } from './_ambiente.js'
import { AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'
import { limitesDoAmbiente, validarLimites } from '../src/lib/assistente/limiteIa.js'
import { RECURSOS_CONTRATADOS, recursoLiberado, comRecurso } from '../src/lib/recursosCliente.js'

// Limites do Assistente IA do ambiente do cliente (central). Sem as colunas (migração
// 2026-10-30_ambientes_ia_limite pendente) → o padrão, e a edição avisa.
async function limitesIaDoAmbiente(clienteId) {
  try {
    const [row] = await query('SELECT ia_limite_diario, ia_limite_imagem FROM ambientes WHERE cliente_id = $1', [clienteId])
    return row ? limitesDoAmbiente(row) : null
  } catch (err) {
    if (err?.code === '42703') return { ...limitesDoAmbiente(null), semColuna: true }
    throw err
  }
}

// CONTROLE DE CLIENTES da plataforma — só o administrador da plataforma (PLATAFORMA_ADMIN), nunca
// o nível 'admin' comum.
//   GET ?acao=resumo           → { novos } (o menu usa: 403 = não mostra)
//   GET                        → { clientes, novos }
//   GET ?id=x                  → { cliente, historico }
//   GET ?acao=sigla&sigla=&nome=&id= → disponibilidade (ignora o próprio cliente na edição)
//   POST { ...campos }         → novo cliente manual (origem 'manual', status 'pedido')
//   PATCH { id, ...campos }    → edição (status NÃO muda por aqui)
//   GET ?acao=provisionamento&id=x → andamento do provisionamento (passos feitos/pendentes)
//   POST ?acao=aprovar { id }  → executa o PRÓXIMO passo do provisionamento (api/_provisionar.js) e
//                                devolve o andamento; a tela chama de novo até `concluido`
//   POST ?acao=status { id, acao: recusar|suspender|reativar|cancelar, motivo? } — suspender/
//                                cancelar/reativar também mudam ambientes.status no central (o
//                                database do cliente NUNCA é apagado aqui)
//   POST ?acao=reenviar-convite { id } → convite novo (48 h) + boas-vindas (cliente ativo)
//   GET ?acao=tentativas-senha&id=x → quadro "Tentativas de senha" do ambiente (api/_senhaLimite.js)
//   POST ?acao=liberar-senha { id } → zera o limite do "esqueci" daquele ambiente (só senha_pedidos dele)
//   POST ?acao=excluir { id, confirmacao } → exclui o cliente (api/_excluirCliente.js): só cancelado ou
//                                nunca aprovado, e `confirmacao` = a sigla exata
//   POST com outra ?acao → 400 (nunca cai no "novo cliente")

const CAMPOS_EDITAVEIS = ['nome', 'email', 'telefone', 'tipo_pessoa', 'documento', 'empresa', 'sigla', 'como_conheceu',
  'plano', 'valor_mensal', 'dia_vencimento', 'limite_usuarios', 'observacoes']

// Transições pelos botões. Reativar: volta para 'ativo' se o ambiente já tinha sido ativado
// (evento prov_ativar); senão para 'aprovado' (o provisionamento continua pelo Aprovar).
const TRANSICOES = {
  recusar: { de: ['pedido'], para: 'recusado' },
  suspender: { de: ['aprovado', 'ativo'], para: 'suspenso' },
  reativar: { de: ['suspenso', 'cancelado'], para: 'aprovado' },
  cancelar: { de: ['pedido', 'aprovado', 'ativo', 'suspenso', 'recusado'], para: 'cancelado' },
}
// Status do AMBIENTE (central) em cada ação. Só mexe em ambiente que já existe; o database fica.
const AMBIENTE_NA_ACAO = { suspender: 'suspenso', cancelar: 'cancelado', reativar: 'ativo' }

// Ambiente do cliente (central), ou null.
async function ambienteDoClienteId(id) {
  const [amb] = await query('SELECT id, sigla, status FROM ambientes WHERE cliente_id = $1', [id])
  return amb || null
}

// Recurso contratado (ambientes.modulos) de UM ambiente: liga/desliga e registra quem e quando — no
// histórico do ambiente (ambientes_historico, vale para o ambiente principal, que não tem cliente) e,
// havendo cliente, também no histórico do cliente. Sem mudança, nada é gravado. → estado final.
async function alterarRecursoDoAmbiente(q, ambienteId, recurso, ligado, autor) {
  const [amb] = await q('SELECT id, cliente_id, modulos FROM ambientes WHERE id = $1 FOR UPDATE', [ambienteId])
  if (!amb) return null
  if (recursoLiberado(amb.modulos, recurso.id) !== ligado) {
    const detalhe = `Recurso "${recurso.rotulo}": ${ligado ? 'liberado' : 'retirado'}`
    await q('UPDATE ambientes SET modulos = $2::jsonb WHERE id = $1', [amb.id, JSON.stringify(comRecurso(amb.modulos, recurso.id, ligado))])
    await q('INSERT INTO ambientes_historico (ambiente_id, evento, detalhe, autor) VALUES ($1, $2, $3, $4)', [amb.id, 'recurso', detalhe, autor])
    if (amb.cliente_id) await registrarHistorico(q, amb.cliente_id, 'editado', detalhe, autor)
  }
  return { [recurso.id]: ligado }
}

const contarNovos = async (q) => (await q("SELECT count(*)::int AS n FROM plataforma_clientes WHERE status = 'pedido'"))[0]?.n || 0

async function exigirSiglaLivre(q, sigla, idAtual = null) {
  if (sigla && (await siglaOcupada(q, sigla, idAtual))) throw new ErroHttp(409, 'Essa sigla já está em uso')
}

export async function criarClienteManual(q, body, autor) {
  const dados = validarCliente(body, { exigirDocumento: false })
  if (!dados.sigla) throw new ErroHttp(400, 'Informe a sigla')
  await exigirSiglaLivre(q, dados.sigla)
  const cols = Object.keys(dados)
  const [r] = await q(
    `INSERT INTO plataforma_clientes (${cols.join(', ')}, origem, status)
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, 'manual', 'pedido') RETURNING id`,
    cols.map(c => dados[c]),
  )
  await registrarHistorico(q, r.id, 'criado', 'Cadastro manual', autor)
  return buscarCliente(q, r.id)
}

export async function editarCliente(q, body, autor) {
  if (!body?.id) throw new ErroHttp(400, 'id é obrigatório')
  const atual = await buscarCliente(q, body.id, { travar: true })
  if (!atual) throw new ErroHttp(404, 'Cliente não encontrado')
  const entrada = Object.fromEntries(Object.entries(body).filter(([k]) => CAMPOS_EDITAVEIS.includes(k)))
  if ('telefone' in entrada) entrada.nao_whatsapp = body.nao_whatsapp === true
  const dados = validarCliente(entrada, { parcial: true, atual, exigirDocumento: false })
  if ('sigla' in dados) {
    if (!dados.sigla) throw new ErroHttp(400, 'Informe a sigla')
    // Sigla é o endereço do ambiente: depois de aprovado só muda junto com a migração do ambiente.
    if (dados.sigla !== atual.sigla && !['pedido', 'recusado'].includes(atual.status)) {
      throw new ErroHttp(409, 'A sigla não pode mudar depois da aprovação')
    }
    await exigirSiglaLivre(q, dados.sigla, atual.id)
  }
  const mudou = Object.keys(dados).filter(k => String(dados[k] ?? '') !== String(atual[k] ?? ''))
  if (!mudou.length) return atual
  await q(
    `UPDATE plataforma_clientes SET ${mudou.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
    [atual.id, ...mudou.map(c => dados[c])],
  )
  await registrarHistorico(q, atual.id, 'editado', `Campos: ${mudou.join(', ')}`, autor)
  return buscarCliente(q, atual.id)
}

export async function mudarStatus(q, body, autor) {
  const t = TRANSICOES[body?.acao]
  if (!t) throw new ErroHttp(400, 'Ação inválida')
  const atual = await buscarCliente(q, body.id, { travar: true })
  if (!atual) throw new ErroHttp(404, 'Cliente não encontrado')
  if (!t.de.includes(atual.status)) throw new ErroHttp(409, `Não é possível ${body.acao} um cliente com status "${atual.status}"`)
  if (!statusValido(t.para)) throw new ErroHttp(500, 'Status inválido')
  const [amb] = await q('SELECT id, status FROM ambientes WHERE cliente_id = $1', [atual.id])
  const [{ ativado }] = await q("SELECT count(*) > 0 AS ativado FROM plataforma_historico WHERE cliente_id = $1 AND evento = 'prov_ativar'", [atual.id])
  // Reativar um ambiente que já esteve no ar → 'ativo'; um provisionamento interrompido → 'aprovado'.
  const para = body.acao === 'reativar' && amb && ativado ? 'ativo' : t.para
  await q('UPDATE plataforma_clientes SET status = $2, updated_at = now() WHERE id = $1', [atual.id, para])
  const motivo = String(body.motivo ?? '').trim().slice(0, 1000)
  let detalheAmbiente = ''
  const novoAmb = AMBIENTE_NA_ACAO[body.acao]
  // Ambiente ainda em provisionamento só muda para cancelado/suspenso; volta a 'ativo' só se já foi ativado.
  if (amb && novoAmb && amb.status !== novoAmb && (novoAmb !== 'ativo' || ativado)) {
    await q('UPDATE ambientes SET status = $2, updated_at = now() WHERE id = $1', [amb.id, novoAmb])
    detalheAmbiente = ` · ambiente ${amb.status} → ${novoAmb}`
  }
  await registrarHistorico(q, atual.id, para, `Status ${atual.status} → ${para}${detalheAmbiente}${motivo ? ` · ${motivo}` : ''}`, autor)
  return buscarCliente(q, atual.id)
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (!requireAuth(req, res)) return
  // Só no ambiente principal (o do Victor) e só para o PLATAFORMA_ADMIN. Os dados ficam no central.
  if (!ehAdminPlataforma(req.user) || req.ambiente?.sigla !== AMBIENTE_PRINCIPAL) return res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma' })
  const autor = req.user.username
  const acao = queryParam(req, 'acao')

  try {
    await ensurePlataformaSchema()

    if (req.method === 'GET') {
      if (acao === 'resumo') return res.json({ novos: await contarNovos(query) })
      // Recursos contratados por AMBIENTE (todos, com ou sem cliente) + os últimos registros de quem/quando.
      if (acao === 'recursos-ambientes') {
        const ambs = await query(`SELECT a.id, a.sigla, a.nome, a.status, a.cliente_id, a.modulos, c.nome AS cliente_nome
                                    FROM ambientes a LEFT JOIN plataforma_clientes c ON c.id = a.cliente_id ORDER BY a.sigla`)
        const hist = await query(`SELECT ambiente_id, detalhe, autor, created_at FROM ambientes_historico
                                    WHERE evento = 'recurso' ORDER BY created_at DESC LIMIT 200`)
        return res.json({
          recursos: RECURSOS_CONTRATADOS,
          ambientes: ambs.map(a => ({
            id: a.id, sigla: a.sigla, nome: a.nome, status: a.status, cliente: a.cliente_nome || null, semCliente: !a.cliente_id,
            recursos: Object.fromEntries(RECURSOS_CONTRATADOS.map(r => [r.id, recursoLiberado(a.modulos, r.id)])),
            historico: hist.filter(h => h.ambiente_id === a.id).slice(0, 5).map(h => ({ detalhe: h.detalhe, autor: h.autor, quando: h.created_at })),
          })),
        })
      }
      if (acao === 'sigla') {
        return res.json(await checarSigla(query, queryParam(req, 'sigla'), queryParam(req, 'nome') || '', queryParam(req, 'id')))
      }
      if (acao === 'provisionamento') return res.json(await estadoProvisionamento(query, String(queryParam(req, 'id') || '')))
      if (acao === 'tentativas-senha') {
        const amb = await ambienteDoClienteId(String(queryParam(req, 'id') || ''))
        return res.json(amb ? await tentativasDoAmbiente(query, amb.id) : { pedidos: [], bloqueios: [], liberadoEm: null, semAmbiente: true })
      }
      const id = queryParam(req, 'id')
      if (id) {
        const cliente = await buscarCliente(query, id)
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' })
        const historico = await query('SELECT * FROM plataforma_historico WHERE cliente_id = $1 ORDER BY created_at DESC, id', [id])
        const [ambiente] = await query('SELECT sigla, database_name, status, modulos FROM ambientes WHERE cliente_id = $1', [cliente.id])
        // Recursos contratados (ambientes.modulos): só o estado de cada um, nunca o JSON inteiro.
        const recursos = ambiente ? Object.fromEntries(RECURSOS_CONTRATADOS.map(r => [r.id, recursoLiberado(ambiente.modulos, r.id)])) : null
        return res.json({
          cliente, historico, ambiente: ambiente ? { sigla: ambiente.sigla, database_name: ambiente.database_name, status: ambiente.status } : null,
          exclusao: await situacaoExclusaoDoCliente(query, cliente),
          iaLimites: ambiente ? await limitesIaDoAmbiente(cliente.id) : null,
          recursos,
        })
      }
      const clientes = (await query('SELECT * FROM plataforma_clientes ORDER BY created_at DESC'))
        .map(c => ({ ...c, valor_mensal: c.valor_mensal == null ? null : Number(c.valor_mensal) }))
      return res.json({ clientes, novos: clientes.filter(c => c.status === 'pedido').length })
    }

    const body = await parseBody(req)
    if (req.method === 'POST' && acao === 'aprovar') {
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      return res.json({ ok: true, ...(await provisionarProximoPasso(String(body.id), { autor })) })
    }
    if (req.method === 'POST' && acao === 'reenviar-convite') {
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      return res.json(await reenviarConvite(String(body.id), { autor }))
    }
    if (req.method === 'POST' && acao === 'status') {
      const cliente = await withTransaction(q => mudarStatus(q, body, autor))
      _limparCacheAmbientes() // suspensão/reativação vale já nesta instância (nas outras, em até 30 s)
      return res.json({ ok: true, cliente })
    }
    if (req.method === 'POST' && acao === 'liberar-senha') {
      const amb = await ambienteDoClienteId(String(body?.id || ''))
      if (!amb) return res.status(404).json({ error: 'Cliente sem ambiente' })
      const apagados = await liberarLimiteDoAmbiente(query, amb.id)
      await registrarHistorico(query, String(body.id), 'senha_liberada', `Limite de senha liberado por ${autor} (${apagados} registro(s))`, autor)
      return res.json({ ok: true, apagados })
    }
    if (req.method === 'POST' && acao === 'excluir') {
      if (!body?.id) return res.status(400).json({ error: 'id é obrigatório' })
      return res.json(await excluirCliente(String(body.id), { confirmacao: body.confirmacao, autor }))
    }
    // Limite diário do Assistente IA (por usuário) do ambiente do cliente.
    if (req.method === 'POST' && acao === 'limite-ia') {
      const v = validarLimites(body || {})
      if (v.erro) return res.status(400).json({ error: v.erro })
      const amb = await ambienteDoClienteId(String(body?.id || ''))
      if (!amb) return res.status(404).json({ error: 'Cliente sem ambiente' })
      try {
        await query('UPDATE ambientes SET ia_limite_diario = $2, ia_limite_imagem = $3 WHERE id = $1', [amb.id, v.diario, v.imagem])
      } catch (err) {
        if (err?.code === '42703') return res.status(409).json({ error: 'Central sem a migração 2026-10-30_ambientes_ia_limite (rode scripts/migrar-central.js).' })
        throw err
      }
      await withTransaction(q => registrarHistorico(q, String(body.id), 'editado', `Limite do assistente: ${v.diario}/dia, ${v.imagem} com imagem`, autor))
      return res.json({ ok: true, iaLimites: { diario: v.diario, imagem: v.imagem } })
    }
    // Recurso contratado (ambientes.modulos): liberar/retirar, com quem e quando no histórico do cliente.
    if (req.method === 'POST' && acao === 'recurso') {
      const recurso = RECURSOS_CONTRATADOS.find(r => r.id === body?.recurso)
      if (!recurso) return res.status(400).json({ error: 'Recurso inválido' })
      const ligado = body?.ligado === true
      const id = String(body?.id || '')
      const resultado = await withTransaction(async (q) => {
        const [amb] = await q('SELECT id FROM ambientes WHERE cliente_id = $1', [id])
        return amb ? alterarRecursoDoAmbiente(q, amb.id, recurso, ligado, autor) : null
      })
      if (!resultado) return res.status(404).json({ error: 'Cliente sem ambiente' })
      _limparCacheAmbientes()
      return res.json({ ok: true, recursos: resultado })
    }
    if (req.method === 'POST' && acao === 'recurso-ambiente') {
      const recurso = RECURSOS_CONTRATADOS.find(r => r.id === body?.recurso)
      if (!recurso) return res.status(400).json({ error: 'Recurso inválido' })
      const resultado = await withTransaction(q => alterarRecursoDoAmbiente(q, String(body?.ambienteId || ''), recurso, body?.ligado === true, autor))
      if (!resultado) return res.status(404).json({ error: 'Ambiente não encontrado' })
      _limparCacheAmbientes()
      return res.json({ ok: true, recursos: resultado })
    }
    if (req.method === 'POST' && acao) return res.status(400).json({ error: 'Ação inválida' })
    if (req.method === 'POST') return res.json({ ok: true, cliente: await withTransaction(q => criarClienteManual(q, body, autor)) })
    if (req.method === 'PATCH') return res.json({ ok: true, cliente: await withTransaction(q => editarCliente(q, body, autor)) })
    return res.status(405).end()
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message })
    if (err?.code === '23505') return res.status(409).json({ error: 'Essa sigla já está em uso' })
    console.error('[api/clientes]', err.message)
    return res.status(500).json({ error: 'Falha ao processar a solicitação' })
  }
}

export default comAmbiente(handler)
