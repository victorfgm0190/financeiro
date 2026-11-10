import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import { getExtratoBens } from '../../lib/bemApi'
import { extratoDoBem, historicoDePagamentos } from '../../lib/extratoBem'
import { cenariosDeSaida, simularSaida, totaisDasCotas } from '../../lib/consorcio'
import HelpCampo from '../shared/HelpCampo'

const pct = (v) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`)

function Linha({ label, children, destaque }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-borda last:border-0">
      <span className="text-xs text-texto-3">{label}</span>
      <span className={`text-sm text-right ${destaque || 'text-texto-1'}`}>{children}</span>
    </div>
  )
}

// Simulador de saída: só informação, nada é gravado. O valor de venda não entra no patrimônio.
export default function SimulacaoTab({ bemId, cotas = [] }) {
  const [historico, setHistorico] = useState(null)
  const [mes, setMes] = useState('30')
  const [agio, setAgio] = useState('20')
  const [cdi, setCdi] = useState('12')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    getExtratoBens(bemId)
      .then(r => { if (vivo) setHistorico(r.bens?.[0] ? historicoDePagamentos(extratoDoBem(r.bens[0], r)) : []) })
      .catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [bemId])

  const totais = useMemo(() => totaisDasCotas(cotas), [cotas])
  const base = useMemo(() => ({
    historico: historico || [],
    parcelaMensal: totais.parcelaMensal,
    valorCarta: totais.carta,
    agioPct: Number(agio) || 0,
    cdiAnualPct: Number(cdi) || 0,
  }), [historico, totais, agio, cdi])
  const r = useMemo(() => simularSaida({ ...base, mesContemplacao: Number(mes) || 0 }), [base, mes])
  const cenarios = useMemo(() => cenariosDeSaida(base), [base])

  if (erro) return <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>
  if (!historico) return <p className="flex items-center gap-2 text-sm text-texto-3 py-8 justify-center"><Loader2 size={14} className="animate-spin" /> Carregando…</p>

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-1">Simular a saída</h3>
        <p className="text-xs text-texto-3 mb-3">Só uma estimativa: nada é gravado, e o valor de venda não entra no patrimônio.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-help-form="simulacaoSaida">
          <div data-help-id="simulacaoSaida.mes">
            <label className="label">Mês previsto da contemplação<HelpCampo campo="simulacaoSaida.mes" /></label>
            <input className="input" type="number" min="1" value={mes} onChange={e => setMes(e.target.value)} placeholder="Meses desde o primeiro pagamento" />
          </div>
          <div data-help-id="simulacaoSaida.agio">
            <label className="label">Ágio na venda (% da carta)<HelpCampo campo="simulacaoSaida.agio" /></label>
            <input className="input" type="number" min="0" step="0.01" value={agio} onChange={e => setAgio(e.target.value)} placeholder="Quanto da carta o comprador paga" />
          </div>
          <div data-help-id="simulacaoSaida.cdi">
            <label className="label">CDI anual (%)<HelpCampo campo="simulacaoSaida.cdi" /></label>
            <input className="input" type="number" min="0" step="0.01" value={cdi} onChange={e => setCdi(e.target.value)} placeholder="Taxa anual para comparar" />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-3">Resultado no mês {r.meses}</h3>
        <Linha label="Investido total">{fmt(r.investido)}</Linha>
        <Linha label="Investido com recursos próprios">{fmt(r.proprio)}</Linha>
        <Linha label="Valor recebido">{fmt(r.recebido)}</Linha>
        <Linha label="Lucro" destaque={r.lucro >= 0 ? 'text-receita font-semibold' : 'text-despesa font-semibold'}>{fmt(r.lucro)}</Linha>
        <Linha label="Retorno sobre os recursos próprios">{pct(r.retornoPct)}</Linha>
        <Linha label="Taxa mensal (TIR)">{pct(r.taxaMensalPct)}</Linha>
        <Linha label="Taxa anual (TIR)">{pct(r.taxaAnualPct)}</Linha>
        <Linha label="CDI no mês">{pct(r.cdiMensalPct)}</Linha>
        <Linha label="O mesmo dinheiro no CDI viraria">{fmt(r.noCdi)}</Linha>
        <Linha label="Diferença sobre o CDI" destaque={r.ganhoSobreCdi >= 0 ? 'text-receita' : 'text-despesa'}>{fmt(r.ganhoSobreCdi)}</Linha>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-3">Cenários com o ágio informado</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-borda text-xs text-texto-2">
                <th className="text-left font-medium py-2 pr-3">Contemplação</th>
                <th className="text-right font-medium py-2 px-2">Recursos próprios</th>
                <th className="text-right font-medium py-2 px-2">Recebido</th>
                <th className="text-right font-medium py-2 px-2">Lucro</th>
                <th className="text-right font-medium py-2 px-2">Taxa mensal</th>
                <th className="text-right font-medium py-2 pl-2">Sobre o CDI</th>
              </tr>
            </thead>
            <tbody>
              {cenarios.map(c => (
                <tr key={c.meses} className="border-b border-borda/60 last:border-0">
                  <td className="py-1.5 pr-3 text-texto-2">Mês {c.meses}</td>
                  <td className="py-1.5 px-2 text-right text-texto-1">{fmt(c.proprio)}</td>
                  <td className="py-1.5 px-2 text-right text-texto-1">{fmt(c.recebido)}</td>
                  <td className={`py-1.5 px-2 text-right ${c.lucro >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmt(c.lucro)}</td>
                  <td className="py-1.5 px-2 text-right text-texto-1">{pct(c.taxaMensalPct)}</td>
                  <td className={`py-1.5 pl-2 text-right ${c.ganhoSobreCdi >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmt(c.ganhoSobreCdi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
