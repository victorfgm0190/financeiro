import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today, fmt, buildAccountSelectOptions } from '../shared/utils'
import SearchableSelect from '../shared/SearchableSelect'
import { filtrarCategoriasPorPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import { contaCentralDoPerfil, msgSemContaCentral } from '../../lib/contaCentral'
import InputMoeda from '../shared/InputMoeda'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import PerguntaFluxoPrincipal from '../shared/PerguntaFluxoPrincipal'
import { perguntaFluxoPrincipal, considerarFluxoParaGravar } from '../../lib/fluxoPrincipal'
import { useIsMobile } from '../../hooks/useIsMobile'
import FimRepeticao from '../shared/FimRepeticao'
import EscopoSerieDialog from '../shared/EscopoSerieDialog'
import OcorrenciaEditModal from './OcorrenciaEditModal'
import PreviaParcelada from './PreviaParcelada'
import CampoParcelamento from './CampoParcelamento'
import { baixaNoPeriodo } from '../../lib/conflitoPeriodo'
import { ESCOPO, diffCampos, edicaoDeOcorrencia, planoAgendamento, serieKeyDe } from '../../lib/camposSerie'
import { novoLoteId, linhasHistorico, itensPorEscopo } from '../../lib/historico'
import {
  ehParcelado, ehUnicaParcelada, frequenciaExibida, normalizarUnica, permiteParcelamento, erroLimiteParcelas, textoDivisao,
  parcelaDaData, valorBaseDaChave, planoParcelamento, proximaParcela, temConsumo, comoNovaParcelada, edicaoDoParcelamento,
  aplicarEdicaoParcelamento, ESCOPO_OCORRENCIA, MSG_DATA_BLOQUEADA,
} from '../../lib/parcelasOcorrencia'

// Mesmas frequências do ScheduleForm.
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

// Formulário de "Provisão de Despesa": uma despesa futura estimada (valor/data ainda não
// definitivos), gravada como agendamento de despesa com is_provisao = true. Pode ser "Uma vez"
// ou recorrente (sem fim ou com nº de ocorrências), e cada ocorrência pode ser dividida em parcelas
// mensais (src/lib/parcelasOcorrencia.js). Opcionalmente vinculada a uma Função de Reserva.
// Com `initial`, abre em modo edição (todos os campos editáveis).
export default function ProvisaoForm({ initial, onClose }) {
  const { accounts, accountGroups, profiles, categories, reserveFunctions, addSchedule, updateSchedule, getNextOccurrences, activeProfileId, categoryGroupOrder, payees, transactions, addPayee, pode, registrarEdicao } = useApp()
  const isMobile = useIsMobile()
  // Nível de acesso: lançar = incluir; salvar edição = editar (sem permissão: só leitura).
  const podeGravarForm = pode('agendamentos', initial?.id ? 'editar' : 'incluir')

  // A provisão é uma despesa futura debitada da "Conta (de onde o dinheiro sai)". Padrão: a Conta
  // central DO PERFIL DA PROVISÃO. Perfil: o da conta escolhida (na edição, a gravada); senão o da
  // conta da função de reserva; sem as duas, o select "Perfil" (obrigatório, nunca o filtro da
  // tela). Sem conta escolhida nem Conta central no perfil, o Salvar fica bloqueado com o aviso.
  // Conta não FC → "Considerar no Fluxo de Caixa principal?" (lib/fluxoPrincipal).
  const [perfilEscolhido, setPerfilEscolhido] = useState('')
  const [erroCentral, setErroCentral] = useState(null)

  // TODAS as funções de reserva de TODAS as contas (cada função pertence a uma conta via
  // accountId). Formato "Nome (apelido)"; ordenado por conta e depois por nome da função.
  const funcoesReserva = useMemo(() => {
    const accById = new Map(accounts.map(a => [a.id, a]))
    return (reserveFunctions || [])
      .filter(f => f.accountId && accById.has(f.accountId))
      .map(f => {
        const acc = accById.get(f.accountId)
        const accLabel = acc.apelido || acc.name
        return { id: f.id, name: f.name, accLabel, label: `${f.name} (${accLabel})` }
      })
      .sort((a, b) =>
        a.accLabel.localeCompare(b.accLabel, 'pt-BR') ||
        a.name.localeCompare(b.name, 'pt-BR')
      )
  }, [reserveFunctions, accounts])

  // Recorrência parcelada: o campo Valor é o TOTAL da ocorrência (ano) da próxima parcela pendente, e
  // a Única em N parcelas (gravada como Anual + 1) aparece sempre como "Única".
  const parcelavaAntes = !!initial?.id && ehParcelado(initial)
  const proxima = parcelavaAntes ? proximaParcela(initial) : null
  const [form, setForm] = useState({
    description: initial?.description || '',
    amount: proxima?.valorTotal ?? initial?.amount ?? '',
    startDate: initial?.startDate || today(),
    categoryId: initial?.categoryId || '',
    frequency: initial?.frequency ? frequenciaExibida(initial) : 'once',
    occurrenceType: ehUnicaParcelada(initial) ? 'continuous' : (initial?.occurrenceType || 'continuous'),
    installments: ehUnicaParcelada(initial) ? 0 : (initial?.installments ?? 0),
    parcelasPorOcorrencia: proxima?.total ?? (Number(initial?.parcelasPorOcorrencia) || 1),
    overrides: initial?.overrides || {},
    skipped: initial?.skipped || [],
    comReserva: !!initial?.reservaFuncaoId,
    reservaFuncaoId: initial?.reservaFuncaoId || '',
    // '' = Conta central do perfil (padrão).
    accountId: initial?.accountId || '',
    considerarFluxoPrincipal: typeof initial?.considerarFluxoPrincipal === 'boolean' ? initial.considerarFluxoPrincipal : null,
    payee: initial?.payee || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isRecorrente = form.frequency && form.frequency !== 'once'
  // Parcelamento: mesmas regras e mesmo limite do agendamento.
  const nForm = permiteParcelamento(form.frequency) ? Math.max(1, Math.floor(Number(form.parcelasPorOcorrencia) || 1)) : 1
  const parcForm = nForm > 1 || parcelavaAntes
  const erroLimite = permiteParcelamento(form.frequency) ? erroLimiteParcelas(form.frequency, nForm) : null
  const comBaixa = !!initial?.id && temConsumo(initial)
  const parcelamentoBloqueado = comBaixa && !parcelavaAntes
  const serieComBaixa = comBaixa && parcelavaAntes
  const [erroParcelamento, setErroParcelamento] = useState('')
  const [editingOcc, setEditingOcc] = useState(null)
  const [edicoesParcela, setEdicoesParcela] = useState([]) // [{ occDate, mudancas }] — vão para o histórico
  const [escopoPendente, setEscopoPendente] = useState(null) // { mudancas, ano }

  const contaDaFuncao = form.comReserva && form.reservaFuncaoId
    ? accounts.find(a => a.id === (reserveFunctions || []).find(f => f.id === form.reservaFuncaoId)?.accountId) || null
    : null
  const contaEscolhida = form.accountId ? accounts.find(a => a.id === form.accountId) || null : null
  const perfilDaProvisao = contaEscolhida
    ? contaEscolhida.profileId || null
    : contaDaFuncao ? contaDaFuncao.profileId || null : (perfilEscolhido || null)
  const mostraSelectPerfil = !contaEscolhida && !contaDaFuncao
  const contaPrincipal = contaCentralDoPerfil(accounts, perfilDaProvisao)
  // Conta efetiva: a escolhida, senão a Conta central do perfil.
  const contaProvisao = contaEscolhida || contaPrincipal
  // Contas oferecidas: todas menos cartão, gerencial e desativadas (a já gravada sempre aparece).
  const contaGravadaId = initial?.accountId || null
  const contaOpts = useMemo(() => {
    const ok = accounts.filter(a => a.id === contaGravadaId
      || (a.active !== false && a.type !== 'credit' && a.type !== 'gerencial' && !a.isGerencial))
    const opts = buildAccountSelectOptions(ok, accountGroups, { isMobile })
    const gravada = contaGravadaId && !opts.some(o => o.id === contaGravadaId) ? accounts.find(a => a.id === contaGravadaId) : null
    return gravada ? [{ id: gravada.id, label: gravada.name, group: null }, ...opts] : opts
  }, [accounts, accountGroups, isMobile, contaGravadaId])
  const formFluxo = { transactionType: 'expense', accountId: contaProvisao?.id || '', considerarFluxoPrincipal: form.considerarFluxoPrincipal }
  const perguntaFluxo = perguntaFluxoPrincipal(formFluxo, accounts)
  const sortedPayees = useMemo(() => {
    const counts = {}
    for (const tx of transactions) if (tx.payee) counts[tx.payee] = (counts[tx.payee] || 0) + 1
    return [...new Set([...payees])].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  }, [transactions, payees])

  // Categorias por perfil: o da conta principal (onde a provisão cai), senão o chip do topo; a
  // categoria já gravada continua na lista.
  const perfilCategorias = perfilParaCategorias(accounts, contaProvisao?.id || initial?.accountId, activeProfileId)
  const expenseCatOpts = useMemo(() =>
    ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilCategorias, [initial?.categoryId]), categoryGroupOrder)
      .filter(c => c.type === 'expense' || c.type === 'both')
      .map(c => ({ id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null })),
  [categories, perfilCategorias, initial?.categoryId, categoryGroupOrder])

  // Prévia das próximas ocorrências — mesma lógica do ScheduleForm: reusa getNextOccurrences
  // com um schedule "virtual" montado do form. Contínua → próximas 12; Parcelada → só as N datas
  // (getNextOccurrences limita por installments). Recalculada a cada render → atualiza em tempo real
  // quando muda data/frequência/nº de parcelas. 'Única' não tem próximas ocorrências.
  const previewBase = {
    id: initial?.id,
    transactionType: 'expense',
    startDate: form.startDate,
    frequency: form.frequency,
    occurrenceType: form.occurrenceType,
    installments: form.occurrenceType === 'installment' ? (Number(form.installments) || 0) : 0,
    registered: parcForm ? (initial?.registered || []) : [],
    registeredMeta: parcForm ? (initial?.registeredMeta || {}) : {},
    efetivacoes: parcForm ? (initial?.efetivacoes || []) : [],
    skipped: [],
    overrides: form.overrides,
    amount: parcelavaAntes ? (Number(initial.amount) || 0) : (Number(form.amount) || 0),
    parcelasPorOcorrencia: parcelavaAntes ? (Number(initial.parcelasPorOcorrencia) || 1) : nForm,
  }
  // Recorrência parcelada: a prévia mostra o total/N digitados, ainda sem gravar nada.
  const previewSchedule = (() => {
    const normal = normalizarUnica(previewBase)
    // Sem mudança de total/N não há recálculo: ele apagaria os valores próprios das parcelas.
    if (!parcelavaAntes || !proxima || !edicaoDoParcelamento(initial, { total: Number(form.amount) || 0, n: nForm }).mudancas.length) return normal
    try {
      return planoParcelamento(normal, { dataOcorrencia: proxima.ocorrencia, total: Number(form.amount) || 0, n: nForm, escopo: ESCOPO_OCORRENCIA.PROXIMAS })
    } catch { return normal }
  })()
  const preview = (isRecorrente || parcForm) && form.startDate ? getNextOccurrences(previewSchedule, parcForm ? Math.max(36, nForm * 3) : 12) : []

  // Edição de UMA parcela pela prévia: fica no formulário até salvar (com histórico) e vale só para ela.
  const salvarParcela = (changes) => {
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
    const fonte = { ...previewSchedule, skipped: form.skipped, overrides: form.overrides }
    const { mudancas } = edicaoDeOcorrencia(fonte, occDate, changes, [])
    if (!mudancas.length) return
    const { schedule } = planoAgendamento(fonte, { occDate, mudancas, escopo: ESCOPO.PARCELA })
    setForm(f => ({ ...f, overrides: schedule.overrides }))
    setEdicoesParcela(l => [...l, { occDate, mudancas }])
  }

  // Grava a edição de uma provisão parcelada: as regras do agendamento (src/lib/parcelasOcorrencia.js)
  // e o histórico. Parcelas já efetivadas nunca mudam: viraram agendamentos à parte.
  const salvarParcelada = (payload, decisao) => {
    const total = Number(form.amount)
    const edicao = edicaoDoParcelamento(initial, { total, n: nForm })
    if (edicao.erro) { setErroParcelamento(edicao.erro); return false }
    if (!decisao && edicao.perguntar) {
      setEscopoPendente({ mudancas: edicao.mudancas, ano: edicao.ocorrencia.slice(0, 4) })
      return false
    }
    const base = {
      ...initial, ...payload, amount: initial.amount, parcelasPorOcorrencia: Number(initial.parcelasPorOcorrencia) || 1,
      overrides: form.overrides, skipped: form.skipped,
      efetivacoes: initial.efetivacoes, registered: initial.registered, registeredMeta: initial.registeredMeta,
    }
    const { schedule, escopo } = aplicarEdicaoParcelamento(base, initial, {
      total, n: nForm, escopo: decisao?.escopo, inicio: payload.startDate, frequencia: payload.frequency, edicao,
    })
    const final = { ...schedule, nextOccurrence: ehParcelado(schedule) ? (getNextOccurrences(schedule, 1)[0] || null) : schedule.nextOccurrence }
    updateSchedule(initial.id, final)
    const outros = diffCampos(
      { description: initial.description, accountId: initial.accountId, categoryId: initial.categoryId || null, payee: initial.payee || null },
      { description: form.description, accountId: contaProvisao.id, categoryId: form.categoryId || null, payee: form.payee || null },
    )
    const loteId = novoLoteId()
    const serieKey = serieKeyDe({ agendamento: initial })
    const motivo = decisao?.motivo || null
    const historico = [
      ...edicoesParcela.flatMap(e => linhasHistorico({
        entidade: 'agendamento', serieKey, loteId, motivo,
        itens: itensPorEscopo([{ id: initial.id, ocorrenciaData: e.occDate, mudancas: e.mudancas }], ESCOPO.PARCELA),
      })),
      ...linhasHistorico({
        entidade: 'agendamento', serieKey, loteId, motivo,
        itens: itensPorEscopo([{
          id: initial.id, ocorrenciaData: escopo === ESCOPO_OCORRENCIA.SO_ESTA ? edicao.ocorrencia : null, mudancas: [...edicao.mudancas, ...outros],
        }], escopo === ESCOPO_OCORRENCIA.SO_ESTA ? ESCOPO.PARCELA : ESCOPO.PROXIMAS),
      }),
    ]
    if (historico.length) {
      registrarEdicao({ agendamentos: [final], historico, loteId, motivo }).catch(err => console.warn('[provisão] histórico:', err.message))
    }
    return true
  }

  const handleSubmit = (e, decisao = null) => {
    e?.preventDefault?.()
    if (!podeGravarForm) return
    if (erroLimite) { setErroParcelamento(erroLimite); return }
    setErroParcelamento('')
    if (!form.description || !form.amount || !form.startDate || !form.frequency) return
    if (isRecorrente && form.occurrenceType === 'installment' && Number(form.installments) < 1) return
    if (form.comReserva && !form.reservaFuncaoId) return
    if (!contaProvisao) {
      setErroCentral(msgSemContaCentral(profiles, perfilDaProvisao, contaDaFuncao))
      return
    }
    if (form.payee && !payees.includes(form.payee)) addPayee(form.payee)

    let payload = {
      description: form.description,
      transactionType: 'expense',
      // A conta do formulário (padrão: Conta central do perfil). Vale para as ocorrências pendentes:
      // as já efetivadas viraram lançamento/agendamento próprios.
      accountId: contaProvisao.id,
      accountType: contaProvisao.type || null,
      considerarFluxoPrincipal: considerarFluxoParaGravar(formFluxo, accounts),
      toAccountId: '',
      amount: Number(form.amount),
      categoryId: form.categoryId || '',
      payee: form.payee || '',
      costCenter: initial?.costCenter || '',
      frequency: form.frequency,
      startDate: form.startDate,
      occurrenceType: isRecorrente ? form.occurrenceType : 'continuous',
      installments: isRecorrente ? Number(form.installments) : 0,
      remindDaysBefore: initial?.remindDaysBefore ?? 3,
      // Provisão é uma estimativa: não auto-registra até ser efetivada. Continua aparecendo
      // como despesa futura projetada no Fluxo de Caixa Principal.
      autoRegister: false,
      grupoGerencial: initial?.grupoGerencial ?? null,
      skipped: form.skipped,
      overrides: form.overrides,
      reservaFuncaoId: form.comReserva ? form.reservaFuncaoId : '',
      isProvisao: true,
      provisaoEfetivada: initial?.provisaoEfetivada ?? false,
      parcelasPorOcorrencia: nForm,
    }
    // Com baixa, a série parcelada não muda de frequência e a Única continua Anual + 1 no banco.
    if (serieComBaixa) {
      payload.frequency = initial.frequency
      if (ehUnicaParcelada(initial)) { payload.occurrenceType = initial.occurrenceType; payload.installments = initial.installments }
    } else {
      payload = normalizarUnica(payload)
    }

    if (parcelavaAntes) {
      if (!salvarParcelada(payload, decisao)) return
    } else if (initial?.id) {
      updateSchedule(initial.id, nForm > 1 ? comoNovaParcelada(payload, initial, initial.nextOccurrence) : payload)
    } else addSchedule(payload)
    onClose()
  }

  if (escopoPendente) {
    return (
      <EscopoSerieDialog
        variante="parcelamento"
        anoOcorrencia={escopoPendente.ano}
        mudancas={escopoPendente.mudancas}
        nProximas={0}
        onCancel={() => setEscopoPendente(null)}
        onConfirm={(decisao) => { setEscopoPendente(null); handleSubmit(null, decisao) }}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-surface-2 border border-borda-forte rounded-lg">
        <Info size={14} className="text-texto-2 shrink-0 mt-0.5" />
        <p className="text-xs text-texto-2 leading-snug">
          Uma provisão é uma despesa futura estimada. Pode ser Única ou recorrente, e cada
          ocorrência pode ser dividida em parcelas mensais. Entra no Fluxo de Caixa Principal pela conta (conta FC, ou conta
          marcada Sim) e pode ser efetivada depois, ocorrência a ocorrência, com o valor e a data reais.
        </p>
      </div>

      {mostraSelectPerfil && (
        <div>
          <label className="label">Perfil *</label>
          <select className="input" value={perfilEscolhido} required
            onChange={e => { setPerfilEscolhido(e.target.value); setErroCentral(null) }}>
            <option value="">Selecione o perfil...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{String(p.name || '').trim()}</option>)}
          </select>
          <p className="text-xs text-texto-3 mt-1">Sem conta escolhida, a provisão sai da Conta central deste perfil.</p>
        </div>
      )}
      {(erroCentral || (perfilDaProvisao && !contaProvisao)) && (
        <p className="text-xs text-aviso">{erroCentral || msgSemContaCentral(profiles, perfilDaProvisao, contaDaFuncao)}</p>
      )}

      {/* Descrição */}
      <div data-guia="provisao-form.descricao">
        <label className="label">Descrição *</label>
        <input
          className="input"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Digite a descrição da provisão"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Valor estimado */}
        <div data-guia="provisao-form.valor">
          <label className="label">{nForm > 1 ? 'Valor total estimado da ocorrência (R$) *' : 'Valor estimado (R$) *'}</label>
          <InputMoeda
            min="0.01"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            required
          />
          {nForm > 1 && Number(form.amount) > 0 && !erroLimite && (
            <p className="text-xs text-texto-2 mt-1" role="status">{textoDivisao(Number(form.amount), nForm, fmt)}</p>
          )}
        </div>

        {/* Data estimada (1ª ocorrência quando recorrente) */}
        <div data-guia="provisao-form.data">
          <label className="label">{isRecorrente ? 'Data estimada (1ª ocorrência) *' : 'Data estimada *'}</label>
          <input
            className="input"
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            required
            disabled={serieComBaixa}
          />
          {serieComBaixa && <p className="text-[11px] text-texto-3 mt-1">{MSG_DATA_BLOQUEADA}</p>}
        </div>
      </div>

      {/* Frequência + Ocorrência (mesmo padrão do agendamento normal) */}
      <div className="grid grid-cols-2 gap-4">
        <div data-guia="provisao-form.frequencia">
          <label className="label">Frequência *</label>
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
      </div>

      {/* Até quando — o mesmo do agendamento */}
      {isRecorrente && (
        <div>
          <label className="label">Até quando</label>
          <FimRepeticao
            inicio={form.startDate}
            recorrencia={form.frequency}
            occurrenceType={form.occurrenceType}
            installments={form.installments}
            rotuloVezes="Nº de ocorrências"
            rotuloModoVezes="Número de ocorrências"
            onChange={({ occurrenceType, installments }) => setForm(f => ({ ...f, occurrenceType, installments: installments || f.installments }))}
          />
        </div>
      )}

      {/* Parcelamento: cada ocorrência dividida em N parcelas mensais */}
      {permiteParcelamento(form.frequency) && (
        <CampoParcelamento
          frequency={form.frequency}
          value={form.parcelasPorOcorrencia}
          onChange={v => { setErroParcelamento(''); set('parcelasPorOcorrencia', v) }}
          bloqueado={parcelamentoBloqueado}
          erro={erroLimite || erroParcelamento}
        />
      )}

      {/* Prévia das próximas ocorrências — agrupada por ano na recorrência parcelada */}
      {parcForm && preview.length > 0 && (
        <div>
          <label className="label">
            Prévia das próximas ocorrências
            <span className="ml-1.5 text-texto-3 text-[10px] normal-case font-normal">— clique para editar</span>
          </label>
          <PreviaParcelada schedule={previewSchedule} datas={preview} skipped={form.skipped} conta={contaProvisao} onEditar={setEditingOcc} />
        </div>
      )}
      {!parcForm && preview.length > 0 && (
        <div>
          <label className="label">Prévia das próximas ocorrências</label>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {preview.map((date, i) => (
              <div
                key={date}
                className={`text-center p-2 rounded-lg text-xs ${
                  i === 0 ? 'bg-primary/15 text-primary-fg font-medium' : 'bg-surface-2 text-texto-2'
                }`}
              >
                {date.split('-').reverse().join('/')}
              </div>
            ))}
          </div>
          {form.occurrenceType === 'installment' && (
            <p className="text-xs text-texto-3 mt-1.5">
              {preview.length} ocorrência{preview.length !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      {/* Conta (de onde o dinheiro sai) — padrão: Conta central do perfil */}
      <div data-guia="provisao-form.conta">
        <label className="label">Conta (de onde o dinheiro sai) *</label>
        <SearchableSelect
          options={contaOpts}
          value={contaProvisao?.id || ''}
          onChange={id => setForm(f => ({ ...f, accountId: id || '', considerarFluxoPrincipal: null }))}
          placeholder="Conta central do perfil"
          preserveGroupOrder
          ungroupedLast
        />
      </div>
      <PerguntaFluxoPrincipal
        pergunta={perguntaFluxo}
        valor={form.considerarFluxoPrincipal}
        onChange={v => set('considerarFluxoPrincipal', v)}
      />

      {/* Favorecido */}
      <div>
        <label className="label">Favorecido</label>
        <FavorecidoAutocomplete value={form.payee} onChange={v => set('payee', v)} suggestions={sortedPayees} />
      </div>

      {/* Categoria (opcional) */}
      <div data-guia="provisao-form.categoria">
        <label className="label">Categoria</label>
        <SearchableSelect
          options={expenseCatOpts}
          preserveGroupOrder
          value={form.categoryId}
          onChange={id => set('categoryId', id)}
          placeholder="Sem categoria"
          ungroupedLast
          ungroupedLabel="Sem grupo"
        />
      </div>

      {/* Será pago com reserva */}
      <div data-guia="provisao-form.reserva" className="bg-surface-2/40 rounded-xl p-3.5 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.comReserva}
            onChange={e => setForm(f => ({ ...f, comReserva: e.target.checked, reservaFuncaoId: e.target.checked ? f.reservaFuncaoId : '' }))}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm text-texto-2">Será pago com reserva</span>
        </label>

        {form.comReserva && (
          <div>
            <label className="label text-reserva">Função de Reserva *</label>
            <select
              className="input"
              value={form.reservaFuncaoId}
              onChange={e => set('reservaFuncaoId', e.target.value)}
            >
              <option value="">— Selecione —</option>
              {funcoesReserva.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            {funcoesReserva.length === 0 && (
              <p className="text-xs text-texto-3 mt-1">Nenhuma função de reserva vinculada a uma conta.</p>
            )}
            <p className="text-xs text-texto-3 mt-1.5 leading-snug">
              A provisão entrará como resgate projetado no Fluxo Futuro desta reserva.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        {podeGravarForm
          ? <button type="submit" data-guia="provisao-form.salvar" className="btn-primary flex-1">{initial ? 'Salvar' : 'Lançar Provisão'}</button>
          : <p className="flex-1 text-xs text-texto-3 self-center text-center">Somente leitura — seu nível de acesso não permite gravar.</p>}
      </div>

      {editingOcc && (
        <OcorrenciaEditModal
          originalDate={editingOcc}
          override={form.overrides[editingOcc]}
          isSkipped={form.skipped.includes(editingOcc)}
          defaultAmount={valorBaseDaChave(previewSchedule, editingOcc)}
          baixaNoMes={baixaNoPeriodo(previewSchedule, editingOcc)}
          titulo={parcelaDaData(previewSchedule, editingOcc) ? `Parcela ${parcelaDaData(previewSchedule, editingOcc).numero}/${parcelaDaData(previewSchedule, editingOcc).total} de ${editingOcc.split('-').reverse().join('/')}` : null}
          onSave={salvarParcela}
          onClose={() => setEditingOcc(null)}
        />
      )}
    </form>
  )
}
