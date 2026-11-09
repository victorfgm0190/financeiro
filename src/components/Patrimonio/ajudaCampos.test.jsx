// @vitest-environment jsdom
// Etapa 3, bloco 1 (Patrimônio): todo campo visível de cada formulário (data-help-form) está num
// data-help-id com conteúdo na base — inclusive os que só aparecem depois de uma escolha. Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/bemApi', () => ({
  criarFinanciamento: vi.fn(), salvarConsorcio: vi.fn(), pagarParcela: vi.fn(), registrarBaixaBem: vi.fn(),
  previaVendaCota: vi.fn(async () => ({ custo: 1000, resultado: -100, ultima: false, saldo_bem: 5000, categorias: {} })),
  registrarEventoConsorcio: vi.fn(),
  venderBem: vi.fn(async () => ({ resultado: 200, saldo_contabil: 1000, categorias: {}, divida: { saldo_devedor: 800, parcelas_abertas: 2, agendamentos: [] } })),
  registrarEntrada: vi.fn(), getBem: vi.fn(async () => ({ bem: { nome: 'Bem Antigo', valor_nota_fiscal: 3000 } })),
  criarBem: vi.fn(), atualizarFavorecido: vi.fn(),
}))
vi.mock('../../lib/db', async (orig) => ({ ...(await orig()), criarCategoriasCapital: vi.fn() }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { default: FinanciamentoModal } = await import('./FinanciamentoModal.jsx')
const { default: ConsorcioModal } = await import('./ConsorcioModal.jsx')
const { default: PagarParcelaModal } = await import('./PagarParcelaModal.jsx')
const { default: MarcarPagaModal } = await import('./MarcarPagaModal.jsx')
const { default: VenderCotaModal } = await import('./VenderCotaModal.jsx')
const { VenderBemModal } = await import('./VendaDoBem.jsx')
const { default: RegistrarEntradaModal } = await import('./RegistrarEntradaModal.jsx')
const { default: ParametrizarBemModal } = await import('./ParametrizarBemModal.jsx')
const { default: EditarFavorecidoModal } = await import('./EditarFavorecidoModal.jsx')
const { default: PatrimonioEditavel } = await import('./PatrimonioEditavel.jsx')

const nada = () => {}
const contas = [
  { id: 'cc', name: 'Conta Exemplo', type: 'checking' },
  { id: 'bem', name: 'Bem Exemplo', type: 'asset' },
  { id: 'bem2', name: 'Bem Antigo', type: 'asset' },
]
beforeEach(() => {
  Object.assign(app, {
    accounts: contas, categories: [{ id: 'd1', name: 'Despesa Exemplo', type: 'expense' }, { id: 'r1', name: 'Receita Exemplo', type: 'income' }],
    payees: ['Favorecido Exemplo'], schedules: [], getNextOccurrences: () => [], activeProfileId: null, categoryGroupOrder: [],
    pode: () => true, addCategory: nada, addPayee: nada, addTransaction: nada, updateAccount: nada, updateSchedule: nada,
  })
})
afterEach(cleanup)

// Controles sem passo no formulário + ids marcados sem conteúdo na base.
const auditar = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
  return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
}

describe('Patrimônio: todo campo visível tem ajuda', () => {
  it('Criar financiamento', () => {
    render(<FinanciamentoModal bem={{ id: 'bem', nome: 'Bem Exemplo', valor_nota_fiscal: 10000, saldo: 2000 }} contasCorrentes={[contas[0]]} contas={contas} onCancel={nada} onSuccess={nada} onErro={nada} />)
    expect(auditar('financiamento')).toEqual([])
  })
  it('Consórcio (com duas cotas)', () => {
    render(<ConsorcioModal bemId="bem" consorcio={null} contas={contas} favorecidos={['Administradora Exemplo']} onCancel={nada} onSuccess={nada} onErro={nada} />)
    fireEvent.click(screen.getByRole('button', { name: /Adicionar outra cota/ }))
    expect(auditar('consorcio')).toEqual([])
  })
  it('Pagar parcela', () => {
    const parcela = { id: 'p1', numero: 1, data_vencimento: '2026-11-10', total_provisioned: 600, principal_provisioned: 500, juros_provisioned: 100, total_pago: 0 }
    render(<PagarParcelaModal bem={{ nome: 'Bem Exemplo' }} financiamento={{ num_parcelas: 10, conta_origem_id: 'cc' }} parcela={parcela} contasCorrentes={[contas[0]]} onCancel={nada} onSuccess={nada} onErro={nada} />)
    expect(auditar('pagarParcela')).toEqual([])
  })
  it('Marcar como paga: por terceiro, com receita de benefício e cota', () => {
    render(<MarcarPagaModal bemId="bem" cotas={[{ numero: '1' }]} onCancel={nada} onSuccess={nada} />)
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'terceiro' } })
    fireEvent.click(screen.getByLabelText(/Gerar a receita de benefício/))
    expect(screen.getByLabelText(/Categoria da receita/)).toBeTruthy()
    expect(auditar('baixaBem')).toEqual([])
  })
  it('Vender cota (com custos e categoria do resultado)', async () => {
    render(<VenderCotaModal bemId="bem" cota={{ numero: '1' }} cotas={[{ numero: '1' }, { numero: '2' }]} onCancelar={nada} onVendida={nada} />)
    fireEvent.change(screen.getByLabelText(/Custos da venda/), { target: { value: '10000' } })
    await waitFor(() => expect(document.querySelector('[data-help-id="vendaCota.categoriaResultado"]')).toBeTruthy())
    expect(auditar('vendaCota')).toEqual([])
  })
  it('Vender bem (com financiamento aberto)', async () => {
    render(<VenderBemModal conta={{ id: 'bem', name: 'Bem Exemplo' }} onCancelar={nada} onVendido={nada} />)
    await screen.findByTestId('venda-divida')
    fireEvent.change(screen.getByLabelText(/Custos da venda/), { target: { value: '10000' } })
    expect(auditar('vendaBem')).toEqual([])
  })
  it('Registrar entrada (com transferência marcada e trade-in)', async () => {
    const tx = { id: 't1', type: 'transfer', amount: 500, date: '2026-11-01', description: 'Entrada', accountId: 'cc', toAccountId: 'bem' }
    render(<RegistrarEntradaModal bem={{ id: 'bem', nome: 'Bem Exemplo', saldo: 0, categorias: { prestacao: { id: 'd1', nome: 'Despesa Exemplo' } } }} transacoes={[tx]} contas={contas} onCancel={nada} onSuccess={nada} onErro={nada} />)
    fireEvent.click(screen.getByText('Entrada'))
    fireEvent.click(screen.getByText(/Usar um bem antigo como entrada/))
    fireEvent.change(document.querySelector('[data-help-id="entradaBem.bemAntigo"] select'), { target: { value: 'bem2' } })
    await screen.findByText(/Por quanto vai vender/)
    expect(auditar('entradaBem')).toEqual([])
  })
  it('Parametrizar bem', () => {
    render(<ParametrizarBemModal conta={{ id: 'bem', name: 'Bem Exemplo', balance: 1000 }} categorias={app.categories} onCancel={nada} onSuccess={nada} onErro={nada} />)
    expect(auditar('parametrizarBem')).toEqual([])
  })
  it('Editar favorecido do financiamento (existente e novo banco)', () => {
    render(<EditarFavorecidoModal financiamento={{ id: 'f', banco: 'Banco Exemplo', num_parcelas: 10 }} contas={contas} onCancel={nada} onSuccess={nada} onErro={nada} />)
    expect(auditar('favorecidoFinanciamento')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Criar novo banco' }))
    expect(auditar('favorecidoFinanciamento')).toEqual([])
  })
  it('Valores do bem (componente protegido: só a marcação de ajuda)', () => {
    render(<PatrimonioEditavel bem={{ valor_nota_fiscal: null, valor_pago_manual: null, saldo: 0 }} temMovimentacoes={false} onSalvar={nada} />)
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }))
    expect(auditar('valoresBem')).toEqual([])
  })
})
