import { useState, useMemo, useRef } from 'react'
import { ArrowLeftRight, PiggyBank, Repeat, Pencil, Check, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today, fmt, fmtDate, buildAccountSelectOptions, creditBillKey, creditBillStatus } from '../shared/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import { computeFaturaRef } from '../../lib/fatura'
import { ORIGIN } from '../../lib/origins'
import { detectInstallment } from '../../lib/installments'
import { buildSeries, clampDateToFatura, newSerieId } from '../../lib/parcelas'
import ScheduleMatchModal from '../shared/ScheduleMatchModal'
import SearchableSelect from '../shared/SearchableSelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import RateioModal from '../shared/RateioModal'
import DebtPlanModal from './DebtPlanModal'
import DebtPaymentModal from './DebtPaymentModal'
import DateInput from '../shared/DateInput'

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
  { value: 'transfer', label: 'Transferência' },
]

// As 10 frequências do sistema (mesmos values do ScheduleForm/agendamentos).
const REPEAT_FREQUENCIES = [
  { value: 'once', label: 'Uma vez' },
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'quadrimestral', label: 'Quadrimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
]

function GerencialSelect({ value, onChange, grupos }) {
  const sorted = useMemo(() => [...grupos].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  }), [grupos])

  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      {sorted.map(g => (
        <option key={g.id} value={g.id}>
          {g.number} · {g.name}
        </option>
      ))}
    </select>
  )
}

const GERENCIAL_CONTA_KEY = 'lastGerencialAccountId'

// Opções do select "Fatura de referência": mês anterior, mês atual e próximos 3
// meses (5 no total), no formato MM/AAAA. Valor armazenado em 'YYYY-MM'.
function buildFaturaRefOptions() {
  const now = new Date()
  const opts = []
  for (let off = -1; off <= 3; off++) {
    const d = new Date(now.getFullYear(), now.getMonth() + off, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    opts.push({ value: `${yyyy}-${mm}`, label: `${mm}/${yyyy}` })
  }
  return opts
}

function buildCatOpts(categories, type) {
  return categories
    .filter(c => !type || c.type === type || c.type === 'both')
    .map(c => ({ id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null }))
}

export default function TransactionForm({ initial, onClose, onToast }) {
  const {
    accounts, accountGroups, categories, costCenters, payees, transactions, schedules,
    gerencialGroups, processarLancamentoGerencial, criarParcelasGerencial, ajustarParcelasGrupoGerencial, propagarValorParcelas, reverseGerencialCascadeOnly, recalcularAgendamentosFatura,
    addTransaction, updateTransaction, addPayee, addCostCenter,
    addSchedule, updateSchedule, deleteSchedule,
    findMatchingSchedule, addRecurringMatchException, markScheduleRegistered, getNextOccurrences,
    rateiosByLancamento, saveRateiosFor, deleteRateiosFor,
    reserveFunctions, settings,
  } = useApp()

  // Dia de início do mês financeiro — define a date de sistema das parcelas 2..N
  // (dia financialMonthStartDay do mês anterior à fatura da parcela).
  const financialStartDay = settings?.financialMonthStartDay || 1

  const defaultGrupoId = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'

  const checkingAccounts = useMemo(
    () => accounts.filter(a => (a.type === 'checking' || a.contaCorrentePrincipal) && a.active !== false),
    [accounts]
  )

  const [gerencialContaId, setGerencialContaId] = useState(() => {
    const saved = localStorage.getItem(GERENCIAL_CONTA_KEY)
    if (saved && accounts.some(a => a.id === saved)) return saved
    return accounts.find(a => a.contaCorrentePrincipal)?.id
      || accounts.find(a => a.type === 'checking')?.id
      || ''
  })

  const [form, setForm] = useState({
    type: initial?.type || 'expense',
    accountId: initial?.accountId || accounts[0]?.id || '',
    toAccountId: initial?.toAccountId || '',
    amount: initial?.amount ?? '',
    date: initial?.date || today(),
    dateCartao: initial?.dateCartao || '',
    categoryId: initial?.categoryId || '',
    description: initial?.description || '',
    payee: initial?.payee || '',
    costCenter: initial?.costCenter || '',
    notes: initial?.notes || '',
    grupoGerencial: initial?.grupoGerencial || defaultGrupoId,
    faturaMonthYear: initial?.faturaMonthYear || '',
    faturaRef: initial?.faturaRef || '',
    reservaFuncaoId: initial?.reservaFuncaoId || '',
    categoriaCnpjId: initial?.categoriaCnpjId || '',
    categoriaCpfId: initial?.categoriaCpfId || '',
    repeat: false,
    repeatFrequency: 'monthly',
    repeatOccurrenceType: 'continuous',
    repeatInstallments: 2,
    repeatRemindDaysBefore: 0,
    useReserva: false,
    reservaAccountId: '',
    reservaExpenseCategoryId: '',
    installments: 1,
  })

  const [step, setStep] = useState('form')
  const [resgateInfo, setResgateInfo] = useState(null)
  const [resgateDate, setResgateDate] = useState(() => today())
  const [scheduleMatch, setScheduleMatch] = useState(null)
  const [debtCtx, setDebtCtx] = useState(null)
  // Item 2: "N/Total" detectado na descrição sem "Parcelado" marcado → guarda a parcela
  // detectada para o passo de confirmação (a decisão é passada explícita ao re-submeter).
  const [installmentPrompt, setInstallmentPrompt] = useState(null)

  // Edição inline de num/total no card "Parcela N de M". instOverride: undefined = intacto
  // (usa initial); null = à vista; { num, total } = parcelado aplicado localmente (feedback
  // imediato, já que o prop `initial` não se atualiza após updateTransaction).
  const [instOverride, setInstOverride] = useState(undefined)
  const [editInst, setEditInst] = useState(false)
  const [instInput, setInstInput] = useState('')
  const effInstNum = instOverride !== undefined ? (instOverride?.num ?? null) : (initial?.installmentNum ?? null)
  const effInstTotal = instOverride !== undefined ? (instOverride?.total ?? null) : (initial?.installmentTotal ?? null)

  // Item 6: série de parcelas do lançamento em edição (Parcela N de M + irmãs + faltantes).
  const parcelaSeries = useMemo(() => {
    if (!initial?.id || effInstNum == null || effInstTotal == null) return null
    const acc = accounts.find(a => a.id === initial.accountId)
    return buildSeries({ ...initial, installmentNum: effInstNum, installmentTotal: effInstTotal }, transactions, acc, financialStartDay)
  }, [initial, transactions, accounts, effInstNum, effInstTotal, financialStartDay])

  // Rateio (divisão em categorias). Em edição, carrega os rateios já salvos do lançamento.
  const hadRateio = !!(initial?.id && (rateiosByLancamento?.get(initial.id)?.length > 0))
  const [rateioRows, setRateioRows] = useState(() =>
    initial?.id ? (rateiosByLancamento?.get(initial.id) || []).map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })) : []
  )
  const [showRateio, setShowRateio] = useState(false)
  const rateioTotal = rateioRows.reduce((s, r) => s + (Number(r.valor) || 0), 0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Favorecido → Descrição: a descrição acompanha o favorecido enquanto o usuário não a editar
  // manualmente. Inicia "já editada" quando o lançamento existente tem uma descrição própria
  // (diferente do favorecido) — assim a edição de favorecido não sobrescreve uma descrição
  // independente. Form novo (ambos vazios) inicia false (a descrição segue o favorecido).
  const descEditedRef = useRef(
    (initial?.description || '') !== '' && (initial?.description || '') !== (initial?.payee || '')
  )
  const onPayeeChange = (v) => {
    setForm(f => {
      const next = { ...f, payee: v }
      if (!descEditedRef.current) next.description = v // descrição segue o favorecido
      return next
    })
  }
  const onDescriptionChange = (v) => {
    // Digitar algo diferente do favorecido atual marca a descrição como editada manualmente
    // (a partir daí ela deixa de acompanhar o favorecido).
    if (v !== form.payee) descEditedRef.current = true
    set('description', v)
  }

  const selectedAccount = accounts.find(a => a.id === form.accountId)
  const isCredit = selectedAccount?.type === 'credit'
  const showGerencial = isCredit && form.type === 'expense'

  // Seleção de categoria: além de gravar a categoria, aplica o grupo gerencial PADRÃO da categoria
  // quando o gerencial é aplicável (showGerencial) e o grupo atual está vazio ou no padrão D
  // (não sobrescreve escolha manual ≠ D). Prioridade: escolha manual > padrão da categoria.
  const onCategoryChange = (id) => {
    set('categoryId', id)
    const cat = id ? categories.find(c => c.id === id) : null
    if (cat?.defaultGerencialGroup && showGerencial && (!form.grupoGerencial || form.grupoGerencial === defaultGrupoId)) {
      set('grupoGerencial', cat.defaultGerencialGroup)
    }
  }

  // Grupo gerencial numerado (2,3,…) selecionado: a reserva é determinada pela conta-origem
  // do grupo (defaultAccountId), não escolhida pelo usuário. Nesse modo o toggle
  // "Pago com reserva?" expõe um select de FUNÇÃO de reserva (igual ao inline da importação)
  // para indicar de qual bucket sai o resgate — o agendamento resgate_reserva é gerado/
  // acumulado por recalcularAgendamentosFatura ao salvar.
  const selectedGerencialGroup = useMemo(
    () => gerencialGroups.find(g => g.id === form.grupoGerencial) || null,
    [gerencialGroups, form.grupoGerencial]
  )
  const isNumberedGerencial = typeof selectedGerencialGroup?.number === 'number' && selectedGerencialGroup.number !== 1
  const reservaFuncaoMode = showGerencial && isNumberedGerencial
  const reservaGroupFuncs = useMemo(
    () => (reservaFuncaoMode && selectedGerencialGroup?.defaultAccountId)
      ? (reserveFunctions || []).filter(f => f.accountId === selectedGerencialGroup.defaultAccountId)
      : [],
    [reservaFuncaoMode, selectedGerencialGroup, reserveFunctions]
  )
  const reservaGroupAccount = useMemo(
    () => (reservaFuncaoMode && selectedGerencialGroup?.defaultAccountId)
      ? accounts.find(a => a.id === selectedGerencialGroup.defaultAccountId)
      : null,
    [reservaFuncaoMode, selectedGerencialGroup, accounts]
  )

  const isMobile = useIsMobile()
  const reservaAccounts = useMemo(() => accounts.filter(a => a.isReserva && a.active !== false && (!isMobile || !a.hideOnMobile)), [accounts, isMobile])
  // Funções da conta de reserva escolhida em "Será pago com reserva" (despesa de conta corrente).
  const reservaContaFuncs = useMemo(
    () => form.reservaAccountId ? (reserveFunctions || []).filter(f => f.accountId === form.reservaAccountId) : [],
    [form.reservaAccountId, reserveFunctions]
  )
  const matchingSpecificReserva = useMemo(
    () => form.type === 'expense' && form.categoryId
      ? reservaAccounts.find(a => a.reservaType === 'especifica' && a.reservaCategoryId === form.categoryId)
      : null,
    [form.type, form.categoryId, reservaAccounts]
  )

  const transferToAcc = form.type === 'transfer' ? accounts.find(a => a.id === form.toAccountId) : null
  // Faturas do cartão destino, para vincular um pagamento por transferência a uma fatura.
  const faturaCardOpts = useMemo(() => {
    if (form.type !== 'transfer' || transferToAcc?.type !== 'credit') return []
    const cur = creditBillKey(today(), transferToAcc)
    if (!cur) return []
    const off = (key, delta) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
    const out = []
    for (let i = 6; i >= -2; i--) {
      const k = off(cur, -i)
      out.push({ key: k, billTotal: creditBillStatus(transferToAcc, transactions, schedules, k).billTotal })
    }
    return out
  }, [form.type, transferToAcc, transactions, schedules])
  // Preview ao vivo do vínculo de pagamento (pago a mais / falta pagar), tolerância 1¢.
  const faturaPreview = useMemo(() => {
    if (form.type !== 'transfer' || transferToAcc?.type !== 'credit' || !form.faturaMonthYear) return null
    const billTotal = creditBillStatus(transferToAcc, transactions, schedules, form.faturaMonthYear).billTotal
    const pagando = Number(form.amount) || 0
    return { billTotal, pagando, dif: Math.round((pagando - billTotal) * 100) / 100 }
  }, [form.type, transferToAcc, transactions, schedules, form.faturaMonthYear, form.amount])
  const transferFromAcc = form.type === 'transfer' ? accounts.find(a => a.id === form.accountId) : null
  // Conta gerencial: tipo 'gerencial', flag isGerencial, ou grupoGerencial já preenchido (flag existente).
  const isGerencialAccount = (a) => a?.type === 'gerencial' || a?.isGerencial === true || a?.grupoGerencial != null
  // Campo "Fatura de Referência": só em transferências que envolvem uma conta gerencial (origem ou destino).
  const showFaturaRef = form.type === 'transfer' && (isGerencialAccount(transferFromAcc) || isGerencialAccount(transferToAcc))
  const isDepositToReserva = !!transferToAcc?.isReserva
  const isWithdrawFromReserva = !!transferFromAcc?.isReserva
  const reservaTransferAcc = isDepositToReserva ? transferToAcc : isWithdrawFromReserva ? transferFromAcc : null
  const needsReservaCategorySelect = !!reservaTransferAcc && reservaTransferAcc.reservaType === 'geral'
  const reservaLinkedCat = reservaTransferAcc?.reservaType === 'especifica'
    ? categories.find(c => c.id === reservaTransferAcc.reservaCategoryId)
    : null

  // Funções de reserva da conta de reserva envolvida na transferência (origem ou destino).
  // O select só aparece quando há mais de uma função para aquela conta.
  const reservaFuncs = useMemo(
    () => reservaTransferAcc ? (reserveFunctions || []).filter(f => f.accountId === reservaTransferAcc.id) : [],
    [reservaTransferAcc, reserveFunctions]
  )
  const showReservaFuncao = form.type === 'transfer' && reservaFuncs.length > 1
  // Conta de reserva com função ÚNICA: reserva_funcao_id é determinado automaticamente
  // (não precisa de select nem de categoria manual — a única função já é a escolha).
  const reservaFuncaoUnica = form.type === 'transfer' && reservaFuncs.length === 1 ? reservaFuncs[0] : null

  // Transferência cujo DESTINO é conta de aplicação financeira (e não é reserva):
  // habilita um campo OPCIONAL de categoria para classificar o aporte nos relatórios.
  const isTransferToAplicacao = !!transferToAcc?.contaAplicacao && !isDepositToReserva && !isWithdrawFromReserva

  // Transferência entre perfis diferentes (CPF↔CNPJ): habilita categorias por visão (PARTE 1).
  const fromProfileId = transferFromAcc?.profileId || null
  const toProfileId = transferToAcc?.profileId || null
  const isInterProfileTransfer = form.type === 'transfer' && !!fromProfileId && !!toProfileId && fromProfileId !== toProfileId

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  // Options for SearchableSelect fields
  const accountOpts = useMemo(() => buildAccountSelectOptions(accounts, accountGroups, { isMobile }), [accounts, accountGroups, isMobile])
  const destAccountOpts = useMemo(() => buildAccountSelectOptions(accounts, accountGroups, { excludeId: form.accountId, isMobile }), [accounts, accountGroups, form.accountId, isMobile])
  const categoryOpts = useMemo(() => buildCatOpts(categories, form.type === 'transfer' ? null : form.type), [categories, form.type])
  const expenseCatOpts = useMemo(() => buildCatOpts(categories, 'expense'), [categories])

  // Fatura de referência: 5 meses padrão + o valor atual (ex.: fatura antiga em edição)
  // caso não esteja no intervalo, para não perdê-lo no select.
  const faturaRefOptions = useMemo(() => {
    const opts = buildFaturaRefOptions()
    const cur = form.faturaMonthYear
    if (cur && !opts.some(o => o.value === cur)) {
      const [y, m] = cur.split('-')
      opts.unshift({ value: cur, label: `${m}/${y}` })
    }
    return opts
  }, [form.faturaMonthYear])

  const sortedPayees = useMemo(() => {
    const counts = {}
    for (const tx of transactions) {
      if (tx.payee) counts[tx.payee] = (counts[tx.payee] || 0) + 1
    }
    return [...new Set([...payees])].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  }, [transactions, payees])

  // Parcelas seguintes (X+1..N) da mesma cadeia X/N, no mesmo cartão — para propagação de valor
  const subsequentParcelas = useMemo(() => {
    if (!initial?.id || initial.accountType !== 'credit' || initial.type !== 'expense') return []
    const parse = (desc) => {
      const m = (desc || '').match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/)
      if (!m) return null
      const num = parseInt(m[1], 10), total = parseInt(m[2], 10)
      if (num < 1 || total < 2 || num > total) return null
      return { num, total, base: desc.replace(m[0], '').trim().replace(/\s+/g, ' ').toLowerCase() }
    }
    const baseInst = parse(initial.description)
    if (!baseInst) return []
    return transactions.filter(t => {
      if (t.id === initial.id) return false
      if (t.accountId !== initial.accountId || t.type !== 'expense' || t.accountType !== 'credit') return false
      const pi = parse(t.description)
      return pi && pi.total === baseInst.total && pi.num > baseInst.num && pi.base === baseInst.base
    })
  }, [initial, transactions])

  const handleSubmit = (e, installmentDecision) => {
    e?.preventDefault?.()
    if (!form.amount || !form.accountId) return

    // Item 2: descrição com "N/Total" e "Parcelado" não marcado → nunca decidir em silêncio.
    // Mostra o passo de confirmação; a decisão volta como `installmentDecision` no re-submit
    // ({num,total} = é parcela; {skip:true} = lançar como está). Só em NOVA despesa de cartão.
    const isNewCardExpense = !initial?.id && isCredit && form.type === 'expense'
    if (isNewCardExpense && form.installments <= 1 && !installmentDecision) {
      const det = detectInstallment(form.description || '')
      if (det) {
        setInstallmentPrompt(det)
        setStep('installment-detect')
        return
      }
    }

    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)
    if (form.costCenter && !costCenters.includes(form.costCenter)) addCostCenter(form.costCenter)

    // Reserva livre exige categoria manual — EXCETO quando a conta tem função única
    // (categoria determinada automaticamente) ou quando o usuário já selecionou uma
    // função de reserva (a função substitui a necessidade da categoria).
    if (form.type === 'transfer' && needsReservaCategorySelect && !reservaFuncaoUnica && !form.reservaFuncaoId && !form.reservaExpenseCategoryId) return

    // Grupo numerado multi-função (Reservas Anuais): a função de reserva é obrigatória — sem
    // ela o resgate da fatura não fica atribuído a nenhuma função (some do Fluxo Futuro/Resumo).
    if (reservaFuncaoMode && reservaGroupFuncs.length > 1 && !form.reservaFuncaoId) {
      alert('Selecione a função de reserva para este grupo.')
      return
    }

    const isParcelado = !initial?.id && isCredit && form.type === 'expense' && form.installments > 1
    const installmentAmount = isParcelado
      ? Math.round(Number(form.amount) / form.installments * 100) / 100
      : Number(form.amount)

    // Item 4: tags de parcela na criação. "Parcelado" marcado → base é a parcela 1 de N.
    // Item 2 confirmado → usa o N/Total detectado na descrição. Caso contrário, sem tag.
    const decidedInst = installmentDecision && !installmentDecision.skip ? installmentDecision : null
    const installmentNum = isParcelado ? 1 : (decidedInst ? decidedInst.num : null)
    const installmentTotal = isParcelado ? form.installments : (decidedInst ? decidedInst.total : null)
    // serie_id: elo da série. Gerado UMA vez na parcela base (compra parcelada) e propagado
    // às filhas em criarParcelasGerencial. À vista / parcela avulsa detectada → null.
    const serieId = isParcelado ? newSerieId() : null

    // eslint-disable-next-line no-unused-vars
    const { useReserva: _ur, reservaAccountId: _rai, reservaExpenseCategoryId: _reci, installments: _inst, repeat: _rep, repeatFrequency: _rf, repeatOccurrenceType: _rot, repeatInstallments: _ri, repeatRemindDaysBefore: _rrd, ...formFields } = form
    const txData = {
      ...formFields,
      amount: installmentAmount,
      accountType: selectedAccount?.type,
      grupoGerencial: showGerencial ? form.grupoGerencial : null,
      faturaMonthYear:
        (isCredit && form.type === 'expense' && form.faturaMonthYear) ? form.faturaMonthYear
        : (form.type === 'transfer' && transferToAcc?.type === 'credit' && form.faturaMonthYear) ? form.faturaMonthYear
        : null,
      // Fatura de Referência (MM/AAAA) — editável só em transferências gerenciais; nos demais casos
      // preserva o valor existente (ex.: etapa A tx_gerA_* já traz faturaRef própria).
      faturaRef: showFaturaRef ? ((form.faturaRef || '').trim() || null) : (initial?.faturaRef ?? null),
      dateCartao: form.dateCartao || null,
      installmentNum,
      installmentTotal,
      serieId,
      // Transferência com função de reserva selecionada (origem/destino reserva c/ >1 função).
      // Despesa com "Pago com reserva?" ativo (cartão grupo numerado OU conta corrente): função
      // escolhida no select. Em edição, preserva o valor existente (ex.: cartão importado).
      reservaFuncaoId: form.type === 'transfer'
        ? (showReservaFuncao ? (form.reservaFuncaoId || null) : (reservaFuncaoUnica?.id || null))
        : (initial?.id
            ? (form.reservaFuncaoId || null)
            : (form.useReserva ? (form.reservaFuncaoId || null) : null)),
      // "Será pago com reserva" em despesa de conta corrente: guarda a conta de reserva escolhida
      // (par de reservaFuncaoId). Não cria transferência aqui — só registra o vínculo. Em edição
      // preserva o valor existente (o formulário de edição não reexibe a seção de reserva).
      reservaContaId: initial?.id
        ? (initial.reservaContaId || null)
        : ((form.type === 'expense' && form.useReserva && !reservaFuncaoMode) ? (form.reservaAccountId || null) : null),
      ...(form.type === 'transfer' && form.reservaExpenseCategoryId ? { reservaExpenseCategoryId: form.reservaExpenseCategoryId } : {}),
    }

    // Categoria só é mantida em transferências quando o destino é conta de aplicação
    // financeira (aporte categorizado). Transferências comuns nunca carregam categoria.
    if (form.type === 'transfer' && !isTransferToAplicacao) {
      txData.categoryId = null
    }

    // Categorias de transferência entre perfis (visão CNPJ/CPF) — só em transferências cross-profile.
    txData.categoriaCnpjId = isInterProfileTransfer ? (form.categoriaCnpjId || null) : null
    txData.categoriaCpfId = isInterProfileTransfer ? (form.categoriaCpfId || null) : null

    if (initial?.id) {
      updateTransaction(initial.id, txData)

      // Rateio: grava/atualiza ou remove os rateios deste lançamento.
      if (form.type !== 'transfer') {
        if (rateioRows.length > 0) saveRateiosFor(initial.id, rateioRows)
        else if (hadRateio) deleteRateiosFor(initial.id)
      }

      // Ajuste de automações gerenciais em edição de despesa de cartão
      const isCardExpense = initial.accountType === 'credit' && initial.type === 'expense'
      if (isCardExpense) {
        const prevGrupoId   = initial.grupoGerencial || null
        const newGrupoId    = txData.grupoGerencial  || null
        const prevGrupo     = gerencialGroups.find(g => g.id === prevGrupoId)
        const newGrupo      = gerencialGroups.find(g => g.id === newGrupoId)
        const wasGerencial1 = prevGrupo?.number === 1
        const isGerencial1  = newGrupo?.number === 1
        const wasNumbered   = typeof prevGrupo?.number === 'number' && prevGrupo.number !== 1
        const isNumbered    = typeof newGrupo?.number === 'number' && newGrupo.number !== 1
        const groupChanged  = prevGrupoId !== newGrupoId
        const amountChanged = Math.abs(Number(form.amount) - initial.amount) > 0.005

        if (groupChanged) {
          // — Desfaz automação do grupo anterior —
          if (wasGerencial1) {
            reverseGerencialCascadeOnly(initial)
          }
          if (wasNumbered && initial.gerencialScheduleId) {
            const oldSch = schedules.find(s => s.id === initial.gerencialScheduleId)
            if (oldSch) {
              const done = (oldSch.registered || []).includes(oldSch.startDate)
                        || (oldSch.skipped   || []).includes(oldSch.startDate)
              if (!done) {
                const newAmt = Math.max(0, Math.round(((oldSch.amount || 0) - initial.amount) * 100) / 100)
                if (newAmt <= 0) deleteSchedule(oldSch.id)
                else updateSchedule(oldSch.id, { amount: newAmt })
              }
            }
            updateTransaction(initial.id, { gerencialScheduleId: null })
          }

          // — Aplica automação do novo grupo —
          if (isGerencial1) {
            const contaId = gerencialContaId
            if (contaId) localStorage.setItem(GERENCIAL_CONTA_KEY, contaId)
            processarLancamentoGerencial(
              { accountId: initial.accountId, amount: Number(form.amount), date: form.date, description: form.description, faturaMonthYear: txData.faturaMonthYear || null },
              newGrupoId, contaId || null
            )
          }
          if (isNumbered) {
            const res = processarLancamentoGerencial(
              { accountId: initial.accountId, amount: Number(form.amount), date: form.date, description: form.description, faturaMonthYear: txData.faturaMonthYear || null },
              newGrupoId, null
            )
            if (res.gerencialScheduleId) updateTransaction(initial.id, { gerencialScheduleId: res.gerencialScheduleId })
            if (res.scheduleDate) onToast?.(`Agendamento de resgate criado para ${fmtDate(res.scheduleDate)}.`)
          }

          // — Cascata parcelas 2..N —
          if (wasGerencial1 || wasNumbered || isGerencial1 || isNumbered) {
            ajustarParcelasGrupoGerencial(initial.id, {
              prevGrupoId,
              newGrupoId: (isGerencial1 || isNumbered) ? newGrupoId : null,
              amount: Number(form.amount),
              accountId: initial.accountId,
            })
          }
        } else if (amountChanged) {
          // — Mesmo grupo, valor alterado —
          if (wasGerencial1) {
            reverseGerencialCascadeOnly(initial)
            processarLancamentoGerencial(
              { accountId: initial.accountId, amount: Number(form.amount), date: form.date, description: form.description, faturaMonthYear: txData.faturaMonthYear || null },
              newGrupoId, gerencialContaId || null
            )
          }
          if (wasNumbered && initial.gerencialScheduleId) {
            const oldSch = schedules.find(s => s.id === initial.gerencialScheduleId)
            if (oldSch) {
              const done = (oldSch.registered || []).includes(oldSch.startDate)
                        || (oldSch.skipped   || []).includes(oldSch.startDate)
              if (!done) {
                const delta  = Number(form.amount) - initial.amount
                const newAmt = Math.max(0, Math.round(((oldSch.amount || 0) + delta) * 100) / 100)
                if (newAmt <= 0) { deleteSchedule(oldSch.id); updateTransaction(initial.id, { gerencialScheduleId: null }) }
                else updateSchedule(oldSch.id, { amount: newAmt })
              }
            }
          }
        }

        // Reconstrói os agendamentos da fatura (gerencial_devolucao do Grupo G,
        // resgate_reserva + schedule_reserva_funcoes dos numerados e pagamento_fatura)
        // quando a despesa está/estava em grupo gerido — captura também a mudança de
        // função de reserva, que não passa pelas ramificações de grupo/valor acima.
        // Inclui o Grupo G (number 1): sem este recálculo explícito, o gerencial_devolucao
        // dependia só do gatilho implícito e podia não ser (re)gerado para cartões cuja
        // subconta ainda não existia.
        if (isNumbered || wasNumbered || isGerencial1 || wasGerencial1) {
          const card = accounts.find(a => a.id === initial.accountId)
          let fmy = txData.faturaMonthYear
          if (!fmy) {
            const ref = computeFaturaRef(new Date((txData.date || initial.date) + 'T00:00:00'), card?.closingDay || 14) // MM/YYYY
            const [mm, yyyy] = ref.split('/')
            fmy = `${yyyy}-${mm}`
          }
          if (fmy) {
            const [y, m] = fmy.split('-')
            recalcularAgendamentosFatura(initial.accountId, y, m)
          }
        }
      }

      // Parcelado: oferecer propagação do novo valor para as parcelas seguintes da cadeia
      const amountChangedNow = Math.abs(Number(form.amount) - initial.amount) > 0.005
      if (amountChangedNow && subsequentParcelas.length > 0) {
        setStep('propagate-parcelas')
        return
      }

      onClose()
      return
    }

    // Procedência de um lançamento NOVO: preserva o `origin` vindo do initial (ex.: duplicação
    // carimba 'duplicado'). Lançamento novo comum (initial sem origin) cai no default 'manual'
    // do addTransaction. Nunca chega no updateTransaction (edição só passa por cima, acima).
    if (initial?.origin) txData.origin = initial.origin

    if (form.type === 'transfer' && form.toAccountId && !initial?.id) {
      const toAcc = accounts.find(a => a.id === form.toAccountId)
      const toGroup = (accountGroups || []).find(g => g.id === toAcc?.accountGroupId)
      if (toGroup?.behavior === 'divida' || toGroup?.behavior === 'emprestimo') {
        const ctx = { account: toAcc, group: toGroup, amount: Number(form.amount), date: form.date, sourceAccountId: form.accountId }
        if (toAcc.debtPlan) {
          setDebtCtx(ctx)
          setStep('debt-payment')
          return
        } else {
          addTransaction(txData)
          setDebtCtx(ctx)
          setStep('debt-plan')
          return
        }
      }
    }

    const txId = addTransaction(txData)

    // Rateio: salva os rateios para o lançamento recém-criado.
    if (form.type !== 'transfer' && rateioRows.length > 0 && txId) saveRateiosFor(txId, rateioRows)

    // Parcelado manual em cartão: cria as parcelas FUTURAS (2..N) como lançamentos reais, cada
    // uma na sua fatura. Roda para QUALQUER grupo gerencial (inclui Grupo D / despesa normal) —
    // não depende do bloco gerencial abaixo. Herda categoria, favorecido, centro de custo,
    // observações, grupo, função de reserva e o rateio da parcela base. A installment_key
    // (calculada em txToRow) + o índice único no banco evitam duplicatas;
    // recalcularAgendamentosFatura roda por fatura dentro de criarParcelasGerencial.
    if (isParcelado && txId) {
      const parcelaIds = criarParcelasGerencial(txId, {
        accountId: form.accountId,
        amount: installmentAmount,
        date: form.date,
        grupoGerencialId: txData.grupoGerencial,
        installments: form.installments,
        description: form.description,
        categoryId: txData.categoryId || null,
        payee: form.payee || null,
        costCenter: form.costCenter || null,
        notes: form.notes || null,
        reservaFuncaoId: txData.reservaFuncaoId || null,
        baseFaturaMonthYear: txData.faturaMonthYear || null,
        serieId,
      })
      if (rateioRows.length > 0 && parcelaIds?.length) {
        for (const pid of parcelaIds) saveRateiosFor(pid, rateioRows)
      }
    }

    // Painel "Repetir este lançamento" (somente em NOVO): cria um agendamento com os
    // mesmos dados, usando a data do lançamento como início. A ocorrência da data de
    // início é marcada como já registrada (corresponde a este próprio lançamento), e
    // autoRegister fica desligado para não re-registrar datas passadas no próximo load.
    if (form.repeat) {
      const schId = addSchedule({
        description: form.description || form.payee || 'Lançamento recorrente',
        transactionType: form.type,
        accountId: form.accountId,
        toAccountId: form.type === 'transfer' ? form.toAccountId : '',
        amount: installmentAmount,
        accountType: selectedAccount?.type,
        categoryId: form.type === 'transfer' ? (txData.categoryId || '') : (form.categoryId || ''),
        payee: form.payee || '',
        costCenter: form.costCenter || '',
        frequency: form.repeatFrequency,
        startDate: form.date,
        occurrenceType: form.repeatFrequency === 'once' ? 'continuous' : form.repeatOccurrenceType,
        installments: form.repeatOccurrenceType === 'installment' ? Number(form.repeatInstallments) : 0,
        remindDaysBefore: Number(form.repeatRemindDaysBefore) || 0,
        autoRegister: false,
        grupoGerencial: showGerencial ? form.grupoGerencial : null,
        skipped: [],
        overrides: {},
      })
      markScheduleRegistered(schId, form.date)
    }

    // "Será pago com reserva" (despesa de conta corrente): a despesa já foi salva com o vínculo
    // (reservaContaId/reservaFuncaoId), SEM mexer na reserva. Abre o modal perguntando se deseja
    // agendar o resgate (resgate_reserva uma vez) — o usuário escolhe a data ou dispensa.
    if (form.type === 'expense' && form.useReserva && form.reservaAccountId && !reservaFuncaoMode) {
      const reservaAcc = accounts.find(a => a.id === form.reservaAccountId)
      const func = reserveFunctions.find(f => f.id === form.reservaFuncaoId)
      setResgateInfo({
        contaResgate: reservaAcc,
        funcaoId: form.reservaFuncaoId || null,
        funcaoNome: func?.name || '',
        amount: Number(form.amount),
        sourceTxId: txId, // Chain ID: liga o agendamento de resgate ao lançamento recém-salvo.
      })
      setResgateDate(form.date || today())
      setStep('resgate')
      return
    }

    if (showGerencial && form.grupoGerencial) {
      const g = gerencialGroups.find(g => g.id === form.grupoGerencial)
      const contaId = g?.number === 1 ? gerencialContaId : null
      if (g?.number === 1 && gerencialContaId) {
        localStorage.setItem(GERENCIAL_CONTA_KEY, gerencialContaId)
      }
      const resultado = processarLancamentoGerencial(
        { accountId: form.accountId, amount: installmentAmount, date: form.date, description: form.description, faturaMonthYear: txData.faturaMonthYear || null },
        form.grupoGerencial,
        contaId,
      )
      if (resultado.gerencialScheduleId) {
        updateTransaction(txId, { gerencialScheduleId: resultado.gerencialScheduleId })
      }
      if (resultado.scheduleDate) {
        onToast?.(`Agendamento de resgate criado para ${fmtDate(resultado.scheduleDate)}.`)
      }
      // (As parcelas futuras 2..N já foram criadas logo após addTransaction, independentemente
      // do grupo gerencial — ver criarParcelasGerencial acima.)

      // Recálculo EXPLÍCITO da fatura da parcela base (Grupo G ou numerado). Roda DEPOIS de
      // processarLancamentoGerencial — que já garantiu a subconta "Ger. {apelido}" — então o
      // gerencial_devolucao/resgate é gerado de forma confiável, sem depender do timing do
      // gatilho implícito (antes, a subconta podia não existir quando o gatilho rodava, e o
      // agendamento de devolução não era gerado para cartões usados pela 1ª vez no Grupo G).
      const ehGerido = g && (g.number === 1 || (typeof g.number === 'number' && g.number !== 1))
      if (ehGerido) {
        const card = accounts.find(a => a.id === form.accountId)
        let fmy = txData.faturaMonthYear
        if (!fmy) {
          const ref = computeFaturaRef(new Date(form.date + 'T00:00:00'), card?.closingDay || 14) // MM/YYYY
          const [mm, yyyy] = ref.split('/')
          fmy = `${yyyy}-${mm}`
        }
        if (fmy) {
          const [y, m] = fmy.split('-')
          recalcularAgendamentosFatura(form.accountId, y, m)
        }
      }
    }

    if (isCredit && form.type === 'expense') {
      const match = findMatchingSchedule(txData)
      if (match) {
        setScheduleMatch({ schedule: match, tx: txData })
        setStep('schedule-match')
        return
      }
    }

    onClose()
  }

  // Item 6 / Gate 3: insere as parcelas faltantes da série (só após clique de confirmação
  // no passo de prévia). Reusa a saída de buildSeries e dispara recalcularAgendamentosFatura
  // por fatura afetada (igual ao fluxo de parcelas futuras do ImportPanel).
  const confirmarGerarParcelas = () => {
    const missing = parcelaSeries?.missing || []
    if (missing.length === 0) { onClose(); return }
    const card = accounts.find(a => a.id === initial.accountId)
    const closingDay = card?.closingDay || 14
    // serie_id: parcelas faltantes herdam o elo já existente na série (qualquer irmã que o tenha).
    // Série legada sem serie_id → null (fallback installment_key). Nunca fabricamos aqui.
    const serieId = (parcelaSeries?.siblings || []).map(s => s.serieId).find(Boolean) || null
    const faturas = new Set()
    for (const p of missing) {
      const grupo = p.grupoGerencial || defaultGrupoId
      // p.date já segue a regra (parcela >1 → mês anterior à fatura). NÃO clampar essas, senão
      // a data voltaria para o mês da própria fatura. Parcela 1 mantém o clamp ao período.
      const date = (p.num || 1) > 1 ? p.date : clampDateToFatura(p.date, p.faturaMonthYear, closingDay)
      if (p.payee && !payees.includes(p.payee)) addPayee(p.payee)
      addTransaction({
        type: 'expense', accountId: initial.accountId, accountType: 'credit',
        amount: p.amount, date, description: p.description,
        categoryId: p.categoryId || null, payee: p.payee || null,
        grupoGerencial: grupo,
        faturaMonthYear: p.faturaMonthYear,
        reservaFuncaoId: p.reservaFuncaoId || null,
        installmentNum: p.num, installmentTotal: p.total,
        serieId,
        origin: ORIGIN.PARCELA_GERADA,
        _fromImport: true, // pula recálculo por-tx; recalculamos a fatura abaixo, uma vez
      })
      if (grupo) {
        processarLancamentoGerencial(
          { accountId: initial.accountId, amount: p.amount, date, description: p.description, faturaMonthYear: p.faturaMonthYear },
          grupo, null, { immediate: false }
        )
      }
      faturas.add(p.faturaMonthYear)
    }
    for (const fmy of faturas) {
      const [y, m] = (fmy || '').split('-')
      if (y && m) recalcularAgendamentosFatura(initial.accountId, y, m)
    }
    onToast?.(`${missing.length} parcela${missing.length !== 1 ? 's' : ''} gerada${missing.length !== 1 ? 's' : ''}.`)
    onClose()
  }

  // Edição manual de num/total no card. Override que prevalece sobre o detectInstallment.
  const eligivelParcela = !!initial?.id && isCredit && form.type === 'expense'
  const openInstEditor = () => {
    setInstInput(effInstNum != null && effInstTotal != null ? `${effInstNum}/${effInstTotal}` : '')
    setEditInst(true)
  }
  const confirmInstEdit = () => {
    const m = (instInput || '').trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)
    if (!m) { onToast?.('Use o formato N/M (ex: 2/3).'); return }
    const num = parseInt(m[1], 10), total = parseInt(m[2], 10)
    if (num < 1 || total < 2 || num > total || total > 99) { onToast?.('Parcela inválida (ex: 2/3).'); return }
    // Irmãs já existentes da série ATUAL (antes da troca) — passam a usar o novo total,
    // mantendo o próprio num, para a série ficar consistente.
    const oldSiblings = parcelaSeries?.siblings || []
    // serie_id: propaga o elo existente da série para as irmãs que ainda não o têm (só preenche
    // nulos — nunca sobrescreve um serie_id já gravado). Série totalmente legada → fica no fallback.
    const serieId = [initial, ...oldSiblings].map(s => s.serieId).find(Boolean) || null
    updateTransaction(initial.id, {
      installmentNum: num, installmentTotal: total,
      ...(serieId && !initial.serieId ? { serieId } : {}),
    })
    for (const s of oldSiblings) {
      if (s.id === initial.id) continue
      const changes = {}
      if ((Number(s.installmentTotal) || null) !== total) changes.installmentTotal = total
      if (serieId && !s.serieId) changes.serieId = serieId
      if (Object.keys(changes).length) updateTransaction(s.id, changes)
    }
    setInstOverride({ num, total })
    setEditInst(false)
    onToast?.(`Marcado como parcela ${num}/${total}.`)
  }
  const clearInst = () => {
    updateTransaction(initial.id, { installmentNum: null, installmentTotal: null })
    setInstOverride(null)
    setEditInst(false)
    onToast?.('Marcado como à vista.')
  }

  // Cria o agendamento de RESGATE da reserva (resgate_reserva, uma vez): transferência da conta de
  // reserva → conta principal, na data escolhida, vinculada à função. Entra no Fluxo Futuro de
  // Reservas como saída futura da função (transfer com reservaFuncaoId, origem = conta de reserva).
  const handleResgate = () => {
    if (resgateInfo?.contaResgate && contaPrincipal && resgateDate) {
      addSchedule({
        description: `Resgate Reserva - ${resgateInfo.funcaoNome || resgateInfo.contaResgate.apelido || resgateInfo.contaResgate.name}`,
        transactionType: 'transfer',
        accountId: resgateInfo.contaResgate.id,   // origem = conta de reserva
        toAccountId: contaPrincipal.id,           // destino = conta principal
        amount: resgateInfo.amount,
        frequency: 'once',
        occurrenceType: 'continuous',
        startDate: resgateDate,
        reservaFuncaoId: resgateInfo.funcaoId || null,
        tipo: 'resgate_reserva',
        sourceTxId: resgateInfo.sourceTxId || null, // Chain ID → lançamento de origem.
        autoRegister: false,
        overrides: {},
      })
      onToast?.(`Agendamento de resgate criado para ${fmtDate(resgateDate)}.`)
    }
    onClose()
  }

  if (step === 'schedule-match' && scheduleMatch) {
    const handleRegister = () => {
      const nextOccs = getNextOccurrences(scheduleMatch.schedule, 3)
      const dateToMark = nextOccs[0] || scheduleMatch.tx.date
      markScheduleRegistered(scheduleMatch.schedule.id, dateToMark)
      onClose()
    }
    return (
      <ScheduleMatchModal
        schedule={scheduleMatch.schedule}
        tx={scheduleMatch.tx}
        categories={categories}
        onRegister={handleRegister}
        onKeep={onClose}
        onNeverAsk={() => {
          addRecurringMatchException(scheduleMatch.tx.payee || scheduleMatch.tx.description)
          onClose()
        }}
      />
    )
  }

  if (step === 'debt-plan' && debtCtx) {
    return (
      <DebtPlanModal
        account={debtCtx.account}
        group={debtCtx.group}
        amount={debtCtx.amount}
        date={debtCtx.date}
        onClose={onClose}
      />
    )
  }

  if (step === 'debt-payment' && debtCtx) {
    return (
      <DebtPaymentModal
        account={debtCtx.account}
        group={debtCtx.group}
        amount={debtCtx.amount}
        date={debtCtx.date}
        sourceAccountId={debtCtx.sourceAccountId}
        onClose={onClose}
      />
    )
  }

  if (step === 'propagate-parcelas') {
    const novoValor = Number(form.amount)
    const n = subsequentParcelas.length
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center mx-auto">
            <ArrowLeftRight size={22} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-gray-100">Aplicar às demais parcelas?</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Aplicar este valor (<span className="text-white font-semibold">{fmt(novoValor)}</span>) a todas as{' '}
            <span className="text-white font-semibold">{n}</span> parcela{n !== 1 ? 's' : ''} seguinte{n !== 1 ? 's' : ''} desta cadeia?
          </p>
          <p className="text-xs text-gray-600">
            Os reflexos gerenciais (provisões, resgates e pagamentos) serão ajustados automaticamente.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Não, só esta</button>
          <button
            className="btn-primary flex-1"
            onClick={() => { propagarValorParcelas(initial.id, novoValor); onClose() }}
          >
            Sim, aplicar a todas
          </button>
        </div>
      </div>
    )
  }

  if (step === 'installment-detect' && installmentPrompt) {
    const { num, total } = installmentPrompt
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto">
            <Repeat size={22} className="text-amber-400" />
          </div>
          <h3 className="font-semibold text-gray-100">Isto é uma parcela?</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            A descrição contém{' '}
            <span className="text-white font-semibold">{num}/{total}</span> e o campo
            “Parcelado” não está marcado. Deseja registrar este lançamento como{' '}
            <span className="text-white font-semibold">parcela {num} de {total}</span>?
          </p>
          <p className="text-xs text-gray-600">
            “Sim” apenas marca a parcela neste lançamento (não cria as demais). “Não” lança como está.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            className="btn-secondary flex-1"
            onClick={() => { setStep('form'); handleSubmit(null, { skip: true }) }}
          >
            Não, lançar como está
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => { setStep('form'); handleSubmit(null, { num, total }) }}
          >
            Sim, parcela {num}/{total}
          </button>
        </div>
      </div>
    )
  }

  // Gate 3: prévia explícita do que será inserido. Nada é gravado sem o clique em "Confirmar".
  if (step === 'gerar-parcelas' && parcelaSeries) {
    const missing = parcelaSeries.missing
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto">
            <Repeat size={22} className="text-amber-400" />
          </div>
          <h3 className="font-semibold text-gray-100">Gerar parcelas futuras</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Serão criadas <span className="text-white font-semibold">{missing.length}</span> parcela{missing.length !== 1 ? 's' : ''} faltante{missing.length !== 1 ? 's' : ''} desta série
            (herdando categoria, grupo gerencial, favorecido e função de reserva da parcela mais próxima):
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-700/60 divide-y divide-gray-800">
          {missing.map(p => (
            <div key={p.num} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-gray-200 truncate">{p.description}</div>
                <div className="text-xs text-gray-500">parcela {p.num}/{p.total} · {p.date} · fatura {p.faturaMonthYear}</div>
              </div>
              <div className="text-gray-100 font-semibold whitespace-nowrap">{fmt(p.amount)}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-1">
          <button className="btn-secondary flex-1" onClick={() => setStep('form')}>Cancelar</button>
          <button className="btn-primary flex-1" onClick={confirmarGerarParcelas}>
            Confirmar e gerar {missing.length}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'resgate' && resgateInfo) {
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-indigo-500/15 flex items-center justify-center mx-auto">
            <PiggyBank size={22} className="text-indigo-400" />
          </div>
          <h3 className="font-semibold text-gray-100">Criar agendamento de resgate?</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Deseja agendar o resgate de{' '}
            <span className="text-white font-semibold">{fmt(resgateInfo.amount)}</span> da reserva{' '}
            <span className="text-white font-semibold">{resgateInfo.contaResgate.apelido || resgateInfo.contaResgate.name}</span>
            {contaPrincipal ? (<> → <span className="text-white font-semibold">{contaPrincipal.apelido || contaPrincipal.name}</span></>) : null}?
          </p>
          {resgateInfo.funcaoNome && (
            <p className="text-xs text-indigo-400">Função: {resgateInfo.funcaoNome}</p>
          )}
        </div>
        <div>
          <label className="label">Data do resgate</label>
          <input
            type="date"
            className="input"
            value={resgateDate}
            onChange={e => setResgateDate(e.target.value)}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Agora não</button>
          <button className="btn-primary flex-1" disabled={!resgateDate} onClick={handleResgate}>Criar Agendamento</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showRateio && (
        <RateioModal
          total={Number(form.amount) || rateioTotal || 0}
          categories={categories}
          categoryType={form.type === 'income' ? 'income' : form.type === 'expense' ? 'expense' : null}
          initial={rateioRows}
          onSave={rs => { setRateioRows(rs); setShowRateio(false) }}
          onDeleteAll={() => { setRateioRows([]); setShowRateio(false) }}
          onClose={() => setShowRateio(false)}
        />
      )}
      <div>
        <label className="label">Tipo</label>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {TYPE_OPTIONS.map(t => (
            <button
              type="button"
              key={t.value}
              onClick={() => set('type', t.value)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.type === t.value
                  ? t.value === 'income' ? 'bg-blue-600 text-white'
                    : t.value === 'expense' ? 'bg-orange-600 text-white'
                    : 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Conta {form.type === 'transfer' ? 'Origem' : ''} *</label>
          <SearchableSelect
            options={accountOpts}
            value={form.accountId}
            onChange={id => setForm(f => ({ ...f, accountId: id, ...(f.type === 'transfer' ? { reservaFuncaoId: '' } : {}) }))}
            placeholder="Selecione a conta..."
            preserveGroupOrder
            ungroupedLast
            required
          />
        </div>
        {form.type === 'transfer' ? (
          <div>
            <label className="label">Conta Destino *</label>
            <SearchableSelect
              options={destAccountOpts}
              value={form.toAccountId}
              onChange={id => setForm(f => ({ ...f, toAccountId: id, reservaExpenseCategoryId: '', categoryId: '', reservaFuncaoId: '', faturaMonthYear: '' }))}
              placeholder="Selecione o destino..."
              preserveGroupOrder
              ungroupedLast
              required
            />
          </div>
        ) : (
          <div>
            <label className="label">{isCredit && form.type === 'expense' && form.installments > 1 ? 'Total (R$) *' : 'Valor (R$) *'}</label>
            <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
          </div>
        )}
      </div>

      {form.type === 'transfer' && (
        <>
          <div>
            <label className="label">Valor (R$) *</label>
            <input className="input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required />
          </div>
          {transferToAcc?.type === 'credit' && (
            <div>
              <label className="label">Fatura de referência</label>
              <select className="input" value={form.faturaMonthYear} onChange={e => set('faturaMonthYear', e.target.value)}>
                <option value="">Sem vínculo (transferência comum)</option>
                {faturaCardOpts.map(o => {
                  const [y, m] = o.key.split('-')
                  return <option key={o.key} value={o.key}>{`${m}/${y} — ${fmt(o.billTotal)}`}</option>
                })}
              </select>
              {faturaPreview && (() => {
                const { billTotal, pagando, dif } = faturaPreview
                const txt = dif > 0.01 ? `pago a mais ${fmt(dif)}` : dif < -0.01 ? `falta pagar ${fmt(-dif)}` : 'quitada totalmente'
                const color = dif > 0.01 ? 'text-blue-400' : dif < -0.01 ? 'text-amber-500' : 'text-gray-400'
                return (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Fatura {fmt(billTotal)} · pagando {fmt(pagando)} → <span className={`font-medium ${color}`}>{txt}</span>
                  </p>
                )
              })()}
              <p className="text-xs text-gray-600 mt-1">Vincular abate a dívida da fatura e conta como pagamento real.</p>
            </div>
          )}
          {(() => {
            const toAcc = accounts.find(a => a.id === form.toAccountId)
            const toGroup = (accountGroups || []).find(g => g.id === toAcc?.accountGroupId)
            if (!toGroup?.behavior) return null
            const hasPlan = !!toAcc?.debtPlan
            const isEmp = toGroup.behavior === 'emprestimo'
            return (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${hasPlan ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                <span className="shrink-0 mt-0.5">{hasPlan ? '✓' : '⚠'}</span>
                {hasPlan
                  ? `Pagamento de ${isEmp ? 'empréstimo' : 'dívida'} — plano de ${toAcc.debtPlan.installments} parcelas ativo`
                  : `Conta de ${isEmp ? 'empréstimo a terceiros' : 'dívida'} — você poderá configurar o plano de parcelas após registrar`
                }
              </div>
            )
          })()}
          {(isDepositToReserva || isWithdrawFromReserva) && !form.reservaFuncaoId && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
              <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                📂 {isDepositToReserva ? 'Despesa a classificar' : 'Categoria do resgate'}
              </p>
              {/* Categoria sempre editável (inclusive em reserva especifica/função única):
                  o padrão da reserva é só uma dica; o usuário pode alterar ou limpar. */}
              <SearchableSelect
                options={expenseCatOpts}
                value={form.reservaExpenseCategoryId}
                onChange={id => set('reservaExpenseCategoryId', id)}
                placeholder={reservaLinkedCat ? `${reservaLinkedCat.icon} ${reservaLinkedCat.name} (padrão da reserva)` : '🏦 Reservas Gerais (padrão)'}
                ungroupedLast
                ungroupedLabel="Sem grupo"
              />
              {needsReservaCategorySelect && !reservaFuncaoUnica && !form.reservaExpenseCategoryId && (
                <p className="text-xs text-amber-500">Obrigatório para reserva livre</p>
              )}
              {(!needsReservaCategorySelect || reservaFuncaoUnica) && !form.reservaExpenseCategoryId && (
                <p className="text-xs text-amber-300/70">
                  Sem seleção, usa {isDepositToReserva ? 'a despesa' : 'a categoria'} padrão:{' '}
                  <span className="font-semibold">
                    {reservaLinkedCat ? `${reservaLinkedCat.icon} ${reservaLinkedCat.name}` : '🏦 Reservas Gerais'}
                  </span>
                </p>
              )}
            </div>
          )}
          {showReservaFuncao && (
            <div>
              <label className="label">Função de Reserva</label>
              <select
                className="input"
                value={form.reservaFuncaoId}
                onChange={e => set('reservaFuncaoId', e.target.value)}
              >
                <option value="">— Selecionar —</option>
                {reservaFuncs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                {isDepositToReserva ? 'Função de reserva deste depósito.' : 'Função de reserva deste resgate.'}
              </p>
            </div>
          )}
          {isTransferToAplicacao && (
            <div>
              <label className="label">Categoria</label>
              <SearchableSelect
                options={expenseCatOpts}
                value={form.categoryId}
                onChange={onCategoryChange}
                placeholder="Sem categoria"
                ungroupedLast
                ungroupedLabel="Sem grupo"
              />
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Opcional — preencha apenas se quiser classificar o aporte. Com categoria, o
                lançamento aparece nos relatórios como saída; em branco, é uma transferência
                comum (invisível nos relatórios).
              </p>
            </div>
          )}
          {isInterProfileTransfer && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-3">
              <p className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                🔁 Transferência entre perfis — categorize a movimentação em cada visão (opcional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoria no CNPJ</label>
                  <SearchableSelect
                    options={categoryOpts}
                    value={form.categoriaCnpjId}
                    onChange={id => set('categoriaCnpjId', id)}
                    placeholder="Sem categoria"
                    ungroupedLast
                    ungroupedLabel="Sem grupo"
                  />
                </div>
                <div>
                  <label className="label">Categoria no CPF</label>
                  <SearchableSelect
                    options={categoryOpts}
                    value={form.categoriaCpfId}
                    onChange={id => set('categoriaCpfId', id)}
                    placeholder="Sem categoria"
                    ungroupedLast
                    ungroupedLabel="Sem grupo"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Opcional — usado em Relatórios e KPIs quando um perfil está selecionado: a saída
                do perfil entra como despesa e a entrada como receita, na categoria da respectiva visão.
              </p>
            </div>
          )}
        </>
      )}

      <div>
        <label className="label">Data *</label>
        <DateInput className="input" value={form.date} onChange={e => set('date', e.target.value)} required />
      </div>

      {isCredit && form.type === 'expense' && (
        <div>
          <label className="label">Data Banco</label>
          <DateInput className="input" value={form.dateCartao} onChange={e => set('dateCartao', e.target.value)} />
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            Data original do extrato do cartão. Em branco para lançamentos manuais — preencha
            só para corrigir quando o banco enviou a data errada.
          </p>
        </div>
      )}

      {form.type !== 'transfer' && (
        <>
          <div>
            <label className="label">Categoria</label>
            <div className="flex items-center gap-2">
              {rateioRows.length > 0 ? (
                <div className="input flex-1 flex items-center justify-between text-xs text-gray-300">
                  <span>{rateioRows.length} Categorias Separadas</span>
                  <span className="text-gray-500">Total: {fmt(rateioTotal)}</span>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={categoryOpts}
                    value={form.categoryId}
                    onChange={onCategoryChange}
                    placeholder="Sem categoria"
                    ungroupedLast
                    ungroupedLabel="Sem grupo"
                  />
                </div>
              )}
              <button type="button" onClick={() => setShowRateio(true)} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                Separar
              </button>
            </div>
          </div>

          <div>
            <label className="label">Favorecido</label>
            <FavorecidoAutocomplete
              value={form.payee}
              onChange={onPayeeChange}
              suggestions={sortedPayees}
            />
          </div>

          <div>
            <label className="label">Centro de Custo</label>
            <select className="input" value={form.costCenter} onChange={e => set('costCenter', e.target.value)}>
              <option value="">Sem centro de custo</option>
              {costCenters.map(cc => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="label">Descrição</label>
        <input className="input" value={form.description} onChange={e => onDescriptionChange(e.target.value)} placeholder="Descrição do lançamento" />
      </div>

      {showFaturaRef && (
        <div>
          <label className="label">Fatura de Referência</label>
          <input
            className="input"
            value={form.faturaRef}
            onChange={e => set('faturaRef', e.target.value)}
            placeholder="MM/AAAA (ex: 06/2026)"
          />
        </div>
      )}

      {/* Item 6: card "Parcela N de M" editável (override manual) + irmãs + geração das faltantes. */}
      {eligivelParcela && (
        <div className={`p-3 rounded-lg space-y-2 border ${parcelaSeries ? 'bg-amber-500/5 border-amber-500/20' : 'bg-gray-800/40 border-gray-700/50'}`}>
          <div className="flex items-center justify-between gap-2">
            {editInst ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  autoFocus
                  value={instInput}
                  onChange={e => setInstInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmInstEdit() } }}
                  placeholder="N/M (ex: 2/3)"
                  className="input py-1 text-sm w-28"
                />
                <button type="button" onClick={confirmInstEdit} title="Confirmar" className="p-1 text-emerald-400 hover:bg-emerald-500/15 rounded">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setEditInst(false)} title="Cancelar" className="p-1 text-gray-400 hover:bg-gray-700 rounded">
                  <X size={14} />
                </button>
                {effInstTotal != null && (
                  <button type="button" onClick={clearInst} className="text-[11px] text-gray-400 hover:text-gray-200 ml-1">↩ à vista</button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${parcelaSeries ? 'text-amber-300' : 'text-gray-300'}`}>
                    {parcelaSeries ? `Parcela ${effInstNum} de ${effInstTotal}` : 'À vista'}
                  </span>
                  <button type="button" onClick={openInstEditor} title={parcelaSeries ? 'Editar parcelamento' : 'Marcar como parcelado'} className="p-0.5 text-gray-500 hover:text-gray-200">
                    <Pencil size={12} />
                  </button>
                </div>
                {parcelaSeries
                  ? <span className="text-xs text-gray-500">{parcelaSeries.siblings.length}/{parcelaSeries.total} no histórico</span>
                  : (
                    <button type="button" onClick={openInstEditor} className="text-xs text-amber-400 hover:text-amber-300">
                      Marcar como parcelado
                    </button>
                  )}
              </>
            )}
          </div>
          {parcelaSeries && (
            <>
              <div className="rounded-md border border-gray-700/50 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                {parcelaSeries.siblings.map(s => (
                  <div key={s.id} className={`px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 ${s.id === initial.id ? 'bg-amber-500/10' : ''}`}>
                    <span className="text-gray-300 whitespace-nowrap">{s._num}/{parcelaSeries.total}</span>
                    <span className="text-gray-500 truncate flex-1">fatura {s.faturaMonthYear || '—'}</span>
                    <span className="text-gray-200 whitespace-nowrap">{fmt(s.amount)}</span>
                    {s.id === initial.id && <span className="text-amber-400">atual</span>}
                  </div>
                ))}
              </div>
              {parcelaSeries.missing.length > 0 ? (
                <button type="button" className="btn-secondary w-full text-sm" onClick={() => setStep('gerar-parcelas')}>
                  Gerar parcelas futuras ({parcelaSeries.missing.length} faltando)
                </button>
              ) : (
                <p className="text-xs text-gray-600">Série completa — nenhuma parcela faltando.</p>
              )}
            </>
          )}
        </div>
      )}

      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações adicionais..." />
      </div>

      {form.type === 'expense' && !initial?.id && reservaAccounts.length > 0 && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={form.useReserva}
                onChange={e => {
                  const checked = e.target.checked
                  setForm(f => ({
                    ...f,
                    useReserva: checked,
                    reservaAccountId: checked && !reservaFuncaoMode
                      ? (matchingSpecificReserva?.id || reservaAccounts[0]?.id || '')
                      : '',
                    reservaFuncaoId: checked && reservaFuncaoMode
                      ? (reservaGroupFuncs.length === 1 ? reservaGroupFuncs[0].id : f.reservaFuncaoId)
                      : '',
                  }))
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-indigo-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <PiggyBank size={14} className="text-indigo-400 shrink-0" />
            <span className="text-sm text-indigo-300 select-none">Será pago com reserva</span>
            {matchingSpecificReserva && !form.useReserva && !reservaFuncaoMode && (
              <span className="text-xs text-indigo-500 ml-1">sugerida: {matchingSpecificReserva.apelido || matchingSpecificReserva.name}</span>
            )}
          </label>
          {form.useReserva && (
            reservaFuncaoMode ? (
              <div className="space-y-2">
                {reservaGroupFuncs.length > 0 ? (
                  <>
                    <label className="label" style={{ marginBottom: 0 }}>Função de Reserva</label>
                    <select
                      className="input"
                      value={form.reservaFuncaoId}
                      onChange={e => set('reservaFuncaoId', e.target.value)}
                    >
                      <option value="">Selecione a função...</option>
                      {reservaGroupFuncs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <p className="text-xs text-indigo-400 leading-relaxed">
                      De qual função de <strong>{reservaGroupAccount?.apelido || reservaGroupAccount?.name || 'reserva'}</strong> sairá
                      o resgate desta despesa. O agendamento de resgate é gerado no vencimento de cada fatura afetada.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-400 leading-relaxed">
                    Nenhuma função de reserva configurada para {reservaGroupAccount?.apelido || reservaGroupAccount?.name || 'a conta de reserva'} deste grupo.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="label" style={{ marginBottom: 0 }}>Conta de Reserva</label>
                <select
                  className="input"
                  value={form.reservaAccountId}
                  onChange={e => setForm(f => ({ ...f, reservaAccountId: e.target.value, reservaFuncaoId: '' }))}
                >
                  <option value="">Selecione a reserva...</option>
                  {reservaAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.reservaType === 'especifica' && a.reservaCategoryId === form.categoryId ? '★ ' : ''}{a.apelido || a.name}
                    </option>
                  ))}
                </select>
                {form.reservaAccountId && reservaContaFuncs.length > 0 && (
                  <>
                    <label className="label" style={{ marginBottom: 0 }}>Função de Reserva</label>
                    <select
                      className="input"
                      value={form.reservaFuncaoId}
                      onChange={e => set('reservaFuncaoId', e.target.value)}
                    >
                      <option value="">Selecione a função...</option>
                      {reservaContaFuncs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </>
                )}
                {form.reservaAccountId && (
                  <p className="text-xs text-indigo-400 leading-relaxed">
                    A despesa registra o vínculo com a reserva. Após salvar, você poderá agendar o
                    resgate desta reserva para a conta principal.
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}

      {isCredit && form.type === 'expense' && !initial?.id && (
        <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={form.installments > 1}
                onChange={e => set('installments', e.target.checked ? 2 : 1)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-gray-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-gray-300 select-none">Parcelado</span>
          </label>
          {form.installments > 1 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400 shrink-0">Parcelas:</label>
              <input
                className="input w-20 text-center"
                type="number"
                min="2"
                max="48"
                value={form.installments}
                onChange={e => set('installments', Math.max(2, Math.min(48, Number(e.target.value) || 2)))}
              />
              {form.amount && (
                <span className="text-xs text-gray-500">
                  {fmt(Math.round(Number(form.amount) / form.installments * 100) / 100)} por parcela
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isCredit && form.type === 'expense' && (
        <div>
          <label className="label">Fatura de referência</label>
          <select
            className="input"
            value={form.faturaMonthYear}
            onChange={e => set('faturaMonthYear', e.target.value)}
          >
            <option value="">(automático)</option>
            {faturaRefOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            Opcional — em branco, a fatura é calculada automaticamente pelo dia de
            fechamento do cartão.
          </p>
        </div>
      )}

      {showGerencial && (
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-3">
          <label className="label" style={{ marginBottom: 0 }}>Classificação Gerencial</label>
          <GerencialSelect
            value={form.grupoGerencial}
            onChange={v => setForm(f => ({ ...f, grupoGerencial: v, reservaFuncaoId: '' }))}
            grupos={gerencialGroups}
          />

          {form.grupoGerencial && (() => {
            const g = gerencialGroups.find(x => x.id === form.grupoGerencial)
            if (!g || g.number === 'D') return (
              <p className="text-xs text-gray-500">Lançamento registrado como despesa normal.</p>
            )

            if (g.number === 1) {
              const subcontaApelido = selectedAccount?.apelido || selectedAccount?.name?.slice(0, 6) || 'CC'
              const contaDestino = accounts.find(a => a.id === gerencialContaId)
              const txDate = form.date ? new Date(form.date + 'T00:00:00') : new Date()
              const faturaRef = computeFaturaRef(txDate, selectedAccount?.closingDay || 14)
              const [fmm, fyyyy] = faturaRef.split('/')
              const dueDay = String(selectedAccount?.dueDay || 10).padStart(2, '0')
              const scheduleDate = `${fyyyy}-${fmm}-${dueDay}`
              return (
                <div className="space-y-2">
                  <div>
                    <label className="label text-xs uppercase tracking-wide text-purple-400">Conta Destino</label>
                    <select
                      className="input"
                      value={gerencialContaId}
                      onChange={e => {
                        setGerencialContaId(e.target.value)
                        localStorage.setItem(GERENCIAL_CONTA_KEY, e.target.value)
                      }}
                      required
                    >
                      <option value="">Selecione a conta corrente...</option>
                      {checkingAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.contaCorrentePrincipal ? ' ★' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {contaDestino ? (
                    <div className="space-y-1">
                      <p className="text-xs text-purple-300 leading-relaxed">
                        Transferência automática será criada para a subconta{' '}
                        <strong className="text-purple-200">"Ger. {subcontaApelido}"</strong>{' '}
                        a partir de <strong className="text-purple-200">{contaDestino.name}</strong>.
                      </p>
                      <p className="text-xs text-purple-400">
                        📅 Fatura {faturaRef} · Agendamento de devolução em {fmtDate(scheduleDate)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-400">
                      Selecione a conta corrente de origem da transferência.
                    </p>
                  )}
                </div>
              )
            }

            const acc = accounts.find(a => a.id === g.defaultAccountId)
            const txDate3 = form.date ? new Date(form.date + 'T00:00:00') : new Date()
            const faturaRef3 = computeFaturaRef(txDate3, selectedAccount?.closingDay || 14)
            const [fmm3, fyyyy3] = faturaRef3.split('/')
            const dueDate3 = `${fyyyy3}-${fmm3}-${String(selectedAccount?.dueDay || 10).padStart(2, '0')}`
            return (
              <div className="space-y-2">
                {acc ? (
                  <div className="space-y-1">
                    <p className="text-xs text-blue-300 leading-relaxed">
                      Agendamento de resgate automático:{' '}
                      <strong className="text-blue-200">{acc.apelido || acc.name}</strong> → conta corrente principal.
                    </p>
                    <p className="text-xs text-blue-400">
                      📅 Fatura {faturaRef3} · Resgate em {fmtDate(dueDate3)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-amber-400">
                    Configure uma conta padrão neste grupo para ativar o resgate automático.
                  </p>
                )}

                {/* Função de reserva específica deste lançamento (edição). Oculto quando a
                    conta de reserva do grupo não tem funções cadastradas. */}
                {initial?.id && reservaGroupFuncs.length > 0 && (
                  <div>
                    <label className="label text-xs uppercase tracking-wide text-blue-400">Função de Reserva</label>
                    <select
                      className="input"
                      value={form.reservaFuncaoId || ''}
                      onChange={e => set('reservaFuncaoId', e.target.value)}
                    >
                      <option value="">Sem função específica</option>
                      {reservaGroupFuncs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      De qual função de <strong>{reservaGroupAccount?.apelido || reservaGroupAccount?.name || 'reserva'}</strong> sai
                      o resgate desta despesa.
                    </p>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Repetir este lançamento — só no formulário de NOVO lançamento */}
      {!initial?.id && (
        <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={form.repeat}
                onChange={e => set('repeat', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <Repeat size={14} className="text-gray-300 shrink-0" />
            <span className="text-sm text-gray-300 select-none">Repetir este lançamento</span>
          </label>

          {form.repeat && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="label">Frequência</label>
                <select
                  className="input"
                  value={form.repeatFrequency}
                  onChange={e => setForm(f => ({
                    ...f,
                    repeatFrequency: e.target.value,
                    ...(e.target.value === 'once' ? { repeatOccurrenceType: 'continuous' } : {}),
                  }))}
                >
                  {REPEAT_FREQUENCIES.map(fr => (
                    <option key={fr.value} value={fr.value}>{fr.label}</option>
                  ))}
                </select>
              </div>

              {form.repeatFrequency !== 'once' && (
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="label">Tipo</label>
                    <div className="flex rounded-lg overflow-hidden border border-gray-700">
                      {[['continuous', 'Contínuo'], ['installment', 'Por parcelas']].map(([v, l]) => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => set('repeatOccurrenceType', v)}
                          className={`flex-1 py-2 text-sm font-medium transition-colors ${
                            form.repeatOccurrenceType === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.repeatOccurrenceType === 'installment' && (
                    <div className="w-24">
                      <label className="label">Parcelas</label>
                      <input
                        className="input text-center"
                        type="number"
                        min="1"
                        max="360"
                        value={form.repeatInstallments}
                        onChange={e => set('repeatInstallments', Math.max(1, Number(e.target.value) || 1))}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-300">Lembrete</span>
                <div className="flex items-center gap-2">
                  {form.repeatRemindDaysBefore > 0 && (
                    <>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={form.repeatRemindDaysBefore}
                        onChange={e => set('repeatRemindDaysBefore', Math.max(1, Number(e.target.value) || 1))}
                        className="w-14 input text-center text-xs py-1"
                      />
                      <span className="text-xs text-gray-500 whitespace-nowrap">dias antes</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => set('repeatRemindDaysBefore', form.repeatRemindDaysBefore > 0 ? 0 : 3)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.repeatRemindDaysBefore > 0 ? 'bg-[#0F6E56]' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.repeatRemindDaysBefore > 0 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                Um agendamento será criado em "Agendamentos" com estes dados, começando em {fmtDate(form.date)}.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Registrar'}</button>
      </div>
    </form>
  )
}
