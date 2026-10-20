import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { gerarPlanoParcelas, PAPEIS, r2 } from '../../lib/contratos/parcelas'
import { planoVinculo } from '../../lib/contratos/vinculo'
import { hojeStr, fmtYm } from '../../lib/contratos/datas'

const MAX_PREVIA = 12
const FREQ_LABELS = {
  once: 'Única', daily: 'Diária', weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal', bimonthly: 'Bimestral',
  quarterly: 'Trimestral', quadrimestral: 'Quadrimestral', semiannual: 'Semestral', annual: 'Anual',
}

// "Detectamos agendamentos já existentes": candidatos ao vínculo (candidatosVinculo) com checkbox,
// papel editável e motivo do casamento. Valor da série diferente do calculado → prévia por parcela
// pendente: "usar valor do contrato" (padrão) ou "manter atual".
//   geracao: true = contrato recém-criado — "Não vincular" ainda gera as parcelas.
export default function VinculoModal({ contrato, candidatos, apartirDe = null, geracao = false, onClose, onConcluido }) {
  const { vincularEGerarContrato, indicesContratos } = useApp()
  const [sel, setSel] = useState(() => Object.fromEntries(candidatos.map((c, i) => [c.schedule.id, { on: i === 0 && c.score >= 50, papel: c.papel }])))
  const [manter, setManter] = useState({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const plano = useMemo(() => gerarPlanoParcelas(contrato, { hoje: hojeStr(), indices: indicesContratos, apartirDe }), [contrato, indicesContratos, apartirDe])

  // Prévia por série selecionada: parcelas que o contrato vai gerar para o papel dela (fora dos
  // meses que a série já cobre) quando o valor da série difere do calculado.
  const previas = useMemo(() => candidatos.filter(c => sel[c.schedule.id]?.on).map(c => {
    const papel = sel[c.schedule.id].papel
    const cobertas = new Set(planoVinculo(c.schedule, papel, contrato.id).cobertas)
    const linhas = plano.filter(p => p.papel === papel && !cobertas.has(p.competencia) && r2(p.valor) !== r2(c.schedule.amount)).slice(0, MAX_PREVIA)
    return { c, papel, linhas }
  }).filter(p => p.linhas.length), [candidatos, sel, plano, contrato.id])

  const alternarManter = (papel, ym, valor) => setManter(prev => {
    const p = { ...(prev[papel] || {}) }
    if (p[ym] != null) delete p[ym]
    else p[ym] = valor
    return { ...prev, [papel]: p }
  })

  const concluir = async (vincular) => {
    setSalvando(true)
    setErro('')
    try {
      const selecoes = vincular ? candidatos.filter(c => sel[c.schedule.id]?.on).map(c => ({ schedule: c.schedule, papel: sel[c.schedule.id].papel })) : []
      if (!vincular && !geracao) { onClose(); return }
      const r = await vincularEGerarContrato(contrato, { selecoes, valoresMantidos: vincular ? manter : {}, apartirDe })
      onConcluido?.(r)
    } catch (err) {
      setErro(err?.message || 'Falha ao vincular.')
      setSalvando(false)
    }
  }
  const algum = candidatos.some(c => sel[c.schedule.id]?.on)

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Detectamos agendamentos já existentes" size="xl">
      <div className="space-y-4 text-sm">
        <p className="text-texto-2">
          Estes agendamentos parecem ser deste contrato. Vinculados, o histórico de pagos fica na ficha e o contrato
          gera só os meses que eles ainda não cobrem — nada é duplicado nem apagado.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-texto-3 border-b border-borda">
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2 text-left">Favorecido / descrição</th>
                <th className="px-2 py-2 text-right">Valor</th>
                <th className="px-2 py-2 text-left">Próx. / freq.</th>
                <th className="px-2 py-2 text-center">Pagas</th>
                <th className="px-2 py-2 text-center">Pendentes</th>
                <th className="px-2 py-2 text-left">Papel</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.map(c => {
                const s = c.schedule
                const st = sel[s.id] || {}
                return (
                  <tr key={s.id} className="border-b border-borda/50 align-top">
                    <td className="px-2 py-2">
                      <input type="checkbox" className="accent-primary w-4 h-4" checked={!!st.on}
                        onChange={() => setSel(p => ({ ...p, [s.id]: { ...st, on: !st.on } }))} />
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-texto-1 font-medium">{s.payee || '—'}</p>
                      <p className="text-texto-2">{s.description}</p>
                      <p className="text-[11px] text-texto-3 mt-0.5">{c.motivos.join(' · ')}</p>
                    </td>
                    <td className="px-2 py-2 text-right text-texto-1 whitespace-nowrap">{fmt(s.amount)}</td>
                    <td className="px-2 py-2 text-texto-2 whitespace-nowrap">
                      {c.proxima ? fmtDate(c.proxima) : '—'}
                      <span className="block text-[11px] text-texto-3">{FREQ_LABELS[s.frequency] || s.frequency}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-texto-2">{c.pagas}</td>
                    <td className="px-2 py-2 text-center text-texto-2">{c.pendentes == null ? 'contínuo' : c.pendentes}</td>
                    <td className="px-2 py-2">
                      <select className="input py-1 text-xs" value={st.papel} onChange={e => setSel(p => ({ ...p, [s.id]: { ...st, papel: e.target.value } }))}>
                        <option value="aluguel">{PAPEIS.aluguel}</option>
                        <option value="condominio">{PAPEIS.condominio}</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {previas.map(({ c, papel, linhas }) => (
          <div key={c.schedule.id} className="rounded-lg border border-borda-forte p-3 space-y-2">
            <p className="text-xs text-texto-2">
              <strong className="text-texto-1">{c.schedule.description}</strong> tem valor {fmt(c.schedule.amount)}, diferente do calculado pelo contrato.
              Marque os meses em que quer manter o valor atual:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {linhas.map(l => {
                const mantido = manter[papel]?.[l.competencia] != null
                return (
                  <label key={l.id} className="flex items-center justify-between gap-2 text-xs bg-surface-2/60 rounded px-2 py-1.5">
                    <span className="text-texto-2">{fmtYm(l.competencia)} · {PAPEIS[papel]}</span>
                    <span className="flex items-center gap-2">
                      <span className={mantido ? 'text-texto-3 line-through' : 'text-texto-1 font-medium'}>{fmt(l.valor)}</span>
                      <span className={mantido ? 'text-texto-1 font-medium' : 'text-texto-3'}>{fmt(c.schedule.amount)}</span>
                      <input type="checkbox" className="accent-primary" checked={mantido} onChange={() => alternarManter(papel, l.competencia, r2(c.schedule.amount))} title="Manter o valor atual da série neste mês" />
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="text-[11px] text-texto-3">Desmarcado = usar o valor do contrato.</p>
          </div>
        ))}

        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button className="btn-secondary" disabled={salvando} onClick={() => concluir(false)}>Não vincular</button>
          <button className="btn-primary flex items-center gap-1.5" disabled={salvando || !algum} onClick={() => concluir(true)}>
            <Link2 size={14} /> Vincular selecionados
          </button>
        </div>
      </div>
    </Modal>
  )
}
