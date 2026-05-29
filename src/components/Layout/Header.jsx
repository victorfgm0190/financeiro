import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { User, Building2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import { useApp } from '../../context/AppContext'

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

export default function Header({ page, financialPeriod, saldoPrincipal, onShowPosicao }) {
  const today = new Date()
  const { profiles, activeProfileId, setActiveProfileId } = useApp()

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

      {/* Profile filter chips — shown only if profiles exist */}
      {profiles.length > 0 && (
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none px-1 min-w-0">
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

      {/* Spacer when no profiles */}
      {profiles.length === 0 && <div className="flex-1" />}

      {/* Right: mobile balance / desktop date */}
      <div className="flex items-center gap-4 shrink-0">
        <button onClick={onShowPosicao} className="md:hidden text-right">
          <p className="text-xs text-gray-600 leading-none">Principal</p>
          <p className={`text-sm font-bold mt-0.5 leading-none ${(saldoPrincipal ?? 0) >= 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
            {fmt(saldoPrincipal ?? 0)}
          </p>
        </button>
        <div className="text-right hidden md:block">
          <p className="text-xs text-gray-400">{format(today, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
      </div>
    </header>
  )
}
