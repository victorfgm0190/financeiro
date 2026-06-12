import { Fragment, useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'

export default function PosicaoFinanceiraModal() {
  const { accounts, schedules, getNextOccurrences } = useApp()
  const [expanded, setExpanded] = useState({})

  const today = new Date().toISOString().split('T')[0]
  const mainAccounts = accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')

  const rows = useMemo(() => {
    return mainAccounts.map(account => {
      const saldoAtual = account.balance || 0
      const items = []
      schedules.forEach(s => {
        if (s.accountId !== account.id) return
        getNextOccurrences(s, 48).forEach(date => {
          if (date >= today) {
            items.push({ description: s.description, amount: s.amount, date, type: s.transactionType })
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
      <p className="text-center text-gray-500 text-sm py-10">
        Nenhuma conta marcada como fluxo de caixa principal.<br />
        <span className="text-gray-600 text-xs mt-1 block">Configure em Contas → editar conta → ativar "Fluxo de Caixa Principal".</span>
      </p>
    )
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Conta</th>
            <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Saldo Atual</th>
            <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Líquido (agend.)</th>
            <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Saldo Final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ account, saldoAtual, liquido, saldoFinal, items }) => (
            <Fragment key={account.id}>
              <tr className="border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
                <td className="px-3 py-3 text-gray-200 font-medium">{account.apelido || account.name}</td>
                <td className="px-3 py-3 text-right">
                  <span className={`font-semibold ${saldoAtual >= 0 ? 'text-receita' : 'text-despesa'}`}>
                    {fmt(saldoAtual)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  {items.length > 0 ? (
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [account.id]: !e[account.id] }))}
                      className={`inline-flex items-center gap-1 font-semibold hover:opacity-75 transition-opacity ${liquido >= 0 ? 'text-blue-400' : 'text-orange-500'}`}
                    >
                      {expanded[account.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {liquido >= 0 ? '+' : '-'}{fmt(Math.abs(liquido))}
                    </button>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className={`px-3 py-3 text-right font-bold ${saldoFinal >= 0 ? 'text-receita' : 'text-despesa'}`}>
                  {fmt(saldoFinal)}
                </td>
              </tr>
              {expanded[account.id] && items.map((item, i) => (
                <tr key={`${account.id}-${i}`} className="bg-indigo-500/5 border-b border-gray-800/30">
                  <td className="pl-8 pr-3 py-1.5 text-xs text-gray-400">
                    <div className="flex items-center gap-1.5">
                      {item.type === 'income'
                        ? <ArrowDownCircle size={10} className="text-blue-400 shrink-0" />
                        : <ArrowUpCircle size={10} className="text-orange-500 shrink-0" />}
                      <span className="truncate max-w-[200px]">{item.description}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-gray-500">{fmtDate(item.date)}</td>
                  <td className={`px-3 py-1.5 text-right text-xs font-medium ${item.type === 'income' ? 'text-blue-400' : 'text-orange-500'}`}>
                    {item.type === 'income' ? '+' : '-'}{fmt(item.amount)}
                  </td>
                  <td className="px-3 py-1.5" />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-700 bg-surface/40">
            <td className="px-3 py-3 text-sm font-bold text-gray-100">Total</td>
            <td className={`px-3 py-3 text-right text-sm font-bold ${totals.saldoAtual >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {fmt(totals.saldoAtual)}
            </td>
            <td className={`px-3 py-3 text-right text-sm font-bold ${totals.liquido >= 0 ? 'text-blue-400' : 'text-orange-500'}`}>
              {totals.liquido >= 0 ? '+' : '-'}{fmt(Math.abs(totals.liquido))}
            </td>
            <td className={`px-3 py-3 text-right text-sm font-bold ${totals.saldoFinal >= 0 ? 'text-receita' : 'text-despesa'}`}>
              {fmt(totals.saldoFinal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
