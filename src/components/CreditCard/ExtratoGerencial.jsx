import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useScrollScope } from '../../hooks/useScrollRestoration'
import { fmt, fmtDate } from '../shared/utils'
import { faturaDoCartao } from '../../lib/fatura'
import DateInput from '../shared/DateInput'
import ReconcileBadge from '../shared/ReconcileBadge'
import { isoLocal } from '../../lib/hoje'
import { useSubtelaGuia } from '../BoasVindas/subtelaGuia'
import { rotuloDoTipo } from '../../lib/rotuloMovimento'
import HelpCampo from '../shared/HelpCampo'
import { Download } from 'lucide-react'
import { exportarExcel } from '../../lib/exportExcel'
import { exportarCsv } from '../../lib/csvFinup'

function GerBadge({ grupoId, gerencialGroups }) {
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
  else if (grupo.number === 'D') cls += ' bg-surface-hover/60 text-texto-3'
  else cls += ' bg-despesa/20 text-despesa'
  return <span className={cls}>{grupo.alias}</span>
}

// dia <= closingDay → fatura do mês corrente; dia > closingDay → mês seguinte.
function getBillLabel(date, card) {
  const ym = faturaDoCartao(date, card)
  return ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : ''
}

// MOVIMENTOS DO CARTÃO POR DATA (aba do Relatório Gerencial da Fatura): todas as movimentações do
// cartão num período de DATA, com o saldo corrido. Respeita o filtro de perfil, como o resto do app
// (lançamentos e cartões do perfil ativo; só cartões ativos). Excel e CSV no padrão do Finup.
export default function ExtratoGerencial({ initialCardId }) {
  const { profileAccounts: accounts = [], profileTransactions: transactions = [], gerencialGroups, updateTransaction, pode } = useApp()
  const podeEditar = pode('cartao', 'editar')
  useScrollScope('credit:extrato')
  useSubtelaGuia('credit:extrato')

  const creditCards = accounts.filter(a => a.type === 'credit' && a.active !== false)
  const [selectedCardId, setSelectedCardId] = useState(initialCardId || creditCards[0]?.id || '')

  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastOfMonth = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(lastOfMonth)

  const card = accounts.find(a => a.id === selectedCardId)

  const rows = useMemo(() => {
    if (!selectedCardId) return []
    return transactions
      .filter(tx => {
        if (tx.accountId !== selectedCardId && tx.toAccountId !== selectedCardId) return false
        const d = tx.date || ''
        return d >= from && d <= to
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [transactions, selectedCardId, from, to])

  const rowsWithBalance = useMemo(() => {
    let balance = 0
    return rows.map((tx, idx) => {
      let pagamento = 0
      let deposito = 0
      if (tx.type === 'expense') {
        pagamento = tx.amount
        balance -= tx.amount
      } else if (tx.type === 'income') {
        deposito = tx.amount
        balance += tx.amount
      } else if (tx.type === 'transfer') {
        if (tx.accountId === selectedCardId) { pagamento = tx.amount; balance -= tx.amount }
        else { deposito = tx.amount; balance += tx.amount }
      } else if (tx.type === 'credit_payment') {
        deposito = tx.amount
        balance += tx.amount
      }
      return { ...tx, _pagamento: pagamento, _deposito: deposito, _balance: balance, _seq: idx + 1 }
    })
  }, [rows, selectedCardId])

  // Exportação: as mesmas colunas da tela (Nº, Movimentação, Favorecido, Ger, Fatura, R, Pagamento,
  // Depósito, Saldo); o mesmo nome no Excel e no CSV.
  const nomeCartao = card ? (card.apelido || card.name) : ''
  const nomeArquivoMov = { relatorio: `Movimentos-do-Cartao-por-Data-${nomeCartao}`, periodo: `${from}_${to}` }
  const linhasMov = () => rowsWithBalance.map(tx => ({
    n: String(tx._seq), data: tx.date, desc: tx.description || '',
    mov: tx.type === 'expense' ? 'Compra' : tx.type === 'income' ? 'Crédito' : rotuloDoTipo(tx, accounts),
    fav: tx.payee || '', ger: gerencialGroups.find(g => g.id === tx.grupoGerencial)?.alias || '',
    fatura: getBillLabel(tx.date, card), r: tx.reconciled ? 'Conferido' : '',
    pagamento: tx._pagamento || null, deposito: tx._deposito || null, saldo: tx._balance,
  }))
  const exportarXlsxMov = () => exportarExcel({
    titulo: `Movimentos do Cartão por Data — ${nomeCartao}`, nome: 'Movimentos',
    filtros: [`Cartão: ${nomeCartao}`, `Período: ${fmtDate(from)} a ${fmtDate(to)}`],
    colunas: [
      { chave: 'n', titulo: 'Nº' }, { chave: 'data', titulo: 'Data', tipo: 'data' }, { chave: 'desc', titulo: 'Descrição' },
      { chave: 'mov', titulo: 'Movimentação' }, { chave: 'fav', titulo: 'Favorecido' }, { chave: 'ger', titulo: 'Ger' },
      { chave: 'fatura', titulo: 'Fatura' }, { chave: 'r', titulo: 'R' },
      { chave: 'pagamento', titulo: 'Pagamento', tipo: 'moeda', cor: () => 'despesa' },
      { chave: 'deposito', titulo: 'Depósito', tipo: 'moeda', cor: () => 'receita' },
      { chave: 'saldo', titulo: 'Saldo', tipo: 'moeda', cor: (l) => (l.saldo < 0 ? 'despesa' : 'receita') },
    ],
    linhas: linhasMov(),
    totais: { rotulo: (n) => `${n} ${n === 1 ? 'movimento' : 'movimentos'}`, somar: ['pagamento', 'deposito'] },
    nomeArquivo: nomeArquivoMov,
  }).catch(err => window.alert(`Não consegui exportar o Excel: ${err?.message || err}`))
  const exportarCsvMov = () => exportarCsv({
    nomeArquivo: nomeArquivoMov,
    cabecalho: ['Nº', 'Data', 'Descrição', 'Movimentação', 'Favorecido', 'Ger', 'Fatura', 'R', 'Pagamento', 'Depósito', 'Saldo'],
    linhas: linhasMov().map(l => [l.n, fmtDate(l.data), l.desc, l.mov, l.fav, l.ger, l.fatura, l.r, l.pagamento ?? '', l.deposito ?? '', Number(l.saldo) || 0]),
  })

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-semibold text-texto-2">Movimentos do Cartão por Data</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary flex items-center gap-1.5 text-xs" onClick={exportarCsvMov} disabled={!rowsWithBalance.length}>
              <Download size={13} /> CSV
            </button>
            <button type="button" className="btn-primary flex items-center gap-1.5 text-xs" onClick={exportarXlsxMov} disabled={!rowsWithBalance.length}>
              <Download size={13} /> Excel
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-help-form="filtrosExtratoGerencial">
          <div data-help-id="filtroGerencial.cartao">
            <label className="label">Cartão<HelpCampo campo="filtroGerencial.cartao" /></label>
            <select data-guia="credit:extrato.cartao" className="input" value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)}>
              <option value="">Selecione...</option>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
            </select>
          </div>
          <div data-guia="credit:extrato.de" data-help-id="filtroGerencial.dataDe">
            <label className="label">De<HelpCampo campo="filtroGerencial.dataDe" /></label>
            <DateInput className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div data-guia="credit:extrato.ate" data-help-id="filtroGerencial.dataAte">
            <label className="label">Até<HelpCampo campo="filtroGerencial.dataAte" /></label>
            <DateInput className="input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {rowsWithBalance.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-texto-3 text-sm">Nenhum lançamento no período</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda">
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium whitespace-nowrap">Data</th>
                <th className="text-center px-3 py-3 text-xs text-texto-2 font-medium">Nº</th>
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium">Descrição</th>
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium hidden lg:table-cell">Movimentação</th>
                <th className="text-left px-3 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Favorecido</th>
                <th data-guia="credit:extrato.ger" className="text-center px-3 py-3 text-xs text-texto-2 font-medium">Ger</th>
                <th className="text-center px-3 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Fatura</th>
                <th data-guia="credit:extrato.conciliado" className="text-center px-3 py-3 text-xs text-texto-2 font-medium">R</th>
                <th className="text-right px-3 py-3 text-xs text-texto-2 font-medium">Pagamento</th>
                <th className="text-right px-3 py-3 text-xs text-texto-2 font-medium">Depósito</th>
                <th data-guia="credit:extrato.saldo" className="text-right px-3 py-3 text-xs text-texto-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithBalance.map(tx => {
                const movLabel = tx.type === 'expense' ? 'Compra'
                  : tx.type === 'income' ? 'Crédito'
                  : rotuloDoTipo(tx, accounts)
                return (
                  <tr
                    key={tx.id}
                    className="border-b border-borda/50 hover:bg-surface-hover/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-texto-2 whitespace-nowrap text-xs">{fmtDate(tx.date)}</td>
                    <td className="px-3 py-2.5 text-center text-texto-3 text-xs">{tx._seq}</td>
                    <td className="px-3 py-2.5 text-texto-1 max-w-xs">
                      <p className="truncate">{tx.description}</p>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        tx.type === 'expense' ? 'bg-despesa/15 text-despesa'
                        : tx.type === 'income' ? 'bg-receita/15 text-receita'
                        : tx.type === 'credit_payment' ? 'bg-receita/15 text-receita'
                        : 'bg-surface-hover text-texto-2'
                      }`}>{movLabel}</span>
                    </td>
                    <td className="px-3 py-2.5 text-texto-3 text-xs hidden md:table-cell">{tx.payee || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {tx.grupoGerencial
                        ? <GerBadge grupoId={tx.grupoGerencial} gerencialGroups={gerencialGroups} />
                        : <span className="text-texto-3 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-texto-3 hidden md:table-cell">
                      {getBillLabel(tx.date, card)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ReconcileBadge
                        reconciled={tx.reconciled}
                        onClick={() => { if (podeEditar) updateTransaction(tx.id, { reconciled: !tx.reconciled }) }}
                        title={tx.reconciled ? 'Desmarcar conferido' : 'Marcar como conferido'}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-despesa font-medium whitespace-nowrap text-xs">
                      {tx._pagamento > 0 ? fmt(tx._pagamento) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right text-receita font-medium whitespace-nowrap text-xs">
                      {tx._deposito > 0 ? fmt(tx._deposito) : ''}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap text-xs ${tx._balance < 0 ? 'text-despesa' : 'text-receita'}`}>
                      {fmt(Math.abs(tx._balance))}{tx._balance < 0 ? ' D' : ' C'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
