import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { dueDateInMonth } from './lib/fatura'
import { AppProvider, useApp } from './context/AppContext'
import { FabProvider } from './context/FabContext'
import { AtalhosProvider } from './context/AtalhosContext'
import { useAtalho } from './context/atalhosHooks'
import AtalhosAjudaModal from './components/shared/AtalhosAjudaModal'
import { useIsMobile } from './hooks/useIsMobile'
import { useTheme } from './hooks/useTheme'
import { useAutoBackup } from './hooks/useAutoBackup'
import { useScrollRestoration, ScrollScopeContext, saveScrollNow } from './hooks/useScrollRestoration'
import Toast from './components/shared/Toast'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import Modal from './components/shared/Modal'
import SaldoPrincipalBreakdownModal from './components/Dashboard/SaldoPrincipalBreakdownModal'
import DashboardPanel from './components/Dashboard/DashboardPanel'
import AccountsPanel from './components/Accounts/AccountsPanel'
import TransactionsPanel from './components/Transactions/TransactionsPanel'
import CreditCardPanel from './components/CreditCard/CreditCardPanel'
import SchedulePanel from './components/Schedule/SchedulePanel'
import ImportPanel from './components/Import/ImportPanel'
import CashFlowPanel from './components/CashFlow/CashFlowPanel'
import ReservasPanel from './components/Reservas/ReservasPanel'
import EnvelopesPanel from './components/Envelopes/EnvelopesPanel'
import BudgetPanel from './components/Budget/BudgetPanel'
import ReportsPanel from './components/Reports/ReportsPanel'
import AlertsPanel from './components/Alerts/AlertsPanel'
import SettingsPanel from './components/Settings/SettingsPanel'
import { ehHashConfig } from './lib/configRota'
import PatrimonioPanel from './components/Patrimonio/PatrimonioPanel'
import MonthStartModal from './components/shared/MonthStartModal'
import GlobalSearch from './components/shared/GlobalSearch'
import Login from './pages/Login'
import { getToken } from './lib/api'
import { fetchResumoIntegridade, INTEGRIDADE_EVENTO } from './lib/db'
import MobileShell from './mobile/MobileShell'
import { mobileModules } from './mobile/modules'
import { moduloAposNavegar, moduloMobile } from './mobile/navegacao'

function AppContent() {
  // #config/<aba>/<seção> na URL abre Configurações direto — vale no reload e em links internos.
  const [activePage, setActivePage] = useState(() => (ehHashConfig(window.location.hash) ? 'settings' : 'dashboard'))
  // Mobile: módulo aberto no MobileShell (id de src/mobile/modules.js). Acompanha activePage quando
  // um painel navega por página (ex.: "Ver alertas" → Alertas).
  const isMobile = useIsMobile()
  const [mobileAtivo, setMobileAtivo] = useState(() => (ehHashConfig(window.location.hash) ? 'configuracoes' : 'inicio'))
  useEffect(() => {
    const onHash = () => {
      if (!ehHashConfig(window.location.hash)) return
      setActivePage('settings')
      setMobileAtivo(atual => moduloAposNavegar(mobileModules, 'settings', atual))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [showPosicao, setShowPosicao] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [backupToast, setBackupToast] = useState(false)
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
    if (page !== 'settings' && ehHashConfig(window.location.hash)) {
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
  const irParaModulo = useCallback((id) => {
    const m = mobileModules.find(x => x.id === moduloMobile(mobileModules, id))
    if (m.page) navigate(m.page)
    setMobileAtivo(m.id)
  }, [navigate])
  const scrollCtx = useMemo(() => ({
    setScope: setScrollScope,
    saveNow: () => saveScrollNow(mainRef, scrollScope ?? activePage),
  }), [scrollScope, activePage])
  const { accounts, schedules, getNextOccurrences, getFinancialPeriod, getSaldoPrincipalBreakdown, data, syncError, dismissSyncError } = useApp()

  const handleAutoBackup = useCallback(() => setBackupToast(true), [])
  useAutoBackup(data, handleAutoBackup)

  // Saldos principais (sidebar/header/hero do Dashboard): os 5 saldos do ciclo derivados da
  // MESMA fonte de verdade do card "Saldo Principal" (getSaldoPrincipalBreakdown). Assim o
  // header exibe exatamente os mesmos valores que o card — sem engine paralela/legada.
  const saldosPrincipais = useMemo(() => {
    const b = getSaldoPrincipalBreakdown()
    const isCustom = b.mode === 'custom'
    return {
      saldoAtual: b.saldoAtual.total,
      saldoFinalCiclo: b.finalCiclo.total,
      saldoProjetado: b.projetado.total,
      saldoAtualCalendario: isCustom ? (b.atualCalendario?.total ?? null) : null,
      saldoFinalCalendario: isCustom ? (b.finalCalendario?.total ?? null) : null,
      mode: isCustom ? 'custom' : 'calendar',
    }
  }, [getSaldoPrincipalBreakdown])
  const saldoPrincipal = saldosPrincipais.saldoAtual

  const alertCount = useMemo(() => {
    const today = new Date()
    const creditCount = accounts.filter(a => {
      if (a.type !== 'credit') return false
      // dueDateInMonth clampa o dia ao último do mês — dueDay 31 em fevereiro fazia
      // rollover silencioso para março e o alerta contava os dias até a data errada.
      let due = dueDateInMonth(today.getFullYear(), today.getMonth(), a.dueDay || 10)
      if (due < today) due = dueDateInMonth(today.getFullYear(), today.getMonth() + 1, a.dueDay || 10)
      return differenceInDays(due, today) <= 5
    }).length
    const schedCount = schedules.filter(s => {
      const remindDays = s.remindDaysBefore ?? 3
      if (remindDays <= 0) return false
      const next = getNextOccurrences(s, 1)
      if (!next.length) return false
      const days = differenceInDays(parseISO(next[0]), today)
      return days >= 0 && days <= remindDays
    }).length
    return creditCount + schedCount
  }, [accounts, schedules, getNextOccurrences])

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

  const financialPeriod = getFinancialPeriod()

  const panels = {
    dashboard: <DashboardPanel setActivePage={navigate} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />,
    accounts: <AccountsPanel setActivePage={navigate} />,
    transactions: <TransactionsPanel />,
    credit: <CreditCardPanel />,
    schedule: <SchedulePanel />,
    import: <ImportPanel />,
    cashflow: <CashFlowPanel setActivePage={navigate} />,
    reservas:   <ReservasPanel />,
    envelopes:  <EnvelopesPanel />,
    budget:     <BudgetPanel />,
    patrimonio: <PatrimonioPanel setActivePage={navigate} />,
    reports: <ReportsPanel />,
    alerts: <AlertsPanel setActivePage={navigate} integridadePendentes={integridadePendentes} />,
    settings: <SettingsPanel />,
  }

  // Modais/toasts globais — iguais no desktop e no mobile.
  const overlays = (
    <>
      <Modal open={showPosicao} onClose={() => setShowPosicao(false)} title="Como chegamos aqui" size="lg">
        <SaldoPrincipalBreakdownModal />
      </Modal>
      {backupToast && (
        <Toast
          message="Backup automático salvo na pasta Downloads"
          onClose={() => setBackupToast(false)}
        />
      )}
      {genericToast && (
        <Toast message={genericToast} onClose={() => setGenericToast(null)} />
      )}
      {syncError && (
        <Toast message={syncError} variant="error" duration={8000} onClose={dismissSyncError} />
      )}
      <MonthStartModal />
      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} />
      <AtalhosAjudaModal />
    </>
  )

  // Mobile (< 768px): navegação própria (barra inferior, "+", Início, Mais). Desktop segue abaixo.
  if (isMobile) {
    return (
      <>
        <MobileShell
          modules={mobileModules}
          panels={panels}
          // Ponto único de proteção: módulo só do computador ou inválido → Início.
          ativo={moduloMobile(mobileModules, mobileAtivo)}
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
      <Sidebar active={activePage} setActive={navigate} alertCount={alertCount + integridadePendentes} saldoPrincipal={saldoPrincipal} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={activePage} financialPeriod={financialPeriod} onOpenSearch={() => setShowSearch(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-6 main-safe-bottom md:pb-6">
          <ScrollScopeContext.Provider value={scrollCtx}>
            {panels[activePage] ?? panels.dashboard}
          </ScrollScopeContext.Provider>
        </main>
      </div>
      {overlays}
    </div>
  )
}

// Gate de autenticação (equivalente a um PrivateRoute neste SPA sem router): sem token no
// localStorage renderiza o Login; com token, monta o app normalmente (o AppProvider só então
// dispara o carregamento de dados, já com o header Authorization).
function PrivateRoute({ children }) {
  // Lido uma vez ao montar: o login salva o token e recarrega a página, então a sessão vem daqui.
  const [token] = useState(() => getToken())
  if (!token) return <Login />
  return children
}

export default function App() {
  // Aplica o tema do contexto atual (mobile/desktop) no <html> — inclusive no Login e ao cruzar o
  // breakpoint ou mudar o tema do sistema, mesmo sem nenhum ThemeToggle montado.
  useTheme()
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
