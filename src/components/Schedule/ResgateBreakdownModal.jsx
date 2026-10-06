import Modal from '../shared/Modal'
import { fmt, fmtDate } from '../shared/utils'
import { composicaoResgate } from '../../lib/resgateComposicao'
import { computeOccurrences } from '../../lib/occurrences'

// Fase 4 — Composição do resgate: lista as fontes que compõem um agendamento resgate_reserva,
// via schedule.sourceExpenseIds. Duas espécies de fonte, na MESMA tabela:
//   • lançamento de cartão já efetivado (id comum) — resolvido em transactions;
//   • despesa agendada ainda pendente (id 'sch:<agendamento>@<data>') — resolvida em schedules.
// Sem a segunda, a tabela somava só os realizados e fechava abaixo do amount do resgate, sem nada
// na tela explicando a diferença. Somente leitura; não altera nenhum estado. A montagem da lista e a
// validação da soma ficam em lib/resgateComposicao (testável sem React).
export default function ResgateBreakdownModal({ schedule, transactions, schedules, categories, onClose }) {
  const { gastos, total, amountResgate, diferenca, fecha, qtdPrevistos, semFontes } =
    composicaoResgate(schedule, transactions, schedules, computeOccurrences)
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

        {semFontes ? (
          <p className="text-sm text-gray-500 py-8 text-center">Resgate sem composição detalhada.</p>
        ) : gastos.length === 0 ? (
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
                  <tr
                    key={t.key}
                    className={`border-b border-gray-800/50 transition-colors ${
                      t.previsto
                        ? 'bg-amber-500/5 border-l-2 border-l-amber-500/70 hover:bg-amber-500/10'
                        : 'hover:bg-gray-800/20'
                    }`}
                  >
                    <td className="px-2 py-2 whitespace-nowrap text-gray-300 text-xs">{fmtDate(t.date)}</td>
                    <td className={`px-2 py-2 ${t.orfao ? 'text-gray-500 italic' : 'text-gray-200'}`}>{t.description}</td>
                    <td className="px-2 py-2 text-gray-400 text-xs hidden sm:table-cell whitespace-nowrap">
                      {t.previsto
                        ? <span className="text-amber-500/90">⚡ Previsto</span>
                        : catName(t.categoryId)}
                    </td>
                    <td className={`px-2 py-2 whitespace-nowrap text-right font-medium ${t.previsto ? 'text-amber-500/90' : 'text-gray-100'}`}>{fmt(t.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-700">
                  <td className="px-2 py-2.5 text-xs font-semibold text-gray-300" colSpan={3}>
                    Total ({gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'})
                    {qtdPrevistos > 0 && (
                      <span className="ml-1.5 font-normal text-amber-500/80">
                        · {qtdPrevistos} previsto{qtdPrevistos !== 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold text-blue-500 whitespace-nowrap">{fmt(total)}</td>
                </tr>
                {!fecha && (
                  <tr>
                    <td className="px-2 pb-2 text-[11px] text-orange-500" colSpan={4}>
                      Não fecha com o valor do resgate ({fmt(amountResgate)}): diferença de {fmt(diferenca)}.
                    </td>
                  </tr>
                )}
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
