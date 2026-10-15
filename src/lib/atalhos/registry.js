// ATALHOS DE TECLADO — as AÇÕES são fixas no código; o usuário só escolhe a combinação de cada uma
// (Configurações › Cadastros › Atalhos, gravada em atalhos_usuario). Nova ação = nova linha aqui +
// um useAtalho(id, handler) na tela/modal que a executa.
//
// contexto: 'global' (qualquer tela), 'tela:<x>' (só com a tela montada) ou 'modal:<x>' (só com
// aquele modal no topo). Mesma combinação em contextos diferentes é permitida; um conflito existe no
// MESMO contexto ou com uma ação global.
// salvaModal: a ação é o "gravar" do modal — o Ctrl+Enter fixo cai nela quando o modal está no topo.

export const ACOES = [
  { id: 'conta.novoLancamento', label: 'Novo Lançamento', contexto: 'tela:contas', padrao: 'Alt+N' },
  { id: 'lancamento.gravar', label: 'Gravar lançamento', contexto: 'modal:lancamento', padrao: 'Alt+G', salvaModal: true },
  { id: 'lancamento.tipoReceita', label: 'Tipo Receita', contexto: 'modal:lancamento', padrao: 'Alt+1' },
  { id: 'lancamento.tipoDespesa', label: 'Tipo Despesa', contexto: 'modal:lancamento', padrao: 'Alt+2' },
  { id: 'lancamento.tipoTransf', label: 'Tipo Transferência', contexto: 'modal:lancamento', padrao: 'Alt+3' },
  { id: 'lancamento.toggleReserva', label: 'Liga/desliga "Será pago com reserva"', contexto: 'modal:lancamento', padrao: 'Alt+R' },
  { id: 'lancamento.toggleRepetir', label: 'Liga/desliga "Repetir este lançamento"', contexto: 'modal:lancamento', padrao: 'Alt+P' },
  { id: 'nav.fluxoCaixa', label: 'Ir para Fluxo de Caixa', contexto: 'global', padrao: 'Alt+Shift+F' },
  { id: 'nav.envelopes', label: 'Ir para Envelopes', contexto: 'global', padrao: 'Alt+Shift+E' },
  { id: 'agend.executarGerenciais', label: 'Executar Gerenciais', contexto: 'tela:agendamentos', padrao: 'Alt+X' },
  { id: 'agend.lancarProvisao', label: 'Lançar Provisão', contexto: 'tela:agendamentos', padrao: 'Alt+V' },
  { id: 'agend.novoAgendamento', label: 'Novo Agendamento', contexto: 'tela:agendamentos', padrao: 'Alt+N' },
]

// Ordem de exibição dos grupos (Cadastros › Atalhos e a ajuda do Shift+?).
export const CONTEXTOS = [
  { id: 'global', label: 'Global' },
  { id: 'tela:contas', label: 'Contas' },
  { id: 'tela:agendamentos', label: 'Agendamentos' },
  { id: 'modal:lancamento', label: 'Modal Lançamento' },
]

// Fixos e não configuráveis (só exibidos).
export const ATALHOS_FIXOS = [
  { combinacao: 'Ctrl+Enter', label: 'Gravar o modal aberto' },
  { combinacao: 'Escape', label: 'Fechar o modal' },
  { combinacao: 'Shift+?', label: 'Abrir a lista de atalhos' },
]

export const acaoPorId = (id) => ACOES.find(a => a.id === id) || null
export const rotuloContexto = (ctx) => CONTEXTOS.find(c => c.id === ctx)?.label || ctx

// Prioridade de despacho: modal > tela > global.
export const nivelContexto = (ctx) => (ctx?.startsWith('modal:') ? 0 : ctx?.startsWith('tela:') ? 1 : 2)

// { acaoId: combinação | null } efetivo: padrão do registry sobreposto pelo que o usuário gravou
// (`gravados`: { acaoId: combinação | null }, null = desativado; ação ausente = padrão).
export function mapaEfetivo(gravados = {}) {
  const m = {}
  for (const a of ACOES) m[a.id] = Object.prototype.hasOwnProperty.call(gravados, a.id) ? gravados[a.id] : a.padrao
  return m
}

// Ações que já usam `combinacao` e conflitam com `acaoId`: mesmo contexto, ou uma das duas global.
export function acoesEmConflito(acaoId, combinacao, mapa) {
  const acao = acaoPorId(acaoId)
  if (!acao || !combinacao) return []
  return ACOES.filter(b => b.id !== acaoId && mapa[b.id] === combinacao
    && (b.contexto === acao.contexto || b.contexto === 'global' || acao.contexto === 'global'))
}
