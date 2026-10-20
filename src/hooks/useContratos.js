import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarContratosApi, criarContratoApi, atualizarContratoApi, excluirContratoApi, salvarItensContratoApi,
  registrarEventoContratoApi, buscarIndiceApi,
} from '../lib/contratosApi'
import {
  gerarPlanoParcelas, planejarSincronizacao, confirmadosDe, cobertasDoContrato, inicioDasParcelas,
  ehParcelaGerada, parcelaPaga, planoConfirmacaoReajuste, proximoReajuste, parcelasDoPapel, r2, rotuloContrato,
  planoManutencao,
} from '../lib/contratos/parcelas'
import { planoVinculo, planoDesvinculo } from '../lib/contratos/vinculo'
import { hojeStr, ymDe } from '../lib/contratos/datas'
import { linhasHistorico, novoLoteId } from '../lib/historico'
import { ESCOPO } from '../lib/camposSerie'

// ESTADO E AÇÕES DO MÓDULO DE CONTRATOS (usado dentro do AppProvider). A ficha (`contratos`) vive
// fora de `data`: CRUD direto nas rotas api/contrato*.js. As PARCELAS são agendamentos em
// data.schedules — gravadas pelo sync como qualquer agendamento (um único update() por operação).
// Nenhuma função protegida do AppContext é tocada: contrato só aceita conta (não cartão), então o
// motor de fatura não entra.

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

export function useContratos({ habilitado, update, dataRef, dbConectado, registrarEdicao }) {
  const [contratos, setContratos] = useState([])
  const [carregados, setCarregados] = useState(false)
  const [indices, setIndices] = useState({})
  const indicesRef = useRef({})
  const [fichaAberta, setFichaAberta] = useState(null)

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
    listarContratosApi()
      .then(lista => { if (vivo) { setContratos(lista); setCarregados(true) } })
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

  // Aplica criar/atualizar/remover num único update(). `historico`: motivo → grava as mudanças de
  // valor das parcelas pendentes no histórico de alterações (P4).
  const aplicarParcelas = useCallback(async (mudancas, { motivo = null, escopo = ESCOPO.PROXIMAS } = {}) => {
    update(d => ({ ...d, schedules: aplicarMudancas(d.schedules, mudancas) }))
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
  }, [update, registrarEdicao])

  const criarContrato = useCallback(async (dados, itens = []) => {
    const r = await criarContratoApi({ ...dados, proximo_reajuste: proximoReajuste(dados, hojeStr()) }, itens)
    trocarNaLista(r.contrato)
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
    update(d => ({ ...d, schedules: d.schedules.filter(s => s.id !== schedule.id) }))
    if (!contrato) return
    await registrarEvento(contrato.id, {
      tipo: 'edicao_parcela',
      valor_anterior: r2(schedule.amount),
      detalhes: { acao: 'exclusao', parcela_id: schedule.id, vencimento: schedule.startDate, papel: schedule.contratoPapel },
    })
  }, [update, registrarEvento])

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
  }, [update])

  // Uma vez por sessão, depois do load do banco, para cada contrato ativo:
  //   • sem data de fim: estende as parcelas até 12 meses à frente (ids determinísticos: outro
  //     aparelho fazendo o mesmo grava a mesma linha);
  //   • manutenção: descrição das pendentes e reprojeção das PROJETADAS com o índice atual (as que
  //     nasceram sem índice, a 0%, ganham o valor certo aqui).
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
      if (criar.length || atualizar.length) update(d => ({ ...d, schedules: aplicarMudancas(d.schedules, { criar, atualizar }) }))
    })().catch(err => console.warn('[contratos] extensão das parcelas falhou:', err.message))
  }, [habilitado, dbConectado, carregados, contratos, dataRef, indicesPara, update])

  const abrirFichaContrato = useCallback((id, acao = null) => setFichaAberta(id ? { id, acao } : null), [])
  const fecharFichaContrato = useCallback(() => setFichaAberta(null), [])
  const contratoPorId = useCallback((id) => contratos.find(c => c.id === id) || null, [contratos])

  return {
    contratosHabilitado: habilitado,
    contratos, contratosCarregados: carregados, indicesContratos: indices, contratoPorId,
    recarregarContratos, carregarIndice, criarContrato, atualizarContrato, excluirContrato, salvarItensContrato: salvarItens,
    registrarEventoContrato: registrarEvento, planejarParcelasContrato: planejarParcelas, aplicarParcelasContrato: aplicarParcelas,
    vincularEGerarContrato: vincularEGerar, desvincularDoContrato: desvincular, confirmarReajusteContrato: confirmarReajuste,
    excluirParcelaContrato: excluirParcela, rescindirContrato: rescindir,
    fichaContratoAberta: fichaAberta, abrirFichaContrato, fecharFichaContrato,
  }
}
