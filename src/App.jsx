import { useState, useMemo } from 'react'
import { differenceInDays } from 'date-fns'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import DashboardPanel from './components/Dashboard/DashboardPanel'
import AccountsPanel from './components/Accounts/AccountsPanel'
import TransactionsPanel from './components/Transactions/TransactionsPanel'
import CreditCardPanel from './components/CreditCard/CreditCardPanel'
import SchedulePanel from './components/Schedule/SchedulePanel'
import ImportPanel from './components/Import/ImportPanel'
import CashFlowPanel from './components/CashFlow/CashFlowPanel'
import BudgetPanel from './components/Budget/BudgetPanel'
import ReportsPanel from './components/Reports/ReportsPanel'
import AlertsPanel from './components/Alerts/AlertsPanel'
import SettingsPanel from './components/Settings/SettingsPanel'

function AppContent() {
  const [activePage, setActivePage] = useState('dashboard')
  const { accounts, getFinancialPeriod } = useApp()

  const alertCount = useMemo(() => {
    const today = new Date()
    return accounts.filter(a => {
      if (a.type !== 'credit') return false
      let due = new Date(today.getFullYear(), today.getMonth(), a.dueDay || 10)
      if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, a.dueDay || 10)
      return differenceInDays(due, today) <= 5
    }).length
  }, [accounts])

  const financialPeriod = getFinancialPeriod()

  const panels = {
    dashboard: <DashboardPanel setActivePage={setActivePage} />,
    accounts: <AccountsPanel />,
    transactions: <TransactionsPanel />,
    credit: <CreditCardPanel />,
    schedule: <SchedulePanel />,
    import: <ImportPanel />,
    cashflow: <CashFlowPanel />,
    budget: <BudgetPanel />,
    reports: <ReportsPanel />,
    alerts: <AlertsPanel />,
    settings: <SettingsPanel />,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar active={activePage} setActive={setActivePage} alertCount={alertCount} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={activePage} financialPeriod={financialPeriod} />
        <main className="flex-1 overflow-y-auto p-6">
          {panels[activePage] ?? panels.dashboard}
        </main>
      </div>
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
