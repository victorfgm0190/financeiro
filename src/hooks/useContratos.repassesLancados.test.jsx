// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao, competenciasDoRepasse, idParcela, parcelaPaga } from '../lib/contratos/parcelas.js'
import { buscarRepassesLancados } from '../lib/contratos/buscaRepasses.js'

// ETAPA 6 — repasses JÁ LANÇADOS na conta (antes do contrato) ligados às competências. Caso de
// referência (dados fictícios): 02–06 conferidas, repasse 06 = 1.370,65; 07, 08 e 09 = 1.977,00.
// Na conta: 1.370,65 em 10/07, 1.977,00 em 10/08, 10/09 e 09/10/2026 — e um recebimento de outro
// favorecido com o mesmo valor (não pode ser sugerido).
const api = vi.hoisted(() => ({ eventos: [] }))
vi.mock('../lib/contratosApi', () => {
  const nada = async () => []
  return {
    listarContratosApi: nada, buscarContratoApi: nada, criarContratoApi: nada, atualizarContratoApi: nada, excluirContratoApi: nada,
    salvarItensContratoApi: nada, buscarIndiceApi: nada, listarRegrasApi: nada, criarRegraApi: nada, atualizarRegraApi: nada,
    excluirRegraApi: nada, listarCreditosApi: nada, criarCreditoApi: nada, atualizarCreditoApi: nada, excluirCreditoApi: nada,
    registrarEventoContratoApi: async (contratoId, ev) => { api.eventos.push({ contratoId, ...ev }); return ev },
  }
})
vi.mock('../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-11-08' }))
const { useContratos } = await import('./useContratos.js')

const HOJE = '2026-11-08'
const CONF = (periodo, repasse = 0) => ({ conferido_em: '2026-11-08', origem: 'ia', periodo, repasse })
const A = (descricao, valor, tipo, extra = {}) => ({ chave: tipo === 'aluguel' ? 'aluguel' : tipo === 'taxa_adm' ? 'adm' : `${tipo}:${descricao}`, tipo, descricao, valor, origem: 'auto', informado: false, valor_calculado: null, ...extra })
const C = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2027-02-28', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-alug',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf', conta_id: 'cc', excluidas: [],
  itens_repasse: [
    { id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [2200], vigencia_inicio: '2026-02', ativo: true },
    { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Banco', valor: 3, vigencia_inicio: '2026-06', ativo: true },
  ],
  competencias: [
    { competencia: '2026-02', status: 'fechada', conferencia: CONF('02/2026'), itens: [
      A('Aluguel dias', 586.67, 'aluguel'), { chave: 'm:1', tipo: 'despesa', natureza: 'consumo', descricao: 'Sanepar', valor: -96.73, origem: 'manual' },
      { chave: 'm:2', tipo: 'despesa', natureza: 'consumo', descricao: 'Luz', valor: -25.13, origem: 'manual' },
      A('Intermediação', -470, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }), A('Administração', -11.67, 'taxa_adm')] },
    { competencia: '2026-03', status: 'fechada', conferencia: CONF('03/2026'), itens: [
      A('Aluguel 03', 2200, 'aluguel'), A('Intermediação', -865, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }),
      { chave: 'm:3', tipo: 'benfeitoria', descricao: 'Benfeitorias', valor: -4799.49, origem: 'manual', somar_ao_bem: false }, A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-04', status: 'fechada', conferencia: CONF('04/2026'), itens: [
      A('Aluguel 04', 2200, 'aluguel'), A('Intermediação', -865, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }), A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-05', status: 'fechada', conferencia: CONF('05/2026'), itens: [A('Aluguel 05', 2200, 'aluguel'), A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-06', status: 'fechada', conferencia: CONF('06/2026', 1370.65), itens: [
      A('Aluguel 06', 2200, 'aluguel'), A('Administração', -220, 'taxa_adm'), A('Banco', -3, 'tarifa', { chave: 'tarifa:tf' })] },
  ],
}
const TX = (id, date, amount, payee = 'ADMINISTRADORA EXEMPLO LTDA') => ({
  id, date, amount, payee, description: 'Repasse aluguel', type: 'income', accountId: 'cc', categoryId: 'cat-recebimentos',
})
const LANCADOS = [TX('t06', '2026-07-10', 1370.65), TX('t07', '2026-08-10', 1977), TX('t08', '2026-09-10', 1977), TX('t09', '2026-10-09', 1977)]
const OUTRO = TX('outro', '2026-08-10', 1977, 'Fulano de Tal') // mesmo valor e data, outro favorecido

// Como o wizard deixa o contrato criado hoje: repasses gerados a partir de 10/2026 (pendentes).
const pendentes = () => planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: HOJE, apartirDe: '2026-10' }), {}).criar

let estado
let aplicar // mexe no estado como o AppContext (testes do vincular)
const montar = (extras = []) => {
  estado = { schedules: [...pendentes(), ...extras], transactions: [...LANCADOS, OUTRO] }
  api.eventos = []
  const dataRef = { current: estado }
  const update = (fn) => { estado = fn(estado); dataRef.current = estado }
  aplicar = update
  const persistirAgora = vi.fn(async ({ pronto }) => (pronto(estado) ? { ok: true } : { ok: false, erro: 'não registrada' }))
  const { result } = renderHook(() => useContratos({
    habilitado: false, update, dataRef, dados: estado, dbConectado: true, registrarEdicao: async () => {},
    reverseTransaction: () => {}, updateTransaction: () => {}, persistirAgora,
  }))
  return result
}
// Linhas da ficha (TabelaRepasse): competências com `paga` pelo agendamento da competência.
const linhasFicha = () => competenciasDoRepasse(C, { hoje: HOJE }).map(l => {
  const s = estado.schedules.find(x => x.id === idParcela('c9', 'aluguel', l.competencia))
  return { ...l, paga: !!s && parcelaPaga(s) }
})

describe('Etapa 6 — repasses já lançados na conta', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('busca: sugere os 4 lançamentos nas competências 06–09; o de outro favorecido não; 10/2026 sem lançamento', () => {
    montar()
    const busca = buscarRepassesLancados(C, linhasFicha(), estado.schedules, estado.transactions, { hoje: HOJE })
    expect(busca.map(b => [b.competencia, b.valor, b.sugestao])).toEqual([
      ['2026-06', 1370.65, 't06'], ['2026-07', 1977, 't07'], ['2026-08', 1977, 't08'], ['2026-09', 1977, 't09'], ['2026-10', 1977, null],
    ])
    expect(busca.flatMap(b => b.candidatos.map(c => c.tx.id))).not.toContain('outro')
  })

  it('vincular os 4: agendamentos 06–09 baixados por eles, sem recebimento novo; lançamentos intactos; 10/2026 em diante pendentes', async () => {
    const result = montar()
    const antes = new Map(LANCADOS.map(t => [t.id, { ...t }]))
    const busca = buscarRepassesLancados(C, linhasFicha(), estado.schedules, estado.transactions, { hoje: HOJE })
    for (const b of busca.filter(x => x.sugestao)) {
      await act(() => result.current.vincularRepasseLancado(C, b.competencia, b.sugestao, { vincular: () => ({ ok: true }), desvincular: () => ({ ok: true }) }))
    }
    // Nenhum lançamento novo: os mesmos 5.
    expect(estado.transactions.map(t => t.id).sort()).toEqual(['outro', 't06', 't07', 't08', 't09'])
    for (const [comp, txId, venc] of [['2026-06', 't06', '2026-07-10'], ['2026-07', 't07', '2026-08-10'], ['2026-08', 't08', '2026-09-10'], ['2026-09', 't09', '2026-10-10']]) {
      const s = estado.schedules.find(x => x.id === idParcela('c9', 'aluguel', comp))
      expect(s.registered).toEqual([venc])
      expect(s.registeredMeta[venc]).toMatchObject({ tipo: 'pago', lancamento_id: txId })
      // Lançamento: valor, data, categoria e conta ficam; ganha o contrato e a cópia da composição.
      const t = estado.transactions.find(x => x.id === txId)
      const a = antes.get(txId)
      expect([t.amount, t.date, t.categoryId, t.accountId, t.payee]).toEqual([a.amount, a.date, a.categoryId, a.accountId, a.payee])
      expect(t).toMatchObject({ contratoId: 'c9', composicao: { tipo: 'repasse', competencia: comp } })
    }
    // Uma parcela por competência (nada duplicado) e 10/2026 em diante pendentes.
    const ids = estado.schedules.map(s => s.id)
    expect(ids.length).toBe(new Set(ids).size)
    const futuros = estado.schedules.filter(s => s.composicao?.competencia >= '2026-10')
    expect(futuros.length).toBeGreaterThan(0)
    expect(futuros.every(s => !parcelaPaga(s))).toBe(true)
    expect(estado.transactions.find(t => t.id === 'outro').contratoId).toBeUndefined()
    // Vincular de novo a mesma competência: recusado.
    await expect(act(() => result.current.vincularRepasseLancado(C, '2026-06', 't06', { vincular: () => ({ ok: true }) }))).rejects.toThrow(/já está baixado/)
  })

  it('com o agendamento pendente da competência já criado: é ele que é baixado (sem criar outro)', async () => {
    const id09 = idParcela('c9', 'aluguel', '2026-09')
    const pend09 = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: HOJE, apartirDe: '2026-09' }), {}).criar.find(s => s.id === id09)
    const result = montar([pend09])
    // vincularLancamento do AppContext: baixa a ocorrência apontando o lançamento (sem criar outro).
    const vincular = vi.fn(({ scheduleId, data, txId }) => {
      aplicar(d => ({ ...d, schedules: d.schedules.map(s => (s.id === scheduleId ? { ...s, registered: [data], registeredMeta: { [data]: { tipo: 'pago', lancamento_id: txId } } } : s)) }))
      return { ok: true }
    })
    await act(() => result.current.vincularRepasseLancado(C, '2026-09', 't09', { vincular, desvincular: () => ({ ok: true }) }))
    expect(vincular).toHaveBeenCalledWith(expect.objectContaining({ txId: 't09', scheduleId: id09, data: '2026-10-10', manter: 'agendamento' }))
    const s09 = estado.schedules.filter(s => s.id === id09)
    expect(s09).toHaveLength(1)
    expect(s09[0].registeredMeta['2026-10-10'].lancamento_id).toBe('t09')
    expect(estado.transactions).toHaveLength(5)
  })
})
