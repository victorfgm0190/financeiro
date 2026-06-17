import Modal from './Modal'
import { fmt, fmtDate } from './utils'

// Modal de histórico do fornecedor: últimas ocorrências de um lançamento por similaridade
// de descrição (dados vindos de /api/transaction-history via fetchTransactionHistory).
// `state` = null (fechado) ou { description, items, loading, error }. Reutilizado pela
// importação de fatura e pela conciliação.
export default function TransactionHistoryModal({ state, onClose }) {
  const title = state
    ? (state.description.length > 60 ? state.description.slice(0, 60) + '…' : state.description)
    : ''
  return (
    <Modal open={!!state} onClose={onClose} title={title} size="lg">
      {state && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Últimas 5 ocorrências</p>
          {state.loading ? (
            <p className="text-sm text-gray-500 py-6 text-center">Carregando…</p>
          ) : state.error ? (
            <p className="text-sm text-orange-500 py-6 text-center">Erro ao buscar o histórico.</p>
          ) : state.items.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Nenhuma ocorrência anterior encontrada</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-700/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="px-3 py-2 text-xs text-gray-400 font-medium">Data</th>
                    <th className="px-3 py-2 text-xs text-gray-400 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 text-xs text-gray-400 font-medium">Categoria</th>
                    <th className="px-3 py-2 text-xs text-gray-400 font-medium">Grupo</th>
                    <th className="px-3 py-2 text-xs text-gray-400 font-medium">Reserva</th>
                  </tr>
                </thead>
                <tbody>
                  {state.items.map(it => (
                    <tr key={it.id} className="border-b border-gray-800/40">
                      <td className="px-3 py-2 text-xs text-gray-300 whitespace-nowrap">{fmtDate(it.date)}</td>
                      <td className="px-3 py-2 text-xs text-gray-100 text-right whitespace-nowrap font-medium">{fmt(it.amount)}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{it.categoria_nome || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{it.grupo_nome || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{it.reserva_funcao_nome || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
