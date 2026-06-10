import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'

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
    <div className="rounded-lg border border-gray-800 bg-gray-900/40">
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

  return (
    <div className="space-y-3">
      {/* 1. Saldo Atual Ciclo */}
      <Section title={`Saldo Atual do Ciclo (${ddmm(b.cycleStart)} a ${ddmm(b.cycleEnd)})`}>
        <Row label="Saldo base (lançamentos efetivados)" value={b.saldoAtual.base} />
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
        {b.finalCiclo.agendamentos.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 pt-1">+ Agendamentos pendentes até {ddmm(b.cycleEnd)}:</p>
            {b.finalCiclo.agendamentos.map((it, i) => (
              <Row key={i} indent label={`• ${it.description}${it.count > 1 ? ` (${it.count}×)` : ''}`} value={it.amount} />
            ))}
          </>
        ) : (
          <p className="text-xs text-gray-600 pt-1">Sem agendamentos pendentes até {ddmm(b.cycleEnd)}.</p>
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
                <Row key={i} indent label={`• ${it.description}${it.count > 1 ? ` (${it.count}×)` : ''}`} value={it.amount} />
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
