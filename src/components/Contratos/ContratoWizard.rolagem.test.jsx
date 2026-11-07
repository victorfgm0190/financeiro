// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Rolagem do wizard dentro do Modal compartilhado: trocar de etapa leva o corpo ao topo; validação que
// barra o avanço rola até o campo com problema e o destaca. Dados fictícios.
const app = {
  profiles: [{ id: 'pf', name: 'Pessoal' }],
  accounts: [{ id: 'cc1', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' }],
  categories: [{ id: 'cat-mor', name: 'Moradia', type: 'expense' }],
  payees: [], costCenters: [], tiposDocumento: [], activeProfileId: 'pf', schedules: [], categoryGroupOrder: null,
  criarContrato: vi.fn(), atualizarContrato: vi.fn(), salvarItensContrato: vi.fn(), carregarIndice: vi.fn(async () => null),
  indicesContratos: {}, planejarParcelasContrato: vi.fn(), aplicarParcelasContrato: vi.fn(), vincularEGerarContrato: vi.fn(),
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))

const { default: ContratoWizard } = await import('./ContratoWizard.jsx')
const { default: Modal } = await import('../shared/Modal.jsx')

// jsdom não implementa rolagem: scrollTo grava o scrollTop; scrollIntoView anota quem foi levado à vista.
const levados = []
beforeEach(() => {
  levados.length = 0
  Element.prototype.scrollTo = function scrollTo(o) { this.scrollTop = typeof o === 'object' ? o.top : o }
  Element.prototype.scrollIntoView = function scrollIntoView() { levados.push(this) }
})
afterEach(() => { cleanup(); delete Element.prototype.scrollTo; delete Element.prototype.scrollIntoView })

const corpo = () => document.querySelector('[data-modal-corpo]')
const campo = (rotulo) => screen.getByText(rotulo, { selector: 'label' }).parentElement
const avancar = () => fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
const rolarParaBaixo = () => { corpo().scrollTop = 800 }

function abrir() {
  render(<Modal open onClose={() => {}} title="Novo contrato" size="xl"><ContratoWizard onClose={() => {}} onSalvo={() => {}} /></Modal>)
}
function dadosOk() {
  fireEvent.change(campo('Modalidade').querySelector('select'), { target: { value: 'aluguel' } })
  fireEvent.change(screen.getByPlaceholderText('Digite o nome do favorecido'), { target: { value: 'Imobiliária Exemplo' } })
  fireEvent.change(campo('Fim da vigência').querySelector('input'), { target: { value: '2028-06-30' } })
}

describe('ContratoWizard — rolagem ao trocar de etapa', () => {
  it('Avançar, Voltar e a abinha da etapa levam o corpo do modal ao topo', () => {
    abrir()
    dadosOk()
    rolarParaBaixo()
    avancar()
    expect(screen.getByText('Conta de pagamento', { selector: 'label' })).toBeTruthy()
    expect(corpo().scrollTop).toBe(0)

    rolarParaBaixo()
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByText('Modalidade', { selector: 'label' })).toBeTruthy()
    expect(corpo().scrollTop).toBe(0)

    avancar()
    rolarParaBaixo()
    fireEvent.click(screen.getByRole('button', { name: /^1\./ }))
    expect(screen.getByText('Modalidade', { selector: 'label' })).toBeTruthy()
    expect(corpo().scrollTop).toBe(0)
  })

  it('validação barra o avanço: rola até o campo, destaca e mostra o erro junto dele', () => {
    abrir()
    dadosOk()
    avancar()
    rolarParaBaixo()
    avancar() // etapa Valores sem conta
    const c = campo('Conta de pagamento')
    expect(c.hasAttribute('data-erro')).toBe(true)
    expect(c.className).toMatch(/ring-perigo/)
    expect(c.textContent).toContain('Escolha a conta de pagamento.')
    expect(levados).toContain(c)
    expect(document.activeElement).toBe(c.querySelector('select'))
    // Mesma falha de novo: rola outra vez.
    avancar()
    expect(levados.filter(e => e === c)).toHaveLength(2)
    // Corrigir o campo tira o destaque.
    fireEvent.change(c.querySelector('select'), { target: { value: 'cc1' } })
    expect(campo('Conta de pagamento').hasAttribute('data-erro')).toBe(false)
  })
})

describe('Modal — chaveRolagem (modal com etapas montado pelo dono)', () => {
  it('trocar a chave rola o corpo ao topo; re-render com a mesma chave não', () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="Passos" chaveRolagem="a"><p>conteúdo</p></Modal>)
    rolarParaBaixo()
    rerender(<Modal open onClose={() => {}} title="Passos" chaveRolagem="a"><p>conteúdo</p></Modal>)
    expect(corpo().scrollTop).toBe(800)
    rerender(<Modal open onClose={() => {}} title="Passos" chaveRolagem="b"><p>outro</p></Modal>)
    expect(corpo().scrollTop).toBe(0)
  })
})
