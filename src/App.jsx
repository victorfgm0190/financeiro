import { useState, useMemo, useCallback } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { AppProvider, useApp } from './context/AppContext'
import { useAutoBackup } from './hooks/useAutoBackup'
import Toast from './components/shared/Toast'
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
import MonthStartModal from './components/shared/MonthStartModal'

function AppContent() {
  const [activePage, setActivePage] = useState('dashboard')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showPosicao, setShowPosicao] = useState(false)
  const [backupToast, setBackupToast] = useState(false)
  const [genericToast, setGenericToast] = useState(null)
  const { accounts, profileAccounts, activeProfileId, schedules, getNextOccurrences, getFinancialPeriod, getAccountSaldos, data } = useApp()

  const handleAutoBackup = useCallback(() => setBackupToast(true), [])
  useAutoBackup(data, handleAutoBackup)

  // Saldos principais (sidebar/header): os 5 saldos do ciclo agregados sobre o pool de
  // contas (mesmos definidos em getAccountSaldos). Exclui lançamentos fora do ciclo;
  // contas sem saldo de ciclo (ativo/passivo) entram pelo balance armazenado.
  const saldosPrincipais = useMemo(() => {
    const pool = activeProfileId
      ? profileAccounts.filter(a => a.type !== 'credit')
      : accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')
    const agg = { saldoAtual: 0, saldoFinalCiclo: 0, saldoProjetado: 0, saldoAtualCalendario: 0, saldoFinalCalendario: 0 }
    let isCustom = (data.settings?.financialMonthMode || 'custom') === 'custom'
    for (const a of pool) {
      const s = getAccountSaldos(a)
      if (s.applicable) {
        isCustom = s.mode === 'custom'
        agg.saldoAtual += s.saldoAtual
        agg.saldoFinalCiclo += s.saldoFinalCiclo
        agg.saldoProjetado += s.saldoProjetado
        agg.saldoAtualCalendario += (s.saldoAtualCalendario ?? s.saldoAtual)
        agg.saldoFinalCalendario += (s.saldoFinalCalendario ?? s.saldoFinalCiclo)
      } else {
        const b = a.balance || 0
        agg.saldoAtual += b; agg.saldoFinalCiclo += b; agg.saldoProjetado += b
        agg.saldoAtualCalendario += b; agg.saldoFinalCalendario += b
      }
    }
    const round = v => Math.round(v * 100) / 100
    return {
      saldoAtual: round(agg.saldoAtual),
      saldoFinalCiclo: round(agg.saldoFinalCiclo),
      saldoProjetado: round(agg.saldoProjetado),
      saldoAtualCalendario: isCustom ? round(agg.saldoAtualCalendario) : null,
      saldoFinalCalendario: isCustom ? round(agg.saldoFinalCalendario) : null,
      mode: isCustom ? 'custom' : 'calendar',
    }
  }, [activeProfileId, profileAccounts, accounts, getAccountSaldos, data.settings])
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
      <Sidebar active={activePage} setActive={setActivePage} alertCount={alertCount} saldoPrincipal={saldoPrincipal} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={activePage} financialPeriod={financialPeriod} saldoPrincipal={saldoPrincipal} saldosPrincipais={saldosPrincipais} onShowPosicao={() => setShowPosicao(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {panels[activePage] ?? panels.dashboard}
        </main>
      </div>
      <BottomNav active={activePage} setActive={setActivePage} onFab={() => setShowQuickAdd(true)} />
      <Modal open={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Novo Lançamento">
        <TransactionForm onClose={() => setShowQuickAdd(false)} onToast={setGenericToast} />
      </Modal>
      <Modal open={showPosicao} onClose={() => setShowPosicao(false)} title="Posição Financeira" size="lg">
        <PosicaoFinanceiraModal />
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
