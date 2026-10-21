// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Seletores de categoria do cadastro: clicar numa opção grava o ID (string) no formulário — o
// CategorySelect entrega { target: { value } } e o objeto ia parar no contrato ("[object Object]").
const criarContrato = vi.fn(async (dados) => ({ ...dados, id: 'k1' }))
const app = {
  profiles: [{ id: 'pf', name: 'Pessoal' }],
  accounts: [{ id: 'cc1', name: 'Itaú', type: 'checking', profileId: 'pf' }],
  categories: [
    { id: 'cat-mor', name: 'Moradia', type: 'expense' },
    { id: 'cat-alug', name: 'Aluguel', type: 'expense' },
    { id: 'cat-cond', name: 'Condomínio', type: 'expense' },
  ],
  payees: [], costCenters: [], tiposDocumento: [], activeProfileId: 'pf', schedules: [], categoryGroupOrder: null,
  criarContrato, atualizarContrato: vi.fn(), salvarItensContrato: vi.fn(), carregarIndice: vi.fn(async () => null),
  indicesContratos: {}, planejarParcelasContrato: vi.fn(), aplicarParcelasContrato: vi.fn(),
  vincularEGerarContrato: vi.fn(async () => ({})),
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))

const { default: ContratoWizard } = await import('./ContratoWizard.jsx')

const campo = (rotulo) => screen.getByText(rotulo, { selector: 'label' }).parentElement
const gatilho = (rotulo) => within(campo(rotulo)).getByRole('button', { expanded: false })
const avancar = () => fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
const preencher = (rotulo, valor) => fireEvent.change(within(campo(rotulo)).getAllByRole('textbox')[0] || campo(rotulo).querySelector('input'), { target: { value: valor } })

// Limpa no "×" e escolhe outra categoria clicando na lista (o gatilho mostra o rótulo escolhido).
function trocarCategoria(rotulo, nova) {
  const g = gatilho(rotulo)
  expect(g.textContent).toContain('Moradia')
  fireEvent.mouseDown(g.querySelector('[aria-hidden="true"]'))
  expect(gatilho(rotulo).textContent).toContain('Sem categoria')
  fireEvent.click(gatilho(rotulo))
  const opcao = screen.getAllByRole('button').find(b => b.hasAttribute('data-item') && b.textContent === nova)
  fireEvent.mouseDown(opcao)
  fireEvent.click(opcao)
  expect(gatilho(rotulo).textContent).toContain(nova)
}

afterEach(() => { cleanup(); criarContrato.mockClear() })

describe('ContratoWizard — categorias', () => {
  it('aluguel e condomínio: limpar, abrir a lista e clicar grava o id escolhido', async () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Nome do favorecido'), { target: { value: 'Imob Silva' } })
    fireEvent.change(campo('Fim da vigência').querySelector('input'), { target: { value: '2028-06-30' } })
    avancar()

    fireEvent.change(campo('Conta de pagamento').querySelector('select'), { target: { value: 'cc1' } })
    preencher('Valor do aluguel (contratual)', '3.900,00')
    fireEvent.change(campo('Dia de vencimento').querySelector('input'), { target: { value: '15' } })
    trocarCategoria('Categoria do aluguel', 'Aluguel')
    avancar()
    avancar()

    fireEvent.click(screen.getByText(/Tem condomínio/))
    preencher('Valor previsto', '1.300,00')
    trocarCategoria('Categoria do condomínio', 'Condomínio')
    avancar()

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    await vi.waitFor(() => expect(criarContrato).toHaveBeenCalled())
    const [dados] = criarContrato.mock.calls[0]
    expect(dados.categoria_id).toBe('cat-alug')
    expect(dados.categoria_condominio_id).toBe('cat-cond')
  })

  it('sugere "Moradia" nas duas categorias', () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Nome do favorecido'), { target: { value: 'Imob Silva' } })
    fireEvent.click(screen.getByLabelText(/Sem data de fim/))
    avancar()
    expect(gatilho('Categoria do aluguel').textContent).toContain('Moradia')
  })
})
