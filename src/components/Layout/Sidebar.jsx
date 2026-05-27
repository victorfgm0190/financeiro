import {
  LayoutDashboard, CreditCard, ArrowLeftRight, Calendar,
  Bell, TrendingUp, PieChart, BarChart3, Settings, Upload,
  Wallet, ChevronRight
} from 'lucide-react'

const NAV = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'accounts', label: 'Contas', icon: Wallet },
  { id: 'transactions', label: 'Lançamentos', icon: ArrowLeftRight },
  { id: 'credit', label: 'Cartão de Crédito', icon: CreditCard },
  { id: 'schedule', label: 'Agendamentos', icon: Calendar },
  { id: 'import', label: 'Importar Fatura', icon: Upload },
  { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
  { id: 'budget', label: 'Orçamento', icon: PieChart },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'alerts', label: 'Alertas', icon: Bell },
  { id: 'settings', label: 'Configurações', icon: Settings },
]

export default function Sidebar({ active, setActive, alertCount }) {
  return (
    <aside className="w-56 shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#0F6E56' }}>
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="font-bold text-sm text-white">FinApp</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`nav-item ${active === id ? 'nav-active' : ''}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {id === 'alerts' && alertCount > 0 && (
              <span className="badge bg-red-600 text-white">{alertCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600">v1.0 · Dados locais</p>
      </div>
    </aside>
  )
}
