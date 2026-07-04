import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { User, Building2, Search, ChevronDown, LogOut } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { clearTokenAndRedirect } from '../../lib/api'

const PAGE_TITLES = {
  dashboard: 'Painel Geral',
  accounts: 'Contas',
  transactions: 'Lançamentos',
  credit: 'Cartão de Crédito',
  schedule: 'Agendamentos',
  import: 'Importar Fatura',
  cashflow: 'Fluxo de Caixa Futuro',
  reservas: 'Controle de Reservas',
  budget: 'Orçamento por Categoria',
  reports: 'Relatórios',
  alerts: 'Alertas de Vencimento',
  settings: 'Configurações',
}

export default function Header({ page, financialPeriod, onOpenSearch }) {
  const today = new Date()
  const { profiles, activeProfileId, setActiveProfileId } = useApp()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  const activeProfile = profiles.find(p => p.id === activeProfileId) || null

  return (
    <header className="border-b border-gray-800 bg-gray-950 px-4 md:px-6 py-2.5 flex items-center gap-3 sticky top-0 z-10">
      {/* Title + period */}
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-gray-100 leading-tight">{PAGE_TITLES[page] || page}</h1>
        {financialPeriod && page !== 'schedule' && (
          <p className="text-xs text-gray-500 leading-tight">
            {format(financialPeriod.start, 'dd/MM/yyyy')} – {format(financialPeriod.end, 'dd/MM/yyyy')}
          </p>
        )}
      </div>

      {/* Profile filter chips — desktop only (seletor de perfil do desktop) */}
      {profiles.length > 0 && (
        <div className="hidden md:flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none px-1 min-w-0">
          {/* "Tudo" chip */}
          <button
            onClick={() => setActiveProfileId(null)}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              activeProfileId === null
                ? 'bg-gray-600 border-gray-500 text-white'
                : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            Tudo
          </button>

          {profiles.map(p => {
            const isActive = activeProfileId === p.id
            const Icon = p.type === 'pf' ? User : Building2
            return (
              <button
                key={p.id}
                onClick={() => setActiveProfileId(isActive ? null : p.id)}
                title={`${p.name} — ${p.type === 'pf' ? 'CPF' : 'CNPJ'} ${p.document || ''}`}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'
                }`}
                style={isActive ? { backgroundColor: p.color, borderColor: p.color } : {}}
              >
                <Icon size={11} className="shrink-0" />
                <span className="hidden sm:inline truncate max-w-24">{p.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Spacer — empurra o cluster da direita (sempre no mobile; no desktop só quando não há chips) */}
      <div className={`flex-1 ${profiles.length > 0 ? 'md:hidden' : ''}`} />

      {/* Right: busca global + seletor de perfil (mobile) + data (desktop) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenSearch}
          title="Busca global (lançamentos e agendamentos)"
          aria-label="Busca global"
          className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <Search size={18} />
        </button>

        {/* Seletor de perfil — mobile only (substitui o antigo bloco de saldos) */}
        {profiles.length > 0 && (
          <div className="relative md:hidden">
            <button
              onClick={() => setProfileMenuOpen(o => !o)}
              aria-label="Trocar perfil"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-700 bg-gray-800/60 text-gray-200 max-w-[160px]"
              style={activeProfile ? { borderColor: activeProfile.color } : {}}
            >
              {activeProfile
                ? (() => {
                    const Icon = activeProfile.type === 'pf' ? User : Building2
                    return <Icon size={13} className="shrink-0" style={{ color: activeProfile.color }} />
                  })()
                : <User size={13} className="shrink-0 text-gray-400" />}
              <span className="truncate">{activeProfile ? activeProfile.name : 'Tudo'}</span>
              <ChevronDown size={13} className="shrink-0 text-gray-500" />
            </button>

            {profileMenuOpen && (
              <>
                {/* Backdrop para fechar ao clicar fora */}
                <div className="fixed inset-0 z-20" onClick={() => setProfileMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 z-30 w-52 rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1">
                  <button
                    onClick={() => { setActiveProfileId(null); setProfileMenuOpen(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-800 ${
                      activeProfileId === null ? 'text-white font-semibold' : 'text-gray-300'
                    }`}
                  >
                    <User size={13} className="shrink-0 text-gray-400" />
                    <span className="truncate">Tudo</span>
                  </button>
                  {profiles.map(p => {
                    const isActive = activeProfileId === p.id
                    const Icon = p.type === 'pf' ? User : Building2
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setActiveProfileId(p.id); setProfileMenuOpen(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-800 ${
                          isActive ? 'text-white font-semibold' : 'text-gray-300'
                        }`}
                      >
                        <Icon size={13} className="shrink-0" style={{ color: p.color }} />
                        <span className="truncate flex-1">{p.name}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">{p.type === 'pf' ? 'CPF' : 'CNPJ'}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="text-right hidden md:block">
          <p className="text-xs text-gray-400">{format(today, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>

        <button
          onClick={clearTokenAndRedirect}
          title="Sair"
          aria-label="Sair"
          className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
