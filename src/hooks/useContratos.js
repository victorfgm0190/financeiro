import { faltaRecurso, MSG_CREDITO_PREVISTO, MSG_ENCARGOS, MSG_REPASSE } from '../lib/recursosBanco'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarContratosApi, criarContratoApi, atualizarContratoApi, excluirContratoApi, salvarItensContratoApi,
  registrarEventoContratoApi, buscarIndiceApi, buscarContratoApi,
  listarRegrasApi, criarRegraApi, atualizarRegraApi, excluirRegraApi,
  listarCreditosApi, criarCreditoApi, atualizarCreditoApi, excluirCreditoApi,
  salvarCompetenciaApi, excluirCompetenciaApi,
} from '../lib/contratosApi'
import { taxaDoItem } from '../lib/contratos/composicaoRepasse'
import { ehModoRepasse } from '../lib/contratos/repasse'
import {
  gerarPlanoParcelas, planejarSincronizacao, confirmadosDe, cobertasDoContrato, inicioDasParcelas,
  ehParcelaGerada, parcelaPaga, planoConfirmacaoReajuste, proximoReajuste, r2, rotuloContrato,
  planoManutencao, idParcela, parcelaDeVinculo, ehParcelaDeVinculo, repassesRegistrados,
} from '../lib/contratos/parcelas'
import { planoVinculo, planoDesvinculo } from '../lib/contratos/vinculo'
import { mapaVinculos } from '../lib/vinculo'
import { analisarEstorno, cancelarOcorrencia } from '../lib/contratos/estorno'
import { composicaoCondominio, composicaoEstimada, creditoDaComposicao } from '../lib/contratos/composicao'
import { planoCreditosAluguel, adiarCredito, liberarAdiamento, marcarValorManual, statusAoReabrir, planoComCreditos } from '../lib/contratos/creditos'
import {
  ehCondominioAberto, temComposicaoInformada, composicaoDaParcela, planoInformarParcela, planoRemoverComposicao,
  creditoPrevistoDaParcela, creditoDaParcela, planoCreditoDaParcela, composicaoNoPagamento, vencimentoParcela,
} from '../lib/contratos/composicaoAberta'
import { planejarPosEfetivacao, planejarReversao, planejarJustificativa } from '../lib/contratos/efetivacao'
import { ultimoCondominioPago, planoPrevisaoCondominio, valorPrevistoCondominio } from '../lib/contratos/condominio'
import { hojeStr, ymDe, fmtYm } from '../lib/contratos/datas'
import { linhasHistorico, novoLoteId } from '../lib/historico'
import { ESCOPO } from '../lib/camposSerie'
import { gravarVinculoNaLinha, vinculoRepetido } from '../lib/contratos/gravarVinculo'
import { composicaoDoRecibo, validarRecibo } from '../lib/contratos/composicaoAluguel'
import { encargoParaItem, encargoDoItem, inicioPelaParcelaAtual } from '../lib/contratos/encargos'

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

// Último valor pago de condomínio (parcela gerada ou série vinculada, pela data do pagamento), ou null.
const valorCondominioPago = (contrato, schedules, transactions) =>
  ultimoCondominioPago(contrato, schedules, transactions)?.valor ?? null

// Evento "vínculo" da linha do tempo (gravado só depois da parcela).
const eventoDoVinculo = (linha, tx, parcelaId) => ({
  tipo: 'vinculo', valor_novo: r2(tx.amount),
  detalhes: {
    acao: 'lancamento', lancamento_id: tx.id, parcela_id: parcelaId, papel: linha.papel, competencia: linha.competencia,
    numero: linha.numero, total: linha.total, data_pagamento: tx.date, criada: !!linha.semParcela, descricao: tx.description,
  },
})

// Tabela da Entrega 2 ainda não criada no banco do ambiente (rota responde erro): segue sem créditos.
const semTabela = (err) => /contrato_(creditos|regras_itens)|does not exist|não existe/i.test(String(err?.message || ''))

export function useContratos({ habilitado, update, dataRef, dados, dbConectado, registrarEdicao, reverseTransaction, updateTransaction, persistirAgora, recursosBanco = null }) {
  const recursosRef = useRef(recursosBanco)
  useEffect(() => { recursosRef.current = recursosBanco }, [recursosBanco])
  const [contratos, setContratos] = useState([])
  const [carregados, setCarregados] = useState(false)
  const [indices, setIndices] = useState({})
  const indicesRef = useRef({})
  const [fichaAberta, setFichaAberta] = useState(null)
  const [regras, setRegras] = useState([])
  const [creditos, setCreditosState] = useState([])
  const [pendencias, setPendencias] = useState([])
  // Pedido de abrir a "Composição do boleto" de uma parcela (ficha, Agendamentos, Assistente): um só
  // lugar na tela (ComposicaoParcelaHost). { parcelaId, txId?, leitura? }
  const [pedidoComposicao, setPedidoComposicao] = useState(null)
  const contratosRef = useRef([])
  // Definidos mais abaixo e usados por ações declaradas antes deles.
  const notificarEfetivacaoRef = useRef(null)
  // persistirAgora do AppContext (função nova a cada render): lida na hora pela ref.
  const persistirRef = useRef(persistirAgora)
  useEffect(() => { persistirRef.current = persistirAgora })
  const vinculosEmAndamento = useRef(new Set())
  const reverterEfetivacaoRef = useRef(null)
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
      repassesReais: repassesRegistrados(contrato, lista, dataRef.current.transactions),
    })
    const sinc = planejarSincronizacao(contrato, lista, plano, {
      excluidas: contrato.excluidas || [], cobertas: cobertasDoContrato(contrato, lista), apartirDe: inicio,
    })
    // Valor FINAL de cada parcela: com os créditos a abater (aberto e previsto) pela regra deste
    // contrato (a do aditivo, se mudou) e os "Não abater" mantidos — a Prévia mostra o real e a
    // gravação (histórico incluso) nunca tira os créditos. Mesma função da ficha (planoCreditosAluguel).
    return planoComCreditos(contrato, lista, sinc, creditosRef.current)
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

  // D5: condomínios pendentes (não manuais) seguem o último pago — por pagamento, composição ou
  // estorno (excluirTx). Mudança de valor vai para o histórico de alterações.
  const atualizarPrevisaoCondominio = useCallback(async (contrato, estado, { excluirTx = null } = {}) => {
    if (!contrato?.tem_condominio) return
    const { valor, atualizar } = planoPrevisaoCondominio(contrato, estado.schedules, estado.transactions, { excluirTx })
    if (!atualizar.length) return
    await aplicarParcelas({ atualizar }, {
      motivo: `Contrato ${rotuloContrato(contrato)}: condomínio previsto = último pago (${String(valor).replace('.', ',')})`,
    })
  }, [aplicarParcelas])

  const criarContrato = useCallback(async (dadosContrato, itens = []) => {
    if (itens.some(i => i.na_parcela) && faltaRecurso(recursosRef.current, 'encargosContrato')) throw new Error(MSG_ENCARGOS)
    if (dadosContrato.modo_repasse && faltaRecurso(recursosRef.current, 'contratoRepasse')) throw new Error(MSG_REPASSE)
    const r = await criarContratoApi({ ...dadosContrato, proximo_reajuste: proximoReajuste(dadosContrato, hojeStr()) }, itens)
    // Encargos/descontos na parcela e taxas do repasse vão junto no contrato (o plano das parcelas usa).
    const c = {
      ...r.contrato, encargos: (r.itens || []).filter(i => i.na_parcela).map(encargoDoItem),
      itens_repasse: (r.itens || []).filter(i => i.tipo_repasse).map(taxaDoItem), competencias: [],
    }
    trocarNaLista(c)
    contratosRef.current = [c, ...contratosRef.current.filter(x => x.id !== c.id)]
    return c
  }, [])

  const atualizarContrato = useCallback(async (id, campos, evento = null) => {
    const atual = contratos.find(c => c.id === id) || {}
    const junto = { ...atual, ...campos }
    if (junto.modo_repasse && faltaRecurso(recursosRef.current, 'contratoRepasse')) throw new Error(MSG_REPASSE)
    const r = await atualizarContratoApi(id, { ...campos, proximo_reajuste: proximoReajuste(junto, hojeStr()) }, evento)
    trocarNaLista(r.contrato)
    // A ref muda na hora: a redistribuição dos créditos logo depois (aditivo da regra de
    // abatimento) já usa o contrato novo.
    contratosRef.current = contratosRef.current.map(c => (c.id === id ? { ...c, ...r.contrato } : c))
    return { ...atual, ...r.contrato }
  }, [contratos])

  // Itens do contrato (registro + encargos na parcela): a lista substitui a anterior; os encargos
  // gravados atualizam o contrato no estado (a ref na hora — o plano logo depois já os usa).
  const salvarItens = useCallback(async (id, itens) => {
    if (itens.some(i => i.na_parcela) && faltaRecurso(recursosRef.current, 'encargosContrato')) throw new Error(MSG_ENCARGOS)
    const rows = await salvarItensContratoApi(id, itens)
    const encargos = rows.filter(i => i.na_parcela).map(encargoDoItem)
    const itensRepasse = rows.filter(i => i.tipo_repasse).map(taxaDoItem)
    trocarNaLista({ id, encargos, itens_repasse: itensRepasse })
    contratosRef.current = contratosRef.current.map(c => (c.id === id ? { ...c, encargos, itens_repasse: itensRepasse } : c))
    return rows
  }, [])

  // MODO REPASSE: grava a composição de UMA competência (contrato_competencias, fonte da verdade) e
  // refaz os repasses pendentes — o saldo com a administradora muda desta competência em diante.
  // A geração vai pelo menos até a competência editada (quem mexe num mês espera ver o repasse dele).
  //   comp: { competencia, itens, status, observacao }; remover = volta ao padrão do contrato.
  const salvarCompetenciaRepasse = useCallback(async (contratoId, comp, { remover = false } = {}) => {
    if (faltaRecurso(recursosRef.current, 'contratoRepasse')) throw new Error(MSG_REPASSE)
    const atual = contratosRef.current.find(c => c.id === contratoId)
    if (!atual || !ehModoRepasse(atual)) throw new Error('Contrato a receber por administradora não encontrado.')
    let row = null
    if (remover) await excluirCompetenciaApi(contratoId, comp.competencia)
    else row = await salvarCompetenciaApi(contratoId, comp)
    const competencias = [...(atual.competencias || []).filter(x => x.competencia !== comp.competencia), ...(row ? [row] : [])]
      .sort((a, b) => a.competencia.localeCompare(b.competencia))
    const novo = { ...atual, competencias }
    trocarNaLista({ id: contratoId, competencias })
    contratosRef.current = contratosRef.current.map(c => (c.id === contratoId ? novo : c))
    const inicio = inicioDasParcelas(novo, dataRef.current.schedules)
    const apartirDe = !inicio || comp.competencia < inicio ? comp.competencia : inicio
    const plano = await planejarParcelas(novo, { apartirDe })
    await aplicarParcelas(plano, { motivo: `Contrato ${rotuloContrato(novo)}: composição do repasse ${fmtYm(comp.competencia)}` })
    return row
  }, [dataRef, planejarParcelas, aplicarParcelas])

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

  // Crédito GERADO pelo lançamento do condomínio (ou o PREVISTO da parcela, boleto informado antes
  // de pagar): passa a ser o da composição nova — o MESMO registro (id, destino escolhido e "não
  // abater" continuam valendo), 'aberto' e ligado ao lançamento. Já compensado num aluguel pago:
  // com o mesmo valor só ganha o lançamento (não gera outro igual); com outro valor não muda
  // (devolve false para a tela avisar).
  const substituirCreditoGerado = useCallback(async (contrato, tx, parcela, composicao) => {
    const doContrato = creditosRef.current.filter(c => c.contrato_id === contrato.id)
    const atual = creditoDaParcela(doContrato, parcela?.id, tx.id)
    const novo = creditoDaComposicao(composicao, { contratoId: contrato.id, tx, parcela })
    if (atual?.status === 'compensado') {
      if (!novo || r2(novo.valor) !== r2(atual.valor)) return false
      if (atual.origem_lancamento_id !== tx.id) trocarCredito(await atualizarCreditoApi({ id: atual.id, origem_lancamento_id: tx.id, itens: novo.itens }))
      return true
    }
    if (atual && novo) {
      trocarCredito(await atualizarCreditoApi({
        id: atual.id, itens: novo.itens, valor: novo.valor, descricao: novo.descricao, status: 'aberto', origem_lancamento_id: tx.id,
        // O previsto mantém a data (o destino não pula de aluguel ao pagar).
        ...(atual.status === 'previsto' ? {} : { data_origem: novo.data_origem }),
      }))
      return true
    }
    if (atual) {
      await excluirCreditoApi(atual.id)
      setCreditos(prev => prev.filter(c => c.id !== atual.id))
      return true
    }
    if (novo) trocarCredito(await criarCreditoApi(novo))
    return true
  }, [setCreditos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Composição do boleto do condomínio confirmada (tela) ou estimada (sem tela): lançamento único
  // com a composição (P2) e crédito 'aberto' com os itens do proprietário.
  // O VALOR do lançamento não muda aqui (só contratoId e composição): "Informar composição" de um
  // pagamento já feito nunca mexe no saldo.
  // A previsão das pendentes é recalculada já com a composição nova (itens "Só neste boleto" saem
  // dela); o estado do app ainda não tem a gravação, por isso o lançamento vai sobreposto.
  const gravarComposicaoCondominio = useCallback(async ({ contrato, parcela, tx, composicao }) => {
    updateTransaction(tx.id, { contratoId: contrato.id, composicao })
    const ok = await substituirCreditoGerado(contrato, tx, parcela, composicao)
    redistribuirCreditos()
    const est = dataRef.current
    await atualizarPrevisaoCondominio(contrato, {
      schedules: est.schedules,
      transactions: est.transactions.map(t => (t.id === tx.id ? { ...t, contratoId: contrato.id, composicao } : t)),
    }).catch(err => console.warn('[contratos] previsão do condomínio:', err.message))
    return ok
  }, [updateTransaction, substituirCreditoGerado, redistribuirCreditos, atualizarPrevisaoCondominio, dataRef])

  const confirmarComposicao = useCallback(async ({ contrato, parcela, tx, itens, lembrar = [] }) => {
    for (const l of lembrar) {
      await criarRegra({ contrato_id: contrato.id, padrao: l.padrao, tipo_match: 'comeca_com', responsavel: l.responsavel })
        .catch(err => console.warn('[contratos] regra não gravada:', err.message))
    }
    return gravarComposicaoCondominio({ contrato, parcela, tx, composicao: composicaoCondominio(itens) })
  }, [criarRegra, gravarComposicaoCondominio])

  // Sem a composição: os itens do proprietário repetem a última conhecida — "estimada, revisar".
  // Parcela com o boleto informado: os itens informados (a diferença, se houver, fica com o inquilino).
  const estimarComposicao = useCallback(async ({ contrato, parcela, tx }) => {
    const informada = composicaoNoPagamento(parcela, tx.amount, { auto: true })
    if (informada?.composicao) return gravarComposicaoCondominio({ contrato, parcela, tx, composicao: informada.composicao })
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

  // "Não abater neste mês": o crédito vai para a próxima parcela pendente. Destino escolhido à mão
  // nesta parcela deixa de valer (senão ele voltaria para ela).
  const adiarCreditoNaParcela = useCallback(async (parcelaId, creditoId) => {
    const cr = creditosRef.current.find(c => c.id === creditoId)
    if (cr?.destino_agendamento_id === parcelaId) {
      trocarCredito(await atualizarCreditoApi({ id: creditoId, destino_agendamento_id: null }))
    }
    update(d => {
      const s = d.schedules.map(x => (x.id === parcelaId ? { ...x, ...adiarCredito(x, creditoId) } : x))
      return { ...d, schedules: comCreditos(s) }
    })
  }, [update, comCreditos]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Trocar parcela de destino" (D3): o destino escolhido vence a regra; o adiamento deste crédito
  // na parcela nova sai. parcelaId null = volta para a regra do contrato.
  const trocarDestinoCredito = useCallback(async (contrato, creditoId, parcelaId) => {
    const row = await atualizarCreditoApi({ id: creditoId, destino_agendamento_id: parcelaId || null })
    trocarCredito(row)
    update(d => {
      const s = parcelaId ? d.schedules.map(x => (x.id === parcelaId ? { ...x, ...liberarAdiamento(x, creditoId) } : x)) : d.schedules
      return { ...d, schedules: comCreditos(s) }
    })
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela', valor_novo: r2(row.valor),
      detalhes: { acao: 'credito_destino', credito_id: creditoId, descricao: row.descricao, parcela_id: parcelaId || null },
    }).catch(err => console.warn('[contratos] evento do destino não gravado:', err.message))
    return row
  }, [update, comCreditos, registrarEvento]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Novo crédito manual" (qualquer modalidade): aberto, abatido pela regra ou no destino escolhido.
  const criarCreditoManual = useCallback(async (contrato, { descricao, valor, data, destinoId = null }) => {
    const v = r2(valor)
    if (!(v > 0)) throw new Error('Informe um valor maior que zero.')
    const row = await criarCreditoApi({
      contrato_id: contrato.id, descricao: descricao || 'Crédito manual', valor: v, data_origem: data || hojeStr(),
      itens: [{ desc: descricao || 'Crédito manual', valor: v }], status: 'aberto', destino_agendamento_id: destinoId || null,
    })
    trocarCredito(row)
    update(d => {
      const s = destinoId ? d.schedules.map(x => (x.id === destinoId ? { ...x, ...liberarAdiamento(x, row.id) } : x)) : d.schedules
      return { ...d, schedules: comCreditos(s) }
    })
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela', valor_novo: v,
      detalhes: { acao: 'credito_manual', credito_id: row.id, descricao: row.descricao, parcela_id: destinoId || null },
    }).catch(err => console.warn('[contratos] evento do crédito não gravado:', err.message))
    return row
  }, [update, comCreditos, registrarEvento]) // eslint-disable-line react-hooks/exhaustive-deps

  // Destino com valor digitado à mão: passa a ser manual (o valor digitado vira a base) e o crédito entra.
  const aplicarCreditosEmValorManual = useCallback((parcelaId) => {
    update(d => ({ ...d, schedules: comCreditos(d.schedules.map(x => (x.id === parcelaId ? { ...x, ...marcarValorManual(x) } : x))) }))
  }, [update, comCreditos])

  // "Justificar diferença" (D4) de parcela paga a menor: créditos abertos ligados + crédito manual
  // criado já compensado. Só a composição do lançamento muda — o valor pago nunca.
  const justificarDiferenca = useCallback(async (contrato, tx, { ligar = [], manual = null, esperado = null, parcelaId = null }) => {
    const abertos = creditosRef.current.filter(c => c.contrato_id === contrato.id && c.status === 'aberto' && ligar.includes(c.id))
    const vManual = r2(manual?.valor)
    const provisorio = vManual > 0 ? [{ id: 'novo', valor: vManual, descricao: manual.descricao }] : []
    const teste = planejarJustificativa({ tx, esperado, ligados: [...abertos, ...provisorio] })
    if (!teste.ok) throw new Error(teste.erro)
    const ligados = [...abertos]
    if (vManual > 0) {
      const novo = await criarCreditoApi({
        contrato_id: contrato.id, descricao: manual.descricao || 'Desconto praticado', valor: vManual, data_origem: tx.date,
        itens: [{ desc: manual.descricao || 'Desconto praticado', valor: vManual }], status: 'compensado',
        compensado_em_lancamento_id: tx.id, compensado_em_agendamento_id: parcelaId, data_compensacao: tx.date,
      })
      trocarCredito(novo)
      ligados.push(novo)
    }
    const r = planejarJustificativa({ tx, esperado, ligados })
    if (!r.ok) throw new Error(r.erro)
    updateTransaction(tx.id, { contratoId: contrato.id, composicao: r.composicao })
    await compensarCreditos(abertos.map(c => c.id), tx, parcelaId ? { id: parcelaId } : null)
    redistribuirCreditos()
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela', valor_anterior: r.diferenca, valor_novo: r.justificado,
      detalhes: { acao: 'justificativa', lancamento_id: tx.id, parcela_id: parcelaId, creditos: ligados.map(c => c.id), restante: r.restante },
    }).catch(err => console.warn('[contratos] evento da justificativa não gravado:', err.message))
    return r
  }, [updateTransaction, compensarCreditos, redistribuirCreditos, registrarEvento]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Informar composição" (D1) de condomínio já pago: grava contratoId + composição (valor do
  // lançamento intocado). Série vinculada = parcela de origem do crédito ("serie@data").
  const informarComposicao = useCallback(async (contrato, linha, { itens, lembrar = [] }) => {
    const tx = linha.tx
    if (!tx) throw new Error('Pagamento não encontrado.')
    const parcela = linha.vinculada ? { id: `${linha.schedule.id}@${linha.ocorrencia}` } : linha.schedule
    for (const l of lembrar) {
      await criarRegra({ contrato_id: contrato.id, padrao: l.padrao, tipo_match: 'comeca_com', responsavel: l.responsavel })
        .catch(err => console.warn('[contratos] regra não gravada:', err.message))
    }
    return gravarComposicaoCondominio({ contrato, parcela, tx, composicao: composicaoCondominio(itens) })
  }, [criarRegra, gravarComposicaoCondominio])

  // ── Encargos e descontos recorrentes do contrato (contrato_itens com na_parcela) ─────────────────
  // Grava a lista (mantendo os "Itens previstos" de registro), atualiza o contrato no estado (a ref na
  // hora: o plano logo depois já usa os encargos novos) e devolve o contrato com `encargos`.
  const salvarEncargosContrato = useCallback(async (contrato, encargos) => {
    if (faltaRecurso(recursosRef.current, 'encargosContrato')) throw new Error(MSG_ENCARGOS)
    const atual = await buscarContratoApi(contrato.id)
    const previstos = (atual?.itens || []).filter(i => !i.na_parcela)
    const rows = await salvarItensContratoApi(contrato.id, [...previstos, ...encargos.map(encargoParaItem)])
    const novos = rows.filter(i => i.na_parcela).map(encargoDoItem)
    trocarNaLista({ id: contrato.id, encargos: novos })
    contratosRef.current = contratosRef.current.map(c => (c.id === contrato.id ? { ...c, encargos: novos } : c))
    return { ...contrato, encargos: novos }
  }, [])

  // ── Composição do ALUGUEL pelo recibo (pendente ou paga) — o mesmo ComposicaoParcelaHost ─────────
  // itens: [{ desc, valor, tipo, encargo_id?, credito_id?, acao? }] já decididos na tela:
  //   tipo 'credito' + credito_id → liga ao crédito a abater (pendente: destino = esta parcela;
  //     paga: compensado neste lançamento) — sai do destino anterior; nunca duas vezes;
  //   tipo 'credito' + acao 'manual' → crédito manual já abatido nesta parcela;
  //   tipo 'unico' → só neste mês.
  // recorrentes: [{ indice, parcelas_total, parcela_atual }] — "Tornar recorrente" (item único → encargo);
  // seguir: [{ encargo_id, valor }] — valor diferente do recorrente que deve seguir nas próximas.
  // Pendente: o valor passa ao total do recibo (informado, substitui a previsão só desta parcela).
  // Paga: soma = valor pago; o lançamento NÃO muda (só a composição).
  const informarReciboAluguel = useCallback(async (contrato, { parcelaId, tx = null, itens, total = null, recibo = null, recorrentes = [], seguir = [] }) => {
    const est = dataRef.current
    const parcela = est.schedules.find(s => s.id === parcelaId) || null
    if (!tx && (!parcela || parcelaPaga(parcela))) throw new Error('Esta parcela não está mais pendente.')
    if ((recorrentes.length || seguir.length) && faltaRecurso(recursosRef.current, 'encargosContrato')) throw new Error(MSG_ENCARGOS)
    const alvo = tx ? r2(tx.amount) : (total != null ? r2(total) : null)
    const erro = validarRecibo(itens, alvo)
    if (erro) throw new Error(erro)
    const dataDoRecibo = tx ? tx.date : vencimentoParcela(parcela)
    const finais = []
    for (const it of itens) {
      if (it.tipo === 'credito' && it.acao === 'manual') {
        const v = r2(Math.abs(it.valor))
        const novo = await criarCreditoApi({
          contrato_id: contrato.id, descricao: it.desc || 'Desconto do recibo', valor: v, data_origem: dataDoRecibo,
          itens: [{ desc: it.desc || 'Desconto do recibo', valor: v }],
          ...(tx
            ? { status: 'compensado', compensado_em_lancamento_id: tx.id, compensado_em_agendamento_id: parcela?.id || null, data_compensacao: tx.date }
            : { status: 'aberto', destino_agendamento_id: parcelaId }),
        })
        trocarCredito(novo)
        finais.push({ ...it, credito_id: novo.id })
      } else finais.push(it)
    }
    const ligados = finais.filter(i => i.tipo === 'credito' && i.credito_id && i.acao !== 'manual').map(i => i.credito_id)
    const creditoPorId = new Map(creditosRef.current.map(c => [c.id, c]))
    if (tx) {
      // Créditos compensados neste pagamento que saíram do recibo voltam a abater.
      for (const c of creditosRef.current.filter(x => x.status === 'compensado' && x.compensado_em_lancamento_id === tx.id)) {
        if (finais.some(i => i.credito_id === c.id)) continue
        trocarCredito(await atualizarCreditoApi({ id: c.id, status: statusAoReabrir(c), compensado_em_lancamento_id: null, compensado_em_agendamento_id: null, data_compensacao: null }))
      }
      await compensarCreditos(ligados.filter(id => creditoPorId.get(id)?.status !== 'compensado'), tx, parcela)
    } else {
      for (const id of ligados) {
        if (creditoPorId.get(id)?.destino_agendamento_id === parcelaId) continue
        trocarCredito(await atualizarCreditoApi({ id, destino_agendamento_id: parcelaId }))
      }
    }
    const previstoDe = (id) => creditosRef.current.find(c => c.id === id)?.status === 'previsto'
    const meta = (tx ? tx.composicao : null) || parcela?.composicao || {}
    const composicao = composicaoDoRecibo(
      finais.map(i => ({ ...i, previsto: i.tipo === 'credito' && !tx && previstoDe(i.credito_id) })),
      { meta, recibo },
    )
    if (tx) {
      updateTransaction(tx.id, { contratoId: contrato.id, composicao })
      redistribuirCreditos()
    } else {
      await aplicarParcelas({ atualizar: [{ id: parcela.id, antes: parcela, changes: { amount: composicao.total, valorStatus: 'confirmado', composicao } }] }, {
        motivo: `Contrato ${rotuloContrato(contrato)}: recibo informado`, escopo: ESCOPO.PARCELA,
      })
    }
    // Encargos: "Tornar recorrente" e "seguir nas próximas" mudam o contrato e as próximas parcelas.
    if (recorrentes.length || seguir.length) {
      const numero = Number(meta.numero) || null
      let encargos = (contratosRef.current.find(c => c.id === contrato.id)?.encargos || contrato.encargos || []).map(e => ({ ...e }))
      for (const sg of seguir) encargos = encargos.map(e => (e.id === sg.encargo_id ? { ...e, valor: r2(Math.abs(sg.valor)) } : e))
      for (const rr of recorrentes) {
        const it = finais[rr.indice]
        if (!it || !numero) continue
        encargos.push({
          descricao: String(it.desc || '').replace(/\s*\d+\s*\/\s*\d+\s*$/, '').trim() || 'Encargo', sinal: it.valor < 0 ? 'desconto' : 'encargo',
          valor: r2(Math.abs(it.valor)), parcelas_total: Number(rr.parcelas_total) || 1,
          parcela_inicio: inicioPelaParcelaAtual(numero, Number(rr.parcela_atual) || 1),
        })
      }
      const atualizado = await salvarEncargosContrato(contrato, encargos)
      const plano = await planejarParcelas(atualizado)
      await aplicarParcelas(plano, { motivo: `Contrato ${rotuloContrato(contrato)}: encargos do recibo` })
    }
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela', valor_anterior: tx ? null : r2(parcela.amount), valor_novo: composicao.total,
      detalhes: { acao: 'recibo_aluguel', parcela_id: parcela?.id || parcelaId, lancamento_id: tx?.id || null, creditos: finais.filter(i => i.credito_id).map(i => i.credito_id) },
    }).catch(err => console.warn('[contratos] evento do recibo não gravado:', err.message))
    return { ok: true, composicao }
  }, [dataRef, updateTransaction, redistribuirCreditos, aplicarParcelas, compensarCreditos, salvarEncargosContrato, planejarParcelas, registrarEvento]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Composição do boleto na parcela de condomínio ABERTA (boleto chegou antes do pagamento) ────
  // A mesma ação na ficha, em Agendamentos e no Assistente (ComposicaoParcelaHost). A parcela passa
  // ao total do boleto ("valor informado") e os itens do proprietário viram crédito PREVISTO, que já
  // abate no aluguel de destino. Crédito já abatido num aluguel pago e com valor diferente: devolve
  // { ok: false, conflito } e a tela pede a decisão ('manter' | 'complementar').
  const aplicarCreditoDaParcela = useCallback(async (contrato, parcela, plano, decisao) => {
    if (plano.acao === 'criar') trocarCredito(await criarCreditoApi(plano.dados))
    else if (plano.acao === 'atualizar') trocarCredito(await atualizarCreditoApi({ id: plano.id, ...plano.dados }))
    else if (plano.acao === 'remover') {
      await excluirCreditoApi(plano.id)
      setCreditos(prev => prev.filter(c => c.id !== plano.id))
    } else if (plano.acao === 'conflito' && decisao === 'complementar' && plano.novo > plano.abatido) {
      const v = r2(plano.novo - plano.abatido)
      const data = vencimentoParcela(parcela)
      trocarCredito(await criarCreditoApi({
        contrato_id: contrato.id, descricao: `Complemento do condomínio ${data.slice(8, 10)}/${data.slice(5, 7)}`, valor: v,
        itens: [{ desc: 'Complemento do boleto do condomínio', valor: v }], data_origem: data, status: 'aberto',
      }))
    }
  }, [setCreditos]) // eslint-disable-line react-hooks/exhaustive-deps

  const informarComposicaoAberta = useCallback(async (contrato, parcelaId, { itens, lembrar = [], decisao = null }) => {
    const parcela = dataRef.current.schedules.find(s => s.id === parcelaId)
    if (!ehCondominioAberto(parcela, contrato)) throw new Error('Esta parcela de condomínio não está mais aberta.')
    const composicao = composicaoDaParcela(itens)
    const novo = creditoPrevistoDaParcela(composicao, { contratoId: contrato.id, parcela })
    const atual = creditoDaParcela(creditosRef.current.filter(c => c.contrato_id === contrato.id), parcela.id)
    const plano = planoCreditoDaParcela({ atual, novo })
    // Crédito PREVISTO precisa da migração 2026-11-04 no banco do ambiente: sem ela, erro claro antes
    // de gravar qualquer coisa (regra, crédito ou parcela) — nada fica só na tela.
    if ((plano.acao === 'criar' || plano.acao === 'atualizar') && faltaRecurso(recursosRef.current, 'creditoPrevisto')) {
      throw new Error(MSG_CREDITO_PREVISTO)
    }
    if (plano.acao === 'conflito' && !decisao) return { ok: false, conflito: plano }
    for (const l of lembrar) {
      await criarRegra({ contrato_id: contrato.id, padrao: l.padrao, tipo_match: 'comeca_com', responsavel: l.responsavel })
        .catch(err => console.warn('[contratos] regra não gravada:', err.message))
    }
    await aplicarCreditoDaParcela(contrato, parcela, plano, decisao)
    const antes = temComposicaoInformada(parcela)
    await aplicarParcelas({ atualizar: [{ id: parcela.id, antes: parcela, changes: planoInformarParcela(parcela, composicao) }] }, {
      motivo: `Contrato ${rotuloContrato(contrato)}: composição do boleto do condomínio ${antes ? 'alterada' : 'informada'}`, escopo: ESCOPO.PARCELA,
    })
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela', valor_anterior: r2(parcela.amount), valor_novo: composicao.total,
      detalhes: { acao: antes ? 'composicao_alterada' : 'composicao_informada', parcela_id: parcela.id, vencimento: vencimentoParcela(parcela), credito: novo?.valor || 0, decisao },
    }).catch(err => console.warn('[contratos] evento da composição não gravado:', err.message))
    return { ok: true, credito: novo?.valor || 0 }
  }, [dataRef, criarRegra, aplicarCreditoDaParcela, aplicarParcelas, registrarEvento])

  // "Remover composição" da parcela aberta: volta ao condomínio previsto; o crédito previsto sai.
  const removerComposicaoAberta = useCallback(async (contrato, parcelaId, { decisao = null } = {}) => {
    const parcela = dataRef.current.schedules.find(s => s.id === parcelaId)
    if (!ehCondominioAberto(parcela, contrato) || !temComposicaoInformada(parcela)) throw new Error('Esta parcela não tem composição informada.')
    const atual = creditoDaParcela(creditosRef.current.filter(c => c.contrato_id === contrato.id), parcela.id)
    const plano = planoCreditoDaParcela({ atual, novo: null })
    if (plano.acao === 'conflito' && !decisao) return { ok: false, conflito: plano }
    await aplicarCreditoDaParcela(contrato, parcela, plano, decisao)
    const est = dataRef.current
    const previsto = valorPrevistoCondominio(contrato, est.schedules, est.transactions)
    const valor = previsto > 0 ? previsto : r2(contrato.valor_condominio_previsto || parcela.amount)
    await aplicarParcelas({ atualizar: [{ id: parcela.id, antes: parcela, changes: planoRemoverComposicao(parcela, valor) }] }, {
      motivo: `Contrato ${rotuloContrato(contrato)}: composição do boleto do condomínio removida`, escopo: ESCOPO.PARCELA,
    })
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela', valor_anterior: r2(parcela.amount), valor_novo: valor,
      detalhes: { acao: 'composicao_removida', parcela_id: parcela.id, vencimento: vencimentoParcela(parcela), decisao },
    }).catch(err => console.warn('[contratos] evento da composição não gravado:', err.message))
    return { ok: true }
  }, [dataRef, aplicarCreditoDaParcela, aplicarParcelas, registrarEvento])

  // Estorno de condomínio com crédito já abatido: por padrão ele fica ligado à parcela (o próximo
  // pagamento dela não gera outro igual); "avulso" o desliga (o próximo pagamento gera crédito novo).
  const desligarCreditoDoCondominio = useCallback(async (creditoId) => {
    const c = creditosRef.current.find(x => x.id === creditoId)
    if (!c) return
    trocarCredito(await atualizarCreditoApi({ id: creditoId, origem_agendamento_id: null, origem_lancamento_id: null, descricao: `${c.descricao || 'Crédito'} (avulso)` }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirComposicaoParcela = useCallback((parcelaId, opcoes = {}) => setPedidoComposicao(parcelaId ? { parcelaId, ...opcoes } : null), [])
  const fecharComposicaoParcela = useCallback(() => setPedidoComposicao(null), [])

  // ── Vínculo de lançamento a uma linha do contrato (C2) ────────────────────────────────────────
  // Tudo ou nada (lib/contratos/gravarVinculo): parcela + baixa + vínculo no lançamento vão ao banco
  // e SÓ DEPOIS o evento da linha do tempo; falhou qualquer parte, o estado volta e o erro aparece no
  // modal. Linha pendente: `vincular` = vincularLancamento do AppContext (mesma baixa da tela de
  // Agendamentos); para desfazer, `desvincular` = desvincularLancamento. Linha sem parcela: cria a
  // parcela da competência (id determinístico) já paga com o lançamento, que recebe na mesma
  // gravação o contrato e a composição. Repetir a mesma competência com o mesmo lançamento não grava
  // nada de novo.
  const vincularLancamentoNaLinha = useCallback(async (contrato, linha, tx, { vincular, desvincular }) => {
    const d0 = dataRef.current
    // Lançamento já deste contrato mas sem parcela ("Associar a uma parcela") pode; de outro, não.
    if (tx.contratoId && tx.contratoId !== contrato.id) throw new Error('Este lançamento já está ligado a outro contrato.')
    const parcelaId = linha.semParcela ? idParcela(contrato.id, linha.papel, linha.competencia) : linha.schedule?.id
    if (linha.semParcela) {
      const repetido = vinculoRepetido(d0.schedules, { parcelaId, txId: tx.id })
      if (repetido) throw new Error(repetido)
    }
    if (mapaVinculos(d0.schedules).has(tx.id)) throw new Error('Este lançamento já baixou outra parcela ou agendamento.')
    if (!linha.semParcela && (!linha.schedule || linha.paga)) throw new Error('Esta parcela já tem pagamento.')
    // Dois cliques / duas abas: a mesma parcela ou o mesmo lançamento não entram duas vezes.
    const travas = [`p:${parcelaId}`, `t:${tx.id}`]
    if (travas.some(k => vinculosEmAndamento.current.has(k))) throw new Error('Este vínculo já está sendo gravado.')
    travas.forEach(k => vinculosEmAndamento.current.add(k))
    const persistir = persistirRef.current
    const chaves = [`agendamentos:${parcelaId}`, `lancamentos:${tx.id}`]
    const baixadaCom = (est, id) => est.schedules.some(s => s.id === parcelaId
      && Object.values(s.registeredMeta || {}).some(m => m?.lancamento_id === id))
    try {
      if (linha.semParcela) {
        const item = {
          id: parcelaId, papel: linha.papel, numero: linha.numero, total: linha.total, competencia: linha.competencia,
          vencimento: linha.vencimento, valor: r2(linha.valor), valorStatus: 'confirmado',
          composicao: linha.composicao || { itens: [{ tipo: 'previsto', desc: 'Valor previsto', valor: r2(linha.valor) }], total: r2(linha.valor), numero: linha.numero, total_parcelas: linha.total },
        }
        const nova = parcelaDeVinculo(contrato, item, tx)
        const noLancamento = { dataOcorrencia: linha.vencimento, ...(planejarPosEfetivacao({ contrato, parcela: nova, tx }).lancamento || {}) }
        const antes = { dataOcorrencia: tx.dataOcorrencia ?? null, contratoId: tx.contratoId ?? null, composicao: tx.composicao ?? null }
        await gravarVinculoNaLinha({
          aplicar: () => update(d => ({
            ...d,
            schedules: d.schedules.some(s => s.id === nova.id) ? d.schedules : [...d.schedules, nova],
            transactions: d.transactions.map(t => (t.id === tx.id ? { ...t, ...noLancamento } : t)),
          })),
          persistir: () => persistir({ pronto: est => baixadaCom(est, tx.id), chaves }),
          desfazer: () => {
            update(d => ({
              ...d,
              schedules: d.schedules.filter(s => s.id !== nova.id),
              transactions: d.transactions.map(t => (t.id === tx.id ? { ...t, ...antes } : t)),
            }))
            return persistir({ pronto: est => !est.schedules.some(s => s.id === nova.id), chaves })
          },
          registrarEvento: () => registrarEvento(contrato.id, eventoDoVinculo(linha, tx, parcelaId)),
          depois: () => notificarEfetivacaoRef.current?.([{ scheduleId: nova.id, occurrenceDate: linha.vencimento, lancamentoId: tx.id }]),
        })
      } else {
        await gravarVinculoNaLinha({
          aplicar: () => {
            const r = vincular({ txId: tx.id, scheduleId: parcelaId, data: linha.ocorrencia, manter: 'agendamento' })
            if (!r?.ok) throw new Error(r?.motivo || 'Não foi possível vincular.')
          },
          persistir: () => persistir({ pronto: est => baixadaCom(est, tx.id), chaves }),
          desfazer: () => {
            const r = desvincular?.({ scheduleId: parcelaId, data: linha.ocorrencia })
            if (!r?.ok) throw new Error(r?.motivo || 'desvínculo recusado')
            return persistir({ pronto: est => !baixadaCom(est, tx.id), chaves })
          },
          registrarEvento: () => registrarEvento(contrato.id, eventoDoVinculo(linha, tx, parcelaId)),
        })
      }
    } finally {
      travas.forEach(k => vinculosEmAndamento.current.delete(k))
    }
  }, [dataRef, update, registrarEvento])

  // "Desfazer vínculo": a parcela volta a como estava (pendente, ou some se foi criada só para o
  // vínculo), o lançamento fica — sem contrato e sem composição; créditos compensados nele reabrem.
  //   desvincular = desvincularLancamento do AppContext (linha pendente vinculada à mão).
  const desfazerVinculoLancamento = useCallback(async (contrato, linha, { desvincular }) => {
    const tx = linha.tx
    const s = linha.schedule
    if (!tx || !s) throw new Error('Vínculo não encontrado.')
    if (ehParcelaDeVinculo(s)) {
      update(d => ({
        ...d,
        schedules: comCreditos(d.schedules.filter(x => x.id !== s.id)),
        transactions: d.transactions.map(t => (t.id === tx.id ? { ...t, dataOcorrencia: null } : t)),
      }))
      await reverterEfetivacaoRef.current?.(tx)
    } else {
      const r = desvincular({ scheduleId: s.id, data: linha.ocorrencia })
      if (!r?.ok) throw new Error(r?.motivo || 'Não foi possível desfazer.')
    }
    updateTransaction(tx.id, { contratoId: null, composicao: null })
    await registrarEvento(contrato.id, {
      tipo: 'desvinculo', valor_anterior: r2(tx.amount),
      detalhes: {
        acao: 'lancamento', lancamento_id: tx.id, parcela_id: s.id, papel: linha.papel, competencia: linha.competencia,
        numero: linha.numero, total: linha.total, data_pagamento: tx.date, removida: ehParcelaDeVinculo(s), descricao: tx.description,
      },
    }).catch(err => console.warn('[contratos] evento de desvínculo não gravado:', err.message))
  }, [update, comCreditos, updateTransaction, registrarEvento])

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
      const est = dataRef.current
      await atualizarPrevisaoCondominio(contrato, {
        schedules: est.schedules, transactions: est.transactions.map(t => (t.id === tx.id ? { ...t, amount: r2(composicao.total), composicao } : t)),
      }).catch(err => console.warn('[contratos] previsão do condomínio:', err.message))
    } else {
      const antes = new Set((tx.composicao?.itens || []).filter(i => i.credito_id).map(i => i.credito_id))
      const depois = new Set((composicao.itens || []).filter(i => i.credito_id).map(i => i.credito_id))
      for (const id of antes) {
        if (depois.has(id)) continue
        try {
          const c = creditosRef.current.find(x => x.id === id)
          trocarCredito(await atualizarCreditoApi({ id, status: statusAoReabrir(c), compensado_em_lancamento_id: null, compensado_em_agendamento_id: null, data_compensacao: null }))
        } catch (err) { console.warn('[contratos] crédito não reaberto:', err.message) }
      }
      updateTransaction(tx.id, { amount: r2(composicao.total), composicao })
    }
    redistribuirCreditos()
    return { ok: true }
  }, [dataRef, updateTransaction, substituirCreditoGerado, redistribuirCreditos, atualizarPrevisaoCondominio]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pendências para a tela (ContratoEfetivacaoHost) ───────────────────────────────────────────
  const adicionarPendencia = useCallback((p) => {
    setPendencias(prev => (prev.some(x => x.chave === p.chave) ? prev : [...prev, p]))
  }, [])
  const resolverPendencia = useCallback((chave) => setPendencias(prev => prev.filter(p => p.chave !== chave)), [])

  // posEfetivacaoContrato(agendamento, lançamento): o que acontece depois que uma parcela é paga.
  const posEfetivacao = useCallback(async ({ contrato, parcela, tx, auto, estado = null }) => {
    // Condomínio com o boleto já informado: a composição vai ao lançamento e o crédito previsto vira
    // aberto (o mesmo). Pago com outro valor: com tela, a prévia já vem com os itens informados.
    if (temComposicaoInformada(parcela)) {
      const r = composicaoNoPagamento(parcela, tx.amount, { auto })
      if (r?.pedir) {
        updateTransaction(tx.id, { contratoId: contrato.id })
        adicionarPendencia({ chave: `composicao:${tx.id}`, tipo: 'composicao', contratoId: contrato.id, parcelaId: parcela.id, txId: tx.id, itensIniciais: r.itensIniciais })
      } else if (r?.composicao) {
        await gravarComposicaoCondominio({ contrato, parcela, tx, composicao: r.composicao })
      }
      return
    }
    const plano = planejarPosEfetivacao({ contrato, parcela, tx, auto })
    // Condomínio pago (pelo agendamento ou pelo contrato): as pendentes passam ao valor pago.
    if ((parcela.contratoPapel || 'aluguel') === 'condominio') {
      await atualizarPrevisaoCondominio(contrato, estado || dataRef.current)
        .catch(err => console.warn('[contratos] previsão do condomínio:', err.message))
    }
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
  }, [updateTransaction, compensarCreditos, redistribuirCreditos, adicionarPendencia, estimarComposicao, atualizarPrevisaoCondominio, dataRef, gravarComposicaoCondominio])

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
      posEfetivacao({ contrato, parcela, tx, auto: !!n.auto, estado: { schedules: dados.schedules, transactions: dados.transactions } })
        .catch(err => console.warn('[contratos] pós-efetivação falhou:', err.message))
    }
  }, [tickFila, dados.schedules, dados.transactions, carregados, posEfetivacao])

  // reverterEfetivacaoContrato: estorno/exclusão do lançamento → créditos compensados nele voltam a
  // abertos, o gerado por ele (condomínio) sai, e o evento fica na linha do tempo.
  const reverterEfetivacao = useCallback(async (tx) => {
    if (!tx || !habilitado) return
    // Estorno de condomínio: a previsão volta ao último pago ANTERIOR (sem nenhum, ao do contrato).
    const est = dataRef.current
    const daBaixa = est.schedules.find(s => s.contratoId && Object.values(s.registeredMeta || {}).some(m => m?.lancamento_id === tx.id))
      || est.schedules.find(s => s.contratoId && s.id === tx.scheduleId)
    if (daBaixa?.contratoPapel === 'condominio') {
      const ctr = contratosRef.current.find(c => c.id === daBaixa.contratoId)
      if (ctr) await atualizarPrevisaoCondominio(ctr, est, { excluirTx: tx.id }).catch(err => console.warn('[contratos] previsão do condomínio:', err.message))
    }
    const informadas = new Set(est.schedules.filter(temComposicaoInformada).map(s => s.id))
    const r = planejarReversao({ tx, creditos: creditosRef.current, informadas })
    if (!r.reabrir.length && !r.remover.length && !r.manter.length && !r.voltarPrevisto.length) return
    for (const id of r.reabrir) {
      try {
        trocarCredito(await atualizarCreditoApi({ id, status: r.statusReabrir[id] || 'aberto', compensado_em_lancamento_id: null, compensado_em_agendamento_id: null, data_compensacao: null }))
      } catch (err) { console.warn('[contratos] crédito não reaberto:', err.message) }
    }
    // Boleto informado na parcela: o crédito volta a previsto (a parcela reaberta continua com ele).
    for (const id of r.voltarPrevisto) {
      try {
        trocarCredito(await atualizarCreditoApi({ id, status: 'previsto', origem_lancamento_id: null }))
      } catch (err) { console.warn('[contratos] crédito não voltou a previsto:', err.message) }
    }
    // Já abatido num aluguel pago: continua abatido e ligado à parcela (o pagamento de novo não gera
    // outro igual) — a tela pergunta se ele deve virar avulso.
    for (const id of r.manter) {
      const c = creditosRef.current.find(x => x.id === id)
      try {
        trocarCredito(await atualizarCreditoApi({ id, origem_lancamento_id: null }))
      } catch (err) { console.warn('[contratos] crédito abatido não desligado do lançamento:', err.message) }
      if (c) adicionarPendencia({ chave: `estorno_credito:${id}`, tipo: 'estorno_credito', contratoId: c.contrato_id, creditoId: id, valor: r2(c.valor), dataCompensacao: c.data_compensacao, dataTx: tx.date })
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
        detalhes: { acao: 'reversao_creditos', lancamento_id: tx.id, creditos_reabertos: r.reabrir, creditos_removidos: r.remover, creditos_mantidos: r.manter, creditos_previstos: r.voltarPrevisto },
      }).catch(err => console.warn('[contratos] evento de reversão não gravado:', err.message))
    }
  }, [habilitado, setCreditos, redistribuirCreditos, registrarEvento, atualizarPrevisaoCondominio, dataRef, adicionarPendencia]) // eslint-disable-line react-hooks/exhaustive-deps

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
        const txs = dataRef.current.transactions
        atualizar.push(...planoManutencao(c, lista, { hoje: hojeStr(), indices: idx, transactions: txs }))
        if (c.data_fim) continue
        const plano = gerarPlanoParcelas(c, {
          hoje: hojeStr(), indices: idx, confirmados: confirmadosDe(c, lista), apartirDe: inicioDasParcelas(c, lista),
          valorCondominio: valorCondominioPago(c, lista, txs), repassesReais: repassesRegistrados(c, lista, txs),
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

  useEffect(() => {
    notificarEfetivacaoRef.current = notificarEfetivacao
    reverterEfetivacaoRef.current = reverterEfetivacao
  }, [notificarEfetivacao, reverterEfetivacao])

  const abrirFichaContrato = useCallback((id, acao = null) => setFichaAberta(id ? { id, acao } : null), [])
  const fecharFichaContrato = useCallback(() => setFichaAberta(null), [])
  const contratoPorId = useCallback((id) => contratos.find(c => c.id === id) || null, [contratos])

  return {
    contratosHabilitado: habilitado,
    contratos, contratosCarregados: carregados, indicesContratos: indices, contratoPorId,
    recarregarContratos, carregarIndice, criarContrato, atualizarContrato, excluirContrato, salvarItensContrato: salvarItens,
    salvarCompetenciaRepasse,
    registrarEventoContrato: registrarEvento, planejarParcelasContrato: planejarParcelas, aplicarParcelasContrato: aplicarParcelas,
    vincularEGerarContrato: vincularEGerar, desvincularDoContrato: desvincular, confirmarReajusteContrato: confirmarReajuste,
    excluirParcelaContrato: excluirParcela, rescindirContrato: rescindir, estornarLancamentoContrato,
    fichaContratoAberta: fichaAberta, abrirFichaContrato, fecharFichaContrato,
    regrasContratos: regras, criarRegraContrato: criarRegra, atualizarRegraContrato: atualizarRegra, excluirRegraContrato: excluirRegra,
    creditosContratos: creditos, adiarCreditoNaParcela, editarComposicaoLancamento,
    trocarDestinoCredito, criarCreditoManual, aplicarCreditosEmValorManual, justificarDiferenca, informarComposicao,
    vincularLancamentoNaLinha, desfazerVinculoLancamento,
    pendenciasContrato: pendencias, resolverPendenciaContrato: resolverPendencia,
    confirmarComposicaoContrato: confirmarComposicao, estimarComposicaoContrato: estimarComposicao,
    notificarEfetivacao, reverterEfetivacaoContrato: reverterEfetivacao,
    informarComposicaoAberta, removerComposicaoAberta, desligarCreditoDoCondominio, informarReciboAluguel, salvarEncargosContrato,
    pedidoComposicaoParcela: pedidoComposicao, abrirComposicaoParcela, fecharComposicaoParcela,
  }
}
