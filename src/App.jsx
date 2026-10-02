import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { dueDateInMonth } from './lib/fatura'
import { AppProvider, useApp } from './context/AppContext'
import { FabProvider, useFab } from './context/FabContext'
import { useAutoBackup } from './hooks/useAutoBackup'
import { useScrollRestoration, ScrollScopeContext, saveScrollNow } from './hooks/useScrollRestoration'
import Toast from './components/shared/Toast'
import Sidebar from './components/Layout/Sidebar'
import BottomNav from './components/Layout/BottomNav'
import Header from './components/Layout/Header'
import Modal from './components/shared/Modal'
import TransactionForm from './components/Transactions/TransactionForm'
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

function AppContent() {
  // #config/<aba>/<seção> na URL abre Configurações direto — vale no reload e em links internos.
  const [activePage, setActivePage] = useState(() => (ehHashConfig(window.location.hash) ? 'settings' : 'dashboard'))
  useEffect(() => {
    const onHash = () => { if (ehHashConfig(window.location.hash)) setActivePage('settings') }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [showQuickAdd, setShowQuickAdd] = useState(false)
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
  }, [activePage, scrollScope])
  const scrollCtx = useMemo(() => ({
    setScope: setScrollScope,
    saveNow: () => saveScrollNow(mainRef, scrollScope ?? activePage),
  }), [scrollScope, activePage])
  const { accounts, schedules, getNextOccurrences, getFinancialPeriod, getSaldoPrincipalBreakdown, data, syncError, dismissSyncError } = useApp()
  const { fabAction } = useFab()

  // FAB central (BottomNav mobile): usa a ação contextual registrada pela tela
  // ativa (ex.: novo lançamento na conta/cartão atual); senão, quick-add global.
  const handleFab = useCallback(() => {
    if (fabAction) fabAction()
    else setShowQuickAdd(true)
  }, [fabAction])

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
    accounts: <AccountsPanel />,
    transactions: <TransactionsPanel />,
    credit: <CreditCardPanel />,
    schedule: <SchedulePanel />,
    import: <ImportPanel />,
    cashflow: <CashFlowPanel setActivePage={navigate} />,
    reservas:   <ReservasPanel />,
    envelopes:  <EnvelopesPanel />,
    budget:     <BudgetPanel />,
    patrimonio: <PatrimonioPanel />,
    reports: <ReportsPanel />,
    alerts: <AlertsPanel setActivePage={navigate} integridadePendentes={integridadePendentes} />,
    settings: <SettingsPanel />,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar active={activePage} setActive={navigate} alertCount={alertCount + integridadePendentes} saldoPrincipal={saldoPrincipal} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={activePage} financialPeriod={financialPeriod} onOpenSearch={() => setShowSearch(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-6 main-safe-bottom md:pb-6">
          <ScrollScopeContext.Provider value={scrollCtx}>
            {panels[activePage] ?? panels.dashboard}
          </ScrollScopeContext.Provider>
        </main>
      </div>
      <BottomNav active={activePage} setActive={navigate} onFab={handleFab} />
      <Modal open={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Novo Lançamento">
        <TransactionForm onClose={() => setShowQuickAdd(false)} onToast={setGenericToast} />
      </Modal>
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
  return (
    <PrivateRoute>
      <AppProvider>
        <FabProvider>
          <AppContent />
        </FabProvider>
      </AppProvider>
    </PrivateRoute>
  )
}
