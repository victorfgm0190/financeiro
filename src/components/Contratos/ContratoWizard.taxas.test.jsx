// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Tarifas e taxas da administradora no wizard do contrato de repasse: explicação dos botões, cartão com
// resumo + Editar/Excluir/OK, conferência da soma das parcelas e erro de validação junto do cartão.
// Dados fictícios.
const criarContrato = vi.fn(async (dados) => ({ ...dados, id: 'k1' }))
const app = {
  profiles: [{ id: 'pf', name: 'Pessoal' }],
  accounts: [{ id: 'cc1', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' }],
  categories: [{ id: 'cat-rec', name: 'Moradia', type: 'income' }, { id: 'cat-adm', name: 'Taxas', type: 'expense' }],
  payees: [], costCenters: [], tiposDocumento: [], activeProfileId: 'pf', schedules: [], categoryGroupOrder: null,
  criarContrato, atualizarContrato: vi.fn(), salvarItensContrato: vi.fn(), carregarIndice: vi.fn(async () => null),
  indicesContratos: {}, planejarParcelasContrato: vi.fn(), aplicarParcelasContrato: vi.fn(), vincularEGerarContrato: vi.fn(async () => ({})),
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))

const { default: ContratoWizard } = await import('./ContratoWizard.jsx')

const levados = []
beforeEach(() => {
  levados.length = 0
  Element.prototype.scrollIntoView = function scrollIntoView() { levados.push(this) }
})
afterEach(() => { cleanup(); criarContrato.mockClear(); delete Element.prototype.scrollIntoView })

const campo = (rotulo) => screen.getByText(rotulo, { selector: 'label' }).parentElement
const avancar = () => fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
const mudar = (el, valor) => fireEvent.change(el, { target: { value: valor } })
const cartoes = () => screen.queryAllByTestId('cartao-taxa')

// Aluguel a receber por administradora, já na etapa Valores com o obrigatório preenchido.
function abrirValores() {
  render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
  mudar(campo('Modalidade').querySelector('select'), 'aluguel')
  mudar(campo('Tipo').querySelector('select'), 'receber')
  fireEvent.click(screen.getByText(/Recebo por uma administradora/))
  mudar(screen.getByPlaceholderText('Digite o nome do favorecido'), 'Administradora Exemplo')
  mudar(campo('Início da vigência').querySelector('input'), '2026-02-21')
  fireEvent.click(screen.getByLabelText(/Sem data de fim/))
  avancar()
  mudar(campo('Conta de recebimento').querySelector('select'), 'cc1')
  mudar(within(campo('Valor do aluguel (contratual)')).getAllByRole('textbox')[0], '2.200,00')
  mudar(campo('Dia de vencimento do inquilino').querySelector('input'), '5')
  mudar(campo('Dia do repasse').querySelector('input'), '10')
}

function preencherTaxaUnica(c, parcelas) {
  const w = within(c)
  mudar(w.getByLabelText('Descrição da taxa'), 'Intermediação')
  mudar(w.getByLabelText('Valor total da taxa'), '2.200,00')
  mudar(w.getByLabelText('Competência da 1ª parcela'), '2026-02')
  mudar(w.getByLabelText('Valores das parcelas'), parcelas)
}

describe('ContratoWizard — tarifas e taxas da administradora', () => {
  it('botões com explicação; aviso de que grava ao concluir', () => {
    abrirValores()
    expect(screen.getByText(/Valor igual descontado todo mês no repasse, enquanto valer \(ex\.: tarifa bancária\)\. Informe o valor e o mês de início; o fim é opcional\./)).toBeTruthy()
    expect(screen.getByText(/Cobrança feita uma vez só no contrato, com total fechado, descontada em uma ou mais parcelas de valores livres/)).toBeTruthy()
    expect(screen.getByText('As tarifas e taxas são gravadas ao concluir o cadastro (Confirmar / Salvar aditivo).')).toBeTruthy()
  })

  it('taxa única: soma das parcelas ao digitar, sem "(0)" no rótulo; OK fecha no resumo; Editar reabre', () => {
    abrirValores()
    fireEvent.click(screen.getByRole('button', { name: /Taxa única/ }))
    const c = cartoes()[0]
    expect(within(c).getByText(/Valor de cada parcela/).textContent).not.toMatch(/\(\d+\)/)
    preencherTaxaUnica(c, '470,00; 865,00; 765,00')
    expect(within(c).getByTestId('soma-parcelas').textContent).toMatch(/^soma R\$ 2\.100,00 — diferente do total R\$ 2\.200,00/)
    mudar(within(c).getByLabelText('Valores das parcelas'), '470,00; 865,00; 865,00')
    expect(within(c).getByTestId('soma-parcelas').textContent).toBe('3 parcelas · soma R$ 2.200,00 ✓')

    fireEvent.click(within(c).getByRole('button', { name: /OK/ }))
    expect(within(cartoes()[0]).getByTestId('resumo-taxa').textContent)
      .toBe('Intermediação · R$ 2.200,00 em 3 parcelas (470,00 + 865,00 + 865,00) a partir de 02/2026 · dedutível IR')
    expect(within(cartoes()[0]).queryByLabelText('Descrição da taxa')).toBeNull()

    fireEvent.click(within(cartoes()[0]).getByRole('button', { name: /Editar/ }))
    expect(within(cartoes()[0]).getByLabelText('Descrição da taxa').value).toBe('Intermediação')
    fireEvent.click(within(cartoes()[0]).getByRole('button', { name: /OK/ }))
    expect(within(cartoes()[0]).getByTestId('resumo-taxa')).toBeTruthy()
  })

  it('tarifa fixa: resumo "R$ 3,00/mês de 06/2026 em diante"; Excluir remove o cartão', () => {
    abrirValores()
    fireEvent.click(screen.getByRole('button', { name: /Tarifa fixa/ }))
    const w = within(cartoes()[0])
    mudar(w.getByLabelText('Descrição da taxa'), 'Tarifa bancária')
    mudar(w.getByLabelText('Valor da tarifa'), '3,00')
    mudar(w.getByLabelText('Competência inicial'), '2026-06')
    fireEvent.click(w.getByLabelText('Dedutível IR'))
    fireEvent.click(w.getByRole('button', { name: /OK/ }))
    expect(within(cartoes()[0]).getByTestId('resumo-taxa').textContent).toBe('Tarifa bancária · R$ 3,00/mês de 06/2026 em diante')
    fireEvent.click(within(cartoes()[0]).getByRole('button', { name: /Excluir/ }))
    expect(cartoes()).toHaveLength(0)
  })

  it('OK com campo faltando: o cartão não fecha e mostra o erro nele', () => {
    abrirValores()
    fireEvent.click(screen.getByRole('button', { name: /Taxa única/ }))
    mudar(within(cartoes()[0]).getByLabelText('Descrição da taxa'), 'Intermediação')
    fireEvent.click(within(cartoes()[0]).getByRole('button', { name: /OK/ }))
    const c = cartoes()[0]
    expect(c.hasAttribute('data-erro')).toBe(true)
    expect(within(c).getByRole('alert').textContent).toBe('Taxa "Intermediação": informe o valor total.')
    expect(within(c).getByLabelText('Descrição da taxa')).toBeTruthy()
  })

  it('Avançar com taxa incompleta: erro no cartão (borda + texto), rola até ele e foca o 1º campo', () => {
    abrirValores()
    fireEvent.click(screen.getByRole('button', { name: /Taxa única/ }))
    preencherTaxaUnica(cartoes()[0], '')
    avancar()
    const c = cartoes()[0]
    expect(screen.getByText('Valor do aluguel (contratual)', { selector: 'label' })).toBeTruthy() // não avançou
    expect(c.hasAttribute('data-erro')).toBe(true)
    expect(c.className).toMatch(/ring-perigo/)
    expect(within(c).getByRole('alert').textContent).toMatch(/informe o valor de cada parcela/)
    expect(levados).toContain(c)
    expect(document.activeElement).toBe(within(c).getByLabelText('Descrição da taxa'))
  })

  it('erro de campo comum em qualquer etapa: junto do campo, não no rodapé', () => {
    abrirValores()
    mudar(campo('Dia do repasse').querySelector('input'), '')
    avancar()
    const c = campo('Dia do repasse')
    expect(c.hasAttribute('data-erro')).toBe(true)
    expect(within(c).getByRole('alert').textContent).toBe('Dia do repasse entre 1 e 31.')
    expect(screen.getAllByText('Dia do repasse entre 1 e 31.')).toHaveLength(1)
    expect(levados).toContain(c)
  })
})
