import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { User, Building2, Search, ChevronDown, LogOut } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import SairModal from '../Offline/SairModal'
import { cabecalhoDaPagina } from './cabecalhoPagina'

const PAGE_TITLES = {
  dashboard: 'Painel Geral',
  accounts: 'Contas',
  transactions: 'Lançamentos',
  credit: 'Cartão de Crédito',
  schedule: 'Agendamentos',
  import: 'Importar Fatura',
  'importar-lancamentos': 'Importar lançamentos',
  cashflow: 'Fluxo de Caixa Futuro',
  reservas: 'Controle de Reservas',
  budget: 'Orçamento por Categoria',
  reports: 'Relatórios',
  patrimonio: 'Patrimônio',
  contratos: 'Contratos',
  envelopes: 'Envelopes',
  alerts: 'Alertas de Vencimento',
  settings: 'Configurações',
  clientes: 'Clientes Finup',
}

export default function Header({ page, financialPeriod, onOpenSearch }) {
  const today = new Date()
  const { profiles: perfisDoApp, activeProfileId, setActiveProfileId } = useApp()
  const { perfis: comPerfis, periodo: comPeriodo } = cabecalhoDaPagina(page)
  const profiles = comPerfis ? perfisDoApp : []
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [sair, setSair] = useState(false)

  const activeProfile = profiles.find(p => p.id === activeProfileId) || null

  return (
    <header className="border-b border-borda bg-page px-4 md:px-6 pb-2.5 header-safe-top flex items-center gap-3 sticky top-0 z-10">
      {/* Title + period */}
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-texto-1 leading-tight">{PAGE_TITLES[page] || page}</h1>
        {financialPeriod && comPeriodo && (
          <p className="text-xs text-texto-3 leading-tight">
            {format(financialPeriod.start, 'dd/MM/yyyy')} – {format(financialPeriod.end, 'dd/MM/yyyy')}
          </p>
        )}
      </div>

      {/* Profile filter chips — desktop only (seletor de perfil do desktop) */}
      {profiles.length > 0 && (
        <div className="hidden md:flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none px-1 min-w-0">
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
                    ? 'bg-surface-2 text-texto-1 border-transparent ring-2 ring-inset'
                    : 'bg-surface-2/60 border-borda-forte text-texto-2 hover:text-texto-1 hover:bg-surface-hover'
                }`}
                style={isActive ? { '--tw-ring-color': p.color } : {}}
              >
                <Icon size={11} className="shrink-0" />
                <span className="hidden sm:inline truncate max-w-24">{p.name}</span>
              </button>
            )
          })}
          {/* "Tudo" chip — sempre por último */}
          <button
            onClick={() => setActiveProfileId(null)}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              activeProfileId === null
                ? 'bg-primary/15 border-primary/40 text-primary-fg'
                : 'bg-surface-2/60 border-borda-forte text-texto-2 hover:text-texto-1 hover:bg-surface-hover'
            }`}
          >
            Tudo
          </button>

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
          className="shrink-0 p-2 rounded-lg text-texto-2 hover:text-texto-1 hover:bg-surface-hover transition-colors"
        >
          <Search size={18} />
        </button>

        {/* Seletor de perfil — mobile only (substitui o antigo bloco de saldos) */}
        {profiles.length > 0 && (
          <div className="relative md:hidden">
            <button
              onClick={() => setProfileMenuOpen(o => !o)}
              aria-label="Trocar perfil"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-borda-forte bg-surface-2/60 text-texto-1 max-w-[160px]"
              style={activeProfile ? { borderColor: activeProfile.color } : {}}
            >
              {activeProfile
                ? (() => {
                    const Icon = activeProfile.type === 'pf' ? User : Building2
                    return <Icon size={13} className="shrink-0 text-texto-2" />
                  })()
                : <User size={13} className="shrink-0 text-texto-2" />}
              <span className="truncate">{activeProfile ? activeProfile.name : 'Tudo'}</span>
              <ChevronDown size={13} className="shrink-0 text-texto-3" />
            </button>

            {profileMenuOpen && (
              <>
                {/* Backdrop para fechar ao clicar fora */}
                <div className="fixed inset-0 z-20" onClick={() => setProfileMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 z-30 w-52 rounded-lg border border-borda-forte bg-surface shadow-xl py-1">
                  {profiles.map(p => {
                    const isActive = activeProfileId === p.id
                    const Icon = p.type === 'pf' ? User : Building2
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setActiveProfileId(p.id); setProfileMenuOpen(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-surface-hover ${
                          isActive ? 'text-texto-1 font-semibold' : 'text-texto-2'
                        }`}
                        style={{ boxShadow: `inset 3px 0 0 ${p.color}` }}
                      >
                        <Icon size={13} className="shrink-0 text-texto-2" />
                        <span className="truncate flex-1">{p.name}</span>
                        <span className="text-[10px] text-texto-3 shrink-0">{p.type === 'pf' ? 'CPF' : 'CNPJ'}</span>
                      </button>
                    )
                  })}
                  <button
                    onClick={() => { setActiveProfileId(null); setProfileMenuOpen(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-surface-hover ${
                      activeProfileId === null ? 'text-texto-1 font-semibold' : 'text-texto-2'
                    }`}
                  >
                    <User size={13} className="shrink-0 text-texto-2" />
                    <span className="truncate">Tudo</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="text-right hidden md:block">
          <p className="text-xs text-texto-2">{format(today, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>

        <button
          onClick={() => setSair(true)}
          title="Sair"
          aria-label="Sair"
          className="shrink-0 p-2 rounded-lg text-texto-2 hover:text-perigo hover:bg-perigo-bg transition-colors"
        >
          <LogOut size={18} />
        </button>
        <SairModal open={sair} onClose={() => setSair(false)} />
      </div>
    </header>
  )
}
