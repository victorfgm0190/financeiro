// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Aditivo que traz o início do contrato de repasse para o passado (Etapa 6): em vez do aviso
// provisório, oferece gerar as competências passadas e, depois de salvar, buscar os repasses já
// lançados na conta. Dados fictícios.
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-06-01', data_fim: '2027-05-31', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-rec',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf', conta_id: 'cc',
  itens_repasse: [], competencias: [], encargos: [], meses_sem_cobranca: [],
}
const atualizarContrato = vi.fn(async (id, campos) => ({ ...CONTRATO, ...campos }))
const app = {
  profiles: [{ id: 'pf', name: 'Pessoal' }],
  accounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' }],
  categories: [{ id: 'cat-rec', name: 'Moradia', type: 'income' }, { id: 'cat-adm', name: 'Taxas', type: 'expense' }],
  payees: [], costCenters: [], tiposDocumento: [], activeProfileId: 'pf', schedules: [], categoryGroupOrder: null,
  criarContrato: vi.fn(), atualizarContrato, salvarItensContrato: vi.fn(async () => []), carregarIndice: vi.fn(async () => null),
  indicesContratos: {}, planejarParcelasContrato: vi.fn(async () => ({ criar: [], atualizar: [], remover: [] })),
  aplicarParcelasContrato: vi.fn(async () => {}), vincularEGerarContrato: vi.fn(async () => ({})),
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-11-08' }))
const { default: ContratoWizard } = await import('./ContratoWizard.jsx')

beforeEach(() => { Element.prototype.scrollIntoView = () => {} })
afterEach(() => { cleanup(); atualizarContrato.mockClear(); delete Element.prototype.scrollIntoView })
const campo = (rotulo) => screen.getByText(rotulo, { selector: 'label' }).parentElement
const ateUltima = () => { for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /Avançar/ })) }

describe('aditivo: início do contrato de repasse para o passado', () => {
  it('mostra as competências que entram e oferece a busca; salvar avisa a ficha para abrir a busca', async () => {
    const onSalvo = vi.fn()
    render(<ContratoWizard contrato={CONTRATO} onClose={() => {}} onSalvo={onSalvo} />)
    fireEvent.change(campo('Início da vigência').querySelector('input'), { target: { value: '2026-02-21' } })
    expect(screen.getByTestId('aviso-inicio-passado').textContent).toContain('As competências de 02/2026 a 05/2026 passam a fazer parte do contrato')
    expect(screen.queryByText(/não gera os meses anteriores/)).toBeNull() // aviso provisório saiu
    ateUltima()
    const oferta = screen.getByTestId('inicio-passado-ultima')
    const marcar = screen.getByLabelText(/Gerar as competências passadas e, depois de salvar, buscar na conta os repasses já lançados/)
    expect(oferta.contains(marcar)).toBe(true)
    expect(marcar.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Salvar aditivo/ }))
    await vi.waitFor(() => expect(onSalvo).toHaveBeenCalled())
    expect(atualizarContrato.mock.calls[0][1]).toMatchObject({ data_inicio: '2026-02-21' })
    expect(onSalvo.mock.calls[0][1]).toEqual({ buscarRepasses: true })
  })

  it('desmarcado: salva sem abrir a busca', async () => {
    const onSalvo = vi.fn()
    render(<ContratoWizard contrato={CONTRATO} onClose={() => {}} onSalvo={onSalvo} />)
    fireEvent.change(campo('Início da vigência').querySelector('input'), { target: { value: '2026-02-21' } })
    ateUltima()
    fireEvent.click(screen.getByLabelText(/Gerar as competências passadas/))
    fireEvent.click(screen.getByRole('button', { name: /Salvar aditivo/ }))
    await vi.waitFor(() => expect(onSalvo).toHaveBeenCalled())
    expect(onSalvo.mock.calls[0][1]).toEqual({ buscarRepasses: false })
  })
})
