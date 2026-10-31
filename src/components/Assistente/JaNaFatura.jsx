import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { rotuloFatura, ajusteProposto } from '../../lib/matchLancamento'
import { numeroParcelaDoTx, totalParcelasDoTx } from '../../lib/revisaoImportacao'

// Prévia do Assistente: o lançamento do SMS/pedido parece já estar numa fatura do cartão
// (lib/matchLancamento). Forte → "Confirmar o existente" (só concilia, nada novo), "Ajustar o
// existente" (valor/data divergentes; abre a edição) ou "Lançar mesmo assim". Fraco (só o nome
// parecido) → só a pergunta "É este?". Nunca exclui nada.
//   novo: { amount, date }   onConfirmar(tx)   onAjustar(tx, ajustes)   onLancar(m)   onDescartar()
export default function JaNaFatura({ fortes = [], fracos = [], novo, textoOriginal, onConfirmar, onAjustar, onLancar, onDescartar }) {
  const [escolhidoFraco, setEscolhidoFraco] = useState(null)
  const lista = escolhidoFraco ? [escolhidoFraco] : fortes
  const [sel, setSel] = useState(0)
  const [fracoRecusado, setFracoRecusado] = useState(false)

  if (!lista.length) {
    if (!fracos.length || fracoRecusado) return null
    return (
      <div role="status" className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-sm text-texto-1 space-y-2">
        <p className="font-medium">{fracos.length > 1 ? 'Tem lançamentos parecidos nesta fatura. É algum destes?' : 'Tem um lançamento parecido. É este?'}</p>
        <ul className="space-y-1.5">
          {fracos.map(m => (
            <li key={m.tx.id} className="flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-0 break-words text-xs"><Resumo m={m} /></span>
              <button type="button" className="btn-secondary text-xs min-h-[36px]" onClick={() => setEscolhidoFraco(m)}>É este</button>
            </li>
          ))}
        </ul>
        <button type="button" className="text-xs text-texto-2 hover:text-texto-1 min-h-[36px]" onClick={() => setFracoRecusado(true)}>Não é nenhum</button>
      </div>
    )
  }

  const m = lista[Math.min(sel, lista.length - 1)]
  const ajustes = ajusteProposto(m, novo)
  const temAjuste = Object.keys(ajustes).length > 0
  const ajustesForm = ajustes.date && m.tx.dateCartao ? { ...ajustes, dateCartao: ajustes.date } : ajustes
  const faturas = [...new Set(lista.map(x => rotuloFatura(x.fatura)))]

  return (
    <div className="space-y-3">
      <div role="alert" className="rounded-lg border-2 border-aviso/60 bg-aviso/10 px-3 py-2.5 text-sm text-texto-1 space-y-2">
        <p className="flex items-start gap-2 font-semibold">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-aviso" />
          Este lançamento parece já estar na Fatura {faturas.join(' / ')}
        </p>
        {lista.length > 1 && <p className="pl-6 text-xs text-texto-2">Escolha qual é:</p>}
        <ul className="space-y-1.5 pl-6">
          {lista.map((x, i) => (
            <li key={x.tx.id}>
              <label className={`flex items-start gap-2 text-xs ${lista.length > 1 ? 'cursor-pointer' : ''}`}>
                {lista.length > 1 && (
                  <input type="radio" name="ja-na-fatura" className="mt-0.5 accent-primary" checked={i === sel} onChange={() => setSel(i)} />
                )}
                <span className="break-words"><Resumo m={x} /></span>
              </label>
            </li>
          ))}
        </ul>
        {textoOriginal && <p className="pl-6 text-xs text-texto-3 whitespace-pre-wrap break-words">“{textoOriginal}”</p>}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
          <button type="button" className="btn-primary flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5" onClick={() => onConfirmar(m.tx)}>
            <CheckCircle2 size={14} /> Confirmar o existente
          </button>
          {temAjuste && (
            <button type="button" className="btn-secondary flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5" onClick={() => onAjustar(m.tx, ajustesForm)}>
              <Pencil size={14} />
              <span>
                Ajustar o existente
                <span className="block text-[11px] font-normal text-texto-2">
                  {ajustes.amount != null && `de ${fmt(m.tx.amount)} para ${fmt(ajustes.amount)}`}
                  {ajustes.amount != null && ajustes.date ? ' · ' : ''}
                  {ajustes.date && `data de ${fmtDate(m.tx.dateCartao ? String(m.tx.dateCartao).slice(0, 10) : m.tx.date)} para ${fmtDate(ajustes.date)}`}
                </span>
              </span>
            </button>
          )}
          <button type="button" className="btn-secondary flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5" onClick={() => onLancar(m)}>
            <Plus size={14} /> Lançar mesmo assim
          </button>
        </div>
        <p className="text-[11px] text-texto-3">Confirmar marca o existente como conferido (o mesmo ✓ da fatura) e não cria nada novo.</p>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onDescartar} className="inline-flex items-center gap-1 rounded px-2 min-h-[32px] text-xs text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
    </div>
  )
}

function Resumo({ m }) {
  const t = m.tx
  const num = numeroParcelaDoTx(t)
  const total = totalParcelasDoTx(t)
  const data = t.dateCartao ? String(t.dateCartao).slice(0, 10) : t.date
  return (
    <>
      <span className="font-medium">{t.description || t.payee || 'Sem descrição'}</span>
      {num && total ? ` · parcela ${num}/${total}` : ''}
      {' · '}{fmt(t.amount)}
      {data ? ` · ${fmtDate(data)}` : ''}
      {' · '}Fatura {rotuloFatura(m.fatura)}
      {' · '}<span className={t.reconciled ? 'text-receita' : 'text-aviso'}>{t.reconciled ? 'conciliado' : 'pendente'}</span>
    </>
  )
}
