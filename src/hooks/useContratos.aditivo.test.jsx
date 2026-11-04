// @vitest-environment jsdom
// Aditivo com créditos do proprietário (caso real de 04/11/2026): aluguel 3.900 com bonificação 200;
// crédito ABERTO de 79,14 (boleto de 10/09) e PREVISTO de 81,92 (boleto de 10/11), os dois no aluguel
// de 20/11 = 3.538,94 pela regra "Na próxima parcela pendente". A Prévia do aditivo mostrava
// 20/11: 3.538,94 → 3.700,00 (sem créditos), e a gravação mandava 3.700 sem créditos ao banco.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao, idParcela } from '../lib/contratos/parcelas.js'
import { planoCreditosAluguel } from '../lib/contratos/creditos.js'

const api = vi.hoisted(() => ({ creditos: [], contrato: null }))
vi.mock('../lib/contratosApi', () => {
  const nada = async () => []
  return {
    listarContratosApi: async () => [api.contrato], buscarContratoApi: nada, criarContratoApi: nada,
    atualizarContratoApi: async (id, campos) => ({ contrato: { ...api.contrato, ...campos } }),
    excluirContratoApi: nada, salvarItensContratoApi: nada, buscarIndiceApi: nada, listarRegrasApi: nada, criarRegraApi: nada,
    atualizarRegraApi: nada, excluirRegraApi: nada, listarCreditosApi: async () => api.creditos,
    criarCreditoApi: nada, atualizarCreditoApi: nada, excluirCreditoApi: nada, registrarEventoContratoApi: async (c, ev) => ev,
  }
})
const { useContratos } = await import('./useContratos.js')

const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob', status: 'ativo',
  data_inicio: '2026-08-20', data_fim: '2031-08-20', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 20,
  indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12, tem_condominio: true, valor_condominio_previsto: 1424.67,
  dia_vencimento_condominio: 10, favorecido_condominio: 'Cond', conta_id: 'cc', categoria_id: 'cat', credito_abatimento: 'proximo_pendente', excluidas: [],
}
const AL = (ym) => idParcela('c1', 'aluguel', ym)
const CREDITOS = [
  { id: 'k_set', contrato_id: 'c1', status: 'aberto', valor: 79.14, data_origem: '2026-09-10', origem_agendamento_id: 'sch_antiga@2026-09-10', itens: [{ desc: 'fundo de reserva', valor: 79.14 }] },
  { id: 'k_nov', contrato_id: 'c1', status: 'previsto', valor: 81.92, data_origem: '2026-11-10', origem_agendamento_id: idParcela('c1', 'condominio', '2026-11'), itens: [{ desc: 'Fundo de Reserva (+)', valor: 81.92 }] },
]

async function montar({ pagarNov = false } = {}) {
  api.contrato = C
  api.creditos = CREDITOS
  let parcelas = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: '2026-11-04', apartirDe: '2026-11' })).criar
  if (pagarNov) parcelas = parcelas.map(s => (s.id === AL('2026-11') ? { ...s, registered: [s.startDate] } : s))
  // Estado como no app: créditos já distribuídos pela regra atual.
  const pc = new Map(planoCreditosAluguel(C, parcelas, CREDITOS).map(p => [p.id, p.changes]))
  parcelas = parcelas.map(s => (pc.has(s.id) ? { ...s, ...pc.get(s.id) } : s))
  let estado = { schedules: parcelas, transactions: [] }
  const dataRef = { current: estado }
  const update = (fn) => { estado = fn(estado); dataRef.current = estado }
  const registrarEdicao = vi.fn(async () => ({}))
  const props = () => ({
    habilitado: true, update, dataRef, dados: estado, dbConectado: true, registrarEdicao,
    reverseTransaction: () => {}, updateTransaction: () => {}, persistirAgora: async () => ({ ok: true }),
  })
  const hook = renderHook((p) => useContratos(p), { initialProps: props() })
  await vi.waitFor(() => expect(hook.result.current.contratosCarregados).toBe(true))
  await act(async () => { hook.rerender(props()) })
  const s = (id) => dataRef.current.schedules.find(x => x.id === id)
  // Mesmo caminho do "Salvar aditivo" (ContratoWizard.confirmar).
  const salvarAditivo = async (campos) => {
    await act(async () => {
      const salvo = await hook.result.current.atualizarContrato('c1', campos, { tipo: 'aditivo' })
      const plano = await hook.result.current.planejarParcelasContrato(salvo)
      await hook.result.current.aplicarParcelasContrato(plano, { motivo: 'aditivo' })
    })
  }
  return { hook, s, registrarEdicao, salvarAditivo }
}
const linhas = (plano) => plano.atualizar.map(m => [m.id, m.antes.amount, m.changes.amount ?? m.antes.amount])

describe('Aditivo com créditos a abater (aberto e previsto)', () => {
  it('estado de partida: 20/11 = 3.538,94 (os dois créditos), 20/12 = 3.700,00', async () => {
    const { s } = await montar()
    expect(s(AL('2026-11')).amount).toBe(3538.94)
    expect(s(AL('2026-12')).amount).toBe(3700)
  })

  it('"Na próxima parcela pendente" → "No mês seguinte": a Prévia mostra 20/11 = 3.620,86 e 20/12 = 3.618,08, e grava isso', async () => {
    const { hook, s, registrarEdicao, salvarAditivo } = await montar()
    let previa
    await act(async () => { previa = await hook.result.current.planejarParcelasContrato({ ...C, credito_abatimento: 'mes_seguinte' }) })
    expect(linhas(previa)).toEqual([[AL('2026-11'), 3538.94, 3620.86], [AL('2026-12'), 3700, 3618.08]])
    expect(previa.criar).toEqual([])
    expect(previa.remover).toEqual([])

    await salvarAditivo({ credito_abatimento: 'mes_seguinte' })
    expect(s(AL('2026-11')).amount).toBe(3620.86)
    expect(s(AL('2026-12')).amount).toBe(3618.08)
    const credNov = s(AL('2026-11')).composicao.itens.filter(i => i.tipo === 'credito')
    const credDez = s(AL('2026-12')).composicao.itens.filter(i => i.tipo === 'credito')
    expect(credNov.map(i => i.credito_id)).toEqual(['k_set'])
    expect(credDez).toEqual([expect.objectContaining({ credito_id: 'k_nov', valor: -81.92, previsto: true })])
    // O histórico (que grava direto no banco) leva os valores FINAIS, com os créditos.
    const enviados = registrarEdicao.mock.calls.at(-1)[0].agendamentos
    expect(enviados.map(a => [a.id, a.amount])).toEqual([[AL('2026-11'), 3620.86], [AL('2026-12'), 3618.08]])
    expect(enviados.every(a => a.composicao.itens.some(i => i.tipo === 'credito'))).toBe(true)
  })

  it('regressão: aditivo sem mudança de regra não mexe em créditos nem composição e não mostra parcela alterada', async () => {
    const { hook, s, registrarEdicao, salvarAditivo } = await montar()
    const antes = JSON.stringify(s(AL('2026-11')))
    let previa
    await act(async () => { previa = await hook.result.current.planejarParcelasContrato({ ...C, observacao: 'só um texto' }) })
    expect(previa.atualizar).toEqual([])
    await salvarAditivo({ observacao: 'só um texto' })
    expect(JSON.stringify(s(AL('2026-11')))).toBe(antes)
    expect(registrarEdicao).not.toHaveBeenCalled()
  })

  it('"Não abater neste mês" continua valendo depois de um aditivo de valor', async () => {
    const { hook, s, salvarAditivo } = await montar()
    await act(async () => { await hook.result.current.adiarCreditoNaParcela(AL('2026-11'), 'k_nov') })
    expect(s(AL('2026-11')).amount).toBe(3620.86)
    expect(s(AL('2026-12')).amount).toBe(3618.08)
    await salvarAditivo({ valor_base: 4000 })
    expect(s(AL('2026-11')).composicao.creditos_adiados).toContain('k_nov')
    expect(s(AL('2026-11')).amount).toBe(r2(4000 - 200 - 79.14))
    expect(s(AL('2026-12')).amount).toBe(r2(4000 - 200 - 81.92))
  })

  it('parcela paga não muda', async () => {
    const { hook, s } = await montar({ pagarNov: true })
    const antes = s(AL('2026-11')).amount
    let previa
    await act(async () => { previa = await hook.result.current.planejarParcelasContrato({ ...C, credito_abatimento: 'mes_seguinte' }) })
    expect(previa.atualizar.map(m => m.id)).not.toContain(AL('2026-11'))
    expect(s(AL('2026-11')).amount).toBe(antes)
  })
})

function r2(n) { return Math.round(n * 100) / 100 }
