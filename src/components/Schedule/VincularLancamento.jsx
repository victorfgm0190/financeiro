import { useMemo, useState } from 'react'
import { Link2, Search } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { candidatosDaOcorrencia, divergenciaVinculo } from '../../lib/vinculo'

// "Vincular a lançamento existente": liga a ocorrência `data` de `schedule` a um lançamento que já
// existe, em vez de gerar outro (lib/vinculo). Candidatos: lançamentos livres do mesmo sentido e
// conta, até 15 dias, ordenados por semelhança (valor, data, favorecido, categoria); a busca acha
// qualquer outro. `perguntarManter`: quando valor/data diferem, pergunta o que fica na ocorrência.
// `onVincular(txId, manter)`.
export default function VincularLancamento({ schedule, data, transactions, schedules, accounts, onVincular, abertoInicial = false, perguntarManter = false }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState(null)
  const [manter, setManter] = useState('lancamento')
  const candidatos = useMemo(
    () => (aberto ? candidatosDaOcorrencia(schedule, data, { transactions, schedules, busca }) : []),
    [aberto, schedule, data, transactions, schedules, busca]
  )
  if (!schedule || !data) return null
  const conta = (id) => { const a = (accounts || []).find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  const escolher = (t) => {
    if (perguntarManter && divergenciaVinculo(t, schedule, data).diverge) { setEscolhido(t); setManter('lancamento') }
    else onVincular(t.id, 'lancamento')
  }
  const div = escolhido ? divergenciaVinculo(escolhido, schedule, data) : null

  return (
    <div className="rounded-lg border border-borda-forte">
      <button type="button" onClick={() => setAberto(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-texto-2 hover:text-texto-1">
        <Link2 size={13} /> Vincular a lançamento existente
        <span className="ml-auto text-texto-3">{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div className="px-3 pb-2.5 space-y-1.5">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-texto-3" />
            <input className="input pl-7 py-1.5 text-xs" value={busca} onChange={e => { setBusca(e.target.value); setEscolhido(null) }} placeholder="Buscar lançamento por descrição ou favorecido" aria-label="Buscar lançamento" />
          </div>
          {escolhido ? (
            <div className="rounded border border-aviso/40 bg-aviso/10 p-2 space-y-1.5 text-xs">
              <p className="text-texto-1">Valor ou data diferentes. O que fica na ocorrência de {fmtDate(data)}?</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" className="accent-primary mt-0.5" checked={manter === 'lancamento'} onChange={() => setManter('lancamento')} />
                <span>Os do lançamento real: {fmt(escolhido.amount)} · {fmtDate(escolhido.date)}</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" className="accent-primary mt-0.5" checked={manter === 'agendamento'} onChange={() => setManter('agendamento')} />
                <span>Os previstos: {fmt(div.valor ? div.valor.previsto : escolhido.amount)} · {fmtDate(div.data ? div.data.previsto : escolhido.date)}</span>
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => setEscolhido(null)}>Voltar</button>
                <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => onVincular(escolhido.id, manter)}>Vincular</button>
              </div>
            </div>
          ) : candidatos.length === 0 ? (
            <p className="text-xs text-texto-3">
              Nenhum lançamento livre da mesma conta ({conta(schedule.accountId)}) até 15 dias de {fmtDate(data)}. Use a busca para procurar outro.
            </p>
          ) : candidatos.map(({ tx: t, diferenca }) => (
            <div key={t.id} className="flex items-center gap-2 text-xs border-t border-borda/60 pt-1.5 first:border-0 first:pt-0">
              <div className="flex-1 min-w-0">
                <p className="text-texto-1 truncate">{t.description || t.payee || '(sem descrição)'}</p>
                <p className="text-texto-3">{fmtDate(t.date)} · {conta(t.accountId)}{t.payee ? ` · ${t.payee}` : ''}</p>
              </div>
              <span className="text-right shrink-0">
                <span className="block text-texto-1 font-medium">{fmt(t.amount)}</span>
                {Math.abs(diferenca) > 0.004 && (
                  <span className={`block text-[10px] ${diferenca > 0 ? 'text-despesa' : 'text-receita'}`}>
                    {diferenca > 0 ? '+' : '−'}{fmt(Math.abs(diferenca))}
                  </span>
                )}
              </span>
              <button type="button" className="btn-secondary text-xs py-1 px-2 shrink-0" onClick={() => escolher(t)}>Vincular</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
