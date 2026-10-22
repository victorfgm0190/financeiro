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
// saldo: true → tela mostra saldos/valores: placeholder até o recálculo automático terminar
//               (useSaldosProntos, mesmo sinal do Painel do desktop).
// perfil: true → chips de perfil (Tudo | CPF | CNPJ) logo abaixo do cabeçalho da tela. Telas
//               `component` com cabeçalho próprio (Início) os colocam elas mesmas.
import {
  Home, TrendingUp, Calendar, LayoutGrid, PiggyBank, Mail, Plus, CalendarPlus, ArrowLeftRight,
  Wallet, CreditCard, List, PieChart, ChartPie, Gem, BarChart3, Bell, Settings, LayoutDashboard, Briefcase, FileSignature,
} from 'lucide-react'
import InicioMobile from './InicioMobile'
import MaisMobile from './MaisMobile'
import DespesasMobile from './DespesasMobile'
import { LancamentoAcao, AgendamentoAcao, TransferenciaAcao, ReservaAcao } from './acoes'

export const mobileModules = [
  { id: 'inicio',        label: 'Início',          icon: Home,           place: 'tab', component: InicioMobile, perfil: true },
  { id: 'fluxo',         label: 'Fluxo',           icon: TrendingUp,     place: 'tab', page: 'cashflow', saldo: true, perfil: true },
  { id: 'agenda',        label: 'Agenda',          icon: Calendar,       place: 'tab', page: 'schedule', card: true, cardTitle: 'Próximos 7 dias', saldo: true, perfil: true },
  { id: 'mais',          label: 'Mais',            icon: LayoutGrid,     place: 'tab', component: MaisMobile },

  { id: 'reservas',      label: 'Reservas',        icon: PiggyBank,      place: 'more', group: 'Dinheiro guardado', card: true, cardTitle: 'Saldo em reservas', page: 'reservas', saldo: true },
  { id: 'envelopes',     label: 'Envelopes',       icon: Mail,           place: 'more', group: 'Dinheiro guardado', card: true, cardTitle: 'Envelopes do mês', page: 'envelopes', saldo: true },
  { id: 'contas',        label: 'Contas',          icon: Wallet,         place: 'more', group: 'Contas e cartões', page: 'accounts', saldo: true },
  { id: 'cartao',        label: 'Cartão',          icon: CreditCard,     place: 'more', group: 'Contas e cartões', page: 'credit', saldo: true },
  { id: 'lancamentos',   label: 'Lançamentos',     icon: List,           place: 'more', group: 'Contas e cartões', page: 'transactions', saldo: true },
  { id: 'despesas',      label: 'Maiores despesas', icon: ChartPie,      place: 'more', group: 'Planejamento e análise', card: true, component: DespesasMobile, saldo: true },
  { id: 'painel',        label: 'Painel completo', icon: LayoutDashboard, place: 'more', group: 'Planejamento e análise', page: 'dashboard' },
  { id: 'orcamento',     label: 'Orçamento',       icon: PieChart,       place: 'more', group: 'Planejamento e análise', page: 'budget', saldo: true },
  { id: 'patrimonio',    label: 'Patrimônio',      icon: Gem,            place: 'more', group: 'Planejamento e análise', page: 'patrimonio', saldo: true },
  { id: 'contratos',     label: 'Contratos',       icon: FileSignature,  place: 'more', group: 'Planejamento e análise', page: 'contratos' },
  { id: 'relatorios',    label: 'Relatórios',      icon: BarChart3,      place: 'more', group: 'Planejamento e análise', page: 'reports', saldo: true },
  { id: 'alertas',       label: 'Alertas',         icon: Bell,           place: 'more', group: 'Planejamento e análise', page: 'alerts' },

  { id: 'lancamento',    label: 'Lançamento',      icon: Plus,           place: 'action', primary: true, component: LancamentoAcao },
  { id: 'agendamento',   label: 'Agendamento',     icon: CalendarPlus,   place: 'action', primary: true, component: AgendamentoAcao },
  { id: 'transferencia', label: 'Transferência',   icon: ArrowLeftRight, place: 'action', primary: true, component: TransferenciaAcao },
  { id: 'reserva_mov',   label: 'Reserva',         icon: PiggyBank,      place: 'action', primary: true, component: ReservaAcao },

  // plataforma: true → só para o administrador da plataforma (App filtra pela API, não por permissão).
  { id: 'clientes',      label: 'Clientes Finup',  icon: Briefcase,      place: 'more', group: 'Plataforma', page: 'clientes', plataforma: true },

  { id: 'importar',      label: 'Importar fatura',   place: 'desktop', page: 'import' },
  { id: 'conciliacao',   label: 'Conciliação',       place: 'desktop' },
  { id: 'gerenciais',    label: 'Grupos gerenciais', place: 'desktop', configSecoes: ['controle-gerencial', 'grupo-gerencial'] },

  { id: 'configuracoes', label: 'Configurações',   icon: Settings,       place: 'config', page: 'settings' },
]
