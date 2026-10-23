import { rotuloFrequencia } from '../../lib/contratos/parcelas'
import { useState, useRef, useMemo } from 'react'
import { Info, X, History, AlertTriangle } from 'lucide-react'
import { publicarAgendaJa } from '../../lib/agendaFeedApi'
import { useApp } from '../../context/AppContext'
import { today, fmt, buildAccountSelectOptions } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { rotuloParcela } from '../../lib/numeroParcela'
import { computeFaturaRef } from '../../lib/fatura'
import { useIsMobile } from '../../hooks/useIsMobile'
import SearchableSelect from '../shared/SearchableSelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import TipoDocumentoSelect from '../shared/TipoDocumentoSelect'
import TransferenciaPerfisCategorias from '../shared/TransferenciaPerfisCategorias'
import { isTransferenciaEntrePerfis, categoriasEntrePerfis } from '../../lib/transferenciaPerfis'
import { tipoDocumentoObrigatorio } from '../../lib/tiposDocumento'
import EscopoSerieDialog from '../shared/EscopoSerieDialog'
import OcorrenciasRegistradas from './OcorrenciasRegistradas'
import { useGuardaFechamento } from '../shared/guardaFechamento'
import { HistoricoPainel } from '../shared/HistoricoPainel'
import {
  ESCOPO, diffCampos, precisaEscolherEscopo, planoAgendamento, planoRegistros, occCampos,
  mudancasDaSerie, agendamentoDoMotor, chaveSerieFinanciamento, irmasFinanciamento,
  agendamentoUnicoPendente, serieKeyDe, mensagemAplicada, conflitosProximas, normalizarCampo, edicaoDeOcorrencia,
} from '../../lib/camposSerie'
import { novoLoteId, linhasHistorico, itensPorEscopo } from '../../lib/historico'
import RateioModal from '../shared/RateioModal'
import DateInput from '../shared/DateInput'
import { filtrarCategoriasPorPerfil, categoriaDisponivelParaPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import { baixaNoPeriodo, mensagemConflitoPulo } from '../../lib/conflitoPeriodo'

const FREQUENCIES = [
  { value: 'once', label: 'Única' },
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

const FREQ_OPTIONS = FREQUENCIES.map(f => ({ id: f.value, label: f.label }))

const TIPS = {
  description: 'Nome ou identificação do lançamento recorrente. Ex: Aluguel, Salário, Parcela do carro.',
  transactionType: 'Define se é uma entrada de dinheiro (Receita) ou uma saída (Despesa).',
  account: 'Conta que será debitada ou creditada a cada ocorrência deste agendamento.',
  amount: 'Valor padrão por ocorrência. Cada data na prévia pode ter um valor diferente — clique para editar.',
  category: 'Classifica o tipo de gasto ou receita para relatórios e controle de orçamento.',
  payee: 'Pessoa ou empresa beneficiária do pagamento. Ex: Locadora, Empresa, Fornecedor.',
  frequency: 'Intervalo de repetição entre ocorrências: diário, semanal, mensal, anual etc.',
  startDate: 'Data da primeira ocorrência. As seguintes são calculadas automaticamente conforme a frequência.',
  nextOccurrence: 'Data da próxima ocorrência. Ao alterar, o sistema pergunta se vale só para esta ou também para as próximas.',
  occurrence: 'Contínua: repete indefinidamente. Parcelada: encerra após número fixo de vezes.',
  installments: 'Total de vezes que este lançamento se repetirá antes de ser encerrado automaticamente.',
  remindDaysBefore: 'Exibe um alerta no painel X dias antes do vencimento para que você não se esqueça.',
  autoRegister: 'Registra o lançamento automaticamente na data agendada, sem precisar confirmar manualmente.',
  sincronizarAgenda: 'Envia as ocorrências deste agendamento para a agenda assinada no celular (Agenda no celular). O calendário dentro do app mostra todos.',
  gerencial: 'Define como o dinheiro se move ao efetivar: G=débito direto; 1=reserva em poupança; 2..N=resgate de conta específica; D=só registra (já debitado).',
}

function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  const [rect, setRect] = useState(null)
  const ref = useRef(null)

  const handleEnter = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect())
    setShow(true)
  }

  return (
    <>
      <span
        ref={ref}
        className="ml-1.5 inline-flex items-center cursor-help"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        <Info size={12} className="text-texto-3 hover:text-texto-2 transition-colors" />
      </span>
      {show && rect && (
        <div
          style={{ position: 'fixed', left: rect.right + 8, top: rect.top - 6, zIndex: 9999 }}
          className="bg-surface border border-borda-forte text-texto-2 text-xs rounded-lg px-2.5 py-1.5 w-52 leading-snug shadow-2xl pointer-events-none"
        >
          {text}
        </div>
      )}
    </>
  )
}

function LabelTip({ children, tip, required }) {
  return (
    <label className="label">
      <span className="inline-flex items-center">
        {children}{required && ' *'}<Tooltip text={tip} />
      </span>
    </label>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-primary' : 'bg-borda-campo'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function OccEditModal({ originalDate, override, isSkipped, defaultAmount, baixaNoMes = null, onSave, onClose }) {
  const [date, setDate] = useState(override?.date || originalDate)
  const [amount, setAmount] = useState(String(override?.amount ?? defaultAmount))
  const [skip, setSkip] = useState(isSkipped || false)
  // Marcar "Pular" num mês que já tem baixa gravada com outra data (src/lib/conflitoPeriodo.js)
  // pede confirmação antes; Cancelar é o padrão.
  const [confirmandoPulo, setConfirmandoPulo] = useState(false)
  const alternarPulo = (marcar) => {
    if (marcar && baixaNoMes && !isSkipped) { setConfirmandoPulo(true); return }
    setSkip(marcar)
  }
  const fmtD = (d) => d.split('-').reverse().join('/')
  const stopEnter = (e) => { if (e.key === 'Enter') e.preventDefault() }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-64 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-texto-1">Ocorrência de {fmtD(originalDate)}</p>
          <button type="button" onClick={onClose} className="text-texto-3 hover:text-texto-2 p-0.5 rounded transition-colors">
            <X size={14} />
          </button>
        </div>

        <label className="flex items-center gap-2.5 mb-3.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skip}
            onChange={e => alternarPulo(e.target.checked)}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm text-texto-2">Pular esta ocorrência</span>
        </label>

        {confirmandoPulo && (
          <div role="alert" className="mb-3.5 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-xs space-y-2">
            <p className="text-texto-1">⚠ {mensagemConflitoPulo(baixaNoMes)}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={() => setConfirmandoPulo(false)}>Cancelar</button>
              <button type="button" className="btn-danger flex-1 text-xs py-1.5" onClick={() => { setSkip(true); setConfirmandoPulo(false) }}>Pular mesmo assim</button>
            </div>
          </div>
        )}

        {!skip && (
          <div className="space-y-2.5">
            <div>
              <label className="label">Nova data</label>
              <DateInput
                className="input"
                value={date}
                onChange={e => setDate(e.target.value)}
                onKeyDown={stopEnter}
              />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={stopEnter}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary flex-1 text-xs py-1.5"
            onClick={() => onSave({
              skip,
              date: skip ? originalDate : date,
              amount: skip ? defaultAmount : Number(amount),
            })}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function buildCatOpts(categories, type) {
  return categories
    .filter(c => !type || c.type === type || c.type === 'both')
    .map(c => ({ id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null }))
}


export default function ScheduleForm({ initial, onClose, onAviso }) {
  const { accounts, accountGroups, categories, payees, transactions, gerencialGroups, reserveFunctions, scheduleReservaFuncoes, addSchedule, updateSchedule, salvarFavorecidoDoAgendamento, addPayee, getNextOccurrences, rateiosByLancamento, saveRateiosFor, deleteRateiosFor, activeProfileId, categoryGroupOrder, schedules, registrarEdicao, temHistorico, pode, contratoPorId, registrarEventoContrato } = useApp()
  // Nível de acesso: criar = incluir; salvar edição = editar (sem permissão: só leitura).
  const podeGravarForm = pode('agendamentos', initial?.id ? 'editar' : 'incluir')

  // Detalhamento por função do resgate (schedule_reserva_funcoes) do agendamento em edição.
  // Quando presente, exibimos a árvore (somente leitura) e ocultamos o select único.
  const reservaDetalhe = useMemo(() => {
    if (!initial?.id) return []
    const funcName = new Map((reserveFunctions || []).map(f => [f.id, f.name]))
    // O detalhamento tem 1 linha por lançamento; agrupa por função (soma) para exibir 1 linha por função.
    const porFuncao = new Map()
    for (const srf of (scheduleReservaFuncoes || [])) {
      if (srf.scheduleId !== initial.id) continue
      porFuncao.set(srf.reservaFuncaoId, (porFuncao.get(srf.reservaFuncaoId) || 0) + (Number(srf.valor) || 0))
    }
    return [...porFuncao]
      .map(([funcId, valor]) => ({ name: funcName.get(funcId) || 'Função', valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
  }, [scheduleReservaFuncoes, reserveFunctions, initial])
  const hasReservaDetalhe = reservaDetalhe.length > 0

  // Rateio (divisão em categorias) — keyed pelo id do agendamento.
  const hadRateio = !!(initial?.id && (rateiosByLancamento?.get(initial.id)?.length > 0))
  const [rateioRows, setRateioRows] = useState(() =>
    initial?.id ? (rateiosByLancamento?.get(initial.id) || []).map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })) : []
  )
  const [showRateio, setShowRateio] = useState(false)
  const rateioTotal = rateioRows.reduce((s, r) => s + (Number(r.valor) || 0), 0)

  const sortedGerGrupos = [...gerencialGroups].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  })
  const grpD = gerencialGroups.find(g => g.number === 'D')

  // Versão VIVA do agendamento em edição (o estado do app) e, por cima dela, a série com as edições
  // de ocorrência feitas pela prévia e ainda NÃO salvas (`serieLocal`). A âncora, o diff e a base
  // do save partem de `serieBase`; nada vai para o banco antes do Salvar.
  const atual = (initial?.id && (schedules || []).find(s => s.id === initial.id)) || initial
  const [serieLocal, setSerieLocal] = useState(null)
  // Edições de ocorrência pela prévia pendentes (vão para o histórico no Salvar).
  const [edicoesChip, setEdicoesChip] = useState([]) // [{ occDate, mudancas, escopo, motivo }]
  const serieBase = serieLocal || atual
  // Âncora da série tal como está no banco (data ORIGINAL da ocorrência). Vazia num agendamento
  // novo; num já salvo sem âncora explícita, a primeira ocorrência futura.
  const ancoraDe = (sch) => sch?.nextOccurrence
    || (sch?.id ? (getNextOccurrences(sch, 24).find(d => d >= today()) || '') : '')
  const ancoraSalva = ancoraDe(serieBase)
  // O que o campo MOSTRA: a mesma âncora com a exceção da ocorrência aplicada. Com a ocorrência
  // de 10/09 movida para 13/09, a âncora salva continua 10/09 e o campo exibe 13/09 — que é a
  // data em que a parcela realmente cai, e a que a tela inicial já mostrava.
  const ancoraExibida = (ancoraSalva && serieBase) ? occEfetiva(serieBase, ancoraSalva).date : ancoraSalva
  // Só o que o usuário digitar aqui re-ancora a série. Sem esta flag, reabrir o formulário e
  // salvar qualquer outro campo gravaria a data EXIBIDA como âncora nova (o submit faz
  // `data = { ...form }`) e deslocaria a série inteira sem ninguém pedir.
  const [ancoraTocada, setAncoraTocada] = useState(false)

  // ── Regra única de séries (lib/camposSerie.js) ────────────────────────────────────────────
  // Recorrente (A/B/C): UM agendamento; o formulário edita a ocorrência da "Data de Vencimento
  // Atual" e, por isso, mostra os campos da PARCELA dela (com o override "Só esta" aplicado).
  // Financiamento (F): parcelas são agendamentos separados ligados pela conta da dívida.
  // Motor da fatura (I): fora da regra — só o aviso de que pode ser sobrescrito.
  const ehMotor = !!initial?.id && agendamentoDoMotor(initial)
  const ehFinanciamento = !!initial?.id && !!chaveSerieFinanciamento(initial)
  const ehRecorrente = !!initial?.id && !ehMotor && !ehFinanciamento && (initial.frequency || 'once') !== 'once'
  const occInicial = ehRecorrente && ancoraSalva ? occCampos(serieBase, ancoraSalva) : null
  // Parcela de contrato (src/lib/contratos): frequência, ocorrência e data-base (competência) são do
  // contrato. O vencimento muda pela exceção da ocorrência (overrides[data-base].date), como na
  // parcela de financiamento — a baixa continua casando com a data-base.
  const ehParcelaContrato = !!initial?.id && !!initial.contratoId && (initial.frequency || 'once') === 'once'
  const vencInicial = ehParcelaContrato ? occEfetiva(serieBase, serieBase.startDate).date : null
  const [vencTocado, setVencTocado] = useState(false)
  const [escopoPendente, setEscopoPendente] = useState(null) // { mudancas, nProximas, nPendentes, conflitos }
  // Edição de uma ocorrência pela prévia aguardando o "aplicar às próximas?".
  const [chipPendente, setChipPendente] = useState(null) // { occDate, mudancas, nProximas, nPendentes, conflitos }
  const [verHistorico, setVerHistorico] = useState(false)

  const [form, setForm] = useState(() => ({
    description: (occInicial ? occInicial.description : initial?.description) || '',
    transactionType: initial?.transactionType || 'expense',
    accountId: (occInicial ? occInicial.accountId : initial?.accountId) || accounts[0]?.id || '',
    toAccountId: initial?.toAccountId || '',
    reservaExpenseCategoryId: initial?.reservaExpenseCategoryId || '',
    reservaFuncaoId: initial?.reservaFuncaoId || '',
    amount: (occInicial ? occInicial.amount : initial?.amount) ?? '',
    categoryId: (occInicial ? occInicial.categoryId : initial?.categoryId) || '',
    // Transferência entre perfis: categoria na visão do CNPJ e na do CPF (campos da parcela).
    categoriaCnpjId: (occInicial ? occInicial.categoriaCnpjId : initial?.categoriaCnpjId) || '',
    categoriaCpfId: (occInicial ? occInicial.categoriaCpfId : initial?.categoriaCpfId) || '',
    payee: initial?.payee || '',
    costCenter: (occInicial ? occInicial.costCenter : initial?.costCenter) || '',
    frequency: initial?.frequency || '',
    startDate: initial?.startDate || today(),
    // Data de Vencimento Atual: re-ancora a série. O campo EXIBE a data efetiva (com a exceção
    // aplicada, quando existe) — ver `ancoraExibida`. A âncora realmente salva é `ancoraSalva`,
    // e só substitui a atual se este campo for editado à mão.
    nextOccurrence: ancoraExibida,
    occurrenceType: initial?.occurrenceType || 'continuous',
    installments: initial?.installments ?? 0,
    remindDaysBefore: initial?.remindDaysBefore ?? 3,
    autoRegister: initial?.autoRegister ?? true,
    sincronizarAgenda: initial?.sincronizarAgenda !== false,
    grupoGerencial: (occInicial ? occInicial.grupoGerencial : initial?.grupoGerencial) || null,
    skipped: initial?.skipped || [],
    overrides: initial?.overrides || {},
    tipoDocumentoId: initial?.tipoDocumentoId || '',
  }))
  // Tipo de documento: obrigatório só ao CRIAR despesa/receita; na edição pode ficar vazio.
  const [erroTipoDoc, setErroTipoDoc] = useState('')
  const tipoDocObrigatorio = tipoDocumentoObrigatorio({ criando: !initial?.id, tipoMov: form.transactionType })

  const [editingOcc, setEditingOcc] = useState(null)
  // Edição de ocorrência pendente (não salva) → Cancelar/X perguntam antes de descartar.
  const podeDescartar = () => edicoesChip.length === 0 || window.confirm('Descartar alterações não salvas?')
  useGuardaFechamento(podeDescartar)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // Tipo/contas mudaram: se a transferência deixou de ser entre perfis, o bloco some e as duas
  // categorias por visão são limpas (não ficam gravadas escondidas).
  const accById = (id) => accounts.find(a => a.id === id)
  const entrePerfis = (f) => f.transactionType === 'transfer' && isTransferenciaEntrePerfis(accById(f.accountId), accById(f.toAccountId))
  const setContas = (patch) => setForm(f => {
    const n = { ...f, ...patch }
    return entrePerfis(n) ? n : { ...n, categoriaCnpjId: '', categoriaCpfId: '' }
  })
  // O que se grava: as duas só valem em transferência entre perfis (senão null).
  const categoriasPerfisDe = (f) => f.transactionType === 'transfer'
    ? categoriasEntrePerfis(accById(f.accountId), accById(f.toAccountId), f)
    : { categoriaCnpjId: null, categoriaCpfId: null }

  const selectedAccount = accounts.find(a => a.id === form.accountId)

  // Função de reserva para DESPESA em cartão de crédito com grupo gerencial NUMERADO (2..N —
  // CA, Phlo, Impr etc.; não G, não reserva(1), não D). Pré-define de qual bucket sairá o
  // resgate quando o agendamento for executado. Mesmo padrão do TransactionForm (grupo numerado).
  const isCredit = selectedAccount?.type === 'credit'
  const schGerGrupo = gerencialGroups.find(g => g.id === form.grupoGerencial) || null
  const isNumberedGerencial = typeof schGerGrupo?.number === 'number' && schGerGrupo.number !== 1
  const reservaGroupFuncs = useMemo(
    () => (isNumberedGerencial && schGerGrupo?.defaultAccountId)
      ? (reserveFunctions || []).filter(f => f.accountId === schGerGrupo.defaultAccountId).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.name.localeCompare(b.name))
      : [],
    [isNumberedGerencial, schGerGrupo, reserveFunctions]
  )
  // Só exibe o select quando o grupo numerado tem MAIS DE 1 função (com 1 única, usa-se
  // automaticamente a conta do grupo, sem select).
  const showFuncaoReserva = form.transactionType === 'expense' && isCredit && isNumberedGerencial && reservaGroupFuncs.length > 1
  const reservaGroupAccount = showFuncaoReserva && schGerGrupo?.defaultAccountId
    ? accounts.find(a => a.id === schGerGrupo.defaultAccountId)
    : null

  // Fatura a que a Data de Vencimento Atual pertence (só despesa em cartão de crédito).
  // Recalcula automaticamente quando muda a conta (closingDay) ou a data.
  const faturaCalculada = form.transactionType === 'expense' && isCredit && form.nextOccurrence && selectedAccount?.closingDay
    ? computeFaturaRef(new Date(form.nextOccurrence + 'T12:00:00'), selectedAccount.closingDay)
    : null

  const schToAcc = form.transactionType === 'transfer' ? accounts.find(a => a.id === form.toAccountId) : null
  const schFromAcc = form.transactionType === 'transfer' ? accounts.find(a => a.id === form.accountId) : null
  const schIsDepositToReserva = !!schToAcc?.isReserva
  const schIsWithdrawFromReserva = !!schFromAcc?.isReserva
  const schReservaAcc = schIsDepositToReserva ? schToAcc : schIsWithdrawFromReserva ? schFromAcc : null
  const schNeedsReservaCategorySelect = !!schReservaAcc && schReservaAcc.reservaType === 'geral'
  const schReservaLinkedCat = schReservaAcc?.reservaType === 'especifica'
    ? categories.find(c => c.id === schReservaAcc.reservaCategoryId)
    : null
  // Funções de reserva da conta envolvida (depósito/resgate reserva)
  const reservaFuncoesDaConta = useMemo(
    () => schReservaAcc
      ? (reserveFunctions || []).filter(f => f.accountId === schReservaAcc.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.name.localeCompare(b.name))
      : [],
    [reserveFunctions, schReservaAcc]
  )

  // Options for SearchableSelect fields
  const isMobile = useIsMobile()
  const accountOpts = useMemo(() => buildAccountSelectOptions(accounts, accountGroups, { isMobile }), [accounts, accountGroups, isMobile])
  const destAccountOpts = useMemo(() => buildAccountSelectOptions(accounts, accountGroups, { excludeId: form.accountId, isMobile }), [accounts, accountGroups, form.accountId, isMobile])
  // Categorias por perfil: o da conta do agendamento (se tiver perfil), senão o chip do topo. As
  // categorias já gravadas ficam na lista mesmo sendo de outro perfil.
  const perfilCategorias = perfilParaCategorias(accounts, form.accountId, activeProfileId)
  const categoriasDoPerfil = useMemo(
    () => ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilCategorias, [form.categoryId, form.reservaExpenseCategoryId]), categoryGroupOrder),
    [categories, perfilCategorias, form.categoryId, form.reservaExpenseCategoryId, categoryGroupOrder]
  )
  const categoriaForaDoPerfil = !!form.categoryId
    && !categoriaDisponivelParaPerfil(categories.find(c => c.id === form.categoryId), perfilCategorias)
  const categoryOpts = useMemo(() => buildCatOpts(categoriasDoPerfil, form.transactionType === 'transfer' ? null : form.transactionType), [categoriasDoPerfil, form.transactionType])
  const expenseCatOpts = useMemo(() => buildCatOpts(categoriasDoPerfil, 'expense'), [categoriasDoPerfil])

  const sortedPayees = useMemo(() => {
    const counts = {}
    for (const tx of transactions) {
      if (tx.payee) counts[tx.payee] = (counts[tx.payee] || 0) + 1
    }
    return [...new Set([...payees])].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  }, [transactions, payees])

  const previewSchedule = {
    ...form,
    // A prévia é gerada a partir da âncora SALVA, não da exibida. As datas que ela produz são as
    // ORIGINAIS — chaves de overrides/skipped e do que o fluxo de caixa usa. Cada célula EXIBE a
    // data e o valor EFETIVOS (occEfetiva), a mesma fonte do Fluxo/Fatura.
    nextOccurrence: ancoraTocada ? form.nextOccurrence : ancoraSalva,
    // Valor da SÉRIE: num recorrente salvo, o campo Valor mostra a ocorrência da âncora (que pode
    // ter exceção própria), então a série vem do agendamento.
    amount: ehRecorrente ? (Number(serieBase.amount) || 0) : (Number(form.amount) || 0),
    // As registradas reais: num parcelado, o motor conta as já consumidas antes da âncora para
    // saber quantas faltam — com [] a prévia do TV PAPAI (4 de 8 pagas) listava 8 datas futuras.
    // As puladas seguem fora ([]), para continuarem aparecendo como chip "Pulado".
    registered: initial?.id ? (serieBase?.registered || []) : [],
    skipped: [],
  }
  const preview = form.startDate && form.frequency ? getNextOccurrences(previewSchedule, 12) : []
  // "x/N" de cada card: com as puladas REAIS do formulário (pulada consome a posição).
  const scheduleParcela = { ...previewSchedule, installments: Number(form.installments) || 0, skipped: form.skipped }

  // Valor efetivo da próxima ocorrência do agendamento já salvo (respeita override individual).
  // Mostrado abaixo do campo Valor quando difere do valor base, para o usuário saber que a
  // próxima ocorrência tem valor diferente.
  const nextOccDate = serieBase?.id ? (getNextOccurrences(serieBase, 1)[0] || null) : null
  const nextOccAmount = nextOccDate ? Number(occEfetiva(serieBase, nextOccDate).amount) : null
  const hasNextDiff = nextOccDate != null && nextOccAmount !== (Number(serieBase?.amount) || 0)

  // Edição de uma ocorrência pela PRÉVIA (chip). Data e valor passam pela MESMA regra do formulário:
  // pendentes depois desta → pergunta "aplicar às próximas?"; o plano é o planoAgendamento. Tudo
  // fica PENDENTE no formulário (a prévia já mostra) e só é gravado no Salvar, com o histórico.
  // A fonte inclui os pulos/exceções locais do formulário, para nenhum se perder entre edições.
  const fonteOcorrencias = () => (initial?.id
    ? { ...serieBase, skipped: form.skipped, overrides: form.overrides }
    : { ...previewSchedule, registered: [], skipped: form.skipped })
  const handleSaveOccurrence = (changes) => {
    const occDate = editingOcc
    setEditingOcc(null)
    const eraPulada = form.skipped.includes(occDate)
    if (changes.skip || eraPulada) {
      setForm(f => ({
        ...f,
        skipped: changes.skip ? [...f.skipped.filter(d => d !== occDate), occDate] : f.skipped.filter(d => d !== occDate),
        overrides: changes.skip ? Object.fromEntries(Object.entries(f.overrides).filter(([k]) => k !== occDate)) : f.overrides,
      }))
      if (changes.skip) return
    }
    const fonte = fonteOcorrencias()
    const pendentes = getNextOccurrences(fonte, 400)
    const { mudancas, perguntar, nProximas, conflitos } = edicaoDeOcorrencia(fonte, occDate, changes, pendentes)
    if (!mudancas.length) return
    if (perguntar) {
      setChipPendente({ occDate, mudancas, nProximas, nPendentes: pendentes.length, conflitos })
      return
    }
    aplicarEdicaoOcorrencia(occDate, mudancas, { escopo: ESCOPO.PARCELA })
  }

  const aplicarEdicaoOcorrencia = async (occDate, mudancas, decisao) => {
    const fonte = fonteOcorrencias()
    const escopo = decisao?.escopo || ESCOPO.PARCELA
    const motivo = decisao?.motivo || null
    const plano = planoAgendamento(fonte, {
      occDate, mudancas, escopo,
      pendentes: getNextOccurrences(fonte, 400), proximasDoNovo: s => getNextOccurrences(s, 400),
    })
    const novo = plano.schedule
    if (initial?.id) {
      setSerieLocal(novo)
      setEdicoesChip(l => [...l, { occDate, mudancas, escopo, motivo }])
      // Espelha no formulário: exceções, pulos e, se o usuário não mexeu nos campos, a data e o
      // valor exibidos da âncora (para o diff do save não ver mudança que não foi digitada).
      const ancoraNova = ancoraDe(novo)
      setForm(f => ({
        ...f,
        overrides: novo.overrides,
        skipped: novo.skipped || [],
        ...(!ancoraTocada && ancoraNova ? { nextOccurrence: occEfetiva(novo, ancoraNova).date } : {}),
        ...(ancoraNova && normalizarCampo('amount', f.amount) === normalizarCampo('amount', camposAntes?.amount)
          ? { amount: occCampos(novo, ancoraNova).amount } : {}),
      }))
      return
    }
    // Agendamento novo (ainda sem id): tudo fica no formulário até salvar.
    const reancorou = novo.nextOccurrence !== fonte.nextOccurrence
    setForm(f => ({
      ...f,
      overrides: novo.overrides,
      skipped: novo.skipped || [],
      ...(escopo !== ESCOPO.PARCELA && mudancas.some(m => m.campo === 'amount') ? { amount: novo.amount } : {}),
      ...(reancorou ? { nextOccurrence: novo.nextOccurrence } : {}),
    }))
    if (reancorou) setAncoraTocada(true)
  }

  // Campos rastreados (valor, data, categoria, descrição, conta, centro de custo, grupo, favorecido,
  // tipo) ANTES e DEPOIS — base do diff da regra de séries e do histórico. A data só entra se o
  // campo foi tocado (o mesmo critério que já protegia a âncora).
  const camposAntes = serieBase?.id ? {
    amount: occInicial ? occInicial.amount : serieBase.amount,
    date: (ehParcelaContrato ? vencInicial : ancoraExibida) || null,
    categoryId: (occInicial ? occInicial.categoryId : serieBase.categoryId) || null,
    categoriaCnpjId: (occInicial ? occInicial.categoriaCnpjId : serieBase.categoriaCnpjId) || null,
    categoriaCpfId: (occInicial ? occInicial.categoriaCpfId : serieBase.categoriaCpfId) || null,
    description: (occInicial ? occInicial.description : serieBase.description) || null,
    accountId: (occInicial ? occInicial.accountId : serieBase.accountId) || null,
    costCenter: (occInicial ? occInicial.costCenter : serieBase.costCenter) || null,
    grupoGerencial: (occInicial ? occInicial.grupoGerencial : serieBase.grupoGerencial) || null,
    payee: serieBase.payee || null,
    tipoDocumentoId: serieBase.tipoDocumentoId || null,
  } : null
  const camposDoForm = (f) => ({
    amount: Number(f.amount),
    ...(ehParcelaContrato
      ? (vencTocado ? { date: f.overrides?.[f.startDate]?.date || f.startDate } : {})
      : (ancoraTocada ? { date: f.nextOccurrence || null } : {})),
    categoryId: f.categoryId || null,
    ...categoriasPerfisDe(f),
    description: f.description || null,
    accountId: f.accountId || null,
    costCenter: f.costCenter || null,
    grupoGerencial: f.grupoGerencial || null,
    payee: f.payee || null,
    tipoDocumentoId: f.tipoDocumentoId || null,
  })
  const mudancasAoVivo = camposAntes ? diffCampos(camposAntes, camposDoForm(form)) : []
  const avisoMotor = ehMotor && mudancasAoVivo.some(m => m.campo !== 'tipoDocumentoId')

  const contextoSerie = () => {
    if (ehRecorrente) {
      const pendentes = getNextOccurrences(serieBase, 400)
      const occDate = ancoraSalva || pendentes[0]
      return { tipo: 'A', occDate, pendentes, nProximas: pendentes.filter(d => d > occDate).length, nPendentes: pendentes.length }
    }
    // Parcela de contrato: as irmãs são as outras parcelas do mesmo contrato e papel (mesma regra de
    // registros separados da parcela de financiamento — "Só esta" / "Esta e as próximas").
    if (ehParcelaContrato) {
      const irmas = (schedules || []).filter(s => s.id !== initial.id && s.contratoId === initial.contratoId
        && s.contratoPapel === initial.contratoPapel && (s.frequency || 'once') === 'once')
      const pend = irmas.filter(agendamentoUnicoPendente)
      return { tipo: 'F', irmas, nProximas: pend.filter(s => (s.startDate || '') > (initial.startDate || '')).length, nPendentes: pend.length + 1 }
    }
    if (ehFinanciamento) {
      const irmas = irmasFinanciamento(initial, schedules)
      const pend = irmas.filter(agendamentoUnicoPendente)
      return { tipo: 'F', irmas, nProximas: pend.filter(s => (s.startDate || '') > (initial.startDate || '')).length, nPendentes: pend.length + 1 }
    }
    return { tipo: 'simples', nProximas: 0, nPendentes: 1 }
  }

  // Aplica a edição de um agendamento EXISTENTE pela regra única e registra o histórico (mesma
  // transação: POST /api/historico). Devolve false se algo impediu salvar.
  const salvarEdicao = async (data, mudancas, ctx, decisao) => {
    const loteId = novoLoteId()
    const motivo = decisao?.motivo || null
    const serieKey = serieKeyDe({ agendamento: initial })
    let finais
    let entradas
    let nAfetadas = 1
    let escopoParcela = decisao?.escopo || (ctx.nProximas > 0 ? ESCOPO.PARCELA : ESCOPO.PROXIMAS)

    if (ctx.tipo === 'A') {
      // Estrutura do formulário (frequência, parcelas, prévia…) + campos rastreados ainda com o
      // valor da SÉRIE; o plano decide override × agendamento base.
      // registered/registeredMeta vêm SEMPRE do estado vivo: um "Vincular" feito no histórico
      // enquanto havia edição de ocorrência pendente não pode ser desfeito pelo save.
      const base = {
        ...serieBase, ...data, nextOccurrence: ancoraSalva,
        registered: atual.registered, registeredMeta: atual.registeredMeta,
        amount: serieBase.amount, categoryId: serieBase.categoryId, description: serieBase.description,
        categoriaCnpjId: serieBase.categoriaCnpjId || null, categoriaCpfId: serieBase.categoriaCpfId || null,
        accountId: serieBase.accountId, accountType: serieBase.accountType, costCenter: serieBase.costCenter,
        grupoGerencial: serieBase.grupoGerencial, payee: serieBase.payee, tipoDocumentoId: serieBase.tipoDocumentoId,
      }
      const plano = planoAgendamento(base, {
        occDate: ctx.occDate, mudancas, escopo: escopoParcela,
        pendentes: getNextOccurrences(base, 400), proximasDoNovo: s => getNextOccurrences(s, 400),
      })
      const final = { ...plano.schedule, accountType: accounts.find(a => a.id === plano.schedule.accountId)?.type || plano.schedule.accountType }
      updateSchedule(initial.id, final)
      finais = [final]
      nAfetadas = plano.afetadas.length || 1
      if (ctx.nProximas === 0) escopoParcela = ESCOPO.PARCELA
      entradas = [{ id: initial.id, ocorrenciaData: escopoParcela === ESCOPO.PARCELA ? ctx.occDate : null, mudancas }]
    } else if (ctx.tipo === 'F') {
      // Favorecido: endpoint do financiamento (só parcelas PENDENTES + histórico no mesmo lote).
      const mPayee = mudancasDaSerie(mudancas).find(m => m.campo === 'payee')
      let nPayee = 0
      if (mPayee) {
        try {
          nPayee = (await salvarFavorecidoDoAgendamento(initial.id, mPayee.para || '', { loteId, motivo })).total
        } catch (err) {
          onAviso?.(`Não foi possível sincronizar o favorecido: ${err.message}`, 'error')
          return false
        }
      }
      const outras = mudancas.filter(m => m.campo !== 'payee')
      const vista = (s) => ({ ...s, date: occEfetiva(s, s.startDate).date })
      const plano = planoRegistros(vista(initial), {
        mudancas: outras, escopo: escopoParcela, irmas: ctx.irmas.map(vista),
        ehPendente: agendamentoUnicoPendente, ordem: s => s.startDate || '',
      })
      updateSchedule(initial.id, data)
      finais = [{ ...initial, ...data }]
      for (const p of plano.slice(1)) {
        const s = ctx.irmas.find(x => x.id === p.id)
        const ch = { ...p.changes }
        // Data de uma parcela de financiamento vira exceção da ocorrência: a baixa registra a data
        // ORIGINAL do vencimento, que assim continua casando.
        if ('date' in ch) {
          ch.overrides = { ...(s.overrides || {}), [s.startDate]: { ...(s.overrides?.[s.startDate] || {}), date: ch.date } }
          delete ch.date
        }
        updateSchedule(s.id, ch)
        finais.push({ ...s, ...ch })
      }
      nAfetadas = Math.max(plano.length, nPayee)
      if (ctx.nProximas === 0) escopoParcela = ESCOPO.PARCELA
      entradas = [{ ...plano[0], mudancas: outras }, ...plano.slice(1)]
    } else {
      updateSchedule(initial.id, data)
      finais = [{ ...initial, ...data }]
      escopoParcela = ESCOPO.PARCELA
      entradas = [{ id: initial.id, mudancas }]
    }

    // Edições de ocorrência pela prévia (pendentes até agora): cada uma com o seu escopo, no mesmo lote.
    const historicoChip = edicoesChip.flatMap(e => linhasHistorico({
      entidade: 'agendamento', serieKey, loteId, motivo: e.motivo || motivo,
      itens: itensPorEscopo([{ id: initial.id, ocorrenciaData: e.escopo === ESCOPO.PARCELA ? e.occDate : null, mudancas: e.mudancas }], e.escopo),
    }))
    const historico = [
      ...historicoChip,
      ...linhasHistorico({ entidade: 'agendamento', itens: itensPorEscopo(entradas, escopoParcela), serieKey, loteId, motivo }),
    ]
    if (historico.length) {
      try {
        await registrarEdicao({ agendamentos: finais, historico, loteId, motivo })
      } catch (err) {
        onAviso?.(`Alteração salva, mas o histórico não foi registrado: ${err.message}`, 'error')
        return true
      }
    }
    if (mudancas.length) {
      onAviso?.(ctx.tipo === 'simples' ? 'Alteração salva. Histórico registrado.' : mensagemAplicada(nAfetadas))
    } else if (historicoChip.length) {
      onAviso?.('Alterações salvas. Histórico registrado.')
    }
    return true
  }

  const handleSubmit = async (e, decisao = null) => {
    if (!podeGravarForm) { e?.preventDefault?.(); return }
    e?.preventDefault?.()
    if (!form.description || !form.amount || !form.accountId || !form.frequency) return
    if (form.frequency !== 'once' && form.occurrenceType === 'installment' && Number(form.installments) < 1) return
    if (form.transactionType === 'transfer' && !form.toAccountId) return
    if (form.transactionType === 'transfer' && schNeedsReservaCategorySelect && !form.reservaExpenseCategoryId) return
    if (tipoDocObrigatorio && !form.tipoDocumentoId) { setErroTipoDoc('Selecione o tipo de documento.'); return }
    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)
    const data = {
      ...form,
      // Escolha manual (inclusive "Sem tipo") é o que fica gravado — vence o fallback de exibição.
      tipoDocumentoId: form.tipoDocumentoId || null,
      ...categoriasPerfisDe(form),
      // A âncora só muda se o campo foi editado. Ele EXIBE a data efetiva (com a exceção), e
      // salvar isso de volta re-ancoraria a série a cada save de qualquer outro campo.
      nextOccurrence: ancoraTocada ? form.nextOccurrence : ancoraSalva,
      amount: Number(form.amount),
      accountType: selectedAccount?.type,
      installments: Number(form.installments),
      remindDaysBefore: Number(form.remindDaysBefore) || 0,
    }
    // Criar vs editar se decide pelo `id`, NÃO pela presença de `initial`: o DuplicateButton
    // ("Duplicar → Criar Agendamento") passa um `initial` só com os campos pré-preenchidos do
    // lançamento de origem, sem id. Com `if (initial)` isso caía em updateSchedule(undefined, …),
    // que não casa com nenhum agendamento — o modal fechava e nada era criado, sem erro.
    let schedId = initial?.id
    if (schedId) {
      // Regra única de séries: campo da PARCELA mudou e há pendentes depois → pergunta o escopo.
      const mudancas = diffCampos(camposAntes, camposDoForm(form))
      const ctx = contextoSerie()
      if (!decisao && precisaEscolherEscopo(mudancas, ctx.nProximas)) {
        setEscopoPendente({
          mudancas, nProximas: ctx.nProximas, nPendentes: ctx.nPendentes, ocorrencia: ctx.tipo === 'A',
          conflitos: ctx.tipo === 'A' ? conflitosProximas(serieBase, { occDate: ctx.occDate, mudancas, pendentes: ctx.pendentes }) : [],
        })
        return
      }
      // Parcela de financiamento: o favorecido vale para o financiamento e as parcelas PENDENTES —
      // o endpoint vai ANTES do updateSchedule (falha não deixa o estado com um favorecido que o
      // banco não tem).
      const ok = await salvarEdicao(data, mudancas, ctx, decisao)
      if (!ok) return
      // Parcela de contrato editada à mão: evento na linha do tempo do contrato (antes/depois).
      if (ehParcelaContrato && mudancas.length) {
        registrarEventoContrato?.(initial.contratoId, {
          tipo: 'edicao_parcela',
          detalhes: {
            acao: 'edicao', parcela_id: initial.id, vencimento: initial.startDate, papel: initial.contratoPapel,
            escopo: decisao?.escopo || 'parcela', campos: Object.fromEntries(mudancas.map(m => [m.campo, { de: m.de ?? null, para: m.para ?? null }])),
          },
        }).catch(err => console.warn('[contratos] evento de edição não gravado:', err.message))
      }
    } else {
      schedId = addSchedule(data)
    }
    // Rateio do agendamento (apenas receita/despesa).
    if (form.transactionType !== 'transfer' && schedId) {
      if (rateioRows.length > 0) saveRateiosFor(schedId, rateioRows)
      else if (hadRateio) deleteRateiosFor(schedId)
    }
    // Agenda no celular: mudou o que vai para o feed → envia já.
    if ((initial?.sincronizarAgenda !== false) !== form.sincronizarAgenda) publicarAgendaJa()
    onClose()
  }

  if (verHistorico && initial?.id) {
    return <HistoricoPainel entidade="agendamento" entidadeId={initial.id} serieKey={serieKeyDe({ agendamento: initial })} onVoltar={() => setVerHistorico(false)} />
  }
  if (chipPendente) {
    return (
      <EscopoSerieDialog
        variante="ocorrencia"
        continua={form.occurrenceType === 'continuous'}
        mudancas={chipPendente.mudancas}
        nProximas={chipPendente.nProximas}
        nPendentesSerie={chipPendente.nPendentes}
        conflitos={chipPendente.conflitos}
        onCancel={() => setChipPendente(null)}
        onConfirm={(decisao) => { const c = chipPendente; setChipPendente(null); aplicarEdicaoOcorrencia(c.occDate, c.mudancas, decisao) }}
      />
    )
  }
  if (escopoPendente) {
    return (
      <EscopoSerieDialog
        variante={escopoPendente.ocorrencia ? 'ocorrencia' : undefined}
        continua={form.occurrenceType === 'continuous'}
        conflitos={escopoPendente.conflitos}
        mudancas={escopoPendente.mudancas}
        nProximas={escopoPendente.nProximas}
        nPendentesSerie={escopoPendente.nPendentes}
        onCancel={() => setEscopoPendente(null)}
        onConfirm={(decisao) => { setEscopoPendente(null); handleSubmit(null, decisao) }}
      />
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        {initial?.id && (
          <div className="col-span-2 flex items-center justify-end -mb-2">
            <button type="button" onClick={() => setVerHistorico(true)} className="text-xs text-texto-2 hover:text-texto-1 flex items-center gap-1.5" title="Histórico de alterações">
              <History size={13} /> Histórico
              {temHistorico('agendamento', initial.id) && <span className="w-1.5 h-1.5 rounded-full bg-primary-fg" />}
            </button>
          </div>
        )}
        {avisoMotor && (
          <div className="col-span-2 flex items-start gap-2 text-xs text-aviso bg-aviso/10 border border-aviso/30 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Este agendamento é recalculado pelo motor da fatura; alterações manuais podem ser sobrescritas
          </div>
        )}
        {showRateio && (
          <RateioModal
            total={Number(form.amount) || rateioTotal || 0}
            categories={categories}
            perfilId={perfilCategorias}
            categoryType={form.transactionType === 'income' ? 'income' : form.transactionType === 'expense' ? 'expense' : null}
            initial={rateioRows}
            onSave={rs => { setRateioRows(rs); setShowRateio(false) }}
            onDeleteAll={() => { setRateioRows([]); setShowRateio(false) }}
            onClose={() => setShowRateio(false)}
          />
        )}

        {/* Movimentação */}
        <div className="col-span-2">
          <LabelTip tip={TIPS.transactionType}>Movimentação</LabelTip>
          <div className="flex rounded-lg overflow-hidden border border-borda-forte">
            {['expense', 'income', 'transfer'].map(t => (
              <button
                type="button"
                key={t}
                onClick={() => setContas({ transactionType: t })}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  form.transactionType === t
                    ? t === 'income' ? 'bg-receita text-page'
                    : t === 'transfer' ? 'bg-transferencia text-page'
                    : 'bg-despesa text-page'
                    : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
                }`}
              >
                {t === 'income' ? 'Receita' : t === 'transfer' ? 'Transferência' : 'Despesa'}
              </button>
            ))}
          </div>
        </div>

        {/* Descrição */}
        <div className="col-span-2">
          <LabelTip tip={TIPS.description} required>Descrição</LabelTip>
          <input
            className="input"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Ex: Aluguel, Salário..."
            required
            readOnly={ehFinanciamento}
          />
          {ehFinanciamento && <p className="text-[11px] text-texto-3 mt-1">Parcela de financiamento: a descrição do lançamento vem do bem ("Parcela n/N"), por isso não é editável aqui.</p>}
        </div>

        {/* Conta */}
        <div>
          <LabelTip tip={TIPS.account} required>{form.transactionType === 'transfer' ? 'Conta Origem' : 'Conta'}</LabelTip>
          <SearchableSelect
            options={accountOpts}
            value={form.accountId}
            onChange={id => setContas({ accountId: id, reservaFuncaoId: '' })}
            placeholder="Selecione a conta..."
            preserveGroupOrder
            ungroupedLast
            required
          />
        </div>

        {/* Valor */}
        <div>
          <LabelTip tip={TIPS.amount} required>Valor (R$)</LabelTip>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="0,00"
            required
            readOnly={ehFinanciamento}
          />
          {ehFinanciamento && <p className="text-[11px] text-texto-3 mt-1">O pagamento usa principal + juros da parcela; o valor não é editável aqui.</p>}
          {hasNextDiff && !occInicial && (
            <p className="text-xs text-texto-2 mt-1">Próximo vencimento: {fmt(nextOccAmount)}</p>
          )}
          {/* Divisão do valor em categorias. Mesmo padrão da listagem (SchedulePanel).
              Fica AQUI, colada no valor, e não junto do editor de rateio, porque o editor
              inteiro está atrás de `transactionType !== 'transfer'` — e a parcela de
              financiamento é uma transferência (conta corrente → conta de dívida). Era por isso
              que o modal dela mostrava só o total: a divisão existia e não tinha onde aparecer. */}
          {rateioRows.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-texto-3">Divisão</p>
              <ul className="mt-1 space-y-0.5">
                {rateioRows.map((r, i) => {
                  const catRateio = categories.find(c => c.id === r.categoriaId)
                  return (
                    <li key={i} className="text-[11px] text-texto-3 flex items-center gap-1">
                      <span className="text-texto-3">{i === rateioRows.length - 1 ? '└' : '├'}</span>
                      <span className="truncate flex-1">
                        {r.descricao || catRateio?.name || 'Rateio'}
                        {catRateio ? ` · ${catRateio.icon} ${catRateio.name}` : ''}
                      </span>
                      <span className="text-texto-2 font-medium">{fmt(r.valor)}</span>
                    </li>
                  )
                })}
              </ul>
              {form.transactionType === 'transfer' && (
                // Somente leitura de propósito: o submit só grava rateio quando não é
                // transferência, então um campo editável aqui seria descartado no Salvar. Na
                // parcela de financiamento os valores vêm do próprio financiamento (principal e
                // juros da parcela) — editá-los à mão faria a previsão discordar da parcela.
                <p className="text-[11px] text-texto-3 mt-1.5">
                  Somente leitura — vem do financiamento da parcela.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Conta Destino (apenas para transferências) */}
        {form.transactionType === 'transfer' && (
          <div className="col-span-2">
            <LabelTip tip="Conta que receberá a transferência" required>Conta Destino</LabelTip>
            <SearchableSelect
              options={destAccountOpts}
              value={form.toAccountId}
              onChange={id => setContas({ toAccountId: id, reservaExpenseCategoryId: '' })}
              placeholder="Selecione a conta destino..."
              preserveGroupOrder
              ungroupedLast
              required
            />
          </div>
        )}

        {/* Transferência entre perfis (CPF↔CNPJ): categoria em cada visão. Mesmo bloco do Novo Lançamento. */}
        {entrePerfis(form) && (
          <div className="col-span-2">
            <TransferenciaPerfisCategorias
              fromAccount={schFromAcc}
              toAccount={schToAcc}
              categoriaCnpjId={form.categoriaCnpjId}
              categoriaCpfId={form.categoriaCpfId}
              onChangeCnpj={id => set('categoriaCnpjId', id || '')}
              onChangeCpf={id => set('categoriaCpfId', id || '')}
            />
          </div>
        )}

        {/* Reserva category — quando transferência envolve conta reserva */}
        {form.transactionType === 'transfer' && (schIsDepositToReserva || schIsWithdrawFromReserva) && (
          <div className="col-span-2 p-3 bg-reserva-bg border border-reserva/30 rounded-lg space-y-2">
            <p className="text-xs font-medium text-reserva">
              📂 {schIsDepositToReserva ? 'Despesa a classificar' : 'Categoria do resgate'}
            </p>
            {schNeedsReservaCategorySelect ? (
              <>
                <SearchableSelect
                  options={expenseCatOpts}
                  preserveGroupOrder
                  value={form.reservaExpenseCategoryId}
                  onChange={id => set('reservaExpenseCategoryId', id)}
                  placeholder="Sem categoria"
                  ungroupedLast
                  ungroupedLabel="Sem grupo"
                />
                {!form.reservaExpenseCategoryId && (
                  <p className="text-xs text-aviso">⚠ Obrigatório para reserva livre</p>
                )}
              </>
            ) : (
              <p className="text-xs text-texto-2">
                {schIsDepositToReserva ? 'Despesa em:' : 'Categoria:'}{' '}
                <span className="font-semibold">
                  {schReservaLinkedCat ? `${schReservaLinkedCat.icon} ${schReservaLinkedCat.name}` : '🏦 Reservas Gerais'}
                </span>
              </p>
            )}

            {/* Função de reserva (vincula o agendamento à função específica). Ocultada quando
                o resgate já tem detalhamento por função (schedule_reserva_funcoes) — nesse caso
                exibimos a árvore somente-leitura abaixo. */}
            {!hasReservaDetalhe && (
              <div>
                <label className="label text-reserva">Função de Reserva</label>
                <select
                  className="input"
                  value={form.reservaFuncaoId}
                  onChange={e => set('reservaFuncaoId', e.target.value)}
                >
                  <option value="">— Nenhuma —</option>
                  {reservaFuncoesDaConta.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                {reservaFuncoesDaConta.length === 0 && (
                  <p className="text-xs text-texto-3 mt-1">Nenhuma função vinculada a esta conta de reserva.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Detalhamento por função de reserva (somente leitura) — resgate com múltiplas funções */}
        {form.transactionType === 'transfer' && hasReservaDetalhe && (
          <div className="col-span-2 p-3 bg-reserva-bg border border-reserva/30 rounded-lg">
            <p className="text-xs font-medium text-reserva mb-1.5">Detalhamento por função de reserva</p>
            <ul className="space-y-0.5">
              {reservaDetalhe.map((det, i) => (
                <li key={i} className="text-xs text-texto-2 flex items-center gap-1.5">
                  <span className="text-texto-3">{i === reservaDetalhe.length - 1 ? '└' : '├'}</span>
                  <span className="flex-1 truncate">{det.name}</span>
                  <span className="font-medium text-texto-1">{fmt(det.valor)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-texto-3 mt-1.5">Calculado a partir dos lançamentos da fatura — somente leitura.</p>
          </div>
        )}

        {/* Categoria */}
        {form.transactionType !== 'transfer' && (
          <div>
            <LabelTip tip={TIPS.category}>Categoria</LabelTip>
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
                    onChange={id => set('categoryId', id)}
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
        )}

        {/* Favorecido — também na parcela de financiamento (transferência), onde é campo da série */}
        {(form.transactionType !== 'transfer' || ehFinanciamento) && (
          <div>
            <LabelTip tip={TIPS.payee}>Favorecido</LabelTip>
            <FavorecidoAutocomplete
              value={form.payee}
              onChange={v => set('payee', v)}
              suggestions={sortedPayees}
            />
          </div>
        )}

        {/* Tipo de documento */}
        <div>
          <TipoDocumentoSelect
            value={form.tipoDocumentoId}
            onChange={v => { setErroTipoDoc(''); set('tipoDocumentoId', v || '') }}
            tipoMov={form.transactionType}
            required={tipoDocObrigatorio}
            erro={erroTipoDoc}
          />
        </div>

        {/* Frequência — parcela de contrato: do contrato, só leitura */}
        {ehParcelaContrato ? (
          <div>
            <LabelTip tip={TIPS.frequency}>Frequência</LabelTip>
            <div className="input bg-surface-2/60 text-texto-2 cursor-not-allowed" title="Definida pelo contrato">
              {rotuloFrequencia(contratoPorId?.(initial.contratoId), initial.contratoPapel)}
            </div>
          </div>
        ) : (
        <div>
          <LabelTip tip={TIPS.frequency}>Frequência</LabelTip>
          <SearchableSelect
            options={FREQ_OPTIONS}
            value={form.frequency}
            onChange={id => setForm(f => ({ ...f, frequency: id, ...(id === 'once' || !id ? { occurrenceType: 'continuous' } : {}) }))}
            placeholder="Selecione a frequência..."
            required
          />
        </div>
        )}

        {/* Data de Início — parcela de contrato: data-base travada + vencimento editável */}
        {ehParcelaContrato ? (
          <>
            <div>
              <LabelTip tip="Mês da parcela no contrato (chave da baixa). Definido pelo contrato.">Data-base (competência)</LabelTip>
              <DateInput className="input opacity-60 cursor-not-allowed" value={form.startDate} onChange={() => {}} disabled />
            </div>
            <div>
              <LabelTip tip="Quando esta parcela vence. Muda só esta parcela; a data-base continua a mesma.">Data de vencimento</LabelTip>
              <DateInput
                className="input"
                value={form.overrides?.[form.startDate]?.date || form.startDate}
                onChange={e => {
                  const v = e.target.value
                  setVencTocado(true)
                  setForm(f => {
                    const ov = { ...(f.overrides?.[f.startDate] || {}) }
                    if (!v || v === f.startDate) delete ov.date
                    else ov.date = v
                    const overrides = { ...(f.overrides || {}) }
                    if (Object.keys(ov).length) overrides[f.startDate] = ov
                    else delete overrides[f.startDate]
                    return { ...f, overrides }
                  })
                }}
              />
            </div>
          </>
        ) : (
        <div>
          <LabelTip tip={TIPS.startDate} required>Data de Início</LabelTip>
          <DateInput
            className="input"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            required
          />
        </div>
        )}

        {/* Data de Vencimento Atual — re-ancora a série (só p/ frequências recorrentes) */}
        {form.frequency && form.frequency !== 'once' && (
          <div>
            <LabelTip tip={TIPS.nextOccurrence}>Data de Vencimento Atual</LabelTip>
            <DateInput
              className="input"
              value={form.nextOccurrence || ''}
              onChange={e => { set('nextOccurrence', e.target.value); setAncoraTocada(true) }}
            />
            <p className="text-[11px] text-texto-3 mt-1">
              Data da próxima ocorrência. Ao alterar, o sistema pergunta se vale só para esta ou também para as próximas.
            </p>
            {faturaCalculada && (
              <p className="text-xs text-texto-2 mt-1">
                📅 Entrará na fatura {faturaCalculada}
              </p>
            )}
          </div>
        )}

        {/* Ocorrência — habilitada só com frequência recorrente escolhida */}
        {form.frequency !== 'once' && (() => {
          const occDisabled = !form.frequency
          return (
            <div className={form.occurrenceType === 'installment' && !occDisabled ? '' : 'col-span-2'}>
              <LabelTip tip={TIPS.occurrence}>Ocorrência</LabelTip>
              <div className={`flex rounded-lg overflow-hidden border border-borda-forte ${occDisabled ? 'opacity-40' : ''}`}>
                {[['continuous', 'Contínua'], ['installment', 'Parcelada']].map(([v, l]) => (
                  <button
                    type="button"
                    key={v}
                    disabled={occDisabled}
                    onClick={() => set('occurrenceType', v)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${occDisabled ? 'cursor-not-allowed' : ''} ${
                      form.occurrenceType === v ? 'bg-primary/15 text-primary-fg' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        {form.frequency && form.frequency !== 'once' && form.occurrenceType === 'installment' && (
          <div>
            <LabelTip tip={TIPS.installments}>Nº de Parcelas</LabelTip>
            <input
              className="input"
              type="number"
              min="1"
              max="360"
              value={form.installments}
              onChange={e => set('installments', e.target.value)}
            />
          </div>
        )}

        {/* Automações */}
        <div className="col-span-2 bg-surface-2/40 rounded-xl p-3.5 space-y-3">
          <p className="text-[11px] font-medium text-texto-3 uppercase tracking-wider">Automações</p>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-texto-2 inline-flex items-center">
              Lembrar com Antecedência<Tooltip text={TIPS.remindDaysBefore} />
            </span>
            <div className="flex items-center gap-2">
              {form.remindDaysBefore > 0 && (
                <>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={form.remindDaysBefore}
                    onChange={e => set('remindDaysBefore', Math.max(1, Number(e.target.value)))}
                    className="w-14 input text-center text-xs py-1"
                  />
                  <span className="text-xs text-texto-3 whitespace-nowrap">dias antes</span>
                </>
              )}
              <Toggle
                value={form.remindDaysBefore > 0}
                onChange={v => set('remindDaysBefore', v ? 3 : 0)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-texto-2 inline-flex items-center">
              Registrar Automático<Tooltip text={TIPS.autoRegister} />
            </span>
            <Toggle value={form.autoRegister} onChange={v => set('autoRegister', v)} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-texto-2 inline-flex items-center">
              Sincronizar com a agenda do celular<Tooltip text={TIPS.sincronizarAgenda} />
            </span>
            <Toggle value={form.sincronizarAgenda} onChange={v => set('sincronizarAgenda', v)} />
          </div>
        </div>

        {/* Classificação Gerencial */}
        {form.transactionType === 'expense' && (
          <div className="col-span-2 bg-surface-2/40 rounded-xl p-3.5 space-y-2">
            <p className="text-[11px] font-medium text-texto-3 uppercase tracking-wider flex items-center">
              Classificação Gerencial <Tooltip text={TIPS.gerencial} />
            </p>
            <select
              className="input"
              value={form.grupoGerencial || ''}
              onChange={e => setForm(f => ({ ...f, grupoGerencial: e.target.value || null, reservaFuncaoId: '' }))}
            >
              <option value="">G — Gasto Normal (débito direto)</option>
              {sortedGerGrupos.filter(g => g.number !== 'D').map(g => (
                <option key={g.id} value={g.id}>
                  {g.number === 1 ? '1' : g.alias} — {g.name}
                  {g.number === 1 ? ' (reserva)' : ' (controle gerencial)'}
                </option>
              ))}
              {grpD && <option value={grpD.id}>D — Despesa já debitada</option>}
            </select>
            {form.grupoGerencial && (() => {
              const g = gerencialGroups.find(x => x.id === form.grupoGerencial)
              if (!g) return null
              if (g.number === 'D') return (
                <p className="text-xs text-texto-3 leading-snug">Apenas registra o lançamento, sem movimentar saldo.</p>
              )
              if (g.number === 1) return (
                <p className="text-xs text-reserva leading-snug">
                  Ao efetivar, transferirá para a conta de reserva do grupo.
                </p>
              )
              const contaR = accounts.find(a => a.id === g.defaultAccountId)
              return (
                <p className="text-xs text-despesa leading-snug">
                  Ao efetivar, resgatará automaticamente{contaR ? ` de "${contaR.name}"` : ''} para a conta principal.
                </p>
              )
            })()}

            {/* Função de reserva do bucket a resgatar — só p/ despesa em cartão com grupo numerado */}
            {showFuncaoReserva && (
              <div>
                <label className="label text-xs uppercase tracking-wide text-reserva" style={{ marginBottom: 0 }}>Função de Reserva</label>
                <select
                  className="input"
                  value={form.reservaFuncaoId || ''}
                  onChange={e => set('reservaFuncaoId', e.target.value)}
                >
                  <option value="">Sem função específica</option>
                  {reservaGroupFuncs.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <p className="text-xs text-texto-3 mt-1 leading-relaxed">
                  De qual função de <strong>{reservaGroupAccount?.apelido || reservaGroupAccount?.name || 'reserva'}</strong> sai
                  o resgate ao registrar este agendamento.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Prévia interativa */}
        {preview.length > 0 && (
          <div className="col-span-2">
            <label className="label">
              Prévia das próximas ocorrências
              <span className="ml-1.5 text-texto-3 text-[10px] normal-case font-normal">— clique para editar</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {preview.map((date, i) => {
                const override = form.overrides[date]
                const isSkipped = form.skipped.includes(date)
                // Data e valor REAIS da ocorrência (mesma fonte do Fluxo/Fatura). Override só de
                // data não tem amount (de propósito) → vale o da série, nunca "R$ NaN".
                const ef = occEfetiva(previewSchedule, date)
                const valorReal = Number(ef.amount) || 0
                const mudouData = !!override?.date && override.date !== date
                const mudouValor = Math.abs(valorReal - previewSchedule.amount) > 0.005
                const editado = !isSkipped && (mudouData || mudouValor)
                const dataBR = (d) => d.split('-').reverse().join('/')
                const tip = editado
                  ? `Original: ${dataBR(date)}${mudouValor ? ` · valor original ${fmt(previewSchedule.amount)}` : ''} — clique para editar`
                  : 'Clique para editar esta ocorrência'

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setEditingOcc(date)}
                    title={tip}
                    className={`text-center p-2 rounded-lg text-xs transition-all cursor-pointer ${
                      isSkipped
                        ? 'bg-surface-2/40 text-texto-3 ring-1 ring-borda-forte'
                        : editado
                        ? 'bg-surface-hover text-texto-1 ring-1 ring-borda-campo'
                        : i === 0
                        ? 'bg-primary/15 text-primary-fg font-medium'
                        : 'bg-surface-2 text-texto-2'
                    } hover:ring-1 hover:ring-borda-forte`}
                  >
                    <span className={isSkipped ? 'line-through opacity-40' : ''}>{dataBR(isSkipped ? date : ef.date)}</span>
                    {rotuloParcela(scheduleParcela, date) && (
                      <span className="block text-[9px] text-texto-3 mt-0.5">{rotuloParcela(scheduleParcela, date)}</span>
                    )}
                    {isSkipped ? (
                      <span className="block text-[9px] text-texto-3 mt-0.5">Pulado</span>
                    ) : (
                      <span className="block text-[9px] text-texto-2 mt-0.5">{fmt(valorReal)}</span>
                    )}
                    {editado && (
                      <span className="block text-[9px] text-texto-2 mt-0.5">Editado</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Histórico das ocorrências já consumidas (pagas, puladas, baixadas) — só leitura. */}
        {initial?.id && <OcorrenciasRegistradas schedule={atual} transactions={transactions} accounts={accounts} />}

        <div className="col-span-2 flex gap-3 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={() => { if (podeDescartar()) onClose() }}>Cancelar</button>
          {podeGravarForm
            ? <button type="submit" className="btn-primary flex-1">{initial?.id ? 'Salvar' : 'Criar Agendamento'}</button>
            : <p className="flex-1 text-xs text-texto-3 self-center text-center">Somente leitura — seu nível de acesso não permite gravar.</p>}
        </div>
      </form>

      {editingOcc && (
        <OccEditModal
          originalDate={editingOcc}
          override={form.overrides[editingOcc]}
          isSkipped={form.skipped.includes(editingOcc)}
          defaultAmount={previewSchedule.amount}
          baixaNoMes={baixaNoPeriodo(previewSchedule, editingOcc)}
          onSave={handleSaveOccurrence}
          onClose={() => setEditingOcc(null)}
        />
      )}
    </>
  )
}
