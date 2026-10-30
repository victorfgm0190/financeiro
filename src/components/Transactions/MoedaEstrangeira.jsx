import { useState } from 'react'
import { Globe, ExternalLink } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { aliquotaIof, iofEmLinhaSeparada, planoCompraEstrangeira, numeroDoTexto, MOEDAS } from '../../lib/cambio'

const pct = (f) => `${(Number(f) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const num = (v, casas = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

// Formulário do lançamento (edição/detalhe): compra em moeda estrangeira e o IOF ligado a ela
// (src/lib/cambio.js). Só leitura, salvo o valor na moeda da compra ESTIMADA: "Recalcular" refaz o
// R$ (mesma PTAX e spread) no campo Valor — o Salvar do formulário grava, e o IOF estimado acompanha
// (AppContext, IOF ligado). `onAbrir(tx)` abre o lançamento ligado (IOF ↔ compra).
export default function MoedaEstrangeira({ tx, onRecalcular, onAbrir }) {
  const { transactions, accounts, settings } = useApp()
  const [usd, setUsd] = useState(tx.valorOriginal != null ? num(tx.valorOriginal) : '')
  const iofs = (transactions || []).filter(t => t.compraIofId === tx.id)
  const compra = tx.compraIofId ? (transactions || []).find(t => t.id === tx.compraIofId) : null
  if (!tx.moeda && !iofs.length && !tx.compraIofId) return null

  const simb = MOEDAS[tx.moeda]?.simbolo || tx.moeda
  const novoUsd = numeroDoTexto(usd)
  const mudou = tx.estimado && novoUsd && Math.round(novoUsd * 100) !== Math.round(Number(tx.valorOriginal) * 100)
  const recalcular = () => {
    const cartao = accounts.find(a => a.id === tx.accountId)
    const { valorCompra } = planoCompraEstrangeira({
      valorOriginal: novoUsd, cotacao: tx.cotacao, spread: Number(tx.spread) || 0,
      aliquota: aliquotaIof(settings), separada: iofEmLinhaSeparada(cartao),
    })
    if (valorCompra) onRecalcular(valorCompra, novoUsd)
  }
  const link = (t, texto) => (
    <button type="button" onClick={() => onAbrir(t)} className="inline-flex items-center gap-1 text-primary-fg hover:text-texto-1 underline-offset-2 hover:underline">
      {texto} <ExternalLink size={11} />
    </button>
  )

  return (
    <div className="rounded-lg border border-borda bg-surface-2/60 px-3 py-2 text-xs text-texto-2 space-y-1.5">
      {tx.moeda && (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-texto-1 font-medium">
            <Globe size={13} className="text-texto-3" /> Moeda estrangeira
            {tx.estimado
              ? <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-aviso/15 text-aviso">estimado</span>
              : <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-receita/15 text-receita">confirmado pela fatura</span>}
          </p>
          <p className="break-words">
            {simb} {num(tx.valorOriginal)}
            {tx.cotacao ? <> · PTAX{tx.dataCotacao ? ` ${fmtDate(tx.dataCotacao)}` : ''}: {num(tx.cotacao, 4)}</> : ' · sem cotação (valor digitado)'}
            {tx.spread != null && <> · spread {tx.estimado ? '' : 'real '}{pct(tx.spread)}</>}
            {!tx.estimado && <> · valor real {fmt(tx.amount)}</>}
          </p>
          {tx.estimado && tx.cotacao > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`usd-${tx.id}`}>Valor em {simb}</label>
              <input id={`usd-${tx.id}`} className="input !py-1 !text-xs w-28 text-right" inputMode="decimal" value={usd}
                onChange={e => setUsd(e.target.value.replace(/[^\d.,]/g, ''))} />
              <button type="button" className="btn-secondary !py-1 text-xs" disabled={!mudou} onClick={recalcular}>Recalcular R$ e IOF</button>
            </div>
          )}
        </>
      )}
      {iofs.map(i => (
        <p key={i.id}>IOF vinculado: {link(i, `${fmt(i.amount)}${i.estimado ? ' (estimado)' : ''}`)}</p>
      ))}
      {tx.compraIofId && (
        <p>IOF da compra: {compra ? link(compra, `${compra.payee || compra.description} · ${fmt(compra.amount)}`) : <span className="text-texto-3">compra não encontrada</span>}</p>
      )}
    </div>
  )
}
