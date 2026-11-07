import { rotuloFrequencia } from '../../lib/contratos/parcelas'
import { useState, useRef, useMemo, useEffect } from 'react'
import { Info, History, AlertTriangle } from 'lucide-react'
import OcorrenciaEditModal from './OcorrenciaEditModal'
import PreviaParcelada from './PreviaParcelada'
import CampoParcelamento from './CampoParcelamento'
import HelpCampo from '../shared/HelpCampo'
import AvisoPrerequisitos from '../BoasVindas/AvisoPrerequisitos'
import { HELP_CAMPOS } from '../../lib/helpCampos'
import { publicarAgendaJa } from '../../lib/agendaFeedApi'
import { useApp } from '../../context/AppContext'
import { today, fmt, buildAccountSelectOptions } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { rotuloParcela } from '../../lib/numeroParcela'
import SeloPagamentoCartao from '../shared/SeloPagamentoCartao'
import { contaEhCartao, ROTULO_PAGAMENTO_CARTAO } from '../../lib/rotuloMovimento'
import { computeFaturaRef } from '../../lib/fatura'
import { useIsMobile } from '../../hooks/useIsMobile'
import SearchableSelect from '../shared/SearchableSelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import PerguntaFluxoPrincipal from '../shared/PerguntaFluxoPrincipal'
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
import ResumoRateio from '../shared/ResumoRateio'
import { validarRateio, normalizarRateio, categoriaPrincipal, rateioDaOcorrencia } from '../../lib/rateio'
import FimRepeticao from '../shared/FimRepeticao'
import ContratoDoAgendamento from './ContratoDoAgendamento'
import { mesmoFormulario, camposQueMudaram, juntarEdicao } from '../../lib/formularioVivo'
import DateInput from '../shared/DateInput'
import { controleGerencialAtivo, grupoComChaveDesligada, travaGerencial } from '../../lib/controleGerencial'
import { filtrarCategoriasPorPerfil, categoriaDisponivelParaPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import { baixaNoPeriodo } from '../../lib/conflitoPeriodo'
import { perguntaFluxoPrincipal, considerarFluxoParaGravar } from '../../lib/fluxoPrincipal'
import InputMoeda from '../shared/InputMoeda'
import {
  ehParcelado, ehUnicaParcelada, frequenciaExibida, normalizarUnica, permiteParcelamento, erroLimiteParcelas,
  textoDivisao, parcelaDaData, valorBaseDaChave, planoParcelamento, temConsumo, situacaoDaOcorrencia,
  comoNovaParcelada, edicaoDoParcelamento, aplicarEdicaoParcelamento, ESCOPO_OCORRENCIA, MSG_DATA_BLOQUEADA,
} from '../../lib/parcelasOcorrencia'

const datasFeitas = (s) => new Set([...(s.registered || []), ...(s.skipped || [])])

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

// Textos do ⓘ de cada campo: src/lib/helpCampos.js (help de campo, centralizado).
const TIPS = HELP_CAMPOS.agendamento

// Ícone ⓘ do campo: componente único do app (src/components/shared/HelpCampo.jsx).
const Tooltip = ({ text }) => <HelpCampo texto={text} />

// `confira`: campo sugerido pelo Assistente IA com confiança baixa (ou vazio) — destaque na prévia.
function LabelTip({ children, tip, required, confira = false }) {
  return (
    <label className="label">
      <span className="inline-flex items-center">
        {children}{required && ' *'}<Tooltip text={tip} />
        {confira && <span className="ml-1.5 text-[11px] font-medium text-aviso" title="Sugestão do assistente: confira">● confira</span>}
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

function buildCatOpts(categories, type) {
  return categories
    .filter(c => !type || c.type === type || c.type === 'both')
    .map(c => ({ id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null }))
}


// Prévia do Assistente IA: `destaques` (chaves do form) e `onSalvo(form, id)` ao criar — mesma gravação.
export default function ScheduleForm({ initial, onClose, onAviso, destaques = null, onSalvo = null }) {
  const { accounts, accountGroups, categories, payees, transactions, gerencialGroups, reserveFunctions, scheduleReservaFuncoes, addSchedule, updateSchedule, salvarFavorecidoDoAgendamento, addPayee, getNextOccurrences, rateiosByLancamento, saveRateiosFor, deleteRateiosFor, activeProfileId, categoryGroupOrder, schedules, registrarEdicao, temHistorico, pode, contratoPorId, registrarEventoContrato, settings } = useApp()
  // Controle gerencial do ambiente: desligado, o bloco some, agendamento novo não ganha grupo e a
  // edição mantém o gravado; com grupo gerencial, valor, data e conta ficam travados.
  const gerencialLigado = controleGerencialAtivo(settings)
  const trava = travaGerencial(initial, { ativo: gerencialLigado, gerencialGroups })
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
  // Recorrente aberto numa ocorrência: o rateio "Só esta" dela (overrides[data].rateio), senão o da série.
  const rateioSerieInicial = initial?.id ? (rateiosByLancamento?.get(initial.id) || []).map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })) : []
  const occRateioInicial = initial?.id && (initial.frequency || 'once') !== 'once' ? initial.nextOccurrence : null
  const rateioSoDestaOcorrencia = !!(occRateioInicial && Array.isArray(initial?.overrides?.[occRateioInicial]?.rateio))
  const rateioInicial = initial?.id ? rateioDaOcorrencia(initial, occRateioInicial, rateioSerieInicial) : []
  const [rateioRows, setRateioRows] = useState(() => rateioInicial)
  const [showRateio, setShowRateio] = useState(false)
  const rateioTotal = rateioRows.reduce((s, r) => s + (Number(r.valor) || 0), 0)
  const [erroRateio, setErroRateio] = useState('')

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
  // Recorrência parcelada: a âncora é sempre a próxima parcela pendente.
  const ancoraDe = (sch) => (ehParcelado(sch) ? (getNextOccurrences(sch, 1)[0] || '') : sch?.nextOccurrence)
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
  // Campos da ocorrência que o formulário mostra. Recorrência parcelada: o campo Valor é o TOTAL da
  // ocorrência (ano) em que a próxima parcela cai, e não o valor da parcela.
  const occDoForm = (base, anc) => {
    const oc = occCampos(base, anc)
    const p = parcelaDaData(base, anc)
    return p ? { ...oc, amount: p.valorTotal } : oc
  }
  const occInicial = ehRecorrente && ancoraSalva ? occDoForm(serieBase, ancoraSalva) : null
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

  // Valores do formulário para o agendamento `ini`, com a ocorrência da âncora de `base` (recorrente).
  // Na abertura: formDe(initial, serieBase). Para conferir mudança feita FORA do formulário
  // (composição do boleto, crédito, pagamento, outro aparelho): formDe(atual, atual).
  const formDe = (ini, base) => {
    const anc = ancoraDe(base)
    const exib = (anc && base) ? occEfetiva(base, anc).date : anc
    const occ = ehRecorrente && anc ? occDoForm(base, anc) : null
    return formDeValores(ini, occ, exib)
  }
  // N mostrado: o da ocorrência da próxima parcela (pode ter exceção "só neste ano").
  const nDaOcorrencia = (ini, anc) => parcelaDaData(ini, anc)?.total ?? (Number(ini?.parcelasPorOcorrencia) || 1)
  const formDeValores = (ini, occInicial, ancoraExibida) => ({
    description: (occInicial ? occInicial.description : ini?.description) || '',
    transactionType: ini?.transactionType || 'expense',
    accountId: (occInicial ? occInicial.accountId : ini?.accountId) || accounts[0]?.id || '',
    toAccountId: ini?.toAccountId || '',
    reservaExpenseCategoryId: ini?.reservaExpenseCategoryId || '',
    reservaFuncaoId: ini?.reservaFuncaoId || '',
    amount: (occInicial ? occInicial.amount : ini?.amount) ?? '',
    categoryId: (occInicial ? occInicial.categoryId : ini?.categoryId) || '',
    // Transferência entre perfis: categoria na visão do CNPJ e na do CPF (campos da parcela).
    categoriaCnpjId: (occInicial ? occInicial.categoriaCnpjId : ini?.categoriaCnpjId) || '',
    categoriaCpfId: (occInicial ? occInicial.categoriaCpfId : ini?.categoriaCpfId) || '',
    payee: ini?.payee || '',
    costCenter: (occInicial ? occInicial.costCenter : ini?.costCenter) || '',
    // Única em N parcelas: gravada como Anual + 1 ocorrência; aqui é sempre "Única".
    frequency: ini ? (ini.frequency ? frequenciaExibida(ini) : '') : '',
    startDate: ini?.startDate || today(),
    // Data de Vencimento Atual: re-ancora a série. O campo EXIBE a data efetiva (com a exceção
    // aplicada, quando existe) — ver `ancoraExibida`. A âncora realmente salva é `ancoraSalva`,
    // e só substitui a atual se este campo for editado à mão.
    nextOccurrence: ancoraExibida,
    occurrenceType: ehUnicaParcelada(ini) ? 'continuous' : (ini?.occurrenceType || 'continuous'),
    installments: ehUnicaParcelada(ini) ? 0 : (ini?.installments ?? 0),
    parcelasPorOcorrencia: nDaOcorrencia(ini, ancoraDe(ini)),
    remindDaysBefore: ini?.remindDaysBefore ?? 3,
    autoRegister: ini?.autoRegister ?? true,
    sincronizarAgenda: ini?.sincronizarAgenda !== false,
    // "Considerar no Fluxo de Caixa principal?" — null = padrão da regra de hoje (pela conta FC).
    considerarFluxoPrincipal: typeof ini?.considerarFluxoPrincipal === 'boolean' ? ini.considerarFluxoPrincipal : null,
    grupoGerencial: (occInicial ? occInicial.grupoGerencial : ini?.grupoGerencial) || null,
    skipped: ini?.skipped || [],
    overrides: ini?.overrides || {},
    tipoDocumentoId: ini?.tipoDocumentoId || '',
    numeroContrato: ini?.numeroContrato || '',
  })
  const [form, setForm] = useState(() => formDe(initial, serieBase))
  // Agendamento mudou FORA deste formulário enquanto ele está aberto? `origem` = o que o formulário
  // mostrava (form) e a versão viva (vivo) na última sincronização. Sem edição do usuário, o
  // formulário passa ao valor novo; com edição, pergunta (Recarregar × Manter a minha edição) e o
  // Salvar fica bloqueado até a escolha — nunca grava por cima sem querer.
  const [origem0] = useState(() => ({ form, vivo: initial?.id ? formDe(atual, atual) : null }))
  const origemRef = useRef(origem0)
  const salvandoRef = useRef(false)
  const [mudouFora, setMudouFora] = useState(null) // { campos, novo }
  const [atualizadoFora, setAtualizadoFora] = useState(null) // campos atualizados sozinhos
  // Tipo de documento: obrigatório só ao CRIAR despesa/receita; na edição pode ficar vazio.
  const [erroTipoDoc, setErroTipoDoc] = useState('')
  const tipoDocObrigatorio = tipoDocumentoObrigatorio({ criando: !initial?.id, tipoMov: form.transactionType })

  // Conferência a cada versão nova do agendamento no app (o próprio Salvar não conta).
  useEffect(() => {
    if (!initial?.id || salvandoRef.current || !atual) return
    const vivo = formDe(atual, atual)
    const o = origemRef.current
    if (mesmoFormulario(vivo, o.vivo)) return
    const campos = camposQueMudaram(o.vivo, vivo)
    const rateioMexido = JSON.stringify(normalizarRateio(rateioRows)) !== JSON.stringify(normalizarRateio(rateioInicial))
    const intocado = mesmoFormulario(form, o.form) && !serieLocal && edicoesChip.length === 0 && !ancoraTocada && !vencTocado && !rateioMexido
    if (intocado) {
      origemRef.current = { form: vivo, vivo }
      setForm(vivo)
      setRateioRows(rateioInicial)
      setAtualizadoFora(campos)
      setMudouFora(null)
    } else {
      setMudouFora({ campos, vivo })
    }
  }, [atual]) // eslint-disable-line react-hooks/exhaustive-deps
  const recarregarDeFora = () => {
    const vivo = mudouFora?.vivo || formDe(atual, atual)
    origemRef.current = { form: vivo, vivo }
    setForm(vivo)
    setSerieLocal(null)
    setEdicoesChip([])
    setAncoraTocada(false)
    setVencTocado(false)
    setRateioRows(rateioInicial)
    setAtualizadoFora(mudouFora?.campos || null)
    setMudouFora(null)
  }
  // Manter a minha edição: os campos que o usuário mexeu ficam como ele deixou; os que ele NÃO mexeu
  // recebem o valor novo (nunca voltam ao antigo). O diff do Salvar compara com a versão viva.
  const manterMinhaEdicao = () => {
    const { form: base } = origemRef.current
    const vivo = mudouFora.vivo
    const novo = juntarEdicao(form, base, vivo)
    origemRef.current = { form: vivo, vivo }
    setForm(novo)
    setMudouFora(null)
  }

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
  // Parcelamento: só em Despesa e Receita, em frequência maior que mensal ou Única; nunca em parcela
  // de contrato, de financiamento ou agendamento do motor da fatura.
  const parcelamentoDisponivel = permiteParcelamento(form.frequency) && form.transactionType !== 'transfer'
    && !ehMotor && !ehFinanciamento && !ehParcelaContrato
  const nForm = parcelamentoDisponivel ? Math.max(1, Math.floor(Number(form.parcelasPorOcorrencia) || 1)) : 1
  const parcelavaAntes = !!initial?.id && ehParcelado(serieBase)
  const parcForm = nForm > 1 || parcelavaAntes
  const erroLimite = parcelamentoDisponivel ? erroLimiteParcelas(form.frequency, nForm) : null
  // Série comum com baixas não vira parcelada: as baixas estão presas às datas antigas.
  const parcelamentoBloqueado = !!initial?.id && !parcelavaAntes && temConsumo(serieBase)
  const serieComBaixa = parcelavaAntes && temConsumo(serieBase)
  const [erroParcelamento, setErroParcelamento] = useState('')
  const occAlvoParcela = parcelavaAntes && ancoraSalva ? (parcelaDaData(serieBase, ancoraSalva)?.ocorrencia || null) : null
  // Pergunta do fluxo principal (só despesa/receita em conta não FC, ou transferência FC ↔ não FC;
  // nunca cartão). Vale para a série: o realizado segue a regra da conta.
  const perguntaFluxo = perguntaFluxoPrincipal(form, accounts)

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
  const faturaCalculada = form.transactionType === 'expense' && isCredit && form.nextOccurrence && !parcForm && selectedAccount?.closingDay
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

  const previewBase = {
    ...form,
    // A prévia é gerada a partir da âncora SALVA, não da exibida. As datas que ela produz são as
    // ORIGINAIS — chaves de overrides/skipped e do que o fluxo de caixa usa. Cada célula EXIBE a
    // data e o valor EFETIVOS (occEfetiva), a mesma fonte do Fluxo/Fatura.
    nextOccurrence: ancoraTocada ? form.nextOccurrence : ancoraSalva,
    // Valor da SÉRIE: num recorrente salvo, o campo Valor mostra a ocorrência da âncora (que pode
    // ter exceção própria), então a série vem do agendamento.
    amount: parcForm ? (parcelavaAntes ? (Number(serieBase.amount) || 0) : (Number(form.amount) || 0)) : ehRecorrente ? (Number(serieBase.amount) || 0) : (Number(form.amount) || 0),
    parcelasPorOcorrencia: parcelavaAntes ? (Number(serieBase.parcelasPorOcorrencia) || 1) : nForm,
    // As registradas reais: num parcelado, o motor conta as já consumidas antes da âncora para
    // saber quantas faltam — com [] a prévia do TV PAPAI (4 de 8 pagas) listava 8 datas futuras.
    // As puladas seguem fora ([]), para continuarem aparecendo como chip "Pulado".
    registered: initial?.id ? (serieBase?.registered || []) : [],
    skipped: [],
  }
  // Recorrência parcelada: a prévia mostra o total/N digitados, ainda sem gravar nada.
  const previewSchedule = (() => {
    const normal = normalizarUnica(previewBase)
    // Sem mudança de total/N não há recálculo: ele apagaria os valores próprios das parcelas.
    if (!parcelavaAntes || !occAlvoParcela || !edicaoDoParcelamento(serieBase, { total: Number(form.amount) || 0, n: nForm }).mudancas.length) return normal
    try {
      return planoParcelamento(normal, { dataOcorrencia: occAlvoParcela, total: Number(form.amount) || 0, n: nForm, escopo: ESCOPO_OCORRENCIA.PROXIMAS })
    } catch { return normal }
  })()
  const preview = form.startDate && form.frequency ? getNextOccurrences(previewSchedule, parcForm ? Math.max(36, nForm * 3) : 12) : []
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
    // Recorrência parcelada: pela prévia, a edição vale só para esta parcela (o total muda no campo Valor).
    if (perguntar && !ehParcelado(fonte)) {
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
        ...(ancoraNova && !ehParcelado(novo) && normalizarCampo('amount', f.amount) === normalizarCampo('amount', camposAntes?.amount)
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
    numeroContrato: serieBase.numeroContrato || null,
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
    numeroContrato: (f.numeroContrato || '').trim() || null,
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
        numeroContrato: serieBase.numeroContrato || null,
        parcelasPorOcorrencia: Number(serieBase.parcelasPorOcorrencia) || 1,
      }
      // Série comum (sem baixas) que passa a ser parcelada: total e N entram direto, como numa criação.
      if (!parcelavaAntes && nForm > 1) { base.amount = Number(form.amount); base.parcelasPorOcorrencia = nForm }
      // Recorrência parcelada: total/N têm regra própria; os demais campos seguem a regra de sempre.
      const numericos = mudancas.filter(m => m.campo === 'valorTotalOcorrencia' || m.campo === 'parcelasPorOcorrencia')
      const demais = mudancas.filter(m => m !== numericos[0] && m !== numericos[1])
      // Sem nenhuma baixa, mudar início ou frequência recomeça a série: nada ficou preso às datas antigas.
      const aplicado = parcelavaAntes
        ? aplicarEdicaoParcelamento(base, serieBase, {
          total: Number(form.amount), n: nForm, escopo: decisao?.escopo, inicio: data.startDate, frequencia: data.frequency,
          edicao: edicaoDoParcelamento(serieBase, { total: Number(form.amount), n: nForm }),
        })
        : { schedule: base, recomeco: false, escopo: ESCOPO_OCORRENCIA.PROXIMAS }
      const { recomeco, escopo: escopoOcc } = aplicado
      const baseParc = aplicado.schedule
      // "Só nesta ocorrência" com outros campos alterados: valem para as parcelas pendentes desta ocorrência.
      let planoSchedule = baseParc
      let afetadas
      if (parcelavaAntes && !recomeco && numericos.length && escopoOcc === ESCOPO_OCORRENCIA.SO_ESTA) {
        const pendentesOcc = situacaoDaOcorrencia(baseParc, occAlvoParcela).chaves.filter(d => !datasFeitas(baseParc).has(d))
        for (const occDate of pendentesOcc) {
          planoSchedule = planoAgendamento(planoSchedule, { occDate, mudancas: demais, escopo: ESCOPO.PARCELA }).schedule
        }
        afetadas = pendentesOcc
      } else {
        const plano = planoAgendamento(baseParc, {
          occDate: parcelavaAntes ? (getNextOccurrences(baseParc, 1)[0] || ctx.occDate) : ctx.occDate,
          mudancas: parcelavaAntes ? demais : mudancas, escopo: numericos.length ? ESCOPO.PROXIMAS : escopoParcela,
          pendentes: getNextOccurrences(baseParc, 400), proximasDoNovo: s => getNextOccurrences(s, 400),
        })
        planoSchedule = plano.schedule
        afetadas = plano.afetadas
      }
      const final = { ...planoSchedule, accountType: accounts.find(a => a.id === planoSchedule.accountId)?.type || planoSchedule.accountType }
      if (ehParcelado(final)) final.nextOccurrence = getNextOccurrences(final, 1)[0] || null
      updateSchedule(initial.id, final)
      finais = [final]
      nAfetadas = afetadas.length || 1
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
    // Mudou fora enquanto o usuário editava: só grava depois da escolha (Recarregar × Manter).
    if (mudouFora) return
    if (!form.description || !form.amount || !form.accountId || !form.frequency) return
    if (form.frequency !== 'once' && form.occurrenceType === 'installment' && Number(form.installments) < 1) return
    if (form.transactionType === 'transfer' && !form.toAccountId) return
    if (form.transactionType === 'transfer' && schNeedsReservaCategorySelect && !form.reservaExpenseCategoryId) return
    if (tipoDocObrigatorio && !form.tipoDocumentoId) { setErroTipoDoc('Selecione o tipo de documento.'); return }
    if (erroLimite) { setErroParcelamento(erroLimite); return }
    setErroParcelamento('')
    // Rateio: só grava quando as linhas fecham o valor do agendamento.
    const comRateio = form.transactionType !== 'transfer' && rateioRows.length > 0
    if (comRateio) {
      const v = validarRateio(rateioRows, Number(form.amount) || 0)
      if (!v.ok) { setErroRateio(`Restante a distribuir: ${fmt(v.restante)}. ${v.motivo}`); return }
    }
    setErroRateio('')
    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)
    const data = {
      ...form,
      ...(comRateio ? { categoryId: categoriaPrincipal(rateioRows) } : {}),
      // Escolha manual (inclusive "Sem tipo") é o que fica gravado — vence o fallback de exibição.
      tipoDocumentoId: form.tipoDocumentoId || null,
      numeroContrato: (form.numeroContrato || '').trim() || null,
      ...categoriasPerfisDe(form),
      // Só vale onde a pergunta aparece; noutro caso (conta FC, cartão…) volta a null.
      considerarFluxoPrincipal: considerarFluxoParaGravar(form, accounts),
      // A âncora só muda se o campo foi editado. Ele EXIBE a data efetiva (com a exceção), e
      // salvar isso de volta re-ancoraria a série a cada save de qualquer outro campo.
      nextOccurrence: ancoraTocada ? form.nextOccurrence : ancoraSalva,
      amount: Number(form.amount),
      accountType: selectedAccount?.type,
      installments: Number(form.installments),
      ...(gerencialLigado ? {} : { grupoGerencial: grupoComChaveDesligada(initial) }),
      remindDaysBefore: Number(form.remindDaysBefore) || 0,
      parcelasPorOcorrencia: nForm,
    }
    // Série parcelada com baixa não muda de frequência (as baixas estão presas às datas atuais), e a
    // Única continua sendo Anual + 1 ocorrência no banco.
    if (serieComBaixa) {
      data.frequency = serieBase.frequency
      if (ehUnicaParcelada(serieBase)) { data.occurrenceType = serieBase.occurrenceType; data.installments = serieBase.installments }
    } else {
      Object.assign(data, normalizarUnica(data))
    }
    // Série comum sem baixas que passa a ser parcelada: nasce na próxima data e sem as exceções antigas.
    if (initial?.id && !parcelavaAntes && nForm > 1) {
      Object.assign(data, comoNovaParcelada(data, serieBase, ancoraSalva))
    }
    // Criar vs editar se decide pelo `id`, NÃO pela presença de `initial`: o DuplicateButton
    // ("Duplicar → Criar Agendamento") passa um `initial` só com os campos pré-preenchidos do
    // lançamento de origem, sem id. Com `if (initial)` isso caía em updateSchedule(undefined, …),
    // que não casa com nenhum agendamento — o modal fechava e nada era criado, sem erro.
    let schedId = initial?.id
    // Rateio editado num agendamento existente segue a regra de séries: "Só esta" grava o rateio da
    // ocorrência (overrides[data].rateio); "Esta e as próximas" grava o da série. Histórico com o escopo.
    const resumoRateio = (ls) => (ls || []).map(l => `${categories.find(c => c.id === l.categoriaId)?.name || '?'} ${fmt(l.valor)}`).join(' + ') || null
    const chaveRateio = (ls) => JSON.stringify((ls || []).map(l => [l.categoriaId, Math.round(Number(l.valor) * 100)]))
    const rateioMudou = !!schedId && form.transactionType !== 'transfer' && chaveRateio(rateioRows) !== chaveRateio(rateioInicial)
    let escopoRateio = ESCOPO.SERIE
    let ctxRateio = null
    if (schedId) {
      // Regra única de séries: campo da PARCELA mudou e há pendentes depois → pergunta o escopo.
      let mudancas = diffCampos(camposAntes, camposDoForm(form))
      const ctx = contextoSerie()
      // Recorrência parcelada: "Valor" aqui é o total da ocorrência; total e N têm pergunta própria.
      if (parcelavaAntes) {
        const edicao = edicaoDoParcelamento(serieBase, { total: Number(form.amount), n: nForm })
        mudancas = [...edicao.mudancas, ...mudancas.filter(m => m.campo !== 'amount')]
        if (edicao.erro) { setErroParcelamento(edicao.erro); return }
        if (!decisao && edicao.perguntar) {
          setEscopoPendente({ parcelamento: true, mudancas, nProximas: ctx.nProximas, nPendentes: ctx.nPendentes, conflitos: [] })
          return
        }
      }
      ctxRateio = ctx
      const mudancaRateio = rateioMudou ? [{ campo: 'rateio', de: resumoRateio(rateioInicial), para: resumoRateio(rateioRows) }] : []
      // Série comum virando parcelada: o valor passa a ser o total; não há o que perguntar.
      if (!parcelavaAntes && nForm > 1) mudancas = [
        { campo: 'parcelasPorOcorrencia', de: 1, para: nForm },
        ...mudancas.map(m => (m.campo === 'amount' ? { ...m, campo: 'valorTotalOcorrencia' } : m)),
      ]
      const numericoTratado = mudancas.some(m => m.campo === 'valorTotalOcorrencia' || m.campo === 'parcelasPorOcorrencia')
      if (!decisao && !numericoTratado && (precisaEscolherEscopo(mudancas, ctx.nProximas) || (rateioMudou && ctx.nProximas > 0))) {
        setEscopoPendente({
          mudancas: [...mudancas, ...mudancaRateio], nProximas: ctx.nProximas, nPendentes: ctx.nPendentes, ocorrencia: ctx.tipo === 'A',
          conflitos: ctx.tipo === 'A' ? conflitosProximas(serieBase, { occDate: ctx.occDate, mudancas, pendentes: ctx.pendentes }) : [],
        })
        return
      }
      if (rateioMudou) {
        escopoRateio = ctx.nProximas > 0 ? (decisao?.escopo || ESCOPO.PARCELA) : ESCOPO.SERIE
        const overrides = { ...(data.overrides || {}) }
        if (ctx.tipo === 'A' && escopoRateio === ESCOPO.PARCELA) {
          overrides[ctx.occDate] = { ...(overrides[ctx.occDate] || {}), rateio: rateioRows }
        } else if (ctx.tipo === 'A') {
          // Esta e as próximas: as ocorrências daqui em diante seguem o rateio novo da série.
          for (const [d, ov] of Object.entries(overrides)) {
            if (d >= ctx.occDate && ov && 'rateio' in ov) { const resto = { ...ov }; delete resto.rateio; overrides[d] = resto }
          }
        }
        data.overrides = overrides
        const loteR = novoLoteId()
        registrarEdicao({
          loteId: loteR,
          historico: linhasHistorico({
            entidade: 'agendamento', serieKey: serieKeyDe({ agendamento: initial }), loteId: loteR, motivo: decisao?.motivo || null,
            itens: [{ id: initial.id, ocorrenciaData: escopoRateio === ESCOPO.PARCELA ? ctx.occDate : null, escopo: escopoRateio === ESCOPO.PARCELA ? ESCOPO.PARCELA : ESCOPO.PROXIMAS, mudancas: mudancaRateio }],
          }),
        }).catch(err => console.warn('[rateio] histórico:', err.message))
      }
      // Parcela de financiamento: o favorecido vale para o financiamento e as parcelas PENDENTES —
      // o endpoint vai ANTES do updateSchedule (falha não deixa o estado com um favorecido que o
      // banco não tem).
      salvandoRef.current = true
      const ok = await salvarEdicao(data, mudancas, ctx, decisao)
      if (!ok) { salvandoRef.current = false; return }
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
      onSalvo?.(form, schedId)
    }
    // Rateio da SÉRIE (apenas receita/despesa): agendamento novo, ou editado com escopo além de "Só esta".
    const soDestaOcorrencia = rateioMudou && ctxRateio?.tipo === 'A' && escopoRateio === ESCOPO.PARCELA
    if (form.transactionType !== 'transfer' && schedId && !soDestaOcorrencia && (!initial?.id || rateioMudou)) {
      if (rateioRows.length > 0) saveRateiosFor(schedId, rateioRows)
      else if (hadRateio) deleteRateiosFor(schedId)
      // Parcelas de contrato/financiamento (registros separados): "Esta e as próximas" leva às irmãs pendentes.
      if (ctxRateio?.tipo === 'F' && escopoRateio !== ESCOPO.PARCELA && rateioMudou) {
        for (const s of ctxRateio.irmas.filter(x => (x.startDate || '') > (initial.startDate || '') && agendamentoUnicoPendente(x))) {
          if (rateioRows.length > 0) saveRateiosFor(s.id, rateioRows)
          else deleteRateiosFor(s.id)
        }
      }
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
        variante={escopoPendente.parcelamento ? 'parcelamento' : escopoPendente.ocorrencia ? 'ocorrencia' : undefined}
        anoOcorrencia={occAlvoParcela ? occAlvoParcela.slice(0, 4) : null}
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
      {/* Celular (< sm): 1 coluna. Os blocos com max-sm:-order-1 (até o Valor) sobem juntos, na
          ordem do código — assim o Valor vem logo após a Descrição e antes da Conta. No desktop
          a ordem e as 2 colunas são as de sempre. */}
      {!initial?.id && <AvisoPrerequisitos funcao="agendamento" onIr={onClose} />}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {initial?.id && (
          <div className="max-sm:-order-1 sm:col-span-2 flex items-center justify-end -mb-2">
            <button type="button" onClick={() => setVerHistorico(true)} className="text-xs text-texto-2 hover:text-texto-1 flex items-center gap-1.5" title="Histórico de alterações">
              <History size={13} /> Histórico
              {temHistorico('agendamento', initial.id) && <span className="w-1.5 h-1.5 rounded-full bg-primary-fg" />}
            </button>
          </div>
        )}
        {mudouFora && (
          <div role="alert" data-testid="agendamento-mudou-fora" className="max-sm:-order-1 sm:col-span-2 text-xs text-aviso bg-aviso/10 border border-aviso/30 rounded-lg px-3 py-2 space-y-2">
            <p className="flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Este agendamento foi alterado enquanto você editava{mudouFora.campos.length ? ` (${mudouFora.campos.map(c => c.texto).join('; ')})` : ''}. Escolha antes de salvar.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs py-1.5" onClick={recarregarDeFora}>Recarregar com os dados novos</button>
              <button type="button" className="btn-ghost text-xs py-1.5" onClick={manterMinhaEdicao}>Manter a minha edição</button>
            </div>
          </div>
        )}
        {!mudouFora && atualizadoFora && (
          <div data-testid="agendamento-atualizado-fora" className="max-sm:-order-1 sm:col-span-2 flex items-start gap-2 text-xs text-texto-2 bg-surface-2/60 rounded-lg px-3 py-2">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>Atualizado com a alteração feita agora{atualizadoFora.length ? ` (${atualizadoFora.map(c => c.texto).join('; ')})` : ''}.</span>
          </div>
        )}
        {avisoMotor && (
          <div className="max-sm:-order-1 sm:col-span-2 flex items-start gap-2 text-xs text-aviso bg-aviso/10 border border-aviso/30 rounded-lg px-3 py-2">
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
            onSave={rs => {
              const { linhas, comum } = normalizarRateio(rs)
              if (comum) set('categoryId', comum)
              setRateioRows(linhas); setErroRateio(''); setShowRateio(false)
            }}
            onDeleteAll={() => { setRateioRows([]); setShowRateio(false) }}
            onClose={() => setShowRateio(false)}
          />
        )}

        {/* Movimentação */}
        <div data-guia="agendamento-form.tipo" className="max-sm:-order-1 sm:col-span-2">
          <LabelTip tip={TIPS.transactionType}>Movimentação</LabelTip>
          <div className="flex rounded-lg overflow-hidden border border-borda-forte">
            {['expense', 'income', 'transfer'].map(t => (
              <button
                type="button"
                key={t}
                onClick={() => setContas({ transactionType: t })}
                className={`flex-1 min-w-0 px-1 py-2.5 sm:py-2 text-[13px] sm:text-sm font-medium truncate transition-colors ${
                  form.transactionType === t
                    ? t === 'income' ? 'bg-receita text-page'
                    : t === 'transfer' ? 'bg-transferencia text-page'
                    : 'bg-despesa text-page'
                    : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
                }`}
              >
                {t === 'income' ? 'Receita'
                  : t === 'transfer' ? (form.transactionType === 'transfer' && (contaEhCartao(accounts, form.toAccountId) || initial?.tipo === 'pagamento_fatura') ? ROTULO_PAGAMENTO_CARTAO : 'Transferência')
                  : 'Despesa'}
              </button>
            ))}
          </div>
        </div>
        {/* Transferência para o cartão = pagamento de fatura: só o NOME muda (src/lib/rotuloMovimento.js). */}
        {((form.transactionType === 'transfer' && contaEhCartao(accounts, form.toAccountId)) || initial?.tipo === 'pagamento_fatura') && (
          <p className="sm:col-span-2 flex flex-wrap items-center gap-1.5 text-[11px] text-texto-3 -mt-1">
            <SeloPagamentoCartao /> Não conta como despesa: as compras já contaram quando entraram no cartão.
          </p>
        )}

        {/* Descrição */}
        <div data-guia="agendamento-form.descricao" className="max-sm:-order-1 sm:col-span-2">
          <LabelTip tip={TIPS.description} required confira={!!destaques?.includes('description')}>Descrição</LabelTip>
          <input
            className="input"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Digite a descrição do agendamento"
            required
            readOnly={ehFinanciamento}
          />
          {ehFinanciamento && <p className="text-[11px] text-texto-3 mt-1">Parcela de financiamento: a descrição do lançamento vem do bem ("Parcela n/N"), por isso não é editável aqui.</p>}
        </div>

        {/* Conta */}
        <div data-guia="agendamento-form.conta">
          <LabelTip tip={TIPS.account} required confira={!!destaques?.includes('accountId')}>{form.transactionType === 'transfer' ? 'Conta Origem' : 'Conta'}</LabelTip>
          {trava
            ? <div className="input opacity-60 cursor-not-allowed" title={trava}>{selectedAccount?.apelido || selectedAccount?.name || '—'}</div>
            : <SearchableSelect
                options={accountOpts}
                value={form.accountId}
                onChange={id => setContas({ accountId: id, reservaFuncaoId: '' })}
                placeholder="Selecione a conta..."
                preserveGroupOrder
                ungroupedLast
                required
              />}
          {trava && <p role="note" className="mt-1 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1">{trava}</p>}
        </div>

        {/* Valor */}
        <div data-guia="agendamento-form.valor" className="max-sm:-order-1">
          <LabelTip tip={TIPS.amount} required confira={!!destaques?.includes('amount')}>{nForm > 1 ? 'Valor total da ocorrência (R$)' : 'Valor (R$)'}</LabelTip>
          <InputMoeda
            className="input valor-destaque"
            min="0.01"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            required
            readOnly={ehFinanciamento}
            disabled={!!trava}
          />
          {nForm > 1 && Number(form.amount) > 0 && !erroLimite && (
            <p className="text-xs text-texto-2 mt-1" role="status">{textoDivisao(Number(form.amount), nForm, fmt)}</p>
          )}
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
          <div data-guia="agendamento-form.conta-destino" className="sm:col-span-2">
            <LabelTip tip={TIPS.toAccount} required confira={!!destaques?.includes('toAccountId')}>Conta Destino</LabelTip>
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
          <div className="sm:col-span-2">
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

        {/* Fluxo de Caixa principal (só quando a conta não decide sozinha) */}
        <PerguntaFluxoPrincipal
          pergunta={perguntaFluxo}
          valor={form.considerarFluxoPrincipal}
          onChange={v => set('considerarFluxoPrincipal', v)}
          className="sm:col-span-2"
        />

        {/* Reserva category — quando transferência envolve conta reserva */}
        {form.transactionType === 'transfer' && (schIsDepositToReserva || schIsWithdrawFromReserva) && (
          <div className="sm:col-span-2 p-3 bg-reserva-bg border border-reserva/30 rounded-lg space-y-2">
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
          <div className="sm:col-span-2 p-3 bg-reserva-bg border border-reserva/30 rounded-lg">
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
          <div data-guia="agendamento-form.categoria">
            <LabelTip tip={TIPS.category} confira={!!destaques?.includes('categoryId')}>Categoria</LabelTip>
            <div className="flex items-center gap-2">
              {rateioRows.length > 0 ? (
                <ResumoRateio linhas={rateioRows} categories={categories} total={Number(form.amount) || 0} extra={rateioSoDestaOcorrencia ? ' · só desta ocorrência' : ''} />
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
              <button type="button" onClick={() => setShowRateio(true)} className="btn-secondary text-xs py-1.5 px-3 shrink-0" title="Dividir este agendamento em várias categorias">
                <span className="hidden sm:inline">Dividir em categorias</span><span className="sm:hidden">Dividir</span>
              </button>
            </div>
            {erroRateio && <p className="text-[11px] text-aviso mt-1" role="alert">{erroRateio}</p>}
          </div>
        )}

        {/* Favorecido — também na parcela de financiamento (transferência), onde é campo da série */}
        {(form.transactionType !== 'transfer' || ehFinanciamento) && (
          <div data-guia="agendamento-form.favorecido">
            <LabelTip tip={TIPS.payee} confira={!!destaques?.includes('payee')}>Favorecido</LabelTip>
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
            confira={!!destaques?.includes('tipoDocumentoId')}
          />
        </div>

        {/* Nº do contrato (boleto/carnê) e vínculo manual a um contrato cadastrado */}
        {form.transactionType !== 'transfer' && (
          <ContratoDoAgendamento
            numero={form.numeroContrato}
            onNumero={v => set('numeroContrato', v)}
            schedule={initial?.id ? schedules.find(s => s.id === initial.id) || initial : null}
            confira={!!destaques?.includes('numeroContrato')}
            tipoDocumentoId={form.tipoDocumentoId}
          />
        )}

        {/* Frequência — parcela de contrato: do contrato, só leitura */}
        {ehParcelaContrato ? (
          <div data-guia="agendamento-form.frequencia">
            <LabelTip tip={TIPS.frequency}>Frequência</LabelTip>
            <div className="input bg-surface-2/60 text-texto-2 cursor-not-allowed" title="Definida pelo contrato">
              {rotuloFrequencia(contratoPorId?.(initial.contratoId), initial.contratoPapel)}
            </div>
          </div>
        ) : (
        <div data-guia="agendamento-form.frequencia">
          <LabelTip tip={TIPS.frequency}>Frequência</LabelTip>
          <SearchableSelect
            options={FREQ_OPTIONS}
            value={form.frequency}
            onChange={id => setForm(f => ({ ...f, frequency: id, ...(id === 'once' || !id ? { occurrenceType: 'continuous' } : {}) }))}
            placeholder="Selecione a frequência..."
            required
            disabled={serieComBaixa}
          />
          {serieComBaixa && <p className="text-[11px] text-texto-3 mt-1">{MSG_DATA_BLOQUEADA}</p>}
        </div>
        )}

        {/* Data de Início — parcela de contrato: data-base travada + vencimento editável */}
        {ehParcelaContrato ? (
          <>
            <div>
              <LabelTip tip={TIPS.dataBase}>Data-base (competência)</LabelTip>
              <DateInput className="input opacity-60 cursor-not-allowed" value={form.startDate} onChange={() => {}} disabled />
            </div>
            <div>
              <LabelTip tip={TIPS.dataVencimento}>Data de vencimento</LabelTip>
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
        <div data-guia="agendamento-form.data">
          <LabelTip tip={TIPS.startDate} required confira={!!destaques?.includes('startDate')}>Data de Início</LabelTip>
          <DateInput
            className="input"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            required
            hoje
            disabled={!!trava || serieComBaixa}
          />
          {serieComBaixa && <p className="text-[11px] text-texto-3 mt-1">{MSG_DATA_BLOQUEADA}</p>}
        </div>
        )}

        {/* Data de Vencimento Atual — re-ancora a série (só p/ frequências recorrentes) */}
        {form.frequency && form.frequency !== 'once' && !parcForm && (
          <div>
            <LabelTip tip={TIPS.nextOccurrence}>Data de Vencimento Atual</LabelTip>
            <DateInput
              className="input"
              value={form.nextOccurrence || ''}
              onChange={e => { set('nextOccurrence', e.target.value); setAncoraTocada(true) }}
              disabled={!!trava}
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

        {/* Até quando — Sem fim | Número de vezes | Até a data (só com frequência recorrente escolhida) */}
        {form.frequency !== 'once' && (
          <div data-guia="agendamento-form.ate-quando" className={`sm:col-span-2 ${!form.frequency ? 'opacity-40 pointer-events-none' : ''}`}>
            <LabelTip tip={TIPS.occurrence}>Até quando</LabelTip>
            <FimRepeticao
              inicio={form.startDate}
              recorrencia={form.frequency}
              occurrenceType={form.occurrenceType}
              installments={form.installments}
              rotuloVezes="Nº de ocorrências"
              rotuloModoVezes="Número de ocorrências"
              onChange={({ occurrenceType, installments }) => setForm(f => ({ ...f, occurrenceType, installments: installments || f.installments }))}
            />
            {!form.frequency && <p className="sm:hidden text-[11px] text-texto-3 mt-1">Escolha a frequência primeiro</p>}
          </div>
        )}

        {/* Parcelamento: cada ocorrência dividida em N parcelas mensais (seguro anual em 12x). */}
        {parcelamentoDisponivel && (
          <CampoParcelamento
            frequency={form.frequency}
            value={form.parcelasPorOcorrencia}
            onChange={v => { setErroParcelamento(''); set('parcelasPorOcorrencia', v) }}
            disabled={!!trava}
            bloqueado={parcelamentoBloqueado}
            erro={erroLimite || erroParcelamento}
          />
        )}

        {/* Automações */}
        <div data-guia="agendamento-form.automacoes" className="sm:col-span-2 bg-surface-2/40 rounded-xl p-3.5 space-y-3">
          <p className="text-[11px] font-medium text-texto-3 uppercase tracking-wider">Automações</p>

          {/* Texto à esquerda (quebra se precisar) e toggle sempre à direita. No celular o
              "N dias antes" desce para uma linha própria (order-last + basis-full). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="flex-1 min-w-0 text-sm text-texto-2 inline-flex items-center">
              Lembrar com Antecedência<Tooltip text={TIPS.remindDaysBefore} />
            </span>
            {form.remindDaysBefore > 0 && (
              <div className="flex items-center gap-2 max-sm:order-last max-sm:basis-full">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={form.remindDaysBefore}
                  onChange={e => set('remindDaysBefore', Math.max(1, Number(e.target.value)))}
                  className="w-14 input text-center text-xs py-1"
                />
                <span className="text-xs text-texto-3 whitespace-nowrap">dias antes</span>
              </div>
            )}
            <Toggle
              value={form.remindDaysBefore > 0}
              onChange={v => set('remindDaysBefore', v ? 3 : 0)}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm text-texto-2 inline-flex items-center">
              Registrar Automático<Tooltip text={TIPS.autoRegister} />
            </span>
            <Toggle value={form.autoRegister} onChange={v => set('autoRegister', v)} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm text-texto-2 inline-flex items-center">
              Sincronizar com a agenda do celular<Tooltip text={TIPS.sincronizarAgenda} />
            </span>
            <Toggle value={form.sincronizarAgenda} onChange={v => set('sincronizarAgenda', v)} />
          </div>
        </div>

        {/* Classificação Gerencial (some com o controle gerencial desligado) */}
        {form.transactionType === 'expense' && gerencialLigado && (
          <div className="sm:col-span-2 bg-surface-2/40 rounded-xl p-3.5 space-y-2">
            <p className="text-[11px] font-medium text-texto-3 uppercase tracking-wider flex items-center">
              Classificação Gerencial <Tooltip text={TIPS.gerencial} />
              {destaques?.includes('grupoGerencial') && <span className="ml-1.5 normal-case tracking-normal text-[11px] font-medium text-aviso" title="Sugestão do assistente: confira">● confira</span>}
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
                <label className="label text-xs uppercase tracking-wide text-reserva" style={{ marginBottom: 0 }}>Função de Reserva{destaques?.includes('reservaFuncaoId') && <span className="ml-1.5 normal-case tracking-normal text-[11px] font-medium text-aviso">● confira</span>}</label>
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
          <div className="sm:col-span-2">
            <label className="label">
              Prévia das próximas ocorrências
              <span className="ml-1.5 text-texto-3 text-[10px] normal-case font-normal">— clique para editar</span>
            </label>
            {parcForm ? (
              <PreviaParcelada schedule={previewSchedule} datas={preview} skipped={form.skipped} conta={selectedAccount} onEditar={setEditingOcc} />
            ) : (
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
            )}
          </div>
        )}

        {/* Histórico das ocorrências já consumidas (pagas, puladas, baixadas) — só leitura. */}
        {initial?.id && <OcorrenciasRegistradas schedule={atual} transactions={transactions} accounts={accounts} />}

        {/* Celular: barra de ações presa ao pé da área que rola (Salvar sempre à mão), acima da
            safe area do iPhone. O fundo cobre o conteúdo que passa por baixo. */}
        <div className="sm:col-span-2 flex gap-3 pt-1 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:bg-surface max-sm:border-t max-sm:border-borda max-sm:pt-3 acoes-safe-bottom">
          <button type="button" className="btn-secondary flex-1" onClick={() => { if (podeDescartar()) onClose() }}>Cancelar</button>
          {podeGravarForm
            ? <button type="submit" disabled={!!mudouFora} data-guia="agendamento-form.salvar" className="btn-primary flex-1">{initial?.id ? 'Salvar' : 'Criar Agendamento'}</button>
            : <p className="flex-1 text-xs text-texto-3 self-center text-center">Somente leitura — seu nível de acesso não permite gravar.</p>}
        </div>
      </form>

      {editingOcc && (
        <OcorrenciaEditModal
          originalDate={editingOcc}
          override={form.overrides[editingOcc]}
          isSkipped={form.skipped.includes(editingOcc)}
          defaultAmount={valorBaseDaChave(previewSchedule, editingOcc)}
          titulo={parcelaDaData(previewSchedule, editingOcc) ? `Parcela ${parcelaDaData(previewSchedule, editingOcc).numero}/${parcelaDaData(previewSchedule, editingOcc).total} de ${editingOcc.split('-').reverse().join('/')}` : null}
          baixaNoMes={baixaNoPeriodo(previewSchedule, editingOcc)}
          onSave={handleSaveOccurrence}
          onClose={() => setEditingOcc(null)}
        />
      )}
    </>
  )
}
