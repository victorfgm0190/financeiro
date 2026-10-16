import { BannerPerfisSemContaCentral } from '../components/shared/ContaCentralAvisos'
import { useMemo, useState } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Eye, EyeOff, ChevronRight, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmt, fmtSinal, fmtDate } from '../components/shared/utils'
import BottomSheet from '../components/shared/BottomSheet'
import { getSessao } from '../lib/api'
import { hojeStr } from '../lib/saldos'
import { occEfetiva } from '../lib/fluxoCaixa'
import { criarClassificadores, totaisDoPeriodo, periodoStr } from '../lib/receitasDespesas'
import { gastoEnvelopes, currentCompetencia } from '../lib/envelopes'
import { resolverCards, prefDosCards } from './navegacao'
import { gravarPreferencias } from '../lib/preferenciasUi'
import DespesasMobile from './DespesasMobile'
import { useSaldosProntos } from '../hooks/useSaldosProntos'
import { SkeletonVal, SkeletonLinhas } from './Carregando'
import PerfilChips from './PerfilChips'
import { MASCARA, lerOcultar, gravarOcultar } from './ocultarValores'
import TelaCheia from './TelaCheia'
import SaldoPrincipalBreakdownModal from '../components/Dashboard/SaldoPrincipalBreakdownModal'
import { saldoTotalContas } from '../lib/saldoTotal'


// Primeiro nome do usuário logado (nome do cadastro na sessão), com a 1ª letra maiúscula.
// '' se não houver.
function primeiroNome() {
  const n = String(getSessao()?.nome || '').trim().split(/\s+/)[0] || ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

const maiusculaInicial = (t) => t.charAt(0).toUpperCase() + t.slice(1)

// Tela Início do mobile. Valores do card verde = os do Painel (saldosPrincipais do App e a mesma
// classificação de receitas/despesas do mês) — nada é recalculado por uma regra nova.
export default function InicioMobile({ modules, irPara, saldosPrincipais }) {
  const { settings, updateSettings } = useApp()
  const [ocultar, setOcultar] = useState(lerOcultar)
  const [personalizar, setPersonalizar] = useState(false)
  const [comoChegamos, setComoChegamos] = useState(false)
  // Enquanto o recálculo automático não termina (mesmo sinal do Painel), nenhum número aparece:
  // o resumo mostra shimmer e os cards, linhas de placeholder.
  const carregando = useSaldosProntos() === 'carregando'
  const v = (n) => (ocultar ? MASCARA : fmt(n))

  const alternarOcultar = () => {
    setOcultar(o => {
      gravarOcultar(!o)
      return !o
    })
  }

  const cards = resolverCards(modules, settings?.mobileHomeCards)
  const salvarCards = (lista) =>
    updateSettings({ mobileHomeCards: gravarPreferencias(settings?.mobileHomeCards, { cards: prefDosCards(lista) }) })

  const mes = maiusculaInicial(format(new Date(), "MMMM 'de' yyyy", { locale: ptBR }))
  const nome = primeiroNome()

  return (
    <div className="space-y-4">
      <BannerPerfisSemContaCentral />
      <header className="flex items-start justify-between gap-3 pt-1">
        <div>
          <p className="text-xs text-texto-3">{mes}</p>
          <h1 className="text-xl font-bold text-texto-1">{nome ? `Olá, ${nome}` : 'Olá'}</h1>
        </div>
        <button
          type="button"
          onClick={alternarOcultar}
          aria-label={ocultar ? 'Mostrar valores' : 'Ocultar valores'}
          aria-pressed={ocultar}
          className="w-11 h-11 rounded-full flex items-center justify-center text-texto-2 bg-surface border border-borda"
        >
          {ocultar ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      <PerfilChips />

      <ResumoCard saldosPrincipais={saldosPrincipais} v={v} ocultar={ocultar} carregando={carregando} onAbrir={() => setComoChegamos(true)} />

      {/* "Como chegamos aqui": o MESMO componente do Painel desktop, em tela cheia no celular. */}
      <TelaCheia open={comoChegamos} onClose={() => setComoChegamos(false)} title="Como chegamos aqui">
        <SaldoPrincipalBreakdownModal compacto oculto={ocultar} />
      </TelaCheia>

      {cards.filter(c => c.on).map(({ modulo }) => {
        const Corpo = CORPOS[modulo.id]
        return (
          <section key={modulo.id} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-texto-1">{modulo.cardTitle || modulo.label}</h2>
              <button type="button" onClick={() => irPara(modulo.id)} className="flex items-center gap-0.5 text-xs text-primary-fg min-h-[44px] -my-3 px-1">
                Ver tudo <ChevronRight size={14} />
              </button>
            </div>
            {carregando
              ? <SkeletonLinhas />
              : Corpo ? <Corpo v={v} oculto={ocultar} card /> : <p className="text-xs text-texto-3">Abra {modulo.label} para ver os detalhes.</p>}
          </section>
        )
      })}

      <button
        type="button"
        onClick={() => setPersonalizar(true)}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-dashed border-borda-forte text-sm text-texto-2"
      >
        <SlidersHorizontal size={16} /> Personalizar cards do Início
      </button>

      {personalizar && <PersonalizarCards onClose={() => setPersonalizar(false)} cards={cards} onSalvar={salvarCards} />}
    </div>
  )
}

// Card verde = card "Saldo Principal" + KPIs do Painel desktop, com os mesmos nomes e fontes:
// Principal (saldosPrincipais), Final Ciclo · Projetado · Atual Cal. · Final Cal. (o MESMO retorno
// de getSaldoPrincipal() que o card do desktop lê, com o perfil ativo), Receitas/Despesas
// do Mês (totaisDoPeriodo) e Saldo Total (saldoTotalContas). Tocar abre o "Como chegamos aqui".
function ResumoCard({ saldosPrincipais, v: valor, ocultar, carregando, onAbrir }) {
  const { profileAccounts, profileReportTransactions, reserveFunctions, getFinancialPeriod, getSaldoPrincipal } = useApp()
  // Mesma classificação e período dos KPIs "Receitas do Mês"/"Despesas do Mês" do Painel.
  const cls = useMemo(() => criarClassificadores(reserveFunctions, profileAccounts), [reserveFunctions, profileAccounts])
  const periodo = getFinancialPeriod()
  const { income, expense } = totaisDoPeriodo(profileReportTransactions, periodoStr(periodo), cls)
  const b = useMemo(() => getSaldoPrincipal(), [getSaldoPrincipal])
  const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')
  // Mesmas linhas e regras do card do desktop (DashboardPanel cicloRows): Atual Cal./Final Cal.
  // só no modo custom.
  const ciclo = [
    { label: `Final Ciclo (até ${ddmm(b.cycleEnd)})`, val: b.finalCiclo?.total },
    { label: 'Projetado', val: b.projetado?.total },
    ...(b.mode === 'custom' ? [
      { label: `Atual Cal. (até ${ddmm(b.calendarEnd)})`, val: b.atualCalendario?.total },
      { label: 'Final Cal.', val: b.finalCalendario?.total },
    ] : []),
  ].filter(r => r.val != null)
  // Shimmer claro sobre o verde (o .skeleton padrão é escuro).
  const v = (n, tam = 'w-24 h-4') => (carregando ? <SkeletonVal className={`${tam} my-0.5 opacity-40`} /> : valor(n))
  // Valores do ciclo com sinal (decisão 10 do tema: negativo = "−R$" + text-despesa). O token de
  // despesa não tem contraste sobre o verde fixo do card (D7), então o negativo vai num selo
  // bg-surface — o par surface/despesa é o mesmo do Painel nos dois temas.
  const vCiclo = (n) => {
    if (carregando) return <SkeletonVal className="w-20 h-4 my-0.5 opacity-40" />
    if (ocultar) return MASCARA
    if (n < 0) return <span className="inline-block rounded-md px-1.5 -mx-1.5 bg-surface text-despesa">{fmtSinal(n)}</span>
    return fmtSinal(n)
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label="Saldo principal — ver como chegamos aqui"
      className="relative w-full text-left rounded-2xl p-5 text-white shadow-lg"
      style={{ background: 'linear-gradient(135deg, #0E6B4E 0%, #0B5740 100%)' }}
    >
      <ChevronRight size={18} aria-hidden="true" className="absolute top-4 right-4 text-white/60" />
      <p className="text-xs text-white/80">
        Saldo principal{saldosPrincipais?.semContasFC ? ' · nenhuma conta marcada como FC neste perfil' : ''}
      </p>
      <p className="text-3xl font-extrabold tracking-tight mt-0.5">{v(saldosPrincipais?.saldoAtual ?? 0, 'w-40 h-8')}</p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <p className="text-[11px] text-white/80">Receitas do mês</p>
          <p className="text-sm font-semibold">{v(income)}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/80">Despesas do mês</p>
          <p className="text-sm font-semibold">{v(expense)}</p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/15 grid grid-cols-2 gap-x-3 gap-y-2.5">
        {ciclo.map(r => (
          <div key={r.label} className="min-w-0">
            <p className="text-[11px] text-white/80 whitespace-nowrap">{r.label}</p>
            <p className="text-[13px] min-[390px]:text-sm font-bold whitespace-nowrap tabular-nums">{vCiclo(r.val)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/80">
        <p>Saldo total (todas as contas)</p>
        <p className="font-semibold">{v(saldoTotalContas(profileAccounts), 'w-20 h-3')}</p>
      </div>
    </button>
  )
}

// Reservas: as 2 contas de reserva com maior saldo (mesmo saldo da aba "Contas" de Reservas);
// a barra é a participação de cada uma no total guardado.
function CardReservas({ v }) {
  const { profileAccounts } = useApp()
  const contas = (profileAccounts || []).filter(a => a.isReserva && a.active !== false)
  const total = contas.reduce((s, a) => s + (a.balance || 0), 0)
  const top = [...contas].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 2)
  if (top.length === 0) return <p className="text-xs text-texto-3">Nenhuma conta de reserva.</p>
  return (
    <ul className="space-y-3">
      {top.map(a => {
        const pct = total > 0 ? Math.max(0, Math.min(100, ((a.balance || 0) / total) * 100)) : 0
        return (
          <li key={a.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-texto-2 truncate">{a.apelido || a.name}</span>
              <span className="text-texto-1 font-semibold">{v(a.balance || 0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 mt-1.5 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
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
  if (top.length === 0) return <p className="text-xs text-texto-3">Nenhum envelope criado.</p>
  return (
    <div className="grid grid-cols-3 gap-2">
      {top.map(d => {
        const estourado = d.spent > d.env.limitAmount
        const restante = d.env.limitAmount - d.spent
        return (
          <div key={d.env.id} className={`rounded-xl p-2.5 border ${estourado ? 'bg-perigo-bg border-perigo/30' : 'bg-surface-2/50 border-borda-forte/50'}`}>
            <p className="text-[11px] text-texto-2 truncate">{d.env.name}</p>
            <p className={`text-sm font-semibold mt-0.5 ${estourado ? 'text-perigo' : 'text-texto-1'}`}>{v(Math.abs(restante))}</p>
            <p className={`text-[10px] ${estourado ? 'text-perigo' : 'text-texto-3'}`}>{estourado ? 'estourado' : 'restante'}</p>
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
  if (top.length === 0) return <p className="text-xs text-texto-3">Nada vence nos próximos 7 dias.</p>
  return (
    <ul className="divide-y divide-borda">
      {top.map(({ s, date, amount }) => {
        const atrasado = date < hoje
        const entrada = s.transactionType === 'income'
        return (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-texto-1 truncate">{s.description || '(agendamento)'}</p>
              <p className={`text-[11px] ${atrasado ? 'text-perigo' : 'text-texto-3'}`}>{atrasado ? `⚠ Atrasado · ${fmtDate(date)}` : fmtDate(date)}</p>
            </div>
            <span className={`text-sm font-semibold whitespace-nowrap ${entrada ? 'text-receita' : 'text-despesa'}`}>
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
const CORPOS = { reservas: CardReservas, envelopes: CardEnvelopes, agenda: CardProximos, despesas: DespesasMobile }

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
      <ul className="divide-y divide-borda rounded-xl border border-borda">
        {lista.map((c, i) => (
          <li key={c.modulo.id} className="flex items-center gap-2 px-3 min-h-[56px]">
            <span className="flex-1 text-sm text-texto-1">{c.modulo.cardTitle || c.modulo.label}</span>
            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="w-11 h-11 flex items-center justify-center text-texto-2 disabled:opacity-30">
              <ChevronUp size={18} />
            </button>
            <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} aria-label="Descer" className="w-11 h-11 flex items-center justify-center text-texto-2 disabled:opacity-30">
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
              <span className={`relative w-10 h-6 rounded-full transition-colors ${c.on ? 'bg-primary' : 'bg-borda-campo'}`}>
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
