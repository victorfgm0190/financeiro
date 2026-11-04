// @vitest-environment jsdom
// Composição do ALUGUEL pelo recibo, pela mesma função da ficha, de Agendamentos e do Assistente
// (informarReciboAluguel). Contrato 3.900 com bonificação 200, seguro 49,06 (36x) e taxa 43,08 (12x).
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao, idParcela } from '../lib/contratos/parcelas.js'
import { planoCreditosAluguel } from '../lib/contratos/creditos.js'
import { diferencaDoPagamento } from '../lib/contratos/efetivacao.js'

const api = vi.hoisted(() => ({ creditos: [], itens: [], seq: 0 }))
vi.mock('../lib/contratosApi', () => {
  const nada = async () => []
  return {
    listarContratosApi: async () => [api.contrato], criarContratoApi: nada, atualizarContratoApi: async (id, campos) => ({ contrato: { ...api.contrato, ...campos } }),
    buscarContratoApi: async () => ({ contrato: api.contrato, itens: api.itens, eventos: [] }),
    salvarItensContratoApi: async (id, itens) => { api.itens = itens.map((i, k) => ({ id: i.id || `it${++api.seq}_${k}`, ...i })); return api.itens },
    excluirContratoApi: nada, buscarIndiceApi: nada, listarRegrasApi: nada, criarRegraApi: nada, atualizarRegraApi: nada, excluirRegraApi: nada,
    listarCreditosApi: async () => api.creditos,
    criarCreditoApi: async (c) => { const row = { id: `cr${++api.seq}`, ...c }; api.creditos = [...api.creditos, row]; return row },
    atualizarCreditoApi: async (c) => { api.creditos = api.creditos.map(x => (x.id === c.id ? { ...x, ...c } : x)); return api.creditos.find(x => x.id === c.id) },
    excluirCreditoApi: nada, registrarEventoContratoApi: async (c, ev) => ev,
  }
})
const { useContratos } = await import('./useContratos.js')

const ENCARGOS = [
  { id: 'e_seg', descricao: 'Seguro incêndio', sinal: 'encargo', valor: 49.06, parcelas_total: 36, parcela_inicio: 1, ativo: true },
  { id: 'e_tx', descricao: 'Taxa de administração', sinal: 'encargo', valor: 43.08, parcelas_total: 12, parcela_inicio: 1, ativo: true },
]
const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob', status: 'ativo',
  data_inicio: '2026-09-20', data_fim: '2029-08-20', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 20,
  indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12, tem_condominio: false, conta_id: 'cc', categoria_id: 'cat',
  credito_abatimento: 'proximo_pendente', excluidas: [], encargos: ENCARGOS,
}
const AL = (ym) => idParcela('c1', 'aluguel', ym)
const r2 = (n) => Math.round(n * 100) / 100

async function montar({ creditos = [], pagarOut = null } = {}) {
  api.contrato = C
  api.creditos = creditos
  api.itens = ENCARGOS.map(e => ({ id: e.id, descricao: e.descricao, na_parcela: true, sinal: e.sinal, valor_previsto: e.valor, parcelas_total: e.parcelas_total, parcela_inicio: e.parcela_inicio, ativo: true }))
  let parcelas = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: '2026-11-04', apartirDe: '2026-10' })).criar
  const txs = []
  if (pagarOut) {
    parcelas = parcelas.map(s => (s.id === AL('2026-10') ? { ...s, registered: [s.startDate], registeredMeta: { [s.startDate]: { lancamento_id: 'tx_out' } } } : s))
    txs.push({ id: 'tx_out', type: 'expense', accountId: 'cc', amount: pagarOut, date: '2026-10-19', description: 'Aluguel', contratoId: 'c1', composicao: parcelas.find(s => s.id === AL('2026-10')).composicao })
  }
  const pc = new Map(planoCreditosAluguel(C, parcelas, creditos).map(p => [p.id, p.changes]))
  parcelas = parcelas.map(s => (pc.has(s.id) ? { ...s, ...pc.get(s.id) } : s))
  let estado = { schedules: parcelas, transactions: txs }
  const dataRef = { current: estado }
  const update = (fn) => { estado = fn(estado); dataRef.current = estado }
  const updateTransaction = (id, ch) => update(d => ({ ...d, transactions: d.transactions.map(t => (t.id === id ? { ...t, ...ch } : t)) }))
  const props = () => ({
    habilitado: true, update, dataRef, dados: estado, dbConectado: true, registrarEdicao: vi.fn(async () => ({})),
    reverseTransaction: () => {}, updateTransaction, persistirAgora: async () => ({ ok: true }), recursosBanco: { encargosContrato: true, creditoPrevisto: true },
  })
  const hook = renderHook((p) => useContratos(p), { initialProps: props() })
  await vi.waitFor(() => expect(hook.result.current.contratosCarregados).toBe(true))
  await act(async () => { hook.rerender(props()) })
  const s = (id) => dataRef.current.schedules.find(x => x.id === id)
  const tx = (id) => dataRef.current.transactions.find(x => x.id === id)
  const informar = async (dados) => { await act(async () => { await hook.result.current.informarReciboAluguel(C, dados) }) }
  return { hook, s, tx, informar }
}
const desc = (s) => s.composicao.itens.map(i => i.desc)

describe('Composição do aluguel pelo recibo', () => {
  it('parcela pendente: 3.900 − 200 + 49,06 + 43,08 − 79,10 = 3.713,04 (previsto) e o recibo igual grava 3.713,04 informado', async () => {
    const cr = [{ id: 'k_fr', contrato_id: 'c1', status: 'aberto', valor: 79.10, data_origem: '2026-11-10', descricao: 'fundo de reserva', itens: [{ desc: 'fundo de reserva', valor: 79.10 }] }]
    const { s, informar } = await montar({ creditos: cr })
    expect(s(AL('2026-11')).amount).toBe(3713.04)
    await informar({
      parcelaId: AL('2026-11'), total: 3713.04, itens: [
        { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
        { tipo: 'encargo', desc: 'Seguro incêndio 3/36', valor: 49.06, encargo_id: 'e_seg' }, { tipo: 'encargo', desc: 'Taxa 3/12', valor: 43.08, encargo_id: 'e_tx' },
        { tipo: 'credito', desc: 'Fundo de reserva', valor: -79.10, credito_id: 'k_fr' },
      ],
    })
    const p = s(AL('2026-11'))
    expect(p.amount).toBe(3713.04)
    expect(p.composicao).toMatchObject({ informada: true, tipo: 'aluguel', total: 3713.04 })
    expect(api.creditos.find(c => c.id === 'k_fr').destino_agendamento_id).toBe(AL('2026-11'))
    // A próxima parcela segue a regra recorrente e o contador avança.
    expect(desc(s(AL('2026-12')))).toEqual(expect.arrayContaining(['Seguro incêndio 4/36', 'Taxa de administração 4/12']))
    expect(s(AL('2026-12')).amount).toBe(r2(3900 - 200 + 49.06 + 43.08))
  })

  it('recibo substitui os itens previstos: não soma de novo bonificação/encargos; crédito fora do recibo vai para a próxima', async () => {
    const cr = [{ id: 'k_fr', contrato_id: 'c1', status: 'aberto', valor: 79.10, data_origem: '2026-11-10', descricao: 'fundo de reserva', itens: [{ desc: 'fundo de reserva', valor: 79.10 }] }]
    const { s, informar } = await montar({ creditos: cr })
    await informar({ parcelaId: AL('2026-11'), total: 3750, itens: [{ tipo: 'base', desc: 'Aluguel', valor: 3700 }, { tipo: 'unico', desc: 'Vistoria', valor: 50 }] })
    expect(s(AL('2026-11')).amount).toBe(3750)
    expect(s(AL('2026-11')).composicao.itens).toHaveLength(2)
    expect(s(AL('2026-12')).amount).toBe(r2(3900 - 200 + 49.06 + 43.08 - 79.10))
  })

  it('valor diferente do recorrente vale só nesta parcela; "seguir nas próximas" muda as seguintes', async () => {
    const a = await montar()
    await a.informar({ parcelaId: AL('2026-11'), total: 3794, itens: [
      { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
      { tipo: 'encargo', desc: 'Seguro incêndio', valor: 50.92, encargo_id: 'e_seg' }, { tipo: 'encargo', desc: 'Taxa', valor: 43.08, encargo_id: 'e_tx' },
    ] })
    expect(a.s(AL('2026-12')).composicao.itens.find(i => i.encargo_id === 'e_seg').valor).toBe(49.06)
    const b = await montar()
    await b.informar({ parcelaId: AL('2026-11'), total: 3794, seguir: [{ encargo_id: 'e_seg', valor: 50.92 }], itens: [
      { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
      { tipo: 'encargo', desc: 'Seguro incêndio', valor: 50.92, encargo_id: 'e_seg' }, { tipo: 'encargo', desc: 'Taxa', valor: 43.08, encargo_id: 'e_tx' },
    ] })
    expect(b.s(AL('2026-12')).composicao.itens.find(i => i.desc.startsWith('Seguro')).valor).toBe(50.92)
    expect(b.s(AL('2026-11')).amount).toBe(3794)
  })

  it('"Tornar recorrente": item único vira encargo e entra nas próximas com o contador ("2/4")', async () => {
    const { s, informar } = await montar()
    await informar({ parcelaId: AL('2026-11'), total: 3812.14, recorrentes: [{ indice: 4, parcelas_total: 4, parcela_atual: 1 }], itens: [
      { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
      { tipo: 'encargo', desc: 'Seguro', valor: 49.06, encargo_id: 'e_seg' }, { tipo: 'encargo', desc: 'Taxa', valor: 43.08, encargo_id: 'e_tx' },
      { tipo: 'unico', desc: 'IPTU', valor: 20 },
    ] })
    expect(desc(s(AL('2026-12')))).toContain('IPTU 2/4')
    expect(desc(s(AL('2027-02')))).toContain('IPTU 4/4')
    expect(desc(s(AL('2027-03'))).some(d => d.startsWith('IPTU'))).toBe(false)
  })

  it('parcela paga 3.278,44: lançamento inalterado, crédito 79,14 abatido uma vez só (sai da pendente), diferença explicada', async () => {
    const cr = [{ id: 'k_set', contrato_id: 'c1', status: 'aberto', valor: 79.14, data_origem: '2026-09-10', descricao: 'fundo de reserva', itens: [{ desc: 'fundo de reserva', valor: 79.14 }] }]
    const { s, tx, informar } = await montar({ creditos: cr, pagarOut: 3278.44 })
    expect(desc(s(AL('2026-11'))).some(d => d.startsWith('fundo de reserva'))).toBe(true)
    const antes = { amount: tx('tx_out').amount, date: tx('tx_out').date }
    await informar({ parcelaId: AL('2026-10'), tx: tx('tx_out'), itens: [
      { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
      { tipo: 'encargo', desc: 'Seguro 2/36', valor: 49.06, encargo_id: 'e_seg' }, { tipo: 'unico', desc: 'Seguro 1/36 (retroativo)', valor: 49.06 },
      { tipo: 'unico', desc: 'IPTU', valor: 43.80 }, { tipo: 'encargo', desc: 'Taxa 2/12', valor: 43.08, encargo_id: 'e_tx' },
      { tipo: 'credito', desc: 'Fundo de reserva', valor: -79.14, credito_id: 'k_set' }, { tipo: 'unico', desc: 'Desconto acordo', valor: -527.42 },
    ] })
    expect({ amount: tx('tx_out').amount, date: tx('tx_out').date }).toEqual(antes)
    expect(tx('tx_out').composicao).toMatchObject({ informada: true, total: 3278.44 })
    expect(api.creditos.find(c => c.id === 'k_set')).toMatchObject({ status: 'compensado', compensado_em_lancamento_id: 'tx_out' })
    expect(desc(s(AL('2026-11'))).some(d => d.startsWith('fundo de reserva'))).toBe(false)
    expect(s(AL('2026-11')).amount).toBe(r2(3900 - 200 + 49.06 + 43.08))
    // "Justificar diferença" some: a composição explica o pago.
    expect(diferencaDoPagamento(tx('tx_out'), 3792.14).diferenca).toBe(0)
  })

  it('desconto sem crédito como "crédito manual já abatido" (paga) e soma divergente bloqueia', async () => {
    const { tx, informar } = await montar({ pagarOut: 3700 })
    await informar({ parcelaId: AL('2026-10'), tx: tx('tx_out'), itens: [
      { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'credito', desc: 'Desconto pintura', valor: -200, acao: 'manual' },
    ] })
    const manual = api.creditos.find(c => c.descricao === 'Desconto pintura')
    expect(manual).toMatchObject({ status: 'compensado', compensado_em_lancamento_id: 'tx_out', valor: 200 })
    expect(tx('tx_out').composicao.itens.find(i => i.tipo === 'credito').credito_id).toBe(manual.id)
    const b = await montar({ pagarOut: 3700 })
    let erro = null
    await act(async () => { try { await b.hook.result.current.informarReciboAluguel(C, { parcelaId: AL('2026-10'), tx: b.tx('tx_out'), itens: [{ tipo: 'base', desc: 'Aluguel', valor: 3900 }] }) } catch (e) { erro = e } })
    expect(erro?.message).toMatch(/precisa ser igual/)
  })

  it('aditivo sem mudança com encargos: "Nenhuma parcela muda"; acrescentar encargo mostra todas as pendentes pelo valor final', async () => {
    const { hook } = await montar()
    let p
    await act(async () => { p = await hook.result.current.planejarParcelasContrato(C) })
    expect(p.atualizar).toEqual([])
    await act(async () => { p = await hook.result.current.planejarParcelasContrato({ ...C, encargos: [...ENCARGOS, { id: 'novo', descricao: 'Vistoria', sinal: 'encargo', valor: 120, parcelas_total: 1, parcela_inicio: 3, ativo: true }] }) })
    expect(p.atualizar.map(m => [m.id, m.changes.amount])).toEqual([[AL('2026-11'), r2(3900 - 200 + 49.06 + 43.08 + 120)]])
  })
})
