import { useEffect, useMemo, useState } from 'react'
import { Loader2, Scale, Wallet, CalendarDays, ListOrdered } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { getExtratoBens } from '../../lib/bemApi'
import { extratoDoBem, resumoDoBem, linhaDoTempo, ROTULO_CLASSE } from '../../lib/extratoBem'
import { isoLocal } from '../../lib/hoje'

function Linha({ label, valor, destaque, dica }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-borda last:border-0">
      <span className="text-xs text-texto-3">
        {label}
        {dica && <span className="block text-[11px] text-texto-3/80">{dica}</span>}
      </span>
      <span className={`text-sm text-right ${destaque || 'text-texto-1'}`}>{fmt(valor)}</span>
    </div>
  )
}

const rotuloMes = (mes) => { const [a, m] = mes.split('-'); return `${m}/${a}` }

// Visão Bem: tudo sai do Extrato do bem (src/lib/extratoBem.js), a mesma leitura do relatório de caixa.
// A aba é montada de novo a cada abertura, então uma baixa ou um estorno já aparecem.
export default function BemResumoTab({ bemId }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    getExtratoBens(bemId)
      .then(r => { if (vivo) { setDados(r); setErro('') } })
      .catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [bemId])

  const calculo = useMemo(() => {
    const bem = dados?.bens?.[0]
    if (!bem) return null
    const parcelas = dados.parcelas || []
    const linhas = extratoDoBem(bem, dados)
    return {
      linhas,
      resumo: resumoDoBem(bem, linhas, parcelas),
      tempo: linhaDoTempo(linhas, parcelas, { ate: isoLocal(new Date()) }),
    }
  }, [dados])

  if (erro) return <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>
  if (!dados) {
    return <p className="flex items-center gap-2 text-sm text-texto-3 py-8 justify-center"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
  }
  if (!calculo) return <p className="text-sm text-texto-3 py-8 text-center">Bem não encontrado.</p>

  const { resumo: r, tempo, linhas } = calculo

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
            <Wallet size={14} className="text-receita" /> Quanto já foi pago
          </h3>
          <Linha label="Valor do bem" valor={r.valorBem} />
          <Linha label="Pago acumulado (sem juros)" valor={r.pagoSemJuros} />
          <Linha label="Pago acumulado (com juros)" valor={r.pagoComJuros} destaque="text-receita font-semibold" />
          <Linha label="Falta pagar" valor={r.faltaPagar} destaque="text-despesa font-semibold" dica="Parcelas em aberto, com juros e descontos" />
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
            <Scale size={14} className="text-texto-2" /> Quanto custou para você
          </h3>
          <Linha label="Pago com recursos próprios" valor={r.proprios} />
          <Linha label="Pago por terceiros" valor={r.terceiros} />
          <Linha label="Devoluções recebidas" valor={r.devolucoes} />
          <Linha label="Custo próprio líquido" valor={r.custoProprioLiquido} destaque="font-semibold" dica="Recursos próprios menos devoluções" />
          <Linha label="Juros pagos" valor={r.jurosPagos} />
          <Linha label="Descontos de antecipação" valor={r.descontos} />
          <Linha label="Custo final até hoje" valor={r.custoFinalRealizado} dica="Valor do bem + juros pagos" />
          <Linha label="Custo final projetado" valor={r.custoFinalProjetado} dica="Valor do bem + juros previstos − descontos" />
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
          <CalendarDays size={14} className="text-texto-2" /> Mês a mês
        </h3>
        {tempo.length === 0
          ? <p className="text-sm text-texto-3 text-center py-4">Nenhum pagamento registrado neste bem.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-borda text-xs text-texto-2">
                    <th className="text-left font-medium py-2 pr-3">Mês</th>
                    <th className="text-right font-medium py-2 px-2">Pago no mês</th>
                    <th className="text-right font-medium py-2 px-2">Pago acumulado</th>
                    <th className="text-right font-medium py-2 px-2">Falta pagar</th>
                    <th className="text-right font-medium py-2 pl-2">Juros acumulados</th>
                  </tr>
                </thead>
                <tbody>
                  {tempo.map(m => (
                    <tr key={m.mes} className="border-b border-borda/60 last:border-0">
                      <td className="py-1.5 pr-3 text-texto-2">{rotuloMes(m.mes)}</td>
                      <td className="py-1.5 px-2 text-right text-texto-1">{fmt(m.pagoNoMes)}</td>
                      <td className="py-1.5 px-2 text-right text-texto-1">{fmt(m.pagoAcumulado)}</td>
                      <td className="py-1.5 px-2 text-right text-texto-1">{fmt(m.faltaPagar)}</td>
                      <td className="py-1.5 pl-2 text-right text-texto-1">{fmt(m.jurosAcumulados)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {linhas.length > 0 && (
        <details className="card">
          <summary className="text-sm font-semibold text-texto-2 cursor-pointer flex items-center gap-2">
            <ListOrdered size={14} className="text-texto-2" /> Lançamentos deste resumo ({linhas.length})
          </summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm min-w-[520px]">
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="border-b border-borda/60 last:border-0">
                    <td className="py-1.5 pr-3 text-texto-2 whitespace-nowrap">{fmtDate(l.data)}</td>
                    <td className="py-1.5 px-2 text-texto-2 whitespace-nowrap">{ROTULO_CLASSE[l.classe]}</td>
                    <td className="py-1.5 px-2 text-texto-3">{l.descricao}</td>
                    <td className="py-1.5 pl-2 text-right text-texto-1 whitespace-nowrap">{fmt(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
