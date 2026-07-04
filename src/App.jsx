import { useState, useMemo, useCallback } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { AppProvider, useApp } from './context/AppContext'
import { FabProvider, useFab } from './context/FabContext'
import { useAutoBackup } from './hooks/useAutoBackup'
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
import PatrimonioPanel from './components/Patrimonio/PatrimonioPanel'
import MonthStartModal from './components/shared/MonthStartModal'
import GlobalSearch from './components/shared/GlobalSearch'
import Login from './pages/Login'
import { getToken } from './lib/api'

function AppContent() {
  const [activePage, setActivePage] = useState('dashboard')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showPosicao, setShowPosicao] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [backupToast, setBackupToast] = useState(false)
  const [genericToast, setGenericToast] = useState(null)
  const { accounts, schedules, getNextOccurrences, getFinancialPeriod, getSaldoPrincipalBreakdown, data } = useApp()
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
      let due = new Date(today.getFullYear(), today.getMonth(), a.dueDay || 10)
      if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, a.dueDay || 10)
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

  const financialPeriod = getFinancialPeriod()

  const panels = {
    dashboard: <DashboardPanel setActivePage={setActivePage} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />,
    accounts: <AccountsPanel />,
    transactions: <TransactionsPanel />,
    credit: <CreditCardPanel />,
    schedule: <SchedulePanel />,
    import: <ImportPanel />,
    cashflow: <CashFlowPanel setActivePage={setActivePage} />,
    reservas:   <ReservasPanel />,
    envelopes:  <EnvelopesPanel />,
    budget:     <BudgetPanel />,
    patrimonio: <PatrimonioPanel />,
    reports: <ReportsPanel />,
    alerts: <AlertsPanel />,
    settings: <SettingsPanel />,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar active={activePage} setActive={setActivePage} alertCount={alertCount} saldoPrincipal={saldoPrincipal} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={activePage} financialPeriod={financialPeriod} onOpenSearch={() => setShowSearch(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {panels[activePage] ?? panels.dashboard}
        </main>
      </div>
      <BottomNav active={activePage} setActive={setActivePage} onFab={handleFab} />
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
      <MonthStartModal />
      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} />
    </div>
  )
}

// Gate de autenticação (equivalente a um PrivateRoute neste SPA sem router): sem token no
// localStorage renderiza o Login; com token, monta o app normalmente (o AppProvider só então
// dispara o carregamento de dados, já com o header Authorization).
function PrivateRoute({ children }) {
  const [token, setToken] = useState(() => getToken())
  if (!token) return <Login onSuccess={() => setToken(getToken())} />
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
