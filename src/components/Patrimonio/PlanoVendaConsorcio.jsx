import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import InputMoeda from '../shared/InputMoeda'
import { fmt, fmtDate } from '../shared/utils'
import { useApp } from '../../context/AppContext'
import { salvarPlanoConsorcio } from '../../lib/bemApi'
import { agendamentosDoBem, prazoDaCota } from '../../lib/consorcio'
import { projetarPlano, custoAtualPorCota, cotaVendida } from '../../lib/planoVendaConsorcio'
import { previsoesDasFuncoes } from '../../lib/previsaoReserva'
import { indexarReserva, saldoDaFuncao } from '../../lib/saldoReserva'
import HelpCampo from '../shared/HelpCampo'

// Quadro "Plano de venda" do consórcio. A projeção é recalculada com os dados reais a cada abertura: parcelas
// pagas e custo vêm do extrato do bem, e cota vendida sai sozinha. Só o que é previsão fica gravado por cota.
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const rotuloMes = (m) => `${m.slice(5, 7)}/${m.slice(2, 4)}`

export default function PlanoVendaConsorcio({ bemId, consorcio, resumo, pagasPorCota, podeEditar, onMudou, avisar }) {
  const { reserveFunctions, reservePeriods, reserveAdjustments, transactions, accounts, schedules, scheduleReservaFuncoes, getNextOccurrences } = useApp()
  const cotasBase = useMemo(() => consorcio.cotas || [], [consorcio])
  const vendido = consorcio.situacao === 'vendida'
  const [plano, setPlano] = useState(() => Object.fromEntries(cotasBase.map(c => [c.numero, {
    mes: c.plano_mes || '', valor: c.plano_valor ?? '', vendida: !!c.vendida_em, vendidaEm: c.vendida_em || '', vendidaValor: c.vendida_valor ?? '',
  }])))
  const [funcaoId, setFuncaoId] = useState(consorcio.funcao_reserva_id || '')
  const [salvando, setSalvando] = useState(false)
  const hoje = hojeIso()
  const alterar = (numero, campo, valor) => setPlano(p => ({ ...p, [numero]: { ...p[numero], [campo]: valor } }))

  // Só funções que o usuário enxerga: as de contas dos perfis dele.
  const funcoes = useMemo(() => {
    const contas = new Set((accounts || []).map(a => a.id))
    return (reserveFunctions || []).filter(f => contas.has(f.accountId))
  }, [reserveFunctions, accounts])
  const funcao = funcoes.find(f => f.id === funcaoId) || null

  const cotas = useMemo(() => cotasBase.map(c => {
    const p = plano[c.numero] || {}
    return { ...c, plano_mes: p.mes || null, plano_valor: p.valor === '' ? null : Number(p.valor), vendida_em: p.vendida ? (p.vendidaEm || hoje) : null }
  }), [cotasBase, plano, hoje])

  const projecao = useMemo(() => {
    const doBem = agendamentosDoBem(schedules, bemId)
    const previsoes = funcao
      ? (previsoesDasFuncoes([funcao], { accounts, schedules, scheduleReservaFuncoes, getNextOccurrences }, { ini: hoje, fim: '2099-12-31' })[funcao.id] || [])
        .filter(i => !doBem.some(s => s.id === i.schedule?.id))
      : []
    const saldo = funcao
      ? saldoDaFuncao(funcao, hoje, indexarReserva({ periods: reservePeriods, adjustments: reserveAdjustments, transactions })).saldo
      : null
    const proximas = doBem.map(s => (getNextOccurrences?.(s, 1) || [])[0]).filter(Boolean).sort()
    return projetarPlano({
      hoje, cotas, funcao: funcao ? { saldo } : null, previsoes, consorcioVendido: vendido,
      // O custo da cota vendida já saiu do bem: o que sobra é das que continuam.
      custoPorCota: custoAtualPorCota(
        cotasBase,
        Math.max(0, (resumo?.custoProprioLiquido || 0) - cotasBase.reduce((s, c) => s + (Number(c.vendida_custo) || 0), 0)),
        cotasBase.map((c, i) => (c.vendida_em ? 0 : (pagasPorCota ? pagasPorCota[i] : 1))),
      ),
      restantesPorCota: cotasBase.map((c, i) => (pagasPorCota ? prazoDaCota(c, pagasPorCota[i]).restantes : null)),
      primeiroMesComParcela: proximas[0] ? proximas[0].slice(0, 7) : null,
    })
  }, [schedules, bemId, funcao, accounts, scheduleReservaFuncoes, getNextOccurrences, hoje, reservePeriods, reserveAdjustments, transactions, cotas, cotasBase, resumo, pagasPorCota, vendido])

  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarPlanoConsorcio({
        bem_id: bemId,
        funcao_reserva_id: funcaoId || null,
        cotas: cotasBase.map(c => {
          const p = plano[c.numero] || {}
          return { numero: c.numero, plano_mes: p.mes || null, plano_valor: p.valor === '' ? null : p.valor, vendida_em: p.vendida ? (p.vendidaEm || hoje) : null, vendida_valor: p.vendida && p.vendidaValor !== '' ? p.vendidaValor : null }
        }),
      })
      avisar?.('Plano de venda salvo.')
      onMudou?.()
    } catch (e) {
      avisar?.(e?.dados?.error || e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const { meses, resultado, avisos, temFuncao } = projecao
  const grafico = meses.map(m => ({ mes: rotuloMes(m.mes), saldo: m.saldoFuncao }))
  const th = 'text-right px-2 py-1.5 text-[11px] font-medium text-texto-2 whitespace-nowrap'
  const td = 'text-right px-2 py-1 text-xs whitespace-nowrap'

  return (
    <div className="card space-y-3" data-testid="plano-venda" data-help-form="planoVenda">
      <div>
        <h3 className="text-sm font-semibold text-texto-1">Plano de venda</h3>
        <p className="text-xs text-texto-3">Simulação: nada aqui gera lançamento. A projeção usa o valor atual da parcela e os dados reais do bem.</p>
      </div>

      <div className="space-y-2">
        {cotasBase.map(c => {
          const p = plano[c.numero] || {}
          const fora = cotaVendida({ vendida_em: p.vendida ? 'x' : null }, vendido)
          const real = !!c.vendida_evento_id
          return (
            <div key={c.numero} className="grid grid-cols-1 sm:grid-cols-[6rem_1fr_1fr_auto] gap-2 items-end" data-testid={`plano-cota-${c.numero}`}>
              <p className="text-xs font-medium text-texto-1 pb-2">Cota {c.numero}</p>
              <label className="text-[11px] text-texto-2" data-help-id="planoVenda.mes">Mês previsto de venda<HelpCampo campo="planoVenda.mes" />
                <input type="month" className="input mt-1 w-full text-xs" disabled={!podeEditar || fora} value={p.mes} onChange={e => alterar(c.numero, 'mes', e.target.value)} />
              </label>
              <label className="text-[11px] text-texto-2" data-help-id="planoVenda.valor">Valor de venda esperado<HelpCampo campo="planoVenda.valor" />
                <InputMoeda className="input mt-1 w-full text-xs" disabled={!podeEditar || fora} value={p.valor} onChange={e => alterar(c.numero, 'valor', e.target.value)} />
              </label>
              {real
                ? <p className="text-[11px] text-texto-3 pb-2" data-testid={`plano-venda-real-${c.numero}`}>Vendida em {fmtDate(c.vendida_em)}</p>
                : (
                  <label data-help-id="planoVenda.vendidaAntes" className="flex items-center gap-1.5 text-[11px] text-texto-2 pb-2" title="Só para cota vendida antes da venda por cota existir: não gera lançamento. Para vender agora, use Vender cota.">
                    <input type="checkbox" className="accent-primary" disabled={!podeEditar || vendido} checked={fora} onChange={e => alterar(c.numero, 'vendida', e.target.checked)} /> Vendida antes (sem lançamento)<HelpCampo campo="planoVenda.vendidaAntes" />
                  </label>
                )}
              {p.vendida && !vendido && !real && (
                <div className="sm:col-start-2 sm:col-span-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-texto-2" data-help-id="planoVenda.vendidaEm">Vendida em<HelpCampo campo="planoVenda.vendidaEm" />
                    <input type="date" className="input mt-1 w-full text-xs" disabled={!podeEditar} value={p.vendidaEm} onChange={e => alterar(c.numero, 'vendidaEm', e.target.value)} />
                  </label>
                  <label className="text-[11px] text-texto-2" data-help-id="planoVenda.vendidaValor">Valor recebido<HelpCampo campo="planoVenda.vendidaValor" />
                    <InputMoeda className="input mt-1 w-full text-xs" disabled={!podeEditar} value={p.vendidaValor} onChange={e => alterar(c.numero, 'vendidaValor', e.target.value)} />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <label className="block text-[11px] text-texto-2" data-help-id="planoVenda.funcao">Função de reserva que paga as parcelas (opcional)<HelpCampo campo="planoVenda.funcao" />
        <select className="input mt-1 w-full text-xs" disabled={!podeEditar} value={funcaoId} onChange={e => setFuncaoId(e.target.value)}>
          <option value="">Nenhuma: mostrar só o bem</option>
          {funcoes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {podeEditar && (
        <div className="flex justify-end">
          <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1.5" disabled={salvando} onClick={salvar}>
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar plano
          </button>
        </div>
      )}

      {avisos.map(a => (
        <p key={a.mes} className="rounded-lg border border-aviso/40 bg-aviso/10 p-2 text-xs text-texto-1 flex gap-2" role="status" data-testid="plano-aviso-isencao">
          <AlertTriangle size={14} className="text-aviso shrink-0 mt-0.5" />
          <span><b>{rotuloMes(a.mes)}: {fmt(a.total)}.</b> {a.texto}</span>
        </p>
      ))}

      {meses.length === 0 ? (
        <p className="text-xs text-texto-3" data-testid="plano-vazio">{vendido ? 'Este consórcio já foi vendido.' : 'Preencha o mês e o valor de venda de ao menos uma cota para ver a projeção.'}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 520 }} data-testid="plano-tabela">
              <thead>
                <tr className="border-b border-borda">
                  <th className="text-left px-2 py-1.5 text-[11px] font-medium text-texto-2">Mês</th>
                  <th className={th}>Parcelas</th>
                  {temFuncao && <th className={th}>Entradas previstas</th>}
                  {temFuncao && <th className={th}>Saídas previstas</th>}
                  <th className={th}>Vendas</th>
                  {temFuncao && <th className={th}>Saldo da função</th>}
                  <th className={th}>Custo próprio por cota</th>
                </tr>
              </thead>
              <tbody>
                {meses.map(m => (
                  <tr key={m.mes} className="border-b border-borda/40">
                    <td className="px-2 py-1 text-xs text-texto-1">{rotuloMes(m.mes)}</td>
                    <td className={`${td} text-despesa`}>{fmt(m.parcelas)}</td>
                    {temFuncao && <td className={`${td} text-receita`}>{fmt(m.entradasPrevistas)}</td>}
                    {temFuncao && <td className={`${td} text-despesa`}>{fmt(m.saidasPrevistas)}</td>}
                    <td className={`${td} text-receita`}>{m.vendas ? fmt(m.vendas) : '—'}</td>
                    {temFuncao && <td className={`${td} font-semibold ${m.saldoFuncao < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(m.saldoFuncao)}</td>}
                    <td className={`${td} text-texto-2`}>{m.custoPorCota.map(c => `${c.numero}: ${fmt(c.custo)}`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {temFuncao && (
            <div style={{ height: 160 }} data-testid="plano-grafico">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={grafico} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={60} tickFormatter={v => Math.round(v).toLocaleString('pt-BR')} />
                  <Tooltip formatter={v => fmt(v)} />
                  <ReferenceLine y={0} stroke="var(--color-borda)" />
                  <Line type="monotone" dataKey="saldo" name="Saldo da função" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-lg bg-surface-2/40 p-3 space-y-1 text-xs text-texto-2" data-testid="plano-resultado">
            {temFuncao && <p className="flex justify-between gap-3"><span>Saldo da função no fim do plano</span><b className="text-texto-1">{fmt(resultado.saldoFinal)}</b></p>}
            {resultado.ganhoPorCota.map(g => (
              <p key={g.numero} className="flex justify-between gap-3"><span>Cota {g.numero}: venda {fmt(g.venda)} − custo {fmt(g.custo)}</span><b className={g.ganho >= 0 ? 'text-receita' : 'text-despesa'}>{fmt(g.ganho)}</b></p>
            ))}
            <p className="flex justify-between gap-3 border-t border-borda pt-1"><span className="font-semibold">Ganho total</span><b className={resultado.ganhoTotal >= 0 ? 'text-receita' : 'text-despesa'}>{fmt(resultado.ganhoTotal)}</b></p>
          </div>
        </>
      )}
    </div>
  )
}
