// Handoff entre telas: quem navega deixa { ... } no sessionStorage e a tela de destino lê (e apaga)
// uma vez, ao montar. Mesmo mecanismo do "Ir para a fatura" da Integridade.
export const ABRIR_FATURA_KEY = 'finup:abrirFatura'    // { cardId, faturaMesAno } → CreditCardPanel
export const ABRIR_EXTRATO_KEY = 'finup:abrirExtrato'  // { accountId } → AccountsPanel
export const ABRIR_BEM_KEY = 'finup:abrirBem'          // { accountId } → PatrimonioPanel
export const ABRIR_AGENDAMENTO_KEY = 'finup:abrirAgendamento' // { scheduleId } → SchedulePanel (Editar)
// { status: 'apagar'|'pagos', payee, desc, cat } → SchedulePanel (aba Conta, filtros avançados)
export const ABRIR_AGENDAMENTOS_FILTRO_KEY = 'finup:abrirAgendamentosFiltro'
// { payee, description, from, to } → Busca global já preenchida (e buscando)
export const ABRIR_BUSCA_KEY = 'finup:abrirBusca'
export const EVENTO_ABRIR_BUSCA = 'finup:abrir-busca'

export function deixarHandoff(key, valor) {
  try { sessionStorage.setItem(key, JSON.stringify(valor)) } catch { /* ignore */ }
}

export function lerHandoff(key) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null')
    sessionStorage.removeItem(key)
    return v
  } catch { return null }
}

// Navegação pedida de fora do App (ex.: Assistente IA, que roda dentro de um modal/sheet): deixa o
// handoff (opcional) e pede ao App para trocar de tela. O App escuta EVENTO_NAVEGAR e chama o
// mesmo navigate() dos menus. `hash` (opcional) = rota de Configurações (#config/<aba>/<seção>).
export const EVENTO_NAVEGAR = 'finup:navegar'
export function navegarPara(page, { handoff = null, hash = null } = {}) {
  if (handoff) deixarHandoff(handoff.key, handoff.valor)
  try {
    if (hash) window.history.replaceState(null, '', window.location.pathname + window.location.search + hash)
    window.dispatchEvent(new CustomEvent(EVENTO_NAVEGAR, { detail: { page } }))
  } catch { /* sem window */ }
}

// Abre a Busca global já preenchida (Assistente: "Ver todos" dos pagos). O App escuta o evento.
export function abrirBusca(filtros) {
  deixarHandoff(ABRIR_BUSCA_KEY, filtros)
  try { window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BUSCA)) } catch { /* sem window */ }
}
