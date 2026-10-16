import { Fragment, useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'

export default function PosicaoFinanceiraModal() {
  const { accounts, schedules, getOccurrencesProjecao: getNextOccurrences } = useApp()
  const [expanded, setExpanded] = useState({})

  const today = new Date().toISOString().split('T')[0]
  const mainAccounts = accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')

  const rows = useMemo(() => {
    return mainAccounts.map(account => {
      const saldoAtual = account.balance || 0
      const items = []
      schedules.forEach(s => {
        if (s.accountId !== account.id) return
        // Data e valor EFETIVOS da ocorrência (override), não a data-base e o valor da série.
        getNextOccurrences(s, 48).forEach(base => {
          const { date, amount } = occEfetiva(s, base)
          if (date >= today) {
            items.push({ description: s.description, amount: Number(amount) || 0, date, type: s.transactionType })
          }
        })
      })
      items.sort((a, b) => a.date.localeCompare(b.date))
      const liquido = items.reduce((sum, i) => sum + (i.type === 'income' ? i.amount : -i.amount), 0)
      return { account, saldoAtual, liquido, saldoFinal: saldoAtual + liquido, items }
    })
  }, [mainAccounts, schedules, getNextOccurrences, today])

  const totals = rows.reduce(
    (acc, r) => ({ saldoAtual: acc.saldoAtual + r.saldoAtual, liquido: acc.liquido + r.liquido, saldoFinal: acc.saldoFinal + r.saldoFinal }),
    { saldoAtual: 0, liquido: 0, saldoFinal: 0 }
  )

  if (rows.length === 0) {
    return (
      <p className="text-center text-texto-3 text-sm py-10">
        Nenhuma conta marcada como Somar no Saldo Principal (FC).<br />
        <span className="text-texto-3 text-xs mt-1 block">Configure em Contas → editar conta → ativar "Somar no Saldo Principal".</span>
      </p>
    )
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borda-forte">
            <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium">Conta</th>
            <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium">Saldo Atual</th>
            <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium">Líquido (agend.)</th>
            <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium">Saldo Final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ account, saldoAtual, liquido, saldoFinal, items }) => (
            <Fragment key={account.id}>
              <tr className="border-b border-borda/60 hover:bg-surface-hover/20 transition-colors">
                <td className="px-3 py-3 text-texto-1 font-medium">{account.apelido || account.name}</td>
                <td className="px-3 py-3 text-right">
                  <span className={`font-semibold ${saldoAtual >= 0 ? 'text-receita' : 'text-despesa'}`}>
                    {fmtSinal(saldoAtual)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  {items.length > 0 ? (
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [account.id]: !e[account.id] }))}
                      className={`inline-flex items-center gap-1 font-semibold hover:opacity-75 transition-opacity ${liquido >= 0 ? 'text-receita' : 'text-despesa'}`}
                    >
                      {expanded[account.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {liquido >= 0 ? '+' : '−'}{fmt(Math.abs(liquido))}
                    </button>
                  ) : (
                    <span className="text-texto-3">—</span>
                  )}
                </td>
                <td className={`px-3 py-3 text-right font-bold ${saldoFinal >= 0 ? 'text-receita' : 'text-despesa'}`}>
                  {fmtSinal(saldoFinal)}
                </td>
              </tr>
              {expanded[account.id] && items.map((item, i) => (
                <tr key={`${account.id}-${i}`} className="bg-surface-2/50 border-b border-borda/30">
                  <td className="pl-8 pr-3 py-1.5 text-xs text-texto-2">
                    <div className="flex items-center gap-1.5">
                      {item.type === 'income'
                        ? <ArrowDownCircle size={10} className="text-receita shrink-0" />
                        : <ArrowUpCircle size={10} className="text-despesa shrink-0" />}
                      <span className="truncate max-w-[200px]">{item.description}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-texto-3">{fmtDate(item.date)}</td>
                  <td className={`px-3 py-1.5 text-right text-xs font-medium ${item.type === 'income' ? 'text-receita' : 'text-despesa'}`}>
                    {item.type === 'income' ? '+' : '−'}{fmt(item.amount)}
                  </td>
                  <td className="px-3 py-1.5" />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-borda-forte bg-surface/40">
            <td className="px-3 py-3 text-sm font-bold text-texto-1">Total</td>
            <td className={`px-3 py-3 text-right text-sm font-bold ${totals.saldoAtual >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {fmtSinal(totals.saldoAtual)}
            </td>
            <td className={`px-3 py-3 text-right text-sm font-bold ${totals.liquido >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {totals.liquido >= 0 ? '+' : '−'}{fmt(Math.abs(totals.liquido))}
            </td>
            <td className={`px-3 py-3 text-right text-sm font-bold ${totals.saldoFinal >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {fmtSinal(totals.saldoFinal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
