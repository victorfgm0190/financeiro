// @vitest-environment jsdom
// Composição do boleto em parcela de condomínio ABERTA (etapa 1 de 04/11/2026). Exemplo obrigatório:
// condomínio aberto 900 + 100 água + 90 fundo de reserva (proprietário) + 200 taxas = 1.290;
// aluguel 3.900 com bonificação 200 → antes de pagar: condomínio 1.290, crédito PREVISTO 90,
// aluguel de destino 3.900 − 200 − 90 = 3.610.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao, idParcela } from '../lib/contratos/parcelas.js'

const api = vi.hoisted(() => ({ creditos: [], eventos: [], seq: 0 }))
vi.mock('../lib/contratosApi', () => {
  const nada = async () => []
  return {
    listarContratosApi: async () => [api.contrato], buscarContratoApi: nada, criarContratoApi: nada, atualizarContratoApi: nada,
    excluirContratoApi: nada, salvarItensContratoApi: nada, buscarIndiceApi: nada, listarRegrasApi: nada, criarRegraApi: async (r) => ({ id: 'r', ...r }),
    atualizarRegraApi: nada, excluirRegraApi: nada,
    listarCreditosApi: async () => api.creditos,
    criarCreditoApi: async (c) => { const row = { id: `cr${++api.seq}`, ...c }; api.creditos = [...api.creditos, row]; return row },
    atualizarCreditoApi: async (c) => {
      api.creditos = api.creditos.map(x => (x.id === c.id ? { ...x, ...c } : x))
      return api.creditos.find(x => x.id === c.id)
    },
    excluirCreditoApi: async (id) => { api.creditos = api.creditos.filter(x => x.id !== id) },
    registrarEventoContratoApi: async (contratoId, ev) => { api.eventos.push({ contratoId, ...ev }); return ev },
  }
})
const { useContratos } = await import('./useContratos.js')

const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob Lar', status: 'ativo',
  data_inicio: '2026-09-15', data_fim: '2028-08-31', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 15,
  indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12, tem_condominio: true, valor_condominio_previsto: 1300,
  dia_vencimento_condominio: 5, favorecido_condominio: 'Cond Ed Sol', conta_id: 'cc', categoria_id: 'cat', credito_abatimento: 'mes_seguinte', excluidas: [],
}
const BOLETO = [
  { desc: 'Condomínio', valor: 900, responsavel: 'inquilino' },
  { desc: 'Água', valor: 100, responsavel: 'inquilino' },
  { desc: 'Fundo de reserva', valor: 90, responsavel: 'proprietario' },
  { desc: 'Taxas', valor: 200, responsavel: 'inquilino' },
]
const COND = idParcela('c1', 'condominio', '2026-11')
const AL_NOV = idParcela('c1', 'aluguel', '2026-11')
const AL_DEZ = idParcela('c1', 'aluguel', '2026-12')
const AL_JAN = idParcela('c1', 'aluguel', '2027-01')
const AL_FEV = idParcela('c1', 'aluguel', '2027-02')

let estado
let hook
const s = (id) => estado.schedules.find(x => x.id === id)
const creditos = () => api.creditos

async function montar() {
  api.contrato = C
  api.creditos = []
  api.eventos = []
  api.seq = 0
  const parcelas = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: '2026-11-04', apartirDe: '2026-11' })).criar
  estado = { schedules: parcelas, transactions: [] }
  const dataRef = { current: estado }
  const update = (fn) => { estado = fn(estado); dataRef.current = estado }
  const updateTransaction = (id, changes) => update(d => ({ ...d, transactions: d.transactions.map(t => (t.id === id ? { ...t, ...changes } : t)) }))
  const props = () => ({
    habilitado: true, update, dataRef, dados: estado, dbConectado: true, registrarEdicao: async () => {},
    reverseTransaction: () => {}, updateTransaction, persistirAgora: async () => ({ ok: true }),
  })
  hook = renderHook((p) => useContratos(p), { initialProps: props() })
  await vi.waitFor(() => expect(hook.result.current.contratosCarregados).toBe(true))
  hook.atualizar = async () => { await act(async () => { hook.rerender(props()) }) }
  await hook.atualizar()
  return hook
}

// Paga a ocorrência (como a tela de Agendamentos: baixa + lançamento) e dispara o gancho.
async function pagar(parcelaId, valor, txId, data) {
  const p = s(parcelaId)
  const tx = { id: txId, date: data, amount: valor, accountId: 'cc', type: 'expense', description: p.description, scheduleId: p.id }
  estado = {
    ...estado,
    schedules: estado.schedules.map(x => (x.id === parcelaId ? { ...x, registered: [x.startDate], registeredMeta: { [x.startDate]: { tipo: 'pago', lancamento_id: txId } } } : x)),
    transactions: [...estado.transactions, tx],
  }
  await hook.atualizar()
  await act(async () => { hook.result.current.notificarEfetivacao([{ scheduleId: parcelaId, occurrenceDate: p.startDate, lancamentoId: txId }]) })
  await hook.atualizar()
  await vi.waitFor(() => expect(estado.transactions.find(t => t.id === txId).contratoId).toBe('c1'))
  await hook.atualizar()
}

async function estornar(txId) {
  const tx = estado.transactions.find(t => t.id === txId)
  estado = {
    ...estado,
    transactions: estado.transactions.filter(t => t.id !== txId),
    schedules: estado.schedules.map(x => (Object.values(x.registeredMeta || {}).some(m => m?.lancamento_id === txId) ? { ...x, registered: [], registeredMeta: {} } : x)),
  }
  await hook.atualizar()
  await act(() => hook.result.current.reverterEfetivacaoContrato(tx))
  await hook.atualizar()
}

const informar = (itens = BOLETO, opts = {}) => act(() => hook.result.current.informarComposicaoAberta(C, COND, { itens, ...opts }))

describe('composição do boleto em parcela de condomínio aberta', () => {
  beforeEach(async () => { vi.spyOn(console, 'warn').mockImplementation(() => {}); await montar() })

  it('antes de pagar: condomínio 1.290 (valor informado), crédito previsto 90, aluguel de destino 3.610', async () => {
    expect(s(COND).amount).toBe(1300)
    const r = await informar()
    expect(r).toMatchObject({ ok: true, credito: 90 })
    expect(s(COND)).toMatchObject({ amount: 1290, composicao: { tipo: 'condominio', informada: true, total: 1290, proprietario: 90 } })
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({ status: 'previsto', valor: 90, origem_agendamento_id: COND, origem_lancamento_id: null, data_origem: '2026-11-05' })
    expect(s(AL_NOV).amount).toBe(3700) // regra do contrato: mês seguinte ao do boleto
    expect(s(AL_DEZ).amount).toBe(3610)
    const item = s(AL_DEZ).composicao.itens.find(i => i.tipo === 'credito')
    expect(item).toMatchObject({ valor: -90, previsto: true })
    expect(item.desc).toMatch(/\(previsto\)/)
    expect(api.eventos.at(-1)).toMatchObject({ tipo: 'edicao_parcela', detalhes: { acao: 'composicao_informada', credito: 90 } })
  })

  it('depois de pagar o condomínio: o MESMO crédito vira aberto (sem duplicar) e o aluguel continua 3.610', async () => {
    await informar()
    const id = creditos()[0].id
    await pagar(COND, 1290, 'txc', '2026-11-05')
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({ id, status: 'aberto', origem_lancamento_id: 'txc', valor: 90, data_origem: '2026-11-05' })
    expect(estado.transactions[0].composicao).toMatchObject({ tipo: 'condominio', total: 1290, proprietario: 90 })
    expect(estado.transactions[0].composicao.informada).toBeUndefined()
    expect(s(AL_DEZ).amount).toBe(3610)
    expect(s(AL_DEZ).composicao.itens.find(i => i.tipo === 'credito').previsto).toBeUndefined()
  })

  it('pago com valor diferente do boleto: pergunta com os itens informados (nada estimado sozinho)', async () => {
    await informar()
    const p = s(COND)
    estado = {
      ...estado,
      schedules: estado.schedules.map(x => (x.id === COND ? { ...x, registered: [x.startDate], registeredMeta: { [x.startDate]: { lancamento_id: 'txd' } } } : x)),
      transactions: [{ id: 'txd', date: '2026-11-05', amount: 1300, type: 'expense', accountId: 'cc' }],
    }
    await hook.atualizar()
    await act(async () => { hook.result.current.notificarEfetivacao([{ scheduleId: COND, occurrenceDate: p.startDate, lancamentoId: 'txd' }]) })
    await hook.atualizar()
    await vi.waitFor(() => expect(hook.result.current.pendenciasContrato).toHaveLength(1))
    expect(hook.result.current.pendenciasContrato[0]).toMatchObject({ tipo: 'composicao', itensIniciais: expect.any(Array) })
    expect(hook.result.current.pendenciasContrato[0].itensIniciais).toHaveLength(4)
    expect(creditos()[0].status).toBe('previsto')
  })

  it('editar o fundo para 80: crédito 80 (o mesmo) e aluguel 3.620; remover: valores restaurados', async () => {
    await informar()
    const id = creditos()[0].id
    await informar(BOLETO.map(i => (i.desc === 'Fundo de reserva' ? { ...i, valor: 80 } : i)))
    expect(s(COND).amount).toBe(1280)
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({ id, valor: 80, status: 'previsto' })
    expect(s(AL_DEZ).amount).toBe(3620)
    const r = await act(() => hook.result.current.removerComposicaoAberta(C, COND))
    expect(r).toEqual({ ok: true })
    expect(s(COND).amount).toBe(1300)
    expect(s(COND).composicao.informada).toBeUndefined()
    expect(creditos()).toHaveLength(0)
    expect(s(AL_DEZ).amount).toBe(3700)
  })

  it('estorno do condomínio pago: o crédito volta a previsto (a parcela reaberta continua com o boleto)', async () => {
    await informar()
    await pagar(COND, 1290, 'txc', '2026-11-05')
    await estornar('txc')
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({ status: 'previsto', origem_lancamento_id: null })
    expect(s(COND)).toMatchObject({ amount: 1290, registered: [] })
    expect(s(AL_DEZ).amount).toBe(3610)
  })

  it('aluguel pago com o crédito previsto: abatido; pagar o condomínio depois não gera outro crédito', async () => {
    await informar()
    await pagar(AL_DEZ, 3610, 'txa', '2026-11-20')
    expect(creditos()[0]).toMatchObject({ status: 'compensado', compensado_em_lancamento_id: 'txa' })
    await pagar(COND, 1290, 'txc', '2026-11-25')
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({ status: 'compensado', origem_lancamento_id: 'txc' })
    expect(s(AL_JAN).amount).toBe(3700)
  })

  it('estorno do condomínio com o crédito já abatido: pede decisão; o crédito fica abatido e ligado à parcela', async () => {
    await informar()
    await pagar(AL_DEZ, 3610, 'txa', '2026-11-20')
    await pagar(COND, 1290, 'txc', '2026-11-25')
    await estornar('txc')
    expect(creditos()[0]).toMatchObject({ status: 'compensado', origem_lancamento_id: null, origem_agendamento_id: COND })
    const p = hook.result.current.pendenciasContrato.find(x => x.tipo === 'estorno_credito')
    expect(p).toMatchObject({ creditoId: creditos()[0].id, valor: 90 })
    // "Avulso": desliga da parcela; manter (padrão) = nada a fazer.
    await act(() => hook.result.current.desligarCreditoDoCondominio(p.creditoId))
    expect(creditos()[0]).toMatchObject({ origem_agendamento_id: null, status: 'compensado' })
  })

  it('editar a composição com o crédito já abatido num aluguel pago: avisa e pede decisão', async () => {
    await informar()
    await pagar(AL_DEZ, 3610, 'txa', '2026-11-20')
    const menor = BOLETO.map(i => (i.desc === 'Fundo de reserva' ? { ...i, valor: 80 } : i))
    const r = await informar(menor)
    expect(r).toMatchObject({ ok: false, conflito: { acao: 'conflito', abatido: 90, novo: 80 } })
    expect(s(COND).amount).toBe(1290) // nada mudou
    await informar(menor, { decisao: 'manter' })
    expect(s(COND).amount).toBe(1280)
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({ status: 'compensado', valor: 90 })
    // Valor maior: "complementar" cria o crédito da diferença para o próximo aluguel.
    const maior = BOLETO.map(i => (i.desc === 'Fundo de reserva' ? { ...i, valor: 100 } : i))
    await informar(maior, { decisao: 'complementar' })
    expect(creditos()).toHaveLength(2)
    expect(creditos()[1]).toMatchObject({ status: 'aberto', valor: 10 })
    expect(s(AL_JAN).amount).toBe(3690)
  })

  it('"Não abater neste mês" e "Trocar parcela de destino" valem para o crédito previsto', async () => {
    await informar()
    const id = creditos()[0].id
    await act(() => hook.result.current.adiarCreditoNaParcela(AL_DEZ, id))
    expect(s(AL_DEZ).amount).toBe(3700)
    expect(s(AL_JAN).amount).toBe(3610)
    await act(() => hook.result.current.trocarDestinoCredito(C, id, AL_FEV))
    expect(s(AL_JAN).amount).toBe(3700)
    expect(s(AL_FEV).amount).toBe(3610)
    // Pagar o condomínio não move o crédito do destino escolhido.
    await pagar(COND, 1290, 'txc', '2026-11-05')
    expect(creditos()[0]).toMatchObject({ id, status: 'aberto', destino_agendamento_id: AL_FEV })
    expect(s(AL_FEV).amount).toBe(3610)
  })

  it('parcela informada não é sobrescrita pela previsão do condomínio (último pago)', async () => {
    await informar()
    const OUTRO = idParcela('c1', 'condominio', '2026-12')
    // Pagar o condomínio de dezembro com 1.350 (sem composição) leva as pendentes a 1.350 — a de novembro, informada, fica.
    await pagar(OUTRO, 1350, 'txo', '2026-11-28')
    const pend = hook.result.current.pendenciasContrato.find(p => p.tipo === 'composicao' && p.txId === 'txo')
    expect(pend).toBeTruthy()
    expect(s(COND).amount).toBe(1290)
    expect(s(idParcela('c1', 'condominio', '2027-01')).amount).toBe(1350)
  })
})
