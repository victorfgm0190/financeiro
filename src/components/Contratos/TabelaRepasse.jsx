import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { fmtYm, hojeStr } from '../../lib/contratos/datas'
import { competenciasDoRepasse, confirmadosDe, repassesRegistrados, ehParcelaGerada, parcelaPaga, competenciaDaParcela } from '../../lib/contratos/parcelas'
import ComposicaoRepasseModal from './ComposicaoRepasseModal'

// Status de uma competência do repasse na ficha.
export function statusDaCompetencia(l, hoje) {
  if (l.foraDoSaldo) return { texto: 'Antes do saldo inicial', tom: 'text-texto-3' }
  if (l.paga) return { texto: 'Recebido', tom: 'text-receita' }
  if (!(l.repasse > 0)) return { texto: 'Sem repasse — saldo transportado', tom: 'text-texto-3' }
  if (!l.schedule) return { texto: 'Sem agendamento', tom: 'text-texto-3' }
  return l.vencimento < hoje ? { texto: 'Em atraso', tom: 'text-aviso' } : { texto: 'Previsto', tom: 'text-texto-2' }
}

// Tabela por competência do contrato a receber por administradora: Bruto | Deduções | Resultado |
// Saldo | Repasse | Data | Status. Clique abre a composição da competência (a mesma das outras telas).
export default function TabelaRepasse({ contrato }) {
  const { schedules, transactions, indicesContratos } = useApp()
  const [aberta, setAberta] = useState(null)
  const hoje = hojeStr()
  const doContrato = useMemo(() => schedules.filter(s => s.contratoId === contrato.id), [schedules, contrato.id])
  const linhas = useMemo(() => {
    const porComp = new Map(doContrato.filter(s => ehParcelaGerada(s, contrato.id)).map(s => [competenciaDaParcela(s), s]))
    const txPorId = new Map(transactions.map(t => [t.id, t]))
    return competenciasDoRepasse(contrato, {
      hoje, indices: indicesContratos, confirmados: confirmadosDe(contrato, doContrato),
      repassesReais: repassesRegistrados(contrato, doContrato, transactions),
    }).map(l => {
      const schedule = porComp.get(l.competencia) || null
      const paga = !!schedule && parcelaPaga(schedule)
      const d = paga ? schedule.registered[0] : null
      const tx = paga ? txPorId.get(schedule.registeredMeta?.[d]?.lancamento_id) || transactions.find(t => t.scheduleId === schedule.id) || null : null
      return { ...l, schedule, paga, tx, data: tx?.date || schedule?.startDate || (l.repasse > 0 ? l.vencimento : null) }
    })
  }, [contrato, doContrato, transactions, hoje, indicesContratos])

  const th = 'px-2 py-1.5 text-right font-medium'
  return (
    <div>
      <p className="label">Repasses por competência</p>
      <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-texto-3 border-b border-borda">
              <th className="px-2 py-1.5 text-left font-medium">Competência</th>
              <th className={th}>Bruto</th><th className={th}>Deduções</th><th className={th}>Resultado</th>
              <th className={th}>Saldo</th><th className={th}>Repasse</th>
              <th className="px-2 py-1.5 text-left font-medium">Data</th><th className="px-2 py-1.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              const st = statusDaCompetencia(l, hoje)
              const real = l.paga && l.repasseReal != null && Math.abs(l.repasseReal - l.repasse) > 0.005 ? l.repasseReal : null
              return (
                <tr key={l.competencia} className="border-b border-borda/50 hover:bg-surface-hover cursor-pointer" onClick={() => setAberta(l.competencia)}
                  title="Ver ou editar a composição desta competência">
                  <td className="px-2 py-1.5 text-texto-1 whitespace-nowrap">
                    {fmtYm(l.competencia)}{l.linha?.status === 'fechada' && <span className="ml-1 text-[10px] text-texto-3">· conferida</span>}
                    {l.valorStatus === 'projetado' && <span className="ml-1 text-[10px] text-aviso">· projetado</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right text-texto-2">{fmt(l.bruto)}</td>
                  <td className="px-2 py-1.5 text-right text-texto-2">{l.deducoes ? fmt(-l.deducoes) : '—'}</td>
                  <td className={`px-2 py-1.5 text-right ${l.resultado < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(l.resultado)}</td>
                  <td className={`px-2 py-1.5 text-right ${l.saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{l.saldo == null ? '—' : fmt(l.saldo)}</td>
                  <td className="px-2 py-1.5 text-right text-texto-1 font-medium whitespace-nowrap">
                    {l.repasse > 0 ? fmt(l.repasse) : '—'}
                    {real != null && <span className="block text-[10px] text-aviso">recebido {fmt(real)}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{l.data ? fmtDate(l.data) : '—'}</td>
                  <td className={`px-2 py-1.5 whitespace-nowrap ${st.tom}`}>{st.texto}</td>
                </tr>
              )
            })}
            {linhas.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-center text-texto-3">Nenhuma competência.</td></tr>}
          </tbody>
        </table>
      </div>
      {aberta && <ComposicaoRepasseModal contrato={contrato} competencia={aberta} onClose={() => setAberta(null)} />}
    </div>
  )
}
