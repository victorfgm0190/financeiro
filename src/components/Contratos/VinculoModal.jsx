import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { gerarPlanoParcelas, r2 } from '../../lib/contratos/parcelas'
import { rotuloPapel } from '../../lib/contratos/rotulos'
import { planoVinculo, SCORE_FORTE } from '../../lib/contratos/vinculo'
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
//   lancamentos: busca ampliada (C3) — lançamentos avulsos que parecem do contrato, cada um com a
//   parcela mais provável. Nunca vêm marcados; prévia antes de gravar.
export default function VinculoModal({ contrato, candidatos, lancamentos = [], apartirDe = null, geracao = false, onClose, onConcluido }) {
  const { vincularEGerarContrato, indicesContratos, vincularLancamentoNaLinha, vincularLancamento, desvincularLancamento } = useApp()
  const [selTx, setSelTx] = useState({})
  const [revisarTx, setRevisarTx] = useState(false)
  const [sel, setSel] = useState(() => Object.fromEntries(candidatos.map(c => [c.schedule.id, { on: c.score >= SCORE_FORTE, papel: c.papel }])))
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
  const txEscolhidos = lancamentos.filter(c => selTx[c.tx.id])
  const linhaRepetida = new Set(txEscolhidos.map(c => c.linha.key)).size !== txEscolhidos.length
  const rotuloLinha = (l) => `${rotuloPapel(contrato, l.papel)}${l.numero ? ` ${l.numero}${l.total ? `/${l.total}` : ''}` : ''} de ${fmtYm(l.competencia)}`

  const gravarLancamentos = async () => {
    setSalvando(true)
    setErro('')
    let feitos = 0
    try {
      for (const c of txEscolhidos) {
        await vincularLancamentoNaLinha(contrato, c.linha, c.tx, { vincular: vincularLancamento, desvincular: desvincularLancamento })
        feitos += 1
      }
      onConcluido?.({ vinculados: 0, mensagem: `${feitos} lançamento(s) ligado(s) às parcelas.` })
    } catch (err) {
      setErro(`${feitos} gravado(s); parou em um: ${err?.message || 'falha ao vincular.'}`)
      setSalvando(false)
    }
  }

  if (revisarTx) {
    return (
      <Modal open onClose={salvando ? () => {} : onClose} title="Confira o vínculo dos lançamentos" size="lg">
        <div className="space-y-3 text-sm">
          <p className="text-texto-2">Cada lançamento passa a pagar a parcela indicada. Nenhum lançamento é criado ou alterado no valor.</p>
          <ul className="space-y-1">
            {txEscolhidos.map(c => (
              <li key={c.tx.id} className="text-xs bg-surface-2/60 rounded px-2 py-1.5">
                <span className="text-texto-1">{fmtDate(c.tx.date)} · {c.tx.payee || c.tx.description} · {fmt(c.tx.amount)}</span>
                <span className="text-texto-2"> → {rotuloLinha(c.linha)} (esperado {fmt(c.linha.valor)}){c.linha.semParcela ? ' · parcela criada já paga' : ''}</span>
              </li>
            ))}
          </ul>
          {erro && <p className="text-xs text-perigo">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" disabled={salvando} onClick={() => setRevisarTx(false)}>Voltar</button>
            <button className="btn-primary flex items-center gap-1.5" disabled={salvando} onClick={gravarLancamentos}><Link2 size={14} /> Gravar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Detectamos agendamentos já existentes" size="xl">
      <div className="space-y-4 text-sm">
        <p className="text-texto-2">
          Estes agendamentos parecem ser deste contrato. Vinculados, o histórico de pagos fica na ficha e o contrato
          gera só os meses que eles ainda não cobrem — nada é duplicado nem apagado.
        </p>
        {candidatos.length > 0 && <div className="overflow-x-auto">
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
                        <option value="aluguel">{rotuloPapel(contrato, 'aluguel')}</option>
                        {contrato.tem_condominio && <option value="condominio">{rotuloPapel(contrato, 'condominio')}</option>}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}

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
                    <span className="text-texto-2">{fmtYm(l.competencia)} · {rotuloPapel(contrato, papel)}</span>
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

        {lancamentos.length > 0 && (
          <div className="rounded-lg border border-borda-forte p-3 space-y-2">
            <p className="text-xs text-texto-2">
              <strong className="text-texto-1">Lançamentos já feitos</strong> que parecem deste contrato (sem agendamento). Marque os que quer ligar a uma parcela — nada é marcado sozinho.
            </p>
            <div className="space-y-1 max-h-[30vh] overflow-y-auto">
              {lancamentos.map(c => (
                <label key={c.tx.id} className="flex items-start gap-2 text-xs bg-surface-2/60 rounded px-2 py-1.5">
                  <input type="checkbox" className="accent-primary mt-0.5" checked={!!selTx[c.tx.id]} onChange={e => setSelTx(p => ({ ...p, [c.tx.id]: e.target.checked }))} />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2"><span className="text-texto-1 truncate">{fmtDate(c.tx.date)} · {c.tx.payee || c.tx.description}</span><span className="text-texto-1 whitespace-nowrap">{fmt(c.tx.amount)}</span></span>
                    <span className="block text-[11px] text-texto-2">→ {rotuloLinha(c.linha)}{c.linha.semParcela ? ' (sem pagamento vinculado)' : ''}</span>
                    <span className="block text-[11px] text-texto-3">{c.motivos.join(' · ')}</span>
                  </span>
                </label>
              ))}
            </div>
            {linhaRepetida && <p className="text-[11px] text-perigo">Dois lançamentos marcados apontam para a mesma parcela: deixe só um (o outro pode ser ligado pela linha, em "Vincular pagamento").</p>}
            <button type="button" className="btn-secondary text-xs" disabled={!txEscolhidos.length || linhaRepetida || salvando} onClick={() => setRevisarTx(true)}>
              Revisar vínculo dos lançamentos ({txEscolhidos.length})
            </button>
          </div>
        )}

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
