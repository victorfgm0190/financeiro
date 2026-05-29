import { useState, useMemo } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Layout/Sidebar'
import BottomNav from './components/Layout/BottomNav'
import Header from './components/Layout/Header'
import Modal from './components/shared/Modal'
import TransactionForm from './components/Transactions/TransactionForm'
import PosicaoFinanceiraModal from './components/Dashboard/PosicaoFinanceiraModal'
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

function AppContent() {
  const [activePage, setActivePage] = useState('dashboard')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showPosicao, setShowPosicao] = useState(false)
  const { accounts, profileAccounts, activeProfileId, schedules, getNextOccurrences, getFinancialPeriod } = useApp()

  const saldoPrincipal = activeProfileId
    ? profileAccounts.filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)
    : accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').reduce((s, a) => s + (a.balance || 0), 0)

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
    dashboard: <DashboardPanel setActivePage={setActivePage} onShowPosicao={() => setShowPosicao(true)} />,
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
      <Sidebar active={activePage} setActive={setActivePage} alertCount={alertCount} saldoPrincipal={saldoPrincipal} onShowPosicao={() => setShowPosicao(true)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={activePage} financialPeriod={financialPeriod} saldoPrincipal={saldoPrincipal} onShowPosicao={() => setShowPosicao(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {panels[activePage] ?? panels.dashboard}
        </main>
      </div>
      <BottomNav active={activePage} setActive={setActivePage} onFab={() => setShowQuickAdd(true)} />
      <Modal open={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Novo Lançamento">
        <TransactionForm onClose={() => setShowQuickAdd(false)} />
      </Modal>
      <Modal open={showPosicao} onClose={() => setShowPosicao(false)} title="Posição Financeira" size="lg">
        <PosicaoFinanceiraModal />
      </Modal>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
