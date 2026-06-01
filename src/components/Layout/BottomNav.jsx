import { LayoutDashboard, Wallet, Calendar, CreditCard, Plus, Layers } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Painel' },
  { id: 'accounts',  icon: Wallet,          label: 'Contas' },
  { id: '__fab__',   icon: Plus,            label: '' },
  { id: 'schedule',  icon: Calendar,        label: 'Agenda' },
  { id: 'reservas',  icon: Layers,          label: 'Reservas' },
  { id: 'credit',    icon: CreditCard,      label: 'Cartão' },
]

export default function BottomNav({ active, setActive, onFab }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-gray-950 border-t border-gray-800 flex items-center h-16">
      {NAV_ITEMS.map(item => {
        if (item.id === '__fab__') {
          return (
            <button key="fab" onClick={onFab} className="flex-1 flex justify-center items-center">
              <span
                className="w-12 h-12 -mt-5 rounded-full flex items-center justify-center shadow-lg"
                style={{ backgroundColor: '#0F6E56', boxShadow: '0 4px 16px rgba(15,110,86,0.4)' }}
              >
                <Plus size={22} className="text-white" />
              </span>
            </button>
          )
        }
        const Icon = item.icon
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              isActive ? 'text-[#0F6E56]' : 'text-gray-500'
            }`}
          >
            <Icon size={19} />
            <span className="text-[10px] leading-none">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
