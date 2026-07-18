import Modal from '../shared/Modal'
import { fmt, fmtDate } from '../shared/utils'

// Fase 4 — Composição do resgate: lista os gastos individuais (lançamentos de cartão) que
// compõem um agendamento resgate_reserva, via schedule.sourceExpenseIds (rastreabilidade
// per-gasto criada na Fase 3). Somente leitura; não altera nenhum estado.
export default function ResgateBreakdownModal({ schedule, transactions, categories, onClose }) {
  const idSet = new Set(schedule?.sourceExpenseIds || [])
  const gastos = (transactions || [])
    .filter(t => idSet.has(t.id))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const total = gastos.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const catName = (id) => {
    const c = (categories || []).find(x => x.id === id)
    return c ? `${c.icon || ''} ${c.name}`.trim() : '—'
  }
  const faturaRef = schedule?.faturaRef || schedule?.overrides?._gerencial?.faturaRef

  return (
    <Modal open onClose={onClose} title="Composição do Resgate" size="lg">
      <div className="space-y-4">
        <div className="text-xs text-gray-400">
          <span className="text-gray-300 font-medium">{schedule?.description || 'Resgate Reserva'}</span>
          {faturaRef && (
            <span className="ml-2 bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-medium">Fatura {faturaRef}</span>
          )}
        </div>

        {gastos.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">Nenhum gasto rastreado para este resgate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Data</th>
                  <th className="px-2 py-2 font-medium">Descrição</th>
                  <th className="px-2 py-2 font-medium hidden sm:table-cell">Categoria</th>
                  <th className="px-2 py-2 font-medium text-right whitespace-nowrap">Valor</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map(t => (
                  <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                    <td className="px-2 py-2 whitespace-nowrap text-gray-300 text-xs">{fmtDate(t.date)}</td>
                    <td className="px-2 py-2 text-gray-200">{t.description || '—'}</td>
                    <td className="px-2 py-2 text-gray-400 text-xs hidden sm:table-cell whitespace-nowrap">{catName(t.categoryId)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right font-medium text-gray-100">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-700">
                  <td className="px-2 py-2.5 text-xs font-semibold text-gray-300" colSpan={3}>
                    Total ({gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'})
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold text-blue-500 whitespace-nowrap">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
