import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarContratosApi, criarContratoApi, atualizarContratoApi, excluirContratoApi, salvarItensContratoApi,
  registrarEventoContratoApi, buscarIndiceApi,
  listarRegrasApi, criarRegraApi, atualizarRegraApi, excluirRegraApi,
  listarCreditosApi, criarCreditoApi, atualizarCreditoApi, excluirCreditoApi,
} from '../lib/contratosApi'
import {
  gerarPlanoParcelas, planejarSincronizacao, confirmadosDe, cobertasDoContrato, inicioDasParcelas,
  ehParcelaGerada, parcelaPaga, planoConfirmacaoReajuste, proximoReajuste, parcelasDoPapel, r2, rotuloContrato,
  planoManutencao,
} from '../lib/contratos/parcelas'
import { planoVinculo, planoDesvinculo } from '../lib/contratos/vinculo'
import { analisarEstorno, cancelarOcorrencia } from '../lib/contratos/estorno'
import { composicaoCondominio, composicaoEstimada, creditoDaComposicao } from '../lib/contratos/composicao'
import { planoCreditosAluguel, adiarCredito } from '../lib/contratos/creditos'
import { planejarPosEfetivacao, planejarReversao } from '../lib/contratos/efetivacao'
import { hojeStr, ymDe } from '../lib/contratos/datas'
import { linhasHistorico, novoLoteId } from '../lib/historico'
import { ESCOPO } from '../lib/camposSerie'

// ESTADO E AÇÕES DO MÓDULO DE CONTRATOS (usado dentro do AppProvider). Ficha, regras de itens e
// créditos do proprietário vivem fora de `data`: CRUD direto nas rotas api/contrato*.js. As
// PARCELAS são agendamentos em data.schedules — gravadas pelo sync como qualquer agendamento (um
// único update() por operação). Nenhuma função protegida do AppContext é tocada: contrato só aceita
// conta (não cartão), então o motor de fatura não entra.
//
// GANCHO DE EFETIVAÇÃO (P5): os pontos que baixam uma ocorrência (registerScheduleOccurrence,
// markScheduleRegistered, baixarCobrancaRecorrente, auto-registro) chamam notificarEfetivacao; a fila
// é processada aqui quando o estado já tem a baixa e o lançamento (posEfetivacaoContrato). Estorno e
// exclusão de lançamento chamam reverterEfetivacaoContrato. Perguntas ao usuário (composição do
// boleto, "aplicar às próximas?") viram pendências que o ContratoEfetivacaoHost mostra.

const aplicarMudancas = (schedules, { criar = [], atualizar = [], remover = [] }) => {
  const rem = new Set(remover.map(s => s.id))
  const mud = new Map()
  for (const m of atualizar) mud.set(m.id, { ...(mud.get(m.id) || {}), ...m.changes })
  const existentes = new Set(schedules.map(s => s.id))
  return [
    ...schedules.filter(s => !rem.has(s.id)).map(s => (mud.has(s.id) ? { ...s, ...mud.get(s.id) } : s)),
    ...criar.filter(s => !existentes.has(s.id)),
  ]
}

// Último valor pago de condomínio (lançamento da parcela; sem ele, o valor da parcela).
function valorCondominioPago(contrato, schedules, transactions) {
  const pagas = parcelasDoPapel(contrato, schedules, 'condominio').filter(parcelaPaga)
  const ultima = pagas.at(-1)
  if (!ultima) return null
  const meta = Object.values(ultima.registeredMeta || {})[0]
  const tx = meta?.lancamento_id ? transactions.find(t => t.id === meta.lancamento_id) : transactions.find(t => t.scheduleId === ultima.id)
  return r2(tx ? tx.amount : ultima.amount)
}

// Tabela da Entrega 2 ainda não criada no banco do ambiente (rota responde erro): segue sem créditos.
const semTabela = (err) => /contrato_(creditos|regras_itens)|does not exist|não existe/i.test(String(err?.message || ''))

export function useContratos({ habilitado, update, dataRef, dados, dbConectado, registrarEdicao, reverseTransaction, updateTransaction }) {
  const [contratos, setContratos] = useState([])
  const [carregados, setCarregados] = useState(false)
  const [indices, setIndices] = useState({})
  const indicesRef = useRef({})
  const [fichaAberta, setFichaAberta] = useState(null)
  const [regras, setRegras] = useState([])
  const [creditos, setCreditosState] = useState([])
  const [pendencias, setPendencias] = useState([])
  const contratosRef = useRef([])
  const creditosRef = useRef([])
  useEffect(() => { contratosRef.current = contratos }, [contratos])
  // A ref muda NA HORA (não no render): o recálculo dos aluguéis que vem logo depois (dentro de um
  // update() do `data`, processado antes deste estado) precisa já enxergar o crédito novo/removido.
  const setCreditos = useCallback((fn) => {
    const next = typeof fn === 'function' ? fn(creditosRef.current) : fn
    creditosRef.current = next
    setCreditosState(next)
  }, [])

  const recarregarContratos = useCallback(async () => {
    if (!habilitado) return []
    const lista = await listarContratosApi()
    setContratos(lista)
    setCarregados(true)
    return lista
  }, [habilitado])

  useEffect(() => {
    if (!habilitado || !dbConectado || carregados) return
    let vivo = true
    Promise.all([
      listarContratosApi(),
      listarRegrasApi().catch(err => { if (!semTabela(err)) console.warn('[contratos] regras:', err.message); return [] }),
      listarCreditosApi().catch(err => { if (!semTabela(err)) console.warn('[contratos] créditos:', err.message); return [] }),
    ])
      .then(([lista, rs, cs]) => {
        if (!vivo) return
        contratosRef.current = lista
        creditosRef.current = cs
        setContratos(lista)
        setRegras(rs)
        setCreditosState(cs)
        setCarregados(true)
      })
      .catch(err => console.warn('[contratos] falha ao carregar:', err.message))
    return () => { vivo = false }
  }, [habilitado, dbConectado, carregados])

  const carregarIndice = useCallback(async (indice) => {
    if (indice !== 'IPCA' && indice !== 'IGPM') return null
    if (indicesRef.current[indice]) return indicesRef.current[indice]
    const r = await buscarIndiceApi(indice)
    indicesRef.current = { ...indicesRef.current, [indice]: r }
    setIndices(indicesRef.current)
    return r
  }, [])

  const indicesPara = useCallback(async (contrato) => {
    if (contrato.indice_reajuste === 'IPCA' || contrato.indice_reajuste === 'IGPM') {
      await carregarIndice(contrato.indice_reajuste).catch(() => null)
    }
    return indicesRef.current
  }, [carregarIndice])

  const trocarNaLista = (row) => setContratos(prev => {
    const i = prev.findIndex(c => c.id === row.id)
    if (i < 0) return [row, ...prev]
    const out = prev.slice()
    out[i] = { ...prev[i], ...row }
    return out
  })

  const registrarEvento = useCallback(async (contratoId, evento) => {
    const ev = await registrarEventoContratoApi(contratoId, { data_evento: hojeStr(), ...evento })
    if (evento.tipo === 'edicao_parcela' && evento.detalhes?.acao === 'exclusao') {
      setContratos(prev => prev.map(c => (c.id === contratoId ? { ...c, excluidas: [...(c.excluidas || []), evento.detalhes.parcela_id] } : c)))
    }
    return ev
  }, [])

  // Créditos abertos nos aluguéis pendentes (regra: próximo aluguel pendente com vencimento >= a
  // data do crédito) — aplicado DEPOIS de qualquer mudança de parcelas, para regenerar parcelas ou
  // reprojetar o reajuste nunca perder o abatimento.
  const comCreditos = useCallback((schedules) => {
    let s = schedules
    for (const c of contratosRef.current) {
      const p = planoCreditosAluguel(c, s, creditosRef.current)
      if (p.length) s = aplicarMudancas(s, { atualizar: p })
    }
    return s
  }, [])
  const redistribuirCreditos = useCallback(() => {
    update(d => {
      const s = comCreditos(d.schedules)
      return s === d.schedules ? d : { ...d, schedules: s }
    })
  }, [update, comCreditos])

  // Plano de sincronização das parcelas (sem aplicar) contra `schedules` (padrão: o estado atual).
  const planejarParcelas = useCallback(async (contrato, { schedules = null, apartirDe = null, valoresMantidos = {} } = {}) => {
    const lista = schedules || dataRef.current.schedules
    const hoje = hojeStr()
    const idx = await indicesPara(contrato)
    const inicio = apartirDe || inicioDasParcelas(contrato, lista) || ymDe(hoje)
    const plano = gerarPlanoParcelas(contrato, {
      hoje, indices: idx, confirmados: confirmadosDe(contrato, lista), apartirDe: inicio, valoresMantidos,
      valorCondominio: valorCondominioPago(contrato, lista, dataRef.current.transactions),
    })
    return planejarSincronizacao(contrato, lista, plano, {
      excluidas: contrato.excluidas || [], cobertas: cobertasDoContrato(contrato, lista), apartirDe: inicio,
    })
  }, [dataRef, indicesPara])

  // Aplica criar/atualizar/remover num único update(). `motivo` → grava as mudanças de valor das
  // parcelas pendentes no histórico de alterações (P4).
  const aplicarParcelas = useCallback(async (mudancas, { motivo = null, escopo = ESCOPO.PROXIMAS } = {}) => {
    update(d => ({ ...d, schedules: comCreditos(aplicarMudancas(d.schedules, mudancas)) }))
    if (!motivo) return
    const itens = (mudancas.atualizar || [])
      .filter(m => m.antes && m.changes.amount != null && r2(m.antes.amount) !== r2(m.changes.amount))
      .map(m => ({ id: m.id, ocorrenciaData: m.antes.startDate, escopo, mudancas: [{ campo: 'amount', de: r2(m.antes.amount), para: r2(m.changes.amount) }] }))
    if (!itens.length) return
    const loteId = novoLoteId()
    try {
      await registrarEdicao({
        agendamentos: (mudancas.atualizar || []).filter(m => m.antes).map(m => ({ ...m.antes, ...m.changes })),
        historico: linhasHistorico({ entidade: 'agendamento', itens, loteId, motivo }),
        loteId, motivo,
      })
    } catch (err) {
      console.warn('[contratos] histórico não gravado:', err.message)
    }
  }, [update, registrarEdicao, comCreditos])

  const criarContrato = useCallback(async (dadosContrato, itens = []) => {
    const r = await criarContratoApi({ ...dadosContrato, proximo_reajuste: proximoReajuste(dadosContrato, hojeStr()) }, itens)
    trocarNaLista(r.contrato)
    contratosRef.current = [r.contrato, ...contratosRef.current.filter(c => c.id !== r.contrato.id)]
    return r.contrato
  }, [])

  const atualizarContrato = useCallback(async (id, campos, evento = null) => {
    const atual = contratos.find(c => c.id === id) || {}
    const junto = { ...atual, ...campos }
    const r = await atualizarContratoApi(id, { ...campos, proximo_reajuste: proximoReajuste(junto, hojeStr()) }, evento)
    trocarNaLista(r.contrato)
    return { ...atual, ...r.contrato }
  }, [contratos])

  const salvarItens = useCallback((id, itens) => salvarItensContratoApi(id, itens), [])

  // Vínculo (D2) de séries existentes + geração das parcelas, num só update().
  //   selecoes: [{ schedule, papel }]; valoresMantidos: { papel: { 'AAAA-MM': valor } }.
  const vincularEGerar = useCallback(async (contrato, { selecoes = [], valoresMantidos = {}, apartirDe = null } = {}) => {
    const atual = dataRef.current.schedules
    const vinculos = selecoes.map(({ schedule, papel }) => ({ schedule, papel, ...planoVinculo(schedule, papel, contrato.id) }))
    const simulado = aplicarMudancas(atual, { atualizar: vinculos.map(v => ({ id: v.schedule.id, changes: v.changes })) })
    const plano = await planejarParcelas(contrato, { schedules: simulado, apartirDe, valoresMantidos })
    await aplicarParcelas({
      criar: plano.criar,
      atualizar: [...vinculos.map(v => ({ id: v.schedule.id, changes: v.changes })), ...plano.atualizar],
      remover: plano.remover,
    })
    for (const v of vinculos) {
      await registrarEvento(contrato.id, {
        tipo: 'vinculo',
        detalhes: { agendamento_id: v.schedule.id, descricao: v.schedule.description, papel: v.papel, cobertas: v.cobertas, antes: v.antes },
      }).catch(err => console.warn('[contratos] evento de vínculo não gravado:', err.message))
    }
    return { vinculados: vinculos.length, criadas: plano.criar.length, removidas: plano.remover.length }
  }, [dataRef, planejarParcelas, aplicarParcelas, registrarEvento])

  const desvincular = useCallback(async (contrato, schedule) => {
    update(d => ({ ...d, schedules: d.schedules.map(s => (s.id === schedule.id ? { ...s, ...planoDesvinculo() } : s)) }))
    await registrarEvento(contrato.id, { tipo: 'desvinculo', detalhes: { agendamento_id: schedule.id, descricao: schedule.description } })
  }, [update, registrarEvento])

  // Confirmar reajuste numa parcela (aceitar a projeção ou o valor do boleto).
  const confirmarReajuste = useCallback(async (contrato, parcelaId, novoBase, { escopo = 'ciclo' } = {}) => {
    const idx = await indicesPara(contrato)
    const r = planoConfirmacaoReajuste(contrato, dataRef.current.schedules, parcelaId, novoBase, { escopo, indices: idx })
    const motivo = `Contrato ${rotuloContrato(contrato)}: reajuste confirmado`
    await aplicarParcelas({ atualizar: r.mudancas }, { motivo, escopo: escopo === 'ciclo' ? ESCOPO.PROXIMAS : ESCOPO.PARCELA })
    await registrarEvento(contrato.id, {
      tipo: r.baseAnterior != null && r2(novoBase) === r2(r.baseAnterior) ? 'confirmacao_valor' : 'reajuste',
      indice: contrato.indice_reajuste, percentual: r.percentual, valor_anterior: r.baseAnterior, valor_novo: r2(novoBase),
      detalhes: { parcela_id: parcelaId, ciclo: r.ciclo, escopo, parcelas: r.mudancas.map(m => m.id) },
    }).catch(err => console.warn('[contratos] evento de reajuste não gravado:', err.message))
    return r
  }, [dataRef, indicesPara, aplicarParcelas, registrarEvento])

  // Exclusão de UMA parcela/agendamento do contrato (escolhida no modal): não volta na regeneração.
  const excluirParcela = useCallback(async (contrato, schedule) => {
    update(d => ({ ...d, schedules: comCreditos(d.schedules.filter(s => s.id !== schedule.id)) }))
    if (!contrato) return
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela',
      valor_anterior: r2(schedule.amount),
      detalhes: { acao: 'exclusao', parcela_id: schedule.id, vencimento: schedule.startDate, papel: schedule.contratoPapel },
    })
  }, [update, registrarEvento, comCreditos])

  // Rescisão simples (a da Entrega 3 traz multa e simulação): pendentes depois da data saem,
  // status 'rescindido', evento com o que foi cancelado. Pagas ficam.
  const rescindir = useCallback(async (contrato, data, { motivo = '' } = {}) => {
    const canceladas = dataRef.current.schedules.filter(s => s.contratoId === contrato.id
      && ehParcelaGerada(s, contrato.id) && !parcelaPaga(s) && s.startDate > data)
    update(d => {
      const ids = new Set(canceladas.map(s => s.id))
      return { ...d, schedules: d.schedules.filter(s => !ids.has(s.id)) }
    })
    const row = await atualizarContrato(contrato.id, { status: 'rescindido' }, {
      tipo: 'rescisao', data_evento: hojeStr(),
      detalhes: { data_saida: data, motivo, canceladas: canceladas.map(s => ({ id: s.id, vencimento: s.startDate, valor: r2(s.amount) })) },
    })
    return { contrato: row, canceladas: canceladas.length }
  }, [dataRef, update, atualizarContrato])

  // Exclusão do contrato: só sem parcela paga (a API confere). As pendentes saem antes.
  const excluirContrato = useCallback(async (contrato) => {
    await excluirContratoApi(contrato.id)
    update(d => ({
      ...d,
      schedules: d.schedules
        .filter(s => !(ehParcelaGerada(s, contrato.id) && !parcelaPaga(s)))
        .map(s => (s.contratoId === contrato.id ? { ...s, ...planoDesvinculo() } : s)),
    }))
    setContratos(prev => prev.filter(c => c.id !== contrato.id))
    setCreditos(prev => prev.filter(c => c.contrato_id !== contrato.id))
  }, [update, setCreditos])

  // ── Regras de itens do boleto ─────────────────────────────────────────────────────────────────
  const criarRegra = useCallback(async (regra) => {
    const row = await criarRegraApi(regra)
    setRegras(prev => [...prev, row])
    return row
  }, [])
  const atualizarRegra = useCallback(async (regra) => {
    const row = await atualizarRegraApi(regra)
    setRegras(prev => prev.map(r => (r.id === row.id ? row : r)))
    return row
  }, [])
  const excluirRegra = useCallback(async (id) => {
    await excluirRegraApi(id)
    setRegras(prev => prev.filter(r => r.id !== id))
  }, [])

  // ── Créditos do proprietário ──────────────────────────────────────────────────────────────────
  const trocarCredito = (row) => setCreditos(prev => (prev.some(c => c.id === row.id) ? prev.map(c => (c.id === row.id ? row : c)) : [...prev, row]))

  // Crédito GERADO pelo lançamento do condomínio: troca pelo da composição nova. Já compensado num
  // aluguel pago não muda (devolve false para a tela avisar).
  const substituirCreditoGerado = useCallback(async (contrato, tx, parcela, composicao) => {
    const atual = creditosRef.current.find(c => c.origem_lancamento_id === tx.id)
    if (atual?.status === 'compensado') return false
    if (atual) {
      await excluirCreditoApi(atual.id)
      setCreditos(prev => prev.filter(c => c.id !== atual.id))
    }
    const novo = creditoDaComposicao(composicao, { contratoId: contrato.id, tx, parcela })
    if (novo) trocarCredito(await criarCreditoApi(novo))
    return true
  }, [setCreditos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Composição do boleto do condomínio confirmada (tela) ou estimada (sem tela): lançamento único
  // com a composição (P2) e crédito 'aberto' com os itens do proprietário.
  const gravarComposicaoCondominio = useCallback(async ({ contrato, parcela, tx, composicao }) => {
    updateTransaction(tx.id, { contratoId: contrato.id, composicao })
    const ok = await substituirCreditoGerado(contrato, tx, parcela, composicao)
    redistribuirCreditos()
    return ok
  }, [updateTransaction, substituirCreditoGerado, redistribuirCreditos])

  const confirmarComposicao = useCallback(async ({ contrato, parcela, tx, itens, lembrar = [] }) => {
    for (const l of lembrar) {
      await criarRegra({ contrato_id: contrato.id, padrao: l.padrao, tipo_match: 'comeca_com', responsavel: l.responsavel })
        .catch(err => console.warn('[contratos] regra não gravada:', err.message))
    }
    return gravarComposicaoCondominio({ contrato, parcela, tx, composicao: composicaoCondominio(itens) })
  }, [criarRegra, gravarComposicaoCondominio])

  // Sem a composição: os itens do proprietário repetem a última conhecida — "estimada, revisar".
  const estimarComposicao = useCallback(async ({ contrato, parcela, tx }) => {
    const anteriores = dataRef.current.transactions
      .filter(t => t.contratoId === contrato.id && t.id !== tx.id && t.composicao?.tipo === 'condominio')
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    const ultima = anteriores.find(t => !t.composicao.estimada) || anteriores[0]
    return gravarComposicaoCondominio({ contrato, parcela, tx, composicao: composicaoEstimada(tx.amount, ultima?.composicao) })
  }, [dataRef, gravarComposicaoCondominio])

  const compensarCreditos = useCallback(async (ids, tx, parcela) => {
    for (const id of ids) {
      try {
        trocarCredito(await atualizarCreditoApi({
          id, status: 'compensado', compensado_em_lancamento_id: tx.id, compensado_em_agendamento_id: parcela?.id || null, data_compensacao: tx.date,
        }))
      } catch (err) {
        console.warn('[contratos] crédito não compensado:', err.message)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // "Não abater neste mês": o crédito vai para o próximo aluguel pendente.
  const adiarCreditoNaParcela = useCallback((parcelaId, creditoId) => {
    update(d => {
      const s = d.schedules.map(x => (x.id === parcelaId ? { ...x, ...adiarCredito(x, creditoId) } : x))
      return { ...d, schedules: comCreditos(s) }
    })
  }, [update, comCreditos])

  // Composição de um lançamento PAGO editada na tela: novo total (o saldo acompanha) e créditos
  // recalculados. Aluguel: crédito tirado da composição volta a aberto. → { ok, aviso }
  const editarComposicaoLancamento = useCallback(async (tx, composicao) => {
    const contrato = contratosRef.current.find(c => c.id === tx.contratoId)
    if (!contrato) return { ok: false, aviso: 'Contrato não encontrado.' }
    const parcela = dataRef.current.schedules.find(s => s.id === tx.scheduleId) || null
    if (composicao.tipo === 'condominio') {
      const anterior = creditosRef.current.find(c => c.origem_lancamento_id === tx.id)
      if (anterior?.status === 'compensado' && r2(anterior.valor) !== r2(composicao.proprietario)) {
        return { ok: false, aviso: 'O crédito deste condomínio já foi abatido num aluguel pago. Estorne aquele aluguel antes de mudar os itens do proprietário.' }
      }
      updateTransaction(tx.id, { amount: r2(composicao.total), composicao })
      await substituirCreditoGerado(contrato, { ...tx, amount: composicao.total }, parcela, composicao)
    } else {
      const antes = new Set((tx.composicao?.itens || []).filter(i => i.credito_id).map(i => i.credito_id))
      const depois = new Set((composicao.itens || []).filter(i => i.credito_id).map(i => i.credito_id))
      for (const id of antes) {
        if (depois.has(id)) continue
        try {
          trocarCredito(await atualizarCreditoApi({ id, status: 'aberto', compensado_em_lancamento_id: null, compensado_em_agendamento_id: null, data_compensacao: null }))
        } catch (err) { console.warn('[contratos] crédito não reaberto:', err.message) }
      }
      updateTransaction(tx.id, { amount: r2(composicao.total), composicao })
    }
    redistribuirCreditos()
    return { ok: true }
  }, [dataRef, updateTransaction, substituirCreditoGerado, redistribuirCreditos]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pendências para a tela (ContratoEfetivacaoHost) ───────────────────────────────────────────
  const adicionarPendencia = useCallback((p) => {
    setPendencias(prev => (prev.some(x => x.chave === p.chave) ? prev : [...prev, p]))
  }, [])
  const resolverPendencia = useCallback((chave) => setPendencias(prev => prev.filter(p => p.chave !== chave)), [])

  // posEfetivacaoContrato(agendamento, lançamento): o que acontece depois que uma parcela é paga.
  const posEfetivacao = useCallback(async ({ contrato, parcela, tx, auto }) => {
    const plano = planejarPosEfetivacao({ contrato, parcela, tx, auto })
    if (plano.lancamento) updateTransaction(tx.id, plano.lancamento)
    if (plano.compensar.length) {
      await compensarCreditos(plano.compensar, tx, parcela)
      redistribuirCreditos()
    }
    if (plano.perguntarReajuste) {
      adicionarPendencia({ chave: `reajuste:${tx.id}`, tipo: 'reajuste', contratoId: contrato.id, parcelaId: parcela.id, txId: tx.id, ...plano.perguntarReajuste })
    }
    if (plano.pedirComposicao) adicionarPendencia({ chave: `composicao:${tx.id}`, tipo: 'composicao', contratoId: contrato.id, parcelaId: parcela.id, txId: tx.id })
    if (plano.estimar) await estimarComposicao({ contrato, parcela, tx })
  }, [updateTransaction, compensarCreditos, redistribuirCreditos, adicionarPendencia, estimarComposicao])

  // Fila do gancho: { scheduleId, occurrenceDate, lancamentoId, auto }. Processada quando o estado
  // já tem o agendamento e o lançamento (o update() do ponto de efetivação é assíncrono).
  const filaRef = useRef(new Map())
  const [tickFila, setTickFila] = useState(0)
  const notificarEfetivacao = useCallback((lista) => {
    if (!habilitado) return
    for (const n of lista || []) {
      if (n?.scheduleId && n.lancamentoId) filaRef.current.set(`${n.scheduleId}@${n.occurrenceDate}@${n.lancamentoId}`, { ...n, tentativas: 0 })
    }
    setTickFila(t => t + 1)
  }, [habilitado])
  useEffect(() => {
    if (!carregados || !filaRef.current.size) return
    for (const [chave, n] of [...filaRef.current]) {
      const parcela = dados.schedules.find(s => s.id === n.scheduleId)
      const tx = dados.transactions.find(t => t.id === n.lancamentoId)
      if (!parcela || !tx) {
        n.tentativas += 1
        if (n.tentativas > 20) filaRef.current.delete(chave)
        continue
      }
      filaRef.current.delete(chave)
      if (!parcela.contratoId) continue
      const contrato = contratosRef.current.find(c => c.id === parcela.contratoId)
      if (!contrato) continue
      posEfetivacao({ contrato, parcela, tx, auto: !!n.auto })
        .catch(err => console.warn('[contratos] pós-efetivação falhou:', err.message))
    }
  }, [tickFila, dados.schedules, dados.transactions, carregados, posEfetivacao])

  // reverterEfetivacaoContrato: estorno/exclusão do lançamento → créditos compensados nele voltam a
  // abertos, o gerado por ele (condomínio) sai, e o evento fica na linha do tempo.
  const reverterEfetivacao = useCallback(async (tx) => {
    if (!tx || !habilitado) return
    const r = planejarReversao({ tx, creditos: creditosRef.current })
    if (!r.reabrir.length && !r.remover.length && !r.manter.length) return
    for (const id of r.reabrir) {
      try {
        trocarCredito(await atualizarCreditoApi({ id, status: 'aberto', compensado_em_lancamento_id: null, compensado_em_agendamento_id: null, data_compensacao: null }))
      } catch (err) { console.warn('[contratos] crédito não reaberto:', err.message) }
    }
    for (const id of r.remover) {
      try {
        await excluirCreditoApi(id)
        setCreditos(prev => prev.filter(c => c.id !== id))
      } catch (err) { console.warn('[contratos] crédito não removido:', err.message) }
    }
    redistribuirCreditos()
    const contratoId = tx.contratoId || creditosRef.current.find(c => [...r.reabrir, ...r.manter].includes(c.id))?.contrato_id
    if (contratoId) {
      await registrarEvento(contratoId, {
        tipo: 'edicao_parcela', valor_anterior: r2(tx.amount),
        detalhes: { acao: 'reversao_creditos', lancamento_id: tx.id, creditos_reabertos: r.reabrir, creditos_removidos: r.remover, creditos_mantidos: r.manter },
      }).catch(err => console.warn('[contratos] evento de reversão não gravado:', err.message))
    }
  }, [habilitado, setCreditos, redistribuirCreditos, registrarEvento]) // eslint-disable-line react-hooks/exhaustive-deps

  // Uma vez por sessão, depois do load do banco, para cada contrato ativo:
  //   • sem data de fim: estende as parcelas até 12 meses à frente (ids determinísticos: outro
  //     aparelho fazendo o mesmo grava a mesma linha);
  //   • manutenção: descrição das pendentes e reprojeção das PROJETADAS com o índice atual (as que
  //     nasceram sem índice, a 0%, ganham o valor certo aqui); créditos abertos nos aluguéis.
  const garantidoRef = useRef(false)
  useEffect(() => {
    if (!habilitado || !dbConectado || !carregados || garantidoRef.current) return
    garantidoRef.current = true
    ;(async () => {
      const criar = []
      const atualizar = []
      for (const c of contratos) {
        if (c.status !== 'ativo') continue
        const lista = dataRef.current.schedules
        if (!inicioDasParcelas(c, lista)) continue
        const idx = await indicesPara(c)
        atualizar.push(...planoManutencao(c, lista, { hoje: hojeStr(), indices: idx }))
        if (c.data_fim) continue
        const plano = gerarPlanoParcelas(c, {
          hoje: hojeStr(), indices: idx, confirmados: confirmadosDe(c, lista), apartirDe: inicioDasParcelas(c, lista),
          valorCondominio: valorCondominioPago(c, lista, dataRef.current.transactions),
        })
        criar.push(...planejarSincronizacao(c, lista, plano, { excluidas: c.excluidas || [], cobertas: cobertasDoContrato(c, lista), soExtender: true }).criar)
      }
      update(d => {
        const s = comCreditos(aplicarMudancas(d.schedules, { criar, atualizar }))
        return s === d.schedules ? d : { ...d, schedules: s }
      })
    })().catch(err => console.warn('[contratos] extensão das parcelas falhou:', err.message))
  }, [habilitado, dbConectado, carregados, contratos, dataRef, indicesPara, update, comCreditos])

  // Estorno de lançamento que pagou parcela de contrato. reabrir = false: a ocorrência reaberta pelo
  // estorno fica cancelada (pulada) — usado em contrato rescindido/encerrado, quando o usuário
  // responde "Não". Sempre registra o evento na linha do tempo. Créditos: reverseTransaction chama
  // reverterEfetivacaoContrato.
  const estornarLancamentoContrato = useCallback(async (tx, { reabrir = true } = {}) => {
    const a = analisarEstorno(tx, dataRef.current.schedules, (id) => contratos.find(c => c.id === id) || null)
    reverseTransaction(tx.id)
    if (!a?.schedule || !a.ocorrencia) return a
    if (!reabrir) {
      update(d => ({ ...d, schedules: d.schedules.map(s => (s.id === a.schedule.id ? cancelarOcorrencia(s, a.ocorrencia) : s)) }))
    }
    if (a.contrato) {
      await registrarEvento(a.contrato.id, {
        tipo: 'edicao_parcela', valor_anterior: r2(tx.amount),
        detalhes: {
          acao: reabrir ? 'estorno_reaberta' : 'estorno_cancelada', parcela_id: a.schedule.id, lancamento_id: tx.id,
          vencimento: a.ocorrencia, papel: a.schedule.contratoPapel, status_contrato: a.contrato.status,
        },
      }).catch(err => console.warn('[contratos] evento de estorno não gravado:', err.message))
    }
    return a
  }, [dataRef, contratos, reverseTransaction, update, registrarEvento])

  const abrirFichaContrato = useCallback((id, acao = null) => setFichaAberta(id ? { id, acao } : null), [])
  const fecharFichaContrato = useCallback(() => setFichaAberta(null), [])
  const contratoPorId = useCallback((id) => contratos.find(c => c.id === id) || null, [contratos])

  return {
    contratosHabilitado: habilitado,
    contratos, contratosCarregados: carregados, indicesContratos: indices, contratoPorId,
    recarregarContratos, carregarIndice, criarContrato, atualizarContrato, excluirContrato, salvarItensContrato: salvarItens,
    registrarEventoContrato: registrarEvento, planejarParcelasContrato: planejarParcelas, aplicarParcelasContrato: aplicarParcelas,
    vincularEGerarContrato: vincularEGerar, desvincularDoContrato: desvincular, confirmarReajusteContrato: confirmarReajuste,
    excluirParcelaContrato: excluirParcela, rescindirContrato: rescindir, estornarLancamentoContrato,
    fichaContratoAberta: fichaAberta, abrirFichaContrato, fecharFichaContrato,
    regrasContratos: regras, criarRegraContrato: criarRegra, atualizarRegraContrato: atualizarRegra, excluirRegraContrato: excluirRegra,
    creditosContratos: creditos, adiarCreditoNaParcela, editarComposicaoLancamento,
    pendenciasContrato: pendencias, resolverPendenciaContrato: resolverPendencia,
    confirmarComposicaoContrato: confirmarComposicao, estimarComposicaoContrato: estimarComposicao,
    notificarEfetivacao, reverterEfetivacaoContrato: reverterEfetivacao,
  }
}
