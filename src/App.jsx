import { AvisoOperacao } from './components/shared/ContaCentralAvisos'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { alertasVencimentoCartao } from './lib/dashboardHoje'
import { useHoje } from './hooks/useHoje'
import { AppProvider, useApp } from './context/AppContext'
import { FabProvider } from './context/FabContext'
import { AtalhosProvider } from './context/AtalhosContext'
import { useAtalho } from './context/atalhosHooks'
import AtalhosAjudaModal from './components/shared/AtalhosAjudaModal'
import ModoAltAtalhos from './components/shared/ModoAltAtalhos'
import { useIsMobile } from './hooks/useIsMobile'
import { useTheme } from './hooks/useTheme'
import { useAgendaFeed } from './hooks/useAgendaFeed'
import { useScrollRestoration, ScrollScopeContext, saveScrollNow } from './hooks/useScrollRestoration'
import Toast from './components/shared/Toast'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import Modal from './components/shared/Modal'
import Assistente from './components/Assistente/Assistente'
import SaldoPrincipalBreakdownModal from './components/Dashboard/SaldoPrincipalBreakdownModal'
import DashboardPanel from './components/Dashboard/DashboardPanel'
import AccountsPanel from './components/Accounts/AccountsPanel'
import TransactionsPanel from './components/Transactions/TransactionsPanel'
import CreditCardPanel from './components/CreditCard/CreditCardPanel'
import SchedulePanel from './components/Schedule/SchedulePanel'
import ImportPanel from './components/Import/ImportPanel'
import ImportarLancamentosPanel from './components/ImportarLancamentos/ImportarLancamentosPanel'
import CashFlowPanel from './components/CashFlow/CashFlowPanel'
import { lembretesAgendamentos } from './lib/lembretesAgendamentos'
import ReservasPanel from './components/Reservas/ReservasPanel'
import EnvelopesPanel from './components/Envelopes/EnvelopesPanel'
import BudgetPanel from './components/Budget/BudgetPanel'
import ReportsPanel from './components/Reports/ReportsPanel'
import AlertsPanel from './components/Alerts/AlertsPanel'
import FaixaOffline from './components/Offline/FaixaOffline'
import SoComInternet from './components/Offline/SoComInternet'
import SettingsPanel from './components/Settings/SettingsPanel'
import { ehHashConfig } from './lib/configRota'
import { ehHashAjuda } from './lib/ajudaRota'
import CentralAjuda from './components/Ajuda/CentralAjuda'
import { EVENTO_NAVEGAR, EVENTO_ABRIR_BUSCA } from './lib/abrirTela'
import BoasVindasTour from './components/BoasVindas/BoasVindasTour'
import JornadaBoasVindas from './components/BoasVindas/JornadaBoasVindas'
import JornadaBarra from './components/BoasVindas/JornadaBarra'
import GuiaInterativo from './components/BoasVindas/GuiaInterativo'
import PatrimonioPanel from './components/Patrimonio/PatrimonioPanel'
import ContratosPanel from './components/Contratos/ContratosPanel'
import ContratoFichaHost from './components/Contratos/ContratoFichaHost'
import ContratoEfetivacaoHost from './components/Contratos/ContratoEfetivacaoHost'
import HelpCampoPainel from './components/Ajuda/HelpCampoPainel'
import GuiaPreenchimento from './components/Ajuda/GuiaPreenchimento'
import AvisoAtalhosMigrados from './components/shared/AvisoAtalhosMigrados'
import ComposicaoParcelaHost from './components/Contratos/ComposicaoParcelaHost'
import MonthStartModal from './components/shared/MonthStartModal'
import GlobalSearch from './components/shared/GlobalSearch'
import PeriodoViradoHost from './components/Reservas/PeriodoViradoHost'
import Login from './pages/Login'
import TrocarSenha from './pages/TrocarSenha'
import CadastroCliente from './pages/CadastroCliente'
import PaginaLegal from './pages/PaginaLegal'
import EntrarComCodigo from './pages/EntrarComCodigo'
import Instalar from './pages/Instalar'
import AvisoUsarComoApp from './components/Layout/UsarComoApp'
import AvisoAtualizacao from './components/Layout/AvisoAtualizacao'
import OQueMudou from './components/Ajuda/Novidades'
import DefinirSenha from './pages/DefinirSenha'
import { AMBIENTE_PRINCIPAL } from './lib/ambienteHost'
import ClientesPanel from './components/Clientes/ClientesPanel'
import { resumoClientes } from './lib/clientesApi'
import { getToken, getSessao } from './lib/api'
import { fetchResumoIntegridade, INTEGRIDADE_EVENTO } from './lib/db'
import MobileShell from './mobile/MobileShell'
import { mobileModules } from './mobile/modules'
import { moduloAposNavegar, moduloMobile } from './mobile/navegacao'
import { podeVerModuloMobile } from './lib/permissoes'

function AppContent() {
  // #config/<aba>/<seção> na URL abre Configurações direto — vale no reload e em links internos.
  // #ajuda/<tela>/<item> abre a Central de Ajuda já na seção.
  const [activePage, setActivePage] = useState(() => (ehHashConfig(window.location.hash) ? 'settings' : ehHashAjuda(window.location.hash) ? 'ajuda' : 'dashboard'))
  // Mobile: módulo aberto no MobileShell (id de src/mobile/modules.js). Acompanha activePage quando
  // um painel navega por página (ex.: "Ver alertas" → Alertas).
  const isMobile = useIsMobile()
  const [mobileAtivo, setMobileAtivo] = useState(() => (ehHashConfig(window.location.hash) ? 'configuracoes' : ehHashAjuda(window.location.hash) ? 'ajuda' : 'inicio'))
  useEffect(() => {
    const onHash = () => {
      const page = ehHashConfig(window.location.hash) ? 'settings' : ehHashAjuda(window.location.hash) ? 'ajuda' : null
      if (!page) return
      setActivePage(page)
      setMobileAtivo(atual => moduloAposNavegar(mobileModules, page, atual))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [showPosicao, setShowPosicao] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  // Remonta a Busca global quando aberta de fora (lê o filtro do handoff na montagem).
  const [buscaKey, setBuscaKey] = useState(0)
  const [showAssistente, setShowAssistente] = useState(false)
  const [genericToast, setGenericToast] = useState(null)

  // Scroll restoration: <main> é o container que rola. A chave base é a activePage; sub-telas
  // (extrato) registram uma chave própria via ScrollScopeContext enquanto montadas.
  const mainRef = useRef(null)
  const [scrollScope, setScrollScope] = useState(null)
  useScrollRestoration(mainRef, scrollScope ?? activePage)

  // Troca de painel (único ponto que muda activePage): salva a posição da tela atual e congela
  // saves na transição antes de navegar — a lista volta na posição certa e o destino abre no
  // topo. Zera o escopo de sub-tela aqui mesmo (sem effect) para não herdar a chave antiga.
  const navigate = useCallback((page) => {
    if (page !== activePage) saveScrollNow(mainRef, scrollScope ?? activePage)
    setScrollScope(null)
    // Saindo de Configurações, o hash dela sai da URL — senão o reload voltaria para lá.
    if ((page !== 'settings' && ehHashConfig(window.location.hash)) || (page !== 'ajuda' && ehHashAjuda(window.location.hash))) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setActivePage(page)
    // Mobile: página só do computador (place: 'desktop' em modules.js) cai no Início.
    setMobileAtivo(atual => moduloAposNavegar(mobileModules, page, atual))
  }, [activePage, scrollScope])
  // Troca de módulo no mobile: módulo de painel passa pelo navigate (hash, activePage); tela própria
  // do mobile (Início, Mais) só troca o módulo.
  useAtalho('nav.fluxoCaixa', () => navigate('cashflow'))
  useAtalho('nav.envelopes', () => navigate('envelopes'))
  // Navegação pedida por quem está fora dos painéis (Assistente IA: abrir_tela, "Abrir a fatura").
  useEffect(() => {
    const ir = (e) => { if (e.detail?.page) navigate(e.detail.page) }
    window.addEventListener(EVENTO_NAVEGAR, ir)
    return () => window.removeEventListener(EVENTO_NAVEGAR, ir)
  }, [navigate])
  // Busca global já preenchida (Assistente: "Ver todos" dos pagos) — o filtro vai por handoff.
  useEffect(() => {
    const abrir = () => { setBuscaKey(k => k + 1); setShowSearch(true) }
    window.addEventListener(EVENTO_ABRIR_BUSCA, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_BUSCA, abrir)
  }, [])
  const irParaModulo = useCallback((id) => {
    const m = mobileModules.find(x => x.id === moduloMobile(mobileModules, id))
    if (m.page) navigate(m.page)
    setMobileAtivo(m.id)
  }, [navigate])
  const scrollCtx = useMemo(() => ({
    setScope: setScrollScope,
    saveNow: () => saveScrollNow(mainRef, scrollScope ?? activePage),
  }), [scrollScope, activePage])
  const { accounts, schedules, getNextOccurrences, getFinancialPeriod, getSaldoPrincipal, syncError, dismissSyncError, avisoRecarga, fecharAvisoRecarga, avisoToast, setAvisoToast, usuario, podeVer, pode } = useApp()
  const podeAssistente = pode('lancamentos', 'incluir')
  // Agenda no celular: gera e publica o .ics do usuário quando os dados mudam (hooks/useAgendaFeed).
  useAgendaFeed()


  // Saldos principais (sidebar/header/hero do Dashboard): os 5 saldos do ciclo derivados da
  // MESMA fonte de verdade do card "Saldo Principal" (getSaldoPrincipal). Assim o
  // header exibe exatamente os mesmos valores que o card — sem engine paralela/legada.
  const saldosPrincipais = useMemo(() => {
    const b = getSaldoPrincipal()
    const isCustom = b.mode === 'custom'
    return {
      saldoAtual: b.saldoAtual.total,
      saldoFinalCiclo: b.finalCiclo.total,
      saldoProjetado: b.projetado.total,
      saldoAtualCalendario: isCustom ? (b.atualCalendario?.total ?? null) : null,
      saldoFinalCalendario: isCustom ? (b.finalCalendario?.total ?? null) : null,
      mode: isCustom ? 'custom' : 'calendar',
      // Pool vazio (perfil sem conta FC): os cards explicam em vez de mostrar R$ 0,00 seco.
      semContasFC: (b.saldoAtual.contas?.length ?? 0) === 0,
    }
  }, [getSaldoPrincipal])
  const saldoPrincipal = saldosPrincipais.saldoAtual

  // `hoje` vira sozinho (useHoje): o contador acompanha a virada do dia com o app aberto.
  const hoje = useHoje()
  const alertCount = useMemo(() => {
    // Cartões e lembretes: as mesmas regras da página de Alertas (dias de calendário).
    const creditCount = alertasVencimentoCartao(accounts, hoje).length
    const schedCount = lembretesAgendamentos(schedules, getNextOccurrences, hoje).length
    return creditCount + schedCount
  }, [accounts, schedules, getNextOccurrences, hoje])

  // Pendências abertas do Motor de Integridade — somam no mesmo badge de Alertas. Recarrega quando
  // a aba Integridade varre/ignora/reabre (evento disparado pelos helpers de db.js).
  const [integridadePendentes, setIntegridadePendentes] = useState(0)
  useEffect(() => {
    let vivo = true
    const atualizar = () => fetchResumoIntegridade()
      .then(r => { if (vivo) setIntegridadePendentes(Number(r?.pendentes) || 0) })
      .catch(() => {})
    atualizar()
    window.addEventListener(INTEGRIDADE_EVENTO, atualizar)
    return () => { vivo = false; window.removeEventListener(INTEGRIDADE_EVENTO, atualizar) }
  }, [])

  // Administrador da PLATAFORMA (PLATAFORMA_ADMIN na API, não o nível admin): só ele vê "Clientes
  // Finup", e só no ambiente principal ('vm'). 403 da API = menu escondido.
  const [plataforma, setPlataforma] = useState({ admin: false, novos: 0 })
  const atualizarPlataforma = useCallback(() => {
    if (getSessao()?.ambSigla !== AMBIENTE_PRINCIPAL) return
    resumoClientes().then(setPlataforma).catch(() => {})
  }, [])
  useEffect(() => { atualizarPlataforma() }, [atualizarPlataforma])

  const financialPeriod = getFinancialPeriod()

  // Páginas e módulos sem permissão de "ver" somem; página proibida aberta (hash, atalho, link de
  // outro painel) cai no Painel.
  const paginaVisivel = activePage === 'clientes' ? (plataforma.admin ? 'clientes' : 'dashboard') : podeVer(activePage) ? activePage : 'dashboard'
  const modulosVisiveis = useMemo(
    () => mobileModules.filter(m => (m.plataforma ? plataforma.admin : podeVerModuloMobile(usuario, m))),
    [usuario, plataforma.admin],
  )

  const panels = {
    dashboard: <DashboardPanel setActivePage={navigate} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />,
    accounts: <AccountsPanel setActivePage={navigate} />,
    transactions: <TransactionsPanel />,
    credit: <CreditCardPanel />,
    schedule: <SchedulePanel />,
    import: <SoComInternet titulo="Importar Fatura"><ImportPanel /></SoComInternet>,
    'importar-lancamentos': <SoComInternet titulo="Importar lançamentos"><ImportarLancamentosPanel /></SoComInternet>,
    cashflow: <CashFlowPanel setActivePage={navigate} />,
    reservas:   <ReservasPanel />,
    envelopes:  <EnvelopesPanel />,
    budget:     <BudgetPanel />,
    patrimonio: <PatrimonioPanel setActivePage={navigate} />,
    contratos: <SoComInternet titulo="Contratos"><ContratosPanel /></SoComInternet>,
    reports: <ReportsPanel />,
    alerts: <AlertsPanel setActivePage={navigate} integridadePendentes={integridadePendentes} />,
    settings: <SettingsPanel />,
    ajuda: <CentralAjuda />,
    clientes: <SoComInternet titulo="Clientes Finup"><ClientesPanel onMudou={atualizarPlataforma} /></SoComInternet>,
  }

  // Modais/toasts globais — iguais no desktop e no mobile.
  const overlays = (
    <>
      <AvisoOperacao />
      <Modal open={showPosicao} onClose={() => setShowPosicao(false)} title="Como chegamos aqui" size="lg">
        <SaldoPrincipalBreakdownModal />
      </Modal>
      {genericToast && (
        <Toast message={genericToast} onClose={() => setGenericToast(null)} />
      )}
      {avisoRecarga && (
        <Toast message={avisoRecarga.texto} variant={avisoRecarga.erro ? 'error' : 'success'} duration={3500} onClose={fecharAvisoRecarga} />
      )}
      {syncError && (
        <Toast message={syncError} variant="error" duration={8000} onClose={dismissSyncError} />
      )}
      {avisoToast && (
        <Toast message={avisoToast} variant="aviso" duration={8000} onClose={() => setAvisoToast(null)} />
      )}
      <MonthStartModal />
      <ContratoFichaHost />
      <ContratoEfetivacaoHost />
      <ComposicaoParcelaHost />
      <PeriodoViradoHost />
      <GlobalSearch key={buscaKey} open={showSearch} onClose={() => setShowSearch(false)} />
      <Modal open={showAssistente} onClose={() => setShowAssistente(false)} title="✨ Assistente" size="lg">
        {showAssistente && <Assistente onClose={() => setShowAssistente(false)} onToast={setGenericToast} />}
      </Modal>
      <AtalhosAjudaModal />
      <AvisoAtalhosMigrados />
      <ModoAltAtalhos />
      <BoasVindasTour />
      <JornadaBoasVindas />
      <JornadaBarra />
      <GuiaInterativo />
      <HelpCampoPainel />
      <GuiaPreenchimento />
      {/* Versão nova (computador: janelinha; celular: faixa) e "O que mudou" depois de atualizar. */}
      <AvisoAtualizacao />
      <OQueMudou />
    </>
  )

  // Mobile (< 768px): navegação própria (barra inferior, "+", Início, Mais). Desktop segue abaixo.
  if (isMobile) {
    return (
      <>
        <MobileShell
          modules={modulosVisiveis}
          panels={panels}
          // Ponto único de proteção: módulo só do computador, inválido ou sem permissão → Início.
          ativo={moduloMobile(modulosVisiveis, mobileAtivo)}
          irPara={irParaModulo}
          saldosPrincipais={saldosPrincipais}
          onToast={setGenericToast}
          onOpenSearch={() => setShowSearch(true)}
        />
        {overlays}
      </>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar active={paginaVisivel} setActive={navigate} plataforma={plataforma} alertCount={alertCount + integridadePendentes} saldoPrincipal={saldoPrincipal} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={paginaVisivel} financialPeriod={financialPeriod} onOpenSearch={() => setShowSearch(true)}
          onOpenAssistente={podeAssistente ? () => setShowAssistente(true) : null} />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-6 main-safe-bottom md:pb-6">
          <ScrollScopeContext.Provider value={scrollCtx}>
            <FaixaOffline />
            {panels[paginaVisivel] ?? panels.dashboard}
          </ScrollScopeContext.Provider>
        </main>
      </div>
      {overlays}
      {/* Só no computador: "Use o Finup como aplicativo" (o celular tem "Instalar no celular"). */}
      <AvisoUsarComoApp />
    </div>
  )
}

// Gate de autenticação (equivalente a um PrivateRoute neste SPA sem router): sem token no
// localStorage renderiza o Login; com token, monta o app normalmente (o AppProvider só então
// dispara o carregamento de dados, já com o header Authorization).
function PrivateRoute({ children }) {
  // Lido uma vez ao montar: o login salva o token e recarrega a página, então a sessão vem daqui.
  const [token] = useState(() => getToken())
  if (!token) return <><Login /><HelpCampoPainel semLogin /></>
  // "Trocar senha no próximo login": o app só abre depois da troca.
  if (getSessao()?.trocarSenha) return <><TrocarSenha /><HelpCampoPainel semLogin /></>
  return children
}

// Páginas PÚBLICAS (sem login) por caminho — o vercel.json manda tudo que não é /api para o index.
const PAGINAS_PUBLICAS = {
  '/quero-ser-cliente': () => <CadastroCliente />,
  '/termos': () => <PaginaLegal tipo="termos" />,
  '/privacidade': () => <PaginaLegal tipo="privacidade" />,
  // Código de passagem do login no www → token deste endereço (<sigla>.finup.app.br).
  '/entrar': () => <EntrarComCodigo />,
  // Link de senha do e-mail (esqueci / convite) — token procurado no banco do ambiente deste endereço.
  '/definir-senha': () => <DefinirSenha />,
  // Passo a passo para instalar o Finup (PWA) — link do e-mail de boas-vindas e do menu do usuário.
  '/instalar': () => <Instalar />,
}

export default function App() {
  // Aplica o tema do contexto atual (mobile/desktop) no <html> — inclusive no Login e ao cruzar o
  // breakpoint ou mudar o tema do sistema, mesmo sem nenhum ThemeToggle montado.
  useTheme()
  const publica = PAGINAS_PUBLICAS[window.location.pathname.replace(/\/+$/, '')]
  // Painel do help de campo também nas páginas públicas (Pedido de cadastro, Definir senha).
  if (publica) return <>{publica()}<HelpCampoPainel semLogin /></>
  return (
    <PrivateRoute>
      <AppProvider>
        <FabProvider>
          <AtalhosProvider>
            <AppContent />
          </AtalhosProvider>
        </FabProvider>
      </AppProvider>
    </PrivateRoute>
  )
}
