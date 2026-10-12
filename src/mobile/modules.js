// Registro central da navegação MOBILE — fonte única de verdade. Função nova = UMA linha aqui.
//
// place:
//   'tab'     → barra inferior (máx. 4 + o botão central "+"), na ordem deste array
//   'more'    → tela "Mais", agrupado por `group` (seções na ordem em que aparecem)
//   'action'  → menu do botão "+" (primary: true = card 2x2; senão item de lista)
//   'desktop' → só no computador: não aparece no mobile (documentação). `page` dele, se o App
//               cair nela no mobile, redireciona para o Início; `configSecoes` somem de
//               Configurações no mobile. Botões dessas funções nas telas usam useIsMobile.
//   'config'  → "Mais" › última seção (Configurações)
// Tela: `page` = painel existente do App (mesma instância/props do desktop); `component` = tela
// nova do mobile (recebe as props do shell). Ações: `component` recebe { onClose, onToast }.
// card: true → pode virar card no Início (`cardTitle` é o título do card).
import {
  Home, TrendingUp, Calendar, LayoutGrid, PiggyBank, Mail, Plus, CalendarPlus, ArrowLeftRight,
  Wallet, CreditCard, List, PieChart, Gem, BarChart3, Bell, Settings, LayoutDashboard,
} from 'lucide-react'
import InicioMobile from './InicioMobile'
import MaisMobile from './MaisMobile'
import { LancamentoAcao, AgendamentoAcao, TransferenciaAcao, ReservaAcao } from './acoes'

export const mobileModules = [
  { id: 'inicio',        label: 'Início',          icon: Home,           place: 'tab', component: InicioMobile },
  { id: 'fluxo',         label: 'Fluxo',           icon: TrendingUp,     place: 'tab', page: 'cashflow' },
  { id: 'agenda',        label: 'Agenda',          icon: Calendar,       place: 'tab', page: 'schedule', card: true, cardTitle: 'Próximos 7 dias' },
  { id: 'mais',          label: 'Mais',            icon: LayoutGrid,     place: 'tab', component: MaisMobile },

  { id: 'reservas',      label: 'Reservas',        icon: PiggyBank,      place: 'more', group: 'Dinheiro guardado', card: true, page: 'reservas' },
  { id: 'envelopes',     label: 'Envelopes',       icon: Mail,           place: 'more', group: 'Dinheiro guardado', card: true, page: 'envelopes' },
  { id: 'contas',        label: 'Contas',          icon: Wallet,         place: 'more', group: 'Contas e cartões', page: 'accounts' },
  { id: 'cartao',        label: 'Cartão',          icon: CreditCard,     place: 'more', group: 'Contas e cartões', page: 'credit' },
  { id: 'lancamentos',   label: 'Lançamentos',     icon: List,           place: 'more', group: 'Contas e cartões', page: 'transactions' },
  { id: 'painel',        label: 'Painel completo', icon: LayoutDashboard, place: 'more', group: 'Planejamento e análise', page: 'dashboard' },
  { id: 'orcamento',     label: 'Orçamento',       icon: PieChart,       place: 'more', group: 'Planejamento e análise', page: 'budget' },
  { id: 'patrimonio',    label: 'Patrimônio',      icon: Gem,            place: 'more', group: 'Planejamento e análise', page: 'patrimonio' },
  { id: 'relatorios',    label: 'Relatórios',      icon: BarChart3,      place: 'more', group: 'Planejamento e análise', page: 'reports' },
  { id: 'alertas',       label: 'Alertas',         icon: Bell,           place: 'more', group: 'Planejamento e análise', page: 'alerts' },

  { id: 'lancamento',    label: 'Lançamento',      icon: Plus,           place: 'action', primary: true, component: LancamentoAcao },
  { id: 'agendamento',   label: 'Agendamento',     icon: CalendarPlus,   place: 'action', primary: true, component: AgendamentoAcao },
  { id: 'transferencia', label: 'Transferência',   icon: ArrowLeftRight, place: 'action', primary: true, component: TransferenciaAcao },
  { id: 'reserva_mov',   label: 'Reserva',         icon: PiggyBank,      place: 'action', primary: true, component: ReservaAcao },

  { id: 'importar',      label: 'Importar fatura',   place: 'desktop', page: 'import' },
  { id: 'conciliacao',   label: 'Conciliação',       place: 'desktop' },
  { id: 'gerenciais',    label: 'Grupos gerenciais', place: 'desktop', configSecoes: ['controle-gerencial', 'grupo-gerencial'] },

  { id: 'configuracoes', label: 'Configurações',   icon: Settings,       place: 'config', page: 'settings' },
]
