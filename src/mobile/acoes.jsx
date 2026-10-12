// Ações do botão "+" (place: 'action' em modules.js). Cada uma abre um formulário EXISTENTE dentro
// do sheet — nenhuma lógica de gravação própria. Recebem { onClose, onToast }.
import { useApp } from '../context/AppContext'
import TransactionForm from '../components/Transactions/TransactionForm'
import ScheduleForm from '../components/Schedule/ScheduleForm'

// Lançamento: modo rápido do TransactionForm (mesmo handleSubmit/addTransaction do completo).
export function LancamentoAcao({ onClose, onToast }) {
  return <TransactionForm rapido onClose={onClose} onToast={onToast} />
}

export function AgendamentoAcao({ onClose, onToast }) {
  return <ScheduleForm onClose={onClose} onAviso={onToast} />
}

export function TransferenciaAcao({ onClose, onToast }) {
  return <TransactionForm initial={{ type: 'transfer' }} onClose={onClose} onToast={onToast} />
}

// Reserva: transferência já apontada para a primeira conta de reserva do perfil — o
// TransactionForm trata depósito/resgate de reserva (função, categoria) como no desktop.
export function ReservaAcao({ onClose, onToast }) {
  const { profileAccounts } = useApp()
  const reserva = (profileAccounts || []).find(a => a.isReserva && a.active !== false)
  return (
    <TransactionForm
      initial={{ type: 'transfer', ...(reserva ? { toAccountId: reserva.id } : {}) }}
      onClose={onClose}
      onToast={onToast}
    />
  )
}
