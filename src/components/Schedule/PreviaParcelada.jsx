import { fmt } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { computeFaturaRef } from '../../lib/fatura'
import { agruparPorOcorrencia, frequenciaExibida, avisoSomaOcorrencia } from '../../lib/parcelasOcorrencia'

const dataBR = (d) => d.split('-').reverse().join('/')

// Prévia da recorrência parcelada, agrupada por ocorrência (2027, 2028…): ao expandir, cada parcela com
// data real, valor e fatura. Avisa quando a soma da ocorrência deixa de bater com o total.
//   schedule : o agendamento/provisão como a tela está mostrando; datas: as chaves pendentes;
//   skipped  : os pulos atuais do formulário (a prévia lista também as puladas);
//   conta    : a conta escolhida (cartão → mostra a fatura); onEditar(chave): clique numa parcela.
export default function PreviaParcelada({ schedule, datas, skipped = [], conta = null, onEditar }) {
  const comPulos = { ...schedule, skipped }
  const cartao = conta?.type === 'credit' && schedule.transactionType !== 'income' && conta.closingDay ? conta : null
  return (
    <div className="space-y-1.5">
      {agruparPorOcorrencia(schedule, datas).map((g, gi) => {
        const aviso = avisoSomaOcorrencia(comPulos, g.ocorrencia, fmt)
        return (
          <details key={g.ocorrencia} open={gi === 0} className="rounded-lg border border-borda-forte/60">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs text-texto-1 flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{frequenciaExibida(schedule) === 'once' ? 'Parcelas' : `Ocorrência ${g.ano}`}</span>
              <span className="text-texto-2">{fmt(g.total)} · {g.n}x{g.parcelas.length < g.n ? ` · ${g.parcelas.length} pendente${g.parcelas.length !== 1 ? 's' : ''}` : ''}</span>
              {aviso && <span className="basis-full text-[11px] font-normal text-aviso" role="status">{aviso}</span>}
            </summary>
            <ul className="divide-y divide-borda/40 border-t border-borda/40">
              {g.parcelas.map(p => {
                const pulada = skipped.includes(p.data)
                const ef = occEfetiva(schedule, p.data)
                const editada = !pulada && (!!schedule.overrides?.[p.data]?.date || Math.abs(Number(ef.amount) - p.valor) > 0.005)
                const fatura = cartao ? computeFaturaRef(new Date(ef.date + 'T12:00:00'), cartao.closingDay) : null
                return (
                  <li key={p.data}>
                    <button type="button" onClick={() => onEditar?.(p.data)} title="Clique para editar esta parcela"
                      className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs text-left hover:bg-surface-hover/40 transition-colors">
                      <span className="w-10 text-texto-3 tabular-nums">{p.numero}/{p.total}</span>
                      <span className={`text-texto-2 tabular-nums ${pulada ? 'line-through opacity-50' : ''}`}>{dataBR(pulada ? p.data : ef.date)}</span>
                      <span className="flex-1 text-texto-3">{fatura ? `fatura ${fatura}` : ''}{pulada ? ' · Pulada' : editada ? ' · Editada' : ''}</span>
                      <span className="text-texto-1 font-medium tabular-nums">{fmt(Number(ef.amount) || 0)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </div>
  )
}
