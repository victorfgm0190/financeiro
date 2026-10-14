import { useState } from 'react'
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
//
// `recorte` (só pelo Fluxo Futuro) = { functionId, functionName, mesLabel, valor, det }: abre só com
// os gastos da parte daquela função, validando contra o valor da linha; o toggle "Ver fatura
// inteira" volta à visão completa (amount total). Sem `recorte` (SchedulePanel/Origem) = completa.
export default function ResgateBreakdownModal({ schedule, transactions, schedules, categories, recorte, onClose }) {
  const [faturaInteira, setFaturaInteira] = useState(false)
  const recorteAtivo = recorte && !faturaInteira ? recorte : null
  const { gastos, total, amountResgate, diferenca, fecha, qtdPrevistos, semFontes } =
    composicaoResgate(schedule, transactions, schedules, computeOccurrences, recorteAtivo)
  const catName = (id) => {
    const c = (categories || []).find(x => x.id === id)
    return c ? `${c.icon || ''} ${c.name}`.trim() : '—'
  }
  const faturaRef = schedule?.faturaRef || schedule?.overrides?._gerencial?.faturaRef

  return (
    <Modal
      open
      onClose={onClose}
      title={recorte ? `Composição do Resgate — ${recorte.functionName} · ${recorte.mesLabel}` : 'Composição do Resgate'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="text-xs text-texto-2">
          <span className="text-texto-2 font-medium">{schedule?.description || 'Resgate Reserva'}</span>
          {faturaRef && (
            <span className="ml-2 bg-surface-2 text-texto-2 px-1.5 py-0.5 rounded font-medium">Fatura {faturaRef}</span>
          )}
        </div>

        {recorte && !semFontes && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-texto-3">
            <span>
              {faturaInteira
                ? `Fatura inteira — todas as funções (${fmt(Number(schedule?.amount) || 0)})`
                : `Só a parte de ${recorte.functionName} (${fmt(Number(recorte.valor) || 0)})`}
            </span>
            <button
              type="button"
              onClick={() => setFaturaInteira(v => !v)}
              className="text-primary-fg hover:underline underline-offset-2 whitespace-nowrap"
            >
              {faturaInteira ? `Só ${recorte.functionName}` : 'Ver fatura inteira'}
            </button>
          </div>
        )}

        {semFontes ? (
          <p className="text-sm text-texto-3 py-8 text-center">Resgate sem composição detalhada.</p>
        ) : gastos.length === 0 ? (
          <p className="text-sm text-texto-3 py-8 text-center">Nenhum gasto rastreado para este resgate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-texto-2 border-b border-borda">
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
                    className={`border-b border-borda/50 transition-colors ${
                      t.previsto
                        ? 'bg-surface-2/50 border-l-2 border-l-borda-forte border-dashed hover:bg-surface-hover/50'
                        : 'hover:bg-surface-hover/20'
                    }`}
                  >
                    <td className="px-2 py-2 whitespace-nowrap text-texto-2 text-xs">{fmtDate(t.date)}</td>
                    <td className={`px-2 py-2 ${t.orfao ? 'text-texto-3 italic' : 'text-texto-1'}`}>{t.description}</td>
                    <td className="px-2 py-2 text-texto-2 text-xs hidden sm:table-cell whitespace-nowrap">
                      {t.previsto
                        ? <span className="text-texto-2 outline-dashed outline-1 -outline-offset-1 outline-borda-forte px-1 rounded">⚡ Previsto</span>
                        : catName(t.categoryId)}
                    </td>
                    <td className={`px-2 py-2 whitespace-nowrap text-right font-medium ${t.previsto ? 'text-texto-2' : 'text-texto-1'}`}>{fmt(t.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-borda-forte">
                  <td className="px-2 py-2.5 text-xs font-semibold text-texto-2" colSpan={3}>
                    Total ({gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'})
                    {qtdPrevistos > 0 && (
                      <span className="ml-1.5 font-normal text-texto-2">
                        · {qtdPrevistos} previsto{qtdPrevistos !== 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold text-texto-1 whitespace-nowrap">{fmt(total)}</td>
                </tr>
                {!fecha && (
                  <tr>
                    <td className="px-2 pb-2 text-[11px] text-aviso" colSpan={4}>
                      Não fecha com o valor {recorteAtivo ? 'da linha' : 'do resgate'} ({fmt(amountResgate)}): diferença de {fmt(diferenca)}.
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
            className="px-4 py-2 text-sm bg-surface-hover text-texto-1 rounded-lg hover:bg-surface-hover transition-colors font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
