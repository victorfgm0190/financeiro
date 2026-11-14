// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ExcelJS from 'exceljs'
import RelatorioBens from './RelatorioBens'
import BemResumoTab from '../Patrimonio/BemResumoTab'
import { getExtratoBens } from '../../lib/bemApi'
import { specRelatorioBens } from '../../lib/relatorioBensExcel'
import { montarPlanilha } from '../../lib/exportExcel'

vi.mock('../../lib/bemApi', () => ({ getExtratoBens: vi.fn() }))
vi.mock('../BoasVindas/subtelaGuia', () => ({ useSubtelaGuia: () => {} }))
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    profiles: [{ id: 'P1', name: 'Família' }, { id: 'P2', name: 'Empresa' }], activeProfile: null,
    pode: () => true, updateTransaction: () => {}, profileTransactions: [],
  }),
}))

const dados = {
  bens: [
    { id: 'carro', nome: 'Carro', perfil_id: 'P1', valor_nota_fiscal: 150000, categoria_prestacao_id: 'p', categoria_taxa_id: 'j' },
    { id: 'sala', nome: 'Sala', perfil_id: 'P2', valor_nota_fiscal: 0 },
  ],
  lancamentos: [
    { id: 'a', type: 'transfer', date: `${new Date().getFullYear()}-01-10`, amount: 100000, account_id: 'itau', to_account_id: 'carro', bem_id: 'carro' },
    { id: 'b', type: 'transfer', date: `${new Date().getFullYear()}-01-11`, amount: 700, account_id: 'itau', to_account_id: 'sala' },
    { id: 'c', type: 'income', date: `${new Date().getFullYear()}-01-12`, amount: 50, account_id: 'carro', bem_id: 'carro' },
  ],
  trocas: [],
  parcelas: [],
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Relatório de saídas por mês', () => {
  it('mostra as saídas, separa terceiros e filtra por perfil', async () => {
    getExtratoBens.mockResolvedValue(dados)
    render(<RelatorioBens />)
    expect(await screen.findByRole('cell', { name: 'Carro' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Sala' })).toBeTruthy()
    const perfil = screen.getAllByRole('combobox')[0]
    fireEvent.change(perfil, { target: { value: 'P2' } })
    expect(screen.queryByRole('cell', { name: 'Carro' })).toBeNull()
    expect(screen.getByRole('cell', { name: 'Sala' })).toBeTruthy()
  })
  it('avisa quando não há saída no período', async () => {
    getExtratoBens.mockResolvedValue({ ...dados, lancamentos: [] })
    render(<RelatorioBens />)
    expect(await screen.findByText(/Nenhuma saída de bem/)).toBeTruthy()
  })
  it('planilha no padrão do Finup', () => {
    const linhas = [{ bem: 'Carro', mes: '2026-02', principal: 5000, juros: 1000, total: 6000, terceiros: 0, devolucoes: 0 }]
    const spec = specRelatorioBens(linhas, { de: '2026-01-01', ate: '2026-12-31', totais: { total: 6000, terceiros: 0, devolucoes: 0 } })
    const wb = montarPlanilha(ExcelJS, spec)
    expect(wb.worksheets[0].name).toBe('Pagamentos por Mês')
    expect(spec.nomeArquivo.relatorio).toBe('Patrimonio-Pagamentos-por-Mes')
  })
})

describe('Aba Resumo do bem', () => {
  it('mostra os números e a tabela mês a mês', async () => {
    getExtratoBens.mockResolvedValue({ ...dados, bens: [dados.bens[0]] })
    render(<BemResumoTab bemId="carro" />)
    expect(await screen.findByText('Pago acumulado (com juros)')).toBeTruthy()
    expect(screen.getAllByText('Falta pagar', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByText('Custo próprio líquido', { exact: false })).toBeTruthy()
    expect(screen.getByText('Mês a mês')).toBeTruthy()
    expect(getExtratoBens).toHaveBeenCalledWith('carro')
  })
  it('mostra o erro da API', async () => {
    getExtratoBens.mockRejectedValue(new Error('falhou'))
    render(<BemResumoTab bemId="carro" />)
    expect(await screen.findByText('falhou')).toBeTruthy()
  })
})
