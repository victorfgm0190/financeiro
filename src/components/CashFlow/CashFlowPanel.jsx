import { useCallback, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, AlertTriangle, Calendar, Plus, Pencil, Trash2,
  CheckCircle2, RotateCcw, CalendarClock, ChevronDown, ChevronRight, SlidersHorizontal, CheckCircle, Circle,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { computeFluxoCaixa, occEfetiva } from '../../lib/fluxoCaixa'
import { montarLinhasSimuladas, patchAplicarData, aplicarDatasNosAgendamentos, anotarLinhasProvisorias } from '../../lib/fluxoCaixaDatas'
import {
  HORIZONTES, rotuloModo, consultasDoPerfil, resolverConsultaAtiva, listaComVirtual, idPadrao,
  erroNome, nomeDeCopia, projetadoNoFim, ID_CONSULTA_VIRTUAL, contasDaConsulta, somarDias,
  ultimoDiaDeSaldo, situacaoSaldo, linhasFuturas, tipoEvento, contaDaLinha, minimoProjetado,
  serieDiaria, totalEmAtraso, estadoMarcacao, marcarLinhas,
} from '../../lib/fluxoConsultas'
import { hojeStr } from '../../lib/saldos'
import { useFluxoConsultas } from '../../hooks/useFluxoConsultas'
import { useFluxoProvisorios } from '../../hooks/useFluxoProvisorios'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useThemeColors } from '../../hooks/useTheme'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TipoDocumentoBadge from '../shared/TipoDocumentoBadge'
import SeloParcela from '../shared/SeloParcela'
import SeloContrato from '../Contratos/SeloContrato'
import { criarSeloParcela } from '../../lib/numeroParcela'
import { resolverTipoDocumento, itemDaLinhaFluxo } from '../../lib/tiposDocumento'
import { statusConfirmacaoLinha, STATUS_CONFIRMACAO } from '../../lib/fluxoStatus'
import { novoLoteId, historicoDataAgendamento } from '../../lib/historico'
import { serieKeyDe } from '../../lib/camposSerie'
import ProvisorioForm from '../Reports/ProvisorioForm'
import ConsultaModal from './ConsultaModal'
import ConsultaCard from './ConsultaCard'
import EfetivarModal from './EfetivarModal'
import MudarDataModal from './MudarDataModal'
import FluxoMobileLista, { FluxoSheet } from './FluxoMobileLista'
import { MASCARA, lerOcultar } from '../../mobile/ocultarValores'
import { HORIZONTES_MOBILE, marcadoresLinhaMobile } from '../../lib/fluxoMobile'

const round2 = n => Math.round(n * 100) / 100
const SEM_EXCLUSOES = new Set()
const SEM_DATAS = new Map()
const SEM_OVERRIDES = {}
// Início "desde sempre" para listar as ocorrências pendentes ANTERIORES a hoje (em atraso).
const INICIO_ATRASO = '0001-01-01'
// Última consulta escolhida, POR PERFIL ({ [perfilId | '_tudo']: consultaId }). Só conveniência
// de UI: storage indisponível → abre a padrão.
const LS_CONSULTA_ATIVA = 'finup_fluxo_consulta_ativa'
function lerConsultasLembradas() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_CONSULTA_ATIVA) || '{}')
    return o && typeof o === 'object' ? o : {}
  } catch { return {} }
}
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

const BADGE = {
  agendamento: 'bg-surface-2 text-texto-2',
  'lançamento': 'bg-surface-2 text-texto-2',
  envelope: 'bg-surface-2 text-texto-2',
  'provisório': 'text-texto-2 outline-dashed outline-1 -outline-offset-1 outline-borda-forte',
}
const SITUACAO = {
  atualizada: 'text-primary-fg',
  recente: 'text-primary-fg',
  parada: 'bg-aviso/15 text-aviso px-1.5 py-0.5 rounded',
  sem: 'text-texto-3',
}

const CustomTooltip = ({ active, payload, label, oculto }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-borda-forte rounded-lg p-3 text-xs shadow-xl">
      <p className="text-texto-2 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">{p.name}: {oculto ? MASCARA : fmt(p.value)}</p>
      ))}
    </div>
  )
}

// Fluxo de Caixa Futuro: projeção de HOJE até hoje + horizonte para as contas da CONSULTA ativa.
// Cálculo = computeFluxoCaixa (o mesmo do relatório Fluxo de Caixa e dos KPIs do Painel).
// Provisórios e datas provisórias de agendamento são os MESMOS do relatório (gravados no banco);
// só as linhas desmarcadas (e a data simulada de envelope/lançamento) ficam em memória e zeram
// ao recarregar ou trocar de consulta.
export default function CashFlowPanel({ setActivePage }) {
  const {
    profileAccounts: accounts, profileTransactions: transactions, profileSchedules: schedules,
    getOccurrencesProjecao: getNextOccurrences, envelopes, accountGroups, reserveFunctions,
    profiles, activeProfileId, updateSchedule, addTransaction, mergeScheduleFromDb,
    datasProvisorias, salvarDataProvisoria, removerDatasProvisorias, tiposDocumento, registrarEdicao,
    toggleScheduleConfirmado, categories, projetarEtapaA, pode,
  } = useApp()
  // Nível de acesso (src/lib/permissoes.js): consultas, provisórios e datas simuladas = fluxo;
  // a flag Confirmado é do agendamento; "Efetivar" grava um agendamento/lançamento.
  const podeIncluirF = pode('fluxo', 'incluir')
  const podeEditarF = pode('fluxo', 'editar')
  const podeExcluirF = pode('fluxo', 'excluir')
  const podeConfirmar = pode('agendamentos', 'editar')
  const podeEfetivar = podeEditarF && (pode('agendamentos', 'incluir') || pode('lancamentos', 'incluir'))
  const { consultas, salvarConsulta, excluirConsulta } = useFluxoConsultas()
  const { provisorios, salvarProvisorio, excluirProvisorio, efetivarComoAgendamento } = useFluxoProvisorios()

  // Coluna "Doc.": linha → agendamento/lançamento de origem → tipo (gravado ou fallback CC/ENV/RES).
  const ctxDoc = useMemo(() => ({
    txPorId: new Map(transactions.map(t => [t.id, t])),
    agPorId: new Map(schedules.map(s => [s.id, s])),
    contaPorId: new Map(accounts.map(a => [a.id, a])),
  }), [transactions, schedules, accounts])
  const docDaLinha = (r) => resolverTipoDocumento(itemDaLinhaFluxo(r, ctxDoc), tiposDocumento)
  // Selo "x/N" das linhas REALIZADAS geradas por agendamento parcelado (data_ocorrencia gravada).
  const seloDe = useMemo(() => criarSeloParcela(schedules), [schedules])
  const seloDaLinha = (r) => (r.real || r._lancamento ? seloDe(ctxDoc.txPorId.get(r._key)) : null)
  // Selo "Contrato" (e "Projetado"): parcela prevista, ou lançamento gerado por parcela de contrato.
  const contratoDaLinha = (r) => {
    const s = r._scheduleId ? ctxDoc.agPorId.get(r._scheduleId) : null
    if (s?.contratoId) return { schedule: s }
    const t = r.real || r._lancamento ? ctxDoc.txPorId.get(r._key) : null
    const origem = t?.scheduleId ? ctxDoc.agPorId.get(t.scheduleId) : null
    if (origem?.contratoId) return { schedule: origem }
    return t?.contratoId ? { contratoId: t.contratoId } : null
  }

  const [toast, setToast] = useState(null)
  const avisar = (message, variant = 'success') => setToast({ message, variant })

  // Coluna "Status": flag Confirmado / A confirmar do agendamento de origem (a mesma de
  // Agendamentos), só na linha do próximo vencimento; as posteriores são "A confirmar" fixo.
  // Só exibição + toggle — não entra em saldo, entradas ou saídas.
  const alternarConfirmado = (st) => {
    const s = ctxDoc.agPorId.get(st.scheduleId)
    toggleScheduleConfirmado(st.scheduleId)
    const agora = st.status === STATUS_CONFIRMACAO.CONFIRMADO ? 'A confirmar' : 'Confirmado'
    avisar(`${s?.description || 'Agendamento'}: ${agora}`)
  }
  const statusCelula = (r, compacto = false) => {
    const st = statusConfirmacaoLinha(r, ctxDoc)
    if (!st) return <span className="text-texto-3 text-xs">—</span>
    const ok = st.status === STATUS_CONFIRMACAO.CONFIRMADO
    const rotulo = ok ? 'Confirmado' : 'A confirmar'
    const soIcone = compacto || isMobile
    if (!st.confirmavel || !podeConfirmar) {
      return (
        <span
          title="Só o próximo vencimento pode ser confirmado"
          aria-label={rotulo}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap bg-surface-hover/40 text-texto-3 cursor-default"
        >
          <Circle size={10} />
          {!soIcone && rotulo}
        </span>
      )
    }
    return (
      <button
        type="button"
        onClick={() => alternarConfirmado(st)}
        title={ok ? 'Confirmado — clique para marcar como A confirmar' : 'A confirmar — clique para marcar como Confirmado'}
        aria-label={rotulo}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
          ok ? 'bg-primary/15 text-primary-fg hover:bg-primary/25' : 'bg-surface-hover/60 text-texto-2 hover:bg-surface-hover'
        }`}
      >
        {ok ? <CheckCircle size={10} /> : <Circle size={10} />}
        {!soIcone && rotulo}
      </button>
    )
  }

  // ── Consulta ativa e horizonte ─────────────────────────────────────────────
  const visiveis = useMemo(() => consultasDoPerfil(consultas, activeProfileId), [consultas, activeProfileId])
  const cartoes = useMemo(() => listaComVirtual(visiveis), [visiveis])
  const padraoId = idPadrao(visiveis)
  const perfilChave = activeProfileId || '_tudo'
  const [lembradas, setLembradas] = useState(lerConsultasLembradas)
  const ativaId = lembradas[perfilChave] || null
  const setAtivaId = (id) => {
    setLembradas(prev => {
      const next = { ...prev }
      if (id) next[perfilChave] = id
      else delete next[perfilChave]
      try { localStorage.setItem(LS_CONSULTA_ATIVA, JSON.stringify(next)) } catch { /* storage indisponível */ }
      return next
    })
  }
  const consulta = useMemo(() => resolverConsultaAtiva(visiveis, ativaId), [visiveis, ativaId])
  const isMobile = useIsMobile()
  const cor = useThemeColors()
  // "Olho" do mobile (ligado no Início): no celular, mascara os valores da tela. Desktop sem efeito.
  const [ocultarPref] = useState(lerOcultar)
  const oculto = isMobile && ocultarPref
  const vf = (n, f = fmt) => (oculto ? MASCARA : f(n))
  const [consultaExcluir, setConsultaExcluir] = useState(null)
  // Horizonte escolhido vale para a consulta em que foi escolhido; trocar de consulta volta ao
  // horizonte padrão dela. Mesmo esquema (derivado, sem efeito) para os overrides da tabela,
  // as linhas desmarcadas e as datas só de tela.
  const [horizonteSel, setHorizonteSel] = useState({ consultaId: null, h: null })
  const horizonte = horizonteSel.consultaId === consulta.id ? horizonteSel.h : consulta.horizonte_padrao
  const [ovrSel, setOvrSel] = useState({ consultaId: null, v: SEM_OVERRIDES })
  const ovr = ovrSel.consultaId === consulta.id ? ovrSel.v : SEM_OVERRIDES
  const setOvr = (k, v) => setOvrSel({ consultaId: consulta.id, v: { ...ovr, [k]: v } })
  const incluirEnvelopes = ovr.incluir_envelopes ?? consulta.incluir_envelopes
  const ocultarReserva = ovr.ocultar_reserva ?? consulta.ocultar_reserva

  const [selExcluidas, setSelExcluidas] = useState({ escopo: null, keys: SEM_EXCLUSOES })
  const excluidas = selExcluidas.escopo === consulta.id ? selExcluidas.keys : SEM_EXCLUSOES
  const alterarExcluidas = (fn) => setSelExcluidas(prev => {
    const next = new Set(prev.escopo === consulta.id ? prev.keys : SEM_EXCLUSOES)
    fn(next)
    return { escopo: consulta.id, keys: next }
  })
  const restaurarLinhas = () => setSelExcluidas({ escopo: consulta.id, keys: SEM_EXCLUSOES })
  const [selDatas, setSelDatas] = useState({ escopo: null, datas: SEM_DATAS })
  const datasTela = selDatas.escopo === consulta.id ? selDatas.datas : SEM_DATAS
  const setDataTela = (key, nova) => setSelDatas(prev => {
    const next = new Map(prev.escopo === consulta.id ? prev.datas : SEM_DATAS)
    if (nova) next.set(key, nova)
    else next.delete(key)
    return { escopo: consulta.id, datas: next }
  })

  const [atrasoAberto, setAtrasoAberto] = useState(false)
  // Só no celular: filtros/consultas num bottom sheet e a tabela de saldo por conta recolhida.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [saldoContasAberto, setSaldoContasAberto] = useState(false)
  const [consultaModal, setConsultaModal] = useState(null) // { initial } | null
  const [provModal, setProvModal] = useState(null)         // { initial } | null
  const [provExcluir, setProvExcluir] = useState(null)
  const [efetivar, setEfetivar] = useState(null)           // provisório
  const [mudarData, setMudarData] = useState(null)         // linha

  // ── Contas da consulta ─────────────────────────────────────────────────────
  // "Hoje" fixado na montagem (como a data inicial do relatório): a tela aberta virando a
  // meia-noite segue no dia em que abriu até recarregar.
  const [hoje] = useState(hojeStr)
  const fim = useMemo(() => somarDias(hoje, horizonte), [hoje, horizonte])
  const contas = useMemo(() => contasDaConsulta(consulta, accounts), [consulta, accounts])
  const accountIds = useMemo(() => new Set(contas.map(a => a.id)), [contas])
  const saldoInicial = useMemo(() => round2(contas.reduce((s, a) => s + (a.balance || 0), 0)), [contas])
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const accName = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }
  const catById = useMemo(() => new Map((categories || []).map(c => [c.id, c])), [categories])
  const catName = (id) => catById.get(id)?.name || 'Sem categoria'
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const patrimonioSet = useMemo(() => new Set(accounts.filter(a => a.vinculoTipo === 'patrimonio').map(a => a.id)), [accounts])
  const funcById = useMemo(() => new Map((reserveFunctions || []).map(f => [f.id, f])), [reserveFunctions])

  const saldoPorConta = useMemo(() => contas.map(a => {
    const ultimo = ultimoDiaDeSaldo(a.id, transactions, hoje)
    return { conta: a, ultimo, situacao: situacaoSaldo(ultimo, hoje) }
  }), [contas, transactions, hoje])

  // ── Cálculo ────────────────────────────────────────────────────────────────
  const { schedules: schedulesFluxo, porChave: dpPorChave } = useMemo(
    () => aplicarDatasNosAgendamentos(schedules, datasProvisorias),
    [schedules, datasProvisorias],
  )
  const scheduleById = useMemo(() => new Map(schedules.map(s => [s.id, s])), [schedules])

  const { rows, atraso } = useMemo(() => {
    const comum = {
      accountIds, currentBalance: saldoInicial, reserveFunctions, getNextOccurrences,
      includeSchedules: true, hideReserva: ocultarReserva, hidePatrimonio: consulta.ocultar_patrimonio,
      reservaSet, patrimonioSet,
    }
    const agds = consulta.incluir_agendamentos ? schedulesFluxo : []
    // includeSchedules fica sempre true (ele também liga os envelopes); "sem agendamentos" é a
    // lista vazia, para os envelopes seguirem a opção própria.
    const etapaAPrevistas = projetarEtapaA(agds)
    const r = computeFluxoCaixa({
      ...comum, start: hoje, end: fim, transactions, schedules: agds, etapaAPrevistas,
      envelopes: incluirEnvelopes ? envelopes : [], provisorios,
    })
    const futuras = linhasFuturas(r.rows, { hoje, fim, incluirLancamentosFuturos: consulta.incluir_lancamentos_futuros })
    // Pendências em atraso: as mesmas ocorrências que o relatório soma no "saldo anterior c/
    // agendamentos", aqui listadas uma a uma (sem lançamentos, envelopes nem provisórios).
    const a = consulta.incluir_agendamentos
      ? computeFluxoCaixa({ ...comum, start: INICIO_ATRASO, end: somarDias(hoje, -1), schedules: agds, etapaAPrevistas }).rows
      : []
    return {
      rows: anotarLinhasProvisorias(futuras, dpPorChave, scheduleById, occEfetiva),
      atraso: anotarLinhasProvisorias(a, dpPorChave, scheduleById, occEfetiva),
    }
  }, [accountIds, saldoInicial, reserveFunctions, getNextOccurrences, ocultarReserva, consulta, reservaSet, patrimonioSet,
    schedulesFluxo, hoje, fim, transactions, incluirEnvelopes, envelopes, provisorios, dpPorChave, scheduleById, projetarEtapaA])

  const { atrasoTotal, atrasoAtivas, base } = useMemo(() => {
    const { total, ativas } = totalEmAtraso(atraso, excluidas)
    return { atrasoTotal: total, atrasoAtivas: ativas, base: round2(saldoInicial + total) }
  }, [atraso, excluidas, saldoInicial])
  const { rowsView, foraDoPeriodo } = useMemo(
    () => montarLinhasSimuladas(rows, { datas: datasTela, excluidas, start: hoje, end: fim, saldoBase: base }),
    [rows, datasTela, excluidas, hoje, fim, base],
  )
  // Série diária de [hoje, fim]: Projetado = saldo no fim do ÚLTIMO dia; Mínimo = menor saldo de
  // fim de dia. Valores distintos, da mesma série que o gráfico desenha.
  const { serie, projetado, minimo, minimoKey } = useMemo(() => {
    const sr = serieDiaria(rowsView, base, hoje, fim)
    const min = minimoProjetado(sr)
    // Linha destacada: o último evento ativo do dia do mínimo (o que fecha aquele saldo).
    let key = null
    if (min && min.valor < base) for (const r of rowsView) if (r.ativa && r.date === min.data) key = r._key
    return { serie: sr, projetado: projetadoNoFim(sr), minimo: min, minimoKey: key }
  }, [rowsView, base, hoje, fim])
  // Saldo ao FINAL de cada dia (celular, cabeçalho de cada data): a MESMA série do gráfico e do
  // "Projetado"/"Mínimo" — parte de `base` (com os atrasos marcados) e soma só as linhas ativas.
  // Todo dia do período tem valor, então uma data só com linhas desmarcadas repete o anterior.
  const saldoDoDia = useMemo(() => new Map(serie.map(p => [p.date, p.balance])), [serie])

  // ── Simulação ativa (card) ─────────────────────────────────────────────────
  const tocaContas = (sc) => accountIds.has(sc.accountId) || accountIds.has(sc.toAccountId)
    || (sc.reservaFuncaoId && accountIds.has(funcById.get(sc.reservaFuncaoId)?.accountId))
  const dpRelevantes = datasProvisorias.filter(d => {
    const sc = scheduleById.get(d.schedule_id)
    if (!sc || !tocaContas(sc)) return false
    return (d.data_original >= hoje && d.data_original <= fim) || (d.data_provisoria >= hoje && d.data_provisoria <= fim)
  })
  const dpVisiveis = new Set(rowsView.map(r => r._dpId).filter(Boolean))
  const dpForaDoPeriodo = dpRelevantes.filter(d => !dpVisiveis.has(d.id))
  const qtdDatas = dpRelevantes.length
    + rowsView.reduce((n, r) => n + (r._dataOriginal && !r._dpId ? 1 : 0), 0) + foraDoPeriodo.length
  const qtdProvisorios = rowsView.filter(r => r._provisorio).length
  const qtdForaCalculo = rowsView.filter(r => !r.ativa).length + (atraso.length - atrasoAtivas)
  const temSimulacao = qtdDatas + qtdProvisorios + qtdForaCalculo > 0
  const restaurarDatas = async () => {
    setSelDatas({ escopo: consulta.id, datas: SEM_DATAS })
    try { await removerDatasProvisorias(dpRelevantes.map(d => d.id)) } catch (err) {
      avisar(err?.message || 'Falha ao restaurar as datas.', 'error')
    }
  }

  // ── Ações ──────────────────────────────────────────────────────────────────
  const toggleLinha = (key) => alterarExcluidas(s => (s.has(key) ? s.delete(key) : s.add(key)))
  // "Marcar todos" (e, no celular, o de cada dia): só as linhas passadas — as VISÍVEIS no prazo e
  // filtros atuais. Mesma seleção em memória das linhas avulsas; o card Simulação recalcula junto.
  const marcarVarias = (linhas, marcar) => alterarExcluidas(s => marcarLinhas(s, linhas, marcar))
  const marcacao = estadoMarcacao(rowsView, excluidas)
  const toggleAtraso = () => alterarExcluidas(s => {
    if (atrasoAtivas > 0) atraso.forEach(r => s.add(r._key))
    else atraso.forEach(r => s.delete(r._key))
  })

  const desfazerData = async (r) => {
    if (!r._dpId) { setDataTela(r._key, null); return }
    try { await removerDatasProvisorias([r._dpId]) } catch (err) {
      avisar(err?.message || 'Falha ao desfazer a data.', 'error')
    }
  }
  // "Só simular": agendamento → data provisória gravada (a mesma do relatório); o resto, só tela.
  const simularData = async (r, nova) => {
    const real = r._dataOriginal || r.date
    if (!r._scheduleId) { setDataTela(r._key, nova === real ? null : nova); return }
    if (nova === real) { if (r._dpId) await removerDatasProvisorias([r._dpId]); return }
    await salvarDataProvisoria(r._scheduleId, r._origDate, nova)
  }
  // "Gravar no agendamento": mesmo patch do "Aplicar data" do relatório; a data provisória da
  // ocorrência (se havia) sai, porque agora a data está no agendamento.
  const gravarData = async (r, nova, modo) => {
    const sc = scheduleById.get(r._scheduleId)
    if (!sc) throw new Error('Agendamento de origem não encontrado.')
    const patch = patchAplicarData(sc, r._origDate, nova, modo)
    updateSchedule(sc.id, patch)
    avisar(`Agendamento atualizado para ${fmtDate(nova)}`)
    // Edição do usuário → histórico (mesma transação da gravação do agendamento).
    const loteId = novoLoteId()
    registrarEdicao({
      agendamentos: [{ ...sc, ...patch }], loteId,
      historico: historicoDataAgendamento({ schedule: sc, origDate: r._origDate, de: occEfetiva(sc, r._origDate).date, para: nova, modo, loteId, serieKey: serieKeyDe({ agendamento: sc }) }),
    }).catch(err => avisar(`Data gravada, mas o histórico não foi registrado: ${err?.message || err}`, 'error'))
    if (r._dpId) {
      try { await removerDatasProvisorias([r._dpId]) } catch (err) {
        avisar(`Agendamento atualizado, mas a data provisória não foi apagada: ${err?.message || err}`, 'error')
      }
    }
  }

  const gravarProvisorio = useCallback(async (payload) => {
    await salvarProvisorio(payload)
    avisar(payload.id ? 'Provisório atualizado.' : 'Provisório adicionado.')
  }, [salvarProvisorio])

  const confirmarEfetivar = async (prov, { modo, categoryId, date }) => {
    if (modo === 'agendamento') {
      if ((categoryId || null) !== (prov.category_id || null)) await salvarProvisorio({ ...prov, category_id: categoryId })
      const schedule = await efetivarComoAgendamento(prov.id)
      if (schedule) mergeScheduleFromDb(schedule)
      avisar('Provisório efetivado como agendamento.')
      return
    }
    // Lançamento realizado: apaga o provisório ANTES de lançar — se o lançamento viesse primeiro
    // e a exclusão falhasse, o mesmo valor contaria duas vezes no fluxo.
    await excluirProvisorio(prov.id)
    const acc = accById.get(prov.account_id)
    addTransaction({
      type: prov.type === 'entrada' ? 'income' : 'expense',
      accountId: prov.account_id,
      accountType: acc?.type,
      amount: prov.amount,
      date,
      description: prov.description,
      categoryId: categoryId || null,
    })
    avisar('Provisório efetivado como lançamento.')
  }

  const primeiraPendente = (r) => {
    const sc = r._scheduleId ? scheduleById.get(r._scheduleId) : null
    return sc ? (getNextOccurrences(sc, 1)[0] || null) : null
  }

  // ── Consultas: duplicar / padrão / excluir ─────────────────────────────────
  const duplicarConsulta = async (c) => {
    try {
      // eslint-disable-next-line no-unused-vars
      const { id: _id, created_at: _c, updated_at: _u, ...resto } = c
      const nova = await salvarConsulta({ ...resto, nome: nomeDeCopia(c.nome, consultas, c.perfil_ids), padrao: false, ordem: null })
      setAtivaId(nova.id)
      avisar('Consulta duplicada.')
    } catch (err) { avisar(err?.message || 'Falha ao duplicar a consulta.', 'error') }
  }
  // Padrão = uma salva com padrao=true; "FC Principal" padrão = nenhuma salva marcada (no perfil).
  const definirPadrao = async (c) => {
    try {
      if (c.id === ID_CONSULTA_VIRTUAL) {
        for (const v of visiveis.filter(x => x.padrao)) await salvarConsulta({ ...v, padrao: false })
      } else {
        await salvarConsulta({ ...c, padrao: true })
      }
      avisar(`"${c.nome}" é a consulta padrão.`)
    } catch (err) { avisar(err?.message || 'Falha ao definir a padrão.', 'error') }
  }
  const confirmarExcluirConsulta = async (c) => {
    try {
      await excluirConsulta(c.id)
      if (consulta.id === c.id) setAtivaId(null)
      avisar('Consulta excluída.')
    } catch (err) { avisar(err?.message || 'Falha ao excluir a consulta.', 'error') }
  }

  const semContas = contas.length === 0
  const corSaldo = (v) => (v >= 0 ? 'text-receita' : 'text-despesa')

  // Consultas — "FC Principal" (virtual) sempre primeiro. No celular, vai para o sheet de filtros.
  const secaoConsultas = (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-texto-3 uppercase tracking-wide">Consultas</p>
          <div className="ml-auto flex gap-2">
            {!consulta.virtual && podeEditarF && (
              <button type="button" onClick={() => setConsultaModal({ initial: consulta })} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
                <SlidersHorizontal size={12} /> Editar consulta atual
              </button>
            )}
            {podeIncluirF && (
              <button type="button" onClick={() => setConsultaModal({ initial: null })} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
                <Plus size={12} /> Nova consulta
              </button>
            )}
          </div>
        </div>
        {isMobile && cartoes.length > 6 ? (
          <div>
            <label className="label">Trocar consulta</label>
            <select className="input" value={consulta.id} onChange={e => setAtivaId(e.target.value)}>
              {cartoes.map(c => (
                <option key={c.id} value={c.id}>{c.nome}{c.id === padraoId ? ' (padrão)' : ''}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cartoes.map(c => (
              <ConsultaCard
                key={c.id}
                consulta={c}
                ativa={c.id === consulta.id}
                padrao={c.id === padraoId}
                nContas={contasDaConsulta(c, accounts).length}
                validarNome={(nome) => erroNome(nome, consultas, c.perfil_ids, c.id)}
                onSelecionar={() => setAtivaId(c.id)}
                onRenomear={podeEditarF ? async (nome) => { await salvarConsulta({ ...c, nome }); avisar('Consulta renomeada.') } : null}
                onEditar={podeEditarF ? () => setConsultaModal({ initial: c }) : null}
                onDuplicar={podeIncluirF ? () => duplicarConsulta(c) : null}
                onDefinirPadrao={podeEditarF ? () => definirPadrao(c) : null}
                onExcluir={podeExcluirF ? () => setConsultaExcluir(c) : null}
              />
            ))}
          </div>
        )}
      </div>
  )

  // Datas simuladas que caíram fora da janela (com o "voltar à data original").
  const avisosForaDoPeriodo = (
            foraDoPeriodo.length + dpForaDoPeriodo.length > 0 && (
              <div className="px-4 py-2 border-b border-borda text-xs text-texto-2 flex flex-wrap gap-x-3 gap-y-1">
                {dpForaDoPeriodo.map(d => (
                  <span key={d.id} className="inline-flex items-center gap-1">
                    {scheduleById.get(d.schedule_id)?.description || 'Agendamento'} → {fmtDate(d.data_provisoria)} (fora do período)
                    {podeEditarF && <button type="button" onClick={() => removerDatasProvisorias([d.id]).catch(err => avisar(err.message, 'error'))} title="Voltar à data original"><RotateCcw size={11} /></button>}
                  </span>
                ))}
                {foraDoPeriodo.map(r => (
                  <span key={r._key} className="inline-flex items-center gap-1">
                    {r.description} → {fmtDate(r.date)} (fora do período)
                    <button type="button" onClick={() => setDataTela(r._key, null)} title="Voltar à data original"><RotateCcw size={11} /></button>
                  </span>
                ))}
              </div>
            )
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Cabeçalho: período + horizonte */}
      {isMobile ? (
        <div className="card py-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-3 gap-1 bg-surface-2/60 rounded-lg p-1" role="tablist" aria-label="Horizonte">
              {HORIZONTES_MOBILE.map(({ dias, rotulo }) => (
                <button
                  key={dias}
                  type="button"
                  role="tab"
                  aria-selected={horizonte === dias}
                  onClick={() => setHorizonteSel({ consultaId: consulta.id, h: dias })}
                  className={`min-h-[44px] rounded-md text-xs font-medium transition-colors ${horizonte === dias ? 'bg-primary text-white' : 'text-texto-2'}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFiltrosAbertos(true)}
              aria-label="Filtros e consultas"
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg bg-surface-2/60 text-texto-2"
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
          <p className="text-xs text-texto-2">
            <span className="text-texto-2 font-medium">{consulta.nome}</span> · {fmtDate(hoje)} → {fmtDate(fim)}
          </p>
        </div>
      ) : (
      <div className="card flex items-center justify-between gap-3 flex-wrap py-3">
        <p className="text-sm text-texto-2">
          Hoje, <span className="font-semibold text-texto-1">{fmtDate(hoje)}</span>
          <span className="text-texto-3"> → </span>
          <span className="font-semibold text-texto-1">{fmtDate(fim)}</span>
        </p>
        <div className="flex flex-wrap gap-1 bg-surface-2/60 rounded-lg p-1" role="group" aria-label="Prazo">
          {HORIZONTES.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizonteSel({ consultaId: consulta.id, h })}
              aria-pressed={horizonte === h}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${horizonte === h ? 'bg-primary text-white' : 'text-texto-2 hover:text-texto-1'}`}
            >
              {h} dias
            </button>
          ))}
        </div>
      </div>
      )}

      {!isMobile && secaoConsultas}

      {semContas ? (
        <div className="card border border-aviso/30 bg-aviso/5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-aviso shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-aviso">
              {consulta.modo === 'principais' ? 'Nenhuma conta marcada como Somar no Saldo Principal (FC)' : 'Esta consulta não tem contas'}
            </p>
            <p className="text-xs text-texto-2 mt-0.5">
              {consulta.modo === 'principais'
                ? <>Ative <span className="font-semibold">Somar no Saldo Principal</span> em pelo menos uma conta corrente ou poupança, ou crie uma consulta.</>
                : 'Edite a consulta e selecione contas (ou grupos com contas) deste perfil.'}
            </p>
          </div>
          {consulta.modo === 'principais' && setActivePage && (
            <button onClick={() => setActivePage('accounts')} className="text-xs text-primary-fg hover:text-texto-1 shrink-0 font-medium transition-colors">
              Ir para Contas →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Saldo inicial */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-borda flex items-start gap-3">
              <Wallet size={14} className="text-texto-2 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-texto-2">Saldo inicial · {consulta.nome}</h2>
                <p className="text-xs text-texto-3">{rotuloModo(consulta.modo)} · soma de {contas.length} conta{contas.length !== 1 ? 's' : ''} · cada uma pelo seu último dia de saldo</p>
              </div>
              <p className={`ml-auto text-lg font-bold whitespace-nowrap ${corSaldo(saldoInicial)}`}>{vf(saldoInicial)}</p>
            </div>
            {isMobile && (
              <button
                type="button"
                onClick={() => setSaldoContasAberto(o => !o)}
                aria-expanded={saldoContasAberto}
                className="w-full min-h-[44px] px-4 flex items-center gap-1.5 text-xs text-texto-2 border-b border-borda"
              >
                {saldoContasAberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {saldoContasAberto ? 'Ocultar saldo por conta' : 'Ver saldo por conta'}
              </button>
            )}
            {(!isMobile || saldoContasAberto) && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 520 }}>
                <thead>
                  <tr className="border-b border-borda">
                    <th className="text-left px-4 py-2 text-xs text-texto-2 font-medium">Conta</th>
                    <th className="text-left px-4 py-2 text-xs text-texto-2 font-medium w-36">Último dia de saldo</th>
                    <th className="text-left px-4 py-2 text-xs text-texto-2 font-medium w-48">Situação</th>
                    <th className="text-right px-4 py-2 text-xs text-texto-2 font-medium w-32">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {saldoPorConta.map(({ conta: a, ultimo, situacao }) => (
                    <tr key={a.id} className="border-b border-borda/40">
                      <td className="px-4 py-2 text-xs text-texto-1">{a.apelido || a.name}</td>
                      <td className="px-4 py-2 text-xs text-texto-2">{ultimo ? fmtDate(ultimo) : '—'}</td>
                      <td className="px-4 py-2 text-xs"><span className={SITUACAO[situacao.tipo]}>{ultimo ? (situacao.tipo === 'parada' ? '⚠ ' : situacao.tipo === 'sem' ? '' : '✓ ') + situacao.rotulo : '—'}</span></td>
                      <td className={`px-4 py-2 text-right text-xs font-semibold ${(a.balance || 0) >= 0 ? 'text-texto-1' : 'text-despesa'}`}>{vf(a.balance || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>

          {/* Cards */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${temSimulacao ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <div className="card">
              <div className="flex items-center gap-2 mb-1 text-texto-2"><Wallet size={14} /><p className="text-xs uppercase tracking-wide">Saldo inicial</p></div>
              <p className={`text-xl font-bold ${corSaldo(saldoInicial)}`}>{vf(saldoInicial)}</p>
              {atraso.length > 0 && <p className="text-[11px] text-texto-3 mt-0.5">+ em atraso: {vf(atrasoTotal)}</p>}
            </div>
            <div className="card">
              <p className="text-xs text-texto-2 uppercase tracking-wide">Projetado ({horizonte}D)</p>
              <p className={`text-xl font-bold mt-1 ${corSaldo(projetado)}`}>{vf(projetado)}</p>
              <p className="text-[11px] text-texto-3 mt-0.5">em {fmtDate(fim)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-texto-2 uppercase tracking-wide">Mínimo projetado</p>
              <p className={`text-xl font-bold mt-1 ${minimo.valor >= 0 ? 'text-receita' : 'text-despesa'}`}>{vf(minimo.valor, fmtSinal)}</p>
              <p className="text-[11px] text-texto-3 mt-0.5">em {fmtDate(minimo.data)}</p>
            </div>
            {temSimulacao && (
              <div className="card border border-dashed border-borda-forte">
                <p className="text-xs text-texto-2 uppercase tracking-wide">Simulação</p>
                <p className="text-xs text-texto-2 mt-1">
                  {qtdProvisorios} provisório{qtdProvisorios !== 1 ? 's' : ''} · {qtdDatas} data{qtdDatas !== 1 ? 's' : ''} alterada{qtdDatas !== 1 ? 's' : ''}
                  {qtdDatas > 0 && podeEditarF && <> · <button type="button" onClick={restaurarDatas} className="underline text-primary-fg hover:text-texto-1">restaurar datas</button></>}
                </p>
                <p className="text-xs text-texto-2 mt-1">
                  {qtdForaCalculo} linha{qtdForaCalculo !== 1 ? 's' : ''} fora do cálculo
                  {qtdForaCalculo > 0 && <> · <button type="button" onClick={restaurarLinhas} className="underline text-primary-fg hover:text-texto-1">restaurar tudo</button></>}
                </p>
              </div>
            )}
          </div>

          {/* Gráfico */}
          <div className="card">
            <h2 className="text-sm font-semibold text-texto-2 mb-4">Projeção de saldo — dia a dia</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={serie} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={cor.chartGrade} />
                <XAxis dataKey="label" tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.max(1, Math.floor(serie.length / 8))} />
                <YAxis tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => (oculto ? '' : `R$${(v / 1000).toFixed(0)}k`)} />
                <Tooltip content={<CustomTooltip oculto={oculto} />} />
                <ReferenceLine y={0} stroke={cor.chartEixo} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="balance" name="Saldo" stroke={cor.receita} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Eventos */}
          {isMobile ? (
            <>
              {avisosForaDoPeriodo && <div className="card p-0 overflow-hidden">{avisosForaDoPeriodo}</div>}
              <FluxoMobileLista
                rowsView={rowsView}
                atraso={atraso}
                excluidas={excluidas}
                atrasoAtivas={atrasoAtivas}
                atrasoTotal={atrasoTotal}
                base={base}
                saldoInicial={saldoInicial}
                minimoKey={minimoKey}
                saldoDoDia={saldoDoDia}
                oculto={oculto}
                horizonte={horizonte}
                qtdContas={contas.length}
                corSaldo={corSaldo}
                subtitulo={(r) => [catName(r.categoryId), accName(contaDaLinha(r, accountIds)), seloDaLinha(r)].filter(Boolean).join(' · ')}
                statusCelula={statusCelula}
                docBadge={(r) => <TipoDocumentoBadge tipo={docDaLinha(r)} />}
                docDaLinha={docDaLinha}
                statusDaLinha={(r) => statusConfirmacaoLinha(r, ctxDoc)}
                marcadores={(r) => marcadoresLinhaMobile(r, ctxDoc, tiposDocumento)}
                tipoBadge={(r) => { const t = tipoEvento(r); return <span className={`text-[10px] px-1.5 py-0.5 rounded ${BADGE[t]}`}>{t}</span> }}
                toggleLinha={toggleLinha}
                toggleAtraso={toggleAtraso}
                marcarVarias={marcarVarias}
                onMudarData={podeEditarF ? setMudarData : null}
                onDesfazerData={podeEditarF ? desfazerData : null}
                onEfetivar={podeEfetivar ? setEfetivar : null}
                onEditarProvisorio={podeEditarF ? (p) => setProvModal({ initial: p }) : null}
                onExcluirProvisorio={podeExcluirF ? setProvExcluir : null}
              />
            </>
          ) : (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-borda flex items-center gap-3 flex-wrap">
              <Calendar size={14} className="text-texto-2" />
              <h2 className="text-sm font-semibold text-texto-2">Eventos projetados</h2>
              <span className="text-xs text-texto-3">{rowsView.length} evento{rowsView.length !== 1 ? 's' : ''}</span>
              {rowsView.length > 0 && (
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-texto-2" title="Só os eventos visíveis no prazo e filtros atuais">
                  <input
                    type="checkbox"
                    className="accent-primary w-3.5 h-3.5"
                    checked={marcacao.todas}
                    ref={el => { if (el) el.indeterminate = marcacao.parcial }}
                    onChange={() => marcarVarias(rowsView, !marcacao.todas)}
                  />
                  Marcar todos{marcacao.parcial && <span className="text-texto-3">({marcacao.ativas}/{marcacao.total})</span>}
                </label>
              )}
              <div className="flex items-center gap-4 flex-wrap ml-auto">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-texto-2" title="Override temporário da consulta">
                  <input type="checkbox" className="accent-primary w-3.5 h-3.5" checked={incluirEnvelopes} onChange={e => setOvr('incluir_envelopes', e.target.checked)} />
                  Incluir envelopes
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-texto-2" title="Override temporário da consulta">
                  <input type="checkbox" className="accent-primary w-3.5 h-3.5" checked={ocultarReserva} onChange={e => setOvr('ocultar_reserva', e.target.checked)} />
                  Ocultar reservas
                </label>
                {podeIncluirF && (
                <button
                  type="button"
                  onClick={() => setProvModal({ initial: null })}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 border-dashed border-borda-forte text-texto-2 hover:bg-surface-hover"
                >
                  <Plus size={13} /> Provisório
                </button>
                )}
              </div>
            </div>

            {avisosForaDoPeriodo}

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: isMobile ? 960 : 1030 }}>
                <thead>
                  <tr className="border-b border-borda">
                    <th className="w-9 px-2 py-2.5" title="Desmarque um evento para tirá-lo do cálculo" />
                    <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium w-28">Data</th>
                    <th className="text-left px-2 py-2.5 text-xs text-texto-2 font-medium w-[100px]" title="Confirmado / A confirmar (agendamentos) — clique no badge para alternar">Status</th>
                    <th className="text-left px-2 py-2.5 text-xs text-texto-2 font-medium w-[70px]" title="Tipo de documento">Doc.</th>
                    <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium">Descrição</th>
                    <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium w-32">Conta</th>
                    <th className="text-right px-3 py-2.5 text-xs text-receita font-medium w-28">
                      <span className="flex items-center justify-end gap-1"><ArrowDownCircle size={11} /> Entrada</span>
                    </th>
                    <th className="text-right px-3 py-2.5 text-xs text-despesa font-medium w-28">
                      <span className="flex items-center justify-end gap-1"><ArrowUpCircle size={11} /> Saída</span>
                    </th>
                    <th className="text-right px-3 py-2.5 text-xs text-texto-2 font-medium w-32">Saldo</th>
                    <th className="text-left px-3 py-2.5 text-xs text-texto-2 font-medium w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-borda/50 bg-surface-2/20">
                    <td className="px-2 py-2" />
                    <td className="px-3 py-2 text-xs text-texto-3">Hoje</td>
                    <td className="px-3 py-2 text-xs text-texto-2 italic" colSpan={6}>
                      Saldo inicial ({contas.length} conta{contas.length !== 1 ? 's' : ''}, cada uma no seu último dia)
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-bold ${corSaldo(saldoInicial)}`}>{fmt(saldoInicial)}</td>
                    <td />
                  </tr>

                  {atraso.length > 0 && (
                    <>
                      <tr className={`border-b border-borda/50 bg-perigo/5 ${atrasoAtivas === 0 ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="accent-primary w-3.5 h-3.5 align-middle cursor-pointer"
                            checked={atrasoAtivas > 0}
                            ref={el => { if (el) el.indeterminate = atrasoAtivas > 0 && atrasoAtivas < atraso.length }}
                            onChange={toggleAtraso}
                            title={atrasoAtivas > 0 ? 'Tirar as pendências em atraso do cálculo' : 'Voltar a considerar as pendências em atraso'}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-perigo">Hoje</td>
                        <td className="px-3 py-2 text-xs" colSpan={4}>
                          <button type="button" onClick={() => setAtrasoAberto(o => !o)} className="inline-flex items-center gap-1 text-perigo hover:text-texto-1">
                            {atrasoAberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            Pendências em atraso ({atraso.length})
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-receita">{atrasoTotal > 0 ? fmt(atrasoTotal) : ''}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-despesa">{atrasoTotal < 0 ? fmt(-atrasoTotal) : ''}</td>
                        <td className={`px-3 py-2 text-right text-xs font-bold ${corSaldo(base)}`}>{fmt(base)}</td>
                        <td />
                      </tr>
                      {atrasoAberto && atraso.map(r => {
                        const ativa = !excluidas.has(r._key)
                        return (
                          <tr key={r._key} className={`border-b border-borda/30 bg-perigo/[0.03] ${ativa ? '' : 'opacity-40'}`}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" className="accent-primary w-3.5 h-3.5 align-middle cursor-pointer" checked={ativa} onChange={() => toggleLinha(r._key)} />
                            </td>
                            <td className="px-3 py-1.5 text-[11px] text-perigo pl-6">{fmtDate(r.date)}</td>
                            <td className="px-2 py-1.5 w-[100px]">{statusCelula(r)}</td>
                            <td className="px-2 py-1.5 w-[70px]"><TipoDocumentoBadge tipo={docDaLinha(r)} /></td>
                            <td className={`px-3 py-1.5 text-[11px] ${ativa ? 'text-texto-2' : 'text-texto-3 line-through'}`}>{r.description}</td>
                            <td className="px-3 py-1.5 text-[11px] text-texto-3">{accName(contaDaLinha(r, accountIds))}</td>
                            <td className="px-3 py-1.5 text-right text-[11px] text-receita">{r.entrada > 0 ? fmt(r.entrada) : ''}</td>
                            <td className="px-3 py-1.5 text-right text-[11px] text-despesa">{r.saida > 0 ? fmt(r.saida) : ''}</td>
                            <td />
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1">
                                {podeEditarF && (
                                <button type="button" onClick={() => setMudarData(r)} className="p-1 rounded text-texto-3 hover:text-ambar hover:bg-ambar/10" title="Mudar data">
                                  <CalendarClock size={13} />
                                </button>
                                )}
                                {r._dataOriginal && podeEditarF && (
                                  <button type="button" onClick={() => desfazerData(r)} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded text-ambar hover:bg-ambar/10 whitespace-nowrap" title={`Voltar para ${fmtDate(r._dataOriginal)}`}>
                                    <RotateCcw size={11} /> Desfazer data
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  )}

                  {rowsView.map(r => {
                    const tipo = tipoEvento(r)
                    const ehMinimo = r._key === minimoKey
                    // Mínimo positivo = azul de "Entrada" (não é saldo negativo); negativo = vermelho.
                    const minimoNeg = ehMinimo && r.saldo < 0
                    return (
                      <tr
                        key={r._key}
                        className={`border-b border-borda/40 ${!r.ativa ? 'opacity-40' : ''} ${
                          ehMinimo ? (minimoNeg ? 'bg-despesa/15 hover:bg-despesa/20' : 'bg-receita/10 hover:bg-receita/15')
                            : r._provisorio ? 'bg-surface-2/60 hover:bg-surface-hover/60'
                            : 'hover:bg-surface-hover/20'
                        }`}
                      >
                        <td className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="accent-primary w-3.5 h-3.5 align-middle cursor-pointer"
                            checked={r.ativa}
                            onChange={() => toggleLinha(r._key)}
                            title={r.ativa ? 'Tirar este evento do cálculo' : 'Voltar a considerar este evento'}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {r._dataOriginal ? (
                            <span className="inline-flex flex-col leading-tight">
                              <span className="text-texto-1 font-semibold underline decoration-dashed decoration-borda-campo underline-offset-2">{fmtDate(r.date)}</span>
                              <span className="text-[10px] text-texto-3">era {ddmm(r._dataOriginal)}</span>
                            </span>
                          ) : <span className="text-texto-2">{fmtDate(r.date)}</span>}
                        </td>
                        <td className="px-2 py-2.5 w-[100px] whitespace-nowrap">{statusCelula(r)}</td>
                        <td className="px-2 py-2.5 w-[70px] whitespace-nowrap"><TipoDocumentoBadge tipo={docDaLinha(r)} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs truncate max-w-xs ${r.ativa ? 'text-texto-1' : 'text-texto-3 line-through'}`} title={r.description}>{r.description}</span>
                            <SeloParcela rotulo={seloDaLinha(r)} />
                            {contratoDaLinha(r) && <SeloContrato {...contratoDaLinha(r)} />}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${BADGE[tipo]}`}>{tipo}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-texto-2 whitespace-nowrap">{accName(contaDaLinha(r, accountIds))}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-receita whitespace-nowrap">{r.entrada > 0 ? fmt(r.entrada) : ''}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-despesa whitespace-nowrap">{r.saida > 0 ? fmt(r.saida) : ''}</td>
                        <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap ${!r.ativa ? 'text-texto-3' : ehMinimo ? (minimoNeg ? 'text-despesa' : 'text-receita') : r.saldo >= 0 ? 'text-texto-1' : 'text-despesa'}`}>
                          {ehMinimo && r.ativa && (
                            <span className={`mr-1.5 align-middle text-[10px] font-normal px-1.5 py-0.5 rounded ${minimoNeg ? 'bg-despesa/15 text-despesa' : 'bg-receita/15 text-receita'}`}>mínimo</span>
                          )}
                          {r.ativa ? fmt(r.saldo) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {!r._provisorio && podeEditarF && (
                              <button type="button" onClick={() => setMudarData(r)} className="p-1 rounded text-texto-3 hover:text-ambar hover:bg-ambar/10" title="Mudar data">
                                <CalendarClock size={13} />
                              </button>
                            )}
                            {r._dataOriginal && podeEditarF && (
                              <button type="button" onClick={() => desfazerData(r)} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded text-ambar hover:bg-ambar/10 whitespace-nowrap" title={`Voltar para ${fmtDate(r._dataOriginal)}`}>
                                <RotateCcw size={11} /> Desfazer data
                              </button>
                            )}
                            {r._provisorio && (
                              <>
                                {podeEfetivar && (
                                <button type="button" onClick={() => setEfetivar(r._provisorio)} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-primary/40 text-primary-fg hover:bg-primary/10" title="Gravar como agendamento ou lançamento">
                                  <CheckCircle2 size={11} /> Efetivar
                                </button>
                                )}
                                {podeEditarF && (
                                <button type="button" onClick={() => setProvModal({ initial: r._provisorio })} className="p-1 rounded text-texto-3 hover:text-ambar hover:bg-ambar/10" title="Editar provisório">
                                  <Pencil size={13} />
                                </button>
                                )}
                                {podeExcluirF && (
                                <button type="button" onClick={() => setProvExcluir(r._provisorio)} className="p-1 rounded text-texto-3 hover:text-perigo hover:bg-perigo-bg" title="Excluir provisório">
                                  <Trash2 size={13} />
                                </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {rowsView.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-8 text-texto-3 text-sm">Nenhum evento nos próximos {horizonte} dias.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </>
      )}

      {isMobile && (
        <FluxoSheet open={filtrosAbertos} onClose={() => setFiltrosAbertos(false)} title="Filtros e consultas">
          {secaoConsultas}
          <div className="space-y-1">
            <p className="text-xs text-texto-3 uppercase tracking-wide">Eventos</p>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-sm text-texto-2" title="Override temporário da consulta">
              <input type="checkbox" className="accent-primary w-4 h-4" checked={incluirEnvelopes} onChange={e => setOvr('incluir_envelopes', e.target.checked)} />
              Incluir envelopes
            </label>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-sm text-texto-2" title="Override temporário da consulta">
              <input type="checkbox" className="accent-primary w-4 h-4" checked={ocultarReserva} onChange={e => setOvr('ocultar_reserva', e.target.checked)} />
              Ocultar reservas
            </label>
            {podeIncluirF && (
            <button
              type="button"
              onClick={() => { setFiltrosAbertos(false); setProvModal({ initial: null }) }}
              className="btn-secondary min-h-[44px] w-full flex items-center justify-center gap-1.5 text-sm border-dashed border-borda-forte text-texto-2"
            >
              <Plus size={14} /> Novo provisório
            </button>
            )}
          </div>
        </FluxoSheet>
      )}

      {consultaModal && (
        <ConsultaModal
          initial={consultaModal.initial}
          consultas={consultas}
          accounts={accounts}
          accountGroups={accountGroups}
          transactions={transactions}
          profiles={profiles}
          activeProfileId={activeProfileId}
          hoje={hoje}
          onSalvar={async (payload) => {
            const row = await salvarConsulta(payload)
            setAtivaId(row.id)
            setHorizonteSel({ consultaId: null, h: null })
            avisar(payload.id ? 'Consulta atualizada.' : 'Consulta criada.')
          }}
          onExcluir={podeExcluirF ? async (id) => {
            await excluirConsulta(id)
            setAtivaId(null)
            avisar('Consulta excluída.')
          } : null}
          onClose={() => setConsultaModal(null)}
        />
      )}

      <Modal open={!!provModal} onClose={() => setProvModal(null)} title={provModal?.initial ? 'Editar Provisório' : 'Novo Lançamento Provisório'}>
        {provModal && (
          <ProvisorioForm
            initial={provModal.initial}
            contaPadrao={contas[0]?.id || ''}
            contas={contas}
            onSalvar={gravarProvisorio}
            onClose={() => setProvModal(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!consultaExcluir}
        onClose={() => setConsultaExcluir(null)}
        onConfirm={() => confirmarExcluirConsulta(consultaExcluir)}
        danger
        title="Excluir consulta"
        confirmLabel="Excluir"
        message={`Excluir a consulta "${consultaExcluir?.nome || ''}"? Provisórios e datas provisórias não são afetados.`}
      />

      <ConfirmDialog
        open={!!provExcluir}
        onClose={() => setProvExcluir(null)}
        onConfirm={() => {
          const p = provExcluir
          excluirProvisorio(p.id).then(() => avisar('Provisório excluído.')).catch(err => avisar(err.message || 'Falha ao excluir o provisório.', 'error'))
        }}
        danger
        title="Excluir provisório"
        confirmLabel="Excluir"
        message={`Excluir "${provExcluir?.description || ''}"? A simulação sai do fluxo (aqui e no relatório).`}
      />

      {efetivar && (
        <EfetivarModal prov={efetivar} onConfirmar={(opts) => confirmarEfetivar(efetivar, opts)} onClose={() => setEfetivar(null)} />
      )}

      {mudarData && (
        <MudarDataModal
          linha={mudarData}
          schedule={mudarData._scheduleId ? scheduleById.get(mudarData._scheduleId) || null : null}
          primeiraPendente={primeiraPendente(mudarData)}
          onSimular={(nova) => simularData(mudarData, nova)}
          onGravar={(nova, modo) => gravarData(mudarData, nova, modo)}
          onClose={() => setMudarData(null)}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  )
}
