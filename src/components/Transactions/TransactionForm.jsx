import { useState, useMemo, useRef, useEffect } from 'react'
import ComposicaoCard from '../Contratos/ComposicaoCard'
import { PiggyBank, Repeat, Pencil, Check, X, History } from 'lucide-react'
import { useApp, isResgatePago } from '../../context/AppContext'
import { today, fmt, fmtDate, buildAccountSelectOptions, creditBillKey, creditBillStatus } from '../shared/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import InputMoeda from '../shared/InputMoeda'
import { computeFaturaRef } from '../../lib/fatura'
import { ORIGIN } from '../../lib/origins'
import { detectInstallment } from '../../lib/installments'
import { buildSeries, clampDateToFatura, newSerieId, valoresDasParcelas } from '../../lib/parcelas'
import { filtrarCategoriasPorPerfil, categoriaDisponivelParaPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import ScheduleMatchModal from '../shared/ScheduleMatchModal'
import SearchableSelect from '../shared/SearchableSelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import TipoDocumentoSelect from '../shared/TipoDocumentoSelect'
import TransferenciaPerfisCategorias from '../shared/TransferenciaPerfisCategorias'
import { isTransferenciaEntrePerfis } from '../../lib/transferenciaPerfis'
import { tipoDocumentoObrigatorio } from '../../lib/tiposDocumento'
import { camposHerdadosParcelaFilha, novoIdAgendamento } from '../../lib/herancaCampos'
import EscopoSerieDialog from '../shared/EscopoSerieDialog'
import { HistoricoPainel } from '../shared/HistoricoPainel'
import SeloParcela from '../shared/SeloParcela'
import { criarSeloParcela } from '../../lib/numeroParcela'
import { faturaAbertaDoCartao, avisoFaturaFechada, rotuloFatura } from '../../lib/faturaAberta'
import { faturaEstaFechada } from '../../lib/faturasFechadas'
import {
  ESCOPO, diffCampos, precisaEscolherEscopo, planoRegistros, irmasLancamento, parcelaCartaoPendente,
  serieKeyDe, mensagemAplicada,
} from '../../lib/camposSerie'
import { novoLoteId, linhasHistorico, itensPorEscopo } from '../../lib/historico'
import { diferencasLancamentoAgendamento, patchLancamentoDoAgendamento, mudancasNoAgendamento } from '../../lib/agendamentoManda'
import RenomearFavorecidoModal from '../shared/RenomearFavorecidoModal'
import { metaBaixaGerada } from '../../lib/scheduleBaixa'
import RateioModal from '../shared/RateioModal'
import DebtPlanModal from './DebtPlanModal'
import DebtPaymentModal from './DebtPaymentModal'
import DateInput from '../shared/DateInput'
import { useAtalho, useTituloAtalho } from '../../context/atalhosHooks'
import ShortcutHint from '../shared/ShortcutHint'
import { competenciasImplausiveis, mensagemCompetenciaImplausivel } from '../../lib/competenciaFatura'
import { parecidosNaCriacao } from '../../lib/casamentoFatura'
import { listarPreLancamentos } from '../../lib/assistenteApi'
import AvisoParecidos from './AvisoParecidos'
import { controleGerencialAtivo, grupoComChaveDesligada, travaGerencial } from '../../lib/controleGerencial'
import { contaCentralDoPerfil, contaCentralPara } from '../../lib/contaCentral'

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receita', atalho: 'lancamento.tipoReceita' },
  { value: 'expense', label: 'Despesa', atalho: 'lancamento.tipoDespesa' },
  { value: 'transfer', label: 'Transferência', atalho: 'lancamento.tipoTransf' },
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

// Atalho dos switches "Será pago com reserva" / "Repetir este lançamento": clica no próprio switch
// (mesmo onChange do clique) e, ao ligar, foca o primeiro campo que aparece no bloco.
function alternarSwitch(ref) {
  const input = ref.current
  if (!input) return false
  input.click()
  if (!input.checked) return
  const bloco = input.closest('[data-bloco-switch]')
  requestAnimationFrame(() => {
    bloco?.querySelector('select, textarea, input:not([type="checkbox"]), button')?.focus()
  })
}

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

// `rapido` (só o "+" do mobile): mostra só tipo, valor, descrição, conta e categoria; "Mais opções"
// abre o formulário completo com o mesmo estado. Salvar é o mesmo handleSubmit nos dois modos.
// Prévia do Assistente IA: `destaques` (chaves do form) marcam campos a conferir; `onSalvo(form, txId)`
// avisa que o lançamento NOVO foi gravado (antes do onClose) — a gravação continua a mesma.
// Duplicidade na criação (AvisoParecidos): `preLancamentos` (sem ele, busca os pendentes),
// `parecidosAceitos` (ids já confirmados como "É outro" — ex.: no aviso do topo da prévia),
// `onMesmo(tx)` avisa que o usuário disse "É o mesmo" / abriu o existente (nada foi gravado).
export default function TransactionForm({ initial, onClose, onToast, rapido = false, destaques = null, onSalvo = null,
  preLancamentos = null, parecidosAceitos = null, onMesmo = null }) {
  const {
    accounts, accountGroups, categories, costCenters, payees, transactions, schedules,
    gerencialGroups, criarParcelasGerencial, criarLancamentoDiferenca, reverseGerencialCascadeOnly, recalcularAgendamentosFatura, ensureGerencialState,
    addTransaction, updateTransaction, addPayee, addCostCenter,
    addSchedule, updateSchedule, deleteSchedule,
    findMatchingSchedule, addRecurringMatchException, markScheduleRegistered, baixarCobrancaRecorrente,
    rateiosByLancamento, saveRateiosFor, deleteRateiosFor,
    reserveFunctions, settings, findLinkedResgate, activeProfileId, categoryGroupOrder,
    registrarEdicao, temHistorico, profiles, pode, tiposDocumento = [],
  } = useApp()
  // Lançamento gerado por agendamento parcelado: "Parcela x/N" pela data_ocorrencia gravada.
  const seloParcela = useMemo(() => (initial?.id ? criarSeloParcela(schedules)(initial) : null), [initial, schedules])
  // Nível de acesso: registrar = incluir; salvar edição = editar (sem permissão: só leitura).
  const podeGravarForm = pode('lancamentos', initial?.id ? 'editar' : 'incluir')

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
    // Conta central do perfil do cartão do lançamento; sem ela, vazio (o aviso aparece no bloco G).
    return contaCentralDoPerfil(accounts, accounts.find(a => a.id === initial?.accountId)?.profileId)?.id || ''
  })

  // Edição de despesa "Será pago com reserva": o vínculo vem de reservaContaId; lançamentos
  // anteriores a essa coluna só têm o agendamento de resgate avulso (source_tx_id) — usa-o de fallback.
  const [initialResgate] = useState(() => (initial?.id ? findLinkedResgate(initial.id) : null))
  const initialReservaContaId = initial?.type === 'expense'
    ? (initial.reservaContaId || initialResgate?.accountId || '')
    : ''

  const [form, setForm] = useState({
    type: initial?.type || 'expense',
    // Prévia do Assistente sem conta (a IA não pôde escolher) → vazio: o usuário escolhe.
    accountId: initial?.accountId || (destaques?.includes('accountId') ? '' : accounts[0]?.id) || '',
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
    reservaFuncaoId: initial?.reservaFuncaoId || (initialReservaContaId ? (initialResgate?.reservaFuncaoId || '') : ''),
    categoriaCnpjId: initial?.categoriaCnpjId || '',
    categoriaCpfId: initial?.categoriaCpfId || '',
    tipoDocumentoId: initial?.tipoDocumentoId || '',
    repeat: false,
    repeatFrequency: 'monthly',
    repeatOccurrenceType: 'continuous',
    repeatInstallments: 2,
    repeatRemindDaysBefore: 0,
    useReserva: !!initialReservaContaId,
    reservaAccountId: initialReservaContaId,
    reservaExpenseCategoryId: '',
    // Lançamento novo pode vir parcelado (prévia do Assistente: SMS "em 3x"); valor = TOTAL.
    installments: !initial?.id && Number(initial?.installments) > 1 ? Number(initial.installments) : 1,
  })

  const [step, setStep] = useState('form')
  // Duplicidade na criação: lançamentos/pré-lançamentos parecidos → passo 'parecidos' ao salvar.
  const [preBuscados, setPreBuscados] = useState([])
  const [parecidos, setParecidos] = useState(null)
  const [existenteAberto, setExistenteAberto] = useState(null)
  const aceitos = useRef(new Set())
  const checarParecidos = !initial?.id && pode('lancamentos', 'incluir')
  useEffect(() => {
    if (!checarParecidos || preLancamentos) return
    let vivo = true
    listarPreLancamentos().then(l => { if (vivo) setPreBuscados(l) }).catch(() => { /* sem internet: só os lançamentos */ })
    return () => { vivo = false }
  }, [checarParecidos, preLancamentos])
  const confira = (campo) => (destaques?.includes(campo)
    ? <span className="ml-1.5 text-[11px] font-medium text-aviso" title="Sugestão do assistente: confira">● confira</span>
    : null)
  // Modo rápido (mobile): "Mais opções" troca para o formulário completo.
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  // Tipo de documento: obrigatório só ao CRIAR despesa/receita; na edição pode ficar vazio.
  const [erroTipoDoc, setErroTipoDoc] = useState('')
  const tipoDocObrigatorio = tipoDocumentoObrigatorio({ criando: !initial?.id, tipoMov: form.type })
  const [resgateInfo, setResgateInfo] = useState(null)
  const [resgateDate, setResgateDate] = useState(() => today())
  const [resgateToDelete, setResgateToDelete] = useState(null)
  const [scheduleMatch, setScheduleMatch] = useState(null)
  const [debtCtx, setDebtCtx] = useState(null)
  // Item 2: "N/Total" detectado na descrição sem "Parcelado" marcado → guarda a parcela
  // detectada para o passo de confirmação (a decisão é passada explícita ao re-submeter).
  const [installmentPrompt, setInstallmentPrompt] = useState(null)

  // Edição inline de num/total no card "Parcela N de M". instOverride: undefined = intacto
  // (usa initial); null = à vista; { num, total } = parcelado aplicado localmente (feedback
  // imediato, já que o prop `initial` não se atualiza após updateTransaction).
  const [instOverride, setInstOverride] = useState(undefined)
  const [renomearFav, setRenomearFav] = useState(false)
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

  // Atalhos do modal de lançamento: os mesmos handlers do botão/switch (só no formulário completo).
  const formRef = useRef(null)
  const reservaSwitchRef = useRef(null)
  const repetirSwitchRef = useRef(null)
  const atalhosForm = step === 'form' && (!rapido || maisOpcoes)
  useAtalho('lancamento.gravar', () => { if (!formRef.current) return false; formRef.current.requestSubmit() }, atalhosForm)
  useAtalho('lancamento.tipoReceita', () => set('type', 'income'), atalhosForm)
  useAtalho('lancamento.tipoDespesa', () => set('type', 'expense'), atalhosForm)
  useAtalho('lancamento.tipoTransf', () => set('type', 'transfer'), atalhosForm)
  useAtalho('lancamento.toggleReserva', () => alternarSwitch(reservaSwitchRef), atalhosForm)
  useAtalho('lancamento.toggleRepetir', () => alternarSwitch(repetirSwitchRef), atalhosForm)
  const tituloGravar = useTituloAtalho(initial ? 'Salvar' : 'Registrar', 'lancamento.gravar')

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
  // Fatura do lançamento NOVO no cartão com "Fatura de referência" em branco: a calculada pelo
  // fechamento; se FECHADA, a próxima aberta (gravada explícita no salvar). Parcelado: parcela 1
  // nela, as próximas nas seguintes (criarParcelasGerencial, pela fatura da base).
  const faturaAuto = (!initial?.id && isCredit && form.type === 'expense')
    ? faturaAbertaDoCartao({ cardId: form.accountId, date: form.date, closingDay: selectedAccount?.closingDay, faturasFechadas: settings?.faturasFechadas })
    : null
  const faturaEscolhidaFechada = isCredit && !!form.faturaMonthYear && faturaEstaFechada(settings?.faturasFechadas, form.accountId, form.faturaMonthYear)
  // Controle gerencial do ambiente (Configurações): desligado, o bloco some, item novo não ganha
  // grupo e a edição mantém o gravado; item com grupo gerencial trava valor, data e conta/cartão.
  const gerencialLigado = controleGerencialAtivo(settings)
  const showGerencial = isCredit && form.type === 'expense' && gerencialLigado
  const trava = travaGerencial(initial, { ativo: gerencialLigado, gerencialGroups })

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
  // Só exibe o SELECT de função quando o grupo numerado tem MAIS DE 1 função vinculada.
  // Com 1 única (ex.: PharmaLog), o resgate usa a conta do grupo automaticamente (sem select).
  const showFuncaoReservaSelect = reservaGroupFuncs.length > 1

  const isMobile = useIsMobile()
  // A reserva já vinculada ao lançamento em edição entra na lista mesmo se inativa/oculta no
  // mobile — senão o select não a mostraria e salvar apagaria o vínculo.
  const reservaAccounts = useMemo(
    () => accounts.filter(a => a.isReserva && (a.id === initialReservaContaId || (a.active !== false && (!isMobile || !a.hideOnMobile)))),
    [accounts, isMobile, initialReservaContaId]
  )
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

  // Transferência já vinculada a um bem imobilizado (entrada à vista de um bem). Diferente da
  // transferência comum, ela CARREGA categoria e favorecido: quem os grava é o modal "Registrar
  // Entrada à Vista", e a categoria o backend também grava em /api/bem/[id]/registrar-entrada.
  // Sem esta exceção o formulário escondia os dois campos e ainda zerava a categoria ao salvar —
  // a entrada registrada perdia a classificação na primeira edição do lançamento.
  const isTransferDeBem = form.type === 'transfer' && !!initial?.bemId

  // Transferência entre perfis diferentes (CPF↔CNPJ): habilita categorias por visão (PARTE 1).
  const isInterProfileTransfer = form.type === 'transfer' && isTransferenciaEntrePerfis(transferFromAcc, transferToAcc)

  // Resgate de reserva: Conta central do PERFIL DA RESERVA. Sem ela, o resgate fica bloqueado.
  const centralResgate = resgateInfo?.contaResgate
    ? contaCentralPara(accounts, profiles, resgateInfo.contaResgate)
    : { conta: null, erro: null }
  const contaPrincipal = centralResgate.conta

  // Options for SearchableSelect fields
  const accountOpts = useMemo(() => buildAccountSelectOptions(accounts, accountGroups, { isMobile }), [accounts, accountGroups, isMobile])
  const destAccountOpts = useMemo(() => buildAccountSelectOptions(accounts, accountGroups, { excludeId: form.accountId, isMobile }), [accounts, accountGroups, form.accountId, isMobile])
  // Categorias por perfil: o da conta escolhida (se tiver perfil), senão o chip do topo. As
  // categorias já gravadas ficam na lista mesmo sendo de outro perfil.
  const perfilCategorias = perfilParaCategorias(accounts, form.accountId, activeProfileId)
  const categoriasDoPerfil = useMemo(
    () => ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilCategorias, [form.categoryId, form.reservaExpenseCategoryId]), categoryGroupOrder),
    [categories, perfilCategorias, form.categoryId, form.reservaExpenseCategoryId, categoryGroupOrder]
  )
  const categoriaForaDoPerfil = !!form.categoryId
    && !categoriaDisponivelParaPerfil(categories.find(c => c.id === form.categoryId), perfilCategorias)
  const categoryOpts = useMemo(() => buildCatOpts(categoriasDoPerfil, form.type === 'transfer' ? null : form.type), [categoriasDoPerfil, form.type])
  const expenseCatOpts = useMemo(() => buildCatOpts(categoriasDoPerfil, 'expense'), [categoriasDoPerfil])

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

  // ── Regra única de séries (lib/camposSerie.js) — lançamentos parcelados (cartão/importação) ──
  // Irmãs por serie_id (ou raiz parentTxId) + installmentNum — nunca pela descrição "N/M". Só as
  // PENDENTES mudam: parcela em fatura fechada/paga fica como está.
  const [escopoPendente, setEscopoPendente] = useState(null) // { mudancas, nProximas, nPendentes }
  const camposRastreados = (t) => ({
    amount: t.amount, date: t.date || null, categoryId: t.categoryId || null,
    description: t.description || null, accountId: t.accountId || null, costCenter: t.costCenter || null,
    grupoGerencial: t.grupoGerencial || null, payee: t.payee || null, tipoDocumentoId: t.tipoDocumentoId || null,
  })
  const parcelaPendente = (t) => parcelaCartaoPendente(t, { faturasFechadas: settings?.faturasFechadas, schedules })

  // Edição do usuário: aplica nas irmãs (conforme o escopo) via updateTransaction e grava o
  // histórico numa transação (POST /api/historico). Fora do fluxo síncrono do submit.
  const aplicarSerieEHistorico = (plano, mudancas, escopo, motivo, finalItem) => {
    if (!mudancas.length) return
    for (const p of plano.slice(1)) updateTransaction(p.id, p.changes)
    const loteId = novoLoteId()
    const entradas = [{ id: initial.id, mudancas }, ...plano.slice(1)]
    const historico = linhasHistorico({
      entidade: 'lancamento', itens: itensPorEscopo(entradas, escopo),
      serieKey: serieKeyDe({ lancamento: initial }), loteId, motivo,
    })
    const finais = [finalItem, ...plano.slice(1).map(p => ({ ...transactions.find(t => t.id === p.id), ...p.changes }))]
    registrarEdicao({ lancamentos: finais, historico, loteId, motivo })
      .then(() => onToast?.(plano.length > 1 ? mensagemAplicada(plano.length) : 'Alteração salva. Histórico registrado.'))
      .catch(err => onToast?.(`Alteração salva, mas o histórico não foi registrado: ${err.message}`))
  }

  const handleSubmit = (e, installmentDecision, decisao = null) => {
    if (!podeGravarForm) { e?.preventDefault?.(); return }
    e?.preventDefault?.()
    if (!form.amount || !form.accountId) return
    if (tipoDocObrigatorio && !form.tipoDocumentoId) { setErroTipoDoc('Selecione o tipo de documento.'); return }

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

    // Duplicidade: já existe lançamento (ou pré-lançamento) parecido? Aviso não bloqueante —
    // "É outro" (aceitos) volta aqui e segue; "É o mesmo" fecha sem gravar.
    if (checarParecidos) {
      const parc = isCredit && form.type === 'expense' && form.installments > 1
      const inst = installmentDecision && !installmentDecision.skip ? installmentDecision : null
      const lista = parecidosNaCriacao({
        type: form.type, accountId: form.accountId, date: form.date, dateCartao: form.dateCartao || null,
        amount: parc ? Math.round(Number(form.amount) / form.installments * 100) / 100 : Number(form.amount),
        installmentNum: parc ? 1 : (inst?.num ?? null), installmentTotal: parc ? form.installments : (inst?.total ?? null),
        faturaMonthYear: isCredit ? (form.faturaMonthYear || null) : null,
      }, {
        transactions, preLancamentos: preLancamentos || preBuscados,
        closingDay: selectedAccount?.closingDay || 14, ignorarIds: [...aceitos.current, ...(parecidosAceitos || [])],
      })
      if (lista.length) {
        setParecidos({ lista, installmentDecision })
        setStep('parecidos')
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

    if (isCredit && form.type === 'expense') {
      const msg = mensagemCompetenciaImplausivel(competenciasImplausiveis([{
        description: form.description, faturaMonthYear: form.faturaMonthYear, dateCartao: form.dateCartao,
        date: form.date, installmentNum: initial?.installmentNum,
      }]))
      if (msg) { alert(msg); return }
    }

    const isParcelado = !initial?.id && isCredit && form.type === 'expense' && form.installments > 1
    // Parcelado: o valor do campo é o TOTAL; a última parcela leva a diferença de centavos.
    const valores = isParcelado ? valoresDasParcelas(form.amount, form.installments) : null
    const installmentAmount = isParcelado ? valores.parcela : Number(form.amount)

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
      grupoGerencial: showGerencial ? form.grupoGerencial : (gerencialLigado ? null : grupoComChaveDesligada(initial)),
      faturaMonthYear:
        (isCredit && form.type === 'expense' && form.faturaMonthYear) ? form.faturaMonthYear
        : (faturaAuto?.fechadas.length) ? faturaAuto.efetiva
        : (form.type === 'transfer' && transferToAcc?.type === 'credit' && form.faturaMonthYear) ? form.faturaMonthYear
        : null,
      // Fatura de Referência (MM/AAAA) — editável só em transferências gerenciais; nos demais casos
      // preserva o valor existente (ex.: etapa A tx_gerA_* já traz faturaRef própria).
      faturaRef: showFaturaRef ? ((form.faturaRef || '').trim() || null) : (initial?.faturaRef ?? null),
      dateCartao: form.dateCartao || null,
      // Escolha manual (inclusive "Sem tipo") é o que fica gravado — vence o fallback de exibição.
      tipoDocumentoId: form.tipoDocumentoId || null,
      // Campos de parcela só na CRIAÇÃO. Na edição eles saíam null (isParcelado/decidedInst só valem
      // para lançamento novo) e o updateTransaction gravava installment_num/total, serie_id e,
      // por derivação, installment_key = NULL — o vínculo da série se perdia ao salvar qualquer
      // edição. Mudança de parcela na edição é feita pelo card "Parcela N de M" (confirmInstEdit/clearInst).
      ...(initial?.id ? {} : { installmentNum, installmentTotal, serieId }),
      // Transferência com função de reserva selecionada (origem/destino reserva c/ >1 função).
      // Despesa com "Pago com reserva?" ativo (cartão grupo numerado OU conta corrente): função
      // escolhida no select. Em edição, preserva o valor existente (ex.: cartão importado).
      reservaFuncaoId: form.type === 'transfer'
        ? (showReservaFuncao ? (form.reservaFuncaoId || null) : (reservaFuncaoUnica?.id || null))
        : (initial?.id
            ? (form.reservaFuncaoId || null)
            : (form.useReserva ? (form.reservaFuncaoId || null) : null)),
      // "Será pago com reserva" em despesa de conta corrente: guarda a conta de reserva escolhida
      // (par de reservaFuncaoId). Não cria transferência aqui — só registra o vínculo. Desligar o
      // toggle na edição remove o vínculo.
      reservaContaId: (form.type === 'expense' && form.useReserva && !reservaFuncaoMode) ? (form.reservaAccountId || null) : null,
      ...(form.type === 'transfer' && form.reservaExpenseCategoryId ? { reservaExpenseCategoryId: form.reservaExpenseCategoryId } : {}),
    }

    // Trava do controle gerencial desligado: valor, data e conta/cartão ficam os gravados.
    if (trava) {
      Object.assign(txData, {
        amount: initial.amount, date: initial.date, dateCartao: initial.dateCartao || null,
        accountId: initial.accountId, faturaMonthYear: initial.faturaMonthYear ?? null,
      })
    }

    // Categoria só é mantida em transferências quando o destino é conta de aplicação
    // financeira (aporte categorizado) ou quando a transferência é a entrada à vista de um bem.
    // Transferências comuns nunca carregam categoria.
    if (form.type === 'transfer' && !isTransferToAplicacao && !isTransferDeBem) {
      txData.categoryId = null
    }

    // Categorias de transferência entre perfis (visão CNPJ/CPF) — só em transferências cross-profile.
    txData.categoriaCnpjId = isInterProfileTransfer ? (form.categoriaCnpjId || null) : null
    txData.categoriaCpfId = isInterProfileTransfer ? (form.categoriaCpfId || null) : null

    if (initial?.id) {
      const mudancas = diffCampos(camposRastreados(initial), camposRastreados(txData))
      const irmas = irmasLancamento(initial, transactions)
      const nProximas = irmas.filter(t => (t.installmentNum || 0) > (initial.installmentNum || 0) && parcelaPendente(t)).length
      if (!decisao && precisaEscolherEscopo(mudancas, nProximas)) {
        setEscopoPendente({ mudancas, nProximas, nPendentes: irmas.filter(parcelaPendente).length + 1 })
        setStep('escopo-serie')
        return
      }
      const escopo = decisao?.escopo || ESCOPO.PARCELA
      const plano = planoRegistros(initial, {
        mudancas, escopo, irmas, ehPendente: parcelaPendente, ordem: t => t.installmentNum || 0,
        numParcela: initial.installmentNum, total: initial.installmentTotal,
      })
      updateTransaction(initial.id, txData)
      aplicarSerieEHistorico(plano, mudancas, escopo, decisao?.motivo || null, { ...initial, ...txData })

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
          // REFACTOR DETERMINÍSTICO: a reversão da etapa A (Grupo G) e o ajuste do resgate dos
          // numerados NÃO são mais feitos aqui. O updateTransaction(initial.id, …) acima já disparou
          // o motor determinístico (reconcileFaturaState + applyEnsureGerencial), que remove a etapa A
          // órfã (tx_gerA_<id>) e recria/limpa os resgates (fsch_*) por id determinístico. As antigas
          // chamadas reverseGerencialCascadeOnly(initial) e o lookup por initial.gerencialScheduleId
          // eram redundantes — no-op garantido, pois a etapa A já havia sido removida pelo motor — e
          // mantinham vivo o ponteiro legado gerencialScheduleId. Removidas (path legado A).

          // — Aplica automação do novo grupo —
          // Os agendamentos (etapa A do G, resgate dos numerados) são gerados pelo motor
          // (recalcularAgendamentosFatura, disparado por updateTransaction). Aqui só persistimos
          // a preferência de conta gerencial do Grupo G.
          if (isGerencial1 && gerencialContaId) {
            localStorage.setItem(GERENCIAL_CONTA_KEY, gerencialContaId)
          }

          // — Cascata parcelas 2..N —
          // REFACTOR DETERMINÍSTICO: ajustarParcelasGrupoGerencial era o ÚNICO criador de
          // agendamentos com id ALEATÓRIO (sch_ger_num_* / sch_ger_p_*, chaveados por _originTxId /
          // _gerencialKey) — um laço legado fechado (só ele criava e só ele lia esses slots). No
          // modelo atual cada parcela 2..N mora na sua própria fatura e tem os slots fsch_*
          // regenerados por reconcileFaturaState. Chamada removida (path legado B; função marcada
          // DEPRECATED em AppContext, definição preservada por segurança).

          // — Ajuste de diferença quando o resgate/devolução do grupo já foi executado —
          // (transição pós-pago). Cria lançamento(s) 'ajuste_grupo' que reconciliam os saldos
          // das reservas/gerencial; no-op quando nada foi pago ainda (caminho "antes do pago").
          // NÃO é redundante com o motor: reconcileFaturaState preserva agendamentos já executados e
          // nunca mexe em saldo pago — este é o único caminho que reconcilia o pós-pago.
          criarLancamentoDiferenca(initial.id, {
            prevGrupoId,
            newGrupoId,
            amount: Number(form.amount),
            accountId: initial.accountId,
          })
        } else if (amountChanged) {
          // — Mesmo grupo, valor alterado —
          if (wasGerencial1) {
            reverseGerencialCascadeOnly(initial)
          }
          if (wasNumbered && initial.gerencialScheduleId) {
            const oldSch = schedules.find(s => s.id === initial.gerencialScheduleId)
            if (oldSch) {
              const done = isResgatePago(oldSch.id, schedules, transactions)
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
            // O motor per-gasto já (re)materializa os resgates em qualquer ciclo, mas mantém o guard
            // faturaCicloNoPassado na ETAPA A (Grupo G): em fatura passada ele NÃO cria/atualiza a
            // transferência imediata Principal→Ger. Por isso re-executamos o applyEnsureGerencial, que
            // garante a etapa A também no ciclo passado. Idempotente no ciclo atual (etapa A já existe).
            ensureGerencialState(initial.id)
          }
        }
      }

      // Agendamento de resgate avulso vinculado (source_tx_id): atualizado no lugar (mesmo id — as
      // ocorrências sch:<id>@<data> do resgate continuam válidas), nunca duplicado.
      const linkedSch = findLinkedResgate(initial.id)
      let reservaStep = null
      if (txData.reservaContaId) {
        const reservaAcc = accounts.find(a => a.id === txData.reservaContaId)
        const func = reserveFunctions.find(f => f.id === txData.reservaFuncaoId)
        if (linkedSch) {
          const newAmt = Number(form.amount)
          const changed = linkedSch.accountId !== txData.reservaContaId
            || (linkedSch.reservaFuncaoId || null) !== (txData.reservaFuncaoId || null)
            || Math.abs((linkedSch.amount || 0) - newAmt) > 0.005
          if (changed) {
            if (isResgatePago(linkedSch.id, schedules, transactions)) {
              onToast?.('O resgate vinculado já foi executado — o agendamento não foi alterado.')
            } else {
              // Override da ocorrência (valor editado na prévia) venceria o valor base — acompanha.
              const ov = linkedSch.overrides?.[linkedSch.startDate]
              updateSchedule(linkedSch.id, {
                accountId: txData.reservaContaId,
                reservaFuncaoId: txData.reservaFuncaoId || null,
                amount: newAmt,
                description: `Resgate Reserva - ${func?.name || reservaAcc?.apelido || reservaAcc?.name || ''}`,
                ...(ov && ov.amount != null
                  ? { overrides: { ...linkedSch.overrides, [linkedSch.startDate]: { ...ov, amount: newAmt } } }
                  : {}),
              })
              onToast?.('Agendamento de resgate atualizado.')
            }
          }
        } else if (reservaAcc) {
          setResgateInfo({
            contaResgate: reservaAcc,
            funcaoId: txData.reservaFuncaoId || null,
            funcaoNome: func?.name || '',
            amount: Number(form.amount),
            sourceTxId: initial.id,
          })
          setResgateDate(form.date || today())
          reservaStep = 'resgate'
        }
      } else if (linkedSch && !isResgatePago(linkedSch.id, schedules, transactions)) {
        setResgateToDelete(linkedSch)
        reservaStep = 'resgate-delete'
      }

      if (reservaStep) {
        setStep(reservaStep)
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
          onSalvo?.(form, null)
          setDebtCtx(ctx)
          setStep('debt-payment')
          return
        } else {
          onSalvo?.(form, addTransaction(txData))
          setDebtCtx(ctx)
          setStep('debt-plan')
          return
        }
      }
    }

    // "Repetir": o agendamento ganha o id ANTES, para o lançamento 1/N nascer com scheduleId —
    // excluí-lo reabre a ocorrência, como em qualquer lançamento gerado por agendamento.
    const repeatSchId = form.repeat ? novoIdAgendamento() : null
    if (repeatSchId) txData.scheduleId = repeatSchId

    const txId = addTransaction(txData)
    onSalvo?.(form, txId)

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
        // Categoria, favorecido, centro de custo, observações, função e tipo de documento da parcela 1.
        ...camposHerdadosParcelaFilha({ ...txData, payee: form.payee, costCenter: form.costCenter, notes: form.notes }),
        baseFaturaMonthYear: txData.faturaMonthYear || null,
        serieId,
        amountUltima: valores.ultima,
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
        id: repeatSchId,
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
        tipoDocumentoId: form.tipoDocumentoId || null,
        skipped: [],
        overrides: {},
      })
      markScheduleRegistered(schId, form.date, metaBaixaGerada(txId))
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
      if (g?.number === 1 && gerencialContaId) {
        localStorage.setItem(GERENCIAL_CONTA_KEY, gerencialContaId)
      }
      // (As parcelas futuras 2..N já foram criadas logo após addTransaction, independentemente
      // do grupo gerencial — ver criarParcelasGerencial acima.)

      // Recálculo EXPLÍCITO da fatura da parcela base (Grupo G ou numerado). O motor
      // (reconcileFaturaState) garante a subconta "Ger. {apelido}" e gera o
      // gerencial_devolucao/resgate de forma confiável, sem depender do timing do gatilho implícito.
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
          // O motor mantém o guard faturaCicloNoPassado na ETAPA A (Grupo G) — não a materializa em
          // fatura passada. applyEnsureGerencial garante a etapa A deste lançamento novo. Idempotente.
          if (txId) ensureGerencialState(txId)
        }
      }
    }

    if (isCredit && form.type === 'expense') {
      const match = findMatchingSchedule(txData)
      if (match) {
        setScheduleMatch({ schedule: match, tx: txData, txId })
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
    const gerIds = []
    for (const p of missing) {
      const grupo = p.grupoGerencial || defaultGrupoId
      // p.date já segue a regra (parcela >1 → mês anterior à fatura). NÃO clampar essas, senão
      // a data voltaria para o mês da própria fatura. Parcela 1 mantém o clamp ao período.
      const date = (p.num || 1) > 1 ? p.date : clampDateToFatura(p.date, p.faturaMonthYear, closingDay)
      if (p.payee && !payees.includes(p.payee)) addPayee(p.payee)
      const pid = addTransaction({
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
      if (pid) gerIds.push(pid)
      faturas.add(p.faturaMonthYear)
    }
    for (const fmy of faturas) {
      const [y, m] = (fmy || '').split('-')
      if (y && m) recalcularAgendamentosFatura(initial.accountId, y, m)
    }
    // O motor mantém o guard faturaCicloNoPassado na ETAPA A (Grupo G): não a materializa em fatura
    // passada. applyEnsureGerencial por parcela criada garante a etapa A também no passado. Idempotente
    // (no ciclo atual/futuro o motor já criou; ensureGerencialState não duplica).
    gerIds.forEach(id => ensureGerencialState(id))
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
    // _limparParcela: a única limpeza de parcela intencional — libera a proteção do upsert
    // (api/_db.js), que não deixa um NULL sobrescrever campos de parcela já gravados.
    updateTransaction(initial.id, { installmentNum: null, installmentTotal: null, _limparParcela: true })
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
    const { schedule: agMatch, tx: txMatch, txId: txIdMatch } = scheduleMatch
    // "O agendamento manda": campos em que o lançamento salvo difere do agendamento.
    const diferencas = diferencasLancamentoAgendamento(txMatch, agMatch)
    const rotuloCampo = (campo, v) => {
      if (v == null || v === '') return '—'
      if (campo === 'grupoGerencial') { const g = gerencialGroups.find(x => x.id === v); return g ? `${g.number} · ${g.name}` : v }
      if (campo === 'categoryId') { const c = categories.find(x => x.id === v); return c ? `${c.icon} ${c.name}` : v }
      if (campo === 'reservaFuncaoId') return (reserveFunctions || []).find(f => f.id === v)?.name || v
      if (campo === 'tipoDocumentoId') return tiposDocumento.find(t => t.id === v)?.nome || v
      return String(v)
    }
    const handleRegister = ({ atualizarFuturas = false, usarDoAgendamento = true, atualizarAgendamento = false } = {}) => {
      // Pelo valor do lançamento, na ocorrência da mesma fatura; o meta liga a baixa ao lançamento
      // recém-criado (ele não leva schedule_id).
      baixarCobrancaRecorrente({ schedule: agMatch, tx: txMatch, meta: metaBaixaGerada(txIdMatch), atualizarFuturas })
      if (diferencas.length && usarDoAgendamento && txIdMatch) {
        updateTransaction(txIdMatch, patchLancamentoDoAgendamento(agMatch))
      } else if (diferencas.length && atualizarAgendamento) {
        const { changes, mudancas } = mudancasNoAgendamento(agMatch, diferencas.map(d => ({ campo: d.campo, para: d.deLancamento })))
        if (mudancas.length) {
          updateSchedule(agMatch.id, changes)
          const loteId = novoLoteId()
          registrarEdicao({
            agendamentos: [{ ...agMatch, ...changes }], loteId,
            historico: linhasHistorico({ entidade: 'agendamento', itens: [{ id: agMatch.id, escopo: ESCOPO.PROXIMAS, mudancas }], loteId, motivo: 'Novo lançamento: atualizado pelo lançamento' }),
          }).catch(e => console.error('[lancamento] histórico do agendamento:', e?.message || e))
        }
      }
      onClose()
    }
    return (
      <ScheduleMatchModal
        schedule={agMatch}
        tx={txMatch}
        diferencas={diferencas.map(d => ({ ...d, deLancamento: rotuloCampo(d.campo, d.deLancamento), doAgendamento: rotuloCampo(d.campo, d.doAgendamento) }))}
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

  if (step === 'escopo-serie' && escopoPendente) {
    return (
      <EscopoSerieDialog
        mudancas={escopoPendente.mudancas}
        nProximas={escopoPendente.nProximas}
        nPendentesSerie={escopoPendente.nPendentes}
        onCancel={() => { setEscopoPendente(null); setStep('form') }}
        onConfirm={(decisao) => { setEscopoPendente(null); setStep('form'); handleSubmit(null, undefined, decisao) }}
      />
    )
  }

  if (step === 'historico' && initial?.id) {
    return (
      <HistoricoPainel
        entidade="lancamento"
        entidadeId={initial.id}
        serieKey={serieKeyDe({ lancamento: initial })}
        origem={initial.scheduleId ? { entidade: 'agendamento', entidadeId: initial.scheduleId } : null}
        onVoltar={() => setStep('form')}
      />
    )
  }


  if (step === 'abrir-existente' && existenteAberto) {
    return <TransactionForm initial={existenteAberto} onClose={onClose} onToast={onToast} />
  }

  if (step === 'parecidos' && parecidos) {
    const mesmo = (tx) => { onMesmo?.(tx) }
    return (
      <div className="space-y-3 py-2">
        <AvisoParecidos
          parecidos={parecidos.lista}
          accounts={accounts}
          onMesmo={() => { mesmo(parecidos.lista[0]); onClose() }}
          onAbrir={(tx) => { mesmo(tx); setExistenteAberto(tx); setStep('abrir-existente') }}
          onOutro={() => {
            parecidos.lista.forEach(t => aceitos.current.add(t._pre ? t.preId : t.id))
            setStep('form')
            handleSubmit(null, parecidos.installmentDecision)
          }}
        />
        <button type="button" className="text-xs text-texto-3 hover:text-texto-1" onClick={() => setStep('form')}>
          ← Voltar ao formulário
        </button>
      </div>
    )
  }

  if (step === 'installment-detect' && installmentPrompt) {
    const { num, total } = installmentPrompt
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto">
            <Repeat size={22} className="text-texto-2" />
          </div>
          <h3 className="font-semibold text-texto-1">Isto é uma parcela?</h3>
          <p className="text-sm text-texto-2 leading-relaxed">
            A descrição contém{' '}
            <span className="text-texto-1 font-semibold">{num}/{total}</span> e o campo
            “Parcelado” não está marcado. Deseja registrar este lançamento como{' '}
            <span className="text-texto-1 font-semibold">parcela {num} de {total}</span>?
          </p>
          <p className="text-xs text-texto-3">
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
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto">
            <Repeat size={22} className="text-texto-2" />
          </div>
          <h3 className="font-semibold text-texto-1">Gerar parcelas futuras</h3>
          <p className="text-sm text-texto-2 leading-relaxed">
            Serão criadas <span className="text-texto-1 font-semibold">{missing.length}</span> parcela{missing.length !== 1 ? 's' : ''} faltante{missing.length !== 1 ? 's' : ''} desta série
            (herdando categoria, grupo gerencial, favorecido e função de reserva da parcela mais próxima):
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-borda-forte/60 divide-y divide-borda">
          {missing.map(p => (
            <div key={p.num} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-texto-1 truncate">{p.description}</div>
                <div className="text-xs text-texto-3">parcela {p.num}/{p.total} · {p.date} · fatura {p.faturaMonthYear}</div>
              </div>
              <div className="text-texto-1 font-semibold whitespace-nowrap">{fmt(p.amount)}</div>
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

  if (step === 'resgate-delete' && resgateToDelete) {
    const linkedSch = resgateToDelete
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-reserva/15 flex items-center justify-center mx-auto">
            <PiggyBank size={22} className="text-reserva" />
          </div>
          <h3 className="font-semibold text-texto-1">Excluir agendamento de resgate?</h3>
          <p className="text-sm text-texto-2 leading-relaxed">
            A despesa não está mais vinculada a uma reserva. Deseja excluir o agendamento{' '}
            <span className="text-texto-1 font-semibold">{linkedSch.description}</span> de{' '}
            <span className="text-texto-1 font-semibold">{fmt(linkedSch.amount)}</span> em{' '}
            <span className="text-texto-1 font-semibold">{fmtDate(linkedSch.startDate)}</span>?
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Manter</button>
          <button
            className="btn-danger flex-1"
            onClick={() => { deleteSchedule(linkedSch.id); onToast?.('Agendamento de resgate excluído.'); onClose() }}
          >
            Excluir Agendamento
          </button>
        </div>
      </div>
    )
  }

  if (step === 'resgate' && resgateInfo) {
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-reserva/15 flex items-center justify-center mx-auto">
            <PiggyBank size={22} className="text-reserva" />
          </div>
          <h3 className="font-semibold text-texto-1">Criar agendamento de resgate?</h3>
          <p className="text-sm text-texto-2 leading-relaxed">
            Deseja agendar o resgate de{' '}
            <span className="text-texto-1 font-semibold">{fmt(resgateInfo.amount)}</span> da reserva{' '}
            <span className="text-texto-1 font-semibold">{resgateInfo.contaResgate.apelido || resgateInfo.contaResgate.name}</span>
            {contaPrincipal ? (<> → <span className="text-texto-1 font-semibold">{contaPrincipal.apelido || contaPrincipal.name}</span></>) : null}?
          </p>
          {resgateInfo.funcaoNome && (
            <p className="text-xs text-reserva">Função: {resgateInfo.funcaoNome}</p>
          )}
          {centralResgate.erro && (
            <p className="text-xs text-aviso">{centralResgate.erro}</p>
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
          <button className="btn-primary flex-1" disabled={!resgateDate || !contaPrincipal} onClick={handleResgate}>Criar Agendamento</button>
        </div>
      </div>
    )
  }

  if (rapido && !maisOpcoes) {
    const saida = form.type !== 'income'
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex rounded-xl overflow-hidden border border-borda-forte" role="group" aria-label="Tipo">
          {[{ v: 'expense', l: 'Saída' }, { v: 'income', l: 'Entrada' }].map(t => (
            <button
              type="button"
              key={t.v}
              onClick={() => set('type', t.v)}
              aria-pressed={form.type === t.v}
              className={`flex-1 min-h-[44px] text-sm font-semibold transition-colors ${
                form.type === t.v
                  ? (t.v === 'income' ? 'bg-receita text-page' : 'bg-despesa text-page')
                  : 'bg-surface-2 text-texto-2'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="text-center py-2">
          <label htmlFor="valor-rapido" className="text-xs text-texto-3">Valor</label>
          <div className={`flex items-baseline justify-center gap-1 ${saida ? 'text-despesa' : 'text-receita'}`}>
            <span className="text-xl font-semibold">R$</span>
            <InputMoeda
              id="valor-rapido"
              autoFocus
              value={form.amount}
              onChange={e => set('amount', Number(e.target.value) > 0 ? e.target.value : '')}
              placeholder="0,00"
              className="w-44 bg-transparent text-center text-4xl font-bold outline-none placeholder:text-texto-3"
              required
            />
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          <input className="input" value={form.description} onChange={e => onDescriptionChange(e.target.value)} placeholder="Digite a descrição do lançamento" />
        </div>

        <div>
          <label className="label">Conta *</label>
          <SearchableSelect
            options={accountOpts}
            value={form.accountId}
            onChange={id => set('accountId', id)}
            placeholder="Selecione a conta..."
            preserveGroupOrder
            ungroupedLast
            required
          />
        </div>

        <div>
          <label className="label">Categoria</label>
          <SearchableSelect
            options={categoryOpts}
            preserveGroupOrder
            value={form.categoryId}
            onChange={onCategoryChange}
            placeholder="Sem categoria"
            ungroupedLast
            ungroupedLabel="Sem grupo"
          />
        </div>

        {tipoDocObrigatorio && (
          <TipoDocumentoSelect
            value={form.tipoDocumentoId}
            onChange={v => { setErroTipoDoc(''); set('tipoDocumentoId', v || '') }}
            tipoMov={form.type}
            required
            erro={erroTipoDoc}
          />
        )}

        <button type="button" onClick={() => setMaisOpcoes(true)} className="text-sm text-primary-fg min-h-[44px]">
          + Mais opções (data, parcelas, envelope)
        </button>

        {podeGravarForm
          ? <button type="submit" className="btn-primary w-full min-h-[48px] text-base">Salvar</button>
          : <p className="text-xs text-texto-3 text-center">Somente leitura — seu nível de acesso não permite gravar.</p>}
      </form>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {initial?.id && (
        <div className="flex items-center justify-end gap-2 -mb-2">
          {seloParcela && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-texto-2" title={`Ocorrência de ${fmtDate(initial.dataOcorrencia)} do agendamento`}>
              Parcela <SeloParcela rotulo={seloParcela} />
            </span>
          )}
          <button type="button" onClick={() => setStep('historico')} className="text-xs text-texto-2 hover:text-texto-1 flex items-center gap-1.5" title="Histórico de alterações">
            <History size={13} /> Histórico
            {(temHistorico('lancamento', initial.id) || (initial.scheduleId && temHistorico('agendamento', initial.scheduleId))) && <span className="w-1.5 h-1.5 rounded-full bg-primary-fg" />}
          </button>
        </div>
      )}
      {initial?.id && initial.contratoId && (
        // Composição editada aqui muda o valor do lançamento: o campo Valor acompanha, para o
        // Salvar do formulário não gravar o valor antigo por cima.
        <ComposicaoCard txId={initial.id} onValorAlterado={(v) => setForm(f => ({ ...f, amount: v }))} />
      )}
      {showRateio && (
        <RateioModal
          total={Number(form.amount) || rateioTotal || 0}
          categories={categories}
          perfilId={perfilCategorias}
          categoryType={form.type === 'income' ? 'income' : form.type === 'expense' ? 'expense' : null}
          initial={rateioRows}
          onSave={rs => { setRateioRows(rs); setShowRateio(false) }}
          onDeleteAll={() => { setRateioRows([]); setShowRateio(false) }}
          onClose={() => setShowRateio(false)}
        />
      )}
      <div>
        <label className="label">Tipo</label>
        <div className="flex rounded-lg overflow-hidden border border-borda-forte">
          {TYPE_OPTIONS.map(t => (
            <button
              type="button"
              key={t.value}
              onClick={() => set('type', t.value)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.type === t.value
                  ? t.value === 'income' ? 'bg-receita text-page'
                    : t.value === 'expense' ? 'bg-despesa text-page'
                    : 'bg-transferencia text-page'
                  : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
              }`}
            >
              {t.label}
              <ShortcutHint actionId={t.atalho} habilitado={atalhosForm} className="ml-1.5" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Conta {form.type === 'transfer' ? 'Origem' : ''} *{confira('accountId')}</label>
          {trava
            ? <div className="input opacity-60 cursor-not-allowed" title={trava}>{selectedAccount?.apelido || selectedAccount?.name || '—'}</div>
            : <SearchableSelect
                options={accountOpts}
                value={form.accountId}
                onChange={id => setForm(f => ({ ...f, accountId: id, ...(f.type === 'transfer' ? { reservaFuncaoId: '' } : {}) }))}
                placeholder="Selecione a conta..."
                preserveGroupOrder
                ungroupedLast
                required
              />}
        </div>
        {form.type === 'transfer' ? (
          <div>
            <label className="label">Conta Destino *{confira('toAccountId')}</label>
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
            <label className="label">{isCredit && form.type === 'expense' && form.installments > 1 ? 'Total (R$) *' : 'Valor (R$) *'}{confira('amount')}</label>
            <InputMoeda min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required disabled={!!trava} />
          </div>
        )}
      </div>
      {trava && (
        <p role="note" className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1">{trava}</p>
      )}

      {form.type === 'transfer' && (
        <>
          <div>
            <label className="label">Valor (R$) *{confira('amount')}</label>
            <InputMoeda min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required />
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
                const color = dif > 0.01 ? 'text-receita' : dif < -0.01 ? 'text-aviso' : 'text-texto-2'
                return (
                  <p className="text-xs text-texto-3 mt-1.5">
                    Fatura {fmt(billTotal)} · pagando {fmt(pagando)} → <span className={`font-medium ${color}`}>{txt}</span>
                  </p>
                )
              })()}
              <p className="text-xs text-texto-3 mt-1">Vincular abate a dívida da fatura e conta como pagamento real.</p>
            </div>
          )}
          {(() => {
            const toAcc = accounts.find(a => a.id === form.toAccountId)
            const toGroup = (accountGroups || []).find(g => g.id === toAcc?.accountGroupId)
            if (!toGroup?.behavior) return null
            const hasPlan = !!toAcc?.debtPlan
            const isEmp = toGroup.behavior === 'emprestimo'
            return (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${hasPlan ? 'bg-primary/10 border-primary/20 text-primary-fg' : 'bg-aviso/10 border-aviso/20 text-aviso'}`}>
                <span className="shrink-0 mt-0.5">{hasPlan ? '✓' : '⚠'}</span>
                {hasPlan
                  ? `Pagamento de ${isEmp ? 'empréstimo' : 'dívida'} — plano de ${toAcc.debtPlan.installments} parcelas ativo`
                  : `Conta de ${isEmp ? 'empréstimo a terceiros' : 'dívida'} — você poderá configurar o plano de parcelas após registrar`
                }
              </div>
            )
          })()}
          {(isDepositToReserva || isWithdrawFromReserva) && !form.reservaFuncaoId && (
            <div className="p-3 bg-reserva-bg border border-reserva/30 rounded-lg space-y-2">
              <p className="text-xs font-medium text-reserva flex items-center gap-1.5">
                📂 {isDepositToReserva ? 'Despesa a classificar' : 'Categoria do resgate'}
              </p>
              {/* Categoria sempre editável (inclusive em reserva especifica/função única):
                  o padrão da reserva é só uma dica; o usuário pode alterar ou limpar. */}
              <SearchableSelect
                options={expenseCatOpts}
                preserveGroupOrder
                value={form.reservaExpenseCategoryId}
                onChange={id => set('reservaExpenseCategoryId', id)}
                placeholder={reservaLinkedCat ? `${reservaLinkedCat.icon} ${reservaLinkedCat.name} (padrão da reserva)` : '🏦 Reservas Gerais (padrão)'}
                ungroupedLast
                ungroupedLabel="Sem grupo"
              />
              {needsReservaCategorySelect && !reservaFuncaoUnica && !form.reservaExpenseCategoryId && (
                <p className="text-xs text-aviso">⚠ Obrigatório para reserva livre</p>
              )}
              {(!needsReservaCategorySelect || reservaFuncaoUnica) && !form.reservaExpenseCategoryId && (
                <p className="text-xs text-texto-2">
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
              <p className="text-xs text-texto-3 mt-1.5 leading-relaxed">
                {isDepositToReserva ? 'Função de reserva deste depósito.' : 'Função de reserva deste resgate.'}
              </p>
            </div>
          )}
          {isTransferToAplicacao && (
            <div>
              <label className="label">Categoria</label>
              <SearchableSelect
                options={expenseCatOpts}
                preserveGroupOrder
                value={form.categoryId}
                onChange={onCategoryChange}
                placeholder="Sem categoria"
                ungroupedLast
                ungroupedLabel="Sem grupo"
              />
              <p className="text-xs text-texto-3 mt-1.5 leading-relaxed">
                Opcional — preencha apenas se quiser classificar o aporte. Com categoria, o
                lançamento aparece nos relatórios como saída; em branco, é uma transferência
                comum (invisível nos relatórios).
              </p>
            </div>
          )}
          {isTransferDeBem && (
            <>
              <div>
                <label className="label">Categoria</label>
                <SearchableSelect
                  options={categoryOpts}
                  preserveGroupOrder
                  value={form.categoryId}
                  onChange={onCategoryChange}
                  placeholder="Sem categoria"
                  ungroupedLast
                  ungroupedLabel="Sem grupo"
                />
                {categoriaForaDoPerfil && <p className="text-[11px] text-aviso mt-0.5">⚠ Categoria de outro perfil</p>}
              </div>
              <div>
                <label className="label">Favorecido</label>
                <FavorecidoAutocomplete
                  value={form.payee}
                  onChange={onPayeeChange}
                  suggestions={sortedPayees}
                />
                <p className="text-xs text-texto-3 mt-1.5 leading-relaxed">
                  Esta transferência é a entrada à vista de um bem — por isso carrega categoria e
                  favorecido, ao contrário de uma transferência comum.
                </p>
              </div>
            </>
          )}
          <TransferenciaPerfisCategorias
            fromAccount={transferFromAcc}
            toAccount={transferToAcc}
            categoriaCnpjId={form.categoriaCnpjId}
            categoriaCpfId={form.categoriaCpfId}
            onChangeCnpj={id => set('categoriaCnpjId', id)}
            onChangeCpf={id => set('categoriaCpfId', id)}
          />
        </>
      )}

      <TipoDocumentoSelect
        value={form.tipoDocumentoId}
        onChange={v => { setErroTipoDoc(''); set('tipoDocumentoId', v || '') }}
        tipoMov={form.type}
        required={tipoDocObrigatorio}
        erro={erroTipoDoc}
      />

      <div>
        <label className="label">Data *{confira('date')}</label>
        <DateInput className="input" value={form.date} onChange={e => set('date', e.target.value)} required hoje disabled={!!trava} />
      </div>

      {isCredit && form.type === 'expense' && (
        <div>
          <label className="label">Data Banco</label>
          <DateInput className="input" value={form.dateCartao} onChange={e => set('dateCartao', e.target.value)} disabled={!!trava} />
          <p className="text-xs text-texto-3 mt-1.5 leading-relaxed">
            Data original do extrato do cartão. Em branco para lançamentos manuais — preencha
            só para corrigir quando o banco enviou a data errada.
          </p>
        </div>
      )}

      {form.type !== 'transfer' && (
        <>
          <div>
            <label className="label">Categoria{confira('categoryId')}</label>
            <div className="flex items-center gap-2">
              {rateioRows.length > 0 ? (
                <div className="input flex-1 flex items-center justify-between text-xs text-texto-2">
                  <span>{rateioRows.length} Categorias Separadas</span>
                  <span className="text-texto-3">Total: {fmt(rateioTotal)}</span>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={categoryOpts}
                    preserveGroupOrder
                    value={form.categoryId}
                    onChange={onCategoryChange}
                    placeholder="Sem categoria"
                    ungroupedLast
                    ungroupedLabel="Sem grupo"
                  />
                  {categoriaForaDoPerfil && <p className="text-[11px] text-aviso mt-0.5">⚠ Categoria de outro perfil</p>}
                </div>
              )}
              <button type="button" onClick={() => setShowRateio(true)} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                Separar
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="label">Favorecido{confira('payee')}</label>
              {initial?.id && (initial.payee || '').trim() && (
                <button type="button" onClick={() => setRenomearFav(true)}
                  className="text-[11px] text-texto-2 hover:text-texto-1 min-h-[32px] px-1"
                  title="Troca este favorecido em todos os lançamentos, agendamentos e regras (com prévia)">
                  Renomear em todos
                </button>
              )}
            </div>
            <FavorecidoAutocomplete
              value={form.payee}
              onChange={onPayeeChange}
              suggestions={sortedPayees}
            />
          </div>
          {renomearFav && (
            <RenomearFavorecidoModal
              open
              onClose={() => setRenomearFav(false)}
              nomeBase={initial.payee}
              titulo="Renomear favorecido em todos"
              // O formulário aberto segue com o nome antigo: sem isto, salvar depois devolveria o
              // favorecido antigo a este lançamento. Só o favorecido — a descrição não acompanha.
              onAplicado={({ para }) => set('payee', para)}
            />
          )}

          <div>
            <label className="label">Centro de Custo{confira('costCenter')}</label>
            <select className="input" value={form.costCenter} onChange={e => set('costCenter', e.target.value)}>
              <option value="">Sem centro de custo</option>
              {costCenters.map(cc => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </div>
        </>
      )}

      <div>
        <label className="label">Descrição{confira('description')}</label>
        <input className="input" value={form.description} onChange={e => onDescriptionChange(e.target.value)} placeholder="Digite a descrição do lançamento" />
      </div>

      {showFaturaRef && (
        <div>
          <label className="label">Fatura de Referência</label>
          <input
            className="input"
            value={form.faturaRef}
            onChange={e => set('faturaRef', e.target.value)}
            placeholder="MM/AAAA"
          />
        </div>
      )}

      {/* Item 6: card "Parcela N de M" editável (override manual) + irmãs + geração das faltantes. */}
      {eligivelParcela && (
        <div className={`p-3 rounded-lg space-y-2 border ${parcelaSeries ? 'bg-surface-2 border-borda-forte' : 'bg-surface-2/40 border-borda-forte/50'}`}>
          <div className="flex items-center justify-between gap-2">
            {editInst ? (
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  autoFocus
                  value={instInput}
                  onChange={e => setInstInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmInstEdit() } }}
                  placeholder="Parcela/Total"
                  className="input py-1 text-sm w-28"
                />
                <button type="button" onClick={confirmInstEdit} title="Confirmar" className="p-1 text-primary-fg hover:bg-primary/15 rounded">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setEditInst(false)} title="Cancelar" className="p-1 text-texto-2 hover:bg-surface-hover rounded">
                  <X size={14} />
                </button>
                {effInstTotal != null && (
                  <button type="button" onClick={clearInst} className="text-[11px] text-texto-2 hover:text-texto-1 ml-1">↩ à vista</button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${parcelaSeries ? 'text-texto-1' : 'text-texto-2'}`}>
                    {parcelaSeries ? `Parcela ${effInstNum} de ${effInstTotal}` : 'À vista'}
                  </span>
                  <button type="button" onClick={openInstEditor} title={parcelaSeries ? 'Editar parcelamento' : 'Marcar como parcelado'} className="p-0.5 text-texto-3 hover:text-texto-1">
                    <Pencil size={12} />
                  </button>
                </div>
                {parcelaSeries
                  ? <span className="text-xs text-texto-3">{parcelaSeries.presentes}/{parcelaSeries.total} no histórico</span>
                  : (
                    <button type="button" onClick={openInstEditor} className="text-xs text-ambar hover:text-texto-1">
                      Marcar como parcelado
                    </button>
                  )}
              </>
            )}
          </div>
          {parcelaSeries && (
            <>
              <div className="rounded-md border border-borda-forte/50 divide-y divide-borda max-h-40 overflow-y-auto">
                {parcelaSeries.siblings.map(s => (
                  <div key={s.id} className={`px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 ${s.id === initial.id ? 'bg-surface-hover' : ''}`}>
                    <span className="text-texto-2 whitespace-nowrap">{s._num}/{parcelaSeries.total}</span>
                    <span className="text-texto-3 truncate flex-1">fatura {s.faturaMonthYear || '—'}</span>
                    <span className="text-texto-1 whitespace-nowrap">{fmt(s.amount)}</span>
                    {s.id === initial.id && <span className="text-texto-1 font-medium">atual</span>}
                  </div>
                ))}
              </div>
              {parcelaSeries.missing.length > 0 ? (
                <button type="button" className="btn-secondary w-full text-sm" onClick={() => setStep('gerar-parcelas')}>
                  Gerar parcelas futuras ({parcelaSeries.missing.length} faltando)
                </button>
              ) : parcelaSeries.completa ? (
                <p className="text-xs text-texto-3">Série completa — nenhuma parcela faltando.</p>
              ) : (
                <p className="text-xs text-aviso">
                  ⚠ {parcelaSeries.total - parcelaSeries.presentes} parcela{parcelaSeries.total - parcelaSeries.presentes !== 1 ? 's' : ''} fora do histórico.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Digite observações adicionais (opcional)" />
      </div>

      {form.type === 'expense' && reservaAccounts.length > 0 && !reservaFuncaoMode && (
        <div data-bloco-switch className="p-3 bg-reserva/10 border border-reserva/20 rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                ref={reservaSwitchRef}
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
              <div className="w-9 h-5 bg-borda-campo rounded-full peer-checked:bg-reserva transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <PiggyBank size={14} className="text-reserva shrink-0" />
            <span className="text-sm text-reserva select-none">Será pago com reserva</span>
            <ShortcutHint actionId="lancamento.toggleReserva" habilitado={atalhosForm} className="text-reserva" />
            {matchingSpecificReserva && !form.useReserva && !reservaFuncaoMode && (
              <span className="text-xs text-texto-2 ml-1">sugerida: {matchingSpecificReserva.apelido || matchingSpecificReserva.name}</span>
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
                    <p className="text-xs text-texto-2 leading-relaxed">
                      De qual função de <strong>{reservaGroupAccount?.apelido || reservaGroupAccount?.name || 'reserva'}</strong> sairá
                      o resgate desta despesa. O agendamento de resgate é gerado no vencimento de cada fatura afetada.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-aviso leading-relaxed">
                    ⚠ Nenhuma função de reserva configurada para {reservaGroupAccount?.apelido || reservaGroupAccount?.name || 'a conta de reserva'} deste grupo.
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
                  <p className="text-xs text-texto-2 leading-relaxed">
                    {initialResgate
                      ? 'A despesa registra o vínculo com a reserva. O agendamento de resgate vinculado será atualizado ao salvar.'
                      : 'A despesa registra o vínculo com a reserva. Após salvar, você poderá agendar o resgate desta reserva para a conta principal.'}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}

      {isCredit && form.type === 'expense' && !initial?.id && (
        <div className="p-3 bg-surface-2/60 border border-borda-forte rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={form.installments > 1}
                onChange={e => set('installments', e.target.checked ? 2 : 1)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-borda-campo rounded-full peer-checked:bg-primary transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-texto-2 select-none">Parcelado</span>
          </label>
          {form.installments > 1 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-texto-2 shrink-0">Parcelas:</label>
              <input
                className="input w-20 text-center"
                type="number"
                min="2"
                max="48"
                value={form.installments}
                onChange={e => set('installments', Math.max(2, Math.min(48, Number(e.target.value) || 2)))}
              />
              {form.amount && (
                <span className="text-xs text-texto-3">
                  {(() => {
                    const v = valoresDasParcelas(form.amount, form.installments)
                    return `${fmt(v.parcela)} por parcela${v.ultima !== v.parcela ? ` (última ${fmt(v.ultima)})` : ''}`
                  })()}
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
            className="input disabled:opacity-60"
            value={form.faturaMonthYear}
            onChange={e => set('faturaMonthYear', e.target.value)}
            disabled={!!trava}
          >
            <option value="">{faturaAuto ? `(automático) Fatura ${rotuloFatura(faturaAuto.efetiva)}` : '(automático)'}</option>
            {faturaRefOptions.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}{faturaEstaFechada(settings?.faturasFechadas, form.accountId, o.value) ? ' (fechada)' : ''}
              </option>
            ))}
          </select>
          {!form.faturaMonthYear && avisoFaturaFechada(faturaAuto) && (
            <p className="text-xs text-aviso mt-1.5">{avisoFaturaFechada(faturaAuto)}</p>
          )}
          {faturaEscolhidaFechada && (
            <p className="text-xs text-aviso mt-1.5">A fatura {rotuloFatura(form.faturaMonthYear)} está fechada.</p>
          )}
          <p className="text-xs text-texto-3 mt-1.5 leading-relaxed">
            Opcional — em branco, a fatura é calculada automaticamente pelo dia de
            fechamento do cartão (fatura fechada → a próxima aberta).
          </p>
        </div>
      )}

      {showGerencial && (
        <div className="p-3 bg-reserva/10 border border-reserva/20 rounded-lg space-y-3">
          <label className="label" style={{ marginBottom: 0 }}>Classificação Gerencial</label>
          <GerencialSelect
            value={form.grupoGerencial}
            onChange={v => setForm(f => ({ ...f, grupoGerencial: v, reservaFuncaoId: '' }))}
            grupos={gerencialGroups}
          />

          {form.grupoGerencial && (() => {
            const g = gerencialGroups.find(x => x.id === form.grupoGerencial)
            if (!g || g.number === 'D') return (
              <p className="text-xs text-texto-3">Lançamento registrado como despesa normal.</p>
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
                  {selectedAccount?.type === 'credit' && contaCentralPara(accounts, profiles, selectedAccount).erro && (
                    <p className="text-xs text-aviso">{contaCentralPara(accounts, profiles, selectedAccount).erro}</p>
                  )}
                  <div>
                    <label className="label text-xs uppercase tracking-wide text-reserva">Conta Destino</label>
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
                      <p className="text-xs text-texto-2 leading-relaxed">
                        Transferência automática será criada para a subconta{' '}
                        <strong className="text-texto-1">"Ger. {subcontaApelido}"</strong>{' '}
                        a partir de <strong className="text-texto-1">{contaDestino.name}</strong>.
                      </p>
                      <p className="text-xs text-texto-2">
                        📅 Fatura {faturaRef} · Agendamento de devolução em {fmtDate(scheduleDate)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-aviso">
                      ⚠ Selecione a conta corrente de origem da transferência.
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
                    <p className="text-xs text-texto-2 leading-relaxed">
                      Agendamento de resgate automático:{' '}
                      <strong className="text-texto-1">{acc.apelido || acc.name}</strong> → conta central.
                    </p>
                    <p className="text-xs text-texto-2">
                      📅 Fatura {faturaRef3} · Resgate em {fmtDate(dueDate3)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-aviso">
                    ⚠ Configure uma conta padrão neste grupo para ativar o resgate automático.
                  </p>
                )}

                {/* Função de reserva específica deste lançamento (novo e edição). Só quando o grupo
                    tem MAIS DE 1 função; com 1 única, o resgate usa a conta do grupo automaticamente. */}
                {showFuncaoReservaSelect && (
                  <div>
                    <label className="label text-xs uppercase tracking-wide text-reserva">Função de Reserva</label>
                    <select
                      className="input"
                      value={form.reservaFuncaoId || ''}
                      onChange={e => set('reservaFuncaoId', e.target.value)}
                    >
                      <option value="">Sem função específica</option>
                      {reservaGroupFuncs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <p className="text-xs text-texto-3 mt-1 leading-relaxed">
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
        <div data-bloco-switch className="p-3 bg-surface-2/60 border border-borda-forte rounded-lg space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className="relative shrink-0">
              <input
                ref={repetirSwitchRef}
                type="checkbox"
                checked={form.repeat}
                onChange={e => set('repeat', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-borda-campo rounded-full peer-checked:bg-primary transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <Repeat size={14} className="text-texto-2 shrink-0" />
            <span className="text-sm text-texto-2 select-none">Repetir este lançamento</span>
            <ShortcutHint actionId="lancamento.toggleRepetir" habilitado={atalhosForm} className="text-texto-2" />
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
                    <div className="flex rounded-lg overflow-hidden border border-borda-forte">
                      {[['continuous', 'Contínuo'], ['installment', 'Por parcelas']].map(([v, l]) => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => set('repeatOccurrenceType', v)}
                          className={`flex-1 py-2 text-sm font-medium transition-colors ${
                            form.repeatOccurrenceType === v ? 'bg-primary/15 text-primary-fg' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
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
                <span className="text-sm text-texto-2">Lembrete</span>
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
                      <span className="text-xs text-texto-3 whitespace-nowrap">dias antes</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => set('repeatRemindDaysBefore', form.repeatRemindDaysBefore > 0 ? 0 : 3)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.repeatRemindDaysBefore > 0 ? 'bg-primary' : 'bg-borda-campo'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.repeatRemindDaysBefore > 0 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-texto-3 leading-relaxed">
                Um agendamento será criado em "Agendamentos" com estes dados, começando em {fmtDate(form.date)}.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        {podeGravarForm ? (
          <button type="submit" className="btn-primary flex-1" title={tituloGravar}>
            {initial ? 'Salvar' : 'Registrar'}
            <ShortcutHint actionId="lancamento.gravar" habilitado={atalhosForm} className="ml-2" />
          </button>
        ) : <p className="flex-1 text-xs text-texto-3 self-center text-center">Somente leitura — seu nível de acesso não permite gravar.</p>}
      </div>
    </form>
  )
}
