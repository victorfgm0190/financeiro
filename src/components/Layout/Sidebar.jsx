import {
  LayoutDashboard, CreditCard, Calendar,
  Bell, TrendingUp, PieChart, BarChart3, Settings, Upload,
  Wallet, Loader, Layers, Package, Cloud, HardDrive, User, Building2, Gem,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

const NAV = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'accounts', label: 'Contas', icon: Wallet },
  { id: 'credit', label: 'Cartão de Crédito', icon: CreditCard },
  { id: 'schedule', label: 'Agendamentos', icon: Calendar },
  { id: 'import', label: 'Importar Fatura', icon: Upload },
  { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
  { id: 'reservas',   label: 'Reservas',   icon: Layers  },
  { id: 'envelopes',  label: 'Envelopes',  icon: Package },
  { id: 'budget',     label: 'Orçamento',  icon: PieChart },
  { id: 'patrimonio', label: 'Patrimônio', icon: Gem },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'alerts', label: 'Alertas', icon: Bell },
  { id: 'settings', label: 'Configurações', icon: Settings },
]

const STATUS_CONFIG = {
  connecting: { icon: Loader,    color: 'text-gray-500',    label: 'Conectando...',  spin: true  },
  connected:  { icon: Cloud,     color: 'text-emerald-500', label: 'Nuvem',          spin: false },
  local:      { icon: HardDrive, color: 'text-blue-400',   label: 'Local',          spin: false },
}

function DbStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.error
  const Icon = cfg.icon
  return (
    <div className={`flex items-center gap-1.5 ${cfg.color}`} title={`Banco de dados: ${cfg.label}`}>
      <Icon size={11} className={cfg.spin ? 'animate-spin' : ''} />
      <span className="text-xs">{cfg.label}</span>
    </div>
  )
}

export default function Sidebar({ active, setActive, alertCount, saldoPrincipal, saldosPrincipais, onShowPosicao }) {
  const { dbStatus, profiles, activeProfileId } = useApp()
  const activeProfile = profiles?.find(p => p.id === activeProfileId) || null

  // Linha secundária do widget: mesmos saldos do ciclo dos cards isMain, em formato
  // compacto. Oculta cada saldo igual ao anterior mostrado; calendário só no modo custom.
  const saldoSecRows = (() => {
    const s = saldosPrincipais
    if (!s) return []
    const rows = []
    let last = s.saldoAtual
    const push = (label, val) => {
      if (val == null || Math.abs(val - last) < 0.005) return
      rows.push({ label, val }); last = val
    }
    push('Final Ciclo', s.saldoFinalCiclo)
    push('Projetado', s.saldoProjetado)
    if (s.mode === 'custom') {
      push('Atual Cal.', s.saldoAtualCalendario)
      push('Final Cal.', s.saldoFinalCalendario)
    }
    return rows
  })()

  return (
    <aside className="hidden md:flex w-56 shrink-0 bg-gray-950 border-r border-gray-800 flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#0F6E56' }}>
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="font-bold text-sm text-white">Finup</span>
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
      <div className="px-4 pt-3 pb-2 border-t border-gray-800 space-y-2.5">
        {/* Saldo Principal */}
        <button
          onClick={onShowPosicao}
          className="w-full text-left group"
          title="Ver posição financeira"
        >
          {activeProfile ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: activeProfile.color }} />
              <p className="text-xs font-medium truncate" style={{ color: activeProfile.color }}>{activeProfile.name}</p>
            </div>
          ) : (
            <p className="text-xs text-gray-600 uppercase tracking-wide">Saldo Principal</p>
          )}
          <p className={`text-base font-bold mt-0.5 group-hover:opacity-80 transition-opacity ${(saldoPrincipal ?? 0) >= 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
            {fmt(saldoPrincipal ?? 0)}
          </p>
          {saldoSecRows.length > 0 && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] leading-tight text-gray-500">
              {saldoSecRows.map(r => (
                <span key={r.label}>
                  <span className="text-gray-600">{r.label}</span> {fmt(r.val)}
                </span>
              ))}
            </div>
          )}
        </button>

        <div className="border-t border-gray-800/60 pt-2">
          <DbStatusBadge status={dbStatus} />
        </div>

        {/* Identidade */}
        <div className="border-t border-gray-800/60 pt-2">
          <p className="text-xs text-gray-600 font-medium leading-tight">Gislaine &amp; Victor Moreira</p>
          <p className="text-xs text-gray-700 leading-tight mt-0.5 italic">Transformando conhecimento em resultados.</p>
        </div>
      </div>
    </aside>
  )
}
