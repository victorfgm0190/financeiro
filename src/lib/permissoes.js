// Níveis de acesso e permissões por módulo — fonte ÚNICA, usada pelo front (menu, botões, sync) e
// pela API (requireAuth/sync). Sem React e sem dependências: roda nos dois lados.
//
// Permissão = { ver, incluir, editar, excluir } por módulo. Níveis:
//   admin         → tudo
//   operador      → ver/incluir/editar/excluir em tudo, EXCETO Usuários (nada) e Configurações do
//                   sistema (nada); Cadastros (Configurações › Cadastros/Regras) só ver
//   consulta      → só ver, em tudo exceto Usuários, Configurações e Cadastros
//   personalizado → o JSON `permissoes` do usuário (incluir/editar/excluir implicam ver)

export const ACOES = ['ver', 'incluir', 'editar', 'excluir']

// `paginas` = páginas do App (desktop) / `page` dos módulos mobile que pertencem ao módulo.
export const MODULOS = [
  { id: 'painel', label: 'Painel / Início', paginas: ['dashboard'] },
  { id: 'contas', label: 'Contas', paginas: ['accounts'] },
  { id: 'cartao', label: 'Cartão de Crédito', paginas: ['credit'] },
  { id: 'lancamentos', label: 'Lançamentos', paginas: ['transactions', 'importar-lancamentos'] },
  { id: 'agendamentos', label: 'Agendamentos', paginas: ['schedule'] },
  { id: 'importar', label: 'Importar Fatura / Conciliação', paginas: ['import'] },
  { id: 'fluxo', label: 'Fluxo de Caixa', paginas: ['cashflow'] },
  { id: 'reservas', label: 'Reservas', paginas: ['reservas'] },
  { id: 'envelopes', label: 'Envelopes', paginas: ['envelopes'] },
  { id: 'orcamento', label: 'Orçamento', paginas: ['budget'] },
  { id: 'patrimonio', label: 'Patrimônio', paginas: ['patrimonio'] },
  { id: 'contratos', label: 'Contratos', paginas: ['contratos'] },
  { id: 'relatorios', label: 'Relatórios', paginas: ['reports'] },
  { id: 'alertas', label: 'Alertas / Integridade', paginas: ['alerts'] },
  { id: 'cadastros', label: 'Configurações › Cadastros e Regras', paginas: [] },
  { id: 'configuracoes', label: 'Configurações do sistema', paginas: [] },
  { id: 'usuarios', label: 'Usuários', paginas: [] },
]
export const NIVEIS = [
  { id: 'admin', label: 'Administrador' },
  { id: 'operador', label: 'Operador' },
  { id: 'consulta', label: 'Consulta' },
  { id: 'personalizado', label: 'Personalizado' },
]
export const rotuloNivel = (n) => NIVEIS.find(x => x.id === n)?.label || n

const TUDO = { ver: true, incluir: true, editar: true, excluir: true }
const SO_VER = { ver: true, incluir: false, editar: false, excluir: false }
const NADA = { ver: false, incluir: false, editar: false, excluir: false }

// Normaliza uma permissão de módulo: incluir/editar/excluir ligam o ver.
export function normalizarPermissao(p) {
  const r = { ver: !!p?.ver, incluir: !!p?.incluir, editar: !!p?.editar, excluir: !!p?.excluir }
  if (r.incluir || r.editar || r.excluir) r.ver = true
  return r
}

// JSON `permissoes` limpo: só módulos conhecidos, só as 4 ações, ver implícito.
export function normalizarPermissoes(json) {
  const out = {}
  for (const m of MODULOS) out[m.id] = normalizarPermissao(json?.[m.id])
  return out
}

// Permissões efetivas de um usuário ({ nivel, permissoes }) → { [modulo]: { ver, incluir, ... } }.
export function permissoesDoNivel(nivel, permissoes) {
  const out = {}
  for (const m of MODULOS) {
    if (nivel === 'admin') out[m.id] = TUDO
    else if (nivel === 'operador') out[m.id] = m.id === 'usuarios' || m.id === 'configuracoes' ? NADA : m.id === 'cadastros' ? SO_VER : TUDO
    else if (nivel === 'consulta') out[m.id] = ['usuarios', 'configuracoes', 'cadastros'].includes(m.id) ? NADA : SO_VER
    // Personalizado: o Painel/Início é a tela inicial do app — sempre visível.
    else if (nivel === 'personalizado') out[m.id] = m.id === 'painel' ? { ...normalizarPermissao(permissoes?.[m.id]), ver: true } : normalizarPermissao(permissoes?.[m.id])
    else out[m.id] = NADA
  }
  return out
}

// Módulos opcionais do plano do ambiente (ambientes.modulos no central): desligado = ninguém vê nem
// grava, nem o admin. `usuario.modulos` vem do token (front) ou de req.ambiente (API, sempre fresco).
export const MODULOS_DE_PLANO = new Set(['contratos'])
export const moduloNoPlano = (usuario, modulo) => !MODULOS_DE_PLANO.has(modulo) || usuario?.modulos?.[modulo] === true

// pode(usuario, modulo, acao). `usuario` = { nivel, permissoes, modulos } (sessão do token ou linha
// do banco). Sem usuário/nivel → nada. modulo '*' = "pode gravar em algum módulo".
export function pode(usuario, modulo, acao = 'ver') {
  if (!usuario?.nivel) return false
  if (!moduloNoPlano(usuario, modulo)) return false
  if (usuario.nivel === 'admin') return true
  const efetivas = permissoesDoNivel(usuario.nivel, usuario.permissoes)
  if (modulo === '*') return Object.values(efetivas).some(p => p.incluir || p.editar || p.excluir)
  return !!efetivas[modulo]?.[acao]
}

// Pode alguma gravação (incluir/editar/excluir) no módulo?
export const podeGravar = (usuario, modulo) =>
  pode(usuario, modulo, 'incluir') || pode(usuario, modulo, 'editar') || pode(usuario, modulo, 'excluir')

// Módulo de uma página do App (page id) — páginas fora da lista (ex.: 'settings') → null.
export const moduloDaPagina = (pagina) => MODULOS.find(m => m.paginas.includes(pagina))?.id || null

// Página visível no menu? 'settings' aparece para qualquer nível: Dados › "Dados deste aparelho"
// (apagar os dados do próprio aparelho) vale para todos — Consulta só enxerga essa seção.
export function podeVerPagina(usuario, pagina) {
  if (pagina === 'settings') return !!usuario?.nivel
  const mod = moduloDaPagina(pagina)
  return mod ? pode(usuario, mod, 'ver') : true
}

// Módulos do celular (src/mobile/modules.js): telas sem `page` e ações do "+" → módulo/ação.
const MOBILE = {
  inicio: ['painel', 'ver'], despesas: ['painel', 'ver'], mais: ['painel', 'ver'],
  lancamento: ['lancamentos', 'incluir'], transferencia: ['lancamentos', 'incluir'],
  agendamento: ['agendamentos', 'incluir'], reserva_mov: ['lancamentos', 'incluir'],
}
export function podeVerModuloMobile(usuario, m) {
  if (MOBILE[m.id]) return pode(usuario, MOBILE[m.id][0], MOBILE[m.id][1])
  return m.page ? podeVerPagina(usuario, m.page) : true
}

// Abas de Configurações (configRota.CONFIG_ABAS) → módulo. Seção com `todos: true` (Dados › Dados
// deste aparelho) aparece para todos os níveis, mesmo sem o módulo da aba.
export const MODULO_DA_ABA_CONFIG = {
  geral: 'configuracoes', cadastros: 'cadastros', regras: 'cadastros', dados: 'configuracoes',
  usuarios: 'usuarios', perigo: 'configuracoes',
}

// ─── Gravações: tabela do /api/sync e rotas da API → módulo ─────────────────────────────────────

// Tabela gravada pelo /api/sync → módulo. Favorecidos e aliases entram com o lançamento (o
// formulário cria o favorecido novo), por isso são de Lançamentos.
export const MODULO_DA_TABELA = {
  contas: 'contas', cartoes: 'contas',
  lancamentos: 'lancamentos', lancamento_rateios: 'lancamentos', favorecidos: 'lancamentos', favorecido_alias: 'lancamentos',
  agendamentos: 'agendamentos', schedule_reserva_funcoes: 'agendamentos', reservas: 'agendamentos',
  categorias: 'cadastros', regras_classificacao: 'cadastros', gerencial_rules: 'cadastros', reservas_funcoes: 'cadastros',
  grupos_conta: 'cadastros', tipos_documento: 'cadastros', account_mapping: 'cadastros',
  orcamento: 'orcamento', envelopes: 'envelopes', card_imports: 'importar', reserve_functions: 'reservas',
  perfis: 'configuracoes', configuracoes: 'configuracoes',
}

// A linha de configurações mistura ajustes do sistema e dados do dia a dia (faturas fechadas,
// centros de custo, ordem de categorias…). Grava quem configura o sistema OU quem edita lançamentos;
// as TELAS de configuração do sistema continuam fechadas para o operador.
export const podeGravarConfiguracoes = (usuario) => pode(usuario, 'configuracoes', 'editar') || pode(usuario, 'lancamentos', 'editar')

// Rota da API (sem /api, sem query) + método → { modulo, acao } que a gravação exige, ou null quando
// a chamada é leitura (ou preferência pessoal). '*' = qualquer módulo gravável. O /api/sync decide
// pela tabela (MODULO_DA_TABELA) dentro do handler; /api/usuarios tem guarda própria (admin) e
// /api/clientes também (administrador da plataforma, PLATAFORMA_ADMIN).
const M = (modulo, acao) => ({ modulo, acao })
const PORMETODO = (modulo) => ({ POST: M(modulo, 'incluir'), PUT: M(modulo, 'editar'), PATCH: M(modulo, 'editar'), DELETE: M(modulo, 'excluir') })
const ROTAS = [
  // leituras via POST
  [/^(search|transaction-history|reserve-function-transactions|fatura-conferencia)$/, () => null],
  [/^(load|ping|auth|account-mapping|atalhos|sync|usuarios|clientes|cadastro-publico)$/, () => null],
  // Agenda no celular: feed do PRÓPRIO usuário (preferência pessoal; grava só no central).
  [/^agenda-feed$/, () => null],
  [/^sync-srf$/, () => M('agendamentos', 'editar')],
  [/^agendamentos$/, () => M('agendamentos', 'editar')],
  [/^transactions-bulk-update$/, () => M('lancamentos', 'editar')],
  [/^lancamento-rateios$/, () => M('lancamentos', 'editar')],
  [/^importacoes-pendentes$/, () => M('importar', 'incluir')],
  [/^import-layouts$/, () => M('importar', 'incluir')],
  [/^(reserve-periods|reserve-snapshots|reserve-adjustments|reserve-daily-ledger)$/, (m) => PORMETODO('reservas')[m]],
  [/^(fluxo-datas-provisorias|fluxo-provisorios|fluxo-consultas)$/, (m) => PORMETODO('fluxo')[m]],
  [/^tipos-documento$/, (m) => PORMETODO('cadastros')[m]],
  [/^(contratos|contrato-itens|contrato-eventos|contrato-regras|contrato-creditos)$/, (m) => PORMETODO('contratos')[m]],
  [/^indices$/, () => null],
  [/^integridade$/, () => M('alertas', 'editar')],
  [/^historico$/, () => M('*', 'editar')],
  [/^(bem\/migrate|backfill-ger-rastreabilidade)$/, () => M('configuracoes', 'editar')],
  [/^bem\/[^/]+\/estornar-entrada$/, () => M('patrimonio', 'excluir')],
  [/^bem\/(criar|[^/]+\/registrar-entrada)$/, () => M('patrimonio', 'incluir')],
  [/^(bem|financiamento)\//, (m) => (m === 'POST' ? M('patrimonio', 'incluir') : M('patrimonio', 'editar'))],
]
export function regraDaRota(rota, metodo) {
  const m = String(metodo || 'GET').toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null
  const r = String(rota || '').replace(/^\/?api\//, '').replace(/^\//, '').split('?')[0].replace(/\/$/, '')
  // bem/financiamento: POST de pagar parcela / atualizar valores são edições do patrimônio
  if (/^financiamento\/criar$/.test(r)) return M('patrimonio', 'incluir')
  if (/^(financiamento\/parcela\/[^/]+\/pagar|bem\/[^/]+\/atualizar-valores|financiamento\/parcelas\/popular-rateios)$/.test(r)) return M('patrimonio', 'editar')
  for (const [re, fn] of ROTAS) if (re.test(r)) return fn(m) ?? null
  // rota desconhecida que grava: exige gravar em algum módulo (nunca libera para Consulta)
  return M('*', 'editar')
}

// Atende a regra? (null = livre)
export const atendeRegra = (usuario, regra) => !regra || pode(usuario, regra.modulo, regra.acao)

// ─── Perfis permitidos ──────────────────────────────────────────────────────────────────────────
// perfis_permitidos: "todos" | [ids de perfis]. Normaliza o que vier do banco/token.
export const normalizarPerfis = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : 'todos')
export const temTodosPerfis = (v) => !Array.isArray(v)
