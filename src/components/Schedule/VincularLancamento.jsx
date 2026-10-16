import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { candidatosVinculo, outrosValoresVinculo, JANELA_DIAS } from '../../lib/ocorrenciasRegistradas'

// "Vincular a lançamento existente": baixa a ocorrência `data` apontando um lançamento que já
// existe (sem vínculo), em vez de gerar outro. Sugestões em candidatosVinculo: mesma conta, valor
// ±R$ 0,05, data a ±1 período, fora os já vinculados. "Mostrar outros valores" lista os demais da
// mesma conta/janela com qualquer valor (outrosValoresVinculo), com a diferença. `onVincular(txId)`
// grava a baixa com o meta.
export default function VincularLancamento({ schedule, data, transactions, schedules, accounts, onVincular, abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const [verOutros, setVerOutros] = useState(false)
  const candidatos = useMemo(
    () => (aberto ? candidatosVinculo(schedule, data, { transactions, schedules }) : []),
    [aberto, schedule, data, transactions, schedules]
  )
  const outros = useMemo(
    () => (aberto && verOutros ? outrosValoresVinculo(schedule, data, { transactions, schedules }) : []),
    [aberto, verOutros, schedule, data, transactions, schedules]
  )
  if (!schedule || !data) return null
  const conta = (id) => { const a = (accounts || []).find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  const janela = JANELA_DIAS[schedule.frequency] ?? 31

  return (
    <div className="rounded-lg border border-borda-forte">
      <button type="button" onClick={() => setAberto(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-texto-2 hover:text-texto-1">
        <Link2 size={13} /> Vincular a lançamento existente
        <span className="ml-auto text-texto-3">{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {candidatos.length === 0 ? (
            <p className="text-xs text-texto-3">
              Nenhum lançamento sem vínculo compatível: mesma conta ({conta(schedule.accountId)}), valor ±R$ 0,05, até {janela} dias de {fmtDate(data)}.
            </p>
          ) : candidatos.map(t => <Linha key={t.id} t={t} conta={conta} onVincular={onVincular} />)}
          {!verOutros ? (
            <button type="button" className="text-[11px] text-primary-fg underline pt-0.5" onClick={() => setVerOutros(true)}>
              Mostrar outros valores
            </button>
          ) : (
            <div className="pt-1.5 mt-1 border-t border-borda space-y-1.5">
              <p className="text-[11px] text-texto-3">Outros valores · mesma conta, até {janela} dias:</p>
              {outros.length === 0
                ? <p className="text-xs text-texto-3">Nenhum outro lançamento sem vínculo.</p>
                : outros.map(({ tx, diferenca }) => <Linha key={tx.id} t={tx} diferenca={diferenca} conta={conta} onVincular={onVincular} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Linha({ t, diferenca, conta, onVincular }) {
  return (
    <div className="flex items-center gap-2 text-xs border-t border-borda/60 pt-1.5 first:border-0 first:pt-0">
      <div className="flex-1 min-w-0">
        <p className="text-texto-1 truncate">{t.description || t.payee || '(sem descrição)'}</p>
        <p className="text-texto-3">{fmtDate(t.date)} · {conta(t.accountId)}{t.payee ? ` · ${t.payee}` : ''}</p>
      </div>
      <span className="text-right shrink-0">
        <span className="block text-texto-1 font-medium">{fmt(t.amount)}</span>
        {diferenca != null && (
          <span className={`block text-[10px] ${diferenca > 0 ? 'text-despesa' : 'text-receita'}`}>
            {diferenca > 0 ? '+' : '−'}{fmt(Math.abs(diferenca))}
          </span>
        )}
      </span>
      <button type="button" className="btn-secondary text-xs py-1 px-2 shrink-0" onClick={() => onVincular(t.id)}>Vincular</button>
    </div>
  )
}
