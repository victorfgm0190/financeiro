import { useMemo, useState } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Eye, EyeOff, ChevronRight, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmt, fmtDate } from '../components/shared/utils'
import BottomSheet from '../components/shared/BottomSheet'
import { getToken } from '../lib/api'
import { hojeStr } from '../lib/saldos'
import { occEfetiva } from '../lib/fluxoCaixa'
import { criarClassificadores, totaisDoPeriodo, periodoStr } from '../lib/receitasDespesas'
import { gastoEnvelopes, currentCompetencia } from '../lib/envelopes'
import { resolverCards, prefDosCards } from './navegacao'

const OCULTAR_KEY = 'finup:mobile:ocultarValores'
const MASCARA = 'R$ ••••'

// Nome do usuário logado (campo `user` do JWT), com a 1ª letra maiúscula. '' se não houver.
function nomeDoToken() {
  try {
    const payload = JSON.parse(atob(getToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const u = String(payload.user || '').trim()
    return u ? u.charAt(0).toUpperCase() + u.slice(1) : ''
  } catch {
    return ''
  }
}

function lerOcultar() {
  try { return localStorage.getItem(OCULTAR_KEY) === '1' } catch { return false }
}

// Tela Início do mobile. Valores do card verde = os do Painel (saldosPrincipais do App e a mesma
// classificação de receitas/despesas do mês) — nada é recalculado por uma regra nova.
export default function InicioMobile({ modules, irPara, saldosPrincipais }) {
  const { settings, updateSettings } = useApp()
  const [ocultar, setOcultar] = useState(lerOcultar)
  const [personalizar, setPersonalizar] = useState(false)
  const v = (n) => (ocultar ? MASCARA : fmt(n))

  const alternarOcultar = () => {
    setOcultar(o => {
      try { localStorage.setItem(OCULTAR_KEY, o ? '0' : '1') } catch { /* sem storage */ }
      return !o
    })
  }

  const cards = resolverCards(modules, settings?.mobileHomeCards)
  const salvarCards = (lista) => updateSettings({ mobileHomeCards: prefDosCards(lista) })

  const mes = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })
  const nome = nomeDoToken()

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 pt-1">
        <div>
          <p className="text-xs text-gray-500 capitalize">{mes}</p>
          <h1 className="text-xl font-bold text-gray-100">{nome ? `Olá, ${nome}` : 'Olá'}</h1>
        </div>
        <button
          type="button"
          onClick={alternarOcultar}
          aria-label={ocultar ? 'Mostrar valores' : 'Ocultar valores'}
          aria-pressed={ocultar}
          className="w-11 h-11 rounded-full flex items-center justify-center text-gray-400 bg-gray-900 border border-gray-800"
        >
          {ocultar ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      <ResumoCard saldosPrincipais={saldosPrincipais} v={v} />

      {cards.filter(c => c.on).map(({ modulo }) => {
        const Corpo = CORPOS[modulo.id]
        return (
          <section key={modulo.id} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-200">{modulo.cardTitle || modulo.label}</h2>
              <button type="button" onClick={() => irPara(modulo.id)} className="flex items-center gap-0.5 text-xs text-emerald-400 min-h-[44px] -my-3 px-1">
                Ver tudo <ChevronRight size={14} />
              </button>
            </div>
            {Corpo ? <Corpo v={v} /> : <p className="text-xs text-gray-500">Abra {modulo.label} para ver os detalhes.</p>}
          </section>
        )
      })}

      <button
        type="button"
        onClick={() => setPersonalizar(true)}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-dashed border-gray-700 text-sm text-gray-400"
      >
        <SlidersHorizontal size={16} /> Personalizar cards do Início
      </button>

      {personalizar && <PersonalizarCards onClose={() => setPersonalizar(false)} cards={cards} onSalvar={salvarCards} />}
    </div>
  )
}

function ResumoCard({ saldosPrincipais, v }) {
  const { profileAccounts, profileReportTransactions, reserveFunctions, getFinancialPeriod } = useApp()
  // Mesma classificação e período dos KPIs "Receitas do Mês"/"Despesas do Mês" do Painel.
  const cls = useMemo(() => criarClassificadores(reserveFunctions, profileAccounts), [reserveFunctions, profileAccounts])
  const { income, expense } = totaisDoPeriodo(profileReportTransactions, periodoStr(getFinancialPeriod()), cls)

  return (
    <section className="rounded-2xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #0E6B4E 0%, #0B5740 100%)' }}>
      <p className="text-xs text-white/70">Saldo total</p>
      <p className="text-3xl font-extrabold tracking-tight mt-0.5">{v(saldosPrincipais?.saldoAtual ?? 0)}</p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <p className="text-[11px] text-white/70">Entradas do mês</p>
          <p className="text-sm font-semibold">{v(income)}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/70">Saídas do mês</p>
          <p className="text-sm font-semibold">{v(expense)}</p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
        <p className="text-xs text-white/70">Saldo previsto fim do mês</p>
        <p className="text-sm font-bold">{v(saldosPrincipais?.saldoFinalCiclo ?? 0)}</p>
      </div>
    </section>
  )
}

// Reservas: as 2 contas de reserva com maior saldo (mesmo saldo da aba "Contas" de Reservas);
// a barra é a participação de cada uma no total guardado.
function CardReservas({ v }) {
  const { profileAccounts } = useApp()
  const contas = (profileAccounts || []).filter(a => a.isReserva && a.active !== false)
  const total = contas.reduce((s, a) => s + (a.balance || 0), 0)
  const top = [...contas].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 2)
  if (top.length === 0) return <p className="text-xs text-gray-500">Nenhuma conta de reserva.</p>
  return (
    <ul className="space-y-3">
      {top.map(a => {
        const pct = total > 0 ? Math.max(0, Math.min(100, ((a.balance || 0) / total) * 100)) : 0
        return (
          <li key={a.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300 truncate">{a.apelido || a.name}</span>
              <span className="text-gray-100 font-semibold">{v(a.balance || 0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 mt-1.5 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Envelopes: 3 mini-cards (os mais consumidos na competência atual), vermelho se estourado.
function CardEnvelopes({ v }) {
  const { envelopes, profileTransactions, settings } = useApp()
  const startDay = settings?.financialMonthStartDay || 1
  const comp = currentCompetencia(startDay)
  const dados = gastoEnvelopes(envelopes, profileTransactions, comp.year * 12 + comp.month0, startDay)
  const pctDe = (d) => (d.env.limitAmount > 0 ? d.spent / d.env.limitAmount : 0)
  const top = [...dados].sort((a, b) => pctDe(b) - pctDe(a)).slice(0, 3)
  if (top.length === 0) return <p className="text-xs text-gray-500">Nenhum envelope criado.</p>
  return (
    <div className="grid grid-cols-3 gap-2">
      {top.map(d => {
        const estourado = d.spent > d.env.limitAmount
        const restante = d.env.limitAmount - d.spent
        return (
          <div key={d.env.id} className={`rounded-xl p-2.5 border ${estourado ? 'bg-red-500/10 border-red-500/30' : 'bg-gray-800/50 border-gray-700/50'}`}>
            <p className="text-[11px] text-gray-400 truncate">{d.env.name}</p>
            <p className={`text-sm font-semibold mt-0.5 ${estourado ? 'text-red-400' : 'text-gray-100'}`}>{v(Math.abs(restante))}</p>
            <p className={`text-[10px] ${estourado ? 'text-red-400/80' : 'text-gray-500'}`}>{estourado ? 'estourado' : 'restante'}</p>
          </div>
        )
      })}
    </div>
  )
}

// Próximos 7 dias: os 3 agendamentos pendentes mais próximos (próxima ocorrência de cada um,
// como em Agendamentos; vencidos aparecem primeiro, marcados como atrasados).
function CardProximos({ v }) {
  const { profileSchedules, getNextOccurrences } = useApp()
  const hoje = hojeStr()
  const em7 = hojeStr(addDays(parseISO(hoje), 7))
  const itens = []
  for (const s of profileSchedules || []) {
    const orig = getNextOccurrences(s, 1)[0]
    if (!orig) continue
    const { date, amount } = occEfetiva(s, orig)
    if (date <= em7) itens.push({ s, date, amount })
  }
  itens.sort((a, b) => a.date.localeCompare(b.date))
  const top = itens.slice(0, 3)
  if (top.length === 0) return <p className="text-xs text-gray-500">Nada vence nos próximos 7 dias.</p>
  return (
    <ul className="divide-y divide-gray-800">
      {top.map(({ s, date, amount }) => {
        const atrasado = date < hoje
        const entrada = s.transactionType === 'income'
        return (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-gray-200 truncate">{s.description || '(agendamento)'}</p>
              <p className={`text-[11px] ${atrasado ? 'text-red-400' : 'text-gray-500'}`}>{atrasado ? `Atrasado · ${fmtDate(date)}` : fmtDate(date)}</p>
            </div>
            <span className={`text-sm font-semibold whitespace-nowrap ${entrada ? 'text-blue-400' : 'text-orange-400'}`}>
              {entrada ? '+' : '−'}{v(Number(amount) || 0)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Corpo de cada card do Início por id de módulo. Módulo com card: true sem corpo aqui vira um card
// simples com "Ver tudo".
const CORPOS = { reservas: CardReservas, envelopes: CardEnvelopes, agenda: CardProximos }

// Liga/desliga e ordem dos cards. Salva em settings.mobileHomeCards (Neon, configuracoes). Só é
// montado aberto, então sempre começa do que está salvo.
function PersonalizarCards({ onClose, cards, onSalvar }) {
  const [lista, setLista] = useState(cards)

  const mover = (i, d) => setLista(l => {
    const j = i + d
    if (j < 0 || j >= l.length) return l
    const n = [...l]
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
  const alternar = (i) => setLista(l => l.map((c, k) => (k === i ? { ...c, on: !c.on } : c)))

  return (
    <BottomSheet open onClose={onClose} title="Personalizar cards do Início">
      <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800">
        {lista.map((c, i) => (
          <li key={c.modulo.id} className="flex items-center gap-2 px-3 min-h-[56px]">
            <span className="flex-1 text-sm text-gray-200">{c.modulo.cardTitle || c.modulo.label}</span>
            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="w-11 h-11 flex items-center justify-center text-gray-400 disabled:opacity-30">
              <ChevronUp size={18} />
            </button>
            <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} aria-label="Descer" className="w-11 h-11 flex items-center justify-center text-gray-400 disabled:opacity-30">
              <ChevronDown size={18} />
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={c.on}
              aria-label={c.modulo.cardTitle || c.modulo.label}
              onClick={() => alternar(i)}
              className="w-14 h-11 flex items-center justify-center"
            >
              <span className={`relative w-10 h-6 rounded-full transition-colors ${c.on ? 'bg-[#0E6B4E]' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${c.on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => { onSalvar(lista); onClose() }} className="btn-primary w-full min-h-[48px]">
        Salvar
      </button>
    </BottomSheet>
  )
}
