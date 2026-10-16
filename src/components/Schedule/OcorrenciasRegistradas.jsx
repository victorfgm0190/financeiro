import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { historicoOcorrencias, resumoRegistradas, STATUS_OCORRENCIA as ST } from '../../lib/ocorrenciasRegistradas'
import { useIsMobile } from '../../hooks/useIsMobile'
import Modal from '../shared/Modal'
import TransactionForm from '../Transactions/TransactionForm'

// "Ver ocorrências registradas" do Editar Agendamento: histórico das ocorrências já consumidas
// (pagas, puladas, baixadas) + lançamentos vinculados avulsos. Calculado no front, a partir do
// estado em memória, só quando o usuário abre (lib/ocorrenciasRegistradas.js). Somente leitura.
const SELO = {
  [ST.PAGA]: { rotulo: '✅ Paga', cls: 'bg-receita/15 text-receita' },
  [ST.PULADA]: { rotulo: '⏭️ Pulada', cls: 'bg-surface-2 text-texto-2' },
  [ST.BAIXADA]: { rotulo: '☑️ Baixada', cls: 'bg-primary/15 text-primary-fg' },
  [ST.AVULSO]: { rotulo: 'Avulso vinculado', cls: 'bg-aviso/15 text-aviso' },
}

const Selo = ({ l }) => (
  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${SELO[l.status].cls}`}>
    {SELO[l.status].rotulo}{l.status === ST.BAIXADA && l.motivo ? ` · ${l.motivo}` : ''}
  </span>
)
const Dif = ({ v }) => (v ? <span className={v > 0 ? 'text-despesa' : 'text-receita'}> ({v > 0 ? '+' : '−'}{fmt(Math.abs(v))})</span> : null)

export default function OcorrenciasRegistradas({ schedule, transactions, accounts }) {
  const isMobile = useIsMobile()
  const resumo = useMemo(() => resumoRegistradas(schedule, transactions), [schedule, transactions])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState(null)
  const [txAberto, setTxAberto] = useState(null)
  if (!schedule?.id || !resumo.temAlgo) return null

  const accName = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  const parc = (l) => (l.parcela ? (l.total ? `${l.parcela}/${l.total}` : `${l.parcela}`) : '—')
  const abrirLinha = (l) => {
    if (l.status !== ST.PAGA && l.status !== ST.AVULSO) return
    const tx = transactions.find(t => t.id === l.txId)
    if (tx) setTxAberto(tx)
  }
  const alternar = () => {
    if (aberto) { setAberto(false); return }
    setAberto(true)
    setCarregando(true)
    // Montado só ao abrir; o setTimeout deixa o spinner aparecer antes do cálculo.
    setTimeout(() => {
      setDados(historicoOcorrencias(schedule, transactions))
      setCarregando(false)
    }, 0)
  }
  const contagem = resumo.continua ? `${resumo.registradas} registradas` : `${resumo.registradas} de ${resumo.total ?? '?'}`
  const clicavel = (l) => l.status === ST.PAGA || l.status === ST.AVULSO

  return (
    <div className="col-span-2">
      <button type="button" onClick={alternar} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
        📋 Ver ocorrências registradas ({contagem})
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {aberto && (
        <div className="mt-2 border border-borda-forte rounded-lg">
          {carregando || !dados ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-texto-3">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          ) : dados.linhas.length === 0 ? (
            <p className="text-xs text-texto-3 p-3">Nenhuma ocorrência registrada.</p>
          ) : (
            <>
              {isMobile ? (
                <div className="divide-y divide-borda">
                  {dados.linhas.map((l, i) => (
                    <button
                      key={i} type="button" onClick={() => abrirLinha(l)} disabled={!clicavel(l)}
                      className={`w-full text-left p-3 space-y-1 ${clicavel(l) ? 'hover:bg-surface-hover/60' : 'cursor-default'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-texto-1">Parc. {parc(l)}</span>
                        <Selo l={l} />
                      </div>
                      <p className="text-xs text-texto-2">
                        {l.vencimento ? `Venc. ${fmtDate(l.vencimento)}` : 'Fora da série'}
                        {l.pagoEm && ` · pago em ${fmtDate(l.pagoEm)}`}
                        {!l.pagoEm && l.status === ST.BAIXADA && ` · baixada em ${fmtDate(l.dataRegistro)}`}
                      </p>
                      <p className="text-xs text-texto-2">
                        {l.valorOriginal != null && <>Original {fmt(l.valorOriginal)}</>}
                        {l.valorPago != null && <> · Pago {fmt(l.valorPago)}<Dif v={l.diferenca} /></>}
                      </p>
                      {l.accountId && <p className="text-xs text-texto-3 truncate">{accName(l.accountId)}{l.payee ? ` · ${l.payee}` : ''}</p>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-texto-3 text-left border-b border-borda">
                        {['Parc.', 'Vencimento', 'Pago em', 'Valor original', 'Valor pago', 'Conta', 'Favorecido', 'Status'].map(h => (
                          <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dados.linhas.map((l, i) => (
                        <tr
                          key={i} onClick={() => abrirLinha(l)}
                          title={clicavel(l) ? 'Abrir o lançamento' : undefined}
                          className={`border-b border-borda/60 last:border-0 ${clicavel(l) ? 'cursor-pointer hover:bg-surface-hover/60' : ''}`}
                        >
                          <td className="px-2 py-1.5 text-texto-1 whitespace-nowrap">{parc(l)}</td>
                          <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{l.vencimento ? fmtDate(l.vencimento) : '—'}</td>
                          <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">
                            {l.pagoEm ? fmtDate(l.pagoEm) : l.status === ST.BAIXADA ? <span className="text-texto-3">baixada {fmtDate(l.dataRegistro)}</span> : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{l.valorOriginal != null ? fmt(l.valorOriginal) : '—'}</td>
                          <td className="px-2 py-1.5 text-texto-1 whitespace-nowrap">{l.valorPago != null ? <>{fmt(l.valorPago)}<Dif v={l.diferenca} /></> : '—'}</td>
                          <td className="px-2 py-1.5 text-texto-2 max-w-[8rem] truncate">{l.accountId ? accName(l.accountId) : '—'}</td>
                          <td className="px-2 py-1.5 text-texto-2 max-w-[9rem] truncate">{l.payee || '—'}</td>
                          <td className="px-2 py-1.5"><Selo l={l} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end px-3 py-2 border-t border-borda text-xs">
                <span className="text-texto-3">Total pago: <span className="text-texto-1 font-medium">{fmt(dados.totalPago)}</span></span>
                <span className="text-texto-3" title="Valor original das parcelas pagas">Total previsto: <span className="text-texto-1 font-medium">{fmt(dados.totalPrevisto)}</span></span>
                <span className="text-texto-3">Diferença: <span className={`font-medium ${dados.diferenca > 0 ? 'text-despesa' : dados.diferenca < 0 ? 'text-receita' : 'text-texto-1'}`}>{dados.diferenca > 0 ? '+' : dados.diferenca < 0 ? '−' : ''}{fmt(Math.abs(dados.diferenca))}</span></span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Portal: o painel do modal do agendamento tem transform, que recortaria um modal fixo aninhado. */}
      {txAberto && createPortal(
        <Modal open onClose={() => setTxAberto(null)} title="Editar Lançamento">
          <TransactionForm initial={txAberto} onClose={() => setTxAberto(null)} />
        </Modal>,
        document.body,
      )}
    </div>
  )
}
