import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MousePointer2 } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { occCampos } from '../../lib/camposSerie'
import { ehSintetico } from '../../lib/tiposDocumento'
import { agruparPorSemana, particionarAgenda, pagosRecentes, totalAPagarNoMes } from '../../lib/agendaMobile'

// Agenda no celular: abas Pendentes | Atrasados | Pagos, itens agrupados por semana, pill de
// status e "Total a pagar no mês" no cabeçalho. Só exibição — as ações continuam sendo as da
// linha da tabela (ScheduleRow), que aparece ao tocar no item via `renderDetalhe(row)`.

const ABAS = [
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'pagos', label: 'Pagos' },
]

const PILL = {
  atrasado:   { label: '⚠ Atrasado', cls: 'bg-perigo-bg text-perigo' },
  pendente:   { label: 'Pendente',   cls: 'bg-surface-2 text-texto-2' },
  pago:       { label: '✓ Pago',     cls: 'bg-primary/15 text-primary-fg' },
  concluido:  { label: 'Concluído',  cls: 'bg-surface-hover/60 text-texto-2' },
  confirmado: { label: 'Confirmado', cls: 'bg-primary/15 text-primary-fg' },
}

// Mesma regra do canConfirm de Agendamentos: automação pura não tem confirmação.
const podeConfirmar = (s) => s.tipo !== 'gerencial_devolucao' && s.tipo !== 'resgate_reserva'

function Pill({ tipo }) {
  const p = PILL[tipo]
  return <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${p.cls}`}>{p.label}</span>
}

function corValor(s) {
  if (s.transactionType === 'income') return 'text-receita'
  if (s.transactionType === 'expense') return 'text-despesa'
  return 'text-texto-2'
}

function Item({ id, aberto, onToggle, descricao, data, valor, schedule, pills, detalhe }) {
  return (
    <div className="border-b border-borda/60 last:border-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={aberto}
        className="w-full min-h-[52px] flex items-center gap-3 px-3 py-2 text-left active:bg-surface-hover/40"
      >
        <span className="w-10 shrink-0 text-xs text-texto-2 tabular-nums">{data ? fmtDate(data).slice(0, 5) : '—'}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-texto-1 truncate">{descricao}</span>
          <span className="flex flex-wrap gap-1 mt-0.5">{pills.map(p => <Pill key={p} tipo={p} />)}</span>
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${corValor(schedule)}`}>{fmt(valor)}</span>
        {aberto ? <ChevronDown size={16} className="text-texto-3 shrink-0" /> : <ChevronRight size={16} className="text-texto-3 shrink-0" />}
      </button>
      {aberto && <div className="bg-surface/40 border-t border-borda/60 overflow-x-auto">{detalhe}</div>}
    </div>
  )
}

export default function AgendaMobile({ rows, schedules, getNextOccurrences, today, renderDetalhe, onSelecionar }) {
  const [aba, setAba] = useState('pendentes')
  const [aberto, setAberto] = useState(null)
  const toggle = (id) => setAberto(a => (a === id ? null : id))

  const { pendentes, atrasados, concluidos } = useMemo(() => particionarAgenda(rows, today), [rows, today])
  const pagos = useMemo(() => pagosRecentes(schedules, today), [schedules, today])
  const totalMes = useMemo(
    () => totalAPagarNoMes(schedules, getNextOccurrences, today, s => !ehSintetico(s)),
    [schedules, getNextOccurrences, today],
  )
  const rowPorId = useMemo(() => new Map(rows.map(r => [r.schedule.id, r])), [rows])
  // Detalhe de um pago: a linha do agendamento na tabela (histórico, estornar, editar…). Membro
  // de série colapsada não tem linha própria — monta uma com a próxima ocorrência dele.
  const rowDe = (s) => rowPorId.get(s.id) || { schedule: s, nextDate: getNextOccurrences(s, 1)[0] || null, futureItems: [] }

  const contagem = { pendentes: pendentes.length, atrasados: atrasados.length, pagos: pagos.length }

  const itemPendente = (r, atrasado) => {
    const s = r.schedule
    const oc = occCampos(s, r.nextDate)
    const pills = [atrasado ? 'atrasado' : 'pendente']
    if (podeConfirmar(s) && s.confirmado) pills.push('confirmado')
    return (
      <Item
        key={s.id} id={s.id} aberto={aberto === s.id} onToggle={toggle}
        descricao={oc.description || s.description || '(agendamento)'}
        data={r.displayDate} valor={Number(occEfetiva(s, r.nextDate).amount) || 0}
        schedule={s} pills={pills} detalhe={aberto === s.id ? renderDetalhe(r) : null}
      />
    )
  }

  const semanas = (lista, atrasado) => agruparPorSemana(lista, r => r.displayDate).map(sem => (
    <section key={sem.key} className="card p-0 overflow-hidden">
      <h3 className="px-3 py-2 text-[11px] uppercase tracking-wide text-texto-3 border-b border-borda/60">{sem.label}</h3>
      {sem.items.map(r => itemPendente(r, atrasado))}
    </section>
  ))

  let conteudo
  if (aba === 'pendentes') {
    conteudo = pendentes.length ? semanas(pendentes, false) : <Vazio texto="Nenhum agendamento pendente." />
  } else if (aba === 'atrasados') {
    conteudo = atrasados.length ? semanas(atrasados, true) : <Vazio texto="Nada em atraso." />
  } else {
    const grupos = agruparPorSemana(pagos, p => p.dataEfetiva, { desc: true })
    conteudo = (
      <>
        {grupos.length === 0 && <Vazio texto="Nenhum pagamento nos últimos 60 dias." />}
        {grupos.map(sem => (
          <section key={sem.key} className="card p-0 overflow-hidden">
            <h3 className="px-3 py-2 text-[11px] uppercase tracking-wide text-texto-3 border-b border-borda/60">{sem.label}</h3>
            {sem.items.map(p => {
              const id = `pago:${p.schedule.id}@${p.date}`
              return (
                <Item
                  key={id} id={id} aberto={aberto === id} onToggle={toggle}
                  descricao={occCampos(p.schedule, p.date).description || p.schedule.description || '(agendamento)'}
                  data={p.dataEfetiva} valor={p.amount} schedule={p.schedule} pills={['pago']}
                  detalhe={aberto === id ? renderDetalhe(rowDe(p.schedule)) : null}
                />
              )
            })}
          </section>
        ))}
        {concluidos.length > 0 && (
          <section className="card p-0 overflow-hidden">
            <h3 className="px-3 py-2 text-[11px] uppercase tracking-wide text-texto-3 border-b border-borda/60">Concluídos ({concluidos.length})</h3>
            {concluidos.map(r => {
              const id = `fim:${r.schedule.id}`
              return (
                <Item
                  key={id} id={id} aberto={aberto === id} onToggle={toggle}
                  descricao={r.schedule.description || '(agendamento)'}
                  data={null} valor={Number(r.schedule.amount) || 0} schedule={r.schedule} pills={['concluido']}
                  detalhe={aberto === id ? renderDetalhe(r) : null}
                />
              )
            })}
          </section>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between gap-3 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-texto-3">Total a pagar no mês</p>
          <p className="text-xl font-bold text-despesa tabular-nums">{fmt(totalMes)}</p>
        </div>
        {onSelecionar && (
          <button type="button" onClick={onSelecionar} className="btn-amber min-h-[44px]">
            <MousePointer2 size={13} /> Selecionar
          </button>
        )}
      </div>

      <div role="tablist" className="grid grid-cols-3 gap-1 p-1 bg-surface rounded-xl border border-borda">
        {ABAS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={aba === t.id}
            onClick={() => { setAba(t.id); setAberto(null) }}
            className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
              aba === t.id ? 'bg-primary text-white' : 'text-texto-2'
            }`}
          >
            {t.label}
            {contagem[t.id] > 0 && (
              <span className={`ml-1 text-[11px] ${aba === t.id ? 'text-white/80' : t.id === 'atrasados' ? 'text-perigo' : 'text-texto-3'}`}>
                ({contagem[t.id]})
              </span>
            )}
          </button>
        ))}
      </div>

      {conteudo}
    </div>
  )
}

function Vazio({ texto }) {
  return <div className="card text-center py-8 text-sm text-texto-3">{texto}</div>
}
