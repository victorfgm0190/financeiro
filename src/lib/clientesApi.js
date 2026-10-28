import { authHeaders, clearTokenAndRedirect, exigirConexao } from './api'

// Clientes da plataforma: Controle de Clientes (/api/clientes, só PLATAFORMA_ADMIN) e o pedido
// público (/api/cadastro-publico e /api/sigla-disponivel, sem login).
async function chamar(url, { method = 'GET', body, autenticado = true } = {}) {
  exigirConexao(url, method)
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(autenticado ? authHeaders() : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (autenticado && res.status === 401) {
    clearTokenAndRedirect()
    throw new Error('Sessão expirada')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `Falha (${res.status})`), { status: res.status, dados: json })
  return json
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString()

// Menu "Clientes Finup": 403 = não é o administrador da plataforma (menu some).
export async function resumoClientes() {
  try {
    const r = await chamar('/api/clientes?acao=resumo')
    return { admin: true, novos: r.novos || 0 }
  } catch (e) {
    if (e.status === 403) return { admin: false, novos: 0 }
    throw e
  }
}

export const listarClientes = () => chamar('/api/clientes')
export const detalheCliente = (id) => chamar(`/api/clientes?${qs({ id })}`)
export const criarCliente = (dados) => chamar('/api/clientes', { method: 'POST', body: dados }).then(r => r.cliente)
export const editarCliente = (dados) => chamar('/api/clientes', { method: 'PATCH', body: dados }).then(r => r.cliente)
// Provisionamento em passos: cada POST executa o PRÓXIMO passo e devolve o andamento
// ({ passos: [{ id, rotulo, feito }], concluido, mensagem? }); a tela chama até concluir.
export const aprovarCliente = (id) => chamar('/api/clientes?acao=aprovar', { method: 'POST', body: { id } })
export const andamentoProvisionamento = (id) => chamar(`/api/clientes?${qs({ acao: 'provisionamento', id })}`)
// Tentativas de "Esqueci minha senha" do ambiente do cliente e o "Liberar agora".
export const tentativasSenha = (id) => chamar(`/api/clientes?${qs({ acao: 'tentativas-senha', id })}`)
export const liberarSenha = (id) => chamar('/api/clientes?acao=liberar-senha', { method: 'POST', body: { id } })
// Exclusão definitiva (só cancelado ou nunca aprovado; `confirmacao` = a sigla exata).
export const excluirClienteApi = (id, confirmacao) => chamar('/api/clientes?acao=excluir', { method: 'POST', body: { id, confirmacao } })
export const reenviarConviteCliente = (id) => chamar('/api/clientes?acao=reenviar-convite', { method: 'POST', body: { id } })
export const mudarStatusCliente = (id, acao, motivo) =>
  chamar('/api/clientes?acao=status', { method: 'POST', body: { id, acao, motivo } }).then(r => r.cliente)
// Análise do Cliente (agregada; sem mes → mês financeiro atual do cliente). Cada chamada fica no histórico.
export const analiseCliente = (sigla, mes) => chamar(`/api/admin/analise-cliente?${qs({ cliente: sigla, mes })}`)
export const checarSiglaAdmin = (sigla, nome, id) => chamar(`/api/clientes?${qs({ acao: 'sigla', sigla, nome, id })}`)

export const checarSiglaPublica = (sigla, nome) => chamar(`/api/sigla-disponivel?${qs({ sigla, nome })}`, { autenticado: false })
export const enviarPedidoPublico = (dados) => chamar('/api/cadastro-publico', { method: 'POST', body: dados, autenticado: false })
