import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

export default function Header({ page, financialPeriod }) {
  const today = new Date()
  return (
    <header className="border-b border-gray-800 bg-gray-950 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-base font-semibold text-gray-100">{PAGE_TITLES[page] || page}</h1>
        {financialPeriod && (
          <p className="text-xs text-gray-500 mt-0.5">
            Período: {format(financialPeriod.start, 'dd/MM/yyyy')} até {format(financialPeriod.end, 'dd/MM/yyyy')}
          </p>
        )}
      </div>
      <div className="text-right hidden md:block">
        <p className="text-xs text-gray-400">{format(today, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
      </div>
    </header>
  )
}
