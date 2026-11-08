// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Categoria dos itens automáticos do repasse vem do contrato (dados fictícios).
const BASE = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-alug',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf',
  itens_repasse: [
    { id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [470, 865, 865], vigencia_inicio: '2026-02', ativo: true, categoria_id: 'cat-inter' },
    { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Tarifa bancária', valor: 9.35, vigencia_inicio: '2026-02', ativo: true, categoria_id: null },
  ],
  competencias: [],
}
// Competência gravada (conferida) ANTES de o contrato ter as categorias: itens sem categoria.
const CONFERIDA_SEM_CATEGORIA = {
  competencia: '2026-02', status: 'fechada', conferencia: { conferido_em: '2026-03-06', origem: 'ia', repasse: 0 },
  itens: [
    { chave: 'aluguel', tipo: 'aluguel', descricao: 'Aluguel', valor: 586.67, origem: 'auto', categoria_id: null },
    { chave: 'adm', tipo: 'taxa_adm', descricao: 'Taxa de administração', valor: -58.67, origem: 'auto', categoria_id: null },
    { chave: 'tarifa:tf', tipo: 'tarifa', descricao: 'Tarifa bancária', valor: -9.35, origem: 'auto', categoria_id: null },
    { chave: 'taxa_unica:tu', tipo: 'taxa_unica', taxa_id: 'tu', descricao: 'Intermediação 1/3', valor: -470, origem: 'auto', categoria_id: null },
  ],
}
const salvarCompetenciaRepasse = vi.fn(async () => ({}))
const app = {
  categories: [
    { id: 'cat-adm', name: 'Taxa adm', type: 'expense' }, { id: 'cat-inter', name: 'Intermediação imob', type: 'expense' },
    { id: 'cat-alug', name: 'Aluguel recebido', type: 'income' },
  ],
  indicesContratos: {}, schedules: [], transactions: [], accounts: [], salvarCompetenciaRepasse, pode: () => true, registerScheduleOccurrence: vi.fn(),
  activeProfileId: 'pf', categoryGroupOrder: null,
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-05-06' }))

const { default: ComposicaoRepasseModal } = await import('./ComposicaoRepasseModal.jsx')
const { default: TabelaRepasse } = await import('./TabelaRepasse.jsx')
const { default: ConferirExtratoModal } = await import('./ConferirExtratoModal.jsx')

afterEach(() => { cleanup(); salvarCompetenciaRepasse.mockClear() })

describe('categoria dos itens do repasse vem do contrato', () => {
  it('competência gravada sem categoria: a leitura completa (aluguel, taxa adm., tarifa → da adm., taxa única → a dela)', async () => {
    const contrato = { ...BASE, competencias: [CONFERIDA_SEM_CATEGORIA] }
    render(<ComposicaoRepasseModal contrato={contrato} competencia="2026-02" onClose={() => {}} />)
    expect(screen.queryAllByText('Taxa adm')).toHaveLength(2) // taxa de adm. e tarifa (vazia = a da adm.)
    expect(screen.queryAllByText('Intermediação imob')).toHaveLength(1)
    expect(screen.queryAllByText('Aluguel recebido')).toHaveLength(1)
    expect(screen.queryAllByText('Sem categoria')).toHaveLength(0)
  })

  it('competência aberta com categoria vazia gravada: o automático nasce com a do contrato e grava', async () => {
    const contrato = { ...BASE, competencias: [{ competencia: '2026-02', status: 'aberta', itens: [
      { chave: 'adm', tipo: 'taxa_adm', origem: 'auto', informado: true, valor: -11.67, categoria_id: null },
    ] }] }
    render(<ComposicaoRepasseModal contrato={contrato} competencia="2026-02" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Valor de Taxa de administração/), { target: { value: '12,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }))
    await vi.waitFor(() => expect(salvarCompetenciaRepasse).toHaveBeenCalled())
    const [, comp] = salvarCompetenciaRepasse.mock.calls[0]
    expect(Object.fromEntries(comp.itens.map(i => [i.tipo, i.categoria_id]))).toEqual({
      aluguel: 'cat-alug', taxa_adm: 'cat-adm', tarifa: 'cat-adm', taxa_unica: 'cat-inter',
    })
  })

  it('contrato sem a categoria da taxa de adm.: avisa UMA vez na ficha', () => {
    render(<TabelaRepasse contrato={{ ...BASE, categoria_taxa_adm_id: null }} />)
    const avisos = screen.getAllByTestId('aviso-categoria-contrato')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].textContent).toContain('Defina a categoria da taxa de administração no contrato')
    cleanup()
    render(<TabelaRepasse contrato={BASE} />)
    expect(screen.queryByTestId('aviso-categoria-contrato')).toBeNull()
  })
})

describe('Conferir extrato de outro mês', () => {
  const LEITURA_MARCO = {
    periodo: '03/2026', saldo_anterior: 25, total_extrato: -100, valor_repasse: null,
    itens: [{ descricao: 'Aluguel 03/2026', valor: 2200, natureza: 'credito', tipo: 'aluguel' }],
  }
  it('extrato 03/2026 conferindo 04/2026: aviso no topo, sem avisos de saldo/total, Confirmar bloqueado até corrigir o período', async () => {
    render(<ConferirExtratoModal contrato={BASE} competencia="2026-04" onClose={() => {}} ler={vi.fn(async () => LEITURA_MARCO)} />)
    fireEvent.change(screen.getByLabelText('Arquivo do extrato'), { target: { files: [new File(['x'], 'marco.pdf', { type: 'application/pdf' })] } })
    await vi.waitFor(() => expect(screen.getAllByTestId('item-extrato')).toHaveLength(1))
    const aviso = screen.getByTestId('aviso-periodo')
    expect(aviso.textContent).toContain('Este extrato é de 03/2026 e você está conferindo 04/2026. Anexe o extrato certo ou troque a competência.')
    expect(screen.queryByTestId('aviso-saldo-anterior')).toBeNull()
    expect(screen.queryByTestId('aviso-repasse')).toBeNull()
    const confirmar = screen.getByRole('button', { name: 'Confirmar conferência' })
    expect(confirmar.disabled).toBe(true)
    fireEvent.click(confirmar)
    expect(salvarCompetenciaRepasse).not.toHaveBeenCalled()

    // A IA leu errado: o usuário corrige o período → aviso some, os avisos de saldo/total voltam.
    fireEvent.change(screen.getByLabelText('Período do extrato'), { target: { value: '04/2026' } })
    expect(screen.queryByTestId('aviso-periodo')).toBeNull()
    expect(screen.getByTestId('aviso-saldo-anterior')).toBeTruthy()
    expect(screen.getByTestId('aviso-repasse')).toBeTruthy()
  })

  it('"Anexar outro extrato" volta para a escolha do arquivo', async () => {
    render(<ConferirExtratoModal contrato={BASE} competencia="2026-04" onClose={() => {}} ler={vi.fn(async () => LEITURA_MARCO)} />)
    fireEvent.change(screen.getByLabelText('Arquivo do extrato'), { target: { files: [new File(['x'], 'marco.pdf', { type: 'application/pdf' })] } })
    await vi.waitFor(() => expect(screen.getByTestId('aviso-periodo')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Anexar outro extrato/ }))
    expect(screen.getByRole('button', { name: /Anexar PDF ou foto do extrato/ })).toBeTruthy()
  })
})
