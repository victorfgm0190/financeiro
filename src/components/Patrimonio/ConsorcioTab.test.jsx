// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ConsorcioTab from './ConsorcioTab'
import { getExtratoBens } from '../../lib/bemApi'

vi.mock('../../lib/bemApi', () => ({ getExtratoBens: vi.fn(), registrarEventoConsorcio: vi.fn(), estornarEventoConsorcio: vi.fn() }))
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ pode: () => true, schedules: [], accounts: [], updateSchedule: () => {}, getNextOccurrences: () => [], addTransaction: () => {}, deleteTransaction: () => {}, updateAccount: () => {} }),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const cota = (id, extra) => ({
  id, bem_id: 'b', numero: id, valor_carta: 100000, percentual_parcela: 50, valor_parcela_cheia: 683.4, prazo_meses: 180,
  data_adesao: '2026-04-22', parcelas_pagas_informadas: 6, ...extra,
})
const extrato = (valor) => ({
  bens: [{ id: 'b', tipo_bem: 'consorcio', valor_nota_fiscal: 0 }],
  lancamentos: [{ id: 'x', type: 'transfer', date: '2026-06-08', amount: valor, account_id: 'itau', to_account_id: 'b', bem_id: 'b', origem_tipo: 'checking' }],
  trocas: [], parcelas: [], cotas: [],
})
const abrir = (cotas) => render(<ConsorcioTab bemId="b" tipoBem="consorcio" consorcio={{ situacao: 'ativa', cotas, eventos: [] }} onEditar={() => {}} onMudou={() => {}} avisar={() => {}} />)

describe('Tabela de cotas', () => {
  it('mostra pagas/prazo, restantes e o encerramento informado', async () => {
    getExtratoBens.mockResolvedValue(extrato(341.7 * 6))
    abrir([cota('A', { previsao_encerramento: '2041-04-16', data_ultima_parcela: '2041-04-10' })])
    expect((await screen.findAllByText('6/180')).length).toBe(2)
    expect(screen.getAllByText('174').length).toBe(2)
    expect(screen.getByText('16/04/2041')).toBeTruthy()
    expect(screen.getByText('última parcela 10/04/2041')).toBeTruthy()
    expect(screen.queryByText('estimado')).toBeNull()
  })
  it('sem data informada: adesão + prazo com o rótulo estimado', async () => {
    getExtratoBens.mockResolvedValue(extrato(341.7 * 6))
    abrir([cota('A')])
    await screen.findAllByText('6/180')
    expect(screen.getByText('22/04/2041')).toBeTruthy()
    expect(screen.getByText('estimado')).toBeTruthy()
  })
  it('administradora diferente: mostra os dois', async () => {
    getExtratoBens.mockResolvedValue(extrato(341.7 * 5))
    abrir([cota('A')])
    await screen.findAllByText('5/180')
    expect(screen.getByText('administradora: 6/180')).toBeTruthy()
    expect(screen.getByText('administradora: 174')).toBeTruthy()
    expect(screen.getAllByText('175').length).toBe(2)
  })
})
