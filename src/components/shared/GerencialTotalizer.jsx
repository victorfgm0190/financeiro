import { Fragment } from 'react'
import { fmt, computeReconciledTotals } from './utils'
import ReconciledTotals from './ReconciledTotals'
import { totaisGerenciais } from '../../lib/gerencialTotais'

const round2 = n => Math.round(n * 100) / 100

// Token exibido: G (grupo 1), D (grupo D), ou o número (numerados).
function token(g) {
  if (g.number === 1) return 'G'
  if (g.number === 'D') return 'D'
  return String(g.number)
}
function tokenColor(g) {
  if (g.number === 1) return 'text-reserva'
  if (g.number === 'D') return 'text-gray-500'
  return 'text-orange-500'
}

// Totalizador discreto por grupo gerencial. Regras da fatura:
//   • Despesas (type 'expense') somam por grupo gerencial.
//   • Estornos (type 'income') são abatidos do total e exibidos em linha separada.
//   • Pagamentos de fatura (type 'credit_payment') são ignorados.
//   • `previstos`: ocorrências PENDENTES de agendamentos que caem nesta fatura. Somam no total
//     do grupo, com asterisco e detalhe no tooltip — o número deixa de ser só o realizado, e
//     esconder isso faria o token não fechar nem com a fatura nem com o previsto.
// Quem monta `previstos` é o dono da fatura (CreditCardPanel): é lá que existem cartão, período
// e getNextOccurrences. Aqui só se soma — nenhuma ocorrência é calculada.
// Mostra só os grupos com pelo menos um lançamento. Retorna null quando não há
// despesas nem estornos.
export default function GerencialTotalizer({ txs, gerencialGroups, showReconciled = false, previstos = [] }) {
  const { items, estornos, temPrevisto } = totaisGerenciais({
    txs: txs || [], previstos: previstos || [], gerencialGroups: gerencialGroups || [],
  })

  // Conciliados/Pendentes (lado direito): soma dos visíveis por status de conciliação.
  const { conciliado, pendente } = showReconciled ? computeReconciledTotals(txs) : { conciliado: 0, pendente: 0 }
  const hasRecon = showReconciled && (conciliado > 0 || pendente > 0)

  if (items.length === 0 && estornos === 0 && !hasRecon) return null

  return (
    <div className="px-4 py-2.5 border-b border-gray-800 bg-surface/40 flex items-center gap-x-3 gap-y-1.5 flex-wrap text-xs">
      {items.map(({ g, total, previsto }, i) => (
        <Fragment key={g.id}>
          {i > 0 && <span className="text-gray-700 select-none">|</span>}
          <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
            title={previsto > 0
              ? `Realizado ${fmt(round2(total - previsto))} + previsto ${fmt(previsto)}`
              : undefined}
          >
            <span className={`font-bold ${tokenColor(g)}`}>{token(g)}</span>
            <span className="text-gray-500">· {g.name}:</span>
            <span className="font-semibold text-gray-300">{fmt(total)}</span>
            {previsto > 0 && <span className="text-amber-500/80 font-bold select-none">*</span>}
          </span>
        </Fragment>
      ))}
      {temPrevisto && (
        <span className="text-[10px] text-amber-500/70 whitespace-nowrap">* inclui previstos</span>
      )}
      {hasRecon && <ReconciledTotals conciliado={conciliado} pendente={pendente} className="ml-auto" />}
      {estornos > 0 && (
        <>
          {/* Quebra para linha própria, abaixo dos grupos gerenciais */}
          <span className="basis-full h-0" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-gray-500">Estornos:</span>
            <span className="font-semibold text-despesa">-{fmt(estornos)}</span>
          </span>
        </>
      )}
    </div>
  )
}
