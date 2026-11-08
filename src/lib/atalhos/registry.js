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

// Fixos e não configuráveis (só exibidos). `trava`: linha com cadeado (nunca pode virar atalho).
export const ATALHOS_FIXOS = [
  { combinacao: 'F1', label: 'Ajuda do campo (ou da tela, fora de um campo)', trava: true },
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

// MIGRAÇÃO das regras novas (F1 fixa, RESERVED_KEYS, modificador obrigatório, sem duplicados):
// atalho gravado que as viola volta ao padrão (se o padrão vale e não conflita) ou é desativado.
//   gravados: { acaoId: combinacao | null }; validar: validarCombinacao.
// → { mudancas: [{ acaoId, de, para: 'padrao' | null, motivo }] } (vazio = nada a corrigir).
export function sanearAtalhos(gravados, validar) {
  const mudancas = []
  const efetivo = mapaEfetivo(gravados)
  for (const a of ACOES) {
    if (!Object.prototype.hasOwnProperty.call(gravados || {}, a.id)) continue
    const c = gravados[a.id]
    if (c == null) continue
    const motivo = validar(c)
    if (!motivo) continue
    const semEle = { ...efetivo, [a.id]: a.padrao }
    const padraoVale = !validar(a.padrao) && !acoesEmConflito(a.id, a.padrao, semEle).length
    mudancas.push({ acaoId: a.id, de: c, para: padraoVale ? 'padrao' : null, motivo })
    efetivo[a.id] = padraoVale ? a.padrao : null
  }
  // Duplicados que sobraram (mesma combinação no mesmo contexto ou com uma global): fica a ação que vem
  // antes na lista; a gravada depois é desativada.
  for (const a of ACOES) {
    const c = efetivo[a.id]
    if (!c || !Object.prototype.hasOwnProperty.call(gravados || {}, a.id)) continue
    if (acoesEmConflito(a.id, c, efetivo).some(b => ACOES.indexOf(b) < ACOES.indexOf(a))) {
      mudancas.push({ acaoId: a.id, de: c, para: null, motivo: 'Combinação repetida em outra ação.' })
      efetivo[a.id] = null
    }
  }
  return { mudancas }
}

// Ações que já usam `combinacao` e conflitam com `acaoId`: mesmo contexto, ou uma das duas global.
export function acoesEmConflito(acaoId, combinacao, mapa) {
  const acao = acaoPorId(acaoId)
  if (!acao || !combinacao) return []
  return ACOES.filter(b => b.id !== acaoId && mapa[b.id] === combinacao
    && (b.contexto === acao.contexto || b.contexto === 'global' || acao.contexto === 'global'))
}
