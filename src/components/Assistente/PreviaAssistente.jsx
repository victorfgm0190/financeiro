import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { entrarAutorAssistente } from '../../lib/api'
import { termosPreferencia, preferenciaDe, aplicarPreferencias, preferenciasParaAprender, TIPO_ACAO, TIPO_RECORRENCIA } from '../../lib/assistente/preferencias'
import TransactionForm from '../Transactions/TransactionForm'
import AvisoParecidos from '../Transactions/AvisoParecidos'
import EscolherConta from './EscolherConta'
import EscolherCartaoParcelado from './EscolherCartaoParcelado'
import { parecidosNaCriacao } from '../../lib/casamentoFatura'
import { finaisDoCartao } from '../../lib/cartaoFinais'
import ScheduleForm from '../Schedule/ScheduleForm'
import {
  initialDaSugestao, camposParaConferir, apelidosAprendidos, ROTULO_CAMPO, tipoPreLancamento,
  cartoesParaParcelado, agendamentoParceladoDaSugestao,
} from '../../lib/assistente'
import { papelDaContaApp } from '../../lib/assistente/contas'
import { camposDoPedido, ROTULO_CITADO } from '../../lib/assistente/camposDoPedido'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import { concluirPreLancamento, aprenderApelidos, listarPreLancamentos, listarApelidos } from '../../lib/assistenteApi'
import { usePreLancamentoAoFechar } from './usePreLancamentoAoFechar'
import { agendamentosDoLancamento, agendamentosParecidos, favorecidosParecidos, nomeDoFavorecidoNovo, criterioDoLancamento, chaveCandidato } from '../../lib/assistente/agendamentoDoLancamento'
import CartaoBaixaPrevia, { CartaoContratoPrevia } from './CartaoBaixaPrevia'
import AgendamentoParecido from './AgendamentoParecido'
import PreviaBaixa from './PreviaBaixa'
import CompraEmDolar from './CompraEmDolar'
import JaNaFatura from './JaNaFatura'
import EscolhaAcaoDespesa from './EscolhaAcaoDespesa'
import CartaoAgendamentoPrevia from './CartaoAgendamentoPrevia'
import RateioFaltando from './RateioFaltando'
import { sugerirAcaoDespesa, repeticaoDaPrevia, categoriasProvaveis, ACAO } from '../../lib/assistente/prontidao'
import { categoriaPrincipal } from '../../lib/rateio'
import { buscarCorrespondencias, camposHerdados, categoriaMaisUsada, rotuloFatura } from '../../lib/matchLancamento'
import { cotacaoDolar } from '../../lib/assistenteApi'
import {
  spreadDoCartao, aliquotaIof, iofEmLinhaSeparada, planoCompraEstrangeira, camposDaCompra, categoriaDoIof, iofDe, lancamentoDoIof,
} from '../../lib/cambio'

const ROTULO_HERDADO = { categoryId: 'categoria', costCenter: 'centro de custo', tipoDocumentoId: 'tipo de documento', grupoGerencial: 'grupo gerencial' }
const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

// PRÉVIA do Assistente IA: o formulário EXISTENTE (TransactionForm / ScheduleForm) pré-preenchido.
//   Confirmar (salvar no formulário) → gravação do próprio formulário (addTransaction/addSchedule do
//     AppContext) + apelidos aprendidos com o que o usuário corrigiu; pré-lançamento → 'efetivado'.
//   Fechar sem confirmar (Cancelar, X, fundo, Esc) → guarda em ia_pre_lancamentos ('pendente').
//     Se já veio de um pré-lançamento, ele continua pendente (não duplica).
//   Descartar → não guarda nada (pré-lançamento existente → 'descartado').
//   Duplicidade (lançamento): já existe lançamento/pré-lançamento parecido (mesma conta, valor
//     ±R$ 0,01, data ±3 dias) → aviso no topo. "É o mesmo" não cria nada nem guarda pré-lançamento
//     (o que estava sendo efetivado sai da lista); "É outro" libera o salvar. O formulário repete
//     a checagem ao salvar (valores editados), ignorando o que já foi aceito aqui.
//   Agendamento pendente que bate (lib/assistente/agendamentoDoLancamento: valor, nome, ±7 dias,
//     conta) → antes do formulário: "Dar baixa" abre a PreviaBaixa (fluxo normal do Pagar, com a
//     conta, a data e o valor do lançamento); "É outro" segue para criar o lançamento.
//   Compra em DÓLAR (sugestao.moeda 'USD', valor_original — src/lib/cambio.js): PTAX do dia da compra
//     (/api/cotacao) × (1 + spread do cartão) = R$ ESTIMADO no formulário; ao salvar, a compra leva
//     moeda/valor original/cotação/spread/estimado e, com IOF em linha separada no cartão, nasce o
//     IOF estimado ligado a ela. Sem cotação → o R$ fica para o usuário digitar.
// Item de um LOTE (LoteAssistente): `guardarAoFechar` false (a lista guarda os não salvos) e
// `onConcluido('salvo' | 'mesmo' | 'descartado')` avisa a lista do desfecho.
export default function PreviaAssistente({ ferramenta, sugestao: sugestaoIA, textoOriginal, preId = null, onClose, onToast, guardarAoFechar = true, onConcluido = null }) {
  const {
    transactions, accounts, activeProfileId, updateAccount, pode, schedules, getNextOccurrences, settings, addTransaction, categories, payees,
    gerencialGroups, reserveFunctions, tiposDocumento, setReconciled, vincularLancamento, contratos,
  } = useApp()
  // Enquanto a prévia está aberta, as alterações vão para o histórico como "Assistente IA" + usuário.
  useEffect(() => entrarAutorAssistente(), [])
  // Favorecido cadastrado PARECIDO com o nome que veio (a IA não escolheu um existente): só sugere.
  // "Usar" troca o favorecido da prévia e aprende o apelido (ia_apelidos) para casar direto depois.
  const [favorecidoUsado, setFavorecidoUsado] = useState(null)
  const [favorecidoRecusado, setFavorecidoRecusado] = useState(false)
  const favParecidos = ferramenta === 'registrar_lancamento' && !favorecidoUsado && !favorecidoRecusado ? favorecidosParecidos(sugestaoIA, payees || []) : []
  const sugestao = favorecidoUsado ? { ...sugestaoIA, favorecido_id: favorecidoUsado, favorecido_novo: null } : sugestaoIA
  const usarFavorecido = (nome) => {
    const termo = nomeDoFavorecidoNovo(sugestaoIA)
    setFavorecidoUsado(nome)
    if (termo) aprenderApelidos([{ tipo: 'favorecido', termo, ref_id: nome }]).catch(err => console.warn('[assistente] apelido não salvo:', err.message))
  }
  // Compra parcelada sem conta citada: "Em qual cartão?" antes do formulário. "Não foi no cartão" →
  // pergunta a conta e abre a prévia de AGENDAMENTO parcelado (N × valor/N, centavos na última).
  const [semCartao, setSemCartao] = useState(false)
  const perguntaCartao = !!sugestao.pergunta_cartao
  const agendamento = ferramenta === 'criar_agendamento' || semCartao
  const destaques = camposParaConferir(ferramenta, sugestao)
  // Sem conta na sugestão → "Em qual conta?" (EscolherConta) antes do formulário.
  const [contaEscolhida, setContaEscolhida] = useState(null)
  const initialSugestao = semCartao && contaEscolhida
    ? agendamentoParceladoDaSugestao(sugestao, contaEscolhida)
    : { ...initialDaSugestao(ferramenta, sugestao), ...(contaEscolhida ? { accountId: contaEscolhida } : {}) }
  // O que o pedido citou e o formulário tem campo (grupo gerencial, reserva, tipo de documento,
  // observação, fatura, repetir…), conferido com a conta final; selo "confira" nesses campos.
  const doPedido = camposDoPedido(sugestao, initialSugestao.accountId, {
    accounts, categories, gerencialGroups, reserveFunctions, tiposDocumento, gerencialLigado: controleGerencialAtivo(settings),
  }, { agendamento })
  const initialBase = { ...initialSugestao, ...doPedido.initial }
  const destaquesForm = [...destaques, ...doPedido.citados.filter(c => !destaques.includes(c))]

  // Compra em dólar: cotação → valor estimado em R$ (+ IOF).
  const emDolar = !agendamento && sugestao.moeda === 'USD' && Number(sugestao.valor_original) > 0
  const [ptax, setPtax] = useState(() => (emDolar ? { status: 'carregando' } : null))
  useEffect(() => {
    if (!emDolar) return
    let vivo = true
    cotacaoDolar(sugestao.data || new Date().toISOString().slice(0, 10))
      .then(r => { if (vivo) setPtax({ status: 'ok', data: r.data, venda: Number(r.venda) }) })
      .catch(err => { if (vivo) setPtax({ status: 'erro', erro: err.message }) })
    return () => { vivo = false }
  }, [emDolar, sugestao.data])
  const cartaoDaCompra = emDolar ? accounts.find(a => a.id === initialBase.accountId) || null : null
  const cambio = emDolar && ptax?.status !== 'carregando' ? (() => {
    const sp = spreadDoCartao(cartaoDaCompra, transactions)
    const aliquota = aliquotaIof(settings)
    const separada = iofEmLinhaSeparada(cartaoDaCompra)
    const cotacao = ptax?.status === 'ok' ? ptax.venda : null
    const plano = planoCompraEstrangeira({ valorOriginal: sugestao.valor_original, cotacao, spread: sp.spread, aliquota, separada })
    return { ...sp, aliquota, separada, cotacao, dataCotacao: ptax?.data || null, erro: ptax?.erro || null, ...plano }
  })() : null
  const [catIofEscolhida, setCatIofEscolhida] = useState('')
  const catIof = catIofEscolhida || (emDolar ? categoriaDoIof(transactions) : null) || ''
  const initial = cambio
    ? { ...initialBase, amount: cambio.valorCompra ? String(cambio.valorCompra) : '' }
    : initialBase
  const extrasCompra = cambio
    ? camposDaCompra({ moeda: 'USD', valorOriginal: sugestao.valor_original, cotacao: cambio.cotacao, spread: cambio.spread, dataCotacao: cambio.dataCotacao })
    : null
  // IOF estimado da compra salva (mesmo cartão e data; a fatura sai da data, como a da compra).
  const criarIof = (compra) => {
    if (!cambio?.separada || !compra.id) return
    const valor = iofDe(Number(compra.amount), cambio.aliquota)
    if (valor > 0) addTransaction(lancamentoDoIof(compra, { valor, categoryId: catIof }))
  }
  const cartoes = perguntaCartao ? cartoesParaParcelado(accounts, activeProfileId, transactions) : []
  // "Não foi no cartão": só as contas sugeríveis que não são cartão.
  const contasSemCartao = semCartao
    ? accounts.filter(a => a.type !== 'credit' && papelDaContaApp(a, activeProfileId) === 'sugerivel').map(a => a.id)
    : null
  const { marcar } = usePreLancamentoAoFechar({
    tipo: tipoPreLancamento(ferramenta), payload: { ...sugestao, ferramenta }, textoOriginal, preId, onToast, ativo: guardarAoFechar,
  })

  const [pres, setPres] = useState(null)
  const [aceitos, setAceitos] = useState(null)
  const [existente, setExistente] = useState(null)
  useEffect(() => {
    if (agendamento) return
    let vivo = true
    listarPreLancamentos().then(l => { if (vivo) setPres(l) }).catch(() => { if (vivo) setPres([]) })
    return () => { vivo = false }
  }, [agendamento])
  const parecidos = useMemo(() => {
    if (agendamento) return []
    const conta = accounts.find(a => a.id === initial.accountId)
    return parecidosNaCriacao({ ...initial, amount: Number(initial.amount) }, {
      transactions, preLancamentos: pres || [], closingDay: conta?.closingDay || 14, ignorarIds: preId ? [preId] : [],
    })
  // initial é recriado a cada render a partir da sugestão (estável): depende dela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento, sugestao, contaEscolhida, transactions, accounts, pres, preId])

  // Lançamento de cartão que já está numa fatura (lib/matchLancamento): fatura de referência e as
  // vizinhas abertas, nome/parcela/valor. Forte → passo antes do formulário; fraco → só pergunta.
  const [apelidos, setApelidos] = useState([])
  useEffect(() => {
    if (agendamento) return
    let vivo = true
    listarApelidos().then(l => { if (vivo) setApelidos(l) }).catch(() => {})
    return () => { vivo = false }
  }, [agendamento])
  const [decisaoFatura, setDecisaoFatura] = useState(null)
  const [ajustando, setAjustando] = useState(null)
  const novoDoCartao = {
    accountId: initial.accountId, type: initial.type, amount: Number(initial.amount), date: initial.date,
    payee: initial.payee, description: initial.description, textoOriginal,
    // "Parcela 10/12" de compra que já existe (regra 21): casa pelo número da parcela.
    parcela: sugestao.parcela_atual ? { num: sugestao.parcela_atual.numero, total: sugestao.parcela_atual.total } : null,
  }
  const correspondencias = useMemo(() => {
    if (agendamento || perguntaCartao || Number(initial.installments) > 1 || ptax?.status === 'carregando') return { fortes: [], fracos: [] }
    return buscarCorrespondencias(novoDoCartao, { transactions, accounts, apelidos, faturasFechadas: settings?.faturasFechadas })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento, perguntaCartao, sugestao, contaEscolhida, transactions, accounts, apelidos, settings?.faturasFechadas, ptax])
  // "Parc8" com correspondência: o lançamento herda categoria, centro de custo, tipo de documento e
  // grupo gerencial do existente (só o que a prévia não trouxe). Sem correspondência e sem categoria:
  // a categoria mais usada nos lançamentos do favorecido.
  const herdadoDe = decisaoFatura?.tx || correspondencias.fortes[0]?.tx || null
  const herdados = herdadoDe ? camposHerdados(herdadoDe) : {}
  if (!controleGerencialAtivo(settings)) delete herdados.grupoGerencial
  const preenchidos = Object.fromEntries(Object.entries(herdados).filter(([k]) => !initial[k]))
  const categoriaSugerida = !initial.categoryId && !preenchidos.categoryId && !agendamento
    ? categoriaMaisUsada(initial.payee || initial.description, transactions, { tipo: initial.type || 'expense' })
    : null
  const initialFormBase = { ...initial, ...preenchidos, ...(categoriaSugerida ? { categoryId: categoriaSugerida } : {}) }

  // Prontidão (lib/assistente/prontidao): Só despesa | Despesa + agendamento | Só agendamento. Não
  // pergunta quando o pedido já disse ("e agende", "todo mês"), em compra parcelada nova e em parcela de
  // compra já existente no cartão (essa é tratada pelo JaNaFatura).
  const hojeIso = new Date().toISOString().slice(0, 10)
  const doc = sugestao.documento || {}
  const ehCartaoDaPrevia = accounts.find(a => a.id === initial.accountId)?.type === 'credit'
  const parcelaNoCartao = !!sugestao.parcela_atual && ehCartaoDaPrevia
  const despesaCandidata = !agendamento && ferramenta === 'registrar_lancamento' && (initial.type || 'expense') === 'expense'
    && !(Number(initial.installments) > 1) && !perguntaCartao && !emDolar
  // Preferência aprendida deste perfil para o favorecido/contrato (item 8): acima das regras de
  // palavra-chave; "e agende…" na frase (jaPediuAgendar) continua mandando.
  const termosPref = termosPreferencia({ perfilId: activeProfileId, favorecido: initialFormBase.payee || nomeDoFavorecidoNovo(sugestao) || '', contrato: doc.numero_contrato || '' })
  const prefAcao = preferenciaDe(apelidos, TIPO_ACAO, termosPref)
  const prefRec = preferenciaDe(apelidos, TIPO_RECORRENCIA, termosPref)
  const prontidao = useMemo(() => (despesaCandidata ? aplicarPreferencias(sugerirAcaoDespesa({
    natureza: doc.natureza, tipoDocumento: (tiposDocumento || []).find(t => t.id === initialFormBase.tipoDocumentoId) || null,
    descricao: initialFormBase.description, favorecido: initialFormBase.payee,
    categoriaNome: categories.find(c => c.id === initialFormBase.categoryId)?.name || '', texto: textoOriginal || '',
    numeroContrato: doc.numero_contrato, parcelaAtual: sugestao.parcela_atual, vencimento: doc.vencimento, pago: doc.pago,
    hoje: hojeIso, historico: { transactions, schedules }, contratos: contratos || [],
  }), { acao: prefAcao, recorrencia: prefRec, nome: initialFormBase.payee || '' }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [despesaCandidata, sugestao, contaEscolhida, favorecidoUsado, transactions, schedules, tiposDocumento, categories, textoOriginal, contratos, apelidos, activeProfileId])
  const jaPediuAgendar = !!sugestao.repetir
  const perguntarAcaoBase = despesaCandidata && !jaPediuAgendar && !parcelaNoCartao
  // "e agende…" no pedido já começa em Despesa + agendamento (os dois cartões, sem a pergunta).
  const [acaoDespesa, setAcaoDespesa] = useState(jaPediuAgendar ? ACAO.DESPESA_AGENDAMENTO : null)
  const acaoEfetiva = acaoDespesa
  // Cartão do agendamento (edições do usuário); sem edição, o que a prévia calculou.
  const [cartaoAg, setCartaoAg] = useState(null)
  const [veioDosCartoes, setVeioDosCartoes] = useState(false)
  const recorrencia = sugestao.repetir || prontidao?.recorrenciaSugerida || null
  const diaRepeticao = sugestao.repetir_dia || (doc.vencimento ? Number(doc.vencimento.slice(8, 10)) : null)
  const repeticaoCalculada = repeticaoDaPrevia({ data: initialFormBase.date || hojeIso, recorrencia: recorrencia || 'monthly', dia: diaRepeticao, ate: sugestao.repetir_ate, vezes: sugestao.repetir_vezes, parcelasRestantes: prontidao?.parcelasRestantes })
  const cfgAgendamento = cartaoAg || (repeticaoCalculada ? {
    ativo: true, repeatFrequency: repeticaoCalculada.repeatFrequency, repeatOccurrenceType: repeticaoCalculada.repeatOccurrenceType,
    repeatInstallments: repeticaoCalculada.repeatInstallments || 2, repeatStartDate: repeticaoCalculada.repeatStartDate,
  } : null)
  const repeticao = acaoEfetiva === ACAO.DESPESA_AGENDAMENTO ? repeticaoCalculada : null
  const contrato = prontidao?.numeroContrato || doc.numero_contrato || null
  // Nº de um contrato CADASTRADO → cartão "Vincular ao contrato X" (marcado): o lançamento leva o contrato.
  const contratoCadastrado = prontidao?.contratoCadastrado || null
  const [vincularContrato, setVincularContrato] = useState(true)
  const contratoIdVinculo = contratoCadastrado && vincularContrato ? contratoCadastrado.id : null
  const reaproveitar = prontidao?.reaproveitar || null
  // Rateio citado (regra 22): linhas editáveis; soma ≠ total → pergunta onde vai a diferença.
  const [rateioResolvido, setRateioResolvido] = useState(null)
  const rateioBase = (sugestao.rateio || []).filter(l => l.categoria_id && l.valor > 0).map(l => ({ categoriaId: l.categoria_id, valor: l.valor, descricao: l.termo || '' }))
  const rateioLinhas = rateioResolvido?.linhas || rateioBase
  // Parte citada sem categoria reconhecida entra no "Faltam … Em qual categoria?" (senão sumiria).
  const semCategoriaRateio = (sugestao.rateio || []).filter(l => !l.categoria_id && l.valor > 0).reduce((t, l) => t + Number(l.valor), 0)
  const faltamRateio = rateioResolvido ? 0 : Math.round(((Number(sugestao.rateio_faltam) || 0) + semCategoriaRateio) * 100) / 100
  const somaRateio = Math.round(rateioLinhas.reduce((s, l) => s + Number(l.valor), 0) * 100) / 100
  const preencherVazio = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k, v]) => v && !initialFormBase[k]))
  const initialForm = {
    ...initialFormBase,
    ...preencherVazio(reaproveitar),
    // Nº do contrato no campo próprio (não mais na observação/descrição).
    ...(contrato ? { numeroContrato: contrato } : {}),
    ...(contratoIdVinculo ? { contratoId: contratoIdVinculo } : {}),
    ...(repeticao ? {
      repeatFrequency: repeticao.repeatFrequency, repeatOccurrenceType: repeticao.repeatOccurrenceType,
      repeatInstallments: repeticao.repeatInstallments, repeatStartDate: repeticao.repeatStartDate,
    } : (acaoEfetiva === ACAO.SO_DESPESA ? { repeatFrequency: null } : {})),
    ...(rateioLinhas.length ? { rateio: rateioLinhas, categoryId: categoriaPrincipal(rateioLinhas) } : {}),
    ...(rateioResolvido?.amount ? { amount: String(rateioResolvido.amount) } : {}),
  }
  // "Só agendamento" (conta ainda a pagar): o agendamento a partir do vencimento, com a recorrência sugerida.
  const initialSoAgendamento = acaoEfetiva === ACAO.SO_AGENDAMENTO ? {
    ...initialDaSugestao('criar_agendamento', veioDosCartoes && cfgAgendamento ? {
      // Despesa desmarcada nos cartões: o agendamento com o que estava no cartão dele.
      ...sugestao, vencimento: cfgAgendamento.repeatStartDate, recorrencia: cfgAgendamento.repeatFrequency,
      parcelas: cfgAgendamento.repeatOccurrenceType === 'installment' ? cfgAgendamento.repeatInstallments : null,
    } : {
      ...sugestao, vencimento: doc.vencimento || sugestao.data,
      recorrencia: recorrencia === 'installment' ? 'monthly' : (recorrencia || 'once'),
      parcelas: recorrencia === 'installment' && prontidao?.parcelasRestantes ? prontidao.parcelasRestantes + 1 : null,
    }),
    ...preencherVazio(reaproveitar),
    categoryId: initialFormBase.categoryId || reaproveitar?.categoryId || '',
    tipoDocumentoId: initialFormBase.tipoDocumentoId || '',
    description: initialFormBase.description || sugestao.descricao || '',
    numeroContrato: contrato || '',
  } : null

  // Agendamento pendente que este lançamento paga (compra parcelada não entra: vira N parcelas).
  const [parecidoDispensado, setParecidoDispensado] = useState(false)
  const [baixa, setBaixa] = useState(null)
  const [valorNasProximas, setValorNasProximas] = useState(false)
  const lancAgend = { ...initial, amount: Number(initial.amount), ...(extrasCompra ? { estimado: true } : {}), contrato, contratoId: contratoCadastrado?.id || null }
  const agendamentosQueBatem = useMemo(() => {
    if (agendamento || perguntaCartao || Number(initial.installments) > 1 || ptax?.status === 'carregando') return []
    return agendamentosDoLancamento(lancAgend, { schedules, accounts, transactions, getNextOccurrences })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento, perguntaCartao, sugestao, contaEscolhida, schedules, accounts, transactions, getNextOccurrences, ptax])
  // Sem casamento certo: agendamento PARECIDO (qualquer valor, até 15 dias) → só a pergunta "É ele?".
  const agendamentosParecidosLista = useMemo(() => {
    if (agendamento || perguntaCartao || Number(initial.installments) > 1 || ptax?.status === 'carregando') return []
    return agendamentosParecidos(lancAgend, { schedules, accounts, transactions, getNextOccurrences })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento, perguntaCartao, sugestao, contaEscolhida, schedules, accounts, transactions, getNextOccurrences, ptax])
  // Cartão da baixa sugerida: marcado por padrão no 1º candidato; o usuário troca/desmarca.
  const [baixaEscolha, setBaixaEscolha] = useState(null) // { on, chave }
  const baixaAlvo = !agendamentosQueBatem.length || acaoEfetiva === ACAO.SO_AGENDAMENTO ? null
    : agendamentosQueBatem.find(c => chaveCandidato(c) === baixaEscolha?.chave) || agendamentosQueBatem[0]
  const baixaMarcada = !!baixaAlvo && (baixaEscolha?.on ?? true)
  // Despesa que paga um agendamento existente: sem a pergunta "Despesa + agendamento".
  const perguntarAcao = perguntarAcaoBase && !baixaMarcada
  const darBaixa = (candidato, { usarNasProximas = false } = {}) => { marcar('baixa'); setValorNasProximas(usarNasProximas); setBaixa(candidato) }

  // "É o mesmo": nada é criado; o pré-lançamento que estava sendo efetivado é baixado contra o
  // existente (ou descartado, se o parecido é outro pré-lançamento).
  const ehOMesmo = (tx) => {
    marcar('mesmo')
    onConcluido?.('mesmo')
    if (preId) {
      const req = tx && !tx._pre ? concluirPreLancamento(preId, 'efetivado', tx.id) : concluirPreLancamento(preId, 'descartado')
      req.catch(err => onToast?.(`Não consegui baixar o pré-lançamento: ${err.message}`))
    }
  }

  const onSalvo = (form, id) => {
    marcar('salvo')
    onConcluido?.('salvo')
    // Cartão da baixa marcado: o lançamento recém-criado vira o pagamento da ocorrência (vínculo).
    if (baixaMarcada && id) {
      const r = vincularLancamento({
        txId: id, scheduleId: baixaAlvo.schedule_id, data: baixaAlvo.ocorrencia,
        tx: { ...form, id, amount: Number(form.amount) || 0 },
      })
      if (r?.ok === false) onToast?.(`Lançamento salvo, mas a baixa não foi feita: ${r.motivo}`)
    }
    if (cambio && id) criarIof({ id, accountId: form.accountId, date: form.date, amount: form.amount, payee: form.payee, description: form.description })
    // Preferência (item 8): a escolha feita na pergunta, quando diferente do que as regras sugeriram.
    const soAgendamento = acaoEfetiva === ACAO.SO_AGENDAMENTO
    const prefs = perguntarAcao && prontidao ? preferenciasParaAprender({
      termos: termosPref, prefAcao, prefRec,
      acaoEscolhida: soAgendamento ? ACAO.SO_AGENDAMENTO : (form?.repeat ? ACAO.DESPESA_AGENDAMENTO : ACAO.SO_DESPESA),
      acaoDasRegras: prontidao.acaoDasRegras,
      recEscolhida: soAgendamento ? (form?.frequency || null) : (form?.repeat ? (form.repeatOccurrenceType === 'installment' ? 'installment' : form.repeatFrequency) : null),
      recDasRegras: prontidao.recorrenciaDasRegras,
    }) : []
    const itens = [...apelidosAprendidos(sugestao, form), ...prefs]
    if (itens.length) aprenderApelidos(itens).catch(err => console.warn('[assistente] apelidos não salvos:', err.message))
    if (preId) concluirPreLancamento(preId, 'efetivado', id || null).catch(err => onToast?.(`Lançamento salvo, mas o pré-lançamento não foi baixado: ${err.message}`))
  }

  const descartar = () => {
    marcar('descartado')
    onConcluido?.('descartado')
    if (preId) concluirPreLancamento(preId, 'descartado').catch(err => onToast?.(`Não consegui descartar: ${err.message}`))
    onClose()
  }

  // "final 4541" sem cartão cadastrado e o usuário escolheu um cartão → oferece salvar o final nele.
  const cartaoEscolhido = contaEscolhida ? accounts.find(a => a.id === contaEscolhida && a.type === 'credit') : null
  const finalNovo = sugestao.final_sem_cartao && cartaoEscolhido && !finaisDoCartao(cartaoEscolhido).includes(sugestao.final_sem_cartao)
    && pode('contas', 'editar') ? sugestao.final_sem_cartao : null
  const salvarFinal = () => {
    updateAccount(cartaoEscolhido.id, { cartaoFinais: [...finaisDoCartao(cartaoEscolhido), finalNovo] })
    onToast?.(`Final ${finalNovo} salvo no cartão ${cartaoEscolhido.apelido || cartaoEscolhido.name}.`)
  }

  if (existente) return <TransactionForm initial={existente} onClose={onClose} onToast={onToast} />
  if (ajustando) {
    return <TransactionForm initial={ajustando.tx} ajustes={ajustando.ajustes} destaques={Object.keys(ajustando.ajustes)} onClose={onClose} onToast={onToast} />
  }
  if (!decisaoFatura && correspondencias.fortes.length > 0) {
    return (
      <JaNaFatura fortes={correspondencias.fortes} novo={novoDoCartao} textoOriginal={textoOriginal} parcela={novoDoCartao.parcela}
        onConfirmar={(tx) => {
          setReconciled([tx.id], true)
          ehOMesmo(tx)
          onToast?.('Lançamento existente conferido. Nada novo foi criado.')
          onClose()
        }}
        onAjustar={(tx, ajustes) => { ehOMesmo(tx); setAjustando({ tx, ajustes }) }}
        onLancar={(m) => setDecisaoFatura(m)}
        onDescartar={descartar} />
    )
  }
  if (baixa) {
    return (
      <PreviaBaixa criterio={criterioDoLancamento(lancAgend)} candidato={baixa} textoOriginal={textoOriginal} preId={preId} onClose={onClose} onToast={onToast}
        extrasLancamento={extrasCompra} onBaixaSalva={cambio ? criarIof : null} guardarAoFechar={guardarAoFechar} onConcluido={onConcluido}
        valorNasProximas={valorNasProximas} />
    )
  }
  if (!parecidoDispensado && !agendamentosQueBatem.length && agendamentosParecidosLista.length > 0) {
    return (
      <AgendamentoParecido candidato={agendamentosParecidosLista[0]} valor={lancAgend.amount} textoOriginal={textoOriginal}
        onBaixa={darBaixa} onNaoE={() => setParecidoDispensado(true)} onDescartar={descartar} />
    )
  }

  return (
    <div className="space-y-3">
      {decisaoFatura && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-perigo/40 bg-perigo/10 px-3 py-2 text-xs text-texto-1">
          <span className="font-semibold text-perigo shrink-0">Possível duplicidade:</span>
          <span className="break-words">
            já existe {decisaoFatura.tx.description || decisaoFatura.tx.payee} ({fmtMoeda(decisaoFatura.tx.amount)}) na Fatura {rotuloFatura(decisaoFatura.fatura)}. Confira antes de salvar.
          </span>
        </div>
      )}
      {!decisaoFatura && correspondencias.fracos.length > 0 && (
        <JaNaFatura fracos={correspondencias.fracos} novo={novoDoCartao}
          onConfirmar={(tx) => {
            setReconciled([tx.id], true)
            ehOMesmo(tx)
            onToast?.('Lançamento existente conferido. Nada novo foi criado.')
            onClose()
          }}
          onAjustar={(tx, ajustes) => { ehOMesmo(tx); setAjustando({ tx, ajustes }) }}
          onLancar={(m) => setDecisaoFatura(m)}
          onDescartar={descartar} />
      )}
      {baixaAlvo && (
        <CartaoBaixaPrevia candidatos={agendamentosQueBatem} alvo={baixaAlvo} marcado={baixaMarcada}
          onMarcar={(on) => setBaixaEscolha({ on, chave: chaveCandidato(baixaAlvo) })}
          onEscolher={(c) => setBaixaEscolha({ on: true, chave: chaveCandidato(c) })}
          onAbrirCompleta={(c) => darBaixa(c)} />
      )}
      {contratoCadastrado && <CartaoContratoPrevia contrato={contratoCadastrado} marcado={vincularContrato} onMarcar={setVincularContrato} />}
      {perguntarAcao && <EscolhaAcaoDespesa prontidao={prontidao} acao={acaoDespesa} onEscolher={setAcaoDespesa} />}
      {parcelaNoCartao && correspondencias.fortes.length === 0 && correspondencias.fracos.length === 0 && (() => {
        // Sem a parcela nas faturas abertas: pode estar numa fatura já FECHADA — avisa e deixa decidir.
        const naFechada = buscarCorrespondencias(novoDoCartao, { transactions, accounts, apelidos, faturasFechadas: null }).fortes.find(m => m.parcelaIgual)
        return (
          <p className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1">
            {naFechada
              ? `A parcela ${sugestao.parcela_atual.numero}/${sugestao.parcela_atual.total} já está na fatura ${rotuloFatura(naFechada.fatura)}, que está FECHADA. Lance só se for mesmo outra cobrança.`
              : `Não achei a parcela ${sugestao.parcela_atual.numero}/${sugestao.parcela_atual.total} desta compra neste cartão (fatura de referência e vizinhas abertas). Confira antes de lançar.`}
          </p>
        )
      })()}
      {faltamRateio !== 0 && rateioLinhas.length > 0 && (
        <RateioFaltando faltam={faltamRateio} soma={somaRateio} categories={categories}
          categorias={categoriasProvaveis(transactions, { hoje: hojeIso, excluir: rateioLinhas.map(l => l.categoriaId) })}
          onCategoria={(id) => setRateioResolvido({ linhas: [...rateioLinhas, { categoriaId: id, valor: faltamRateio, descricao: '' }] })}
          onAjustarTotal={() => setRateioResolvido({ linhas: rateioLinhas, amount: somaRateio })} />
      )}
      {(Object.keys(preenchidos).length > 0 || categoriaSugerida) && (
        <p className="rounded-lg border border-borda-forte bg-surface-2 px-3 py-2 text-xs text-texto-2">
          {Object.keys(preenchidos).length > 0
            ? `Herdado do lançamento existente: ${Object.keys(preenchidos).map(k => ROTULO_HERDADO[k]).join(', ')}.`
            : 'Categoria sugerida pela mais usada com este favorecido.'}
        </p>
      )}
      {!aceitos && parecidos.length > 0 && (
        <AvisoParecidos
          parecidos={parecidos}
          accounts={accounts}
          onMesmo={() => { ehOMesmo(parecidos[0]); onToast?.('Nada foi salvo: já estava lançado.'); onClose() }}
          onAbrir={(tx) => { ehOMesmo(tx); setExistente(tx) }}
          onOutro={() => setAceitos(parecidos.map(t => (t._pre ? t.preId : t.id)))}
        />
      )}
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-texto-1">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-primary-fg" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Prévia do assistente — {agendamento ? 'agendamento' : 'lançamento'}. Nada foi salvo ainda.</p>
          {destaques.length > 0 && (
            <p className="mt-0.5 text-aviso">Confira: {destaques.map(c => ROTULO_CAMPO[c] || c).join(', ')}.</p>
          )}
          {doPedido.citados.length > 0 && (
            <p className="mt-0.5 text-texto-2">Do seu pedido: {doPedido.citados.map(c => ROTULO_CITADO[c] || c).join(', ')}.</p>
          )}
          {sugestao.aviso_parcelas && <p className="mt-0.5 text-aviso">Parcelado: {sugestao.aviso_parcelas} (valor total).</p>}
          {sugestao.linha_digitavel && (
            <p className="mt-0.5 text-aviso break-all">
              Confira a linha digitável com o boleto: <span className="font-mono">{sugestao.linha_digitavel}</span>{' '}
              <button type="button" className="underline text-primary-fg" onClick={() => navigator.clipboard?.writeText(sugestao.linha_digitavel)}>copiar</button>
            </p>
          )}
          {textoOriginal && <p className="mt-0.5 whitespace-pre-wrap break-words text-texto-3">“{textoOriginal}”</p>}
        </div>
        <button type="button" onClick={descartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
      {favParecidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1" role="status">
          <span className="flex-1 min-w-0 break-words">
            <strong>{nomeDoFavorecidoNovo(sugestaoIA)}</strong> pode ser o favorecido {favParecidos.map((f, k) => <span key={f}>{k ? ' ou ' : ''}<strong>{f}</strong></span>)}. Usar?
          </span>
          {favParecidos.map(f => (
            <button key={f} type="button" className="btn-secondary text-xs min-h-[36px]" onClick={() => usarFavorecido(f)}>
              {favParecidos.length > 1 ? `Usar ${f}` : 'Usar'}
            </button>
          ))}
          <button type="button" className="text-xs text-texto-2 hover:text-texto-1 min-h-[36px] px-2" onClick={() => setFavorecidoRecusado(true)}>Não</button>
        </div>
      )}
      {finalNovo && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borda-forte bg-surface-2 px-3 py-2 text-xs text-texto-2">
          <span className="flex-1 min-w-0">O final {finalNovo} não está cadastrado em {cartaoEscolhido.apelido || cartaoEscolhido.name}.</span>
          <button type="button" className="btn-secondary text-xs min-h-[36px]" onClick={salvarFinal}>
            Salvar {finalNovo} como final deste cartão
          </button>
        </div>
      )}
      {emDolar && initial.accountId && (
        <CompraEmDolar valorOriginal={sugestao.valor_original} cambio={cambio} carregando={ptax?.status === 'carregando'}
          categories={categories} catIof={catIof} onCatIof={setCatIofEscolhida} />
      )}
      {perguntaCartao && !contaEscolhida && !semCartao
        ? <EscolherCartaoParcelado valor={sugestao.valor} parcelas={sugestao.parcelas} cartoes={cartoes}
            onCartao={setContaEscolhida} onSemCartao={() => setSemCartao(true)} />
        : !initial.accountId
        ? <EscolherConta accounts={accounts} activeProfileId={activeProfileId} onEscolher={setContaEscolhida}
            opcoes={semCartao ? contasSemCartao : (sugestao.contas_opcoes || null)} finalSemCartao={sugestao.final_sem_cartao || null}
            titulo={semCartao ? `Em qual conta? Vira um agendamento de ${sugestao.parcelas} parcelas mensais.` : null} />
        : emDolar && ptax?.status === 'carregando'
        ? null
        : agendamento
        ? <ScheduleForm initial={initial} destaques={destaquesForm} onSalvo={onSalvo} onClose={onClose} onAviso={onToast} />
        : initialSoAgendamento
        ? (
          <div className="space-y-3">
            {veioDosCartoes && (
              <label className="flex items-center gap-2.5 rounded-xl border-2 border-borda bg-surface px-3 min-h-[48px] cursor-pointer opacity-70">
                <input type="checkbox" className="accent-primary w-5 h-5" checked={false}
                  onChange={() => { setAcaoDespesa(ACAO.DESPESA_AGENDAMENTO); setVeioDosCartoes(false) }} />
                <span className="text-sm font-semibold text-texto-1">Despesa</span>
                <span className="text-xs text-texto-3">desmarcada — só o agendamento será gravado</span>
              </label>
            )}
            <ScheduleForm key="so-agendamento" initial={initialSoAgendamento} destaques={destaquesForm} onSalvo={onSalvo} onClose={onClose} onAviso={onToast} />
          </div>
        )
        : acaoEfetiva === ACAO.DESPESA_AGENDAMENTO && cfgAgendamento
        ? (
          // Cartões separados: Despesa (o formulário) + Agendamento; "Confirmar tudo" grava só os marcados.
          <div className="space-y-3">
            <section className="rounded-xl border-2 border-primary/50 bg-surface p-3 space-y-3" aria-label="Cartão da despesa">
              <label className="flex items-center gap-2.5 cursor-pointer min-h-[40px]">
                <input type="checkbox" className="accent-primary w-5 h-5" checked
                  onChange={() => { setCartaoAg({ ...cfgAgendamento, ativo: true }); setVeioDosCartoes(true); setAcaoDespesa(ACAO.SO_AGENDAMENTO) }} />
                <span className="text-sm font-semibold text-texto-1">Despesa</span>
              </label>
              <TransactionForm key={`${favorecidoUsado || ''}|cartoes|${rateioResolvido ? 'r' : ''}`} initial={initialForm} destaques={destaquesForm} onSalvo={onSalvo} onClose={onClose} onToast={onToast}
                preLancamentos={pres || []} parecidosAceitos={[...(aceitos || []), ...(preId ? [preId] : [])]} onMesmo={ehOMesmo}
                extrasNovo={extrasCompra} rotuloGravar="Confirmar tudo"
                repeticaoExterna={{
                  repeat: cfgAgendamento.ativo, repeatFrequency: cfgAgendamento.repeatFrequency, repeatOccurrenceType: cfgAgendamento.repeatOccurrenceType,
                  repeatInstallments: cfgAgendamento.repeatInstallments, repeatStartDate: cfgAgendamento.repeatStartDate,
                  repeatSufixo: contrato ? `Contrato nº ${contrato}` : '',
                }} />
            </section>
            <CartaoAgendamentoPrevia cfg={cfgAgendamento} onChange={setCartaoAg} rateio={rateioLinhas} categories={categories} motivo={prontidao?.motivo} />
          </div>
        )
        : <TransactionForm key={`${favorecidoUsado || ''}|${acaoEfetiva || ''}|${rateioResolvido ? 'r' : ''}`} initial={initialForm} destaques={destaquesForm} onSalvo={onSalvo} onClose={onClose} onToast={onToast}
            rotuloGravar={baixaMarcada || contratoIdVinculo ? 'Confirmar tudo' : null}
            preLancamentos={pres || []} parecidosAceitos={[...(aceitos || []), ...(preId ? [preId] : [])]} onMesmo={ehOMesmo}
            extrasNovo={extrasCompra} />}
    </div>
  )
}
