// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { gerarPlanoParcelas, linhasDoContrato, idParcela } from '../lib/contratos/parcelas.js'

// "Gravar vínculo" tudo ou nada: parcela + baixa + vínculo no lançamento no banco, e só então o evento.
const api = vi.hoisted(() => ({ eventos: [], falharEvento: false }))
vi.mock('../lib/contratosApi', () => {
  const nada = async () => []
  return {
    listarContratosApi: nada, buscarContratoApi: nada, criarContratoApi: nada, atualizarContratoApi: nada, excluirContratoApi: nada,
    salvarItensContratoApi: nada, buscarIndiceApi: nada, listarRegrasApi: nada, criarRegraApi: nada, atualizarRegraApi: nada,
    excluirRegraApi: nada, listarCreditosApi: nada, criarCreditoApi: nada, atualizarCreditoApi: nada, excluirCreditoApi: nada,
    registrarEventoContratoApi: async (contratoId, ev) => {
      if (api.falharEvento) throw new Error('HTTP 500')
      api.eventos.push({ contratoId, ...ev })
      return ev
    },
  }
})
const { useContratos } = await import('./useContratos.js')

// Contrato como vem de um banco SEM a migração 2026-11-03 (sem credito_abatimento nem meses_sem_cobranca).
const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob', data_inicio: '2026-08-20', data_fim: '2031-08-20',
  valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 20, indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12,
  tem_condominio: false, conta_id: 'cc', categoria_id: 'cat', excluidas: [],
}
const HOJE = '2026-11-03'
const TX = { id: 'tx22', date: '2026-08-22', amount: 3700, accountId: 'cc', description: 'IMOB', type: 'expense' }
// Parcela gerada de outubro para a ficha ter "Sem pagamento vinculado" em agosto e setembro.
const OUT = {
  id: idParcela('c1', 'aluguel', '2026-10'), contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'once', startDate: '2026-10-20',
  amount: 3700, registered: [], registeredMeta: {}, skipped: [], overrides: {}, composicao: { itens: [], total: 3700 },
}

let estado
let banco // o que "chegou ao banco" pela fila
let modoPersistir
const montar = () => {
  estado = { schedules: [OUT], transactions: [TX] }
  banco = { schedules: [OUT], transactions: [TX] }
  api.eventos = []
  api.falharEvento = false
  modoPersistir = 'ok'
  const dataRef = { current: estado }
  const update = (fn) => { estado = fn(estado); dataRef.current = estado }
  const persistirAgora = vi.fn(async ({ pronto }) => {
    if (!pronto(estado)) return { ok: false, erro: 'não registrada' }
    if (modoPersistir === 'falha') { modoPersistir = 'ok'; return { ok: false, erro: 'HTTP 503' } }
    banco = { schedules: estado.schedules, transactions: estado.transactions }
    return { ok: true }
  })
  const { result } = renderHook(() => useContratos({
    habilitado: false, update, dataRef, dados: estado, dbConectado: true, registrarEdicao: async () => {},
    reverseTransaction: () => {}, updateTransaction: () => {}, persistirAgora,
  }))
  return { result, persistirAgora }
}
const linhaDeAgosto = () => {
  const plano = gerarPlanoParcelas(C, { hoje: HOJE })
  return linhasDoContrato(C, estado.schedules, estado.transactions, { hoje: HOJE, plano }).find(l => l.semParcela && l.competencia === '2026-08')
}
const gravar = (result, linha = linhaDeAgosto()) =>
  result.current.vincularLancamentoNaLinha(C, linha, estado.transactions.find(t => t.id === TX.id), { vincular: () => ({ ok: true }), desvincular: () => ({ ok: true }) })

describe('vincular pagamento numa competência sem parcela (banco sem a migração 2026-11-03)', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('grava parcela + baixa + vínculo no lançamento, e o evento só depois', async () => {
    const { result, persistirAgora } = montar()
    const linha = linhaDeAgosto()
    expect(linha).toMatchObject({ numero: 1, valor: 3700 })
    await act(() => gravar(result, linha))
    const p = banco.schedules.find(s => s.id === idParcela('c1', 'aluguel', '2026-08'))
    expect(p.registered).toEqual(['2026-08-20'])
    expect(p.registeredMeta['2026-08-20'].lancamento_id).toBe('tx22')
    expect(banco.transactions[0]).toMatchObject({ contratoId: 'c1', dataOcorrencia: '2026-08-20', composicao: { tipo: 'aluguel', total: 3700 } })
    expect(persistirAgora.mock.calls[0][0].chaves).toEqual([`agendamentos:${p.id}`, 'lancamentos:tx22'])
    expect(api.eventos).toHaveLength(1)
    expect(api.eventos[0]).toMatchObject({ tipo: 'vinculo', detalhes: { parcela_id: p.id, lancamento_id: 'tx22', criada: true } })
  })

  it('falha ao gravar a parcela: nada fica (nem parcela, nem lançamento alterado, nem evento) e o erro sobe', async () => {
    const { result } = montar()
    modoPersistir = 'falha'
    await expect(act(() => gravar(result))).rejects.toThrow(/O vínculo não foi gravado: HTTP 503/)
    expect(estado.schedules.map(s => s.id)).toEqual([OUT.id])
    expect(estado.transactions[0]).toMatchObject({ contratoId: null, dataOcorrencia: null, composicao: null })
    expect(banco.schedules.map(s => s.id)).toEqual([OUT.id])
    expect(api.eventos).toHaveLength(0)
  })

  it('falha no evento: a parcela gravada é desfeita no banco', async () => {
    const { result } = montar()
    api.falharEvento = true
    await expect(act(() => gravar(result))).rejects.toThrow(/linha do tempo do contrato não respondeu/)
    expect(banco.schedules.map(s => s.id)).toEqual([OUT.id])
    expect(banco.transactions[0]).toMatchObject({ contratoId: null, dataOcorrencia: null })
  })

  it('repetir a mesma competência com o mesmo lançamento não duplica nada', async () => {
    const { result } = montar()
    const linha = linhaDeAgosto()
    await act(() => gravar(result, linha))
    await expect(act(() => gravar(result, linha))).rejects.toThrow('Este pagamento já está vinculado a esta parcela.')
    expect(estado.schedules.filter(s => s.id === idParcela('c1', 'aluguel', '2026-08'))).toHaveLength(1)
    expect(api.eventos).toHaveLength(1)
  })

  it('dois cliques ao mesmo tempo: só um grava', async () => {
    const { result } = montar()
    const linha = linhaDeAgosto()
    const r = await act(() => Promise.allSettled([gravar(result, linha), gravar(result, linha)]))
    expect(r.map(x => x.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(estado.schedules.filter(s => s.id === idParcela('c1', 'aluguel', '2026-08'))).toHaveLength(1)
    expect(api.eventos).toHaveLength(1)
  })
})
