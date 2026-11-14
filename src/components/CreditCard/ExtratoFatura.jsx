import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, today } from '../shared/utils'
import { faturaDoCartao } from '../../lib/fatura'
import {
  lancamentosDaFatura, faturaAtualDoCartao, rotuloFatura, deslocarFatura, parcelaPorExtenso,
} from '../../lib/faturaCartao'
import { agendamentosPrevistosDaFatura } from '../../lib/gerencialPrevistos'
import { exportarExcel, entregarArquivo, nomeArquivoFinup } from '../../lib/exportExcel'
import { gerarCsv } from '../../lib/csvFinup'
import SeloCambio from '../shared/SeloCambio'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// EXTRATO DA FATURA — a fatura como o banco mostra: os lançamentos da fatura (competência, não data
// de compra), com parcela, estornos e o total do banco. Sem grupo gerencial, saldo corrido ou
// conciliação. Fonte do total: lib/faturaCartao (a mesma do card "Fatura Selecionada").
//   • Pagamento da fatura anterior: linha à parte, informativa, fora do total.
//   • Compras agendadas que ainda não viraram lançamento: bloco "Previstos", fora do total.
// Abre na fatura escolhida na tela do cartão (initialBillKey) ou, pelo menu, na fatura atual.
export default function ExtratoFatura({ initialCardId, initialBillKey }) {
  const { profileAccounts: accounts = [], profileTransactions: transactions = [], profileSchedules: schedules = [], getOccurrencesProjecao } = useApp()
  const cartoes = useMemo(() => accounts.filter(a => a.type === 'credit' && a.active !== false), [accounts])
  const [cardId, setCardId] = useState(initialCardId || cartoes[0]?.id || '')
  const card = accounts.find(a => a.id === cardId) || null
  const [billKey, setBillKey] = useState(() => initialBillKey || faturaAtualDoCartao(card, today()))
  const trocarCartao = (id) => {
    setCardId(id)
    setBillKey(faturaAtualDoCartao(accounts.find(a => a.id === id), today()))
  }

  const fatura = useMemo(() => lancamentosDaFatura(transactions, card, billKey), [transactions, card, billKey])
  const anterior = billKey ? deslocarFatura(billKey, -1) : ''
  const pagamentosAnterior = useMemo(
    () => lancamentosDaFatura(transactions, card, anterior).pagamentos,
    [transactions, card, anterior],
  )
  const previstos = useMemo(() => (card && billKey
    ? agendamentosPrevistosDaFatura({ schedules, cardId: card.id, billKey, getOccurrences: getOccurrencesProjecao, billKeyOf: d => faturaDoCartao(d, card) })
    : []), [schedules, card, billKey, getOccurrencesProjecao])
  const totalPrevisto = round2(previstos.reduce((s, p) => s + p.amount, 0))
  const nomeCartao = card ? (card.apelido || card.name) : ''

  // Linhas exportadas = as da tela (valor com sinal: estorno negativo).
  const linhas = fatura.lancamentos.map(tx => ({
    data: tx.date, descricao: tx.description || '', parcela: parcelaPorExtenso(tx),
    tipo: tx.type === 'income' ? 'Estorno' : 'Compra', valor: tx.type === 'income' ? -tx.amount : tx.amount,
  }))

  const exportarXlsx = async () => {
    try {
      const abas = [{
        nome: 'Fatura', titulo: `Extrato da Fatura — ${nomeCartao}`,
        filtros: [`Cartão: ${nomeCartao}`, `Fatura: ${rotuloFatura(billKey)}`],
        resumo: [
          { rotulo: 'Total da fatura', soma: 'valor' },
          { rotulo: 'Compras', cor: 'despesa', soma: 'valor', onde: [{ coluna: 'tipo', valor: 'Compra' }] },
          { rotulo: 'Estornos', cor: 'receita', soma: 'valor', onde: [{ coluna: 'tipo', valor: 'Estorno' }] },
        ],
        colunas: [
          { chave: 'data', titulo: 'Data', tipo: 'data' }, { chave: 'descricao', titulo: 'Descrição' },
          { chave: 'parcela', titulo: 'Parcela' }, { chave: 'tipo', titulo: 'Tipo' },
          { chave: 'valor', titulo: 'Valor', tipo: 'moeda', cor: (l) => (l.valor < 0 ? 'receita' : 'despesa') },
        ],
        linhas,
        totais: { rotulo: (n) => `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`, somar: ['valor'] },
      }]
      if (pagamentosAnterior.length || previstos.length) {
        abas.push({
          nome: 'Fora do total', titulo: 'Fora do total da fatura',
          filtros: ['Informativo: não entra no total da fatura'],
          colunas: [
            { chave: 'data', titulo: 'Data', tipo: 'data' }, { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'tipo', titulo: 'Tipo' }, { chave: 'valor', titulo: 'Valor', tipo: 'moeda' },
          ],
          linhas: [
            ...pagamentosAnterior.map(p => ({ data: p.date, descricao: p.description || 'Pagamento efetuado', tipo: `Pagamento da fatura de ${rotuloFatura(anterior)}`, valor: p.amount })),
            ...previstos.map(p => ({ data: p.date, descricao: p.description || '', tipo: 'Previsto (não consta na fatura do banco)', valor: p.amount })),
          ],
          totais: false,
        })
      }
      await exportarExcel({ abas, nomeArquivo: { relatorio: `Extrato-Fatura-${nomeCartao}`, periodo: billKey } })
    } catch (err) {
      window.alert(`Não consegui exportar o Excel: ${err?.message || err}`)
    }
  }

  const exportarCsv = async () => {
    try {
      const csv = gerarCsv(
        ['Data', 'Descrição', 'Parcela', 'Tipo', 'Valor'],
        linhas.map(l => [fmtDate(l.data), l.descricao, l.parcela, l.tipo, l.valor]),
      )
      await entregarArquivo(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
        nomeArquivoFinup(`Extrato-Fatura-${nomeCartao}`, billKey).replace(/\.xlsx$/, '.csv'), { tipo: 'text/csv' })
    } catch (err) {
      window.alert(`Não consegui exportar o CSV: ${err?.message || err}`)
    }
  }

  return (
    <div className="space-y-4" data-testid="extrato-fatura">
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
          <FileText size={14} className="text-primary-fg" /> Extrato da Fatura
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-auto min-w-40" aria-label="Cartão" value={cardId} onChange={e => trocarCartao(e.target.value)}>
            {cartoes.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-surface-2 border border-borda-forte rounded-lg px-1 py-1">
            <button type="button" aria-label="Fatura anterior" onClick={() => setBillKey(k => deslocarFatura(k, -1))}
              className="p-1.5 text-texto-2 hover:text-texto-1 hover:bg-surface-hover rounded"><ChevronLeft size={14} /></button>
            <span className="text-sm font-medium text-texto-1 px-3 whitespace-nowrap min-w-[150px] text-center" data-testid="extrato-fatura-rotulo">
              Fatura {rotuloFatura(billKey)}
            </span>
            <button type="button" aria-label="Próxima fatura" onClick={() => setBillKey(k => deslocarFatura(k, +1))}
              className="p-1.5 text-texto-2 hover:text-texto-1 hover:bg-surface-hover rounded"><ChevronRight size={14} /></button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" className="btn-secondary flex items-center gap-1.5 text-xs" onClick={exportarCsv} disabled={!linhas.length}>
              <Download size={13} /> CSV
            </button>
            <button type="button" className="btn-primary flex items-center gap-1.5 text-xs" onClick={exportarXlsx} disabled={!linhas.length}>
              <Download size={13} /> Excel
            </button>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-borda flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-texto-3">{fatura.lancamentos.length} lançamento{fatura.lancamentos.length !== 1 ? 's' : ''}</span>
          <span className="text-sm text-texto-2">
            Total da fatura <span className="font-bold text-despesa" data-testid="extrato-fatura-total">{fmt(fatura.total)}</span>
          </span>
        </div>
        {fatura.lancamentos.length === 0 ? (
          <p className="text-center text-sm text-texto-3 py-10">Nenhum lançamento nesta fatura</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left">
                  <th className="px-3 py-2.5 text-xs text-texto-2 font-medium">Data</th>
                  <th className="px-3 py-2.5 text-xs text-texto-2 font-medium">Descrição</th>
                  <th className="px-3 py-2.5 text-xs text-texto-2 font-medium hidden sm:table-cell">Parcela</th>
                  <th className="px-3 py-2.5 text-xs text-texto-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {fatura.lancamentos.map(tx => {
                  const estorno = tx.type === 'income'
                  return (
                    <tr key={tx.id} className="border-b border-borda/50">
                      <td className="px-3 py-2 text-xs text-texto-2 whitespace-nowrap align-top">{fmtDate(tx.date)}</td>
                      <td className="px-3 py-2 text-texto-1 align-top">
                        <p className="truncate max-w-xs sm:max-w-md">{tx.description}</p>
                        {parcelaPorExtenso(tx) && <p className="text-[11px] text-texto-3 sm:hidden">{parcelaPorExtenso(tx)}</p>}
                        {estorno && <p className="text-[11px] text-receita">Estorno</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-texto-2 whitespace-nowrap align-top hidden sm:table-cell">{parcelaPorExtenso(tx)}</td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap font-medium align-top ${estorno ? 'text-receita' : 'text-despesa'}`}>
                        {estorno ? `−${fmt(tx.amount)}` : fmt(tx.amount)}
                        {(tx.moeda || tx.estimado) && <div className="mt-0.5 font-normal"><SeloCambio tx={tx} /></div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borda-forte bg-surface-2/60 font-bold">
                  <td className="px-3 py-2.5 text-xs text-texto-2" colSpan={2}>
                    Total · compras {fmt(fatura.totalDespesas)} − estornos {fmt(fatura.totalEstornos)}
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className="px-3 py-2.5 text-right text-despesa whitespace-nowrap">{fmt(fatura.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {pagamentosAnterior.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold text-texto-2 mb-2">Pagamento efetuado (fatura de {rotuloFatura(anterior)}) · informativo, não entra no total</p>
          {pagamentosAnterior.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm py-1">
              <span className="text-texto-2">{fmtDate(p.date)} · {p.description || 'Pagamento efetuado'}</span>
              <span className="text-receita font-medium">{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {previstos.length > 0 && (
        <div className="card" data-testid="extrato-fatura-previstos">
          <p className="text-xs font-semibold text-texto-2 mb-2">Previstos (não constam na fatura do banco) · {fmt(totalPrevisto)}, fora do total</p>
          {previstos.map(p => (
            <div key={p.key} className="flex items-center justify-between text-sm py-1">
              <span className="text-texto-2">{fmtDate(p.date)} · {p.description}</span>
              <span className="text-texto-2 font-medium">{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
