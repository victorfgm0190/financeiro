import { contaCentralParaId } from '../../lib/contaCentral'
import { useMemo, useState } from 'react'
import {
  Plus, Calendar, CheckCircle, SkipForward, Trash2, Edit2,
  Clock, CreditCard, BarChart3, ArrowDownCircle, ArrowUpCircle, AlertTriangle, History, ArrowLeftRight,
  MousePointer2, X, Eye, RotateCcw, Circle, Hourglass, ChevronRight, ChevronDown, List, CalendarDays, Smartphone,
} from 'lucide-react'
import { addDays, format, differenceInDays, parseISO } from 'date-fns'
import { useApp } from '../../context/AppContext'
import { useRegisterFab } from '../../context/FabContext'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { calcularRateio } from '../../lib/financiamento'
import ExecutarGerenciaisModal from './ExecutarGerenciaisModal'
import { ORIGIN } from '../../lib/origins'
import { occEfetiva, escalarRateios } from '../../lib/fluxoCaixa'
import { TIPO_BAIXA, metaBaixaGerada } from '../../lib/scheduleBaixa'
import { parseValorBR, valorParaInput } from '../../lib/valorBR'
import { scheduleDisplayDueDate, filtrarAgendamentos, STATUS, STATUS_POR_ABA, opcoesPeriodo, filtrarPorStatusPeriodo, filtrarPagosPorPeriodo, filtrarFaturasPorPeriodo, contarFiltrosAvancados, lerFiltrosAba, salvarFiltrosAba, periodoPadrao, AVANCADOS_VAZIOS, etiquetasFiltros } from '../../lib/agendamentosFiltro'
import { buildScheduleGroups, rotuloFaturasSeguintes } from '../../lib/agendamentosGrupos'
import FilterBar from './FilterBar'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import ScheduleForm from './ScheduleForm'
import ProvisaoForm from './ProvisaoForm'
import ResgateBreakdownModal from './ResgateBreakdownModal'
import AccountOptions from '../shared/AccountOptions'
import CategorySelect from '../shared/CategorySelect'
import ValueFilterDropdown from '../shared/ValueFilterDropdown'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import DateInput from '../shared/DateInput'
import { pagamentosDosAgendamentos, filtrarPagamentos, totaisPagamentos } from '../../lib/ocorrenciasRegistradas'
import VincularLancamento from './VincularLancamento'
import { useAtalho, useTituloAtalho } from '../../context/atalhosHooks'
import ShortcutHint from '../shared/ShortcutHint'
import { pagarParcela } from '../../lib/bemApi'
import ToastShared from '../shared/Toast'
import TipoDocumentoBadge from '../shared/TipoDocumentoBadge'
import TransferenciaPerfisCategorias from '../shared/TransferenciaPerfisCategorias'
import { isTransferenciaEntrePerfis, categoriasEntrePerfis } from '../../lib/transferenciaPerfis'
import TipoDocumentoFiltro from '../shared/TipoDocumentoFiltro'
import { resolverTipoDocumento, filtrarPorTipoDocumento, ehSintetico, SEM_TIPO } from '../../lib/tiposDocumento'
import { camposHerdadosNoPagamento } from '../../lib/herancaCampos'
import { comCamposDaOcorrencia, occCampos, serieKeyDe } from '../../lib/camposSerie'
import { novoLoteId } from '../../lib/historico'
import { contasEnvolvidas, filtrarPorContas } from '../../lib/filtroContasEnvolvidas'
import { resumoSelecao, classificarAgendamento, GRUPOS_SELECAO } from '../../lib/resumoSelecao'
import HistoricoModal from '../shared/HistoricoPainel'
import { useIsMobile } from '../../hooks/useIsMobile'
import AgendaMobile from './AgendaMobile'
import AgendaCalendario from './AgendaCalendario'
import { faturasSemAgendamento, lerVisaoAgenda, salvarVisaoAgenda } from '../../lib/agendaCalendario'

const FREQ_LABELS = {
  once: 'Única',
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  quadrimestral: 'Quadrimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

function GerBadge({ grupoId, gerencialGroups }) {
  if (!grupoId) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-reserva/15 text-reserva">G</span>
    )
  }
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
  else if (grupo.number === 'D') cls += ' bg-surface-hover/50 text-texto-3'
  else cls += ' bg-despesa/20 text-despesa'
  const label = grupo.number === 1 ? '1' : grupo.alias
  return <span className={cls}>{label}</span>
}

function TabButton({ active, onClick, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-primary text-primary-fg' : 'border-transparent text-texto-3 hover:text-texto-2'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-primary/20 text-primary-fg' : 'bg-surface-hover text-texto-2'}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

function PayableCard({ payable, gerencialGroups, accounts, onMarkPaid, onDelete }) {
  const { pode } = useApp()
  const podeEditar = pode('agendamentos', 'editar')
  const podeExcluir = pode('agendamentos', 'excluir')
  const card = accounts.find(a => a.id === payable.cartaoId)
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = payable.status === 'pending' && payable.dueDate < today
  const isDueSoon = payable.status === 'pending' && !isOverdue && payable.dueDate <= new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <GerBadge grupoId={payable.grupoGerencialId} gerencialGroups={gerencialGroups} />
            {card && <span className="text-xs text-texto-3 bg-surface-2 px-2 py-0.5 rounded-full">{card.apelido || card.name}</span>}
            {payable.status === 'paid' && <span className="text-xs bg-primary/15 text-primary-fg px-2 py-0.5 rounded-full font-medium">✓ Pago</span>}
          </div>
          <h3 className="font-semibold text-texto-1">{payable.description}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-perigo' : isDueSoon ? 'text-aviso' : 'text-texto-3'}`}>
              <Clock size={10} />
              Vence {fmtDate(payable.dueDate)}
              {isOverdue && ' · Vencida'}
              {isDueSoon && !isOverdue && ' · Em breve'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-lg font-bold text-despesa">{fmt(payable.amount)}</p>
          <div className="flex gap-1">
            {payable.status === 'pending' && podeEditar && (
              <button onClick={() => onMarkPaid(payable.id)} className="flex items-center gap-1 px-2 py-1 text-xs bg-receita/15 text-receita rounded-lg hover:bg-receita/25 transition-colors">
                <CheckCircle size={11} /> Marcar Pago
              </button>
            )}
            {podeExcluir && <button onClick={() => onDelete(payable.id)} className="p-1.5 text-texto-3 hover:text-perigo hover:bg-perigo-bg rounded transition-colors" aria-label="Excluir">
              <Trash2 size={12} />
            </button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ label, count, variant = 'default', cols = 8 }) {
  const colors = {
    overdue:  'text-perigo bg-perigo-bg border-perigo/30',
    soon:     'text-aviso bg-aviso/10 border-aviso/20',
    month:    'text-primary-fg bg-primary/10 border-primary/20',
    default:  'text-texto-2 bg-surface-2/60 border-borda-forte/50',
    history:  'text-texto-3 bg-surface-2/30 border-borda-forte/20',
  }
  return (
    <tr>
      <td colSpan={cols} className={`px-4 py-2 border-y text-xs font-semibold uppercase tracking-wide ${colors[variant]}`}>
        {label}
        {count > 0 && <span className="ml-2 font-bold">{count}</span>}
      </td>
    </tr>
  )
}

function PayModal({ schedule: scheduleProp, nextDate, accounts, categories, gerencialGroups, addTransaction, markScheduleRegistered, onClose }) {
  // Campos da parcela desta ocorrência (override "Só esta parcela" aplicado): conta, categoria,
  // descrição, centro de custo e grupo pré-preenchidos com os da ocorrência, não os da série.
  const schedule = useMemo(() => comCamposDaOcorrencia(scheduleProp, nextDate, accounts), [scheduleProp, nextDate, accounts])
  const { profiles, setAvisoOperacao, payees, transactions, addPayee, rateiosByLancamento, saveRateiosFor, registerScheduleOccurrence, scheduleReservaFuncoes, reserveFunctions, accountGroups, updateAccount, schedules: todosAgendamentos, possiveisDuplicados } = useApp()
  // Lançamento parecido que fez o registro automático parar nesta ocorrência (src/lib/autoRegistro.js).
  const duplicadoId = possiveisDuplicados?.get(scheduleProp.id)?.get(nextDate)
  const duplicado = duplicadoId ? transactions.find(t => t.id === duplicadoId) : null
  // Parcela de financiamento: o agendamento carrega o desdobramento principal/juros e o elo com
  // financing_installments (colunas gravadas por api/financiamento/*, só de leitura no app). Com
  // ele o modal deixa de registrar a transferência conta→dívida e passa a baixar a parcela pelo
  // endpoint, que cria DOIS lançamentos — principal e juros, cada um na categoria parametrizada
  // do bem — e amortiza bem e dívida. Sem o elo nada muda: o modal continua como sempre foi.
  const parcelaFin = useMemo(() => {
    if (schedule.tipoComponente !== 'financiamento' || !schedule.financingInstallmentId) return null
    const principal = Number(schedule.principalValue) || 0
    const juros = Number(schedule.jurosValue) || 0
    // Total pelo desdobramento, não por schedule.amount: é a soma que o endpoint vai ratear, e
    // exibir um total que não bate com as duas linhas seria pior que não exibir nada.
    const total = Math.round((principal + juros) * 100) / 100
    if (total <= 0) return null
    return { parcelaId: schedule.financingInstallmentId, principal, juros, total }
  }, [schedule.tipoComponente, schedule.financingInstallmentId, schedule.principalValue, schedule.jurosValue])
  // Detalhamento por função do resgate (Etapa B). Quando presente, a transferência é
  // registrada por função (registerScheduleOccurrence) e o valor total não é editável.
  const reservaDetalhe = useMemo(() => {
    const funcName = new Map((reserveFunctions || []).map(f => [f.id, f.name]))
    // O detalhamento tem 1 linha por lançamento; agrupa por função (soma) para exibir 1 linha por função.
    const porFuncao = new Map()
    for (const srf of (scheduleReservaFuncoes || [])) {
      if (srf.scheduleId !== schedule.id) continue
      porFuncao.set(srf.reservaFuncaoId, (porFuncao.get(srf.reservaFuncaoId) || 0) + (Number(srf.valor) || 0))
    }
    return [...porFuncao]
      .map(([funcId, valor]) => ({ name: funcName.get(funcId) || 'Função', valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
  }, [scheduleReservaFuncoes, reserveFunctions, schedule.id])
  const hasDetalhe = reservaDetalhe.length > 0
  const detalheTotal = useMemo(() => Math.round(reservaDetalhe.reduce((s, d) => s + d.valor, 0) * 100) / 100, [reservaDetalhe])
  const scheduleRateios = useMemo(
    () => (rateiosByLancamento?.get(schedule.id) || []).map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })),
    [rateiosByLancamento, schedule.id],
  )
  const sortedPayees = useMemo(() => {
    const counts = {}
    for (const tx of transactions) { if (tx.payee) counts[tx.payee] = (counts[tx.payee] || 0) + 1 }
    return [...new Set([...payees])].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  }, [transactions, payees])
  const today = format(new Date(), 'yyyy-MM-dd')
  const initialTab = schedule.transactionType === 'income' ? 'recebimento'
    : schedule.transactionType === 'transfer' ? 'transferencia'
    : 'pagamento'

  const [tab, setTab] = useState(initialTab)

  // Valor e data EFETIVOS da ocorrência a registrar: o override da "Prévia das próximas
  // ocorrências" (overrides[nextDate]) manda; sem ele, o valor base. Antes os campos nasciam em
  // schedule.amount e ignoravam a edição por ocorrência que a lista já exibia.
  const occ = nextDate ? occEfetiva(schedule, nextDate) : { date: today, amount: schedule.amount }
  const occAmount = valorParaInput(occ.amount)
  const occDate = occ.date || today

  const [payAccountId, setPayAccountId] = useState(schedule.accountId || '')
  const [payPayee, setPayPayee] = useState(schedule.payee || '')
  const [payAmount, setPayAmount] = useState(occAmount)
  const [payDate, setPayDate] = useState(occDate)
  const [payCategoryId, setPayCategoryId] = useState(schedule.categoryId || '')
  const [payGrupo, setPayGrupo] = useState(schedule.grupoGerencial || '')
  const [payNotes, setPayNotes] = useState(schedule.notes || '')

  const [recAccountId, setRecAccountId] = useState(schedule.accountId || '')
  const [recPayee, setRecPayee] = useState(schedule.payee || '')
  const [recAmount, setRecAmount] = useState(occAmount)
  const [recDate, setRecDate] = useState(occDate)
  const [recCategoryId, setRecCategoryId] = useState(schedule.categoryId || '')
  const [recNotes, setRecNotes] = useState(schedule.notes || '')

  const [trfFromId, setTrfFromId] = useState(schedule.accountId || '')
  const [trfToId, setTrfToId] = useState(schedule.toAccountId || '')
  const [trfAmount, setTrfAmount] = useState(occAmount)
  const [trfDate, setTrfDate] = useState(occDate)
  const [trfNotes, setTrfNotes] = useState(schedule.notes || '')
  // Transferência entre perfis: categorias por visão pré-preenchidas com as da ocorrência.
  // Editar aqui vale só para este lançamento — o agendamento não muda.
  const [trfCatCnpj, setTrfCatCnpj] = useState(schedule.categoriaCnpjId || '')
  const [trfCatCpf, setTrfCatCpf] = useState(schedule.categoriaCpfId || '')
  const trfFromAcc = accounts.find(a => a.id === trfFromId)
  const trfToAcc = accounts.find(a => a.id === trfToId)
  // Contas trocadas para o mesmo perfil: o bloco some e as duas categorias são limpas.
  const setTrfContas = (fromId, toId) => {
    setTrfFromId(fromId)
    setTrfToId(toId)
    if (!isTransferenciaEntrePerfis(accounts.find(a => a.id === fromId), accounts.find(a => a.id === toId))) {
      setTrfCatCnpj('')
      setTrfCatCpf('')
    }
  }

  const [finAccountId, setFinAccountId] = useState(schedule.accountId || '')
  // Quanto vai ser pago AGORA. Nasce na parcela cheia (o caso normal) e é editável para o
  // pagamento parcial, que o backend já suporta — antes o modal mandava sempre o total e não
  // havia como registrar um aporte menor por esta tela.
  const [finValor, setFinValor] = useState(() => (parcelaFin ? String(parcelaFin.total) : ''))
  const [finDate, setFinDate] = useState(nextDate || today)
  const [finLoading, setFinLoading] = useState(false)
  const [finErro, setFinErro] = useState(null)

  // Resgate do grupo gerencial → Conta central do PERFIL DA CONTA DO PAGAMENTO (ver handleConfirm).
  const centralPagamento = (contaId) => contaCentralParaId(accounts, profiles, contaId)

  // Preview do MESMO rateio que o backend aplica: principal primeiro, juros com a sobra, resto
  // vira desvio. `calcularRateio` é a fórmula compartilhada (src/lib/financiamento.js) — a mesma
  // que o modal de pagar do Patrimônio usa, para as duas telas nunca preverem coisas diferentes.
  //
  // Assume a parcela ainda intocada: o agendamento carrega o desdobramento PROVISIONADO, não o
  // quanto já foi pago. Numa parcela com aporte parcial anterior o preview fica otimista, mas o
  // valor gravado não — o servidor recalcula sobre o acumulado real da parcela.
  const finValorNum = Number(finValor)
  const finRateio = useMemo(() => {
    if (!parcelaFin || !(finValorNum > 0)) return null
    return calcularRateio(finValorNum, parcelaFin.principal, parcelaFin.juros)
  }, [finValorNum, parcelaFin])

  // Pagar mais que a parcela infla o saldo do bem (o backend soma `valor_pago` cheio nele) sem
  // ter onde alocar a diferença — o rateio já teria dado principal e juros por quitados.
  const finExcede = !!parcelaFin && finValorNum > parcelaFin.total + 0.001

  // Baixa a parcela pelo endpoint e espelha o resultado no estado do app. Os dois lançamentos
  // entram com o id que o backend JÁ gravou (addTransaction respeita id de fora): assim o upsert
  // do sync casa na linha existente em vez de criar uma segunda, e o saldo da conta de origem
  // muda na hora em vez de só no próximo full-load.
  const handleConfirmFinanciamento = async () => {
    if (!finAccountId) { setFinErro('Escolha a conta de origem.'); return }
    if (!(finValorNum > 0)) { setFinErro('Informe quanto você vai pagar.'); return }
    if (finExcede) { setFinErro(`O valor não pode passar de ${fmt(parcelaFin.total)}.`); return }
    setFinLoading(true)
    setFinErro(null)
    try {
      const r = await pagarParcela(parcelaFin.parcelaId, {
        valor_pago: finValorNum,
        data_pagamento: finDate,
        conta_origem_id: finAccountId,
        debitar_origem: true,
      })
      for (const l of r.lancamentos_criados || []) {
        addTransaction({
          id: l.id,
          type: 'expense',
          accountId: finAccountId,
          amount: l.valor,
          date: l.data || finDate,
          categoryId: l.categoria_id || '',
          description: l.descricao,
          scheduleId: schedule.id,
          origin: ORIGIN.PAGAMENTO_DIVIDA,
        })
      }
      // Bem e dívida são asset/liability: o saldo deles é do backend, o app só espelha (mesma
      // regra do BemDetail). Sem isto o Patrimônio só mostraria a amortização após recarregar.
      for (const c of [r.saldos_atualizados?.bem, r.saldos_atualizados?.divida]) {
        if (c?.id) updateAccount(c.id, { balance: c.saldo_novo })
      }
      // Meta aponta o 1º lançamento criado pelo endpoint (principal; o de juros vai junto no estado).
      markScheduleRegistered(schedule.id, nextDate || today, metaBaixaGerada(r.lancamentos_criados?.[0]?.id))
      onClose()
    } catch (err) {
      setFinErro(err.message)
    } finally {
      setFinLoading(false)
    }
  }

  // Valor da aba ativa. Resgate com detalhamento não usa o campo (valor vem das funções).
  const usaDetalhe = tab === 'transferencia' && hasDetalhe
  const valorAba = tab === 'pagamento' ? parseValorBR(payAmount)
    : tab === 'recebimento' ? parseValorBR(recAmount)
    : parseValorBR(trfAmount)
  const valorOk = usaDetalhe || (Number.isFinite(valorAba) && valorAba > 0)

  const handleConfirm = () => {
    // Guarda além do botão desabilitado: parse falho nunca vira lançamento de R$ 0.
    if (!valorOk) return
    const regDate = nextDate || today
    // Grupo numerado (≠ G, ≠ D) gera resgate para a Conta central do perfil da conta paga: sem
    // ela, bloqueia o pagamento inteiro antes de gravar.
    const grupoPag = tab === 'pagamento' && payGrupo ? gerencialGroups.find(g => g.id === payGrupo) : null
    const precisaCentral = grupoPag && grupoPag.number !== 'D' && grupoPag.number !== 1 && accounts.some(a => a.id === grupoPag.defaultAccountId)
    const central = precisaCentral ? centralPagamento(payAccountId) : { conta: null, erro: null }
    if (central.erro) { setAvisoOperacao(central.erro); return }
    const contaPrincipal = central.conta
    if (tab === 'pagamento') {
      const amount = valorAba
      if (payPayee && !payees.includes(payPayee)) addPayee(payPayee)
      const txId = addTransaction({
        type: 'expense', accountId: payAccountId, payee: payPayee,
        amount, date: payDate, categoryId: payCategoryId,
        grupoGerencial: payGrupo || undefined,
        description: schedule.description, notes: payNotes,
        // Tipo de documento e centro de custo não estão no modal → herdam do agendamento.
        ...camposHerdadosNoPagamento(schedule),
        scheduleId: schedule.id,
        origin: ORIGIN.AGENDAMENTO,
      })
      markScheduleRegistered(schedule.id, regDate, { tipo: TIPO_BAIXA.PAGO, lancamento_id: txId || null, import_id: null })
      if (txId && scheduleRateios.length > 0) saveRateiosFor(txId, escalarRateios(scheduleRateios, amount))
      if (payGrupo) {
        const grupo = gerencialGroups.find(g => g.id === payGrupo)
        if (grupo && grupo.number !== 'D') {
          if (grupo.number === 1) {
            const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
            if (payAccountId && contaReserva) {
              addTransaction({ type: 'transfer', accountId: payAccountId, toAccountId: contaReserva.id, amount, date: payDate, description: `Reserva ${grupo.name}`, grupoGerencial: grupo.id, origin: ORIGIN.AGENDAMENTO })
            }
          } else {
            const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
            if (contaResgate && contaPrincipal) {
              addTransaction({ type: 'transfer', accountId: contaResgate.id, toAccountId: contaPrincipal.id, amount, date: payDate, description: `Resgate ${grupo.name}`, grupoGerencial: grupo.id, origin: ORIGIN.AGENDAMENTO })
            }
          }
        }
      }
    } else if (tab === 'recebimento') {
      if (recPayee && !payees.includes(recPayee)) addPayee(recPayee)
      const amount = valorAba
      const txId = addTransaction({
        type: 'income', accountId: recAccountId, payee: recPayee,
        amount, date: recDate,
        categoryId: recCategoryId, description: schedule.description, notes: recNotes,
        // Recebimento não tem select de grupo: grupo, tipo de documento e centro de custo herdam.
        ...camposHerdadosNoPagamento(schedule, {}, { incluirGrupo: true }),
        scheduleId: schedule.id,
        origin: ORIGIN.AGENDAMENTO,
      })
      markScheduleRegistered(schedule.id, regDate, { tipo: TIPO_BAIXA.PAGO, lancamento_id: txId || null, import_id: null })
      if (txId && scheduleRateios.length > 0) saveRateiosFor(txId, escalarRateios(scheduleRateios, amount))
    } else if (hasDetalhe) {
      // Resgate detalhado: gera uma transferência por função (via registerScheduleOccurrence)
      // e marca a ocorrência. Não usa o valor/contas do formulário (fixos pelo detalhamento).
      registerScheduleOccurrence(schedule.id, trfDate, regDate)
    } else {
      // Resgate/depósito sem detalhamento: prioriza a função do próprio agendamento
      // (resgate_reserva carrega reservaFuncaoId desde a criação). Sem ela, se a conta de
      // reserva envolvida (origem ou destino) tem função ÚNICA, preenche automaticamente —
      // mesma regra do formulário de transferência (TransactionForm).
      const resvAcc = accounts.find(a => a.id === trfFromId && a.isReserva)
        || accounts.find(a => a.id === trfToId && a.isReserva)
      const resvFuncs = resvAcc ? (reserveFunctions || []).filter(f => f.accountId === resvAcc.id) : []
      const autoFuncId = resvFuncs.length === 1 ? resvFuncs[0].id : null
      const txId = addTransaction({
        type: 'transfer', accountId: trfFromId, toAccountId: trfToId,
        amount: valorAba, date: trfDate,
        description: schedule.description, notes: trfNotes,
        reservaFuncaoId: schedule.reservaFuncaoId || autoFuncId,
        ...categoriasEntrePerfis(trfFromAcc, trfToAcc, { categoriaCnpjId: trfCatCnpj, categoriaCpfId: trfCatCpf }),
        scheduleId: schedule.id,
        origin: ORIGIN.AGENDAMENTO,
      })
      markScheduleRegistered(schedule.id, regDate, metaBaixaGerada(txId))
    }
    onClose()
  }

  const TAB_LABELS = { pagamento: 'Pagamento', recebimento: 'Recebimento', transferencia: 'Transferência' }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
          <div>
            <h3 className="font-semibold text-texto-1">
              {parcelaFin ? 'Pagar Parcela de Financiamento' : 'Registrar Agendamento'}
            </h3>
            <p className="text-xs text-texto-3 mt-0.5 truncate max-w-[280px]">{schedule.description}</p>
            {(schedule.faturaRef || schedule.overrides?._gerencial?.faturaRef) && (
              <p className="text-xs text-texto-2 mt-0.5">Fatura: {schedule.faturaRef || schedule.overrides._gerencial.faturaRef}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {!parcelaFin && (
          <div className="flex border-b border-borda shrink-0">
            {['pagamento', 'recebimento', 'transferencia'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-primary text-primary-fg' : 'border-transparent text-texto-3 hover:text-texto-2'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {parcelaFin && (
            <>
              <div className="rounded-lg border border-borda-forte bg-surface-2/40 px-3 py-2.5">
                <p className="text-xs text-texto-2 mb-1.5">Desdobramento da parcela</p>
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-texto-2">Principal</span>
                    <span className="text-texto-1">{fmt(parcelaFin.principal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-texto-2">Juros</span>
                    <span className="text-texto-1">{fmt(parcelaFin.juros)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-borda-forte mt-1.5 pt-1.5">
                  <span className="text-xs font-semibold text-texto-2">Total</span>
                  <span className="text-xs font-bold text-texto-1">{fmt(parcelaFin.total)}</span>
                </div>
              </div>
              <div>
                <label className="label">Quanto você vai pagar? (R$)</label>
                <input
                  className="input" type="number" step="0.01" min="0.01"
                  max={parcelaFin.total}
                  value={finValor}
                  onChange={e => setFinValor(e.target.value)}
                />
                {finExcede && (
                  <p className="text-xs text-despesa mt-1">
                    Máximo {fmt(parcelaFin.total)} — o que passa disso não teria onde ser alocado.
                  </p>
                )}
              </div>

              {finRateio && !finExcede && (
                <div className="rounded-lg border border-borda bg-surface-2/40 px-3 py-2.5 text-xs space-y-0.5">
                  <p className="text-texto-2 mb-1.5">Rateio deste pagamento (principal primeiro)</p>
                  <div className="flex items-center justify-between">
                    <span className="text-texto-3">Principal neste pagamento</span>
                    <span className="text-texto-1">{fmt(finRateio.principalPago)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-texto-3">Juros neste pagamento</span>
                    <span className="text-texto-1">{fmt(finRateio.jurosPago)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-texto-3">Juros em falta</span>
                    <span className={finRateio.desvioJuros > 0 ? 'text-aviso' : 'text-texto-1'}>
                      {fmt(finRateio.desvioJuros)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-borda-forte mt-1.5 pt-1.5">
                    <span className="text-texto-2 font-semibold">Total pago na parcela</span>
                    <span className="text-texto-1 font-bold">{fmt(finValorNum)}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-texto-3">
                Serão criados até dois lançamentos na mesma data e na mesma conta de origem, cada
                um na categoria parametrizada do bem (prestação e taxa de financiamento). Pagando
                menos que a parcela ela fica parcial e o saldo continua em aberto.
              </p>
              <div>
                <label className="label">Banco de</label>
                {/* Só conta corrente/poupança: os dois lançamentos são criados pelo backend, que
                    não sabe montar gasto de cartão (fatura, dívida do cartão). É o mesmo conjunto
                    que /api/financiamento/criar aceita como conta de origem. */}
                <select className="input" value={finAccountId} onChange={e => setFinAccountId(e.target.value)}>
                  <AccountOptions
                    accounts={accounts}
                    accountGroups={accountGroups}
                    filter={a => !['credit', 'asset', 'liability', 'gerencial'].includes(a.type)}
                  />
                </select>
              </div>
              <div>
                <label className="label">Data</label>
                <DateInput className="input" value={finDate} onChange={e => setFinDate(e.target.value)} />
              </div>
              {finErro && <p className="text-xs text-despesa">{finErro}</p>}
            </>
          )}

          {!parcelaFin && tab === 'pagamento' && (
            <>
              <div>
                <label className="label">Banco de</label>
                <select className="input" value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
                </select>
              </div>
              <div>
                <label className="label">Favorecido</label>
                <FavorecidoAutocomplete value={payPayee} onChange={setPayPayee} suggestions={sortedPayees} placeholder="Favorecido" />
              </div>
              <div>
                <label className="label">Valor</label>
                <input className={`input ${valorOk ? '' : '!border-perigo'}`} type="text" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                {!valorOk && <p className="text-xs text-perigo mt-1">⚠ Valor inválido</p>}
              </div>
              <div>
                <label className="label">Data</label>
                <DateInput className="input" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <CategorySelect categories={categories} perfilId={accounts.find(a => a.id === payAccountId)?.profileId || undefined} type="expense" value={payCategoryId} onChange={e => setPayCategoryId(e.target.value)} />
              </div>
              <div>
                <label className="label">Classificação Gerencial</label>
                <select className="input" value={payGrupo} onChange={e => setPayGrupo(e.target.value)}>
                  <option value="">Sem grupo</option>
                  {gerencialGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Anotações</label>
                <input className="input" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}

          {!parcelaFin && tab === 'recebimento' && (
            <>
              <div>
                <label className="label">Banco para</label>
                <select className="input" value={recAccountId} onChange={e => setRecAccountId(e.target.value)}>
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
                </select>
              </div>
              <div>
                <label className="label">Pagador</label>
                <FavorecidoAutocomplete value={recPayee} onChange={setRecPayee} suggestions={sortedPayees} placeholder="Pagador" />
              </div>
              <div>
                <label className="label">Valor</label>
                <input className={`input ${valorOk ? '' : '!border-perigo'}`} type="text" inputMode="decimal" value={recAmount} onChange={e => setRecAmount(e.target.value)} />
                {!valorOk && <p className="text-xs text-perigo mt-1">⚠ Valor inválido</p>}
              </div>
              <div>
                <label className="label">Data</label>
                <DateInput className="input" value={recDate} onChange={e => setRecDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <CategorySelect categories={categories} perfilId={accounts.find(a => a.id === recAccountId)?.profileId || undefined} type="income" value={recCategoryId} onChange={e => setRecCategoryId(e.target.value)} />
              </div>
              <div>
                <label className="label">Anotações</label>
                <input className="input" value={recNotes} onChange={e => setRecNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}

          {!parcelaFin && tab === 'transferencia' && (
            <>
              {hasDetalhe && (
                <div className="rounded-lg border border-borda-forte bg-surface-2/40 px-3 py-2.5">
                  <p className="text-xs text-texto-2 mb-1.5">Detalhamento por função</p>
                  <ul className="space-y-0.5">
                    {reservaDetalhe.map((det, i) => (
                      <li key={i} className="text-xs text-texto-2 flex items-center gap-1.5">
                        <span className="text-texto-3">{i === reservaDetalhe.length - 1 ? '└' : '├'}</span>
                        <span className="flex-1 truncate">{det.name}</span>
                        <span className="font-medium text-texto-1">{fmt(det.valor)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-borda-forte mt-1.5 pt-1.5">
                    <span className="text-xs font-semibold text-texto-2">Total</span>
                    <span className="text-xs font-bold text-texto-1">{fmt(detalheTotal)}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="label">Banco de</label>
                <select className="input" value={trfFromId} onChange={e => setTrfContas(e.target.value, trfToId)} disabled={hasDetalhe}>
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
                </select>
              </div>
              <div>
                <label className="label">Banco para</label>
                <select className="input" value={trfToId} onChange={e => setTrfContas(trfFromId, e.target.value)} disabled={hasDetalhe}>
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
                </select>
              </div>
              <div>
                <label className="label">Valor{hasDetalhe ? ' (soma das funções)' : ''}</label>
                <input
                  className={`input ${valorOk ? '' : '!border-perigo'}`}
                  type="text"
                  inputMode="decimal"
                  value={hasDetalhe ? valorParaInput(detalheTotal) : trfAmount}
                  onChange={e => setTrfAmount(e.target.value)}
                  disabled={hasDetalhe}
                  readOnly={hasDetalhe}
                />
                {!valorOk && <p className="text-xs text-perigo mt-1">⚠ Valor inválido</p>}
              </div>
              {/* Resgate detalhado é registrado pelo motor (registerScheduleOccurrence), que herda as categorias. */}
              {!hasDetalhe && (
                <TransferenciaPerfisCategorias
                  fromAccount={trfFromAcc}
                  toAccount={trfToAcc}
                  categoriaCnpjId={trfCatCnpj}
                  categoriaCpfId={trfCatCpf}
                  onChangeCnpj={id => setTrfCatCnpj(id || '')}
                  onChangeCpf={id => setTrfCatCpf(id || '')}
                />
              )}
              <div>
                <label className="label">Data</label>
                <DateInput className="input" value={trfDate} onChange={e => setTrfDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Anotações</label>
                <input className="input" value={trfNotes} onChange={e => setTrfNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}
          {duplicado && (
            <div className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 space-y-2">
              <p className="text-xs font-medium text-aviso">⚠ Possível duplicado — confira</p>
              <p className="text-xs text-texto-2">
                O registro automático não criou esta ocorrência porque já existe um lançamento parecido:
              </p>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-texto-1 truncate">{duplicado.description || duplicado.payee || '(sem descrição)'}</p>
                  <p className="text-texto-3">{fmtDate(duplicado.date)} · {fmt(duplicado.amount)}</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1 px-2 shrink-0"
                  onClick={() => { markScheduleRegistered(schedule.id, nextDate || today, metaBaixaGerada(duplicado.id)); onClose() }}
                >
                  Vincular a este lançamento
                </button>
              </div>
              <p className="text-[11px] text-texto-3">Se não for o mesmo, use “Registrar mesmo assim”.</p>
            </div>
          )}
          {/* Baixa apontando um lançamento que já existe (sem gerar outro). Fora do resgate com
              detalhamento (um lançamento por função) e da parcela de financiamento (endpoint). */}
          {!parcelaFin && !hasDetalhe && (
            <VincularLancamento
              schedule={scheduleProp}
              data={nextDate || today}
              transactions={transactions}
              schedules={todosAgendamentos}
              accounts={accounts}
              onVincular={(txId) => { markScheduleRegistered(schedule.id, nextDate || today, metaBaixaGerada(txId)); onClose() }}
            />
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-borda shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={finLoading}>Cancelar</button>
          {parcelaFin ? (
            <button
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
              onClick={handleConfirmFinanciamento}
              disabled={finLoading}
            >
              {finLoading ? <Hourglass size={14} className="animate-pulse" /> : <CheckCircle size={14} />}
              {finLoading ? 'Baixando...' : 'Confirmar Pagamento'}
            </button>
          ) : (
            <button className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40" disabled={!valorOk} onClick={handleConfirm}>
              <CheckCircle size={14} /> {duplicado ? 'Registrar mesmo assim' : `Confirmar ${TAB_LABELS[tab]}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EstornarModal({ schedule, nextDate, accounts, onClose, onConfirm }) {
  const acc = accounts.find(a => a.id === schedule.accountId)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda">
          <h3 className="font-semibold text-texto-1">Estornar Ocorrência</h3>
          <button onClick={onClose} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-surface-2/60 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Favorecido</span>
              <span className="text-texto-1">{schedule.payee || '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Valor</span>
              <span className="text-texto-1 font-bold">{fmt(schedule.amount)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Data</span>
              <span className="text-texto-1">{nextDate ? fmtDate(nextDate) : '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Conta</span>
              <span className="text-texto-1">{acc?.apelido || acc?.name || '—'}</span>
            </div>
          </div>
          <p className="text-xs text-aviso bg-aviso/10 rounded-lg px-3 py-2">
            ⚠ Esta ação não pode ser desfeita. Deseja confirmar?
          </p>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-borda">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-despesa/15 text-despesa hover:bg-despesa/25 rounded-lg transition-colors"
            onClick={onConfirm}
          >
            <RotateCcw size={14} /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function ExcluirModal({ schedule, nextDate, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda">
          <h3 className="font-semibold text-texto-1">Excluir Agendamento</h3>
          <button onClick={onClose} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-surface-2/60 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Favorecido</span>
              <span className="text-texto-1">{schedule.payee || '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Valor</span>
              <span className="text-texto-1 font-bold">{fmt(schedule.amount)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Frequência</span>
              <span className="text-texto-1">{FREQ_LABELS[schedule.frequency] || schedule.frequency}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-texto-3">Próxima data</span>
              <span className="text-texto-1">{nextDate ? fmtDate(nextDate) : '—'}</span>
            </div>
          </div>
          <p className="text-xs text-perigo bg-perigo-bg rounded-lg px-3 py-2">
            ⚠ Esta ação não pode ser desfeita. Deseja confirmar?
          </p>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-borda">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-perigo-solido text-white hover:bg-perigo-solido-hover rounded-lg transition-colors"
            onClick={onConfirm}
          >
            <Trash2 size={14} /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleRow({
  schedule, nextDate, futureItems = [], isSerie = false, cols = 8, categories, accounts, gerencialGroups,
  addTransaction, markScheduleRegistered, registerScheduleOccurrence, skipScheduleOccurrence,
  deleteSchedule, getNextOccurrences, onToast,
  onEditSchedule, efetivarProvisao, getProximaProvisaoOccurrence,
  selectionMode, isSelected, onToggleSelect,
  srfBySchedule, rateiosBySchedule, onToggleConfirmado, tiposDocumento = [],
  // Detalhe do card no celular (AgendaMobile): mantém o "+ N faturas seguintes" junto do chevron,
  // como era; no desktop ele vai para a linha de badges e a célula tem largura mínima.
  detalheMobile = false,
  // Calendário: ocorrência SEGUINTE de um agendamento ({ data, amount, antesDe }). Só leitura +
  // Editar — as ações agem sempre na próxima pendente (nextDate), então pagar/pular aqui cairia em
  // outra ocorrência. Linha esmaecida e o aviso "Antes, efetive a de dd/mm" no lugar dos botões.
  futura = null,
}) {
  // Provisão de despesa exibe badge "Provisão". O botão "Efetivar" aparece enquanto houver uma
  // próxima ocorrência a efetivar: para "Uma vez", até provisao_efetivada virar true; para
  // recorrente, sempre que existir ocorrência após provisao_efetivada_until.
  const isProvisao = !!schedule.isProvisao
  const proximaProvisao = isProvisao && !schedule.provisaoEfetivada
    ? ((schedule.frequency || 'once') === 'once' ? schedule.startDate : getProximaProvisaoOccurrence?.(schedule))
    : null
  const isProvisaoPendente = isProvisao && !schedule.provisaoEfetivada && !!proximaProvisao
  // Flag "Confirmado / A Confirmar" aplica-se a tudo, exceto automação pura
  // (gerencial_devolucao / resgate_reserva). Em pagamento_fatura é só visual.
  const canConfirm = schedule.tipo !== 'gerencial_devolucao' && schedule.tipo !== 'resgate_reserva'
  const today = format(new Date(), 'yyyy-MM-dd')
  // Categoria/descrição da PRÓXIMA ocorrência (override "Só esta parcela" aplicado).
  const occ = nextDate ? occCampos(schedule, nextDate) : schedule
  const cat = categories.find(c => c.id === occ.categoryId)
  const acc = accounts.find(a => a.id === schedule.accountId)
  const toAcc = accounts.find(a => a.id === schedule.toAccountId)
  const isDepositoReserva = schedule.transactionType === 'transfer' && !!toAcc?.isReserva
  const isResgateReserva  = schedule.transactionType === 'transfer' && !!acc?.isReserva && !isDepositoReserva
  // Fase 4: resgate gerencial com rastreabilidade per-gasto (sourceExpenseIds) → botão "Ver gastos".
  const hasBreakdown = schedule.tipo === 'resgate_reserva' && (schedule.sourceExpenseIds || []).length > 0
  const registered = schedule.registered || []
  const skipped = schedule.skipped || []
  const totalDone = registered.length + skipped.length
  // Regra C: ocorrências pendentes que um lançamento do cartão já cobre (cartão, fatura, valor,
  // data ±3 dias e descrição — ver txCobrindoOcorrencia). Só sinaliza — o agendamento não muda até
  // o usuário baixar. O tooltip cita o lançamento casado para conferência antes de baixar.
  const { coberturaCartao, baixarComoJaNoCartao, transactions: todasTxs, pode, possiveisDuplicados } = useApp()
  // Nível de acesso (src/lib/permissoes.js): pagar/estornar/pular/efetivar/confirmar/editar = editar;
  // excluir = excluir. Sem permissão o botão some (a API também barra).
  const podeEditar = pode('agendamentos', 'editar')
  const podeExcluir = pode('agendamentos', 'excluir')
  const cobertas = coberturaCartao?.get(schedule.id)
  const nCobertas = cobertas?.size || 0
  const tituloCobertas = nCobertas ? [...cobertas].map(([d, txId]) => {
    const t = todasTxs?.find(x => x.id === txId)
    return `${fmtDate(d)} ↔ ${t ? `${fmtDate(t.date)} ${t.description || '(sem descrição)'} ${fmt(t.amount)}` : txId}`
  }).join('\n') : ''
  const isInstallment = schedule.occurrenceType === 'installment'
  // Auto-registro que não criou a ocorrência por achar um lançamento parecido (src/lib/autoRegistro.js).
  const duplicados = possiveisDuplicados?.get(schedule.id)
  const nDuplicados = duplicados?.size || 0
  const tituloDuplicados = nDuplicados ? [...duplicados].map(([d, txId]) => {
    const t = todasTxs?.find(x => x.id === txId)
    return `${fmtDate(d)} ↔ ${t ? `${fmtDate(t.date)} ${t.description || '(sem descrição)'} ${fmt(t.amount)}` : txId}`
  }).join('\n') : ''

  // Data exibida na coluna e usada no badge "em atraso": casa com o campo "Data de Vencimento
  // Atual" do formulário (ver scheduleDisplayDueDate). As ações seguem usando nextDate.
  const displayDueDate = scheduleDisplayDueDate(schedule, nextDate, getNextOccurrences, today)

  const daysLate = !futura && displayDueDate && displayDueDate < today
    ? differenceInDays(parseISO(today), parseISO(displayDueDate))
    : 0

  const [showPay, setShowPay] = useState(false)
  const [showEstornar, setShowEstornar] = useState(false)
  const [showExcluir, setShowExcluir] = useState(false)
  const [showEfetivar, setShowEfetivar] = useState(false)
  const [showPularUnico, setShowPularUnico] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showHistorico, setShowHistorico] = useState(false)
  const { temHistorico } = useApp()
  const comHistorico = temHistorico('agendamento', schedule.id)
  const hasFuture = !futura && futureItems.length > 0
  const toggleExpand = () => setExpanded(v => !v)

  // Histórico de pagamentos: ocorrências já registradas (registered) cruzadas com os
  // lançamentos vinculados ao agendamento (scheduleId), carregados via /api/load no contexto.
  // Pareamento por data mais próxima (consome cada lançamento uma vez); sem lançamento
  // vinculado, usa a data prevista e o valor efetivo da ocorrência (override individual).
  const { profileTransactions, transactions, schedules: todosSchedules } = useApp()
  const hasHistory = !futura && registered.length > 0
  const canExpand = hasFuture || hasHistory
  const paymentHistory = useMemo(() => {
    const reg = schedule.registered || []
    const linked = profileTransactions.filter(t => t.scheduleId === schedule.id)
    const used = new Set()
    return [...reg].sort().map(occ => {
      const eff = occEfetiva(schedule, occ)
      let best = null, bestDiff = Infinity
      linked.forEach((t, idx) => {
        if (used.has(idx)) return
        const diff = Math.abs(new Date(t.date + 'T00:00:00') - new Date(eff.date + 'T00:00:00'))
        if (diff < bestDiff) { bestDiff = diff; best = idx }
      })
      if (best != null) used.add(best)
      const tx = best != null ? linked[best] : null
      return { prevista: occ, efetiva: tx ? tx.date : null, valor: tx ? Number(tx.amount) : eff.amount }
    })
  }, [profileTransactions, schedule])

  // Pular a próxima ocorrência pendente:
  //  • único (frequency 'once'): confirma e cancela (deleteSchedule);
  //  • recorrente: skipScheduleOccurrence — adiciona aos "skipped" E reancora next_occurrence na
  //    próxima pendente (sem criar lançamento nem registrar ocorrência). Antes chamava
  //    updateSchedule só com `skipped`, um merge cego: a coluna next_occurrence ficava congelada
  //    numa data já pulada. A lista da tela não denunciava (getNextOccurrences filtra os pulados),
  //    mas o valor persistido travava o "Em atraso" e desalinhava a contagem de parcelas de
  //    occurrenceType 'installment', que pré-conta os consumidos ANTES da âncora.
  const isRecorrente = (schedule.frequency || 'once') !== 'once'
  // Valor EFETIVO da próxima ocorrência (respeita override individual); sem ocorrência → valor-pai.
  const effAmount = futura ? futura.amount : nextDate ? occEfetiva(schedule, nextDate).amount : schedule.amount
  const handlePular = () => {
    if (!nextDate) return
    if (!isRecorrente) { setShowPularUnico(true); return }
    const proximo = getNextOccurrences?.(schedule, 2)[1] || null
    skipScheduleOccurrence(schedule.id, nextDate)
    onToast?.(proximo
      ? `Agendamento pulado. Próximo vencimento: ${fmtDate(proximo)}`
      : 'Agendamento pulado.')
  }

  const displayDate = nextDate || (registered.length > 0 ? registered[registered.length - 1] : schedule.startDate)

  // Detalhamento por função do resgate (schedule_reserva_funcoes).
  const reservaDetalhe = srfBySchedule?.get(schedule.id) || null
  // Rateio do agendamento: para a parcela de financiamento são as duas linhas — principal na
  // categoria de prestação, juros na de taxa. O agendamento continua sendo UM, com o valor
  // cheio; estas linhas dizem de que ele é composto. Agendamento sem rateio (o formato antigo,
  // até alguém clicar em "Separar Juros") não renderiza nada e continua como sempre foi.
  const rateioDetalhe = rateiosBySchedule?.get(schedule.id) || null

  // Coluna "Ações" fixa à direita (desktop): fundo OPACO que reproduz o tom da linha (atraso,
  // selecionada, confirmada, hover) sobre a superfície do card, para o conteúdo que rola por baixo
  // não aparecer através dela. Tokens do tema — vale para claro e escuro.
  // Classes literais (o Tailwind não enxerga classe montada por template).
  const fundoAcoes = isSelected ? 'bg-[color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface))]'
    : daysLate > 0 ? 'bg-[color-mix(in_srgb,var(--color-perigo)_5%,var(--color-surface))]'
      : canConfirm && nextDate && schedule.confirmado ? 'bg-[color-mix(in_srgb,var(--color-primary)_3%,var(--color-surface))]'
        : 'bg-surface'
  const acoesFixas = detalheMobile ? '' : `sticky right-0 z-[1] ${fundoAcoes} group-hover:bg-[color-mix(in_srgb,var(--color-surface-hover)_20%,var(--color-surface))] shadow-[-8px_0_8px_-8px_var(--color-overlay)]`

  return (
    <>
      <tr className={`border-b border-borda/50 hover:bg-surface-hover/20 transition-colors group ${daysLate > 0 ? 'bg-perigo/5' : ''} ${!nextDate || futura ? 'opacity-60' : ''} ${isSelected ? 'bg-primary/5' : ''} ${canConfirm && nextDate && schedule.confirmado ? 'border-l-2 border-l-primary bg-primary/[0.03]' : ''}`}>
        {/* Checkbox */}
        {selectionMode && (
          <td className="px-3 py-3 w-8">
            {!ehSintetico(schedule) ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(schedule.id)}
                onClick={e => e.stopPropagation()}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            ) : (
              <div className="w-4 h-4" />
            )}
          </td>
        )}

        {/* Próxima Data */}
        <td className="px-3 py-3 whitespace-nowrap">
          {futura ? (
            <p className="text-xs text-texto-2 font-medium">{fmtDate(futura.data)}</p>
          ) : nextDate ? (
            <div>
              <p className="text-xs text-texto-2 font-medium">{fmtDate(displayDueDate)}</p>
              {daysLate > 0 && (
                <span className="inline-flex items-center gap-0.5 mt-0.5 text-xs bg-perigo-bg text-perigo px-1.5 py-0.5 rounded font-medium">
                  <AlertTriangle size={9} />
                  {daysLate}d em atraso
                </span>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-texto-3 font-medium">{displayDate ? fmtDate(displayDate) : '—'}</p>
              <span className="text-xs text-texto-3">Concluído</span>
            </div>
          )}
        </td>

        {/* Doc. — tipo de documento (gravado ou fallback CC/RES) */}
        <td className="px-2 py-3 w-[70px] max-w-[70px] whitespace-nowrap">
          <TipoDocumentoBadge tipo={resolverTipoDocumento(schedule, tiposDocumento)} />
        </td>

        {/* Descrição — toda a célula expande/colapsa quando há ocorrências futuras ou histórico */}
        <td
          className={`px-3 py-3 w-full max-w-0 ${detalheMobile ? '' : 'min-w-[200px]'} ${canExpand ? 'cursor-pointer' : ''}`}
          onClick={canExpand ? toggleExpand : undefined}
        >
          <div className="flex items-start gap-1.5">
            {canExpand && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExpand() }}
                title={expanded ? 'Recolher' : hasFuture ? `Ver ${futureItems.length} ocorrência(s) seguinte(s) e histórico` : 'Ver histórico de pagamentos'}
                className="inline-flex items-center gap-0.5 -ml-1 p-0.5 text-texto-3 hover:text-texto-1 transition-colors shrink-0"
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {hasFuture && <span className="text-[10px] font-semibold">{futureItems.length}</span>}
                {/* Série de fatura: o valor da linha é o da fatura mais próxima (meses diferentes não
                    somam); o texto deixa claro que há outras faturas dentro do "› N". */}
                {detalheMobile && isSerie && hasFuture && (
                  <span className="text-[10px] font-normal text-texto-3 whitespace-nowrap ml-0.5">
                    {rotuloFaturasSeguintes(futureItems.length)}
                  </span>
                )}
              </button>
            )}
            <p className="text-xs text-texto-1 font-medium whitespace-normal break-words min-w-0 flex-1" title={occ.description}>{occ.description}{comHistorico && <span className="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-primary-fg/80 align-middle" title="Tem histórico de alterações" />}{schedule.sincronizarAgenda !== false && <Smartphone size={11} className="inline-block ml-1.5 align-middle text-texto-3" aria-label="Sincroniza com a agenda do celular"><title>Sincroniza com a agenda do celular</title></Smartphone>}</p>
          </div>
          {/* Linha de badges: status, tipo de movimentação, grupo (letra), fatura etc. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {/* Abaixo de 1440px a coluna Frequência some: a frequência vira selo aqui. */}
            <span className="min-[1440px]:hidden text-xs bg-surface-hover/60 text-texto-2 px-1.5 py-0.5 rounded whitespace-nowrap">
              {FREQ_LABELS[schedule.frequency] || schedule.frequency}
            </span>
            {/* Série de fatura (desktop): o "+ N faturas seguintes" fica aqui, fora da linha do título,
                para não espremer a descrição. */}
            {!detalheMobile && isSerie && hasFuture && (
              <span className="shrink-0 text-[10px] bg-surface-hover/40 text-texto-2 px-1.5 py-0.5 rounded whitespace-nowrap">
                {rotuloFaturasSeguintes(futureItems.length)}
              </span>
            )}
            {isProvisao && !schedule.provisaoEfetivada && (
              <span className="inline-flex items-center gap-1 text-xs bg-surface-2 text-texto-2 outline-dashed outline-1 -outline-offset-1 outline-borda-forte px-1.5 py-0.5 rounded whitespace-nowrap font-medium" title={schedule.frequency === 'once' ? 'Despesa provisionada — valor/data estimados' : 'Provisão recorrente — valor/data estimados por ocorrência'}>
                <Hourglass size={9} /> Provisão{schedule.frequency !== 'once' ? ' recorrente' : ''}
              </span>
            )}
            {schedule.transactionType === 'expense' && (
              <GerBadge grupoId={schedule.grupoGerencial} gerencialGroups={gerencialGroups} />
            )}
            {(schedule.faturaRef || schedule.overrides?._gerencial?.faturaRef) && (
              <span className="text-xs bg-surface-2 text-texto-2 px-1.5 py-0.5 rounded whitespace-nowrap font-medium" title="Fatura de referência">
                {schedule.faturaRef || schedule.overrides._gerencial.faturaRef}
              </span>
            )}
            {hasBreakdown && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowBreakdown(true) }}
                title="Ver os gastos que compõem este resgate"
                className="inline-flex items-center gap-1 text-xs bg-primary/15 text-primary-fg px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-primary/25 transition-colors"
              >
                <List size={10} /> Ver gastos
              </button>
            )}
            {isInstallment && (
              <span className="text-xs bg-surface-hover/60 text-texto-2 px-1 py-0.5 rounded whitespace-nowrap">
                {totalDone}/{schedule.installments}x
              </span>
            )}
            {canConfirm && nextDate && podeEditar && !futura && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleConfirmado(schedule.id) }}
                title={schedule.confirmado
                  ? 'Valor confirmado para o próximo vencimento — clique para desmarcar'
                  : 'Marcar valor como confirmado para o próximo vencimento'}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  schedule.confirmado
                    ? 'bg-primary/15 text-primary-fg hover:bg-primary/25'
                    : 'bg-surface-hover/60 text-texto-2 hover:bg-surface-hover'
                }`}
              >
                {schedule.confirmado ? <CheckCircle size={10} /> : <Circle size={10} />}
                {schedule.confirmado ? 'Confirmado' : 'A confirmar'}
              </button>
            )}
            {schedule.transactionType === 'income' ? (
              <span className="inline-flex items-center gap-1 text-xs bg-receita/15 text-receita px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                <ArrowDownCircle size={10} /> Receita
              </span>
            ) : isDepositoReserva ? (
              <span className="inline-flex items-center gap-1 text-xs bg-reserva/15 text-reserva px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                <ArrowDownCircle size={10} /> Depósito Reserva
              </span>
            ) : isResgateReserva ? (
              <span className="inline-flex items-center gap-1 text-xs bg-despesa/15 text-despesa px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                <ArrowUpCircle size={10} /> Resgate Reserva
              </span>
            ) : schedule.transactionType === 'transfer' ? (
              <span className="inline-flex items-center gap-1 text-xs bg-transferencia/15 text-transferencia px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                <ArrowLeftRight size={10} /> Transferência
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs bg-despesa/15 text-despesa px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                <ArrowUpCircle size={10} /> Despesa
              </span>
            )}
          </div>
          {reservaDetalhe && reservaDetalhe.length > 0 && (
            <ul className="mt-1 space-y-0.5" title="Detalhamento por função de reserva">
              {reservaDetalhe.map((det, i) => (
                <li key={i} className="text-[10px] text-texto-3 flex items-center gap-1 whitespace-nowrap">
                  <span className="text-texto-3">{i === reservaDetalhe.length - 1 ? '└' : '├'}</span>
                  <span className="truncate">{det.name}:</span>
                  <span className="text-texto-2 font-medium">{fmt(det.valor)}</span>
                </li>
              ))}
            </ul>
          )}
          {rateioDetalhe && rateioDetalhe.length > 0 && (
            <ul className="mt-1 space-y-0.5" title="Rateio por categoria">
              {rateioDetalhe.map((r, i) => {
                const catRateio = categories.find(c => c.id === r.categoriaId)
                return (
                  <li key={r.id} className="text-[10px] text-texto-3 flex items-center gap-1 whitespace-nowrap">
                    <span className="text-texto-3">{i === rateioDetalhe.length - 1 ? '└' : '├'}</span>
                    {/* A descrição ("Principal"/"Juros") vem do rateio; a categoria é o que
                        importa para o relatório, então as duas aparecem. */}
                    <span className="truncate">
                      {r.descricao || catRateio?.name || 'Rateio'}
                      {catRateio ? ` · ${catRateio.icon} ${catRateio.name}` : ''}:
                    </span>
                    <span className="text-texto-2 font-medium">{fmt(r.valor)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {schedule.transactionType === 'transfer' ? (
            <p className="text-xs text-texto-3 mt-0.5 whitespace-normal break-words">
              <span className="text-transferencia">↔</span>{' '}
              {acc?.apelido || acc?.name || '?'} → {toAcc?.apelido || toAcc?.name || '?'}
            </p>
          ) : acc ? (
            <p className="text-xs text-texto-3 mt-0.5 whitespace-normal break-words">{acc.apelido || acc.name}</p>
          ) : null}
          {/* Abaixo de 1440px a coluna Favorecido some: o favorecido aparece aqui. */}
          {schedule.payee && (
            <p className="min-[1440px]:hidden text-xs text-texto-3 mt-0.5 truncate" title={schedule.payee}>{schedule.payee}</p>
          )}
        </td>

        {/* Categoria */}
        <td className="px-3 py-3 hidden md:table-cell max-w-[160px]">
          {cat
            ? <span className="block truncate text-xs text-texto-2" title={`${cat.icon} ${cat.name}`}>{cat.icon} {cat.name}</span>
            : <span className="text-texto-3 text-xs">—</span>}
        </td>

        {/* Favorecido */}
        <td className="px-3 py-3 hidden min-[1440px]:table-cell max-w-[140px]">
          <span className="text-xs text-texto-2 truncate block" title={schedule.payee || undefined}>{schedule.payee || <span className="text-texto-3">—</span>}</span>
        </td>

        {/* Valor */}
        <td className="px-3 py-3 whitespace-nowrap text-right">
          <span className={`text-sm font-bold ${schedule.transactionType === 'income' ? 'text-receita' : isDepositoReserva ? 'text-reserva' : isResgateReserva ? 'text-despesa' : schedule.transactionType === 'transfer' ? 'text-transferencia' : 'text-despesa'}`}>
            {fmt(effAmount)}
          </span>
        </td>

        {/* Frequência */}
        <td className="px-3 py-3 w-24 whitespace-nowrap hidden min-[1440px]:table-cell">
          <span className="text-xs text-texto-3">{FREQ_LABELS[schedule.frequency] || schedule.frequency}</span>
        </td>

        {/* Ações */}
        <td className={`px-3 py-3 w-px whitespace-nowrap align-middle ${acoesFixas}`}>
          <div className="flex flex-col items-end gap-1.5">
          {futura && (
            <span className="text-[11px] text-texto-3 whitespace-nowrap" title="As ações valem para a próxima ocorrência pendente">
              Antes, efetive a de {fmtDate(futura.antesDe).slice(0, 5)}
            </span>
          )}
          {!futura && ((isProvisaoPendente && podeEditar) || nCobertas > 0 || nDuplicados > 0) && (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isProvisaoPendente && podeEditar && (
              <button
                onClick={() => setShowEfetivar(true)}
                title="Efetivar Provisão — informar valor e data reais"
                className="flex items-center gap-1 h-7 px-2.5 text-xs bg-ambar/15 text-ambar rounded-md hover:bg-ambar/25 transition-colors font-medium"
              >
                <Hourglass size={12} /> Efetivar Provisão
              </button>
            )}
            {nDuplicados > 0 && (
              <button
                type="button"
                onClick={() => podeEditar && setShowPay(true)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-aviso/15 text-aviso whitespace-nowrap"
                title={`O registro automático não criou esta ocorrência: já existe um lançamento parecido (ocorrência ↔ lançamento):\n${tituloDuplicados}\nAbra para vincular a ele ou registrar mesmo assim.`}
              >
                ⚠ possível duplicado — confira{nDuplicados > 1 ? ` (${nDuplicados})` : ''}
              </button>
            )}
            {nCobertas > 0 && (
              <>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-aviso/15 text-aviso whitespace-nowrap"
                  title={`Já lançado no cartão (ocorrência ↔ lançamento):\n${tituloCobertas}\nFica fora do fluxo e dos previstos.`}
                >
                  ⚠ Duplicado – já no cartão{nCobertas > 1 ? ` (${nCobertas})` : ''}
                </span>
                {podeEditar && <button
                  onClick={() => { const n = baixarComoJaNoCartao(schedule.id); if (n) onToast?.(`${n} ocorrência${n !== 1 ? 's' : ''} baixada${n !== 1 ? 's' : ''} como já no cartão`) }}
                  title="Marca as ocorrências cobertas como baixadas (tipo 'já no cartão'), apontando o lançamento do cartão — não cria lançamento"
                  className="flex items-center gap-1 h-7 px-2.5 text-xs bg-ambar/15 text-ambar rounded-md hover:bg-ambar/25 transition-colors font-medium"
                >
                  <CheckCircle size={12} /> Baixar como já no cartão
                </button>}
              </>
            )}
          </div>
          )}
          <div className="flex items-center justify-end gap-1 flex-nowrap">
            {nextDate && podeEditar && !futura && (
              <>
                <button
                  onClick={() => setShowPay(true)}
                  title="Pagar"
                  aria-label="Pagar"
                  className="flex items-center justify-center gap-1 h-8 min-w-8 px-2 text-xs bg-receita/15 text-receita rounded-md hover:bg-receita/25 transition-colors font-medium"
                >
                  <CheckCircle size={12} /> <span className="hidden 2xl:inline">Pagar</span>
                </button>
                <button
                  onClick={() => setShowEstornar(true)}
                  title="Estornar"
                  aria-label="Estornar"
                  className="flex items-center justify-center gap-1 h-8 min-w-8 px-2 text-xs bg-despesa/15 text-despesa rounded-md hover:bg-despesa/25 transition-colors font-medium"
                >
                  <RotateCcw size={12} /> <span className="hidden 2xl:inline">Estornar</span>
                </button>
                <button
                  onClick={handlePular}
                  title={isRecorrente ? 'Pular — esta ocorrência (avança para a próxima)' : 'Pular — cancela o agendamento único'}
                  aria-label="Pular"
                  className="flex items-center justify-center gap-1 h-8 min-w-8 px-2 text-xs bg-surface-2 ring-1 ring-inset ring-borda-forte text-texto-2 rounded-md hover:bg-surface-hover transition-colors font-medium"
                >
                  <SkipForward size={12} /> <span className="hidden 2xl:inline">Pular</span>
                </button>
              </>
            )}
            <button onClick={() => setShowHistorico(true)} className="btn-amber w-8 h-8 p-0 justify-center relative shrink-0" title="Histórico de alterações" aria-label="Histórico">
              <History size={13} />
              {comHistorico && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary-fg" />}
            </button>
            {podeEditar && <button onClick={() => onEditSchedule(schedule)} className="btn-amber w-8 h-8 p-0 justify-center shrink-0" title="Editar agendamento" aria-label="Editar">
              <Edit2 size={13} />
            </button>}
            {podeExcluir && !futura && <button onClick={() => setShowExcluir(true)} className="btn-amber w-8 h-8 p-0 justify-center shrink-0 hover:text-perigo hover:border-perigo/50 hover:bg-perigo-bg" title="Excluir agendamento" aria-label="Excluir">
              <Trash2 size={13} />
            </button>}
          </div>
          </div>
        </td>
      </tr>

      {/* Painel inline: ocorrências futuras seguintes (faturas futuras com valor dinâmico,
          ou próximas ocorrências de recorrente com valor fixo). Somente visual. */}
      {expanded && canExpand && (
        <tr className="bg-surface/40 border-b border-borda/50">
          <td colSpan={cols} className="px-3 py-2">
            <div className="pl-6 space-y-3">
              {hasFuture && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-texto-3 mb-1">Próximas ocorrências</p>
                  <ul className="space-y-0.5 max-w-md">
                    {futureItems.map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-4 text-xs py-0.5 border-b border-borda/30 last:border-0">
                        <span className="text-texto-2">{fmtDate(it.date)}</span>
                        <span className="text-texto-2 font-medium">{fmt(it.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hasHistory && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-texto-3 mb-1">
                    Histórico de Pagamentos <span className="text-texto-3">({paymentHistory.length})</span>
                  </p>
                  <div className="max-w-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-texto-3">
                          <th className="text-left font-medium py-0.5 pr-4">Prevista</th>
                          <th className="text-left font-medium py-0.5 pr-4">Paga em</th>
                          <th className="text-right font-medium py-0.5">Valor pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentHistory.map((h, i) => (
                          <tr key={i} className="border-b border-borda/30 last:border-0">
                            <td className="text-texto-2 py-0.5 pr-4 whitespace-nowrap">{fmtDate(h.prevista)}</td>
                            <td className="text-texto-2 py-0.5 pr-4 whitespace-nowrap">{h.efetiva ? fmtDate(h.efetiva) : '—'}</td>
                            <td className="text-texto-2 font-medium py-0.5 text-right whitespace-nowrap">{fmt(h.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {showHistorico && (
        <HistoricoModal open onClose={() => setShowHistorico(false)} entidade="agendamento" entidadeId={schedule.id} serieKey={serieKeyDe({ agendamento: schedule })} />
      )}
      {showPay && (
        <PayModal
          schedule={schedule}
          nextDate={nextDate}
          accounts={accounts}
          categories={categories}
          gerencialGroups={gerencialGroups}
          addTransaction={addTransaction}
          markScheduleRegistered={markScheduleRegistered}
          onClose={() => setShowPay(false)}
        />
      )}

      {showEstornar && (
        <EstornarModal
          schedule={schedule}
          nextDate={nextDate}
          accounts={accounts}
          onClose={() => setShowEstornar(false)}
          onConfirm={() => { skipScheduleOccurrence(schedule.id, nextDate); setShowEstornar(false) }}
        />
      )}

      {showExcluir && (
        <ExcluirModal
          schedule={schedule}
          nextDate={nextDate}
          onClose={() => setShowExcluir(false)}
          onConfirm={() => { deleteSchedule(schedule.id); setShowExcluir(false) }}
        />
      )}

      <ConfirmDialog
        open={showPularUnico}
        onClose={() => setShowPularUnico(false)}
        onConfirm={() => deleteSchedule(schedule.id)}
        title="Pular Agendamento"
        message="Este agendamento é único e não terá próxima ocorrência. Pular irá cancelá-lo permanentemente. Confirmar?"
        confirmLabel="Confirmar"
        danger
      />

      {showEfetivar && (
        <EfetivarProvisaoModal
          schedule={schedule}
          accounts={accounts}
          onClose={() => setShowEfetivar(false)}
          onConfirm={(payload) => { efetivarProvisao(schedule.id, payload); setShowEfetivar(false) }}
        />
      )}

      {showBreakdown && (
        <ResgateBreakdownModal
          schedule={schedule}
          transactions={transactions}
          schedules={todosSchedules}
          categories={categories}
          onClose={() => setShowBreakdown(false)}
        />
      )}
    </>
  )
}

// Modal de "Efetivar Provisão": edita valor e data REAIS.
//   • Provisão "Uma vez": ao confirmar, grava valor/data no registro e o marca como efetivado.
//   • Provisão recorrente: efetiva apenas a próxima ocorrência (override) e avança a série; o
//     botão volta a ficar disponível para a ocorrência seguinte.
// Havendo função de reserva, gera o resgate real (transferência reserva → conta principal).
function EfetivarProvisaoModal({ schedule, accounts, onClose, onConfirm }) {
  const { reserveFunctions, getProximaProvisaoOccurrence } = useApp()
  const isOnce = (schedule.frequency || 'once') === 'once'
  // Ocorrência alvo (recorrente): primeira ainda não efetivada.
  const occDate = isOnce ? null : getProximaProvisaoOccurrence(schedule)
  const ov = !isOnce && occDate ? schedule.overrides?.[occDate] : null

  const [amount, setAmount] = useState(String(ov?.amount ?? schedule.amount ?? ''))
  const [date, setDate] = useState(ov?.date || (isOnce ? schedule.startDate : occDate) || format(new Date(), 'yyyy-MM-dd'))

  const func = schedule.reservaFuncaoId
    ? (reserveFunctions || []).find(f => f.id === schedule.reservaFuncaoId)
    : null
  const contaReserva = func?.accountId ? accounts.find(a => a.id === func.accountId) : null
  const valido = Number(amount) > 0 && !!date

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda">
          <h3 className="font-semibold text-texto-1 flex items-center gap-2">
            <Hourglass size={15} className="text-texto-2" /> Efetivar Provisão
          </h3>
          <button onClick={onClose} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-texto-3">Provisão</p>
            <p className="text-sm text-texto-1 font-medium">{schedule.description}</p>
            {!isOnce && occDate && (
              <p className="text-xs text-texto-2 mt-1">
                Ocorrência de {fmtDate(occDate)} · {FREQ_LABELS[schedule.frequency] || schedule.frequency}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Valor real (R$) *</label>
              <input
                type="number" step="0.01" min="0.01" className="input"
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
              />
            </div>
            <div>
              <label className="label">Data real *</label>
              <input
                type="date" className="input"
                value={date} onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {func ? (
            <div className="p-3 bg-reserva/10 border border-reserva/20 rounded-lg text-xs text-texto-2 leading-snug">
              Será criado um resgate (transferência) de{' '}
              <span className="font-semibold">{contaReserva?.apelido || contaReserva?.name || 'conta da reserva'}</span>{' '}
              → conta principal, vinculado à função <span className="font-semibold">{func.name}</span>.
            </div>
          ) : (
            <p className="text-xs text-texto-3 leading-snug">
              Sem reserva vinculada — apenas o valor e a data serão atualizados.
            </p>
          )}

          {!isOnce && (
            <p className="text-xs text-texto-3 leading-snug">
              A série continua: as próximas ocorrências permanecem como provisão e poderão ser
              efetivadas depois.
            </p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-borda">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            disabled={!valido}
            onClick={() => valido && onConfirm({ amount: Number(amount), date, occurrenceDate: occDate })}
          >
            <CheckCircle size={14} /> Efetivar
          </button>
        </div>
      </div>
    </div>
  )
}

// Valor EFETIVO da ocorrência pendente de uma linha (override da prévia aplicado).
const valorOcorrencia = (r) => Number(r.nextDate ? occEfetiva(r.schedule, r.nextDate).amount : r.schedule.amount) || 0

// Resumo do registro em lote: aplicações × resgates → líquido por par de contas (com o sentido do
// dinheiro), impacto por conta e, à parte, despesas/receitas/fatura/transferências comuns.
function ResumoLinha({ glyph, label, n, valor, cls }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-texto-2 min-w-0 truncate">
        {glyph && <span className={`${cls} mr-1`}>{glyph}</span>}{label} <span className="text-texto-3">({n})</span>
      </span>
      <span className={`font-semibold shrink-0 tabular-nums ${cls}`}>{fmt(valor)}</span>
    </div>
  )
}

function ResumoLote({ resumo }) {
  const { g, pares, liquidoReserva, impactoPorConta } = resumo
  const temReserva = g.aplicacao.items.length > 0 || g.resgate.items.length > 0
  const frase = (p) => p.sentido === 'zero'
    ? 'Sem movimentação líquida (aplicações = resgates)'
    : `${p.sentido === 'resgate' ? 'Resgate' : 'Aplicação'} líquid${p.sentido === 'resgate' ? 'o' : 'a'} de ${fmt(Math.abs(p.liquido))}: ${p.origemNome} → ${p.destinoNome}`
  const outros = [
    ['despesa', '↓', 'Saídas (despesas)', 'text-despesa'],
    ['receita', '↑', 'Entradas (receitas)', 'text-receita'],
    ['fatura', '🧾', 'Pagamento de fatura', 'text-texto-2'],
    ['transferencia', '⇄', 'Transferências', 'text-transferencia'],
  ].filter(([k]) => g[k].items.length > 0)

  return (
    <div className="px-3 py-2.5 bg-surface-2/60 rounded-lg text-xs space-y-1">
      {temReserva && (
        <>
          <ResumoLinha glyph="↑" label="Aplicações" n={g.aplicacao.items.length} valor={g.aplicacao.total} cls="text-reserva" />
          <ResumoLinha glyph="↓" label="Resgates" n={g.resgate.items.length} valor={g.resgate.total} cls="text-despesa" />
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-borda">
            <span className="text-sm font-semibold text-texto-1">Líquido</span>
            <span className="text-sm font-bold text-primary-fg tabular-nums">{fmt(Math.abs(liquidoReserva))}</span>
          </div>
          {pares.map(p => (
            <p key={`${p.contaId}|${p.reservaId}`} className={`leading-snug ${p.sentido === 'resgate' ? 'text-despesa' : p.sentido === 'aplicacao' ? 'text-reserva' : 'text-texto-3'}`}>
              → {frase(p)}
            </p>
          ))}
          {impactoPorConta.length > 0 && (
            <p className="text-[11px] text-texto-3 leading-snug break-words">
              Impacto por conta:{' '}
              {impactoPorConta.map((c, i) => (
                <span key={c.accountId} className="whitespace-nowrap">
                  {i > 0 && ' · '}{c.nome} <span className={c.delta > 0 ? 'text-receita' : 'text-despesa'}>{fmtSinal(c.delta)}</span>
                </span>
              ))}
            </p>
          )}
        </>
      )}
      {outros.length > 0 && (
        <div className={`space-y-1 ${temReserva ? 'pt-1 mt-1 border-t border-borda' : ''}`}>
          {outros.map(([k, glyph, label, cls]) => (
            <ResumoLinha key={k} glyph={glyph} label={label} n={g[k].items.length} valor={g[k].total} cls={cls} />
          ))}
        </div>
      )}
    </div>
  )
}

function BatchRegisterModal({ selectedRows, accounts, onConfirm, onClose }) {
  const { scheduleReservaFuncoes } = useApp()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  // Valor efetivo da ocorrência pendente — valor inicial do input.
  const valorDe = valorOcorrencia
  // Resgate com detalhamento por função: o valor vem das linhas do detalhamento (igual ao
  // registro individual, que também não deixa editá-lo).
  const comDetalhe = useMemo(
    () => new Set((scheduleReservaFuncoes || []).map(srf => srf.scheduleId)),
    [scheduleReservaFuncoes]
  )
  // Por linha: valor (texto) e data; dataEditada = o usuário mexeu na data daquela linha, e a
  // data geral do topo deixa de sobrescrevê-la.
  const [itens, setItens] = useState(() => Object.fromEntries(selectedRows.map(r => [
    r.schedule.id, { valor: valorParaInput(valorDe(r)), date: format(new Date(), 'yyyy-MM-dd'), dataEditada: false },
  ])))
  const setItem = (id, patch) => setItens(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  const onDataGeral = (v) => {
    setDate(v)
    setItens(prev => Object.fromEntries(Object.entries(prev).map(([id, it]) => [id, it.dataEditada ? it : { ...it, date: v }])))
  }

  const valorItem = (r) => (comDetalhe.has(r.schedule.id) ? valorDe(r) : parseValorBR(itens[r.schedule.id]?.valor))
  const invalido = (r) => {
    const v = valorItem(r)
    return !(Number.isFinite(v) && v > 0) || !itens[r.schedule.id]?.date
  }
  const algumInvalido = selectedRows.some(invalido)
  // Recalculado a cada edição de valor (mesma função do painel de seleção).
  const resumo = resumoSelecao(selectedRows.map(r => ({ schedule: r.schedule, amount: valorItem(r) })), accounts)

  const confirmar = () => {
    if (algumInvalido) return
    onConfirm(selectedRows.map(r => ({
      scheduleId: r.schedule.id,
      // Detalhado: null → registerScheduleOccurrence usa o detalhamento.
      amount: comDetalhe.has(r.schedule.id) ? null : Math.round(valorItem(r) * 100) / 100,
      date: itens[r.schedule.id].date,
    })))
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
          <h3 className="font-semibold text-texto-1">
            Registrar {selectedRows.length} agendamento{selectedRows.length !== 1 ? 's' : ''}
          </h3>
          <button onClick={onClose} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Date picker */}
          <div>
            <label className="label">Data de registro</label>
            <DateInput
              className="input"
              value={date}
              onChange={e => onDataGeral(e.target.value)}
            />
            <p className="text-[11px] text-texto-3 mt-1">Aplicada a todos os itens cuja data não foi alterada individualmente.</p>
          </div>

          {/* List of selected items */}
          <div className="rounded-lg border border-borda overflow-hidden">
            {selectedRows.map((r) => {
              const { schedule, nextDate } = r
              const acc = accounts.find(a => a.id === schedule.accountId)
              const valueColor = schedule.transactionType === 'income' ? 'text-receita'
                : schedule.transactionType === 'transfer' ? 'text-transferencia'
                : 'text-despesa'
              const it = itens[schedule.id]
              const detalhado = comDetalhe.has(schedule.id)
              const ruim = invalido(r)
              const grupo = classificarAgendamento(schedule, accounts)
              const seta = grupo === 'aplicacao' ? { g: '↑', cls: 'text-reserva', t: 'Aplicação' }
                : grupo === 'resgate' ? { g: '↓', cls: 'text-despesa', t: 'Resgate' }
                : null
              return (
                <div
                  key={schedule.id}
                  className={`px-3 py-2.5 border-b border-borda/80 last:border-0 space-y-2 ${ruim ? 'bg-perigo-bg border-l-2 border-l-perigo' : 'hover:bg-surface-hover/30'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-texto-1 truncate">{schedule.description}</p>
                      <p className="text-xs text-texto-3 mt-0.5">
                        {acc?.apelido || acc?.name || '—'} · prev. {fmtDate(nextDate)}
                      </p>
                    </div>
                    {seta && (
                      <span className={`text-sm font-bold shrink-0 ${seta.cls}`} title={seta.t} aria-label={seta.t}>{seta.g}</span>
                    )}
                    {detalhado ? (
                      <span className={`text-xs font-bold shrink-0 ${valueColor}`} title="Valor definido pelo detalhamento por função">
                        {fmt(valorDe(r))}
                      </span>
                    ) : (
                      <div className="relative shrink-0 w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-texto-3 pointer-events-none">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`input !py-1 !pl-7 !pr-2 text-xs text-right font-bold ${valueColor} ${ruim ? '!border-perigo' : ''}`}
                          value={it?.valor ?? ''}
                          onChange={e => setItem(schedule.id, { valor: e.target.value })}
                          onBlur={() => {
                            const v = parseValorBR(it?.valor)
                            if (Number.isFinite(v) && v > 0) setItem(schedule.id, { valor: valorParaInput(v) })
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                          aria-label={`Valor de ${schedule.description}`}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[11px] ${ruim ? 'text-perigo' : 'text-texto-3'}`}>
                      {ruim ? (it?.date ? 'Informe um valor maior que zero.' : 'Informe a data.') : detalhado ? 'Valor do detalhamento por função' : 'Data do lançamento'}
                    </span>
                    <DateInput
                      className="input !py-1 !px-2 text-xs w-36 shrink-0"
                      value={it?.date || ''}
                      onChange={e => setItem(schedule.id, { date: e.target.value, dataEditada: true })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Resumo (fixo acima dos botões; rola sozinho se crescer demais) */}
        <div className="px-5 pt-3 shrink-0 max-h-[40vh] overflow-y-auto border-t border-borda">
          <ResumoLote resumo={resumo} />
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            disabled={algumInvalido}
            onClick={confirmar}
          >
            <CheckCircle size={14} /> Confirmar Registro
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ message }) {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 bg-surface border border-primary/30 text-texto-1 text-sm px-4 py-3 rounded-xl shadow-2xl pointer-events-none">
      <CheckCircle size={16} className="text-primary-fg shrink-0" />
      {message}
    </div>
  )
}

// Totalizador da seleção múltipla: metadados de exibição por grupo de movimentação.
const SELECTION_GROUP_META = {
  aplicacao: { glyph: '↑', label: 'Aplicação', cls: 'text-reserva' },
  resgate:   { glyph: '↓', label: 'Resgate',   cls: 'text-despesa' },
  despesa:   { glyph: '↓', label: 'Despesas',  cls: 'text-despesa' },
  receita:   { glyph: '↑', label: 'Receitas',  cls: 'text-receita' },
  fatura:    { glyph: '🧾', label: 'Fatura',    cls: 'text-texto-2' },
  transferencia: { glyph: '⇄', label: 'Transferências', cls: 'text-transferencia' },
}
const SELECTION_GROUP_ORDER = GRUPOS_SELECAO

// `calendario` ({ status, faturas, pagosLinhas, renderFatura }): mostra a Visão Calendário em vez da
// tabela, com as MESMAS linhas (buildScheduleGroups) e a mesma linha de ações (ScheduleRow).
function SchedulesTable({ schedules, categories, accounts, gerencialGroups, addTransaction, markScheduleRegistered, deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences, efetivarProvisao, onNewSchedule, onEditSchedule, agruparSeries = true, pagosLinhas = null, calendario = null }) {
  const { profiles, setAvisoOperacao, scheduleReservaFuncoes, reserveFunctions, toggleScheduleConfirmado, getProximaProvisaoOccurrence, rateiosByLancamento, tiposDocumento, setTipoDocumentoEmMassa, pode, definirSincronizarAgenda } = useApp()
  // Seleção (registrar/pular/definir tipo em massa) só para quem edita agendamentos.
  const podeSelecionar = pode('agendamentos', 'editar')
  // Detalhamento por função (resgate_reserva): scheduleId → [{ name, valor }] (maior 1º).
  const srfBySchedule = useMemo(() => {
    const funcName = new Map((reserveFunctions || []).map(f => [f.id, f.name]))
    // 1 linha por lançamento → agrupa por (agendamento, função) somando, para exibir 1 linha por função.
    const byId = new Map() // scheduleId → Map(funcId → soma)
    for (const srf of (scheduleReservaFuncoes || [])) {
      if (!byId.has(srf.scheduleId)) byId.set(srf.scheduleId, new Map())
      const fm = byId.get(srf.scheduleId)
      fm.set(srf.reservaFuncaoId, (fm.get(srf.reservaFuncaoId) || 0) + (Number(srf.valor) || 0))
    }
    const m = new Map()
    for (const [schedId, fm] of byId) {
      const arr = [...fm]
        .map(([funcId, valor]) => ({ name: funcName.get(funcId) || 'Função', valor: Math.round(valor * 100) / 100 }))
        .sort((a, b) => b.valor - a.valor)
      m.set(schedId, arr)
    }
    return m
  }, [scheduleReservaFuncoes, reserveFunctions])

  const today = format(new Date(), 'yyyy-MM-dd')
  const isMobile = useIsMobile()
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [showBatchRegister, setShowBatchRegister] = useState(false)
  const [showBatchSkip, setShowBatchSkip] = useState(false)
  const [toast, setToast] = useState(null)
  // Edição em massa do tipo de documento: '' | id do tipo | SEM_TIPO (remover).
  const [tipoMassa, setTipoMassa] = useState('')
  const [motivoMassa, setMotivoMassa] = useState('')
  const [aplicandoTipo, setAplicandoTipo] = useState(false)

  // Linhas aglutinadas: 1 por agendamento lógico (séries de fatura colapsadas; recorrentes
  // com ocorrências futuras em futureItems). Particionamento/seleção seguem usando nextDate.
  const rows = useMemo(
    () => buildScheduleGroups(schedules, getNextOccurrences, { agruparSeries }),
    [schedules, getNextOccurrences, agruparSeries]
  )

  // Particionamento por DATA usa displayDate (mesma data mostrada na linha e no formulário);
  // seleção/ações continuam por nextDate (ocorrência real).
  const overdue    = rows.filter(r => r.displayDate && r.displayDate < today).sort((a, b) => a.displayDate.localeCompare(b.displayDate))
  const next7      = rows.filter(r => r.displayDate && r.displayDate >= today && r.displayDate <= in7).sort((a, b) => a.displayDate.localeCompare(b.displayDate))
  const next30     = rows.filter(r => r.displayDate && r.displayDate > in7 && r.displayDate <= in30).sort((a, b) => a.displayDate.localeCompare(b.displayDate))
  const future     = rows.filter(r => r.displayDate && r.displayDate > in30).sort((a, b) => a.displayDate.localeCompare(b.displayDate))
  const completed  = rows.filter(r => !r.nextDate).sort((a, b) => (b.schedule.startDate || '').localeCompare(a.schedule.startDate || ''))

  // Selecionável = registro real (sintéticos — envelope, resgate previsto sch:… — nunca). Registrar/
  // pular só valem para quem tem próxima ocorrência (selectedRows); o tipo de documento, para todos.
  const selectableRows = rows.filter(r => !ehSintetico(r.schedule))
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selected.has(r.schedule.id))
  const selectedRows = rows.filter(r => selected.has(r.schedule.id) && r.nextDate)
  const selectedIds = selectableRows.filter(r => selected.has(r.schedule.id)).map(r => r.schedule.id)

  // Lista mudou (ex.: filtro de contas) → tira da seleção o que ficou oculto (nunca re-seleciona).
  // Ajuste durante o render, sem effect: React reprocessa antes de pintar.
  const [rowsAnteriores, setRowsAnteriores] = useState(rows)
  if (rowsAnteriores !== rows) {
    setRowsAnteriores(rows)
    const visiveis = new Set(selectableRows.map(r => r.schedule.id))
    if ([...selected].some(id => !visiveis.has(id))) {
      setSelected(new Set([...selected].filter(id => visiveis.has(id))))
    }
  }

  // Totalizador dinâmico da seleção: agrupa por tipo de movimentação e calcula o saldo
  // líquido de caixa (receita + resgate − despesa − aplicação). Fatura é grupo à parte,
  // fora do saldo. Atualiza em tempo real conforme a seleção muda.
  // Valor = efetivo da próxima ocorrência (o mesmo que o modal de registro em lote pré-preenche).
  const selectionTotals = useMemo(
    () => resumoSelecao(selectedRows.map(r => ({ schedule: r.schedule, amount: valorOcorrencia(r) })), accounts),
    [selectedRows, accounts]
  )

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableRows.map(r => r.schedule.id)))
    }
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelected(new Set())
  }

  const showToastMsg = (message) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }


  // occurrenceDate = ocorrência a baixar (nextDate); txDate = data dos lançamentos criados.
  // Registrar a ocorrência em nextDate (e não em txDate) é o que faz o agendamento avançar —
  // mesmo comportamento do pagamento individual (PayModal usa regDate = nextDate).
  const registerWithGerencial = (scheduleBase, occurrenceDate, txDate, amountArg = null) => {
    const schedule = comCamposDaOcorrencia(scheduleBase, occurrenceDate, accounts)
    // Grupo numerado gera resgate para a Conta central do PERFIL DA CONTA DO AGENDAMENTO: sem ela,
    // esta ocorrência não é registrada (as outras do lote seguem).
    const grupo = schedule.grupoGerencial ? gerencialGroups.find(g => g.id === schedule.grupoGerencial) : null
    const precisaCentral = grupo && grupo.number !== 'D' && grupo.number !== 1 && accounts.some(a => a.id === grupo.defaultAccountId)
    const central = precisaCentral ? contaCentralParaId(accounts, profiles, schedule.accountId) : { conta: null, erro: null }
    if (central.erro) { setAvisoOperacao(central.erro); return }
    const contaPrincipal = central.conta
    registerScheduleOccurrence(schedule.id, txDate, occurrenceDate, amountArg)
    if (!schedule.grupoGerencial) return
    const amount = amountArg != null ? Number(amountArg) : (Number(occEfetiva(schedule, occurrenceDate).amount) || 0)
    if (!grupo || grupo.number === 'D') return
    if (grupo.number === 1) {
      const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
      if (schedule.accountId && contaReserva) {
        addTransaction({ type: 'transfer', accountId: schedule.accountId, toAccountId: contaReserva.id, amount, date: txDate, description: `Reserva ${grupo.name}`, grupoGerencial: grupo.id, origin: ORIGIN.AGENDAMENTO })
      }
    } else {
      const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
      if (contaResgate && contaPrincipal) {
        addTransaction({ type: 'transfer', accountId: contaResgate.id, toAccountId: contaPrincipal.id, amount, date: txDate, description: `Resgate ${grupo.name}`, grupoGerencial: grupo.id, origin: ORIGIN.AGENDAMENTO })
      }
    }
  }

  // itens: [{ scheduleId, amount, date }] — valor e data por linha, editados no modal.
  const handleBatchRegister = (itens) => {
    const count = selectedRows.length
    const porId = new Map(itens.map(it => [it.scheduleId, it]))
    selectedRows.forEach(({ schedule, nextDate }) => {
      const it = porId.get(schedule.id)
      if (!it) return
      registerWithGerencial(schedule, nextDate || it.date, it.date, it.amount)
    })
    cancelSelection()
    setShowBatchRegister(false)
    showToastMsg(`${count} lançamento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''} com sucesso`)
  }

  // Aplica (ou remove) o tipo de documento em todos os selecionados: uma transação no banco e o
  // estado atualizado na hora (sem reload). A seleção é limpa — com o filtro "Sem tipo" ativo os
  // itens saem da lista.
  const aplicarTipoMassa = async () => {
    if (!tipoMassa || selectedIds.length === 0) return
    setAplicandoTipo(true)
    try {
      const remover = tipoMassa === SEM_TIPO
      const n = await setTipoDocumentoEmMassa(selectedIds, remover ? null : tipoMassa, { loteId: novoLoteId(), motivo: motivoMassa.trim() || null })
      const sigla = remover ? '' : (tiposDocumento.find(t => t.id === tipoMassa)?.sigla || '')
      showToastMsg(remover
        ? `Tipo de documento removido de ${n} agendamento${n !== 1 ? 's' : ''}. Histórico registrado.`
        : `Tipo ${sigla} aplicado em ${n} agendamento${n !== 1 ? 's' : ''}. Histórico registrado.`)
      setSelected(new Set())
      setTipoMassa('')
      setMotivoMassa('')
    } catch (err) {
      showToastMsg(`Falha ao aplicar o tipo: ${err?.message || 'erro'}`)
    } finally {
      setAplicandoTipo(false)
    }
  }

  const handleBatchSkip = () => {
    const count = selectedRows.length
    selectedRows.forEach(({ schedule, nextDate }) => skipScheduleOccurrence(schedule.id, nextDate))
    cancelSelection()
    setShowBatchSkip(false)
    showToastMsg(`${count} agendamento${count !== 1 ? 's' : ''} pulado${count !== 1 ? 's' : ''}`)
  }

  if (schedules.length === 0 && !calendario) {
    return (
      <div className="card text-center py-12">
        <Calendar size={32} className="text-texto-3 mx-auto mb-3" />
        <p className="text-texto-3">Nenhum agendamento encontrado</p>
        <button className="btn-primary mt-4" onClick={onNewSchedule}>Criar primeiro agendamento</button>
      </div>
    )
  }

  const cols = selectionMode ? 10 : 9
  const rowProps = {
    categories, accounts, gerencialGroups, addTransaction, markScheduleRegistered,
    registerScheduleOccurrence, skipScheduleOccurrence,
    deleteSchedule, getNextOccurrences, onToast: showToastMsg,
    onEditSchedule, efetivarProvisao, getProximaProvisaoOccurrence,
    selectionMode, onToggleSelect: toggleSelect,
    srfBySchedule, onToggleConfirmado: toggleScheduleConfirmado,
    // Rateios indexados pelo id do AGENDAMENTO — é assim que a tabela é usada para agendamento
    // (ver criarRateiosParcela). Serve a parcela de financiamento, que exibe principal e juros
    // como duas linhas sob o valor cheio, mas vale para qualquer agendamento rateado.
    rateiosBySchedule: rateiosByLancamento,
    tiposDocumento,
    cols,
  }

  if (calendario) {
    return (
      <>
        <AgendaCalendario
          rows={rows}
          faturas={calendario.faturas}
          pagosLinhas={calendario.pagosLinhas}
          status={calendario.status}
          getNextOccurrences={getNextOccurrences}
          accounts={accounts}
          hoje={today}
          isMobile={isMobile}
          renderFatura={calendario.renderFatura}
          renderLinha={(item, { mobile }) => (
            <ScheduleRow
              key={item.key}
              schedule={item.schedule}
              nextDate={item.row.nextDate}
              futureItems={item.proxima ? (item.row.futureItems || []) : []}
              isSerie={item.row.isSerie}
              futura={item.proxima ? null : { data: item.data, amount: item.amount, antesDe: item.antesDe }}
              {...rowProps}
              selectionMode={false}
              isSelected={false}
              detalheMobile={mobile}
            />
          )}
        />
        {toast && <Toast message={toast} />}
      </>
    )
  }

  // Celular: lista por semana (AgendaMobile) — o status (A pagar/Provisões/Pagos) vem da barra do
  // topo; com `pagosLinhas` mostra os pagos. Tocar num item abre a linha da tabela com todas as
  // ações de sempre. No modo de seleção (ações em massa) volta para a tabela abaixo.
  if (isMobile && !selectionMode) {
    return (
      <>
        <AgendaMobile
          rows={rows}
          schedules={schedules}
          getNextOccurrences={getNextOccurrences}
          today={today}
          onSelecionar={selectableRows.length > 0 && podeSelecionar ? () => setSelectionMode(true) : null}
          pagosLinhas={pagosLinhas}
          renderDetalhe={({ schedule, nextDate, futureItems, isSerie }) => (
            <table className="w-full text-sm">
              <tbody>
                <ScheduleRow schedule={schedule} nextDate={nextDate} futureItems={futureItems || []} isSerie={isSerie} {...rowProps} isSelected={false} detalheMobile />
              </tbody>
            </table>
          )}
        />
        {toast && <Toast message={toast} />}
      </>
    )
  }

  return (
    <>
      {/* Selection action bar */}
      {selectionMode && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-primary-fg">
              {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            {/* Totalizador por movimentação (apenas grupos com itens selecionados) */}
            {selected.size > 0 && (
              <div className="flex flex-col gap-0.5 text-xs">
                {SELECTION_GROUP_ORDER.map(key => {
                  const grp = selectionTotals.g[key]
                  if (!grp.items.length) return null
                  const meta = SELECTION_GROUP_META[key]
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-1.5">
                        <span className={meta.cls}>{meta.glyph}</span>
                        <span className="text-texto-2 font-medium">{meta.label}:</span>
                        <span className={`font-semibold ${meta.cls}`}>{fmt(grp.total)}</span>
                      </div>
                      {grp.items.length > 1 && (
                        <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                          {grp.items.map((it, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-texto-3">
                              <span className="truncate max-w-[180px]">{it.description}</span>
                              <span className="shrink-0">{fmt(it.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {selectionTotals.showSaldo && (
                  <div className="flex items-center gap-1.5 pt-1 mt-0.5 border-t border-primary/20">
                    <span className="text-texto-2">=</span>
                    <span className="text-texto-2 font-medium">Saldo:</span>
                    <span className={`font-bold ${selectionTotals.saldo < 0 ? 'text-despesa' : 'text-receita'}`}>{fmtSinal(selectionTotals.saldo)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowBatchRegister(true)}
              disabled={selectedRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-receita/15 text-receita hover:bg-receita/25 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle size={12} /> Registrar selecionados
            </button>
            <button
              onClick={() => setShowBatchSkip(true)}
              disabled={selectedRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 ring-1 ring-inset ring-borda-forte text-texto-2 hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward size={12} /> Pular selecionados
            </button>
            {/* Agenda do celular (em lote): marca/desmarca e envia o feed na hora */}
            {podeSelecionar && (
              <div className="flex items-center gap-1.5 sm:pl-2 sm:border-l border-primary/20">
                <button
                  onClick={() => { const n = definirSincronizarAgenda(selectedIds, true); showToastMsg(`${n} agendamento${n !== 1 ? 's' : ''} na agenda do celular`) }}
                  disabled={selectedIds.length === 0}
                  title="Sincronizar os selecionados com a agenda do celular"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 ring-1 ring-inset ring-borda-forte text-texto-2 hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Smartphone size={12} /> Sincronizar
                </button>
                <button
                  onClick={() => { const n = definirSincronizarAgenda(selectedIds, false); showToastMsg(`${n} agendamento${n !== 1 ? 's' : ''} fora da agenda do celular`) }}
                  disabled={selectedIds.length === 0}
                  title="Tirar os selecionados da agenda do celular"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 ring-1 ring-inset ring-borda-forte text-texto-2 hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Smartphone size={12} /> Não sincronizar
                </button>
              </div>
            )}
            {/* Definir tipo de documento (em massa) */}
            <div className="flex items-center gap-1.5 sm:pl-2 sm:border-l border-primary/20">
              <select
                className="input py-1 text-xs w-44"
                value={tipoMassa}
                onChange={e => setTipoMassa(e.target.value)}
                title="Definir tipo de documento"
              >
                <option value="">Definir tipo de documento…</option>
                {tiposDocumento.filter(t => t.ativo !== false).map(t => (
                  <option key={t.id} value={t.id}>{t.sigla} — {t.nome}</option>
                ))}
                <option value={SEM_TIPO}>Remover tipo</option>
              </select>
              {tipoMassa && (
                <input
                  className="input py-1 text-xs w-40"
                  value={motivoMassa}
                  maxLength={200}
                  onChange={e => setMotivoMassa(e.target.value)}
                  placeholder="Motivo (opcional)"
                  title="Motivo da alteração (opcional) — vai para o histórico"
                />
              )}
              <button
                onClick={aplicarTipoMassa}
                disabled={!tipoMassa || selectedIds.length === 0 || aplicandoTipo}
                className="px-3 py-1.5 text-xs font-medium bg-primary/15 text-primary-fg hover:bg-primary/25 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aplicandoTipo ? 'Aplicando…' : 'Aplicar'}
              </button>
            </div>
            <button
              onClick={cancelSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-hover text-texto-2 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <X size={12} /> Cancelar seleção
            </button>
          </div>
        </div>
      )}

      {/* Table card — sem overflow-hidden: quem rola é o container da tabela (overflow-x-auto) */}
      <div className="card p-0">
        {!selectionMode && selectableRows.length > 0 && podeSelecionar && (
          <div className="flex justify-end px-3 pt-2.5 pb-0">
            <button
              onClick={() => setSelectionMode(true)}
              className="btn-amber"
            >
              <MousePointer2 size={13} /> Selecionar
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda">
                {selectionMode && (
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                      title="Selecionar todos"
                    />
                  </th>
                )}
                <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-2 py-2.5 text-xs text-texto-2 font-medium whitespace-nowrap w-[70px]" title="Tipo de documento">Doc.</th>
                <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium w-full min-w-[200px]">Descrição</th>
                <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium hidden md:table-cell">Categoria</th>
                <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium hidden min-[1440px]:table-cell">Favorecido</th>
                <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium">Valor</th>
                <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium hidden min-[1440px]:table-cell whitespace-nowrap w-24">Frequência</th>
                <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium whitespace-nowrap w-px sticky right-0 z-[1] bg-surface shadow-[-8px_0_8px_-8px_var(--color-overlay)]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {overdue.length > 0 && (
                <>
                  <SectionHeader label="Em atraso" count={overdue.length} variant="overdue" cols={cols} />
                  {overdue.map(({ schedule, nextDate, futureItems, isSerie }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} isSerie={isSerie} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {next7.length > 0 && (
                <>
                  <SectionHeader label="Próximos 7 dias" count={next7.length} variant="soon" cols={cols} />
                  {next7.map(({ schedule, nextDate, futureItems, isSerie }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} isSerie={isSerie} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {next30.length > 0 && (
                <>
                  <SectionHeader label="Próximos 30 dias" count={next30.length} variant="month" cols={cols} />
                  {next30.map(({ schedule, nextDate, futureItems, isSerie }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} isSerie={isSerie} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {future.length > 0 && (
                <>
                  <SectionHeader label="Futuros" count={future.length} variant="default" cols={cols} />
                  {future.map(({ schedule, nextDate, futureItems, isSerie }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} isSerie={isSerie} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {completed.length > 0 && (
                <>
                  <SectionHeader label="Concluídos" count={completed.length} variant="history" cols={cols} />
                  {completed.map(({ schedule, nextDate, futureItems, isSerie }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} isSerie={isSerie} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch register modal */}
      {showBatchRegister && (
        <BatchRegisterModal
          selectedRows={selectedRows}
          accounts={accounts}
          onConfirm={handleBatchRegister}
          onClose={() => setShowBatchRegister(false)}
        />
      )}

      {/* Batch skip confirmation */}
      <ConfirmDialog
        open={showBatchSkip}
        onClose={() => setShowBatchSkip(false)}
        onConfirm={handleBatchSkip}
        title="Pular selecionados"
        message={`Pular ${selectedRows.length} agendamento${selectedRows.length !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`}
      />

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </>
  )
}


// Aba "Pagos": uma linha por ocorrência paga (dados do lançamento). Somente leitura.
function PagamentosTable({ linhas, categories, accounts, tiposDocumento }) {
  if (linhas.length === 0) {
    return (
      <div className="card text-center py-12">
        <History size={32} className="text-texto-3 mx-auto mb-3" />
        <p className="text-texto-3">Nenhum pagamento encontrado</p>
      </div>
    )
  }
  const cat = (id) => { const c = categories.find(x => x.id === id); return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : '—' }
  const conta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  // Rodapé: "sem lançamento" não soma no total — só é contado à parte.
  const tot = totaisPagamentos(linhas)
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-texto-3 text-left border-b border-borda">
            {['Pago em', 'Vencimento', 'Descrição', 'Favorecido', 'Categoria', 'Tipo doc.', 'Conta', 'Valor pago', 'Parc.'].map(h => (
              <th key={h} className={`px-3 py-2 font-medium whitespace-nowrap ${h === 'Valor pago' ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const tipo = resolverTipoDocumento(l, tiposDocumento)
            // Baixada sem lançamento: cinza/itálico, data = data baixada, conta e valor do agendamento.
            const sem = !!l.semLancamento
            return (
              <tr key={l.key} className={`border-b border-borda/60 last:border-0 hover:bg-surface-hover/40 ${sem ? 'italic opacity-70' : ''}`}>
                <td className="px-3 py-2 text-texto-1 whitespace-nowrap">
                  {l.dataPagamento ? fmtDate(l.dataPagamento) : '—'}
                  {sem && (
                    <span className="ml-1.5 not-italic text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-texto-3" title={l.motivo && l.motivo !== 'sem lançamento' ? `Baixada sem lançamento (${l.motivo})` : 'Baixada sem lançamento vinculado'}>
                      sem lançamento
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-texto-2 whitespace-nowrap">{l.vencimento ? fmtDate(l.vencimento) : '—'}</td>
                <td className="px-3 py-2 text-texto-1 max-w-[14rem] truncate">{l.description || '—'}</td>
                <td className="px-3 py-2 text-texto-2 max-w-[11rem] truncate">{l.payee || '—'}</td>
                <td className="px-3 py-2 text-texto-2 max-w-[11rem] truncate">{cat(l.categoryId)}</td>
                <td className="px-3 py-2 text-texto-2 whitespace-nowrap" title={tipo?.nome}>{tipo?.sigla || '—'}</td>
                <td className="px-3 py-2 text-texto-2 max-w-[9rem] truncate">{conta(l.accountId)}</td>
                <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${sem ? 'text-texto-3' : l.transactionType === 'income' ? 'text-receita' : 'text-despesa'}`}>{fmt(l.amount)}</td>
                <td className="px-3 py-2 text-texto-2 whitespace-nowrap">{l.avulso ? 'avulso' : l.parcela ? (l.total ? `${l.parcela}/${l.total}` : `${l.parcela}`) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-borda text-texto-2">
            <td colSpan={7} className="px-3 py-2">
              {tot.nPagos} pago{tot.nPagos !== 1 ? 's' : ''} · {fmt(tot.totalPago)}
              {tot.nSemLancamento > 0 && <span className="text-texto-3"> | {tot.nSemLancamento} sem lançamento</span>}
            </td>
            <td className="px-3 py-2 text-right font-semibold text-texto-1 whitespace-nowrap">{fmt(tot.totalPago)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function SchedulePanel() {
  const {
    profileSchedules: schedules, schedules: allSchedules,
    categories, profileAccounts: accounts, accounts: allAccounts,
    payables, updatePayable, deletePayable,
    gerencialGroups, addTransaction,
    deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence,
    markScheduleRegistered, getNextOccurrences,
    getProvisoesPendentes, getFaturasProvisaoGerencial, executarProvisoesGerenciais, efetivarProvisao,
    activeProfileId, settings, tiposDocumento, transactions, pode, usuario,
  } = useApp()
  // Nível de acesso: criar agendamento/provisão = incluir; Executar Gerenciais cria lançamentos.
  const podeIncluirAgend = pode('agendamentos', 'incluir')
  const podeExecutarGer = pode('lancamentos', 'incluir')

  // Aviso do ScheduleForm — a sincronização de favorecido de uma parcela de financiamento mexe
  // no financiamento inteiro, e isso precisa ficar visível para quem editou só uma parcela.
  const [avisoForm, setAvisoForm] = useState(null)

  const provisoesPendentes = useMemo(() => getProvisoesPendentes(), [getProvisoesPendentes])
  const faturasProvisao = useMemo(() => getFaturasProvisaoGerencial(), [getFaturasProvisaoGerencial])
  const [showExecutarGer, setShowExecutarGer] = useState(false)

  const isMobile = useIsMobile()
  // Visão Lista | Calendário, lembrada por usuário. O calendário NÃO mexe no Período da lista
  // (só o esconde): ao voltar para a Lista, o período é o de antes.
  const [visao, setVisao] = useState(() => lerVisaoAgenda(usuario?.id))
  const trocarVisao = (v) => { setVisao(v); salvarVisaoAgenda(usuario?.id, v) }
  const emCalendario = visao === 'calendario'
  // Status "Todos" (pendentes + pagos, totais separados) existe só no calendário.
  const [calTodos, setCalTodos] = useState(false)
  const [activeTab, setActiveTab] = useState('conta')
  // Status e período POR ABA (FilterBar), lembrados no localStorage (lib/agendamentosFiltro).
  const [filtrosPorAba, setFiltrosPorAba] = useState(
    () => Object.fromEntries(Object.keys(STATUS_POR_ABA).map(aba => [aba, lerFiltrosAba(aba)]))
  )
  const statusAtual = filtrosPorAba[activeTab].status
  const periodoAtual = filtrosPorAba[activeTab].periodos[statusAtual]
  const atualizarFiltrosAba = (fn) => setFiltrosPorAba(prev => {
    const novo = fn(prev[activeTab])
    salvarFiltrosAba(activeTab, novo)
    return { ...prev, [activeTab]: novo }
  })
  // Painel de filtros avançados: recolhido por padrão.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  // Filtro "Contas envolvidas" (só no status Resgates anuais): ids das contas selecionadas.
  const [selContas, setSelContas] = useState(() => new Set())
  const toggleConta = (id) => setSelContas(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const [showForm, setShowForm] = useState(false)
  const [showProvisaoForm, setShowProvisaoForm] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [editProvisao, setEditProvisao] = useState(null)
  const [confirmDeletePayable, setConfirmDeletePayable] = useState(null)
  const [showZeroed, setShowZeroed] = useState(false)

  // Edição de agendamento: provisões abrem no ProvisaoForm (campos próprios:
  // valor/data estimados, "será pago com reserva" + função); os demais no ScheduleForm.
  const openEditSchedule = (s) => {
    if (s?.isProvisao) { setEditProvisao(s); setShowProvisaoForm(true) }
    else { setEditSchedule(s); setShowForm(true) }
  }

  // FAB mobile: abre o formulário de novo agendamento.
  useRegisterFab(podeIncluirAgend ? () => { setEditSchedule(null); setShowForm(true) } : null, [podeIncluirAgend])

  // Filtros avançados e datas De/Até: POR ABA (independentes), dentro de filtrosPorAba; os
  // avançados vão para o localStorage junto com status e período (lib/agendamentosFiltro).
  const fAba = filtrosPorAba[activeTab]
  const av = fAba.avancados
  const setAvancado = (campo, valor) => atualizarFiltrosAba(f => ({ ...f, avancados: { ...f.avancados, [campo]: valor } }))
  const setData = (campo, valor) => atualizarFiltrosAba(f => ({ ...f, datas: { ...f.datas, [campo]: valor } }))
  const fltFrom = fAba.datas.from
  const fltTo = fAba.datas.to
  const setFltFrom = (v) => setData('from', v)
  const setFltTo = (v) => setData('to', v)
  const { desc: fltDesc, payee: fltPayee, cat: fltCat, min: fltMin, max: fltMax } = av
  const fltAgenda = av.agenda || ''
  const setFltAgenda = (v) => setAvancado('agenda', v)
  const setFltDesc = (v) => setAvancado('desc', v)
  const setFltPayee = (v) => setAvancado('payee', v)
  const setFltCat = (v) => setAvancado('cat', v)
  const setFltMin = (v) => setAvancado('min', v)
  const setFltMax = (v) => setAvancado('max', v)
  // Filtro de valor (multiselect) — valores reais dos agendamentos visíveis.
  const selValores = useMemo(() => new Set(av.valores), [av.valores])
  const setSelValores = (set) => setAvancado('valores', [...set])
  // Multi-select de tipo de documento (chaves de chaveFiltroTipo; SEM_TIPO = "Sem tipo").
  const selTipos = useMemo(() => new Set(av.tipos), [av.tipos])
  const setSelTipos = (set) => setAvancado('tipos', [...set])
  const hasActiveFilter = fltFrom || fltTo || fltDesc.trim() || fltPayee.trim() || fltCat || fltMin !== '' || fltMax !== '' || selValores.size > 0 || selTipos.size > 0 || !!fltAgenda
  const clearFilters = () => atualizarFiltrosAba(f => ({ ...f, avancados: AVANCADOS_VAZIOS, datas: { from: '', to: '' } }))
  const filtrosAvancadosAtivos = contarFiltrosAvancados({ desc: fltDesc, payee: fltPayee, categoryId: fltCat, tipos: selTipos, min: fltMin, max: fltMax, valores: selValores, agenda: fltAgenda })
  // Etiquetas removíveis dos filtros ativos — sob a barra, mesmo com o painel recolhido.
  const etiquetas = etiquetasFiltros(
    { avancados: av, datas: fAba.datas, periodo: fAba.periodos[fAba.status] },
    {
      nomeCategoria: (id) => { const c = categories.find(x => x.id === id); return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : id },
      nomeTipo: (k) => (k === SEM_TIPO ? 'Sem tipo' : tiposDocumento.find(t => t.id === k)?.sigla || k),
      fmtValor: (v) => fmt(Number(v)),
      fmtData: (d) => fmtDate(d),
    },
  )
  const removerEtiqueta = (chave) => {
    if (chave === 'datas') escolherPeriodo(periodoPadrao(statusAtual))
    else if (chave === 'valor') atualizarFiltrosAba(f => ({ ...f, avancados: { ...f.avancados, min: '', max: '', valores: [] } }))
    else if (chave === 'tipos') setSelTipos(new Set())
    else setAvancado(chave, '')
  }

  const escolherStatus = (id) => {
    if (id !== 'resgates') setSelContas(new Set())
    atualizarFiltrosAba(f => ({ ...f, status: id }))
    // Datas De/Até só valem no Personalizado do status escolhido.
    if (filtrosPorAba[activeTab].periodos[id] !== 'custom') { setFltFrom(''); setFltTo('') }
  }
  const escolherPeriodo = (p) => {
    atualizarFiltrosAba(f => ({ ...f, periodos: { ...f.periodos, [f.status]: p } }))
    if (p === 'custom') setFiltrosAbertos(true)
    else { setFltFrom(''); setFltTo('') }
  }
  // Escolher datas no painel = Período "Personalizado".
  const mudarData = (setter) => (e) => {
    setter(e.target.value)
    if (periodoAtual !== 'custom') atualizarFiltrosAba(f => ({ ...f, periodos: { ...f.periodos, [f.status]: 'custom' } }))
  }
  const trocarAba = (aba) => {
    setActiveTab(aba)
    setSelContas(new Set())
  }
  // Datas De/Até efetivas: só no Personalizado.
  const dataDe = periodoAtual === 'custom' ? fltFrom : ''
  const dataAte = periodoAtual === 'custom' ? fltTo : ''

  // Filtro por cartão na aba "Cartão de Crédito" ('' = todos os cartões)
  const [cartaoFiltroId, setCartaoFiltroId] = useState('')

  const raAccountIds = useMemo(() => {
    const ids = new Set()
    gerencialGroups.forEach(g => {
      if (typeof g.number === 'number' && g.number !== 1 && g.defaultAccountId) ids.add(g.defaultAccountId)
    })
    return ids
  }, [gerencialGroups])

  // "Zerado" = valor base E valor EFETIVO da próxima ocorrência iguais a zero. Um agendamento
  // de base 0 com override de valor na ocorrência (provisões, ocorrência editada) NÃO é zerado —
  // ele entra nos saldos via occEfetiva, então esconder aqui o fazia sumir da aba sem sumir do
  // breakdown "Como chegamos aqui". Mesma leitura efetiva já usada no filtro de mín/máx abaixo.
  const isZeroed = (s) => {
    if (Number(s.amount) !== 0) return false
    const next = getNextOccurrences(s, 1)[0]
    return !next || Number(occEfetiva(s, next).amount) === 0
  }

  const rawPending = useMemo(() => schedules.filter(s => getNextOccurrences(s, 1).length > 0), [schedules, getNextOccurrences])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allPending = useMemo(() => showZeroed ? rawPending : rawPending.filter(s => !isZeroed(s)), [rawPending, showZeroed, getNextOccurrences])

  // Pertence ao perfil ativo? Em "Tudo" (activeProfileId nulo) sempre true.
  // Caso contrário, mostra se a conta pertence ao perfil OU não está vinculada a
  // perfil nenhum (untagged) — só esconde o que é explicitamente de OUTRO perfil.
  // Usa allAccounts (não o filtrado) para não excluir cartões indevidamente.
  const accountInProfile = (accId) => {
    if (!activeProfileId) return true
    const acc = allAccounts.find(a => a.id === accId)
    return !acc || !acc.profileId || acc.profileId === activeProfileId
  }

  // CORREÇÃO 1: faturas de TODOS os cartões (não só do primeiro). O filtro de
  // perfil agora compara o profileId real do cartão, sem depender de profileAccounts.
  const invoicePayables   = (payables || []).filter(p => p.origin === 'invoice' && accountInProfile(p.cartaoId))
  const displayInvoice    = showZeroed ? invoicePayables : invoicePayables.filter(p => Number(p.amount) !== 0 && p.status !== 'paid')
  const pendingInvoice    = displayInvoice.filter(p => p.status === 'pending').length

  // Agendamentos "Pagamento Fatura X" (transfer Conta Principal → Cartão, _gerencialKey
  // terminando em _payment). São gerados pela automação gerencial tanto na importação
  // quanto no lançamento MANUAL — mas o lançamento manual não gera contas_a_pagar, então
  // o cartão (ex.: BBCCRED) ficava invisível na aba. Mostramos aqui os que ainda NÃO têm
  // um contas_a_pagar (invoice) correspondente, para não duplicar quem veio da importação.
  const invoiceFaturaKeys = useMemo(
    () => new Set(invoicePayables.map(p => `${p.cartaoId}|${p.mesAno}`)),
    [invoicePayables]
  )
  const faturaPaymentSchedules = useMemo(
    () => allSchedules.filter(s => {
      // Reconhece AMBOS: novo (tipo='pagamento_fatura') e legado (_gerencialKey terminando _payment).
      const key = s.overrides?._gerencialKey
      const isNew = s.tipo === 'pagamento_fatura'
      const isLegacyPayment = !!key && key.endsWith('_payment')
      if (!isNew && !isLegacyPayment) return false
      if (s.transactionType !== 'transfer') return false
      const g = s.overrides?._gerencial || {}
      const cardId = s.cardId || g.cardId || s.toAccountId
      if (!accountInProfile(cardId)) return false
      // Os novos (tipo) são a fonte de verdade e sempre aparecem. O dedupe contra
      // contas_a_pagar legadas aplica-se apenas aos agendamentos LEGADOS (_payment).
      if (isNew) return true
      const faturaRef = g.faturaRef || s.faturaRef
      if (faturaRef && faturaRef.includes('/')) {
        const [mm, yyyy] = faturaRef.split('/')
        if (invoiceFaturaKeys.has(`${cardId}|${yyyy}-${mm}`)) return false
      }
      return true
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchedules, invoiceFaturaKeys, activeProfileId, allAccounts]
  )
  const displayFaturaPayments = showZeroed ? faturaPaymentSchedules : faturaPaymentSchedules.filter(s => !isZeroed(s))
  const pendingFaturaPayments = displayFaturaPayments.filter(s => getNextOccurrences(s, 1).length > 0).length

  // Cartões de crédito ativos (do perfil) para o seletor da aba Cartão.
  const cartoesDisponiveis = useMemo(
    () => allAccounts
      .filter(a => a.type === 'credit' && a.active !== false &&
        (!activeProfileId || !a.profileId || a.profileId === activeProfileId))
      .sort((a, b) => (a.apelido || a.name).localeCompare(b.apelido || b.name)),
    [allAccounts, activeProfileId]
  )
  // Cartão de um agendamento de pagamento de fatura.
  const faturaPaymentCardId = (s) => s.cardId || s.overrides?._gerencial?.cardId || s.toAccountId
  // Listas exibidas na aba Cartão, aplicando o filtro por cartão selecionado.
  const viewInvoice = cartaoFiltroId ? displayInvoice.filter(p => p.cartaoId === cartaoFiltroId) : displayInvoice

  // CORREÇÃO 3: contas de origem "gerenciais" = subcontas "Ger. ..." (têm grupoGerencial
  // no próprio account) + contas de resgate dos grupos numerados (raAccountIds).
  const gerencialOrigemIds = useMemo(() => {
    const ids = new Set(raAccountIds)
    allAccounts.forEach(a => { if (a.grupoGerencial) ids.add(a.id) })
    return ids
  }, [allAccounts, raAccountIds])

  // Agendamentos LEGADOS obsoletos (provisão / resgate / resgate parcelado / resgate numerado)
  // foram substituídos pelos tipos 'gerencial_devolucao' e 'resgate_reserva'. Escondemos os que
  // ainda não têm 'tipo' (dados antigos cujo recálculo ainda não rodou); os novos carregam tipo.
  const isObsoleteLegacy = (s) => {
    if (s.tipo) return false
    const k = s.overrides?._gerencialKey || ''
    return k.endsWith('_provision') || k.endsWith('_resgate') || k.endsWith('_resgate_parc') || k.startsWith('ger_num_')
  }

  // Agendamentos de devolução/resgate: novos (tipo gerencial_devolucao/resgate_reserva) ou, por
  // compatibilidade, transfers de conta gerencial → conta principal. Usa allSchedules porque as
  // subcontas "Ger." não carregam profileId; o perfil é respeitado pela conta de destino (principal).
  const gerencialResgates = useMemo(
    () => allSchedules.filter(s => {
      if (isObsoleteLegacy(s)) return false
      const isNewGer = s.tipo === 'gerencial_devolucao' || s.tipo === 'resgate_reserva'
      const structural =
        s.transactionType === 'transfer' &&
        gerencialOrigemIds.has(s.accountId) &&
        !gerencialOrigemIds.has(s.toAccountId)
      if (!isNewGer && !structural) return false
      return accountInProfile(s.toAccountId)
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchedules, gerencialOrigemIds, activeProfileId, allAccounts]
  )
  // Aba "Gerencial": devoluções/resgates de contas gerenciais → conta principal, EXCETO os que
  // saem de conta poupança (type 'savings'), que passam para a aba "Contas Anuais".
  const isSavingsOrigem = (s) => allAccounts.find(a => a.id === s.accountId)?.type === 'savings'
  const gerencialSomente = gerencialResgates.filter(s => !isSavingsOrigem(s))

  const displayGerencial = showZeroed ? gerencialSomente : gerencialSomente.filter(s => !isZeroed(s))
  const pendingGerencial = displayGerencial.filter(s => getNextOccurrences(s, 1).length > 0).length

  // Aba "Contas Anuais": movimentações (transfers) das contas poupança (type 'savings') — tanto
  // RESGATES (poupança → conta) quanto DEPÓSITOS/aplicações (conta → poupança). Independe de
  // gerencialResgates (que só captura SAÍDAS de contas gerenciais); casa a poupança nas DUAS pontas.
  const savingsIds = useMemo(
    () => new Set(allAccounts.filter(a => a.type === 'savings').map(a => a.id)),
    [allAccounts]
  )
  const contasAnuais = useMemo(
    () => allSchedules.filter(s => {
      if (isObsoleteLegacy(s)) return false
      if (s.transactionType !== 'transfer') return false
      const origemSavings  = savingsIds.has(s.accountId)
      const destinoSavings = savingsIds.has(s.toAccountId)
      if (!origemSavings && !destinoSavings) return false
      // Perfil: respeita a conta NÃO-poupança envolvida (subcontas podem não ter profileId).
      return accountInProfile(origemSavings ? s.toAccountId : s.accountId)
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchedules, savingsIds, activeProfileId, allAccounts]
  )

  const displayContasAnuais = showZeroed ? contasAnuais : contasAnuais.filter(s => !isZeroed(s))
  const pendingContasAnuais = displayContasAnuais.filter(s => getNextOccurrences(s, 1).length > 0).length

  // ── Lista da ABA ATIVA: base da aba → zerados → status/período → filtros avançados ──────────
  // Resgates anuais (antes um chip da aba Agendamentos, hoje status da aba Contas Anuais):
  // transferências que envolvem as contas de resgate dos grupos gerenciais numerados.
  const raSchedules = useMemo(
    () => schedules.filter(s => s.transactionType === 'transfer' && (raAccountIds.has(s.accountId) || raAccountIds.has(s.toAccountId))),
    [schedules, raAccountIds]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const raVisiveis = useMemo(() => showZeroed ? raSchedules : raSchedules.filter(s => !isZeroed(s)), [raSchedules, showZeroed, getNextOccurrences])
  const faturaPaymentsDoCartao = cartaoFiltroId ? faturaPaymentSchedules.filter(s => faturaPaymentCardId(s) === cartaoFiltroId) : faturaPaymentSchedules
  const baseDaAba = activeTab === 'conta' ? schedules
    : activeTab === 'cartao' ? faturaPaymentsDoCartao
      : activeTab === 'gerencial' ? gerencialSomente
        : statusAtual === 'resgates' ? raSchedules : contasAnuais

  const displaySchedules = useMemo(
    () => showZeroed ? baseDaAba : baseDaAba.filter(s => !isZeroed(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseDaAba, showZeroed, getNextOccurrences]
  )
  const hojeStr = format(new Date(), 'yyyy-MM-dd')
  const filteredSchedules = useMemo(
    () => filtrarPorStatusPeriodo(displaySchedules, { status: statusAtual, periodo: periodoAtual }, getNextOccurrences, hojeStr),
    [displaySchedules, statusAtual, periodoAtual, getNextOccurrences, hojeStr]
  )

  // Filtros em tempo real (data / descrição / categoria / valor) sobre a lista já filtrada por período
  const searchedSchedules = useMemo(() => {
    // Data De/Até comparam a MESMA data da coluna "Data" (override de data aplicado), como dia
    // 'YYYY-MM-DD', inclusivos. Antes comparava a data ORIGINAL da ocorrência: um item com a data
    // movida (ex.: 15/10 → 14/10) aparecia em 14/10 mas sumia do filtro 14/10–14/10.
    return filtrarAgendamentos(filteredSchedules, {
      desc: fltDesc, payee: fltPayee, categoryId: fltCat, from: dataDe, to: dataAte,
      min: fltMin !== '' ? parseFloat(fltMin) : null,
      max: fltMax !== '' ? parseFloat(fltMax) : null,
      agenda: fltAgenda,
    }, getNextOccurrences, hojeStr)
  }, [filteredSchedules, fltDesc, fltPayee, fltCat, dataDe, dataAte, fltMin, fltMax, fltAgenda, getNextOccurrences, hojeStr])

  // Status "Pagos" (qualquer aba): uma linha por ocorrência PAGA dos agendamentos da aba,
  // inclusive das séries em andamento (lib/ocorrenciasRegistradas). Período = data do pagamento;
  // valor = valor pago. Calculado sempre — o contador do status precisa dele.
  const abaPagos = statusAtual === 'pagos'
  const basePagos = activeTab === 'conta' ? schedules
    : activeTab === 'cartao' ? faturaPaymentsDoCartao
      : activeTab === 'gerencial' ? gerencialSomente : contasAnuais
  const pagosLinhas = useMemo(() => pagamentosDosAgendamentos(basePagos, transactions), [basePagos, transactions])
  const pagosBuscados = useMemo(() => filtrarPagamentos(
    abaPagos ? filtrarPagosPorPeriodo(pagosLinhas, periodoAtual, hojeStr) : [], {
      desc: fltDesc, payee: fltPayee, categoryId: fltCat, from: dataDe, to: dataAte,
      min: fltMin !== '' ? parseFloat(fltMin) : null,
      max: fltMax !== '' ? parseFloat(fltMax) : null,
    }), [abaPagos, pagosLinhas, periodoAtual, hojeStr, fltDesc, fltPayee, fltCat, dataDe, dataAte, fltMin, fltMax])
  const pagosVisiveis = useMemo(
    () => filtrarPorTipoDocumento(filtrarPagamentos(pagosBuscados, { valores: selValores }), selTipos, tiposDocumento),
    [pagosBuscados, selValores, selTipos, tiposDocumento]
  )

  // Valores reais (distintos) dos itens visíveis (já filtrados por data/etc.), maior → menor.
  const valorOptions = useMemo(() => {
    const set = new Set()
    for (const s of (abaPagos ? pagosBuscados : searchedSchedules)) set.add(Math.round((Number(s.amount) || 0) * 100) / 100)
    return [...set].sort((a, b) => b - a)
  }, [abaPagos, pagosBuscados, searchedSchedules])
  // Lista final após o filtro de valor (multiselect).
  // + filtro de tipo de documento, pelo tipo RESOLVIDO (resolverTipoDocumento): a fatura de cartão
  // sem tipo gravado cai em CC.
  const finalSchedules = useMemo(() => {
    const porValor = selValores.size === 0
      ? searchedSchedules
      : searchedSchedules.filter(s => selValores.has(Math.round((Number(s.amount) || 0) * 100) / 100))
    return filtrarPorTipoDocumento(porValor, selTipos, tiposDocumento)
  }, [searchedSchedules, selValores, selTipos, tiposDocumento])
  // Chips de "Contas envolvidas": contados sobre a lista já filtrada pelos demais filtros. Conta
  // selecionada que sumiu da lista (por outro filtro) continua como chip, com 0, para poder desligá-la.
  const filtroContasAtivo = activeTab === 'anuais' && statusAtual === 'resgates'
  const contasChips = useMemo(() => {
    if (!filtroContasAtivo) return []
    const chips = contasEnvolvidas(finalSchedules, allAccounts)
    for (const id of selContas) {
      if (!chips.some(c => c.accountId === id)) {
        const acc = allAccounts.find(a => a.id === id)
        chips.push({ accountId: id, nome: acc?.apelido || acc?.name || '?', count: 0 })
      }
    }
    return chips
  }, [filtroContasAtivo, finalSchedules, allAccounts, selContas])
  const visibleSchedules = useMemo(
    () => (filtroContasAtivo ? filtrarPorContas(finalSchedules, selContas) : finalSchedules),
    [filtroContasAtivo, finalSchedules, selContas]
  )

  // Aba Cartão: contas a pagar de fatura (cards) seguem o período (vencimento) e os filtros de
  // data/descrição/valor que se aplicam a elas.
  const invoiceVisiveis = useMemo(() => {
    const de = dataDe || null
    const ate = dataAte || null
    const d = fltDesc.trim().toLowerCase()
    const min = fltMin !== '' ? parseFloat(fltMin) : null
    const max = fltMax !== '' ? parseFloat(fltMax) : null
    return filtrarFaturasPorPeriodo(viewInvoice, periodoAtual, hojeStr).filter(p =>
      (!de || p.dueDate >= de) && (!ate || p.dueDate <= ate) &&
      (!d || (p.description || '').toLowerCase().includes(d)) &&
      (min === null || Number(p.amount) >= min) && (max === null || Number(p.amount) <= max))
  }, [viewInvoice, periodoAtual, hojeStr, dataDe, dataAte, fltDesc, fltMin, fltMax])

  // Contadores do segmentado: total de cada status na aba (sem período nem filtros).
  const nPagos = totaisPagamentos(pagosLinhas).nPagos
  const contagemStatus = {
    conta: { apagar: allPending.length, provisoes: allPending.filter(s => s.isProvisao).length, pagos: nPagos },
    cartao: { apagar: pendingInvoice + pendingFaturaPayments, pagos: nPagos },
    gerencial: { apagar: pendingGerencial, pagos: nPagos },
    anuais: { apagar: pendingContasAnuais, pagos: nPagos, resgates: raVisiveis.length },
  }[activeTab]
  const ICONE_STATUS = { apagar: Calendar, provisoes: Hourglass, pagos: History, resgates: ArrowLeftRight }
  const opcoesStatus = [
    ...STATUS_POR_ABA[activeTab].map(id => ({ id, label: STATUS[id].label, count: contagemStatus[id], icon: ICONE_STATUS[id] })),
    ...(emCalendario ? [{ id: 'todos', label: 'Todos', icon: List }] : []),
  ]
  const statusCal = calTodos ? 'todos' : statusAtual
  const escolherStatusBarra = (id) => {
    if (id === 'todos') { setCalTodos(true); return }
    setCalTodos(false)
    escolherStatus(id)
  }

  // ── Visão Calendário: os MESMOS filtros da lista, sem o Período (o mês navegado faz o papel dele)
  // e sem as datas De/Até do Personalizado. Pendentes = status A pagar (ou Provisões/Resgates).
  const calSchedules = useMemo(() => {
    if (!emCalendario || statusCal === 'pagos') return []
    const st = statusCal === 'provisoes' ? 'provisoes' : 'apagar'
    const porStatus = filtrarPorStatusPeriodo(displaySchedules, { status: st, periodo: 'futuros' }, getNextOccurrences, hojeStr)
    const buscados = filtrarAgendamentos(porStatus, {
      desc: fltDesc, payee: fltPayee, categoryId: fltCat,
      min: fltMin !== '' ? parseFloat(fltMin) : null,
      max: fltMax !== '' ? parseFloat(fltMax) : null,
      agenda: fltAgenda,
    }, getNextOccurrences, hojeStr)
    const porValor = selValores.size === 0
      ? buscados
      : buscados.filter(s => selValores.has(Math.round((Number(s.amount) || 0) * 100) / 100))
    const porTipo = filtrarPorTipoDocumento(porValor, selTipos, tiposDocumento)
    return filtroContasAtivo ? filtrarPorContas(porTipo, selContas) : porTipo
  }, [emCalendario, statusCal, displaySchedules, getNextOccurrences, hojeStr, fltDesc, fltPayee, fltCat, fltMin, fltMax, fltAgenda, selValores, selTipos, tiposDocumento, filtroContasAtivo, selContas])
  const calPagos = useMemo(() => {
    if (!emCalendario || (statusCal !== 'pagos' && statusCal !== 'todos')) return []
    const buscados = filtrarPagamentos(pagosLinhas, {
      desc: fltDesc, payee: fltPayee, categoryId: fltCat,
      min: fltMin !== '' ? parseFloat(fltMin) : null,
      max: fltMax !== '' ? parseFloat(fltMax) : null,
    })
    return filtrarPorTipoDocumento(filtrarPagamentos(buscados, { valores: selValores }), selTipos, tiposDocumento)
  }, [emCalendario, statusCal, pagosLinhas, fltDesc, fltPayee, fltCat, fltMin, fltMax, selValores, selTipos, tiposDocumento])
  // Faturas do contas_a_pagar (aba Cartão), pelo vencimento — menos as que já têm o agendamento
  // pagamento_fatura da mesma fatura (senão a fatura apareceria duas vezes no dia).
  const calFaturas = useMemo(() => {
    if (!emCalendario || activeTab !== 'cartao' || statusCal === 'pagos') return []
    const d = fltDesc.trim().toLowerCase()
    const min = fltMin !== '' ? parseFloat(fltMin) : null
    const max = fltMax !== '' ? parseFloat(fltMax) : null
    const filtradas = viewInvoice.filter(p =>
      (!d || (p.description || '').toLowerCase().includes(d)) &&
      (min === null || Number(p.amount) >= min) && (max === null || Number(p.amount) <= max))
    return faturasSemAgendamento(filtradas, faturaPaymentSchedules)
  }, [emCalendario, activeTab, statusCal, viewInvoice, faturaPaymentSchedules, fltDesc, fltMin, fltMax])

  // Opções extras do filtro: o que só existe como fallback (CC sem cadastro, RES).
  const extrasTipoFiltro = useMemo(() => [
    ...(tiposDocumento.some(t => t.sigla === 'CC') ? [] : [{ id: 'CC', sigla: 'CC', nome: 'Fatura de Cartão (automático)', cor: '#8b5cf6' }]),
    { id: 'RES', sigla: 'RES', nome: 'Resgate de reserva (automático)', cor: '#14b8a6' },
  ], [tiposDocumento])

  const handleMarkPaid = id => updatePayable(id, { status: 'paid', paidAt: new Date().toISOString() })
  const handleDeletePayable = id => { deletePayable(id); setConfirmDeletePayable(null) }

  // Atalhos da tela: os mesmos handlers dos botões abaixo, valendo só quando o botão está visível.
  // Executar Gerenciais abre a MESMA confirmação do botão — nunca executa direto.
  const abrirExecutarGer = () => setShowExecutarGer(true)
  const abrirLancarProvisao = () => { setEditProvisao(null); setShowProvisaoForm(true) }
  const abrirNovoAgendamento = () => { setEditSchedule(null); setShowForm(true) }
  useAtalho('agend.executarGerenciais', () => (provisoesPendentes.length > 0 && podeExecutarGer ? abrirExecutarGer() : false))
  useAtalho('agend.lancarProvisao', () => (activeTab === 'conta' && podeIncluirAgend ? abrirLancarProvisao() : false))
  useAtalho('agend.novoAgendamento', () => (activeTab === 'conta' && podeIncluirAgend ? abrirNovoAgendamento() : false))
  const tituloExecutarGer = useTituloAtalho('Executar Gerenciais', 'agend.executarGerenciais')
  const tituloLancarProvisao = useTituloAtalho('Lançar Provisão', 'agend.lancarProvisao')
  const tituloNovoAgendamento = useTituloAtalho('Novo Agendamento', 'agend.novoAgendamento')

  const propsTabela = {
    categories, gerencialGroups, addTransaction, markScheduleRegistered, deleteSchedule,
    registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences,
    onNewSchedule: () => { setEditSchedule(null); setShowForm(true) },
    onEditSchedule: openEditSchedule,
  }
  const vazioDaAba = {
    cartao: { Icone: CreditCard, titulo: 'Nenhuma fatura gerada', sub: 'As faturas aparecem ao importar lançamentos de cartão ou ao lançar despesas gerenciais' },
    gerencial: { Icone: BarChart3, titulo: 'Nenhum resgate gerencial agendado', sub: 'Lançamentos no Grupo Gerencial (1) geram agendamentos de devolução das subcontas "Ger." para a conta principal' },
    anuais: { Icone: ArrowLeftRight, titulo: 'Nenhuma movimentação anual agendada', sub: 'Depósitos (aplicações) e resgates das contas poupança aparecem aqui' },
  }[activeTab]
  // Aba sem nada (antes de status/período/filtros): mostra o vazio próprio da aba.
  const abaSemNada = activeTab === 'cartao' ? (displayInvoice.length === 0 && displayFaturaPayments.length === 0)
    : activeTab === 'gerencial' ? displayGerencial.length === 0
      : activeTab === 'anuais' ? (statusAtual === 'resgates' ? raVisiveis.length === 0 : displayContasAnuais.length === 0)
        : false

  return (
    <div className="space-y-4">
      {/* Título + ações. flex-wrap: com os 3 botões numa tela menor, os botões descem em vez de
          espremer o título/subtítulo contra a linha das abas. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-texto-2 whitespace-nowrap">Agendamentos & Contas a Pagar</h2>
          <p className="text-xs text-texto-3 mt-0.5 leading-5 whitespace-nowrap">{allPending.length} pendentes · {pendingInvoice + pendingFaturaPayments} faturas · {pendingGerencial} resgates</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Visão" className="flex rounded-lg border border-borda-forte bg-surface-2 p-0.5">
            {[['lista', 'Lista', List], ['calendario', 'Calendário', CalendarDays]].map(([id, label, Icone]) => (
              <button key={id} type="button" role="radio" aria-checked={visao === id} onClick={() => trocarVisao(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  visao === id ? 'bg-primary text-white shadow-sm' : 'text-texto-2 hover:text-texto-1 hover:bg-surface-hover'}`}>
                <Icone size={12} /> {label}
              </button>
            ))}
          </div>
          {provisoesPendentes.length > 0 && podeExecutarGer && (
            <button className="btn-secondary flex items-center gap-2 whitespace-nowrap" onClick={abrirExecutarGer} title={tituloExecutarGer}>
              <BarChart3 size={14} /> Executar Gerenciais ({provisoesPendentes.length})
              <ShortcutHint actionId="agend.executarGerenciais" />
            </button>
          )}
          {activeTab === 'conta' && podeIncluirAgend && (
            <>
              <button className="btn-secondary hidden md:flex items-center gap-2 whitespace-nowrap" onClick={abrirLancarProvisao} title={tituloLancarProvisao}>
                <Hourglass size={14} /> Lançar Provisão
                <ShortcutHint actionId="agend.lancarProvisao" />
              </button>
              <button className="btn-primary hidden md:flex items-center gap-2 whitespace-nowrap" onClick={abrirNovoAgendamento} title={tituloNovoAgendamento}>
                <Plus size={14} /> Novo Agendamento
                <ShortcutHint actionId="agend.novoAgendamento" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="border-b border-borda flex items-center gap-0 overflow-x-auto overflow-y-hidden">
        <TabButton active={activeTab === 'conta'} onClick={() => trocarAba('conta')} badge={allPending.length}>
          <Calendar size={14} /> Agendamentos
        </TabButton>
        <TabButton active={activeTab === 'cartao'} onClick={() => trocarAba('cartao')} badge={pendingInvoice + pendingFaturaPayments}>
          <CreditCard size={14} /> Cartão de Crédito
        </TabButton>
        <TabButton active={activeTab === 'gerencial'} onClick={() => trocarAba('gerencial')} badge={pendingGerencial}>
          <BarChart3 size={14} /> Gerencial
        </TabButton>
        <TabButton active={activeTab === 'anuais'} onClick={() => trocarAba('anuais')} badge={pendingContasAnuais}>
          <ArrowLeftRight size={14} /> Contas Anuais
        </TabButton>
      </div>

      {/* Barra: Status | Período | Filtros (+ painel recolhível). Mesma em todas as abas. Fixa no
          topo ao rolar apenas no desktop (md+), com o fundo da página por trás. Na Visão Calendário
          NÃO fica presa: cobria o cabeçalho do mês, que lá é o que fica preso (AgendaCalendario). */}
      <div className={`${emCalendario ? '' : 'md:sticky md:top-0 md:z-20'} bg-page -mx-1 px-1 py-1`}>
        <FilterBar
          status={opcoesStatus}
          statusAtual={emCalendario ? statusCal : statusAtual}
          onStatus={emCalendario ? escolherStatusBarra : escolherStatus}
          semPeriodo={emCalendario}
          periodos={opcoesPeriodo(statusAtual)}
          periodoAtual={periodoAtual}
          onPeriodo={escolherPeriodo}
          filtrosAtivos={filtrosAvancadosAtivos}
          aberto={filtrosAbertos}
          onToggle={() => setFiltrosAbertos(v => !v)}
          extra={activeTab === 'cartao' && cartoesDisponiveis.length > 0 ? (
            <select
              className="input py-1.5 text-xs w-auto max-w-[10rem]"
              value={cartaoFiltroId}
              onChange={e => setCartaoFiltroId(e.target.value)}
              aria-label="Cartão"
            >
              <option value="">Todos os cartões</option>
              {cartoesDisponiveis.map(c => (
                <option key={c.id} value={c.id}>{c.apelido || c.name}</option>
              ))}
            </select>
          ) : null}
        >
          <div className="card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 items-end">
            <div>
              <label className="label text-xs">Data de</label>
              <DateInput className="input py-1.5 text-xs" value={fltFrom} onChange={mudarData(setFltFrom)} />
            </div>
            <div>
              <label className="label text-xs">Data até</label>
              <DateInput className="input py-1.5 text-xs" value={fltTo} onChange={mudarData(setFltTo)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label text-xs">Descrição</label>
              <input type="text" className="input py-1.5 text-xs" value={fltDesc} onChange={e => setFltDesc(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <label className="label text-xs">Favorecido</label>
              <input type="text" className="input py-1.5 text-xs" value={fltPayee} onChange={e => setFltPayee(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <label className="label text-xs">Categoria</label>
              <CategorySelect categories={categories} value={fltCat} onChange={e => setFltCat(e.target.value)} className="input py-1.5 text-xs" />
            </div>
            <div>
              <label className="label text-xs">Tipo de documento</label>
              <TipoDocumentoFiltro tipos={tiposDocumento} extras={extrasTipoFiltro} selected={selTipos} onChange={setSelTipos} />
            </div>
            <div>
              <label className="label text-xs">Agenda do celular</label>
              <select className="input py-1.5 text-xs" value={fltAgenda} onChange={e => setFltAgenda(e.target.value)}>
                <option value="">Todos</option>
                <option value="sim">Sincroniza</option>
                <option value="nao">Não sincroniza</option>
              </select>
            </div>
            {/* Valor: faixa Mín./Máx. num campo só. O botão "Valor" ao lado é OUTRO filtro: escolhe
                valores exatos da lista. */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-2 flex items-end gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <label className="label text-xs">Valor</label>
                <div className="flex gap-1.5">
                  <input type="number" step="0.01" className="input py-1.5 text-xs flex-1 min-w-0" value={fltMin} onChange={e => setFltMin(e.target.value)} placeholder="Mín." aria-label="Valor mínimo" />
                  <input type="number" step="0.01" className="input py-1.5 text-xs flex-1 min-w-0" value={fltMax} onChange={e => setFltMax(e.target.value)} placeholder="Máx." aria-label="Valor máximo" />
                </div>
              </div>
              <div className="mb-0.5 shrink-0">
                <ValueFilterDropdown label="Valor" values={valorOptions} selected={selValores} onChange={setSelValores} />
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-8 flex items-center justify-between gap-2 pt-1 border-t border-borda">
              <button
                type="button"
                onClick={() => setShowZeroed(v => !v)}
                aria-pressed={showZeroed}
                className={`flex items-center gap-1.5 text-xs transition-colors ${showZeroed ? 'text-primary-fg' : 'text-texto-3 hover:text-texto-2'}`}
              >
                <Eye size={11} /> {showZeroed ? 'Ocultar zerados' : 'Mostrar zerados'}
              </button>
              {hasActiveFilter && (
                <button onClick={() => { clearFilters(); if (periodoAtual === 'custom') escolherPeriodo(periodoPadrao(statusAtual)) }} className="flex items-center gap-1 text-xs text-texto-3 hover:text-texto-2 transition-colors">
                  <X size={12} /> Limpar filtros
                </button>
              )}
            </div>
          </div>
        </FilterBar>
        {etiquetas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2" aria-label="Filtros ativos">
            {etiquetas.map(e => (
              <span key={e.chave} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-primary/10 text-primary-fg border border-primary/30 max-w-full">
                <span className="truncate">{e.texto}</span>
                <button type="button" onClick={() => removerEtiqueta(e.chave)} aria-label={`Remover filtro ${e.texto}`} title="Remover filtro"
                  className="p-0.5 rounded-full hover:bg-primary/20 shrink-0">
                  <X size={11} />
                </button>
              </span>
            ))}
            {etiquetas.length > 1 && (
              <button type="button" onClick={() => { clearFilters(); if (periodoAtual === 'custom') escolherPeriodo(periodoPadrao(statusAtual)) }}
                className="text-xs text-texto-3 hover:text-texto-2 underline ml-1">Limpar tudo</button>
            )}
          </div>
        )}
      </div>

      {/* Contas envolvidas (Resgates anuais): 0 contas = tudo; 1 = origem ou destino; 2+ = entre elas */}
      {filtroContasAtivo && contasChips.length > 0 && (
        <div className="flex items-center gap-2 -mt-1">
          <span className="text-xs text-texto-3 shrink-0">Contas envolvidas:</span>
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelContas(new Set())}
              className={`shrink-0 px-3 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${
                selContas.size === 0 ? 'bg-primary text-white' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover hover:text-texto-1'
              }`}
            >
              Todas
            </button>
            {contasChips.map(c => {
              const ativo = selContas.has(c.accountId)
              return (
                <button
                  key={c.accountId}
                  onClick={() => toggleConta(c.accountId)}
                  aria-pressed={ativo}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${
                    ativo ? 'bg-primary text-white' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover hover:text-texto-1'
                  }`}
                >
                  {c.nome}
                  <span className="opacity-70">{c.count}</span>
                </button>
              )
            })}
          </div>
          {selContas.size > 0 && (
            <button onClick={() => setSelContas(new Set())} title="Limpar contas" className="p-1.5 text-texto-3 hover:text-texto-2 hover:bg-surface-hover rounded transition-colors shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {emCalendario ? (
        <SchedulesTable
          schedules={calSchedules}
          agruparSeries={false}
          accounts={activeTab === 'conta' ? accounts : allAccounts}
          efetivarProvisao={activeTab === 'conta' ? efetivarProvisao : undefined}
          calendario={{
            status: statusCal,
            faturas: calFaturas,
            pagosLinhas: calPagos,
            renderFatura: (p) => (
              <PayableCard payable={p} gerencialGroups={gerencialGroups} accounts={allAccounts} onMarkPaid={handleMarkPaid} onDelete={() => setConfirmDeletePayable(p)} />
            ),
          }}
          {...propsTabela}
        />
      ) : abaPagos && isMobile ? (
        // Celular: os pagos na lista por semana, com o detalhe (estornar, histórico…) ao tocar.
        <SchedulesTable schedules={basePagos} pagosLinhas={pagosVisiveis} accounts={allAccounts} {...propsTabela} />
      ) : abaPagos ? (
        <PagamentosTable
          linhas={pagosVisiveis}
          categories={categories}
          accounts={allAccounts}
          tiposDocumento={tiposDocumento}
        />
      ) : abaSemNada && vazioDaAba ? (
        <div className="card text-center py-12">
          <vazioDaAba.Icone size={32} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-3 text-sm">{vazioDaAba.titulo}</p>
          <p className="text-texto-3 text-xs mt-1">{vazioDaAba.sub}</p>
        </div>
      ) : activeTab === 'cartao' ? (
        <div className="space-y-3">
          {[...invoiceVisiveis].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => (
            <PayableCard key={p.id} payable={p} gerencialGroups={gerencialGroups} accounts={allAccounts} onMarkPaid={handleMarkPaid} onDelete={() => setConfirmDeletePayable(p)} />
          ))}
          {(visibleSchedules.length > 0 || invoiceVisiveis.length === 0) && (
            <SchedulesTable schedules={visibleSchedules} agruparSeries={!hasActiveFilter} accounts={allAccounts} {...propsTabela} />
          )}
        </div>
      ) : (
        <SchedulesTable
          schedules={visibleSchedules}
          agruparSeries={!hasActiveFilter && selContas.size === 0}
          accounts={activeTab === 'conta' ? accounts : allAccounts}
          efetivarProvisao={activeTab === 'conta' ? efetivarProvisao : undefined}
          {...propsTabela}
        />
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditSchedule(null) }} title={editSchedule ? 'Editar Agendamento' : 'Novo Agendamento'} size="lg">
        <ScheduleForm
          initial={editSchedule}
          onClose={() => { setShowForm(false); setEditSchedule(null) }}
          onAviso={(mensagem, variante = 'success') => setAvisoForm({ mensagem, variante })}
        />
      </Modal>

      {avisoForm && (
        <ToastShared
          message={avisoForm.mensagem}
          variant={avisoForm.variante}
          onClose={() => setAvisoForm(null)}
        />
      )}

      <Modal open={showProvisaoForm} onClose={() => { setShowProvisaoForm(false); setEditProvisao(null) }} title={editProvisao ? 'Editar Provisão de Despesa' : 'Lançar Provisão de Despesa'}>
        <ProvisaoForm initial={editProvisao} onClose={() => { setShowProvisaoForm(false); setEditProvisao(null) }} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDeletePayable}
        onClose={() => setConfirmDeletePayable(null)}
        onConfirm={() => handleDeletePayable(confirmDeletePayable?.id)}
        title="Excluir Conta a Pagar"
        message={`Excluir "${confirmDeletePayable?.description}"?`}
        danger
      />

      {showExecutarGer && (
        <ExecutarGerenciaisModal
          provisoes={provisoesPendentes}
          faturasInfo={faturasProvisao}
          accounts={accounts}
          financialMonthStartDay={settings?.financialMonthStartDay || 1}
          financialMonthMode={settings?.financialMonthMode || 'custom'}
          onClose={() => setShowExecutarGer(false)}
          onConfirm={(ids) => { executarProvisoesGerenciais(ids); setShowExecutarGer(false) }}
        />
      )}
    </div>
  )
}
