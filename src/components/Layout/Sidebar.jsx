import {
  LayoutDashboard, CreditCard, Calendar,
  Bell, TrendingUp, PieChart, BarChart3, Settings, Upload,
  Wallet, Loader, Layers, Package, Cloud, AlertTriangle, User, Building2, Gem, Briefcase,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import ThemeToggle from '../ThemeToggle'
import SessaoUsuario from './SessaoUsuario'
import ShortcutHint from '../shared/ShortcutHint'
import { useTituloAtalho } from '../../context/atalhosHooks'

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
  // Só para o administrador da plataforma (prop `plataforma`, decidida pela API).
  { id: 'clientes', label: 'Clientes Finup', icon: Briefcase, plataforma: true },
]

const STATUS_CONFIG = {
  connecting: { icon: Loader,    color: 'text-texto-3',    label: 'Conectando...',  spin: true  },
  connected:  { icon: Cloud,     color: 'text-primary-fg', label: 'Nuvem',          spin: false },
  local:      { icon: AlertTriangle, color: 'text-aviso',   label: 'Local',          spin: false },
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

export default function Sidebar({ active, setActive, alertCount, plataforma }) {
  const { dbStatus, podeVer } = useApp()
  // Itens com atalho global: tooltip com a combinação atual + selo que só aparece segurando Alt.
  const atalhoNav = { cashflow: 'nav.fluxoCaixa', envelopes: 'nav.envelopes' }
  const tituloNav = {
    cashflow: useTituloAtalho('Fluxo de Caixa', atalhoNav.cashflow),
    envelopes: useTituloAtalho('Envelopes', atalhoNav.envelopes),
  }

  return (
    <aside className="hidden md:flex w-56 shrink-0 bg-page border-r border-borda flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-borda">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary">
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="font-bold text-sm text-texto-1">Finup</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.filter((n) => (n.plataforma ? plataforma?.admin : podeVer(n.id))).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            title={tituloNav[id]}
            className={`nav-item relative ${active === id ? 'nav-active' : ''}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {/* Flutua no canto do item (estilo KeyTips): não empurra o rótulo para 2 linhas. */}
            {atalhoNav[id] && <ShortcutHint actionId={atalhoNav[id]} soNoAlt className="absolute -top-1.5 right-1 z-10" />}
            {id === 'clientes' && plataforma?.novos > 0 && (
              <span className="badge bg-ambar text-white" title="Pedidos novos">{plataforma.novos}</span>
            )}
            {id === 'alerts' && alertCount > 0 && (
              <span className="badge bg-perigo-solido text-white">{alertCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="px-4 pt-3 pb-2 border-t border-borda space-y-2.5">
        <div>
          <DbStatusBadge status={dbStatus} />
        </div>

        <ThemeToggle compacto />

        {/* Usuário logado (e aviso de acesso de emergência) */}
        <div className="border-t border-borda/60 pt-2">
          <SessaoUsuario comSair />
        </div>

        {/* Identidade */}
        <div className="border-t border-borda/60 pt-2">
          <p className="text-xs text-texto-3 font-medium leading-tight">Gislaine &amp; Victor Moreira</p>
          <p className="text-xs text-texto-3 leading-tight mt-0.5 italic">Transformando conhecimento em resultados.</p>
          <p className="text-[10px] text-texto-3 leading-tight mt-1 font-mono" title="Versão (commit) em execução">v {import.meta.env.VITE_APP_COMMIT || 'dev'}</p>
        </div>
      </div>
    </aside>
  )
}
