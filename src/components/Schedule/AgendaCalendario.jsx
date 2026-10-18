import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, CheckCircle } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { occCampos } from '../../lib/camposSerie'
import { montarCalendario, somarMeses, NOMES_MES, DIAS_SEMANA, ladoDoGrupo } from '../../lib/agendaCalendario'

// Visão Calendário de Agendamentos. Só exibição: os itens vêm de lib/agendaCalendario (as mesmas
// linhas e valores da lista) e as ações continuam sendo as da linha da tabela (ScheduleRow) e do
// card de fatura (PayableCard), que o SchedulesTable entrega por render-props:
//   renderLinha(item, { mobile })  → ScheduleRow (<tr>) da ocorrência
//   renderFatura(payable)          → PayableCard
// `status`: 'apagar' | 'provisoes' | 'resgates' | 'pagos' | 'todos'.

const COR = { saida: 'text-despesa', entrada: 'text-receita', neutro: 'text-texto-3' }
const PONTO = { saida: 'bg-despesa', entrada: 'bg-receita', neutro: 'bg-texto-3' }
const SINAL = { saida: '−', entrada: '+', neutro: '↔ ' }

const nomeDia = (d) => {
  const [y, m, dd] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, dd)
  return `${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dt.getDay()]}, ${fmtDate(d)}`
}

// Linhas de total (saída/entrada/neutro) de um bloco { saida, entrada, neutro }. `pago` põe o ✓.
function LinhasTotal({ t, pago = false, compacto = false, comNeutro = true }) {
  const lados = ['saida', 'entrada', ...(comNeutro ? ['neutro'] : [])].filter(l => t[l] > 0)
  if (lados.length === 0) return null
  return lados.map(l => (
    <span key={l} className={`block ${compacto ? 'text-[11px]' : 'text-xs'} font-semibold tabular-nums truncate ${COR[l]} ${pago ? 'opacity-80' : ''}`}>
      {pago && '✓ '}{SINAL[l]}{fmt(t[l])}
    </span>
  ))
}

function ResumoTotais({ totais, status, comNeutro = true }) {
  const mostraAPagar = status !== 'pagos'
  const mostraPago = status === 'pagos' || status === 'todos'
  const vazio = (t) => !t.saida && !t.entrada && !(comNeutro && t.neutro)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {mostraAPagar && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-texto-3 whitespace-nowrap">A pagar</span>
          {vazio(totais.aPagar) ? <span className="text-xs text-texto-3">—</span> : (
            <span className="flex flex-wrap gap-x-3">
              {['saida', 'entrada', ...(comNeutro ? ['neutro'] : [])].filter(l => totais.aPagar[l] > 0).map(l => (
                <span key={l} className={`text-sm font-bold tabular-nums whitespace-nowrap ${COR[l]} ${l === 'neutro' ? 'text-xs font-medium' : ''}`}
                  title={l === 'neutro' ? 'Transferências, aplicações e resgates — fora do total' : undefined}>
                  {SINAL[l]}{fmt(totais.aPagar[l])}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {mostraPago && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-texto-3 whitespace-nowrap">Pago</span>
          {vazio(totais.pago) ? <span className="text-xs text-texto-3">—</span> : (
            <span className="flex flex-wrap gap-x-3">
              {['saida', 'entrada', ...(comNeutro ? ['neutro'] : [])].filter(l => totais.pago[l] > 0).map(l => (
                <span key={l} className={`text-sm font-bold tabular-nums whitespace-nowrap ${COR[l]} ${l === 'neutro' ? 'text-xs font-medium' : ''}`}>
                  ✓ {SINAL[l]}{fmt(totais.pago[l])}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgendaCalendario({
  rows, faturas = [], pagosLinhas = [], status, getNextOccurrences, accounts = [], hoje, isMobile = false,
  renderLinha, renderFatura,
}) {
  const [ym, setYm] = useState(hoje.slice(0, 7))
  const [diaSel, setDiaSel] = useState(hoje)
  const [abertoMobile, setAbertoMobile] = useState(null)
  const toque = useRef(null)

  const cal = useMemo(
    () => montarCalendario({ ym, status, rows, faturas, pagosLinhas, getNextOccurrences, hoje, accounts }),
    [ym, status, rows, faturas, pagosLinhas, getNextOccurrences, hoje, accounts],
  )
  const [anoNum, mesNum] = ym.split('-').map(Number)

  const irPara = (n) => {
    const novo = somarMeses(ym, n)
    setYm(novo)
    // Mantém um dia do mês novo selecionado: hoje, se cair nele; senão o dia 1.
    setDiaSel(hoje.startsWith(novo) ? hoje : `${novo}-01`)
    setAbertoMobile(null)
  }
  const irHoje = () => { setYm(hoje.slice(0, 7)); setDiaSel(hoje); setAbertoMobile(null) }
  const escolherDia = (d) => {
    setDiaSel(d)
    setAbertoMobile(null)
    if (!d.startsWith(ym)) setYm(d.slice(0, 7))
  }

  // Deslizar na grade (celular) troca de mês.
  const onTouchStart = (e) => { const t = e.touches[0]; toque.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e) => {
    const ini = toque.current
    toque.current = null
    if (!ini) return
    const t = e.changedTouches[0]
    const dx = t.clientX - ini.x
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - ini.y) * 1.5) irPara(dx < 0 ? 1 : -1)
  }

  const doDia = cal.dias.get(diaSel) || { itens: [], totais: null }
  const faturasDia = doDia.itens.filter(i => i.fatura)
  const agendDia = doDia.itens.filter(i => !i.fatura && !i.pago)
  const pagosDia = doDia.itens.filter(i => i.pago)

  const cabecalho = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => irPara(-1)} className="p-1.5 rounded-md text-texto-2 hover:bg-surface-hover" aria-label="Mês anterior" title="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <h3 className="min-w-[9.5rem] text-center text-sm font-semibold text-texto-1">{NOMES_MES[mesNum - 1]} {anoNum}</h3>
        <button type="button" onClick={() => irPara(1)} className="p-1.5 rounded-md text-texto-2 hover:bg-surface-hover" aria-label="Próximo mês" title="Próximo mês">
          <ChevronRight size={16} />
        </button>
        <button type="button" onClick={irHoje} className="btn-secondary ml-1 py-1 px-2.5 text-xs">Hoje</button>
      </div>
      {!isMobile && <ResumoTotais totais={cal.totais} status={status} />}
    </div>
  )

  const painelDia = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h4 className="text-sm font-semibold text-texto-1">{nomeDia(diaSel)}</h4>
        {doDia.totais
          ? <div className="flex items-baseline gap-2"><span className="text-xs text-texto-3">Total do dia</span><ResumoTotais totais={doDia.totais} status={status} /></div>
          : <span className="text-xs text-texto-3">Nada neste dia</span>}
      </div>
      {faturasDia.map(i => <div key={i.key}>{renderFatura(i.fatura)}</div>)}
      {agendDia.length > 0 && (isMobile ? (
        <div className="card p-0 overflow-hidden">
          {agendDia.map(i => {
            const aberto = abertoMobile === i.key
            const oc = i.proxima ? occCampos(i.schedule, i.ocorrencia) : i.schedule
            return (
              <div key={i.key} className={`border-b border-borda/60 last:border-0 ${i.proxima ? '' : 'opacity-60'}`}>
                <button type="button" onClick={() => setAbertoMobile(aberto ? null : i.key)} aria-expanded={aberto}
                  className="w-full min-h-[52px] flex items-center gap-3 px-3 py-2 text-left active:bg-surface-hover/40">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-texto-1 truncate">{oc.description || i.schedule.description || '(agendamento)'}</span>
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {i.atrasado && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-perigo-bg text-perigo">⚠ Atrasado</span>}
                      {!i.proxima && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-texto-3">Antes, efetive a de {fmtDate(i.antesDe).slice(0, 5)}</span>}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${COR[ladoDoGrupo(i.grupo)]}`}>{fmt(i.amount)}</span>
                  {aberto ? <ChevronDown size={16} className="text-texto-3 shrink-0" /> : <ChevronRight size={16} className="text-texto-3 shrink-0" />}
                </button>
                {aberto && (
                  <div className="bg-surface/40 border-t border-borda/60 overflow-x-auto">
                    <table className="w-full text-sm"><tbody>{renderLinha(i, { mobile: true })}</tbody></table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda">
                  <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium whitespace-nowrap">Data</th>
                  <th className="text-left px-2 py-2.5 text-xs text-texto-2 font-medium whitespace-nowrap w-[70px]" title="Tipo de documento">Doc.</th>
                  <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium w-full min-w-[200px]">Descrição</th>
                  <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium hidden md:table-cell">Categoria</th>
                  <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium hidden min-[1440px]:table-cell">Favorecido</th>
                  <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium">Valor</th>
                  <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium hidden min-[1440px]:table-cell whitespace-nowrap w-24">Frequência</th>
                  <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium whitespace-nowrap w-px">Ações</th>
                </tr>
              </thead>
              <tbody>{agendDia.map(i => renderLinha(i, { mobile: false }))}</tbody>
            </table>
          </div>
        </div>
      ))}
      {pagosDia.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <h5 className="px-3 py-2 text-[11px] uppercase tracking-wide text-texto-3 border-b border-borda/60">Pagos neste dia</h5>
          {pagosDia.map(i => (
            <div key={i.key} className="flex items-center gap-3 px-3 py-2 border-b border-borda/60 last:border-0">
              <CheckCircle size={14} className="text-primary-fg shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-texto-1 truncate">{i.linhaPaga.description || i.schedule?.description || '(agendamento)'}</span>
                <span className="text-[11px] text-texto-3">
                  {i.semLancamento ? 'Baixado sem lançamento — fora do total' : `Pago em ${fmtDate(i.data)}`}
                  {i.linhaPaga.vencimento ? ` · vencia ${fmtDate(i.linhaPaga.vencimento)}` : ''}
                </span>
              </span>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${COR[ladoDoGrupo(i.grupo)]}`}>{fmt(i.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-3 sm:p-4">
        {cabecalho}
        {isMobile && <ResumoTotais totais={cal.totais} status={status} />}
        <div onTouchStart={isMobile ? onTouchStart : undefined} onTouchEnd={isMobile ? onTouchEnd : undefined} className="select-none" style={isMobile ? { touchAction: 'pan-y' } : undefined}>
          <div className="grid grid-cols-7 gap-px mb-1">
            {DIAS_SEMANA.map(d => <div key={d} className="text-center text-[11px] font-medium uppercase tracking-wide text-texto-3 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-borda/60 rounded-lg overflow-hidden border border-borda/60" role="grid" aria-label={`${NOMES_MES[mesNum - 1]} ${anoNum}`}>
            {cal.semanas.flat().map(({ data, doMes }) => {
              const info = cal.dias.get(data)
              const t = info?.totais
              const ehHoje = data === hoje
              const sel = data === diaSel
              const num = Number(data.slice(8))
              const lados = t ? ['saida', 'entrada', 'neutro'].filter(l => t.aPagar[l] > 0 || t.pago[l] > 0) : []
              return (
                <button
                  key={data}
                  type="button"
                  role="gridcell"
                  aria-selected={sel}
                  aria-label={`${fmtDate(data)}${t ? ` — ${t.qtd} ite${t.qtd !== 1 ? 'ns' : 'm'}` : ''}${t?.atrasados ? `, ${t.atrasados} atrasado${t.atrasados !== 1 ? 's' : ''}` : ''}`}
                  onClick={() => escolherDia(data)}
                  className={`relative flex flex-col justify-start text-left bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary
                    ${isMobile ? 'h-12 px-1 py-1' : 'min-h-[92px] px-1.5 py-1.5'}
                    ${doMes ? '' : 'opacity-45'}
                    ${sel ? 'bg-primary/10 ring-2 ring-inset ring-primary/60' : 'hover:bg-surface-hover/50'}`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className={`inline-flex items-center justify-center text-xs tabular-nums rounded-full ${isMobile ? 'w-6 h-6' : 'w-6 h-6'}
                      ${ehHoje ? 'bg-primary text-white font-bold' : 'text-texto-2 font-medium'}`}>{num}</span>
                    {t?.atrasados > 0 && <AlertTriangle size={isMobile ? 11 : 12} className="text-perigo shrink-0" aria-hidden="true" />}
                  </span>
                  {t && (isMobile ? (
                    <span className="flex justify-center gap-1 mt-1" aria-hidden="true">
                      {lados.map(l => <span key={l} className={`w-1.5 h-1.5 rounded-full ${PONTO[l]}`} />)}
                    </span>
                  ) : (
                    <span className="block mt-0.5 space-y-0">
                      {status !== 'pagos' && <LinhasTotal t={t.aPagar} compacto />}
                      {(status === 'pagos' || status === 'todos') && <LinhasTotal t={t.pago} pago compacto />}
                      <span className="block text-[10px] text-texto-3">{t.qtd} ite{t.qtd !== 1 ? 'ns' : 'm'}</span>
                    </span>
                  ))}
                </button>
              )
            })}
          </div>
          {isMobile && <p className="text-[10px] text-texto-3 text-center mt-1.5">Deslize para trocar de mês</p>}
        </div>
      </div>
      {painelDia}
    </div>
  )
}
