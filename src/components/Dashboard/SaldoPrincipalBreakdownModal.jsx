import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { hojeStr } from '../../lib/saldos'

const rb = v => Math.round(v * 100) / 100

// Dias entre duas datas 'yyyy-mm-dd' (só a data — UTC nos dois lados, sem fuso nem hora).
const diasEntre = (de, ate) => {
  const [y1, m1, d1] = de.split('-').map(Number)
  const [y2, m2, d2] = ate.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// 'yyyy-mm-dd' → 'dd/MM'
const ddmm = (s) => {
  if (!s) return ''
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

// Cor por sinal: positivo azul, negativo laranja.
const sign = (v) => ((v ?? 0) >= 0 ? 'text-sky-400' : 'text-orange-500')

function Val({ v, bold }) {
  return <span className={`${sign(v)} ${bold ? 'font-bold' : ''} tabular-nums whitespace-nowrap`}>{fmt(v)}</span>
}

// Linha simples: rótulo à esquerda, valor à direita.
function Row({ label, value, muted, indent }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-300'} min-w-0`}>{label}</span>
      <Val v={value} />
    </div>
  )
}

function Divider() {
  return <div className="border-t border-gray-700/70 my-1.5" />
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-gray-800 bg-surface/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown size={15} className="text-gray-500 shrink-0" /> : <ChevronRight size={15} className="text-gray-500 shrink-0" />}
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</span>
      </button>
      {open && <div className="px-3 pb-3 space-y-1">{children}</div>}
    </div>
  )
}

export default function SaldoPrincipalBreakdownModal() {
  const { getSaldoPrincipalBreakdown } = useApp()
  const b = getSaldoPrincipalBreakdown()

  // Saldo Final Ciclo: a lista de pendentes do breakdown é só particionada por data. Data de
  // hoje não é atraso. O subtotal dos pendentes fecha por diferença com o total do breakdown —
  // os itens vêm arredondados um a um e o total é arredondado por agendamento, então somar os
  // itens poderia divergir em centavos do Saldo Final Ciclo, que não pode mudar.
  const hoje = hojeStr()
  const atrasados = b.finalCiclo.agendamentos.filter(it => it.date < hoje)
  const pendentes = b.finalCiclo.agendamentos.filter(it => it.date >= hoje)
  const subtotalAtraso = rb(atrasados.reduce((s, it) => s + it.amount, 0))
  const subtotalPendentes = rb(b.finalCiclo.total - b.finalCiclo.saldoAtual - subtotalAtraso)

  return (
    <div className="space-y-3">
      {/* 1. Saldo Atual Ciclo */}
      <Section title={`Saldo Atual do Ciclo (${ddmm(b.cycleStart)} a ${ddmm(b.cycleEnd)})`}>
        <Row label="Saldo base (lançamentos efetivados)" value={b.saldoAtual.base} />
        {/* Detalhe informativo: contas que compõem o Saldo base (badge FC). */}
        {b.saldoAtual.contas?.map((c, i) => (
          <div key={c.id || i} className="flex items-baseline justify-between gap-3 pl-4">
            <span className="text-xs text-gray-400 min-w-0 truncate">• {c.name}</span>
            <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{fmt(c.saldo)}</span>
          </div>
        ))}
        {b.saldoAtual.gerencialTransfers !== 0 && (
          <Row label="+ Transferências gerenciais executadas" value={b.saldoAtual.gerencialTransfers} />
        )}
        <Divider />
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-gray-200">= Saldo Atual Ciclo</span>
          <Val v={b.saldoAtual.total} bold />
        </div>
      </Section>

      {/* 2. Saldo Final Ciclo */}
      <Section title="Saldo Final Ciclo">
        <Row label="Saldo Atual Ciclo" value={b.finalCiclo.saldoAtual} muted />
        {atrasados.length > 0 && (
          <div className="mt-1 rounded-r bg-red-500/10 border-l-2 border-red-500 py-1.5 pr-2 space-y-1">
            <div className="flex items-baseline justify-between gap-3 pl-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 min-w-0">
                <AlertTriangle size={13} className="shrink-0 self-center" />
                + Lançamentos em atraso (pendentes antes de {ddmm(hoje)})
              </span>
              <span className="text-sm font-bold text-red-400 tabular-nums whitespace-nowrap">{fmt(subtotalAtraso)}</span>
            </div>
            {atrasados.map((it, i) => {
              const dias = diasEntre(it.date, hoje)
              return (
                <Row
                  key={i}
                  indent
                  label={`• ${ddmm(it.date)} ${it.description} (${it.occurrenceNumber}/${it.totalOccurrences}) · ${dias} dia${dias !== 1 ? 's' : ''}`}
                  value={it.amount}
                />
              )
            })}
          </div>
        )}
        {pendentes.length > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <span className="text-xs text-gray-500">+ Lançamentos pendentes até {ddmm(b.cycleEnd)}</span>
              <Val v={subtotalPendentes} />
            </div>
            {/* Uma linha por ocorrência, em ordem cronológica (ordenadas em collectSched).
                `ddmm` formata a partir da string; new Date(iso) voltaria um dia no fuso daqui. */}
            {pendentes.map((it, i) => (
              <Row
                key={i}
                indent
                label={`• ${ddmm(it.date)} ${it.description} (${it.occurrenceNumber}/${it.totalOccurrences})`}
                value={it.amount}
              />
            ))}
          </>
        ) : (
          <p className="text-xs text-gray-600 pt-1">Sem lançamentos pendentes até {ddmm(b.cycleEnd)}.</p>
        )}
        <Divider />
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-gray-200">= Saldo Final Ciclo</span>
          <Val v={b.finalCiclo.total} bold />
        </div>
      </Section>

      {/* 3. Saldo Projetado */}
      <Section title="Saldo Projetado">
        <Row label="Saldo Final Ciclo" value={b.projetado.finalCiclo} muted />
        {b.projetado.envelopes.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 pt-1">− Envelopes ativos:</p>
            {b.projetado.envelopes.map((it, i) => (
              <Row key={i} indent label={`• ${it.name} restante`} value={-it.restante} />
            ))}
          </>
        ) : (
          <p className="text-xs text-gray-600 pt-1">Sem envelopes ativos vinculados.</p>
        )}
        <Divider />
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-gray-200">= Saldo Projetado</span>
          <Val v={b.projetado.total} bold />
        </div>
      </Section>

      {/* 4. Saldo Atual Calendário (só modo custom) */}
      {b.atualCalendario && (
        <Section title={`Saldo Atual Calendário (até ${ddmm(b.calendarEnd)})`}>
          <Row label="Saldo Atual Ciclo" value={b.atualCalendario.saldoAtual} muted />
          {b.atualCalendario.lancamentos.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 pt-1">+ Lançamentos além do ciclo:</p>
              {b.atualCalendario.lancamentos.map((it, i) => (
                <Row key={i} indent label={`• ${it.description}`} value={it.amount} />
              ))}
            </>
          ) : (
            <p className="text-xs text-gray-600 pt-1">Sem lançamentos além do ciclo.</p>
          )}
          <Divider />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-gray-200">= Saldo Atual Calendário</span>
            <Val v={b.atualCalendario.total} bold />
          </div>
        </Section>
      )}

      {/* 5. Saldo Final Calendário (só modo custom) */}
      {b.finalCalendario && (
        <Section title="Saldo Final Calendário">
          <Row label="Saldo Atual Calendário" value={b.finalCalendario.atualCalendario} muted />
          {b.finalCalendario.agendamentos.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 pt-1">+ Agendamentos pendentes até {ddmm(b.calendarEnd)}:</p>
              {b.finalCalendario.agendamentos.map((it, i) => (
                <Row
                  key={i}
                  indent
                  label={`• ${ddmm(it.date)} ${it.description} (${it.occurrenceNumber}/${it.totalOccurrences})`}
                  value={it.amount}
                />
              ))}
            </>
          ) : (
            <p className="text-xs text-gray-600 pt-1">Sem agendamentos pendentes até {ddmm(b.calendarEnd)}.</p>
          )}
          <Divider />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-gray-200">= Saldo Final Calendário</span>
            <Val v={b.finalCalendario.total} bold />
          </div>
        </Section>
      )}
    </div>
  )
}
