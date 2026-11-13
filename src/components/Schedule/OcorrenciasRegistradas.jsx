import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronDown, ChevronUp, Link2, AlertTriangle } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { historicoOcorrencias, resumoRegistradas, STATUS_OCORRENCIA as ST } from '../../lib/ocorrenciasRegistradas'
import { ehAgendamentoAutomatico } from '../../lib/baixasSemLancamento'
import { useIsMobile } from '../../hooks/useIsMobile'
import Modal from '../shared/Modal'
import TransactionForm from '../Transactions/TransactionForm'
import VincularLancamento from './VincularLancamento'
import { useApp } from '../../context/AppContext'
import { metaBaixaGerada } from '../../lib/scheduleBaixa'

// "Ver ocorrências registradas" do Editar Agendamento: histórico das ocorrências já consumidas
// (pagas, puladas, baixadas) + lançamentos vinculados avulsos. Calculado no front, a partir do
// estado em memória, só quando o usuário abre (lib/ocorrenciasRegistradas.js).
// "Pago em" é sempre a data de um PAGAMENTO (lançamento): baixa sem lançamento mostra "—" e a data
// da ocorrência vai no Status. Baixa sem lançamento (fora agendamentos automáticos) fica em
// destaque, com "Vincular lançamento" e "Desfazer baixa".
const SELO = {
  [ST.PAGA]: { rotulo: '✅ Paga', cls: 'bg-receita/15 text-receita' },
  [ST.PULADA]: { rotulo: '⏭️ Pulada', cls: 'bg-surface-2 text-texto-2' },
  [ST.BAIXADA]: { rotulo: '☑️ Baixada', cls: 'bg-primary/15 text-primary-fg' },
  [ST.AVULSO]: { rotulo: 'Avulso vinculado', cls: 'bg-aviso/15 text-aviso' },
}
const DICA_SEM_LANCAMENTO = 'A parcela foi marcada como paga sem nenhum registro de dinheiro (nenhum lançamento ligado a ela).'

// Resgate ligado: o valor pago inclui o complementar (+) ou a devolução (−) da ocorrência.
const Ajuste = ({ v }) => (v ? <span data-testid="ajuste-resgate" className="block text-[10px] text-texto-3 whitespace-normal">{v > 0 ? 'inclui complementar de ' : 'inclui devolução de '}{fmt(Math.abs(v))}</span> : null)
const Dif = ({ v }) => (v ? <span className={v > 0 ? 'text-despesa' : 'text-receita'}> ({v > 0 ? '+' : '−'}{fmt(Math.abs(v))})</span> : null)

export default function OcorrenciasRegistradas({ schedule, transactions, accounts }) {
  const isMobile = useIsMobile()
  const { schedules: todosAgendamentos, markScheduleRegistered, marcarDataOcorrencia, pode, desvincularLancamento, rateiosByLancamento, desfazerBaixaOcorrencia } = useApp()
  const automatico = ehAgendamentoAutomatico(schedule)
  // Baixa sem lançamento que pede atenção (fora as automáticas e as "pago fora do Finup").
  const orfa = (l) => l.status === ST.BAIXADA && l.semLancamento && !l.pagoFora && !automatico
  // Paga por um lançamento que NÃO foi gerado pelo agendamento (vínculo manual): corrente + Desvincular.
  const vinculada = (l) => l.status === ST.PAGA && l.txId && !transactions.find(t => t.id === l.txId)?.scheduleId
  // Vincular/Desfazer gravam a baixa: só com permissão de editar agendamentos.
  const podeVincular = pode('agendamentos', 'editar')
  const resumo = useMemo(() => resumoRegistradas(schedule, transactions), [schedule, transactions])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [txAberto, setTxAberto] = useState(null)
  const [vinculando, setVinculando] = useState(null) // data baixada sendo vinculada
  const [desfazendo, setDesfazendo] = useState(null) // data baixada aguardando confirmação do Desfazer
  // Montado só depois do 1º clique; recalcula sozinho quando o agendamento muda (ex.: Vincular).
  const dados = useMemo(
    () => (pronto ? historicoOcorrencias(schedule, transactions) : null),
    [pronto, schedule, transactions]
  )
  if (!schedule?.id || !resumo.temAlgo) return null

  const accName = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  const parc = (l) => (l.parcela ? (l.total ? `${l.parcela}/${l.total}` : `${l.parcela}`) : '—')
  const clicavel = (l) => l.status === ST.PAGA || l.status === ST.AVULSO
  const abrirLinha = (l) => {
    if (!clicavel(l)) return
    const tx = transactions.find(t => t.id === l.txId)
    if (tx) setTxAberto(tx)
  }
  const alternar = () => {
    if (aberto) { setAberto(false); return }
    setAberto(true)
    if (pronto) return
    setCarregando(true)
    // Montado só ao abrir; o setTimeout deixa o spinner aparecer antes do cálculo.
    setTimeout(() => { setPronto(true); setCarregando(false) }, 0)
  }
  const contagem = resumo.continua ? `${resumo.registradas} registradas` : `${resumo.registradas} de ${resumo.total ?? '?'}`

  const Selo = ({ l }) => {
    if (l.status === ST.BAIXADA) {
      const texto = orfa(l) ? 'Baixada sem lançamento'
        : automatico && l.semLancamento ? 'Baixada (automática)'
          : `Baixada · ${l.motivo}`
      return (
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${orfa(l) ? 'bg-aviso/15 text-aviso' : SELO[ST.BAIXADA].cls}`}>
          {texto} <span className="opacity-80">— ocorrência de {fmtDate(l.dataRegistro)}</span>
        </span>
      )
    }
    return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${SELO[l.status].cls}`}>{SELO[l.status].rotulo}</span>
  }
  const Corrente = ({ l }) => (vinculada(l) ? (
    <span className="inline-flex items-center gap-1 ml-1.5">
      <Link2 size={11} className="text-primary-fg" aria-label="Vinculada a um lançamento existente">
        <title>Vinculada a um lançamento existente</title>
      </Link2>
      {podeVincular && (
        <button type="button" className="text-[10px] text-texto-2 underline hover:text-texto-1"
          onClick={(e) => { e.stopPropagation(); desvincularLancamento({ scheduleId: schedule.id, data: l.dataRegistro }) }}>
          Desvincular
        </button>
      )}
    </span>
  ) : null)
  // Ações da baixa: Vincular (qualquer baixa sem lançamento casado) e Desfazer (as do usuário).
  const Acoes = ({ l }) => {
    if (l.status !== ST.BAIXADA || !podeVincular || automatico) return null
    const parar = (fn) => (e) => { e.stopPropagation(); fn() }
    return (
      <span className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
        <button type="button" data-testid="vincular-baixa" className="text-[10px] text-primary-fg underline" onClick={parar(() => { setDesfazendo(null); setVinculando(l.dataRegistro) })}>
          Vincular lançamento
        </button>
        {l.semLancamento && (
          <button type="button" data-testid="desfazer-baixa" className="text-[10px] text-texto-2 underline hover:text-texto-1" onClick={parar(() => { setVinculando(null); setDesfazendo(l.dataRegistro) })}>
            Desfazer baixa
          </button>
        )}
      </span>
    )
  }
  const ValorPago = ({ l }) => {
    if (l.valorPago != null) return <>{fmt(l.valorPago)}<Dif v={l.diferenca} /><Ajuste v={l.ajuste} /></>
    if (orfa(l)) {
      return (
        <span data-testid="sem-lancamento" title={DICA_SEM_LANCAMENTO} className="inline-flex items-center gap-1 text-aviso font-medium cursor-help">
          <AlertTriangle size={11} className="shrink-0" /> sem lançamento
        </span>
      )
    }
    return '—'
  }
  const pagoEm = (l) => (l.pagoEm ? fmtDate(l.pagoEm) : '—')
  const contaFav = (l) => (l.accountId ? `${accName(l.accountId)}${l.payee ? ` · ${l.payee}` : ''}` : '—')

  return (
    <div className="sm:col-span-2">
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
                    <div
                      key={i} role={clicavel(l) ? 'button' : undefined} tabIndex={clicavel(l) ? 0 : undefined}
                      onClick={() => abrirLinha(l)} onKeyDown={(e) => { if (e.key === 'Enter') abrirLinha(l) }}
                      className={`w-full text-left p-3 space-y-1 ${clicavel(l) ? 'hover:bg-surface-hover/60 cursor-pointer' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-texto-1">Parc. {parc(l)}</span>
                        <span className="text-right"><Selo l={l} /><Corrente l={l} /></span>
                      </div>
                      <p className="text-xs text-texto-2">
                        {l.vencimento ? `Venc. ${fmtDate(l.vencimento)}` : 'Fora da série'}
                        {l.pagoEm && ` · pago em ${fmtDate(l.pagoEm)}`}
                      </p>
                      <p className="text-xs text-texto-2">
                        {l.valorOriginal != null && <>Original {fmt(l.valorOriginal)} · </>}
                        Pago <ValorPago l={l} />
                      </p>
                      {l.accountId && <p className="text-xs text-texto-3 truncate">{contaFav(l)}</p>}
                      <Acoes l={l} />
                    </div>
                  ))}
                </div>
              ) : (
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col className="w-[2.75rem]" /><col className="w-[5.25rem]" /><col className="w-[5.25rem]" />
                    <col className="w-[5.75rem]" /><col className="w-[6.5rem]" /><col /><col className="w-[30%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-texto-3 text-left border-b border-borda">
                      {['Parc.', 'Vencimento', 'Pago em', 'Valor original', 'Valor pago', 'Conta · Favorecido', 'Status'].map(h => (
                        <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.linhas.map((l, i) => (
                      <tr
                        key={i} onClick={() => abrirLinha(l)}
                        title={clicavel(l) ? 'Abrir o lançamento' : undefined}
                        className={`border-b border-borda/60 last:border-0 align-top ${clicavel(l) ? 'cursor-pointer hover:bg-surface-hover/60' : ''} ${orfa(l) ? 'bg-aviso/5' : ''}`}
                      >
                        <td className="px-2 py-1.5 text-texto-1">{parc(l)}</td>
                        <td className="px-2 py-1.5 text-texto-2">{l.vencimento ? fmtDate(l.vencimento) : '—'}</td>
                        <td className="px-2 py-1.5 text-texto-2">{pagoEm(l)}</td>
                        <td className="px-2 py-1.5 text-texto-2">{l.valorOriginal != null ? fmt(l.valorOriginal) : '—'}</td>
                        <td className="px-2 py-1.5 text-texto-1"><ValorPago l={l} /></td>
                        <td className="px-2 py-1.5 text-texto-2 break-words" title={contaFav(l)}>{contaFav(l)}</td>
                        <td className="px-2 py-1.5"><Selo l={l} /><Corrente l={l} /><Acoes l={l} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Desfazer a baixa escolhida: a ocorrência volta a pendente (confirmação aqui mesmo). */}
              {desfazendo && (
                <div className="px-3 py-2 border-t border-borda flex flex-wrap items-center gap-2 text-xs" data-testid="confirmar-desfazer-baixa">
                  <span className="text-texto-2 flex-1 min-w-[12rem]">
                    Desfazer a baixa da ocorrência de {fmtDate(desfazendo)}? Ela volta a ficar pendente (a pagar).
                  </span>
                  <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => setDesfazendo(null)}>Cancelar</button>
                  <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => { desfazerBaixaOcorrencia(schedule.id, desfazendo); setDesfazendo(null) }}>Desfazer baixa</button>
                </div>
              )}
              {/* Vincular a baixa escolhida a um lançamento existente (grava o meta na hora). */}
              {vinculando && (
                <div className="px-3 py-2 border-t border-borda space-y-1">
                  <p className="text-xs text-texto-2">Ocorrência de {fmtDate(vinculando)} — escolha o lançamento:</p>
                  <VincularLancamento
                    key={vinculando}
                    abertoInicial
                    schedule={schedule}
                    data={vinculando}
                    transactions={transactions}
                    schedules={todosAgendamentos}
                    accounts={accounts}
                    rateios={rateiosByLancamento}
                    onVincular={(txId) => { markScheduleRegistered(schedule.id, vinculando, metaBaixaGerada(txId)); marcarDataOcorrencia(txId, vinculando); setVinculando(null) }}
                  />
                  <button type="button" className="text-[11px] text-texto-3 hover:text-texto-2" onClick={() => setVinculando(null)}>Cancelar</button>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 justify-end px-3 py-2 border-t border-borda text-xs" data-testid="rodape-ocorrencias">
                <span className="text-texto-3" title={dados.previstoDaSerie ? 'Valor original de todas as ocorrências da série (fora as puladas)' : 'Valor original das ocorrências registradas (série sem fim)'}>
                  Total previsto: <span className="text-texto-1 font-medium">{fmt(dados.totalPrevisto)}</span>
                </span>
                <span className="text-texto-3" title="Soma dos lançamentos vinculados">Total pago: <span className="text-texto-1 font-medium">{fmt(dados.totalPago)}</span></span>
                {dados.nSemLancamento > 0 && !automatico && (
                  <span className="text-aviso" title={DICA_SEM_LANCAMENTO}>
                    Baixadas sem lançamento: <span className="font-medium">{dados.nSemLancamento} ({fmt(dados.totalSemLancamento)})</span>
                  </span>
                )}
                {dados.nPagas > 0 && (
                  <span className="text-texto-3" title="Valor pago × valor original das parcelas pagas">Diferença nas pagas: <span className={`font-medium ${dados.diferenca > 0 ? 'text-despesa' : dados.diferenca < 0 ? 'text-receita' : 'text-texto-1'}`}>{dados.diferenca > 0 ? '+' : dados.diferenca < 0 ? '−' : ''}{fmt(Math.abs(dados.diferenca))}</span></span>
                )}
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
